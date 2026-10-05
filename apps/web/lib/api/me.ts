import type {
  AvatarPresign,
  AvatarPresignRequest,
  Landing,
  Me,
  Session,
  UpdateMe,
  UpdatePreferences,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

export const getMe = () => api.get<Me>('/v1/me');
export const getLanding = () => api.get<Landing>('/v1/me/landing');
export const setCurrentOrganization = (slug: string) =>
  api.post<Session>('/v1/me/current-organization', { body: { slug } });
export const updateMe = (body: UpdateMe) => api.patch<Me>('/v1/me', { body });
export const updatePreferences = (body: UpdatePreferences) => api.patch<Me>('/v1/me/preferences', { body });

export const presignAvatar = (body: AvatarPresignRequest) => api.post<AvatarPresign>('/v1/me/avatar/presign', { body });
export const completeAvatar = (object_key: string) => api.post<Me>('/v1/me/avatar/complete', { body: { object_key } });
export const removeAvatar = () => api.delete<Me>('/v1/me/avatar');
