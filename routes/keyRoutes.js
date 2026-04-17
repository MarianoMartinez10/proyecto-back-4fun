const express = require('express');
const { protect, authorize } = require('../middlewares/auth');
const { addKeys, deleteKey, getKeysByProduct } = require('../controllers/keyController');

const router = express.Router();

/**
 * Capa de Enrutamiento: Inventario Digital (Keys)
 * --------------------------------------------------------------------------
 * Gestiona el stock de licencias de activación. 
 * 
 * RN - Seguridad de Activos: Dado que estas llaves representan el valor 
 * transaccional real del producto digital, este router está blindado 
 * exclusivamente para el rol 'admin'. (MVC / Router)
 */

router.use(protect);
router.use(authorize('admin', 'seller'));

/** @route POST /api/keys/bulk - Carga masiva de licencias para un producto específico. */
router.post('/bulk', addKeys);

/** @route GET /api/keys/product/:productId - Auditoría de claves por ID de producto. */
router.get('/product/:productId', getKeysByProduct);

/** @route DELETE /api/keys/:id - Revocación manual de una licencia individual. */
router.delete('/:id', deleteKey);

module.exports = router;
