import mongoose from "mongoose";

const modelSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    members: {
      type: [mongoose.Schema.Types.ObjectId],
      ref:"Person"
    },
  },
  {
    timestamps: true,
  }
);

const Tree = mongoose.model("Tree", modelSchema);

export default Tree;
