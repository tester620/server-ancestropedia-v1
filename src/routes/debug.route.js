import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

const SECURITY_KEY = process.env.DEBUG_KEY;

// Root directory of Render deployment
const ROOT = "/opt/render/project/src";

router.get("/debug-files", (req, res) => {
  try {
    const { key, path: subPath } = req.query;

    // Security check
    if (key !== SECURITY_KEY) {
      return res.status(401).json({ error: "Unauthorized - Invalid Key" });
    }

    // Normalize input path safely
    const safeFullPath = path.normalize(
      subPath ? path.join(ROOT, subPath) : ROOT
    );

    // Prevent user escaping the root (VERY important)
    if (!safeFullPath.startsWith(ROOT)) {
      return res.status(400).json({ error: "Invalid path outside project root" });
    }

    // Read items
    const items = fs.readdirSync(safeFullPath).map((item) => {
      const fullItemPath = path.join(safeFullPath, item);
      const stat = fs.statSync(fullItemPath);

      return {
        name: item,
        type: stat.isDirectory() ? "folder" : "file",
        size: stat.isFile() ? stat.size : null,
        path: fullItemPath.replace(ROOT, ""), // clean path for navigation
      };
    });

    return res.json({
      currentPath: safeFullPath.replace(ROOT, "") || "/",
      items,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
