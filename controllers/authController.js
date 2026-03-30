const AuthService = require('../services/authService');
const UserService = require('../services/userService');
const ErrorResponse = require('../utils/errorResponse');
const jwt = require('jsonwebtoken');

// Transforma un user document a la forma estándar de respuesta
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

// Helper para gestionar la cookie y respuesta del token
const sendTokenResponse = (user, statusCode, res, emailSent) => {
    const token = jwt.sign({ id: user.id || user._id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d'
    });

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

// @desc    Registrar usuario
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
    try {
        const { user, emailSent } = await AuthService.register(req.body);
        sendTokenResponse(user, 201, res, emailSent);
    } catch (error) {
        next(error);
    }
};

// @desc    Verificar email
// @route   GET /api/auth/verify
// @access  Public
exports.verifyEmail = async (req, res, next) => {
    try {
        const { token } = req.query;
        if (!token) {
            throw new ErrorResponse('Token no proporcionado', 400);
        }

        await AuthService.verifyEmail(token);

        res.status(200).json({
            success: true,
            message: 'Email verificado exitosamente. Ya puedes iniciar sesión.'
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Login usuario
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await AuthService.login(email, password);
        sendTokenResponse(user, 200, res);
    } catch (error) {
        next(error);
    }
};

// @desc    Obtener perfil de usuario
// @route   GET /api/auth/profile
// @access  Private
exports.getProfile = async (req, res, next) => {
    try {
        const user = await UserService.getUserById(req.user.id);
        res.status(200).json({ success: true, user: toUserDTO(user) });
    } catch (error) {
        next(error);
    }
};

// @desc    Actualizar perfil propio (nombre, avatar, teléfono, dirección)
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
    try {
        const { name, avatar, phone, address } = req.body;
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

// @desc    Cambiar contraseña
// @route   PUT /api/auth/password
// @access  Private
exports.changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const prisma = require('../lib/prisma');
        const bcrypt = require('bcryptjs');

        if (!currentPassword || !newPassword) {
            throw new ErrorResponse('Se requiere la contraseña actual y la nueva.', 400);
        }

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

// @desc    Cerrar sesión / Limpiar cookie
// @route   GET /api/auth/logout
// @access  Public
exports.logout = async (req, res, next) => {
    res.cookie('token', 'none', {
        expires: new Date(Date.now() + 10 * 1000),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
    });

    res.status(200).json({
        success: true,
        data: {}
    });
};

// @desc    Reenviar email de verificación
// @route   POST /api/auth/resend-verification
// @access  Public
exports.resendVerification = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            throw new ErrorResponse('Se requiere el email', 400);
        }
        const result = await AuthService.resendVerification(email);
        res.status(200).json({ success: true, message: result.message });
    } catch (error) {
        next(error);
    }
};

// @desc    Solicitar reseteo de contraseña (envía email con token)
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            throw new ErrorResponse('Se requiere el email', 400);
        }
        const result = await AuthService.forgotPassword(email);
        res.status(200).json({ success: true, message: result.message });
    } catch (error) {
        next(error);
    }
};

// @desc    Restablecer contraseña con token válido
// @route   PUT /api/auth/reset-password/:token
// @access  Public
exports.resetPassword = async (req, res, next) => {
    try {
        const { token } = req.params;
        const { password } = req.body;
        if (!token || !password) {
            throw new ErrorResponse('Token y nueva contraseña son requeridos', 400);
        }
        await AuthService.resetPassword(token, password);
        res.status(200).json({ success: true, message: 'Contraseña restablecida correctamente. Ya podés iniciar sesión.' });
    } catch (error) {
        next(error);
    }
};
