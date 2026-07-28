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
    throw new Error(json?.message || 'Gagal menghubungi server tracking');
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

// ----------------- AI Ekstrak Resi -----------------

/** Convert File → { filename, base64, mimeType }. */
function fileToPayload(file: File): Promise<{ filename: string; base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result = "data:image/jpeg;base64,xxxxx"
      const [meta, base64] = result.split(',');
      const mimeType = meta.match(/data:([^;]+)/)?.[1] || file.type || 'image/jpeg';
      resolve({ filename: file.name, base64, mimeType });
    };
    reader.onerror = () => reject(new Error(`Gagal membaca file ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * Kirim 1–50 gambar ke /api/ai/extract-resi. Server akan forward ke
 * Ollama (default model: llama3.2-vision) lalu kembalikan JSON terstruktur.
 */
export async function extractResiWithAI(files: File[]): Promise<ExtractedResi[]> {
  if (files.length === 0) return [];
  if (files.length > 50) {
    throw new Error('Maksimal 50 gambar per request.');
  }
  const items = await Promise.all(files.map(fileToPayload));
  const fd = new FormData();
  for (const it of items) {
    // Reconstruct File dari base64 agar backend dapat filename+mimetype
    const byteString = atob(it.base64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const file = new File([ab], it.filename, { type: it.mimeType });
    fd.append('files', file, it.filename);
  }
  const res = await fetch('/api/ai/extract-resi', {
    method: 'POST',
    body: fd
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok || json?.status !== 200) {
    throw new Error(json?.message || `HTTP ${res.status}: Gagal extract resi`);
  }
  return (json?.results || []) as ExtractedResi[];
}

export async function getAiHealth(): Promise<{
  configured: boolean;
  reachable: boolean;
  model: string;
  baseUrl: string;
  apiKeyPresent: boolean;
  error?: string;
}> {
  const res = await fetch('/api/ai/health');
  const json = await res.json().catch(() => ({} as any));
  return {
    configured: Boolean(json?.configured),
    reachable: Boolean(json?.reachable),
    model: json?.model || 'llama3.2-vision',
    baseUrl: json?.baseUrl || '',
    apiKeyPresent: Boolean(json?.apiKeyPresent),
    error: json?.error
  };
}

// ----------------- Download helpers (CSV / XLSX) untuk hasil AI -----------------

const EXPORT_HEADERS = [
  'No Resi',
  'Ekspedisi',
  'Pengirim',
  'Penerima',
  'Tanggal Kirim',
  'Alamat',
  'Harga (IDR)',
  'Load (Kg)',
  'Jumlah Barang',
  'Asuransi (IDR)',
  'Status',
  'File Sumber'
];

function extractRows(results: ExtractedResi[]) {
  return results.map((r, idx) => {
    const d = r.data || ({} as any);
    return {
      '#': idx + 1,
      'No Resi': d.noResi || '',
      'Ekspedisi': d.ekspedisi || '',
      'Pengirim': d.pengirim || '',
      'Penerima': d.penerima || '',
      'Tanggal Kirim': d.tanggalKirim || '',
      'Alamat': d.alamat || '',
      'Harga (IDR)': d.harga ?? '',
      'Load (Kg)': d.loadKg ?? '',
      'Jumlah Barang': d.jumlahBarang ?? '',
      'Asuransi (IDR)': d.asuransi ?? '',
      'Status': r.ok ? 'OK' : `Gagal: ${r.error || 'unknown'}`,
      'File Sumber': r.filename
    };
  });
}

export function downloadAsCSV(results: ExtractedResi[], filenamePrefix: string = 'export_resi_ai'): void {
  const rows = extractRows(results);
  const headers = ['#', ...EXPORT_HEADERS];
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
  const headers = ['#', ...EXPORT_HEADERS];
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
  const headers = ['#', ...EXPORT_HEADERS];
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
