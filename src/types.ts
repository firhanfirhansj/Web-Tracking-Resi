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
}

export interface CourierInfo {
  code: string;
  name: string;
  shortName: string;
  category?: 'populer' | 'kargo' | 'instan' | 'lainnya';
  sampleAwb?: string;
  prefixes?: string[];
  supportsCost?: boolean;
}

export interface LocationItem {
  id: string;
  code: string;
  name: string;
  province: string;
  type: 'Kota' | 'Kabupaten' | 'Kecamatan';
  parentCity?: string; // for kecamatan — refers to its parent city/kabupaten code
}