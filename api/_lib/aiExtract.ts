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
//   - OLLAMA_BASE_URL   (default: https://ollama.com)
//   - OLLAMA_API_KEY    (default: '')
//   - OLLAMA_MODEL      (default: gemma4:31b-cloud)
// =====================================================================

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

const SYSTEM_PROMPT = `Kamu adalah AI extractor data resi pengiriman Indonesia.
Kamu akan diberikan gambar resi (bisa structured/printed form, struk Thermal, atau tulisan tangan).
Tugas: Ekstrak data penting dari gambar ke JSON valid, TANPA teks lain di luar JSON.

Schema JSON (WAJIB) — 9 kolom ini yang WAJIB diisi selengkap-lengkapnya:
{
  "ekspedisi": string | null,       // nama ekspedisi (JNE, J&T, SiCepat, J&T Cargo, dll)
  "pengirim": string | null,        // nama pengirim / shipper (wajib baca, ini kolom penting)
  "penerima": string | null,        // nama penerima / consignee (wajib baca, ini kolom penting)
  "noResi": string | null,          // nomor resi / AWB
  "alamat": string | null,          // alamat penerima (atau tujuan)
  "harga": number | null,           // total ongkir dalam IDR (numeric, tanpa "Rp")
  "loadKg": number | null,          // berat barang dalam KG (decimal)
  "jumlahBarang": number | null,    // qty / koli / pieces
  "asuransi": number | null         // nilai asuransi dalam IDR (khusus J&T Cargo biasanya ada); null jika tidak ada
}

Field opsional (tetap di-extract kalau ada, tapi tidak wajib):
{
  "tujuan": string | null,          // kota/kabupaten tujuan
  "tanggalKirim": string | null     // ISO date "YYYY-MM-DD"
}

⚠️ PENTING untuk field "noResi" (PERBAIKAN):
Gambar resi sering blur atau nomor resi terpotong. Pakai PATTERN AWALAN berikut
sebagai hint untuk membaca & mengoreksi nomor resi. Jika noResi di foto
terlihat cocok dengan salah satu prefix di bawah, isi sesuai pattern lengkap
yang dikenali (jangan biarkan terpotong):

  - Resi MEX         → diawal dengan "10238"
  - Resi Lion        → diawal dengan "11LP"
  - Resi J&T Cargo   → diawal dengan "2016"
  - Resi Herona      → diawal dengan "BKSA"
  - Resi CMC         → diawal dengan "103"
  - Resi Indah Cargo → diawal dengan "BKS1CS"

Jika tidak ada prefix yang cocok, kembalikan noResi apa adanya dari OCR (boleh null
hanya jika benar-benar tidak terbaca sama sekali).

Aturan:
- Abaikan teks dekoratif, barcode, barcode angka.
- Jika field tidak terbaca, isi null.
- Jangan tambahkan field di luar schema.
- Output HARUS JSON valid saja, tanpa markdown code block.`;

const USER_PROMPT = `Ekstrak data dari gambar resi ini dan output JSON valid saja.`;

function getOllamaConfig() {
  // ✅ FIX: base URL Ollama Cloud yang benar adalah https://ollama.com
  // (sebelumnya tertulis https://api.ollama.com — domain itu tidak valid
  // untuk Ollama Cloud, menyebabkan "unreachable" di Perbaikan.txt).
  // Auto-strip trailing slash dan suffix "/api" supaya env var
  // "https://ollama.com/api" (format umum) tetap bekerja.
  const rawBase = process.env.OLLAMA_BASE_URL || 'https://ollama.com';
  const baseUrl = rawBase
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');
  const apiKey = (process.env.OLLAMA_API_KEY || '').trim();
  // ✅ perbaikan.txt #2: default model vision Ollama diubah ke
  // "gemma4:31b-cloud" sesuai permintaan user (sebelumnya "minimax-m3:cloud"
  // adalah nama internal provider AI Claude Code, bukan model Ollama —
  // jelas tidak akan ditemukan di registry Ollama Cloud).
  const model = (process.env.OLLAMA_MODEL || 'gemma4:31b-cloud').trim();
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
