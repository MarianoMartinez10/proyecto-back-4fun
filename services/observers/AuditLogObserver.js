/**
 * Patrón GoF: Observer — ConcreteObserver de Auditoría de Órdenes
 * --------------------------------------------------------------------------
 * Implementa el contrato `OrderObserver` para registrar en log cada evento
 * de orden. Actúa como un observador transversal de auditoría (cross-cutting),
 * independiente de cualquier lógica de negocio.
 *
 * GoF §Observer — Participant: ConcreteObserver
 *   "Stores state that should stay consistent with the subject's."
 *
 * Demostración de FLEXIBILIDAD del patrón:
 *   Este observer puede registrar CUALQUIER evento del bus ('order:paid',
 *   'order:cancelled', 'order:shipped') sin requerir cambios en OrderService.
 *   Ejemplifica cómo añadir comportamientos transversales es una operación
 *   puramente aditiva (Open/Closed Principle).
 *
 * Nota: Este es el observer equivalente a un futuro SmsService — demuestra
 * que suscribir un nuevo canal de notificación es trivial: crear la clase
 * y registrarla en el bus. OrderService permanece intacto.
 */

const OrderObserver = require('./OrderObserver');
const logger        = require('../../utils/logger');

class AuditLogObserver extends OrderObserver {
    /**
     * Registra en el sistema de logs cada evento de orden que el bus emite.
     * Opera de forma completamente agnóstica al tipo de evento recibido,
     * estructurando la traza de auditoría para su consulta posterior.
     *
     * @override Polimorfismo — Especializa la reacción para auditoría transversal.
     * @param {string} event   - Nombre del evento emitido (ej. 'order:paid').
     * @param {object} payload - Datos del evento.
     * @param {object} payload.order - Entidad de orden completa.
     * @returns {Promise<void>}
     */
    async update(event, { order }) {
        // Registro de Auditoría: Traza estructurada para análisis forense de pagos.
        logger.info(`[AuditLogObserver] Evento "${event}" recibido`, {
            orderId:     order?.id,
            userId:      order?.userId,
            totalPrice:  order?.totalPrice,
            isPaid:      order?.isPaid,
            status:      order?.status,
            timestamp:   new Date().toISOString()
        });
    }
}

module.exports = new AuditLogObserver();
