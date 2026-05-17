import React from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { ExtractionResult } from "../types";

interface Props {
  result: ExtractionResult;
  filePath?: string;
  onEditRow?: (rowIndex: number) => void;
  onDeleteRow?: (rowIndex: number) => void;
}

const ResultsPreview: React.FC<Props> = ({ result, filePath, onEditRow, onDeleteRow }) => {
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
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {table.rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-slate-50 transition-colors">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-4 py-2 text-xs text-slate-600 whitespace-nowrap">{cell}</td>
                ))}
                <td className="px-4 py-2">
                  <div className="flex items-center justify-center gap-1">
                    {filePath && (
                      <button
                        onClick={() => window.open(filePath, '_blank')}
                        className="p-1 text-slate-400 hover:text-amber-500"
                        title="View PDF"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onEditRow && (
                      <button
                        onClick={() => onEditRow(ri)}
                        className="p-1 text-slate-400 hover:text-amber-500"
                        title="Edit Row"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onDeleteRow && (
                      <button
                        onClick={() => onDeleteRow(ri)}
                        className="p-1 text-slate-400 hover:text-red-500"
                        title="Delete Row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultsPreview;
