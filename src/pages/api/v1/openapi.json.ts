import { apiRoute } from '@/lib/effect/http';
import { openApiHandler, preflight } from '@/modules/api/domain/v1';

export const prerender = false;
export const GET = apiRoute(openApiHandler);
export const OPTIONS = preflight;
