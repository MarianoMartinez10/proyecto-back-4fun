/**
 * Capa de Controladores: Órdenes y Pasarela de Pagos
 * --------------------------------------------------------------------------
 * Intersección de la Lógica de Negocio Financiera. Los eventos aquí detonan
 * flujos críticos (Cobro, Webhooks, Stock) delegados minuciosamente a `OrderService`.
 */

const OrderService = require('../services/orderService');
const logger = require('../utils/logger');

/**
 * Inicializa el embudo de cobro construyendo la pre-orden y despachando al proveedor (MercadoPago).
 * @param {Object} req - Body esperando el payload transaccional del carrito.
 * @param {Object} res - JSON conteniendo el ticket interno y URL de redirección.
 * @param {Function} next - Manejador de falencias.
 */
exports.createOrder = async (req, res, next) => {
  try {
    const result = await OrderService.createOrder({
      user: req.user,
      ...req.body
    });
    res.status(201).json({
      success: true,
      order: result.order,
      paymentLink: result.paymentLink
    });
  } catch (error) { next(error); } // Excepciones (ej: Carrito vacío) controladas centralmente.
};

/**
 * Receptor (Listener) Asíncrono para eventos M2M de MercadoPago.
 * 
 * @param {Object} req - Webhook payload enviado desde los servidores de MP.
 * @param {Object} res - HTTP Status para responderle al bot de MP.
 */
exports.receiveWebhook = async (req, res) => {
  try {
    // MVC: Controller parsea headers de autenticación del webhook, el Servicio verifica firmas.
    await OrderService.handleWebhook(req.headers, req.body, req.query);
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Webhook Error:', error.message);
    
    // Tratamiento Específico de Excepción y Regla de Negocio (Idempotencia):
    // MercadoPago reintenta colisiones frenéticamente si devolvemos 500. 
    // Al forzar un HTTP 400 frenamos la recurrencia sobre notificaciones fantasma.
    if (error.message === 'Missing payment ID' || error.message === 'Pago no encontrado') {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
};

/**
 * Intermediario que encauza las redirecciones de éxito/falla post-pago.
 * Funciona como proxy entre el entorno Local/Vercel y el dominio del Frontend.
 */
exports.paymentFeedback = (req, res) => {
  const { status, payment_id, external_reference } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:9002';

  let redirectPath = '/checkout/pending';
  // RN Estado Frontal: Mapea dicotómicamente los estados crudos financieros a Single Page Application Routes.
  if (status === 'approved') redirectPath = '/checkout/success';
  else if (status === 'failure' || status === 'rejected') redirectPath = '/checkout/failure';

  const destination = new URL(`${frontendUrl}${redirectPath}`);
  if (payment_id) destination.searchParams.append('payment_id', payment_id);
  if (external_reference) destination.searchParams.append('external_reference', external_reference);

  logger.info(`🔀 Redirigiendo usuario (Puente) a: ${destination.toString()}`);
  res.redirect(destination.toString());
};

/**
 * Consulta de facturación histórica restringida al cliente autenticado.
 */
exports.getUserOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const enrichedOrders = await OrderService.getUserOrders(userId);
    res.json({ success: true, count: enrichedOrders.length, orders: enrichedOrders });
  } catch (error) { next(error); }
};

/**
 * Muestra el detalle contable de una orden individual basándose en roles MVC.
 */
exports.getOrder = async (req, res, next) => {
  try {
    // Pasa explícitamente el rol y propietario al servicio para ejecutar RN de Autorización Horizontal (Owning Rule).
    const order = await OrderService.getOrderById(req.params.id, req.user.id, req.user.role);
    res.json({ success: true, order });
  } catch (error) { next(error); }
};

/**
 * Recupera matriz global de la facturación para Dashboard administrativo.
 */
exports.getAllOrders = async (req, res, next) => {
  try {
    const result = await OrderService.getAllOrders(req.query);
    res.json({
      success: true,
      ...result
    });
  } catch (error) { next(error); }
};

/**
 * Modificador manual de progreso logístico o resoluciones de disputa.
 */
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const order = await OrderService.updateOrderStatus(req.params.id, req.body.status);
    res.json({ success: true, order });
  } catch (error) { next(error); }
};

/**
 * Atajo excepcional administrador para cobrar órdenes que evadieron MP 
 * o se cruzaron vía transferencia directa fuera del scope algorítmico.
 */
exports.updateOrderToPaid = async (req, res, next) => {
  try {
    const order = await OrderService.updateOrderToPaid(req.params.id);
    res.json({ success: true, order });
  } catch (error) { next(error); }
};
