import User from "../models/user.model.js";
import validator from "validator";
import bcrypt from "bcryptjs";
import logger from "../config/logger.js";
import { generateToken } from "../utils/token.js";
import {
  generateOtp,
  sendPassMail,
  sendVerificationMail,
} from "../utils/helper.js";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

export const signup = async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  try {
    if (
      !firstName ||
      !lastName ||
      !firstName.trim() ||
      !lastName.trim() ||
      !email ||
      !password
    ) {
      return res.status(400).json({
        message: "Please fill all the feilds",
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }

    if (!validator.isStrongPassword(password)) {
      return res.status(400).json({
        message: "Enter a strong password",
      });
    }

    const existingUser = await User.findOne({
      email,
    });
    if (existingUser) {
      return res.status(400).json({
        message: "User already exists with this email",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      password: hashedPassword,
      firstName,
      updatesLeft: 0,
      lastName,
    });
    const otp = await sendVerificationMail(user);
    user.verificationToken = otp;
    await user.save();
    return res.status(201).json({
      message: "Account Created!",
      data: user,
    });
  } catch (error) {
    logger.error("Error while registering user", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const logout = (_, res) => {
  try {
    res.cookie("jwt", "", {
      expires: new Date(0),
      path: "/",
      domain: ".ancestropedia.com",
      httpOnly: true,
      sameSite: "None",
      secure: true,
    });

    return res
      .status(200)
      .json({ status: "success", message: "Logged out successfully" });
  } catch (error) {
    logger.error("Error in logout controller", error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
};

export const googleCallback = async (req, res) => {
  try {
    generateToken(req.user._id, res);
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    logger.error("OAuth callback error:", err);
    res.status(500).json({ message: "Login failed" });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        message: "Invalid Credentials",
      });
    }
    if (user.googleAuth && !user.password) {
      return res.status(400).json({
        message: "Invalid Credentials",
      });
    }
    if (!user.verified) {
      const otp = await sendVerificationMail(user);
      user.verificationToken = otp;
      await user.save();
      return res.status(401).json({
        code: "ACCOUNT_NOT_VERIFIED",
        message:
          "Kindly verify your account before logging in. Verification mail has been sent.",
      }); 
    }
    const isValid = await bcrypt.compare(password, user?.password);

    if (!isValid) {
      return res.status(400).json({
        message: "Invalid Credentials",
      });
    }
    generateToken(user._id, res);

    return res.status(200).json({
      message: "Logged in Successfully",
      data: user,
    });
  } catch (error) {
    logger.error("Error while logging in", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const resetPassToken = async (req, res) => {
  const { email } = req.body;
  try {
    if (!email) {
      return res.status(400).json({
        message: "Please enter Email",
      });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({
        message: "Invalid Email format",
      });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }
    const expiresIn = 5 * 60 * 1000;
    const otp = generateOtp();
    user.passToken = otp;
    user.passTokenExpires = new Date(Date.now() + expiresIn);
    await user.save();

    await sendPassMail(otp, user);
    return res.status(200).json({
      message: "OTP has been sent to the mail",
    });
  } catch (error) {
    logger.error("Error in sending OTp for pass reset", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const verifyPassToken = async (req, res) => {
  const { email } = req.query;
  const { otp } = req.body;

  try {
    if (!email || !otp) {
      return res
        .status(400)
        .json({ message: "Please provide the Email and OTP both" });
    }

    if (otp.toString().length !== 6) {
      return res.status(400).json({ message: "OTP must be of 6 digits only" });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Invalid Email format" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.passToken || user.passTokenExpires < Date.now()) {
      return res.status(401).json({
        message: "OTP expired or not requested.",
      });
    }

    if (user.passToken.toString() !== otp.toString()) {
      return res.status(400).json({ message: "Incorrect OTP" });
    }

    const resetToken = jwt.sign({ userId: user._id }, process.env.JWT_KEY, {
      expiresIn: "10m",
    });

    return res.status(200).json({
      message: "OTP verified successfully",
      resetToken,
    });
  } catch (error) {
    logger.error("Error in OTP verification for password reset", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const resetPassword = async (req, res) => {
  const { token } = req.query;
  const { newPassword } = req.body;

  if (!token || !newPassword) {
    return res
      .status(400)
      .json({ message: "Token and new password are required" });
  }
  if (!validator.isStrongPassword(newPassword)) {
    return res.status(400).json({
      message: "Please enter a strong password",
    });
  }

  try {
    let decodedId;
    try {
      decodedId = jwt.verify(token, process.env.JWT_KEY);
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    const user = await User.findById(decodedId.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!user.passToken) {
      return res.status(401).json({
        message: "Unauthorized- No OTP found",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passToken = null;
    user.passTokenExpires = null;

    await user.save();

    return res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    logger.error("Password reset error", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const verifyMailToken = async (req, res) => {
  const { email } = req.query;
  const { otp } = req.body;
  try {
    if (!email || !otp) {
      return res.status(400).json({
        message: "Both Email and OTP are required",
      });
    }
    if (otp.toString().length !== 6) {
      return res.status(400).json({
        message: "OTP must be of length 6 characters",
      });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({
        message: "Invalid Email format",
      });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }
    if (!user.verificationToken) {
      return res.status(400).json({
        message:
          "Token is either expired or not requested, kindly request a new one",
      });
    }

    const isValid = user.verificationToken === otp;
    if (!isValid) {
      return res.status(400).json({
        message: "Please enter the correct OTP",
      });
    }
    user.verified = true;
    user.verificationToken = null;
    await user.save();
    generateToken(user._id, res);
    return res.status(200).json({
      message: "Account verified successfully",
      data: user,
    });
  } catch (error) {
    logger.error("Error in verification of user mail", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const checkAuth = async (req, res) => {
  if (req.user) {
    return res.status(200).json({
      message: "Auth check successfull",
      data: req.user,
    });
  } else {
    return res.status(401).json({
      message: "Unauthorised- Not Logged in",
    });
  }
};

export const mailVerify = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    if (user.verified) {
      return res.status(401).json({
        message: "Acoount already verified",
      });
    }
    const otp = await sendVerificationMail(user);
    user.verificationToken = otp;
    await user.save();
    return res.status(200).json({
      message: "OTP has been sent to the mail",
    });
  } catch (error) {
    logger.error("Error in resending the verification mail to the user", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
