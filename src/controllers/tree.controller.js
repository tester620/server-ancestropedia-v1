import mongoose from "mongoose";
import logger from "../config/logger.js";
import Person from "../models/person.model.js";
import { imagekit } from "../config/imagekit.js";
import { redis } from "../config/redis.js";
import UpdateRequest from "../models/update.request.model.js";

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
      relatedIds = personchildrens || [];
    } else if (relation === "siblings") {
      let parentDoc = null;
      if (person.father) parentDoc = await Person.findById(person.father);
      else if (person.mother) parentDoc = await Person.findById(person.mother);
      console.log(parentDoc);
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

    // Fetch all related persons in **one query**
    const related = await Person.find({ _id: { $in: relatedIds } });

    res.json({ related });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getFullFamilyTree = async (req, res) => {
  const { personId } = req.query;
  if (!personId)
    return res.status(400).json({ message: "personId is required" });

  const visited = new Set();

  const traverse = async (id) => {
    if (!id || visited.has(id.toString())) return null;
    visited.add(id.toString());

    const person = await Person.findById(id)
      .populate("father mother childrens spouses")
      .lean();
    if (!person) return null;

    person.father = await traverse(person.father?._id);
    person.mother = await traverse(person.mother?._id);

    const siblingsSet = new Set();
    if (person.father)
      for (const kidId of person.fatherchildrens || [])
        if (kidId.toString() !== person._id.toString())
          siblingsSet.add(kidId.toString());
    if (person.mother)
      for (const kidId of person.motherchildrens || [])
        if (kidId.toString() !== person._id.toString())
          siblingsSet.add(kidId.toString());

    person.siblings = [];
    if (siblingsSet.size) {
      const siblingDocs = await Person.find({
        _id: { $in: Array.from(siblingsSet) },
      })
        .populate("father mother childrens spouses")
        .lean();
      for (const sib of siblingDocs) {
        const sibTree = await traverse(sib._id);
        if (sibTree) person.siblings.push(sibTree);
      }
    }

    const kidsIds = personchildrens || [];
    personchildrens = [];
    if (kidsIds.length) {
      const kidsDocs = await Person.find({ _id: { $in: kidsIds } })
        .populate("father mother childrens spouses")
        .lean();
      for (const kid of kidsDocs) {
        const kidTree = await traverse(kid._id);
        if (kidTree) personchildrens.push(kidTree);
      }
    }

    const spousesArray = person.spouses || [];
    person.spouses = [];
    for (const s of spousesArray) {
      const spouseData = await traverse(s.spouse?._id);
      if (spouseData) person.spouses.push({ ...s, spouse: spouseData });
    }

    const unclesAuntsSet = new Set();
    if (person.father?.siblings)
      for (const ua of person.father.siblings)
        unclesAuntsSet.add(ua._id.toString());
    if (person.mother?.siblings)
      for (const ua of person.mother.siblings)
        unclesAuntsSet.add(ua._id.toString());

    person.unclesAunts = [];
    if (unclesAuntsSet.size) {
      const uaDocs = await Person.find({
        _id: { $in: Array.from(unclesAuntsSet) },
      })
        .populate("father mother childrens spouses")
        .lean();
      for (const ua of uaDocs) {
        const uaTree = await traverse(ua._id);
        if (uaTree) person.unclesAunts.push(uaTree);
      }
    }

    const cousinsSet = new Set();
    for (const ua of person.unclesAunts)
      if (uachildrens)
        for (const c of uachildrens) cousinsSet.add(c._id.toString());

    person.cousins = [];
    if (cousinsSet.size) {
      const cousinDocs = await Person.find({
        _id: { $in: Array.from(cousinsSet) },
      })
        .populate("father mother childrens spouses")
        .lean();
      for (const c of cousinDocs) {
        const cTree = await traverse(c._id);
        if (cTree) person.cousins.push(cTree);
      }
    }

    return person;
  };

  try {
    const fullTree = await traverse(personId);
    if (!fullTree) return res.status(404).json({ message: "Person not found" });
    res.status(200).json(fullTree);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};

// export const createTree = async(req,res)=>{

// }

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
    return res
      .status(500)
      .json({ message: "Server Error", error: error.message });
  }
};
