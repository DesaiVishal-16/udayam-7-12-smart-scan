export interface ExtractionTable {
  headers: string[];
  rows: string[][];
}

export interface ExtractionResult {
  tables: ExtractionTable[];
}

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
}
