export interface ExtractionTable {
  headers: string[];
  rows: string[][];
}

export interface ExtractionResult {
  tables: ExtractionTable[];
}

export const FIXED_COLUMNS = [
  "Date", "File Name", "भू-धारणा पद्धती", "गाव", "तालुका", "जिल्हा",
  "Total Area (क्षेत्र)", "शेवटचा फेरफार क्रमांक", "सीलिंग",
  "Forest / वन / फॉरेस्ट / वने", "इनाम", "भूदान", "गावठाण", "कुळ",
  "वतन", "नवीन शर्त", "अतिक्रमण", "गुरे चरण/चरई", "देवस्थान",
  "कलम 36/36 अ आदिवासी", "पुनर्वसन", "भाडेपट्टा", "वक्फ",
  "तुकडा/तुकडेबंदी", "अ पा क", "एकुक", "नजर गहाण", "बडिंग",
  "भूमीधारी हक्क", "तगाई"
] as const;

export interface LandRecord {
  id: string;
  fileName: string;
  filePath: string;
  landType: string;
  village: string;
  taluka: string;
  district: string;
  area: string;
  mutationNumber: number;
  confidence: number;
  createdAt?: string;
  extractedData?: Record<string, string>;
}
