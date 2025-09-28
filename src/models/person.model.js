import mongoose from "mongoose";

const schemaModel = mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    firstName: { type: String, required: true },
    lastName: { type: String },
    birthDate: { type: String, index: true },
    toDate: { type: String },
    birthCity: { type: String },
    birthState: { type: String },
    birthCountry: { type: String },
    residenceCity: { type: String },
    residenceState: { type: String },
    residenceCountry: { type: String },
    occupation: { type: String },
    maritalStatus: { type: String },
    childrenCount: { type: Number },
    community: { type: String },
    religion: { type: String },
    spouseCount: { type: Number },
    father: { type: String, ref: "Person" },
    mother: { type: String, ref: "Person" },
    childrens: [{ type: String, ref: "Person" }],
    spouses: [
      {
        spouse: { type: String, ref: "Person" },
        fromDate: { type: String },
        toDate: { type: String },
        status: { type: String, enum: ["married", "divorced", "widowed"] },
      },
    ],
    gender: { type: String, enum: ["male", "female", "others"] },
    living: { type: Boolean },
    profileImage: {
      type: String,
      default:
        "https://ik.imagekit.io/ancestor/Frame%2025878.png?updatedAt=1758607287267",
    },
    editedBy: { type: String, ref: "Person" },
  },
  { timestamps: true }
);

const Person = mongoose.model("Person", schemaModel);

export default Person;
