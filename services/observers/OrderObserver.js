/**
 * Patrón GoF: Observer — Interfaz Abstracta del Observador
 * --------------------------------------------------------------------------
 * Define el **contrato** que todo ConcreteObserver debe cumplir.
 * Basado en OOSC2 §21 "Event-Driven Design": un observador recibe la
 * notificación de cambio de estado mediante un método unificado, sin
 * acoplarse a quién genera el evento.
 *
 * GoF §Observer — Participant: Observer
 *   "Defines an updating interface for objects that should be notified of
 *    changes in a subject."
 *
 * Consecuencia GoF §Observer — Beneficio de FLEXIBILIDAD:
 *   "Support for broadcast communication. Unlike an ordinary request, the
 *    notification that a Subject sends needn't specify its receiver.
 *    The notification is broadcast automatically to all interested objects
 *    that subscribed to it."
 * → OrderService jamás conocerá la existencia de EmailObserver, SmsObserver
 *   ni ningún otro; solo llama a notify() y el bus se encarga.
 */

class OrderObserver {
    /**
     * Método de actualización invocado por el Subject (OrderEventBus)
     * cuando se produce un evento de orden relevante.
     * Método abstracto: cada ConcreteObserver implementa su reacción.
     *
     * GoF §Observer — Participant: Observer.update()
     *
     * @param {string} event - Nombre del evento emitido (ej. 'order:paid').
     * @param {object} payload - Datos del evento: { order, digitalKeys, meta }.
     * @param {object} payload.order - Entidad de orden completa (post-transacción).
     * @param {Array}  payload.digitalKeys - Keys asignadas (puede ser vacío).
     * @param {object} [payload.meta] - Metadatos adicionales del evento.
     * @returns {Promise<void>}
     * @abstract
     */
    async update(event, payload) {
        throw new Error(
            `El método update() debe ser implementado por ${this.constructor.name}. ` +
            `Este es un método abstracto del contrato OrderObserver (GoF).`
        );
    }
}

module.exports = OrderObserver;
