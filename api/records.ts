import type { VercelRequest, VercelResponse } from "@vercel/node";

interface Record {
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
  createdAt: string;
}

const STORAGE_KEY = "land_records";

async function getRecords(): Promise<Record[]> {
  const kv = await import("@vercel/kv");
  const records = await kv.default.get<Record[]>(STORAGE_KEY);
  return records || [];
}

async function saveRecords(records: Record[]): Promise<void> {
  const kv = await import("@vercel/kv");
  await kv.default.set(STORAGE_KEY, records);
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  try {
    if (request.method === "GET") {
      const {
        village,
        taluka,
        district,
        search,
        landType,
        startDate,
        endDate,
      } = request.query;

      let records = await getRecords();

      if (village) {
        records = records.filter((r) => r.village === village);
      }
      if (landType) {
        records = records.filter((r) =>
          r.landType.toLowerCase().includes(String(landType).toLowerCase())
        );
      }
      if (search) {
        const s = String(search).toLowerCase();
        records = records.filter(
          (r) =>
            r.fileName.toLowerCase().includes(s) ||
            r.village.toLowerCase().includes(s) ||
            r.taluka.toLowerCase().includes(s) ||
            r.district.toLowerCase().includes(s) ||
            r.landType.toLowerCase().includes(s)
        );
      }
      if (startDate) {
        records = records.filter((r) => r.createdAt >= String(startDate));
      }
      if (endDate) {
        records = records.filter((r) => r.createdAt <= String(endDate));
      }

      records.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return response.status(200).json(records);
    }

    if (request.method === "POST") {
      const {
        id,
        fileName,
        filePath,
        landType,
        village,
        taluka,
        district,
        area,
        mutationNumber,
        confidence,
      } = request.body;

      const records = await getRecords();

      const existingIndex = records.findIndex(
        (r) =>
          r.id === id || (r.fileName === fileName && r.village === village)
      );

      if (existingIndex >= 0 && request.body.isNew) {
        return response
          .status(409)
          .json({ error: "Duplicate record detected" });
      }

      const newRecord: Record = {
        id,
        fileName,
        filePath,
        landType,
        village,
        taluka,
        district,
        area,
        mutationNumber,
        confidence,
        createdAt: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        records[existingIndex] = newRecord;
      } else {
        records.push(newRecord);
      }

      await saveRecords(records);

      return response.status(200).json({ success: true });
    }

    if (request.method === "DELETE") {
      const id = request.query.id as string;

      if (!id) {
        return response.status(400).json({ error: "ID required" });
      }

      const records = await getRecords();
      const filtered = records.filter((r) => r.id !== id);
      await saveRecords(filtered);

      return response.status(200).json({ success: true });
    }

    return response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return response.status(500).json({ error: (error as Error).message });
  }
}