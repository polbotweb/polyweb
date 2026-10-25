import { apiRoute } from '@/lib/effect/http';
import { deleteEntryHandler, getEntryHandler, preflight, updateEntryHandler } from '@/modules/api/domain/v1';

export const prerender = false;
export const GET = apiRoute(getEntryHandler);
export const PATCH = apiRoute(updateEntryHandler);
export const DELETE = apiRoute(deleteEntryHandler);
export const OPTIONS = preflight;
