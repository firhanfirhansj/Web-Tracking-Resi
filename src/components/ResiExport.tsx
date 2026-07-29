import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExtractedResi } from '../types';
import {
  extractResiWithAI,
  downloadAsCSV,
  downloadAsXLSX,
  copyAsTSV,
  getAiHealth
} from '../services/api';
import {
  ScanLine,
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Brain,
  Copy,
  Check,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  RefreshCw,
  Sparkles,
  Eye,
  Trash2
} from 'lucide-react';

/**
 * ✅ Fitur Ekspor Data Resi dengan AI (perbaikan.txt #1).
 * User upload 1–50 gambar resi → AI (Ollama `gemma4:31b-cloud`) extract
 * field-field penting → hasil bisa di-copy atau di-download CSV/Excel.
 */
export const ResiExport: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [results, setResults] = useState<ExtractedResi[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [aiHealth, setAiHealth] = useState<{
    configured: boolean;
    reachable: boolean;
    model: string;
    error?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cek status AI saat mount
  useEffect(() => {
    getAiHealth()
      .then(setAiHealth)
      .catch(() => setAiHealth({ configured: false, reachable: false, model: '' }));
  }, []);

  // Bersihkan object URL previews saat unmount
  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    setFiles((prev) => {
      const merged = [...prev, ...arr].slice(0, 50);
      setPreviews(merged.map((f) => URL.createObjectURL(f)));
      return merged;
    });
    setResults([]);
    setError(null);
  }, []);

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      setPreviews(next.map((f) => URL.createObjectURL(f)));
      return next;
    });
  };

  const clearAll = () => {
    setFiles([]);
    setPreviews([]);
    setResults([]);
    setError(null);
    setProgress({ current: 0, total: 0 });
  };

  const handleExtract = async () => {
    if (files.length === 0) {
      setError('Upload minimal 1 gambar resi terlebih dahulu.');
      return;
    }
    setLoading(true);
    setError(null);
    setResults([]);
    setProgress({ current: 0, total: files.length });
    try {
      const data = await extractResiWithAI(files);
      setResults(data);
      setProgress({ current: data.length, total: files.length });
    } catch (e: any) {
      setError(e.message || 'Gagal mengekstrak data resi.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    const ok = await copyAsTSV(results);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const successCount = results.filter((r) => r.ok).length;
  const failedCount = results.filter((r) => !r.ok).length;

  // Format rupiah
  const formatRupiah = (val: number | null) => {
    if (val == null) return '';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <ScanLine className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Ekspor Data Resi dengan AI</h2>
            <p className="text-xs text-slate-400">
              Upload 1–50 foto resi, AI akan ekstrak data penting ke tabel yang bisa di-salin atau di-download.
            </p>
          </div>
        </div>

        {/* AI Health Status */}
        {aiHealth && (
          <div
            className={`mt-4 p-3 rounded-xl border flex items-start gap-3 text-xs ${
              aiHealth.reachable
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
            }`}
          >
            <div className="mt-0.5">
              {aiHealth.reachable ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
            </div>
            <div>
              {aiHealth.reachable ? (
                <div>
                  <strong>AI siap.</strong> Model: <span className="font-mono">{aiHealth.model}</span>
                </div>
              ) : (
                <div>
                  <strong>AI belum terhubung.</strong>{' '}
                  {aiHealth.apiKeyPresent
                    ? 'Ollama server tidak bisa dihubungi — periksa OLLAMA_BASE_URL atau koneksi internet.'
                    : 'Isi OLLAMA_API_KEY di file .env (lokal) atau Vercel Environment Variables (production) untuk mengaktifkan fitur AI Ekstrak Resi.'}{' '}
                  Detail: {aiHealth.error || 'unreachable'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Upload Area */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-purple-500 bg-purple-500/5'
              : 'border-slate-700 hover:border-slate-500 bg-slate-950/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => e.target.files && addFiles(e.target.files)}
            className="hidden"
          />
          <div className="w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto mb-3">
            <Upload className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">
            Tarik & lepas foto resi di sini
          </h3>
          <p className="text-xs text-slate-400">
            atau klik untuk pilih file. Format: JPG, PNG, WebP. Maks 50 gambar, 8MB per file.
          </p>
        </div>

        {/* Preview Grid */}
        {files.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-300">
                {files.length} gambar siap diproses
              </span>
              <button
                onClick={clearAll}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
              >
                <Trash2 />
                <span>Hapus semua</span>
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {files.map((f, idx) => (
                <div
                  key={idx}
                  className="relative aspect-square bg-slate-950 border border-slate-800 rounded-xl overflow-hidden group"
                >
                  <img
                    src={previews[idx]}
                    alt={f.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removeFile(idx)}
                    className="absolute top-1 right-1 p-1 rounded-md bg-slate-900/80 text-slate-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Hapus"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-slate-900/85 px-1 py-0.5 text-[9px] text-slate-300 truncate">
                    {f.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleExtract}
            disabled={loading || files.length === 0}
            className="flex-1 px-5 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  Memproses {progress.current}/{progress.total}…
                </span>
              </>
            ) : (
              <>
                <Brain className="w-4 h-4" />
                <span>Proses dengan AI ({files.length})</span>
              </>
            )}
          </button>
        </div>

        {/* Progress Bar */}
        {loading && (
          <div className="mt-4">
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-400 transition-all duration-300 rounded-full"
                style={{
                  width: `${(progress.current / (progress.total || 1)) * 100}%`
                }}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-2 text-center">
              AI sedang membaca gambar… (1–2 menit untuk 50 gambar)
            </p>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <span>Hasil Ekstraksi AI</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {successCount} berhasil • {failedCount} gagal dari {results.length} gambar
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 flex items-center gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Tabel</span>
                  </>
                )}
              </button>
              <button
                onClick={() => downloadAsCSV(results)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Download CSV</span>
              </button>
              <button
                onClick={() => downloadAsXLSX(results)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Download Excel</span>
              </button>
            </div>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  {/* ✅ perbaikan.txt #3: urutan kolom = No, Tujuan, Ekspedisi,
                      No Resi, Biaya, Berat, Jumlah, Asuransi, Alamat */}
                  <th className="text-left py-3 px-2 font-semibold">No</th>
                  <th className="text-left py-3 px-2 font-semibold">Tujuan</th>
                  <th className="text-left py-3 px-2 font-semibold">Ekspedisi</th>
                  <th className="text-left py-3 px-2 font-semibold">No Resi</th>
                  <th className="text-right py-3 px-2 font-semibold">Biaya</th>
                  <th className="text-right py-3 px-2 font-semibold">Berat</th>
                  <th className="text-right py-3 px-2 font-semibold">Jumlah</th>
                  <th className="text-right py-3 px-2 font-semibold">Asuransi</th>
                  <th className="text-left py-3 px-2 font-semibold">Alamat</th>
                  <th className="text-center py-3 px-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => {
                  const d = r.data || ({} as any);
                  return (
                    <tr
                      key={idx}
                      className={`border-b border-slate-800/60 hover:bg-slate-950/60 ${
                        !r.ok ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="py-2.5 px-2 text-slate-500 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-2 text-slate-200" title={d.tujuan || ''}>
                        {d.tujuan || '—'}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[10px] font-semibold uppercase">
                          {d.ekspedisi || '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 font-mono text-white">{d.noResi || '—'}</td>
                      <td className="py-2.5 px-2 text-right text-emerald-400 font-semibold">
                        {formatRupiah(d.harga)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-300">
                        {d.loadKg != null ? `${d.loadKg} kg` : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-300">{d.jumlahBarang ?? '—'}</td>
                      <td className="py-2.5 px-2 text-right text-amber-400">
                        {d.asuransi != null ? formatRupiah(d.asuransi) : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-slate-400 max-w-[200px] truncate" title={d.alamat || ''}>
                        {d.alamat || '—'}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {r.ok ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold">
                            <CheckCircle2 className="w-3 h-3" />
                            OK
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-semibold"
                            title={r.error}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Gagal
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {failedCount > 0 && (
            <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
              <strong>Catatan:</strong> {failedCount} gambar gagal diproses. Kemungkinan karena
              format tidak dikenali AI atau foto blur. Coba foto lebih jelas atau crop ke area resi.
            </div>
          )}
        </div>
      )}

      {/* Empty State Helper */}
      {files.length === 0 && results.length === 0 && (
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto">
            <ImageIcon className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-white">Cara Pakai</h3>
          <ol className="text-xs text-slate-400 max-w-2xl mx-auto text-left leading-relaxed space-y-1.5 list-decimal list-inside">
            <li>
              Siapkan foto resi (bisa foto kertas, struk thermal, atau screenshot aplikasi ekspedisi).
            </li>
            <li>
              Upload 1–50 gambar sekaligus (drag-drop atau klik area upload di atas).
            </li>
            <li>
              Klik <strong className="text-purple-400">Proses dengan AI</strong>. Tunggu 1–2 menit.
            </li>
            <li>
              Tabel hasil muncul. Anda bisa <strong className="text-emerald-400">Salin</strong> ke
              spreadsheet, atau <strong className="text-emerald-400">Download CSV/Excel</strong>.
            </li>
          </ol>
          <div className="text-[10px] text-slate-500 mt-3 flex items-center justify-center gap-1.5">
            <Eye className="w-3 h-3" />
            <span>Pastikan foto jelas, tidak blur, dan sudut tidak terlalu miring.</span>
          </div>
        </div>
      )}
    </div>
  );
};
