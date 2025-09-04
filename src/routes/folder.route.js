import express from "express";
import {
  getFolderData,
  addPosts,
  createFolder,
  getMyFolders,
  removeFolder,
  updateFolder,
  removeFiles,
  createInFolder,
  getAllFolders,
  linkMember,
  createPrivateNestedFolder,
  getPrivateFolderRootData,
  createPrivatePosts,
  getPrivateFolderData,
  removePrivateFolder,
  updatePrivateFolder,
  uploadPrivateTextFile,
  removePrivatePost,
  editPrivatePost,
  privateFolderDetails,
  publicFolderDetails,
  editPublicPost,
  deletePost,
} from "../controllers/folder.controller.js";

const router = express.Router();

router.post("/create", createFolder);
router.get("/myFolders", getMyFolders);
router.get("/allFolders", getAllFolders);
router.put("/updateFolder", updateFolder);
router.post("/addPosts", addPosts);
router.get("/getData", getFolderData);
router.get("/getDetails", publicFolderDetails);
router.delete("/removeFolder", removeFolder);
router.put("/updatePost", editPublicPost);
router.patch("/removefiles", removeFiles);
router.post("/createInFolder", createInFolder);
router.delete("/remove/file", deletePost);
router.post("/linkMembers", linkMember);

router.post("/private/create/folder", createPrivateNestedFolder);
router.get("/private/getRoot", getPrivateFolderRootData);
router.delete("/private/folder/remove", removePrivateFolder);
router.put("/private/folder/update", updatePrivateFolder);
router.post("/private/post", createPrivatePosts);
router.get("/private/folderData", getPrivateFolderData);
router.post("/private/post/text", uploadPrivateTextFile);
router.delete("/private/post/remove", removePrivatePost);
router.put("/private/post/textEdit", uploadPrivateTextFile);
router.put("/private/post/edit", editPrivatePost);
router.get("/private/folder/details", privateFolderDetails);
export default router;
