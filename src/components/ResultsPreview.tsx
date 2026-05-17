import React, { useState } from "react";
import { Eye, Pencil, Trash2, Save, X } from "lucide-react";
import { ExtractionResult } from "../types";

interface Props {
  result: ExtractionResult;
  filePath?: string;
  onEditRow?: (rowIndex: number, newRow: string[]) => void;
  onDeleteRow?: (rowIndex: number) => void;
}

const ResultsPreview: React.FC<Props> = ({ result, filePath, onEditRow, onDeleteRow }) => {
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editData, setEditData] = useState<string[]>([]);

  if (!result?.tables?.length) return null;

  const table = result.tables[0];
  const rowCount = table.rows.length;
  const colCount = table.headers.length;

  const getCellClass = (cell: string, isEditing: boolean) => {
    if (isEditing) return "px-2 py-1 text-xs";
    const trimmed = cell.trim().toUpperCase();
    if (trimmed === "YES") return "px-4 py-2 text-xs font-bold text-red-600 bg-red-50 rounded";
    if (trimmed === "NO") return "px-4 py-2 text-xs font-bold text-emerald-600 bg-emerald-50 rounded";
    return "px-4 py-2 text-xs text-slate-600 whitespace-nowrap";
  };

  const startEdit = (rowIndex: number) => {
    setEditingRowIndex(rowIndex);
    setEditData([...table.rows[rowIndex]]);
  };

  const cancelEdit = () => {
    setEditingRowIndex(null);
    setEditData([]);
  };

  const saveEdit = () => {
    if (editingRowIndex !== null && onEditRow) {
      onEditRow(editingRowIndex, editData);
      setEditingRowIndex(null);
      setEditData([]);
    }
  };

  const handleCellChange = (colIndex: number, value: string) => {
    const newData = [...editData];
    newData[colIndex] = value;
    setEditData(newData);
  };

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
            {table.rows.map((row, ri) => {
              const isEditing = editingRowIndex === ri;
              return (
                <tr key={ri} className="hover:bg-slate-50 transition-colors">
                  {row.map((cell, ci) => (
                    <td key={ci} className={getCellClass(cell, isEditing)}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editData[ci] || ""}
                          onChange={(e) => handleCellChange(ci, e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-amber-300 rounded focus:border-amber-500 outline-none"
                        />
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center gap-1">
                      {filePath && !isEditing && (
                        <button
                          onClick={() => window.open(filePath, '_blank')}
                          className="p-1 text-slate-400 hover:text-amber-500"
                          title="View PDF"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isEditing ? (
                        <>
                          <button
                            onClick={saveEdit}
                            className="p-1 text-emerald-600 hover:scale-110"
                            title="Save"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1 text-slate-400 hover:text-red-500"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          {onEditRow && (
                            <button
                              onClick={() => startEdit(ri)}
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
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultsPreview;