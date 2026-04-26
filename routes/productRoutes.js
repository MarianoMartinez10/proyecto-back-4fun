const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductsAdmin,
  getProduct,
  getProductAdmin,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteProducts,
  reorderProduct,
  getSellerProducts
} = require('../controllers/productController');
const { protect, authorize } = require('../middlewares/auth');
const verifyProductOwnership = require('../middlewares/verifyProductOwnership');

/**
 * Capa de Enrutamiento: Catálogo Maestro de Productos (Store)
 * --------------------------------------------------------------------------
 * Eje central del escaparate comercial. Organiza la visibilidad de la 
 * mercadería y sus herramientas de administración jerárquica. (MVC / Router)
 */

// ─── RUTAS ANIDADAS (NESTED ROUTES) ───
const offerRouter = require('./offerRoutes');
router.use('/:productId/offers', offerRouter);

// ─── ESCAPARATE PÚBLICO (READ-ONLY) ───

/** @route GET /api/products - Consulta con filtros, paginación y ordenamiento. */
router.get('/', getProducts);

/** @route GET /api/products/admin - Listado administrativo global (Admin Only). */
router.get('/admin', protect, authorize('admin'), getProductsAdmin);

/** @route GET /api/products/seller/me - Listado de productos de autoría propia (Seller Only). */
router.get('/seller/me', protect, authorize('seller', 'admin'), getSellerProducts);

/** @route GET /api/products/admin/:id - Vista administrativa de detalle (incluye inactivos). */
router.get('/admin/:id', protect, authorize('admin'), getProductAdmin);

/** @route GET /api/products/:id - Vista de detalle de artículo (Pública). */
router.get('/:id', getProduct);

/** @route GET /api/products/:id/management - Vista de detalle para gestión (Solo Dueño o Admin). */
router.get('/:id/management', protect, authorize('admin', 'seller'), verifyProductOwnership, getProduct);


// ─── GESTIÓN DE INVENTARIO (ADMIN) ───

/** @route POST /api/products - Alta de nuevo producto (Asociado al usuario activo). */
router.post('/', protect, authorize('admin'), createProduct);

/** @route PUT /api/products/:id/reorder - Mutación de posición visual (Ranking Escaparate). */
router.put('/:id/reorder', protect, authorize('admin'), reorderProduct);

/** @route PUT /api/products/:id - Edición integral de ficha de producto (con validación de propiedad). */
router.put('/:id', protect, authorize('admin', 'seller'), verifyProductOwnership, updateProduct);

/** @route DELETE /api/products/multi - Desactivación masiva de catálogo (validada en controlador). */
router.delete('/multi', protect, authorize('admin', 'seller'), deleteProducts);

/** @route DELETE /api/products/:id - Eliminación lógica (Soft Delete) individual (con validación de propiedad). */
router.delete('/:id', protect, authorize('admin', 'seller'), verifyProductOwnership, deleteProduct);

module.exports = router;