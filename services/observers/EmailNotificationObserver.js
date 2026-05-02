/**
 * Patrón GoF: Observer — ConcreteObserver de Notificaciones por Email
 * --------------------------------------------------------------------------
 * Implementa el contrato `OrderObserver` para reaccionar al evento 'order:paid'
 * enviando las keys digitales al comprador por correo electrónico.
 *
 * GoF §Observer — Participant: ConcreteObserver
 *   "Implements the Observer updating interface to keep its state consistent
 *    with the subject's."
 *
 * Consecuencia GoF §Observer — Beneficio de EXTENSIBILIDAD:
 *   "The subject doesn't know how many objects depend on it." (Design Patterns, GoF §5)
 * → OrderService no tiene referencia directa a EmailService. Si el equipo decide
 *   deshabilitar notificaciones por email, basta con no registrar este observer
 *   en el bus al arrancar la aplicación. Cero modificaciones a OrderService.
 *
 * RN (Comportamiento Aislado): Este observer solo reacciona al evento 'order:paid'
 * y únicamente cuando la orden contiene keys digitales para entregar.
 */

const OrderObserver = require('./OrderObserver');
const EmailService  = require('../emailService');
const logger        = require('../../utils/logger');

class EmailNotificationObserver extends OrderObserver {
    /**
     * Reacciona al evento de pago confirmado enviando las keys digitales
     * al email del comprador. Opera de forma aislada: un fallo de email
     * NO revierte la transacción financiera (manejo de errores no-crítico).
     *
     * RN (Resiliencia): El email es una notificación secundaria. La orden
     * ya fue marcada como pagada en la BD antes de llegar a este punto.
     *
     * @override Polimorfismo — Especializa la reacción para comunicación por email.
     * @param {string} event - Nombre del evento emitido.
     * @param {object} payload - Datos del evento de orden.
     * @param {object} payload.order - Orden pagada con usuario y keys incluidos.
     * @param {Array}  payload.digitalKeys - Keys asignadas en esta transacción.
     * @param {object} payload.meta - Metadatos: { shouldSendKeysEmail }.
     * @returns {Promise<void>}
     */
    async update(event, { order, digitalKeys, meta = {} }) {
        // Guardia de Evento: Este observer solo reacciona a pagos confirmados.
        if (event !== 'order:paid') return;

        // RN (Condición de Entrega): Solo envía email si el flag de pago nuevo
        // está activo y existen keys para entregar al comprador.
        const { shouldSendKeysEmail } = meta;
        const hasKeys = (digitalKeys?.length || 0) > 0;

        if (!shouldSendKeysEmail || !order?.user?.email || !hasKeys) {
            logger.info(`[EmailNotificationObserver] Condiciones de entrega no cumplidas para orden ${order?.id}. Omitiendo email.`);
            return;
        }

        try {
            const emailResult = await EmailService.sendDigitalProductDelivery(
                order.user,
                { ...order, _id: order.id },
                digitalKeys
            );

            if (!emailResult?.success) {
                // Manejo de Excepción No-Crítica: Loguea la advertencia pero no
                // propaga el error; la transacción financiera ya está consolidada.
                logger.warn('[EmailNotificationObserver] Email de entrega de keys no fue exitoso', {
                    orderId: order.id,
                    reason: emailResult?.message || 'motivo desconocido'
                });
            } else {
                logger.info(`[EmailNotificationObserver] Keys enviadas por email para orden ${order.id}`);
            }
        } catch (emailError) {
            // Manejo de Excepción No-Crítica: Aísla el fallo de email del pipeline
            // financiero. Un error de SMTP no puede revertir un pago confirmado.
            logger.error('[EmailNotificationObserver] Error al enviar keys por email', {
                orderId: order.id,
                error: emailError.message
            });
        }
    }
}

module.exports = new EmailNotificationObserver();
