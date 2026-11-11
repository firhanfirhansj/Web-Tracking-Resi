// ====================================================================
// api/_lib/aiExtract.ts
// ====================================================================
// Service untuk ekstrak data resi dari gambar via KiosAPI.
//
// Alur:
//   1. Kirim gambar ke KiosAPI /v1/chat/completions (OpenAI-compatible)
//   2. Format vision WAJIB: content = [{ type: "text" }, { type: "image_url" }]
//      (format lama `images: [...]` + `format: "json"` adalah format Ollama,
//       TIDAK dikenali KiosAPI dan selalu ditolak)
//   3. Fallback ke model berikutnya kalau model utama gagal
//
// Env var:
//   - KIOSAPI_API_KEY          (wajib)
//   - KIOSAPI_BASE_URL         (default: https://kiosapi.com)
//   - KIOSAPI_MODEL            (default: agnes-3.0-flash)
//   - KIOSAPI_FALLBACK_MODELS  (default: agnes-2.5-flash)
// ====================================================================

export interface ExtractedResi {
  filename: string;
  ok: boolean;
  data?: {
    pengirim: string | null;
    penerima: string | null;
    tujuan: string | null;
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

export const KIOSAPI_BASE_URL = 'https://kiosapi.com';
export const KIOSAPI_DEFAULT_MODEL = 'agnes-3.0-flash';
export const KIOSAPI_FALLBACK_MODELS_DEFAULT = 'agnes-2.5-flash';

/**
 * Samakan format base URL. Dokumentasi KiosAPI memakai dua gaya:
 *   - host saja          : https://kiosapi.com
 *   - base OpenAI lengkap: https://kiosapi.com/v1
 * Keduanya diterima di sini, lalu endpoint dibentuk sebagai `${base}/v1/...`.
 * Ini mencegah URL ganda `/v1/v1/chat/completions`.
 */
export function normalizeKiosapiBaseUrl(raw?: string): string {
  const value = (raw || KIOSAPI_BASE_URL).trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
  return value || KIOSAPI_BASE_URL;
}

function isPlaceholderKey(value: string): boolean {
  if (!value) return true;
  const v = value.toLowerCase();
  return (
    v === 'your_kiosapi_api_key_here' ||
    v === 'sk-xxx' ||
    v.startsWith('your_') ||
    v.startsWith('replace_') ||
    v.startsWith('change_me')
  );
}

export function hasUsableKiosapiKey(apiKey?: string): boolean {
  const key = (apiKey ?? process.env.KIOSAPI_API_KEY ?? '').trim();
  return Boolean(key) && !isPlaceholderKey(key);
}

export interface KiosapiRuntimeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  fallbackModels: string[];
}

/** Baca konfigurasi KiosAPI dari environment (tanpa throw). */
export function getKiosapiRuntimeConfig(): KiosapiRuntimeConfig {
  const apiKey = (process.env.KIOSAPI_API_KEY || '').trim();
  const baseUrl = normalizeKiosapiBaseUrl(process.env.KIOSAPI_BASE_URL);
  const model = (process.env.KIOSAPI_MODEL || KIOSAPI_DEFAULT_MODEL).trim() || KIOSAPI_DEFAULT_MODEL;
  const fallbackModels = (process.env.KIOSAPI_FALLBACK_MODELS || KIOSAPI_FALLBACK_MODELS_DEFAULT)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
    .filter((m) => m !== model);

  return { apiKey, baseUrl, model, fallbackModels };
}

/** Konfigurasi untuk request; lempar error yang jelas kalau key belum ada. */
function getKiosapiConfig(): KiosapiRuntimeConfig {
  const config = getKiosapiRuntimeConfig();
  if (!hasUsableKiosapiKey(config.apiKey)) {
    throw new Error(
      'KIOSAPI_API_KEY tidak ditemukan di environment variable.\n\n' +
        'Langkah setup:\n' +
        '1. Daftar di https://kiosapi.com\n' +
        '2. Buat API key di Console -> Tokens, pilih group yang sesuai model\n' +
        '3. Set KIOSAPI_API_KEY di environment (Vercel: Settings > Environment Variables, lokal: .env.local)\n' +
        '4. Deploy ulang aplikasi\n\n' +
        'Model default: ' + KIOSAPI_DEFAULT_MODEL + ' (bisa diganti lewat KIOSAPI_MODEL).'
    );
  }
  return config;
}

/** Tolerant JSON parser — handles model output yang disertai teks/markdown. */
function tryParseJson(text: string): any | null {
  if (!text) return null;
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeKeys(input: any): ExtractedResi['data'] {
  if (!input || typeof input !== 'object') {
    return {
      pengirim: null,
      penerima: null,
      tujuan: null,
      tanggalKirim: null,
      noResi: null,
      alamat: null,
      harga: null,
      loadKg: null,
      jumlahBarang: null,
      ekspedisi: null,
      asuransi: null
    };
  }
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      if (input[k] != null && input[k] !== '') return input[k];
    }
    return null;
  };
  const num = (v: any): number | null => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;

    // Format Indonesia: "Rp 25.000" = 25000, "1,5" = 1.5.
    let s = String(v).trim().replace(/[^0-9.,-]/g, '');
    if (!s) return null;

    const hasDot = s.includes('.');
    const hasComma = s.includes(',');
    if (hasDot && hasComma) {
      // Separator terakhir adalah desimal.
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (hasComma) {
      s = s.replace(',', '.');
    } else if (hasDot) {
      const parts = s.split('.');
      const last = parts[parts.length - 1];
      // "25.000" / "1.234.567" = pemisah ribuan, bukan desimal.
      if (parts.length > 2 || last.length === 3) s = parts.join('');
    }

    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };
  return {
    pengirim: pick('pengirim', 'shipper', 'nama_pengirim') as any,
    penerima: pick('penerima', 'consignee', 'receiver', 'nama_penerima') as any,
    tujuan: pick('tujuan', 'destination_city', 'kota_tujuan', 'city', 'kabupaten', 'kota') as any,
    tanggalKirim: pick('tanggalKirim', 'tanggal_kirim', 'tgl_kirim', 'tanggal', 'date') as any,
    noResi: pick('noResi', 'no_resi', 'resi', 'awb', 'nomor_resi') as any,
    alamat: pick('alamat', 'address', 'alamat_penerima', 'destination') as any,
    harga: num(pick('harga', 'ongkir', 'biaya', 'tarif', 'price')),
    loadKg: num(pick('loadKg', 'load_kg', 'berat', 'weight', 'kg')),
    jumlahBarang: num(pick('jumlahBarang', 'jumlah_barang', 'qty', 'jumlah', 'pieces', 'koli')),
    ekspedisi: pick('ekspedisi', 'courier', 'kurir') as any,
    asuransi: num(pick('asuransi', 'insurance', 'nilai_asuransi'))
  };
}

// Rate limit group Free bersifat sementara. Retry dengan backoff supaya
// sebagian gambar tidak gagal hanya karena request datang terlalu cepat.
// Deadline per gambar menjaga satu request serverless tidak menggantung
// lebih lama dari maxDuration di vercel.json.
const MAX_ATTEMPTS_PER_MODEL = 3;
const REQUEST_TIMEOUT_MS = 40_000;
const IMAGE_DEADLINE_MS = 50_000;
const MAX_RETRY_DELAY_MS = 15_000;
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Delay dari header Retry-After, atau backoff 1s/2s/4s + jitter. */
function getRetryDelayMs(res: Response | null, attempt: number): number {
  const header = res?.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) {
      return Math.min(Math.max(0, seconds * 1000), MAX_RETRY_DELAY_MS);
    }
    const date = Date.parse(header);
    if (!Number.isNaN(date)) {
      return Math.min(Math.max(0, date - Date.now()), MAX_RETRY_DELAY_MS);
    }
  }
  const backoff = 1000 * 2 ** attempt + Math.floor(Math.random() * 400);
  return Math.min(backoff, MAX_RETRY_DELAY_MS);
}

function describeHttpError(status: number, body: string, model: string): string {
  const detail = body.replace(/\s+/g, ' ').trim().slice(0, 240);
  if (status === 429) {
    return `Rate limit/kuota KiosAPI (HTTP 429, model ${model}). Group gratis berbagi kapasitas; coba lagi beberapa saat atau cek quota di dashboard KiosAPI.` +
      (detail ? ` Detail: ${detail}` : '');
  }
  if (status === 401 || status === 403) {
    return `KiosAPI menolak API key (HTTP ${status}, model ${model}). Periksa KIOSAPI_API_KEY dan group token.` +
      (detail ? ` Detail: ${detail}` : '');
  }
  return `KiosAPI HTTP ${status} (model ${model}): ${detail || 'tanpa pesan'}`;
}

const SYSTEM_PROMPT =
  'Kamu adalah AI OCR data resi pengiriman Indonesia. ' +
  'Jawab HANYA dengan satu objek JSON valid, tanpa markdown dan tanpa penjelasan.';

const USER_PROMPT = `Baca gambar resi ini dan ekstrak datanya.

Balas dengan JSON persis berstruktur ini:
{
  "ekspedisi": "nama kurir, mis. JNE / J&T / SiCepat / J&T Cargo",
  "pengirim": "nama pengirim",
  "penerima": "nama penerima",
  "tujuan": "kota/kabupaten tujuan",
  "tanggalKirim": "tanggal kirim (YYYY-MM-DD atau teks apa adanya)",
  "noResi": "nomor resi",
  "alamat": "alamat lengkap penerima",
  "harga": 0,
  "loadKg": 0,
  "jumlahBarang": 0,
  "asuransi": 0
}

Aturan:
- Jika field tidak ada atau tidak terbaca, isi null. Jangan mengarang.
- harga, loadKg, jumlahBarang, dan asuransi harus angka murni tanpa titik, koma, atau "Rp".
- noResi tanpa spasi.
- loadKg dalam kilogram.`;

/** Bagian gambar untuk format vision OpenAI-compatible. */
function buildImagePart(imageBase64: string, mimeType: string) {
  const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
  return {
    type: 'image_url' as const,
    image_url: {
      url: `data:${mimeType || 'image/jpeg'};base64,${cleanBase64}`
    }
  };
}

/** Ambil teks dari message.content yang bisa string, array parts, atau object. */
function contentToText(content: any): string {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return JSON.stringify(content);
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/** Ekstrak satu gambar menggunakan KiosAPI dengan retry + fallback model. */
export async function extractResiFromImage(
  filename: string,
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<ExtractedResi> {
  const { apiKey, baseUrl, model, fallbackModels } = getKiosapiConfig();

  const modelsToTry = Array.from(new Set([model, ...fallbackModels]));
  const imagePart = buildImagePart(imageBase64, mimeType);
  const deadline = Date.now() + IMAGE_DEADLINE_MS;
  let lastError = '';

  for (const tryModel of modelsToTry) {
    // 429 berasal dari kapasitas group Free yang dipakai bersama, jadi
    // model fallback tidak akan menolong. 5xx masih dicoba ke model lain.
    let sharedCapacityFailure = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 2_000) {
        lastError = `Waktu habis saat memproses ${filename} (model ${tryModel}).`;
        break;
      }

      try {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
          body: JSON.stringify({
            model: tryModel,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              {
                role: 'user',
                content: [{ type: 'text', text: USER_PROMPT }, imagePart]
              }
            ],
            temperature: 0,
            max_tokens: 1024,
            stream: false
          })
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          lastError = describeHttpError(res.status, errText, tryModel);

          if (res.status === 401 || res.status === 403) {
            return { filename, ok: false, error: lastError };
          }

          if (RETRYABLE_HTTP_STATUS.has(res.status)) {
            sharedCapacityFailure = res.status === 429;
            const delay = getRetryDelayMs(res, attempt);
            if (attempt < MAX_ATTEMPTS_PER_MODEL - 1 && Date.now() + delay < deadline) {
              await sleep(delay);
              continue;
            }
            break;
          }

          // Model tidak mendukung vision / tidak ada di group: coba fallback.
          break;
        }

        const json = await res.json().catch(() => ({} as any));
        const apiError = json?.error;
        if (apiError) {
          lastError = `KiosAPI error (${tryModel}): ${apiError?.message || JSON.stringify(apiError)}`;
          if (/rate.?limit|too many|quota/i.test(lastError)) {
            sharedCapacityFailure = true;
            const delay = getRetryDelayMs(res, attempt);
            if (attempt < MAX_ATTEMPTS_PER_MODEL - 1 && Date.now() + delay < deadline) {
              await sleep(delay);
              continue;
            }
          }
          break;
        }

        const content = contentToText(json?.choices?.[0]?.message?.content ?? json?.response);
        const parsed = tryParseJson(content);
        if (!parsed) {
          lastError = `Model ${tryModel} tidak mengembalikan JSON valid.`;
          break;
        }

        return {
          filename,
          ok: true,
          data: normalizeKeys(parsed)
        };
      } catch (e: any) {
        const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        lastError = isTimeout
          ? `Model ${tryModel} timeout setelah ${Math.round(Math.min(REQUEST_TIMEOUT_MS, remaining) / 1000)} detik.`
          : `${tryModel}: ${e?.message || 'Gagal memanggil KiosAPI'}`;

        // Error jaringan sesaat: ulangi kalau masih ada waktu.
        if (attempt < MAX_ATTEMPTS_PER_MODEL - 1 && Date.now() + 1_000 < deadline) {
          await sleep(getRetryDelayMs(null, attempt));
          continue;
        }
        break;
      }
    }

    if (sharedCapacityFailure) break;
  }

  return {
    filename,
    ok: false,
    error: lastError || 'Semua model KiosAPI gagal memproses gambar.'
  };
}

/** Ekstrak batch menggunakan KiosAPI dengan fallback multi-model. */
export async function extractResiBatchKiosapi(
  items: { filename: string; base64: string; mimeType?: string }[],
  concurrency: number = 2
): Promise<ExtractedResi[]> {
  const results: ExtractedResi[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    const chunk = await Promise.all(
      slice.map((it) => extractResiFromImage(it.filename, it.base64, it.mimeType || 'image/jpeg'))
    );
    results.push(...chunk);
  }
  return results;
}
