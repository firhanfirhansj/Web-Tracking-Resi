import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { BulkTracking } from './components/BulkTracking';
import { SingleTracking } from './components/SingleTracking';
import { CostCalculator } from './components/CostCalculator';
import { SavedHistory } from './components/SavedHistory';
import { ResiExport } from './components/ResiExport';
import { PackageSearch, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function App() {
  // ✅ Perbaikan.txt #1: tambah tab 'export' untuk fitur AI Ekstrak Resi.
  const [activeTab, setActiveTab] = useState<'bulk' | 'single' | 'cost' | 'history' | 'export'>('bulk');
  // ✅ FIX: status env sekarang punya 3 state: 'unknown' | 'ok' | 'missing'
  // Sebelumnya Boolean(j?.apiKeyConfigured) tidak bisa bedakan "belum dicek"
  // vs "env tidak ada" — semua dianggap false, lalu banner merah selalu
  // muncul di awal sebelum health check selesai.
  const [envStatus, setEnvStatus] = useState<'unknown' | 'ok' | 'missing'>('unknown');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setEnvStatus(j?.apiKeyConfigured ? 'ok' : 'missing'))
      .catch(() => setEnvStatus('unknown'));
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
            envStatus === 'missing'
              ? 'bg-gradient-to-r from-amber-900/30 via-slate-900 to-amber-900/20 border-amber-500/30'
              : 'bg-gradient-to-r from-blue-900/30 via-slate-900 to-indigo-900/30 border-blue-500/20'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                envStatus === 'missing'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {envStatus === 'missing' ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">
                  {envStatus === 'missing'
                    ? 'API Key BinderByte Belum Diisi'
                    : envStatus === 'unknown'
                      ? 'Memeriksa koneksi…'
                      : 'Terhubung dengan API Tracking'}
                </span>
                {envStatus === 'ok' && (
                  <span className="px-2 py-0.2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold uppercase rounded-full">
                    Aktif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {envStatus === 'missing'
                  ? 'Isi BINDERBYTE_API_KEY di file .env (lokal) atau Vercel Environment Variables (production) untuk mengaktifkan tracking & cek ongkir.'
                  : envStatus === 'unknown'
                    ? 'Menghubungi server…'
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
        {activeTab === 'export' && <ResiExport />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/50 py-6 mt-12 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <PackageSearch className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-slate-300">LacakResi Pro</span>
            <span>•</span>
            <span>Whoto Logistik &amp; Distribusi</span>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <span>Dikembangkan oleh</span>
            <span className="font-semibold text-slate-200">Firhan Saefa Jamil</span>
          </div>
        </div>
      </footer>
    </div>
  );
}