import { apiRoute } from '@/lib/effect/http';
import { listContentTypesHandler, preflight } from '@/modules/api/domain/v1';

export const prerender = false;
export const GET = apiRoute(listContentTypesHandler);
export const OPTIONS = preflight;
