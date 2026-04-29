const express = require('express');
const router = express.Router();
const {
    register,
    login,
    getProfile,
    updateProfile,
    changePassword,
    logout,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    becomeSeller
} = require('../controllers/authController');
const { protect } = require('../middlewares/auth');
const { registerValidation, loginValidation } = require('../middlewares/authValidator');

/**
 * Capa de Enrutamiento: Autenticación e Identidad (Auth)
 * --------------------------------------------------------------------------
 * Define los puntos de acceso para la gestión de sesiones y seguridad de usuarios.
 * Implementa una arquitectura híbrida con rutas públicas y protegidas mediante
 * interceptores JWT. (MVC / Router)
 */

// ─── RUTAS PÚBLICAS (OPEN ACCESS) ───
// Accesibles sin token; gestionan el ingreso y recuperación de acceso.

/** @route GET /api/auth/verify-email - Confirmación de cuenta vía token de correo. */
router.get('/verify-email', verifyEmail);

/** @route POST /api/auth/register - Registro con validación estructural de esquema. */
router.post('/register', registerValidation, register);

/** @route POST /api/auth/login - Inicio de sesión con persistencia en Cookies HttpOnly. */
router.post('/login', loginValidation, login);

/** @route POST /api/auth/resend-verification - Re-emisión de ticket de activación. */
router.post('/resend-verification', resendVerification);

/** @route POST /api/auth/forgot-password - Inicio de flujo de recuperación de clave. */
router.post('/forgot-password', forgotPassword);

/** @route PUT /api/auth/reset-password/:token - Aplicación de nueva credencial cifrada. */
router.put('/reset-password/:token', resetPassword);


// ─── RUTAS PROTEGIDAS (AUTH REQUIRED) ───
// Requieren el middleware 'protect' para verificar la firma del token en la petición.

/** @route GET /api/auth/profile - Recuperación de biometría del usuario activo. */
router.get('/profile', protect, getProfile);

/** @route PUT /api/auth/profile - Actualización de metadatos de contacto. */
router.put('/profile', protect, updateProfile);

/** @route PUT /api/auth/password - Rotación de credenciales de seguridad. */
router.put('/password', protect, changePassword);

/** @route POST /api/auth/become-seller - Transforma un comprador en vendedor creando su perfil de tienda. */
router.post('/become-seller', protect, becomeSeller);

/** @route POST /api/auth/logout - Destrucción de sesión y limpieza de Cookies. */
router.post('/logout', logout);

module.exports = router;
