import express from "express";
import {
  addMemberToExistingTree,
  createAndAddPerson,
  createEmptyTree,
  createMatchBuildAndMerge,
  createPerson,
  createTreeWithFamily,
  editPerson,
  editTreeDetails,
  getAllRecomendedTrees,
  getFullTree,
  getFullTreeUser,
  getMatchForPerson,
  getTreeDetails,
  matchPerson,
  personUpdateRequest,
  removePerson,
} from "../controllers/tree.controller.js";

const router = express.Router();

router.post("/createEmptyTree", createEmptyTree);
router.put("/update", editTreeDetails);
router.put("/update/person", editPerson);
router.post("/createAndAddPerson", createAndAddPerson);
router.delete("/remove/person", removePerson);
router.get("/getFullTree", getFullTree);
router.post("/createTreeWithFamily", createTreeWithFamily);
router.get("/getFullTreeUser", getFullTreeUser);
router.get("/getMyTreeData", getTreeDetails);
router.post("/recomended", getAllRecomendedTrees);
router.post("/addMember", addMemberToExistingTree);
router.post("/createTree", createMatchBuildAndMerge);
router.get("/matchPerson", matchPerson);
router.get("/getMatchFromSelectedUser", getMatchForPerson);
router.post("/person/create", createPerson);
router.put("/person/updateWithProof", personUpdateRequest);

export default router;
