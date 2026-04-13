/**
 * Capa Transversal: Manejador Global de Errores (Error Handler)
 * --------------------------------------------------------------------------
 * Centraliza la captura de todas las excepciones (try-catch fails) originadas
 * en Controladores o Servicios. Responde a la necesidad arquitectónica de
 * no mezclar lógica de infraestructura HTTP (status codes) con Lógica de Negocio.
 */

const logger = require('../utils/logger');

/**
 * Middleware final de Express para captura unificada de errores.
 * Compatible con los códigos internos del ORM Prisma (PostgreSQL).
 * 
 * @param {Error} err - Objeto de error enviado vía next(error).
 * @param {Object} req - Petición HTTP.
 * @param {Object} res - Respuesta HTTP estándar.
 * @param {Function} next - Funcionalidad base, no se llama tras resolver el error.
 * @returns {JSON} - Respuesta unificada con status y formato predictible.
 */
const errorHandler = (err, req, res, next) => {
  // Manejo de Seguridad: Sanitización estricta para evitar la fuga 
  // de credenciales sensibles (claves, tokens) hacia los registros de logs.
  const safeBody = { ...req.body };
  delete safeBody.password;
  delete safeBody.confirmPassword;
  delete safeBody.token;

  logger.error(`Error del Servidor: ${err.message}`, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: safeBody
  });

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Error interno del servidor';
  let errors = undefined;

  // --- Mapeos de Excepciones del ORM (Prisma) ---

  // Prisma: Unique constraint violation (RN: Impide duplicación de emails/identificadores)
  if (err.code === 'P2002') {
    statusCode = 409;
    const field = err.meta?.target?.[0] || 'campo';
    message = `El valor del campo '${field}' ya existe`;
  }
  // Prisma: Record not found (Maneja dependencias inexistentes, ej: buscar usuario fantasma)
  else if (err.code === 'P2025') {
    statusCode = 404;
    message = err.meta?.cause || 'Registro no encontrado';
  }
  // Prisma: Foreign key constraint failed (RN de Integridad Referencial de BDD)
  else if (err.code === 'P2003') {
    statusCode = 400;
    const field = err.meta?.field_name || 'referencia';
    message = `Referencia inválida: el registro vinculado en '${field}' no existe`;
  }
  // Prisma: Invalid input value (Tipos de datos erróneos insertos al motor DB)
  else if (err.code === 'P2006') {
    statusCode = 400;
    message = `Valor inválido para el campo: ${err.meta?.field_name || 'desconocido'}`;
  }
  // Express-validator (Retrocompatibilidad para mapeo de validaciones de Middleware)
  else if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    errors = Object.values(err.errors).map(e => e.message);
    message = errors.length > 0 ? errors.join('. ') : 'Error de validación de datos';
  }

  // Se omite el stacktrace en producción por políticas de seguridad de la arquitectura.
  res.status(statusCode).json({
    success: false,
    error: {
      type: err.name || 'Error',
      message: message,
      details: errors,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    },
    timestamp: new Date().toISOString()
  });
};

module.exports = errorHandler;
