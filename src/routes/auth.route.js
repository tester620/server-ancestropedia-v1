import express from "express";
import {
  checkAuth,
  googleCallback,
  login,
  logout,
  mailVerify,
  resetPassToken,
  resetPassword,
  signup,
  verifyMailToken,
  verifyPassToken,
} from "../controllers/auth.controller.js";
import passport from "passport";
import { limiter } from "../utils/limiting.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/signup", signup);
router.get("/checkAuth", protectRoute, checkAuth);

router.post("/login", limiter, login);

router.post("/logout", logout);

router.post("/mail/reset-pass", resetPassToken);
router.post("/mail/verify-mail", mailVerify);

router.post("/verifypassToken", verifyPassToken);
router.post("/verifyMailToken", verifyMailToken);
router.post("/reset-pass", resetPassword);

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/callback/google",
  passport.authenticate("google", { session: false }),
  googleCallback
);

export default router;
