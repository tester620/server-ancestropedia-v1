import mongoose from "mongoose";


const modelSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    prevData: {
      type: [Object],
      required: true,
    },
    updatedData: {
      type: [Object],
      required: true,
    },
    personId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Person",
    },
    proof: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const UpdateRequest = mongoose.model("UpdateRequest", modelSchema);
export default UpdateRequest;
