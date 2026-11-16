import React, { useState, useEffect } from 'react';
import {
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileText,
  Upload,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  PlusCircle,
  Clock,
  Layers,
  ChevronRight
} from 'lucide-react';

export default function PolicyStudio({ onPolicyActivated }) {
  const [policies, setPolicies] = useState([]);
  const [activePolicy, setActivePolicy] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Amendment form
  const [amendmentText, setAmendmentText] = useState('');
  const [proposedVersion, setProposedVersion] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('2026-11-20');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  const fetchPolicies = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/policies');
      const data = await res.json();
      setPolicies(data.policies || []);
      const active = data.policies.find(p => p.version === data.active_version) || data.policies[0];
      setActivePolicy(active);
      setProposedVersion(`v5.${data.policies.length}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const handleProposeAmendment = async (textToUse = null) => {
    const text = textToUse || amendmentText;
    if (!text.trim()) return;

    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/policies/propose-amendment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          version: proposedVersion || `v5.${policies.length}`,
          effective_date: effectiveDate
        })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data);
      }
    } catch (err) {
      alert('Analysis failed: ' + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('version', proposedVersion || `v5.${policies.length}`);
    formData.append('effective_date', effectiveDate);

    try {
      const res = await fetch('/api/policies/propose-amendment', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data);
      }
    } catch (err) {
      alert('PDF Amendment analysis failed: ' + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleActivate = async (version) => {
    try {
      const res = await fetch(`/api/policies/${version}/activate`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        alert(`Policy ${version} is now ACTIVE!`);
        setAnalysisResult(null);
        setAmendmentText('');
        fetchPolicies();
        if (onPolicyActivated) onPolicyActivated(version);
      }
    } catch (err) {
      alert('Activation failed: ' + err.message);
    }
  };

  const presetAmendments = [
    {
      title: "Increase Spot Limit to ₹3,00,000",
      text: "Increase spot limit from 200000 to 300000 effective 2026-11-20"
    },
    {
      title: "Plant CHK1 Specific Limit (₹2.5L)",
      text: "For plant CHK1, spot limit is 250000 effective 2026-11-20"
    },
    {
      title: "Electrical Spares > ₹5L to RFP",
      text: "Electrical Spares above 500000 must go to RFP with 5 quotes effective 2026-11-20"
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Sliders className="w-7 h-7 text-cyan-400" />
            Procurement Policy Studio (Policy as Data)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Rules, limits, and order of precedence are stored as versioned data. Upload amendments or describe changes in chat with zero code change.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300">
            Active: <strong className="text-cyan-400">{activePolicy?.version}</strong> ({activePolicy?.effective_date})
          </span>
        </div>
      </div>

      {/* Active Policy Metadata Card */}
      {activePolicy && (
        <div className="mt-6 bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                  CURRENT ACTIVE POLICY
                </span>
                <span className="text-xs text-slate-400 font-mono">{activePolicy.document_id}</span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1.5">{activePolicy.title} ({activePolicy.version})</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Effective Date: <strong className="text-slate-200">{activePolicy.effective_date}</strong> • Applicable Plants: <strong className="text-slate-200">{activePolicy.applicable_plants?.join(', ')}</strong> • Owner: <strong className="text-slate-200">{activePolicy.owner}</strong>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700/60">
                <span className="text-[10px] text-slate-400 uppercase block">Clubbing</span>
                <span className="text-sm font-bold text-white">{activePolicy.clubbing?.creation_window_days} Days</span>
              </div>
              <div className="bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700/60">
                <span className="text-[10px] text-slate-400 uppercase block">Need-By Buffer</span>
                <span className="text-sm font-bold text-white">±{activePolicy.clubbing?.need_by_window_days} Days</span>
              </div>
              <div className="bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700/60">
                <span className="text-[10px] text-slate-400 uppercase block">Consolidation</span>
                <span className="text-sm font-bold text-white">{activePolicy.consolidation?.window_hours} Hours</span>
              </div>
            </div>
          </div>

          {/* Rules Table */}
          <div className="mt-5">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Order of Precedence & Decision Rules:
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="py-2.5 px-3">Priority / Rule</th>
                    <th className="py-2.5 px-3">Condition</th>
                    <th className="py-2.5 px-3">Decision</th>
                    <th className="py-2.5 px-3">Route</th>
                    <th className="py-2.5 px-3">Supplier Assignment / Pricing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {activePolicy.rules?.map((rule, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-semibold text-cyan-400">
                        {rule.clause || rule.id} — {rule.name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {rule.conditions?.item_type ? `Item type in [${rule.conditions.item_type.join(', ')}]` : ''}
                        {rule.conditions?.has_active_contract_with_ceiling ? 'Active rate contract with available ceiling' : ''}
                        {rule.conditions?.emergency ? 'Emergency = true, ' : ''}
                        {rule.conditions?.value_max ? `Value <= ₹${rule.conditions.value_max.toLocaleString('en-IN')}` : ''}
                        {rule.conditions?.value_min ? `Value >= ₹${rule.conditions.value_min.toLocaleString('en-IN')}` : ''}
                        {rule.conditions?.bought_active_days ? `, bought in last ${rule.conditions.bought_active_days}d` : ''}
                        {rule.conditions?.plant ? `, Plant = ${rule.conditions.plant}` : ''}
                        {rule.conditions?.category ? `, Category = ${rule.conditions.category}` : ''}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          rule.outcome.decision === 'PO' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}>
                          {rule.outcome.decision}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-medium text-white">
                        {rule.outcome.route}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {rule.outcome.supplier_selection} {rule.outcome.pricing ? `(${rule.outcome.pricing})` : ''} {rule.outcome.supplier_count ? `(Suggest ${rule.outcome.supplier_count})` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Amendment Proposal Studio */}
      <div className="mt-8 bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-bold text-white">Propose Policy Amendment (Zero Code Change)</h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Upload an official Procurement Policy Amendment PDF or describe the desired changes in natural language. The system parses limits, conditions, and plant/category rules, generates a plain-language diff, and prepares the new version for approval.
        </p>

        {/* Quick Preset Buttons */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-400 font-medium">Try Presets:</span>
          {presetAmendments.map((p, idx) => (
            <button
              key={idx}
              onClick={() => {
                setAmendmentText(p.text);
                handleProposeAmendment(p.text);
              }}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all cursor-pointer"
            >
              {p.title}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-300 mb-1">Describe Policy Change or Paste Amendment Text:</label>
            <textarea
              rows={3}
              placeholder="e.g. For plant CHK1, spot PO limit is 3,00,000 effective 2026-11-20. Or upload amendment document..."
              value={amendmentText}
              onChange={(e) => setAmendmentText(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">New Version ID:</label>
              <input
                type="text"
                value={proposedVersion}
                onChange={(e) => setProposedVersion(e.target.value)}
                placeholder="v5.1"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Effective Date:</label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold cursor-pointer transition-all">
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>Upload Amendment PDF Document</span>
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
          </label>

          <button
            onClick={() => handleProposeAmendment()}
            disabled={!amendmentText.trim() || isAnalyzing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing Amendment...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Parse & Generate Policy Diff</span>
              </>
            )}
          </button>
        </div>

        {/* Diff & Approval Box */}
        {analysisResult && (
          <div className="mt-6 p-5 rounded-2xl bg-slate-950 border border-cyan-800/60 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Proposed Policy Diff ({analysisResult.draftPolicy.version})</h3>
              </div>
              <span className="text-xs text-cyan-300 font-medium">Effective: {analysisResult.draftPolicy.effective_date}</span>
            </div>

            <div className="mt-3 p-3 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-200 leading-relaxed">
              <strong>Plain Language Summary:</strong> {analysisResult.plainLanguageSummary}
            </div>

            {/* Diffs List */}
            <div className="mt-4 space-y-2">
              {analysisResult.diffs.map((d, i) => (
                <div key={i} className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                  <div className="flex items-center justify-between font-semibold text-white">
                    <span>{d.target}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">{d.type}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-4 text-slate-300">
                    <div className="p-2 rounded bg-slate-950 border border-rose-900/30">
                      <span className="text-[10px] text-rose-400 block font-semibold">PREVIOUS</span>
                      <span className="text-xs line-through text-slate-400">{d.old_value}</span>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-emerald-900/30">
                      <span className="text-[10px] text-emerald-400 block font-semibold">NEW VALUE</span>
                      <span className="text-xs font-semibold text-emerald-300">{d.new_value}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Activation Button */}
            <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                onClick={() => setAnalysisResult(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Discard Draft
              </button>
              <button
                onClick={() => handleActivate(analysisResult.draftPolicy.version)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Approve & Activate Version {analysisResult.draftPolicy.version}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Version History Table */}
      <div className="mt-8 bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
        <h3 className="text-sm font-bold text-white mb-3">Policy Version History:</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Version</th>
                <th className="py-2.5 px-3">Effective Date</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Document ID</th>
                <th className="py-2.5 px-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {policies.map(p => (
                <tr key={p.version} className="hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-bold text-white">{p.version}</td>
                  <td className="py-2.5 px-3 text-slate-300">{p.effective_date}</td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      p.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {p.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-400">{p.document_id}</td>
                  <td className="py-2.5 px-3">
                    {p.status !== 'active' && (
                      <button
                        onClick={() => handleActivate(p.version)}
                        className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                      >
                        Activate This Version
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
