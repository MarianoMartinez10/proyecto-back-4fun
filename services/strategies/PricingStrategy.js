/**
 * Patrón GoF: Strategy — Interfaz Abstracta de Estrategia de Precios
 * --------------------------------------------------------------------------
 * Define el **contrato** (firma) que todas las estrategias de cálculo de
 * precios deben implementar. Esta clase actúa como la "deferred class" del
 * catálogo OOSC2 §16.3: declara la operación sin proveer implementación
 * inicial, permitiendo que las subclases concretas (Physical/Digital) sean
 * intercambiables desde el punto de vista del contexto.
 *
 * Consecuencia GoF §Strategy — Beneficio de EXTENSIBILIDAD:
 *   "Define a family of algorithms, encapsulates each one, and makes them
 *    interchangeable. Strategy lets the algorithm vary independently from
 *    clients that use it."
 * → Añadir un nuevo tipo de producto (ej. 'Subscription') solo requiere
 *   agregar una nueva clase concreta sin tocar ProductService.
 */

class PricingStrategy {
    /**
     * Calcula el precio final aplicando las reglas de descuento correspondientes
     * al tipo de producto. Método abstracto: debe ser implementado por cada
     * ConcreteStrategy (GoF §Strategy - Participant: AbstractStrategy).
     *
     * @param {object} p - Entidad cruda de Prisma (producto).
     * @param {number} p.precio - Precio base del producto.
     * @param {number} p.descuentoPorcentaje - Porcentaje de descuento (0–100).
     * @param {Date|null} p.descuentoFechaFin - Fecha de expiración del descuento.
     * @returns {{ finalPrice: number, discountPercentage: number }} DTO parcial de precio.
     * @abstract
     */
    calculatePrice(p) {
        throw new Error(
            `El método calculatePrice() debe ser implementado por ${this.constructor.name}. ` +
            `Este es un método abstracto del contrato PricingStrategy (GoF).`
        );
    }

    /**
     * Calcula el stock visible para el cliente según el tipo de producto.
     * Método abstracto: la fuente de verdad del stock varía por tipología
     * (campo numérico para Físico vs. conteo de Keys para Digital).
     *
     * @param {object} p - Entidad cruda de Prisma (producto).
     * @returns {number} Stock disponible calculado.
     * @abstract
     */
    calculateStock(p) {
        throw new Error(
            `El método calculateStock() debe ser implementado por ${this.constructor.name}. ` +
            `Este es un método abstracto del contrato PricingStrategy (GoF).`
        );
    }
}

module.exports = PricingStrategy;
