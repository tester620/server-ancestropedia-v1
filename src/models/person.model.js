import mongoose from "mongoose";

const schemaModel = mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true},
    fullName: { type: String, index: true },

    birthDate: { type: String, index: true },
    toDate: { type: String },

    birthCity: { type: String},
    birthState: { type: String },
    birthCountry: { type:String},

    residenceCity: { type: String },
    residenceState: { type: String },
    residenceCountry: { type: String },

    occupation: { type: String},
    maritalStatus:{type:String},
    haveKids:{type:Boolean},
    totalKids:{type:Number},
    haveSiblings:{type:Boolean},
    totalSiblings:{type:Number},



    gender: { type: String, enum: ["male", "female", "others"], required: true },
    living: { type: Boolean},

    profileImage: { type: String, default: process.env.DEFAULT_IMAGE },
    editedBy:{type:mongoose.Schema.Types.ObjectId, ref:"Person"},
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
