import { apiRoute } from '@/lib/effect/http';
import { indexHandler, preflight } from '@/modules/api/domain/v1';

export const prerender = false;
export const GET = apiRoute(indexHandler);
export const OPTIONS = preflight;
