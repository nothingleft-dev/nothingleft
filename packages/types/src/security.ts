import { z } from 'zod';
import { MemberRefSchema } from './organizations.ts';

// A TOTP code from the authenticator, or a recovery code; spaces and dashes are ignored.
const CodeSchema = z.string().trim().min(6).max(32);

// Destructive account and organisation actions confirm with the password, and with a code
// when two-factor is on. An account without a password confirms by a sign-in in the last
// ten minutes instead, so both fields are optional here and the service decides.
export const StepUpSchema = z.object({
  current_password: z.string().min(1).max(256).optional(),
  code: CodeSchema.optional(),
});
export type StepUp = z.infer<typeof StepUpSchema>;

export const TwoFactorStatusSchema = z.object({
  enabled: z.boolean(),
  enabled_at: z.string().nullable(),
  recovery_codes_remaining: z.number().int().nonnegative(),
});
export type TwoFactorStatus = z.infer<typeof TwoFactorStatusSchema>;

// Returned once, by setup; the secret is never readable again.
export const TwoFactorSetupSchema = z.object({
  secret: z.string(),
  otpauth_uri: z.string(),
});
export type TwoFactorSetup = z.infer<typeof TwoFactorSetupSchema>;

export const ConfirmTwoFactorSchema = z.object({
  code: CodeSchema,
  current_password: z.string().min(1).max(256),
});
export type ConfirmTwoFactor = z.infer<typeof ConfirmTwoFactorSchema>;

// Shown once: only their hashes are stored.
export const TwoFactorRecoveryCodesSchema = z.object({
  recovery_codes: z.array(z.string()),
  enabled_at: z.string(),
});
export type TwoFactorRecoveryCodes = z.infer<typeof TwoFactorRecoveryCodesSchema>;

// 202 from sign-in: the password was right and the second step is pending. The challenge
// itself travels in an httpOnly cookie, never in the body.
export const TwoFactorChallengeSchema = z.object({
  two_factor_required: z.literal(true),
  expires_at: z.string(),
});
export type TwoFactorChallenge = z.infer<typeof TwoFactorChallengeSchema>;

export const TwoFactorSignInSchema = z
  .object({
    code: CodeSchema.optional(),
    recovery_code: CodeSchema.optional(),
  })
  .refine(v => (v.code === undefined) !== (v.recovery_code === undefined), {
    message: 'Send exactly one of code or recovery_code.',
  });
export type TwoFactorSignIn = z.infer<typeof TwoFactorSignInSchema>;

export const InitiateOwnershipTransferSchema = StepUpSchema.extend({
  username: z.string().trim().min(1).max(40),
});
export type InitiateOwnershipTransfer = z.infer<typeof InitiateOwnershipTransferSchema>;

export const OwnershipTransferSchema = z.object({
  organization: z.object({ slug: z.string(), name: z.string(), avatar_url: z.string() }),
  from: MemberRefSchema,
  to: MemberRefSchema,
  created_at: z.string(),
  expires_at: z.string(),
});
export type OwnershipTransfer = z.infer<typeof OwnershipTransferSchema>;

export const PendingOwnershipTransferSchema = OwnershipTransferSchema.nullable();
