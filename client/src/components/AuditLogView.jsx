import React, { useState, useEffect } from 'react';
import {
  History,
  ShieldCheck,
  User,
  Clock,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FileText
} from 'lucide-react';

export default function AuditLogView() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('ALL');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/audit-logs');
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(l => {
    if (filterAction !== 'ALL' && l.action !== filterAction) return false;
    return true;
  });

  const getActionColor = (action) => {
    switch (action) {
      case 'REQUIREMENT_APPROVED':
        return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
      case 'REQUIREMENT_OVERRIDDEN':
        return 'text-amber-400 bg-amber-500/20 border-amber-500/30';
      case 'POLICY_ACTIVATED':
        return 'text-purple-400 bg-purple-500/20 border-purple-500/30';
      case 'PR_CREATED_VIA_CHAT':
        return 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30';
      case 'CONTRACT_UPLOADED':
        return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
      default:
        return 'text-slate-300 bg-slate-800 border-slate-700';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <History className="w-7 h-7 text-cyan-400" />
            Audit Trail & Compliance Log
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Immutable record of all policy activations, approvals, and buyer overrides with mandatory justifications (Policy Section 8).
          </p>
        </div>

        <div>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          >
            <option value="ALL">All Actions</option>
            <option value="REQUIREMENT_APPROVED">REQUIREMENT_APPROVED</option>
            <option value="REQUIREMENT_OVERRIDDEN">REQUIREMENT_OVERRIDDEN</option>
            <option value="POLICY_ACTIVATED">POLICY_ACTIVATED</option>
            <option value="PR_CREATED_VIA_CHAT">PR_CREATED_VIA_CHAT</option>
            <option value="CONTRACT_UPLOADED">CONTRACT_UPLOADED</option>
            <option value="BATCH_PROCESSED">BATCH_PROCESSED</option>
          </select>
        </div>
      </div>

      {/* Log Feed */}
      <div className="mt-6 bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden p-6">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading audit records...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            No audit logs found for the selected filter.
          </div>
        ) : (
          <div className="relative border-l-2 border-slate-800 ml-4 space-y-6">
            {filteredLogs.map(log => (
              <div key={log.id} className="relative pl-6">
                <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-900 border-2 border-blue-500" />

                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                      <span className="text-xs font-mono text-slate-400">{log.entity_id}</span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {log.user}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm font-medium text-slate-200 mt-2 leading-relaxed">
                    {log.details}
                  </p>

                  {log.comment && (
                    <div className="mt-2 p-2 rounded-lg bg-amber-950/20 border border-amber-900/30 text-xs text-amber-200">
                      <strong>Mandatory Justification:</strong> "{log.comment}"
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
