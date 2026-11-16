import React, { useState, useEffect } from 'react';
import {
  PlayCircle,
  Download,
  Upload,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  TrendingUp,
  Cpu,
  ShieldCheck,
  RefreshCw,
  Search
} from 'lucide-react';

export default function BatchProcessingView({ activePolicyVersion }) {
  const [isRunning, setIsRunning] = useState(false);
  const [batchResults, setBatchResults] = useState(null);
  const [selectedPolicyVersion, setSelectedPolicyVersion] = useState(activePolicyVersion || 'v5.0');
  const [policies, setPolicies] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const fetchPolicies = async () => {
    try {
      const res = await fetch('/api/policies');
      const data = await res.json();
      setPolicies(data.policies || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  useEffect(() => {
    if (activePolicyVersion) {
      setSelectedPolicyVersion(activePolicyVersion);
    }
  }, [activePolicyVersion]);

  const handleRunBatch = async (forcedPolicyVersion = null) => {
    setIsRunning(true);
    const ver = forcedPolicyVersion || selectedPolicyVersion;
    try {
      const res = await fetch(`/api/process-batch?policy_version=${ver}`, {
        method: 'POST'
      });
      const data = await res.json();
      setBatchResults(data);
      setCurrentPage(1);
    } catch (err) {
      alert('Batch execution failed: ' + err.message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleUploadCustomBatch = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRunning(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/process-batch?policy_version=${selectedPolicyVersion}`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setBatchResults(data);
      setCurrentPage(1);
    } catch (err) {
      alert('Custom batch upload failed: ' + err.message);
    } finally {
      setIsRunning(false);
    }
  };

  const rows = batchResults?.outputRows || [];
  const filteredRows = rows.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.pr_no.toLowerCase().includes(q) ||
      r.resolved_item_code.toLowerCase().includes(q) ||
      r.route.toLowerCase().includes(q) ||
      (r.supplier_id && r.supplier_id.toLowerCase().includes(q)) ||
      r.group_id.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <PlayCircle className="w-7 h-7 text-cyan-400" />
            Batch Processing & Blind Test Center
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Execute batch decision runs under active or versioned policies (Run 1: Policy v5.0, Run 2: Amended Policy).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/api/export-decisions"
            download="decisions_export.csv"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Decisions CSV</span>
          </a>
        </div>
      </div>

      {/* Blind Test Run Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Run 1 Box */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl" />
          <div className="flex items-center justify-between">
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-400 font-semibold border border-blue-500/30">
              Run 1: Base Policy v5.0
            </span>
            <span className="text-xs text-slate-400">Sample / Blind Batch</span>
          </div>

          <h3 className="text-base font-bold text-white mt-3">Process Batch under Policy v5.0</h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Applies standard Corvo Procurement Policy v5.0 (clubbing, ceiling tracking, preferred suppliers, PO consolidation).
          </p>

          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={() => handleRunBatch('v5.0')}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Execute Run 1 (v5.0)</span>
            </button>

            <a
              href="/api/export-decisions"
              download="run1_decisions_v5.0.csv"
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Run 1 CSV</span>
            </a>
          </div>
        </div>

        {/* Run 2 Box */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl" />
          <div className="flex items-center justify-between">
            <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-400 font-semibold border border-purple-500/30">
              Run 2: Policy Amendment
            </span>
            <span className="text-xs text-slate-400">Effective from Amendment Date</span>
          </div>

          <h3 className="text-base font-bold text-white mt-3">Reprocess Batch under Amended Policy</h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Applies the approved policy amendment dynamically without code change. Evaluates modified limits and new plant/category rules.
          </p>

          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <select
                value={selectedPolicyVersion}
                onChange={(e) => setSelectedPolicyVersion(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
              >
                {policies.map(p => (
                  <option key={p.version} value={p.version}>{p.version} ({p.status})</option>
                ))}
              </select>
              <button
                onClick={() => handleRunBatch(selectedPolicyVersion)}
                disabled={isRunning}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-purple-600/20 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Execute Run 2</span>
              </button>
            </div>

            <a
              href="/api/export-decisions"
              download="run2_decisions_amended.csv"
              className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Run 2 CSV</span>
            </a>
          </div>
        </div>
      </div>

      {/* Custom Batch Upload Section */}
      <div className="mt-6 p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
          <div>
            <h4 className="text-sm font-semibold text-white">Upload New Blind Batch CSV</h4>
            <p className="text-xs text-slate-400">Process new PR batch CSV received during blind testing.</p>
          </div>
        </div>

        <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold cursor-pointer transition-all">
          <Upload className="w-3.5 h-3.5 text-emerald-400" />
          <span>Upload CSV File</span>
          <input type="file" accept=".csv" className="hidden" onChange={handleUploadCustomBatch} />
        </label>
      </div>

      {/* Batch Results Preview Table */}
      {batchResults && (
        <div className="mt-6 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          {/* Table Header / Stats Bar */}
          <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> {batchResults.total_lines} Lines Processed
              </span>
              <span className="text-xs text-slate-400">
                Policy: <strong className="text-cyan-400">{batchResults.active_policy_version}</strong> • Requirements: <strong className="text-white">{batchResults.total_requirements}</strong>
              </span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search PR, item, route..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 w-48"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">PR Line</th>
                  <th className="py-3 px-4">Matched Item</th>
                  <th className="py-3 px-4">Group ID</th>
                  <th className="py-3 px-4">PO ID</th>
                  <th className="py-3 px-4">Decision</th>
                  <th className="py-3 px-4">Route</th>
                  <th className="py-3 px-4">Supplier / Price</th>
                  <th className="py-3 px-4">Requirement Value</th>
                  <th className="py-3 px-4">Policy Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {paginatedRows.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-mono font-medium text-cyan-400 whitespace-nowrap">
                      {r.pr_no}/{r.pr_line}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-mono font-semibold text-white">{r.resolved_item_code}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                      {r.group_id}
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-400 whitespace-nowrap">
                      {r.po_id || '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full font-semibold text-[11px] ${
                        r.decision === 'PO' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {r.decision}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-200 whitespace-nowrap">
                      {r.route}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {r.supplier_id ? (
                        <span>
                          <strong className="text-white">{r.supplier_id}</strong> @ ₹{r.unit_price}
                        </span>
                      ) : (
                        <span className="text-slate-400">{r.suggested_supplier_ids || '—'}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                      ₹{r.group_value_inr?.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-slate-400 max-w-xs truncate" title={r.reason}>
                      {r.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length} lines
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white"
              >
                Previous
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
