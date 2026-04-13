const express = require('express');
const router = express.Router();
const { getGenres, getGenre, updateGenre, createGenre, deleteGenre, deleteGenres } = require('../controllers/genreController');
const { protect, authorize } = require('../middlewares/auth');

/**
 * Capa de Enrutamiento: Clasificación de Contenidos (Genres)
 * --------------------------------------------------------------------------
 * Define el acceso al árbol taxonómico de géneros de videojuegos.
 * Mantiene la lectura abierta al público pero centraliza la escritura
 * en el departamento administrativo. (MVC / Router)
 */

// ─── CONSULTORIA PÚBLICA ───

/** @route GET /api/genres - Recupera el listado de categorías activas. */
router.get('/', getGenres);

/** @route GET /api/genres/:id - Obtiene el detalle de un género por Slug o ID. */
router.get('/:id', getGenre);


// ─── GESTIÓN ADMINISTRATIVA (RESTRICTED) ───

/** @route POST /api/genres - Alta de nueva rama taxonómica. */
router.post('/', protect, authorize('admin'), createGenre);

/** @route PUT /api/genres/:id - Modificación de metadatos o Slugs. */
router.put('/:id', protect, authorize('admin'), updateGenre);

/** @route DELETE /api/genres/multi - Expurgación por lotes (Batch Delete). */
router.delete('/multi', protect, authorize('admin'), deleteGenres);

/** @route DELETE /api/genres/:id - Baja lógica de una entrada individual. */
router.delete('/:id', protect, authorize('admin'), deleteGenre);

module.exports = router;
