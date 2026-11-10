'use client';

import { useSyncExternalStore } from 'react';
import { RATE_LIMIT_IDLE, rateLimitState, subscribeRateLimit } from '@lib/api/rate-limit';

export const useRateLimit = () => useSyncExternalStore(subscribeRateLimit, rateLimitState, () => RATE_LIMIT_IDLE);
