const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrder,
  getUserOrders,
  getAllOrders,
  updateOrderStatus,
  updateOrderToPaid
} = require('../controllers/orderController');
const { protect, authorize } = require('../middlewares/auth');

/**
 * Capa de Enrutamiento: Ciclo de Vida de Órdenes y Pagos (Orders)
 * --------------------------------------------------------------------------
 * Orquesta el flujo transaccional de la plataforma.
 * Implementa un modelo de seguridad mixto: privado para gestión de usuario/vendedor. (MVC / Router)
 */

// ─── RUTAS DE USUARIO (PROTEGIDAS) ───

/** @route POST /api/orders - Iniciación de compra y reserva de stock. */
router.post('/', protect, createOrder);

/** @route GET /api/orders/user - Historial de adquisiciones del usuario en sesión. */
router.get('/user', protect, getUserOrders);

/** @route GET /api/orders/:id - Detalle extendido de una orden específica (incluye claves si aplica). */
router.get('/:id', protect, getOrder);


// ─── GESTIÓN ADMINISTRATIVA (RESTRICTED) ───

/** @route GET /api/orders - Panel de control masivo de transacciones. */
router.get('/', protect, authorize('admin'), getAllOrders);

/** @route PUT /api/orders/:id/pay - Forzado manual de estado 'Pagado' (Auditoría). */
router.put('/:id/pay', protect, authorize('admin'), updateOrderToPaid);

/** @route PATCH /api/orders/:id/status - Mutación de estados logísticos (Processing/Delivered). */
router.patch('/:id/status', protect, authorize('admin'), updateOrderStatus);

module.exports = router;
