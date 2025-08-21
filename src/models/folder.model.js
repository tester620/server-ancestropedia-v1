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
  thumbnail: {
    type: String,
    default:
      "https://static1.howtogeekimages.com/wordpress/wp-content/uploads/2015/03/00_lead_image_folders.jpg?q=50&fit=crop&w=1140&h=&dpr=1.5",
  },
});

const Folder = mongoose.model("Folder", folderSchema);
export default Folder;
