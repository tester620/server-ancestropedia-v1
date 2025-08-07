import express from "express";
import {
  bulkDeletePost,
  deletePost,
  editPost,
  getBlogs,
  getMyPosts,
  postStory,
  searchPerson,
  searchTree,
} from "../controllers/user.controller.js";

const router = express.Router();

router.get("/post/myPosts", getMyPosts);
router.post("/post/create", postStory);
router.put("/post/edit/:id", editPost);
router.delete("/post/delete/:id", deletePost);
router.post("/post/remove/bulk", bulkDeletePost);
router.get("/search/tree", searchTree);
router.get("/search/person", searchPerson);
router.get("/fetch/blogs", getBlogs);

export default router;
