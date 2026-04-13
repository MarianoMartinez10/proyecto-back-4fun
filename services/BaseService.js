const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

/**
 * BaseService — Clase abstracta base para servicios de dominio.
 *
 * Implementa el patrón Template Method: define el esqueleto de las operaciones
 * CRUD genéricas y delega en los servicios hijos la transformación de datos
 * mediante el método polimórfico `toDTO()`.
 *
 * Los servicios hijos DEBEN sobrescribir:
 *   - `toDTO(entity)` → Transforma la entidad de BD al formato de respuesta API.
 *
 * Los servicios hijos PUEDEN sobrescribir:
 *   - `getSelectFields()` → Campos a seleccionar en consultas (proyección).
 *   - `getIncludeRelations()` → Relaciones a incluir (eager loading).
 *   - `validateBeforeCreate(data)` → Validación previa a la creación.
 *   - `validateBeforeUpdate(id, data)` → Validación previa a la actualización.
 *
 * Principios POO aplicados:
 *   - Encapsulamiento: estado interno (modelName, entityLabel) protegido.
 *   - Herencia: los servicios concretos extienden BaseService.
 *   - Polimorfismo: cada hijo redefine `toDTO()` según su dominio.
 *   - Abstracción: interfaz CRUD unificada independiente de la entidad.
 *
 * @abstract
 */
class BaseService {
    /**
     * @param {string} modelName   - Nombre del modelo Prisma (ej: 'user', 'product')
     * @param {object} options
     * @param {string} options.entityLabel - Nombre legible para logs/errores (ej: 'Usuario')
     */
    constructor(modelName, { entityLabel } = {}) {
        if (new.target === BaseService) {
            throw new Error('BaseService es una clase abstracta y no puede instanciarse directamente.');
        }
        this.modelName = modelName;
        this.model = prisma[modelName];
        this.entityLabel = entityLabel || modelName;

        if (!this.model) {
            throw new Error(`Modelo Prisma "${modelName}" no encontrado. Verificá el schema.`);
        }
    }

    // ── Métodos Template (sobrescribibles por hijos) ──────────────────────

    /**
     * Transforma una entidad de base de datos al DTO de respuesta API.
     * DEBE ser sobrescrito por cada servicio hijo (polimorfismo).
     * @param {object} entity - Entidad cruda de Prisma
     * @returns {object} DTO formateado para la API
     * @abstract
     */
    toDTO(entity) {
        throw new Error(
            `El método toDTO() debe ser implementado por ${this.constructor.name}. ` +
            `Este es un método abstracto de BaseService.`
        );
    }

    /**
     * Define los campos a seleccionar en consultas de lectura.
     * Sobrescribir para restringir la proyección (ej: excluir password).
     * @returns {object|undefined} Objeto select de Prisma, o undefined para todos los campos
     */
    getSelectFields() {
        return undefined;
    }

    /**
     * Define las relaciones a incluir en consultas (eager loading).
     * @returns {object|undefined} Objeto include de Prisma, o undefined sin relaciones
     */
    getIncludeRelations() {
        return undefined;
    }

    /**
     * Hook de validación previo a la creación. Sobrescribir para agregar reglas.
     * @param {object} data - Datos recibidos del controlador
     * @returns {Promise<void>}
     */
    async validateBeforeCreate(data) {
        // Hook opcional — los hijos pueden sobrescribir
    }

    /**
     * Hook de validación previo a la actualización. Sobrescribir para agregar reglas.
     * @param {string} id   - ID de la entidad a actualizar
     * @param {object} data - Datos recibidos del controlador
     * @returns {Promise<void>}
     */
    async validateBeforeUpdate(id, data) {
        // Hook opcional — los hijos pueden sobrescribir
    }

    // ── Operaciones CRUD genéricas (Template Method) ─────────────────────

    /**
     * Obtiene todas las entidades del modelo.
     * Aplica proyección y relaciones definidas por los métodos template.
     * @returns {Promise<Array>} Lista de DTOs
     */
    async getAll() {
        const queryOptions = {};
        const select = this.getSelectFields();
        const include = this.getIncludeRelations();

        if (select) queryOptions.select = select;
        if (include) queryOptions.include = include;

        const entities = await this.model.findMany(queryOptions);
        logger.info(`[${this.constructor.name}] ${this.entityLabel}(s) obtenidos: ${entities.length}`);
        return entities.map(entity => this.toDTO(entity));
    }

    /**
     * Obtiene una entidad por su ID.
     * @param {string} id - UUID de la entidad
     * @returns {Promise<object>} DTO de la entidad
     * @throws {ErrorResponse} 404 si no se encuentra
     */
    async getById(id) {
        const queryOptions = { where: { id } };
        const select = this.getSelectFields();
        const include = this.getIncludeRelations();

        if (select) queryOptions.select = select;
        if (include) queryOptions.include = include;

        const entity = await this.model.findUnique(queryOptions);
        if (!entity) {
            throw new ErrorResponse(`${this.entityLabel} no encontrado`, 404);
        }
        return this.toDTO(entity);
    }

    /**
     * Elimina una entidad por su ID.
     * @param {string} id - UUID de la entidad
     * @returns {Promise<boolean>}
     * @throws {ErrorResponse} 404 si no se encuentra
     */
    async deleteById(id) {
        const entity = await this.model.findUnique({ where: { id } });
        if (!entity) {
            throw new ErrorResponse(`${this.entityLabel} no encontrado`, 404);
        }

        await this.model.delete({ where: { id } });
        logger.info(`[${this.constructor.name}] ${this.entityLabel} eliminado: ${id}`);
        return true;
    }

    /**
     * Cuenta el total de entidades, opcionalmente filtradas.
     * @param {object} where - Filtros Prisma opcionales
     * @returns {Promise<number>}
     */
    async count(where = {}) {
        return this.model.count({ where });
    }
}

module.exports = BaseService;
