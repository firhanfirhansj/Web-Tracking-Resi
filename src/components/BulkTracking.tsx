import React, { useState } from 'react';
import { COURIERS } from '../data/couriers';
import { BulkTrackItem, WaybillStatus } from '../types';
import { trackWaybillsBulk, exportBulkToCSV } from '../services/api';
import { 
  Layers, Play, Download, Trash2, Search, CheckCircle2, Truck, Clock, AlertTriangle, 
  ChevronDown, ChevronUp, Copy, Check, FileSpreadsheet, Sparkles, RefreshCw, HelpCircle
} from 'lucide-react';

export const BulkTracking: React.FC = () => {
  const [inputText, setInputText] = useState<string>(
    'JNE1234567890\nJX1234567890\n001234567890\nP2607202612\n66001234567'
  );
  const [selectedDefaultCourier, setSelectedDefaultCourier] = useState<string>('jne');
  // ✅ FIX Bug #3: nomor telepon penerima (untuk JNE sesuai dokumentasi BinderByte)
  const [receiverNumber, setReceiverNumber] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [items, setItems] = useState<BulkTrackItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedAwb, setCopiedAwb] = useState<string | null>(null);

  // Parse waybills from text input → BulkTrackItem[]
  // ✅ FIX Bug #1: Hapus auto-detect kurir — gunakan kurir yang dipilih user
  // untuk SEMUA nomor resi, sesuai permintaan di perbaikan.txt (auto-detect
  // berpotensi salah deteksi untuk AWB dari kurir yang punya prefix ambigu,
  // sehingga saldo BinderByte terpotong untuk request ke kurir yang salah).
  const parseWaybills = (text: string, courierCode: string): BulkTrackItem[] => {
    const lines: string[] = text
      .split(/[\n,;]+/)
      .map((l) => (typeof l === 'string' ? l.trim() : ''))
      .filter((l) => l.length >= 3);

    const uniqueLines = Array.from(new Set(lines)).slice(0, 50); // Cap at 50 resi

    return uniqueLines.map((awb, index) => {
      const courierObj = COURIERS.find((c) => c.code === courierCode);

      return {
        id: `bulk-${index}-${Date.now()}`,
        awb,
        courier: courierCode,
        courierName: courierObj?.shortName || courierCode.toUpperCase(),
        // ✅ FIX Bug #3: hanya disertakan untuk JNE (lihat dokumentasi BinderByte)
        number: courierCode.toLowerCase() === 'jne' ? (receiverNumber.trim() || undefined) : undefined,
        status: 'pending'
      };
    });
  };

  // Run the bulk tracking API against a specific list of items
  const runBulkTracking = async (targetItems: BulkTrackItem[]) => {
    if (targetItems.length === 0) return;

    setIsProcessing(true);
    setProgress({ current: 0, total: targetItems.length });

    try {
      const results = await trackWaybillsBulk(
        targetItems.map((i) => ({ id: i.id, awb: i.awb, courier: i.courier, label: i.note, number: i.number })),
        (completed, total, latest) => {
          setProgress({ current: completed, total });
          if (latest) {
            // ✅ FIX Bug #2: gunakan latest.status dari server (bisa 'success' / 'error'),
            // bukan hardcode 'success'. Sertakan errorMessage agar UI menampilkan
            // pesan error dengan benar saat tracking gagal.
            setItems((prev) =>
              prev.map((item) => {
                if (item.id === latest.id) {
                  return {
                    ...item,
                    status: latest.status,
                    result: latest.result,
                    errorMessage: latest.errorMessage
                  };
                }
                return item;
              })
            );
          }
        }
      );

      setItems(results);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Start Bulk Tracking — single entrypoint yang aman dari state closure
  // ✅ FIX Bug #4 (UI tidak update Lion Parcel → J&T Cargo): SELALU parse ulang
  // dari inputText dengan kurir yang sedang dipilih. Sebelumnya, jika `items`
  // sudah ada (mis. hasil Lion Parcel), kode langsung re-run dengan items lama
  // dan kurir tidak diganti → UI tetap menampilkan Lion Parcel, saldo
  // BinderByte sudah terpotong untuk J&T Cargo. Sekarang user yang klik
  // tombol "Proses Lacak Otomatis" selalu mendapat tracking sesuai kurir
  // yang baru dipilih.
  const handleStartTracking = async () => {
    const parsed = parseWaybills(inputText, selectedDefaultCourier);
    if (parsed.length === 0) {
      alert('Masukkan minimal 1 nomor resi yang valid.');
      return;
    }
    // Set state DULU (sebelum run), baru panggil runBulkTracking dengan
    // parsed yang sudah jadi. Tidak ada race / state closure.
    setItems(parsed);
    return runBulkTracking(parsed);
  };

  // File Upload Handler (CSV/Txt)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setInputText(content);
      }
    };
    reader.readAsText(file);
  };

  // Copy AWB
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAwb(text);
    setTimeout(() => setCopiedAwb(null), 2000);
  };

  // Filtered items
  const filteredItems = items.filter((item) => {
    const res = item.result;
    const matchesSearch =
      searchQuery === '' ||
      item.awb.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.courier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      res?.summary?.receiver?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      res?.summary?.shipper?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'DELIVERED') return res?.status === 'DELIVERED';
    if (statusFilter === 'IN_TRANSIT') return res?.status === 'IN_TRANSIT';
    if (statusFilter === 'ON_PROCESS') return res?.status === 'ON_PROCESS';
    if (statusFilter === 'ERROR') return item.status === 'error' || res?.status === 'ERROR';

    return true;
  });

  // Metric Stats
  const totalCount = items.length;
  const deliveredCount = items.filter((i) => i.result?.status === 'DELIVERED').length;
  const inTransitCount = items.filter((i) => i.result?.status === 'IN_TRANSIT').length;
  const onProcessCount = items.filter((i) => i.result?.status === 'ON_PROCESS').length;
  const errorCount = items.filter((i) => i.status === 'error' || i.result?.status === 'ERROR').length;

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4" />
              <span>Multi-Tracking Engine</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold">
              Lacak 1 hingga 50 Resi Sekaligus
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Sistem tracking otomatis. Pilih kurir yang sesuai, tempelkan daftar nomor resi, lalu proses sekaligus. Cocok untuk penjual e-commerce, toko online, reseller, dan ekspedisi.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition-colors">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Upload CSV / TXT</span>
              <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
            </label>

            {items.length > 0 && (
              <button
                onClick={() => exportBulkToCSV(items)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-emerald-600/20"
              >
                <Download className="w-4 h-4" />
                <span>Export Laporan CSV</span>
              </button>
            )}
          </div>
        </div>

        {/* Input Text Area & Controls */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <span>Masukkan Nomor Resi (Maksimal 50 Resi, 1 resi per baris / pisah koma)</span>
              </label>
              <span className="text-xs font-mono text-blue-400">
                {inputText.split(/[\n,;]+/).filter((x) => x.trim()).length} / 50 Resi
              </span>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={4}
              placeholder="Contoh:&#10;JNE1234567890&#10;JX1234567890&#10;001234567890&#10;SPXID01234567890"
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs sm:text-sm font-mono text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400 whitespace-nowrap">Pilih Kurir:</span>
              <select
                value={selectedDefaultCourier}
                onChange={(e) => setSelectedDefaultCourier(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
              >
                {COURIERS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>

              {/* ✅ FIX Bug #3: Input nomor telepon penerima — sesuai dokumentasi
                  BinderByte untuk JNE (parameter "number"). Field ini HANYA
                  tampil saat kurir = JNE. Untuk kurir lain disembunyikan agar
                  UI tetap bersih. */}
              {selectedDefaultCourier.toLowerCase() === 'jne' && (
                <input
                  type="tel"
                  inputMode="numeric"
                  value={receiverNumber}
                  onChange={(e) => setReceiverNumber(e.target.value)}
                  placeholder="No. HP Penerima (opsional, utk JNE)"
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 w-56"
                  title="Nomor telepon penerima — diperlukan BinderByte untuk beberapa resi JNE"
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <button
                  onClick={() => {
                    setItems([]);
                    setProgress({ current: 0, total: 0 });
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl border border-slate-700 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Reset List</span>
                </button>
              )}

              <button
                onClick={() => handleStartTracking()}
                disabled={isProcessing || !inputText.trim()}
                className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
                  isProcessing
                    ? 'bg-blue-600/50 text-blue-200 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 active:scale-95'
                }`}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Melacak ({progress.current}/{progress.total})...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Proses Lacak Otomatis</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {isProcessing && (
          <div className="mt-4 pt-4 border-t border-slate-800">
            <div className="flex justify-between text-xs text-slate-300 mb-1">
              <span>Sedang memproses resi...</span>
              <span className="font-mono font-bold text-blue-400">
                {Math.round((progress.current / (progress.total || 1)) * 100)}%
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-300 rounded-full"
                style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Metrics Dashboard (If resi processed) */}
      {items.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
            
            <div 
              onClick={() => setStatusFilter('ALL')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 border-blue-500/50 shadow-md ring-2 ring-blue-500/20'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-medium">Total Resi</span>
                <Layers className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold text-white">{totalCount}</div>
            </div>

            <div 
              onClick={() => setStatusFilter('DELIVERED')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                statusFilter === 'DELIVERED'
                  ? 'bg-emerald-950/40 border-emerald-500/50 shadow-md ring-2 ring-emerald-500/20'
                  : 'bg-slate-900/60 border-slate-800 hover:border-emerald-500/30'
              }`}
            >
              <div className="flex items-center justify-between text-emerald-400 mb-1">
                <span className="text-xs font-medium">Terkirim</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-emerald-400">{deliveredCount}</div>
            </div>

            <div 
              onClick={() => setStatusFilter('IN_TRANSIT')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                statusFilter === 'IN_TRANSIT'
                  ? 'bg-blue-950/40 border-blue-500/50 shadow-md ring-2 ring-blue-500/20'
                  : 'bg-slate-900/60 border-slate-800 hover:border-blue-500/30'
              }`}
            >
              <div className="flex items-center justify-between text-blue-400 mb-1">
                <span className="text-xs font-medium">In Transit</span>
                <Truck className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold text-blue-400">{inTransitCount}</div>
            </div>

            <div 
              onClick={() => setStatusFilter('ON_PROCESS')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                statusFilter === 'ON_PROCESS'
                  ? 'bg-amber-950/40 border-amber-500/50 shadow-md ring-2 ring-amber-500/20'
                  : 'bg-slate-900/60 border-slate-800 hover:border-amber-500/30'
              }`}
            >
              <div className="flex items-center justify-between text-amber-400 mb-1">
                <span className="text-xs font-medium">Diproses</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-amber-400">{onProcessCount}</div>
            </div>

            <div 
              onClick={() => setStatusFilter('ERROR')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                statusFilter === 'ERROR'
                  ? 'bg-rose-950/40 border-rose-500/50 shadow-md ring-2 ring-rose-500/20'
                  : 'bg-slate-900/60 border-slate-800 hover:border-rose-500/30'
              }`}
            >
              <div className="flex items-center justify-between text-rose-400 mb-1">
                <span className="text-xs font-medium">Error / Mandet</span>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-2xl font-bold text-rose-400">{errorCount}</div>
            </div>

          </div>

          {/* Search & Filter Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-2xl">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nomor resi, penerima, pengirim, kurir..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-xs text-slate-400 whitespace-nowrap">Filter Status:</span>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === 'ALL' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Semua ({items.length})
              </button>
              <button
                onClick={() => setStatusFilter('DELIVERED')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === 'DELIVERED' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Terkirim ({deliveredCount})
              </button>
              <button
                onClick={() => setStatusFilter('IN_TRANSIT')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === 'IN_TRANSIT' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Transit ({inTransitCount})
              </button>
            </div>
          </div>

          {/* Results List */}
          <div className="space-y-3">
            {filteredItems.map((item, idx) => {
              const res = item.result;
              const isExpanded = expandedId === item.id;
              const courierObj = COURIERS.find((c) => c.code === item.courier);

              return (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 transition-all shadow-sm"
                >
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    
                    {/* Left Resi info */}
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center font-mono font-bold text-xs text-blue-400 shrink-0">
                        #{idx + 1}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sm text-white tracking-wide">
                            {item.awb}
                          </span>
                          <button
                            onClick={() => handleCopy(item.awb)}
                            className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
                            title="Salin Resi"
                          >
                            {copiedAwb === item.awb ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px] font-semibold">
                            {courierObj?.name || item.courier.toUpperCase()}
                          </span>
                        </div>

                        {res?.summary && (
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>Pengirim: <strong className="text-slate-300">{res.summary.shipper || '-'}</strong></span>
                            <span>•</span>
                            <span>Penerima: <strong className="text-slate-300">{res.summary.receiver || '-'}</strong></span>
                            <span>•</span>
                            <span>Tujuan: <strong className="text-slate-300">{res.summary.destination || '-'}</strong></span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right Status Badge & Expand Toggle */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                      <div>
                        {res?.status === 'DELIVERED' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Terkirim</span>
                          </span>
                        ) : res?.status === 'IN_TRANSIT' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold">
                            <Truck className="w-3.5 h-3.5" />
                            <span>In Transit</span>
                          </span>
                        ) : item.status === 'pending' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-400 text-xs font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Menunggu</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Diproses</span>
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition-colors"
                      >
                        <span className="hidden sm:inline">Riwayat</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                  </div>

                  {/* Expandable History Timeline */}
                  {isExpanded && res?.history && res.history.length > 0 && (
                    <div className="bg-slate-950 p-4 border-t border-slate-800 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-400" />
                        <span>Riwayat Perjalanan Resi</span>
                      </h4>

                      <div className="relative pl-4 space-y-4 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                        {res.history.map((hist, hIdx) => (
                          <div key={hIdx} className="relative group">
                            <div className={`absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full border-2 ${
                              hIdx === 0 ? 'bg-blue-500 border-blue-400 ring-4 ring-blue-500/20' : 'bg-slate-800 border-slate-600'
                            }`} />
                            <div className="text-xs font-mono text-blue-400">{hist.date}</div>
                            <div className="text-xs sm:text-sm text-slate-200 mt-0.5 font-medium">{hist.desc}</div>
                            {hist.location && (
                              <div className="text-[11px] text-slate-500 mt-0.5">Lokasi: {hist.location}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Helper guide box if empty */}
      {items.length === 0 && (
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto">
            <HelpCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-white">Panduan Penggunaan Bulk Tracking</h3>
          <p className="text-xs text-slate-400 max-w-xl mx-auto leading-relaxed">
            Pilih kurir yang sesuai, tempelkan hingga 50 nomor resi di dalam kotak di atas (1 resi per baris atau pisah dengan koma). Klik tombol <strong className="text-blue-400">Proses Lacak Otomatis</strong> untuk memulai tracking bersamaan.
          </p>
        </div>
      )}

    </div>
  );
};
