import mongoose from "mongoose";

const modelSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    treeId: {
      type: "String",
      ref: "Person",
      required: true,
    },
    grantedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

const model = mongoose.model("TreeAccess", modelSchema);

export default model;
