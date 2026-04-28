const express = require('express');
const router = express.Router();
const {
    getPendingTransactions,
    approveFundsTransfer,
    rejectFundsTransfer,
    getEscrowBalance,
    getSellerTransactions,
    getTransactionById,
    getFinancialStats
} = require('../controllers/transactionController');
const { protect, authorize } = require('../middlewares/auth');

/**
 * Capa de Enrutamiento: Transacciones y Sistema de Escrow
 * --------------------------------------------------------------------------
 * Gestiona todos los endpoints relacionados con retención de fondos y aprobaciones.
 */

// ─── ADMIN ONLY ───

/**
 * @route GET /api/transactions/admin/pending
 * @description Obtiene transacciones pendientes de aprobación
 * @access Admin Only
 */
router.get('/admin/pending', protect, authorize('ADMIN'), getPendingTransactions);

/**
 * @route POST /api/transactions/:transactionId/approve
 * @description Admin aprueba una transacción (libera fondos)
 * @access Admin Only
 */
router.post('/:transactionId/approve', protect, authorize('ADMIN'), approveFundsTransfer);

/**
 * @route POST /api/transactions/:transactionId/reject
 * @description Admin rechaza una transacción (devuelve fondos)
 * @access Admin Only
 */
router.post('/:transactionId/reject', protect, authorize('ADMIN'), rejectFundsTransfer);

/**
 * @route GET /api/transactions/admin/stats
 * @description Obtiene estadísticas financieras globales
 * @access Admin Only
 */
router.get('/admin/stats', protect, authorize('ADMIN'), getFinancialStats);

// ─── SELLER ONLY ───

/**
 * @route GET /api/transactions/seller/escrow
 * @description Obtiene balance en escrow del vendedor
 * @access Seller Only
 */
router.get('/seller/escrow', protect, authorize('SELLER'), getEscrowBalance);

/**
 * @route GET /api/transactions/seller/list
 * @description Obtiene transacciones del vendedor autenticado
 * @access Seller Only
 */
router.get('/seller/list', protect, authorize('SELLER'), getSellerTransactions);

// ─── PUBLIC (con validación de acceso) ───

/**
 * @route GET /api/transactions/:transactionId
 * @description Obtiene detalles de una transacción
 * @access Admin, Seller de la transacción, Cliente que compró
 */
router.get('/:transactionId', protect, getTransactionById);

module.exports = router;
