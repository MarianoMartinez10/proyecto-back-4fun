/**
 * Capa de Servicios: Taxonomías Secundarias (Plataformas Físicas/Virtuales)
 * --------------------------------------------------------------------------
 * Especializa la superclase `MetadataService` para gestionar la catalogación 
 * exclusiva de las interfaces donde corren los videojuegos de la tienda.
 */

const MetadataService = require('./metadataService');

class PlatformService extends MetadataService {
    /**
     * RN Arquitectura (Inversión de Control de Errores): Pasa traducciones semánticas 
     * en crudo al padre unificador para homogeneizar el output DTO.
     */
    constructor() {
        super('platform', {
            singular: 'plataforma',
            plural: 'plataformas',
            notFoundMsg: 'Plataforma no encontrada',
            productField: 'platformId',
        });
    }

    // Adaptadores formales de Controller Mapping.
    async getPlatforms() { return this.getAll(); }
    async getPlatformById(id) { return this.getById(id); }
    async createPlatform(data) { return this.create(data); }
    async updatePlatform(id, data) { return this.update(id, data); }
    async deletePlatform(id) { return this.deleteOne(id); }
    async deletePlatforms(ids) { return this.deleteMany(ids); }
}

module.exports = new PlatformService();
