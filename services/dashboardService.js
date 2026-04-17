/**
 * Capa de Servicios: Analytics y Telemetría
 * --------------------------------------------------------------------------
 * Exclusivamente encargado de compilar grandes agrupaciones de BDD usando 
 * prisma reducers para servir tableros de control financieros.
 */

const prisma = require('../lib/prisma');

class DashboardService {

    /**
     * Motor numérico para calcular Indicadores (KPIs) en tiempo real.
     * RN (Base Contable): Solo dimensiona métricas sobre órdenes consolidadas 
     * como pagadas (isPaid = true), descartando carritos abandonados.
     * @param {string} sellerId - UUID opcional para filtrar métricas de un vendedor específico.
     */
    static async getStats(sellerId = null) {
        const date = new Date();
        const firstDayCurrentMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const firstDayLastMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);

        const [paidOrders, totalUsers, allProducts, recentMonthOrders, pendingTransactions] = await Promise.all([
            // Filtrado de Ingresos: Si hay sellerId, sumamos solo los items de ese vendedor.
            prisma.orderItem.findMany({ 
                where: { 
                    order: { isPaid: true },
                    ...(sellerId && { product: { sellerId } }) 
                }, 
                select: { unitPriceAtPurchase: true, quantity: true } 
            }),
            prisma.user.count(),
            prisma.product.findMany({ 
                where: sellerId ? { sellerId } : {},
                select: { activo: true, stock: true } 
            }),
            prisma.orderItem.findMany({
                where: { 
                    order: { isPaid: true, createdAt: { gte: firstDayLastMonth } },
                    ...(sellerId && { product: { sellerId } })
                },
                select: { unitPriceAtPurchase: true, quantity: true, order: { select: { createdAt: true } } }
            }),
            // Dinero en Escrow (Pendiente de aprobación)
            prisma.transaction.aggregate({
                where: {
                    status: 'PENDING_APPROVAL',
                    ...(sellerId && { sellerId })
                },
                _sum: { amount: true }
            })
        ]);

        const totalRevenue = paidOrders.reduce((s, o) => s + (Number(o.unitPriceAtPurchase) * o.quantity), 0);
        const totalOrders = paidOrders.length;
        const activeProducts = allProducts.filter(p => p.activo).length;
        
        // RN Comercial: Advierte umbrales de escasez severa en depósito.
        const lowStockProducts = allProducts.filter(p => p.activo && p.stock <= 5).length;

        let currentMonthRev = 0, lastMonthRev = 0;
        for (const o of recentMonthOrders) {
            const month = new Date(o.order.createdAt).getMonth();
            if (month === date.getMonth()) currentMonthRev += (Number(o.unitPriceAtPurchase) * o.quantity);
            else lastMonthRev += (Number(o.unitPriceAtPurchase) * o.quantity);
        }
        
        // RN Matemática: Previene división por 0 al ponderar crecimiento mes contra mes.
        const monthlyGrowth = lastMonthRev === 0 ? (currentMonthRev > 0 ? 100 : 0)
            : ((currentMonthRev - lastMonthRev) / lastMonthRev) * 100;

        const pendingAmount = Number(pendingTransactions._sum.amount || 0);

        return { 
            totalRevenue, 
            totalOrders, 
            totalUsers, 
            activeProducts, 
            lowStockProducts, 
            pendingAmount,
            monthlyGrowth: Number(monthlyGrowth.toFixed(1)) 
        };
    }

    /**
     * Map/Reduce temporal para dibujar vectores en la vista chart.js
     */
    static async getSalesChart(sellerId = null) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const orderItems = await prisma.orderItem.findMany({
            where: { 
                order: { isPaid: true, createdAt: { gte: thirtyDaysAgo } },
                ...(sellerId && { product: { sellerId } })
            },
            select: { unitPriceAtPurchase: true, quantity: true, order: { select: { createdAt: true } } }
        });

        const grouped = {};
        for (const item of orderItems) {
            const dateKey = item.order.createdAt.toISOString().split('T')[0];
            if (!grouped[dateKey]) grouped[dateKey] = { total: 0, orders: 0 };
            grouped[dateKey].total += (Number(item.unitPriceAtPurchase) * item.quantity);
            grouped[dateKey].orders++;
        }

        return Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, { total, orders }]) => ({ date, total, orders }));
    }

    /**
     * RN: Ordena el catálogo descendente (desc) priorizando lo más despachado.
     */
    static async getTopProducts(sellerId = null) {
        const orderItems = await prisma.orderItem.findMany({
            where: { 
                order: { isPaid: true },
                ...(sellerId && { product: { sellerId } })
            },
            select: { productId: true, quantity: true, unitPriceAtPurchase: true, product: { select: { nombre: true } } }
        });

        const productMap = {};
        for (const i of orderItems) {
            if (!productMap[i.productId]) {
                productMap[i.productId] = { _id: i.productId, name: i.product?.nombre || 'Desconocido', totalSold: 0, revenueGenerated: 0 };
            }
            productMap[i.productId].totalSold += i.quantity;
            productMap[i.productId].revenueGenerated += Number(i.unitPriceAtPurchase) * i.quantity;
        }

        return Object.values(productMap)
            .sort((a, b) => b.totalSold - a.totalSold)
            .slice(0, 5);
    }

    /**
     * Histograma superficial para feeds de actividad en tiempo real.
     */
    static async getRecentSales(sellerId = null) {
        const orders = await prisma.order.findMany({
            where: sellerId ? { orderItems: { some: { product: { sellerId } } } } : {},
            select: { id: true, totalPrice: true, orderStatus: true, isPaid: true, createdAt: true, user: { select: { name: true, email: true } } },
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        return orders.map(o => ({
            id: o.id,
            user: { name: o.user?.name || 'Usuario Eliminado', email: o.user?.email || 'N/A' },
            amount: Number(o.totalPrice),
            status: o.orderStatus,
            date: o.createdAt
        }));
    }
}

module.exports = DashboardService;
