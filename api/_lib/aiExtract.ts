// ====================================================================
// api/_lib/aiExtract.ts
// ====================================================================
// Service untuk ekstrak data resi dari gambar via KiosAPI.
//
// Alur:
//   1. Kirim gambar ke KiosAPI /v1/chat/completions dengan format OpenAI-compatible
//   2. Pakai prompt sistem + user untuk meminta output JSON terstructured
//   3. Dukai sistem fallback multi-model: jika model pertama gagal (bukan support vision),
//      coba model berikutnya dari Free group KiosAPI
//
// Mendukung env var:
//   - KIOSAPI_API_KEY   (required - dideploy saat sudah punya account KiosAPI)
//   - KIOSAPI_BASE_URL  (default: https://kiosapi.com)
//   - KIOSAPI_MODEL      (default: agnes-2.5-flash - model vision dari Free group)
//   - KIOSAPI_FALLBACK_MODELS (komma-dipisah, default: glm-5.3-flash,gemini-2.0-flash)
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
  'glm-5.3-flash',        // Support vision
  'gemini-2.0-flash',    // Vision capable Google Gemini
  'glm-5.3',             // Vision capable GLM
  'qwen3.8-flash',       // Vision capable Qwen
  'deepseek-v4-flash-vision-exp-free', // Vision capable DeepSeek (free)
] as const;

type KiosapiVisionModel = typeof KIOSAPI_VISION_MODELS[number];
 
// Konfigurasi dasar
export const KIOSAPI_BASE_URL = "https://kiosapi.com";
export const KIOSAPI_DEFAULT_MODEL = "agnes-2.5-flash";
export const KIOSAPI_FALLBACK_MODELS_DEFAULT = "glm-5.3-flash,gemini-2.0-flash";
 
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
  const baseUrl = process.env.KIOSAPI_BASE_URL || "https://kiosapi.com";
  const model = process.env.KIOSAPI_MODEL || "agnes-2.5-flash";
  const fallbackModels = (process.env.KIOSAPI_FALLBACK_MODELS || "glm-5.3-flash,gemini-2.0-flash").split(",").map(m => m.trim()).filter(Boolean);
  return { apiKey, baseUrl, model, fallbackModels };
}
 
/** Build image content for KiosAPI format */
function buildKiosapiImageContent(imageBase64: string, mimeType: string) {
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
  return {
    type: "image_url" as const,
    image_url: {
      url: `data:${mimeType};base64,${cleanBase64}`,
      detail: "auto"
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
 
  // Build image content for KiosAPI format
  const imageContent = buildKiosapiImageContent(imageBase64, mimeType);
 
  // Tentukan model yang akan dicoba: utama + fallback
  const modelsToTry: string[] = [model, ...fallbackModels];
 
  for (const tryModel of modelsToTry) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
 
    const url = `${baseUrl}/v1/chat/completions`;
 
    const body = {
      model: tryModel,
      messages: [
        { role: 'system', content: 'Kamu adalah AI extractor data resi pengiriman Indonesia.' },
        {
          role: 'user',
          content: 'Ekstrak data dari gambar resi ini dan output JSON valid saja.',
          images: [imageContent]
        }
      ],
      format: 'json',
      stream: false
    };
 
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        // Timeout 60 detik per request
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify(body)
      });
 
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        // Jika model gagal (bukan support vision), coba model selanjutnya
        if (tryModel !== model) {
          continue; // Coba model berikutnya
        }
        // Jika model utama gagal dengan error, return error
        return {
          filename,
          ok: false,
          error: `KiosAPI HTTP ${res.status}: ${errText.slice(0, 200)}`
        };
      }
 
      const json = await res.json().catch(() => ({} as any));
      const content: string = json?.choices?.[0]?.message?.content || json?.response || '';
      const parsed = tryParseJson(content);
      if (!parsed) {
        // Jika output bukan JSON valid, coba model berikutnya
        if (tryModel !== model) {
          continue;
        }
        return {
          filename,
          ok: false,
          raw: content.slice(0, 500),
          error: 'Model tidak mengembalikan JSON valid.'
        };
      }
      return {
        filename,
        ok: true,
        data: normalizeKeys(parsed)
      };
    } catch (e: any) {
      // Jika error dan bukan model utama, coba model berikutnya
      if (tryModel !== model) {
        continue;
      }
      return {
        filename,
        ok: false,
        error: e?.message || 'Gagal memanggil KiosAPI'
      };
    }
  }
 
  // Semua model gagal
  return {
    filename,
    ok: false,
    error: 'Semua model KiosAPI gagal (bisa karena gambar tidak support vision di model yang dicoba).'
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
