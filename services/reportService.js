/**
 * Capa de Servicios: Dominio de Reportes y Estadísticas
 * --------------------------------------------------------------------------
 * Se encarga de la computación lógica de KPIs de venta. Esta capa es pura
 * lógica de negocio y NO conoce formatos de salida (PDF/Excel).
 *
 * Cumple con el criterio de Separación de Responsabilidades de la UTN-FRT.
 */

const prisma = require('../lib/prisma');
const logger = require('../utils/logger');

class ReportService {
    /**
     * Calcula estadísticas generales de ventas.
     * @returns {Promise<Object>} Datos crudos para el dashboard.
     */
    async getSalesStats() {
        try {
            const [totalRevenue, topProducts, ordersByStatus] = await Promise.all([
                // 1. Recaudación Total
                prisma.order.aggregate({
                    where: { isPaid: true },
                    _sum: { totalPrice: true }
                }),
                // 2. Productos más vendidos
                prisma.product.findMany({
                    where: { activo: true },
                    orderBy: { cantidadVendida: 'desc' },
                    take: 5,
                    select: { id: true, nombre: true, cantidadVendida: true, precio: true }
                }),
                // 3. Órdenes por estado (Auditoría de gestión)
                prisma.order.groupBy({
                    by: ['orderStatus'],
                    _count: { id: true }
                })
            ]);

            return {
                revenue: totalRevenue._sum.totalPrice || 0,
                topProducts,
                ordersByStatus,
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            logger.error('[ReportService] Error generando estadísticas:', error);
            throw error;
        }
    }
}

module.exports = new ReportService();
