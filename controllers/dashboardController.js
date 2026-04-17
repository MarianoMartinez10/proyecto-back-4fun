/**
 * Capa de Controladores: Métricas y Resumen Analítico (Dashboard)
 * --------------------------------------------------------------------------
 * Punto de recolección de estadísticas exclusivamente utilizado por el
 * Panel de Administración. Actúa como pasarela de lectura (Read-Only)
 * conectando el Router de Admin con el motor analítico de DashboardService.
 */

const DashboardService = require('../services/dashboardService');

/**
 * Extrae y sintetiza los KPIs macros (Ingresos totales, cantidad de usuarios, órdenes activas).
 * @param {Object} req - HTTP Request.
 * @param {Object} res - HTTP Response.
 * @param {Function} next - Error fallback.
 * @returns {JSON} DTO estadístico.
 */
exports.getStats = async (req, res, next) => {
  try {
    // RN (RBAC): Si es vendedor, filtramos por su ID. Si es Admin, vemos todo.
    const sellerId = req.user.role === 'seller' ? req.user.id : null;
    const data = await DashboardService.getStats(sellerId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * Sirve arreglos de trazabilidad cronológica (Series temporales) para pintar
 * gráficas cartesianas en el CRM Frontend.
 */
exports.getSalesChart = async (req, res, next) => {
  try {
    const sellerId = req.user.role === 'seller' ? req.user.id : null;
    const data = await DashboardService.getSalesChart(sellerId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * Resuelve y expone un ranking (Top) de artículos mejor vendidos.
 * RN (Análisis de Inventario): Ordena aplicando reglas de negocio de popularidad subyacentes.
 */
exports.getTopProducts = async (req, res, next) => {
  try {
    const sellerId = req.user.role === 'seller' ? req.user.id : null;
    const data = await DashboardService.getTopProducts(sellerId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * Consulta de listado transaccional para auditar órdenes que ingresaron recientemente por el embudo.
 */
exports.getRecentSales = async (req, res, next) => {
  try {
    const sellerId = req.user.role === 'seller' ? req.user.id : null;
    const data = await DashboardService.getRecentSales(sellerId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
