import React, { useState, useCallback } from "react";
import { 
  Upload, 
  FileText, 
  Trash2, 
  Save, 
  Eye, 
  Pencil, 
  FileDown, 
  AlertCircle, 
  CheckCircle2,
  Loader2,
  X,
  ChevronRight,
  Database,
  BarChart3,
  Plus,
  Minus,
  ChevronLeft
} from "lucide-react";

// PDF Rendering
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
import { motion, AnimatePresence } from "motion/react";
import { useDropzone } from "react-dropzone";
import { extractLandRecord } from "../lib/gemini";
import { LandRecord, ExtractionResult } from "../types";
import { exportExtractionToExcel } from "../lib/excel";
import ResultsPreview from "./ResultsPreview";
import { cn } from "../lib/utils";

export default function Dashboard() {
  const [files, setFiles] = useState<File[]>([]);
  const [extractedRecords, setExtractedRecords] = useState<(LandRecord & { isDirty?: boolean })[]>([]);
  const [extractionResults, setExtractionResults] = useState<ExtractionResult[]>([]);
  const [resultFilePaths, setResultFilePaths] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<LandRecord | null>(null);
  const [zoom, setZoom] = useState(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
    setPageNumber(1);
  }

  const startNewBatch = () => {
    setExtractedRecords([]);
    setExtractionResults([]);
    setResultFilePaths([]);
    setFiles([]);
    addNotification('success', 'Terminal reset: Ready for new batch');
  };
  const [notifications, setNotifications] = useState<{ id: string; type: 'success' | 'error' | 'warning'; message: string }[]>([]);

  const addNotification = (type: 'success' | 'error' | 'warning', message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    }
  } as any);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleProcess = async () => {
    if (files.length === 0) return;
    setProcessing(true);
    setProgress({ current: 0, total: files.length });

    const newRecords: (LandRecord & { isDirty: boolean })[] = [];
    const newResults: ExtractionResult[] = [];
    const newResultPaths: string[] = [];
    
    // Process files in batches to respect rate limits while maintaining speed
    const BATCH_SIZE = 2; 
    let completedCount = 0;

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (file) => {
            try {
                // RUN UPLOAD AND EXTRACTION IN PARALLEL for the same file
                // This eliminates the sequential wait time.
                const uploadPromise = (async () => {
                   const formData = new FormData();
                   formData.append("file", file);
                   const uploadRes = await fetch("/api/upload", {
                       method: "POST",
                       headers: { "Accept": "application/json" },
                       body: formData
                   });

                   if (!uploadRes.ok) {
                       const errorText = await uploadRes.text();
                       throw new Error(`Cloud storage failure: ${uploadRes.status} ${errorText}`);
                   }

                   const contentType = uploadRes.headers.get("content-type");
                   if (!contentType || !contentType.includes("application/json")) {
                       const text = await uploadRes.text();
                       throw new Error("Received HTML instead of JSON from storage. Server might be restarting.");
                   }
                   return await uploadRes.json();
                })();

                const extractionPromise = extractLandRecord(file);

                const [uploadData, extraction] = await Promise.all([uploadPromise, extractionPromise]);
                const { filePath, fileName } = uploadData;

                newResults.push(extraction);
                newResultPaths.push(filePath);

                const firstRow = extraction.tables?.[0]?.rows?.[0] || [];
                const headers = extraction.tables?.[0]?.headers || [];
                const getCol = (name: string) => {
                  const idx = headers.indexOf(name);
                  return idx !== -1 ? firstRow[idx] || "" : "";
                };

                const record: LandRecord = {
                    id: Math.random().toString(36).substr(2, 9),
                    fileName,
                    filePath,
                    landType: getCol("भू-धारणा पद्धती") || "Unknown",
                    village: getCol("गाव") || "Unknown",
                    taluka: getCol("तालुका") || "Unknown",
                    district: getCol("जिल्हा") || "Unknown",
                    area: getCol("Total Area (क्षेत्र)") || "Unknown",
                    mutationNumber: 0,
                    confidence: 0.9
                };
                
                newRecords.push({ ...record, isDirty: false });
                handleSaveRecord(record, true);
            } catch (error: any) {
                console.error("Extraction failed for", file.name, error);
                const msg = error instanceof Error ? error.message : `System failure processing ${file.name}`;
                addNotification('error', msg);
            } finally {
                completedCount++;
                setProgress({ current: completedCount, total: files.length });
            }
        }));
    }

    setExtractedRecords(prev => [...newRecords, ...prev]);
    setExtractionResults(prev => [...prev, ...newResults]);
    setResultFilePaths(prev => [...prev, ...newResultPaths]);
    setFiles([]);
    setProcessing(false);
    addNotification('success', `Optimized Pipeline: Processed ${newRecords.length} assets`);
  };

  const handleSaveRecord = async (record: LandRecord, silent = false) => {
    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({ ...record, isNew: true })
      });

      if (res.status === 409) {
          // Silent update for duplicates
          await fetch("/api/records", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({ ...record, isNew: false })
          });
      } else if (!res.ok) {
          throw new Error("Persistence layer collision");
      }

      if (!silent) {
        addNotification('success', `Snapshot updated for ${record.village}`);
        setExtractedRecords(prev => prev.map(r => r.id === record.id ? { ...r, isDirty: false } : r));
      }
    } catch (error) {
      if (!silent) {
        addNotification('error', `Write error: ${(error as Error).message}`);
      }
    }
  };

  const updateField = (recordId: string, field: keyof LandRecord, value: string | number) => {
    setExtractedRecords(prev => prev.map(rec => 
      rec.id === recordId ? { ...rec, [field]: value, isDirty: true } : rec
    ));
  };

  const deleteCurrentRecord = (id: string) => {
    setExtractedRecords(prev => prev.filter(r => r.id !== id));
  };

  const toggleEdit = (id: string) => {
    setEditingId(prev => prev === id ? null : id);
  };

  const exportToExcel = () => {
    if (extractionResults.length === 0) return;
    const merged: ExtractionResult = { tables: [] };
    for (const r of extractionResults) {
      if (r.tables?.length) {
        merged.tables.push(...r.tables);
      }
    }
    if (merged.tables.length === 0) return;
    exportExtractionToExcel(merged, `Maharashtra_Land_Records_${Date.now()}.xlsx`);
  };

  return (
    <div className="w-full space-y-4 lg:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Extraction Dashboard</h2>
          <p className="text-slate-500 text-sm mt-1">Automatic Extraction and Batch Management</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            disabled={extractionResults.length === 0}
            onClick={exportToExcel}
            className="flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-600 font-bold hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50 text-xs uppercase tracking-widest"
          >
            <FileDown className="w-4 h-4" />
            Excel Export
          </button>
          <button 
            onClick={startNewBatch}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-sm transition-all text-xs uppercase tracking-widest"
          >
            <Plus className="w-4 h-4" />
            Add New Batch
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upload Section */}
        <div className="lg:col-span-1 space-y-6">
          <div 
            {...getRootProps()} 
            className={cn(
              "relative border border-slate-200 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer overflow-hidden group bg-white",
              isDragActive ? "bg-blue-50 border-blue-600" : "hover:border-blue-600"
            )}
          >
            <input {...getInputProps()} />
            <div className="w-16 h-16 bg-slate-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-slate-200">
              <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-600" />
            </div>
            <h3 className="font-bold text-slate-900 uppercase tracking-wide text-xs">Upload Documents</h3>
            <p className="text-[10px] text-slate-400 mt-2 uppercase tracking-widest px-4">JPG, PNG, PDF, Excel formats accepted</p>
            
            {isDragActive && (
                <div className="absolute inset-0 bg-blue-50 flex items-center justify-center pointer-events-none">
                    <div className="bg-white px-4 py-2 rounded-full shadow-lg text-blue-600 font-bold animate-bounce text-xs border border-slate-200">
                        Drop to Add
                    </div>
                </div>
            )}
          </div>

{files.length > 0 && (
             <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-6"
             >
               <div className="flex items-center justify-between mb-4">
                 <h4 className="font-bold text-slate-900 flex items-center gap-2 text-xs uppercase tracking-widest">
                   <FileText className="w-4 h-4 text-blue-600" />
                   Files Queue ({files.length})
                 </h4>
                 <button 
                   onClick={() => setFiles([])}
                   className="text-[10px] font-bold text-red-500 hover:underline uppercase tracking-widest"
                 >
                   Clear Queue
                 </button>
               </div>
               <div className="space-y-1.5 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                 {files.map((file, i) => (
                   <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg group">
                     <div className="flex items-center gap-3 overflow-hidden">
                       <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                       <span className="text-xs text-slate-600 truncate font-medium">{file.name}</span>
                     </div>
                     <button onClick={() => removeFile(i)} className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                       <X className="w-3.5 h-3.5" />
                     </button>
                   </div>
                 ))}
               </div>
               <button 
                 onClick={handleProcess}
                 disabled={processing}
                 className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3 text-sm"
               >
                {processing ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Extracting {progress.current}/{progress.total}...
                    </>
                ) : (
                    <>
                        Start Extraction
                        <ChevronRight className="w-4 h-4" />
                    </>
                )}
              </button>
            </motion.div>
          )}

          {/* Tips Section */}
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
            <h4 className="text-slate-900 font-bold mb-3 flex items-center gap-2 text-xs uppercase tracking-widest">
                <AlertCircle className="w-4 h-4 text-blue-600" />
                Guidelines
            </h4>
            <ul className="text-[11px] space-y-2 text-slate-500 font-medium leading-relaxed">
                <li className="flex gap-2"><span>●</span> Ensure images are high resolution and well-lit.</li>
                <li className="flex gap-2"><span>●</span> Include the entire document structure if possible.</li>
                
            </ul>
          </div>
        </div>

        {/* Results Section */}
        <div className="lg:col-span-2 space-y-6">
          {extractionResults.length > 0 && (
            <div className="space-y-4">
              {extractionResults.map((result, idx) => (
                <ResultsPreview
                  key={idx}
                  result={result}
                  filePath={resultFilePaths[idx]}
                  onEditRow={(ri, newRow) => {
                    const newResults = extractionResults.map((r, i) =>
                      i === idx ? { ...r, tables: r.tables.map((t, ti) => ti === 0 ? { ...t, rows: t.rows.map((row, rri) => rri === ri ? newRow : row) } : t) } : r
                    );
                    setExtractionResults(newResults);
                    addNotification('success', 'Row updated');
                  }}
                  onDeleteRow={(ri) => {
                    const newResults = extractionResults.map((r, i) =>
                      i === idx ? { ...r, tables: r.tables.map((t, ti) => ti === 0 ? { ...t, rows: t.rows.filter((_, rri) => rri !== ri) } : t) } : r
                    );
                    setExtractionResults(newResults);
                  }}
                />
              ))}
            </div>
          )}
          {extractionResults.length === 0 && (
             <div className="h-full min-h-[400px] border border-border-slate-200 border-dashed rounded-xl flex flex-col items-center justify-center text-center p-12 bg-white">
                <BarChart3 className="w-12 h-12 text-slate-100 mb-6" />
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Queue Status: Idle</h3>
                <p className="text-[11px] text-slate-400 mt-2 max-w-sm uppercase tracking-wider leading-relaxed">System is ready for document ingestion. Upload land documents to begin analysis.</p>
             </div>
          )}
        </div>
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
               className="relative w-full max-w-5xl bg-white rounded-xl overflow-hidden flex flex-col h-full shadow-2xl border border-border-slate-200"
            >
                <div className="p-5 border-b border-border-slate-200 flex items-center justify-between bg-bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm">
                            <Eye className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">{previewFile.fileName}</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Original Document View</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center bg-white border border-border-slate-200 rounded-lg px-2 py-1 gap-4 mr-4 shadow-sm">
                            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1 hover:text-amber-500 transition-colors disabled:opacity-30" disabled={zoom <= 0.5}><Minus className="w-4 h-4" /></button>
                            <span className="text-[10px] font-bold w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
                            <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-1 hover:text-amber-500 transition-colors disabled:opacity-30" disabled={zoom >= 3}><Plus className="w-4 h-4" /></button>
                        </div>
                        {previewFile.filePath.toLowerCase().endsWith(".pdf") && numPages > 1 && (
                            <div className="flex items-center bg-white border border-border-slate-200 rounded-lg px-2 py-1 gap-4 mr-4 shadow-sm">
                                <button onClick={() => setPageNumber(p => Math.max(1, p - 1))} className="p-1 hover:text-amber-500 transition-colors disabled:opacity-30" disabled={pageNumber <= 1}><ChevronLeft className="w-4 h-4" /></button>
                                <span className="text-[10px] font-bold w-16 text-center">{pageNumber} / {numPages}</span>
                                <button onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} className="p-1 hover:text-amber-500 transition-colors disabled:opacity-30" disabled={pageNumber >= numPages}><ChevronRight className="w-4 h-4" /></button>
                            </div>
                        )}
                        <button onClick={() => { setPreviewFile(null); setZoom(1); setPageNumber(1); setNumPages(0); }} className="p-2 hover:bg-white rounded-lg transition-colors border border-border-slate-200 shadow-sm">
                            <X className="w-4 h-4 text-slate-500" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 bg-slate-100 p-4 lg:p-10 overflow-auto flex justify-center items-start custom-scrollbar">
                    {previewFile.filePath.toLowerCase().endsWith(".pdf") ? (
                        <div className="w-full flex flex-col items-center gap-6 pb-20">
                            <div className="bg-white rounded-xl shadow-2xl overflow-hidden border border-border-slate-200 relative group transition-transform duration-200" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
                                <Document
                                    file={previewFile.filePath}
                                    onLoadSuccess={onDocumentLoadSuccess}
                                    loading={
                                        <div className="p-20 flex flex-col items-center gap-4">
                                            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rendering PDF Matrix...</p>
                                        </div>
                                    }
                                    error={
                                        <div className="p-20 text-center">
                                            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
                                            <p className="text-xs font-bold text-red-500 uppercase tracking-wider">Failed to Load PDF</p>
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
                                      className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2 hover:bg-emerald-600"
                                    >
                                        View Original
                                        <ChevronRight className="w-3 h-3" />
                                    </a>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white p-6 rounded-xl shadow-2xl border border-border-slate-200 transition-transform duration-200 ease-out h-fit mb-20" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
                            <img 
                                src={previewFile.filePath} 
                                alt="Document Preview" 
                                className="max-w-full h-auto rounded transition-all duration-500 grayscale-[20%] hover:grayscale-0 shadow-inner"
                                referrerPolicy="no-referrer"
                            />
                        </div>
                    )}
                </div>
                <div className="p-6 bg-white border-t border-border-slate-200 flex items-center justify-end">
                    <button 
                      onClick={() => setPreviewFile(null)}
                      className="px-8 py-2.5 bg-slate-900 text-white rounded-lg font-bold shadow-sm hover:opacity-90 transition-all text-xs uppercase tracking-widest"
                    >
                      Dismiss View
                    </button>
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notifications */}
      <div className="fixed bottom-8 right-8 z-[110] space-y-2 pointer-events-none">
        <AnimatePresence>
            {notifications.map((n) => (
                <motion.div 
                    key={n.id}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    className={cn(
                        "pointer-events-auto px-6 py-4 rounded-lg shadow-xl flex items-center gap-3 border min-w-[320px] bg-white",
                        n.type === 'success' ? "border-green-200 text-green-800" :
                        n.type === 'error' ? "border-red-200 text-red-800" :
                        "border-amber-500 text-amber-500"
                    )}
                >
                    <div className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                        n.type === 'success' ? "bg-green-50" : n.type === 'error' ? "bg-red-50" : "bg-orange-50"
                    )}>
                        {n.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {n.type === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
                        {n.type === 'warning' && <AlertCircle className="w-3.5 h-3.5" />}
                    </div>
                    <span className="font-bold text-[11px] uppercase tracking-wider">{n.message}</span>
                </motion.div>
            ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
