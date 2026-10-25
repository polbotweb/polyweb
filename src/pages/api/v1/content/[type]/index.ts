import { apiRoute } from '@/lib/effect/http';
import { createEntryHandler, listEntriesHandler, preflight } from '@/modules/api/domain/v1';

export const prerender = false;
export const GET = apiRoute(listEntriesHandler);
export const POST = apiRoute(createEntryHandler);
export const OPTIONS = preflight;
