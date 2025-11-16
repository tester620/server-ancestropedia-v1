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

    // 1️⃣ Security check
    if (key !== SECURITY_KEY) {
      return res.status(401).json({ error: "Unauthorized - Invalid Key" });
    }

    // 2️⃣ Normalize the path safely
    const safeFullPath = path.normalize(
      subPath ? path.join(ROOT, subPath) : ROOT
    );

    // Prevent escaping the project root
    if (!safeFullPath.startsWith(ROOT)) {
      return res.status(400).json({ error: "Invalid path outside project root" });
    }

    // 3️⃣ Detect whether path is FILE or FOLDER
    const stats = fs.statSync(safeFullPath);

    // 📌 If it's a FILE → return file content
    if (stats.isFile()) {
      const content = fs.readFileSync(safeFullPath, "utf8");

      return res.json({
        currentPath: safeFullPath.replace(ROOT, "") || "/",
        type: "file",
        size: stats.size,
        content,
      });
    }

    // 📌 If it's a FOLDER → list directory contents
    if (stats.isDirectory()) {
      const items = fs.readdirSync(safeFullPath).map((item) => {
        const itemPath = path.join(safeFullPath, item);
        const itemStats = fs.statSync(itemPath);

        return {
          name: item,
          type: itemStats.isDirectory() ? "folder" : "file",
          size: itemStats.isFile() ? itemStats.size : null,
          path: itemPath.replace(ROOT, ""), // clean relative path
        };
      });

      return res.json({
        currentPath: safeFullPath.replace(ROOT, "") || "/",
        type: "folder",
        items,
      });
    }

    // Unknown type
    return res.status(400).json({ error: "Invalid path" });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
