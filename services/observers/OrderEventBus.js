/**
 * Patrón GoF: Observer — Subject (Bus de Eventos de Órdenes)
 * --------------------------------------------------------------------------
 * Implementa el rol de **Subject** del patrón Observer. Mantiene la lista de
 * observadores suscritos y los notifica en cascada cuando ocurre un evento.
 *
 * GoF §Observer — Participant: Subject
 *   "Knows its observers. Any number of Observer objects may observe a subject.
 *    Provides an interface for attaching and detaching Observer objects."
 *
 * Consecuencia GoF §Observer — FLEXIBILIDAD (broadcast communication):
 *   "The subject doesn't know how many objects depend on it. It broadcasts
 *    notification to all interested objects that subscribed to it."
 *   (Design Patterns, GoF §5 — Observer: Consequences)
 *
 * Decisión Arquitectónica: Se implementa como Singleton porque el bus de
 * eventos debe ser único en toda la aplicación. Los observadores se registran
 * al arrancar el servidor (server.js) y permanecen activos durante todo el
 * ciclo de vida del proceso.
 *
 * Eventos disponibles:
 *   - 'order:paid'      → Se emite cuando updateOrderToPaid() consolida la TX.
 *   (Extensible: 'order:cancelled', 'order:shipped', 'order:refunded', etc.)
 */

const logger = require('../../utils/logger');

class OrderEventBus {
    constructor() {
        /**
         * Lista de Observadores Suscritos.
         * GoF §Observer — Subject mantiene una referencia a cada Observer.
         * @type {import('./OrderObserver')[]}
         */
        this._observers = [];
    }

    // ── Gestión del Canal de Suscripción ─────────────────────────────────

    /**
     * Suscribe un nuevo observer al bus de eventos.
     * GoF §Observer — Subject.attach(Observer o)
     *
     * @param {import('./OrderObserver')} observer - Instancia que implementa OrderObserver.
     * @returns {OrderEventBus} Retorna `this` para permitir encadenamiento fluent.
     */
    subscribe(observer) {
        // Manejo de Excepciones: Previene duplicados en la lista de observadores.
        if (!this._observers.includes(observer)) {
            this._observers.push(observer);
            logger.info(`[OrderEventBus] Observer suscrito: ${observer.constructor.name}`);
        }
        return this;
    }

    /**
     * Elimina un observer del bus de eventos.
     * GoF §Observer — Subject.detach(Observer o)
     * Útil para tests de integración o deshabilitar canales en runtime.
     *
     * @param {import('./OrderObserver')} observer - Instancia a desregistrar.
     * @returns {OrderEventBus} Retorna `this` para encadenamiento fluent.
     */
    unsubscribe(observer) {
        this._observers = this._observers.filter(obs => obs !== observer);
        logger.info(`[OrderEventBus] Observer desuscrito: ${observer.constructor.name}`);
        return this;
    }

    // ── Notificación en Cascada ───────────────────────────────────────────

    /**
     * Emite un evento a todos los observers suscritos de forma concurrente.
     * GoF §Observer — Subject.notify()
     *   "Notifies its observers when its state changes."
     *
     * Decisión Técnica: Se usa Promise.allSettled() en lugar de Promise.all()
     * para garantizar que un fallo en un observer (ej. un error de SMTP) no
     * cancele la ejecución del resto de observadores. Cada canal es independiente.
     *
     * @param {string} event   - Nombre del evento (ej. 'order:paid').
     * @param {object} payload - Datos del evento distribuido a los observers.
     * @returns {Promise<void>}
     */
    async notify(event, payload) {
        try {
            if (!this._observers || this._observers.length === 0) {
                logger.warn(`[OrderEventBus] Evento "${event}" emitido sin observers suscritos.`);
                return;
            }

            logger.info(`[OrderEventBus] Notificando evento "${event}" a ${this._observers.length} observer(s).`);

            // Ejecución Concurrente con Aislamiento de Fallos (UTN Robustness):
            // Promise.allSettled garantiza que si un observer falla, los demás
            // sigan su ejecución.
            const results = await Promise.allSettled(
                this._observers.map(obs => obs.update(event, payload))
            );

            // Auditoría Post-Mortem: Loguea fallos individuales sin propagar el error.
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    logger.error(`[OrderEventBus] Observer ${this._observers[index]?.constructor.name} falló`, {
                        event,
                        error: result.reason?.message || result.reason
                    });
                }
            });
        } catch (fatalError) {
            // Protección de Disponibilidad: Un error en el sistema de notificaciones
            // NO debe colapsar el proceso de órdenes/checkout.
            logger.error(`[OrderEventBus] ERROR CATASTRÓFICO en el bus de eventos:`, fatalError.message);
        }
    }
}

// Singleton: instancia global única del bus de eventos.
module.exports = new OrderEventBus();
