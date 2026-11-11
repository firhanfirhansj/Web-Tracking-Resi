// ====================================================================
// api/_lib/aiExtract.ts
// ====================================================================
// Service untuk ekstrak data resi dari gambar via KiosAPI.
//
// Alur:
//   1. Kirim gambar ke KiosAPI /v1/chat/completions (format OpenAI-compatible)
//   2. Gambar dikirim sebagai content part `image_url` di dalam array content
//      user — BUKAN field `images` (itu format Ollama, tidak dibaca KiosAPI)
//   3. Jika satu model gagal (tidak support vision / error / bukan JSON),
//      otomatis coba model berikutnya dari daftar fallback
//
// Env var:
//   - KIOSAPI_API_KEY          (required)
//   - KIOSAPI_BASE_URL         (default: https://kiosapi.com)
//   - KIOSAPI_MODEL            (default: agnes-2.5-flash)
//   - KIOSAPI_FALLBACK_MODELS  (default: glm-5.3-flash,gemini-2.0-flash)
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

// Model vision dari Free group KiosAPI yang didukung.
// Lihat dokumentasi: https://docs.kiosapi.com
const KIOSAPI_VISION_MODELS = [
  'agnes-2.5-flash',       // Support vision: image understanding, image URL inputs
  'glm-5.3-flash',         // Support vision
  'gemini-2.0-flash',      // Vision capable Google Gemini
  'glm-5.3',               // Vision capable GLM
  'qwen3.8-flash',         // Vision capable Qwen
  'deepseek-v4-flash-vision-exp-free' // Vision capable DeepSeek (free)
] as const;

type KiosapiVisionModel = typeof KIOSAPI_VISION_MODELS[number];

// Konfigurasi dasar
export const KIOSAPI_BASE_URL = "https://kiosapi.com";
export const KIOSAPI_DEFAULT_MODEL = "agnes-2.5-flash";
export const KIOSAPI_FALLBACK_MODELS_DEFAULT = "glm-5.3-flash,gemini-2.0-flash";

/** Prompt sistem: minta satu objek JSON valid tanpa teks tambahan. */
const RESI_SYSTEM_PROMPT = [
  'Kamu adalah AI ekstraktor data resi pengiriman Indonesia.',
  'Baca gambar resi/kwitansi pengiriman lalu kembalikan HANYA satu objek JSON valid.',
  'Tanpa penjelasan, tanpa markdown, tanpa code fence.',
  'Skema JSON yang wajib dipakai:',
  '{"pengirim":string|null,"penerima":string|null,"tujuan":string|null,"tanggalKirim":string|null,"noResi":string|null,"alamat":string|null,"harga":number|null,"loadKg":number|null,"jumlahBarang":number|null,"ekspedisi":string|null,"asuransi":number|null}',
  'Aturan: angka tanpa pemisah ribuan; tanggal format YYYY-MM-DD bila terbaca;',
  'isi null bila data tidak ada di gambar; jangan mengarang data.'
].join('\n');

const RESI_USER_PROMPT =
  'Ekstrak seluruh data resi pada gambar ini sesuai skema JSON.';

/** Tolerant JSON parser — handles model output yang disertai teks lain. */
function tryParseJson(text: string): any | null {
  if (!text) return null;
  // Strip markdown code fences kalau ada
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    // Cari JSON object bounds
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
    if (typeof v === 'number') return v;
    const cleaned = String(v).replace(/[^0-9.-]/g, '');
    const n = parseFloat(cleaned);
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

/** KiosAPI Configuration — lempar error kalau key belum ada */
function getKiosapiConfig() {
  const apiKey = process.env.KIOSAPI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("KIOSAPI_API_KEY tidak ditemukan di environment variable.\n\nLangkah setup:\n1. Daftar di https://kiosapi.com\n2. Buat account dan verifikasi Telegram (untuk Free group)\n3. Buat API key di Console -> Tokens, pilih grup \"Free\"\n4. Set KIOSAPI_API_KEY di environment (Vercel: Settings > Environment Variables, lokal: .env.local)\n5. Deploy ulang aplikasi\n\n⚠️ Penting: Gunakan grup \"Free\" saat membuat token, bukan grup lain.\n\nModel Free group yang tersedia (gratis, 0 cost): agnes-2.5-flash, glm-5.3-flash, gemini-2.0-flash, glm-5.3, qwen3.8-flash, dll.\n\nJika belum punya key, fitur AI Ekstrak Resi akan tampil \"tidak terhubung\".");
  }
  // Normalisasi: buang trailing slash dan suffix "/v1" agar pemanggilan
  // `${baseUrl}/v1/chat/completions` tidak menjadi "/v1/v1/...".
  const baseUrl = (process.env.KIOSAPI_BASE_URL || "https://kiosapi.com")
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1$/, "");
  const model = process.env.KIOSAPI_MODEL || "agnes-2.5-flash";
  const fallbackModels = (process.env.KIOSAPI_FALLBACK_MODELS || "glm-5.3-flash,gemini-2.0-flash")
    .split(",")
    .map((m: string) => m.trim())
    .filter(Boolean);
  return { apiKey, baseUrl, model, fallbackModels };
}

/** Build image content part untuk format vision OpenAI-compatible. */
function buildKiosapiImageContent(imageBase64: string, mimeType: string) {
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
  return {
    type: "image_url" as const,
    image_url: {
      url: `data:${mimeType};base64,${cleanBase64}`,
      detail: "auto" as const
    }
  };
}

/** Ekstrak satu gambar menggunakan KiosAPI dengan fallback multi-model. */
export async function extractResiFromImage(
  filename: string,
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<ExtractedResi> {
  const { apiKey, baseUrl, model, fallbackModels } = getKiosapiConfig();

  const imageContent = buildKiosapiImageContent(imageBase64, mimeType);

  // Model utama + fallback (tanpa duplikat).
  const modelsToTry: string[] = [model, ...fallbackModels.filter((m) => m !== model)];
  const url = `${baseUrl}/v1/chat/completions`;

  let lastError = 'Semua model KiosAPI gagal.';

  for (const tryModel of modelsToTry) {
    const body = {
      model: tryModel,
      messages: [
        { role: 'system', content: RESI_SYSTEM_PROMPT },
        {
          role: 'user',
          // ✅ Format vision OpenAI-compatible: gambar ada di dalam array
          // content. Sebelumnya memakai field `images` (format Ollama)
          // sehingga KiosAPI tidak pernah menerima gambarnya.
          content: [
            { type: 'text', text: RESI_USER_PROMPT },
            imageContent
          ]
        }
      ],
      stream: false
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        lastError = `KiosAPI HTTP ${res.status} (${tryModel}): ${errText.slice(0, 200)}`;
        // Model error / tidak support vision → coba model berikutnya.
        continue;
      }

      const json: any = await res.json().catch(() => ({}));
      const content: string = json?.choices?.[0]?.message?.content || '';
      const parsed = tryParseJson(content);
      if (!parsed || typeof parsed !== 'object') {
        lastError = `Model ${tryModel} tidak mengembalikan JSON valid.`;
        continue;
      }

      return {
        filename,
        ok: true,
        data: normalizeKeys(parsed)
      };
    } catch (e: any) {
      lastError = `${tryModel}: ${e?.message || 'Gagal memanggil KiosAPI'}`;
      continue;
    }
  }

  return {
    filename,
    ok: false,
    error: lastError
  };
}

/** Ekstrak batch menggunakan KiosAPI dengan fallback multi-model. */
export async function extractResiBatchKiosapi(
  items: { filename: string; base64: string; mimeType?: string }[],
  concurrency: number = 5
): Promise<ExtractedResi[]> {
  const results: ExtractedResi[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    const chunk = await Promise.all(
      slice.map((it) =>
        extractResiFromImage(it.filename, it.base64, it.mimeType || 'image/jpeg')
      )
    );
    results.push(...chunk);
  }
  return results;
}
