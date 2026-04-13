/**
 * Capa de Controladores: Catálogo de Consolas/Plataformas
 * --------------------------------------------------------------------------
 * Gestiona el marco regulatorio del ciclo de vida de Plataformas (Ej: PS5, Xbox).
 * Diseñado bajo convenciones unificadas de mantenibilidad y delegación MVC.
 */

const PlatformService = require('../services/platformService');
const parseBulkIds = require('../utils/parseBulkIds');

/**
 * Lista las plataformas registradas.
 * 
 * @param {Object} req - Petición HTTP.
 * @param {Object} res - Respuesta serializada.
 * @returns {Array} Modelos DTO de plataformas.
 */
exports.getPlatforms = async (req, res, next) => {
    try {
        const platforms = await PlatformService.getPlatforms();
        res.status(200).json(platforms);
    } catch (error) {
        next(error); // Error Handling unificado perimetralmente.
    }
};

/**
 * Individualiza información detallada para una entidad.
 */
exports.getPlatform = async (req, res, next) => {
    try {
        const platform = await PlatformService.getPlatformById(req.params.id);
        res.status(200).json({ success: true, data: platform });
    } catch (error) {
        next(error);
    }
};

/**
 * Inserción unitaria de una deidad taxonómica.
 */
exports.createPlatform = async (req, res, next) => {
    try {
        const platform = await PlatformService.createPlatform(req.body);
        res.status(201).json(platform);
    } catch (error) {
        next(error);
    }
};

/**
 * Sustitución o correción (UPSERT Semántico) de datos.
 */
exports.updatePlatform = async (req, res, next) => {
    try {
        const platform = await PlatformService.updatePlatform(req.params.id, req.body);
        res.status(200).json({
            success: true,
            data: platform
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Abolición sistemática referencial para deslistar una firma de la tienda pública.
 * RN (Atenuación de Riesgo): Aplicación de Soft-Delete previene orfandad en registros históricos
 * forzando marcadores booleanos en la estructura de base de datos delegada en el Servicio.
 */
exports.deletePlatform = async (req, res, next) => {
    try {
        await PlatformService.deletePlatform(req.params.id);
        res.status(200).json({ success: true, message: 'Plataforma eliminada (Soft Delete)', id: req.params.id });
    } catch (error) {
        next(error);
    }
};

/**
 * Acción por lotes (Batch) para paneles DataGrid que requieran desmantelar entidades masivamente.
 */
exports.deletePlatforms = async (req, res, next) => {
    try {
        // Mantenibilidad: Desacople de algoritmos parseadores HTTP fuera del controlador per-se
        const ids = parseBulkIds(req);
        
        const result = await PlatformService.deletePlatforms(ids);

        res.status(200).json({
            success: true,
            message: `${result.modifiedCount} plataformas eliminadas (Soft Delete)`,
            ids
        });
    } catch (error) {
        next(error);
    }
};
