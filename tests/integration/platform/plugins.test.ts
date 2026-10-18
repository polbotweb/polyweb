import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { getDrizzle, schema } from '@database/drizzle';
import { appRuntime } from '@/lib/effect/runtime';
import { Mailer, makeMemoryMailer } from '@/smtp/mailer';
import { getBlock, parseBlocksDocument, renderBlocksToHtml } from '@/core/blocks/registry';
import { emitEvent } from '@/core/events';
import { definePlugin, PluginSetupError } from '@/core/plugins/contract';
import {
  setInstalledPlugins, setPluginEnabled, savePluginSettings, listPlugins, syncPlugins, isPluginActive,
  resetPluginHostForTests, setPluginHandlerRunnerForTests,
} from '@/core/plugins/host';
import faqBlock from '@/plugins/faq-block';
import formAutoreply from '@/plugins/form-autoreply';

const mailer = makeMemoryMailer();
const run = <A, E>(e: Effect.Effect<A, E, any>) => appRuntime.runPromise(e as Effect.Effect<A, E, never>);
const runExit = <A, E>(e: Effect.Effect<A, E, any>) => appRuntime.runPromiseExit(e as Effect.Effect<A, E, never>);

let counterSetups = 0;
const counter = definePlugin<{ label: string }>({
  id: 'test-counter',
  name: 'Compteur (test)',
  version: '0.0.1',
  description: 'test',
  settings: { schema: Schema.Struct({ label: Schema.String.pipe(Schema.check(Schema.isMinLength(2))) }), defaults: { label: 'ok' }, fields: [{ name: 'label', label: 'Label', kind: 'text' }] },
  setup: () => Effect.sync(() => void counterSetups++),
});
const broken = definePlugin({
  id: 'test-broken',
  name: 'Cassé (test)',
  version: '0.0.1',
  description: 'test',
  setup: (ctx) =>
    Effect.gen(function* () {
      yield* ctx.registerBlock({ type: 'brokenThing', label: 'x', schema: Schema.String as never, render: () => '' });
      return yield* new PluginSetupError({ pluginId: 'test-broken', reason: 'boom' });
    }),
});
const IDS = ['faq-block', 'form-autoreply', 'test-counter', 'test-broken'];

beforeAll(async () => {
  await getDrizzle().delete(schema.pluginStates).where(inArray(schema.pluginStates.pluginId, IDS));
  setInstalledPlugins([faqBlock, formAutoreply, counter, broken]);
  setPluginHandlerRunnerForTests((eff) => appRuntime.runPromise(Effect.provideService(eff, Mailer, mailer)));
});
afterAll(async () => {
  await run(resetPluginHostForTests);
  setPluginHandlerRunnerForTests(null);
  await getDrizzle().delete(schema.pluginStates).where(inArray(schema.pluginStates.pluginId, IDS));
});

describe('plugin system (brick i)', () => {
  it('lists installed plugins as inactive by default', async () => {
    const list = await run(listPlugins);
    expect(list.map((p) => [p.id, p.enabled, p.active])).toEqual(IDS.map((id) => [id, false, false]));
    expect(list.find((p) => p.id === 'form-autoreply')!.settings.emailField).toBe('email');
  });

  it('enabling faq-block registers its block, disabling removes it', async () => {
    expect(getBlock('faq')).toBeUndefined();
    expect(await run(setPluginEnabled('faq-block', true, null))).toBeNull();
    expect(getBlock('faq')?.source).toBe('faq-block');
    const doc = parseBlocksDocument({ version: 1, blocks: [{ id: 'a', type: 'faq', data: { question: 'Pourquoi <b>?', answer: 'Parce que' } }] });
    expect(renderBlocksToHtml(doc)).toContain('<summary>Pourquoi &lt;b&gt;?</summary>');
    await run(setPluginEnabled('faq-block', false, null));
    expect(getBlock('faq')).toBeUndefined();
    expect(() => parseBlocksDocument(doc)).toThrow(/inconnu/);
  });

  it('a failing setup is recorded, rolled back and isolated', async () => {
    const error = await run(setPluginEnabled('test-broken', true, null));
    expect(error).toContain('boom');
    expect(isPluginActive('test-broken')).toBe(false);
    expect(getBlock('brokenThing')).toBeUndefined();
    const row = (await run(listPlugins)).find((p) => p.id === 'test-broken')!;
    expect(row).toMatchObject({ enabled: true, active: false });
    expect(row.error).toContain('boom');
    await run(setPluginEnabled('test-broken', false, null));
    expect((await run(listPlugins)).find((p) => p.id === 'test-broken')!.error).toBeNull();
  });

  it('settings are validated by the plugin schema; changes re-run setup, unchanged sync is a no-op', async () => {
    await run(setPluginEnabled('test-counter', true, null));
    expect(counterSetups).toBe(1);
    await run(syncPlugins);
    expect(counterSetups).toBe(1);
    const bad = await runExit(savePluginSettings('test-counter', { label: 'x' }, null));
    expect(bad._tag).toBe('Failure');
    await run(savePluginSettings('test-counter', { label: 'nouveau' }, null));
    expect(counterSetups).toBe(2);
    expect((await run(listPlugins)).find((p) => p.id === 'test-counter')!.settings.label).toBe('nouveau');
    const unknown = await runExit(setPluginEnabled('nope', true, null));
    expect(unknown._tag).toBe('Failure');
  });

  it('form-autoreply sends the configured text (never the submitted data) to the submitter', async () => {
    await run(savePluginSettings('form-autoreply', { emailField: 'email', forms: 'contact', subject: 'Merci', body: 'Bien reçu.' }, null));
    await run(setPluginEnabled('form-autoreply', true, null));
    mailer.sent.length = 0;
    await emitEvent('form.submitted', { form: 'contact', data: { email: 'visitor@example.test', message: '<script>spam</script>' } });
    await emitEvent('form.submitted', { form: 'other', data: { email: 'x@example.test' } });
    await emitEvent('form.submitted', { form: 'contact', data: { email: 'not-an-email' } });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: 'visitor@example.test', subject: 'Merci', text: 'Bien reçu.' });
    expect(mailer.sent[0]!.html).not.toContain('spam');
    await run(setPluginEnabled('form-autoreply', false, null));
    await emitEvent('form.submitted', { form: 'contact', data: { email: 'visitor@example.test' } });
    expect(mailer.sent).toHaveLength(1);
  });
});
