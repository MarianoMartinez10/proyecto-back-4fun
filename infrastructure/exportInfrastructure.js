/**
 * Capa de Infraestructura: Exportación de Datos
 * --------------------------------------------------------------------------
 * Implementa la generación técnica de archivos (PDF/Excel).
 * Esta capa es "detachable"; se puede cambiar la librería de PDF sin
 * afectar la lógica de negocio en ReportService.
 *
 * Estándar UTN: Separación de Lógica de Dominio e Infraestructura.
 */

const logger = require('../utils/logger');

class ExportInfrastructure {
    /**
     * Genera un búfer de datos en formato CSV (Simulando Excel/PDF para demo)
     * @param {Object} data - Datos estadísticos del ReportService.
     * @returns {Buffer}
     */
    async exportToCSV(data) {
        logger.info('[ExportInfrastructure] Generando exportación CSV...');
        
        const header = 'Producto,Cantidad Vendida,Precio\n';
        const rows = data.topProducts.map(p => 
            `${p.nombre},${p.cantidadVendida},${p.precio}`
        ).join('\n');

        return Buffer.from(header + rows, 'utf-8');
    }

    /**
     * Placeholder para PDF (Requeriría pdfkit)
     */
    async exportToPDF(data) {
        // En una implementación real: 
        // const doc = new PDFDocument(); 
        // doc.text('Reporte de Ventas'); ...
        logger.info('[ExportInfrastructure] Generando exportación PDF (Simulado)...');
        return Buffer.from('PDF Content Placeholder', 'utf-8');
    }
}

module.exports = new ExportInfrastructure();
