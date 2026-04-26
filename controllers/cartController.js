/**
 * Capa de Controladores: Carrito
 * --------------------------------------------------------------------------
 * Este módulo actúa exclusivamente como intermediario (Controlador) dentro
 * de la arquitectura MVC. Recibe las peticiones de las rutas HTTP, extrae
 * la información del cliente (req.body, req.user) y delega la ejecución de 
 * las Reglas de Negocio a la capa de Servicios subyacente. No interactúa
 * directamente con la base de datos (Prisma).
 */

const CartService = require('../services/cartService');

/**
 * Obtiene el carrito activo de un usuario con todos sus ítems poblados.
 * 
 * @param {Object} req - Petición HTTP (espera req.user.id inyectado por el middleware Auth).
 * @param {Object} res - Respuesta HTTP.
 * @param {Function} next - Middleware para atrapar excepciones en caso de fallo.
 * @returns {JSON} 200 - Objeto con el estado inicial del carrito.
 */
exports.getCart = async (req, res, next) => {
  try {
    // Delegación al servicio: Aislamos la consulta de BDD del controlador.
    const cartResponse = await CartService.getCart(req.user.id);
    res.json({ success: true, cart: cartResponse });
  } catch (error) {
    // Manejo de Excepciones: Delegamos cualquier fallo del servicio (ej. base de datos 
    // caída u OOM) al errorHandler central, evitando que el servidor devuelva HTML crudo.
    next(error);
  }
};

/**
 * Agrega un nuevo producto al carrito o incrementa su cantidad si ya existe.
 * 
 * @param {Object} req - Body esperando { productId, quantity }.
 * @param {Object} res - Respuesta HTTP.
 * @param {Function} next - Manejador de errores.
 * @returns {JSON} 200 - Carrito actualizado tras superar validaciones de stock.
 */
exports.addToCart = async (req, res, next) => {
  try {
    const { offerId, quantity } = req.body;
    const userId = req.user.id;
    
    // RN (Regla de Negocio): La validación crítica de "Producto Activo" (RN-05) y 
    // "Stock Disponible" (RN-07) se delega completamente a CartService.addToCart.
    // El controlador asume que si el servicio no lanza errores, la regla se cumplió.
    const populatedCart = await CartService.addToCart(userId, offerId, quantity);
    
    res.json({ success: true, message: 'Agregado', cart: populatedCart });
  } catch (error) {
    // Manejo de Excepciones: Si el servicio detecta falta de stock (RN-07 vulnerada),
    // arrojará un ErrorResponse personalizado que atrapamos aquí y enviamos al cliente.
    next(error);
  }
};

/**
 * Modifica directamente la cantidad de un producto específico en el carrito.
 * 
 * @param {Object} req - Body esperando { itemId, quantity } (Atención: usa el ID del ítem, no del producto).
 * @param {Object} res - Respuesta HTTP.
 * @param {Function} next - Manejador de errores.
 * @returns {JSON} 200 - Estado final modificado.
 */
exports.updateCartItem = async (req, res, next) => {
  try {
    const { itemId, quantity } = req.body;
    const userId = req.user.id;
    
    const populatedCart = await CartService.updateCartItem(userId, itemId, quantity);
    res.json({ success: true, message: 'Actualizado', cart: populatedCart });
  } catch (error) {
    next(error);
  }
};

/**
 * Elimina por completo un ítem del carrito, independientemente de su cantidad.
 * 
 * @param {Object} req - Params esperando itemId en la URL.
 * @param {Object} res - Respuesta HTTP.
 * @param {Function} next - Manejador de errores.
 * @returns {JSON} 200 - El carrito tras la extracción del artículo.
 */
exports.removeFromCart = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id;
    
    const populatedCart = await CartService.removeFromCart(userId, itemId);
    res.json({ success: true, message: 'Eliminado', cart: populatedCart });
  } catch (error) {
    next(error);
  }
};

/**
 * Limpia masivamente el carrito, dejándolo sin ítems.
 * Se utiliza principalmente tras concretar una Orden de Compra de manera exitosa (RN-12).
 * 
 * @param {Object} req - Petición HTTP.
 * @param {Object} res - Respuesta HTTP.
 * @param {Function} next - Manejador de errores.
 * @returns {JSON} 200 - Array de items vacío.
 */
exports.clearCart = async (req, res, next) => {
  try {
    // RN-12: El vaciado completo delega purgar los cartItems al servicio; 
    // mantenemos el ID original del root del carrito.
    const cart = await CartService.clearCart(req.user.id);
    res.json({ success: true, message: 'Vaciado', cart });
  } catch (error) {
    next(error);
  }
};