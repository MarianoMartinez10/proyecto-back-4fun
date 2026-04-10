const prisma = require('../lib/prisma');

class DashboardService {

    static async getStats() {
        const date = new Date();
        const firstDayCurrentMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const firstDayLastMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);

        const [paidOrders, totalUsers, allProducts, recentMonthOrders] = await Promise.all([
            prisma.order.findMany({ where: { isPaid: true }, select: { totalPrice: true } }),
            prisma.user.count(),
            prisma.product.findMany({ select: { activo: true, stock: true } }),
            prisma.order.findMany({
                where: { isPaid: true, createdAt: { gte: firstDayLastMonth } },
                select: { totalPrice: true, createdAt: true }
            })
        ]);

        const totalRevenue = paidOrders.reduce((s, o) => s + Number(o.totalPrice), 0);
        const totalOrders = paidOrders.length;
        const activeProducts = allProducts.filter(p => p.activo).length;
        const lowStockProducts = allProducts.filter(p => p.activo && p.stock <= 5).length;

        let currentMonthRev = 0, lastMonthRev = 0;
        for (const o of recentMonthOrders) {
            const month = new Date(o.createdAt).getMonth();
            if (month === date.getMonth()) currentMonthRev += Number(o.totalPrice);
            else lastMonthRev += Number(o.totalPrice);
        }
        const monthlyGrowth = lastMonthRev === 0 ? (currentMonthRev > 0 ? 100 : 0)
            : ((currentMonthRev - lastMonthRev) / lastMonthRev) * 100;

        return { totalRevenue, totalOrders, totalUsers, activeProducts, lowStockProducts, monthlyGrowth: Number(monthlyGrowth.toFixed(1)) };
    }

    static async getSalesChart() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const orders = await prisma.order.findMany({
            where: { isPaid: true, createdAt: { gte: thirtyDaysAgo } },
            select: { totalPrice: true, createdAt: true }
        });

        // Group by date string
        const grouped = {};
        for (const o of orders) {
            const dateKey = o.createdAt.toISOString().split('T')[0];
            if (!grouped[dateKey]) grouped[dateKey] = { total: 0, orders: 0 };
            grouped[dateKey].total += Number(o.totalPrice);
            grouped[dateKey].orders++;
        }

        return Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, { total, orders }]) => ({ date, total, orders }));
    }

    static async getTopProducts() {
        const orderItems = await prisma.orderItem.findMany({
            where: { order: { isPaid: true } },
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

    static async getRecentSales() {
        const orders = await prisma.order.findMany({
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
