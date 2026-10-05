import type { CreateSavedView, SavedView, UpdateSavedView } from '@nothingleft/types';
import { api } from '@lib/api/client';

const one = (name: string) => `/v1/saved-views/${encodeURIComponent(name)}`;

export const listSavedViews = () => api.get<SavedView[]>('/v1/saved-views');
export const getSavedView = (name: string) => api.get<SavedView>(one(name));
export const createSavedView = (body: CreateSavedView) => api.post<SavedView>('/v1/saved-views', { body });
export const updateSavedView = (name: string, body: UpdateSavedView) => api.patch<SavedView>(one(name), { body });
export const deleteSavedView = (name: string) => api.delete<SavedView>(one(name));
