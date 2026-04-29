const BaseService = require('./BaseService');
const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

/**
 * Patrón GoF: Strategy — Registro de Estrategias de Precios
 * --------------------------------------------------------------------------
 * Importamos el registro central de estrategias. `resolveStrategy` es la
 * función de despacho que, dado el campo `tipo` del modelo Prisma,
 * retorna la instancia de ConcreteStrategy correspondiente (Physical/Digital).
 * GoF §Strategy — Consecuencia: elimina los condicionales dispersos en el
 * contexto y los encapsula en clases intercambiables.
 */
const { resolveStrategy } = require('./strategies');

/**
 * Capa de Servicios: Catálogo de Productos (Dominio)
 * --------------------------------------------------------------------------
 * Orquesta la lógica fundamental de la mercadería. Implementa patrones de
 * Herencia y Polimorfismo al especializar `BaseService`.
 * 
 * Gestiona tanto productos físicos como digitales, aplicando Reglas de Negocio
 * diferenciadas para el control de inventario (Stock vs Keys). (MVC)
 */

const PRODUCT_INCLUDE = {
    platform: { select: { id: true, slug: true, name: true, imageUrl: true, isActive: true } },
    genre: { select: { id: true, slug: true, name: true, imageUrl: true, isActive: true } },
    _count: { select: { digitalKeys: { where: { status: 'AVAILABLE' } } } },
    reviews: { select: { rating: true } }
};

class ProductService extends BaseService {
    /**
     * @constructor
     * Inyecta la configuración de entidad al motor base de persistencia.
     */
    constructor() {
        super('product', { entityLabel: 'Producto' });
    }

    /**
     * Define el mapa de relaciones 'Eager Loading' para evitar el problema de N+1 queries.
     * RN (3FN): Las relaciones se resuelven con JOINs vía FK usando `include`,
     * sin duplicar datos en tablas de producto.
     * @override Polimorfismo - Especializa la carga relacional del orquestador base.
     * @returns {Object} Configuración de Prisma Include.
     */
    getIncludeRelations() {
        return { 
            ...PRODUCT_INCLUDE, 
            requirements: true, 
            seller: { 
                include: { 
                    sellerProfile: true 
                } 
            } 
        };
    }

    /**
     * Mapeador de Dominio (Entity to DTO).
     * Transforma la estructura cruda de BDD en un objeto de negocio evaluable por el frontend.
     * 
     * @override Polimorfismo - Implementa la transformación específica de Producto.
     * @param {Object} p - Entidad cruda de Prisma.
     * @returns {Object} DTO con precios calculados y stock dinámico.
     */
    toDTO(p) {
        return ProductService.productToDTO(p);
    }

    /**
     * Mapper estático para reutilización en servicios adyacentes (Cart/Wishlist).
     * --------------------------------------------------------------------------
     * Patrón GoF: Strategy — Contexto (Context Role).
     * En lugar de calcular precio y stock con `if/else` según el tipo de producto,
     * delega ambas responsabilidades a la ConcreteStrategy correspondiente.
     *
     * Consecuencia GoF §Strategy — EXTENSIBILIDAD:
     *   "Encapsulating the behavior in separate Strategy classes eliminates these
     *    conditional statements." (Design Patterns, GoF §5)
     * → Agregar un tipo 'Subscription' solo requiere:
     *   1. Crear `SubscriptionStrategy extends PricingStrategy`.
     *   2. Registrarlo en `strategies/index.js`.
     *   Sin modificar esta función.
     */
    static productToDTO(p) {
        if (!p) return null;

        /**
         * Patrón GoF: Strategy — Resolución de Estrategia en Tiempo de Ejecución.
         * `resolveStrategy` actúa como el despacho que conecta el campo `tipo`
         * (string de Prisma) con la instancia de ConcreteStrategy adecuada.
         * GoF §Strategy — Participant: Context delegates to Strategy object.
         */
        const strategy = resolveStrategy(p.type);

        // Delegación al ConcreteStrategy: cálculo de precio con descuento.
        const { finalPrice, discountPercentage } = strategy.calculatePrice(p);

        // Delegación al ConcreteStrategy: cálculo de stock por tipología.
        const stock = strategy.calculateStock(p);

        return {
            id: p.id,
            _id: p.id,
            name: p.name,
            description: p.description,
            price: Number(p.price),
            finalPrice,
            discountPercentage,
            discountEndDate: p.discountEndDate,
            platform: p.platform ? {
                id: p.platform.id,
                slug: p.platform.slug,
                name: p.platform.name,
                imageId: p.platform.imageUrl,
                active: p.platform.isActive
            } : { id: p.platformId, name: 'Sin clasificar', active: false },
            genre: p.genre ? {
                id: p.genre.id,
                slug: p.genre.slug,
                name: p.genre.name,
                imageId: p.genre.imageUrl,
                active: p.genre.isActive
            } : { id: p.genreId, name: 'Sin clasificar', active: false },
            type: p.type === 'PHYSICAL' ? 'Physical' : 'Digital',
            releaseDate: p.releaseDate,
            developer: p.developer,
            imageId: p.imageUrl || 'https://placehold.co/600x400?text=Sin+Imagen',
            trailerUrl: p.trailerUrl || '',
            // RN: El rating se deriva dinámicamente de p.reviews si está disponible
            rating: p.reviews?.length ? Number((p.reviews.reduce((acc, curr) => acc + curr.rating, 0) / p.reviews.length).toFixed(1)) : 0,
            // RN (Stock): Calculado por la ConcreteStrategy según tipología de producto.
            stock,
            active: p.isActive,
            specPreset: p.specPreset,
            requirements: p.requirements
                ? Object.fromEntries(
                    ['minimum', 'recommended'].map(tipo => [tipo,
                        Object.fromEntries((p.requirements.filter(r => r.type.toLowerCase() === tipo)).map(r => [r.key, r.value]))
                    ])
                )
                : {},
            order: p.displayOrder,
            seller: p.seller ? {
                id: p.seller.id,
                name: p.seller.name,
                storeName: p.seller.sellerProfile?.storeName || 'Tienda Oficial'
            } : null
        };
    }

    /**
     * Consulta el catálogo aplicando filtros multidimensionales y paginación.
     * Mantenibilidad: Desacopla los parámetros de URL hacia cláusulas WHERE de Prisma.
     * 
     * @param {Object} query - Criterios de filtrado { search, platform, genre, prices, etc }.
     * @returns {Object} Data DTO y Meta información del cursor.
     */
    async getProducts(query = {}) {
        const { search, platform, genre, minPrice, maxPrice, page = 1, limit = 10, sort, discounted, includeInactive, sellerId } = query;

        const includeInactiveFlag = includeInactive === true || includeInactive === 'true';
        const where = includeInactiveFlag ? {} : { isActive: true };

        // RN - Búsqueda: Sensible a múltiples campos (Match Parcial Insensible).
        if (search) {
            where.AND = where.AND || [];
            where.AND.push({
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                    { developer: { contains: search, mode: 'insensitive' } },
                ]
            });
        }

        // RN (Seguridad y Multi-vendedor): Si hay sellerId, restringimos los resultados.
        if (sellerId) {
            where.sellerId = sellerId;
        }

        // RN - Filtrado Taxonómico: Soporta búsqueda múltiple (OR) por Slugs.
        if (platform) {
            const platforms = platform.split(',').filter(Boolean);
            if (platforms.length > 0) {
                const platformRecords = await prisma.platform.findMany({ 
                    where: { OR: [{ slug: { in: platforms } }, { id: { in: platforms } }] } 
                });
                where.platformId = { in: platformRecords.map(p => p.id) };
            }
        }

        if (genre) {
            const genres = genre.split(',').filter(Boolean);
            if (genres.length > 0) {
                const genreRecords = await prisma.genre.findMany({ 
                    where: { OR: [{ slug: { in: genres } }, { id: { in: genres } }] } 
                });
                where.genreId = { in: genreRecords.map(g => g.id) };
            }
        }

        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price.gte = Number(minPrice);
            if (maxPrice) where.price.lte = Number(maxPrice);
        }

        if (discounted === true || discounted === 'true') {
            where.AND = where.AND || [];
            where.AND.push({ discountPercent: { gt: 0 } });
            where.AND.push({
                OR: [
                    { discountEndDate: null },
                    { discountEndDate: { gt: new Date() } }
                ]
            });
        }

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));

        const sortMap = {
            'price': { price: 'asc' },
            '-price': { price: 'desc' },
            'rating': { reviews: { _count: 'asc' } },
            '-rating': { reviews: { _count: 'desc' } },
            'name': { name: 'asc' },
            '-name': { name: 'desc' },
            'order': { displayOrder: 'asc' },
        };
        const orderBy = (sort && sortMap[sort]) ? sortMap[sort] : { displayOrder: 'asc' };

        const [products, count] = await Promise.all([
            prisma.product.findMany({
                where,
                include: { ...PRODUCT_INCLUDE, requirements: true, seller: { include: { sellerProfile: true } } },
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
                orderBy
            }),
            prisma.product.count({ where })
        ]);

        return {
            data: products.map(p => this.toDTO(p)),
            meta: { total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil(count / limitNum) }
        };
    }

    /**
     * Alias compatible con controladores existentes.
     * Invoca el método base de búsqueda por ID.
     * RN (Contexto): Soporta includeInactive=true para endpoints administrativos.
     * @param {string} id - UUID del producto.
     * @param {object} context - Contexto de consulta.
     * @param {boolean} context.includeInactive - Incluye inactivos cuando el rol lo permite.
     */
    async getProductById(id, context = {}) {
        const { includeInactive = false } = context;
        const product = await this.getById(id, { includeInactive });

        // Si la taxonomia relacionada fue dada de baja, el producto no debe exponerse en tienda publica.
        if (!includeInactive && (product.platform?.active === false || product.genre?.active === false)) {
            throw new ErrorResponse('Producto no disponible', 404);
        }

        return product;
    }

    /**
     * Crea un nuevo registro de producto integrando requisitos de sistema dinámicos.
     * 
     * @param {Object} data - Schema del producto.
     * @returns {Object} DTO del producto creado.
     */
    async createProduct(data) {
        const { name, description, price, platform: platformSlug, genre: genreSlug, platformId, genreId, type,
            releaseDate, developer, imageId, trailerUrl, stock, active, specPreset,
            requirements, discountPercentage, discountEndDate, sellerId } = data;

        // RN - Validación Cruzada: Verifica existencia de dependencias taxonómicas activas.
        let platformRecord = null;
        if (platformId) {
            platformRecord = await prisma.platform.findFirst({ where: { id: platformId, isActive: true } });
        }
        if (!platformRecord && platformSlug) {
            platformRecord = await prisma.platform.findFirst({ where: { slug: platformSlug, isActive: true } });
        }
        if (!platformRecord) throw new ErrorResponse(`Plataforma '${platformSlug}' no encontrada`, 400);

        let genreRecord = null;
        if (genreId) {
            genreRecord = await prisma.genre.findFirst({ where: { id: genreId, isActive: true } });
        }
        if (!genreRecord && genreSlug) {
            genreRecord = await prisma.genre.findFirst({ where: { slug: genreSlug, isActive: true } });
        }
        if (!genreRecord) throw new ErrorResponse(`Género '${genreSlug}' no encontrado`, 400);

        // RN - Ordenamiento default: Los nuevos se ubican al final del stack.
        const firstProduct = await prisma.product.findFirst({ where: { isActive: true }, orderBy: { displayOrder: 'asc' } });
        const newOrder = firstProduct ? firstProduct.displayOrder - 1000 : 0;

        const tipo = type === 'Physical' ? 'PHYSICAL' : 'DIGITAL';

        // Normalización de Requisitos de Hardware para persistencia relación M2M/12 Muitos.
        const requirementsData = [];
        if (requirements && typeof requirements === 'object') {
            for (const [tipo_, specs] of Object.entries(requirements)) {
                if (specs && typeof specs === 'object') {
                    for (const [key, value] of Object.entries(specs)) {
                        if (value != null) requirementsData.push({ 
                            type: tipo_.toUpperCase() === 'MINIMUM' ? 'MINIMUM' : 'RECOMMENDED', 
                            key, 
                            value: String(value) 
                        });
                    }
                }
            }
        }

        const product = await prisma.product.create({
            data: {
                name,
                description,
                price,
                platformId: platformRecord.id,
                genreId: genreRecord.id,
                type: tipo,
                releaseDate: releaseDate ? new Date(releaseDate) : new Date(),
                developer,
                imageUrl: imageId || 'https://placehold.co/600x400?text=Sin+Imagen',
                trailerUrl: trailerUrl || null,
                stock: tipo === 'DIGITAL' ? 0 : (stock ?? 0),
                isActive: active !== undefined ? active : true,
                specPreset: specPreset ? specPreset.toUpperCase() : null,
                discountPercent: discountPercentage ?? 0,
                discountEndDate: discountEndDate ? new Date(discountEndDate) : null,
                displayOrder: newOrder,
                sellerId,
                requirements: { create: requirementsData }
            },
            include: { ...PRODUCT_INCLUDE, requirements: true, seller: { include: { sellerProfile: true } } }
        });

        logger.info(`[ProductService] Producto creado: ${product.id}`);
        return this.toDTO(product);
    }

    /**
     * Actualización parcial o total de la entidad.
     * Mantenibilidad: Implementa limpieza de relaciones previas antes de re-insertar requisitos.
     */
    async updateProduct(id, data) {
        const existing = await prisma.product.findUnique({ where: { id } });
        if (!existing) throw new ErrorResponse('Producto no encontrado', 404);

        const updateData = {};
        const fields = ['name', 'description', 'price', 'developer', 'imageId:imageUrl', 'trailerUrl', 'active:isActive', 'specPreset', 'discountPercentage:discountPercent'];
        
        fields.forEach(field => {
            const [src, dest] = field.split(':');
            const target = dest || src;
            if (data[src] !== undefined) updateData[target] = data[src];
        });

        // RN - Normalización de Enums (3NF): Prisma es case-sensitive.
        if (updateData.specPreset) {
            updateData.specPreset = updateData.specPreset.toUpperCase();
        }

        if (data.releaseDate !== undefined) updateData.releaseDate = new Date(data.releaseDate);
        if (data.discountEndDate !== undefined) updateData.discountEndDate = data.discountEndDate ? new Date(data.discountEndDate) : null;
        if (data.type !== undefined) updateData.type = data.type === 'Physical' ? 'PHYSICAL' : 'DIGITAL';

        const effectiveType = updateData.type || existing.type;

        if (data.platformId !== undefined) {
            const p = await prisma.platform.findFirst({ where: { id: data.platformId, isActive: true } });
            if (p) updateData.platformId = p.id;
        } else if (data.platform !== undefined) {
            const p = await prisma.platform.findFirst({ where: { slug: data.platform, isActive: true } });
            if (p) updateData.platformId = p.id;
        }

        if (data.genreId !== undefined) {
            const g = await prisma.genre.findFirst({ where: { id: data.genreId, isActive: true } });
            if (g) updateData.genreId = g.id;
        } else if (data.genre !== undefined) {
            const g = await prisma.genre.findFirst({ where: { slug: data.genre, isActive: true } });
            if (g) updateData.genreId = g.id;
        }

        if (data.stock !== undefined && effectiveType !== 'DIGITAL') {
            updateData.stock = Number(data.stock);
        }

        // RN - Integridad de Inventario Digital: El stock de productos digitales
        // siempre se deriva del conteo de keys disponibles.
        if (effectiveType === 'DIGITAL') {
            const digitalStock = await prisma.digitalKey.count({
                where: { productId: id, status: 'AVAILABLE' }
            });
            updateData.stock = digitalStock;
        }

        // Manejo de Excepciones en Relaciones: Si vienen requisitos nuevos, borra los anteriores 
        // para asegurar consistencia del estado.
        if (data.requirements !== undefined) {
            await prisma.productRequirement.deleteMany({ where: { productId: id } });
            const reqs = [];
            for (const [tipo_, specs] of Object.entries(data.requirements || {})) {
                if (specs && typeof specs === 'object') {
                    for (const [key, value] of Object.entries(specs)) {
                        if (value != null) reqs.push({ 
                            productId: id, 
                            type: tipo_.toUpperCase() === 'MINIMUM' ? 'MINIMUM' : 'RECOMMENDED', 
                            key, 
                            value: String(value) 
                        });
                    }
                }
            }
            if (reqs.length > 0) {
                await prisma.productRequirement.createMany({ data: reqs });
            }
        }

        const updated = await prisma.product.update({
            where: { id },
            data: updateData,
            include: { ...PRODUCT_INCLUDE, requirements: true }
        });

        return this.toDTO(updated);
    }

    /**
     * Eliminación Lógica (Soft Delete).
     * @override Polimorfismo - Redefine la destrucción física base para preservar integridad histórica.
     */
    async deleteProduct(id) {
        const product = await prisma.product.findUnique({ where: { id } });
        if (!product) throw new ErrorResponse('Producto no encontrado', 404);
        
        // RN - Integridad Composite (Patrón GoF): Antes de desactivar el producto,
        // limpiamos sus relaciones en BundleItem para evitar huérfanos.
        // Esto asegura que el árbol del Composite no quede en estado inconsistente.
        await prisma.bundleItem.deleteMany({
            where: { OR: [{ bundleId: id }, { productId: id }] }
        }).catch(() => {}); // catch silencioso: si la tabla no existe aún, no bloqueamos
        
        // RN - Integridad Histórica: El producto no se borra (SQL DELETE), se desactiva.
        await prisma.product.update({ where: { id }, data: { isActive: false } });
        logger.warn(`[ProductService] Producto dado de baja lógica: ${id}`);
        return true;
    }

    async deleteProducts(ids) {
        // Limpieza de relaciones Bundle antes de la desactivación masiva
        await prisma.bundleItem.deleteMany({
            where: { OR: [{ bundleId: { in: ids } }, { productId: { in: ids } }] }
        }).catch(() => {});

        return await prisma.product.updateMany({
            where: { id: { in: ids } },
            data: { isActive: false }
        });
    }

    /**
     * Valida que un usuario (seller o admin) tenga permisos para eliminar un conjunto de productos.
     * 
     * RN (Seguridad): 
     * - Admin: Puede eliminar cualquier producto
     * - Seller: Solo puede eliminar sus propios productos
     * 
     * @param {string[]} ids - Array de IDs de productos
     * @param {string} userId - ID del usuario autenticado
     * @param {string} userRole - Rol del usuario ('admin', 'seller')
     * @returns {Object} { valid: boolean, unauthorizedIds?: string[] }
     */
    async validateProductOwnershipBulk(ids, userId, userRole) {
        if (!ids || ids.length === 0) {
            return { valid: true };
        }

        // Fast-path: Admin tiene acceso global
        if (userRole === 'ADMIN') {
            return { valid: true };
        }

        // Sellers: Valida que todos los productos sean suyos
        const unauthorizedIds = [];
        const products = await prisma.product.findMany({
            where: { id: { in: ids } },
            select: { id: true, sellerId: true }
        });

        for (const product of products) {
            if (product.sellerId !== userId) {
                unauthorizedIds.push(product.id);
            }
        }

        if (unauthorizedIds.length > 0) {
            return { 
                valid: false, 
                unauthorizedIds,
                message: `No tienes permisos para eliminar los productos: ${unauthorizedIds.join(', ')}`
            };
        }

        return { valid: true };
    }

    /**
     * Reordena la posición visual en el escaparate.
     * Algoritmo de "Lexicographical Spacing" para insertar entre dos valores sin colisiones masivas.
     */
    async reorderProduct(id, newPosition) {
        if (newPosition < 1) throw new ErrorResponse('Posición inválida', 400);

        const product = await prisma.product.findUnique({ where: { id } });
        if (!product || !product.isActive) throw new ErrorResponse('Producto no encontrable o inactivo', 404);

        const otherProducts = await prisma.product.findMany({
            where: { id: { not: id }, isActive: true },
            orderBy: { displayOrder: 'asc' }
        });

        let targetIndex = Math.min(Math.max(0, newPosition - 1), otherProducts.length);
        const prevProduct = targetIndex > 0 ? otherProducts[targetIndex - 1] : null;
        const nextProduct = targetIndex < otherProducts.length ? otherProducts[targetIndex] : null;

        if (!prevProduct && !nextProduct) {
            await prisma.product.update({ where: { id }, data: { displayOrder: 1000 } });
            return true;
        }

        let prevOrder = prevProduct ? prevProduct.displayOrder : (nextProduct ? nextProduct.displayOrder - 2000 : 0);
        let nextOrder = nextProduct ? nextProduct.displayOrder : (prevProduct ? prevProduct.displayOrder + 2000 : 2000);
        let newOrder = (prevOrder + nextOrder) / 2;

        // Mitigación de Colisión: Si el espacio decimal se agota, recalibra todo el stack comercial.
        if (Math.abs(newOrder - prevOrder) < 0.005) {
            otherProducts.splice(targetIndex, 0, product);
            await Promise.all(otherProducts.map((p, index) =>
                prisma.product.update({ where: { id: p.id }, data: { displayOrder: (index + 1) * 1000 } })
            ));
            return true;
        }

        await prisma.product.update({ where: { id }, data: { displayOrder: newOrder } });
        return true;
    }
}

module.exports = new ProductService();