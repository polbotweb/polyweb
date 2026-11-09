import { describe, expect, it } from 'vitest';
import { cleanMessagingBody } from '@/core/messaging/service';
import { messagingMessageTransition } from '@/modules/messaging/moderation/adapters';
describe('messagerie', () => {
  it('nettoie le HTML', () => { expect(cleanMessagingBody('<b>Salut</b>')).toBe('Salut'); expect(cleanMessagingBody('<p></p>')).toBeNull(); });
  it('transitions', () => {
    expect(messagingMessageTransition('visible', 'hide')).toBe('hidden');
    expect(messagingMessageTransition('hidden', 'hide')).toBeNull();
    expect(messagingMessageTransition('hidden', 'restore')).toBe('visible');
  });
});
