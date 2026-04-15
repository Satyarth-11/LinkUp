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
const Message = require("./models/Message");
const Room = require("./models/Room");
const User = require("./models/User");

const app = express();

/* -------------------- MIDDLEWARE -------------------- */
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
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

app.post("/api/upload", upload.single("image"), (req, res) => {
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
    origin: allowedOrigins,
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
        { roomId },
        { $addToSet: { members: { username: name } } }
      );
    } catch (err) {
      // Room might not exist (e.g., random rooms), ignore
    }
  });

  /* ======== SEND MESSAGE ======== */
  socket.on("send_message", async (data) => {
    try {
      const { roomId, text, image, isAnonymous, displayName } = data;
      const sender = socket.user.username;
      const resolvedName = isAnonymous ? "Anonymous" : (displayName || sender);

      const newMessage = new Message({
        roomId,
        sender,
        displayName: resolvedName,
        text: text || "",
        image: image || null,
        type: image ? "image" : "text",
        isAnonymous: isAnonymous || false,
        timestamp: new Date(),
      });

      await newMessage.save();

      io.to(roomId).emit("receive_message", {
        _id: newMessage._id,
        roomId,
        sender,
        displayName: resolvedName,
        text: text || "",
        image: image || null,
        type: newMessage.type,
        isAnonymous: isAnonymous || false,
        timestamp: newMessage.timestamp,
      });
    } catch (err) {
      console.error("Message save error:", err);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  /* ======== TYPING INDICATOR ======== */
  socket.on("typing", ({ roomId, isTyping, displayName }) => {
    const name = displayName || socket.user.username;
    socket.to(roomId).emit("user_typing", { username: name, isTyping });
  });

  /* ======== RANDOM CHAT ======== */
  socket.on("join_random", ({ username, interests = [], language = 'Any', preference = 'relaxed', skipSocketId = null }) => {
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

  /* ======== LEAVE ROOM ======== */
  socket.on("leave_room", ({ roomId, displayName }) => {
    const name = displayName || socket.user.username;
    socket.leave(roomId);
    socket.to(roomId).emit("user_left", {
      username: name,
      message: `${name} left the room`,
    });
  });

  /* ======== DISCONNECT ======== */
  socket.on("disconnect", async () => {
    console.log(`User disconnected: ${socket.user.username}`);

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
