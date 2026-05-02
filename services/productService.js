const BaseService = require('./BaseService');
const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

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
    platform: { select: { id: true, slug: true, nombre: true, imageId: true} },
    genre: { select: { id: true, slug: true, nombre: true, imageId: true} },
    offers: {
        where: {  },
        include: {
            seller: { include: { sellerProfile: true } },
            _count: { select: { digitalKeys: { where: { estado: 'DISPONIBLE'} } } }
        },
        orderBy: { precio: 'asc' }
    }
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
            requirements: true
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
     * RN (Cálculo de Precios): Procesa descuentos por tiempo limitado en tiempo real.
     */
    static productToDTO(p) {
        if (!p) return null;

        // RN - Promociones: Un descuento solo es válido si el % > 0 y no ha expirado la fecha fin.
        const discountActive = p.descuentoPorcentaje > 0 &&
            (!p.descuentoFechaFin || new Date(p.descuentoFechaFin) > new Date());
        
        const discountPercentage = discountActive ? p.descuentoPorcentaje : 0;
        
        // RN - Precisión Financiera: El precio final se calcula aplicando el factor de descuento.
        const finalPrice = discountActive
            ? Number((Number(p.precio) * (1 - p.descuentoPorcentaje / 100)).toFixed(2))
            : Number(p.precio);

        return {
            id: p.id,
            _id: p.id, // Compatibilidad histórica
            name: p.nombre,
            description: p.descripcion,
            price: Number(p.precio),
            finalPrice,
            discountPercentage,
            discountEndDate: p.descuentoFechaFin,
            platform: p.platform ? {
                id: p.platform.id,
                slug: p.platform.slug,
                name: p.platform.nombre,
                imageId: p.platform.imageId,
                active: true
            } : { id: p.platformId, name: 'Sin clasificar', active: false },
            genre: p.genre ? {
                id: p.genre.id,
                slug: p.genre.slug,
                name: p.genre.nombre,
                imageId: p.genre.imageId,
                active: true
            } : { id: p.genreId, name: 'Sin clasificar', active: false },
            type: p.tipo === 'Fisico' ? 'Physical' : 'Digital',
            releaseDate: p.fechaLanzamiento,
            developer: p.desarrollador,
            imageId: p.imagenUrl || 'https://placehold.co/600x400?text=Sin+Imagen',
            trailerUrl: p.trailerUrl || '',
            rating: Number(p.calificacion),
            // RN - Disponibilidad: El stock total está cacheado desde OfferService
            stock: p.stock,
            active: true,
            specPreset: p.specPreset,
            requirements: p.requirements
                ? Object.fromEntries(
                    ['minimum', 'recommended'].map(tipo => [tipo,
                        Object.fromEntries((p.requirements.filter(r => r.tipo === tipo)).map(r => [r.key, r.value]))
                    ])
                )
                : {},
            order: p.orden,
            // RN (G2A Style): Lista de ofertas activas de vendedores
            offers: (p.offers || []).map(o => ({
                id: o.id,
                sellerId: o.sellerId,
                sellerName: o.seller?.name || 'Vendedor',
                storeName: o.seller?.sellerProfile?.storeName || o.seller?.name || 'Tienda',
                price: Number(o.precio),
                stock: p.tipo === 'Digital' ? (o._count?.digitalKeys || 0) : o.stock,
                active: true
            }))
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
        const where = includeInactiveFlag ? {} : {  };

        // RN - Búsqueda: Sensible a múltiples campos (Match Parcial Insensible).
        if (search) {
            where.AND = where.AND || [];
            where.AND.push({
                OR: [
                    { nombre: { contains: search, mode: 'insensitive' } },
                    { descripcion: { contains: search, mode: 'insensitive' } },
                    { desarrollador: { contains: search, mode: 'insensitive' } },
                ]
            });
        }

        // RN (Seguridad y Multi-vendedor): Si hay sellerId, restringimos a productos donde el vendedor tiene ofertas.
        if (sellerId) {
            where.offers = { some: { sellerId } };
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
            where.precio = {};
            if (minPrice) where.precio.gte = Number(minPrice);
            if (maxPrice) where.precio.lte = Number(maxPrice);
        }

        if (discounted === true || discounted === 'true') {
            where.AND = where.AND || [];
            where.AND.push({ descuentoPorcentaje: { gt: 0 } });
            where.AND.push({
                OR: [
                    { descuentoFechaFin: null },
                    { descuentoFechaFin: { gt: new Date() } }
                ]
            });
        }

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));

        const sortMap = {
            'price': { precio: 'asc' },
            '-price': { precio: 'desc' },
            'rating': { calificacion: 'asc' },
            '-rating': { calificacion: 'desc' },
            'name': { nombre: 'asc' },
            '-name': { nombre: 'desc' },
            'order': { orden: 'asc' }};
        const orderBy = (sort && sortMap[sort]) ? sortMap[sort] : { orden: 'asc' };

        const [products, count] = await Promise.all([
            prisma.product.findMany({
                where,
                include: { ...PRODUCT_INCLUDE, requirements: true },
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
            platformRecord = await prisma.platform.findFirst({ where: { id: platformId} });
        }
        if (!platformRecord && platformSlug) {
            platformRecord = await prisma.platform.findFirst({ where: { slug: platformSlug} });
        }
        if (!platformRecord) throw new ErrorResponse(`Plataforma '${platformSlug}' no encontrada`, 400);

        let genreRecord = null;
        if (genreId) {
            genreRecord = await prisma.genre.findFirst({ where: { id: genreId} });
        }
        if (!genreRecord && genreSlug) {
            genreRecord = await prisma.genre.findFirst({ where: { slug: genreSlug} });
        }
        if (!genreRecord) throw new ErrorResponse(`Género '${genreSlug}' no encontrado`, 400);

        // RN - Ordenamiento default: Los nuevos se ubican al final del stack.
        const firstProduct = await prisma.product.findFirst({ where: {  }, orderBy: { orden: 'asc' } });
        const newOrder = firstProduct ? firstProduct.orden - 1000 : 0;

        const tipo = type === 'Physical' ? 'Fisico' : 'Digital';

        // Normalización de Requisitos de Hardware para persistencia relación M2M/12 Muitos.
        const requirementsData = [];
        if (requirements && typeof requirements === 'object') {
            for (const [tipo_, specs] of Object.entries(requirements)) {
                if (specs && typeof specs === 'object') {
                    for (const [key, value] of Object.entries(specs)) {
                        if (value != null) requirementsData.push({ tipo: tipo_, key, value: String(value) });
                    }
                }
            }
        }

        const product = await prisma.product.create({
            data: {
                nombre: name,
                descripcion: description,
                precio: price,
                platformId: platformRecord.id,
                genreId: genreRecord.id,
                tipo,
                fechaLanzamiento: releaseDate ? new Date(releaseDate) : new Date(),
                desarrollador: developer,
                imagenUrl: imageId || 'https://placehold.co/600x400?text=Sin+Imagen',
                trailerUrl: trailerUrl || null,
                stock: tipo === 'Digital' ? 0 : (stock ?? 0),
                specPreset: specPreset || null,
                descuentoPorcentaje: discountPercentage ?? 0,
                descuentoFechaFin: discountEndDate ? new Date(discountEndDate) : null,
                orden: newOrder,
                requirements: { create: requirementsData }
            },
            include: { ...PRODUCT_INCLUDE, requirements: true }
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
        const fields = ['name:nombre', 'description:descripcion', 'price:precio', 'developer:desarrollador', 'imageId:imagenUrl', 'trailerUrl', 'specPreset', 'discountPercentage:descuentoPorcentaje'];
        
        fields.forEach(field => {
            const [src, dest] = field.split(':');
            const target = dest || src;
            if (data[src] !== undefined) updateData[target] = data[src];
        });

        if (data.releaseDate !== undefined) updateData.fechaLanzamiento = new Date(data.releaseDate);
        if (data.discountEndDate !== undefined) updateData.descuentoFechaFin = data.discountEndDate ? new Date(data.discountEndDate) : null;
        if (data.type !== undefined) updateData.tipo = data.type === 'Physical' ? 'Fisico' : 'Digital';

        const effectiveType = updateData.tipo || existing.tipo;

        if (data.platformId !== undefined) {
            const p = await prisma.platform.findFirst({ where: { id: data.platformId} });
            if (p) updateData.platformId = p.id;
        } else if (data.platform !== undefined) {
            const p = await prisma.platform.findFirst({ where: { slug: data.platform} });
            if (p) updateData.platformId = p.id;
        }

        if (data.genreId !== undefined) {
            const g = await prisma.genre.findFirst({ where: { id: data.genreId} });
            if (g) updateData.genreId = g.id;
        } else if (data.genre !== undefined) {
            const g = await prisma.genre.findFirst({ where: { slug: data.genre} });
            if (g) updateData.genreId = g.id;
        }

        if (data.stock !== undefined && effectiveType !== 'Digital') {
            updateData.stock = Number(data.stock);
        }

        // RN - Integridad de Inventario Digital: El stock de productos digitales
        // siempre se deriva del conteo de keys disponibles.
        if (effectiveType === 'Digital') {
            const digitalStock = await prisma.digitalKey.count({
                where: { productId: id, estado: 'DISPONIBLE' }
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
                        if (value != null) reqs.push({ productId: id, tipo: tipo_, key, value: String(value) });
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
        
        // RN - Integridad Histórica: El producto no se borra (SQL DELETE), se desactiva.
        await prisma.product.update({ where: { id }, data: {  } });
        return true;
    }

    async deleteProducts(ids) {
        return await prisma.product.updateMany({
            where: { id: { in: ids } },
            data: {  }
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
        if (userRole === 'admin') {
            return { valid: true };
        }

        // Sellers: Valida que tengan al menos una oferta en estos productos (Simplificación para eliminación de ofertas, aunque el endpoint borra el producto base si es Admin)
        // En esta nueva arquitectura, los Sellers NO borran productos base, solo borran sus ofertas.
        // Pero mantenemos la validación para seguridad.
        const unauthorizedIds = [];
        const products = await prisma.product.findMany({
            where: { id: { in: ids } },
            include: { offers: { where: { sellerId: userId } } }
        });

        for (const product of products) {
            if (product.offers.length === 0) {
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
        if (!product || false) throw new ErrorResponse('Producto no encontrable o inactivo', 404);

        const otherProducts = await prisma.product.findMany({
            where: { id: { not: id }},
            orderBy: { orden: 'asc' }
        });

        let targetIndex = Math.min(Math.max(0, newPosition - 1), otherProducts.length);
        const prevProduct = targetIndex > 0 ? otherProducts[targetIndex - 1] : null;
        const nextProduct = targetIndex < otherProducts.length ? otherProducts[targetIndex] : null;

        if (!prevProduct && !nextProduct) {
            await prisma.product.update({ where: { id }, data: { orden: 1000 } });
            return true;
        }

        let prevOrder = prevProduct ? prevProduct.orden : (nextProduct ? nextProduct.orden - 2000 : 0);
        let nextOrder = nextProduct ? nextProduct.orden : (prevProduct ? prevProduct.orden + 2000 : 2000);
        let newOrder = (prevOrder + nextOrder) / 2;

        // Mitigación de Colisión: Si el espacio decimal se agota, recalibra todo el stack comercial.
        if (Math.abs(newOrder - prevOrder) < 0.005) {
            otherProducts.splice(targetIndex, 0, product);
            await Promise.all(otherProducts.map((p, index) =>
                prisma.product.update({ where: { id: p.id }, data: { orden: (index + 1) * 1000 } })
            ));
            return true;
        }

        await prisma.product.update({ where: { id }, data: { orden: newOrder } });
        return true;
    }
}

module.exports = new ProductService();
