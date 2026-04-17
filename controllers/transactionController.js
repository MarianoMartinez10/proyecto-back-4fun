/**
 * Capa de Controladores: Transacciones y Escrow
 * --------------------------------------------------------------------------
 * Maneja endpoints HTTP para gestión de transacciones de escrow.
 * - Admins: Pueden aprobar/rechazar y ver estadísticas
 * - Sellers: Pueden ver sus transacciones pendientes
 * - Usuarios: Pueden ver detalles de sus transacciones
 */

const TransactionService = require('../services/transactionService');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');

/**
 * [ADMIN ONLY] Obtiene todas las transacciones pendientes de aprobación.
 * Útil para dashboard admin con lista de aprobaciones pendientes.
 */
exports.getPendingTransactions = asyncHandler(async (req, res, next) => {
    const { page, limit } = req.query;

    const result = await TransactionService.getPendingTransactions({
        page,
        limit
    });

    res.status(200).json({
        success: true,
        ...result
    });
});

/**
 * [ADMIN ONLY] Aprueba una transacción → Libera fondos al vendedor.
 */
exports.approveFundsTransfer = asyncHandler(async (req, res, next) => {
    const { transactionId } = req.params;

    const transaction = await TransactionService.approveFundsTransfer(transactionId, req.user.id);

    res.status(200).json({
        success: true,
        message: 'Transacción aprobada exitosamente',
        data: transaction
    });
});

/**
 * [ADMIN ONLY] Rechaza una transacción → Devuelve fondos al cliente.
 */
exports.rejectFundsTransfer = asyncHandler(async (req, res, next) => {
    const { transactionId } = req.params;
    const { reason } = req.body;

    if (!reason) {
        throw new ErrorResponse('El motivo del rechazo es requerido', 400);
    }

    const transaction = await TransactionService.rejectFundsTransfer(transactionId, req.user.id, reason);

    res.status(200).json({
        success: true,
        message: 'Transacción rechazada',
        data: transaction
    });
});

/**
 * [SELLER ONLY] Obtiene balance en escrow (dinero pendiente de aprobación).
 */
exports.getEscrowBalance = asyncHandler(async (req, res, next) => {
    const balance = await TransactionService.getSellerEscrowBalance(req.user.id);

    res.status(200).json({
        success: true,
        data: balance
    });
});

/**
 * [SELLER ONLY] Obtiene transacciones del vendedor autenticado.
 */
exports.getSellerTransactions = asyncHandler(async (req, res, next) => {
    const { page, limit, status } = req.query;

    const result = await TransactionService.getSellerTransactions(req.user.id, {
        page,
        limit,
        status
    });

    res.status(200).json({
        success: true,
        ...result
    });
});

/**
 * [ADMIN/SELLER/BUYER] Obtiene detalles de una transacción específica.
 * Validación: Solo admin, seller o el cliente que compró pueden verla.
 */
exports.getTransactionById = asyncHandler(async (req, res, next) => {
    const { transactionId } = req.params;

    const transaction = await TransactionService.getTransactionById(transactionId, req.user.id, req.user.role);

    res.status(200).json({
        success: true,
        data: transaction
    });
});

/**
 * [ADMIN ONLY] Obtiene estadísticas financieras globales.
 * Útil para dashboard administrativo de control financiero.
 */
exports.getFinancialStats = asyncHandler(async (req, res, next) => {
    const stats = await TransactionService.getFinancialStats();

    res.status(200).json({
        success: true,
        data: stats
    });
});
