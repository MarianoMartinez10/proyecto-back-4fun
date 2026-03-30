const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

// @desc    Obtener lista de usuarios con paginación, búsqueda y filtros
// @route   GET /api/users
// @access  Private/Admin
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

    if (role && ['user', 'admin'].includes(role)) {
      where.role = role;
    }

    const skip = (page - 1) * limit;
    
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
      data: users
    });

  } catch (error) {
    logger.error('Error getting users:', error);
    next(error);
  }
};

// @desc    Obtener detalle de usuario con métricas CRM (LTV, Última compra)
// @route   GET /api/users/:id
// @access  Private/Admin
exports.getUserById = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isVerified: true,
        createdAt: true
      }
    });

    if (!user) {
      throw new ErrorResponse('Usuario no encontrado', 404);
    }

    // --- CRM ANALYTICS ---
    const orders = await prisma.order.findMany({
      where: { userId: user.id, isPaid: true },
      select: { totalPrice: true, createdAt: true }
    });

    const totalSpent = orders.reduce((sum, order) => sum + order.totalPrice, 0);
    const orderCount = orders.length;
    const lastOrderDate = orders.length > 0 ? orders.map(o => o.createdAt).sort((a, b) => b - a)[0] : null;

    const userCRM = {
      ...user,
      stats: { totalSpent, orderCount, lastOrderDate }
    };

    res.status(200).json({
      success: true,
      data: userCRM
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Actualizar usuario (Rol, Verificación)
// @route   PUT /api/users/:id
// @access  Private/Admin
exports.updateUser = async (req, res, next) => {
  try {
    const { role, isVerified, name, email } = req.body;

    // Validación preventiva
    if (req.user.id === req.params.id && role && role !== 'admin') {
      // Ignoramos auto-degradación
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(role && { role }),
        ...(isVerified !== undefined && { isVerified }),
        ...(name && { name }),
        ...(email && { email })
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isVerified: true,
        createdAt: true
      }
    }).catch(err => {
      if (err.code === 'P2025') throw new ErrorResponse('Usuario no encontrado', 404);
      throw err;
    });

    logger.info(`Usuario actualizado por Admin: ${req.user.email}`, { targetUser: user.email });

    res.status(200).json({
      success: true,
      data: user
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Eliminar usuario
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res, next) => {
  try {
    if (req.user.id === req.params.id) {
      throw new ErrorResponse('No puedes eliminar tu propia cuenta de administrador.', 400);
    }

    await prisma.user.delete({
      where: { id: req.params.id }
    }).catch(err => {
      if (err.code === 'P2025') throw new ErrorResponse('Usuario no encontrado', 404);
      throw err;
    });

    logger.warn(`Usuario ELIMINADO por Admin: ${req.user.email}`);

    res.status(200).json({
      success: true,
      data: {}
    });

  } catch (error) {
    next(error);
  }
};
