import mongoose from "mongoose";
import { imagekit } from "../config/imagekit.js";
import logger from "../config/logger.js";
import Folder from "../models/folder.model.js";
import Post from "../models/post.model.js";

export const createFolder = async (req, res) => {
  const { name, folderFor, date, occasion } = req.body;

  try {
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Folder name is required" });
    }

    const trimmedName = name.trim();

    if (trimmedName.length < 3 || trimmedName.length > 15) {
      return res.status(400).json({
        message: "Folder name must be between 3 and 15 characters",
      });
    }

    if (!folderFor || !folderFor.trim()) {
      return res.status(400).json({ message: "Folder For is required" });
    }

    if (!occasion || !occasion.trim()) {
      return res.status(400).json({ message: "Occasion is required" });
    }

    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }

    const folder = new Folder({
      name: trimmedName,
      createdBy: req.user._id,
      folderFor: folderFor.trim(),
      occasion: occasion.trim(),
      date: new Date(date),
    });

    await folder.save();

    return res.status(201).json({
      message: `${trimmedName} Folder Created`,
      data: folder,
    });
  } catch (error) {
    logger.error("Error in creating folder", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getMyFolders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;
    const folders = await Folder.find({ createdBy: req.user._id })
      .skip(skip)
      .limit(limit)
      .populate("posts");

    const totalDocs = await Folder.countDocuments({ createdBy: req.user._id });
    if (!folders || !folders.length) {
      return res.status(400).json({
        message: "No folders found",
      });
    }
    return res.status(200).json({
      message: "Folder fetched succesfully",
      data: folders,
      currentPage: page,
      totalPages: Math.ceil(totalDocs / limit),
      totalFolders: totalDocs,
    });
  } catch (error) {
    logger.error("Error in getting folder data for the user", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const updateFolder = async (req, res) => {
  const { folderId } = req.query;
  const { name, image } = req.body;
  try {
    if (name.trim() && (name.length > 15 || name.length < 3)) {
      return res.status(400).json({
        message: "Name of the folder should be in between 3 and 15 characters",
      });
    }
    if ((!name || !name.trim()) && !image) {
      return res.status(400).json({
        message: "Please fill atleast one feild",
      });
    }
    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(400).json({
        message: "Folder not found",
      });
    }
    if (folder.createdBy.toString() !== req.user._id.toString()) {
      return res.status(401).json({
        message: "Unauthorised can't edit someone's folder",
      });
    }
    if (image) {
      const uploadRes = await imagekit.upload({
        file: image,
        fileName: "myImage.jpg",
      });
      folder.thumbnail = uploadRes.url;
    }
    if (name) {
      folder.name = name;
    }
    await folder.save();
    return res.status(200).json({
      message: "Folder updated successfully",
      data: folder,
    });
  } catch (error) {
    logger.error("Error in upadting the folder", error);
    return res.status(500).json({
      message: "Internal Sever Error",
    });
  }
};

export const getFolderData = async (req, res) => {
  const { folderId } = req.query;
  if (!folderId) {
    return res.status(400).json({
      message: "Folder id is required",
    });
  }
  if (!mongoose.isValidObjectId(folderId)) {
    return res.status(400).json({
      message: "Invalid Folder Id",
    });
  }
  try {
    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({
        message: "Folder not found",
      });
    }
    if (folder.createdBy.toString() !== req.user._id.toString()) {
      return res.status(401).json({
        message: "Unauthorized- Can't view other's folder ",
      });
    }

    await folder.populate("posts");
    return res.status(200).json({
      message: "Folder data fetched succesfully",
      data: folder,
    });
  } catch (error) {
    logger.error("Error in getting the data of folder with id", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const removeFolder = async (req, res) => {
  const { folderId } = req.body;
  try {
    if (!folderId) {
      return res.status(400).json({
        message: "Folder Id is required",
      });
    }
    if (!mongoose.isValidObjectId(folderId)) {
      return res.status(400).json({
        message: "Invalid Folder Id",
      });
    }

    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({
        message: "Folder not found",
      });
    }
    if (folder.createdBy.toString() !== req.user._id.toString()) {
      return res.status(401).json({
        message: "Unauthorized- Can't remove other's folder",
      });
    }
    if (folder.posts.length) {
      return res.status(400).json({
        message: "Folder is not empty. Can't delete it",
      });
    }
    await Folder.findByIdAndDelete(folderId);
    return res.status(202).json({
      message: "Folder delete request made successfully",
    });
  } catch (error) {
    logger.error("Error in removing the folder", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const addPosts = async (req, res) => {
  try {
    const { postIds, folderId } = req.body;

    if (!postIds || !Array.isArray(postIds) || !folderId) {
      return res.status(400).json({ message: "Invalid request payload" });
    }

    if (!postIds.length) {
      return res
        .status(400)
        .json({ message: "Posts are required to add in folder" });
    }

    const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
    const filteredPostIds = [
      ...new Set(postIds.filter((id) => isValidObjectId(id))),
    ];

    if (filteredPostIds.length !== postIds.length) {
      return res
        .status(400)
        .json({ message: "One or more post IDs are invalid or duplicated" });
    }

    const posts = await Post.find({ _id: { $in: filteredPostIds } });

    if (posts.length !== filteredPostIds.length) {
      return res.status(404).json({ message: "One or more posts not found" });
    }

    const unauthorizedPost = posts.find(
      (post) => post.userId.toString() !== req.user._id.toString()
    );
    if (unauthorizedPost) {
      return res
        .status(403)
        .json({ message: "You are not authorized to add some of these posts" });
    }

    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    if (folder.createdBy.toString() !== req.user._id.toString()) {
      return res
        .status(401)
        .json({ message: "Unauthorized - Cannot modify this folder" });
    }

    const existingPostIds = folder.posts.map((p) => p.toString());
    const newPostIds = filteredPostIds.filter(
      (id) => !existingPostIds.includes(id)
    );

    if (newPostIds.length === 0) {
      return res.status(400).json({
        message: "All selected posts already exist in the folder",
      });
    }

    folder.posts.push(...newPostIds);
    await folder.save();

    return res.status(200).json({
      message: "Posts added to folder successfully",
      folder,
    });
  } catch (error) {
    console.error("addPosts Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const removeFiles = async (req, res) => {
  const { postIds, folderId } = req.body;

  try {
    if (!postIds || !Array.isArray(postIds) || !postIds.length) {
      return res.status(400).json({
        message: "Post ids are required",
      });
    }

    const isValidMongoObjectId = (id) => mongoose.isValidObjectId(id);
    const filteredPostIds = [...new Set(postIds.filter(isValidMongoObjectId))];

    const posts = await Post.find({ _id: { $in: filteredPostIds } });
    if (posts.length !== filteredPostIds.length) {
      return res.status(404).json({ message: "One or more posts not found" });
    }

    const unauthorizedPost = posts.find(
      (post) => post.userId.toString() !== req.user._id.toString()
    );
    if (unauthorizedPost) {
      return res.status(403).json({
        message: "You are not authorized to modify some of these posts",
      });
    }

    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    if (folder.createdBy.toString() !== req.user._id.toString()) {
      return res.status(401).json({
        message: "Unauthorized - Cannot modify this folder",
      });
    }

    const initialLength = folder.posts.length;

    folder.posts = folder.posts.filter(
      (id) => !filteredPostIds.includes(id.toString())
    );

    if (folder.posts.length === initialLength) {
      return res.status(400).json({
        message: "No selected posts were found in the folder",
      });
    }

    await folder.save();

    return res.status(200).json({
      message: "Posts removed from folder successfully",
      folder,
    });
  } catch (error) {
    console.error("Error removing posts:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const createInFolder = async (req, res) => {
  const { image, description, videoUrl, folderId } = req.body;
  try {
    if (!folderId || !mongoose.isValidObjectId(folderId)) {
      return res.status(400).json({
        message: "Valid Folder Id is required",
      });
    }
    if (!image && !description && !videoUrl) {
      return res.status(400).json({
        message: "Please fill atleast one feild",
      });
    }

    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(400).json({
        message: "Folder not found",
      });
    }

    if (folder.createdBy.toString() !== req.user._id.toString()) {
      return res.status(401).json({
        message: "Unauthorizedd- Can't add posts to someone else's folder",
      });
    }

    let newPost = new Post({
      userId: req.user._id,
    });
    if (image) {
      const uploadRes = await imagekit.upload({
        file: image,
        fileName: "myImage.jpg",
      });
      newPost.imageUrl = uploadRes.url;
      newPost.imageFileId = uploadRes.fileId;
    }
    if (description) newPost.description = description;
    if (videoUrl) newPost.videoUrl = videoUrl;
    await newPost.save();
    folder.posts.push(newPost._id);
    await folder.save();
    return res.status(201).json({
      message: "New post Created",
      data: newPost,
    });
  } catch (error) {
    logger.error("Error in creating post in folder", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const deletePost = async (req, res) => {
  const { postId } = req.query;
  try {
    if (!postId || !mongoose.isValidObjectId(postId)) {
      return res.status(400).json({
        message: "Please enter a valid post id",
      });
    }
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(400).json({
        message: "Post not found",
      });
    }
    if (post.userId.toString() !== req.user._id.toString()) {
      return res.status(401).json({
        message: "Unauthorized- Can't delete someone's posts",
      });
    }
    if (post.imageUrl) {
      await imagekit.deleteFile(post.imageFileId);
    }
  } catch (error) {
    logger.error("Error in deleting the post", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
