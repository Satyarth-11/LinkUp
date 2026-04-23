const express = require("express");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

/* -------- Helper: generate anonymous ID -------- */
const generateAnonymousId = () => {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `User${num}`;
};

/* -------- GET /api/privacy -------- */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "privacySettings anonymousId"
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const settings = {
      showProfile:
        user.privacySettings?.showProfile !== false,
      showOnlineStatus:
        user.privacySettings?.showOnlineStatus !== false,
      allowRandomMatch:
        user.privacySettings?.allowRandomMatch !== false,
      anonymousMode:
        user.privacySettings?.anonymousMode === true,
    };

    res.json({
      privacySettings: settings,
      anonymousId: user.anonymousId || null,
    });
  } catch (err) {
    console.error("Get privacy settings error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- PUT /api/privacy -------- */
router.put("/", authMiddleware, async (req, res) => {
  try {
    const { showProfile, showOnlineStatus, allowRandomMatch, anonymousMode } =
      req.body;

    const update = {};

    if (typeof showProfile === "boolean") {
      update["privacySettings.showProfile"] = showProfile;
    }
    if (typeof showOnlineStatus === "boolean") {
      update["privacySettings.showOnlineStatus"] = showOnlineStatus;
      // Keep legacy field in sync
      update["showActiveStatus"] = showOnlineStatus;
    }
    if (typeof allowRandomMatch === "boolean") {
      update["privacySettings.allowRandomMatch"] = allowRandomMatch;
    }
    if (typeof anonymousMode === "boolean") {
      update["privacySettings.anonymousMode"] = anonymousMode;
      // Generate or clear anonymous ID
      if (anonymousMode) {
        update["anonymousId"] = generateAnonymousId();
      } else {
        update["anonymousId"] = null;
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No valid settings provided" });
    }

    const user = await User.findByIdAndUpdate(req.user.id, update, {
      new: true,
      runValidators: true,
    }).select("privacySettings anonymousId showActiveStatus");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Privacy settings updated",
      privacySettings: {
        showProfile: user.privacySettings?.showProfile !== false,
        showOnlineStatus: user.privacySettings?.showOnlineStatus !== false,
        allowRandomMatch: user.privacySettings?.allowRandomMatch !== false,
        anonymousMode: user.privacySettings?.anonymousMode === true,
      },
      anonymousId: user.anonymousId || null,
    });
  } catch (err) {
    console.error("Update privacy settings error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- POST /api/privacy/block -------- */
router.post("/block", authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    const normalizedUsername = username.toLowerCase().trim();

    if (normalizedUsername === req.user.username) {
      return res.status(400).json({ message: "Cannot block yourself" });
    }

    // Check target user exists
    const targetUser = await User.findOne({ username: normalizedUsername });
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if already blocked
    const currentUser = await User.findById(req.user.id);
    const alreadyBlocked = currentUser.blockedUsers.some(
      (b) => b.username === normalizedUsername
    );
    if (alreadyBlocked) {
      return res.status(400).json({ message: "User is already blocked" });
    }

    await User.findByIdAndUpdate(req.user.id, {
      $push: {
        blockedUsers: {
          userId: targetUser._id,
          username: normalizedUsername,
        },
      },
    });

    res.json({ message: `${normalizedUsername} has been blocked` });
  } catch (err) {
    console.error("Block user error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- DELETE /api/privacy/block/:username -------- */
router.delete("/block/:username", authMiddleware, async (req, res) => {
  try {
    const normalizedUsername = req.params.username.toLowerCase().trim();

    const result = await User.findByIdAndUpdate(req.user.id, {
      $pull: { blockedUsers: { username: normalizedUsername } },
    });

    if (!result) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: `${normalizedUsername} has been unblocked` });
  } catch (err) {
    console.error("Unblock user error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- GET /api/privacy/blocked -------- */
router.get("/blocked", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("blockedUsers");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      blockedUsers: (user.blockedUsers || []).map((b) => ({
        username: b.username,
        blockedAt: b.blockedAt,
      })),
    });
  } catch (err) {
    console.error("Get blocked users error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- POST /api/privacy/report -------- */
router.post("/report", authMiddleware, async (req, res) => {
  try {
    const { username, reason, details } = req.body;

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    const validReasons = ["spam", "harassment", "inappropriate", "other"];
    if (!reason || !validReasons.includes(reason)) {
      return res.status(400).json({
        message: `Reason must be one of: ${validReasons.join(", ")}`,
      });
    }

    const normalizedUsername = username.toLowerCase().trim();

    if (normalizedUsername === req.user.username) {
      return res.status(400).json({ message: "Cannot report yourself" });
    }

    const targetUser = await User.findOne({ username: normalizedUsername });
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    await User.findOneAndUpdate(
      { username: normalizedUsername },
      {
        $push: {
          reports: {
            reportedBy: req.user.id,
            reportedByUsername: req.user.username,
            reason,
            details: (details || "").trim().slice(0, 500),
          },
        },
      }
    );

    res.json({ message: "Report submitted successfully" });
  } catch (err) {
    console.error("Report user error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
