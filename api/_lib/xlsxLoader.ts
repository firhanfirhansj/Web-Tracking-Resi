// =====================================================================
// api/_lib/xlsxLoader.ts
// =====================================================================
// Loader XLSX dengan caching di module-level. Dipakai oleh endpoint
// /api/cost (pricelist kargo) agar file XLSX hanya di-parse SEKALI per
// cold-start Vercel serverless function, bukan per-request.
//
// File XLSX yang di-bundle: diletakkan di root project, Vercel @vercel/node
// resolver ikut men-copy ke runtime, sehingga path relatif dari process.cwd()
// aman.
// =====================================================================

import * as XLSX from 'xlsx';
import * as path from 'path';

// ✅ FIX: xlsx package di ESM mode expose default export. Tanpa ini,
// `XLSX.readFile` undefined & fallback ke error "XLSX.readFile is not
// a function" (lihat test-pricelist.ts).
const XLSXLib: typeof XLSX = (XLSX as any).default || XLSX;

let cache: Map<string, any[][]> | null = null;

function loadAll(): Map<string, any[][]> {
  if (cache) return cache;
  const map = new Map<string, any[][]>();
  const files = [
    ['jnt_cargo', 'Onkgir J&T Cargo.xlsx'],
    ['cmc', 'ongkir CMC.xlsx'],
    ['herona', 'ongkir HERONA.xlsx'],
    ['mex_darat', 'ongkir MEX Darat.xlsx'],
    ['mex_udara', 'ongkir MEX Udara.xlsx']
  ];
  for (const [key, file] of files) {
    try {
      // Resolusi path: di Vercel runtime, /var/task adalah cwd untuk
      // serverless function. File XLSX di-copy ke /var/task/ oleh Vercel.
      const filePath = path.join(process.cwd(), file);
      const wb = XLSXLib.readFile(filePath, { cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSXLib.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      map.set(key, aoa as any[][]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[xlsxLoader] Gagal load ${file}:`, (e as any)?.message);
    }
  }
  cache = map;
  return map;
}

/** Akses langsung ke AOA data per courier. */
export function getRawRows(courier: string): any[][] {
  const all = loadAll();
  return all.get(courier) || [];
}

/** Daftar unik kota asal + tujuan dari semua pricelist (untuk UI Cost). */
export function getUniqueCities(): { origin: string[]; destination: string[] } {
  const all = loadAll();
  const origins = new Set<string>();
  const dests = new Set<string>();
  for (const [key, aoa] of all.entries()) {
    if (key === 'jnt_cargo') {
      // J&T Cargo: asal di kolom 1 (Kota), tujuan di kolom 4 (KAB/KOTA)
      // Sebelumnya kolom 0 (Area) & 3 (Area) — terlalu luas (nama provinsi).
      for (let i = 3; i < aoa.length; i++) {
        const r = aoa[i];
        if (!r || !r[0]) continue;
        if (r[1]) origins.add(String(r[1]).trim());
        if (r[4]) dests.add(String(r[4]).trim());
      }
    } else {
      // Format lain: kolom 1 = KAB/KOTA (tujuan)
      for (let i = 1; i < aoa.length; i++) {
        const r = aoa[i];
        if (!r || !r[1]) continue;
        const name = String(r[1]).trim();
        if (name) dests.add(name);
      }
    }
  }
  return {
    origin: Array.from(origins).sort(),
    destination: Array.from(dests).sort()
  };
}

/** Reset cache (untuk testing). */
export function _resetCache(): void {
  cache = null;
}
