// =====================================================================
// LacakResi Pro — Local Dev Server
// =====================================================================
// HANYA untuk `npm run dev`. JANGAN di-import dari /api/index.ts —
// Vercel serverless tidak men-copy file ini ke runtime function, sehingga
// import '../server' dari serverless akan gagal dengan ERR_MODULE_NOT_FOUND.
//
// Arah import BENAR:
//   server.ts (dev)  ──imports──▶  api/index.ts (serverless + shared)
//   api/index.ts     ──tidak pernah import──▶  ../server
// =====================================================================

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { app } from './api/index';

const isVercel = Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);
if (isVercel) {
  // Jangan pernah listen() di environment Vercel — file ini seharusnya
  // tidak dijalankan sama sekali di sana, tapi double-check supaya aman.
  console.warn('[server.ts] Vercel env terdeteksi — skip listen().');
} else {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server tracking BinderByte running on http://localhost:${PORT}`);
  });
}