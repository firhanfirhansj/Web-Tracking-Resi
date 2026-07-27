import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { BulkTracking } from './components/BulkTracking';
import { SingleTracking } from './components/SingleTracking';
import { CostCalculator } from './components/CostCalculator';
import { SavedHistory } from './components/SavedHistory';
import { PackageSearch, ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'bulk' | 'single' | 'cost' | 'history'>('bulk');
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setApiKeyConfigured(Boolean(j?.apiKeyConfigured)))
      .catch(() => setApiKeyConfigured(null));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Sticky Top Header */}
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Status banner: API key configured? */}
        <div
          className={`border rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg ${
            apiKeyConfigured === false
              ? 'bg-gradient-to-r from-rose-900/30 via-slate-900 to-amber-900/30 border-rose-500/30'
              : 'bg-gradient-to-r from-blue-900/30 via-slate-900 to-indigo-900/30 border-blue-500/20'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                apiKeyConfigured === false
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {apiKeyConfigured === false ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">
                  {apiKeyConfigured === false
                    ? 'BinderByte API Key Belum Dikonfigurasi'
                    : 'Terhubung dengan BinderByte API'}
                </span>
                {apiKeyConfigured !== false && (
                  <span className="px-2 py-0.2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold uppercase rounded-full">
                    Aktif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {apiKeyConfigured === false
                  ? 'Set BINDERBYTE_API_KEY di Vercel Environment Variables / .env.local untuk mengaktifkan fitur tracking & cek ongkir.'
                  : 'Lacak 1-50 resi sekaligus dan cek ongkir dari kecamatan tanpa login.'}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Views */}
        {activeTab === 'bulk' && <BulkTracking />}
        {activeTab === 'single' && <SingleTracking />}
        {activeTab === 'cost' && <CostCalculator />}
        {activeTab === 'history' && <SavedHistory />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/50 py-6 mt-12 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <PackageSearch className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-slate-300">LacakResi Pro</span>
            <span>•</span>
            <span>Terkoneksi BinderByte API</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <a
              href="https://documenter.getpostman.com/view/12963788/TVRg69g4"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors flex items-center gap-1"
            >
              <span>Dokumentasi BinderByte</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}