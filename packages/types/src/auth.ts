import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from './constants.ts';

export const EmailSchema = z.email().max(320).trim();
export const PasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(256);
export const NameSchema = z.string().trim().min(1).max(100);
export const TimezoneSchema = z.string().trim().min(1).max(64);

export const SignUpSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  name: NameSchema,
  timezone: TimezoneSchema.optional(),
  // From /invite/<token>: an email invitation to this address proves it, so the account starts verified.
  invitation_token: z.string().min(1).max(200).optional(),
});
export type SignUp = z.infer<typeof SignUpSchema>;

export const SignInSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(256),
  timezone: TimezoneSchema.optional(),
});
export type SignIn = z.infer<typeof SignInSchema>;

export const OneTimeTokenSchema = z.object({ token: z.string().min(1).max(200) });
export type OneTimeToken = z.infer<typeof OneTimeTokenSchema>;

export const RequestPasswordResetSchema = z.object({ email: EmailSchema });
export type RequestPasswordReset = z.infer<typeof RequestPasswordResetSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  password: PasswordSchema,
});
export type ResetPassword = z.infer<typeof ResetPasswordSchema>;

export const ChangePasswordSchema = z.object({
  current_password: z.string().min(1).max(256),
  password: PasswordSchema,
});
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

export const ChangeEmailSchema = z.object({
  current_password: z.string().min(1).max(256),
  email: EmailSchema,
});
export type ChangeEmail = z.infer<typeof ChangeEmailSchema>;

// Every auth endpoint that does not return a session returns this, so a client never
// has to special-case a bodiless success — docs/api-conventions.md#rules.
export const AcknowledgementSchema = z.object({ ok: z.literal(true) });
export type Acknowledgement = z.infer<typeof AcknowledgementSchema>;
