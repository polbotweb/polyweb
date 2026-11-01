import { apiRoute } from '@/lib/effect/http';
import { preflight } from '@/modules/api/domain/v1';
import { getResourceHandler, updateResourceHandler } from '@/modules/api/domain/resources';

export const prerender = false;
export const GET = apiRoute(getResourceHandler);
export const PATCH = apiRoute(updateResourceHandler);
export const OPTIONS = preflight;
