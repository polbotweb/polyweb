/**
 * db.backfill-customer-links — Rattache rétroactivement factures, réservations et commandes
 * invitées au compte dont l'e-mail VÉRIFIÉ correspond (insensible à la casse).
 *
 * Run: pnpm db:backfill-customer-links
 *
 * Idempotent : seuls les enregistrements sans propriétaire sont touchés ; un e-mail partagé par
 * plusieurs comptes vérifiés est ignoré. Les nouveaux comptes sont rattachés à la vérification
 * (hook `afterEmailVerification`), ce script ne sert qu'à l'existant.
 */
import { Effect } from 'effect';
import { shutdownDb } from '../drizzle';
import { backfillCustomerLinks } from '@/modules/portal/services/portal.service';
import { c, logTarget } from './_utils';
import { runScript } from './_effect';

const program = Effect.gen(function* () {
  console.log(c.cyan(c.bold('\n  🔗 Backfill Customer Links — portail client\n')));
  logTarget();
  const result = yield* backfillCustomerLinks();
  console.log(c.green(`  ✔ Factures : ${result.invoices}   Réservations : ${result.bookings}   Commandes : ${result.orders}\n`));
});

runScript('db:backfill-customer-links', program, { dispose: shutdownDb });
