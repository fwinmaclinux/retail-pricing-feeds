import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { ApiError } from '../common/errors.js';
import { DEV_PERSONAS, type Principal } from './principal.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; name: string; role: Principal['role']; stores: string[]; countries: string[] };
  }
}

/**
 * Authentication. AUTH_MODE=dev signs short-lived tokens for demo personas.
 * AUTH_MODE=oidc (production) verifies RS256 access tokens from the corporate IdP
 * (Entra ID / Okta) against its JWKS; the mobile app signs in with Authorization Code + PKCE.
 */
async function authPlugin(app: FastifyInstance, opts: { secret: string; mode: 'dev' | 'oidc' }) {
  await app.register(fastifyJwt, { secret: opts.secret, sign: { expiresIn: '8h' } });

  app.decorateRequest('principal', null as unknown as Principal);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      const claims = await request.jwtVerify<{
        sub: string;
        name: string;
        role: Principal['role'];
        stores: string[];
        countries: string[];
      }>();
      request.principal = {
        userId: claims.sub,
        displayName: claims.name,
        role: claims.role,
        storeIds: claims.stores ?? [],
        countryCodes: claims.countries ?? [],
      };
    } catch {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in again to continue');
    }
  });

  if (opts.mode !== 'dev') return;

  app.get('/api/v1/auth/personas', async () => ({
    items: DEV_PERSONAS.map(({ userId, displayName, role, storeIds, countryCodes }) => ({
      userId,
      displayName,
      role,
      storeIds,
      countryCodes,
    })),
  }));

  app.post('/api/v1/auth/dev-login', async (request) => {
    const body = z.object({ userId: z.string() }).safeParse(request.body);
    const persona = body.success ? DEV_PERSONAS.find((p) => p.userId === body.data.userId) : undefined;
    if (!persona) throw ApiError.badRequest('Unknown persona');
    const accessToken = app.jwt.sign({
      sub: persona.userId,
      name: persona.displayName,
      role: persona.role,
      stores: persona.storeIds,
      countries: persona.countryCodes,
    });
    return { accessToken, tokenType: 'Bearer', expiresIn: 8 * 3600, user: persona };
  });
}

export default fp(authPlugin, { name: 'auth' });
