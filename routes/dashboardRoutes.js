const express = require('express');
const router = express.Router();
const { getStats, getSalesChart, getTopProducts, getRecentSales } = require('../controllers/dashboardController');
const { protect, authorize } = require('../middlewares/auth');

/**
 * Capa de Enrutamiento: Métricas y Business Intelligence (Dashboard)
 * --------------------------------------------------------------------------
 * Provee los datos analíticos para la toma de decisiones empresariales.
 * 
 * RN - Seguridad Crítica: Dado que expone información financiera sensible 
 * (ingresos, ventas, KPIs), todo este router está bloqueado bajo una
 * política de 'Admin-Only' intransigente. (MVC / Router)
 */

router.use(protect);
router.use(authorize('admin'));

/** @route GET /api/dashboard/stats - Indicadores macro de rendimiento (Revenue). */
router.get('/stats', getStats);

/** @route GET /api/dashboard/sales-chart - Series temporales para visualización gráfica. */
router.get('/sales-chart', getSalesChart);

/** @route GET /api/dashboard/top-products - Ranking de rentabilidad por artículo. */
router.get('/top-products', getTopProducts);

/** @route GET /api/dashboard/recent-sales - Log transaccional de alta frecuencia. */
router.get('/recent-sales', getRecentSales);

module.exports = router;
