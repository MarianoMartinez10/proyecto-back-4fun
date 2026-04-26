/**
 * Capa de Servicios: Facturación y Órdenes Core (G2A Style)
 * --------------------------------------------------------------------------
 */

const prisma = require('../lib/prisma');
const EmailService = require('./emailService');
const { DEFAULT_IMAGE } = require('../utils/constants');
const logger = require('../utils/logger');
const ErrorResponse = require('../utils/errorResponse');

class OrderService {

    async createOrder({ user, orderItems, shippingAddress, paymentMethod }) {
        if (!orderItems?.length) throw new ErrorResponse('El carrito está vacío.', 400);

        const backendUrl = process.env.BACKEND_URL;
        if (!backendUrl) throw new ErrorResponse('BACKEND_URL no está configurado.', 500);

        let calculatedTotal = 0;
        const validatedItems = [];

        for (const item of orderItems) {
            const offer = await prisma.productOffer.findUnique({ 
                where: { id: item.offerId },
                include: { product: true }
            });
            if (!offer) throw new ErrorResponse(`Oferta no encontrada`, 400);

            const product = offer.product;

            if (product.tipo === 'Digital') {
                const availableKeys = await prisma.digitalKey.count({
                    where: { offerId: item.offerId, estado: 'DISPONIBLE' }
                });
                if (availableKeys < item.quantity) {
                    throw new ErrorResponse(`Stock insuficiente de keys para la oferta de: ${product.nombre}`, 400);
                }
            } else {
                if (offer.stock < item.quantity) throw new ErrorResponse(`Stock insuficiente para la oferta de: ${product.nombre}`, 400);
            }

            calculatedTotal += Number(offer.precio) * item.quantity;
            validatedItems.push({
                offerId: offer.id,
                productId: product.id,
                title: product.nombre,
                quantity: Number(item.quantity),
                unit_price: Number(offer.precio), 
                currency_id: 'ARS',
                picture_url: product.imagenUrl || undefined,
                description: product.descripcion?.substring(0, 200) || '',
                tipo: product.tipo
            });
        }

        for (const item of validatedItems) {
            if (item.tipo !== 'Digital') {
                const updated = await prisma.productOffer.updateMany({
                    where: { id: item.offerId, stock: { gte: item.quantity } },
                    data: { stock: { decrement: item.quantity } }
                });
                if (updated.count === 0) {
                    // Compensatory Action
                    for (const prev of validatedItems) {
                        if (prev.offerId === item.offerId) break;
                        await prisma.productOffer.update({ where: { id: prev.offerId }, data: { stock: { increment: prev.quantity } } });
                    }
                    throw new ErrorResponse(`Stock agotado para la oferta de: ${item.title}.`, 409);
                }
                
                await prisma.product.update({
                    where: { id: item.productId },
                    data: { cantidadVendida: { increment: item.quantity } }
                });
            }
        }

        const order = await prisma.order.create({
            data: {
                userId: user.id || user._id?.toString() || user,
                paymentMethod: paymentMethod || 'mercadopago',
                itemsPrice: calculatedTotal,
                shippingPrice: 0,
                totalPrice: calculatedTotal,
                orderStatus: 'pending',
                isPaid: false,
                shippingAddress: shippingAddress ? { create: shippingAddress } : undefined,
                orderItems: {
                    create: validatedItems.map(i => ({
                        offerId: i.offerId,
                        quantity: i.quantity,
                        unitPriceAtPurchase: i.unit_price
                    }))
                }
            }
        });

        logger.info(`Orden ${order.id} creada exitosamente (Pendiente de pago).`);
        return { 
            orderId: order.id, 
            paymentLink: 'https://link.mercadopago.com.ar/4funstore', 
            order: { ...order, _id: order.id } 
        };
    }

    async getUserOrders(userId, { page = 1, limit = 5 } = {}) {
        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                include: { 
                    orderItems: { include: { offer: { include: { product: true } } } }, 
                    shippingAddress: true, 
                    digitalKeys: { select: { id: true, clave: true, offerId: true } } 
                },
                skip: (pageNum - 1) * limitNum,
                take: limitNum
            }),
            prisma.order.count({ where: { userId } })
        ]);

        return {
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum),
            orders: orders.map(o => ({
                ...o,
                _id: o.id,
                orderItems: (o.orderItems || []).map(i => ({ 
                    ...i, 
                    _id: i.id, 
                    price: Number(i.unitPriceAtPurchase), 
                    name: i.offer?.product?.nombre || 'Oferta Desconocida', 
                    image: i.offer?.product?.imagenUrl || DEFAULT_IMAGE 
                }))
            }))
        };
    }

    async getOrderById(orderId, userId, userRole) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { 
                user: { select: { id: true, name: true, email: true } }, 
                orderItems: { include: { offer: { include: { product: true } } } }, 
                shippingAddress: true 
            }
        });
        
        if (!order) throw new ErrorResponse('Orden no encontrada', 404);
        
        if (order.userId !== userId && userRole !== 'admin') throw new ErrorResponse('No autorizado para ver esta orden', 403);
        
        return { 
            ...order, 
            _id: order.id,
            orderItems: (order.orderItems || []).map(i => ({ 
                ...i, 
                _id: i.id, 
                price: Number(i.unitPriceAtPurchase), 
                name: i.offer?.product?.nombre || 'Oferta Desconocida', 
                image: i.offer?.product?.imagenUrl || DEFAULT_IMAGE 
            }))
        };
    }

    async getAllOrders({ page = 1, limit = 10, status, userId } = {}) {
        const where = {};
        if (status) where.orderStatus = status;
        if (userId) where.userId = userId;

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: {
                    user: { select: { id: true, name: true, email: true } },
                    orderItems: { include: { offer: { include: { product: true } } } },
                    shippingAddress: true
                },
                orderBy: { createdAt: 'desc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum
            }),
            prisma.order.count({ where })
        ]);

        return {
            count: orders.length,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum),
            orders: orders.map(o => ({ 
                ...o, 
                _id: o.id,
                orderItems: (o.orderItems || []).map(i => ({ 
                    ...i, 
                    _id: i.id, 
                    price: Number(i.unitPriceAtPurchase), 
                    name: i.offer?.product?.nombre || 'Oferta Desconocida', 
                    image: i.offer?.product?.imagenUrl || DEFAULT_IMAGE 
                }))
            }))
        };
    }

    async updateOrderStatus(orderId, status) {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new ErrorResponse('Orden no encontrada', 404);
        
        const updated = await prisma.order.update({ where: { id: orderId }, data: { orderStatus: status } });
        return { ...updated, _id: updated.id };
    }

    async updateOrderToPaid(orderId) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                user: { select: { id: true, name: true, email: true } },
                orderItems: { include: { offer: { include: { product: true } } } },
                digitalKeys: { select: { id: true, clave: true, offerId: true } }
            }
        });

        if (!order) throw new ErrorResponse('Orden no encontrada', 404);

        const now = new Date();

        const paymentResult = await prisma.$transaction(async (tx) => {
            let assignedKeysCount = 0;

            await tx.order.update({
                where: { id: orderId },
                data: {
                    isPaid: true,
                    paidAt: order.paidAt || now
                }
            });

            for (const item of order.orderItems || []) {
                if (item.offer?.product?.tipo !== 'Digital') continue;

                const alreadyAssigned = await tx.digitalKey.count({
                    where: { orderId, offerId: item.offerId }
                });

                const missingKeys = Math.max(0, Number(item.quantity) - alreadyAssigned);
                if (missingKeys === 0) continue;

                const availableKeys = await tx.digitalKey.findMany({
                    where: {
                        offerId: item.offerId,
                        estado: 'DISPONIBLE',
                        orderId: null,
                        activo: true,
                    },
                    orderBy: { createdAt: 'asc' },
                    take: missingKeys,
                    select: { id: true }
                });

                if (availableKeys.length < missingKeys) {
                    throw new ErrorResponse(`No hay keys suficientes en esta oferta para ${item.offer?.product?.nombre}`, 409);
                }

                const keyIds = availableKeys.map(k => k.id);
                const updatedKeys = await tx.digitalKey.updateMany({
                    where: {
                        id: { in: keyIds },
                        estado: 'DISPONIBLE',
                        orderId: null,
                    },
                    data: {
                        estado: 'VENDIDA',
                        orderId,
                        fechaVenta: now
                    }
                });

                assignedKeysCount += updatedKeys.count;
            }

            const paidOrder = await tx.order.findUnique({
                where: { id: orderId },
                include: {
                    user: { select: { id: true, name: true, email: true } },
                    orderItems: { include: { offer: { include: { product: true } } } },
                    digitalKeys: { select: { id: true, clave: true, offerId: true } }
                }
            });

            // RN (Sistema de Escrow Multi-Vendedor): 
            // Agrupar los items por vendedor y crear una transacción para cada uno.
            if (paidOrder && paidOrder.orderItems?.length > 0) {
                const sellerTotals = {};

                for (const item of paidOrder.orderItems) {
                    const sellerId = item.offer?.sellerId;
                    if (!sellerId) continue;

                    const itemTotal = Number(item.unitPriceAtPurchase) * Number(item.quantity);
                    if (!sellerTotals[sellerId]) {
                        sellerTotals[sellerId] = 0;
                    }
                    sellerTotals[sellerId] += itemTotal;
                }

                for (const [sellerId, amount] of Object.entries(sellerTotals)) {
                    await tx.transaction.create({
                        data: {
                            orderId: paidOrder.id,
                            sellerId,
                            amount,
                            status: 'PENDING_APPROVAL'
                        }
                    });

                    logger.info(`[OrderService] Transacción de escrow creada para orden ${paidOrder.id} - Vendedor: ${sellerId} - Monto: $${amount}`);
                }
            }

            return { paidOrder, assignedKeysCount };
        });

        const paidOrder = paymentResult?.paidOrder;
        const shouldSendKeysEmail = !order.isPaid || (paymentResult?.assignedKeysCount || 0) > 0;

        if (shouldSendKeysEmail && paidOrder?.user?.email && (paidOrder.digitalKeys?.length || 0) > 0) {
            try {
                const emailResult = await EmailService.sendDigitalProductDelivery(
                    paidOrder.user,
                    { ...paidOrder, _id: paidOrder.id },
                    paidOrder.digitalKeys
                );

                if (!emailResult?.success) {
                    logger.warn('[OrderService] Orden pagada pero el envio de email falló');
                }
            } catch (emailError) {
                logger.error('[OrderService] Error enviando keys por email');
            }
        }

        return {
            ...(paidOrder || order),
            _id: (paidOrder || order).id
        };
    }
}

module.exports = new OrderService();
