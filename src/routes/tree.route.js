import express from "express";
import {
  createPerson,
  getRelatedPerson,
  matchPerson,
  personUpdateRequest,
  getFullFamilyTree,
  unlockTree,
  getAccessedTree,
} from "../controllers/tree.controller.js";

const router = express.Router();

router.get("/matchPerson", matchPerson);
router.get("/getRelatedPerson", getRelatedPerson);
router.put("/person/updateWithProof", personUpdateRequest);
router.post("/person/create", createPerson);
router.get("/getTree", getFullFamilyTree);
router.post("/unlock", unlockTree);
router.get("/unlocked", getAccessedTree);

export default router;
