import express, { Request, RequestHandler, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, AppConfig } from './src/server/db.ts';
import { pingMongo } from './src/server/mongo.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const apiRouter = express.Router();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
const isDirectExecution = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;

app.use(express.json({ limit: '32kb' }));

const asyncRoute = (
  handler: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res)).catch(next);
};

function publicConfig(config: AppConfig) {
  return {
    allowMasterApiKeyBypass: config.allowMasterApiKeyBypass,
    whatsappUrl: config.whatsappUrl,
    telegramUrl: config.telegramUrl,
    phone: config.phone,
    developer: config.developer,
  };
}

async function authorizeAdmin(password: unknown, res: Response): Promise<AppConfig | null> {
  const config = await db.getConfig();
  if (!config.adminPassword) {
    res.status(503).json({ ok: false, error: 'Admin access is not configured. Set ADMIN_PASSWORD.' });
    return null;
  }
  if (typeof password !== 'string' || password !== config.adminPassword) {
    res.status(401).json({ ok: false, error: 'Invalid admin credentials.' });
    return null;
  }
  return config;
}

apiRouter.get('/health', asyncRoute(async (_req, res) => {
  try {
    await pingMongo();
    return res.json({
      ok: true,
      service: 'FR-KING AURA Terminal Backend',
      status: 'online',
      database: { provider: 'mongodb', connected: true },
      timestamp: new Date().toISOString(),
      isServerless: Boolean(process.env.VERCEL),
    });
  } catch (error) {
    console.error('MongoDB health check failed:', error);
    return res.status(503).json({
      ok: false,
      service: 'FR-KING AURA Terminal Backend',
      status: 'database_unavailable',
      database: { provider: 'mongodb', connected: false },
      error: 'MongoDB is unavailable. Check MONGODB_URI and database network access.',
      isServerless: Boolean(process.env.VERCEL),
    });
  }
}));

apiRouter.get('/config', asyncRoute(async (_req, res) => {
  return res.json(publicConfig(await db.getConfig()));
}));

apiRouter.post('/config', asyncRoute(async (req, res) => {
  const config = await authorizeAdmin(req.body?.password, res);
  if (!config) return;

  const updates: Partial<AppConfig> = {};
  if (req.body.apiKey !== undefined) {
    if (typeof req.body.apiKey !== 'string') {
      return res.status(400).json({ ok: false, error: 'API key must be a string.' });
    }
    if (req.body.apiKey.trim()) updates.apiKey = req.body.apiKey.trim();
  }
  if (req.body.adminPassword !== undefined) {
    if (typeof req.body.adminPassword !== 'string') {
      return res.status(400).json({ ok: false, error: 'Admin password must be a string.' });
    }
    if (req.body.adminPassword.trim()) updates.adminPassword = req.body.adminPassword.trim();
  }
  if (req.body.allowMasterApiKeyBypass !== undefined) {
    if (typeof req.body.allowMasterApiKeyBypass !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'Master key bypass setting must be boolean.' });
    }
    updates.allowMasterApiKeyBypass = req.body.allowMasterApiKeyBypass;
  }

  const updated = await db.updateConfig(updates);
  return res.json({ ok: true, config: publicConfig(updated) });
}));

apiRouter.post('/verify-key', asyncRoute(async (req, res) => {
  const { key, device } = req.body || {};
  if (typeof key !== 'string' || !key.trim()) {
    return res.status(400).json({ ok: false, error: 'License key is required.' });
  }
  if (device !== undefined && (typeof device !== 'string' || !device.trim())) {
    return res.status(400).json({ ok: false, error: 'Device identifier must be a non-empty string.' });
  }

  const cleanKey = key.trim().toUpperCase();
  const deviceId = typeof device === 'string' ? device.trim() : 'device-unknown';
  const config = await db.getConfig();
  if (config.allowMasterApiKeyBypass && config.apiKey && cleanKey === config.apiKey.toUpperCase()) {
    return res.json({
      ok: true,
      license: {
        id: 'master_api_key',
        license_key: cleanKey,
        full_name: 'VIP Master Admin',
        status: 'approved',
        lifetime: true,
        duration_label: 'Master API Key',
        max_devices: 999,
        license_devices: [deviceId],
        created_at: new Date().toISOString(),
      },
    });
  }

  const license = await db.findLicenseByKey(cleanKey);
  if (!license) {
    return res.json({
      ok: false,
      error: 'License key not found. Please register or contact support.',
    });
  }
  if (license.status === 'blocked') {
    return res.json({ ok: false, error: 'This license has been blocked by administrator.' });
  }
  if (license.status === 'pending') {
    return res.json({ ok: false, error: 'Payment verification pending. Please wait for admin approval.' });
  }
  if (!license.lifetime && license.expires_at && new Date(license.expires_at) < new Date()) {
    return res.json({
      ok: false,
      error: `License key expired on ${new Date(license.expires_at).toLocaleDateString()}. Please renew with admin.`,
    });
  }

  const result = await db.bindDevice(cleanKey, deviceId);
  if (!result.ok) return res.json({ ok: false, error: result.error || 'Device verification failed.' });
  return res.json({ ok: true, license: result.license });
}));

apiRouter.post('/register-key', asyncRoute(async (req, res) => {
  const { full_name, phone, email, amount } = req.body || {};
  if (
    typeof full_name !== 'string' || !full_name.trim() ||
    typeof phone !== 'string' || !phone.trim() ||
    typeof email !== 'string' || !email.trim() ||
    (amount !== undefined && typeof amount !== 'string')
  ) {
    return res.status(400).json({ ok: false, error: 'Full name, phone, and email are required.' });
  }

  const license = await db.createLicense({
    full_name: full_name.trim(),
    phone: phone.trim(),
    email: email.trim(),
    amount: amount || 'Pending Payment',
    duration: '1 Month',
    max_devices: 1,
    status: 'pending',
  });
  return res.json({ ok: true, key: license.license_key, license });
}));

apiRouter.post('/admin/login', asyncRoute(async (req, res) => {
  const config = await db.getConfig();
  if (!config.adminPassword) {
    return res.status(503).json({ ok: false, error: 'Admin access is not configured. Set ADMIN_PASSWORD.' });
  }
  if (req.body?.password === config.adminPassword) return res.json({ ok: true });
  return res.status(401).json({ ok: false, error: 'Invalid admin password.' });
}));

apiRouter.post('/admin/keys', asyncRoute(async (req, res) => {
  if (!(await authorizeAdmin(req.body?.password, res))) return;
  return res.json({ ok: true, keys: await db.getLicenses() });
}));

apiRouter.post('/admin/action', asyncRoute(async (req, res) => {
  const config = await authorizeAdmin(req.body?.password, res);
  if (!config) return;

  const { id, action, duration, max_devices, deviceId } = req.body;
  if (typeof id !== 'string' || !id.trim() || typeof action !== 'string') {
    return res.status(400).json({ ok: false, error: 'License ID and action are required.' });
  }
  if (max_devices !== undefined && (!Number.isInteger(max_devices) || max_devices < 1)) {
    return res.status(400).json({ ok: false, error: 'Device limit must be a positive integer.' });
  }
  if (duration !== undefined && typeof duration !== 'string') {
    return res.status(400).json({ ok: false, error: 'Duration must be a string.' });
  }
  if (deviceId !== undefined && typeof deviceId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Device identifier must be a string.' });
  }

  const result = await db.updateLicenseAction(id, action, duration, max_devices, deviceId);
  if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
  return res.json({ ok: true, license: result.license });
}));

apiRouter.post('/admin/create-key', asyncRoute(async (req, res) => {
  if (!(await authorizeAdmin(req.body?.password, res))) return;
  const { custom_key, full_name, phone, email, duration, max_devices } = req.body;
  if (custom_key !== undefined && typeof custom_key !== 'string') {
    return res.status(400).json({ ok: false, error: 'Custom license key must be a string.' });
  }
  if (duration !== undefined && typeof duration !== 'string') {
    return res.status(400).json({ ok: false, error: 'Duration must be a string.' });
  }
  if (max_devices !== undefined && (!Number.isInteger(max_devices) || max_devices < 1)) {
    return res.status(400).json({ ok: false, error: 'Device limit must be a positive integer.' });
  }

  const license = await db.createLicense({
    custom_key,
    full_name: typeof full_name === 'string' && full_name.trim() ? full_name.trim() : 'VIP Client',
    phone: typeof phone === 'string' ? phone.trim() : '',
    email: typeof email === 'string' ? email.trim() : '',
    amount: 'Admin Minted',
    duration: duration || '1 Month',
    max_devices: max_devices ?? 1,
    status: 'approved',
  });
  return res.json({ ok: true, license });
}));

apiRouter.post('/signals', asyncRoute(async (req, res) => {
  const signal = req.body?.signal;
  if (
    !signal || typeof signal !== 'object' ||
    typeof signal.id !== 'string' || !signal.id ||
    typeof signal.pair !== 'string' || !signal.pair ||
    !['BUY', 'SELL'].includes(signal.direction)
  ) {
    return res.status(400).json({ ok: false, error: 'Invalid signal payload.' });
  }

  const saved = await db.addSignal(signal);
  return res.json({ ok: true, signal: saved });
}));

apiRouter.get('/signals', asyncRoute(async (_req, res) => {
  return res.json({ ok: true, signals: await db.getSignals() });
}));

app.use('/api', apiRouter);
app.use(apiRouter);

app.use((error: unknown, _req: Request, res: Response, next: (error?: unknown) => void) => {
  if (res.headersSent) return next(error);
  console.error('API request failed:', error);
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  const status = typeof error === 'object' && error !== null && 'status' in error &&
    typeof error.status === 'number' ? error.status : 500;
  const unavailable = message.includes('MONGODB_URI') ||
    (typeof error === 'object' && error !== null && 'name' in error && /Mongo.*Error/.test(String(error.name)));
  return res.status(unavailable ? 503 : status).json({
    ok: false,
    error: unavailable
      ? 'MongoDB is unavailable. Check MONGODB_URI and database network access.'
      : status === 400 || status === 413
        ? 'Request body is invalid or too large.'
      : 'Request failed. Check server logs for details.',
  });
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`FR-KING AURA server running on port ${PORT}`);
  });
}

if (!process.env.VERCEL && isDirectExecution) {
  startServer().catch((error: unknown) => {
    console.error('Server failed to start:', error);
    process.exitCode = 1;
  });
}

export default app;
