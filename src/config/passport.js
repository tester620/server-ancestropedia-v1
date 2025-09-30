import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/user.model.js";
import dotenv from "dotenv";
dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
      callbackURL: "/api/auth/callback/google",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const existingUser = await User.findOne({ email });

        if (existingUser) return done(null, existingUser);

        const nameParts = profile.displayName?.split(" ") || [];
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";

        const profilePicture = profile.photos?.[0]?.value || "";

        const newUser = await User.create({
          firstName,
          lastName,
          email,
          verified: true,
          googleAuth: true,
          profilePicture,
        });
        return done(null, newUser);
      } catch (err) {
        return done(err, false);
      }
    }
  )
);
