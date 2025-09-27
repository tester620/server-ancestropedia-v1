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
    logger.error(error?.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

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

export const unlockTree = async (req, res) => {
  const { treeId } = req.body;
  const user = req.user;

  try {
    if ((user.allotedTokens-user.tokens) < 10) {
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
