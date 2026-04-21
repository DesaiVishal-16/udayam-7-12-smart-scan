import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
if (!apiKey) {
  console.warn("GEMINI_API_KEY is not defined in the environment.");
}

const ai = new GoogleGenAI({ apiKey });

export async function extractLandRecord(file: File): Promise<any> {
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
            landType: { type: Type.STRING },
            village: { type: Type.STRING },
            taluka: { type: Type.STRING },
            district: { type: Type.STRING },
            area: { type: Type.STRING },
            mutationNumber: { type: Type.INTEGER },
            confidence: { type: Type.NUMBER }
          },
          required: ["landType", "village", "taluka", "district", "area", "mutationNumber", "confidence"]
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
              {
                text: `You are an expert OCR and Land Record specialist for the Government of Maharashtra.
                Analyze this Maharashtra 7/12 (Satbara) document with extreme precision. 
                
                CRITICAL INSTRUCTIONS:
                1. This document may contain both PRINTED text and HANDWRITTEN annotations, remarks, or corrections in the margins.
                2. You MUST prioritize handwritten corrections or notes if they contradict printed text (as these often represent the latest legal updates).
                3. Identify handwritten "Mutation Numbers" (फेरफार क्रमांक), even if they are scribbled or circled.
                4. Carefully extract the "Land Area" (क्षेत्र) ensuring you capture the Hectors, Ares, and any sub-units correctly.
                
                Fields to extract:
                - Land Holding Type (भू-धारणा पद्धती): Look for text like "भोगवटादार वर्ग १" or similar.
                - Village (गाव): Name of the village.
                - Taluka (तालुका): Name of the taluka.
                - District (जिल्हा): Name of the district.
                - Land Area (क्षेत्र): Total area in standard format.
                - Last Mutation Number (शेवटचा फेरफार क्रमांक): The most recent mutation number found on the document (can be handwritten in margins).
                
                Identify the values accurately. If any value is missing, use "Not Found". For numbers, use 0.
                Return ONLY a JSON object with absolute confidence scoring.`
              },
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
      // Pro model gets high thinking for max accuracy
      response = await extractWithModel("gemini-3.1-pro-preview", false);
    } catch (error: any) {
      const isQuotaError = error.message?.includes("Quota exceeded") || error.status === 429 || error.message?.includes("429");
      if (isQuotaError) {
        console.warn("[AI Extraction] Pro model quota exceeded. Falling back to Flash model with optimized thinking...");
        // Flash model uses low thinking for speed
        response = await extractWithModel("gemini-3-flash-preview", true);
      } else {
        throw error;
      }
    }

    if (!response.text) {
      throw new Error("The AI model returned an empty response. This might be due to document legibility or model constraints.");
    }

    const data = JSON.parse(response.text);
    console.log("[AI Extraction] Success:", data);
    return data;
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
