import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/user.model.js";
import dotenv from "dotenv";
import { sendWelcomeMail } from "../utils/helper.js";
import { createRootFolderPrivate } from "../controllers/folder.controller.js";
dotenv.config();

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/user.model.js";
import dotenv from "dotenv";
import { sendWelcomeMail } from "../utils/helper.js";
import { createRootFolderPrivate } from "../controllers/folder.controller.js";
dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
      callbackURL: process.env.BASE_URL + "/api/auth/callback/google",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        let user = await User.findOne({ email });

        if (!user) {
          const [firstName, ...lastNameParts] =
            profile.displayName?.split(" ") || [];
          const lastName = lastNameParts.join(" ");

          user = await User.create({
            firstName,
            lastName,
            email,
            verified: true,
            googleAuth: true,
            profilePicture: profile.photos?.[0]?.value || "",
          });

          // 👇 run async work AFTER calling done
          process.nextTick(async () => {
            try {
              await sendWelcomeMail(user);
              await createRootFolderPrivate(user);
            } catch (err) {
              console.error("Post-signup tasks failed:", err);
            }
          });
        }

        return done(null, user);
      } catch (err) {
        console.error(
          "Google Strategy Error:",
          err?.oauthError?.data?.toString() || err
        );
        return done(err, false);
      }
    }
  )
);
