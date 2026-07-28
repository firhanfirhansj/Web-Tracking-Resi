// =====================================================================
// api/_lib/pricelist.ts
// =====================================================================
// Engine kalkulasi ongkir berbasis pricelist XLSX untuk 5 kurir kargo:
//   - J&T Cargo (tiered 0-10 flat + 11-50 per kg + 51-100 per kg + ...)
//   - Herona    (0-10 flat + 1 kg selanjutnya per kg)
//   - CMC       (flat per kota)
//   - MEX Darat (flat per kota)
//   - MEX Udara (flat per kota)
//
// Output: CostServiceOption[] dengan flag `source: 'pricelist'`.
// =====================================================================

import { getRawRows } from './xlsxLoader.js';

// ------------------- Helpers -------------------

function parseNumber(v: any): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    // Hapus spasi, "Rp", kutip, koma pemisah ribuan
    const cleaned = v.replace(/[^0-9.-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function norm(s: any): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/^kota\s*&\s*kab\s*/i, '')
    .replace(/^kab\s*/i, '')
    .replace(/^kota\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchCity(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  const h = norm(haystack);
  const n = norm(needle);
  if (!h || !n) return false;
  return h === n || h.includes(n) || n.includes(h);
}

// ------------------- Types -------------------

export interface TierRule {
  upToKg: number; // berat maksimum tier ini (inklusif); Infinity = selamanya
  flat?: number; // harga flat (untuk 0-10kg)
  perKg?: number; // harga per kg (untuk kg ke-(upToKg_prev+1) sampai upToKg)
}

interface ParsedRow {
  dest: string;
  minKg: number;
  etd: string;
  tiers: TierRule[];
}

// ------------------- Parsers per courier -------------------

function parseJntCargo(): ParsedRow[] {
  const aoa = getRawRows('jnt_cargo');
  const out: ParsedRow[] = [];
  // Header rows: 0,1,2 (section/title). Data mulai dari baris 3.
  for (let i = 3; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || !r[0]) continue;
    const destArea = String(r[3] || '').trim();
    const destCity = String(r[4] || '').trim();
    const t0 = parseNumber(r[6]); // 0-10kg flat
    const t1 = parseNumber(r[7]); // 11-50kg per kg
    const t2 = parseNumber(r[8]); // 51-100kg per kg
    const t3 = parseNumber(r[9]); // 101-300kg per kg
    const t4 = parseNumber(r[10]); // 301-500kg per kg
    const t5 = parseNumber(r[11]); // 501-1000kg per kg
    const t6 = parseNumber(r[12]); // 1001+ per kg
    const etd = String(r[13] || '').trim();
    if (!destArea) continue;
    out.push({
      dest: `${destArea} - ${destCity}`.trim(),
      minKg: 10,
      etd,
      tiers: [
        { upToKg: 10, flat: t0 },
        { upToKg: 50, perKg: t1 },
        { upToKg: 100, perKg: t2 },
        { upToKg: 300, perKg: t3 },
        { upToKg: 500, perKg: t4 },
        { upToKg: 1000, perKg: t5 },
        { upToKg: Infinity, perKg: t6 }
      ]
    });
  }
  return out;
}

function parseHerona(): ParsedRow[] {
  const aoa = getRawRows('herona');
  const out: ParsedRow[] = [];
  // Header row 1 (index 1). Data mulai dari 2.
  for (let i = 2; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || !r[1]) continue;
    const dest = String(r[1]).trim();
    const flat = parseNumber(r[4]); // 0-10 kg
    const perKg = parseNumber(r[5]); // 1 kg selanjutnya
    const etd = String(r[6] || '').trim();
    const minKg = parseNumber(r[7]) || 10;
    if (!dest) continue;
    out.push({
      dest,
      minKg,
      etd,
      tiers: [
        { upToKg: 10, flat },
        { upToKg: Infinity, perKg }
      ]
    });
  }
  // Dedup berdasar dest (kadang ada multiple rows untuk kota yang sama)
  const dedup = new Map<string, ParsedRow>();
  for (const row of out) {
    const key = norm(row.dest);
    if (!dedup.has(key)) dedup.set(key, row);
  }
  return Array.from(dedup.values());
}

function parseFlatPerCity(courier: 'cmc' | 'mex_darat' | 'mex_udara'): ParsedRow[] {
  const aoa = getRawRows(courier);
  const out: ParsedRow[] = [];
  // Header row 1 (index 1). Data mulai dari 2.
  const isMex = courier === 'mex_darat' || courier === 'mex_udara';
  for (let i = 2; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || !r[1]) continue;
    const dest = String(r[1]).trim();
    let flat = 0;
    let etd = '';
    let minKg = 10;
    if (isMex) {
      // MEX Udara: kolom 4 = harga, 5 = etd, 6 = min kg
      // MEX Darat: kolom 4 = harga, 5 = etd, 6 = min kg
      flat = parseNumber(r[4]);
      etd = String(r[5] || '').trim();
      minKg = parseNumber(r[6]) || 10;
    } else {
      // CMC: kolom 3 = harga, 4 = etd, 5 = min kg
      flat = parseNumber(r[3]);
      etd = String(r[4] || '').trim();
      minKg = parseNumber(r[5]) || 10;
    }
    if (!dest || flat <= 0) continue;
    out.push({
      dest,
      minKg,
      etd,
      tiers: [{ upToKg: Infinity, flat }]
    });
  }
  const dedup = new Map<string, ParsedRow>();
  for (const row of out) {
    const key = norm(row.dest);
    if (!dedup.has(key)) dedup.set(key, row);
  }
  return Array.from(dedup.values());
}

// ------------------- Cache -------------------

let _cache: Record<string, ParsedRow[]> | null = null;

function getParsed(courier: string): ParsedRow[] {
  if (!_cache) _cache = {};
  if (_cache[courier]) return _cache[courier];
  let rows: ParsedRow[] = [];
  switch (courier) {
    case 'jnt_cargo':
      rows = parseJntCargo();
      break;
    case 'herona':
      rows = parseHerona();
      break;
    case 'cmc':
      rows = parseFlatPerCity('cmc');
      break;
    case 'mex_darat':
      rows = parseFlatPerCity('mex_darat');
      break;
    case 'mex_udara':
      rows = parseFlatPerCity('mex_udara');
      break;
  }
  _cache[courier] = rows;
  return rows;
}

// ------------------- Hitung ongkir -------------------

function computePrice(tiers: TierRule[], billableKg: number): number {
  let total = 0;
  let remaining = billableKg;
  let prevUpTo = 0;
  for (const tier of tiers) {
    const tierSpan = tier.upToKg - prevUpTo;
    if (remaining <= 0) break;
    if (tier.flat && prevUpTo === 0) {
      // Flat di tier pertama (0-10kg)
      total += tier.flat;
      remaining -= tier.upToKg;
    } else if (tier.perKg) {
      const kgInTier = Math.min(remaining, tier.upToKg === Infinity ? remaining : tierSpan);
      total += kgInTier * tier.perKg;
      remaining -= kgInTier;
    } else if (tier.flat) {
      total += tier.flat;
      remaining -= tier.upToKg;
    }
    prevUpTo = tier.upToKg;
  }
  return Math.round(total);
}

function findRow(courier: string, dest: string): ParsedRow | null {
  const rows = getParsed(courier);
  for (const r of rows) {
    if (matchCity(r.dest, dest)) return r;
  }
  return null;
}

export interface CargoQuote {
  code: string;
  service: string;
  description: string;
  cost: number;
  etd: string;
  courierCode: string;
  courierName: string;
  source: 'pricelist';
  billableKg: number;
  origin: string;
  destination: string;
}

const COURIER_META: Record<string, { name: string; service: string }> = {
  jnt_cargo: { name: 'J&T Cargo', service: 'FastTrack' },
  herona: { name: 'Herona', service: 'Regular' },
  cmc: { name: 'CMC', service: 'Regular' },
  mex_darat: { name: 'MEX Cargo (Darat)', service: 'Regular (Darat)' },
  mex_udara: { name: 'MEX Cargo (Udara)', service: 'Regular (Udara)' }
};

export function computeCargoCost(opts: {
  originCity: string;
  destCity: string;
  weightKg: number;
  courierFilter?: string[]; // ['jnt_cargo', 'cmc', ...]
}): CargoQuote[] {
  const { originCity, destCity, weightKg, courierFilter } = opts;
  const out: CargoQuote[] = [];
  const wanted = courierFilter || Object.keys(COURIER_META);

  for (const courier of wanted) {
    const meta = COURIER_META[courier];
    if (!meta) continue;

    // J&T Cargo hanya punya 1 origin di pricelist (Bekasi). Untuk rute
    // dari selain Bekasi, tetap hitung dengan label peringatan.
    if (courier === 'jnt_cargo') {
      const originWarning = !matchCity('Bekasi', originCity)
        ? ' (asal bukan Bekasi, harga mengacu Bekasi)'
        : '';
      const row = findRow(courier, destCity);
      if (!row) continue;
      const billable = Math.max(weightKg, row.minKg);
      const cost = computePrice(row.tiers, billable);
      out.push({
        code: courier,
        service: meta.service,
        description: `${meta.name} ${meta.service}${originWarning}`,
        cost,
        etd: row.etd || '7-9 Hari',
        courierCode: courier,
        courierName: meta.name,
        source: 'pricelist',
        billableKg: billable,
        origin: originCity || 'Bekasi',
        destination: row.dest
      });
      continue;
    }

    const row = findRow(courier, destCity);
    if (!row) continue;
    const billable = Math.max(weightKg, row.minKg);
    const cost = computePrice(row.tiers, billable);
    out.push({
      code: courier,
      service: meta.service,
      description: `${meta.name} ${meta.service}`,
      cost,
      etd: row.etd || '1-3 Hari',
      courierCode: courier,
      courierName: meta.name,
      source: 'pricelist',
      billableKg: billable,
      origin: originCity || '-',
      destination: row.dest
    });
  }

  out.sort((a, b) => a.cost - b.cost);
  return out;
}

export function _resetCache(): void {
  _cache = null;
}
