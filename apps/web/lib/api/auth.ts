import type {
  Acknowledgement,
  ChangeEmail,
  ChangePassword,
  Me,
  OAuthCallback,
  OAuthProvider,
  OAuthSignIn,
  OAuthStart,
  SignIn,
  SignUp,
  TwoFactorChallenge,
  TwoFactorSignIn,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

export const signUp = (body: SignUp) => api.post<Me>('/v1/auth/sign-up', { body });
// 202 with a challenge when two-factor is on; the challenge itself is an httpOnly cookie.
export const signIn = (body: SignIn) => api.post<Me | TwoFactorChallenge>('/v1/auth/sign-in', { body });
export const signInWithTwoFactor = (body: TwoFactorSignIn) => api.post<Me>('/v1/auth/two-factor', { body });
export const startOAuth = (provider: OAuthProvider) => api.post<OAuthStart>(`/v1/auth/oauth/${provider}/start`);
export const completeOAuth = (provider: OAuthProvider, body: OAuthCallback) =>
  api.post<OAuthSignIn>(`/v1/auth/oauth/${provider}/callback`, { body });
export const signOut = () => api.post<Acknowledgement>('/v1/auth/sign-out');

export const verifyEmail = (token: string) => api.post<Acknowledgement>('/v1/auth/verify-email', { body: { token } });
export const resendVerification = () => api.post<Acknowledgement>('/v1/me/resend-verification');

export const requestPasswordReset = (email: string) =>
  api.post<Acknowledgement>('/v1/auth/password-reset', { body: { email } });
export const resetPassword = (body: { token: string; password: string }) =>
  api.post<Acknowledgement>('/v1/auth/password-reset/confirm', { body });

export const changePassword = (body: ChangePassword) => api.put<Acknowledgement>('/v1/me/password', { body });
export const requestEmailChange = (body: ChangeEmail) => api.post<Acknowledgement>('/v1/me/email-change', { body });
export const confirmEmailChange = (token: string) =>
  api.post<Acknowledgement>('/v1/auth/email-change/confirm', { body: { token } });
