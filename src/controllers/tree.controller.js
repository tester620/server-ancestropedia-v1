import mongoose from "mongoose";
import logger from "../config/logger.js";
import Person from "../models/person.model.js";
import { imagekit } from "../config/imagekit.js";
import { redis } from "../config/redis.js";
import UpdateRequest from "../models/update.request.model.js";
import TreeAccess from "../models/treeAccess.model.js";

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
            {
              $and: [
                { $ifNull: ["$toDate", false] },
                { $ne: [{ $toLower: "$toDate" }, "present"] },
              ],
            },
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
    logger.error(error?.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Get related persons (father, mother, siblings, kids, or spouses) of a given person
 * @route GET /api/tree/related
 * @group Tree
 * @param {string} userId.query.required - ID of the person whose related members are to be fetched
 * @param {string} relation.query.required - Type of relation to fetch (father, mother, siblings, kids, spouses)
 * @returns {object} 200 - Successfully fetched related persons
 * @returns {array<object>} 200.related - Array of related person objects
 * @returns {object} 400 - Invalid relation type
 * @returns {object} 404 - Person not found
 * @returns {object} 500 - Internal Server Error
 * @example request - Example query
 * /api/tree/related?userId=66f1a36b8b50c3c176d56b4e&relation=siblings
 * @example response - 200
 * {
 *   "related": [
 *     {
 *       "_id": "66f1a36b8b50c3c176d56b4f",
 *       "firstName": "Jane",
 *       "lastName": "Doe",
 *       "gender": "female",
 *       "birthDate": "1982-05-10",
 *       "residenceCity": "New York"
 *     }
 *   ]
 * }
 */

export const getRelatedPerson = async (req, res) => {
  const { userId: personId, relation } = req.query;

  try {
    const person = await Person.findById(personId);
    if (!person) return res.status(404).json({ message: "Person not found" });

    let relatedIds = [];

    if (relation === "father" || relation === "mother") {
      if (person[relation]) relatedIds.push(person[relation]);
    } else if (relation === "kids") {
      relatedIds = person.childrens || [];
    } else if (relation === "siblings") {
      let parentDoc = null;
      if (person.father) parentDoc = await Person.findById(person.father);
      else if (person.mother) parentDoc = await Person.findById(person.mother);
      logger.error(parentDoc);
      if (parentDoc) {
        const siblingsIds = (parentDoc.childrens || []).filter(
          (id) => id.toString() !== personId
        );
        relatedIds = siblingsIds;
      }
    } else if (relation === "spouses") {
      for (let i = 0; i < person.spouseCount; i++) {
        const spouseField = person.spouses[i];
        if (spouseField?.spouse) relatedIds.push(spouseField?.spouse);
      }
    } else {
      return res.status(400).json({ message: "Invalid relation type" });
    }
    const related = await Person.find({ _id: { $in: relatedIds } });

    res.json({ related });
  } catch (error) {
    logger.error("Error in getting related person", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Get the full family tree of a person, including parents, children, and spouses
 * @route GET /api/tree/full
 * @group Tree
 * @param {string} id.query.required - Root person ID for which the full family tree should be fetched
 * @returns {object} 200 - Family tree fetched successfully
 * @returns {object} 200.data.people - Flat map of all persons in the tree by ID
 * @returns {object} 200.data.tree - Minimal tree structure showing the root person’s father, mother, children, and spouses
 * @returns {object} 404 - Person not found
 * @returns {object} 500 - Internal Server Error
 * @example request - Example query
 * /api/tree/full?id=66f1a36b8b50c3c176d56b4e
 * @example response - 200
 * {
 *   "message": "Tree fetched successfully",
 *   "data": {
 *     "people": {
 *       "66f1a36b8b50c3c176d56b4e": {
 *         "_id": "66f1a36b8b50c3c176d56b4e",
 *         "firstName": "John",
 *         "lastName": "Doe",
 *         "father": "66f1a36b8b50c3c176d56b4f",
 *         "mother": "66f1a36b8b50c3c176d56b50",
 *         "childrens": ["66f1a36b8b50c3c176d56b51"],
 *         "spouses": ["66f1a36b8b50c3c176d56b52"]
 *       }
 *     },
 *     "tree": {
 *       "_id": "66f1a36b8b50c3c176d56b4e",
 *       "father": "66f1a36b8b50c3c176d56b4f",
 *       "mother": "66f1a36b8b50c3c176d56b50",
 *       "childrens": ["66f1a36b8b50c3c176d56b51"],
 *       "spouses": ["66f1a36b8b50c3c176d56b52"]
 *     }
 *   }
 * }
 */

export const getFullFamilyTree = async (req, res) => {
  try {
    const { id } = req.query;
    const visited = new Map();

    const populateFlat = async (personId) => {
      if (!personId) return;
      const key = personId.toString();
      if (visited.has(key)) return;

      const person = await Person.findById(personId)
        .lean()
        .select("-__v -createdAt -updatedAt");

      if (!person) return;
      visited.set(key, {
        ...person,
        father: person.father,
        mother: person.mother,
        childrens: person.childrens,
        spouses: person.spouses,
      });

      if (person.father) await populateFlat(person.father);
      if (person.mother) await populateFlat(person.mother);
      await Promise.all((person.childrens || []).map((c) => populateFlat(c)));
      await Promise.all(
        (person.spouses || []).map((s) => populateFlat(s?.spouse))
      );
    };

    await populateFlat(id);

    const people = Object.fromEntries(visited);
    const root = people[id];

    return res.status(200).json({
      message: "Tree fetched successfully",
      data: {
        people,
        tree: {
          _id: id,
          father: root?.father || null,
          mother: root?.mother || null,
          childrens: root?.childrens || [],
          spouses: (root?.spouses || []).map((s) => s?.spouse),
        },
      },
    });
  } catch (err) {
    logger.error("Error in getting full family tree", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * Submit a request to update details of a person
 * @route POST /api/tree/person-update-request
 * @group Tree
 * @param {object} updatedData.body.required - Updated person data with proof
 * @param {string} updatedData.userId.required - ID of the person to update
 * @param {string} updatedData.proof.required - Proof supporting the requested update
 * @param {string} [updatedData.firstName] - Updated first name
 * @param {string} [updatedData.lastName] - Updated last name
 * @param {string} [updatedData.fullName] - Updated full name
 * @param {string} [updatedData.birthDate] - Updated birth date
 * @param {string} [updatedData.toDate] - Updated date of death / toDate
 * @param {string} [updatedData.birthCity] - Updated birth city
 * @param {string} [updatedData.birthState] - Updated birth state
 * @param {string} [updatedData.birthCountry] - Updated birth country
 * @param {string} [updatedData.residenceCity] - Updated residence city
 * @param {string} [updatedData.residenceState] - Updated residence state
 * @param {string} [updatedData.residenceCountry] - Updated residence country
 * @param {string} [updatedData.occupation] - Updated occupation
 * @param {string} [updatedData.gender] - Updated gender
 * @param {boolean} [updatedData.living] - Updated living status
 * @param {string} [updatedData.profileImage] - Updated profile image URL
 * @returns {object} 201 - Person update request sent successfully
 * @returns {object} 400 - Bad request, missing required fields
 * @returns {object} 404 - Person not found
 * @returns {object} 500 - Internal Server Error
 * @example request - Example body
 * {
 *   "updatedData": {
 *     "userId": "66f1a36b8b50c3c176d56b4e",
 *     "firstName": "John",
 *     "proof": "https://example.com/proof.jpg"
 *   }
 * }
 */

export const personUpdateRequest = async (req, res) => {
  const { updatedData } = req.body;

  if (!updatedData) {
    return res.status(400).json({ message: "Please send updated data" });
  }
  if (!updatedData.userId) {
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

export const updateProfile = async (req, res) => {
  const { personId } = req.queery;
  try {
    const person = await Person.findById(personId);
  } catch (error) {}
};

/**
 * Create a new person record
 * @route POST /api/tree/create-person
 * @group Tree
 * @param {object} personData.body.required - Data of the new person to create
 * @param {string} personData.firstName.required - First name of the person
 * @param {string} [personData.lastName] - Last name of the person
 * @param {string} [personData.fullName] - Full name of the person
 * @param {string} [personData.birthDate] - Birth date
 * @param {string} [personData.toDate] - Date of death / toDate
 * @param {string} [personData.birthCity] - Birth city
 * @param {string} [personData.birthState] - Birth state
 * @param {string} [personData.birthCountry] - Birth country
 * @param {string} [personData.residenceCity] - Residence city
 * @param {string} [personData.residenceState] - Residence state
 * @param {string} [personData.residenceCountry] - Residence country
 * @param {string} [personData.occupation] - Occupation
 * @param {string} [personData.gender] - Gender
 * @param {boolean} [personData.living] - Living status
 * @param {string} [personData.profileImage] - Profile image URL
 * @returns {object} 201 - Person created successfully
 * @returns {object} 400 - First name is required
 * @returns {object} 500 - Internal Server Error
 * @example request - Example body
 * {
 *   "personData": {
 *     "firstName": "John",
 *     "lastName": "Doe",
 *     "birthDate": "1980-05-15",
 *     "residenceCity": "New York"
 *   }
 * }
 */

export const createPerson = async (req, res) => {
  const { personData } = req.body;
  try {
    if (!personData.firstName) {
      return res.status(400).json({ message: "First name is required" });
    }

    const newPerson = new Person(personData);
    await newPerson.save();

    return res.status(201).json({ data: newPerson });
  } catch (error) {
    logger.error("Error in creatong person", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Unlock a user's family tree for 30 days using tokens
 * @route POST /api/tree/unlock
 * @group Tree
 * @param {string} treeId.body.required - ID of the tree to unlock
 * @security BearerAuth
 * @returns {object} 200 - Tree unlocked or access renewed successfully
 * @returns {object} data - Access details of the unlocked tree
 * @returns {boolean} deducted - Whether tokens were deducted for this action
 * @returns {number} expiresAt - Expiration timestamp of the unlocked access
 * @returns {object} 400 - Not enough tokens to unlock the tree
 * @returns {object} 500 - Internal Server Error
 * @example request - Example body
 * {
 *   "treeId": "66f1a36b8b50c3c176d56b4e"
 * }
 * @example response - Successful unlock
 * {
 *   "message": "Tree unlocked",
 *   "data": {
 *     "_id": "66f1a36b8b50c3c176d56b4f",
 *     "userId": "66f1a36b8b50c3c176d56b4d",
 *     "treeId": "66f1a36b8b50c3c176d56b4e",
 *     "grantedAt": "2025-10-09T05:00:00.000Z",
 *     "expiresAt": "2025-11-08T05:00:00.000Z"
 *   },
 *   "deducted": true
 * }
 */

export const unlockTree = async (req, res) => {
  const { treeId } = req.body;
  const user = req.user;

  try {
    if (user.allotedTokens - user.tokens < 10) {
      return res.status(400).json({ message: "Not enough tokens" });
    }

    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    let access = await TreeAccess.findOne({
      userId: user._id,
      treeId,
    }).populate("treeId");

    if (access) {
      if (access.expiresAt > now) {
        return res.status(200).json({
          message: "Already unlocked",
          expiresAt: access.expiresAt,
          deducted: false,
          data: access,
        });
      }
      access.expiresAt = new Date(now + thirtyDays);
      user.tokens += 10;
      await Promise.all([user.save(), access.save()]);
      return res.status(200).json({
        message: "Renewed access",
        expiresAt: access.expiresAt,
        deducted: true,
        data: access,
      });
    }

    access = await TreeAccess.create({
      userId: user._id,
      treeId,
      grantedAt: new Date(now),
      expiresAt: new Date(now + thirtyDays),
    });

    await user.updateOne({ $inc: { tokens: +10 } });
    access = await access.populate("treeId");

    res
      .status(200)
      .json({ message: "Tree unlocked", data: access, deducted: true });
  } catch (error) {
    logger.error("Error in unlocking trees", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * Get all family trees the user has unlocked or accessed
 * @route GET /api/tree/accessed
 * @group Tree
 * @security BearerAuth
 * @returns {object} 200 - List of accessed trees fetched successfully
 * @returns {array} data - Array of tree access objects with populated tree details
 * @returns {object} 500 - Internal Server Error
 * @example response
 * {
 *   "message": "Accessed trees fetched",
 *   "data": [
 *     {
 *       "_id": "66f1a36b8b50c3c176d56b4f",
 *       "userId": "66f1a36b8b50c3c176d56b4d",
 *       "treeId": {
 *         "_id": "66f1a36b8b50c3c176d56b4e",
 *         "firstName": "John",
 *         "lastName": "Doe"
 *       },
 *       "grantedAt": "2025-10-09T05:00:00.000Z",
 *       "expiresAt": "2025-11-08T05:00:00.000Z"
 *     }
 *   ]
 * }
 */

export const getAccessedTree = async (req, res) => {
  try {
    const trees = await TreeAccess.find({ userId: req.user._id }).populate(
      "treeId"
    );

    return res.status(200).json({
      message: "Accessed trees fetched",
      data: trees,
    });
  } catch (error) {
    logger.error("Error in getting accessed trees", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

/**
 * Builds or updates a family tree for a user including parents, spouse, children, and siblings.
 *
 * Handles:
 *  - Creating or updating the current user node
 *  - Associating parents, spouse, kids, and siblings
 *  - Processing profile images using ImageKit if base64 data is provided
 *  - Maintaining proper relationships between family members
 *  - Updating counts like `childrenCount` and `haveKids`
 *
 * @route POST /api/tree/build
 * @access Protected (requires authenticated user)
 *
 * @param {Object} req.body
 * @param {Object} [req.body.fatherDetails] - Data for creating a new father
 * @param {Object} [req.body.selectedFather] - Existing father to associate
 * @param {Object} [req.body.motherDetails] - Data for creating a new mother
 * @param {Object} [req.body.selectedMother] - Existing mother to associate
 * @param {Object} req.body.personalDetails - Details of the current user
 * @param {Object} [req.body.selectedUser] - Existing user to update instead of creating new
 * @param {Object} [req.body.spouseDetails] - Details of a new spouse
 * @param {Object} [req.body.selectedSpouse] - Existing spouse to associate
 * @param {Array<Object>} [req.body.kidsDetails] - Details of new children
 * @param {Array<Object>} [req.body.selectedKids] - Existing children to associate
 * @param {Array<Object>} [req.body.siblingsDetails] - Details of new siblings
 * @param {Array<Object>} [req.body.selectedSiblings] - Existing siblings to associate
 * @param {Object} [req.body.maritalData] - Marital information for spouse
 *
 * @returns {Object} 200 - JSON object containing updated user and family tree
 * @returns {Object} 500 - JSON object with error message in case of failure
 *
 * @example
 * POST /api/tree/build
 * {
 *   "personalDetails": { "firstName": "John", "lastName": "Doe", "gender": "male" },
 *   "fatherDetails": { "firstName": "Robert", "lastName": "Doe" },
 *   "motherDetails": { "firstName": "Jane", "lastName": "Doe" },
 *   "spouseDetails": { "firstName": "Alice", "lastName": "Doe", "gender": "female" },
 *   "kidsDetails": [{ "firstName": "Emma", "gender": "female" }]
 * }
 */

export const buildTree = async (req, res) => {
  const {
    fatherDetails,
    selectedFather,
    motherDetails,
    selectedMother,
    personalDetails,
    selectedUser,
    spouseDetails = null,
    selectedSpouse,
    kidsDetails = [],
    selectedKids = [],
    siblingsDetails = [],
    selectedSiblings = [],
    maritalData = null,
  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    async function processImage(details) {
      if (
        details?.profileImage &&
        details.profileImage.startsWith("data:image")
      ) {
        const uploadRes = await imagekit.upload({
          file: details.profileImage,
          fileName: `${details.firstName || "profile"}.jpg`,
        });
        details.profileImage = uploadRes.url;
      }
      return details;
    }

    let user;

    if (selectedUser) {
      const existingUser = await Person.findById(selectedUser._id).session(
        session
      );
      if (!existingUser) throw new Error("Selected user not found");

      if (existingUser._id.toString() !== req.user._id) {
        const oldId = existingUser._id;
        const cloned = existingUser.toObject();
        delete cloned._id;
        user = new Person({ ...cloned, _id: req.user._id });
        await user.save({ session });

        await Person.updateMany(
          { father: oldId },
          { $set: { father: req.user._id } },
          { session }
        );
        await Person.updateMany(
          { mother: oldId },
          { $set: { mother: req.user._id } },
          { session }
        );
        await Person.updateMany(
          { childrens: oldId },
          {
            $addToSet: { childrens: req.user._id },
            $pull: { childrens: oldId },
          },
          { session }
        );
        await Person.updateMany(
          { "spouses.spouse": oldId },
          {
            $addToSet: { spouses: { spouse: req.user._id } },
            $pull: { spouses: { spouse: oldId } },
          },
          { session }
        );

        await Person.findByIdAndDelete(oldId).session(session);
      } else {
        user = existingUser;
      }
    } else {
      const processed = await processImage(personalDetails);
      user = new Person({ _id: req.user._id, ...processed });
      await user.save({ session });
    }

    let father = null;
    if (selectedFather) {
      father = await Person.findById(selectedFather._id).session(session);
      if (father && !user.father) {
        user.father = father._id;
        if (!father.childrens.includes(user._id))
          father.childrens.push(user._id);
        father.haveKids = true;
        await father.save({ session });
      }
    } else if (fatherDetails) {
      const processed = await processImage(fatherDetails);
      father = new Person(processed);
      await father.save({ session });
      user.father = father._id;
      father.childrens.push(user._id);
      father.haveKids = true;
      await father.save({ session });
    }

    let mother = null;
    if (selectedMother) {
      mother = await Person.findById(selectedMother._id).session(session);
      if (mother && !user.mother) {
        user.mother = mother._id;
        if (!mother.childrens.includes(user._id))
          mother.childrens.push(user._id);
        mother.haveKids = true;
        await mother.save({ session });
      }
    } else if (motherDetails) {
      const processed = await processImage(motherDetails);
      mother = new Person(processed);
      await mother.save({ session });
      user.mother = mother._id;
      mother.childrens.push(user._id);
      mother.haveKids = true;
      await mother.save({ session });
    }

    if (father && mother) {
      const fatherHasMother = father.spouses.find(
        (s) => s.spouse.toString() === mother._id.toString()
      );
      const motherHasFather = mother.spouses.find(
        (s) => s.spouse.toString() === father._id.toString()
      );
      if (!fatherHasMother)
        father.spouses.push({ spouse: mother._id, status: "married" });
      if (!motherHasFather)
        mother.spouses.push({ spouse: father._id, status: "married" });
      await father.save({ session });
      await mother.save({ session });
    }

    let spouse = null;
    if (selectedSpouse) {
      spouse = await Person.findById(selectedSpouse._id).session(session);
      if (spouse) {
        if (
          !user.spouses.find(
            (s) => s.spouse.toString() === spouse._id.toString()
          )
        ) {
          user.spouses.push({ spouse: spouse._id, status: "married" });
        }
        if (
          !spouse.spouses.find(
            (s) => s.spouse.toString() === user._id.toString()
          )
        ) {
          spouse.spouses.push({ spouse: user._id, status: "married" });
        }
        await spouse.save({ session });
      }
    } else if (spouseDetails) {
      const status = maritalData?.status;
      const {
        marriageDate: fromDate,
        divorceDate: toDate,
        ...spouseData
      } = spouseDetails;
      const processed = await processImage(spouseData);
      spouse = new Person(processed);
      await spouse.save({ session });

      user.spouses.push({
        spouse: spouse._id,
        fromDate,
        toDate: toDate || "present",
        status: status || "married",
      });

      spouse.spouses.push({
        spouse: user._id,
        fromDate,
        toDate: toDate || "present",
        status: status || "married",
      });

      await Promise.all([user.save({ session }), spouse.save({ session })]);
    }

    if (Array.isArray(selectedKids)) {
      for (const kidId of selectedKids) {
        const kid = await Person.findById(kidId._id).session(session);
        if (kid) {
          if (!user.childrens.includes(kid._id)) user.childrens.push(kid._id);
          if (user.gender === "male") {
            if (!kid.father) kid.father = user._id;
            if (spouse && spouse.gender === "female" && !kid.mother)
              kid.mother = spouse._id;
          } else if (user.gender === "female") {
            if (!kid.mother) kid.mother = user._id;
            if (spouse && spouse.gender === "male" && !kid.father)
              kid.father = spouse._id;
          }
          if (spouse && !spouse.childrens.includes(kid._id))
            spouse.childrens.push(kid._id);
          await kid.save({ session });
          if (spouse) await spouse.save({ session });
        }
      }
    }

    if (Array.isArray(kidsDetails)) {
      for (const kd of kidsDetails) {
        const processed = await processImage(kd);
        const kid = new Person(processed);
        await kid.save({ session });
        user.childrens.push(kid._id);
        if (spouse && !spouse.childrens.includes(kid._id))
          spouse.childrens.push(kid._id);
        if (user.gender === "male") {
          kid.father = user._id;
          if (spouse && spouse.gender === "female" && !kid.mother)
            kid.mother = spouse._id;
        } else if (user.gender === "female") {
          kid.mother = user._id;
          if (spouse && spouse.gender === "male" && !kid.father)
            kid.father = spouse._id;
        }
        await kid.save({ session });
        if (spouse) await spouse.save({ session });
      }
    }

    if (Array.isArray(selectedSiblings)) {
      for (const sibId of selectedSiblings) {
        const sib = await Person.findById(sibId._id).session(session);
        if (sib && (father || mother)) {
          if (father && !sib.father) sib.father = father._id;
          if (mother && !sib.mother) sib.mother = mother._id;
          if (father && !father.childrens.includes(sib._id))
            father.childrens.push(sib._id);
          if (mother && !mother.childrens.includes(sib._id))
            mother.childrens.push(sib._id);
          if (father) father.haveKids = true;
          if (mother) mother.haveKids = true;
          await sib.save({ session });
          if (father) await father.save({ session });
          if (mother) await mother.save({ session });
        }
      }
    }

    if (Array.isArray(siblingsDetails)) {
      for (const sd of siblingsDetails) {
        const processed = await processImage(sd);
        const sib = new Person(processed);
        await sib.save({ session });
        if (father) {
          sib.father = father._id;
          if (!father.childrens.includes(sib._id))
            father.childrens.push(sib._id);
          father.haveKids = true;
        }
        if (mother) {
          sib.mother = mother._id;
          if (!mother.childrens.includes(sib._id))
            mother.childrens.push(sib._id);
          mother.haveKids = true;
        }
        await sib.save({ session });
        if (father) await father.save({ session });
        if (mother) await mother.save({ session });
      }
    }

    if (user.childrens?.length) {
      user.childrenCount = user.childrens.length;
      user.haveKids = true;
    }

    await user.save({ session });

    await session.commitTransaction();
    res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    session.endSession();
  }
};

/**
 * Get the authenticated user's full family tree
 * @route GET /api/tree/my-tree
 * @group Tree
 * @security BearerAuth
 * @returns {object} 200 - Family tree fetched successfully
 * @returns {object} data - Object containing all people and tree structure
 * @returns {object} tree - Root person with father, mother, childrens, and spouses
 * @returns {object} 500 - Internal Server Error
 * @example response
 * {
 *   "message": "Tree fetched successfully",
 *   "data": {
 *     "people": {
 *       "64f1a36b8b50c3c176d56b4d": {
 *         "_id": "64f1a36b8b50c3c176d56b4d",
 *         "firstName": "John",
 *         "lastName": "Doe",
 *         "father": "64f1a36b8b50c3c176d56b4e",
 *         "mother": "64f1a36b8b50c3c176d56b4f",
 *         "childrens": ["64f1a36b8b50c3c176d56b50"],
 *         "spouses": [{"spouse": "64f1a36b8b50c3c176d56b51", "status": "married"}]
 *       }
 *     },
 *     "tree": {
 *       "_id": "64f1a36b8b50c3c176d56b4d",
 *       "father": "64f1a36b8b50c3c176d56b4e",
 *       "mother": "64f1a36b8b50c3c176d56b4f",
 *       "childrens": ["64f1a36b8b50c3c176d56b50"],
 *       "spouses": ["64f1a36b8b50c3c176d56b51"]
 *     }
 *   }
 * }
 */

export const getMyFamilyTree = async (req, res) => {
  try {
    const id = req.user._id;
    const visited = new Map();

    const populateFlat = async (personId) => {
      if (!personId) return;
      const key = personId.toString();
      if (visited.has(key)) return;

      const person = await Person.findById(personId)
        .lean()
        .select("-__v -createdAt -updatedAt");

      if (!person) return;
      visited.set(key, {
        ...person,
        father: person.father,
        mother: person.mother,
        childrens: person.childrens,
        spouses: person.spouses,
      });

      if (person.father) await populateFlat(person.father);
      if (person.mother) await populateFlat(person.mother);
      await Promise.all((person.childrens || []).map((c) => populateFlat(c)));
      await Promise.all(
        (person.spouses || []).map((s) => populateFlat(s?.spouse))
      );
    };

    await populateFlat(id);

    const people = Object.fromEntries(visited);
    const root = people[id];

    return res.status(200).json({
      message: "Tree fetched successfully",
      data: {
        people,
        tree: {
          _id: id,
          father: root?.father || null,
          mother: root?.mother || null,
          childrens: root?.childrens || [],
          spouses: (root?.spouses || []).map((s) => s?.spouse),
        },
      },
    });
  } catch (err) {
    logger.error("Error in getting my family tree", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * Add a new person and link them to the authenticated user's family tree
 * @route POST /api/tree/add-person
 * @group Tree
 * @security BearerAuth
 * @param {string} relation.body.required - Relation of the new person to the user (father, mother, child, spouse)
 * @param {string} userId.body.required - ID of the existing person in the tree
 * @param {object} newData.body.required - Details of the new person
 * @param {string} newData.firstName.required - First name of the new person
 * @param {string} [newData.lastName] - Last name of the new person
 * @param {string} [newData.gender] - Gender of the new person
 * @param {string} [newData.profileImage] - URL of profile image
 * @param {string} [newData.maritalStatus] - Marital status (for spouse)
 * @param {string} [newData.marriageDate] - Marriage date (for spouse)
 * @param {string} [newData.divorceDate] - Divorce date (for spouse)
 * @param {string} [newData.widowedDate] - Widowed date (for spouse)
 * @returns {object} 200 - Relation added successfully
 * @returns {object} person - Newly created person object
 * @returns {object} 400 - Missing required fields or invalid relation
 * @returns {object} 404 - Person not found
 * @returns {object} 500 - Internal Server Error
 * @example request - Example body
 * {
 *   "relation": "father",
 *   "userId": "64f1a36b8b50c3c176d56b4d",
 *   "newData": {
 *     "firstName": "Robert",
 *     "lastName": "Doe",
 *     "gender": "male"
 *   }
 * }
 * @example response - Successful addition
 * {
 *   "message": "Relation added successfully",
 *   "person": {
 *     "_id": "64f1a36b8b50c3c176d56b52",
 *     "firstName": "Robert",
 *     "lastName": "Doe",
 *     "gender": "male",
 *     "childrens": ["64f1a36b8b50c3c176d56b4d"],
 *     "spouses": []
 *   }
 * }
 */

export const addPerson = async (req, res) => {
  try {
    const { relation, newData, userId } = req.body;
    console.log(relation);
    if (!relation || !newData?.firstName || !userId) {
      return res
        .status(400)
        .json({ message: "Relation, firstName and userId are required" });
    }

    const allowedRelations = ["father", "mother", "child", "spouse"];
    if (!allowedRelations.includes(relation.toLowerCase())) {
      return res.status(400).json({ message: "Invalid relation" });
    }

    const allowedStatuses = ["married", "divorced", "widowed"];
    if (relation.toLowerCase() === "spouse") {
      if (
        newData.maritalStatus &&
        !allowedStatuses.includes(newData.maritalStatus.toLowerCase())
      ) {
        return res.status(400).json({ message: "Invalid spouse status" });
      }
    }

    if (
      relation.toLowerCase() === "father" &&
      newData.gender?.toLowerCase() !== "male"
    ) {
      return res.status(400).json({ message: "Father must be male" });
    }
    if (
      relation.toLowerCase() === "mother" &&
      newData.gender?.toLowerCase() !== "female"
    ) {
      return res.status(400).json({ message: "Mother must be female" });
    }

    const person = await Person.findById(userId);
    if (!person) return res.status(404).json({ message: "Person not found" });

    if (relation.toLowerCase() === "father" && person.father)
      return res.status(400).json({ message: "Father already exists" });
    if (relation.toLowerCase() === "mother" && person.mother)
      return res.status(400).json({ message: "Mother already exists" });

    if (!newData.profileImage)
      newData.profileImage =
        "https://ik.imagekit.io/ancestor/Frame%2025878.png";

    const createdPerson = await Person.create(newData);

    if (relation.toLowerCase() === "father") {
      person.father = createdPerson._id;
      createdPerson.childrens.push(person._id);
    } else if (relation.toLowerCase() === "mother") {
      person.mother = createdPerson._id;
      createdPerson.childrens.push(person._id);
    } else if (relation.toLowerCase() === "child") {
      person.childrens.push(createdPerson._id);
      if (person.gender?.toLowerCase() === "male")
        createdPerson.father = person._id;
      if (person.gender?.toLowerCase() === "female")
        createdPerson.mother = person._id;
    } else if (relation.toLowerCase() === "spouse") {
      const spouseData = {
        spouse: createdPerson._id,
        status: newData?.maritalStatus.toLowerCase() || "married",
        fromDate: newData?.marriageDate,
        toDate: newData?.divorceDate || null,
      };
      person.spouses.push(spouseData);
      createdPerson.spouses.push({
        spouse: person._id,
        status: newData.maritalStatus.toLowerCase() || "married",
        fromDate: newData?.marriageDate,
        toDate: newData?.divorceDate || null,
      });
      if (newData?.maritalStatus?.toLowerCase() === "widowed") {
        person.toDate =
          newData?.divorceDate || newData?.widowedDate || person?.toDate;
      }
    }

    await person.save();
    await createdPerson.save();

    return res
      .status(200)
      .json({ message: "Relation added successfully", person: createdPerson });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};
