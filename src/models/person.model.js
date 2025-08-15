import mongoose from "mongoose";

const schemaModel = mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      required:true //because we need to show the location on searchTree page and also it can be used to filter the data when searching for the user's tree
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastName: {
      type: String,
      required: true,
    },
    profession: {
      type: String,
      required: true,
    },
    dob: {
      type: Date,
      required: true,
    },
    dod: {
      type: Date,
    },
    gender: {
      type: String,
      enum: ["male", "female", "others"],
      required: true,
    },
    living: {
      type: Boolean,
      required: true,
    },

    profileImage: {
      type: String,
      default: process.env.DEFAULT_IMAGE,
    },
    treeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tree",
    },
  },
  {
    timestamps: true,
  }
);

const Person = mongoose.model("Person", schemaModel);

export default Person;
