import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import ChatIntake from './components/ChatIntake';
import BuyerWorkspace from './components/BuyerWorkspace';
import BatchProcessingView from './components/BatchProcessingView';
import PolicyStudio from './components/PolicyStudio';
import PreferredSuppliers from './components/PreferredSuppliers';
import ContractsView from './components/ContractsView';
import AuditLogView from './components/AuditLogView';

export default function App() {
  const [activeTab, setActiveTab] = useState('chat');
  const [activePolicyVersion, setActivePolicyVersion] = useState('v5.0');
  const [stats, setStats] = useState({ pending: 0 });

  const fetchGlobalState = async () => {
    try {
      const polRes = await fetch('/api/policies');
      const polData = await polRes.json();
      if (polData.active_version) {
        setActivePolicyVersion(polData.active_version);
      }

      const reqRes = await fetch('/api/requirements');
      const reqData = await reqRes.json();
      if (reqData.requirements) {
        const pending = reqData.requirements.filter(r => r.status === 'PENDING_APPROVAL').length;
        setStats({ pending });
      }
    } catch (err) {
      console.error('Failed to sync global app state:', err);
    }
  };

  useEffect(() => {
    fetchGlobalState();
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activePolicyVersion={activePolicyVersion}
        stats={stats}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {activeTab === 'chat' && (
          <ChatIntake
            onBatchUploaded={() => setActiveTab('workspace')}
            onNavigateToWorkspace={() => setActiveTab('workspace')}
          />
        )}

        {activeTab === 'workspace' && (
          <BuyerWorkspace />
        )}

        {activeTab === 'batch' && (
          <BatchProcessingView
            activePolicyVersion={activePolicyVersion}
          />
        )}

        {activeTab === 'policy' && (
          <PolicyStudio
            onPolicyActivated={(ver) => {
              setActivePolicyVersion(ver);
              fetchGlobalState();
            }}
          />
        )}

        {activeTab === 'suppliers' && (
          <PreferredSuppliers />
        )}

        {activeTab === 'contracts' && (
          <ContractsView />
        )}

        {activeTab === 'audit' && (
          <AuditLogView />
        )}
      </main>

      {/* Minimal Footer */}
      <footer className="bg-slate-900 border-t border-slate-800/80 py-4 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Corvo Engineering • PR-to-PO Procurement Engine</span>
          <span className="text-slate-400">
            Active Policy: <strong className="text-cyan-400">{activePolicyVersion}</strong> • Blind Test Compliant
          </span>
        </div>
      </footer>
    </div>
  );
}
