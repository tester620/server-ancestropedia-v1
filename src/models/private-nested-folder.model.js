import mongoose from "mongoose";

const modelSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
    minLength: 3,
    maxLength: 15,
  },
  occasion: {
    type: String,
    required: true,
    minLength: 3,
    maxLength: 15,
  },
  thumbnail: {
    type: String,
    default:
      "https://ik.imagekit.io/ancestor/Folder-Default.png",
  },
  parentFolderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PrivateFolder",
  },
},{timestamps:true});

const PrivateNestedFolder = mongoose.model("PrivateNestedFolder", modelSchema);

export default PrivateNestedFolder;
