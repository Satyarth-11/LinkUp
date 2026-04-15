const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      unique: true,
      required: true,
    },
    name: {
      type: String,
      default: "",
    },
    password: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      enum: ["private", "group", "random"],
      required: true,
    },
    createdBy: {
      type: String,
      default: "anonymous",
    },
    members: [
      {
        username: String,
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Room", roomSchema);
