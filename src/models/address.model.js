import mongoose from "mongoose";

const modelSchema = mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  recipient: {
    type: String,
    required: true,
  },
  mobile: {
    type: Number,
    required: true,
  },
  pincode: {
    type: Number,
    required: true,
  },
  details: {
    type: String,
    required: true,
  },
  country: {
    type: String,
    required: true,
  },
  house: {
    type: String,
  },
  city: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  landmark: {
    type: String,
    required: true,
  },
});

const Address = mongoose.model("Address", modelSchema);
export default Address;
