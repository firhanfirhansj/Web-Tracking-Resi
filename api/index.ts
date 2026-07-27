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
  { code: 'j&t',      description: 'J&T Express Indonesia' },
  { code: 'wahana',   description: 'Wahana Express' },
  { code: 'spx',      description: 'Shopee Express' },
  { code: 'rex',      description: 'REX Express' },
  { code: 'indah',    description: 'Indah Logistik Cargo' },
  { code: 'dse',      description: 'DSE Express' },
  { code: 'slis',     description: 'Solusi Express' },
  { code: 'first',    description: 'First Logistics' },
  { code: 'ncs',      description: 'NCS Kobra' },
  { code: 'jet',      description: 'JET Express' },
  { code: 'star',     description: 'Star Cargo' },
  { code: 'idl',      description: 'Idl Cargo' },
  { code: 'pck',      description: 'Paxel Kartolo' }
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

// --- Location proxy endpoints (proxy ke BinderByte) ---

app.get('/api/provinces', async (_req, res) => {
  const apiKey = ensureApiKey(res);
  if (!apiKey) return;
  try {
    const r = await fetch(`${BASE_URL}/provinces?api_key=${encodeURIComponent(apiKey)}`);
    const j = await r.json();
    res.status(r.status).json(j);
  } catch (e: any) {
    res.status(502).json({ status: 502, message: `Upstream error: ${e?.message || 'unknown'}` });
  }
});

app.get('/api/cities', async (req, res) => {
  const apiKey = ensureApiKey(res);
  if (!apiKey) return;
  const province = (req.query.province as string) || '';
  const url = province
    ? `${BASE_URL}/cities?api_key=${encodeURIComponent(apiKey)}&province=${encodeURIComponent(province)}`
    : `${BASE_URL}/cities?api_key=${encodeURIComponent(apiKey)}`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    res.status(r.status).json(j);
  } catch (e: any) {
    res.status(502).json({ status: 502, message: `Upstream error: ${e?.message || 'unknown'}` });
  }
});

app.get('/api/districts', async (req, res) => {
  const apiKey = ensureApiKey(res);
  if (!apiKey) return;
  const city = (req.query.city as string) || '';
  const url = city
    ? `${BASE_URL}/districts?api_key=${encodeURIComponent(apiKey)}&city=${encodeURIComponent(city)}`
    : `${BASE_URL}/districts?api_key=${encodeURIComponent(apiKey)}`;
  try {
    const r = await fetch(url);
    const j = await r.json();
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

  if (!awb) {
    return res.status(400).json({ status: 400, message: 'Nomor resi (awb) wajib diisi' });
  }

  try {
    const url = `${BASE_URL}/track?api_key=${encodeURIComponent(apiKey)}&courier=${encodeURIComponent(courier)}&awb=${encodeURIComponent(awb)}`;
    const upstream = await fetch(url);
    const payload = await upstream.json();

    if (upstream.ok && payload?.status === 200) {
      return res.json({
        status: 200,
        message: payload.message || 'OK',
        data: normalizeTrackResponse(payload, awb, courier)
      });
    }

    return res.status(upstream.status || 502).json({
      status: payload?.status || upstream.status || 502,
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

  const items = req.body.items as { id: string; awb: string; courier: string }[];
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
      const url = `${BASE_URL}/track?api_key=${encodeURIComponent(apiKey)}&courier=${encodeURIComponent(courier)}&awb=${encodeURIComponent(awb)}`;
      const upstream = await fetch(url);
      const payload = await upstream.json();
      if (upstream.ok && payload?.status === 200) {
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
        errorMessage: payload?.message || `BinderByte mengembalikan status ${payload?.status || upstream.status}`
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

function normalizeCostItem(raw: any, courierCode: string, courierName: string) {
  const costArr: any[] = Array.isArray(raw?.cost) ? raw.cost : [];
  const cheapest = costArr[0] || {};
  const value = Number(cheapest.value) || 0;
  const etd = cheapest.etd || raw?.last_etd || '';
  return {
    code: courierCode,
    service: raw?.service || '',
    description: raw?.description || `${courierName} ${raw?.service || ''}`.trim(),
    cost: value,
    etd: etd ? `${etd} Hari` : '',
    courierCode,
    courierName
  };
}

app.get('/api/cost', async (req, res) => {
  const apiKey = ensureApiKey(res);
  if (!apiKey) return;

  const origin = (req.query.origin as string) || '';
  const destination = (req.query.destination as string) || '';
  const weight = parseInt((req.query.weight as string) || '1000', 10);
  const originType = (req.query.originType as string) || 'city';
  const destinationType = (req.query.destinationType as string) || 'city';
  const couriersParam = (req.query.courier as string) || COST_COURIERS.map((c) => c.code).join(',');

  if (!origin || !destination) {
    return res.status(400).json({
      status: 400,
      message: 'Parameter origin dan destination wajib diisi.'
    });
  }

  const courierList = couriersParam
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 22);

  async function fetchCost(courier: string) {
    const params = new URLSearchParams({
      api_key: apiKey,
      courier,
      origin,
      destination,
      weight: String(weight),
      originType,
      destinationType
    });
    const url = `${BASE_URL}/cost?${params.toString()}`;
    try {
      const upstream = await fetch(url);
      const json = await upstream.json();
      if (!upstream.ok || json?.status !== 200) return null;
      return { courier, payload: json };
    } catch {
      return null;
    }
  }

  const responses = await Promise.all(courierList.map(fetchCost));
  const allResults: any[] = [];
  for (const r of responses) {
    if (!r) continue;
    const data = r.payload?.data;
    const courierName = data?.courier?.name || r.courier.toUpperCase();
    const arr = Array.isArray(data?.costs) ? data.costs : Array.isArray(data) ? data : [];
    for (const item of arr) {
      allResults.push(normalizeCostItem(item, r.courier, courierName));
    }
  }

  if (allResults.length === 0) {
    return res.status(502).json({
      status: 502,
      message:
        'Tidak ada data ongkir yang dikembalikan BinderByte. Pastikan kode origin/destination valid dan subscription kamu mendukung kecamatan.'
    });
  }

  allResults.sort((a, b) => a.cost - b.cost);
  res.json({ status: 200, message: 'OK', data: allResults });
});

// Export `app` agar server.ts (dev only) bisa import tanpa menyebabkan
// Vercel serverless bundle ikut-include server.ts.
export { app };
export default app;