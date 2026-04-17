const cors = require('cors');
const logger = require('../utils/logger');

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:9002',
            'http://localhost:9003',
            'https://4funstore-vercel.vercel.app',
            process.env.FRONTEND_URL
        ].filter(Boolean);

        // Permitir previews dinámicos de Vercel (subdominios legítimos: 4funstore-<hash>.vercel.app)
        const isAllowedVercel = /^https:\/\/4funstore(-[a-z0-9]+)*\.vercel\.app$/.test(origin);

        if (allowedOrigins.includes(origin) || isAllowedVercel) {
            callback(null, true);
        } else {
            // Nota: Se rechaza silenciosamente registrando el log en lugar de lanzar una excepción para evitar caídas de la aplicación por bots.
            logger.warn(`CORS rejected for origin: ${origin}`);
            callback(null, false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

module.exports = cors(corsOptions);
