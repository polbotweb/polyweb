/** Plugin d'exemple : bloc « Question / réponse » rendu en <details> accessible. */
import { Effect } from 'effect';
import { z } from 'astro/zod';
import { definePlugin } from '@/core/plugins/contract';
import { escapeHtml } from '@/core/blocks/tiptap-html';

const faqSchema = z.object({ question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(5000), open: z.boolean().optional() });

export default definePlugin({
  id: 'faq-block',
  name: 'Bloc FAQ',
  version: '1.0.0',
  description: 'Ajoute un bloc « faq » (question repliable + réponse) utilisable dans les contenus à blocs.',
  setup: (ctx) =>
    ctx.registerBlock({
      type: 'faq',
      label: 'Question / réponse',
      schema: faqSchema,
      render: (d) => `<details class="pw-faq"${d.open ? ' open' : ''}><summary>${escapeHtml(d.question)}</summary><div>${escapeHtml(d.answer).replace(/\n/g, '<br>')}</div></details>`,
      toText: (d) => `${d.question}\n${d.answer}`,
      editorFields: [
        { name: 'question', label: 'Question', kind: 'text' },
        { name: 'answer', label: 'Réponse', kind: 'textarea' },
      ],
    }).pipe(Effect.asVoid),
});
