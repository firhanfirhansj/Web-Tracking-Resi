// =====================================================================
// api/_lib/aiExtract.ts
// =====================================================================
// Service untuk ekstrak data resi dari gambar via Ollama API.
//
// Alur:
//   1. Kirim gambar ke Ollama /api/chat dengan field `images` (base64)
//   2. Pakai prompt sistem + user untuk meminta output JSON terstruktur
//   3. (Tanpa fallback OCR Tesseract untuk menjaga bundle size — bila
//      model tidak support vision, return error informatif)
//
// Mendukung env var:
//   - OLLAMA_BASE_URL   (default: https://api.ollama.com)
//   - OLLAMA_API_KEY    (default: '')
//   - OLLAMA_MODEL      (default: minimax-m3:cloud)
// =====================================================================

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

const SYSTEM_PROMPT = `Kamu adalah AI extractor data resi pengiriman Indonesia.
Kamu akan diberikan gambar resi (bisa structured/printed form, struk Thermal, atau tulisan tangan).
Tugas: Ekstrak data penting dari gambar ke JSON valid, TANPA teks lain di luar JSON.

Schema JSON (WAJIB):
{
  "pengirim": string | null,        // nama pengirim / shipper
  "penerima": string | null,        // nama penerima / consignee
  "tanggalKirim": string | null,    // ISO date "YYYY-MM-DD" atau null
  "noResi": string | null,          // nomor resi / AWB
  "alamat": string | null,          // alamat penerima (atau tujuan)
  "harga": number | null,           // total ongkir dalam IDR (numeric, tanpa "Rp")
  "loadKg": number | null,          // berat barang dalam KG (decimal)
  "jumlahBarang": number | null,    // qty / koli / pieces
  "ekspedisi": string | null,       // nama ekspedisi (JNE, J&T, SiCepat, J&T Cargo, dll)
  "asuransi": number | null         // nilai asuransi dalam IDR (khusus J&T Cargo biasanya ada); null jika tidak ada
}

Aturan:
- Abaikan teks dekoratif, barcode, barcode angka.
- Jika field tidak terbaca, isi null.
- Jangan tambahkan field di luar schema.
- Output HARUS JSON valid saja, tanpa markdown code block.`;

const USER_PROMPT = `Ekstrak data dari gambar resi ini dan output JSON valid saja.`;

function getOllamaConfig() {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'https://api.ollama.com').replace(/\/$/, '');
  const apiKey = (process.env.OLLAMA_API_KEY || '').trim();
  const model = (process.env.OLLAMA_MODEL || 'minimax-m3:cloud').trim();
  return { baseUrl, apiKey, model };
}

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

export async function extractResiFromImage(
  filename: string,
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<ExtractedResi> {
  const { baseUrl, apiKey, model } = getOllamaConfig();

  // Strip prefix data:image/...;base64, kalau ada
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  // Pakai /api/chat (vision capability paling reliable di Ollama)
  const url = `${baseUrl}/api/chat`;

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: USER_PROMPT,
        images: [cleanBase64]
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
      return {
        filename,
        ok: false,
        error: `Ollama HTTP ${res.status}: ${errText.slice(0, 200)}`
      };
    }

    const json = await res.json().catch(() => ({} as any));
    const content: string = json?.message?.content || json?.response || '';
    const parsed = tryParseJson(content);
    if (!parsed) {
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
    return {
      filename,
      ok: false,
      error: e?.message || 'Gagal memanggil Ollama'
    };
  }
}

/** Ekstrak paralel (batch 5) untuk banyak gambar. */
export async function extractResiBatch(
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
