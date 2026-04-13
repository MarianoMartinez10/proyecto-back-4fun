/**
 * Capa Transversal: Validación de Entorno (Bootstrap)
 * --------------------------------------------------------------------------
 * Se ejecuta al iniciar la aplicación (server.js) para asegurar la integridad 
 * del contexto de ejecución. Aisla el chequeo de Configuración del resto del MVC.
 */

const logger = require('../utils/logger');

/**
 * Comprueba que el proceso de Node (process.env) cuente con las credenciales
 * estrictamente obligatorias para no arrancar el servidor a ciegas.
 * 
 * @returns {void} - Lanza excepción FATAL y aborta la app si faltan críticas.
 */
const validateEnv = () => {
  // Manejo de Excepciones Fatales: Variables que si faltan bloquean la app entera
  const criticalVars = ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL'];

  const missingCritical = criticalVars.filter((v) => !process.env[v]);
  
  // RN-Arquitectura: Un backend no debe arrancar de forma parcial si fallan 
  // secretos core (ej. firma JWT o la conexión DB maestra).
  if (missingCritical.length > 0) {
    const errorMsg = `❌ FATAL ERROR: Faltan variables de entorno críticas: ${missingCritical.join(', ')}`;
    logger.error(errorMsg);
    throw new Error(errorMsg); // Rompemos el ciclo de Vercel/Node deliberadamente
  }

  // --- Chequeos de mitigación (Warnings de configuración) ---

  if (process.env.JWT_SECRET.length < 32) {
    logger.warn('⚠️  JWT_SECRET es muy corta. Debería tener al menos 32 caracteres.');
  }

  if (!process.env.JWT_EXPIRE) {
    logger.warn('⚠️  JWT_EXPIRE no definido. Usando valor por defecto: 7d');
  }

  // Variables no críticas, pero que degradan servicios específicos (Emails / Pagos)
  const optionalVars = ['BACKEND_URL', 'SMTP_EMAIL', 'SMTP_PASSWORD'];
  const missingOptional = optionalVars.filter((v) => !process.env[v]);
  if (missingOptional.length > 0) {
    logger.warn(`⚠️  Variables opcionales no configuradas: ${missingOptional.join(', ')} — algunas funciones (pagos, email) pueden no funcionar.`);
  }

  // Validación combinada de servicios SMTP (Nodemailer config)
  if (process.env.SMTP_EMAIL && !process.env.SMTP_PASSWORD) {
    logger.warn('⚠️  SMTP_EMAIL está definido pero SMTP_PASSWORD no. Los emails no se enviarán.');
  }
  if (process.env.SMTP_PASSWORD && process.env.SMTP_PASSWORD.length < 10) {
    logger.warn('⚠️  SMTP_PASSWORD parece demasiado corta. Las App Passwords de Gmail tienen 16 caracteres.');
  }

  // Validaciones del proveedor MercadoPago (Contexto API Remoto)
  const mpEnv = process.env.MERCADOPAGO_ENV || 'sandbox';
  if (mpEnv === 'production' && !process.env.MERCADOPAGO_ACCESS_TOKEN) {
    logger.warn('⚠️  MERCADOPAGO_ACCESS_TOKEN no configurado en modo production. Los pagos no funcionarán.');
  }
  if (mpEnv === 'production' && !process.env.MERCADOPAGO_WEBHOOK_SECRET) {
    logger.warn('⚠️  MERCADOPAGO_WEBHOOK_SECRET no configurado en producción. Validación de firmas de webhooks desactivada (riesgo de seguridad).');
  }
  if (mpEnv === 'sandbox' && !process.env.MERCADOPAGO_SANDBOX_TOKEN) {
    logger.warn('⚠️  MERCADOPAGO_SANDBOX_TOKEN no configurado. MercadoPago sandbox no funcionará.');
  }

  logger.info(`✅ Variables de entorno validadas. (MP: ${mpEnv})`);
};

module.exports = validateEnv;
