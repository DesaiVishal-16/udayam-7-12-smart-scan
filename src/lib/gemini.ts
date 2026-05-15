import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
if (!apiKey) {
  console.warn("GEMINI_API_KEY is not defined in the environment.");
}

const ai = new GoogleGenAI({ apiKey });

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
    return '"NO"';
  }).join(", ");

  return `You are an expert OCR and Land Record specialist for the Government of Maharashtra.

Analyze this Maharashtra 7/12 (Satbara) document and extract a structured table.

CRITICAL INSTRUCTIONS:
1. Return a SINGLE table (not one per page) with exactly 30 columns.
2. Use the exact column headers below — do NOT add, remove, or rename any column.
3. Each row represents ONE distinct survey entry (NOT one row per land type).
4. Document-level fields (Date, File Name, गाव, तालुका, जिल्हा, Total Area (क्षेत्र), शेवटचा फेरफार क्रमांक) must be the SAME across all rows.
5. For the 22 land type/right columns (सीलिंग through तगाई), use ONLY "YES" or "NO" — no names, no survey numbers, no area values.
6. Never leave cells empty — use "NO" when inapplicable.
7. Never duplicate rows.

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
      response = await extractWithModel("gemini-3.1-pro-preview", false);
    } catch (error: any) {
      const isQuotaError = error.message?.includes("Quota exceeded") || error.status === 429 || error.message?.includes("429");
      if (isQuotaError) {
        console.warn("[AI Extraction] Pro model quota exceeded. Falling back to Flash model with optimized thinking...");
        response = await extractWithModel("gemini-3-flash-preview", true);
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
