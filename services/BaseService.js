/**
 * Capa de Servicios: Base de Dominio (Data Access)
 * --------------------------------------------------------------------------
 * Esta clase abstracta fundamenta la arquitectura del sistema al centralizar 
 * el patrón "Template Method". Actúa como la capa más profunda conectada al ORM.
 * Asegura mantenibilidad al evitar repetir lógica CRUD en cada entidad.
 */

const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

class BaseService {
    /**
     * Construye un Servicio acoplado a un modelo específico del ORM Prisma.
     * RN Arquitectura: Previene la instanciación directa (Clase Abstracta).
     * 
     * @param {string} modelName - Nombre exacto del modelo en schema.prisma.
     * @param {object} options - Opciones adicionales.
     * @param {string} options.entityLabel - Nombre semántico para registro en Logs de Error.
     */
    constructor(modelName, { entityLabel, hasActiveField = true } = {}) {
        // Manejo de Excepciones: Bloquea intentos de usar BaseService globalmente en vez de heredar.
        if (new.target === BaseService) {
            throw new Error('BaseService es una clase abstracta y no puede instanciarse directamente.');
        }
        this.modelName = modelName;
        this.model = prisma[modelName];
        this.entityLabel = entityLabel || modelName;
        this.hasActiveField = hasActiveField;

        if (!this.model) {
            throw new Error(`Modelo Prisma "${modelName}" no encontrado. Verificá el schema.`);
        }
    }

    // ── Métodos Template (sobrescribibles por hijos) ──────────────────────

    /**
     * Transforma una entidad cruda DB (Prisma) a un DTO apto para la API.
     * Requiere que el servicio hijo defina el mapeo, previniendo fuga de datos sensibles.
     * 
     * @param {object} entity - Objeto Prisma.
     * @returns {object} DTO limpio.
     * @abstract
     */
    toDTO(entity) {
        throw new Error(
            `El método toDTO() debe ser implementado por ${this.constructor.name}. ` +
            `Este es un método abstracto de BaseService.`
        );
    }

    /**
     * Proyecta campos específicos a traer de la BD. (Por defecto, trae todos).
     */
    getSelectFields() {
        return undefined;
    }

    /**
     * Determina las relaciones ForeignKey a incluir (Eager Loading).
     */
    getIncludeRelations() {
        return undefined;
    }

    /**
     * @param {object} data - Datos antes de creación.
     */
    async validateBeforeCreate(data) { }

    /**
     * @param {string} id - ID del registro.
     * @param {object} data - Datos entrantes para editar.
     */
    async validateBeforeUpdate(id, data) { }

    // ── Operaciones CRUD delegadas por Controladores ─────────────────────

    /**
    * Devuelve colección de registros transformados a DTO.
    * RN (Filtro): Solo retorna registros con estado 'activo: true' para limpieza de datos.
    * RN (Contexto de Rol): El controlador puede habilitar includeInactive=true
    * para rutas administrativas protegidas por RBAC.
    * @param {object} context - Contexto de consulta.
    * @param {boolean} context.includeInactive - Incluye registros inactivos.
    * @returns {Promise<Array>} Lista de registros.
    */
    async getAll(context = {}) {
        const { includeInactive = false } = context;

        // Estructura de consulta con filtro de vitalidad por defecto.
        const queryOptions = {
            where: (this.hasActiveField && !includeInactive) ? { activo: { not: false } } : {}
        };
        
        const select = this.getSelectFields();
        const include = this.getIncludeRelations();

        if (select) queryOptions.select = select;
        if (include) queryOptions.include = include;

        const entities = await this.model.findMany(queryOptions);
        logger.info(
            `[${this.constructor.name}] ${this.entityLabel}(s) obtenidos: ${entities.length}` +
            ` | includeInactive=${includeInactive}`
        );
        return entities.map(entity => this.toDTO(entity));
    }

    /**
    * Devuelve una entidad única.
    * RN (Audit): No permite recuperar objetos marcados como inactivos (Baja Lógica).
    * @param {string} id - Clave primaria UUID.
    * @param {object} context - Contexto de consulta.
    * @param {boolean} context.includeInactive - Habilita lectura de inactivos para admin.
    * @returns {Promise<object>}
    */
    async getById(id, context = {}) {
        const { includeInactive = false } = context;

        const queryOptions = {
            where: (this.hasActiveField && !includeInactive)
                ? { id, activo: { not: false } }
                : { id }
        };
        const select = this.getSelectFields();
        const include = this.getIncludeRelations();

        if (select) queryOptions.select = select;
        if (include) queryOptions.include = include;

        const entity = this.hasActiveField
            ? await this.model.findFirst(queryOptions)
            : await this.model.findUnique(queryOptions);

        if (!entity) {
            throw new ErrorResponse(`${this.entityLabel} no encontrado o dado de baja`, 404);
        }
        return this.toDTO(entity);
    }

    /**
     * Purga lógicamente un registro por su ID (Regla 2 TFI).
     * -------------------------------------------------------------------------
     * En lugar de borrar físicamente (DELETE), muta el estado a 'activo: false'.
     * Esto garantiza la trazabilidad histórica y consistencia referencial.
     * 
     * @param {string} id - UUID del ítem.
     * @returns {Promise<boolean>}
     */
    async deleteById(id) {
        // Verificación de Pre-Existencia
        const entity = await this.model.findUnique({ where: { id } });
        if (!entity) {
            throw new ErrorResponse(`${this.entityLabel} no encontrado`, 404);
        }

        if (this.hasActiveField) {
            // Operación de Mutación (Logical Delete)
            await this.model.update({
                where: { id },
                data: { activo: false }
            });
        } else {
            await this.model.delete({ where: { id } });
        }
        
        logger.warn(`[${this.constructor.name}] ${this.entityLabel} dado de baja lógica: ${id}`);
        return true;
    }

    /**
     * Sumariza cantidades de entidades.
     * @param {object} where - Criterios de Prisma.
     * @returns {Promise<number>}
     */
    async count(where = {}) {
        return this.model.count({ where });
    }
}

module.exports = BaseService;
