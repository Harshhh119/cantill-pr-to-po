import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  Search,
  Building,
  UserCheck,
  Edit3,
  ExternalLink,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

export default function BuyerWorkspace({ onExportDecisions }) {
  const [requirements, setRequirements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedReqs, setExpandedReqs] = useState({});
  const [activeFilter, setActiveFilter] = useState('ALL'); // ALL, PO, SOURCING
  const [routeFilter, setRouteFilter] = useState('ALL');
  const [plantFilter, setPlantFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Override modal state
  const [overrideModal, setOverrideModal] = useState({
    isOpen: false,
    req: null,
    newRoute: 'RFQ',
    newSupplierId: '',
    comment: '',
    user: 'Senior Buyer'
  });

  const fetchRequirements = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/requirements');
      const data = await res.json();
      setRequirements(data.requirements || []);
    } catch (err) {
      console.error('Failed to load requirements:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequirements();
  }, []);

  const toggleExpand = (groupId) => {
    setExpandedReqs(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleApprove = async (groupId) => {
    try {
      const res = await fetch(`/api/requirements/${groupId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: 'Buyer (Procurement)' })
      });
      const data = await res.json();
      if (data.success) {
        setRequirements(prev =>
          prev.map(r => r.group_id === groupId ? { ...r, status: 'APPROVED', acted_by: 'Buyer', acted_at: new Date().toISOString() } : r)
        );
      }
    } catch (err) {
      alert('Approval failed: ' + err.message);
    }
  };

  const openOverrideModal = (req) => {
    setOverrideModal({
      isOpen: true,
      req,
      newRoute: req.route === 'SPOT_PO' ? 'RFQ' : req.route === 'CONTRACT_PO' ? 'RFQ' : 'SPOT_PO',
      newSupplierId: req.supplier_id || '',
      comment: '',
      user: 'Senior Buyer'
    });
  };

  const submitOverride = async () => {
    if (!overrideModal.comment.trim()) {
      alert('A written comment/reason is mandatory for override (Policy 8.1)');
      return;
    }

    try {
      const res = await fetch(`/api/requirements/${overrideModal.req.group_id}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_route: overrideModal.newRoute,
          new_supplier_id: overrideModal.newSupplierId,
          comment: overrideModal.comment,
          user: overrideModal.user
        })
      });
      const data = await res.json();
      if (data.success) {
        setRequirements(prev =>
          prev.map(r => r.group_id === overrideModal.req.group_id ? {
            ...r,
            status: 'OVERRIDDEN',
            route: overrideModal.newRoute,
            supplier_id: overrideModal.newSupplierId,
            override_comment: overrideModal.comment,
            reason: `OVERRIDDEN: ${overrideModal.comment}`
          } : r)
        );
        setOverrideModal({ isOpen: false, req: null, newRoute: '', newSupplierId: '', comment: '', user: '' });
      }
    } catch (err) {
      alert('Override failed: ' + err.message);
    }
  };

  // Filtered requirements
  const filtered = requirements.filter(r => {
    if (activeFilter === 'PO' && r.decision !== 'PO') return false;
    if (activeFilter === 'SOURCING' && r.decision !== 'SOURCING_REQUEST') return false;
    if (routeFilter !== 'ALL' && r.route !== routeFilter) return false;
    if (plantFilter !== 'ALL' && r.plant !== plantFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchItem = r.resolved_item_code.toLowerCase().includes(q) || r.item_description.toLowerCase().includes(q);
      const matchId = r.group_id.toLowerCase().includes(q) || (r.po_id && r.po_id.toLowerCase().includes(q));
      const matchSupp = r.supplier_id && r.supplier_id.toLowerCase().includes(q);
      if (!matchItem && !matchId && !matchSupp) return false;
    }
    return true;
  });

  // Summary statistics
  const totalValue = requirements.reduce((sum, r) => sum + (r.group_value_inr || 0), 0);
  const poCount = requirements.filter(r => r.decision === 'PO').length;
  const sourcingCount = requirements.filter(r => r.decision === 'SOURCING_REQUEST').length;
  const pendingCount = requirements.filter(r => r.status === 'PENDING_APPROVAL').length;

  const getRouteBadgeColor = (route) => {
    switch (route) {
      case 'CONTRACT_PO':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'SPOT_PO':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'EMERGENCY_PO':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      case 'RFQ':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'RFP':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'CAPEX_SOURCING':
        return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
      case 'NEW_ITEM_SOURCING':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Briefcase className="w-7 h-7 text-blue-400" />
            Buyer Workspace
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Review clubbed requirements, evaluate automated policy decisions, and execute one-click approvals or overrides.
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

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-md">
          <span className="text-xs text-slate-400 font-medium">Total Requirements</span>
          <p className="text-2xl font-bold text-white mt-1">{requirements.length}</p>
          <span className="text-[11px] text-slate-400">Clubbed from PR lines</span>
        </div>

        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-md">
          <span className="text-xs text-slate-400 font-medium">Direct POs</span>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{poCount}</p>
          <span className="text-[11px] text-emerald-400/70">Contract, Spot & Emergency</span>
        </div>

        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-md">
          <span className="text-xs text-slate-400 font-medium">Sourcing Requests</span>
          <p className="text-2xl font-bold text-amber-400 mt-1">{sourcingCount}</p>
          <span className="text-[11px] text-amber-400/70">RFQ, RFP & Capex</span>
        </div>

        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-md">
          <span className="text-xs text-slate-400 font-medium">Total Spend Value</span>
          <p className="text-2xl font-bold text-cyan-400 mt-1">₹{(totalValue / 100000).toFixed(1)}L</p>
          <span className="text-[11px] text-cyan-400/70">Excluding GST</span>
        </div>

        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-md col-span-2 sm:col-span-1">
          <span className="text-xs text-slate-400 font-medium">Action Pending</span>
          <p className="text-2xl font-bold text-purple-400 mt-1">{pendingCount}</p>
          <span className="text-[11px] text-purple-400/70">One-click next actions</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-6 p-4 bg-slate-900 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        {/* Type Filter Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'ALL' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            All ({requirements.length})
          </button>
          <button
            onClick={() => setActiveFilter('PO')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'PO' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Direct PO ({poCount})
          </button>
          <button
            onClick={() => setActiveFilter('SOURCING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'SOURCING' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sourcing ({sourcingCount})
          </button>
        </div>

        {/* Route Dropdown & Plant Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Routes</option>
            <option value="CONTRACT_PO">CONTRACT_PO</option>
            <option value="SPOT_PO">SPOT_PO</option>
            <option value="EMERGENCY_PO">EMERGENCY_PO</option>
            <option value="RFQ">RFQ</option>
            <option value="RFP">RFP</option>
            <option value="CAPEX_SOURCING">CAPEX_SOURCING</option>
            <option value="NEW_ITEM_SOURCING">NEW_ITEM_SOURCING</option>
          </select>

          <select
            value={plantFilter}
            onChange={(e) => setPlantFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Plants</option>
            <option value="PUN1">PUN1 (Bhosari)</option>
            <option value="CHK1">CHK1 (Chakan)</option>
          </select>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search item, req ID, supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
            />
          </div>
        </div>
      </div>

      {/* Requirements List */}
      <div className="mt-6 space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Loading requirement decisions...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800">
            <p className="text-sm">No requirements match the current filters.</p>
          </div>
        ) : (
          filtered.map(req => {
            const isExpanded = !!expandedReqs[req.group_id];
            const isPO = req.decision === 'PO';
            const isApproved = req.status === 'APPROVED';
            const isOverridden = req.status === 'OVERRIDDEN';

            return (
              <div
                key={req.group_id}
                className={`bg-slate-900 rounded-2xl border transition-all ${
                  isApproved
                    ? 'border-emerald-800/60 shadow-emerald-950/20'
                    : isOverridden
                    ? 'border-amber-800/60 shadow-amber-950/20'
                    : 'border-slate-800 hover:border-slate-700 shadow-md'
                }`}
              >
                {/* Requirement Card Top Row */}
                <div className="p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Identification & Item */}
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">REQ</span>
                        <span className="text-sm font-bold text-white tracking-tight">{req.group_id.replace('REQ-', '')}</span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono font-medium border border-slate-700">
                            {req.resolved_item_code}
                          </span>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${getRouteBadgeColor(req.route)}`}>
                            {req.route}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-medium">
                            {req.plant}
                          </span>
                          {req.is_emergency && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-semibold border border-rose-500/30 flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" /> EMERGENCY
                            </span>
                          )}
                          {isApproved && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> APPROVED
                            </span>
                          )}
                          {isOverridden && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold border border-amber-500/30 flex items-center gap-1">
                              <Edit3 className="w-3 h-3" /> OVERRIDDEN
                            </span>
                          )}
                        </div>

                        <h3 className="text-base font-bold text-white mt-1.5">
                          {req.item_description}
                        </h3>

                        <p className="text-xs text-slate-400 mt-0.5">
                          Requirement Date: {req.requirement_date} • {req.line_count} PR line{req.line_count > 1 ? 's clubbed' : ''} • Total Qty: <strong className="text-slate-200">{req.total_quantity} {req.uom}</strong>
                        </p>
                      </div>
                    </div>

                    {/* Financials & Assignment */}
                    <div className="flex items-center gap-6 lg:text-right">
                      <div>
                        <span className="text-xs text-slate-400 block font-medium">Requirement Value</span>
                        <span className="text-lg font-bold text-white">
                          ₹{req.group_value_inr.toLocaleString('en-IN')}
                        </span>
                        <span className="text-[11px] text-slate-400 block">
                          {req.unit_price ? `@ ₹${Number(req.unit_price).toFixed(2)} / ${req.uom}` : 'Estimates'}
                        </span>
                      </div>

                      {isPO ? (
                        <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 min-w-[170px]">
                          <span className="text-[11px] text-slate-400 block font-medium">Assigned Supplier</span>
                          <span className="text-sm font-semibold text-emerald-300 block truncate">
                            {req.supplier_name || req.supplier_id}
                          </span>
                          <span className="text-xs text-cyan-400 font-mono font-medium block">
                            PO: {req.po_id || 'PO-PENDING'}
                          </span>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 min-w-[170px]">
                          <span className="text-[11px] text-slate-400 block font-medium">Suggested Sourcing</span>
                          <span className="text-xs font-mono font-semibold text-amber-300 block truncate">
                            {req.suggested_supplier_ids || 'None (New Item)'}
                          </span>
                          <span className="text-[11px] text-slate-400 block">
                            {req.suggested_supplier_ids ? `${req.suggested_supplier_ids.split(';').length} suppliers suggested` : 'Buyer to source'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Policy Reasoning Box */}
                  <div className="mt-4 p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-2.5">
                      <FileText className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <span className="font-semibold text-cyan-300">Policy Reason ({req.policy_version}):</span>{' '}
                        <span className="text-slate-300">{req.reason}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleExpand(req.group_id)}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1 shrink-0 font-medium cursor-pointer"
                    >
                      <span>{isExpanded ? 'Hide PR Lines' : `View ${req.line_count} Line${req.line_count > 1 ? 's' : ''}`}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Single Obvious Next Action Section */}
                  <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">
                      {isApproved && (
                        <span className="text-emerald-400 font-medium">
                          ✓ Completed by {req.acted_by} on {new Date(req.acted_at).toLocaleDateString()}
                        </span>
                      )}
                      {isOverridden && (
                        <span className="text-amber-400 font-medium">
                          ⚠ Override active: {req.override_comment}
                        </span>
                      )}
                      {!isApproved && !isOverridden && (
                        <span>Next Step: Buyer verification and PO/Sourcing event authorization</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {!isApproved && (
                        <>
                          <button
                            onClick={() => handleApprove(req.group_id)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve ({isPO ? 'Create PO' : 'Initiate Sourcing'})</span>
                          </button>
                          <button
                            onClick={() => openOverrideModal(req)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-all cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                            <span>Override</span>
                          </button>
                        </>
                      )}
                      {isApproved && (
                        <span className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20">
                          {isPO ? `PO Issued: ${req.po_id}` : 'Sourcing Event Active'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded PR Lines Sub-table */}
                {isExpanded && (
                  <div className="border-t border-slate-800 bg-slate-950/40 p-4 rounded-b-2xl">
                    <h4 className="text-xs font-semibold text-slate-300 mb-2">Clubbed Purchase Requisition Lines:</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 font-medium">
                            <th className="py-2 px-3">PR Number / Line</th>
                            <th className="py-2 px-3">Created At</th>
                            <th className="py-2 px-3">Requester</th>
                            <th className="py-2 px-3">Department</th>
                            <th className="py-2 px-3">Quantity</th>
                            <th className="py-2 px-3">Need-By Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {req.lines.map((l, i) => (
                            <tr key={i} className="hover:bg-slate-900/60">
                              <td className="py-2 px-3 font-mono font-medium text-cyan-400">{l.pr_no}/{l.pr_line}</td>
                              <td className="py-2 px-3 text-slate-300">{l.created_at}</td>
                              <td className="py-2 px-3 text-slate-300">{l.requester}</td>
                              <td className="py-2 px-3 text-slate-400">{l.department}</td>
                              <td className="py-2 px-3 font-semibold text-white">{l.quantity} {req.uom}</td>
                              <td className="py-2 px-3 text-slate-300">{l.need_by_date}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Override Modal */}
      {overrideModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                Override Procurement Decision
              </h3>
              <button
                onClick={() => setOverrideModal({ ...overrideModal, isOpen: false })}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs">
                <span className="text-slate-400 block">Requirement:</span>
                <span className="font-semibold text-white text-sm">{overrideModal.req?.group_id} — {overrideModal.req?.item_description}</span>
                <span className="text-slate-400 block mt-1">Current Route: <strong>{overrideModal.req?.route}</strong> (Value: ₹{overrideModal.req?.group_value_inr.toLocaleString('en-IN')})</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Select New Route:</label>
                <select
                  value={overrideModal.newRoute}
                  onChange={(e) => setOverrideModal({ ...overrideModal, newRoute: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="CONTRACT_PO">CONTRACT_PO (Direct PO via Contract)</option>
                  <option value="SPOT_PO">SPOT_PO (Direct Spot PO)</option>
                  <option value="EMERGENCY_PO">EMERGENCY_PO (Emergency Fast-track PO)</option>
                  <option value="RFQ">RFQ (Request for Quotation - 3 quotes)</option>
                  <option value="RFP">RFP (Request for Proposal - 5 quotes)</option>
                  <option value="CAPEX_SOURCING">CAPEX_SOURCING (Capex Committee)</option>
                  <option value="NOT_PROCESSED">NOT_PROCESSED (Reject / Do Not Process)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Supplier ID (Optional):</label>
                <input
                  type="text"
                  placeholder="e.g. S001"
                  value={overrideModal.newSupplierId}
                  onChange={(e) => setOverrideModal({ ...overrideModal, newSupplierId: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Mandatory Written Reason / Justification (Policy 8.1): <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain why the automated decision is being overridden (e.g. supplier capacity issue, urgent production shutdown, price negotiation completed)..."
                  value={overrideModal.comment}
                  onChange={(e) => setOverrideModal({ ...overrideModal, comment: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                onClick={() => setOverrideModal({ ...overrideModal, isOpen: false })}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={submitOverride}
                disabled={!overrideModal.comment.trim()}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-lg shadow-amber-600/20 transition-all"
              >
                Confirm Override & Record in Audit Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
