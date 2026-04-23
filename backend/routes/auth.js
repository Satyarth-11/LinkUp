const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const sanitizeUser = (user) => ({
  id: user._id,
  username: user.username,
  bio: user.bio || "",
  profilePicture: user.profilePicture || user.avatar || "",
  interests: Array.isArray(user.interests) ? user.interests : [],
  showActiveStatus: user.showActiveStatus !== false,
  privacySettings: {
    showProfile: user.privacySettings?.showProfile !== false,
    showOnlineStatus: user.privacySettings?.showOnlineStatus !== false,
    allowRandomMatch: user.privacySettings?.allowRandomMatch !== false,
    anonymousMode: user.privacySettings?.anonymousMode === true,
  },
  anonymousId: user.anonymousId || null,
  publicKey: user.publicKey || null,
});

/* -------- REGISTER -------- */
router.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ message: "Username must be 3-20 characters" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: "Username already taken" });
    }

    const hashed = await bcrypt.hash(password, 12);
    const newUser = new User({ username: username.toLowerCase(), password: hashed });
    await newUser.save();

    const token = jwt.sign(
      { id: newUser._id, username: newUser.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "Registered successfully",
      token,
      user: sanitizeUser(newUser),
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- LOGIN -------- */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    // Update status to online
    user.status = "online";
    user.lastSeen = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- LOGOUT -------- */
router.post("/logout", authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      status: "offline",
      lastSeen: new Date(),
    });
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- VERIFY TOKEN -------- */
router.get("/verify", authMiddleware, (req, res) => {
  res.json({ valid: true, user: req.user });
});

router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { bio = "", profilePicture = "", interests = [], showActiveStatus = true, publicKey } = req.body;

    if (typeof bio !== "string") {
      return res.status(400).json({ message: "Bio must be a string" });
    }
    if (typeof profilePicture !== "string") {
      return res.status(400).json({ message: "Profile picture must be a string" });
    }
    if (!Array.isArray(interests)) {
      return res.status(400).json({ message: "Interests must be an array" });
    }
    if (typeof showActiveStatus !== "boolean") {
      return res.status(400).json({ message: "Active visibility must be true or false" });
    }

    const normalizedInterests = interests
      .map((interest) => String(interest || "").trim())
      .filter(Boolean)
      .slice(0, 12);

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        bio: bio.trim().slice(0, 160),
        profilePicture: profilePicture.trim(),
        avatar: profilePicture.trim(),
        interests: normalizedInterests,
        showActiveStatus,
        "privacySettings.showOnlineStatus": showActiveStatus,
        ...(typeof publicKey === "string" && publicKey ? { publicKey } : {}),
      },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Profile updated successfully",
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- GET PUBLIC KEY -------- */
router.get("/public-key/:username", authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({
      username: req.params.username.toLowerCase(),
    }).select("publicKey username");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ username: user.username, publicKey: user.publicKey || null });
  } catch (err) {
    console.error("Get public key error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
