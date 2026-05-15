import React from "react";
import { ExtractionResult } from "../types";

interface Props {
  result: ExtractionResult;
}

const ResultsPreview: React.FC<Props> = ({ result }) => {
  if (!result?.tables?.length) return null;

  const table = result.tables[0];
  const rowCount = table.rows.length;
  const colCount = table.headers.length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
          {rowCount} records extracted
        </h3>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {rowCount} rows &times; {colCount} columns
        </span>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-widest font-bold text-slate-400">
              {table.headers.map((header, i) => (
                <th key={i} className="px-4 py-3 whitespace-nowrap">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {table.rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-slate-50 transition-colors">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-4 py-2 text-xs text-slate-600 whitespace-nowrap">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultsPreview;
