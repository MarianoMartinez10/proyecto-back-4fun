const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

class UserService {
    // Obtener todos los usuarios
    async getAllUsers() {
        const users = await prisma.user.findMany({
            select: {
                id: true, name: true, email: true, avatar: true,
                phone: true, address: true, role: true, isVerified: true, createdAt: true
            }
        });
        logger.info(`Usuarios obtenidos: ${users.length}`);
        return users.map(u => ({ ...u, _id: u.id }));
    }

    // Obtener usuario por ID
    async getUserById(id) {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true, name: true, email: true, avatar: true,
                phone: true, address: true, role: true, isVerified: true, createdAt: true
            }
        });
        if (!user) throw new ErrorResponse('Usuario no encontrado', 404);
        return { ...user, _id: user.id };
    }

    // Actualizar usuario
    async updateUser(id, data) {
        const { name, email, phone, address } = data;
        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing) throw new ErrorResponse('Usuario no encontrado', 404);

        const updated = await prisma.user.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(email && { email }),
                ...(phone !== undefined && { phone }),
                ...(address !== undefined && { address }),
            },
            select: { id: true, name: true, email: true, role: true, phone: true, address: true }
        });

        logger.info(`Usuario actualizado: ${id}`);
        return { ...updated, _id: updated.id };
    }

    // Eliminar usuario
    async deleteUser(id) {
        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing) throw new ErrorResponse('Usuario no encontrado', 404);

        await prisma.user.delete({ where: { id } });
        logger.info(`Usuario eliminado: ${id}`);
        return true;
    }
}

module.exports = new UserService();
