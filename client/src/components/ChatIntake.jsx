import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Bot,
  User,
  CheckCircle2,
  AlertTriangle,
  Upload,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Building,
  Calendar,
  Layers,
  FileSpreadsheet
} from 'lucide-react';

export default function ChatIntake({ onBatchUploaded, onNavigateToWorkspace }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I am your Corvo Requisition Assistant. Tell me what you need, for example: *\"Need 200 nitrile gloves for Chakan by next Friday\"*.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [draftPR, setDraftPR] = useState(null);
  const [batchFile, setBatchFile] = useState(null);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchSuccess, setBatchSuccess] = useState(null);
  const messagesEndRef = useRef(null);

  const samplePrompts = [
    "Need 200 nitrile gloves for Chakan by next Friday",
    "Urgent 50 nos ball bearing 6205 for Bhosari by tomorrow",
    "Need 1 drinking water purifier 50 LPH for PUN1 by 2026-11-25",
    "Please arrange 4 nos EOT crane 5 ton for Bhosari by next month"
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend = null) => {
    const text = textToSend || inputValue;
    if (!text.trim() || isLoading) return;

    const userMsg = {
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputValue('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: 'default' })
      });
      const data = await res.json();

      const assistantMsg = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionRequired: data.readyToConfirm ? 'CONFIRM_PR' : null,
        createdPR: data.createdPR || null,
        decision: data.decision || null
      };

      setMessages(prev => [...prev, assistantMsg]);
      if (data.draftPR) {
        setDraftPR(data.draftPR);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error connecting to the decision engine. Please try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = () => {
    handleSendMessage('yes');
  };

  const handleBatchUpload = async (e) => {
    const file = e.target.files?.[0] || batchFile;
    if (!file) return;

    setBatchUploading(true);
    setBatchSuccess(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/process-batch', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setBatchSuccess(data);
        if (onBatchUploaded) onBatchUploaded(data);
      }
    } catch (err) {
      alert('Error uploading PR batch: ' + err.message);
    } finally {
      setBatchUploading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Bot className="w-7 h-7 text-cyan-400" />
            Requisition Intake Chat
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Natural language purchase requisition. Conversational slot-filling with automated policy evaluation.
          </p>
        </div>

        {/* Quick Batch Upload Button */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-medium cursor-pointer transition-all shadow-sm">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Upload Batch CSV</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleBatchUpload} />
          </label>
        </div>
      </div>

      {batchSuccess && (
        <div className="mt-4 p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-200">
                Batch Uploaded & Processed: {batchSuccess.total_lines} PR Lines into {batchSuccess.total_requirements} Requirements
              </p>
              <p className="text-xs text-emerald-400/80">
                Direct POs: {batchSuccess.decision_breakdown?.PO || 0} | Sourcing Requests: {batchSuccess.decision_breakdown?.SOURCING_REQUEST || 0}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToWorkspace && onNavigateToWorkspace()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all"
          >
            <span>Open in Buyer Workspace</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Grid: Chat Stream (Left) + Slot Tracker (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Chat Stream (2 Cols) */}
        <div className="lg:col-span-2 flex flex-col bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden h-[650px]">
          {/* Chat Messages Container */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4">
            {messages.map((m, idx) => {
              const isAssistant = m.role === 'assistant';
              return (
                <div
                  key={idx}
                  className={`flex gap-3 ${isAssistant ? 'justify-start' : 'justify-end'}`}
                >
                  {isAssistant && (
                    <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/30">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                    isAssistant
                      ? 'bg-slate-800/90 text-slate-200 border border-slate-700/60 shadow-md'
                      : 'bg-blue-600 text-white font-medium shadow-md shadow-blue-600/20'
                  }`}>
                    {/* Render content with basic markdown support */}
                    <div className="whitespace-pre-wrap">
                      {m.content}
                    </div>

                    {/* Interactive Confirmation Box */}
                    {m.actionRequired === 'CONFIRM_PR' && (
                      <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center gap-3">
                        <button
                          onClick={handleConfirm}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Yes, Confirm & Create PR</span>
                        </button>
                        <button
                          onClick={() => handleSendMessage('change')}
                          className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition-all cursor-pointer"
                        >
                          Modify Details
                        </button>
                      </div>
                    )}

                    {/* Action button if PR was just created */}
                    {m.createdPR && (
                      <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center justify-between">
                        <span className="text-xs text-slate-400">PR logged into system audit trail</span>
                        <button
                          onClick={() => onNavigateToWorkspace && onNavigateToWorkspace()}
                          className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-medium"
                        >
                          <span>View in Workspace</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <span className="block text-[10px] text-slate-400 mt-2 text-right">
                      {m.timestamp}
                    </span>
                  </div>

                  {!isAssistant && (
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-3 justify-start items-center text-slate-400 text-xs py-2">
                <div className="w-8 h-8 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 animate-pulse">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-1 bg-slate-800/80 px-4 py-2.5 rounded-2xl border border-slate-700/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce delay-150" />
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce delay-300" />
                  <span className="ml-2">Analyzing against policy rules...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-4 py-2.5 bg-slate-950/60 border-t border-slate-800/80 overflow-x-auto flex items-center gap-2 no-scrollbar">
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1 shrink-0">
              <Sparkles className="w-3 h-3 text-cyan-400" /> Examples:
            </span>
            {samplePrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(prompt)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 shrink-0 transition-all text-left"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="e.g. Need 200 nitrile gloves for Chakan by next Friday..."
              className="flex-1 bg-slate-800/90 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Send</span>
            </button>
          </form>
        </div>

        {/* Slot Tracker & Status Panel (Right 1 Col) */}
        <div className="space-y-4">
          {/* Active Slot Extraction Card */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-cyan-400" />
              Slot Filling Status
            </h3>

            <div className="space-y-3">
              {/* Item Slot */}
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Item Master Resolution</span>
                  {draftPR?.item_code ? (
                    <span className={`px-2 py-0.5 rounded-full font-medium ${draftPR.item_code === 'NEW' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                      {draftPR.item_code}
                    </span>
                  ) : (
                    <span className="text-slate-400">Waiting for input</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-white mt-1">
                  {draftPR?.item_description || '—'}
                </p>
                {draftPR?.resolved_item && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Category: {draftPR.resolved_item.category} | Type: {draftPR.resolved_item.item_type}
                  </p>
                )}
              </div>

              {/* Quantity Slot */}
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Quantity & UoM</span>
                  {draftPR?.quantity ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Captured
                    </span>
                  ) : (
                    <span className="text-slate-400">Required</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-white mt-1">
                  {draftPR?.quantity ? `${draftPR.quantity} ${draftPR.uom || 'NOS'}` : '—'}
                </p>
              </div>

              {/* Plant Slot */}
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Manufacturing Plant</span>
                  {draftPR?.plant ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {draftPR.plant}
                    </span>
                  ) : (
                    <span className="text-slate-400">Required</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-white mt-1">
                  {draftPR?.plant === 'CHK1' ? 'CHK1 — Chakan Plant' : draftPR?.plant === 'PUN1' ? 'PUN1 — Pune Bhosari Plant' : '—'}
                </p>
              </div>

              {/* Need By Date */}
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Need-By Date</span>
                  {draftPR?.need_by_date ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Set
                    </span>
                  ) : (
                    <span className="text-slate-400">Required</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-white mt-1">
                  {draftPR?.need_by_date || '—'}
                </p>
              </div>

              {/* Urgency */}
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Urgency Level</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${draftPR?.urgency === 'Emergency' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-slate-700 text-slate-300'}`}>
                    {draftPR?.urgency || 'Normal'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Policy Hint Card */}
          <div className="bg-gradient-to-br from-slate-900 to-blue-950/40 rounded-2xl border border-blue-900/40 p-4 text-xs text-slate-300">
            <div className="flex items-center gap-2 font-semibold text-blue-300 mb-1.5">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Automated Policy Enforcement
            </div>
            <p className="leading-relaxed text-slate-400">
              PRs created here automatically undergo <strong>Clubbing (Policy 2.2)</strong>, <strong>Valuation (3.1)</strong>, and <strong>Decision Routing (5.1-5.6)</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
