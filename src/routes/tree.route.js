import express from "express";
import {
  createPerson,
  getRelatedPerson,
  matchPerson,
  personUpdateRequest,
  getFullFamilyTree,
  unlockTree,
  getAccessedTree,
  buildTree,
  getMyFamilyTree,
  addPerson,
} from "../controllers/tree.controller.js";

const router = express.Router();

router.get("/matchPerson", matchPerson);
router.get("/getRelatedPerson", getRelatedPerson);
router.put("/person/updateWithProof", personUpdateRequest);
router.post("/person/create", createPerson);
router.get("/getTree", getFullFamilyTree);
router.get("/myTree", getMyFamilyTree);
router.post("/unlock", unlockTree);
router.post("/build", buildTree);
router.get("/unlocked", getAccessedTree);
router.post("/addPerson", addPerson);

export default router;
