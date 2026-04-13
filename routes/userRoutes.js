const express = require('express');
const router = express.Router();
const { getUsers, getUserById, updateUser, deleteUser } = require('../controllers/userController');
const { protect, authorize } = require('../middlewares/auth');

/**
 * Capa de Enrutamiento: Administración de Usuarios (Users)
 * --------------------------------------------------------------------------
 * Expone las herramientas de gestión del capital humano de la plataforma.
 * 
 * RN - Privacidad y Seguridad: Este router está excluido para usuarios 
 * finales; solo perfiles con rol 'admin' pueden auditar o manipular el
 * padrón general por cumplimiento de políticas de datos. (MVC / Router)
 */

router.use(protect);
router.use(authorize('admin'));

/**
 * Operaciones Masivas y de Listado
 */
router.route('/')
  /** @route GET /api/users - Recupera el listado total de usuarios registrados. */
  .get(getUsers);

/**
 * Operaciones Singulares por Identificador
 */
router.route('/:id')
  /** @route GET /api/users/:id - Detalle administrativo de ficha de usuario. */
  .get(getUserById)
  /** @route PUT /api/users/:id - Actualización forzada de metadatos de perfil. */
  .get(updateUser) 
  /** @route DELETE /api/users/:id - Baja lógica del registro de usuario. */
  .delete(deleteUser);

module.exports = router;