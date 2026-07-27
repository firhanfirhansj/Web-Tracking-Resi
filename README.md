# LacakResi Pro – Tracking Resi & Cek Ongkir BinderByte

Website tracking resi otomatis untuk 1–50 resi sekaligus dan cek estimasi ongkir dari kecamatan, terkoneksi langsung dengan **BinderByte API**. Tidak perlu login, langsung pakai.

## Fitur

- **Bulk Tracking**: lacak hingga 50 nomor resi sekaligus dengan deteksi kurir otomatis.
- **Single Tracking**: cek 1 resi dengan tampilan detail & timeline perjalanan.
- **Cek Estimasi Ongkir**: bandingkan tarif antar-kota/kecamatan dari 12 ekspedisi (JNE, POS, TIKI, SiCepat, AnterAja, Lion, Ninja, SAP, ID Express, J&T, Wahana, SPX).
- **24 Kurir Cek Resi**: JNE, POS, J&T, J&T Cargo, SiCepat, TIKI, AnterAja, Wahana, Ninja, Lion, PCP, JET, REX, First Logistics, ID Express, Shopee Express, KGXpress, SAP, JX, RPX, Lazada Express, Indah Cargo, Dakota Cargo, Kurir Rekomendasi.
- **Riwayat Tersimpan**: data resi yang pernah dicek disimpan lokal di browser (LocalStorage).
- **Tanpa Login**: langsung pakai tanpa registrasi.

## Sumber API

Data diambil dari [BinderByte](https://binderbyte.com) — lihat dokumentasi lengkap di <https://documenter.getpostman.com/view/12963788/TVRg69g4>.

## Setup Lokal

**Prasyarat**: Node.js 18+ dan npm.

1. Install dependencies:
   ```bash
   npm install
   ```

2. Salin `.env.example` ke `.env.local`, lalu isi API key BinderByte kamu:
   ```
   BINDERBYTE_API_KEY=api_key_kamu_dari_binderbyte
   ```
   Daftar & dapatkan API key gratis di <https://binderbyte.com>.

3. Jalankan server development:
   ```bash
   npm run dev
   ```
   App terbuka di `http://localhost:3000`.

## Deploy ke Vercel

1. Push repository ini ke GitHub.
2. Buka <https://vercel.com/new>, import repository.
3. Di **Environment Variables**, tambahkan:
   - `BINDERBYTE_API_KEY` = API key kamu
4. Klik **Deploy**.

Konfigurasi Vercel (`vercel.json`) sudah disiapkan:
- `/api/*` → serverless function Express (`api/index.ts`)
- `/*` → static SPA dari hasil `vite build`

## Scripts

| Script | Fungsi |
|---|---|
| `npm run dev` | Jalankan server development (Express + Vite HMR) di port 3000 |
| `npm run build` | Build produksi: SPA ke `dist/` |
| `npm run lint` | TypeScript type-check |
| `npm start` | Jalankan server produksi dari `dist/` (untuk self-host) |

## Struktur Project

```
.
├── api/index.ts          # Vercel serverless entry (Express app)
├── server.ts             # Local dev server entry
├── src/
│   ├── components/       # React components (Bulk, Single, Cost, History, Header)
│   ├── data/             # Daftar kurir & kecamatan statis
│   ├── services/         # API client (fetch ke /api/*)
│   └── types.ts          # TypeScript types
├── vercel.json           # Routing Vercel
├── vite.config.ts        # Vite + Tailwind config
└── package.json
```

## Catatan

- Cek ongkir berbasis **kecamatan** memerlukan subscription BinderByte minimal Starter. Kalau subscription kamu cuma mendukung kota/kabupaten, pilih level "Kota" saja di dropdown.
- API Key disimpan di environment server — tidak pernah dikirim ke client.
- Limitasi: BinderByte free tier punya kuota harian; untuk produksi tinggi gunakan paket berbayar.