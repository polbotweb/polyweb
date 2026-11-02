import { afterEach, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import {
  clearNotificationDefinitionsForTests,
  defineModuleNotifications,
  definitionsForEvent,
  getNotificationDefinition,
  listNotificationCategories,
  registerNotificationDefinitions,
} from '@/core/notifications/registry';
import { defaultNotificationCategory, notificationRow } from '@/core/notifications';
import { MODULE_NOTIFICATIONS } from '@/modules/notifications';

afterEach(() => clearNotificationDefinitionsForTests());

describe('notifications registry', () => {
  it('registers module definitions and exposes categories with their channels', () => {
    registerNotificationDefinitions(defineModuleNotifications('demo', [
      { type: 'A_THING', category: 'comments', channels: ['in_app'] },
      { type: 'B_THING', category: 'billing', channels: ['in_app', 'email'], emailTemplate: 'demo.b' },
    ]));
    expect(getNotificationDefinition('demo', 'A_THING')?.module).toBe('demo');
    expect(listNotificationCategories()).toEqual([
      { category: 'comments', channels: ['in_app'] },
      { category: 'billing', channels: ['in_app', 'email'] },
    ]);
  });

  it('rejects invalid declarations', () => {
    expect(() => registerNotificationDefinitions(defineModuleNotifications('demo', [{ type: 'bad', category: 'x', channels: ['in_app'] }]))).toThrow(/Invalid/);
    expect(() => registerNotificationDefinitions(defineModuleNotifications('demo', [{ type: 'NO_CHANNEL', category: 'x', channels: [] }]))).toThrow(/no channel/);
    expect(() => registerNotificationDefinitions(defineModuleNotifications('demo', [{ type: 'MAIL', category: 'x', channels: ['email'] }]))).toThrow(/emailTemplate/);
    expect(() => registerNotificationDefinitions(defineModuleNotifications('demo', [{ type: 'EVT', category: 'x', channels: ['in_app'], event: 'demo.done' }]))).toThrow(/recipients/);
    expect(() => registerNotificationDefinitions({ module: 'a', definitions: [{ module: 'b', type: 'X', category: 'x', channels: ['in_app'] }] })).toThrow(/outside/);
  });

  it('indexes definitions by event', () => {
    registerNotificationDefinitions(defineModuleNotifications('demo', [
      { type: 'EVT', category: 'system', channels: ['in_app'], event: 'demo.done', recipients: () => Effect.succeed([]) },
    ]));
    expect(definitionsForEvent('demo.done').map((d) => d.type)).toEqual(['EVT']);
    expect(definitionsForEvent('demo.other')).toEqual([]);
  });

  it('every built-in module declaration is valid', () => {
    for (const entry of MODULE_NOTIFICATIONS) expect(() => registerNotificationDefinitions(entry)).not.toThrow();
  });
});

describe('notificationRow', () => {
  it('strips null data keys and derives the category like migration 0052', () => {
    expect(notificationRow({ userId: 'u', module: 'blog', type: 'NEW_REVIEW', data: { reviewId: 'r', commentId: null } })).toMatchObject({
      category: 'reviews', data: { reviewId: 'r' }, organizationId: null, dedupeKey: null,
    });
    expect(defaultNotificationCategory('SERVICE_PUBLISHED')).toBe('publishing');
    expect(defaultNotificationCategory('POST_MENTION')).toBe('mentions');
    expect(defaultNotificationCategory('NEW_COMMENT')).toBe('comments');
  });
});
