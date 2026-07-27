import React, { useState } from 'react';
import { COURIERS, detectCourierFromAwb } from '../data/couriers';
import { WaybillTrackingResult } from '../types';
import { trackWaybill } from '../services/api';
import {
  PackageSearch,
  Search,
  RefreshCw,
  Check,
  Share2,
  Printer,
  MapPin,
  User,
  Tag,
  Calendar,
  AlertCircle,
  Clock,
  Truck
} from 'lucide-react';

export const SingleTracking: React.FC = () => {
  const [awb, setAwb] = useState<string>('');
  const [courier, setCourier] = useState<string>('jne');
  // ✅ FIX Bug #3: nomor telepon penerima — untuk JNE sesuai dokumentasi BinderByte.
  const [receiverNumber, setReceiverNumber] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<WaybillTrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const handleAutoDetectCourier = (inputAwb: string) => {
    setAwb(inputAwb);
    if (inputAwb.trim().length >= 4) {
      const detected = detectCourierFromAwb(inputAwb);
      setCourier(detected);
    }
  };

  const handleTrack = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!awb.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await trackWaybill(awb, courier, receiverNumber);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Gagal melacak nomor resi');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Search Input Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <PackageSearch className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Lacak 1 Nomor Resi</h2>
            <p className="text-xs text-slate-400">
              Cek status pengiriman paket secara detail dan real-time
            </p>
          </div>
        </div>

        <form onSubmit={handleTrack} className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            {/* Courier Selector */}
            <div className="sm:w-48">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">
                Pilih Ekspedisi
              </label>
              <select
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500"
              >
                {COURIERS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* AWB Input */}
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">
                Nomor Resi / AWB
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={awb}
                  onChange={(e) => handleAutoDetectCourier(e.target.value)}
                  placeholder="Masukkan nomor resi..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-mono text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Submit button */}
            <div className="sm:self-end">
              <button
                type="submit"
                disabled={loading || !awb.trim()}
                className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-blue-600/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mencari...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Lacak Resi</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ✅ FIX Bug #3: Input nomor telepon penerima — hanya muncul
              saat kurir=JNE sesuai dokumentasi BinderByte:
              /v1/track?courier=jne&awb=...&number=xxxxx */}
          {courier.toLowerCase() === 'jne' && (
            <div className="pt-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">
                Nomor Telepon Penerima (opsional — diperlukan BinderByte untuk JNE)
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={receiverNumber}
                onChange={(e) => setReceiverNumber(e.target.value)}
                placeholder="Contoh: 081234567890"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-mono text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
        </form>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Result Card */}
      {result && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-6 p-6">
          {/* Header Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold uppercase tracking-wider">
                  {result.courierName}
                </span>
                <span className="text-xs text-slate-400">
                  Resi:{' '}
                  <strong className="font-mono text-white">{result.awb}</strong>
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mt-1">
                Status: {result.statusText || result.status}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyLink}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-colors"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
                <span>{copied ? 'Tersalin' : 'Bagikan'}</span>
              </button>

              <button
                onClick={handlePrint}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Resi</span>
              </button>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-950 rounded-2xl border border-slate-800/80">
            <div>
              <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-blue-400" />
                <span>Pengirim</span>
              </div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {result.summary?.shipper || '-'}
              </div>
              <div className="text-xs text-slate-400">{result.summary?.origin || ''}</div>
            </div>

            <div>
              <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                <span>Penerima</span>
              </div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {result.summary?.receiver || '-'}
              </div>
              <div className="text-xs text-slate-400">
                {result.summary?.destination || ''}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-amber-400" />
                <span>Layanan & Berat</span>
              </div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {result.summary?.service || 'REGULER'}
              </div>
              <div className="text-xs text-slate-400">
                {result.summary?.weight || '1 kg'}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-purple-400" />
                <span>Tanggal Kirim</span>
              </div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {result.summary?.date || '-'}
              </div>
            </div>
          </div>

          {/* Timeline History */}
          {result.history && result.history.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <span>Riwayat Perjalanan Paket</span>
              </h4>

              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                {result.history.map((item, idx) => (
                  <div key={idx} className="relative group">
                    <div
                      className={`absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full border-2 ${
                        idx === 0
                          ? 'bg-blue-500 border-blue-400 ring-4 ring-blue-500/20'
                          : 'bg-slate-800 border-slate-600'
                      }`}
                    />
                    <div className="text-xs font-mono text-blue-400 font-semibold">
                      {item.date}
                    </div>
                    <div className="text-sm text-slate-100 font-medium mt-0.5">
                      {item.desc}
                    </div>
                    {item.location && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        Lokasi: {item.location}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
