/**
 * Capa de Presentación: Plantillas de Email
 * --------------------------------------------------------------------------
 * Separa la lógica visual de la infraestructura de envío.
 */

const primaryColor = '#d658fa';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:9002';

const _getHtmlWrapper = (content, buttonText, buttonUrl) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        .btn:hover { background-color: #c040e0 !important; transform: scale(1.02); }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #030303; font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #ffffff;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #030303; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #0a0a0a; border-radius: 24px; overflow: hidden; border: 1px solid rgba(214, 88, 250, 0.2); box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
              <tr>
                <td align="center" style="padding: 40px 0 20px 0;">
                  <img src="https://4funstore-vercel.vercel.app/logo.png" alt="4Fun Logo" width="80" style="display: block; border-radius: 20px; box-shadow: 0 0 20px rgba(214, 88, 250, 0.3);">
                </td>
              </tr>
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
              <tr>
                <td style="padding: 30px; background-color: rgba(255,255,255,0.02); text-align: center; border-top: 1px solid rgba(255,255,255,0.05);">
                  <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.3); font-weight: bold;">
                    4Fun Store &copy; 2026 - Tu Tienda de Gaming Digital
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

const getWelcomeEmail = (name, verificationToken) => {
  const verifyUrl = `${frontendUrl}/verificar-email?token=${verificationToken}`;
  const content = `
    <div style="text-align: center; margin-bottom: 30px;">
      <span style="background-color: rgba(214, 88, 250, 0.1); color: #d658fa; padding: 5px 15px; border-radius: 20px; font-size: 10px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase;">
        Correo de activación
      </span>
    </div>
    <h1 style="font-size: 32px; margin: 0; color: #ffffff; letter-spacing: -1.5px; font-weight: 900; line-height: 1;">¡Tu aventura <br/>comienza ahora!</h1>
    <p style="font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.8); margin-top: 25px;">
      Hola <strong>${name}</strong>, bienvenido/a al ecosistema 4Fun.
    </p>
  `;
  return {
    subject: '¡Bienvenido/a a 4Fun Store!',
    html: _getHtmlWrapper(content, 'Activar mi Cuenta', verifyUrl)
  };
};

const getDigitalDeliveryEmail = (customerName, orderId, keys) => {
  const keysList = keys.map((k, index) => `
    <div style="background-color: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; margin-bottom: 15px; border-left: 4px solid #d658fa; text-align: left;">
      <span style="font-family: monospace; font-size: 15px; font-weight: bold; color: #ffffff;">${k.clave}</span>
    </div>
  `).join('');

  const content = `
    <h1 style="font-size: 32px; margin: 0; color: #ffffff; font-weight: 900;">¡Tus juegos están listos!</h1>
    <p style="color: rgba(255,255,255,0.8); margin-top: 25px;">
      Hola <strong>${customerName}</strong>, confirmamos tu orden <span style="color: #d658fa;">#${orderId}</span>.
    </p>
    <div style="margin-top: 35px;">${keysList}</div>
  `;
  return {
    subject: `Tus keys digitales de 4Fun - Orden #${orderId}`,
    html: _getHtmlWrapper(content)
  };
};

const getPasswordResetEmail = (name, resetUrl) => {
  const content = `
    <h1 style="font-size: 28px; margin: 0; color: #ffffff;">¿Olvidaste tu clave?</h1>
    <p style="color: rgba(255,255,255,0.7); margin-top: 20px;">Hola ${name}, recibimos una solicitud para restablecer tu contraseña.</p>
  `;
  return {
    subject: 'Restablecer contraseña - 4Fun Store',
    html: _getHtmlWrapper(content, 'Cambiar Contraseña', resetUrl)
  };
};

const getContactNotificationEmail = (fullName, email, message) => {
  const content = `
    <h1 style="font-size: 24px; margin: 0; color: #ffffff;">Nuevo mensaje de contacto</h1>
    <div style="text-align: left; margin-top: 25px; color: rgba(255,255,255,0.8); line-height: 1.6;">
      <p><strong>Nombre:</strong> ${fullName}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Mensaje:</strong></p>
      <div style="background-color: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; border-left: 4px solid #d658fa;">
        ${message}
      </div>
    </div>
  `;
  return {
    subject: `Nuevo mensaje de contacto: ${fullName}`,
    html: _getHtmlWrapper(content)
  };
};

module.exports = {
  getWelcomeEmail,
  getDigitalDeliveryEmail,
  getPasswordResetEmail,
  getContactNotificationEmail
};

