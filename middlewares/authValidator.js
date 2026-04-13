/**
 * Capa de Seguridad: Validación de Entradas (Auth)
 * --------------------------------------------------------------------------
 * Este módulo aprovecha express-validator para sanear y validar estructuras
 * de datos de peticiones antes de que alcancen a los Controladores (MVC).
 * Mejora la mantenibilidad al encapsular todas las reglas de formato en un solo lugar.
 */

const { body, validationResult } = require('express-validator');

/**
 * Validador genérico que interpreta el resultado de express-validator.
 * 
 * @param {Object} req - Petición HTTP provista por Router.
 * @param {Object} res - Respuesta HTTP.
 * @param {Function} next - Middleware pasarela.
 * @returns {void|JSON} - 400 Si hay errores de estructura, interrumpiendo el flujo.
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    // Manejo de Excepciones de Entrada: Evita procesamiento de esquemas inválidos (RN-Datos)
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false, 
            message: 'Error de validación',
            errors: errors.array().map(e => e.msg) 
        });
    }
    next();
};

/**
 * Colección de Middlewares para la ruta de Registro.
 * RN: Valida la obligatoriedad de nombre, formato de email y robustez de clave (Mínimo 6 chars).
 */
exports.registerValidation = [
    body('name')
        .trim()
        .notEmpty().withMessage('El nombre es requerido'),
    body('email')
        .isEmail().withMessage('Debe proporcionar un email válido')
        .normalizeEmail({
            // Mantenimiento de Entidad: Forzamos el respeto de sintaxis base en todos 
            // los proveedores para preservar cuentas diferentes (ej. test.1 vs test1)
            gmail_remove_dots: false,
            outlookdotcom_remove_subaddress: false,
            gmail_remove_subaddress: false
        }),
    body('password')
        .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
    validate
];

/**
 * Colección de Middlewares para la ruta de Login.
 * RN: Valida formato de email y existencia de password para rechazar peticiones nulas velozmente.
 */
exports.loginValidation = [
    body('email')
        .isEmail().withMessage('Email inválido')
        .normalizeEmail({
            gmail_remove_dots: false,
            outlookdotcom_remove_subaddress: false,
            gmail_remove_subaddress: false
        }),
    body('password').notEmpty().withMessage('La contraseña es requerida'),
    validate
];