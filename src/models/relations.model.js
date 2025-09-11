import mongoose from "mongoose";

const modelSchema = mongoose.Schema(
  {
    treeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tree",
      index:true
    },
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Person",
    },

    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Person",
    },
    type: {
      type: String,
      enum: ["father","mother", "spouse"],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Relation = mongoose.model("Relation", modelSchema);
export default Relation;
