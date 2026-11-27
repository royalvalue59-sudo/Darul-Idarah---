import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { buildWhatsAppUrl, db, initDatabase } from './server/db.ts';
import { ensureEnvSuperAdminSynced, authRouter } from './server/routes/auth.ts';
import { superRouter } from './server/routes/super.ts';
import { institutionRouter } from './server/routes/institution.ts';
import { instModulesRouter } from './server/routes/institutionModules.ts';
import { teacherAdvancedRouter } from './server/routes/teacherAdvanced.ts';
import { portalsRouter } from './server/routes/portals.ts';
import { uploadsRouter } from './server/routes/uploads.ts';
import { FILE_TOO_LARGE_ERROR } from './server/uploadPolicy.ts';
import { getConnectedInstitutionIds, setupRealtimeServer } from './server/realtime.ts';
import { recomputeInstitutionLiveStatuses } from './server/services/teacherEngine.ts';

const PORT = 3000;

async function startServer() {
  initDatabase();
  ensureEnvSuperAdminSynced();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '35mb' }));

  // Basic security headers (iframe-compatible)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timezone: 'Asia/Dhaka', timestamp: new Date().toISOString() });
  });

  // Public application branding & support info (available on Login pages and globally)
  app.get('/api/public/branding', (_req, res) => {
    const brand = db
      .prepare('SELECT app_name, logo_data_url, logo_mime, logo_filename, logo_version, updated_at FROM application_branding WHERE id = 1')
      .get() as any;
    const support = db
      .prepare('SELECT whatsapp_number, whatsapp_enabled, facebook_url, facebook_enabled, support_email, support_description, updated_at FROM support_settings WHERE id = 1')
      .get() as any;
    const platformSetting = db
      .prepare('SELECT value_json FROM system_settings WHERE key = ?')
      .get('platform_name') as { value_json: string } | undefined;

    let appName = brand?.app_name || 'DARUL IDARAH';
    if (platformSetting?.value_json) {
      try {
        const parsed = JSON.parse(platformSetting.value_json);
        if (typeof parsed === 'string' && parsed.trim()) appName = parsed.trim();
      } catch {
        // ignore
      }
    }

    const whatsappNumber = support?.whatsapp_number || '';
    const whatsappUrl = support?.whatsapp_enabled ? buildWhatsAppUrl(whatsappNumber) : '';
    const facebookUrl = support?.facebook_enabled ? (support?.facebook_url || '') : '';

    res.json({
      branding: {
        app_name: appName,
        logo_url: brand?.logo_data_url || '',
        logo_mime: brand?.logo_mime || '',
        logo_filename: brand?.logo_filename || '',
        logo_version: brand?.logo_version || 1,
        updated_at: brand?.updated_at || '',
      },
      support: {
        whatsapp_number: whatsappNumber,
        whatsapp_url: whatsappUrl,
        whatsapp_enabled: Boolean(support?.whatsapp_enabled),
        facebook_url: facebookUrl,
        facebook_enabled: Boolean(support?.facebook_enabled),
        support_email: support?.support_email || '',
        support_description: support?.support_description || '',
      },
    });
  });

  // API Routers
  app.use('/api/auth', authRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/super', superRouter);
  app.use('/api/inst', teacherAdvancedRouter);
  app.use('/api/inst', institutionRouter);
  app.use('/api/inst', instModulesRouter);
  app.use('/api/portal', portalsRouter);

  // API 404 handler
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API এন্ডপয়েন্ট পাওয়া যায়নি।' });
  });

  // Global error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Server Error]', err);
    if (res.headersSent) return;
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      return res.status(413).json({ error: FILE_TOO_LARGE_ERROR, code: 'FILE_TOO_LARGE' });
    }
    res.status(500).json({ error: 'সার্ভারে একটি অপ্রত্যাশিত ত্রুটি ঘটেছে।' });
  });

  const httpServer = http.createServer(app);
  setupRealtimeServer(httpServer);

  // Real-time Asia/Dhaka schedule-driven teacher live status & upcoming class alert ticker (every 15s)
  setInterval(() => {
    try {
      const instIds = getConnectedInstitutionIds();
      for (const instId of instIds) {
        recomputeInstitutionLiveStatuses(instId, { broadcast: true });
      }
    } catch (err) {
      console.error('[LiveStatusTicker]', err);
    }
  }, 15_000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`DARUL IDARAH server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start DARUL IDARAH server:', err);
  process.exit(1);
});
