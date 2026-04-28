/**
 * Patrón GoF: Strategy — ConcreteStrategy para Productos Físicos
 * --------------------------------------------------------------------------
 * Implementa el contrato `PricingStrategy` para la familia de productos
 * físicos. Esta clase es un **ConcreteStrategy** (GoF §Strategy - Participant):
 * provee la implementación concreta del algoritmo de cálculo de precios que
 * aplica a mercadería con stock de unidades físicas en bodega.
 *
 * Consecuencia GoF §Strategy — Beneficio de FLEXIBILIDAD:
 *   "Clients can choose different strategies, and clients can be unaware of
 *    different implementations." (Design Patterns, GoF §5 — Strategy)
 * → ProductService no necesita conocer CÓMO se calcula el precio físico,
 *   solo delega al ConcreteStrategy en tiempo de ejecución.
 *
 * RN (Regla de Negocio — Productos Físicos):
 *   El stock se lee directamente del campo `stock` de la tabla `product`.
 *   El precio final se calcula aplicando el descuento temporizado si aplica.
 */

const PricingStrategy = require('./PricingStrategy');

class PhysicalProductStrategy extends PricingStrategy {
    /**
     * Calcula el precio final de un producto físico aplicando la lógica de
     * descuento temporizado. Solo aplica el descuento si el porcentaje es
     * mayor a cero Y la fecha de fin no ha vencido.
     *
     * RN (Precisión Financiera): El resultado se redondea a 2 decimales
     * para evitar errores de punto flotante en la facturación.
     *
     * @override Polimorfismo — Especializa el cálculo base para productos físicos.
     * @param {object} p - Entidad cruda de Prisma (producto).
     * @returns {{ finalPrice: number, discountPercentage: number }}
     */
    calculatePrice(p) {
        // RN — Promociones: Un descuento solo es válido si el % > 0 y no ha expirado.
        const discountActive = p.descuentoPorcentaje > 0 &&
            (!p.descuentoFechaFin || new Date(p.descuentoFechaFin) > new Date());

        const discountPercentage = discountActive ? p.descuentoPorcentaje : 0;

        // RN — Precisión Financiera: El precio final aplica el factor de descuento.
        const finalPrice = discountActive
            ? Number((Number(p.precio) * (1 - p.descuentoPorcentaje / 100)).toFixed(2))
            : Number(p.precio);

        return { finalPrice, discountPercentage };
    }

    /**
     * Para productos físicos, el stock disponible es el campo `stock`
     * almacenado directamente en la tabla `product` (unidades en bodega).
     *
     * @override Polimorfismo — Lee stock del campo numérico del modelo de datos.
     * @param {object} p - Entidad cruda de Prisma (producto).
     * @returns {number} Cantidad de unidades físicas disponibles.
     */
    calculateStock(p) {
        // RN (Inventario Físico): La fuente de verdad es el campo `stock` de la BD.
        return p.stock;
    }
}

module.exports = new PhysicalProductStrategy();
