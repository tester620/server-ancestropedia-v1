import mongoose from "mongoose";

const schemaModel = mongoose.Schema(
  {
    firstName: { type: String, required: true, index: true },
    lastName: { type: String, required: true, index: true },
    fullName: { type: String, index: true },

    birthDate: { type: Date, required: true, index: true },
    toDate: { type: Date },

    placeOfBirth: { type: String, index: true },
    birthPin: { type: String, index: true },

    placeOfBirth: { type: String, required: true },
    birthPin:{type:Number,required:true, index: true},
    residence: { type: String, required: true },
    residencePin:{type:Number,required:true, index: true},

    occupation: { type: String, required: true },

    gender: { type: String, enum: ["male", "female", "others"], required: true },
    living: { type: Boolean, required: true },

    profileImage: { type: String, default: process.env.DEFAULT_IMAGE },

    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    treeId: { type: mongoose.Schema.Types.ObjectId, ref: "Tree", index: true,default:null },
  },
  { timestamps: true }
);

schemaModel.pre("save", function (next) {
  if (this.firstName && this.lastName) {
    this.fullName = `${this.firstName.trim()} ${this.lastName.trim()}`.toLowerCase();
  }
  next();
});

const Person = mongoose.model("Person", schemaModel);

export default Person;
