const express = require('express');
const router = express.Router();
const { sendMessage } = require('../controllers/contactController');
const rateLimit = require('express-rate-limit');

/**
 * Capa de Enrutamiento: Comunicaciones Externas (Contact)
 * --------------------------------------------------------------------------
 * Punto de entrada público para el formulario de contacto institucional.
 */

/**
 * RN - Seguridad (Rate Limiting): Implementa una barrera de estrangulamiento
 * para mitigar ataques de denegación de servicio (DoS) o saturación de 
 * casillas SMTP por bots.
 */
const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // Ventana de 1 hora
    max: 5, // Límite estricto de 5 tickets por IP
    message: { 
        success: false, 
        message: "Umbral de seguridad alcanzado. Has enviado demasiados mensajes. Por favor intenta más tarde." 
    }
});

/** @route POST /api/contact - Despacha notificación de contacto al soporte administrativo. */
router.post('/', contactLimiter, sendMessage);

module.exports = router;
