import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
    },
    googleAuth: {
      type: Boolean,
      default: false,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    upadtesLeft: {
      type: Number,
      max: 1,
      default: 1,
    },
    lastName: {
      type: String,
      required: true,
    },
    verificationToken: {
      type: String,
      default: null,
    },
    treeId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    tokens: {
      type: Number,
      default: 20,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },
    profilePicture: {
      type: String,
      default:
        "https://ik.imagekit.io/ancestor/default%20dp.webp?updatedAt=1754569946351",
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },
    passToken: {
      type: Number,
      default: null,
    },
    passTokenExpires: {
      type: Date,
      default: null,
    },
    password: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", function (next) {
  if (!this.profilePicture) {
    this.profilePicture = process.env.DEFAULT_IMAGE_URL;
  }

  if (this.marriedStatus === "married") {
    if (!this.spouseName) {
      this.invalidate("spouseName", "Spouse name is required if married.");
    }
  } else {
    this.spouseName = undefined;
  }

  if (this.marriedStatus === "divorced") {
    if (!this.marriageTimeline?.start || !this.marriageTimeline?.end) {
      this.invalidate(
        "marriageTimeline",
        "Marriage timeline is required if divorced."
      );
    }
  } else {
    this.marriageTimeline = undefined;
  }

  if (this.marriedStatus !== "married") {
    this.childrenName = [];
  }

  next();
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
