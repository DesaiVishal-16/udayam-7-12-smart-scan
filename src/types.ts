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

export interface ExtractionResult extends Omit<LandRecord, 'id' | 'filePath' | 'createdAt'> {
  // Utility for temporary extraction state
}
