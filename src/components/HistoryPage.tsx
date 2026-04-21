import React, { useState, useEffect } from "react";
import { 
  Search, 
  Filter, 
  Calendar, 
  MapPin, 
  Eye, 
  Trash2, 
  FileDown, 
  Download,
  AlertCircle,
  FileText,
  X,
  RefreshCw,
  Loader2,
  Plus,
  Minus,
  ChevronRight,
  ChevronLeft
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { LandRecord } from "../types";
import * as XLSX from "xlsx";
import { cn } from "../lib/utils";

// PDF Rendering
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function HistoryPage() {
  const [records, setRecords] = useState<LandRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [villageFilter, setVillageFilter] = useState("");
  const [landTypeFilter, setLandTypeFilter] = useState("");
  const [previewFile, setPreviewFile] = useState<LandRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
    setPageNumber(1);
  }

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        village: villageFilter,
        landType: landTypeFilter
      });
      const res = await fetch(`/api/records?${params}`, {
        headers: { "Accept": "application/json" }
      });

      if (!res.ok) {
        let errorData;
        try {
          errorData = await res.json();
        } catch {
          const text = await res.text();
          throw new Error(`Archive failure [${res.status}]: ${text.slice(0, 100)}...`);
        }
        throw new Error(errorData.error || `Archive error [${res.status}]`);
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Data format error: Received HTML instead of JSON. Server might be restarting or route is mismatched. Response start: ${text.slice(0, 50)}...`);
      }

      const data = await res.json();
      setRecords(data);
    } catch (error) {
      console.error("Historical Data Link Interruption:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [search, villageFilter, landTypeFilter]);

  const handleDelete = async (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await fetch(`/api/records/${deleteId}`, { method: "DELETE" });
      setRecords(prev => prev.filter(r => r.id !== deleteId));
    } catch (error) {
      console.error("Failed to delete record:", error);
    } finally {
      setDeleteId(null);
    }
  };

  const exportAll = () => {
    if (records.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(records.map(r => ({
      'Extraction Date': new Date(r.createdAt || "").toLocaleDateString(),
      'File Name': r.fileName,
      'भू-धारणा पद्धती': r.landType,
      'गाव': r.village,
      'तालुका': r.taluka,
      'जिल्हा': r.district,
      'क्षेत्र (Area)': r.area,
      'फेरफार क्रमांक': r.mutationNumber,
      'Confidence': `${((r.confidence || 0) * 100).toFixed(1)}%`
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Full Archive");
    XLSX.writeFile(workbook, `Maharashtra_History_Export_${Date.now()}.xlsx`);
  };

  const uniqueVillages = Array.from(new Set(records.map(r => r.village))).filter(Boolean);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Repository Archive</h2>
          <p className="text-slate-500 text-sm mt-1">Audit log of all processed documents</p>
        </div>
        <button 
          onClick={exportAll}
          disabled={records.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:opacity-90 text-white rounded-lg font-bold shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 flex-shrink-0 text-sm"
        >
          <Download className="w-4 h-4" />
          Export Database
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col lg:flex-row gap-4 bg-white">
        <div className="flex-1 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-slate-gold transition-colors" />
          <input 
            type="text"
            placeholder="Search filenames, villages, regions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border-none rounded-lg py-2.5 pl-10 pr-4 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:ring-1 focus:ring-slate-gold transition-all outline-none"
          />
        </div>
        <div className="flex gap-4">
          <div className="relative min-w-[180px]">
             <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
             <select 
               value={villageFilter}
               onChange={(e) => setVillageFilter(e.target.value)}
               className="w-full bg-slate-50 border-none rounded-lg py-2.5 pl-10 pr-10 text-[11px] font-bold uppercase tracking-widest text-slate-500 appearance-none focus:ring-1 focus:ring-slate-gold transition-all outline-none"
             >
                <option value="">Region: All</option>
                {uniqueVillages.map(v => (
                    <option key={v} value={v}>{v}</option>
                ))}
             </select>
          </div>
          <div className="relative min-w-[180px]">
             <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
             <select 
               value={landTypeFilter}
               onChange={(e) => setLandTypeFilter(e.target.value)}
               className="w-full bg-slate-50 border-none rounded-lg py-2.5 pl-10 pr-10 text-[11px] font-bold uppercase tracking-widest text-slate-500 appearance-none focus:ring-1 focus:ring-slate-gold transition-all outline-none"
             >
                <option value="">Holding: All</option>
                <option value="भोगवटादार वर्ग -1">भोगवटादार वर्ग -1</option>
                <option value="भोगवटादार वर्ग -2">भोगवटादार वर्ग -2</option>
             </select>
          </div>
          <button 
            onClick={() => { setSearch(""); setVillageFilter(""); setLandTypeFilter(""); }}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 hover:text-slate-gold transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Records Grid/Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
             <div className="p-20 flex flex-col items-center justify-center text-center">
                <Loader2 className="w-8 h-8 text-slate-gold animate-spin mb-4" />
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Querying database...</p>
            </div>
        ) : records.length > 0 ? (
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-widest font-bold text-slate-400 bg-slate-50">
                            <th className="px-8 py-4">Ingestion Source</th>
                            <th className="px-8 py-4">Regional Metadata</th>
                            <th className="px-8 py-4">Land Area</th>
                            <th className="px-8 py-4">Entity Details</th>
                            <th className="px-8 py-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-slate-200 bg-white">
                        {records.map((record) => (
                            <motion.tr 
                                key={record.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="group hover:bg-slate-50 transition-colors"
                            >
                                <td className="px-8 py-5">
                                    <div className="flex items-center gap-4">
                                        <div className="w-9 h-9 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <FileText className="w-4 h-4 text-slate-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-900">{record.fileName}</p>
                                            <div className="flex items-center gap-1.5 mt-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(record.createdAt || "").toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-8 py-5">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-xs text-slate-900 flex items-center gap-2">
                                            {record.village}
                                            <span className="bg-[#E7F3E5] text-[#2E5C31] text-[8px] px-2 py-0.5 rounded-full uppercase tracking-widest">Verified</span>
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{record.taluka} / {record.district}</span>
                                    </div>
                                </td>
                                <td className="px-8 py-5">
                                    <span className="text-xs font-bold text-emerald-600">{record.area}</span>
                                </td>
                                <td className="px-8 py-5">
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2">
                                             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Type:</span>
                                             <span className="text-[10px] font-semibold text-slate-600 uppercase">{record.landType}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Mutation:</span>
                                             <span className="text-[10px] font-bold text-slate-gold">#{record.mutationNumber}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-8 py-5">
                                    <div className="flex items-center justify-center gap-2">
                                        <button 
                                            onClick={() => window.open(record.filePath, '_blank')}
                                            className="p-1.5 text-slate-400 hover:text-slate-gold"
                                        >
                                            <Eye className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => setDeleteId(record.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-500"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </motion.tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ) : (
            <div className="p-20 flex flex-col items-center justify-center text-center bg-white">
                <div className="w-16 h-16 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center mb-6">
                    <Search className="w-8 h-8 text-slate-200" />
                </div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Archive Empty</h3>
                <p className="text-[11px] text-slate-400 mt-2 max-w-sm mx-auto uppercase tracking-wider leading-relaxed">No data detected for current parameters. Please ingest source documents via the terminal.</p>
            </div>
        )}
      </div>

       {/* Preview Modal */}
       <AnimatePresence>
        {previewFile && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-20">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setPreviewFile(null)}
               className="absolute inset-0 bg-[#2D332A]/90 blur-sm"
            />
            <motion.div 
               initial={{ scale: 0.95, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.95, opacity: 0 }}
               className="relative w-full max-w-5xl bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col h-full shadow-2xl"
            >
                <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-md">
                            <Eye className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">{previewFile.fileName}</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Historical Asset View</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 gap-4 mr-4 shadow-sm">
                            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1 hover:text-slate-gold transition-colors disabled:opacity-30" disabled={zoom <= 0.5}><Minus className="w-4 h-4" /></button>
                            <span className="text-[10px] font-bold w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
                            <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-1 hover:text-slate-gold transition-colors disabled:opacity-30" disabled={zoom >= 3}><Plus className="w-4 h-4" /></button>
                        </div>
                        {previewFile.filePath.toLowerCase().endsWith(".pdf") && numPages > 1 && (
                            <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 gap-4 mr-4 shadow-sm">
                                <button onClick={() => setPageNumber(p => Math.max(1, p - 1))} className="p-1 hover:text-slate-gold transition-colors disabled:opacity-30" disabled={pageNumber <= 1}><ChevronLeft className="w-4 h-4" /></button>
                                <span className="text-[10px] font-bold w-16 text-center">{pageNumber} / {numPages}</span>
                                <button onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} className="p-1 hover:text-slate-gold transition-colors disabled:opacity-30" disabled={pageNumber >= numPages}><ChevronRight className="w-4 h-4" /></button>
                            </div>
                        )}
                        <button onClick={() => { setPreviewFile(null); setZoom(1); setPageNumber(1); setNumPages(0); }} className="p-2 hover:bg-white rounded-lg transition-colors border border-slate-200 shadow-sm">
                            <X className="w-4 h-4 text-slate-500" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 bg-slate-100 p-4 lg:p-10 overflow-auto flex justify-center items-start custom-scrollbar">
                    {previewFile.filePath.toLowerCase().endsWith(".pdf") ? (
                         <div className="w-full flex flex-col items-center gap-6 pb-20">
                            <div className="bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200 relative group transition-transform duration-200" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
                                <Document
                                    file={previewFile.filePath}
                                    onLoadSuccess={onDocumentLoadSuccess}
                                    loading={
                                        <div className="p-20 flex flex-col items-center gap-4">
                                            <div className="w-10 h-10 border-4 border-slate-gold border-t-transparent rounded-full animate-spin" />
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Retrieving Archive Matrix...</p>
                                        </div>
                                    }
                                    error={
                                        <div className="p-20 text-center">
                                            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
                                            <p className="text-xs font-bold text-red-500 uppercase tracking-wider">Failed to Load History PDF</p>
                                        </div>
                                    }
                                >
                                    <Page 
                                        pageNumber={pageNumber} 
                                        width={800} 
                                        renderMode="canvas"
                                        className="shadow-inner"
                                    />
                                </Document>
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    <a 
                                      href={previewFile.filePath} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="bg-bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2 hover:bg-emerald-600"
                                    >
                                        View Original
                                        <ChevronRight className="w-3 h-3" />
                                    </a>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white p-6 rounded-xl shadow-2xl border border-slate-200 transition-transform duration-200 ease-out h-fit mb-20" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
                            <img 
                                src={previewFile.filePath} 
                                alt="Document Preview" 
                                className="max-w-full h-auto rounded transition-all duration-500 grayscale-[20%] hover:grayscale-0 shadow-inner"
                                referrerPolicy="no-referrer"
                            />
                        </div>
                    )}
                </div>
                <div className="p-6 bg-white border-t border-slate-200 flex items-center justify-between gap-4">
                     <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                         Note: Extraction results are immutable in archive view.
                     </p>
                    <button 
                      onClick={() => setPreviewFile(null)}
                      className="px-8 py-2.5 bg-bg-blue-600 text-white rounded-lg font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all text-xs uppercase tracking-widest"
                    >
                      Exit Archive
                    </button>
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteId(null)}
              className="absolute inset-0 bg-[#2D332A]/90 blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xl"
            >
              <div className="p-6 text-center">
                <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-7 h-7 text-red-500" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">Delete Record?</h3>
                <p className="text-xs text-slate-500">This action cannot be undone. The record will be permanently removed from the archive.</p>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-center gap-3">
                <button 
                  onClick={() => setDeleteId(null)}
                  className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold shadow-sm hover:bg-slate-50 active:scale-95 transition-all text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDelete}
                  className="px-6 py-2.5 bg-red-500 text-white rounded-lg font-bold shadow-sm hover:bg-red-600 active:scale-95 transition-all text-xs uppercase tracking-widest"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
