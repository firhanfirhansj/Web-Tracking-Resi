import { WaybillTrackingResult, CostServiceOption, BulkTrackItem, WaybillStatus } from '../types';

const SAVED_WAYBILLS_KEY = 'binderbyte_saved_waybills';
const SAVED_CITIES_CACHE_KEY = 'binderbyte_cities_cache_v1';

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

export async function trackWaybill(awb: string, courier: string): Promise<WaybillTrackingResult> {
  const cleanAwb = awb.trim();
  if (!cleanAwb) throw new Error('Nomor resi tidak boleh kosong');

  const response = await fetch(
    `/api/track?awb=${encodeURIComponent(cleanAwb)}&courier=${encodeURIComponent(courier)}`
  );
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
 */
export async function trackWaybillsBulk(
  items: { id: string; awb: string; courier: string; label?: string }[],
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
  'j&t',
  'wahana',
  'spx'
];

export async function calculateShippingCost(
  origin: string,
  destination: string,
  weightGrams: number,
  couriers: string[] = DEFAULT_COST_COURIERS,
  originType: 'city' | 'district' = 'city',
  destinationType: 'city' | 'district' = 'city'
): Promise<CostServiceOption[]> {
  const params = new URLSearchParams({
    origin,
    destination,
    weight: String(weightGrams),
    courier: couriers.join(','),
    originType,
    destinationType
  });

  const response = await fetch(`/api/cost?${params.toString()}`);

  // ✅ FIX JSON error: Cek content-type sebelum parse JSON. Vercel / server bisa
  // mengembalikan HTML error page (cth: "A server error occurred") ketika route
  // tidak ter-handle atau upstream timeout. response.json() akan throw
  // SyntaxError "Unexpected token 'A'" di kasus itu — kita tangkap dengan
  // pesan yang lebih jelas.
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

  if (!response.ok) {
    throw new Error(json?.message || `Gagal mengambil data ongkir (HTTP ${response.status})`);
  }
  if (Array.isArray(json.data)) return json.data;
  return [];
}

// ----------------- Locations (Province / City / District) -----------------

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

export async function fetchProvinces(): Promise<Province[]> {
  const res = await fetch('/api/provinces');
  const json = await res.json();
  if (!res.ok || !Array.isArray(json?.data)) {
    throw new Error(json?.message || 'Gagal mengambil daftar provinsi');
  }
  return json.data;
}

interface CitiesCache {
  cachedAt: number;
  data: City[];
}
const CITIES_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam

export async function fetchCities(): Promise<City[]> {
  // Cache di localStorage
  try {
    const raw = localStorage.getItem(SAVED_CITIES_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as CitiesCache;
      if (Date.now() - cached.cachedAt < CITIES_CACHE_TTL_MS && Array.isArray(cached.data)) {
        return cached.data;
      }
    }
  } catch {
    // Ignore
  }

  const res = await fetch('/api/cities');
  const json = await res.json();
  if (!res.ok || !Array.isArray(json?.data)) {
    throw new Error(json?.message || 'Gagal mengambil daftar kota');
  }
  try {
    localStorage.setItem(
      SAVED_CITIES_CACHE_KEY,
      JSON.stringify({ cachedAt: Date.now(), data: json.data } as CitiesCache)
    );
  } catch {
    // Ignore quota
  }
  return json.data;
}

export async function fetchDistricts(cityId: string): Promise<District[]> {
  const res = await fetch(`/api/districts?city=${encodeURIComponent(cityId)}`);
  const json = await res.json();
  if (!res.ok || !Array.isArray(json?.data)) {
    throw new Error(json?.message || 'Gagal mengambil daftar kecamatan');
  }
  return json.data;
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
