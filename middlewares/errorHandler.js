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
  let title = err.name || 'Error del Servidor';
  let message = err.message || 'Ocurrió un error inesperado en el sistema.';
  let details = undefined;

  // --- Mapeos de Excepciones del ORM (Prisma / Persistencia) ---

  // 1. Fallos de Conexión (UTN: Robustez - Error 503 Service Unavailable)
  const connectionErrors = ['P1001', 'P1008', 'P1017'];
  if (connectionErrors.includes(err.code)) {
    statusCode = 503;
    title = 'Servicio No Disponible';
    message = 'No se pudo establecer conexión con la base de datos. Intente nuevamente en unos minutos.';
  }
  // 2. Violación de Restricción Única (RN: Datos duplicados)
  else if (err.code === 'P2002') {
    statusCode = 400; // Cambiado a 400 para simplificar validación en front
    title = 'Conflicto de Datos';
    const field = err.meta?.target?.[0] || 'campo';
    message = `Ya existe un registro con ese valor en el campo: ${field}.`;
  }
  // 3. Registro No Encontrado
  else if (err.code === 'P2025') {
    statusCode = 404;
    title = 'No Encontrado';
    message = err.meta?.cause || 'El recurso solicitado no existe en la base de datos.';
  }
  // 4. Fallo de Integridad Referencial
  else if (err.code === 'P2003') {
    statusCode = 400;
    title = 'Error de Integridad';
    message = 'No se puede completar la operación debido a una referencia inválida entre entidades.';
  }
  // 5. Errores de Validación de Dominio (Custom ErrorResponse)
  else if (err.name === 'ErrorResponse') {
    title = 'Validación de Negocio';
  }

  // --- Contrato de Error Unificado (UTN: Bridge Backend-Frontend) ---
  // Estructura exigida: { error: str, message: str, code: int }
  res.status(statusCode).json({
    success: false,
    error: title,
    message: message,
    code: statusCode, // Usamos el status code HTTP como código de error base
    internalCode: err.code || undefined, // Código interno de Prisma opcional
    timestamp: new Date().toISOString()
  });
};

module.exports = errorHandler;
