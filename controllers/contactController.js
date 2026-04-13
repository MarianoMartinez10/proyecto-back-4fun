/**
 * Capa de Controladores: Contacto (Operaciones Públicas)
 * --------------------------------------------------------------------------
 * Gestiona el flujo de comunicación desde usuarios visitantes hacia la 
 * administración mediante un servicio de tercerización (SMTP). (MVC)
 */

const EmailService = require('../services/emailService');
const logger = require('../utils/logger');

/**
 * Recibe un payload de contacto del frontend, valida su integridad básica, y
 * lo delega al servicio de correos corporativos.
 * 
 * @param {Object} req - Body esperando { firstName, lastName, email, message }.
 * @param {Object} res - Respuesta HTTP estándar.
 * @param {Function} next - Interceptor de fallos asíncronos.
 * @returns {JSON} Estado del envío.
 */
exports.sendMessage = async (req, res, next) => {
  try {
    const { firstName, lastName, email, message } = req.body;

    // Manejo de Excepciones de Entrada: Chequeo defensivo básico antes de procesar 
    // reglas pesadas.
    if (!firstName || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Los campos nombre, email y mensaje son requeridos.'
      });
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ');

    // Regla de Negocio (Tolerancia a fallos): Verifica estado de conectividad SMTP
    // antes de prometerle un éxito al cliente final.
    if (!EmailService.isAvailable()) {
      logger.warn('contactController: Servicio de email no disponible al intentar enviar contacto', { email });
      return res.status(503).json({
        success: false,
        message: 'El servicio de contacto no está disponible en este momento. Por favor intente más tarde.'
      });
    }

    // Delegación al Modelo/Servicio (MVC Estricto)
    const result = await EmailService.sendContactNotification({ fullName, email, message });

    // Manejo de Excepciones del Proveedor: Si el correo rebota, lo registramos internamente
    // pero devolvemos un mensaje seguro genérico al cliente (Information Disclosure limit).
    if (!result.success) {
      logger.error('contactController: Error al enviar email de contacto', {
        from: email,
        error: result.message
      });
      return res.status(500).json({
        success: false,
        message: 'No se pudo enviar el mensaje. Por favor intente nuevamente.'
      });
    }

    logger.info(`contactController: Mensaje de contacto enviado desde ${email}`);

    return res.status(200).json({
      success: true,
      message: '¡Mensaje enviado correctamente! Nos pondremos en contacto a la brevedad.'
    });

  } catch (error) {
    next(error);
  }
};
