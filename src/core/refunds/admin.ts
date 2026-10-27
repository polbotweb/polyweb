/**
 * Remboursements depuis l'administration (pages SSR des modules : commande, réservation, facture).
 *
 * - `refundPanelView` : paiements capturés d'un objet (`<purpose>:<subjectId>`), historique et reste
 *   remboursable ; visible avec `payment:read` sur le tenant du paiement, formulaire avec `payment:refund`.
 * - `handleRefundPost` : formulaire classique (POST → 303, aucun JS, CSP stricte ; origine contrôlée
 *   par le middleware). Permission tenant revérifiée sur le paiement lu en base, limite de débit,
 *   montant décimal converti sans flottant, clé d'idempotence = nonce du formulaire (double envoi
 *   sans effet), retour uniquement vers une page d'administration de la même origine.
 */
import { randomUUID } from 'node:crypto';
import type { ActionAPIContext } from 'astro:actions';
import { Effect, Schema } from 'effect';
import { eq } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { payments } from '@database/schemas';
import { REFUND_REASONS, type RefundReason } from '@database/schemas/refunds.schema';
import { LOCALES, type Locale } from '@i18n/config';
import { fromDecimal, isCurrencyCode } from '@/core/money';
import { actionRateLimit, requireTenantPermission } from '@/lib/effect/action';
import { dbTry } from '@/lib/effect/run';
import { runApp, runAppResult } from '@/lib/effect/http';
import { refundablePaymentsFor, requestRefund } from './service';
import type { RefundNoticeKey } from './i18n';

type Ctx = Pick<ActionAPIContext, 'locals'>;

const allowed = (context: Ctx, action: 'read' | 'refund', organizationId: string | null) =>
  requireTenantPermission(context, { payment: [action] }, organizationId).pipe(Effect.as(true), Effect.orElseSucceed(() => false));

const NOTICE_KEYS: ReadonlySet<string> = new Set<RefundNoticeKey>(['done', 'pending', 'failed', 'forbidden', 'notFound', 'notAllowed', 'exceeded', 'invalidAmount', 'conflict', 'tooMany', 'unavailable', 'generic']);
export const REFUND_NOTICE_PARAM = 'refund';

/** Panneau d'une page admin : `null` si aucun paiement visible (droits ou absence). */
export async function refundPanelView(context: Ctx & { readonly url: URL }, reference: string) {
  const entries = await runApp(refundablePaymentsFor(reference));
  const visible = [];
  for (const entry of entries) {
    if (!(await runApp(allowed(context, 'read', entry.payment.organizationId)))) continue;
    visible.push({ ...entry, canRefund: entry.summary.remaining > 0 && (await runApp(allowed(context, 'refund', entry.payment.organizationId))) });
  }
  if (visible.length === 0) return null;
  const raw = context.url.searchParams.get(REFUND_NOTICE_PARAM) ?? '';
  const notice = NOTICE_KEYS.has(raw) ? (raw as RefundNoticeKey) : null;
  return { entries: visible, notice, nonce: randomUUID(), returnTo: context.url.pathname };
}
export type RefundPanelView = NonNullable<Awaited<ReturnType<typeof refundPanelView>>>;

const RETURN_TO = new RegExp(`^/(${LOCALES.join('|')})/admin(/[A-Za-z0-9_\\-]+){1,4}$`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const RefundForm = Schema.Struct({
  paymentId: Schema.String.pipe(Schema.check(Schema.isMaxLength(64), Schema.isMinLength(1))),
  nonce: Schema.String.pipe(Schema.check(Schema.isPattern(UUID))),
  amount: Schema.String.pipe(Schema.check(Schema.isMaxLength(20))),
  reason: Schema.Literals(REFUND_REASONS),
  note: Schema.String.pipe(Schema.check(Schema.isMaxLength(500))),
});

const noticeOf = (error: unknown): RefundNoticeKey => {
  const e = error as { _tag?: string; code?: string; reason?: string } | null;
  switch (e?._tag) {
    case 'RefundAmountExceededError': return 'exceeded';
    case 'RefundIdempotencyConflictError': return 'conflict';
    case 'InvalidAmountError': return 'invalidAmount';
    case 'PaymentsUnavailableError': return 'unavailable';
    case 'RefundNotAllowedError': return e.reason === 'not_found' ? 'notFound' : e.reason === 'amount' ? 'invalidAmount' : 'notAllowed';
    default:
      return e?.code === 'FORBIDDEN' || e?.code === 'UNAUTHORIZED' ? 'forbidden' : e?.code === 'NOT_FOUND' ? 'notFound' : e?.code === 'TOO_MANY_REQUESTS' ? 'tooMany' : 'generic';
  }
};

/** Traite le POST du panneau et renvoie la redirection 303 vers la page d'origine. */
export async function handleRefundPost(context: Ctx & { readonly request: Request; readonly params: Record<string, string | undefined> }): Promise<Response> {
  const lang = LOCALES.includes(context.params.lang as Locale) ? context.params.lang! : 'fr';
  const fd = await context.request.formData();
  const text = (k: string) => { const v = fd.get(k); return typeof v === 'string' ? v.trim() : ''; };
  const returnTo = RETURN_TO.test(text('returnTo')) ? text('returnTo') : `/${lang}/admin`;
  const back = (key: RefundNoticeKey) => new Response(null, { status: 303, headers: { Location: `${returnTo}?${REFUND_NOTICE_PARAM}=${key}#refunds`, 'cache-control': 'no-store' } });

  const user = context.locals.user;
  if (!user) return back('forbidden');
  const form = Schema.decodeUnknownOption(RefundForm)({ paymentId: text('paymentId'), nonce: text('nonce'), amount: text('amount').replace(',', '.'), reason: text('reason'), note: text('note') });
  if (form._tag === 'None') return back('invalidAmount');
  const input = form.value;

  const result = await runAppResult(Effect.gen(function* () {
    const [payment] = yield* dbTry('refunds.admin.payment', () => getDrizzle().select({ id: payments.id, organizationId: payments.organizationId, currency: payments.currency }).from(payments).where(eq(payments.id, input.paymentId)).limit(1));
    if (!payment) return yield* Effect.fail({ code: 'NOT_FOUND' });
    yield* requireTenantPermission(context, { payment: ['refund'] }, payment.organizationId);
    yield* actionRateLimit(user.id, 'payment:refund', { window: 60, max: 10 });
    if (!isCurrencyCode(payment.currency)) return yield* Effect.fail({ code: 'NOT_FOUND' });
    const amount = input.amount === '' ? undefined : yield* fromDecimal(input.amount, payment.currency);
    return yield* requestRefund({
      paymentId: payment.id, organizationId: payment.organizationId, requestedBy: user.id,
      ...(amount ? { amount } : {}), reason: input.reason as RefundReason, note: input.note || null,
      idempotencyKey: `admin:${user.id}:${input.nonce}`,
    });
  }));
  if (!result.ok) return back(noticeOf(result.error));
  return back(result.value.status === 'succeeded' ? 'done' : result.value.status === 'pending' ? 'pending' : 'failed');
}
