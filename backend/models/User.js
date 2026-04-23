const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    password: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 160,
      default: "",
    },
    profilePicture: {
      type: String,
      trim: true,
      default: "",
    },
    interests: {
      type: [String],
      default: [],
      validate: {
        validator: (value) => Array.isArray(value) && value.length <= 12,
        message: "Interests cannot exceed 12 items",
      },
    },
    showActiveStatus: {
      type: Boolean,
      default: true,
    },
    privacySettings: {
      showProfile: { type: Boolean, default: true },
      showOnlineStatus: { type: Boolean, default: true },
      allowRandomMatch: { type: Boolean, default: true },
      anonymousMode: { type: Boolean, default: false },
    },
    anonymousId: {
      type: String,
      default: null,
    },
    blockedUsers: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        username: { type: String, required: true },
        blockedAt: { type: Date, default: Date.now },
      },
    ],
    reports: [
      {
        reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reportedByUsername: { type: String, required: true },
        reason: {
          type: String,
          enum: ["spam", "harassment", "inappropriate", "other"],
          required: true,
        },
        details: { type: String, default: "" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ["online", "offline"],
      default: "offline",
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    publicKey: {
      type: String,
      default: null, // ECDH P-256 public key in JWK JSON string format
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
