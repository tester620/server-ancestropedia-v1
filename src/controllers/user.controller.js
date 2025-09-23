import mongoose from "mongoose";
import { imagekit } from "../config/imagekit.js";
import Post from "../models/post.model.js";
import logger from "../config/logger.js";
import Person from "../models/person.model.js";
import AdminBlog from "../models/admin.blogs.model.js";
import Folder from "../models/folder.model.js";
import PrivateNestedFolder from "../models/private-nested-folder.model.js";
import PrivatePost from "../models/private-post.model.js";
import PrivateFolder from "../models/private-folder.model.js";

export const postStory = async (req, res) => {
  const { image, videoUrl, description, fileSize } = req.body;

  try {
    if (
      !description ||
      typeof description !== "string" ||
      !description.trim()
    ) {
      return res.status(400).json({ message: "Description is required" });
    }

    if (!image && !videoUrl) {
      return res
        .status(400)
        .json({ message: "Either image or video URL must be provided" });
    }

    if (videoUrl && typeof videoUrl !== "string") {
      return res.status(400).json({ message: "Invalid video URL" });
    }

    if (fileSize && typeof fileSize !== "number") {
      return res.status(400).json({ message: "Invalid file size" });
    }

    let imageUrl = null;
    let size = fileSize || null;

    if (image) {
      const uploadRes = await imagekit.upload({
        file: image,
        fileName: "myImage.jpg",
      });

      if (!uploadRes || !uploadRes.url) {
        return res.status(500).json({ message: "Image upload failed" });
      }

      imageUrl = uploadRes.url;
      size = uploadRes.size;
    }

    const newPost = new Post({
      userId: req.user._id,
      imageUrl,
      videoUrl: videoUrl || null,
      description: description.trim(),
      size,
    });

    await newPost.save();

    return res.status(201).json({
      message: "Post submitted successfully",
      data: newPost,
    });
  } catch (error) {
    logger.error("Error in uploading post", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const editPost = async (req, res) => {
  const { description } = req.body;
  const { id } = req.params;
  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid Post Id",
      });
    }
    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({
        message: "Post not found to update",
      });
    }
    if (post.userId.toString() !== req.user._id.toString()) {
      return res.status(401).json({
        message: "Unathorized, cant edit this post",
      });
    }

    post.description = description;
    await post.save();
    return res.status(200).json({
      message: "Post Updated successfully",
      data: post,
    });
  } catch (error) {
    logger.error("Error in updating post", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const getMyPosts = async (req, res) => {
  const user = req.user;
  try {
    const posts = await Post.find({ userId: user._id });
    if (!posts || posts.length === 0) {
      return res.status(404).json({
        message: "No posts found",
      });
    }
    return res.status(200).json({
      message: "Posts fetched successfully",
      data: posts,
    });
  } catch (error) {
    logger.error("Error in getting my posts");
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const deletePost = async (req, res) => {
  const user = req.user;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      message: "Invalid Post id",
    });
  }
  try {
    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }
    if (!post.userId.toString() === user._id.toString()) {
      return res.status(401).json({
        message: "Unauthorised to delete the post",
      });
    }

    await Post.findByIdAndDelete(id);
    return res.status(202).json({
      message: "Delete request have been made",
    });
  } catch (error) {
    logger.error("Error in deleting the post", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const bulkDeletePost = async (req, res) => {
  const { postIds } = req.body;
  if (!Array.isArray(postIds) || postIds.length === 0) {
    return res.status(400).json({ message: "Post ids are required" });
  }

  const invalid = postIds.some((id) => !mongoose.isValidObjectId(id));
  if (invalid) {
    return res.status(400).json({ message: "All post ids must be valid" });
  }

  try {
    const posts = await Post.find({ _id: { $in: postIds } });
    const unAuthorised = posts.some(
      (post) => post.userId.toString() !== req.user._id.toString()
    );

    if (unAuthorised) {
      return res.status(401).json({
        message: "Cannot remove someone else's posts",
      });
    }
    const imageFileIds = posts.map((post) => post.imageFileId).filter(Boolean);

    if (imageFileIds.length) {
      await imagekit.bulkDeleteFiles(imageFileIds);
    }

    await Post.deleteMany({ _id: { $in: postIds } });

    res.status(200).json({ message: "Posts deleted successfully" });
  } catch (error) {
    logger.error("Error in bulk deletion of posts", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const searchPerson = async (req, res) => {
  const { personName } = req.query;
  try {
    const person = await Person.find({
      $or: [
        { firstName: { $regex: personName, $options: "i" } },
        { lastName: { $regex: personName, $options: "i" } },
      ],
    });
    if (!person || !person.length) {
      return res.status(404).json({
        message: "No person found",
      });
    }
    return res.status(200).json({
      message: "Person fetched succesfully",
      data: person,
    });
  } catch (error) {
    logger.error("Error in searching the person profile", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const getBlogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const blogs = await AdminBlog.find().skip(skip).limit(limit);
    const total = await AdminBlog.countDocuments();

    if (!blogs || !blogs.length) {
      return res.status(404).json({
        message: "Blogs not found",
      });
    }

    return res.status(200).json({
      message: "Blogs found successfully",
      data: blogs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(
      "Error in getting the admin blogs from user controller",
      error
    );
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const getTree = async (req, res) => {
  const { region, name, gender, profession: occupation, age } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = 6;
  const skip = (page - 1) * limit;

  if (!name) return res.status(400).json({ message: "Please enter the name" });

  try {
    const currentYear = new Date().getFullYear();
    let dobStart = null;
    let dobEnd = null;

    if (age) {
      const [startStr, endStr] = age.split("-");
      const startNum = parseInt(startStr);
      const endNum = endStr ? parseInt(endStr) : null;

      dobStart = !isNaN(startNum) ? currentYear - startNum : null;
      dobEnd = !isNaN(endNum) ? currentYear - endNum : null;
    }

    const nameParts = name.trim().split(" ").filter(Boolean);
    const query = {};

    if (nameParts.length === 1) {
      query.$or = [
        { firstName: { $regex: nameParts[0], $options: "i" } },
        { lastName: { $regex: nameParts[0], $options: "i" } },
      ];
    } else if (nameParts.length >= 2) {
      query.firstName = { $regex: nameParts[0], $options: "i" };
      query.lastName = { $regex: nameParts.slice(1).join(" "), $options: "i" };
    }

    if (region) query.birthCity = { $regex: region.trim(), $options: "i" };
    if (gender) query.gender = gender.toLowerCase();
    if (occupation)
      query.occupation = { $regex: occupation.trim(), $options: "i" };

    if (dobStart !== null || dobEnd !== null) {
      query.$expr = {
        $and: [
          dobEnd !== null ? { $gte: [{ $toInt: { $substr: ["$birthDate", 0, 4] } }, dobEnd] } : {},
          dobStart !== null ? { $lte: [{ $toInt: { $substr: ["$birthDate", 0, 4] } }, dobStart] } : {}
        ]
      };
    }

    const totalDocs = await Person.countDocuments(query);
    if (totalDocs === 0)
      return res.status(404).json({ message: "No results found" });

    const people = await Person.find(query).skip(skip).limit(limit);

    return res.status(200).json({
      message: "Trees fetched successfully",
      data: people,
      currentPage: page,
      totalPages: Math.ceil(totalDocs / limit),
      totalTrees: totalDocs,
    });
  } catch (error) {
    logger.error(
      "Error in fetching the tree via person name and other filters",
      error
    );
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getVaultMemoryData = async (req, res) => {
  try {
    const posts = await Post.find({ userId: req.user._id });
    const privatePosts = await PrivatePost.find({ userId: req.user._id });
    const files = [...posts, ...privatePosts];

    let storageUsed = 0;
    files.forEach((item) => (storageUsed += item.size));

    const parentPrivateFolders = await PrivateFolder.find({
      userId: req.user._id,
    });
    const parentPrivateFolderIds = parentPrivateFolders.map((f) => f._id);

    const foldersCount =
      (await Folder.countDocuments({ createdBy: req.user._id })) +
      (await PrivateNestedFolder.countDocuments({
        parentFolderId: { $in: parentPrivateFolderIds },
      }));

    return res.status(200).json({
      message: "Data fetched successfully",
      data: {
        storageUsed,
        foldersCount,
        fileStored: files.length,
      },
    });
  } catch (error) {
    logger.error("Error in getting the heritage memory data", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
