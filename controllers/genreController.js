/**
 * Capa de Controladores: Nomencladores y Categorías (Géneros)
 * --------------------------------------------------------------------------
 * Administación CRUD integral para las taxonomías asociadas a los juegos.
 * Respeta la separación estricta de MVC delegando la interacción de Base 
 * de Datos (Prisma) al GenreService.
 */

const GenreService = require('../services/genreService');
const parseBulkIds = require('../utils/parseBulkIds');

/**
 * Recupera el catálogo maestro de todos los géneros habilitados.
 * 
 * @param {Object} req - Petición HTTP.
 * @param {Object} res - Respuesta HTTP serializada en arreglo plano.
 * @returns {Array} Listado.
 */
exports.getGenres = async (req, res, next) => {
    try {
        const genres = await GenreService.getGenres();
        res.status(200).json(genres);
    } catch (error) {
        next(error);
    }
};

/**
 * Recupera un género particular identificándolo unívocamente.
 */
exports.getGenre = async (req, res, next) => {
    try {
        const genre = await GenreService.getGenreById(req.params.id);
        res.status(200).json({ success: true, data: genre });
    } catch (error) {
        // Manejo Excepciones: Si no existe, el 404 lanzado desde el Service se atrapa globalmente aquí.
        next(error);
    }
};

/**
 * Crea una nueva entidad de categorización en la plataforma.
 */
exports.createGenre = async (req, res, next) => {
    try {
        // RN: Toda nueva inserción validará campos de unicidad estructural (Ej. Nombres únicos)
        // a nivel sistema, y lanzará ErrorResponse de fallar.
        const genre = await GenreService.createGenre(req.body);
        res.status(201).json(genre);
    } catch (error) {
        next(error);
    }
};

/**
 * Mutación (UPSERT paramétrico) de una rama de taxonomía.
 */
exports.updateGenre = async (req, res, next) => {
    try {
        const genre = await GenreService.updateGenre(req.params.id, req.body);
        res.status(200).json({
            success: true,
            data: genre
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Baja de entidad Singular protegiendo integridad referencial.
 * RN (Regla de Mantebilidad): Emplea "Soft Delete" o deshabilitación pasiva
 * para no romper los históricos de compras o productos.
 */
exports.deleteGenre = async (req, res, next) => {
    try {
        await GenreService.deleteGenre(req.params.id);
        res.status(200).json({ success: true, message: 'Género eliminado (Soft Delete)', id: req.params.id });
    } catch (error) {
        next(error);
    }
};

/**
 * Supresión masiva en Batch (Multiselect UI del panel Admin).
 * Interrumpe en caso de error sistémico con rollback gestionado por utilidades.
 */
exports.deleteGenres = async (req, res, next) => {
    try {
        // Helper utilitario que unifica el parseo de IDs procedentes en strings o arrays via Query.
        const ids = parseBulkIds(req);
        
        const result = await GenreService.deleteGenres(ids);

        res.status(200).json({
            success: true,
            message: `${result.modifiedCount} géneros eliminados (Soft Delete)`,
            ids
        });
    } catch (error) {
        next(error);
    }
};
