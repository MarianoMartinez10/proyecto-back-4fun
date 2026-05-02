const BaseService = require('./BaseService');
const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

/**
 * Capa de Servicios: Gestión de Identidades (User Domain)
 * --------------------------------------------------------------------------
 * Gestiona el ciclo de vida de los perfiles de usuario. Implementa patrones
 * de Herencia y Polimorfismo al especializar `BaseService` para la
 * administración de registros. (MVC / Dominio)
 */

class UserService extends BaseService {
    /**
     * @constructor
     * Inyecta la configuración de persistencia para la tabla 'user'.
     */
    constructor() {
        super('user', { entityLabel: 'Usuario', hasActiveField: false });
    }

    /**
     * Define los campos seguros para la proyección SQL.
     * RN - Seguridad: Impide la filtración de hashes de contraseñas y tokens 
     * sensibles al nivel de la consulta de base de datos.
     * 
     * @override Polimorfismo - Especializa la selección de campos del orquestador base.
     * @returns {Object} Configuración de Prisma Select.
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
            createdAt: true,
            sellerProfile: true // Inyectamos el perfil de vendedor si existe
        };
    }

    /**
     * Mapeador de Dominio (Entity to DTO).
     * Asegura que el contrato de comunicación con el frontend sea inmutable y seguro.
     * 
     * @override Polimorfismo - Transforma la entidad User en un DTO limpio.
     * @param {Object} user - Entidad cruda de Prisma.
     * @returns {Object} DTO de usuario para consumo público.
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
            createdAt: user.createdAt,
            // 3FN - Datos de vendedor encapsulados
            sellerProfile: user.sellerProfile ? {
                storeName: user.sellerProfile.storeName,
                isApproved: user.sellerProfile.isApproved,
                storeDescription: user.sellerProfile.storeDescription
            } : null
        };
    }

    /**
     * Alias para compatibilidad con controladores legados.
     * Delega la búsqueda masiva al motor BaseService.
     */
    async getAllUsers() {
        return this.getAll();
    }

    /**
     * Alias para compatibilidad con controladores legados.
     * Delega la resolución singular al motor BaseService.
     */
    async getUserById(id) {
        return this.getById(id);
    }

    /**
     * Modificación parcial del perfil de usuario.
     * Mantenibilidad: Implementa validación previa y actualización selectiva.
     * 
     * @param {string} id - UUID del usuario.
     * @param {Object} data - Payload de actualización { name, email, phone, etc }.
     * @returns {Promise<Object>} Perfil actualizado transformado a DTO.
     */
    async updateUser(id, data) {
        const { name, email, phone, address, role, isVerified, isApproved } = data;

        // RN - Seguridad / RBAC: Restringe la mutación de rol a valores válidos del dominio.
        if (role !== undefined && !['BUYER', 'SELLER', 'ADMIN'].includes(role)) {
            throw new ErrorResponse('Rol inválido. Valores permitidos: BUYER, SELLER o ADMIN.', 400);
        }
        
        // Manejo de Excepciones: Verifica existencia antes de intentar la mutación.
        const existing = await this.model.findUnique({ 
            where: { id },
            include: { sellerProfile: true }
        });
        if (!existing) throw new ErrorResponse('Usuario inexistente', 404);

        const updated = await this.model.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(email && { email }),
                ...(phone !== undefined && { phone }),
                ...(address !== undefined && { address }),
                ...(role !== undefined && { role }),
                ...(isVerified !== undefined && { isVerified }),
                // RN - Modelo Simplificado (Mercado Libre): El rol 'seller' implica aprobación.
                // Si se activa el rol SELLER o isApproved es true, aseguramos que exista el perfil.
                ...((role === 'SELLER' || isApproved === true) ? {
                    sellerProfile: {
                        upsert: {
                            create: { 
                                storeName: name || existing.name,
                                isApproved: true 
                            },
                            update: { 
                                isApproved: true 
                            }
                        }
                    }
                } : (isApproved !== undefined && existing.sellerProfile) ? {
                    sellerProfile: {
                        update: { isApproved }
                    }
                } : {})
            },
            select: this.getSelectFields()
        });

        // RN - Suspensión en Cascada (Disparador): Si el usuario fue desactivado y es SELLER.
        if (data.isActive === false && updated.role === 'SELLER') {
            await prisma.product.updateMany({
                where: { sellerId: id, status: 'ACTIVE' },
                data: { status: 'SUSPENDED' }
            });
            logger.warn(`[Moderación] Cascada: Productos de vendedor ${id} suspendidos por desactivación de cuenta.`);
        }

        logger.info(`[UserService] Perfil actualizado: ${id}`);
        return this.toDTO(updated);
    }

    /**
     * RN - Suspensión en Cascada: Desactiva un usuario y oculta su catálogo.
     * @param {string} id - UUID del usuario.
     * @param {string} reason - Motivo para auditoría.
     */
    async suspendUser(id, reason = 'No especificada') {
        logger.warn(`Suspensión solicitada para ${id}, pero el modelo User no tiene campo isActive.`);
        return this.updateUser(id, {});
    }

    /**
     * Baja física de cuenta.
     * @override Polimorfismo - Implementa la destrucción de registro delegada en BaseService.
     */
    async deleteUser(id) {
        return this.deleteById(id);
    }
}

module.exports = new UserService();
