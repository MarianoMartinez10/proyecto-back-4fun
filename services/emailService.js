/**
 * Capa de Servicios: Infraestructura y Notificaciones (Email)
 * --------------------------------------------------------------------------
 * Encapsula la lógica del adaptador SMTP para desacoplar a los controladores 
 * de las complejidades del Mailing. Implementa el patrón Singleton.
 */

const nodemailer = require('nodemailer');
const dns = require('dns');
const { promisify } = require('util');
const logger = require('../utils/logger');

const dnsLookup = promisify(dns.lookup);

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

class EmailService {
  constructor() {
    this._transporter = null;
    this._fromEmail = null;
    this._fromName = '4Fun Store';
  }

  /**
   * RN Infraestructura: Inicializa el pool SMTP de forma asíncrona ("Lazy Initialization")
   * para no bloquear el Event Loop durante el arranque del motor de la aplicación en Vercel.
   */
  async _getTransporter() {
    if (!this._transporter) {
      const email = process.env.SMTP_EMAIL;
      const password = process.env.SMTP_PASSWORD;

      if (!email || !password) {
        logger.warn('EmailService: SMTP_EMAIL o SMTP_PASSWORD no configuradas. Los emails no se enviarán.');
        return null;
      }

      // RN Resolución de Red: Render/Vercel presentan fallas transitorias de IPv6.
      // Aquí se maneja la excepción forzando TCP/IPv4 explicitamente sobre el adaptador DNS.
      let smtpHost = 'smtp.gmail.com';
      try {
        const { address } = await dnsLookup('smtp.gmail.com', { family: 4 });
        smtpHost = address;
      } catch (dnsErr) {
        logger.warn('EmailService: No se pudo resolver IPv4, usando hostname', { error: dnsErr.message });
      }

      this._transporter = nodemailer.createTransport({
        host: smtpHost,
        port: 587,
        secure: false, // STARTTLS
        pool: true,
        maxConnections: 3,
        socketTimeout: 30000,
        tls: { 
          rejectUnauthorized: true,
          servername: 'smtp.gmail.com' // Fuerza la validación contra el dominio oficial
        },
        auth: { user: email, pass: password }
      });

      this._fromEmail = email;
    }
    return this._transporter;
  }

  async isAvailable() { return (await this._getTransporter()) !== null; }

  _htmlToText(html) { return html.replace(/<[^>]+>/g, ' ').trim(); }

  _delay(attempt) { return new Promise(resolve => setTimeout(resolve, RETRY_BASE_MS * Math.pow(2, attempt))); }

  /**
   * Envía un payload a un destinatario determinado.
   * Tolerancia a fallos: Implementa Retry Pattern Exponencial para evadir desconexiones (ETIMEDOUT).
   * 
   * @param {Object} options - Parámetros { to, subject, html }.
   * @returns {Promise<Object>} Resultado nominal.
   */
  async sendEmail({ to, subject, html }) {
    const transporter = await this._getTransporter();
    if (!transporter) return { success: false, message: 'Servicio offline' };

    const mailOptions = {
        from: `${this._fromName} <${this._fromEmail}>`,
        to, subject, html, text: this._htmlToText(html),
        // Mantenibilidad (Reputación de Dominio): Inyecta cabeceras RFC para esquivar Spam Folders
        headers: { 'List-Unsubscribe': `<mailto:${this._fromEmail}?subject=unsubscribe>` }
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const info = await transporter.sendMail(mailOptions);
        return { success: true, messageId: info.messageId };
      } catch (error) {
        // Manejo de Excepciones Transitorias
        const transientSmtpCodes = [421, 450, 451, 452];
        const isRetryable = transientSmtpCodes.includes(error.responseCode) || ['ECONNECTION', 'ETIMEDOUT'].includes(error.code);

        if (attempt === MAX_RETRIES || !isRetryable) {
          logger.error('EmailService: Error definitivo al enviar', { to, error: error.message });
          return { success: false, message: error.message };
        }
        await this._delay(attempt);
      }
    }
  }

  // Métodos de ensamblaje de plantillas
  async sendWelcomeEmail({ name, email, verificationToken }) { /* HTML Omitido por Brevedad Logica */ return this.sendEmail({ to: email, subject: 'Bienvenido', html: `Token: ${verificationToken}` }); }
  async sendDigitalProductDelivery(user, order, keys) {
    const customerName = user?.name || 'Cliente';
    const orderId = order?._id || order?.id || 'N/A';
    const keysList = Array.isArray(keys)
      ? keys.map((k, index) => `<li style="margin-bottom:8px;"><strong>Key ${index + 1}:</strong> ${k.clave}</li>`).join('')
      : '';

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:640px;margin:0 auto;">
        <h2 style="margin:0 0 12px;">Tu compra fue acreditada</h2>
        <p>Hola ${customerName},</p>
        <p>Confirmamos el pago de tu orden <strong>#${orderId}</strong>. Estas son tus claves digitales:</p>
        <ul style="padding-left:20px;">${keysList}</ul>
        <p>Guarda este correo en un lugar seguro para futuras consultas.</p>
        <hr style="border:none;border-top:1px solid #ddd;margin:18px 0;" />
        <p style="font-size:12px;color:#555;">4Fun Store - Entrega automatica de licencias digitales</p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject: `Tus keys digitales - Orden #${orderId}`,
      html
    });
  }
  async sendContactNotification({ fullName, email, message }) {
    const html = `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #d658fa;">Nueva Consulta desde la Web</h2>
        <p><strong>De:</strong> ${fullName} (${email})</p>
        <p><strong>Mensaje:</strong></p>
        <div style="background: #f9f9f9; padding: 15px; border-radius: 5px;">${message}</div>
      </div>
    `;
    return this.sendEmail({ to: this._fromEmail, subject: `Consulta Web: ${fullName}`, html });
  }
  async sendPasswordResetEmail({ name, email, resetUrl }) { /* HTML Omitido */ return this.sendEmail({ to: email, subject: 'Reset', html: resetUrl }); }
}

module.exports = new EmailService();
