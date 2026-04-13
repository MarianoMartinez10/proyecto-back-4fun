/**
 * Capa de Controladores: Bienes Transaccionables (Products)
 * --------------------------------------------------------------------------
 * Centro neurálgico del e-commerce. Agrupa todo el filtrado, paginación,
 * y despacho HTTP de los juegos ofertados. Aplica MVC transportando la
 * carga pesada algorítmica y de ORM hacia `ProductService`.
 */

const ProductService = require('../services/productService');
const ErrorResponse = require('../utils/errorResponse');
const parseBulkIds = require('../utils/parseBulkIds');

/**
 * Búsqueda inteligente multipropósito (Catálogo y Panel Admin).
 * Extrae y transporta criterios de indexado recibidos por Query Props (URL).
 * 
 * @param {Object} req - Objeto Express provisto por el Router { query }.
 * @param {Object} res - Express HTTP Response.
 * @param {Function} next - Error fallback handler.
 * @returns {JSON} Estructura paginada que incluye un subset de productos y el cursor total.
 */
exports.getProducts = async (req, res, next) => {
  try {
    const { search, platform, genre, minPrice, maxPrice, page, limit, sort, discounted } = req.query;

    // MVC en acción: Controlador no formatea Prisma "Where" clauses. Solamente pasará 
    // DTOs primarios al servicio a cargo.
    const result = await ProductService.getProducts({
      search,
      platform,
      genre,
      minPrice,
      maxPrice,
      page,
      limit,
      sort,
      discounted,
    });

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Sirve al visitante o dashboard una radiografía de propiedades exclusivas 
 * amarradas a una Primary Key (id).
 */
exports.getProduct = async (req, res, next) => {
  try {
    const product = await ProductService.getProductById(req.params.id);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

/**
 * Crea la base de un nuevo bien con todo su árbol relacional precompilado
 * (Soporta Plataformas, Géneros e insersión M2M de Etiquetas de Sistema).
 */
exports.createProduct = async (req, res, next) => {
  try {
    const product = await ProductService.createProduct(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error); // ErrorHandler procesa Prisma Constraints (Ej. Nombre comercial duplicado).
  }
};

/**
 * Destruye estado obsoleto para reemplazar por el fragmento HTTP provisto (PUT completo).
 */
exports.updateProduct = async (req, res, next) => {
  try {
    const product = await ProductService.updateProduct(req.params.id, req.body);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

/**
 * Operación analítica para organizar catálogos curados frontalizables 
 * (Modificación de la columna sortOrder en DB).
 */
exports.reorderProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPosition } = req.body;

    // Manejo Errores HTTP Interno: Protege al servicio exigiendo parseo duro en input numérico.
    if (newPosition === undefined || typeof newPosition !== 'number') {
      throw new ErrorResponse('Posición inválida, se requiere un número', 400);
    }

    const success = await ProductService.reorderProduct(id, newPosition);

    if (!success) {
      return res.status(400).json({ success: false, message: 'No se pudo mover el producto' });
    }

    res.status(200).json({ success: true, message: 'Producto reordenado' });
  } catch (error) {
    next(error);
  }
};

/**
 * Limpieza Singular Logística. Evita mostrar productos desfazados de mercado.
 */
exports.deleteProduct = async (req, res, next) => {
  try {
    await ProductService.deleteProduct(req.params.id);
    res.status(200).json({ success: true, message: 'Producto eliminado' });
  } catch (error) {
    next(error);
  }
};

/**
 * Desindexación perimetral por IDs listados vía frontend.
 */
exports.deleteProducts = async (req, res, next) => {
  try {
    const ids = parseBulkIds(req);

    // Validación preventiva arquitectónica para abortar sentencias SQL vacías inútiles.
    if (!ids || ids.length === 0) {
      throw new ErrorResponse('No se proporcionaron IDs para eliminar', 400);
    }

    const result = await ProductService.deleteProducts(ids);

    res.status(200).json({
      success: true,
      message: `${result.count} productos eliminados`,
      ids
    });
  } catch (error) {
    next(error);
  }
};
