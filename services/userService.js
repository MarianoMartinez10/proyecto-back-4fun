const BaseService = require('./BaseService');
const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

/**
 * UserService — Servicio de dominio para la gestión de usuarios.
 *
 * Hereda de BaseService, reutilizando las operaciones CRUD genéricas
 * (getAll, getById, deleteById) y sobrescribiendo los métodos polimórficos:
 *   - toDTO()          → Proyecta los campos seguros del usuario (excluye password).
 *   - getSelectFields() → Restringe la consulta SQL a campos no sensibles.
 *
 * Principios POO demostrados:
 *   - Herencia: extiende BaseService para reutilizar lógica CRUD.
 *   - Polimorfismo: redefine toDTO() y getSelectFields() según el dominio User.
 *   - Encapsulamiento: los campos sensibles (password, tokens) nunca se exponen.
 */
class UserService extends BaseService {
    constructor() {
        super('user', { entityLabel: 'Usuario' });
    }

    /**
     * Campos seguros para proyección en consultas de lectura.
     * Excluye: password, verificationToken, resetPasswordToken, etc.
     * Sobrescribe BaseService.getSelectFields() (polimorfismo).
     * @returns {object} Objeto select de Prisma
     */
    getSelectFields() {
        return {
            id: true,
            name: true,
            email: true,
            avatar: true,
            phone: true,
            address: true,
            role: true,
            isVerified: true,
            createdAt: true
        };
    }

    /**
     * Transforma un User de Prisma al DTO de respuesta API.
     * Sobrescribe BaseService.toDTO() (polimorfismo).
     * @param {object} user - Entidad User de Prisma
     * @returns {object} DTO seguro del usuario
     */
    toDTO(user) {
        return {
            id: user.id,
            _id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar || null,
            phone: user.phone || null,
            address: user.address || null,
            role: user.role,
            isVerified: user.isVerified,
            createdAt: user.createdAt
        };
    }

    // ── Métodos heredados de BaseService (ya disponibles sin código extra):
    //    getAllUsers()  → this.getAll()
    //    getUserById()  → this.getById(id)
    //    deleteUser()   → this.deleteById(id)

    /**
     * Alias para mantener compatibilidad con los controladores existentes.
     * Delega al método genérico heredado getAll().
     */
    async getAllUsers() {
        return this.getAll();
    }

    /**
     * Alias para mantener compatibilidad con los controladores existentes.
     * Delega al método genérico heredado getById().
     */
    async getUserById(id) {
        return this.getById(id);
    }

    /**
     * Actualizar usuario — Lógica específica del dominio User.
     * No puede generalizarse en BaseService porque cada entidad
     * tiene campos y reglas de actualización diferentes.
     * @param {string} id   - UUID del usuario
     * @param {object} data - Campos a actualizar
     * @returns {Promise<object>} DTO del usuario actualizado
     */
    async updateUser(id, data) {
        const { name, email, phone, address } = data;
        const existing = await this.model.findUnique({ where: { id } });
        if (!existing) throw new ErrorResponse('Usuario no encontrado', 404);

        const updated = await this.model.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(email && { email }),
                ...(phone !== undefined && { phone }),
                ...(address !== undefined && { address }),
            },
            select: { id: true, name: true, email: true, role: true, phone: true, address: true }
        });

        logger.info(`[UserService] Usuario actualizado: ${id}`);
        return this.toDTO({ ...existing, ...updated });
    }

    /**
     * Alias para mantener compatibilidad con los controladores existentes.
     * Delega al método genérico heredado deleteById().
     */
    async deleteUser(id) {
        return this.deleteById(id);
    }
}

module.exports = new UserService();
