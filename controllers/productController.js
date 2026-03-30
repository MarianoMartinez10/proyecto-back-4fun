const ProductService = require('../services/productService');
const ErrorResponse = require('../utils/errorResponse');
const parseBulkIds = require('../utils/parseBulkIds');

exports.getProducts = async (req, res, next) => {
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
    });

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

exports.getProduct = async (req, res, next) => {
  try {
    const product = await ProductService.getProductById(req.params.id);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

exports.createProduct = async (req, res, next) => {
  try {
    const product = await ProductService.createProduct(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const product = await ProductService.updateProduct(req.params.id, req.body);
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

exports.reorderProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPosition } = req.body;

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

exports.deleteProduct = async (req, res, next) => {
  try {
    await ProductService.deleteProduct(req.params.id);
    res.status(200).json({ success: true, message: 'Producto eliminado' });
  } catch (error) {
    next(error);
  }
};

exports.deleteProducts = async (req, res, next) => {
  try {
    const ids = parseBulkIds(req);

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
