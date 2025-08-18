import mongoose from "mongoose";

const postSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    imageUrl: {
      type: String,
      default: null,
    },
    size:{
      type:Number,
      required:true
    },
    thumbnail: {
      type: String,
      default: null,
    },
    videoFileId: {
      type: String,
      default: null,
    },
    imageFileId: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      default: null,
    },
    videoUrl: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Post = mongoose.models.Post || mongoose.model("Post", postSchema);

export default Post;
