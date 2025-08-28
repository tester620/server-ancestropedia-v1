import mongoose from "mongoose";

const folderSchema = mongoose.Schema({
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  name: {
    type: String,
    required: true,
  },
  folderFor: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  occasion: {
    type: String,
    required: true,
  },
  posts: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "Post",
  },
  parentFolderId: {
    type: mongoose.Schema.Types.ObjectId,
  },
  members: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "Person",
  },
  thumbnail: {
    type: String,
    default:
      "https://ik.imagekit.io/ancestor/Folder-Default.png",
  },
});

const Folder = mongoose.model("Folder", folderSchema);
export default Folder;
