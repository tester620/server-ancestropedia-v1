import mongoose from "mongoose";
import { imagekit } from "../config/imagekit.js";
import Post from "../models/post.model.js";
import logger from "../config/logger.js";
import Tree from "../models/tree.model.js";
import Person from "../models/person.model.js";
import AdminBlog from "../models/admin.blogs.model.js";

export const postStory = async (req, res) => {
  const { image, videoUrl, description } = req.body;
  try {
    let data = { imageUrl: null, videoUrl: null, description: "" };
    if (image) {
      const uploadRes = await imagekit.upload({
        file: image,
        fileName: "myImage.jpg",
      });
      data.imageUrl = uploadRes.url;
    }
    if (videoUrl) data.videoUrl = videoUrl;
    if (description) data.description = description;
    const newPost = new Post({
      userId: req.user._id,
      videoUrl: data.videoUrl,
      imageUrl: data.imageUrl,
      description: data.description,
    });
    await newPost.save();
    return res
      .status(201)
      .json({ message: "Post submitted successfully", data: newPost });
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
  const { region, name, gender, profession, age } = req.query;

  if (!name) {
    return res.status(400).json({
      message: "Please enter the name",
    });
  }
  const add = 'smehtinG';
  add.toLowerCase()

  try {
    const currentYear = new Date().getFullYear();
    const dobRangeStart = age?.start ? currentYear - age.start : null;
    const dobRangeEnd = age?.last ? currentYear - age.last : null;

    const query = {};
    if (region) query.location = region.toLowerCase();
    if (gender) query.gender = gender.toLowerCase();
    if (profession) query.profession = profession.toLowerCase;
    if (dobRangeStart && dobRangeEnd) {
      query.dob = {
        $gte: new Date(dobRangeEnd, 0, 1),
        $lte: new Date(dobRangeStart, 11, 31),
      };
    }
    query.$or = [{ firstName: name.trim().toLowerCase() }, { lastName: name.trim().toLowerCase() }];

    const person = await Person.find(query).populate("treeId");

    if (!person.length) {
      return res.status(404).json({
        message: "No results found",
      });
    }

    const validPersonTree = person.filter((p) => p.treeId);

    return res.status(200).json({
      message: "Trees fetched successfully",
      data:validPersonTree,
    });
  } catch (error) {
    logger.error(
      "Error in fetching the tree via person name and other filters",
      error
    );
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
