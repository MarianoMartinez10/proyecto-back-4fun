/**
 * Patrón GoF: Strategy — Registro de Estrategias de Precios
 * --------------------------------------------------------------------------
 * Actúa como el punto de entrada del módulo de estrategias, centralizando
 * el mapeo entre tipología de producto (string del modelo Prisma) y su
 * ConcreteStrategy correspondiente.
 *
 * RN (Resolución de Estrategia): El contexto (`ProductService`) no necesita
 * conocer la existencia de las clases concretas individuales; delega en este
 * registro para obtener la instancia correcta en tiempo de ejecución.
 * Esto implementa el principio de "Open/Closed" de SOLID: abierto a
 * extensión (agregar 'Subscription') pero cerrado a modificación del contexto.
 */

const PhysicalProductStrategy = require('./PhysicalProductStrategy');
const DigitalProductStrategy  = require('./DigitalProductStrategy');

/**
 * Mapa de Despacho: asocia el valor del campo `tipo` del modelo Prisma
 * a su instancia de ConcreteStrategy correspondiente.
 * GoF §Strategy — "Let the Strategy object know about the Context."
 *
 * @type {Object.<string, import('./PricingStrategy')>}
 */
const STRATEGY_MAP = {
    'Fisico':  PhysicalProductStrategy,
    'Digital': DigitalProductStrategy,
};

/**
 * Resuelve la estrategia de precios correcta para un tipo de producto.
 * Centraliza la lógica de selección que antes estaba dispersa como
 * condicionales `if/else` dentro de `productToDTO()`.
 *
 * @param {string} tipo - Valor del campo `tipo` en Prisma ('Fisico' | 'Digital').
 * @returns {import('./PricingStrategy')} La instancia de ConcreteStrategy adecuada.
 * @throws {Error} Si el tipo de producto no tiene una estrategia registrada.
 */
function resolveStrategy(tipo) {
    const strategy = STRATEGY_MAP[tipo];
    // Manejo de Excepciones: Bloquea tipos de producto no registrados para
    // forzar la implementación de su ConcreteStrategy correspondiente.
    if (!strategy) {
        throw new Error(
            `[StrategyRegistry] No existe una PricingStrategy registrada para el tipo: "${tipo}". ` +
            `Agregue una nueva ConcreteStrategy en services/strategies/ y regístrela en este mapa.`
        );
    }
    return strategy;
}

module.exports = { resolveStrategy, STRATEGY_MAP };
