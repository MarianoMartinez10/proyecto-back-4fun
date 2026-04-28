/**
 * Patrón GoF: Composite — Compuesto (ProductBundle)
 * --------------------------------------------------------------------------
 * Representa un "combo" o paquete de productos. Contiene una lista de
 * hijos (children) que pueden ser tanto hojas (LeafProduct) como otros
 * compuestos (ProductBundle), permitiendo árboles de profundidad arbitraria.
 *
 * GoF §Composite — Participant: Composite
 *   "Defines behavior for components having children. Stores child components.
 *    Implements child-related operations in the Component interface."
 */

const ProductComponent = require('./ProductComponent');

class ProductBundle extends ProductComponent {
    /**
     * @param {string} id
     * @param {string} name
     */
    constructor(id, name) {
        super(id, name);
        /** @type {ProductComponent[]} */
        this.children = [];
    }

    /**
     * Añade un componente hijo (hoja u otro combo).
     * @param {ProductComponent} component
     */
    add(component) {
        this.children.push(component);
    }

    /**
     * Elimina un componente hijo.
     * @param {ProductComponent} component
     */
    remove(component) {
        this.children = this.children.filter(c => c.id !== component.id);
    }

    /**
     * Operación recursiva: El precio del Bundle es la suma de los
     * precios de TODOS sus hijos, sin importar cuán profundo sea el árbol.
     *
     * @override Polimorfismo — Especializa la operación para nodos compuestos.
     * @returns {number}
     */
    getPrice() {
        return this.children.reduce((total, child) => total + child.getPrice(), 0);
    }

    /**
     * Devuelve el contenido aplanado de todo el árbol de productos.
     * @returns {Array}
     */
    getContents() {
        let contents = [];
        for (const child of this.children) {
            contents = contents.concat(child.getContents());
        }
        return contents;
    }
}

module.exports = ProductBundle;
