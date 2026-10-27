/**
 * Référence de paiement `<purpose>:<subjectId>` : le `purpose` désigne le module
 * propriétaire (ex. `booking-deposit`, `sales-invoice`), `subjectId` l'objet payé.
 */
import { Effect } from 'effect';
import { UnknownPaymentPurposeError } from './errors';

const PURPOSE = /^[a-z][a-z0-9-]{1,39}$/;
const SUBJECT = /^[A-Za-z0-9_-]{1,120}$/;

export interface PaymentReference {
  readonly purpose: string;
  readonly subjectId: string;
}

export const isValidPurpose = (purpose: string) => PURPOSE.test(purpose);

export const formatReference = (ref: PaymentReference): Effect.Effect<string, UnknownPaymentPurposeError> =>
  PURPOSE.test(ref.purpose) && SUBJECT.test(ref.subjectId)
    ? Effect.succeed(`${ref.purpose}:${ref.subjectId}`)
    : Effect.fail(new UnknownPaymentPurposeError({ reference: `${ref.purpose}:${ref.subjectId}` }));

export const parseReference = (reference: string): PaymentReference | null => {
  const index = reference.indexOf(':');
  if (index < 0) return null;
  const purpose = reference.slice(0, index);
  const subjectId = reference.slice(index + 1);
  return PURPOSE.test(purpose) && SUBJECT.test(subjectId) ? { purpose, subjectId } : null;
};
