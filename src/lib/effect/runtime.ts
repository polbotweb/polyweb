/**
 * The shared ManagedRuntime. All Astro boundaries (routes, pages, middleware,
 * scripts) run Effects through it so that layers (DB pool, config, storage,
 * telemetry…) are built once per process.
 *
 * To add a service: create `Foo` + `FooLive` next to its domain, then merge
 * `FooLive` into `AppLayer` below and add `Foo` to `AppServices`.
 */
import { Layer, ManagedRuntime } from 'effect';
import { AppConfig, AppConfigLive } from './config';
import { Db, DbLive } from './db';
import { WebhookHttp, WebhookHttpLive } from '@/modules/webhooks/domain/http';
import { Storage, StorageLive } from '@/lib/storage';
import { Mailer, MailerLive } from '@/smtp/mailer';
import { SearchIndex, SearchIndexLive } from '@/lib/search';

const BaseLayer = Layer.mergeAll(DbLive, AppConfigLive);

export const AppLayer = Layer.mergeAll(WebhookHttpLive, StorageLive, MailerLive, SearchIndexLive).pipe(Layer.provideMerge(BaseLayer));

export type AppServices = Db | AppConfig | WebhookHttp | Storage | Mailer | SearchIndex;

type Runtime = ManagedRuntime.ManagedRuntime<AppServices, never>;
const globalKey = Symbol.for('polyweb.effect.runtime');
const g = globalThis as unknown as Record<symbol, Runtime | undefined>;

/** Survives Vite HMR in dev: one runtime per process. */
export const appRuntime: Runtime = g[globalKey] ?? (g[globalKey] = ManagedRuntime.make(AppLayer));
