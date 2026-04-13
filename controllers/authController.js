/**
 * Capa de Controladores: Autenticación
 * --------------------------------------------------------------------------
 * Orquesta el flujo de requests (req) y responses (res) referidos al login y 
 * cuentas de usuarios. Delega exhaustivamente toda Lógica de Negocio y accesos BD 
 * hacia el `AuthService` (MVC), manteniendo los bloques ultra magros.
 */

const AuthService = require('../services/authService');
const UserService = require('../services/userService');
const ErrorResponse = require('../utils/errorResponse');
const jwt = require('jsonwebtoken');

/**
 * Transforma y sanitiza en memoria la entidad Usuario hacia un DTO (Data Transfer Object).
 * Asegura la Mantenibilidad eliminando passwords u otros internals de la salida HTTP.
 * @param {Object} user - Entidad Prisma / Mongoose legacy
 * @returns {Object} Representación segura para enviar al FrontEnd.
 */
const toUserDTO = (user) => ({
    id: user._id || user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar || null,
    phone: user.phone || null,
    address: user.address || null,
    isVerified: user.isVerified,
    createdAt: user.createdAt
});

/**
 * Estandarizador de emisiones de token en el Transport Layer (Headers & Cookies).
 * @param {Object} user 
 * @param {number} statusCode 
 * @param {Object} res 
 * @param {boolean} emailSent 
 */
const sendTokenResponse = (user, statusCode, res, emailSent) => {
    const token = jwt.sign({ id: user.id || user._id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d'
    });

    // Seguridad de Infraestructura: Cookies seteadas en HttpOnly mitigan vulnerabilidades 
    // XSS radicalmente, cumpliendo pautas de ciberseguridad corporativas.
    const options = {
        expires: new Date(Date.now() + (process.env.JWT_COOKIE_EXPIRE || 30) * 24 * 60 * 60 * 1000),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
    };

    const response = { success: true, token, user: toUserDTO(user) };
    if (emailSent !== undefined) response.emailSent = emailSent;

    res.status(statusCode).cookie('token', token, options).json(response);
};

/**
 * Receptor de formularios de registro de cliente final.
 * 
 * @param {Object} req - Body esperando credenciales (name, email, password)
 * @param {Object} res - Emisión de respuesta y cookie.
 * @param {Function} next - Trampa de excepciones asíncronas
 */
exports.register = async (req, res, next) => {
    try {
        const { user, emailSent } = await AuthService.register(req.body);
        sendTokenResponse(user, 201, res, emailSent);
    } catch (error) {
        // Manejo de Excepciones: Cualquier fallo (mail caído, bd llena, validación fallida de RN)
        // enruta de inmediato al errorHandler centralizado.
        next(error);
    }
};

/**
 * Ejecutor final del clic a un enlace de confirmación por email (Verify).
 */
exports.verifyEmail = async (req, res, next) => {
    try {
        const { token } = req.query;
        if (!token) {
            throw new ErrorResponse('Token no proporcionado', 400);
        }

        // RN (Control Flujo): AuthService aplica la regla de expiración sobre el token crudo en BD, 
        // no el controller
        await AuthService.verifyEmail(token);

        res.status(200).json({
            success: true,
            message: 'Email verificado exitosamente. Ya puedes iniciar sesión.'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Operación transaccional de cruce de usuario y contraseña para expedir acceso.
 */
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await AuthService.login(email, password);
        sendTokenResponse(user, 200, res);
    } catch (error) {
        next(error);
    }
};

/**
 * Extrae estáticamente la representación DTO del perfil solicitado vía HTTP GET.
 */
exports.getProfile = async (req, res, next) => {
    try {
        const user = await UserService.getUserById(req.user.id);
        res.status(200).json({ success: true, user: toUserDTO(user) });
    } catch (error) {
        next(error);
    }
};

/**
 * Aplica operaciones de Update (MUTACIÓN Parcial) a los atributos directos (non-relational) del usuario.
 */
exports.updateProfile = async (req, res, next) => {
    try {
        const { name, avatar, phone, address } = req.body;
        
        // Excepción al Patrón MVC Estricto: Importación tardía del ORM para 
        // resolver un helper utilitario. (Lo ideal sería extraer esto a UserService en un refactor agresivo).
        const prisma = require('../lib/prisma');

        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                ...(name !== undefined && { name }),
                ...(avatar !== undefined && { avatar }),
                ...(phone !== undefined && { phone }),
                ...(address !== undefined && { address })
            }
        });

        res.status(200).json({ success: true, user: toUserDTO(updatedUser) });
    } catch (error) {
        next(error);
    }
};

/**
 * Releva el control al mecanismo de validación e inyección perimetral para
 * sustituir definitivamente el hash en DB una vez constatado que sea el dueño legítimo (currentPassword).
 */
exports.changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const prisma = require('../lib/prisma');
        const bcrypt = require('bcryptjs');

        // Validaciones de Sanidad In-Controller (Se admite para flujos pequeños por practicidad)
        if (!currentPassword || !newPassword) {
            throw new ErrorResponse('Se requiere la contraseña actual y la nueva.', 400);
        }
        // RN: Normativa UI sobre longitud criptográfica base.
        if (newPassword.length < 6) {
            throw new ErrorResponse('La nueva contraseña debe tener al menos 6 caracteres.', 400);
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id }
        });

        if (!user) {
            throw new ErrorResponse('Usuario no encontrado', 404);
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        
        // Manejo Excepciones: Bloquea iteraciones maliciosas de cambio de clave forzado (Information Gathering).
        if (!isMatch) {
            throw new ErrorResponse('La contraseña actual es incorrecta.', 401);
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword }
        });

        res.status(200).json({
            success: true,
            message: 'Contraseña actualizada correctamente.'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Invalida formalmente el JWT borrando la cookie para que el Browser desplace los recursos.
 */
exports.logout = async (req, res, next) => {
    res.cookie('token', 'none', {
        expires: new Date(Date.now() + 10 * 1000), // Vence instantáneamente
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
    });

    res.status(200).json({
        success: true,
        data: {}
    });
};

/**
 * Endpoints atómicos enrutados hacia su Lógica de Negocio respectiva en AuthService.
 */
exports.resendVerification = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) throw new ErrorResponse('Se requiere el email', 400);
        
        const result = await AuthService.resendVerification(email);
        res.status(200).json({ success: true, message: result.message });
    } catch (error) { next(error); }
};

exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) throw new ErrorResponse('Se requiere el email', 400);
        
        const result = await AuthService.forgotPassword(email);
        res.status(200).json({ success: true, message: result.message });
    } catch (error) { next(error); }
};

exports.resetPassword = async (req, res, next) => {
    try {
        const { token } = req.params;
        const { password } = req.body;
        if (!token || !password) throw new ErrorResponse('Token y nueva contraseña son requeridos', 400);
        
        await AuthService.resetPassword(token, password);
        res.status(200).json({ success: true, message: 'Contraseña restablecida.' });
    } catch (error) { next(error); }
};
