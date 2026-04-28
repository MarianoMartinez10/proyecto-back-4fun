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
   */
  async _getTransporter() {
    if (!this._transporter) {
      const email = process.env.SMTP_EMAIL;
      const password = process.env.SMTP_PASSWORD;

      if (!email || !password) {
        logger.warn('EmailService: SMTP_EMAIL o SMTP_PASSWORD no configuradas.');
        return null;
      }

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
        secure: false, 
        pool: true,
        maxConnections: 3,
        socketTimeout: 30000,
        tls: {
          rejectUnauthorized: true,
          servername: 'smtp.gmail.com' 
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
   * Envía un email genérico.
   * @param {Object} options - { to, subject, html }.
   */
  async sendEmail({ to, subject, html }) {
    const transporter = await this._getTransporter();
    if (!transporter) return { success: false, message: 'Servicio offline' };

    const mailOptions = {
      from: `${this._fromName} <${this._fromEmail}>`,
      to, subject, html, text: this._htmlToText(html),
      headers: { 'List-Unsubscribe': `<mailto:${this._fromEmail}?subject=unsubscribe>` }
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const info = await transporter.sendMail(mailOptions);
        return { success: true, messageId: info.messageId };
      } catch (error) {
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
}

module.exports = new EmailService();
