const prisma = require('../lib/prisma');
const mpService = require('./mercadoPagoService');
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
            const product = await prisma.product.findUnique({ where: { id: item.product } });
            if (!product) throw new ErrorResponse(`Producto no encontrado: ${item.name}`, 400);

            if (product.tipo === 'Digital') {
                const availableKeys = await prisma.digitalKey.count({
                    where: { productId: item.product, estado: 'DISPONIBLE' }
                });
                if (availableKeys < item.quantity) {
                    throw new ErrorResponse(`Stock insuficiente de keys para: ${product.nombre} (Disponibles: ${availableKeys})`, 400);
                }
            } else {
                if (product.stock < item.quantity) throw new ErrorResponse(`Stock insuficiente para: ${product.nombre}`, 400);
            }

            calculatedTotal += Number(product.precio) * item.quantity;
            validatedItems.push({
                id: product.id,
                title: item.name,
                quantity: Number(item.quantity),
                unit_price: Number(product.precio),
                currency_id: 'ARS',
                picture_url: item.image || undefined,
                description: product.descripcion?.substring(0, 200) || '',
                tipo: product.tipo
            });
        }

        // Reserve stock atomically
        for (const item of validatedItems) {
            if (item.tipo !== 'Digital') {
                const updated = await prisma.product.updateMany({
                    where: { id: item.id, stock: { gte: item.quantity } },
                    data: { stock: { decrement: item.quantity }, cantidadVendida: { increment: item.quantity } }
                });
                if (updated.count === 0) {
                    // Rollback
                    for (const prev of validatedItems) {
                        if (prev.id === item.id) break;
                        await prisma.product.update({ where: { id: prev.id }, data: { stock: { increment: prev.quantity }, cantidadVendida: { decrement: prev.quantity } } });
                    }
                    throw new ErrorResponse(`Stock agotado para: ${item.title}.`, 409);
                }
            }
        }

        // Create order
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
                        productId: i.id,
                        quantity: i.quantity,
                        unitPriceAtPurchase: i.unit_price
                    }))
                }
            }
        });

        try {
            const mpResponse = await mpService.createPreference(order.id, validatedItems, backendUrl, user);
            await prisma.order.update({ where: { id: order.id }, data: { externalId: mpResponse.id } });
            logger.info(`Orden ${order.id} creada. Link de pago generado.`);
            return { orderId: order.id, paymentLink: mpResponse.paymentLink, order: { ...order, _id: order.id } };
        } catch (mpError) {
            logger.error(`Error al crear preferencia MP para orden ${order.id}. Rollback.`, { error: mpError.message });
            for (const item of validatedItems) {
                if (item.tipo !== 'Digital') {
                    await prisma.product.update({ where: { id: item.id }, data: { stock: { increment: item.quantity } } });
                }
            }
            await prisma.order.delete({ where: { id: order.id } });
            throw new ErrorResponse(`Error al conectar con Mercado Pago: ${mpError.message}`, 502);
        }
    }

    async handleWebhook(headers, body, query) {
        const dataId = body?.data?.id || query['data.id'];
        const type = body?.type || query.type;

        if (type !== 'payment') return { status: 'ignored', reason: 'Tipo de notificación no es payment' };
        if (!dataId) throw new Error('Missing payment ID en el webhook');

        mpService.validateWebhookSignature(headers, dataId);

        let paymentInfo;
        try { paymentInfo = await mpService.getPayment(dataId); }
        catch (err) { throw new Error(`No se pudo obtener el pago ${dataId}: ${err.message}`); }

        if (!paymentInfo) throw new Error('Pago no encontrado en MercadoPago');

        const order = await prisma.order.findUnique({
            where: { id: paymentInfo.external_reference },
            include: { orderItems: { include: { product: true } } }
        });
        if (!order) throw new Error('Orden no encontrada');
        if (order.isPaid) return { status: 'ok', reason: 'Orden ya procesada anteriormente' };

        if (paymentInfo.status === 'approved') {
            const deliveredKeys = [];
            for (const item of order.orderItems) {
                if (item.product?.tipo === 'Digital') {
                    for (let i = 0; i < item.quantity; i++) {
                        const key = await prisma.digitalKey.findFirst({
                            where: { productId: item.productId, estado: 'DISPONIBLE' }
                        });
                        if (key) {
                            await prisma.digitalKey.update({
                                where: { id: key.id },
                                data: { estado: 'VENDIDA', orderId: order.id, fechaVenta: new Date() }
                            });
                            deliveredKeys.push({ productName: item.product.nombre, key: key.clave });
                        }
                    }
                }
            }

            await prisma.order.update({
                where: { id: order.id },
                data: {
                    isPaid: true, paidAt: new Date(), orderStatus: 'processing',
                    payment: {
                        create: {
                            mpPaymentId: String(paymentInfo.id),
                            mpStatus: 'approved',
                            mpPaymentType: paymentInfo.payment_type_id || '',
                            mpEmail: paymentInfo.payer?.email || ''
                        }
                    }
                }
            });

            if (deliveredKeys.length > 0) {
                try {
                    const userData = await prisma.user.findUnique({ where: { id: order.userId } });
                    if (userData) await EmailService.sendDigitalProductDelivery(userData, { ...order, _id: order.id }, deliveredKeys);
                } catch (emailError) {
                    logger.error('Error al enviar email de claves:', emailError.message);
                }
            }
            logger.info(`Orden ${order.id} marcada como pagada.`);
        }

        return { status: 'ok', paymentStatus: paymentInfo.status };
    }

    async getUserOrders(userId) {
        const orders = await prisma.order.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { orderItems: { include: { product: true } }, shippingAddress: true, digitalKeys: { select: { id: true, clave: true, productId: true } } }
        });

        return orders.map(o => ({
            ...o,
            _id: o.id,
            orderItems: (o.orderItems || []).map(i => ({ 
                ...i, 
                _id: i.id, 
                price: Number(i.unitPriceAtPurchase), 
                name: i.product?.nombre || 'Producto Desconocido', 
                image: i.product?.imagenUrl || DEFAULT_IMAGE 
            }))
        }));
    }

    async getOrderById(orderId, userId, userRole) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { user: { select: { id: true, name: true, email: true } }, orderItems: { include: { product: true } }, shippingAddress: true }
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
                name: i.product?.nombre || 'Producto Desconocido', 
                image: i.product?.imagenUrl || DEFAULT_IMAGE 
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
                    orderItems: { include: { product: true } },
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
                    name: i.product?.nombre || 'Producto Desconocido', 
                    image: i.product?.imagenUrl || DEFAULT_IMAGE 
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
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new ErrorResponse('Orden no encontrada', 404);
        const updated = await prisma.order.update({ where: { id: orderId }, data: { isPaid: true, paidAt: new Date() } });
        return { ...updated, _id: updated.id };
    }
}

module.exports = new OrderService();
