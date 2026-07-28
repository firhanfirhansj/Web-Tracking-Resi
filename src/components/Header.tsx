import React from 'react';
import { PackageSearch, Calculator, History, Layers, ScanLine } from 'lucide-react';

interface HeaderProps {
  activeTab: 'bulk' | 'single' | 'cost' | 'history' | 'export';
  setActiveTab: (tab: 'bulk' | 'single' | 'cost' | 'history' | 'export') => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-3 gap-3">
          {/* Logo & Title */}
          <div
            className="flex items-center cursor-pointer"
            onClick={() => setActiveTab('bulk')}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <PackageSearch className="w-6 h-6 text-white" />
            </div>
            <div className="ml-3">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                  LacakResi<span className="text-blue-400">Pro</span>
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full">
                  Whoto Logistik
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tracking Bulk 1-50 Resi & Cek Ongkir Otomatis
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center overflow-x-auto no-scrollbar py-1 gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab('bulk')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'bulk'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Bulk Tracking (1-50)</span>
              <span className="ml-0.5 px-1.5 py-0.2 bg-blue-400/20 text-blue-300 rounded text-[10px] font-bold">HOT</span>
            </button>

            <button
              onClick={() => setActiveTab('single')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'single'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <PackageSearch className="w-4 h-4" />
              <span>Tracking 1 Resi</span>
            </button>

            <button
              onClick={() => setActiveTab('cost')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'cost'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Calculator className="w-4 h-4" />
              <span>Cek Estimasi Ongkir</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Riwayat</span>
            </button>

            {/* ✅ Perbaikan.txt #1: Tab "Ekspor Data Resi" — upload foto resi 1-50,
                AI (Ollama gemma4:31b-cloud) ekstrak data, bisa salin/download CSV/Excel. */}
            <button
              onClick={() => setActiveTab('export')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'export'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 font-semibold'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <ScanLine className="w-4 h-4" />
              <span>Ekspor Data Resi</span>
              <span className="ml-0.5 px-1.5 py-0.2 bg-purple-400/20 text-purple-300 rounded text-[10px] font-bold">AI</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};