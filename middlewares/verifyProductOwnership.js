/**
 * Middleware: Verificación de Propiedad de Producto (RBAC - Product Level)
 * --------------------------------------------------------------------------
 * Valida que el usuario autenticado tenga permisos para actuar sobre un producto específico.
 * 
 * Reglas:
 * - Admin: Acceso global (todos los productos)
 * - Seller: Acceso solo a sus propios productos
 * 
 * Uso:
 * router.put('/:id', protect, verifyProductOwnership, updateProduct);
 */

const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

/**
 * Verifica que el usuario sea propietario del producto o sea administrador.
 * Se ejecuta después de `protect` (autenticación) y antes del controlador.
 * 
 * @param {Object} req - Express request con req.user autenticado y req.params.id del producto
 * @param {Object} res - Express response
 * @param {Function} next - Pasa al siguiente middleware/controlador
 * @returns {void|JSON} - Retorna 403 si no hay permisos, llama next() si OK
 */
async function verifyProductOwnership(req, res, next) {
  try {
    const { id } = req.params;

    // Validación: Previene queries vacías
    if (!id) {
      logger.warn('[ProductOwnership] ID de producto no proporcionado');
      return res.status(400).json({ 
        success: false, 
        message: 'ID de producto requerido' 
      });
    }

    // Fast-path: Admin tiene acceso global
    if (req.user.role === 'admin') {
      logger.debug(`[ProductOwnership] Admin ${req.user.id} accediendo producto ${id}`);
      return next();
    }

    // Consulta: Recupera el producto (solo campos necesarios para validación)
    const product = await prisma.product.findUnique({
      where: { id },
      select: { 
        id: true, 
        sellerId: true, 
        nombre: true 
      }
    });

    // Validación: Producto no existe
    if (!product) {
      logger.warn(`[ProductOwnership] Producto ${id} no encontrado`);
      return res.status(404).json({ 
        success: false, 
        message: 'Producto no encontrado' 
      });
    }

    // Validación: Seller intenta acceder producto ajeno
    if (req.user.role === 'seller' && product.sellerId !== req.user.id) {
      logger.warn(`[ProductOwnership] Seller ${req.user.id} intentó acceder producto ${id} de ${product.sellerId}`);
      return res.status(403).json({ 
        success: false, 
        message: 'No tienes permisos para realizar esta acción en este producto' 
      });
    }

    // ✅ Validación exitosa: Adjunta el producto al request para el controlador
    req.product = product;
    next();

  } catch (error) {
    logger.error(`[ProductOwnership Error] ${error.message}`);
    return res.status(500).json({ 
      success: false, 
      message: 'Error al verificar permisos del producto' 
    });
  }
}

module.exports = verifyProductOwnership;
