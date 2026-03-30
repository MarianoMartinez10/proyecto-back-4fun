const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const logger = require('../utils/logger');

exports.protect = async (req, res, next) => {
    try {
        let token;

        // DEBUG: Log para ver qué recibe el backend (solo en desarrollo)
        if (process.env.NODE_ENV !== 'production') {
            logger.info(`[AUTH DEBUG] Cookies: ${JSON.stringify(req.cookies)}, Auth Header: ${req.headers.authorization}`);
        }

        // 1. Prioridad: Token en Cookie (HttpOnly - Más seguro contra XSS)
        if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
            logger.info('[AUTH] Token encontrado en COOKIE');
        }
        // 2. Fallback: Header Authorization (Bearer)
        else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
            logger.info('[AUTH] Token encontrado en HEADER Authorization');
        }

        if (!token || token === 'none') {
            logger.warn('[AUTH] Token no encontrado en cookies ni headers');
            return res.status(401).json({
                success: false,
                message: 'Sesión expirada o no válida'
            });
        }

        // SEGURIDAD CRÍTICA: Fallar si no hay secreto configurado
        if (!process.env.JWT_SECRET) {
            logger.error("FATAL: JWT_SECRET no definido en variables de entorno.");
            return res.status(500).json({ success: false, message: 'Error de configuración del servidor' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // MIGRACIÓN PRISMA: Buscar usuario por ID excluyendo la contraseña
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isVerified: true,
                avatar: true,
                phone: true,
                address: true,
                createdAt: true
            }
        });

        if (!user) {
            return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
        }

        req.user = user;
        next();
    } catch (error) {
        logger.error(`[Auth Middleware] Error de verificación: ${error.message}`);
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
};

exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Acceso denegado: Se requiere rol ${roles.join(' o ')}`
            });
        }
        next();
    };
};