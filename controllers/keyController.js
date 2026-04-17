/**
 * Capa de Controladores: Gestión de Llaves Digitales (Inventory)
 * --------------------------------------------------------------------------
 * Concentra la operativa del inventario físico/digital. Su diseño protege
 * el acceso desde clientes, ya que todas las interacciones aquí son de 
 * dominio Administrativo (Carga, Revocación, Vistas maestras).
 */

const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

/**
 * Inserta un lote de claves digitales y actualiza el contador de stock del producto.
 * 
 * @param {Object} req - Body esperando { productId, keys: [string] }.
 * @param {Object} res - Respuesta HTTP serializada.
 * @param {Function} next - Trampa de excepciones.
 */
exports.addKeys = async (req, res, next) => {
    try {
        const { productId, keys } = req.body;

        if (!productId) throw new ErrorResponse('ProductId requerido', 400);
        if (!keys || !Array.isArray(keys) || keys.length === 0) {
            throw new ErrorResponse('Se requiere un array de keys no vacío', 400);
        }

        // RN (Validación Estructural): Las llaves digitales solo aplican a mercadería compatible.
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new ErrorResponse('Producto no encontrado', 404);
        if (product.tipo !== 'Digital') throw new ErrorResponse('El producto no es digital', 400);

        // RN (Seguridad Marketplace): Un vendedor solo puede cargar keys a sus propios productos.
        if (req.user.role !== 'admin' && product.sellerId !== req.user.id) {
            throw new ErrorResponse('No tienes permiso para gestionar el inventario de este producto', 403);
        }

        // --- Filtros de Integridad de Datos ---
        // 1. Limpia duplicaciones enviadas accidentalmente en el mismo request por el admin.
        const uniqueKeys = [...new Set(keys)];

        // 2. Compara contra BDD para descartar colisiones con claves históricas.
        const existingKeysDocs = await prisma.digitalKey.findMany({
            where: { clave: { in: uniqueKeys } },
            select: { clave: true }
        });
        const existingKeysSet = new Set(existingKeysDocs.map(k => k.clave));

        const newKeysToInsert = uniqueKeys
            .filter(k => !existingKeysSet.has(k))
            .map(k => ({
                productId: productId,
                clave: k,
                estado: 'DISPONIBLE'
            }));

        if (newKeysToInsert.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No se agregaron keys nuevas (todas ya existían)',
                addedCount: 0
            });
        }

        // --- Operación DML ---
        await prisma.digitalKey.createMany({
            data: newKeysToInsert,
            skipDuplicates: true
        });

        // RN (Sincronía de Caching): Fuerza la actualización del contador 'stock' en Product
        // para mantener el Frontend consistente sin tener que hacer Joins masivos cada vez que un usuario mira el shop.
        const currentTotal = await prisma.digitalKey.count({
            where: { productId: productId, estado: 'DISPONIBLE' }
        });
        
        await prisma.product.update({
            where: { id: productId },
            data: { stock: currentTotal }
        });

        logger.info(`🔑 ${newKeysToInsert.length} keys agregadas para ${product.nombre}`);

        res.status(201).json({
            success: true,
            message: `Se agregaron ${newKeysToInsert.length} keys exitosamente`,
            addedCount: newKeysToInsert.length,
            ignoredCount: uniqueKeys.length - newKeysToInsert.length,
            currentStock: currentTotal
        });

    } catch (error) {
        // Manejo Excepciones (Generalizado): Protege la API de caer si falla el DB Transaction.
        next(error);
    }
};

/**
 * Revoca y expulsa del sistema una llave específica.
 * Usado ante tickets de soporte por claves defectuosas provistas por el proveedor.
 */
exports.deleteKey = async (req, res, next) => {
    try {
        const { id } = req.params;
        const key = await prisma.digitalKey.findUnique({ 
            where: { id },
            include: { product: true } 
        });

        if (!key) throw new ErrorResponse('Key no encontrada', 404);

        // RN (Seguridad): Verificar propiedad antes de la revocación.
        if (req.user.role !== 'admin' && key.product.sellerId !== req.user.id) {
            throw new ErrorResponse('Acceso denegado: No eres el dueño del producto asociado', 403);
        }

        // RN de Seguridad Auditoría: Permite borrar keys traficadas para anularlas en bases de datos externas,
        // pero inyecta un rastro inamovible en el Logger porque afecta la trazabilidad contable de esa orden.
        if (key.estado === 'VENDIDA') {
            logger.warn(`🗑️ Admin borrando key VENDIDA: ${key.clave} (Orden: ${key.orderId})`);
        }

        const productId = key.productId;
        await prisma.digitalKey.delete({ where: { id } });

        // RN Sincronía: Recalibra el master data del stock total tras la evaporación del ítem.
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (product) {
            const count = await prisma.digitalKey.count({
                where: { productId: productId, estado: 'DISPONIBLE' }
            });
            await prisma.product.update({
                where: { id: productId },
                data: { stock: count }
            });

            return res.json({ success: true, message: 'Key eliminada', currentStock: count });
        }

        res.json({ success: true, message: 'Key eliminada', currentStock: 0 });
    } catch (error) {
        next(error);
    }
};

/**
 * Sirve al Panel Admin el catálogo interno de licencias asociadas a un producto raíz.
 */
exports.getKeysByProduct = async (req, res, next) => {
    try {
        const { productId } = req.params;

        // RN (Seguridad): Validar que el solicitante sea dueño o administrador.
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new ErrorResponse('Producto no encontrado', 404);
        
        if (req.user.role !== 'admin' && product.sellerId !== req.user.id) {
            throw new ErrorResponse('Acceso denegado: No tienes acceso a la auditoría de este producto', 403);
        }
        
        // Paginado/Limiting estricto forzado en Capa Controller para asegurar mantenibilidad de memoria.
        const keys = await prisma.digitalKey.findMany({
            where: { productId: productId },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        res.json({ success: true, count: keys.length, data: keys });
    } catch (error) {
        next(error);
    }
};
