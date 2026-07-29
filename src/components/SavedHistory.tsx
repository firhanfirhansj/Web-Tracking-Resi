import React, { useState, useEffect } from 'react';
import { WaybillTrackingResult } from '../types';
import {
  getSavedWaybills,
  removeSavedWaybill,
  clearAllSavedWaybills,
  trackWaybill
} from '../services/api';
import { COURIERS, TRACK_COURIERS } from '../data/couriers';
import {
  History,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Truck,
  Search,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from 'lucide-react';

export const SavedHistory: React.FC = () => {
  const [history, setHistory] = useState<WaybillTrackingResult[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [refreshingAwb, setRefreshingAwb] = useState<string | null>(null);
  const [expandedAwb, setExpandedAwb] = useState<string | null>(null);

  useEffect(() => {
    setHistory(getSavedWaybills());
  }, []);

  const handleRemove = (awb: string) => {
    const updated = removeSavedWaybill(awb);
    setHistory(updated);
  };

  const handleClearAll = () => {
    if (confirm('Apakah Anda yakin ingin menghapus seluruh riwayat tracking tersimpan?')) {
      clearAllSavedWaybills();
      setHistory([]);
    }
  };

  const handleRefreshSingle = async (awb: string, courier: string) => {
    setRefreshingAwb(awb);
    try {
      await trackWaybill(awb, courier);
      setHistory(getSavedWaybills());
    } catch (e: any) {
      alert(e?.message || 'Gagal memperbarui status resi');
    } finally {
      setRefreshingAwb(null);
    }
  };

  const filteredHistory = history.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.awb.toLowerCase().includes(q) ||
      item.courierName?.toLowerCase().includes(q) ||
      item.summary?.receiver?.toLowerCase().includes(q) ||
      item.summary?.shipper?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white">Riwayat Resi Tersimpan</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Riwayat resi disimpan otomatis di peramban Anda (tanpa perlu login)
          </p>
        </div>

        {history.length > 0 && (
          <button
            onClick={handleClearAll}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-900/40 text-rose-300 border border-slate-700 hover:border-rose-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Hapus Semua Riwayat</span>
          </button>
        )}
      </div>

      {/* Filter / Search Bar */}
      {history.length > 0 && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari riwayat resi..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>
      )}

      {/* History List */}
      {filteredHistory.length > 0 ? (
        <div className="space-y-3">
          {filteredHistory.map((item) => {
            const isExpanded = expandedAwb === item.awb;
            const courierObj = COURIERS.find((c) => c.code === item.courier);

            return (
              <div
                key={item.awb}
                className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 transition-all shadow-sm"
              >
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm text-white">{item.awb}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px] font-semibold">
                        {courierObj?.shortName || item.courierName}
                      </span>
                      {item.status === 'DELIVERED' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[11px] font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Terkirim</span>
                        </span>
                      ) : item.status === 'IN_TRANSIT' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[11px] font-semibold">
                          <Truck className="w-3 h-3" />
                          <span>In Transit</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[11px] font-semibold">
                          <span>Diproses</span>
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 mt-1">
                      Penerima:{' '}
                      <strong className="text-slate-300">{item.summary?.receiver || '-'}</strong> | Tujuan:{' '}
                      {item.summary?.destination || '-'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => handleRefreshSingle(item.awb, item.courier)}
                      disabled={refreshingAwb === item.awb}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                      title="Update Status Terbaru"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          refreshingAwb === item.awb ? 'animate-spin text-blue-400' : ''
                        }`}
                      />
                    </button>

                    <button
                      onClick={() => setExpandedAwb(isExpanded ? null : item.awb)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors flex items-center gap-1"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      onClick={() => handleRemove(item.awb)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 text-xs transition-colors"
                      title="Hapus dari Riwayat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded Timeline */}
                {isExpanded && item.history && item.history.length > 0 && (
                  <div className="bg-slate-950 p-4 border-t border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Riwayat Checkpoint Perjalanan
                    </h4>

                    <div className="relative pl-4 space-y-3 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                      {item.history.map((hist, idx) => (
                        <div key={idx} className="relative">
                          <div
                            className={`absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full ${
                              idx === 0 ? 'bg-blue-500' : 'bg-slate-800'
                            }`}
                          />
                          <div className="text-[11px] font-mono text-blue-400">{hist.date}</div>
                          <div className="text-xs text-slate-200 mt-0.5">{hist.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <History className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-white">Belum Ada Riwayat Resi</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Lakukan tracking resi pada tab Single Tracking atau Bulk Tracking, data resi yang Anda
            cek akan tersimpan otomatis di sini.
          </p>
        </div>
      )}

      {/* Error note if needed */}
      {history.length > 0 && filteredHistory.length === 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>Tidak ada hasil untuk "{searchQuery}".</span>
        </div>
      )}
    </div>
  );
};
