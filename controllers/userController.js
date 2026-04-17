/**
 * Capa de Controladores: Gestión de Usuarios (Admin)
 * --------------------------------------------------------------------------
 * Facilita el ABM de cuentas cliente para el Panel de Control.
 */

const UserService = require('../services/userService');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');
const prisma = require('../lib/prisma');

/**
 * Despliega listado masivo con indexación filtrada.
 * 
 * @param {Object} req - Peticiones de búsqueda y offset de paginación.
 * @param {Object} res - JSON unificado.
 * @param {Function} next - Trampa de excepciones.
 */
exports.getUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const role = req.query.role || '';

    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (role && ['buyer', 'seller', 'admin'].includes(role)) {
      where.role = role;
    }

    const skip = (page - 1) * limit;
    
    // Tolerancia MVC: Ejecución concurrente in-controller de queries estructurales
    // para optimizar el cuello de botella al compilar la grilla de front-end.
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isVerified: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      })
    ]);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: users.map(u => ({ ...u, _id: u.id }))
    });

  } catch (error) {
    logger.error('Error getting users:', error);
    next(error);
  }
};

/**
 * Compila una biometría profunda acoplando el KYC del usuario con su traza contable.
 */
exports.getUserById = async (req, res, next) => {
  try {
    const user = await UserService.getUserById(req.params.id);

    // Mantenibilidad: Se acopla recuento logístico en línea para ahorrar requests adyacentes.
    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { orderItems: true, shippingAddress: true }
    });

    const paidOrders = orders.filter(o => o.isPaid);
    const totalSpent = paidOrders.reduce((sum, o) => sum + Number(o.totalPrice), 0);
    const lastOrderDate = paidOrders.length > 0 ? paidOrders[0].createdAt : null;

    res.status(200).json({
      success: true,
      data: {
        ...user,
        stats: { totalSpent, orderCount: paidOrders.length, totalOrders: orders.length, lastOrderDate },
        orders: orders.map(o => ({
          id: o.id,
          createdAt: o.createdAt,
          totalPrice: Number(o.totalPrice),
          orderStatus: o.orderStatus,
          isPaid: o.isPaid,
          itemCount: o.orderItems.length,
          items: o.orderItems.map(i => ({ name: i.name, quantity: i.quantity, price: Number(i.price) }))
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Modificador forzoso de permisos (Privilege Escalation admin-only).
 */
exports.updateUser = async (req, res, next) => {
  try {
    const { role, isVerified, name, email, isApproved } = req.body;

    // RN (Regla de Seguridad Base): Un jerarca no puede degradarse a sí mismo (Lockout prevention).
    if (req.user.id === req.params.id && role && role !== 'admin') {
      throw new ErrorResponse('No puedes cambiar tu propio rol de administrador.', 400);
    }

    const user = await UserService.updateUser(req.params.id, { role, isVerified, name, email, isApproved });

    logger.info(`Usuario actualizado por Admin: ${req.user.email}`, { targetUser: user.email });

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

/**
 * Expulsión del sistema vía Hard-delete.
 */
exports.deleteUser = async (req, res, next) => {
  try {
    // RN (Seguridad): Suicide prevention
    if (req.user.id === req.params.id) {
      throw new ErrorResponse('No puedes eliminar tu propia cuenta de administrador.', 400);
    }

    await UserService.deleteUser(req.params.id);

    logger.warn(`Usuario ELIMINADO por Admin: ${req.user.email}`);

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};
