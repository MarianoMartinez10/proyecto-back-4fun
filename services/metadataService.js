const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

class MetadataService {
    /**
     * @param {'platform'|'genre'} modelName
     * @param {object} labels
     */
    constructor(modelName, { singular, plural, notFoundMsg, productField }) {
        this.modelName = modelName;
        this.model = prisma[modelName];
        this.singular = singular;
        this.plural = plural;
        this.notFoundMsg = notFoundMsg;
        this.productField = productField;
    }

    // DTO mapper: Prisma entity → API response
    toDTO(doc) {
        return {
            id: doc.id,
            name: doc.nombre,
            imageId: doc.imageId,
            active: doc.activo,
        };
    }

    async getAll() {
        const docs = await this.model.findMany({ where: { activo: true } });
        logger.info(`${this.plural} obtenidos: ${docs.length}`);
        return docs.map(this.toDTO);
    }

    async getById(id) {
        // Intentar por slug primero, luego por UUID
        let doc = await this.model.findFirst({ where: { slug: id } });
        if (!doc) {
            doc = await this.model.findFirst({ where: { id } });
        }
        if (!doc) throw new ErrorResponse(this.notFoundMsg || `${this.singular} no encontrado`, 404);
        return this.toDTO(doc);
    }

    async create(data) {
        const { id: slug, name, imageId, active } = data;
        if (!slug) throw new ErrorResponse('El ID personalizado (slug) es requerido', 400);

        const existing = await this.model.findFirst({ where: { slug } });
        if (existing) throw new ErrorResponse(`Ya existe un(a) ${this.singular} con ese ID`, 400);

        const doc = await this.model.create({
            data: { slug, nombre: name, imageId, activo: active !== undefined ? active : true }
        });
        logger.info(`${this.singular} creado: ${doc.slug}`);
        return this.toDTO(doc);
    }

    async update(id, data) {
        const { name, imageId, active, newId: newSlug } = data;
        const updateData = {};
        if (name !== undefined) updateData.nombre = name;
        if (imageId !== undefined) updateData.imageId = imageId;
        if (active !== undefined) updateData.activo = active;

        let doc = await this.model.findFirst({ where: { slug: id } });
        if (!doc) throw new ErrorResponse(this.notFoundMsg || `${this.singular} no encontrado`, 404);

        if (newSlug && newSlug !== id) {
            const existing = await this.model.findFirst({ where: { slug: newSlug } });
            if (existing) throw new ErrorResponse(`El ID '${newSlug}' ya está en uso`, 400);
            updateData.slug = newSlug;
        }

        const updated = await this.model.update({ where: { id: doc.id }, data: updateData });

        // Si cambió el slug, actualizar FK en Product
        if (newSlug && newSlug !== id && this.productField) {
            const count = await prisma.product.updateMany({
                where: { [this.productField]: doc.id },
                data: { [this.productField]: updated.id }
            });
            logger.info(`Migrados ${count.count} productos de ${this.singular} '${id}' a '${newSlug}'`);
        }

        return this.toDTO(updated);
    }

    async deleteOne(id) {
        let doc = await this.model.findFirst({ where: { slug: id } });
        if (!doc) doc = await this.model.findFirst({ where: { id } });
        if (!doc) throw new ErrorResponse(this.notFoundMsg || `${this.singular} no encontrado`, 404);

        await this.model.update({ where: { id: doc.id }, data: { activo: false } });
        logger.info(`${this.singular} eliminado (soft delete): ${id}`);
        return true;
    }

    async deleteMany(ids) {
        if (!ids || ids.length === 0) throw new ErrorResponse('No se proporcionaron IDs', 400);

        const result = await this.model.updateMany({
            where: { OR: [{ slug: { in: ids } }, { id: { in: ids } }] },
            data: { activo: false }
        });
        logger.info(`${this.plural} eliminados (soft delete): ${result.count}`);
        return result;
    }
}

module.exports = MetadataService;
