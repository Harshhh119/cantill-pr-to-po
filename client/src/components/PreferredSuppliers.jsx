import React, { useState, useEffect } from 'react';
import {
  Users,
  Download,
  Calendar,
  Search,
  CheckCircle2,
  AlertTriangle,
  Award,
  TrendingUp,
  FileText,
  Star,
  Info
} from 'lucide-react';

export default function PreferredSuppliers() {
  const [asOfDate, setAsOfDate] = useState('2026-11-01');
  const [items, setItems] = useState([]);
  const [selectedItemCode, setSelectedItemCode] = useState('ITM-1048');
  const [rankingData, setRankingData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [itemSearch, setItemSearch] = useState('');

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/master-data');
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRanking = async (itemCode, date) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/preferred-suppliers?item_code=${itemCode}&as_of=${date}`);
      const data = await res.json();
      setRankingData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    if (selectedItemCode) {
      fetchRanking(selectedItemCode, asOfDate);
    }
  }, [selectedItemCode, asOfDate]);

  const selectedItem = items.find(it => it.item_code === selectedItemCode);

  const filteredItems = items.filter(it =>
    it.item_code.toLowerCase().includes(itemSearch.toLowerCase()) ||
    it.description.toLowerCase().includes(itemSearch.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Users className="w-7 h-7 text-cyan-400" />
            Preferred Supplier Ranking Engine
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Dynamic ranking built automatically from 548-day PO history and rate contracts (Policy Section 6). Fully transparent scoring for buyers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-300 font-medium">As Of:</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none"
            />
          </div>

          <a
            href={`/api/export-preferred-suppliers?as_of=${asOfDate}`}
            download={`preferred_suppliers_${asOfDate}.csv`}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Top 3 CSV</span>
          </a>
        </div>
      </div>

      {/* Main Grid: Item Selector (Left) + Ranking Breakdown (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Item Selector List */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 shadow-xl flex flex-col h-[650px]">
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search items or codes..."
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {filteredItems.map(it => {
              const isSelected = it.item_code === selectedItemCode;
              return (
                <button
                  key={it.item_code}
                  onClick={() => setSelectedItemCode(it.item_code)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-start justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div>
                    <span className="font-mono text-[11px] opacity-80 block">{it.item_code}</span>
                    <span className="font-medium line-clamp-1">{it.description}</span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {it.category}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Ranking Details Table & Explainability */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Item Card */}
          {selectedItem && (
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400 font-mono font-semibold border border-blue-500/30">
                    {selectedItem.item_code}
                  </span>
                  <span className="text-xs text-slate-400">Category: <strong className="text-slate-200">{selectedItem.category}</strong></span>
                  <span className="text-xs text-slate-400">Type: <strong className="text-slate-200">{selectedItem.item_type}</strong></span>
                </div>
                <h2 className="text-lg font-bold text-white mt-1">{selectedItem.description}</h2>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-400 block font-medium">Standard Price</span>
                <span className="text-base font-bold text-white">₹{Number(selectedItem.standard_price).toLocaleString('en-IN')} / {selectedItem.uom}</span>
              </div>
            </div>
          )}

          {/* Ranking Table */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
            <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                Ranked Preferred Suppliers (Policy 6.1 & 6.2)
              </h3>
              <span className="text-xs text-slate-400">
                Candidates with PO in 548d or contract
              </span>
            </div>

            {isLoading ? (
              <div className="p-12 text-center text-slate-400">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs">Computing ranking & reference prices...</p>
              </div>
            ) : rankingData?.preferred_suppliers?.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No active suppliers with purchase history in 548 days or active contracts.
                <br />
                <span className="text-slate-400 mt-1 block">Sourcing requests will top up from category suppliers.</span>
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {rankingData?.preferred_suppliers?.map((s, idx) => (
                  <div key={s.supplier_id} className="p-4 hover:bg-slate-800/40 transition-all">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          s.rank === 1
                            ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                            : s.rank === 2
                            ? 'bg-slate-300 text-slate-950'
                            : s.rank === 3
                            ? 'bg-amber-800 text-amber-200'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {s.rank}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">{s.name}</span>
                            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {s.supplier_id}
                            </span>
                            <span className="text-xs text-slate-400">{s.city}</span>
                          </div>
                          <p className="text-xs text-cyan-400 font-medium mt-0.5">
                            Reference Price: <strong className="text-white">₹{s.refPrice ? s.refPrice.toFixed(2) : '—'}</strong> ({s.priceSource})
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-slate-400 block font-medium">Composite Score</span>
                        <span className="text-base font-bold text-emerald-400">{s.score} pts</span>
                      </div>
                    </div>

                    {/* Breakdown metrics pills */}
                    <div className="mt-3 pt-3 border-t border-slate-800/60 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[11px]">
                      <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block">POs (548d)</span>
                        <span className="font-bold text-white">{s.poCount}</span>
                      </div>
                      <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block">Recency Tier</span>
                        <span className="font-bold text-cyan-300">{s.recencyTier}</span>
                      </div>
                      <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block">Contract Held</span>
                        <span className="font-bold text-white">{s.hasContract ? 'Yes (+15)' : 'No'}</span>
                      </div>
                      <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block">On-Time %</span>
                        <span className="font-bold text-emerald-300">{s.onTime}%</span>
                      </div>
                      <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800 col-span-2 sm:col-span-1">
                        <span className="text-slate-400 block">Quality Rating</span>
                        <span className="font-bold text-amber-300">{s.quality} / 5.0</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Excluded Suppliers Note (Policy 5.7) */}
          {rankingData?.excluded_suppliers?.length > 0 && (
            <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-900/40">
              <div className="flex items-center gap-2 font-semibold text-rose-300 text-xs mb-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Excluded Suppliers (Clause 5.7: Blocked or Inactive)
              </div>
              <div className="space-y-1.5">
                {rankingData.excluded_suppliers.map(s => (
                  <div key={s.supplier_id} className="text-xs text-rose-300/80 flex items-center justify-between">
                    <span>{s.name} ({s.supplier_id}) — Status: <strong>{s.status}</strong></span>
                    <span className="text-[11px] text-rose-400">{s.exclusionReason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
