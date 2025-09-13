import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import logger from "../config/logger.js";

export const protectRoute = async (req, res, next) => {
  try {
    let token;

    // 1. First check Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    } 
    // 2. If no header, fallback to cookie
    else if (req.cookies?.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return res
        .status(401)
        .json({ status: "error", message: "Unauthorized - No token provided" });
    }

    // Verify token
    const decodedId = jwt.verify(token, process.env.JWT_KEY);

    if (!decodedId) {
      return res
        .status(401)
        .json({ status: "error", message: "Unauthorized - Invalid token" });
    }

    // Get user
    const user = await User.findById(decodedId.userId).select(
      "-viewsLeft -verificationToken"
    );

    if (!user) {
      return res
        .status(404)
        .json({ status: "error", message: "User not found" });
    }

    req.user = user;

    // 🔹 Optionally keep track of auth source
    req.authSource = req.headers.authorization ? "Bearer" : "Cookie";

    next();
  } catch (error) {
    logger.error(error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
};

