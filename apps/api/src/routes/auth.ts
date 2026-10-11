import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  AcknowledgementSchema,
  MeSchema,
  OAuthCallbackSchema,
  OAuthSignInSchema,
  OAuthProviderSchema,
  OAuthStartSchema,
  OneTimeTokenSchema,
  RequestPasswordResetSchema,
  ResetPasswordSchema,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  SignInSchema,
  SignUpSchema,
  TwoFactorChallengeSchema,
  TwoFactorSignInSchema,
  successEnvelope,
} from '@nothingleft/types';
import {
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_STATE_TTL_SECONDS,
  TWO_FACTOR_CHALLENGE_COOKIE_NAME,
  TWO_FACTOR_CHALLENGE_TTL_SECONDS,
} from '@config/constants';
import { requestFacts, resolveTimezone } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { AccountsService } from '@services/accounts.service';
import type { MeService } from '@services/me.service';
import type { OAuthService } from '@services/oauth.service';

type Deps = {
  accounts: AccountsService;
  me: MeService;
  oauth: OAuthService;
  cookie: { secure: boolean; domain: string | undefined };
};

const MeResponse = successEnvelope(MeSchema);
const AckResponse = successEnvelope(AcknowledgementSchema);
const OAuthStartResponse = successEnvelope(OAuthStartSchema);
const OAuthSignInResponse = successEnvelope(OAuthSignInSchema);
const ChallengeResponse = successEnvelope(TwoFactorChallengeSchema);
const ProviderParams = z.object({ provider: OAuthProviderSchema });
const CHALLENGE_PATH = '/v1/auth/two-factor';

const authRoutes: FastifyPluginAsyncZod<Deps> = async (app, { accounts, me, oauth, cookie }) => {
  const cookieOptions = {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    ...(cookie.domain ? { domain: cookie.domain } : {}),
  };

  app.post(
    '/v1/auth/sign-up',
    { schema: { body: SignUpSchema, response: { 201: MeResponse } } },
    async (request, reply) => {
      const facts = requestFacts(request);
      const session = await accounts.signUp(request.body, facts, resolveTimezone(request, request.body.timezone));
      reply.setCookie(SESSION_COOKIE_NAME, session.token, cookieOptions);
      return reply.ok(
        await me.forSession({
          userId: session.user.id,
          sessionId: session.sessionId,
          currentOrgId: session.currentOrgId,
        }),
        { status: 201 },
      );
    },
  );

  const challengeCookieOptions = {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: 'lax' as const,
    path: CHALLENGE_PATH,
    ...(cookie.domain ? { domain: cookie.domain } : {}),
  };

  // 202 when two-factor is on: the challenge rides in a cookie scoped to the second step,
  // so the password step hands the code step nothing a script could read.
  app.post(
    '/v1/auth/sign-in',
    { schema: { body: SignInSchema, response: { 200: MeResponse, 202: ChallengeResponse } } },
    async (request, reply) => {
      const result = await accounts.signIn(request.body, requestFacts(request));
      if ('challenge' in result) {
        reply.setCookie(TWO_FACTOR_CHALLENGE_COOKIE_NAME, result.challenge, {
          ...challengeCookieOptions,
          maxAge: TWO_FACTOR_CHALLENGE_TTL_SECONDS,
        });
        return reply.ok(
          { two_factor_required: true as const, expires_at: result.expires_at.toISOString() },
          { status: 202 },
        );
      }
      const session = result;
      reply.setCookie(SESSION_COOKIE_NAME, session.token, cookieOptions);
      return reply.ok(
        await me.forSession({
          userId: session.user.id,
          sessionId: session.sessionId,
          currentOrgId: session.currentOrgId,
        }),
      );
    },
  );

  app.post(
    CHALLENGE_PATH,
    { schema: { body: TwoFactorSignInSchema, response: { 200: MeResponse } } },
    async (request, reply) => {
      const session = await accounts.completeTwoFactor(
        request.cookies[TWO_FACTOR_CHALLENGE_COOKIE_NAME],
        request.body,
        requestFacts(request),
      );
      reply.clearCookie(TWO_FACTOR_CHALLENGE_COOKIE_NAME, challengeCookieOptions);
      reply.setCookie(SESSION_COOKIE_NAME, session.token, cookieOptions);
      return reply.ok(
        await me.forSession({
          userId: session.user.id,
          sessionId: session.sessionId,
          currentOrgId: session.currentOrgId,
        }),
      );
    },
  );

  const stateCookieOptions = {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: 'lax' as const,
    path: '/v1/auth/oauth',
    ...(cookie.domain ? { domain: cookie.domain } : {}),
  };

  app.post(
    '/v1/auth/oauth/:provider/start',
    { schema: { params: ProviderParams, response: { 200: OAuthStartResponse } } },
    async (request, reply) => {
      const { state, authorize_url } = await oauth.start(request.params.provider);
      reply.setCookie(OAUTH_STATE_COOKIE_NAME, state, { ...stateCookieOptions, maxAge: OAUTH_STATE_TTL_SECONDS });
      return reply.ok({ authorize_url });
    },
  );

  app.post(
    '/v1/auth/oauth/:provider/callback',
    {
      schema: {
        params: ProviderParams,
        body: OAuthCallbackSchema,
        response: { 200: OAuthSignInResponse, 201: OAuthSignInResponse },
      },
    },
    async (request, reply) => {
      const bound = request.cookies[OAUTH_STATE_COOKIE_NAME];
      reply.clearCookie(OAUTH_STATE_COOKIE_NAME, stateCookieOptions);
      const session = await oauth.complete(
        request.params.provider,
        request.body,
        bound,
        requestFacts(request),
        resolveTimezone(request),
      );
      reply.setCookie(SESSION_COOKIE_NAME, session.token, cookieOptions);
      const notice = session.linked_unverified_account
        ? { kind: 'unverified_account_linked' as const, account_created_at: session.user.created_at.toISOString() }
        : null;
      return reply.ok(
        {
          me: await me.forSession({
            userId: session.user.id,
            sessionId: session.sessionId,
            currentOrgId: session.currentOrgId,
          }),
          created: session.created,
          notice,
        },
        { status: session.created ? 201 : 200 },
      );
    },
  );

  app.post(
    '/v1/auth/sign-out',
    { preHandler: requireAuth, schema: { response: { 200: AckResponse } } },
    async (request, reply) => {
      const result = await accounts.signOut(request.principal!);
      reply.clearCookie(SESSION_COOKIE_NAME, { path: '/', ...(cookie.domain ? { domain: cookie.domain } : {}) });
      return reply.ok(result);
    },
  );

  app.post(
    '/v1/auth/verify-email',
    { schema: { body: OneTimeTokenSchema, response: { 200: AckResponse } } },
    async (request, reply) => reply.ok(await accounts.verifyEmail(request.body.token)),
  );

  app.post(
    '/v1/auth/password-reset',
    { schema: { body: RequestPasswordResetSchema, response: { 200: AckResponse } } },
    async (request, reply) => reply.ok(await accounts.requestPasswordReset(request.body.email)),
  );

  app.post(
    '/v1/auth/password-reset/confirm',
    { schema: { body: ResetPasswordSchema, response: { 200: AckResponse } } },
    async (request, reply) => reply.ok(await accounts.resetPassword(request.body.token, request.body.password)),
  );

  app.post(
    '/v1/auth/email-change/confirm',
    { schema: { body: OneTimeTokenSchema, response: { 200: AckResponse } } },
    async (request, reply) => reply.ok(await accounts.confirmEmailChange(request.body.token)),
  );
};

export default authRoutes;
