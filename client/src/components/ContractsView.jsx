import React, { useState, useEffect } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Download,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export default function ContractsView() {
  const [contracts, setContracts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);

  const fetchContracts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/contracts');
      const data = await res.json();
      setContracts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/contracts/upload-pdf', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setUploadResult(data);
        fetchContracts();
      } else {
        alert('Upload failed: ' + data.error);
      }
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <FileText className="w-7 h-7 text-cyan-400" />
            Rate Contracts Register
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Active and PDF-extracted rate contracts with real-time ceiling consumption and item schedules (Policy Section 4).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/20 cursor-pointer transition-all">
            <Upload className="w-4 h-4" />
            <span>Upload Signed Contract PDF</span>
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      {isUploading && (
        <div className="mt-4 p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3 text-slate-300 text-xs">
          <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <span>Parsing PDF contract terms, supplier details, ceiling and Schedule A items...</span>
        </div>
      )}

      {uploadResult && (
        <div className="mt-4 p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-emerald-200">
                Contract Ingested: {uploadResult.contract_id} with {uploadResult.supplier_name} ({uploadResult.supplier_id})
              </p>
              <p className="text-emerald-400/80 mt-0.5">
                Cap: ₹{Number(uploadResult.value_cap).toLocaleString('en-IN')} | Valid: {uploadResult.start_date} to {uploadResult.end_date} | Schedule A: {uploadResult.lines_count} items
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Contracts Table */}
      <div className="mt-6 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Registered Rate Contracts ({contracts.length})</h3>
          <span className="text-xs text-slate-400">Order of consumption: requirement creation date</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading contracts...</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {contracts.map(c => {
              const isExpanded = expandedId === c.contract_id;
              const cap = parseFloat(c.value_cap) || 0;
              const consumed = parseFloat(c.consumed_value) || 0;
              const pct = cap > 0 ? Math.min(100, Math.round((consumed / cap) * 100)) : 0;
              const isExhausted = pct >= 95;

              return (
                <div key={c.contract_id} className="p-5 hover:bg-slate-800/30 transition-all">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center shrink-0">
                        <FileText className="w-6 h-6 text-cyan-400" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-base text-white">{c.contract_id}</span>
                          {c.source && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              {c.source}
                            </span>
                          )}
                          {isExhausted && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              Ceiling Exhausted
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-semibold text-slate-200 mt-1">
                          {c.supplier_name} <span className="text-slate-400 font-mono text-xs">({c.supplier_id})</span>
                        </p>

                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Valid: {c.start_date} to {c.end_date}</span>
                          <span>•</span>
                          <span>{c.lines_count || c.lines?.length || 0} Schedule A Items</span>
                        </p>
                      </div>
                    </div>

                    {/* Ceiling Utilization */}
                    <div className="lg:w-72">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-400 font-medium">Ceiling Consumed:</span>
                        <span className="font-bold text-white">{c.consumed_formatted || `₹${consumed.toLocaleString('en-IN')}`} / {c.value_cap_formatted || `₹${cap.toLocaleString('en-IN')}`}</span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isExhausted ? 'bg-rose-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                        <span>{pct}% Utilized</span>
                        <span className="text-emerald-400 font-medium">
                          Remaining: {c.remaining_formatted || `₹${Math.max(0, cap - consumed).toLocaleString('en-IN')}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-end">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : c.contract_id)}
                      className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <span>{isExpanded ? 'Hide Schedule A' : 'View Schedule A Items & Rates'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Expanded Items Drawer */}
                  {isExpanded && c.lines && (
                    <div className="mt-3 pt-3 border-t border-slate-800 bg-slate-950/60 p-3 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 font-medium">
                            <th className="py-1.5 px-3">Item Code</th>
                            <th className="py-1.5 px-3">Description</th>
                            <th className="py-1.5 px-3">UoM</th>
                            <th className="py-1.5 px-3 text-right">Fixed Rate (INR)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {c.lines.map((l, i) => (
                            <tr key={i} className="hover:bg-slate-900/40">
                              <td className="py-1.5 px-3 font-mono font-semibold text-cyan-400">{l.item_code}</td>
                              <td className="py-1.5 px-3 text-slate-200">{l.description}</td>
                              <td className="py-1.5 px-3 text-slate-400">{l.uom}</td>
                              <td className="py-1.5 px-3 text-right font-bold text-white">₹{Number(l.rate).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
