const express = require('express');
const router = express.Router();
const { getPlatforms, getPlatform, updatePlatform, createPlatform, deletePlatform, deletePlatforms } = require('../controllers/platformController');
const { protect, authorize } = require('../middlewares/auth');

/**
 * Capa de Enrutamiento: Catálogo de Plataformas (Platforms)
 * --------------------------------------------------------------------------
 * Expone las interfaces de hardware soportadas (PC, PS5, etc).
 * Mantiene la lectura abierta pero restringe la edición al nivel jerárquico admin.
 */

// ─── CONSULTORIA PÚBLICA ───

/** @route GET /api/platforms - Listado de ecosistemas de juego activos. */
router.get('/', getPlatforms);

/** @route GET /api/platforms/:id - Ficha técnica de una plataforma por ID/Slug. */
router.get('/:id', getPlatform);


// ─── GESTIÓN ADMINISTRATIVA ───

/** @route POST /api/platforms - Registro de nuevo soporte de hardware. */
router.post('/', protect, authorize('admin'), createPlatform);

/** @route PUT /api/platforms/:id - Actualización de metadatos o imagotipo. */
router.put('/:id', protect, authorize('admin'), updatePlatform);

/** @route DELETE /api/platforms/multi - Depuración masiva de taxonomías. */
router.delete('/multi', protect, authorize('admin'), deletePlatforms);

/** @route DELETE /api/platforms/:id - Baja lógica de una plataforma. */
router.delete('/:id', protect, authorize('admin'), deletePlatform);

module.exports = router;
