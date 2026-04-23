const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    sender: {
      type: String,
      required: true,
    },
    displayName: {
      type: String,
      default: "",
    },
    text: {
      type: String,
      default: "",
    },
    image: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      enum: ["text", "image", "system"],
      default: "text",
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    anonymousId: {
      type: String,
      default: null,
    },
    seenBy: {
      type: [String],
      default: [],
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    encrypted: {
      type: Boolean,
      default: false, // true when text is AES-GCM ciphertext
    },
    iv: {
      type: String,
      default: null, // base64-encoded AES-GCM IV (only set when encrypted=true)
    },
  },
  { timestamps: true }
);

messageSchema.index({ roomId: 1, timestamp: 1 });

module.exports = mongoose.model("Message", messageSchema);
