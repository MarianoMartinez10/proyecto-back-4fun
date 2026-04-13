/**
 * Capa de Servicios: Integración Externa y Checkout (MercadoPago)
 * --------------------------------------------------------------------------
 * Gestiona el marco de seguridad y la creación de boletas cifradas (Preferences)
 * aisladas bajo el Standard SDK de MercadoPago para cumplimiento técnico.
 */

const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const crypto = require('crypto');
const logger = require('../utils/logger');

class MercadoPagoService {
  constructor() {
    this._client = null;
    this._env = null;
  }

  get env() {
    if (!this._env) this._env = process.env.MERCADOPAGO_ENV === 'production' ? 'production' : 'sandbox';
    return this._env;
  }

  get isSandbox() { return this.env === 'sandbox'; }

  /**
   * Inicializa la factoría de clientes HTTP sobre el SDK de MercadoPago.
   * RN (Entornos Dicotómicos): Separa contablemente las credenciales de caja de arena y entorno vivo.
   * @throws {Error} Excepción fatal si faltan variables obligatorias de entorno.
   */
  getClient() {
    if (!this._client) {
      const token = this.isSandbox
        ? (process.env.MERCADOPAGO_SANDBOX_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN)
        : process.env.MERCADOPAGO_ACCESS_TOKEN;

      if (!token) {
        throw new Error(`Token MP ausente. Configurar ${this.isSandbox ? 'SANDBOX' : 'ACCESS'}_TOKEN en .env`);
      }

      this._client = new MercadoPagoConfig({ accessToken: token, options: { timeout: 5000 } });
      logger.info(`MercadoPago inicializado en modo: ${this.env}`);
    }
    return this._client;
  }

  /**
   * Instancia una intención de cobro formal hacia los servidores de MP.
   * 
   * @param {string} orderId - Primary Key del tracking system local.
   * @param {Array} items - Arreglo normalizado al Schema de MP.
   * @param {string} backendUrl - FQDN donde retornarán los webhooks.
   * @param {Object} user - Biometría del pagador.
   * @returns {Object} { id, paymentLink }
   */
  async createPreference(orderId, items, backendUrl, user) {
    const client = this.getClient();
    const preferenceApi = new Preference(client);

    const response = await preferenceApi.create({
      body: {
        items,
        payer: {
          name: user?.name || 'Invitado',
          // RN (Mitigación De Fraudes): Fuerza un email dummy si está ausente para evitar fallos de render en el Checkout Pro.
          email: user?.email || 'test_user_guest@testuser.com' 
        },
        back_urls: {
          success: `${backendUrl}/api/orders/feedback?status=approved`,
          failure: `${backendUrl}/api/orders/feedback?status=failure`,
          pending: `${backendUrl}/api/orders/feedback?status=pending`
        },
        auto_return: 'approved',
        external_reference: orderId,
        statement_descriptor: '4FUN',
        notification_url: `${backendUrl}/api/orders/webhook`,
        expires: true,
        expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }
    });

    const paymentLink = this.isSandbox ? response.sandbox_init_point : response.init_point;
    return { id: response.id, paymentLink };
  }

  async getPayment(paymentId) {
    const client = this.getClient();
    const paymentApi = new Payment(client);
    return paymentApi.get({ id: paymentId });
  }

  /**
   * RN (Estándar de Seguridad Hacking): Valida la asimetría criptográfica HMAC-SHA256 
   * del webhook saliente para evitar que usuarios malintencionados emulen callbacks 
   * de "pago exitoso" usando Postman o cURL.
   */
  validateWebhookSignature(headers, dataId) {
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    const xSignature = headers['x-signature'];

    if (!xSignature || !secret) {
      if (!this.isSandbox && secret) throw new Error('Firma ausente. Rechazado por seguridad.');
      return;
    }

    let ts, receivedHash;
    xSignature.split(',').forEach(part => {
      const [key, value] = part.trim().split('=');
      if (key === 'ts') ts = value;
      if (key === 'v1') receivedHash = value;
    });

    if (!ts || !receivedHash) {
      if (!this.isSandbox) throw new Error('Firma webhook malformada.');
      return;
    }

    const requestId = headers['x-request-id'] || '';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expectedHash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    if (receivedHash !== expectedHash) {
      if (!this.isSandbox) throw new Error('Fallo de integridad HMAC. Posible envenenamiento de petición.');
      logger.warn('Firma de webhook inválida (Ignorado en sandbox)');
    }
  }
}

module.exports = new MercadoPagoService();
