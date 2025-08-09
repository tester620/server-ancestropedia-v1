import jwt  from "jsonwebtoken";
const isProd = process.env.NODE_ENV === "production";

export const generateToken = (userId, res) => {
  const token = jwt.sign({ userId }, process.env.JWT_KEY, {
    expiresIn: "7d",
  });

  res.cookie("jwt", token, {
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  domain: isProd ? "ancestropedia.vercel.app" : "localhost",
});
  return token;
};