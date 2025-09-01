import mongoose from "mongoose";
import { imagekit } from "../config/imagekit.js";
import logger from "../config/logger.js";
import Folder from "../models/folder.model.js";
import Post from "../models/post.model.js";
import PrivateFolder from "../models/private-folder.model.js";
import PrivatePost from "../models/private-post.model.js";
import PrivateNestedFolder from "../models/private-nested-folder.model.js";

export const createFolder = async (req, res) => {
  const { name, folderFor, date, occasion, parentFolderId } = req.body;

  if (parentFolderId && !mongoose.isValidObjectId(parentFolderId)) {
    return res.status(400).json({
      message: "Invalid Parent Folder Id",
    });
  }

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
      parentFolderId: parentFolderId ? parentFolderId : null,
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
    const limit = 12;
    const skip = (page - 1) * limit;
    const folders = await Folder.find({
      createdBy: req.user._id,
      parentFolderId: null,
    })
      .skip(skip)
      .limit(limit)
      .populate("posts");

    const totalDocs = await Folder.countDocuments({
      createdBy: req.user._id,
      parentFolderId: null,
    });
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

export const getAllFolders = async (req, res) => {
  try {
    const folders = await Folder.find({ createdBy: req.user._id });
    if (!folders || !folders.length)
      return res.status(400).json({
        message: "No Folders found",
      });
    return res.status(200).json({
      message: "All Folders fetched succesfully",
      data: folders,
    });
  } catch (error) {
    logger.error("Error in getting all the folders", error);
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
        code: "UnAuth",
      });
    }

    const existingFolders = await Folder.find({ parentFolderId: folderId });

    await folder.populate("posts");
    return res.status(200).json({
      message: "Folder data fetched succesfully",
      data: {
        existingFolders: existingFolders,
        folderData: folder,
      },
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
  const { image, fileUrl, folderId, size, type, name } = req.body;
  try {
    if (!folderId || !mongoose.isValidObjectId(folderId)) {
      return res.status(400).json({
        message: "Valid Folder Id is required",
      });
    }
    if ((!image && !fileUrl) || !size || !type || !name) {
      return res.status(400).json({
        message: "Please fill atleast one field",
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
    newPost.size = size;
    newPost.name = name;
    newPost.type = type;
    if (image) {
      const uploadRes = await imagekit.upload({
        file: image,
        fileName: "myImage.jpg",
      });
      newPost.fileUrl = uploadRes.url;

      newPost.fileId = uploadRes.fileId;
    }
    if (fileUrl) newPost.fileUrl = fileUrl;
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

export const linkMember = async (req, res) => {
  const { folderId, userIds } = req.body;

  if (!folderId || !mongoose.isValidObjectId(folderId)) {
    return res.status(400).json({ message: "Invalid folder ID" });
  }

  if (!userIds || !Array.isArray(userIds)) {
    return res.status(400).json({ message: "Invalid user IDs" });
  }

  const invalidIds = userIds.filter((id) => !mongoose.isValidObjectId(id));
  if (invalidIds.length) {
    return res.status(400).json({ message: "One or more invalid user IDs" });
  }

  try {
    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    userIds.forEach((id) => {
      if (!folder.members.includes(id)) {
        folder.members.push(id);
      }
    });

    await folder.save();

    return res.status(200).json({
      message: "Members linked successfully",
      folder,
    });
  } catch (error) {
    console.error("Error linking members:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const createPrivateNestedFolder = async (req, res) => {
  const { name, occasion } = req.body;
  const userId = req.user._id;
  if (!name.trim() || !occasion.trim()) {
    return res.status(400).json({
      message: "Please fill all the fields",
    });
  }

    const trimmedName = name.trim();
    const trimmedOccasion = occasion.trim();

    if (trimmedName.length < 3 || trimmedName.length > 15) {
      return res.status(400).json({
        message: "Folder name must be between 3 and 15 characters",
      });
    }
    if (trimmedOccasion.length < 3 || trimmedOccasion.length > 15) {
      return res.status(400).json({
        message: "Folder occasion must be between 3 and 15 characters",
      });
    }
  try {
    const parentFolder = await PrivateFolder.findOne({ userId });
    if (!parentFolder) {
      return res.status(404).json({
        message: "Parent folder not found",
      });
    }
    const folder = new PrivateNestedFolder({
      name:trimmedName,
      occasion:trimmedOccasion,
      parentFolderId: parentFolder._id,
    });
    await folder.save();
    return res.status(201).json({
      message: "Private folder created successfully",
      data:folder,
    });
  } catch (error) {
    logger.error("Error creating private folder:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const getPrivateFolderRootData = async (req, res) => {
  const userId = req.user._id;
  try {
    const folder = await PrivateFolder.findOne({ userId });
    if (!folder) {
      return res.status(404).json({
        message: "Folder not found",
      });
    }

    const existingFolders = await PrivateNestedFolder.find({
      parentFolderId: folder._id,
    });

    const posts = await PrivatePost.find({ parentFolderId: folder._id });
    return res.status(200).json({
      message: "Folder data fetched succesfully",
      data: {
        existingFolders: existingFolders,
        posts,
        _id:folder._id
      },
    });
  } catch (error) {
    logger.error("Error in getting the data of folder with id", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const getPrivateFolderData = async (req, res) => {
  const { folderId } = req.query;

  try {
    const folder = await PrivateNestedFolder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    const parentFolders = await PrivateFolder.find({ userId: req.user._id });
    const parentFolderIds = parentFolders.map((f) => f._id.toString());

    if (!parentFolderIds.includes(folder.parentFolderId.toString())) {
      return res.status(403).json({ message: "Unauthorised", code: "UnAuth" });
    }

    const posts = await PrivatePost.find({ parentFolderId: folder._id });
    return res
      .status(200)
      .json({ message: "Folder data fetched successfully", data: {folder,posts} });
  } catch (error) {
    logger.error("Error in getting the private folder data", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const createPrivatePosts = async (req, res) => {
  const { image, fileUrl, size, type, name, folderId, root } = req.body;
  const isRoot = root === undefined ? true : root;

  try {
    if (!folderId || !mongoose.isValidObjectId(folderId)) {
      return res.status(400).json({
        message: "Valid Folder Id is required",
      });
    }
    if ((!image && !fileUrl) || !size || !type || !name) {
      return res.status(400).json({
        message: "Please fill atleast one field",
      });
    }

    const folder = isRoot
      ? await PrivateFolder.findById(folderId)
      : await PrivateNestedFolder.findById(folderId);
    if (!folder) {
      return res.status(400).json({
        message: "Folder not found",
      });
    }

    let newPost = new PrivatePost({
      userId: req.user._id,
    });
    newPost.size = size;
    newPost.parentFolderId = folderId;
    newPost.name = name;
    newPost.type = type;
    if (image) {
      const uploadRes = await imagekit.upload({
        file: image,
        fileName: "myImage.jpg",
      });
      newPost.fileUrl = uploadRes.url;

      newPost.fileId = uploadRes.fileId;
    }
    if (fileUrl) newPost.fileUrl = fileUrl;
    await newPost.save();
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

export const createRootFolderPrivate = async (user) => {
  const { userId } = user._id;
  try {
    if (userId) {
      const res = await PrivateFolder.findOne({ userId });
      if (!res) {
        const newFolder = new PrivateFolder({ userId });
        await newFolder.save();
      }
    }
  } catch (error) {
    logger.error("Error in xreating root folder", error);
  }
};

export const removePrivateFolder = async (req, res) => {
  const { folderId } = req.body;
  try {
    if (!folderId || !mongoose.isValidObjectId(folderId)) {
      return res.status(400).json({
        message: "Valid folder Id is required",
      });
    }

    const folder = PrivateNestedFolder.findById(folderId);
    if (!folder) {
      return res.status(404).json({
        messsage: "No folder found with id",
      });
    }
  } catch (error) {}
};
