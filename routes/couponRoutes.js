const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const couponController = require('../controllers/couponController');

/**
 * Capa de Enrutamiento: Gestión de Centros de Beneficios (Coupons)
 * --------------------------------------------------------------------------
 * Expone la lógica de descuentos corporativos. Organiza el acceso mediante
 * un modelo piramidal de permisos. (MVC / Router)
 */

// ─── RUTAS ADMINISTRATIVAS (PRIVILEGED) ───
// Requieren rol 'admin' para la manipulación del catálogo de vouchers.

/** @route POST /api/coupons - Registro de nueva campaña promocional. */
router.post('/', protect, authorize('admin'), couponController.createCoupon);

/** @route GET /api/coupons - Auditoría completa de cupones emitidos. */
router.get('/', protect, authorize('admin'), couponController.getCoupons);

/** @route DELETE /api/coupons/:id - Revocación física de un código de descuento. */
router.delete('/:id', protect, authorize('admin'), couponController.deleteCoupon);


// ─── RUTAS PÚBLICAS (CHECKOUT READY) ───

/** 
 * @route GET /api/coupons/validate/:code 
 * RN - Validación: Permite al cliente final consultar la vigencia y aplicabilidad
 * de un código antes de concretar la orden sin necesidad de Login previo (Conversion Heat).
 */
router.get('/validate/:code', couponController.validateCoupon);

module.exports = router;
