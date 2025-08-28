import mongoose from "mongoose";

const postSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    name: {
      type: String,
      required: true,
    },

    size: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },

    fileUrl: {
      type: String,
      required: true,
    },
    fileId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const Post = mongoose.models.Post || mongoose.model("Post", postSchema);

export default Post;
