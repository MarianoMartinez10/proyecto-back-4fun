const OrderService = require('../services/orderService');
const logger = require('../utils/logger');

// Crear orden
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
  } catch (error) { next(error); }
};

// Webhook
exports.receiveWebhook = async (req, res) => {
  try {
    await OrderService.handleWebhook(req.headers, req.body, req.query);
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Webhook Error:', error.message);
    // 400 para que Mercado Pago no reintente si falta ID o pago no encontrado
    if (error.message === 'Missing payment ID' || error.message === 'Pago no encontrado') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
};

// Puente de Redirección (Ngrok -> Localhost)
exports.paymentFeedback = (req, res) => {
  const { status, payment_id, external_reference } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:9002';

  let redirectPath = '/checkout/pending';
  if (status === 'approved') redirectPath = '/checkout/success';
  else if (status === 'failure' || status === 'rejected') redirectPath = '/checkout/failure';

  const destination = new URL(`${frontendUrl}${redirectPath}`);
  if (payment_id) destination.searchParams.append('payment_id', payment_id);
  if (external_reference) destination.searchParams.append('external_reference', external_reference);

  logger.info(`🔀 Redirigiendo usuario (Puente) a: ${destination.toString()}`);
  res.redirect(destination.toString());
};

// Obtener órdenes del usuario logueado
exports.getUserOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const enrichedOrders = await OrderService.getUserOrders(userId);
    res.json({ success: true, count: enrichedOrders.length, orders: enrichedOrders });
  } catch (error) { next(error); }
};

exports.getOrder = async (req, res, next) => {
  try {
    const order = await OrderService.getOrderById(req.params.id, req.user.id, req.user.role);
    res.json({ success: true, order });
  } catch (error) { next(error); }
};

// Listar todas las órdenes (Admin)
exports.getAllOrders = async (req, res, next) => {
  try {
    const result = await OrderService.getAllOrders(req.query);
    res.json({
      success: true,
      ...result
    });
  } catch (error) { next(error); }
};

exports.updateOrderStatus = async (req, res, next) => {
  try {
    const order = await OrderService.updateOrderStatus(req.params.id, req.body.status);
    res.json({ success: true, order });
  } catch (error) { next(error); }
};

exports.updateOrderToPaid = async (req, res, next) => {
  try {
    const order = await OrderService.updateOrderToPaid(req.params.id);
    res.json({ success: true, order });
  } catch (error) { next(error); }
};
