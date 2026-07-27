import { app } from '../server.js';

// Vercel serverless entry — exports the Express app directly.
// `server.ts` imports this module's path sibling, but does NOT call listen()
// when VERCEL/VERCEL_ENV env vars are set, so this stays safe for serverless.
export default app;
