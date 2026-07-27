import { WaybillTrackingResult, CostServiceOption, BulkTrackItem, WaybillStatus } from '../types';

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
 */
export async function calculateShippingCost(
  origin: string,
  destination: string,
  weightGrams: number,
  couriers: string[] = DEFAULT_COST_COURIERS
): Promise<CostServiceOption[]> {
  const params = new URLSearchParams({
    origin,
    destination,
    weight: String(weightGrams),
    courier: couriers.join(',')
  });

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

export type { WaybillStatus };
