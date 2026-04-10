const MetadataService = require('./metadataService');

class PlatformService extends MetadataService {
    constructor() {
        super('platform', {
            singular: 'plataforma',
            plural: 'plataformas',
            notFoundMsg: 'Plataforma no encontrada',
            productField: 'platformId',
        });
    }

    async getPlatforms() { return this.getAll(); }
    async getPlatformById(id) { return this.getById(id); }
    async createPlatform(data) { return this.create(data); }
    async updatePlatform(id, data) { return this.update(id, data); }
    async deletePlatform(id) { return this.deleteOne(id); }
    async deletePlatforms(ids) { return this.deleteMany(ids); }
}

module.exports = new PlatformService();
