/**
 * Parses bulk IDs from a request.
 * Supports three formats:
 *   1. Body as a plain array:    DELETE /  body: ['id1', 'id2']
 *   2. Body with 'ids' property: DELETE /  body: { ids: ['id1', 'id2'] }
 *   3. Query string:             DELETE /?ids=id1,id2
 *
 * @param {import('express').Request} req
 * @returns {string[]}
 */
function parseBulkIds(req) {
    if (Array.isArray(req.body) && req.body.length > 0) {
        return req.body;
    }
    if (req.body && req.body.ids && Array.isArray(req.body.ids)) {
        return req.body.ids;
    }
    if (req.query.ids) {
        return Array.isArray(req.query.ids)
            ? req.query.ids
            : req.query.ids.split(',').filter(Boolean);
    }
    return [];
}

module.exports = parseBulkIds;
