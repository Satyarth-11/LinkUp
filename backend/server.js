require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const jwt = require("jsonwebtoken");

const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/room");
const privacyRoutes = require("./routes/privacy");
const Message = require("./models/Message");
const Room = require("./models/Room");
const User = require("./models/User");

const app = express();

/* -------------------- MIDDLEWARE -------------------- */
const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Helper: check if an origin is allowed
const isOriginAllowed = (origin) => {
  if (!origin) return true; // Allow no-origin requests (mobile, curl, etc.)
  // Explicitly listed origins
  if (allowedOrigins.includes(origin)) return true;
  // Allow any Vercel deployment (*.vercel.app)
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;
  // Allow localhost on any port for development
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  // Allow Android WebView and Capacitor
  if (origin === "capacitor://localhost" || origin === "http://localhost") return true;
  return false;
};

app.use(
  cors({
    origin: function (origin, callback) {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      console.warn(`CORS blocked origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* -------------------- ROUTES -------------------- */
app.use("/api/auth", authRoutes);
app.use("/api/room", roomRoutes);
app.use("/api/privacy", privacyRoutes);

/* -------------------- IMAGE UPLOAD -------------------- */
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

app.use("/uploads", express.static("uploads"));

const authMiddleware = require("./middleware/auth");

app.post("/api/upload", authMiddleware, upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }
  const imageUrl = `${process.env.BASE_URL || "http://localhost:5000"}/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

/* -------------------- DATABASE -------------------- */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Error:", err));

/* -------------------- SERVER + SOCKET -------------------- */
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: isOriginAllowed,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

/* ---- Socket Auth Middleware ---- */
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    // Allow anonymous for random chat
    socket.user = { username: `Anon_${Math.random().toString(36).substr(2, 6)}`, isAnonymous: true };
    return next();
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    socket.user.isAnonymous = false;
    next();
  } catch (err) {
    socket.user = { username: `Anon_${Math.random().toString(36).substr(2, 6)}`, isAnonymous: true };
    next();
  }
});

/* ---- Random Chat Queue ---- */
let randomQueue = []; // {socket, username, interests, language, preference, skipSocketId, joinedAt}
const randomRooms = new Map(); // socketId -> roomId
const typingState = new Map(); // `${roomId}:${socketId}` -> timeout
const activeUsers = new Map(); // username -> Set<socketId>
const activeCalls = new Map(); // socketId -> { partnerSocketId }

const normalizeUsername = (username) => (username || "").toLowerCase();

const getOnlineUsersPayload = () => ({
  count: activeUsers.size,
  users: Array.from(activeUsers.keys()),
});

const emitOnlineUsers = () => {
  io.emit("online_users", getOnlineUsersPayload());
};

const getRoomOnlineUsersPayload = async (roomId) => {
  const socketsInRoom = await io.in(roomId).fetchSockets();

  // Users list respects privacy (showActiveStatus)
  const visibleSockets = socketsInRoom.filter(
    (roomSocket) =>
      roomSocket.user?.username &&
      !roomSocket.user?.isAnonymous &&
      roomSocket.user?.showActiveStatus !== false
  );
  const users = [...new Set(visibleSockets.map((s) => s.user.username))];

  // socketMap includes ALL non-anonymous sockets so video calls always work
  // Overwrite entries so the latest/active socket ID wins over stale ones
  const allNonAnonSockets = socketsInRoom.filter(
    (roomSocket) =>
      roomSocket.user?.username && !roomSocket.user?.isAnonymous
  );
  const socketMap = {};
  for (const s of allNonAnonSockets) {
    if (s.user.username) {
      socketMap[s.user.username] = s.id;
    }
  }

  return {
    roomId,
    count: users.length,
    users,
    socketMap,
  };
};

const emitRoomOnlineUsers = async (roomId) => {
  if (!roomId) return;
  const payload = await getRoomOnlineUsersPayload(roomId);
  io.to(roomId).emit("room_online_users", payload);
};

const addActiveUser = (username, socketId) => {
  const normalized = normalizeUsername(username);
  if (!normalized) return;

  const existingSockets = activeUsers.get(normalized) || new Set();
  existingSockets.add(socketId);
  activeUsers.set(normalized, existingSockets);
};

const syncActiveUserVisibility = (username, socketId, isVisible) => {
  if (isVisible) {
    addActiveUser(username, socketId);
  } else {
    removeActiveUser(username, socketId);
  }
};

const initializeSocketPresence = async (socket) => {
  if (socket.user.isAnonymous) return;

  try {
    const currentUser = await User.findById(socket.user.id).select(
      "showActiveStatus privacySettings anonymousId blockedUsers"
    );
    // Use privacySettings.showOnlineStatus with fallback to legacy showActiveStatus
    const showOnline = currentUser?.privacySettings?.showOnlineStatus !== undefined
      ? currentUser.privacySettings.showOnlineStatus
      : currentUser?.showActiveStatus !== false;
    socket.user.showActiveStatus = showOnline;
    socket.user.privacySettings = currentUser?.privacySettings || {};
    socket.user.anonymousId = currentUser?.anonymousId || null;
    socket.user.blockedUsers = (currentUser?.blockedUsers || []).map((b) => b.username);
  } catch (err) {
    socket.user.showActiveStatus = true;
    socket.user.privacySettings = {};
    socket.user.anonymousId = null;
    socket.user.blockedUsers = [];
  }

  syncActiveUserVisibility(socket.user.username, socket.id, socket.user.showActiveStatus);
  emitOnlineUsers();

  if (socket.currentRoom) {
    emitRoomOnlineUsers(socket.currentRoom);
  }
};

const removeActiveUser = (username, socketId) => {
  const normalized = normalizeUsername(username);
  if (!normalized || !activeUsers.has(normalized)) return;

  const existingSockets = activeUsers.get(normalized);
  existingSockets.delete(socketId);
  if (existingSockets.size === 0) {
    activeUsers.delete(normalized);
    return;
  }

  activeUsers.set(normalized, existingSockets);
};

const getTypingKey = (roomId, socketId) => `${roomId}:${socketId}`;

const clearTypingState = (roomId, socket, displayName) => {
  if (!roomId) return;

  const key = getTypingKey(roomId, socket.id);
  const existingTimer = typingState.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
    typingState.delete(key);
  }

  const name = displayName || socket.user.username;
  socket.to(roomId).emit("user_stop_typing", { username: name });
};

const matchUser = (newUser) => {
  if (randomQueue.length === 0) return null;
  
  let bestMatch = null;
  let bestScore = -1;
  let bestIndex = -1;

  for (let i = 0; i < randomQueue.length; i++) {
    const candidate = randomQueue[i];

    // Ensure we don't match with self or someone we explicitly want to skip
    if (candidate.socket.id === newUser.socket.id) continue;
    if (candidate.socket.id === newUser.skipSocketId || newUser.socket.id === candidate.skipSocketId) continue;

    // Block filtering — skip if either user has blocked the other
    const newUserBlocked = newUser.socket.user?.blockedUsers || [];
    const candidateBlocked = candidate.socket.user?.blockedUsers || [];
    const candidateUsername = (candidate.socket.user?.username || "").toLowerCase();
    const newUserUsername = (newUser.socket.user?.username || "").toLowerCase();
    if (newUserBlocked.includes(candidateUsername) || candidateBlocked.includes(newUserUsername)) continue;

    let score = 0;
    
    // Language check
    const langMatch = candidate.language === newUser.language;
    if (langMatch && candidate.language !== 'Any') score += 50;

    // Interests match
    const commonInterests = candidate.interests.filter(interest => 
      newUser.interests.includes(interest)
    ).length;
    score += commonInterests * 10;

    // Preference strictness check
    const isStrict = candidate.preference === "strict" || newUser.preference === "strict";
    if (isStrict) {
      if (!langMatch && commonInterests === 0) continue; 
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
      bestIndex = i;
    }
  }

  if (bestMatch) {
    randomQueue.splice(bestIndex, 1);
  }
  return bestMatch;
};

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.user.username} (${socket.id})`);

  if (!socket.user.isAnonymous) {
    socket.user.showActiveStatus = true;
  }

  socket.emit("online_users", getOnlineUsersPayload());
  socket.on("request_online_users", () => {
    socket.emit("online_users", getOnlineUsersPayload());
  });

  socket.on("update_active_visibility", ({ showActiveStatus }) => {
    if (socket.user.isAnonymous || typeof showActiveStatus !== "boolean") return;
    socket.user.showActiveStatus = showActiveStatus;
    if (socket.user.privacySettings) {
      socket.user.privacySettings.showOnlineStatus = showActiveStatus;
    }
    syncActiveUserVisibility(socket.user.username, socket.id, showActiveStatus);
    emitOnlineUsers();
    if (socket.currentRoom) {
      emitRoomOnlineUsers(socket.currentRoom);
    }
  });

  /* ======== TOGGLE ANONYMOUS MODE ======== */
  socket.on("toggle_anonymous", async ({ enabled }) => {
    if (socket.user.isAnonymous) return; // socket-level anon, not the feature
    if (typeof enabled !== "boolean") return;

    try {
      let anonymousId = null;
      if (enabled) {
        anonymousId = `User${Math.floor(1000 + Math.random() * 9000)}`;
      }

      await User.findByIdAndUpdate(socket.user.id, {
        "privacySettings.anonymousMode": enabled,
        anonymousId,
      });

      socket.user.privacySettings = socket.user.privacySettings || {};
      socket.user.privacySettings.anonymousMode = enabled;
      socket.user.anonymousId = anonymousId;

      socket.emit("anonymous_mode_updated", { enabled, anonymousId });
    } catch (err) {
      console.error("Toggle anonymous error:", err);
      socket.emit("error", { message: "Failed to toggle anonymous mode" });
    }
  });

  /* ======== BLOCK USER (LIVE) ======== */
  socket.on("block_user_live", async ({ username }) => {
    if (socket.user.isAnonymous || !username) return;
    const normalizedUsername = username.toLowerCase().trim();
    if (normalizedUsername === socket.user.username) return;

    try {
      const targetUser = await User.findOne({ username: normalizedUsername });
      if (!targetUser) {
        socket.emit("error", { message: "User not found" });
        return;
      }

      // Add to blocked list in DB
      await User.findByIdAndUpdate(socket.user.id, {
        $addToSet: {
          blockedUsers: {
            userId: targetUser._id,
            username: normalizedUsername,
          },
        },
      });

      // Update socket-level blocked list
      if (!socket.user.blockedUsers) socket.user.blockedUsers = [];
      if (!socket.user.blockedUsers.includes(normalizedUsername)) {
        socket.user.blockedUsers.push(normalizedUsername);
      }

      socket.emit("user_blocked", { username: normalizedUsername });

      // If in a random chat, disconnect the room
      const roomId = randomRooms.get(socket.id);
      if (roomId) {
        socket.to(roomId).emit("random_partner_left");
        socket.to(roomId).emit("receive_message", {
          roomId,
          sender: "System",
          displayName: "System",
          text: "The stranger has disconnected.",
          type: "system",
          timestamp: new Date(),
        });
        socket.leave(roomId);
        randomRooms.delete(socket.id);
      }
    } catch (err) {
      console.error("Block user live error:", err);
      socket.emit("error", { message: "Failed to block user" });
    }
  });

  /* ======== JOIN ROOM ======== */
  socket.on("join_room", async ({ roomId, displayName, isAnonymous }) => {
    socket.join(roomId);
    socket.currentRoom = roomId;

    // Notify others
    const name = isAnonymous ? "Anonymous" : (displayName || socket.user.username);
    socket.to(roomId).emit("user_joined", {
      username: name,
      message: `${name} joined the room`,
    });

    // Send chat history
    try {
      const history = await Message.find({ roomId })
        .sort({ timestamp: 1 })
        .limit(100);
      socket.emit("chat_history", history);
    } catch (err) {
      console.error("History fetch error:", err);
    }

    // Update room members in DB
    try {
      await Room.findOneAndUpdate(
        {
          roomId,
          type: "group",
          "members.username": { $ne: name },
        },
        {
          $push: { members: { username: name } },
        }
      );
    } catch (err) {
      // Room might not exist (e.g., random rooms), ignore
    }

    emitRoomOnlineUsers(roomId);
  });

  /* ======== SEND MESSAGE ======== */
  socket.on("send_message", async (data) => {
    try {
      const { roomId, text, image, isAnonymous, displayName } = data;
      const sender = socket.user.username;
      const isAnonMode = isAnonymous || socket.user.privacySettings?.anonymousMode === true;
      const anonId = socket.user.anonymousId || "Anonymous";
      const resolvedName = isAnonMode ? anonId : (displayName || sender);
      // When anonymous, store anonId as sender to prevent linking to real identity
      const storedSender = isAnonMode ? anonId : sender;

      const newMessage = new Message({
        roomId,
        sender: storedSender,
        displayName: resolvedName,
        text: text || "",
        image: image || null,
        type: image ? "image" : "text",
        isAnonymous: isAnonMode,
        anonymousId: isAnonMode ? anonId : null,
        seenBy: [storedSender],
        timestamp: new Date(),
      });

      await newMessage.save();

      io.to(roomId).emit("receive_message", {
        _id: newMessage._id,
        roomId,
        sender: storedSender,
        displayName: resolvedName,
        text: text || "",
        image: image || null,
        type: newMessage.type,
        isAnonymous: isAnonMode,
        anonymousId: isAnonMode ? anonId : null,
        seenBy: newMessage.seenBy,
        timestamp: newMessage.timestamp,
      });
    } catch (err) {
      console.error("Message save error:", err);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  /* ======== TYPING INDICATOR ======== */
  socket.on("typing", ({ roomId, displayName }) => {
    if (!roomId) return;

    const name = displayName || socket.user.username;
    const key = getTypingKey(roomId, socket.id);
    const existingTimer = typingState.get(key);

    if (existingTimer) {
      clearTimeout(existingTimer);
    } else {
      socket.to(roomId).emit("user_typing", { username: name });
    }

    const timeout = setTimeout(() => {
      clearTypingState(roomId, socket, name);
    }, 2000);

    typingState.set(key, timeout);
  });

  socket.on("stopTyping", ({ roomId, displayName }) => {
    clearTypingState(roomId, socket, displayName);
  });

  socket.on("mark_seen", async ({ roomId, messageIds = [] }) => {
    if (!roomId || socket.user.isAnonymous || !Array.isArray(messageIds) || messageIds.length === 0) {
      return;
    }

    try {
      const normalizedIds = [...new Set(messageIds.filter(Boolean))];
      await Message.updateMany(
        {
          _id: { $in: normalizedIds },
          roomId,
          sender: { $ne: socket.user.username },
        },
        { $addToSet: { seenBy: socket.user.username } }
      );

      io.to(roomId).emit("messages_seen", {
        roomId,
        messageIds: normalizedIds,
        seenBy: socket.user.username,
      });
    } catch (err) {
      console.error("Mark seen error:", err);
    }
  });

  /* ======== RANDOM CHAT ======== */
  socket.on("join_random", async ({ username, interests = [], language = 'Any', preference = 'relaxed', skipSocketId = null }) => {
    // Check if user is allowed to enter random matching
    if (!socket.user.isAnonymous && socket.user.privacySettings?.allowRandomMatch === false) {
      socket.emit("error", { message: "Random matching is disabled in your privacy settings" });
      return;
    }

    // Refresh blocked users list
    if (!socket.user.isAnonymous) {
      try {
        const freshUser = await User.findById(socket.user.id).select("blockedUsers privacySettings anonymousId");
        socket.user.blockedUsers = (freshUser?.blockedUsers || []).map((b) => b.username);
        socket.user.privacySettings = freshUser?.privacySettings || socket.user.privacySettings;
        socket.user.anonymousId = freshUser?.anonymousId || socket.user.anonymousId;
      } catch (_) {}
    }

    const displayName = username || socket.user.username;

    const parsedInterests = Array.isArray(interests) 
      ? interests 
      : (typeof interests === 'string' ? interests.split(',').map(s => s.trim()).filter(Boolean) : []);

    // Remove from queue if already in it, so we can re-evaluate
    randomQueue = randomQueue.filter((u) => u.socket.id !== socket.id);

    const newUser = {
      socket,
      username: displayName,
      interests: parsedInterests.map(i => i.toLowerCase()),
      language,
      preference,
      skipSocketId,
      joinedAt: Date.now()
    };

    const match = matchUser(newUser);

    if (match) {
      const roomId = `RANDOM_${match.socket.id.substr(0, 6)}_${socket.id.substr(0, 6)}`.toUpperCase();

      socket.join(roomId);
      match.socket.join(roomId);

      socket.randomRoom = roomId;
      match.socket.randomRoom = roomId;

      randomRooms.set(socket.id, roomId);
      randomRooms.set(match.socket.id, roomId);

      // Send each user the other's socket id so "Next" can skip them
      socket.emit("random_matched", { roomId, partnerSocketId: match.socket.id });
      match.socket.emit("random_matched", { roomId, partnerSocketId: socket.id });

      // Build a helpful system message
      const commonInterests = match.interests.filter(i => newUser.interests.includes(i));
      const sameLang = match.language === newUser.language && match.language !== 'Any';
      let sysText = `🎲 You've been connected!`;
      if (sameLang) sysText += ` 🌐 You both speak ${match.language}.`;
      if (commonInterests.length > 0) sysText += ` 🎯 Common interests: ${commonInterests.join(', ')}.`;
      if (!sameLang && commonInterests.length === 0) sysText += ' Say hello!';

      io.to(roomId).emit("receive_message", {
        roomId,
        sender: "System",
        displayName: "System",
        text: sysText,
        type: "system",
        timestamp: new Date(),
      });
    } else {
      // Add to queue
      randomQueue.push(newUser);
      socket.emit("random_waiting", { message: "Looking for a match based on your preferences..." });

      // Automatically relax preferences after 10s
      setTimeout(() => {
        const stillWaiting = randomQueue.find(u => u.socket.id === socket.id);
        if (stillWaiting && stillWaiting.preference === 'strict') {
          socket.emit("random_waiting", { message: "Taking longer than expected... expanding search criteria!" });
          stillWaiting.preference = 'relaxed';
          // Could trigger a re-match check here if desired
        }
      }, 10000);
    }
  });

  socket.on("leave_random", () => {
    // Remove from queue if waiting
    randomQueue = randomQueue.filter((u) => u.socket.id !== socket.id);

    // Leave random room
    const roomId = randomRooms.get(socket.id);
    if (roomId) {
      socket.to(roomId).emit("random_partner_left");
      socket.to(roomId).emit("receive_message", {
        roomId,
        sender: "System",
        displayName: "System",
        text: "The stranger has disconnected.",
        type: "system",
        timestamp: new Date(),
      });
      socket.leave(roomId);
      randomRooms.delete(socket.id);
    }
  });

  /* ======== VIDEO CALL SIGNALING ======== */
  socket.on("callUser", ({ targetSocketId, offer, callerName, roomId: callRoomId }) => {
    // Validate target socket exists and is connected
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (!targetSocket) {
      socket.emit("callError", { message: "User is no longer reachable. Please refresh and try again." });
      return;
    }

    // Prevent multiple simultaneous calls
    if (activeCalls.has(socket.id)) {
      socket.emit("callError", { message: "You are already in a call" });
      return;
    }
    if (activeCalls.has(targetSocketId)) {
      socket.emit("callError", { message: "User is already in a call" });
      return;
    }

    io.to(targetSocketId).emit("incomingCall", {
      from: socket.id,
      callerName: callerName || socket.user.username,
      offer,
      roomId: callRoomId,
    });
  });

  socket.on("acceptCall", ({ to, answer }) => {
    // Register the call for both users
    activeCalls.set(socket.id, { partnerSocketId: to });
    activeCalls.set(to, { partnerSocketId: socket.id });

    io.to(to).emit("callAccepted", {
      from: socket.id,
      answer,
    });
  });

  socket.on("rejectCall", ({ to }) => {
    io.to(to).emit("callRejected", {
      from: socket.id,
    });
  });

  socket.on("endCall", ({ to }) => {
    // Clean up call state
    activeCalls.delete(socket.id);
    if (to) {
      activeCalls.delete(to);
      io.to(to).emit("callEnded", { from: socket.id });
    }
  });

  socket.on("iceCandidate", ({ to, candidate }) => {
    if (to && candidate) {
      io.to(to).emit("iceCandidate", {
        from: socket.id,
        candidate,
      });
    }
  });

  /* ======== LEAVE ROOM ======== */
  socket.on("leave_room", ({ roomId, displayName }) => {
    const name = displayName || socket.user.username;
    clearTypingState(roomId, socket, name);
    socket.leave(roomId);
    socket.to(roomId).emit("user_left", {
      username: name,
      message: `${name} left the room`,
    });
    emitRoomOnlineUsers(roomId);
  });

  /* ======== DISCONNECT ======== */
  socket.on("disconnect", async () => {
    console.log(`User disconnected: ${socket.user.username}`);

    clearTypingState(socket.currentRoom, socket, socket.user.username);

    // End any active video call
    const activeCall = activeCalls.get(socket.id);
    if (activeCall) {
      const partnerSocketId = activeCall.partnerSocketId;
      activeCalls.delete(socket.id);
      if (partnerSocketId) {
        activeCalls.delete(partnerSocketId);
        io.to(partnerSocketId).emit("callEnded", { from: socket.id, reason: "disconnect" });
      }
    }

    if (!socket.user.isAnonymous) {
      removeActiveUser(socket.user.username, socket.id);
      emitOnlineUsers();
    }

    // Remove from random queue
    randomQueue = randomQueue.filter((u) => u.socket.id !== socket.id);

    // Notify random room partner
    const roomId = randomRooms.get(socket.id);
    if (roomId) {
      socket.to(roomId).emit("receive_message", {
        roomId,
        sender: "System",
        displayName: "System",
        text: "The stranger has disconnected.",
        type: "system",
        timestamp: new Date(),
      });
      randomRooms.delete(socket.id);
    }

    if (socket.currentRoom) {
      emitRoomOnlineUsers(socket.currentRoom);
    }

    // Update user status
    if (!socket.user.isAnonymous) {
      try {
        await User.findOneAndUpdate(
          { username: socket.user.username },
          { status: "offline", lastSeen: new Date() }
        );
      } catch (err) {
        // ignore
      }
    }
  });

  initializeSocketPresence(socket);
});

/* -------------------- HEALTH CHECK -------------------- */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

/* -------------------- START -------------------- */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 LinkUp Server running on port ${PORT}`);
});
