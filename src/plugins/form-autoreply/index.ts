/**
 * Plugin d'exemple : accusé de réception automatique pour les formulaires.
 *
 * À chaque `form.submitted`, envoie un e-mail au visiteur (champ e-mail du
 * formulaire). Pour ne pas servir de relais de spam, le message ne contient
 * QUE le texte configuré par l'administrateur, jamais les données soumises.
 */
import { Effect, Schema } from 'effect';
import { definePlugin } from '@/core/plugins/contract';
import { Mailer } from '@/smtp/mailer';

const Settings = Schema.Struct({
  emailField: Schema.String.pipe(Schema.check(Schema.isPattern(/^[a-z][a-zA-Z0-9_]{0,62}$/))),
  forms: Schema.String.pipe(Schema.check(Schema.isMaxLength(1000))),
  subject: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(200))),
  body: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(5000))),
});
type Settings = typeof Settings.Type;

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export default definePlugin<Settings>({
  id: 'form-autoreply',
  name: 'Accusé de réception des formulaires',
  version: '1.0.0',
  description: 'Envoie un e-mail de confirmation au visiteur après chaque soumission de formulaire (texte fixe défini ici).',
  settings: {
    schema: Settings,
    defaults: { emailField: 'email', forms: '', subject: 'Nous avons bien reçu votre message', body: 'Bonjour,\n\nMerci pour votre message, nous vous répondrons rapidement.' },
    fields: [
      { name: 'emailField', label: 'Nom du champ e-mail', kind: 'text' },
      { name: 'forms', label: 'Formulaires concernés (slugs séparés par des virgules, vide = tous)', kind: 'text' },
      { name: 'subject', label: 'Objet', kind: 'text' },
      { name: 'body', label: 'Message', kind: 'textarea' },
    ],
  },
  setup: (ctx) =>
    ctx.on('form.submitted', (event) =>
      Effect.gen(function* () {
        const { settings } = ctx;
        const payload = event.payload as { form?: string; data?: Record<string, unknown> };
        const only = settings.forms.split(',').map((s) => s.trim()).filter(Boolean);
        if (only.length > 0 && !only.includes(String(payload.form))) return;
        const to = payload.data?.[settings.emailField];
        if (typeof to !== 'string' || !EMAIL.test(to) || to.length > 254) return;
        const mailer = yield* Mailer;
        yield* mailer.send({
          to,
          subject: settings.subject.replace(/[\r\n]+/g, ' '),
          text: settings.body,
          html: `<p>${escapeHtml(settings.body).replace(/\n/g, '<br>')}</p>`,
        });
      }),
    ),
});
