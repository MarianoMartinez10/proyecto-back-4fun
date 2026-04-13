/**
 * Capa de Seguridad: Autenticación y Autorización
 * --------------------------------------------------------------------------
 * Este módulo (Middleware) actúa como barrera de entrada a las rutas protegidas.
 * Su propósito arquitectónico es resolver los datos de sesión (tokens) e interceptar
 * accesos no autorizados antes de que alcancen la capa de Controladores,
 * garantizando la seguridad del sistema y el aislamiento de responsabilidades (MVC).
 */

const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const logger = require('../utils/logger');

/**
 * Verifica la existencia y validez de un token JWT para habilitar la sesión.
 * Cumple con la Regla de Negocio (RN) de Seguridad: "Solo usuarios autenticados 
 * pueden acceder a recursos privados del sistema".
 * 
 * @param {Object} req - Petición HTTP (extrae token desde cookies o headers).
 * @param {Object} res - Respuesta HTTP.
 * @param {Function} next - Delega el control al siguiente eslabón (Controlador).
 * @returns {void|JSON} - Retorna error 401 si se incumple la regla de autenticación.
 */
exports.protect = async (req, res, next) => {
    try {
        let token;

        if (process.env.NODE_ENV !== 'production') {
            logger.info(`[AUTH DEBUG] Cookies: ${JSON.stringify(req.cookies)}, Auth Header: ${req.headers.authorization}`);
        }

        // Recuperación de credenciales: Priorizamos HttpOnly Cookies por seguridad (mitiga XSS)
        if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
            logger.info('[AUTH] Token encontrado en COOKIE');
        }
        else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
            logger.info('[AUTH] Token encontrado en HEADER Authorization');
        }

        // Validación: Previene accesos sin credenciales (RN-Seguridad)
        if (!token || token === 'none') {
            logger.warn('[AUTH] Token no encontrado en cookies ni headers');
            return res.status(401).json({
                success: false,
                message: 'Sesión expirada o no válida'
            });
        }

        // Manejo de Configuración: Previene vulnerabilidades criptográficas si falla el entorno
        if (!process.env.JWT_SECRET) {
            logger.error("FATAL: JWT_SECRET no definido en variables de entorno.");
            return res.status(500).json({ success: false, message: 'Error de configuración del servidor' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Acceso a datos: Se inyectará el perfil a req.user (sin incluir datos sensibles)
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

        // Validación: Previene mantener sesiones si el usuario fue abolido de la BDD
        if (!user) {
            return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
        }

        req.user = user;
        next();
    } catch (error) {
        // Manejo de Excepciones: Atrapa fallos en jwt.verify (ej: tokens expirados o adulterados)
        logger.error(`[Auth Middleware] Error de verificación: ${error.message}`);
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
};

/**
 * Valida los permisos de rol (Autorización) de un usuario ya autenticado.
 * 
 * @param {...string} roles - Lista de roles permitidos (ej. 'admin', 'user').
 * @returns {Function} - Middleware que bloquea o permite el paso.
 */
exports.authorize = (...roles) => {
    return (req, res, next) => {
        // RN: Previene escalado de privilegios asegurando que req.user.role coincida con los solicitados
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Acceso denegado: Se requiere rol ${roles.join(' o ')}`
            });
        }
        next();
    };
};