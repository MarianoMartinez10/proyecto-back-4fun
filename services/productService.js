const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

// Include standard product relations
const PRODUCT_INCLUDE = {
    platform: { select: { id: true, slug: true, nombre: true, imageId: true, activo: true } },
    genre: { select: { id: true, slug: true, nombre: true, imageId: true, activo: true } },
    _count: { select: { digitalKeys: { where: { estado: 'DISPONIBLE' } } } },
};

class ProductService {
    productToDTO(p) {
        if (!p) return null;
        const discountActive = p.descuentoPorcentaje > 0 &&
            (!p.descuentoFechaFin || new Date(p.descuentoFechaFin) > new Date());
        const discountPercentage = discountActive ? p.descuentoPorcentaje : 0;
        const finalPrice = discountActive
            ? Number((Number(p.precio) * (1 - p.descuentoPorcentaje / 100)).toFixed(2))
            : Number(p.precio);

        return {
            id: p.id,
            _id: p.id,
            name: p.nombre,
            description: p.descripcion,
            price: Number(p.precio),
            finalPrice,
            discountPercentage,
            discountEndDate: p.descuentoFechaFin,
            platform: p.platform ? {
                id: p.platform.slug,
                name: p.platform.nombre,
                imageId: p.platform.imageId,
                active: p.platform.activo
            } : { id: p.platformId, name: 'Unknown' },
            genre: p.genre ? {
                id: p.genre.slug,
                name: p.genre.nombre,
                imageId: p.genre.imageId,
                active: p.genre.activo
            } : { id: p.genreId, name: 'Unknown' },
            type: p.tipo === 'Fisico' ? 'Physical' : 'Digital',
            releaseDate: p.fechaLanzamiento,
            developer: p.desarrollador,
            imageId: p.imagenUrl || 'https://placehold.co/600x400?text=No+Image',
            trailerUrl: p.trailerUrl || '',
            rating: Number(p.calificacion),
            stock: p.tipo === 'Digital' ? (p._count?.digitalKeys ?? p.stock) : p.stock,
            active: p.activo,
            specPreset: p.specPreset,
            requirements: p.requirements
                ? Object.fromEntries(
                    ['minimum', 'recommended'].map(tipo => [tipo,
                        Object.fromEntries((p.requirements.filter(r => r.tipo === tipo)).map(r => [r.key, r.value]))
                    ])
                )
                : {},
            order: p.orden
        };
    }

    async getProducts(query = {}) {
        const { search, platform, genre, minPrice, maxPrice, page = 1, limit = 10, sort, discounted } = query;

        const where = { activo: true };

        if (search) {
            const searchCondition = {
                OR: [
                    { nombre: { contains: search, mode: 'insensitive' } },
                    { descripcion: { contains: search, mode: 'insensitive' } },
                    { desarrollador: { contains: search, mode: 'insensitive' } },
                ]
            };
            if (!where.AND) where.AND = [];
            where.AND.push(searchCondition);
        }

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

        if (discounted === 'true') {
            where.descuentoPorcentaje = { gt: 0 };
            if (!where.AND) where.AND = [];
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
            'createdAt': { createdAt: 'asc' },
            '-createdAt': { createdAt: 'desc' },
            'order': { orden: 'asc' },
            '-order': { orden: 'desc' },
        };
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
            data: products.map(p => this.productToDTO(p)),
            meta: { total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil(count / limitNum) }
        };
    }

    async getProductById(id) {
        const product = await prisma.product.findUnique({
            where: { id },
            include: { ...PRODUCT_INCLUDE, requirements: true }
        });
        if (!product) throw new ErrorResponse('Producto no encontrado', 404);
        return this.productToDTO(product);
    }

    async createProduct(data) {
        const { name, description, price, platform: platformSlug, genre: genreSlug, type,
            releaseDate, developer, imageId, trailerUrl, stock, active, specPreset,
            requirements, discountPercentage, discountEndDate } = data;

        const platformRecord = await prisma.platform.findFirst({ where: { slug: platformSlug, activo: true } });
        if (!platformRecord) throw new ErrorResponse(`Plataforma '${platformSlug}' no encontrada o inactiva`, 400);

        const genreRecord = await prisma.genre.findFirst({ where: { slug: genreSlug, activo: true } });
        if (!genreRecord) throw new ErrorResponse(`Género '${genreSlug}' no encontrado o inactivo`, 400);

        const firstProduct = await prisma.product.findFirst({ where: { activo: true }, orderBy: { orden: 'asc' } });
        const newOrder = firstProduct ? firstProduct.orden - 1000 : 0;

        const tipo = type === 'Physical' ? 'Fisico' : 'Digital';

        // Normalize requirements to flat array for Prisma
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
                imagenUrl: imageId || 'https://placehold.co/600x400?text=No+Image',
                trailerUrl: trailerUrl || null,
                stock: tipo === 'Digital' ? 0 : (stock ?? 0),
                activo: active !== undefined ? active : true,
                specPreset: specPreset || null,
                descuentoPorcentaje: discountPercentage ?? 0,
                descuentoFechaFin: discountEndDate ? new Date(discountEndDate) : null,
                orden: newOrder,
                requirements: { create: requirementsData }
            },
            include: { ...PRODUCT_INCLUDE, requirements: true }
        });

        logger.info(`Producto creado: ${product.id}`, { nombre: product.nombre });
        return this.productToDTO(product);
    }

    async updateProduct(id, data) {
        const existing = await prisma.product.findUnique({
            where: { id },
            include: { platform: true, genre: true }
        });
        if (!existing) throw new ErrorResponse('Producto no encontrado', 404);

        const updateData = {};

        if (data.name !== undefined) updateData.nombre = data.name;
        if (data.description !== undefined) updateData.descripcion = data.description;
        if (data.price !== undefined) updateData.precio = data.price;
        if (data.releaseDate !== undefined) updateData.fechaLanzamiento = new Date(data.releaseDate);
        if (data.developer !== undefined) updateData.desarrollador = data.developer;
        if (data.imageId !== undefined) updateData.imagenUrl = data.imageId;
        if (data.trailerUrl !== undefined) updateData.trailerUrl = data.trailerUrl;
        if (data.active !== undefined) updateData.activo = data.active;
        if (data.specPreset !== undefined) updateData.specPreset = data.specPreset;
        if (data.discountPercentage !== undefined) updateData.descuentoPorcentaje = data.discountPercentage;
        if (data.discountEndDate !== undefined) updateData.descuentoFechaFin = data.discountEndDate ? new Date(data.discountEndDate) : null;

        if (data.type !== undefined) {
            updateData.tipo = data.type === 'Physical' ? 'Fisico' : 'Digital';
        }

        if (data.platform !== undefined) {
            const p = await prisma.platform.findFirst({ where: { slug: data.platform, activo: true } });
            if (!p) throw new ErrorResponse(`Plataforma '${data.platform}' no encontrada`, 400);
            updateData.platformId = p.id;
        }

        if (data.genre !== undefined) {
            const g = await prisma.genre.findFirst({ where: { slug: data.genre, activo: true } });
            if (!g) throw new ErrorResponse(`Género '${data.genre}' no encontrado`, 400);
            updateData.genreId = g.id;
        }

        if (data.stock !== undefined) {
            updateData.stock = data.stock;
        }

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

        return this.productToDTO(updated);
    }

    async deleteProduct(id) {
        const product = await prisma.product.findUnique({ where: { id } });
        if (!product) throw new ErrorResponse('Producto no encontrado', 404);
        await prisma.product.update({ where: { id }, data: { activo: false } });
        return true;
    }

    async deleteProducts(ids) {
        const result = await prisma.product.updateMany({
            where: { id: { in: ids } },
            data: { activo: false }
        });
        return result;
    }

    async reorderProduct(id, newPosition) {
        if (newPosition < 1) throw new ErrorResponse('Posición inválida', 400);

        const product = await prisma.product.findUnique({ where: { id } });
        if (!product) throw new ErrorResponse('Producto no encontrado', 404);
        if (!product.activo) throw new ErrorResponse('No se puede reordenar un producto inactivo', 400);

        const otherProducts = await prisma.product.findMany({
            where: { id: { not: id }, activo: true },
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

        if (Math.abs(newOrder - prevOrder) < 0.005 || Math.abs(newOrder - nextOrder) < 0.005) {
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