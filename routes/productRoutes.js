const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteProducts,
  reorderProduct
} = require('../controllers/productController');
const { protect, authorize } = require('../middlewares/auth');

/**
 * Capa de Enrutamiento: Catálogo Maestro de Productos (Store)
 * --------------------------------------------------------------------------
 * Eje central del escaparate comercial. Organiza la visibilidad de la 
 * mercadería y sus herramientas de administración jerárquica. (MVC / Router)
 */

// ─── ESCAPARATE PÚBLICO (READ-ONLY) ───

/** @route GET /api/products - Consulta con filtros, paginación y ordenamiento. */
router.get('/', getProducts);

/** @route GET /api/products/:id - Vista de detalle de artículo. */
router.get('/:id', getProduct);


// ─── GESTIÓN DE INVENTARIO (ADMIN ONLY) ───

/** @route POST /api/products - Alta de nuevo producto físico o digital. */
router.post('/', protect, authorize('admin'), createProduct);

/** @route PUT /api/products/:id/reorder - Mutación de posición visual (Ranking Escaparate). */
router.put('/:id/reorder', protect, authorize('admin'), reorderProduct);

/** @route PUT /api/products/:id - Edición integral de ficha de producto. */
router.put('/:id', protect, authorize('admin'), updateProduct);

/** @route DELETE /api/products/multi - Desactivación masiva de catálogo. */
router.delete('/multi', protect, authorize('admin'), deleteProducts);

/** @route DELETE /api/products/:id - Eliminación lógica (Soft Delete) individual. */
router.delete('/:id', protect, authorize('admin'), deleteProduct);

module.exports = router;