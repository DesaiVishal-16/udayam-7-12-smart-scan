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
  "भूमीधारी हक्क", "तगाई", "वहिवाट"
];

function generatePrompt(): string {
  return `You are a forensic-grade OCR engine and Maharashtra Land Record specialist trained specifically on historical handwritten revenue records including:

- 7/12 extracts
- फेरफार registers
- mutation entries
- handwritten Marathi land records
- old Devanagari administrative documents

Your task is to perform HIGH-ACCURACY extraction from difficult handwritten Maharashtra land records while maintaining FAST execution speed.

CRITICAL:
Do NOT behave like a generic OCR engine.
Do NOT rely only on standard OCR layout parsing.

You must visually inspect:
- handwritten Marathi words
- faint ink strokes
- overwritten text
- low-contrast handwriting
- connected cursive characters
- merged syllables
- side annotations
- margin notes
- circular handwritten markings
- historical revenue terminology

Treat this as HUMAN-LIKE document reading.

==================================================
CRITICAL CORRECTION FOR "भाडेपट्टा" (LEASE) LOCATION
==================================================
Previous instructions incorrectly assumed "भाडेपट्टा" would be next to "नजर गहाण". THIS IS WRONG for many document layouts.

In the standard 7/12 format (like the one provided):
1. "नजर गहाण" (or "नजर गहाणदार") is typically found in the top-right quadrant under "इतर हक्क" (Other Rights).
2. "भाडेपट्टा" is frequently found in the BOTTOM-LEFT quadrant, specifically under the "कूळ आणि खंड" (Tenant and Rent) column.

TARGETED SEARCH FOR "भाडेपट्टा":
- Scan the lower half of the document, specifically the columns on the left side (under "वर्ष" and "कूळ आणि खंड").
- Look for lines starting with the cursive shape of "भाडेपट्टा".
- It often appears as part of a phrase like "भाडेपट्टा मुदत ३ साल" (Lease period 3 years).
- VISUAL SIGNATURE: Look for the starting characters "भा" (loop + vertical drop) and "डे" (vertical + sharp diagonal up-left). The "पट्टा" part may be a messy scribble (U-shape + dash).
- If you see this cursive "भाडे..." shape in the bottom-left tenancy section, YOU MUST MARK "भाडेपट्टा" AS "YES".

Do NOT tie the detection of "भाडेपट्टा" to "नजर गहाण". Search for them independently in their respective sections.

==================================================
OCR READING STRATEGY
==================================================

1. First visually understand the overall document structure
2. Then inspect each handwritten region independently
3. Re-read unclear Marathi words character-by-character
4. Examine stroke continuity carefully
5. Use contextual reasoning ONLY as secondary support
6. Never ignore faint handwritten text
7. Never skip margin notes or side remarks
8. Pay special attention to handwritten legal land-category words
9. Distinguish visually similar Marathi words carefully
10. Avoid semantic guessing without visual evidence

==================================================
COMPOUND HANDWRITTEN LEGAL WORD DETECTION
==================================================

Certain Maharashtra legal land terms are commonly written in highly connected, compressed, curved, partially merged, or faded handwriting.

Examples:
- तुकडेबंदी
- भाडेपट्टा
- नजर गहाण
- भूमीधारी
- पुनर्वसन

For these compound legal words:

1. Do NOT require perfectly separated characters
2. Allow merged syllables and connected strokes
3. Allow partial middle-character fading
4. Evaluate overall handwritten flow and legal word pattern
5. Match visible syllable groups instead of isolated characters
6. Prioritize holistic word-shape recognition over strict isolated-character OCR

Examples:
- "तुकडे...दी"
- "तु...डेबंदी"
- "भा...पट्टा"

may still represent valid legal terms.

If:
- beginning syllables match
- ending syllables match
- stroke continuity supports the word
- surrounding legal formatting supports the interpretation
- no better competing Marathi legal word exists

then mark the field as YES.

Do NOT reject compound handwritten legal terms merely because some middle characters are faded or merged.

==================================================
ADAPTIVE LEGAL WORD RECOGNITION
==================================================

Different Marathi legal words require different confidence thresholds.

For LONG and DISTINCTIVE legal words such as:
- भाडेपट्टा
- नजर गहाण
- भूमीधारी
- तुकडेबंदी
- पुनर्वसन

allow partial handwritten reconstruction when:
1. Key syllables are visible
2. Stroke continuity strongly resembles the word
3. The handwritten flow matches expected Marathi structure
4. Nearby legal context supports the interpretation
5. No better competing Marathi legal word exists

For SHORT or COMMON words such as:
- वन
- कुळ
- वतन
- तगाई

require stronger direct visual evidence.

Do NOT hallucinate short words from random curves or broken ink.

==================================================
VERY IMPORTANT VALIDATION RULE
==================================================

DO NOT mark YES based only on contextual guessing.

A keyword may be marked YES ONLY IF:
1. Visible character structure supports the word
2. Handwritten stroke flow resembles the Marathi word
3. Multiple visible characters or syllables support the interpretation
4. The word is visually identifiable from the document

Context alone is NOT sufficient.

For long distinctive compound legal terms:
partial reconstruction is allowed.

For short/common legal terms:
strict direct visibility is required.

A FALSE YES is worse than a FALSE NO.

==================================================
HIGH PRIORITY LEGAL KEYWORDS
==================================================

Actively inspect the document for these Marathi legal/revenue words even if handwritten, faint, partially visible, curved, compressed, or merged:

भाडेपट्टा
नजर गहाण
तुकडेबंदी
कुळ
इनाम
देवस्थान
वतन
गावठाण
फॉरेस्ट
वन
वने
भूदान
अतिक्रमण
भूमीधारी
तगाई
वहिवाट
पुनर्वसन
वक्फ
आदिवासी
चरई
सीलिंग

==================================================
ANTI-HALLUCINATION RULES
==================================================

Do NOT infer these words using nearby context alone:

- तगाई
- वन
- वतन
- कुळ
- वक्फ
- इनाम

These require stronger direct visual evidence.

If visual evidence is weak:
return "NO"

==================================================
EXTRACTION TASK
==================================================

Analyze this Maharashtra 7/12 (Saatbara) document and extract a structured table.

==================================================
CRITICAL EXTRACTION RULES
==================================================

1. Extract Marathi text EXACTLY as visually written
2. Preserve original Marathi spelling
3. Return EXACTLY one table
4. Use EXACTLY the provided 31 columns IN THE EXACT ORDER LISTED BELOW.
5. Do NOT add/remove/rename columns
6. Each row = ONE unique survey/mutation entry
7. First 8 columns must contain actual extracted values. If a value is missing or unreadable, output "Not Specified".
8. Remaining columns must contain ONLY:
  - "YES"
  - "NO"
9. Never leave cells empty
10. Never duplicate rows
11. Ignore decorative borders/non-text artifacts
12. Never hallucinate unseen values
13. Printed and handwritten text both matter
14. Side notes and annotations also count
15. Use balanced precision and recall

==================================================
COLUMN CLASSIFICATION RULE
==================================================

For columns:

"सीलिंग" through "वहिवाट"

Mark:
- "YES" ONLY if visually supported
- "NO" otherwise

Handwritten abbreviations count ONLY if visually recognizable.

Do NOT use pure contextual assumptions.

==================================================
31 REQUIRED COLUMNS
==================================================

"Date",
"File Name",
"भू-धारणा पद्धती",
"गाव",
"तालुका",
"जिल्हा",
"Total Area (क्षेत्र)",
"शेवटचा फेरफार क्रमांक",
"सीलिंग",
"Forest / वन / फॉरेस्ट / वने",
"इनाम",
"भूदान",
"गावठाण",
"कुळ",
"वतन",
"नवीन शर्त",
"अतिक्रमण",
"गुरे चरण/चरई",
"देवस्थान",
"कलम 36/36 अ आदिवासी",
"पुनर्वसन",
"भाडेपट्टा",
"वक्फ",
"तुकडा/तुकडेबंदी",
"अ पा क",
"एकुक",
"नजर गहाण",
"बडिंग",
"भूमीधारी हक्क",
"तगाई",
"वहिवाट"

==================================================
OUTPUT FORMAT
==================================================

Return ONLY valid JSON.

{
 "tables": [
  {
   "headers": [...],
   "rows": [
    [...],
    [...]
   ]
  }
 ]
}

No markdown.
No explanation.
No commentary.
No additional text.`;
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

    const landTypeIdx = table.headers.indexOf("भू-धारणा पद्धती");
    const bhadepatnaIdx = table.headers.indexOf("भाडेपट्टा");
    if (landTypeIdx !== -1 && bhadepatnaIdx !== -1) {
      for (const row of table.rows) {
        if (row[bhadepatnaIdx] !== "YES") {
          const landTypeVal = row[landTypeIdx] || "";
          if (landTypeVal.includes("भाडे") || landTypeVal.includes("भाडेपट्टा")) {
            row[bhadepatnaIdx] = "YES";
          }
        }
      }
    }

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
    response = await extractWithModel("gemini-3.5-pro", false);
  } catch (error: any) {
    const isQuotaError = error.message?.includes("Quota exceeded") || error.status === 429 || error.message?.includes("429");
    if (isQuotaError) {
      console.warn("[AI Extraction] Quota exceeded. Falling back to Flash model...");
      response = await extractWithModel("gemini-3.5-pro", true);
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
