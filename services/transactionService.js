/**
 * Capa de Servicios: Sistema de Escrow (Retención de Fondos)
 * --------------------------------------------------------------------------
 * Gestiona el flujo financiero de transacciones cuando se completa una venta.
 * 
 * Reglas de Negocio:
 * 1. Cuando una orden se paga, el dinero queda en PENDING_APPROVAL (retenido)
 * 2. El Admin debe revisar y aprobar la transacción
 * 3. Solo al aprobar, el dinero entra al balance del vendedor
 * 4. El Admin puede rechazar transacciones con motivo
 * 
 * Aplicación: Prevención de fraude, validación de calidad, dispute resolution.
 */

const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

class TransactionService {

    /**
     * Crea una transacción en estado PENDING_APPROVAL cuando una orden se completa exitosamente.
     * 
     * RN (Escrow): El dinero está congelado hasta aprobación del admin.
     * 
     * @param {string} orderId - ID de la orden completada
     * @param {number} amount - Monto a retener
     * @param {string} sellerId - ID del vendedor que vende
     * @returns {Object} Transacción creada
     */
    async createPendingTransaction(orderId, amount, sellerId) {
        if (!orderId || !sellerId) {
            throw new ErrorResponse('orderId y sellerId requeridos', 400);
        }

        if (typeof amount !== 'number' || amount <= 0) {
            throw new ErrorResponse('Amount debe ser un número positivo', 400);
        }

        // Validación: Previene duplicados (una orden = una transacción)
        const existing = await prisma.transaction.findUnique({
            where: { orderId }
        });

        if (existing) {
            logger.warn(`[Transaction] Transacción ya existe para orden ${orderId}`);
            return existing;
        }

        // Validación: Orden existe
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true, totalPrice: true, userId: true }
        });

        if (!order) {
            throw new ErrorResponse('Orden no encontrada', 404);
        }

        // Crear transacción en estado PENDING_APPROVAL
        const transaction = await prisma.transaction.create({
            data: {
                orderId,
                sellerId,
                amount,
                status: 'PENDING_APPROVAL',
                createdAt: new Date()
            },
            include: {
                seller: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                order: {
                    select: {
                        id: true,
                        totalPrice: true
                    }
                }
            }
        });

        logger.info(`[Transaction] Transacción creada: ${transaction.id} - Orden: ${orderId} - Amount: $${amount} - Status: PENDING_APPROVAL`);

        return transaction;
    }

    /**
     * Admin aprueba una transacción → Dinero liberado al vendedor.
     * 
     * RN (Liberación de Fondos): 
     * - Cambiar status → FUNDS_RELEASED
     * - Registrar admin aprobador y timestamp
     * - Dinero entra al balance del vendedor (operación contable posterior)
     * 
     * @param {string} transactionId - ID de transacción a aprobar
     * @param {string} adminId - ID del admin que aprueba
     * @returns {Object} Transacción aprobada
     */
    async approveFundsTransfer(transactionId, adminId) {
        if (!transactionId || !adminId) {
            throw new ErrorResponse('transactionId y adminId requeridos', 400);
        }

        // Validación: Transacción existe
        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
            include: {
                order: true,
                seller: { select: { id: true, name: true, email: true } },
                approvalAdmin: { select: { id: true, name: true } }
            }
        });

        if (!transaction) {
            throw new ErrorResponse('Transacción no encontrada', 404);
        }

        // Validación: Solo se pueden aprobar transacciones pendientes
        if (transaction.status !== 'PENDING_APPROVAL') {
            throw new ErrorResponse(
                `No se puede aprobar transacción con estado: ${transaction.status}. Solo PENDING_APPROVAL puede ser aprobado.`,
                400
            );
        }

        // RN - Ventana de Disputa: El dinero solo puede liberarse tras X días de la compra.
        // Esto permite al comprador reportar problemas con las keys antes de que el vendedor reciba el dinero.
        const disputeWindowDays = process.env.DISPUTE_WINDOW_DAYS || 7;
        const paidAt = transaction.order.paidAt;
        if (!paidAt) throw new ErrorResponse('La orden asociada no registra fecha de pago.', 400);
        
        const releaseAvailableAt = new Date(paidAt);
        releaseAvailableAt.setDate(releaseAvailableAt.getDate() + Number(disputeWindowDays));
        
        if (new Date() < releaseAvailableAt) {
            throw new ErrorResponse(`Ventana de disputa activa. Los fondos podrán liberarse a partir del ${releaseAvailableAt.toLocaleDateString()}.`, 403);
        }

        // RN - Doble Validación de Monto: El monto de la transacción debe coincidir 
        // exactamente con la sumatoria de unitPriceAtPurchase de los items.
        const orderItems = await prisma.orderItem.findMany({ where: { orderId: transaction.orderId } });
        const calculatedTotal = orderItems.reduce((acc, item) => acc + (Number(item.unitPriceAtPurchase) * item.quantity), 0);
        
        // Tolerancia de 0.01 por redondeos de Decimal en DB
        if (Math.abs(calculatedTotal - Number(transaction.amount)) > 0.01) {
            logger.error(`[Transaction Audit] Inconsistencia financiera en Transacción ${transactionId}. Esperado: ${calculatedTotal}, Encontrado: ${transaction.amount}`);
            throw new ErrorResponse(`Inconsistencia financiera detectada. El monto de la transacción no coincide con el total calculado de los productos.`, 400);
        }

        // Actualizar transacción a FUNDS_RELEASED
        const now = new Date();
        const approvedTransaction = await prisma.transaction.update({
            where: { id: transactionId },
            data: {
                status: 'FUNDS_RELEASED',
                approvedBy: adminId,
                approvedAt: now
            },
            include: {
                seller: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                order: {
                    select: {
                        id: true,
                        totalPrice: true
                    }
                },
                approvalAdmin: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        logger.info(
            `[Transaction] Transacción aprobada: ${transactionId} - Vendedor: ${transaction.seller.name} - Monto: $${transaction.amount} - Admin: ${adminId} - Timestamp: ${now.toISOString()}`
        );

        return approvedTransaction;
    }

    /**
     * Admin rechaza una transacción → Dinero devuelto al cliente.
     * 
     * RN (Rechazo):
     * - Cambiar status → REJECTED
     * - Guardar motivo del rechazo para auditoría
     * - Sistema notifica al cliente para reembolso
     * 
     * @param {string} transactionId - ID de transacción a rechazar
     * @param {string} adminId - ID del admin que rechaza
     * @param {string} reason - Motivo del rechazo (requerido)
     * @returns {Object} Transacción rechazada
     */
    async rejectFundsTransfer(transactionId, adminId, reason) {
        if (!transactionId || !adminId || !reason) {
            throw new ErrorResponse('transactionId, adminId y reason requeridos', 400);
        }

        if (typeof reason !== 'string' || reason.trim().length === 0) {
            throw new ErrorResponse('El motivo del rechazo debe ser una cadena no vacía', 400);
        }

        // Validación: Transacción existe
        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
            include: {
                seller: { select: { id: true, name: true, email: true } }
            }
        });

        if (!transaction) {
            throw new ErrorResponse('Transacción no encontrada', 404);
        }

        // Validación: Solo se pueden rechazar transacciones pendientes
        if (transaction.status !== 'PENDING_APPROVAL') {
            throw new ErrorResponse(
                `No se puede rechazar transacción con estado: ${transaction.status}. Solo PENDING_APPROVAL puede ser rechazado.`,
                400
            );
        }

        // Actualizar transacción a REJECTED
        const now = new Date();
        const rejectedTransaction = await prisma.transaction.update({
            where: { id: transactionId },
            data: {
                status: 'REJECTED',
                approvedBy: adminId,
                approvedAt: now,
                rejectionReason: reason
            },
            include: {
                seller: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                order: {
                    select: {
                        id: true,
                        totalPrice: true
                    }
                }
            }
        });

        logger.warn(
            `[Transaction] Transacción rechazada: ${transactionId} - Vendedor: ${transaction.seller.name} - Monto: $${transaction.amount} - Admin: ${adminId} - Motivo: ${reason}`
        );

        return rejectedTransaction;
    }

    /**
     * Obtiene todas las transacciones pendientes de aprobación (para dashboard admin).
     * 
     * @param {Object} options - { page, limit, sellerId }
     * @returns {Object} Transacciones paginadas
     */
    async getPendingTransactions({ page = 1, limit = 10, sellerId } = {}) {
        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));

        const where = { status: 'PENDING_APPROVAL' };
        if (sellerId) where.sellerId = sellerId;

        const [transactions, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                include: {
                    seller: { select: { id: true, name: true, email: true } },
                    order: { select: { id: true, totalPrice: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum
            }),
            prisma.transaction.count({ where })
        ]);

        return {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            transactions: transactions.map(t => ({
                ...t,
                _id: t.id,
                amount: Number(t.amount)
            }))
        };
    }

    /**
     * Obtiene el balance en escrow (dinero pendiente) de un vendedor.
     * 
     * @param {string} sellerId - ID del vendedor
     * @returns {Object} { totalEscrow, totalReleased, pendingCount }
     */
    async getSellerEscrowBalance(sellerId) {
        if (!sellerId) {
            throw new ErrorResponse('sellerId requerido', 400);
        }

        const [escrowData, releaseData, pendingCount] = await Promise.all([
            prisma.transaction.aggregate({
                where: {
                    sellerId,
                    status: 'PENDING_APPROVAL'
                },
                _sum: { amount: true },
                _count: true
            }),
            prisma.transaction.aggregate({
                where: {
                    sellerId,
                    status: 'FUNDS_RELEASED'
                },
                _sum: { amount: true }
            }),
            prisma.transaction.count({
                where: {
                    sellerId,
                    status: 'PENDING_APPROVAL'
                }
            })
        ]);

        const totalEscrow = Number(escrowData._sum.amount || 0);
        const totalReleased = Number(releaseData._sum.amount || 0);

        return {
            totalEscrow,          // Dinero en espera de aprobación
            totalReleased,        // Dinero ya liberado
            pendingCount,         // Cuántas transacciones pendientes
            totalBalance: totalEscrow + totalReleased
        };
    }

    /**
     * Obtiene transacciones de un vendedor específico (para su dashboard).
     * 
     * @param {string} sellerId - ID del vendedor
     * @param {Object} options - { page, limit, status }
     * @returns {Object} Transacciones paginadas
     */
    async getSellerTransactions(sellerId, { page = 1, limit = 10, status } = {}) {
        if (!sellerId) {
            throw new ErrorResponse('sellerId requerido', 400);
        }

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));

        const where = { sellerId };
        if (status && ['PENDING_APPROVAL', 'FUNDS_RELEASED', 'REJECTED', 'CANCELLED'].includes(status)) {
            where.status = status;
        }

        const [transactions, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                include: {
                    order: { select: { id: true, totalPrice: true } },
                    approvalAdmin: { select: { id: true, name: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum
            }),
            prisma.transaction.count({ where })
        ]);

        return {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            transactions: transactions.map(t => ({
                ...t,
                _id: t.id,
                amount: Number(t.amount)
            }))
        };
    }

    /**
     * Obtiene el detalle completo de una transacción (para auditoría).
     * 
     * @param {string} transactionId - ID de transacción
     * @param {string} userId - ID del usuario (para validar acceso)
     * @param {string} userRole - Rol del usuario
     * @returns {Object} Detalles de la transacción
     */
    async getTransactionById(transactionId, userId, userRole) {
        if (!transactionId) {
            throw new ErrorResponse('transactionId requerido', 400);
        }

        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
            include: {
                seller: { select: { id: true, name: true, email: true } },
                order: { include: { orderItems: { include: { product: true } } } },
                approvalAdmin: { select: { id: true, name: true, email: true } }
            }
        });

        if (!transaction) {
            throw new ErrorResponse('Transacción no encontrada', 404);
        }

        // Validación: Solo seller, admin o el usuario que compró pueden ver
        const canView =
            userRole === 'ADMIN' ||
            transaction.sellerId === userId ||
            transaction.order?.userId === userId;

        if (!canView) {
            throw new ErrorResponse('No autorizado para ver esta transacción', 403);
        }

        return {
            ...transaction,
            _id: transaction.id,
            amount: Number(transaction.amount)
        };
    }

    /**
     * Obtiene estadísticas financieras para dashboard admin.
     * 
     * @returns {Object} { totalEscrow, totalApproved, pendingCount, rejectedCount }
     */
    async getFinancialStats() {
        const [escrowStats, approvedStats, pendingStats, rejectedStats] = await Promise.all([
            prisma.transaction.aggregate({
                where: { status: 'PENDING_APPROVAL' },
                _sum: { amount: true },
                _count: true
            }),
            prisma.transaction.aggregate({
                where: { status: 'FUNDS_RELEASED' },
                _sum: { amount: true },
                _count: true
            }),
            prisma.transaction.count({ where: { status: 'PENDING_APPROVAL' } }),
            prisma.transaction.count({ where: { status: 'REJECTED' } })
        ]);

        return {
            totalEscrow: Number(escrowStats._sum.amount || 0),
            pendingTransactionCount: pendingStats,
            totalApproved: Number(approvedStats._sum.amount || 0),
            approvedTransactionCount: approvedStats._count,
            rejectedCount: rejectedStats
        };
    }
}

module.exports = new TransactionService();
