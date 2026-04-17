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
 * Listado administrativo de catálogo.
 * Incluye productos activos e inactivos para auditoría y gestión de deprecados.
 */
exports.getProductsAdmin = async (req, res, next) => {
  try {
    const { search, platform, genre, minPrice, maxPrice, page, limit, sort, discounted } = req.query;

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
      includeInactive: true,
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
 * Listado específico para el vendedor activo.
 * Filtra el catálogo para mostrar solo los ítems donde el usuario es dueño.
 */
exports.getSellerProducts = async (req, res, next) => {
  try {
    const { search, page, limit, sort } = req.query;

    const result = await ProductService.getProducts({
      search,
      page,
      limit,
      sort,
      sellerId: req.user.id, // Filtro de seguridad: Solo lo mío
      includeInactive: true, // El vendedor debe poder gestionar sus desactivados
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
 * Detalle administrativo de producto.
 * Permite recuperar productos inactivos para su gestion interna.
 * RN (RBAC): El contexto `includeInactive=true` solo se utiliza en rutas
 * protegidas por middleware de rol administrador.
 */
exports.getProductAdmin = async (req, res, next) => {
  try {
    const product = await ProductService.getProductById(req.params.id, { includeInactive: true });
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
    // RN (Autoría): Vinculamos el producto al usuario que realiza la petición.
    const product = await ProductService.createProduct({
      ...req.body,
      sellerId: req.user.id
    });
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error); // ErrorHandler procesa Prisma Constraints (Ej. Nombre comercial duplicado).
  }
};

/**
 * Destruye estado obsoleto para reemplazar por el fragmento HTTP provisto (PUT completo).
 * Nota: La validación de propiedad se realiza en `verifyProductOwnership` middleware.
 */
exports.updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const productData = req.body;

    const updatedProduct = await ProductService.updateProduct(id, productData);
    res.status(200).json({ success: true, data: updatedProduct });
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
 * Nota: La validación de propiedad se realiza en `verifyProductOwnership` middleware.
 */
exports.deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    await ProductService.deleteProduct(id);
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

    // RN - Seguridad Marketplace: Validar que sellers solo eliminen sus productos
    const validation = await ProductService.validateProductOwnershipBulk(
      ids, 
      req.user.id, 
      req.user.role
    );

    if (!validation.valid) {
      return res.status(403).json({ 
        success: false, 
        message: validation.message,
        unauthorizedIds: validation.unauthorizedIds
      });
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
