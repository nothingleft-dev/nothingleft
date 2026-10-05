import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AcknowledgementSchema,
  ConfirmTwoFactorSchema,
  SESSION_COOKIE_NAME,
  StepUpSchema,
  TwoFactorRecoveryCodesSchema,
  TwoFactorSetupSchema,
  AvatarCompleteSchema,
  AvatarPresignRequestSchema,
  AvatarPresignSchema,
  ChangeEmailSchema,
  ChangePasswordSchema,
  CreatePersonalAccessTokenSchema,
  CreatedPersonalAccessTokenSchema,
  LandingSchema,
  MeSchema,
  PersonalAccessTokenSchema,
  SessionSchema,
  SetCurrentOrganizationSchema,
  UpdateMeSchema,
  UpdatePreferencesSchema,
  successEnvelope,
} from '@nothingleft/types';
import { requireAuth } from '@middleware/auth';
import type { AccountLifecycleService } from '@services/account-lifecycle.service';
import type { AccountsService } from '@services/accounts.service';
import type { HomeService } from '@services/home.service';
import type { MeService } from '@services/me.service';
import type { SessionsService } from '@services/sessions.service';
import type { TokensService } from '@services/tokens.service';
import type { TwoFactorService } from '@services/two-factor.service';

type Deps = {
  accounts: AccountsService;
  lifecycle: AccountLifecycleService;
  twoFactor: TwoFactorService;
  cookieDomain: string | undefined;
  me: MeService;
  home: HomeService;
  sessions: SessionsService;
  tokens: TokensService;
};

const IdParams = z.object({ id: z.coerce.number().int().positive() });

const MeResponse = successEnvelope(MeSchema);
const AckResponse = successEnvelope(AcknowledgementSchema);
const SessionResponse = successEnvelope(SessionSchema);
const SessionsResponse = successEnvelope(z.array(SessionSchema));
const TokenResponse = successEnvelope(PersonalAccessTokenSchema);
const TokensResponse = successEnvelope(z.array(PersonalAccessTokenSchema));
const CreatedTokenResponse = successEnvelope(CreatedPersonalAccessTokenSchema);
const AvatarPresignResponse = successEnvelope(AvatarPresignSchema);
const LandingResponse = successEnvelope(LandingSchema);
const TwoFactorSetupResponse = successEnvelope(TwoFactorSetupSchema);
const RecoveryCodesResponse = successEnvelope(TwoFactorRecoveryCodesSchema);

const meRoutes: FastifyPluginAsyncZod<Deps> = async (
  app,
  { accounts, lifecycle, twoFactor, cookieDomain, me, home, sessions, tokens },
) => {
  app.addHook('preHandler', requireAuth);

  app.get('/v1/me', { schema: { response: { 200: MeResponse } } }, async (request, reply) =>
    reply.ok(await me.get(request.principal!)),
  );

  app.get('/v1/me/landing', { schema: { response: { 200: LandingResponse } } }, async (request, reply) =>
    reply.ok(await home.landing(request.principal!)),
  );

  app.patch('/v1/me', { schema: { body: UpdateMeSchema, response: { 200: MeResponse } } }, async (request, reply) =>
    reply.ok(await me.update(request.principal!, request.body)),
  );

  app.patch(
    '/v1/me/preferences',
    { schema: { body: UpdatePreferencesSchema, response: { 200: MeResponse } } },
    async (request, reply) => reply.ok(await me.updatePreferences(request.principal!, request.body)),
  );

  app.put(
    '/v1/me/password',
    { schema: { body: ChangePasswordSchema, response: { 200: AckResponse } } },
    async (request, reply) => reply.ok(await accounts.changePassword(request.principal!, request.body)),
  );

  app.post(
    '/v1/me/email-change',
    { schema: { body: ChangeEmailSchema, response: { 200: AckResponse } } },
    async (request, reply) => reply.ok(await accounts.requestEmailChange(request.principal!, request.body)),
  );

  app.post('/v1/me/resend-verification', { schema: { response: { 200: AckResponse } } }, async (request, reply) =>
    reply.ok(await accounts.resendVerification(request.principal!)),
  );

  app.get('/v1/me/sessions', { schema: { response: { 200: SessionsResponse } } }, async (request, reply) =>
    reply.okList(await sessions.list(request.principal!)),
  );

  app.delete(
    '/v1/me/sessions/:id',
    { schema: { params: IdParams, response: { 200: SessionResponse } } },
    async (request, reply) => reply.ok(await sessions.revoke(request.principal!, request.params.id)),
  );

  app.delete('/v1/me/sessions', { schema: { response: { 200: SessionsResponse } } }, async (request, reply) =>
    reply.okList(await sessions.revokeOthers(request.principal!)),
  );

  app.post(
    '/v1/me/current-organization',
    { schema: { body: SetCurrentOrganizationSchema, response: { 200: SessionResponse } } },
    async (request, reply) => reply.ok(await sessions.setCurrentOrganization(request.principal!, request.body.slug)),
  );

  app.get('/v1/me/tokens', { schema: { response: { 200: TokensResponse } } }, async (request, reply) =>
    reply.okList(await tokens.list(request.principal!)),
  );

  app.post(
    '/v1/me/tokens',
    { schema: { body: CreatePersonalAccessTokenSchema, response: { 201: CreatedTokenResponse } } },
    async (request, reply) => reply.ok(await tokens.create(request.principal!, request.body), { status: 201 }),
  );

  app.delete(
    '/v1/me/tokens/:id',
    { schema: { params: IdParams, response: { 200: TokenResponse } } },
    async (request, reply) => reply.ok(await tokens.revoke(request.principal!, request.params.id)),
  );

  app.post(
    '/v1/me/two-factor/setup',
    { schema: { response: { 200: TwoFactorSetupResponse } } },
    async (request, reply) => reply.ok(await twoFactor.setup(request.principal!)),
  );

  app.post(
    '/v1/me/two-factor/confirm',
    { schema: { body: ConfirmTwoFactorSchema, response: { 200: RecoveryCodesResponse } } },
    async (request, reply) => reply.ok(await twoFactor.confirm(request.principal!, request.body)),
  );

  app.post(
    '/v1/me/two-factor/disable',
    { schema: { body: StepUpSchema, response: { 200: MeResponse } } },
    async (request, reply) => {
      await twoFactor.disable(request.principal!, request.body);
      return reply.ok(await me.get(request.principal!));
    },
  );

  app.post(
    '/v1/me/two-factor/recovery-codes',
    { schema: { body: StepUpSchema, response: { 200: RecoveryCodesResponse } } },
    async (request, reply) => reply.ok(await twoFactor.regenerateCodes(request.principal!, request.body)),
  );

  app.post(
    '/v1/me/deactivate',
    { schema: { body: StepUpSchema, response: { 200: AckResponse } } },
    async (request, reply) => {
      const result = await lifecycle.deactivateSelf(request.principal!, request.body);
      reply.clearCookie(SESSION_COOKIE_NAME, { path: '/', ...(cookieDomain ? { domain: cookieDomain } : {}) });
      return reply.ok(result);
    },
  );

  app.post(
    '/v1/me/avatar/presign',
    { schema: { body: AvatarPresignRequestSchema, response: { 200: AvatarPresignResponse } } },
    async (request, reply) => reply.ok(await me.presignAvatar(request.principal!, request.body)),
  );

  app.post(
    '/v1/me/avatar/complete',
    { schema: { body: AvatarCompleteSchema, response: { 200: MeResponse } } },
    async (request, reply) => reply.ok(await me.completeAvatar(request.principal!, request.body.object_key)),
  );

  app.delete('/v1/me/avatar', { schema: { response: { 200: MeResponse } } }, async (request, reply) =>
    reply.ok(await me.removeAvatar(request.principal!)),
  );
};

export default meRoutes;
