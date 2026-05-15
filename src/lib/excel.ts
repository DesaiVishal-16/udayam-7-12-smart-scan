import * as XLSX from "xlsx";
import { ExtractionResult } from "../types";

export function exportExtractionToExcel(result: ExtractionResult, defaultFilename: string = "Extracted_Data.xlsx"): void {
  if (!result?.tables?.length) return;

  const table = result.tables[0];
  const data = [table.headers, ...table.rows];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Extracted Data");
  XLSX.writeFile(workbook, defaultFilename);
}
