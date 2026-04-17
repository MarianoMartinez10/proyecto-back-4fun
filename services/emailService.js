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
  // ─── PLANTILLAS PREMIUM (UI/UX) ───
  _getHtmlTemplate(content, buttonText, buttonUrl) {
    const primaryColor = '#d658fa';
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .btn:hover { background-color: #c040e0 !important; transform: scale(1.02); }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #030303; font-family: 'Segoe UI', Arial, sans-serif; color: #ffffff;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #030303; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #0a0a0a; border-radius: 24px; overflow: hidden; border: 1px solid rgba(214, 88, 250, 0.2); box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                <!-- Header (Logo) -->
                <tr>
                  <td align="center" style="padding: 40px 0 20px 0;">
                    <img src="https://4funstore-vercel.vercel.app/logo.png" alt="4Fun Logo" width="80" style="display: block; border-radius: 20px; box-shadow: 0 0 20px rgba(214, 88, 250, 0.3);">
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 0 50px 40px 50px; text-align: center;">
                    ${content}
                    
                    ${buttonText ? `
                      <div style="margin-top: 35px;">
                        <a href="${buttonUrl}" class="btn" style="display: inline-block; background-color: #111111; color: ${primaryColor}; border: 2px solid ${primaryColor}; padding: 18px 45px; border-radius: 16px; text-decoration: none; font-weight: 900; text-transform: uppercase; font-size: 13px; letter-spacing: 2px; transition: all 0.3s ease; box-shadow: 0 10px 30px rgba(214, 88, 250, 0.15);">
                          ${buttonText}
                        </a>
                      </div>
                    ` : ''}
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="padding: 30px; background-color: rgba(255,255,255,0.02); text-align: center; border-top: 1px solid rgba(255,255,255,0.05);">
                    <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.3); font-weight: bold;">
                      4Fun Store &copy; 2026 - Tu Tienda de Gaming Digital
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin-top: 25px; font-size: 10px; color: rgba(255,255,255,0.1); text-align: center; max-width: 400px; line-height: 1.6;">
                Este mensaje fue enviado automáticamente. Si no realizaste esta acción, por favor ignora este correo o contacta a soporte.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  async sendWelcomeEmail({ name, email, verificationToken }) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://4funstore-vercel.vercel.app';
    const verifyUrl = `${frontendUrl}/verify?token=${verificationToken}`;
    
    const content = `
      <div style="text-align: center; margin-bottom: 30px;">
        <span style="background-color: rgba(214, 88, 250, 0.1); color: #d658fa; padding: 5px 15px; border-radius: 20px; font-size: 10px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase;">
          Nivel 1 Desbloqueado
        </span>
      </div>
      <h1 style="font-size: 32px; margin: 0; color: #ffffff; letter-spacing: -1.5px; font-weight: 900; line-height: 1;">¡Tu aventura <br/>comienza ahora!</h1>
      <p style="font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.8); margin-top: 25px;">
        Hola <strong>${name}</strong>, bienvenido/a al ecosistema 4Fun. Ya sos parte de la comunidad gaming más grande de la región.
      </p>
      
      <div style="background-color: rgba(255,255,255,0.03); border-radius: 16px; padding: 20px; margin-top: 30px; text-align: left;">
        <p style="margin: 0 0 10px 0; font-size: 12px; color: #d658fa; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Con tu cuenta podés:</p>
        <div style="color: rgba(255,255,255,0.6); font-size: 13px; line-height: 1.5;">
          • Comprar juegos digitales al mejor precio del mercado.<br/>
          • Vender tus propias keys y ganar dinero real.<br/>
          • Acceder a soporte técnico personalizado 24/7.
        </div>
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.5); margin-top: 30px;">
        Solo un paso más: verificá tu correo para activar todas las funciones de tu perfil.
      </p>
    `;

    return this.sendEmail({ 
      to: email, 
      subject: '¡Bienvenido/a a 4Fun Store!', 
      html: this._getHtmlTemplate(content, 'Activar mi Cuenta', verifyUrl) 
    });
  }
  async sendDigitalProductDelivery(user, order, keys) {
    const customerName = user?.name || 'Cliente';
    const orderId = order?._id || order?.id || 'N/A';
    const keysList = Array.isArray(keys)
      ? keys.map((k, index) => `
        <div style="background-color: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; margin-bottom: 15px; border-left: 4px solid #d658fa; text-align: left; box-shadow: inset 0 0 10px rgba(0,0,0,0.5);">
          <span style="font-size: 11px; font-weight: 800; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 5px;">Licencia / Key ${index + 1}</span>
          <span style="font-family: monospace; font-size: 15px; font-weight: bold; color: #ffffff; letter-spacing: 2px;">${k.clave}</span>
        </div>
      `).join('')
      : '<p style="color: rgba(255,255,255,0.5);">No se encontraron licencias en esta orden.</p>';

    const content = `
      <div style="text-align: center; margin-bottom: 30px;">
        <span style="background-color: rgba(34, 197, 94, 0.1); color: #4ade80; padding: 5px 15px; border-radius: 20px; font-size: 10px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase;">
          Compra Acreditada
        </span>
      </div>
      <h1 style="font-size: 32px; margin: 0; color: #ffffff; letter-spacing: -1px; font-weight: 900; line-height: 1.2;">¡Tus juegos <br/>están listos!</h1>
      <p style="font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.8); margin-top: 25px;">
        Hola <strong>${customerName}</strong>, confirmamos el pago de tu orden <span style="color: #d658fa;">#${orderId}</span>. Acá tenés tus claves digitales:
      </p>
      
      <div style="margin-top: 35px; margin-bottom: 35px;">
        ${keysList}
      </div>

      <div style="background-color: rgba(255,255,255,0.03); border-radius: 16px; padding: 20px; text-align: center;">
        <p style="margin: 0; font-size: 13px; color: rgba(255,255,255,0.6); line-height: 1.5;">
          Guardá este correo en un lugar seguro para futuras consultas. Copiá y pegá la licencia en la plataforma correspondiente para empezar a jugar.
        </p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject: `Tus keys digitales de 4Fun - Orden #${orderId}`,
      html: this._getHtmlTemplate(content)
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
  async sendPasswordResetEmail({ name, email, resetUrl }) {
    const content = `
      <h1 style="font-size: 28px; margin: 0; color: #ffffff; letter-spacing: -1px;">¿Olvidaste tu clave?</h1>
      <p style="font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.7); margin-top: 20px;">
        Hola ${name}, recibimos una solicitud para restablecer la contraseña de tu cuenta en 4Fun.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.5); margin-top: 10px;">
        Si no realizaste este pedido, simplemente ignora este correo. Tu cuenta sigue segura.
      </p>
    `;

    return this.sendEmail({ 
      to: email, 
      subject: 'Restablecer contraseña - 4Fun Store', 
      html: this._getHtmlTemplate(content, 'Cambiar Contraseña', resetUrl) 
    });
  }
}

module.exports = new EmailService();
