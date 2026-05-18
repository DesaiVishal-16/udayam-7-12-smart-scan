import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import multer from "multer";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Database Setup
const db = new Database("land_records.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    fileName TEXT,
    filePath TEXT,
    landType TEXT,
    village TEXT,
    taluka TEXT,
    district TEXT,
    area TEXT,
    mutationNumber INTEGER,
    confidence REAL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    extractedData TEXT
  )
`);

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({ storage });

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API Routes
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  res.json({
    message: "File uploaded successfully",
    filePath: `/uploads/${req.file.filename}`,
    fileName: req.file.originalname,
  });
});

app.get("/api/records", (req, res) => {
  try {
    const { village, taluka, district, startDate, endDate, search, landType } = req.query;
    let query = "SELECT * FROM records WHERE 1=1";
    const params = [];

    if (village) {
      query += " AND village = ?";
      params.push(village);
    }
    if (landType && landType !== "all") {
      query += " AND landType LIKE ?";
      params.push(`%${landType}%`);
    }
    if (search) {
      query += " AND (fileName LIKE ? OR village LIKE ? OR taluka LIKE ? OR district LIKE ? OR landType LIKE ?)";
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }
    if (startDate) {
      query += " AND createdAt >= ?";
      params.push(startDate);
    }
    if (endDate) {
      query += " AND createdAt <= ?";
      params.push(endDate);
    }

    query += " ORDER BY createdAt DESC";
    const records = db.prepare(query).all(...params);
    const parsed = records.map((r: any) => ({
      ...r,
      extractedData: r.extractedData ? JSON.parse(r.extractedData) : {}
    }));
    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/records", (req, res) => {
  try {
    const { id, fileName, filePath, landType, village, taluka, district, area, mutationNumber, confidence, extractedData } = req.body;
    
    // Check for duplicate
    const existing = db.prepare("SELECT id FROM records WHERE id = ? OR (fileName = ? AND village = ?)").get(id, fileName, village);
    if (existing && req.body.isNew) {
       return res.status(409).json({ error: "Duplicate record detected" });
    }

    const extractedDataJson = extractedData ? JSON.stringify(extractedData) : null;
    const insert = db.prepare(`
      INSERT OR REPLACE INTO records (id, fileName, filePath, landType, village, taluka, district, area, mutationNumber, confidence, extractedData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    insert.run(id, fileName, filePath, landType, village, taluka, district, area, mutationNumber, confidence, extractedDataJson);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete("/api/records/:id", (req, res) => {
  try {
    const { id } = req.params;
    const record = db.prepare("SELECT filePath FROM records WHERE id = ?").get(id) as any;
    if (record && record.filePath) {
        const fullPath = path.join(__dirname, record.filePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }
    }
    db.prepare("DELETE FROM records WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// JSON 404 for API routes
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API endpoint ${req.method} ${req.url} not found` });
});

// Vite Middleware
async function startServer() {
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
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
