import { CourierInfo } from '../types';

// =====================================================================
// Daftar kurir — gabungan tracking (24) + cek ongkir (12 BinderByte + 5 pricelist).
// Field `source` di info kurir ongkir membedakan data source:
//   - 'binderbyte' → hitung via /api/cost BinderByte
//   - 'pricelist'  → hitung via XLSX lokal (J&T Cargo, MEX, Herona, CMC)
// =====================================================================

/**
 * 24 kurir cek resi sesuai dokumentasi resmi BinderByte.
 * Diambil dari tabel "List Kurir Cek Resi" dokumentasi.
 *
 * Field `supportsCost` menandai apakah kurir ini juga support di /v1/cost.
 * Daftar 22 kurir ongkir diambil dari tabel "List Kurir Cek Ongkir" dokumentasi.
 */
export const COURIERS: CourierInfo[] = [
  // -------- 5 kurir kargo tambahan (dari pricelist XLSX) --------
  {
    code: 'mex_darat',
    name: 'MEX Cargo (Darat)',
    shortName: 'MEX Darat',
    category: 'kargo',
    sampleAwb: '—',
    source: 'pricelist'
  },
  {
    code: 'mex_udara',
    name: 'MEX Cargo (Udara)',
    shortName: 'MEX Udara',
    category: 'kargo',
    sampleAwb: '—',
    source: 'pricelist'
  },
  {
    code: 'herona',
    name: 'Herona',
    shortName: 'Herona',
    category: 'kargo',
    sampleAwb: '—',
    source: 'pricelist'
  },
  {
    code: 'cmc',
    name: 'CMC',
    shortName: 'CMC',
    category: 'kargo',
    sampleAwb: '—',
    source: 'pricelist'
  },
  // -------- 24 kurir cek resi --------
  {
    code: 'jne',
    name: 'JNE Express',
    shortName: 'JNE',
    category: 'populer',
    sampleAwb: 'JNE1234567890',
    prefixes: ['JNE', '01', '02', '03', '54', '88'],
    supportsCost: true
  },
  {
    code: 'pos',
    name: 'POS Indonesia',
    shortName: 'POS',
    category: 'populer',
    sampleAwb: 'P2607202612',
    prefixes: ['P1', 'P2', 'P3', 'RR', 'EE', 'CP'],
    supportsCost: true
  },
  {
    code: 'jnt',
    name: 'J&T Express Indonesia',
    shortName: 'J&T',
    category: 'populer',
    sampleAwb: 'JX1234567890',
    prefixes: ['JX', 'JP', 'TJ', 'JO', 'EZ'],
    supportsCost: true // sebagai 'j&t'
  },
  {
    code: 'jnt_cargo',
    name: 'J&T Cargo',
    shortName: 'J&T Cargo',
    category: 'kargo',
    sampleAwb: '20012345678',
    prefixes: ['200', '300', 'JTC']
  },
  {
    code: 'sicepat',
    name: 'SiCepat Ekspres',
    shortName: 'SiCepat',
    category: 'populer',
    sampleAwb: '001234567890',
    prefixes: ['001', '002', '003', '004', '005', '009', '000', '008'],
    supportsCost: true
  },
  {
    code: 'tiki',
    name: 'TIKI',
    shortName: 'TIKI',
    category: 'populer',
    sampleAwb: '66001234567',
    prefixes: ['660', '030', '120', '010'],
    supportsCost: true
  },
  {
    code: 'anteraja',
    name: 'AnterAja',
    shortName: 'AnterAja',
    category: 'populer',
    sampleAwb: '10001234567890',
    prefixes: ['1000', '1001', '1002', '1003', '1005'],
    supportsCost: true
  },
  {
    code: 'wahana',
    name: 'Wahana Express',
    shortName: 'Wahana',
    category: 'populer',
    sampleAwb: 'AA123456',
    prefixes: ['AA', 'AB', 'AC', 'AD', 'WA'],
    supportsCost: true
  },
  {
    code: 'ninja',
    name: 'Ninja Xpress',
    shortName: 'Ninja',
    category: 'populer',
    sampleAwb: 'NVID1234567890',
    prefixes: ['NVID', 'NINJA', 'NV'],
    supportsCost: true
  },
  {
    code: 'lion',
    name: 'Lion Parcel',
    shortName: 'Lion',
    category: 'populer',
    sampleAwb: '112233445566',
    prefixes: ['11', '12', '99', 'LION'],
    supportsCost: true
  },
  {
    code: 'pcp',
    name: 'PCP Express',
    shortName: 'PCP',
    category: 'lainnya',
    sampleAwb: 'PCP12345678',
    prefixes: ['PCP', 'PCPX']
  },
  {
    code: 'jet',
    name: 'JET Express',
    shortName: 'JET',
    category: 'lainnya',
    sampleAwb: 'JET12345678',
    prefixes: ['JET'],
    supportsCost: true
  },
  {
    code: 'rex',
    name: 'REX Express',
    shortName: 'REX',
    category: 'lainnya',
    sampleAwb: 'REX1234567890',
    prefixes: ['REX', '10'],
    supportsCost: true
  },
  {
    code: 'first',
    name: 'First Logistics',
    shortName: 'First',
    category: 'lainnya',
    sampleAwb: 'FIRST12345678',
    prefixes: ['FIRST'],
    supportsCost: true
  },
  {
    code: 'ide',
    name: 'ID Express',
    shortName: 'IDE',
    category: 'populer',
    sampleAwb: 'IDE1234567890',
    prefixes: ['IDE', 'ID0', 'ID1', 'IDS'],
    supportsCost: true
  },
  {
    code: 'spx',
    name: 'Shopee Express (SPX)',
    shortName: 'SPX',
    category: 'populer',
    sampleAwb: 'SPXID01234567890',
    prefixes: ['SPX', 'SPXID'],
    supportsCost: true
  },
  {
    code: 'kgx',
    name: 'KGXpress',
    shortName: 'KGX',
    category: 'lainnya',
    sampleAwb: 'KG1234567890',
    prefixes: ['KG', 'KGX']
  },
  {
    code: 'sap',
    name: 'SAP Express',
    shortName: 'SAP',
    category: 'lainnya',
    sampleAwb: 'SAP1234567890',
    prefixes: ['SAP', 'U'],
    supportsCost: true
  },
  {
    code: 'jxe',
    name: 'JX Express',
    shortName: 'JX Express',
    category: 'lainnya',
    sampleAwb: 'JXE1234567890',
    prefixes: ['JXE', 'JXEX']
  },
  {
    code: 'rpx',
    name: 'RPX',
    shortName: 'RPX',
    category: 'lainnya',
    sampleAwb: 'RPX1234567890',
    prefixes: ['RPX']
  },
  {
    code: 'lazada',
    name: 'Lazada Express',
    shortName: 'Lazada',
    category: 'lainnya',
    sampleAwb: 'LZD1234567890',
    prefixes: ['LZD', 'LZADA']
  },
  {
    code: 'indah',
    name: 'Indah Logistik Cargo',
    shortName: 'Indah',
    category: 'kargo',
    sampleAwb: 'JBT12345678',
    prefixes: ['JBT', 'BDG', 'JKT', 'SUB', 'IND'],
    supportsCost: true
  },
  {
    code: 'dakota',
    name: 'Dakota Cargo',
    shortName: 'Dakota',
    category: 'kargo',
    sampleAwb: 'DAK12345678',
    prefixes: ['DAK', 'DKT']
  },
  {
    code: 'rekomendasi',
    name: 'Kurir Rekomendasi BinderByte',
    shortName: 'Rekomendasi',
    category: 'lainnya',
    sampleAwb: '',
    prefixes: []
  }
];

// Cek `supportsCost` di bawah ini hanya 12 kurir sesuai dokumentasi BinderByte
// (perbaikan.txt): jne, pos, tiki, sicepat, anteraja, lion, ninja, sap, ide,
// jnt, wahana, spx. Kurir lain (indah, jet, rex, dll) TIDAK support endpoint
// /v1/cost di BinderByte — mengirimkannya akan menyebabkan error.

/**
 * Daftar 12 kurir yang support Cek Ongkir sesuai dokumentasi BinderByte
 * (perbaikan.txt). Field `shortName` mengikuti tabel dokumentasi:
 *   jne, pos, tiki, sicepat, anteraja, lion, ninja, sap, ide, jnt, wahana, spx
 */
export const COST_COURIERS: CourierInfo[] = COURIERS.filter(
  (c) => c.supportsCost || c.source === 'pricelist'
);

export const COST_COURIER_CODES = COST_COURIERS.map((c) => c.code) as readonly string[];

export type CostCourierCode = (typeof COST_COURIER_CODES)[number];

/** Daftar kurir ongkir dari BinderByte (12 kurir). */
export const BINDERBYTE_COST_COURIER_CODES = [
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
] as const;

/** Daftar kurir ongkir dari pricelist XLSX (5 kurir kargo). */
export const PRICELIST_COST_COURIER_CODES = [
  'jnt_cargo',
  'mex_darat',
  'mex_udara',
  'herona',
  'cmc'
] as const;

/**
 * Auto-detect courier code dari AWB string.
 * Cek prefix terpanjang dulu untuk akurasi lebih tinggi.
 */
export function detectCourierFromAwb(awbClean: string): string {
  const clean = awbClean.trim().toUpperCase();
  if (!clean) return 'jne';

  const sorted: { courier: CourierInfo; prefix: string }[] = [];
  for (const courier of COURIERS) {
    if (!courier.prefixes) continue;
    for (const prefix of [...courier.prefixes].sort((a, b) => b.length - a.length)) {
      sorted.push({ courier, prefix });
    }
  }

  for (const { courier, prefix } of sorted) {
    if (clean.startsWith(prefix)) {
      return courier.code;
    }
  }

  return 'jne';
}
