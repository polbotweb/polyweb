import { apiRoute } from '@/lib/effect/http';
import { preflight } from '@/modules/api/domain/v1';
import { actionResourceHandler } from '@/modules/api/domain/resources';

export const prerender = false;
export const POST = apiRoute(actionResourceHandler);
export const OPTIONS = preflight;
