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
  getPrivateFolderData
} from "../controllers/folder.controller.js";

const router = express.Router();

router.post("/create", createFolder);
router.get("/myFolders", getMyFolders);
router.get("/allFolders", getAllFolders);
router.put("/updateFolder", updateFolder);
router.post("/addPosts", addPosts);
router.get("/data", getFolderData);
router.delete("/removeFolder", removeFolder);
router.patch("/removefiles", removeFiles);
router.post("/createInFolder", createInFolder);
router.post("/linkMembers", linkMember);

router.post("/private/create/folder",createPrivateNestedFolder);
router.get("/private/getRoot",getPrivateFolderRootData);
router.post("/private/post",createPrivatePosts);
router.get("/private/folderData",getPrivateFolderData)
export default router;
