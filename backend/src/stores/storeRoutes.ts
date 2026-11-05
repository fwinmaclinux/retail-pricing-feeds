import type { FastifyInstance } from 'fastify';
import { scopeClause } from '../auth/principal.js';
import type { Database } from '../db/database.js';

export function storeRoutes(app: FastifyInstance, deps: { db: Database }) {
  /** Reference data for filters and currency formatting. Cached on the device for 24h. */
  app.get('/api/v1/stores', { preHandler: app.authenticate }, async (request, reply) => {
    const scope = scopeClause(request.principal, 's', 1);
    const { rows } = await deps.db.query(
      `SELECT store_id AS "storeId", name, country_code AS "countryCode", currency, timezone, region
       FROM store s WHERE s.active AND ${scope.sql} ORDER BY country_code, store_id`,
      scope.params,
    );
    reply.header('Cache-Control', 'private, max-age=3600');
    return { items: rows };
  });

  app.get('/api/v1/me', { preHandler: app.authenticate }, async (request) => request.principal);
}
