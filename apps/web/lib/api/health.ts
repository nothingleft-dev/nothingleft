import type { DeepHealth, Health } from '@nothingleft/types';
import { api } from '@lib/api/client';

export const getHealth = () => api.get<Health>('/health');
export const getDeepHealth = () => api.get<DeepHealth>('/health/deep');
