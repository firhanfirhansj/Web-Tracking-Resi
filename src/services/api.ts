import {
  WaybillTrackingResult,
  CostServiceOption,
  BulkTrackItem,
  WaybillStatus,
  ExtractedResi,
  PricelistCity,
  CostSource
} from '../types';
import * as XLSX from 'xlsx';

const SAVED_WAYBILLS_KEY = 'binderbyte_saved_waybills';

// ----------------- Local history (LocalStorage) -----------------

export function getSavedWaybills(): WaybillTrackingResult[] {
  try {
    const raw = localStorage.getItem(SAVED_WAYBILLS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveWaybillToHistory(item: WaybillTrackingResult): void {
  try {
    const existing = getSavedWaybills();
    const filtered = existing.filter((x) => x.awb !== item.awb);
    filtered.unshift(item);
    localStorage.setItem(SAVED_WAYBILLS_KEY, JSON.stringify(filtered.slice(0, 100)));
  } catch {
    // Ignore
  }
}

export function removeSavedWaybill(awb: string): WaybillTrackingResult[] {
  try {
    const existing = getSavedWaybills();
    const updated = existing.filter((x) => x.awb !== awb);
    localStorage.setItem(SAVED_WAYBILLS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function clearAllSavedWaybills(): void {
  try {
    localStorage.removeItem(SAVED_WAYBILLS_KEY);
  } catch {
    // Ignore
  }
}

// ----------------- Single Track -----------------

/**
 * ✅ FIX Bug #3: parameter `number` (nomor telepon penerima) sesuai
 * dokumentasi BinderByte untuk JNE: ...&courier=jne&awb=...&number=xxxxx
 * Hanya diteruskan jika courier adalah JNE.
 */
export async function trackWaybill(
  awb: string,
  courier: string,
  number?: string
): Promise<WaybillTrackingResult> {
  const cleanAwb = awb.trim();
  if (!cleanAwb) throw new Error('Nomor resi tidak boleh kosong');

  const params = new URLSearchParams({
    awb: cleanAwb,
    courier
  });
  if (courier.toLowerCase() === 'jne' && number && number.trim()) {
    params.set('number', number.trim());
  }

  const response = await fetch(`/api/track?${params.toString()}`);
  const json = await response.json().catch(() => ({} as any));

  if (!response.ok || json?.status !== 200 || !json?.data) {
    throw new Error(json?.message || `Gagal melacak resi (HTTP ${response.status})`);
  }

  const result: WaybillTrackingResult = {
    ...json.data,
    lastChecked: new Date().toISOString()
  };
  saveWaybillToHistory(result);
  return result;
}

// ----------------- Bulk Track -----------------

/**
 * Bulk tracking di sisi client: kirim seluruh array ke server.
 * Server akan loop paralel panggil /v1/track per item (max 50).
 *
 * ✅ FIX Bug #3: tiap item boleh berisi `number` (nomor telepon penerima)
 * untuk kurir JNE — akan diteruskan ke BinderByte.
 */
export async function trackWaybillsBulk(
  items: { id: string; awb: string; courier: string; label?: string; number?: string }[],
  onProgress?: (
    completed: number,
    total: number,
    latestResult?: { id: string; result?: WaybillTrackingResult; errorMessage?: string; status: 'success' | 'error' }
  ) => void
): Promise<BulkTrackItem[]> {
  if (items.length === 0) return [];
  const maxItems = items.slice(0, 50);

  const response = await fetch('/api/track/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: maxItems })
  });

  const json = await response.json().catch(() => ({} as any));

  if (!response.ok || !Array.isArray(json?.results)) {
    throw new Error(json?.message || `Gagal menghubungi server tracking (HTTP ${response.status})`);
  }

  const resultsMap = new Map<string, BulkTrackItem>();
  let completed = 0;

  for (const itemRes of json.results) {
    completed++;
    const original = items.find((x) => x.id === itemRes.id);
    const bulkItem: BulkTrackItem = {
      id: itemRes.id,
      awb: itemRes.awb,
      courier: itemRes.courier,
      note: original?.label,
      status: itemRes.status === 'success' ? 'success' : 'error',
      result: itemRes.result,
      errorMessage: itemRes.errorMessage
    };
    resultsMap.set(itemRes.id, bulkItem);

    if (itemRes.result) saveWaybillToHistory(itemRes.result);

    if (onProgress) {
      onProgress(completed, maxItems.length, {
        id: itemRes.id,
        result: itemRes.result,
        errorMessage: itemRes.errorMessage,
        status: itemRes.status === 'success' ? 'success' : 'error'
      });
    }
  }

  return maxItems.map(
    (item) =>
      resultsMap.get(item.id) || {
        id: item.id,
        awb: item.awb,
        courier: item.courier,
        status: 'error' as const,
        errorMessage: 'Tidak ada respons dari server'
      }
  );
}

// ----------------- Cost (Cek Ongkir) -----------------

const DEFAULT_COST_COURIERS = [
  'jne',
  'pos',
  'tiki',
  'sicepat',
  'anteraja',
  'lion',
  'ninja',
  'sap',
  'ide',
  'jnt',
  'wahana',
  'spx'
];

/**
 * ✅ Dokumentasi BinderByte (perbaikan.txt): origin & destination adalah
 * district ID dari /v1/locations (mis. "dist_36.72.08" atau "33.74.01.1001").
 * Tidak ada lagi parameter "originType"/"destinationType" — tipe lokasi
 * ditentukan oleh prefix id-nya sendiri.
 *
 * Weight dikirim dalam GRAM dari frontend (untuk UX konsistensi), lalu
 * server proxy yang konversi ke KILOGRAM sesuai dokumentasi BinderByte.
 *
 * Parameter `sources` (BARU, perbaikan.txt #3): array sumber ongkir yang
 * dipakai. Default: ['binderbyte', 'pricelist'] — keduanya digabung.
 * User bisa set ['binderbyte'] atau ['pricelist'] saja via UI.
 */
export async function calculateShippingCost(
  origin: string,
  destination: string,
  weightGrams: number,
  couriers: string[] = DEFAULT_COST_COURIERS,
  sources: CostSource[] = ['binderbyte', 'pricelist'],
  opts: { originCity?: string; destCity?: string } = {}
): Promise<CostServiceOption[]> {
  const params = new URLSearchParams({
    origin,
    destination,
    weight: String(weightGrams),
    courier: couriers.join(','),
    source: sources.join(',')
  });
  if (opts.originCity) params.set('originCity', opts.originCity);
  if (opts.destCity) params.set('destCity', opts.destCity);

  const response = await fetch(`/api/cost?${params.toString()}`);

  // ✅ FIX JSON error: Cek content-type sebelum parse JSON.
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Respons server bukan JSON (HTTP ${response.status}). ` +
        `Pastikan BINDERBYTE_API_KEY sudah di-set dan server berjalan. ` +
        `Potongan respons: ${text.slice(0, 80) || '(kosong)'}`
    );
  }

  const json = await response.json().catch(() => ({} as any));
  const okCode = json?.code === '200' || json?.code === 200 || json?.status === 200;
  if (!response.ok || !okCode) {
    throw new Error(json?.message || `Gagal mengambil data ongkir (HTTP ${response.status})`);
  }
  if (Array.isArray(json.data)) return json.data;
  return [];
}

// ----------------- Locations (sesuai dokumentasi BinderByte baru) -----------------
// Dokumentasi BinderByte (perbaikan.txt) hanya menyediakan SATU endpoint:
//   GET /v1/locations?search=<keyword>&api_key=<key>
// Response: { code, message, data: [{ id, type, label }] }
//
// Tipe 'type' yang dikembalikan bisa berupa:
//   - "province"   → id: "33"
//   - "city"       → id: "33.74"
//   - "district"   → id: "33.74.01"
//   - "village"    → id: "33.74.01.1001"
//
// Untuk Cek Ongkir, dokumentasi contoh menggunakan id dengan prefix
// "dist_36.72.08" / "village_36.72.08.1007". Frontend mengirim id mentah
// (mis. "33.74.01.1001") dan server proxy akan otomatis prefix-kan
// sesuai tipenya (lihat api/index.ts).

export interface LocationResult {
  id: string;
  type: 'province' | 'city' | 'district' | 'village' | string;
  label: string;
}

export async function fetchLocations(search: string): Promise<LocationResult[]> {
  const q = search.trim();
  if (q.length < 3) return [];
  const res = await fetch(`/api/locations?search=${encodeURIComponent(q)}`);
  const json = await res.json().catch(() => ({} as any));
  // Response BinderByte: { code: "200", message, data: [...] }
  const okCode = json?.code === '200' || json?.code === 200 || json?.status === 200;
  if (!res.ok || !okCode || !Array.isArray(json?.data)) {
    throw new Error(json?.message || 'Gagal mencari lokasi');
  }
  return json.data as LocationResult[];
}

// ----------------- Legacy aliases (kompatibilitas dengan kode lama) -----------------
// Beberapa komponen lama mungkin masih import nama-nama ini. Kita export
// stub yang melempar error informatif agar tidak silent-fail.
export interface Province {
  province_id: string;
  province: string;
}
export interface City {
  city_id: string;
  province_id: string;
  province: string;
  type: string;
  city_name: string;
  postal_code: string;
}
export interface District {
  district_id: string;
  city_id: string;
  province_id: string;
  province: string;
  type: string;
  city_name: string;
  district_name: string;
  postal_code: string;
}

/** @deprecated Gunakan fetchLocations() — endpoint /v1/provinces sudah tidak ada di dokumentasi BinderByte. */
export async function fetchProvinces(): Promise<Province[]> {
  throw new Error(
    'fetchProvinces() sudah tidak dipakai. Gunakan fetchLocations(search) sesuai dokumentasi BinderByte baru.'
  );
}

/** @deprecated Gunakan fetchLocations() — endpoint /v1/cities sudah tidak dipakai. */
export async function fetchCities(): Promise<City[]> {
  throw new Error(
    'fetchCities() sudah tidak dipakai. Gunakan fetchLocations(search) sesuai dokumentasi BinderByte baru.'
  );
}

/** @deprecated Gunakan fetchLocations() — endpoint /v1/districts sudah tidak dipakai. */
export async function fetchDistricts(_cityId: string): Promise<District[]> {
  throw new Error(
    'fetchDistricts() sudah tidak dipakai. Gunakan fetchLocations(search) sesuai dokumentasi BinderByte baru.'
  );
}

// ----------------- CSV Export -----------------

export function exportBulkToCSV(items: BulkTrackItem[]): void {
  const headers = [
    'Nomor Resi',
    'Kurir',
    'Status',
    'Catatan/Pengirim',
    'Penerima',
    'Asal',
    'Tujuan',
    'Terakhir Diupdate'
  ];
  const rows = items.map((item) => {
    const res = item.result;
    return [
      item.awb,
      res?.courierName || item.courier.toUpperCase(),
      res?.statusText || item.status,
      item.note || res?.summary?.shipper || '',
      res?.summary?.receiver || '',
      res?.summary?.origin || '',
      res?.summary?.destination || '',
      res?.lastChecked ? new Date(res.lastChecked).toLocaleString('id-ID') : ''
    ].map((val) => `"${String(val).replace(/"/g, '""')}"`);
  });

  const csvContent =
    'data:text/csv;charset=utf-8,﻿' +
    [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `report_tracking_resi_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ----------------- Pricelist Cities (untuk dropdown Cek Ongkir) -----------------

export async function fetchPricelistCities(): Promise<PricelistCity> {
  const res = await fetch('/api/pricelist/cities');
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok || json?.status !== 200) {
    throw new Error(json?.message || 'Gagal load pricelist cities');
  }
  return { origin: json?.data?.origin || [], destination: json?.data?.destination || [] };
}

// ----------------- AI Ekstrak Resi (KiosAPI) -----------------

// Batas Vercel untuk body request serverless adalah 4,5 MB. Kompres gambar
// besar di browser dan kirim maksimal 2 foto per request. Concurrency
// KiosAPI group Free sangat terbatas, jadi request kecil + jeda lebih aman
// daripada mengirim 5 gambar sekaligus.
const MAX_IMAGE_EDGE = 1600;
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_BATCH_BYTES = 3_500_000;
const MAX_BATCH_FILES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Hanya error sementara yang layak dicoba ulang; error key/model tidak. */
function isRetryableAiError(message?: string): boolean {
  if (!message) return false;
  if (/KIOSAPI_API_KEY|HTTP 40[13]|tidak ada di daftar|tidak tersedia untuk API key|terlalu besar|HTTP 413/i.test(message)) {
    return false;
  }
  return (
    /429|rate.?limit|sibuk|timeout|jaringan|network|fetch failed|econn|socket|aborted|tidak mengembalikan hasil/i.test(
      message
    ) || /\b5\d\d\b/.test(message)
  );
}

/** Perkecil foto besar agar muat di limit Vercel; kalau gagal, pakai aslinya. */
async function compressImage(file: File): Promise<File> {
  if (file.size <= MAX_IMAGE_BYTES || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** Kirim satu batch kecil ke server; hasil selalu urut sesuai input. */
async function requestExtractBatch(chunk: File[]): Promise<ExtractedResi[]> {
  const fd = new FormData();
  for (const file of chunk) fd.append('files', file, file.name);

  const res = await fetch('/api/ai/extract-resi', { method: 'POST', body: fd });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok || json?.status !== 200) {
    throw new Error(json?.message || `HTTP ${res.status}: Gagal extract resi`);
  }

  const raw = Array.isArray(json?.results) ? (json.results as ExtractedResi[]) : [];
  return chunk.map(
    (file, i) =>
      raw[i] || {
        filename: file.name,
        ok: false,
        error: 'Server tidak mengembalikan hasil.'
      }
  );
}

/**
 * Kirim 1–50 gambar ke /api/ai/extract-resi (KiosAPI, model default
 * agnes-3.0-flash). Foto dikirim 2 per request agar tidak menabrak rate
 * limit group Free, lalu foto yang gagal karena error sementara dicoba
 * ulang satu per satu.
 */
export async function extractResiWithAI(
  files: File[],
  onProgress?: (completed: number, total: number) => void,
  onStatus?: (message: string | null) => void
): Promise<ExtractedResi[]> {
  if (files.length === 0) return [];
  if (files.length > 50) {
    throw new Error('Maksimal 50 gambar per request.');
  }

  onStatus?.('Menyiapkan dan mengompres gambar…');
  const prepared = await Promise.all(files.map(compressImage));

  // Kalau browser tidak bisa mengompres (mis. HEIC), jangan kirim file yang
  // pasti ditolak Vercel dengan error 413 yang membingungkan.
  const tooBig = prepared.find((file) => file.size > MAX_BATCH_BYTES);
  if (tooBig) {
    throw new Error(
      `Foto "${tooBig.name}" terlalu besar (${(tooBig.size / 1024 / 1024).toFixed(1)} MB). ` +
        'Kecilkan foto ke bawah 3 MB atau ubah ke JPG, lalu coba lagi.'
    );
  }

  // Susun batch berdasarkan jumlah file dan total ukuran.
  const batches: File[][] = [];
  let batch: File[] = [];
  let batchBytes = 0;
  for (const file of prepared) {
    if (batch.length > 0 && (batch.length >= MAX_BATCH_FILES || batchBytes + file.size > MAX_BATCH_BYTES)) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(file);
    batchBytes += file.size;
  }
  if (batch.length > 0) batches.push(batch);

  const results: ExtractedResi[] = new Array(prepared.length);
  let completed = 0;
  let fatalError: string | null = null;

  onStatus?.('Membaca data resi dengan AI…');
  for (const chunk of batches) {
    const start = completed;
    let chunkResults: ExtractedResi[];
    try {
      chunkResults = await requestExtractBatch(chunk);
    } catch (e: any) {
      const message = e?.message || 'Gagal extract resi';
      chunkResults = chunk.map((file) => ({ filename: file.name, ok: false, error: message }));
      fatalError = message;
    }

    chunkResults.forEach((result, i) => {
      results[start + i] = result;
    });
    completed += chunk.length;
    onProgress?.(Math.min(completed, prepared.length), prepared.length);

    // Error batch biasanya sistemik (key/quota/jaringan). Hentikan sisa
    // batch; foto yang belum diproses akan ikut dicoba ulang di bawah.
    if (fatalError) break;
  }

  for (let i = 0; i < prepared.length; i++) {
    if (!results[i]) {
      results[i] = {
        filename: prepared[i].name,
        ok: false,
        error: fatalError || 'Tidak diproses.'
      };
    }
  }

  // Retry pass: rate limit Free sering pulih setelah beberapa detik.
  const retryIndexes = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => !result.ok && isRetryableAiError(result.error))
    .map(({ index }) => index);

  if (retryIndexes.length > 0) {
    onStatus?.(`Menunggu rate limit pulih, lalu mencoba ulang ${retryIndexes.length} foto…`);
    await sleep(3_000);

    let retried = 0;
    for (const index of retryIndexes) {
      retried++;
      onStatus?.(`Mencoba ulang ${retried}/${retryIndexes.length}: ${prepared[index].name}`);
      try {
        const [retryResult] = await requestExtractBatch([prepared[index]]);
        if (retryResult?.ok) results[index] = retryResult;
      } catch {
        // Biarkan error awal tetap tampil.
      }
      if (retried < retryIndexes.length) await sleep(2_000);
    }
  }

  onStatus?.(null);
  return results;
}

export async function getAiHealth(): Promise<{
  configured: boolean;
  reachable: boolean;
  model: string;
  baseUrl: string;
  apiKeyPresent: boolean;
  modelAvailable?: boolean;
  error?: string;
}> {
  const res = await fetch('/api/ai/health');
  const json = await res.json().catch(() => ({} as any));
  return {
    configured: Boolean(json?.configured),
    reachable: Boolean(json?.reachable),
    model: json?.model || 'agnes-3.0-flash',
    baseUrl: json?.baseUrl || '',
    apiKeyPresent: Boolean(json?.apiKeyPresent),
    modelAvailable:
      typeof json?.modelAvailable === 'boolean' ? json.modelAvailable : undefined,
    error: json?.error
  };
}

// ----------------- Download helpers (CSV / XLSX) untuk hasil AI -----------------

/**
 * ✅ catatan.txt: Urutan kolom hasil ekspor =
 *   Ekspedisi, Pengirim, Penerima, No Resi, Biaya, Berat, Jumlah barang,
 *   Asuransi (khusus jnt cargo), Alamat.
 * Field Tujuan/Tanggal Kirim dihapus dari output akhir (user hanya minta
 * 9 kolom ini).
 */
const EXPORT_HEADERS = [
  'Ekspedisi',
  'Pengirim',
  'Penerima',
  'No Resi',
  'Biaya (IDR)',
  'Berat (Kg)',
  'Jumlah',
  'Asuransi (IDR)',
  'Alamat'
];

function extractRows(results: ExtractedResi[]) {
  return results.map((r, idx) => {
    const d = r.data || ({} as any);
    return {
      'No': idx + 1,
      'Ekspedisi': d.ekspedisi || '',
      'Pengirim': d.pengirim || '',
      'Penerima': d.penerima || '',
      'No Resi': d.noResi || '',
      'Biaya (IDR)': d.harga ?? '',
      'Berat (Kg)': d.loadKg ?? '',
      'Jumlah': d.jumlahBarang ?? '',
      'Asuransi (IDR)': d.asuransi ?? '',
      'Alamat': d.alamat || '',
      'Status': r.ok ? 'OK' : `Gagal: ${r.error || 'unknown'}`,
      'File Sumber': r.filename
    };
  });
}

export function downloadAsCSV(results: ExtractedResi[], filenamePrefix: string = 'export_resi_ai'): void {
  const rows = extractRows(results);
  // ✅ perbaikan.txt #3: susunan header sesuai urutan user
  const headers = ['No', ...EXPORT_HEADERS];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => {
          const v = (row as any)[h];
          const s = v == null ? '' : String(v);
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(',')
    );
  }
  const csv = '﻿' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`);
}

export function downloadAsXLSX(results: ExtractedResi[], filenamePrefix: string = 'export_resi_ai'): void {
  const rows = extractRows(results);
  const headers = ['No', ...EXPORT_HEADERS];
  const aoa: any[][] = [headers, ...rows.map((r) => headers.map((h) => (r as any)[h]))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Auto-size columns kasar
  ws['!cols'] = headers.map((h) => ({ wch: Math.min(40, Math.max(10, h.length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hasil Ekstraksi');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Copy tabel ke clipboard sebagai TSV (Excel-friendly paste). */
export async function copyAsTSV(results: ExtractedResi[]): Promise<boolean> {
  const rows = extractRows(results);
  const headers = ['No', ...EXPORT_HEADERS];
  const lines = [headers.join('\t')];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => {
          const v = (row as any)[h];
          return v == null ? '' : String(v).replace(/\t/g, ' ').replace(/\n/g, ' ');
        })
        .join('\t')
    );
  }
  const tsv = lines.join('\n');
  try {
    await navigator.clipboard.writeText(tsv);
    return true;
  } catch {
    return false;
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type { WaybillStatus, CostSource };
