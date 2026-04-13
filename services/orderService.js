/**
 * Capa de Servicios: Facturación y Órdenes Core
 * --------------------------------------------------------------------------
 * Eje principal del flujo financiero (Checkout Pipeline). Abstrae complejas 
 * inserciones multifamiliares y control cruzado lógico de base de datos.
 */

const prisma = require('../lib/prisma');
const EmailService = require('./emailService');
const { DEFAULT_IMAGE } = require('../utils/constants');
const logger = require('../utils/logger');
const ErrorResponse = require('../utils/errorResponse');

class OrderService {

    /**
     * Consolidación Inicial: Chequea inventarios y forja un ticket "Pendiente".
     * RN (Regla de Atomicidad): Intercepta fallos aislados en reservaciones de stock mediante
     * heurísticas de compensación manual (Rollback) simuladas.
     */
    async createOrder({ user, orderItems, shippingAddress, paymentMethod }) {
        if (!orderItems?.length) throw new ErrorResponse('El carrito está vacío.', 400);

        const backendUrl = process.env.BACKEND_URL;
        if (!backendUrl) throw new ErrorResponse('BACKEND_URL no está configurado.', 500);

        let calculatedTotal = 0;
        const validatedItems = [];

        // RN (Seguridad de Precios): El frontend manda la intención, el Service reconstruye el ticket
        // cotizando con valores limpios atados en la Base de Datos para evitar Inyección de Precios.
        for (const item of orderItems) {
            const product = await prisma.product.findUnique({ where: { id: item.product } });
            if (!product) throw new ErrorResponse(`Producto no encontrado: ${item.name}`, 400);

            // RN de Disponibilidad por Tipología (Físico vs Digital)
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
                unit_price: Number(product.precio), // Precio auditado y sellado.
                currency_id: 'ARS',
                picture_url: item.image || undefined,
                description: product.descripcion?.substring(0, 200) || '',
                tipo: product.tipo
            });
        }

        // RN (Gestión de Inventario Optimista): Reduce los saldos provisionalmente asumiendo 
        // voluntad total de pago por parte del cliente.
        for (const item of validatedItems) {
            if (item.tipo !== 'Digital') {
                const updated = await prisma.product.updateMany({
                    where: { id: item.id, stock: { gte: item.quantity } },
                    data: { stock: { decrement: item.quantity }, cantidadVendida: { increment: item.quantity } }
                });
                if (updated.count === 0) {
                    // Compensatory Action (Sudo Rollback manual)
                    for (const prev of validatedItems) {
                        if (prev.id === item.id) break;
                        await prisma.product.update({ where: { id: prev.id }, data: { stock: { increment: prev.quantity }, cantidadVendida: { decrement: prev.quantity } } });
                    }
                    throw new ErrorResponse(`Stock agotado para: ${item.title}.`, 409);
                }
            }
        }

        // DML de Inserción Relacional Compleja
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
                        unitPriceAtPurchase: i.unit_price // Snapshot histórico para contabilidad inmutable.
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

    async getUserOrders(userId) {
        const orders = await prisma.order.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { orderItems: { include: { product: true } }, shippingAddress: true, digitalKeys: { select: { id: true, clave: true, productId: true } } }
        });

        // Mapeo defensivo de compatibilidad Mongoose->Prisma en fron-end usando _id
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
        
        // RN Permisos (Tenencia): Inquisita pertenencia local vs rol piramidal.
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
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                user: { select: { id: true, name: true, email: true } },
                orderItems: { include: { product: true } },
                digitalKeys: { select: { id: true, clave: true, productId: true } }
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
                if (item.product?.tipo !== 'Digital') continue;

                const alreadyAssigned = await tx.digitalKey.count({
                    where: { orderId, productId: item.productId }
                });

                const missingKeys = Math.max(0, Number(item.quantity) - alreadyAssigned);
                if (missingKeys === 0) continue;

                const availableKeys = await tx.digitalKey.findMany({
                    where: {
                        productId: item.productId,
                        estado: 'DISPONIBLE',
                        orderId: null,
                        activo: true,
                    },
                    orderBy: { createdAt: 'asc' },
                    take: missingKeys,
                    select: { id: true }
                });

                if (availableKeys.length < missingKeys) {
                    throw new ErrorResponse(`No hay keys suficientes para ${item.product?.nombre || 'producto digital'}`, 409);
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

                if (updatedKeys.count !== keyIds.length) {
                    throw new ErrorResponse('No se pudieron reservar todas las keys de forma segura', 409);
                }

                assignedKeysCount += updatedKeys.count;

                const currentAvailable = await tx.digitalKey.count({
                    where: { productId: item.productId, estado: 'DISPONIBLE', activo: true }
                });

                await tx.product.update({
                    where: { id: item.productId },
                    data: { stock: currentAvailable }
                });
            }

            const paidOrder = await tx.order.findUnique({
                where: { id: orderId },
                include: {
                    user: { select: { id: true, name: true, email: true } },
                    orderItems: { include: { product: true } },
                    digitalKeys: { select: { id: true, clave: true, productId: true } }
                }
            });

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
                    logger.warn('[OrderService] Orden pagada pero el envio de email de keys no fue exitoso', {
                        orderId,
                        reason: emailResult?.message || 'motivo desconocido'
                    });
                }
            } catch (emailError) {
                logger.error('[OrderService] Error enviando keys por email tras marcar pago', {
                    orderId,
                    error: emailError.message
                });
            }
        }

        return {
            ...(paidOrder || order),
            _id: (paidOrder || order).id
        };
    }
}

module.exports = new OrderService();
