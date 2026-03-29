import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import mongoose from "mongoose";
import archiver from "archiver";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Connect to MongoDB if MONGODB_URI is provided
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log("Connected to MongoDB");
    } catch (error) {
      console.error("MongoDB connection error:", error);
    }
  }

  // Define a simple schema and model for scan history
  const scanSchema = new mongoose.Schema({
    ingredients: String,
    harmfulIngredients: [String],
    summary: String,
    timestamp: { type: Date, default: Date.now },
  });
  
  const Scan = mongoose.models.Scan || mongoose.model("Scan", scanSchema);

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/scans", async (req, res) => {
    try {
      if (!process.env.MONGODB_URI) {
        return res.status(200).json({ message: "Scan processed (DB not connected)", data: req.body });
      }
      const newScan = new Scan(req.body);
      await newScan.save();
      res.status(201).json(newScan);
    } catch (error) {
      res.status(500).json({ error: "Failed to save scan" });
    }
  });

  app.get("/api/scans", async (req, res) => {
    try {
      if (!process.env.MONGODB_URI) {
        return res.status(200).json([]);
      }
      const scans = await Scan.find().sort({ timestamp: -1 }).limit(10);
      res.json(scans);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scans" });
    }
  });

  app.get("/api/download-zip", (req, res) => {
    res.attachment("project.zip");
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      res.status(500).send({ error: err.message });
    });

    archive.pipe(res);

    // Add files and directories, excluding node_modules, dist, and .git
    archive.glob("**/*", {
      cwd: process.cwd(),
      ignore: ["node_modules/**", "dist/**", ".git/**", "project.zip"],
      dot: true
    });

    archive.finalize();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
