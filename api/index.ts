import 'dotenv/config';
import express from 'express';
import Busboy from 'busboy';
import { computeCargoCost } from './_lib/pricelist';
import { getUniqueCities } from './_lib/xlsxLoader';
import { extractResiBatch } from './_lib/aiExtract';

// =====================================================================
// LacakResi Pro — Vercel Serverless Entry
// =====================================================================
// File ini di-bundle oleh Vercel sebagai `api/index.ts` → serverless
// function. JANGAN import '../server' dari sini — server.ts TIDAK di-copy
// ke /var/task/ oleh Vercel, sehingga import itu selalu gagal dengan
// `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/server'`.
//
// Pola deployment Vercel "node" serverless:
//   - Hanya file di bawah /api yang di-bundle menjadi serverless function
//   - Root project (server.ts, src/, dll.) dipakai untuk static build,
//     TIDAK ikut ter-copy ke runtime function
//
// Jadi: semua logika Express HARUS hidup di sini (atau di module lain
// yang ada di dalam /api). server.ts (dev only) yang akan import `app`
// dari file ini, BUKAN sebaliknya.
// =====================================================================

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ------------------------------------------------------------------
// Config
// ------------------------------------------------------------------

const BASE_URL = 'https://api.binderbyte.com/v1';

function getApiKey(): string {
  // Trim whitespace; kalau env var diset dengan secret editor Vercel
  // kadang ada karakter newline tak terlihat.
  return (process.env.BINDERBYTE_API_KEY || '').trim();
}

/**
 * ✅ FIX Bug #4: Deteksi placeholder string yang belum diganti user.
 * Sebelumnya .env.local berisi "BINDERBYTE_API_KEY=your_binderbyte_api_key_here"
 * — string ini truthy, jadi ensureApiKey() selalu meloloskan, lalu BinderByte
 * mengembalikan 401 dan user melihat pesan membingungkan. Sekarang placeholder
 * otomatis dianggap kosong.
 */
function isPlaceholder(value: string): boolean {
  if (!value) return true;
  const v = value.toLowerCase();
  return (
    v === 'your_binderbyte_api_key_here' ||
    v === 'your_ollama_cloud_api_key_here' ||
    v.startsWith('your_') ||
    v.startsWith('replace_') ||
    v.startsWith('change_me')
  );
}

function ensureApiKey(res: express.Response): string | null {
  const key = getApiKey();
  if (!key || isPlaceholder(key)) {
    res.status(503).json({
      status: 503,
      message:
        'BinderByte API key belum dikonfigurasi. Set BINDERBYTE_API_KEY di environment Vercel atau .env.local.',
      error: 'API_KEY_MISSING'
    });
    return null;
  }
  return key;
}

/**
 * Status normalizer sesuai dokumentasi BinderByte.
 */
function normalizeStatus(
  status: string | undefined,
  delivered: unknown
): 'DELIVERED' | 'IN_TRANSIT' | 'ON_PROCESS' | 'EXCEPTION' {
  if (delivered === true) return 'DELIVERED';

  const v = (status || '').toUpperCase().replace(/[\s-]/g, '_');
  if (v === 'DELIVERED' || v === 'DELIVERED_TO_CONSIGNEE') return 'DELIVERED';
  if (v === 'ONTRANSIT' || v === 'IN_TRANSIT') return 'IN_TRANSIT';
  if (v === 'RETURNED' || v === 'EXCEPTION' || v === 'GAGAL' || v === 'FAILED') return 'EXCEPTION';
  if (v === 'PENDING' || v === 'ONPROCESS') return 'ON_PROCESS';
  return 'ON_PROCESS';
}

/** Normalize a single BinderByte /v1/track response. */
function normalizeTrackResponse(payload: any, fallbackAwb: string, fallbackCourier: string) {
  const data = payload?.data || {};
  const summary = data.summary || {};
  const status = normalizeStatus(summary.status, summary.delivered);
  return {
    awb: summary.waybill_number || data.waybill_number || fallbackAwb,
    courier: summary.courier_code || fallbackCourier,
    courierName: summary.courier_name || fallbackCourier.toUpperCase(),
    trackId: summary.track_id || '',
    status,
    statusText: summary.status || (status === 'DELIVERED' ? 'DELIVERED' : 'ON PROCESS'),
    summary,
    detail: data.detail,
    history: data.history || [],
    lastChecked: new Date().toISOString()
  };
}

// ------------------------------------------------------------------
// Static courier lists (sesuai Dokumentasi BinderByte)
// ------------------------------------------------------------------

const TRACK_COURIERS = [
  { code: 'jne',     description: 'JNE Express' },
  { code: 'jnt',     description: 'J&T Express Indonesia' },
  { code: 'j&t',     description: 'J&T Express (alias)' },
  { code: 'jnt_cargo', description: 'J&T Cargo' },
  { code: 'sicepat', description: 'SiCepat Ekspres' },
  { code: 'pos',     description: 'POS Indonesia' },
  { code: 'tiki',    description: 'TIKI' },
  { code: 'anteraja',description: 'AnterAja' },
  { code: 'wahana',  description: 'Wahana Express' },
  { code: 'ninja',   description: 'Ninja Xpress' },
  { code: 'lion',    description: 'Lion Parcel' },
  { code: 'pcp',     description: 'PCP Express' },
  { code: 'jet',     description: 'JET Express' },
  { code: 'rex',     description: 'REX Express' },
  { code: 'first',   description: 'First Logistics' },
  { code: 'ide',     description: 'ID Express' },
  { code: 'spx',     description: 'Shopee Express' },
  { code: 'kgx',     description: 'KGXpress' },
  { code: 'sap',     description: 'SAP Express' },
  { code: 'jxe',     description: 'JX Express' },
  { code: 'rpx',     description: 'RPX' },
  { code: 'lazada',  description: 'Lazada Express' },
  { code: 'indah',   description: 'Indah Logistik Cargo' },
  { code: 'dakota',  description: 'Dakota Cargo' },
  { code: 'pck',     description: 'Paxel Kartolo' },
  { code: 'dse',     description: 'DSE Express' },
  { code: 'slis',    description: 'Solusi Express' },
  { code: 'ncs',     description: 'NCS Kobra' },
  { code: 'star',    description: 'Star Cargo' },
  { code: 'idl',     description: 'Idl Cargo' },
  { code: 'rekomendasi', description: 'Kurir Rekomendasi BinderByte' }
];

// ✅ Dokumentasi BinderByte (perbaikan.txt): Cek Ongkir BinderByte hanya support 12 kurir.
//   jne, pos, tiki, sicepat, anteraja, lion, ninja, sap, ide, jnt, wahana, spx
// Kita tambahkan 5 kurir kargo dari pricelist lokal sebagai SUPPLEMENT
// (bukan via BinderByte). Field `source` membedakan keduanya.
const COST_COURIERS = [
  { code: 'jne',        description: 'JNE Express',           source: 'binderbyte' },
  { code: 'pos',        description: 'POS Indonesia',         source: 'binderbyte' },
  { code: 'tiki',       description: 'TIKI',                  source: 'binderbyte' },
  { code: 'sicepat',    description: 'SiCepat Ekspres',       source: 'binderbyte' },
  { code: 'anteraja',   description: 'AnterAja',              source: 'binderbyte' },
  { code: 'lion',       description: 'Lion Parcel',           source: 'binderbyte' },
  { code: 'ninja',      description: 'Ninja Xpress',          source: 'binderbyte' },
  { code: 'sap',        description: 'SAP Express',           source: 'binderbyte' },
  { code: 'ide',        description: 'ID Express',            source: 'binderbyte' },
  { code: 'jnt',        description: 'J&T Express Indonesia', source: 'binderbyte' },
  { code: 'wahana',     description: 'Wahana Express',        source: 'binderbyte' },
  { code: 'spx',        description: 'Shopee Express',        source: 'binderbyte' },
  // -------- 5 kurir kargo (dari pricelist XLSX lokal) --------
  { code: 'jnt_cargo',  description: 'J&T Cargo (FastTrack)', source: 'pricelist' },
  { code: 'mex_darat',  description: 'MEX Cargo (Darat)',     source: 'pricelist' },
  { code: 'mex_udara',  description: 'MEX Cargo (Udara)',     source: 'pricelist' },
  { code: 'herona',     description: 'Herona',                source: 'pricelist' },
  { code: 'cmc',        description: 'CMC',                   source: 'pricelist' }
];

// ------------------------------------------------------------------
// API routes
// ------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  const apiKey = getApiKey();
  res.json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    apiKeyConfigured: Boolean(apiKey),
    // Mask key length untuk membantu debug tanpa expose secret
    apiKeyLength: apiKey.length
  });
});

// Endpoint debug: laporkan apakah env var terbaca di runtime (tanpa
// expose nilai aslinya). Bisa diakses via /api/debug/env. Tidak
// mengembalikan secret — hanya panjang key & apakah env terdeteksi.
app.get('/api/debug/env', (_req, res) => {
  const raw = process.env.BINDERBYTE_API_KEY;
  const key = (raw || '').trim();
  res.json({
    hasEnvVar: Boolean(raw),
    envVarLength: raw?.length || 0,
    trimmedLength: key.length,
    apiKeyConfigured: Boolean(key),
    nodeEnv: process.env.NODE_ENV || 'unknown',
    vercel: Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV)
  });
});

app.get('/api/couriers/track', (_req, res) => {
  res.json({ status: 200, data: TRACK_COURIERS });
});

app.get('/api/couriers/cost', (_req, res) => {
  res.json({ status: 200, data: COST_COURIERS });
});

// --- Location proxy (sesuai dokumentasi BinderByte baru) ---
// Dokumentasi BinderByte menggunakan SATU endpoint:
//   GET /v1/locations?search=<keyword>&api_key=<key>
// yang mengembalikan list lokasi (village/district/city/province) sekaligus.
// Response: { code, message, data: [{ id, type, label }] }

app.get('/api/locations', async (req, res) => {
  const apiKey = ensureApiKey(res);
  if (!apiKey) return;
  const search = ((req.query.search as string) || '').trim();
  // Endpoint BinderByte WAJIB dapat parameter 'search' (minimal 3 karakter).
  if (search.length < 3) {
    return res.status(400).json({
      status: 400,
      code: 400,
      message: 'Parameter "search" wajib diisi (minimal 3 karakter).'
    });
  }
  try {
    const url = `${BASE_URL}/locations?api_key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(search)}`;
    const r = await fetch(url);
    const j = await r.json().catch(() => ({} as any));
    res.status(r.status).json(j);
  } catch (e: any) {
    res.status(502).json({ status: 502, message: `Upstream error: ${e?.message || 'unknown'}` });
  }
});

// --- Single waybill tracking ---

app.get('/api/track', async (req, res) => {
  const apiKey = ensureApiKey(res);
  if (!apiKey) return;

  const courier = (req.query.courier as string) || 'jne';
  const awb = (req.query.awb as string) || '';
  // ✅ FIX Bug #3 (JNE): sesuai dokumentasi BinderByte
  //   /v1/track?api_key=...&courier=jne&awb=...&number=xxxxx
  // untuk kurir JNE, sertakan "number" (nomor telepon penerima) bila tersedia
  // agar tracking bisa menemukan data di sistem JNE.
  const number = ((req.query.number as string) || '').trim();

  if (!awb) {
    return res.status(400).json({ status: 400, message: 'Nomor resi (awb) wajib diisi' });
  }

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      courier,
      awb
    });
    // Sertakan "number" hanya untuk JNE (sesuai dokumentasi BinderByte).
    if (courier.toLowerCase() === 'jne' && number) {
      params.set('number', number);
    }
    const url = `${BASE_URL}/track?${params.toString()}`;
    const upstream = await fetch(url);
    const payload = await upstream.json().catch(() => ({} as any));

    // ✅ Handle dua format response BinderByte:
    //   - Lama: { status: 200 }
    //   - Baru (perbaikan.txt): { code: "200" }
    const okCode = payload?.code === '200' || payload?.code === 200 || payload?.status === 200;
    if (upstream.ok && okCode) {
      return res.json({
        status: 200,
        message: payload.message || 'OK',
        data: normalizeTrackResponse(payload, awb, courier)
      });
    }

    return res.status(upstream.status || 502).json({
      status: payload?.code || payload?.status || upstream.status || 502,
      message: payload?.message || 'Gagal melacak resi dari BinderByte',
      error: payload?.error
    });
  } catch (err: any) {
    return res.status(502).json({
      status: 502,
      message: `Tidak dapat menghubungi BinderByte: ${err?.message || 'unknown error'}`,
      error: 'UPSTREAM_UNREACHABLE'
    });
  }
});

// --- Bulk tracking ---

app.post('/api/track/bulk', async (req, res) => {
  const apiKey = ensureApiKey(res);
  if (!apiKey) return;

  const items = req.body.items as { id: string; awb: string; courier: string; number?: string }[];
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ status: 400, message: 'Array items tidak boleh kosong' });
  }

  const limited = items.slice(0, 50);

  async function trackOne(item: typeof limited[number]) {
    const courier = item.courier || 'jne';
    const awb = (item.awb || '').trim();
    if (!awb) {
      return { id: item.id, awb, courier, status: 'error' as const, errorMessage: 'Nomor resi kosong' };
    }
    try {
      const params = new URLSearchParams({
        api_key: apiKey,
        courier,
        awb
      });
      // ✅ FIX Bug #3: untuk JNE, teruskan nomor telepon penerima.
      const number = (item.number || '').trim();
      if (courier.toLowerCase() === 'jne' && number) {
        params.set('number', number);
      }
      const url = `${BASE_URL}/track?${params.toString()}`;
      const upstream = await fetch(url);
      const payload = await upstream.json().catch(() => ({} as any));
      // ✅ Handle format code lama (status:200) & baru (code:"200")
      const okCode = payload?.code === '200' || payload?.code === 200 || payload?.status === 200;
      if (upstream.ok && okCode) {
        return {
          id: item.id,
          awb,
          courier,
          status: 'success' as const,
          result: normalizeTrackResponse(payload, awb, courier)
        };
      }
      return {
        id: item.id,
        awb,
        courier,
        status: 'error' as const,
        errorMessage: payload?.message || `BinderByte mengembalikan status ${payload?.code || payload?.status || upstream.status}`
      };
    } catch (err: any) {
      return {
        id: item.id,
        awb,
        courier,
        status: 'error' as const,
        errorMessage: `Upstream error: ${err?.message || 'unknown'}`
      };
    }
  }

  const concurrency = 5;
  const results: any[] = [];
  for (let i = 0; i < limited.length; i += concurrency) {
    const slice = limited.slice(i, i + concurrency);
    const chunk = await Promise.all(slice.map(trackOne));
    results.push(...chunk);
  }

  res.json({ status: 200, total: results.length, results });
});

// --- Cek Ongkir (Shipping Cost) ---
// ✅ Dokumentasi BinderByte (perbaikan.txt):
//   POST/GET /v1/cost dengan parameter:
//     api_key, origin (district ID), destination (district ID),
//     weight (Kg, bukan gram!), courier (comma-separated, maks 12 kurir)
//   Response sukses:
//     {
//       code: "200", message: "Successfully calculated cost",
//       data: {
//         origin: { id, label },
//         destination: { id, label },
//         weight: "1",
//         results: [{ code, name, costs: [{ code, name, service, type, price, estimated }] }]
//       }
//     }
//
//   Field penting yang harus disesuaikan:
//     - weight dalam KILOGRAM (sebelumnya kita kirim gram — bug!)
//     - origin/destination ID ber-prefix "dist_" atau "village_" sesuai
//       hasil dari /v1/locations (sebelumnya kita pakai ID numeric — bug!)
//     - daftar kurir hanya 12 (sudah disesuaikan di COST_COURIERS di atas)
//     - response pakai `code` (string), bukan `status` (number)
//     - path data: data.results[].costs[].price & .estimated

function normalizeCostItem(raw: any, fallbackCourierCode: string, fallbackCourierName: string) {
  // raw shape (BinderByte baru): { code, name, service, type, price, estimated }
  return {
    code: raw?.code || fallbackCourierCode,
    service: raw?.service || '',
    description: raw?.type || raw?.name || `${fallbackCourierName} ${raw?.service || ''}`.trim(),
    cost: Number(raw?.price) || 0,
    etd: raw?.estimated ? `${raw.estimated} Hari` : '',
    courierCode: raw?.code || fallbackCourierCode,
    courierName: raw?.name || fallbackCourierName,
    source: 'binderbyte' as const
  };
}

app.get('/api/cost', async (req, res) => {
  const origin = ((req.query.origin as string) || '').trim();
  const destination = ((req.query.destination as string) || '').trim();
  // ✅ FIX: dokumentasi BinderByte minta weight dalam KILOGRAM.
  // Frontend mengirim dalam GRAM untuk konsistensi UX (input field "Gram"),
  // server konversi ke kilogram di sini (dibulatkan 2 desimal, min 0.1).
  const weightGram = parseInt((req.query.weight as string) || '1000', 10);
  const weightKg = Math.max(0.1, Math.round((weightGram / 1000) * 100) / 100);
  const couriersParam =
    (req.query.courier as string) || COST_COURIERS.map((c) => c.code).join(',');

  // ✅ Filter sumber: 'binderbyte', 'pricelist', atau keduanya (default dua-duanya).
  // Query param: source=binderbyte,pricelist
  const sourceParam = ((req.query.source as string) || 'binderbyte,pricelist')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const useBinderbyte = sourceParam.includes('binderbyte');
  const usePricelist = sourceParam.includes('pricelist');

  if (!origin || !destination) {
    return res.status(400).json({
      status: 400,
      code: 400,
      message: 'origin, destination, weight, and courier parameters are required'
    });
  }

  // Pecah daftar kurir jadi binderbyte (maks 12) + pricelist.
  const courierList = couriersParam
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  const bbMeta = COST_COURIERS.filter((c) => c.source === 'binderbyte').map((c) => c.code);
  const plMeta = COST_COURIERS.filter((c) => c.source === 'pricelist').map((c) => c.code);
  const bbCouriers = courierList.filter((c) => bbMeta.includes(c));
  const plCouriers = courierList.filter((c) => plMeta.includes(c));

  // ----- Task A: BinderByte (maks 12 kurir) -----
  const bbPromise = (async (): Promise<any[]> => {
    if (!useBinderbyte || bbCouriers.length === 0) return [];
    const apiKey = getApiKey();
    if (!apiKey) return []; // skip jika tidak ada API key
    const limited = bbCouriers.slice(0, 12);
    const params = new URLSearchParams({
      api_key: apiKey,
      origin,
      destination,
      weight: String(weightKg),
      courier: limited.join(',')
    });
    if (req.query.volume) params.set('volume', String(req.query.volume));
    const url = `${BASE_URL}/cost?${params.toString()}`;
    try {
      const upstream = await fetch(url);
      const payload = await upstream.json().catch(() => ({} as any));
      const okCode =
        payload?.code === '200' || payload?.code === 200 || payload?.status === 200;
      if (!upstream.ok || !okCode) return [];
      const data = payload?.data || {};
      const resultsArr: any[] = Array.isArray(data?.results) ? data.results : [];
      const out: any[] = [];
      for (const courierGroup of resultsArr) {
        const courierCode = courierGroup?.code || '';
        const courierName = courierGroup?.name || courierCode.toUpperCase();
        const costsArr: any[] = Array.isArray(courierGroup?.costs) ? courierGroup.costs : [];
        for (const costItem of costsArr) {
          out.push(normalizeCostItem(costItem, courierCode, courierName));
        }
      }
      return out;
    } catch {
      return [];
    }
  })();

  // ----- Task B: Pricelist (5 kurir kargo) -----
  const plPromise = (async (): Promise<any[]> => {
    if (!usePricelist || plCouriers.length === 0) return [];
    try {
      const quotes = computeCargoCost({
        originCity: req.query.originCity as string || origin,
        destCity: req.query.destCity as string || destination,
        weightKg,
        courierFilter: plCouriers
      });
      return quotes;
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[pricelist] error:', e?.message);
      return [];
    }
  })();

  // Gabung hasil dari kedua sumber.
  const [bbResults, plResults] = await Promise.all([bbPromise, plPromise]);
  const allResults = [...bbResults, ...plResults];
  allResults.sort((a, b) => a.cost - b.cost);

  if (allResults.length === 0) {
    return res.status(200).json({
      status: 200,
      code: 200,
      message: 'OK (tidak ada layanan ditemukan untuk rute ini. Cek toggle sumber atau pilih rute lain.)',
      data: []
    });
  }

  return res.json({
    status: 200,
    code: 200,
    message: 'Successfully calculated cost',
    origin,
    destination,
    weight: weightKg,
    data: allResults
  });
});

// --- Pricelist cities (untuk autocomplete dropdown UI Cek Ongkir) ---
app.get('/api/pricelist/cities', (_req, res) => {
  try {
    const cities = getUniqueCities();
    res.json({ status: 200, code: 200, data: cities });
  } catch (e: any) {
    res.status(500).json({ status: 500, message: e?.message || 'Gagal load pricelist cities' });
  }
});

// --- AI Ekstrak Resi (multipart upload gambar) ---
app.post('/api/ai/extract-resi', (req, res) => {
  const items: { filename: string; base64: string; mimeType: string }[] = [];
  const errors: string[] = [];
  let processed = 0;

  let busboy: Busboy.Busboy;
  try {
    busboy = Busboy({
      headers: req.headers,
      limits: { files: 50, fileSize: 8 * 1024 * 1024 } // 8MB per file, maks 50 file
    });
  } catch (e: any) {
    return res.status(400).json({
      status: 400,
      message: `Invalid multipart request: ${e?.message || 'unknown'}`
    });
  }

  busboy.on('file', (fieldname, file, info) => {
    const chunks: Buffer[] = [];
    const filename = info.filename || `upload-${Date.now()}.jpg`;
    const mimeType = info.mimeType || 'image/jpeg';
    file.on('data', (chunk: Buffer) => chunks.push(chunk));
    file.on('limit', () => {
      errors.push(`${filename}: file terlalu besar (>8MB)`);
    });
    file.on('end', () => {
      if (chunks.length === 0) {
        errors.push(`${filename}: file kosong`);
        processed++;
        return;
      }
      const buf = Buffer.concat(chunks);
      items.push({
        filename,
        base64: buf.toString('base64'),
        mimeType
      });
      processed++;
    });
  });

  busboy.on('error', (err: any) => {
    res.status(500).json({ status: 500, message: `Upload error: ${err?.message}` });
  });

  busboy.on('finish', async () => {
    if (items.length === 0) {
      return res.status(400).json({
        status: 400,
        message: 'Tidak ada gambar yang diupload.',
        errors
      });
    }
    if (items.length > 50) {
      return res.status(400).json({
        status: 400,
        message: `Maksimal 50 gambar per request (dikirim ${items.length}).`,
        errors
      });
    }
    try {
      const results = await extractResiBatch(items, 5);
      return res.json({
        status: 200,
        code: 200,
        total: results.length,
        success: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results
      });
    } catch (e: any) {
      return res.status(500).json({
        status: 500,
        message: `AI extract error: ${e?.message || 'unknown'}`
      });
    }
  });

  req.pipe(busboy);
});

// --- AI Health check (cek apakah Ollama reachable) ---
app.get('/api/ai/health', async (_req, res) => {
  // ✅ FIX: base URL Ollama Cloud yang benar adalah https://ollama.com.
  // Sebelumnya default https://api.ollama.com selalu gagal → "unreachable".
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'https://ollama.com').replace(/\/$/, '');
  const apiKey = (process.env.OLLAMA_API_KEY || '').trim();
  // Abaikan placeholder di health check juga (lihat isPlaceholder di atas).
  // ✅ FIX: default model vision Ollama yang valid.
  const model = (process.env.OLLAMA_MODEL || 'llama3.2-vision').trim();
  try {
    // Coba panggil /api/tags untuk cek apakah server hidup
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const r = await fetch(`${baseUrl}/api/tags`, { headers, signal: AbortSignal.timeout(8000) });
    return res.json({
      status: 200,
      configured: true,
      reachable: r.ok,
      model,
      baseUrl,
      apiKeyPresent: Boolean(apiKey)
    });
  } catch (e: any) {
    return res.json({
      status: 200,
      configured: Boolean(apiKey || baseUrl),
      reachable: false,
      model,
      baseUrl,
      apiKeyPresent: Boolean(apiKey),
      error: e?.message || 'Unreachable'
    });
  }
});

// Export `app` agar server.ts (dev only) bisa import tanpa menyebabkan
// Vercel serverless bundle ikut-include server.ts.
export { app };
export default app;