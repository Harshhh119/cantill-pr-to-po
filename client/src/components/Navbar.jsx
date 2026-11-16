import React from 'react';
import {
  MessageSquare,
  Briefcase,
  Sliders,
  Users,
  FileText,
  History,
  PlayCircle,
  ShieldCheck,
  Building2
} from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, activePolicyVersion, stats }) {
  const navItems = [
    { id: 'chat', label: 'Chat Intake', icon: MessageSquare, badge: null },
    { id: 'workspace', label: 'Buyer Workspace', icon: Briefcase, badge: stats?.pending || null },
    { id: 'batch', label: 'Batch & Blind Test', icon: PlayCircle, badge: null },
    { id: 'policy', label: 'Policy Studio', icon: Sliders, badge: activePolicyVersion },
    { id: 'suppliers', label: 'Preferred Suppliers', icon: Users, badge: null },
    { id: 'contracts', label: 'Contracts', icon: FileText, badge: null },
    { id: 'audit', label: 'Audit Log', icon: History, badge: null }
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">CORVO</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium border border-blue-500/30">
                  ProcureAI
                </span>
              </div>
              <p className="text-xs text-slate-400">Autonomous PR-to-PO Decision Engine</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      className={`text-xs px-1.5 py-0.2 rounded-full font-semibold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-800 text-blue-400 border border-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* System Status Pill */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300 font-medium">Policy:</span>
            <span className="text-cyan-400 font-semibold">{activePolicyVersion || 'v5.0'}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
