import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDb } from "./utils/db.js";
import cookieParser from "cookie-parser";
import "./config/passport.js";
import { redis } from "./config/redis.js";

import { protectRoute } from "./middleware/auth.middleware.js";
import {
  authRoutes,
  folderRoutes,
  notificationRoutes,
  orderRoutes,
  profileRoutes,
  reportRoutes,
  requestRoutes,
  treeRoutes,
  userRoutes,
  supportRoutes,
  adminRoutes,
  addressRoutes,
  eventRoutes,
  tokenRoutes,
  newsLetterRoute,
} from "./routes/routes.js";
import logger from "./config/logger.js";
import { limiter } from "./utils/limiting.js";

dotenv.config();
const app = express();
const corsOptions = {
  origin: ["http://localhost:3000", "https://ancestropedia.vercel.app/"],
  credentials: true,
};

app.use(cors(corsOptions));

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use("/api/ping", limiter, (_, res) => {
  return res.send("Pong");
});

app.use("/api/newsletter", newsLetterRoute);
app.use("/api/auth", authRoutes);
app.use("/api", adminRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/report", protectRoute, reportRoutes);
app.use("/api/profile", protectRoute, profileRoutes);
app.use("/api/user", protectRoute, userRoutes);
app.use("/api/user/address", protectRoute, addressRoutes);
app.use("/api/user/tree", protectRoute, treeRoutes);
app.use("/api/user/order", protectRoute, orderRoutes);
app.use("/api/user/folder", protectRoute, folderRoutes);
app.use("/api/user/request", protectRoute, requestRoutes);
app.use("/api/user/token", protectRoute, tokenRoutes);
app.use("/api/user/notification", protectRoute, notificationRoutes);
app.use("/api/user/event", protectRoute, eventRoutes);

app.listen(7777, async () => {
  await connectDb();
  await redis.connect();
  logger.info("Server is listening on port", 7777);
});
