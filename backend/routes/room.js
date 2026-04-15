const express = require("express");
const bcrypt = require("bcryptjs");
const Room = require("../models/Room");
const Message = require("../models/Message");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

/* ---- Create Group Room ---- */
router.post("/create-group", authMiddleware, async (req, res) => {
  try {
    const { roomId, name, password } = req.body;

    if (!roomId || !password) {
      return res.status(400).json({ message: "Room ID and password are required" });
    }

    const existing = await Room.findOne({ roomId: roomId.toUpperCase() });
    if (existing) {
      return res.status(400).json({ message: "Room ID already exists, try a different one" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newRoom = new Room({
      roomId: roomId.toUpperCase(),
      name: name || roomId.toUpperCase(),
      password: hashed,
      type: "group",
      createdBy: req.user.username,
    });

    await newRoom.save();

    res.status(201).json({
      message: "Group room created successfully",
      roomId: newRoom.roomId,
      name: newRoom.name,
    });
  } catch (err) {
    console.error("Create group error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ---- Join Group Room ---- */
router.post("/join-group", authMiddleware, async (req, res) => {
  try {
    const { roomId, password } = req.body;

    if (!roomId || !password) {
      return res.status(400).json({ message: "Room ID and password are required" });
    }

    const room = await Room.findOne({ roomId: roomId.toUpperCase() });
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    if (room.type !== "group") {
      return res.status(400).json({ message: "This is not a group room" });
    }

    const isMatch = await bcrypt.compare(password, room.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Wrong password" });
    }

    res.json({
      message: "Access granted",
      roomId: room.roomId,
      name: room.name,
    });
  } catch (err) {
    console.error("Join group error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ---- Create/Get Private Room ---- */
router.post("/private", authMiddleware, async (req, res) => {
  try {
    const { targetUsername } = req.body;
    const currentUser = req.user.username;

    if (!targetUsername) {
      return res.status(400).json({ message: "Target username is required" });
    }
    if (targetUsername === currentUser) {
      return res.status(400).json({ message: "Cannot chat with yourself" });
    }

    // Generate consistent room ID for two users
    const sorted = [currentUser, targetUsername].sort();
    const roomId = `PRIV_${sorted[0]}_${sorted[1]}`.toUpperCase();

    let room = await Room.findOne({ roomId });
    if (!room) {
      room = new Room({
        roomId,
        name: `${currentUser} & ${targetUsername}`,
        type: "private",
        createdBy: currentUser,
        members: [{ username: currentUser }, { username: targetUsername }],
      });
      await room.save();
    }

    res.json({ roomId: room.roomId, name: room.name });
  } catch (err) {
    console.error("Private room error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ---- Get Room Info ---- */
router.get("/:roomId", authMiddleware, async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId.toUpperCase() });
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    res.json({
      roomId: room.roomId,
      name: room.name,
      type: room.type,
      createdBy: room.createdBy,
      memberCount: room.members.length,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ---- Get Message History ---- */
router.get("/:roomId/messages", authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const messages = await Message.find({ roomId: req.params.roomId.toUpperCase() })
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
