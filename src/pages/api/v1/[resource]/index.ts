import { apiRoute } from '@/lib/effect/http';
import { preflight } from '@/modules/api/domain/v1';
import { createResourceHandler, listResourceHandler } from '@/modules/api/domain/resources';

export const prerender = false;
export const GET = apiRoute(listResourceHandler);
export const POST = apiRoute(createResourceHandler);
export const OPTIONS = preflight;
