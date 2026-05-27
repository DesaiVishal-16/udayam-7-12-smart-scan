import { GoogleGenAI, setDefaultBaseUrls, Type, ThinkingLevel } from "@google/genai";

setDefaultBaseUrls({ vertexUrl: "https://vertexai.googleapis.com" });

const project = process.env.GOOGLE_PROJECT_ID || "";
const location = process.env.GOOGLE_LOCATION || "us-central1";

if (!project) {
  console.warn("GOOGLE_PROJECT_ID is not defined in the environment.");
}

const ai = new GoogleGenAI({ vertexai: true, project, location });

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
- handwritten Marathi land documents
- old Devanagari administrative records

Your task is to perform HIGH-ACCURACY extraction from difficult handwritten Maharashtra land records while maintaining FAST execution speed.

CRITICAL:
Do NOT behave like a generic OCR engine.
Do NOT rely only on standard OCR layout blocks.

You must visually inspect:
- handwritten Marathi words
- faint ink strokes
- side annotations
- curved handwriting
- overwritten text
- low-contrast regions
- connected cursive characters
- margin notes
- circular handwritten markings
- old revenue terminology

Treat this as HUMAN-LIKE document reading.

==================================================
OCR READING STRATEGY
==================================================

1. First visually understand the document structure
2. Then inspect each handwritten region independently
3. Re-read unclear Marathi words character-by-character
4. Compare partially visible words against common Maharashtra revenue terminology
5. Use contextual reasoning ONLY as secondary support
6. Never ignore faint handwritten text
7. Never skip margin notes or side remarks
8. Pay special attention to legal land-category words
9. Distinguish visually similar Marathi words carefully
10. Avoid semantic guessing

==================================================
VERY IMPORTANT VALIDATION RULE
==================================================

DO NOT mark YES based only on contextual guessing.

A keyword may be marked YES ONLY IF:

1. At least 70% of the visible character structure matches visually
2. The handwritten stroke pattern resembles the Marathi word
3. The word is visually identifiable in the document
4. Multiple visible characters support the match
5. Context alone is NOT sufficient

If confidence is weak, unclear, partially imagined, or unsupported visually:
RETURN "NO"

A FALSE YES is worse than a FALSE NO.

==================================================
HIGH PRIORITY LEGAL KEYWORDS
==================================================

Actively inspect the document for these Marathi legal/revenue words even if handwritten, faint, partially visible, or curved:

भाडेपट्टा
नजर गहाण
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
तुकडेबंदी
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
- भाडेपट्टा
- नजर गहाण
- वक्फ
- इनाम
- पुनर्वसन
- भूमीधारी

These must be visually present.

Nearby legal context is NOT sufficient.

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
4. Use EXACTLY the provided 31 columns
5. Do NOT add/remove/rename columns
6. Each row = ONE unique survey/mutation entry
7. First 8 columns must contain actual extracted values
8. Remaining columns must contain ONLY:
   - "YES"
   - "NO"
9. Never leave cells empty
10. Never duplicate rows
11. Ignore decorative lines/borders/non-text artifacts
12. Never hallucinate unseen values
13. If uncertain, prefer NO over hallucinated YES
14. Printed and handwritten text both matter
15. Side notes and annotations also count

==================================================
COLUMN CLASSIFICATION RULE
==================================================

For columns:

"सीलिंग" through "वहिवाट"

Mark:
- "YES" ONLY if visually present in any form
- "NO" otherwise

Handwritten abbreviations count ONLY if visually recognizable.

Do NOT use contextual assumptions.

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

export async function extractLandRecord(file: File): Promise<{ tables: { headers: string[]; rows: string[][] }[] }> {
  try {
    const base64Data = await fileToBase64(file);
    const mimeType = file.type;

    console.log(`[AI Extraction] Processing ${file.name} (${mimeType})...`);

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
                  headers: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  rows: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  }
                },
                required: ["headers", "rows"]
              }
            }
          },
          required: ["tables"]
        }
      };

      if (lowThinking && (modelName.includes("flash") || modelName.includes("gemini-3"))) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }

      return await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            parts: [
              { text: generatePrompt() },
              {
                inlineData: {
                  data: base64Data.split(",")[1],
                  mimeType: mimeType
                }
              }
            ]
          }
        ],
        config
      });
    };

    let response;
    try {
      response = await extractWithModel("gemini-2.5-pro", false);
    } catch (error: any) {
      const isQuotaError = error.message?.includes("Quota exceeded") || error.status === 429 || error.message?.includes("429");
      if (isQuotaError) {
        console.warn("[AI Extraction] Pro model quota exceeded. Falling back to Flash model...");
        response = await extractWithModel("gemini-2.5-pro", true);
      } else {
        throw error;
      }
    }

    if (!response.text) {
      throw new Error("The AI model returned an empty response. This might be due to document legibility or model constraints.");
    }

    const data = JSON.parse(response.text);
    const result = postProcessTables(data, file);
    console.log("[AI Extraction] Success:", result);
    return result;
  } catch (error: any) {
    console.error("[AI Extraction] Error Detailed:", {
      message: error.message,
      file: file.name,
      status: error.status,
      type: error.constructor.name
    });

    const detailedMessage = error.message?.includes("Quota exceeded")
      ? "API Quota exceeded. Please try again later."
      : error.message?.includes("safety")
        ? "Document blocked by safety filters. Please ensure it's a standard land record."
        : `Extraction failed: ${error.message}`;

    throw new Error(detailedMessage);
  }
}

function postProcessTables(data: any, file: File): { tables: { headers: string[]; rows: string[][] }[] } {
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

      if (dateIdx !== -1) {
        trimmed[dateIdx] = dateStr;
      }
      if (fileNameIdx !== -1) {
        trimmed[fileNameIdx] = file.name;
      }

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

function normalizeYesNo(value: string): string {
  const lower = value.toLowerCase().trim();
  if (["yes", "y"].includes(lower)) return "YES";
  if (["no", "n"].includes(lower)) return "NO";
  return value;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export { FIXED_COLUMNS };
