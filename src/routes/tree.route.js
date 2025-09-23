import express from "express";
import {
  createPerson,
  getRelatedPerson,
  getTree,
  matchPerson,
  personUpdateRequest,
  getFullFamilyTree,
} from "../controllers/tree.controller.js";

const router = express.Router();

router.get("/matchPerson", matchPerson);
router.get("/getRelatedPerson", getRelatedPerson);
router.get("/getMyTree", getTree);
router.put("/person/updateWithProof", personUpdateRequest);
router.post("/person/create", createPerson);
router.get("/getTree", getFullFamilyTree);

export default router;
