/**
 * Capa de Servicios: Autenticación e Identidad
 * --------------------------------------------------------------------------
 * Encapsula la lógica core de seguridad (Hashing, JWTs, Validaciones).
 * En la arquitectura MVC, este servicio es el único responsable de mutar 
 * las credenciales y aplicar las Reglas de Negocio vinculadas a la Identidad.
 */

const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const emailService = require('./emailService');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');
const crypto = require('crypto');

/** --- Utilidades Criptográficas Internas (Encapsuladas) --- */

/**
 * Aplica salting y hashing seguro a credenciales planas.
 * @param {string} password - Texto plano.
 * @returns {Promise<string>} Hash en formato bcrypt.
 */
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};

/**
 * Emite un Token JWT firmado para el ciclo de vida de la sesión.
 * RN (Seguridad): Fija la ventana de expiración en base al entorno.
 * @param {string} userId - UUID a estampar en el payload.
 * @returns {string} Token en Base64.
 */
const signToken = (userId) =>
    jwt.sign({ id: userId }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d'
    });

/**
 * Valida un intento de logueo contra el hash en base de datos.
 * @param {string} entered - Contraseña enviada.
 * @param {string} hashed - Hash persistido.
 * @returns {Promise<boolean>}
 */
const matchPassword = (entered, hashed) => bcrypt.compare(entered, hashed);

/** --- Clase de Dominio --- */

class AuthService {
    
    /**
     * Da de alta a un usuario aplicando restricciones de sistema.
     * @param {Object} data - DTO proveniente del cliente ({ name, email, password }).
     * @returns {Promise<{user: Object, emailSent: boolean}>} Estado final.
     */
    async register({ name, email, password }) {
        const userExists = await prisma.user.findUnique({ where: { email } });
        
        // RN-02: Garantía de Usuarios Únicos. Impide crear cuentas clonadas en el sistema.
        // Manejo de Excepciones: Arroja 400 (Bad Request) que será atajado por ErrorHandler global.
        if (userExists) throw new ErrorResponse('El usuario ya existe', 400);

        // Seguridad: Generación de token probabilístico de 40 chars para el mail.
        const verificationToken = crypto.randomBytes(20).toString('hex');
        const hashedPwd = await hashPassword(password);

        // RN-03: Cuentas nuevas nacen inactivas (isVerified: false).
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPwd,
                verificationToken,
                verificationTokenExp: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expiración: 24hs
                isVerified: false
            }
        });

        let emailSent = false;
        
        // Promesa asíncrona de Mailing. No bloquea el alta del usuario si SMTP está caído.
        const emailPromise = emailService.sendWelcomeEmail({ name, email, verificationToken })
            .then(result => {
                emailSent = result.success;
                if (result.success) logger.info('Email de bienvenida enviado', { email });
                else logger.warn('Falló envío de email de bienvenida', { email, reason: result.message });
            })
            .catch(error => {
                emailSent = false;
                logger.error('Excepción al enviar email', { email, error: error.message });
            });

        // RN de Resiliencia: Si el correo tarda más de 4s en enviarse, soltamos el requets 
        // para no dejar al frontal en timeout.
        await Promise.race([emailPromise, new Promise(r => setTimeout(r, 4000))]);
        return { user: { ...user, _id: user.id }, emailSent };
    }

    /**
     * Coteja y consume un token de verificación de cuenta.
     * @param {string} token - Token hash de 40 caracteres.
     * @returns {Promise<Object>} Usuario activado.
     */
    async verifyEmail(token) {
        const user = await prisma.user.findFirst({
            where: {
                verificationToken: token,
                verificationTokenExp: { gt: new Date() } // Condición: Debe estar vigente hoy
            }
        });

        // RN: Previene resucitar tokens viejos, o ataques de repetición.
        // Falla ruidosamente mandando un HTTP 400 al controlador.
        if (!user) throw new ErrorResponse('Token de verificación inválido o expirado', 400);

        await prisma.user.update({
            where: { id: user.id },
            data: { isVerified: true, verificationToken: null, verificationTokenExp: null }
        });

        return { ...user, _id: user.id };
    }

    /**
     * Regenera el token de activación a solicitud manual de reenvío.
     */
    async resendVerification(email) {
        const user = await prisma.user.findUnique({ where: { email } });
        
        if (!user) throw new ErrorResponse('No se encontró una cuenta con ese email', 404);
        
        // RN: Previene spam interno y agotamiento de SMTP si se piden activaciones de cuentas reales.
        if (user.isVerified) throw new ErrorResponse('Esta cuenta ya está verificada', 400);

        const verificationToken = crypto.randomBytes(20).toString('hex');
        await prisma.user.update({
            where: { id: user.id },
            data: {
                verificationToken,
                verificationTokenExp: new Date(Date.now() + 24 * 60 * 60 * 1000)
            }
        });

        const result = await emailService.sendWelcomeEmail({ name: user.name, email, verificationToken });
        if (!result.success) throw new ErrorResponse('No se pudo enviar el email de verificación. Intentá más tarde.', 503);
        
        return { message: 'Email de verificación reenviado exitosamente' };
    }

    /**
     * Valida la tupla Email-Clave y expide credenciales de sesión.
     * @param {string} email - Identificador principal.
     * @param {string} password - Contraseña cruda a cotejar.
     * @returns {Promise<Object>} User document acoplado con métodos inyectados.
     */
    async login(email, password) {
        if (!email || !password) throw new ErrorResponse('Por favor ingrese email y contraseña', 400);

        const user = await prisma.user.findUnique({ where: { email } });
        // Manejo de Error: Se expone mensaje ambiguo (401) intencionalmente contra ataques de enumeración (Information Disclosure).
        if (!user) throw new ErrorResponse('Credenciales inválidas', 401);

        const isMatch = await matchPassword(password, user.password);
        if (!isMatch) throw new ErrorResponse('Credenciales inválidas', 401);

        // Mapeos adaptativos requeridos por el pipeline legacy hacia el controlador MVC.
        user._id = user.id;
        user.getSignedJwtToken = () => signToken(user.id);
        return user;
    }

    /**
     * Inicia transacción de olvido de credencial (ForgotPassword).
     */
    async forgotPassword(email) {
        const user = await prisma.user.findUnique({ where: { email } });
        
        // Manejo de Seguridad (Information Disclosure): 
        // Nunca confirmamos al cliente si el correo existe o no en la BD. Retornamos OK silencioso.
        if (!user) return { message: 'Si el email está registrado, recibirás un enlace de recuperación.' };

        // Cryptography: En BDD se guarda un SHA256 indescifrable; por email viaja un hex crudo.
        // Si la BD se compromete, el token robado será inútil para resetear sin fuerza bruta inmensa.
        const rawToken = crypto.randomBytes(20).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetPasswordToken: hashedToken,
                resetPasswordExp: new Date(Date.now() + 60 * 60 * 1000) // Validez: 1 hora de extrema severidad.
            }
        });

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:9002';
        const normalizedFrontendUrl = frontendUrl.endsWith('/') ? frontendUrl.slice(0, -1) : frontendUrl;
        const resetUrl = `${normalizedFrontendUrl}/reset-password/${rawToken}`;

        const result = await emailService.sendPasswordResetEmail({ name: user.name, email: user.email, resetUrl });

        if (!result.success) {
            // Rollback en caso de que el SMTP rechace la orden de despacho.
            await prisma.user.update({
                where: { id: user.id },
                data: { resetPasswordToken: null, resetPasswordExp: null }
            });
            throw new ErrorResponse('No se pudo enviar el email de recuperación. Intentá más tarde.', 503);
        }

        logger.info('Email de recuperación enviado', { email: user.email });
        return { message: 'Si el email está registrado, recibirás un enlace de recuperación.' };
    }

    /**
     * Remata el ciclo consumiendo un recoveryToken y forjando una clave inédita.
     */
    async resetPassword(rawToken, newPassword) {
        // RN: Previene claves triviales, complementando la validación del router/middleware frontal.
        if (!newPassword || newPassword.length < 6) {
            throw new ErrorResponse('La contraseña debe tener al menos 6 caracteres.', 400);
        }

        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        const user = await prisma.user.findFirst({
            where: {
                resetPasswordToken: hashedToken,
                resetPasswordExp: { gt: new Date() }
            }
        });

        if (!user) throw new ErrorResponse('El enlace de recuperación es inválido o ha expirado.', 400);

        const hashedPwd = await hashPassword(newPassword);
        const updated = await prisma.user.update({
            where: { id: user.id },
            // Vaciado mandatorio de tokens (Rollback de estado de pánico) para reanudar operaciones.
            data: { password: hashedPwd, resetPasswordToken: null, resetPasswordExp: null }
        });

        logger.info('Contraseña restablecida', { email: updated.email });
        
        updated._id = updated.id;
        updated.getSignedJwtToken = () => signToken(updated.id);
        return updated;
    }
}

module.exports = new AuthService();
