export type CostSource = 'binderbyte' | 'pricelist';

export interface ExtractedResi {
  filename: string;
  ok: boolean;
  data?: {
    pengirim: string | null;
    penerima: string | null;
    tanggalKirim: string | null;
    noResi: string | null;
    alamat: string | null;
    harga: number | null;
    loadKg: number | null;
    jumlahBarang: number | null;
    ekspedisi: string | null;
    asuransi: number | null;
  };
  raw?: string;
  error?: string;
}

export interface PricelistCity {
  origin: string[];
  destination: string[];
}

export type WaybillStatus =
  | 'DELIVERED'
  | 'IN_TRANSIT'
  | 'ON_PROCESS'
  | 'EXCEPTION'
  | 'NOT_FOUND'
  | 'ERROR';

export interface WaybillSummary {
  courier: string;
  waybill_number: string;
  service?: string;
  status: string;
  date?: string;
  weight?: string;
  origin?: string;
  destination?: string;
  shipper?: string;
  receiver?: string;
  amount?: number;
}

export interface WaybillDetail {
  origin?: string;
  destination?: string;
  shipper?: string;
  receiver?: string;
}

export interface WaybillHistoryItem {
  date: string;
  desc: string;
  location?: string;
}

export interface WaybillTrackingResult {
  awb: string;
  courier: string;
  courierName: string;
  status: WaybillStatus;
  statusText?: string;
  summary?: WaybillSummary;
  detail?: WaybillDetail;
  history?: WaybillHistoryItem[];
  error?: string;
  lastChecked?: string;
  isMockData?: boolean;
}

export interface BulkTrackItem {
  id: string;
  awb: string;
  courier: string;
  courierName?: string;
  note?: string;
  /**
   * Nomor telepon penerima (untuk JNE sesuai dokumentasi BinderByte).
   * Optional — hanya diperlukan untuk beberapa kurir yang memakai 4-parameter.
   */
  number?: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  result?: WaybillTrackingResult;
  errorMessage?: string;
}

export interface CostServiceOption {
  code: string;
  service: string;
  description: string;
  cost: number;
  etd: string;
  courierCode: string;
  courierName: string;
  source?: CostSource;
}

export interface CourierInfo {
  code: string;
  name: string;
  shortName: string;
  category?: 'populer' | 'kargo' | 'instan' | 'lainnya';
  sampleAwb?: string;
  prefixes?: string[];
  supportsCost?: boolean;
  source?: CostSource;
}

export interface LocationItem {
  id: string;
  code: string;
  name: string;
  province: string;
  type: 'Kota' | 'Kabupaten' | 'Kecamatan';
  parentCity?: string; // for kecamatan — refers to its parent city/kabupaten code
}