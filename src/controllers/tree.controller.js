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

    if (maritalData) {
      user.maritalStatus = maritalData.status || user.maritalStatus;
      user.spouseCount = maritalData.spouseCount || user.spouseCount;
      user.childrenCount = maritalData.childrenCount || user.childrenCount;
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
      const processed = await processImage(spouseDetails);
      spouse = new Person(processed);
      await spouse.save({ session });
      user.spouses.push({ spouse: spouse._id, status: "married" });
      spouse.spouses.push({ spouse: user._id, status: "married" });
      await spouse.save({ session });
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

    const getBuiltTree = async (id) => {
      try {
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
          await Promise.all(
            (person.childrens || []).map((c) => populateFlat(c))
          );
          await Promise.all(
            (person.spouses || []).map((s) => populateFlat(s?.spouse))
          );
        };

        await populateFlat(id);

        const people = Object.fromEntries(visited);
        const root = people[id];

        const builtTree = {
          people,
          tree: {
            _id: id,
            father: root?.father || null,
            mother: root?.mother || null,
            childrens: root?.childrens || [],
            spouses: (root?.spouses || []).map((s) => s?.spouse),
          },
        };

        return builtTree;
      } catch (err) {
        logger.error("Error in getting full family tree", err);
      }
    };
    const newTree = await getBuiltTree(user._id);

    await session.commitTransaction();
    res.status(200).json({
      success: true,
      data: {
        user,
        tree: newTree,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    session.endSession();
  }
};

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
