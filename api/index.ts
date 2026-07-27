import 'dotenv/config';
import express from 'express';

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

function ensureApiKey(res: express.Response): string | null {
  const key = getApiKey();
  if (!key) {
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

// ✅ Dokumentasi BinderByte (perbaikan.txt): Cek Ongkir hanya support 12 kurir:
//   jne, pos, tiki, sicepat, anteraja, lion, ninja, sap, ide, jnt, wahana, spx
// Sebelumnya kita kirim 22 kurir (termasuk rex, indah, jet, dll yang ternyata
// tidak support endpoint /v1/cost BinderByte).
const COST_COURIERS = [
  { code: 'jne',      description: 'JNE Express' },
  { code: 'pos',      description: 'POS Indonesia' },
  { code: 'tiki',     description: 'TIKI' },
  { code: 'sicepat',  description: 'SiCepat Ekspres' },
  { code: 'anteraja', description: 'AnterAja' },
  { code: 'lion',     description: 'Lion Parcel' },
  { code: 'ninja',    description: 'Ninja Xpress' },
  { code: 'sap',      description: 'SAP Express' },
  { code: 'ide',      description: 'ID Express' },
  { code: 'jnt',      description: 'J&T Express Indonesia' },
  { code: 'wahana',   description: 'Wahana Express' },
  { code: 'spx',      description: 'Shopee Express' }
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
    courierName: raw?.name || fallbackCourierName
  };
}

app.get('/api/cost', async (req, res) => {
  const apiKey = ensureApiKey(res);
  if (!apiKey) return;

  const origin = ((req.query.origin as string) || '').trim();
  const destination = ((req.query.destination as string) || '').trim();
  // ✅ FIX: dokumentasi BinderByte minta weight dalam KILOGRAM.
  // Frontend mengirim dalam GRAM untuk konsistensi UX (input field "Gram"),
  // server konversi ke kilogram di sini (dibulatkan 2 desimal, min 0.1).
  const weightGram = parseInt((req.query.weight as string) || '1000', 10);
  const weightKg = Math.max(0.1, Math.round((weightGram / 1000) * 100) / 100);
  const couriersParam =
    (req.query.courier as string) || COST_COURIERS.map((c) => c.code).join(',');

  if (!origin || !destination) {
    return res.status(400).json({
      status: 400,
      code: 400,
      message: 'origin, destination, weight, and courier parameters are required'
    });
  }

  // Daftar kurir dicegah >12 (hanya 12 yang support per dokumentasi).
  const courierList = couriersParam
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 12);

  // Build URL pakai query string (GET /v1/cost)
  const params = new URLSearchParams({
    api_key: apiKey,
    origin,
    destination,
    weight: String(weightKg),
    courier: courierList.join(',')
  });
  // Optional: volume (PxLxT) bila dikirim dari frontend.
  if (req.query.volume) {
    params.set('volume', String(req.query.volume));
  }
  const url = `${BASE_URL}/cost?${params.toString()}`;

  try {
    const upstream = await fetch(url);
    const payload = await upstream.json().catch(() => ({} as any));

    // ✅ FIX: response code BinderByte sekarang STRING ("200"/"400"),
    // bukan number. Handle keduanya supaya aman terhadap versi API.
    const okCode =
      payload?.code === '200' || payload?.code === 200 || payload?.status === 200;
    if (!upstream.ok || !okCode) {
      return res.status(upstream.status || 502).json({
        status: payload?.code || upstream.status || 502,
        code: payload?.code || upstream.status || 502,
        message: payload?.message || 'Gagal mengambil data ongkir dari BinderByte',
        raw: payload
      });
    }

    // Normalisasi response BinderByte baru → shape CostServiceOption[]
    const data = payload?.data || {};
    const resultsArr: any[] = Array.isArray(data?.results) ? data.results : [];
    const allResults: any[] = [];
    for (const courierGroup of resultsArr) {
      const courierCode = courierGroup?.code || '';
      const courierName = courierGroup?.name || courierCode.toUpperCase();
      const costsArr: any[] = Array.isArray(courierGroup?.costs) ? courierGroup.costs : [];
      for (const costItem of costsArr) {
        allResults.push(normalizeCostItem(costItem, courierCode, courierName));
      }
    }

    if (allResults.length === 0) {
      return res.status(200).json({
        status: 200,
        code: 200,
        message: 'OK (tidak ada layanan ditemukan untuk rute ini)',
        data: []
      });
    }

    allResults.sort((a, b) => a.cost - b.cost);
    return res.json({
      status: 200,
      code: 200,
      message: payload?.message || 'Successfully calculated cost',
      origin: data.origin,
      destination: data.destination,
      weight: data.weight,
      data: allResults
    });
  } catch (e: any) {
    return res.status(502).json({
      status: 502,
      code: 502,
      message: `Upstream error: ${e?.message || 'unknown'}`,
      error: 'UPSTREAM_UNREACHABLE'
    });
  }
});

// Export `app` agar server.ts (dev only) bisa import tanpa menyebabkan
// Vercel serverless bundle ikut-include server.ts.
export { app };
export default app;