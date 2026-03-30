const logger = require('../utils/logger');

/**
 * Middleware Global de Errores con Winston Logging
 * Compatible con Prisma (PostgreSQL)
 */
const errorHandler = (err, req, res, next) => {
  // Sanitize body before logging — remove sensitive fields
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

  // Prisma: Unique constraint violation (ej: email duplicado)
  if (err.code === 'P2002') {
    statusCode = 409;
    const field = err.meta?.target?.[0] || 'campo';
    message = `El valor del campo '${field}' ya existe`;
  }
  // Prisma: Record not found
  else if (err.code === 'P2025') {
    statusCode = 404;
    message = err.meta?.cause || 'Registro no encontrado';
  }
  // Prisma: Foreign key constraint failed
  else if (err.code === 'P2003') {
    statusCode = 400;
    const field = err.meta?.field_name || 'referencia';
    message = `Referencia inválida: el registro vinculado en '${field}' no existe`;
  }
  // Prisma: Invalid input value
  else if (err.code === 'P2006') {
    statusCode = 400;
    message = `Valor inválido para el campo: ${err.meta?.field_name || 'desconocido'}`;
  }
  // Express-validator ValidationError (backward compat)
  else if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    errors = Object.values(err.errors).map(e => e.message);
    message = errors.length > 0 ? errors.join('. ') : 'Error de validación de datos';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      type: err.name || 'Error',
      message: message,
      details: errors,
      // Solo mostramos stack trace en desarrollo
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    },
    timestamp: new Date().toISOString()
  });
};

module.exports = errorHandler;
