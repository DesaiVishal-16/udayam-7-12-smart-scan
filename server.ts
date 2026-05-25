import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import multer from "multer";
import Database from "better-sqlite3";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
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

// Vertex AI Setup
const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_PROJECT_ID || "",
  location: process.env.GOOGLE_LOCATION || "us-central1",
  apiVersion: "v1",
});

const FIXED_COLUMNS = [
  "Date", "File Name", "भू-धारणा पद्धती", "गाव", "तालुका", "जिल्हा",
  "Total Area (क्षेत्र)", "शेवटचा फेरफार क्रमांक", "सीलिंग",
  "Forest / वन / फॉरेस्ट / वने", "इनाम", "भूदान", "गावठाण", "कुळ",
  "वतन", "नवीन शर्त", "अतिक्रमण", "गुरे चरण/चरई", "देवस्थान",
  "कलम 36/36 अ आदिवासी", "पुनर्वसन", "भाडेपट्टा", "वक्फ",
  "तुकडा/तुकडेबंदी", "अ पा क", "एकुक", "नजर गहाण", "बडिंग",
  "भूमीधारी हक्क", "तगाई"
];

function generatePrompt(): string {
  const columns = FIXED_COLUMNS.map(c => `"${c}"`).join(", ");
  const sampleRow1 = FIXED_COLUMNS.map((c, i) => {
    if (i === 0) return '"DD/MM/YYYY"';
    if (i === 1) return '"document.pdf"';
    if (i === 2) return '"भोगवटादार वर्ग १"';
    if (i === 3) return '"शिरूर"';
    if (i === 4) return '"शिरूर"';
    if (i === 5) return '"पुणे"';
    if (i === 6) return '"1 हे 23 आर"';
    if (i === 7) return '"123"';
    return '"NO"';
  }).join(", ");
  const sampleRow2 = FIXED_COLUMNS.map((c, i) => {
    if (i === 0) return '"DD/MM/YYYY"';
    if (i === 1) return '"document.pdf"';
    if (i === 2) return '"भोगवटादार वर्ग २"';
    if (i === 3) return '"शिरूर"';
    if (i === 4) return '"शिरूर"';
    if (i === 5) return '"पुणे"';
    if (i === 6) return '"1 हे 23 आर"';
    if (i === 7) return '"123"';
    if (c === "कुळ") return '"YES"';
    if (c === "इनाम") return '"YES"';
    return '"NO"';
  }).join(", ");

  return `You are an expert OCR and Land Record specialist for the Government of Maharashtra.

Analyze this Maharashtra 7/12 (Satbara) document and extract a structured table.

CRITICAL INSTRUCTIONS:
1. ACCURACY IS PARAMOUNT: Extract Marathi text EXACTLY as written in the document. Pay special attention to:
   - Village names (गाव): extract exactly, verify spelling
   - Taluka (तालुका): extract exactly
   - District (जिल्हा): extract exactly
   - Land type (भू-धारणा पद्धती): like "भोगवटादार वर्ग १" or "भोगवटादार वर्ग २"
   - Area (क्षेत्र): like "1 हे 23 आर" or "24 चौ. मी."
2. Return a SINGLE table (not one per page) with exactly 30 columns.
3. Use the exact column headers below — do NOT add, remove, or rename any column.
4. Each row represents ONE distinct survey entry (NOT one row per land type).
5. The first 8 columns (Date, File Name, भू-धारणा पद्धती, गाव, तालुका, जिल्हा, Total Area (क्षेत्र), शेवटचा फेरफार क्रमांक) must contain actual extracted data values and be the SAME across all rows.
6. For the remaining 22 columns (सीलिंग through तगाई), look at the document and determine if each specific land type or right is present. If the document shows/mentions that particular land type or right, put "YES". If it does NOT appear anywhere in the document, put "NO". Do NOT put land owner names, survey numbers, or area values in these columns — ONLY "YES" or "NO".
7. Never leave cells empty — use "NO" when inapplicable.
8. Never duplicate rows.
9. If you are unsure about any Marathi text, try your best to match the characters as closely as possible.

The 30 columns in order are:
${columns}

Return the response in this exact JSON format:
{
  "tables": [
    {
      "headers": [${columns}],
      "rows": [
        [${sampleRow1}],
        [${sampleRow2}]
      ]
    }
  ]
}`;
}

function normalizeYesNo(value: string): string {
  const lower = value.toLowerCase().trim();
  if (["yes", "y"].includes(lower)) return "YES";
  if (["no", "n"].includes(lower)) return "NO";
  return value;
}

function postProcessTables(data: any, fileName: string) {
  if (!data?.tables || !Array.isArray(data.tables)) {
    return { tables: [] };
  }

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  for (const table of data.tables) {
    if (!table.headers || !table.rows) continue;

    const dateIdx = table.headers.indexOf("Date");
    const fileNameIdx = table.headers.indexOf("File Name");

    table.rows = table.rows.map((row: string[]) => {
      const trimmed = row.map((cell: string) => (typeof cell === "string" ? cell.trim() : ""));
      if (dateIdx !== -1) trimmed[dateIdx] = dateStr;
      if (fileNameIdx !== -1) trimmed[fileNameIdx] = fileName;
      return trimmed.map((cell: string) => normalizeYesNo(cell));
    });

    table.rows = table.rows.filter((row: string[]) => row.some((cell: string) => cell !== ""));

    const seen = new Set<string>();
    table.rows = table.rows.filter((row: string[]) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return data;
}

async function extractLandRecordFromPath(filePath: string, fileName: string) {
  const fullPath = path.join(__dirname, filePath);
  const buffer = fs.readFileSync(fullPath);
  const base64Data = buffer.toString("base64");
  const ext = path.extname(fileName).toLowerCase();
  const mimeType = ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg";

  console.log(`[AI Extraction] Processing ${fileName}...`);

  const extractWithModel = async (modelName: string, lowThinking = false) => {
    const config: any = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          tables: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
              },
              required: ["headers", "rows"],
            },
          },
        },
        required: ["tables"],
      },
    };

    if (lowThinking && (modelName.includes("flash") || modelName.includes("gemini-3"))) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }

    return await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: [
            { text: generatePrompt() },
            { inlineData: { data: base64Data, mimeType } },
          ],
        },
      ],
      config,
    });
  };

  let response;
  try {
    response = await extractWithModel("gemini-3.1-flash-image-preview", false);
  } catch (error: any) {
    const isQuotaError = error.message?.includes("Quota exceeded") || error.status === 429 || error.message?.includes("429");
    if (isQuotaError) {
      console.warn("[AI Extraction] Quota exceeded. Falling back to Flash model...");
      response = await extractWithModel("gemini-2.0-flash", true);
    } else {
      throw error;
    }
  }

  if (!response.text) {
    throw new Error("The AI model returned an empty response.");
  }

  const data = JSON.parse(response.text);
  const result = postProcessTables(data, fileName);
  console.log("[AI Extraction] Success:", result);
  return result;
}

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

app.post("/api/extract", async (req, res) => {
  try {
    const { filePath, fileName } = req.body;
    if (!filePath || !fileName) {
      return res.status(400).json({ error: "filePath and fileName are required" });
    }
    const result = await extractLandRecordFromPath(filePath, fileName);
    res.json(result);
  } catch (error: any) {
    console.error("[AI Extraction] Error:", error.message);
    const detailedMessage = error.message?.includes("Quota exceeded")
      ? "API Quota exceeded. Please try again later."
      : error.message?.includes("safety")
        ? "Document blocked by safety filters."
        : `Extraction failed: ${error.message}`;
    res.status(500).json({ error: detailedMessage });
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
