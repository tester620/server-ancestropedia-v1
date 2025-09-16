import mongoose from "mongoose";
import logger from "../config/logger.js";
import Person from "../models/person.model.js";
import Tree from "../models/tree.model.js";
import Relation from "../models/relations.model.js";
import { imagekit } from "../config/imagekit.js";
import { redis } from "../config/redis.js";
import { createSpouseRelation } from "./relations.controler.js";
import User from "../models/user.model.js";
import UpdateRequest from "../models/update.request.model.js";

export const createEmptyTree = async (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ message: "Tree name is required" });
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return res.status(400).json({ message: "Tree name cannot be empty" });
  }

  if (trimmedName.length < 2 || trimmedName.length > 20) {
    return res.status(400).json({
      message: "Tree name must be between 2 and 20 characters",
    });
  }

  try {
    const newTree = new Tree({
      name: trimmedName,
      owner: req.user._id,
      members: [],
    });

    await newTree.save();
    return res.status(201).json({
      message: "Tree created successfully",
      data: newTree,
    });
  } catch (error) {
    logger.error("Error creating empty tree", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const createAndAddPerson = async (req, res) => {
  const {
    firstName,
    lastName,
    profession,
    relationStartDate,
    dob,
    dod,
    gender,
    living,
    treeId,
    relatedTo,
    relatedFrom,
    relatedType,
  } = req.body;

  // Validate inputs
  if (!treeId || !mongoose.Types.ObjectId.isValid(treeId)) {
    return res.status(400).json({ message: "Valid tree ID is required" });
  }

  if (!relatedTo && !relatedFrom) {
    return res.status(400).json({
      message: "Either relatedTo or relatedFrom is required",
    });
  }

  if (!profession) {
    return res.status(400).json({
      message: "Profession is requried",
    });
  }
  if (!["father", "mother", "spouse"].includes(relatedType)) {
    return res.status(400).json({ message: "Invalid relation type" });
  }
  if (relatedType === "spouse" && !relationStartDate) {
    return res.status(400).json({
      message: "Relation date cannot be empty",
    });
  }
  if (relatedType === "spouse") {
    await createSpouseRelation({
      husbandId: "",
      wifeId: "",
      date: relationStartDate,
    });
  }

  if (!firstName || !lastName || !dob || living === undefined) {
    return res.status(400).json({ message: "Required fields are missing" });
  }

  if (!["male", "female", "other"].includes(gender)) {
    return res.status(400).json({ message: "Invalid gender" });
  }

  if (dod && living) {
    return res.status(400).json({
      message: "Cannot have date of death while marked as living",
    });
  }

  try {
    const tree = await Tree.findById(treeId);
    if (!tree) {
      return res.status(404).json({ message: "Tree not found" });
    }

    if (
      tree.owner.toString() !== req.user._id.toString() ||
      !tree.member.includes(req.user._id)
    ) {
      return res.status(403).json({
        message: "Only tree owner and member can add new members",
      });
    }

    const newPerson = new Person({
      firstName: firstName.trim().toLowerCase(),
      lastName: lastName.trim().toLowerCase(),
      profession: profession.trim().toLowerCase(),
      dob,
      dod: living ? null : dod,
      gender: gender.trim().toLowerCase(),
      living,
      creatorId: req.user._id,
      treeId,
    });

    await newPerson.save();

    tree.members.push(newPerson._id);
    await tree.save();

    const newRelation = new Relation({
      to: relatedTo || newPerson._id,
      from: relatedFrom || newPerson._id,
      type: relatedType,
      treeId,
    });

    await newRelation.save();
    const cacheKey = `fullTree:${treeId}`;

    await redis.DEL(cacheKey);

    return res.status(201).json({
      message: "Person added successfully",
      data: {
        person: newPerson,
        relation: newRelation,
      },
    });
  } catch (error) {
    logger.error("Error adding person", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const removePerson = async (req, res) => {
  const { personId, treeId, force = false } = req.body;

  if (!personId || !treeId) {
    return res
      .status(400)
      .json({ message: "Person ID and Tree ID are required" });
  }

  if (
    !mongoose.Types.ObjectId.isValid(personId) ||
    !mongoose.Types.ObjectId.isValid(treeId)
  ) {
    return res.status(400).json({ message: "Invalid IDs provided" });
  }

  try {
    const person = await Person.findById(personId);
    if (!person) return res.status(404).json({ message: "Person not found" });

    const tree = await Tree.findById(treeId);
    if (!tree) return res.status(404).json({ message: "Tree not found" });

    if (!tree.members.includes(personId)) {
      return res.status(400).json({ message: "Person not in specified tree" });
    }

    // Fetch all relationships involving this person
    const relationships = await Relation.find({
      $or: [{ from: personId }, { to: personId }],
      treeId,
    });

    if (relationships.length > 0 && !force) {
      // Warn user with relationship details before deleting
      return res.status(400).json({
        message:
          "Person has existing relationships. Confirm deletion with 'force: true'.",
        relationships: relationships.map((rel) => ({
          id: rel._id,
          from: rel.from,
          to: rel.to,
          type: rel.relationType,
        })),
      });
    }

    // Optional: Detect circular relationships (basic check)
    const involvedInCycle = await Relation.exists({
      from: personId,
      to: personId,
      treeId,
    });

    if (involvedInCycle && !force) {
      return res.status(400).json({
        message:
          "Circular relationship detected. Deletion aborted. Use 'force: true' to proceed.",
      });
    }

    // Remove person from tree members
    tree.members = tree.members.filter((id) => id.toString() !== personId);
    await tree.save();

    // Delete all relationships
    await Relation.deleteMany({
      $or: [{ from: personId }, { to: personId }],
      treeId,
    });

    // Delete person
    await Person.findByIdAndDelete(personId);

    return res
      .status(200)
      .json({ message: "Person and relationships removed successfully." });
  } catch (error) {
    logger.error("Error removing person", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const editPerson = async (req, res) => {
  const {
    personId,
    newFirstName,
    newLastName,
    newGender,
    newDob,
    newLiving,
    newProfileImage,
  } = req.body;

  // Validate input
  if (!personId || !mongoose.Types.ObjectId.isValid(personId)) {
    return res.status(400).json({ message: "Valid person ID required" });
  }

  const hasUpdates =
    newFirstName ||
    newLastName ||
    newGender ||
    newDob ||
    newLiving !== undefined ||
    newProfileImage;

  if (!hasUpdates) {
    return res.status(400).json({ message: "No update data provided" });
  }

  try {
    // Find and validate person
    const person = await Person.findById(personId);
    if (!person) {
      return res.status(404).json({ message: "Person not found" });
    }

    // Check authorization
    if (person.creatorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Only creator can edit this person",
      });
    }

    // Apply updates
    if (newFirstName) person.firstName = newFirstName.trim().toLowerCase();
    if (newLastName) person.lastName = newLastName.trim().toLowerCase();
    if (newGender) person.gender = newGender.toLowerCase();
    if (newDob) person.dob = newDob;

    if (newLiving !== undefined) {
      person.living = newLiving;
      if (newLiving) person.dod = null;
    }

    if (newProfileImage) {
      try {
        const uploadRes = await imagekit.upload({
          file: newProfileImage,
          fileName: `${person.firstName}_profile.jpg`,
          folder: "/family-tree-profiles",
        });
        person.profileImage = uploadRes.url;
      } catch (uploadError) {
        logger.error("Image upload failed", uploadError);
        return res.status(500).json({ message: "Profile image update failed" });
      }
    }

    person.updatedAt = Date.now();
    await person.save();

    return res.status(200).json({
      message: "Person updated successfully",
      data: person,
    });
  } catch (error) {
    logger.error("Error editing person", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const editTreeDetails = async (req, res) => {
  const { newName, treeId } = req.body;

  if (!newName || typeof newName !== "string") {
    return res.status(400).json({ message: "Valid name is required" });
  }

  const trimmedName = newName.trim();
  if (!trimmedName) {
    return res.status(400).json({ message: "Tree name cannot be empty" });
  }

  if (trimmedName.length < 2 || trimmedName.length > 20) {
    return res.status(400).json({
      message: "Tree name must be between 2 and 20 characters",
    });
  }

  if (!treeId || !mongoose.Types.ObjectId.isValid(treeId)) {
    return res.status(400).json({ message: "Valid tree ID required" });
  }

  try {
    // Find and update tree
    const tree = await Tree.findByIdAndUpdate(
      treeId,
      { name: trimmedName },
      { new: true }
    );

    if (!tree) {
      return res.status(404).json({ message: "Tree not found" });
    }

    return res.status(200).json({
      message: "Tree updated successfully",
      data: tree,
    });
  } catch (error) {
    logger.error("Error editing tree", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getFullTree = async (req, res) => {
  const { treeId } = req.query;

  if (!treeId) {
    return res.status(400).json({ message: "Tree ID required" });
  }

  try {
    const cacheKey = `fullTree:${treeId}`;
    const cachedTree = await redis.get(cacheKey);

    if (cachedTree) {
      return res.status(200).json({
        message: "Tree retrieved successfully (cached)",
        data: JSON.parse(cachedTree),
      });
    }

    const tree = await Tree.findById(treeId).populate({
      path: "members",
      model: "Person",
      select: "id firstName lastName dob dod living profileImage gender",
    });

    if (!tree) {
      return res.status(404).json({ message: "Tree not found" });
    }
    const relations = await Relation.find({ treeId });

    const treeData = {
      ...tree.toObject(),
      relations,
    };

    await redis.set(cacheKey, JSON.stringify(treeData), "EX", 3600);

    return res.status(200).json({
      message: "Tree retrieved successfully",
      data: treeData,
    });
  } catch (error) {
    console.error("Error fetching tree", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getMatch = async (req, res) => {
  const { persons } = req.body;
  try {
    if (!persons || !persons.length) {
      return res.status(400).json({
        message: "Person are required",
      });
    }

    const filters = person.map((p) => ({
      firstName: p.firstName.trim(),
      lastName: p.lastName.trim(),
      dob: new Date(p.dob),
    }));

    const matchedPersons = await Person.find({
      $or: filters,
    }).populate("treeId");
    if (!matchedPersons || !matchedPersons.length) {
      return res.status(404).json({
        message: "No related person/tree found",
      });
    }
    return res.status(200).json({
      message: "Tree fetched succesfully",
      data: matchedPersons,
    });
  } catch (error) {
    logger.error("Error in getting related tree", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const createTreeWithFamily = async (req, res) => {
  const { members, treeId } = req.body;

  const allPersons = Object.values(members).filter(Boolean);

  const personQueries = allPersons.map((person) => ({
    firstName: person.firstName.trim(),
    lastName: person.lastName.trim(),
    dob: new Date(person.dob),
    profession: person.profession.trim(),
  }));

  const existing = await Person.findOne({ $or: personQueries }).populate(
    "treeId"
  );

  if (existing && existing.treeId) {
    return res.status(200).json({
      message: "Person already exists, using existing tree",
      data: existing,
    });
  }

  if (!treeId || !mongoose.Types.ObjectId.isValid(treeId)) {
    return res.status(400).json({ message: "Valid tree ID is required" });
  }

  const tree = await Tree.findById(treeId);
  if (!tree) {
    return res.status(404).json({ message: "Tree not found" });
  }

  if (tree.owner.toString() !== req.user._id.toString()) {
    return res
      .status(403)
      .json({ message: "Only tree owner can create family" });
  }

  try {
    const created = {};
    const createPerson = async (data) => {
      const person = new Person({
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        gender: data.gender,
        dob: data.dob,
        dod: data.living ? null : data.dod,
        living: data.living,
        profession: data.profession,
        creatorId: req.user._id,
        treeId,
      });
      await person.save();
      tree.members.push(person._id);
      return person;
    };

    if (members.self) created.self = await createPerson(members.self);
    if (members.father) created.father = await createPerson(members.father);
    if (members.mother) created.mother = await createPerson(members.mother);
    if (members.maternalGrandFather)
      created.maternalGrandFather = await createPerson(
        members.maternalGrandFather
      );
    if (members.maternalGrandMother)
      created.maternalGrandMother = await createPerson(
        members.maternalGrandMother
      );
    if (members.paternalGrandFather)
      created.paternalGrandFather = await createPerson(
        members.paternalGrandFather
      );
    if (members.paternalGrandMother)
      created.paternalGrandMother = await createPerson(
        members.paternalGrandMother
      );

    const createRelation = async (from, to, type) => {
      const relation = new Relation({
        from: from._id,
        to: to._id,
        type,
        treeId,
      });
      await relation.save();
    };

    if (created.father)
      await createRelation(created.father, created.self, "father");
    if (created.mother)
      await createRelation(created.mother, created.self, "mother");
    if (created.father && created.mother) {
      await createRelation(created.father, created.mother, "spouse");
      await createSpouseRelation({
        husbandId: created.father._id,
        wifeId: created.mother._id,
        date: members.self?.relationStartDate || null,
      });
    }

    if (created.maternalGrandFather && created.mother) {
      await createRelation(
        created.maternalGrandFather,
        created.mother,
        "father"
      );
    }

    if (created.maternalGrandMother && created.mother) {
      await createRelation(
        created.maternalGrandMother,
        created.mother,
        "mother"
      );
    }

    if (created.maternalGrandFather && created.maternalGrandMother) {
      await createRelation(
        created.maternalGrandFather,
        created.maternalGrandMother,
        "spouse"
      );
      await createSpouseRelation({
        husbandId: created.maternalGrandFather._id,
        wifeId: created.maternalGrandMother._id,
        date: null,
      });
    }

    if (created.paternalGrandFather && created.father) {
      await createRelation(
        created.paternalGrandFather,
        created.father,
        "father"
      );
    }

    if (created.paternalGrandMother && created.father) {
      await createRelation(
        created.paternalGrandMother,
        created.father,
        "mother"
      );
    }

    if (created.paternalGrandFather && created.paternalGrandMother) {
      await createRelation(
        created.paternalGrandFather,
        created.paternalGrandMother,
        "spouse"
      );
      await createSpouseRelation({
        husbandId: created.paternalGrandFather._id,
        wifeId: created.paternalGrandMother._id,
        date: null,
      });
    }

    await tree.save();
    await redis.DEL(`fullTree:${treeId}`);

    return res.status(201).json({
      message: "Family created successfully",
      data: created,
    });
  } catch (error) {
    logger.error("Error in createTreeWithFamily", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getAllRecomendedTrees = async (req, res) => {
  try {
    const allTrees = Tree.find({ $ne: req.user.treeId });
    if (!allTrees || !allTrees.length) {
      return res.status(400).json({
        message: "No trees found yet",
      });
    }
    return res.status(200).json({
      message: "Trees fetched successfully",
      data: allTrees,
    });
  } catch (error) {
    logger.error("Error in getting recomended trees", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const getFullTreeUser = async (req, res) => {
  const { treeId } = req.query;
  const user = req.user;

  if (!treeId) {
    return res.status(400).json({ message: "Tree ID required" });
  }

  if (!user.tokens) {
    return res.status(400).json({
      message: "Please get some tokens to view someone's tree",
    });
  }

  try {
    const cacheKey = `fullTree:${treeId}`;
    const cachedTree = await redis.get(cacheKey);

    if (cachedTree) {
      user.tokens = user.tokens - 1;
      await user.save();
      return res.status(200).json({
        message: "Tree retrieved successfully (cached)",
        data: JSON.parse(cachedTree),
      });
    }

    const tree = await Tree.findById(treeId).populate({
      path: "members",
      model: "Person",
      select: "id firstName lastName dob dod living profileImage gender",
    });

    if (!tree) {
      return res.status(404).json({ message: "Tree not found" });
    }
    const relations = await Relation.find({ treeId });

    const treeData = {
      ...tree.toObject(),
      relations,
    };

    await redis.set(cacheKey, JSON.stringify(treeData), "EX", 3600);
    user.tokens = user.tokens - 1;
    await user.save();

    return res.status(200).json({
      message: "Tree retrieved successfully",
      data: treeData,
    });
  } catch (error) {
    console.error("Error fetching tree", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getPersonDetails = async (req, res) => {
  const { personId } = req.query;
  try {
    if (!personId || !mongoose.isValidObjectId(personId)) {
      return res.status(400).json({
        message: "Valid person id is required",
      });
    }
    if (!req.user.tokens) {
      return res.status(401).json({
        message: "Please get some tokens",
      });
    }
    const person = await Person.findById(personId);
    if (!person) {
      return res.status(404).json({
        message: "Internal Server Error",
      });
    }
    return res.status(200).json({
      message: "Person fetched successfully",
      data: person,
    });
  } catch (error) {
    logger.error("Error in fetching person details", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const getTreeDetails = async (req, res) => {
  const { treeId } = req.user;
  try {
    const tree = await Tree.findById(treeId).populate("members");
    const relations = await Relation.find({ treeId });

    if (!tree) {
      return res.status(400).json({ message: "Tree not found" });
    }
    return res
      .status(200)
      .json({ message: "Tree fetched", data: { tree, relations } });
  } catch (error) {
    logger.error("Error in getting my tree details", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

export const searchTree = async (req, res) => {
  const { name, surname, ageRange, profession, region } = req.body;
  if (!name && !surname && !ageRange && !profession && !region) {
    return res.status(400).json({ message: "At least one field is required" });
  }

  let dobYearRange;
  if (ageRange) {
    dobYearRange = {
      start: new Date().getFullYear() - ageRange.start,
      end: new Date().getFullYear() - ageRange.end,
    };
  }

  try {
    const query = {};
    if (name) query.name = name.trim();
    if (surname) query.surname = surname.trim();
    if (dobYearRange) {
      query.dob = {
        $gte: new Date(`${dobYearRange.end}-01-01`),
        $lte: new Date(`${dobYearRange.start}-12-31`),
      };
    }
    if (profession) query.profession = profession;
    if (region) query.location = region;

    const person = await Person.findOne(query).populate("treeId");
    if (!person) {
      return res.status(404).json({ message: "Not found" });
    }

    return res.status(200).json({
      message: "Tree fetched",
      data: {
        tree: person.treeId,
        mainId: person._id,
        ref: person.firstName,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

export const addMemberToExistingTree = async (req, res) => {
  const { userId, treeId, relatedFrom, type } = req.body;
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({
      message: "Valid User Id is required",
    });
  }
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      message: "USer not found",
    });
  }
  if (user.treeId !== null) {
    return res.status(400).json({
      message: "User already in a family group",
    });
  }

  try {
    const tree = await Tree.findById(treeId);
    if (!tree) {
      return res.status(400).json({
        message: "Tree not found",
      });
    }
    if (tree.members.includes(user._id)) {
      return res.status(400).json({
        message: "User already added in tree",
      });
    }
    user.treeId = treeId;
    tree.members.push(user._id);
    const newRelation = new Relation({
      treeId,
      from: relatedFrom,
      to: user._id,
      type,
    });
    await newRelation.save();
    await user.save();
    await Tree.save();

    return res.status(200).json({
      message: "User added to tree succesfully",
      data: {
        tree,
        newRelation,
      },
    });
  } catch (error) {
    logger.error("Error in adding userr to the existing tree", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const createMatchBuildAndMerge = async (req, res) => {
  const {
    spouseDetails = {},
    personalDetails = {},
    fatherDetails = {},
    motherDetails = {},
    maritalData = {},
    siblingsData = {},
    kidsDetails = [],
    siblingsDetails = [],
  } = req.body;

  console.log(req.body);

  try {
    const validatePerson = (person, required = true) => {
      if (!person || typeof person !== "object") return !required;
      const {
        firstName = "",
        lastName = "",
        occupation = "",
        gender = "",
        birthDate = "",
        toDate = "",
        placeOfBirth = "",
        birthPin = "",
        residence = "",
        residencePin = "",
      } = person;
      if (required) {
        return (
          firstName.trim() &&
          lastName.trim() &&
          gender.trim() &&
          birthDate.trim() &&
          toDate.trim() &&
          placeOfBirth.trim() &&
          birthPin.trim() &&
          occupation.trim() &&
          residence.trim() &&
          residencePin.trim()
        );
      }
      return true;
    };

    if (!validatePerson(personalDetails)) {
      return res.status(400).json({ error: "Invalid personal details" });
    }

    if (!validatePerson(fatherDetails)) {
      return res.status(400).json({ error: "Invalid father details" });
    }

    if (!validatePerson(motherDetails)) {
      return res.status(400).json({ error: "Invalid mother details" });
    }

    if (maritalData.status) {
      if (typeof maritalData.status !== "string") {
        return res.status(400).json({ error: "Invalid marital status" });
      }
      if (
        maritalData.haveKids.toLowerCase() === "yes" &&
        typeof maritalData.totalKids !== "number"
      ) {
        return res.status(400).json({ error: "Invalid kids count" });
      }
    }

    if (
      siblingsData.haveSiblings.toLowerCase() === "yes" &&
      typeof siblingsData.totalSiblings !== "number"
    ) {
      return res.status(400).json({ error: "Invalid siblings count" });
    }

    if (Array.isArray(kidsDetails)) {
      for (const kid of kidsDetails) {
        if (!validatePerson(kid)) {
          return res.status(400).json({ error: "Invalid kid details" });
        }
      }
    }

    if (Array.isArray(siblingsDetails)) {
      for (const sib of siblingsDetails) {
        if (!validatePerson(sib)) {
          return res.status(400).json({ error: "Invalid sibling details" });
        }
      }
    }

    if (Object.keys(spouseDetails).length > 0) {
      if (!validatePerson(spouseDetails, false)) {
        return res.status(400).json({ error: "Invalid spouse details" });
      }
    }

    return res.status(200).json({ message: "Validation successful" });
  } catch (error) {
    logger.error("Error in creating tree", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const createPerson = async (req, res) => {
  const data = req.body;

  if (!data || typeof data !== "object") {
    return res.status(400).json({ message: "Invalid data format" });
  }

  try {
    const personData = {
      ...data,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      toDate:
        data.toDate && data.toDate.toLowerCase() !== "present"
          ? new Date(data.toDate)
          : null,
      birthPin: data.birthPin ? Number(data.birthPin) : null,
      residencePin: data.residencePin ? Number(data.residencePin) : null,
      living: data.toDate && data.toDate.toLowerCase() === "present",
    };

    const newPerson = new Person(personData);
    const savedPerson = await newPerson.save();

    return res
      .status(201)
      .json({ message: "Person created successfully", data: savedPerson });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

export const getMatchForPerson = async (req, res) => {
  const { relation, userId, fatherId, motherId } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = 6;
  const skip = (page - 1) * limit;

  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: "Invalid User Id" });
  }

  try {
    const allowedRelations = ["father", "mother", "spouse", "siblings", "kids"];
    if (!allowedRelations.includes(relation.toLowerCase())) {
      return res.status(400).json({ message: "Invalid relation type" });
    }

    let result;

    if (relation.toLowerCase() === "siblings") {
      result = await Relation.find({
        from: fatherId || motherId,
        type: fatherId ? "father" : "mother",
      })
        .populate("to")
        .skip(skip)
        .limit(limit);
    } else if (relation.toLowerCase() === "kids") {
      result = await Relation.find({
        from: userId,
        type: { $in: ["father", "mother"] },
      })
        .populate("to")
        .skip(skip)
        .limit(limit);
    } else if (relation.toLowerCase() === "spouse") {
      result = await Relation.find({
        $or: [{ from: userId }, { to: userId }],
        type: "spouse",
      })
        .skip(skip)
        .limit(limit);

      result = await Promise.all(
        result.map(async (rel) => {
          if (rel.from.toString() === userId.toString()) {
            return await rel.populate("to");
          } else {
            return await rel.populate("from");
          }
        })
      );
    } else {
      result = await Relation.find({
        to: userId,
        type: relation.toLowerCase(),
      })
        .populate("from")
        .skip(skip)
        .limit(limit);
    }

    return res.status(200).json({ data: result, page, limit });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server Error", error: error.message });
  }
};

export const matchPerson = async (req, res) => {
  try {
    const input = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;

    const pipeline = [];

    if (input.firstName || input.lastName) {
      pipeline.push({
        $match: {
          $expr: {
            $regexMatch: {
              input: { $concat: ["$firstName", " ", "$lastName"] },
              regex: `${input.firstName || ""}.*${input.lastName || ""}`,
              options: "i",
            },
          },
        },
      });
    }

    pipeline.push({
      $addFields: {
        birthDateParsed: {
          $cond: [
            { $ifNull: ["$birthDate", false] },
            { $toDate: "$birthDate" },
            null,
          ],
        },
        toDateParsed: {
          $cond: [
            { $ifNull: ["$toDate", false] },
            { $toDate: "$toDate" },
            null,
          ],
        },
      },
    });

    const scoreConditions = {};

    if (input.firstName || input.lastName) {
      scoreConditions.name = {
        $cond: [
          {
            $or: [
              { $eq: ["$firstName", input.firstName || null] },
              { $eq: ["$lastName", input.lastName || null] },
            ],
          },
          30,
          15,
        ],
      };
    }

    if (input.residencePin) {
      scoreConditions.residencePin = {
        $cond: [
          { $eq: ["$residencePin", parseInt(input.residencePin)] },
          25,
          0,
        ],
      };
    }

    if (input.birthDate) {
      const dob = new Date(input.birthDate);
      const dobMinus2 = new Date(
        dob.getFullYear() - 2,
        dob.getMonth(),
        dob.getDate()
      );
      const dobPlus2 = new Date(
        dob.getFullYear() + 2,
        dob.getMonth(),
        dob.getDate()
      );

      scoreConditions.birthDate = {
        $cond: [
          { $eq: ["$birthDateParsed", dob] },
          20,
          {
            $cond: [
              {
                $and: [
                  { $gte: ["$birthDateParsed", dobMinus2] },
                  { $lte: ["$birthDateParsed", dobPlus2] },
                ],
              },
              10,
              0,
            ],
          },
        ],
      };
    }

    if (input.gender) {
      scoreConditions.gender = {
        $cond: [
          { $eq: [{ $toLower: "$gender" }, input.gender.toLowerCase()] },
          5,
          0,
        ],
      };
    }

    if (input.occupation) {
      scoreConditions.occupation = {
        $cond: [
          { $eq: ["$occupation", input.occupation] },
          5,
          {
            $cond: [
              {
                $regexMatch: {
                  input: "$occupation",
                  regex: input.occupation,
                  options: "i",
                },
              },
              2,
              0,
            ],
          },
        ],
      };
    }

    if (input.toDate) {
      if (input.toDate.toLowerCase() === "present") {
        scoreConditions.living = {
          $cond: [{ $eq: ["$living", true] }, 5, 0],
        };
      } else {
        const dodCheck = new Date(input.toDate);
        scoreConditions.toDate = {
          $cond: [
            { $eq: ["$toDateParsed", dodCheck] },
            5,
            {
              $cond: [
                {
                  $and: [
                    {
                      $gte: [
                        "$toDateParsed",
                        new Date(dodCheck.getFullYear() - 2, 0, 1),
                      ],
                    },
                    {
                      $lte: [
                        "$toDateParsed",
                        new Date(dodCheck.getFullYear() + 2, 11, 31),
                      ],
                    },
                  ],
                },
                3,
                0,
              ],
            },
          ],
        };
      }
    }

    if (input.residenceCity || input.residenceState || input.residenceCountry) {
      scoreConditions.residence = {
        $cond: [
          {
            $or: [
              { $eq: ["$residenceCity", input.residenceCity || null] },
              { $eq: ["$residenceState", input.residenceState || null] },
              { $eq: ["$residenceCountry", input.residenceCountry || null] },
            ],
          },
          2,
          0,
        ],
      };
    }

    pipeline.push({
      $addFields: { scoreBreakdown: scoreConditions },
    });

    pipeline.push({
      $addFields: {
        score: { $sum: Object.values(scoreConditions) },
      },
    });

    pipeline.push({ $sort: { score: -1 } });

    pipeline.push({
      $facet: {
        metadata: [{ $count: "totalDocs" }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    });

    pipeline.push({
      $addFields: {
        totalDocs: { $arrayElemAt: ["$metadata.totalDocs", 0] },
      },
    });

    pipeline.push({
      $addFields: {
        totalPages: { $ceil: { $divide: ["$totalDocs", limit] } },
      },
    });

    const result = await Person.aggregate(pipeline);

    const data =
      result[0]?.data?.map((doc) => ({
        ...doc,
        scorePercent: (doc.score / 95) * 100,
      })) || [];

    return res.status(200).json({
      message: "Data fetched successfully",
      data,
      page,
      limit,
      totalDocs: result[0]?.totalDocs || 0,
      totalPages: result[0]?.totalPages || 0,
      hasNextPage: page < (result[0]?.totalPages || 0),
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const personUpdateRequest = async (req, res) => {
  const { updatedData } = req.body;

  if (!updatedData) {
    return res.status(400).json({ message: "Please send updated data" });
  }
  if (!updatedData.userId || !mongoose.isValidObjectId(updatedData.userId)) {
    return res.status(400).json({ message: "Please send a valid person id" });
  }
  if (!updatedData.proof) {
    return res
      .status(400)
      .json({ message: "Proof is required to request change" });
  }

  try {
    const person = await Person.findById(updatedData.userId);
    if (!person) {
      return res.status(404).json({ message: "Person not found" });
    }

    const allowedFields = [
      "firstName",
      "lastName",
      "fullName",
      "birthDate",
      "toDate",
      "birthCity",
      "birthState",
      "birthCountry",
      "residenceCity",
      "residenceState",
      "residenceCountry",
      "occupation",
      "gender",
      "living",
      "profileImage",
    ];

    const { userId: personId, proof, ...rest } = updatedData;
    const filteredUpdates = Object.fromEntries(
      Object.entries(rest).filter(([key]) => allowedFields.includes(key))
    );

    const prevData = [];
    const newData = [];

    for (const [key, value] of Object.entries(filteredUpdates)) {
      const prevValue = person[key] ?? null;
      if (prevValue !== value) {
        prevData.push({ [key]: prevValue });
        newData.push({ [key]: value });
      }
    }

    console.log(prevData),
    console.log(newData)

    const newRequest = await UpdateRequest({
      userId: req.user._id,
      personId,
      prevData,
      updatedData: newData,
      proof,
    });

    await newRequest.save();

    return res.status(201).json({
      message: "Person details request sent successfully",
      data: newRequest,
    });
  } catch (error) {
    logger.error(
      "Error in adding request for update person with proof",
      error?.message
    );
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error?.message });
  }
};
