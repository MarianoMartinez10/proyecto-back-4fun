const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const hpp = require('hpp');
const prisma = require('./lib/prisma');
const errorHandler = require('./middlewares/errorHandler');
const validateEnv = require('./middlewares/validateEnv');
const logger = require('./utils/logger'); // Importar Winston

dotenv.config();
validateEnv();

// Connect to Supabase via Prisma on startup
prisma.$connect()
    .then(() => logger.info('✅ Conectado a Supabase (PostgreSQL via Prisma)'))
    .catch(err => { logger.error('❌ Error conectando a Supabase:', err.message); process.exit(1); });

const app = express();

// Verificar proxy para funcionamiento de cookies seguras en balanceadores de carga (Render/Vercel).
app.set('trust proxy', 1);

app.use(helmet({
  // Seguridad / Compatibilidad: Declaramos directivas estables para evitar
  // warnings de navegador por features experimentales no soportadas.
  permissionsPolicy: {
    directives: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: []
    }
  }
}));
app.use(require('./config/cors')); // CORS primero: descarta peticiones no autorizadas sin gastar CPU en ratelimit/logs

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, message: "Demasiadas peticiones, intenta más tarde." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

app.use((req, res, next) => {
  // Skip logging health checks and static assets to reduce log noise
  if (req.url !== '/health') {
    logger.info(`${req.method} ${req.url}`, { ip: req.ip });
  }
  next();
});

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// Note: mongoSanitize removed (no longer needed with Prisma/PostgreSQL)
app.use(compression());
app.use(hpp());

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/wishlist', require('./routes/wishlistRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

app.use('/api/platforms', require('./routes/platformRoutes'));
app.use('/api/genres', require('./routes/genreRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));

app.use('/api/keys', require('./routes/keyRoutes'));
app.use('/api/coupons', require('./routes/couponRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/transactions', require('./routes/transactionRoutes'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Diagnóstico temporal SMTP (solo desarrollo) ───
if (process.env.NODE_ENV !== 'production') {
app.get('/debug/smtp', async (req, res) => {
  const nodemailer = require('nodemailer');
  const { promises: dns } = require('dns');
  const diag = {
    SMTP_EMAIL: process.env.SMTP_EMAIL ? `✅ ${process.env.SMTP_EMAIL}` : '❌ NO DEFINIDA',
    SMTP_PASSWORD: process.env.SMTP_PASSWORD ? `✅ (${process.env.SMTP_PASSWORD.length} chars)` : '❌ NO DEFINIDA',
    FRONTEND_URL: process.env.FRONTEND_URL || '(default: http://localhost:3000)',
    nodeVersion: process.version,
  };

  // DNS resolution test
  try {
    const { address } = await dns.lookup('smtp.gmail.com', { family: 4 });
    diag.dns = `✅ smtp.gmail.com → ${address}`;
  } catch (e) {
    diag.dns = `❌ ${e.message}`;
  }

  // Test each port independently
  const email = process.env.SMTP_EMAIL;
  const password = process.env.SMTP_PASSWORD;
  if (email && password) {
    for (const { port, secure, label } of [
      { port: 587, secure: false, label: '587/STARTTLS' },
      { port: 465, secure: true, label: '465/SSL' }
    ]) {
      try {
        const t = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port, secure,
          connectionTimeout: 10000,
          auth: { user: email, pass: password }
        });
        await t.verify();
        diag[`port_${port}`] = `✅ ${label} OK`;
        t.close();
      } catch (e) {
        diag[`port_${port}`] = `❌ ${label}: ${e.message}`;
      }
    }
  }

  // Current transporter status
  try {
    const emailService = require('./services/emailService');
    diag.isAvailable = await emailService.isAvailable();
  } catch (err) {
    diag.error = err.message;
  }

  res.json(diag);
});
}

app.use((req, res, next) => {
  logger.warn(`Ruta no encontrada (404): ${req.method} ${req.originalUrl}`);
  const error = new Error(`Ruta no encontrada - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

app.use(errorHandler);

// Exportar el app para Vercel Serverless
module.exports = app;

// Iniciar servidor localmente (Vercel ignora esto si no se llama directo)
if (process.env.NODE_ENV !== 'production' || process.env.RENDER) {
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    logger.info(`🛡️  Seguridad Activada (Helmet + RateLimit)`);
    logger.info(`✅ Servidor corriendo en puerto ${PORT}`);
    logger.info(`🌍 Modo: ${process.env.NODE_ENV}`);
    logger.info(`🗄️  Base de datos: Supabase (PostgreSQL + Prisma)`);
  });

  // Graceful shutdown (Render envía SIGTERM al redeploy)
  process.on('SIGTERM', () => {
    logger.info('🛑 SIGTERM recibido. Cerrando servidor...');
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('✅ Servidor cerrado limpiamente.');
      process.exit(0);
    });
  });
}
