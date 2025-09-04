import mongoose from "mongoose";

const modelSchema = mongoose.Schema(
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
    description:{
      type:String
    },
    type: {
      type: String,
      required: true,
    },
    parentFolderId:{
      type:mongoose.Schema.Types.ObjectId
    },
    fileUrl: {
      type: String,
    },
    fileId: {
      type: String,
    },
  },
  { timestamps: true }
);

const model = mongoose.model("PrivatePost", modelSchema);
export default model;
