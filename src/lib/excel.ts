import * as XLSX from "xlsx";
import { ExtractionResult } from "../types";

export function exportExtractionToExcel(result: ExtractionResult, defaultFilename: string = "Extracted_Data.xlsx"): void {
  if (!result?.tables?.length) return;

  const headers = result.tables[0].headers;
  const allRows = result.tables.flatMap(t => t.rows);
  const data = [headers, ...allRows];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Extracted Data");
  XLSX.writeFile(workbook, defaultFilename);
}
