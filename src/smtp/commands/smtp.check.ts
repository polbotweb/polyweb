import { getSmtpProvider, getSmtpFrom, getProviderLabel } from '../env';
import { sendEmail } from '../send';
import { c, logSmtpTarget } from './_utils';

async function main() {
  const args = process.argv.slice(2);
  const emailFlag = args.find(a => a.startsWith('--email'));
  const testTo = emailFlag?.includes('=') ? emailFlag.split('=')[1] : process.env.SMTP_TEST_TO;

  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  console.log(c.cyan(c.bold(`   📧 SMTP Check — ${getProviderLabel()}`)));
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  // ─── 1. Configuration summary ──────────────────────────────────────
  console.log(c.bold('🔍 Configuration détectée:'));
  logSmtpTarget();

  // ─── 2. Validate required env vars ─────────────────────────────────
  console.log(c.bold('\n🔑 Vérification des variables d\'environnement:'));

  const provider = getSmtpProvider();
  const from = getSmtpFrom(); // will exit if SMTP_FROM_EMAIL is missing
  console.log(c.green(`  ✔ SMTP_PROVIDER = ${provider}`));
  console.log(c.green(`  ✔ SMTP_FROM_EMAIL = ${from.email}`));
  console.log(c.green(`  ✔ SMTP_FROM_NAME = ${from.name}`));

  // Provider-specific vars are validated lazily when calling getXxxConfig()
  // Force validation now
  switch (provider) {
    case 'BREVO': {
      const { getBrevoConfig } = await import('../env');
      getBrevoConfig(); // exits if BREVO_API_KEY missing
      console.log(c.green(`  ✔ BREVO_API_KEY configurée`));
      break;
    }
    case 'RESEND': {
      const { getResendConfig } = await import('../env');
      getResendConfig(); // exits if RESEND_API_KEY missing
      console.log(c.green(`  ✔ RESEND_API_KEY configurée`));
      break;
    }
    case 'NODEMAILER': {
      const { getNodemailerConfig } = await import('../env');
      const cfg = getNodemailerConfig(); // exits if SMTP_HOST missing
      console.log(c.green(`  ✔ SMTP_HOST = ${cfg.host}`));
      console.log(c.green(`  ✔ SMTP_PORT = ${cfg.port}`));
      break;
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Fournisseur SMTP inconnu : ${_exhaustive}`);
    }
  }

  // ─── 3. Connectivity test ──────────────────────────────────────────
  console.log(c.bold('\n🔌 Test de connexion:'));

  try {
    switch (provider) {
      case 'BREVO': {
        const brevo = await import('../providers/brevo');
        await brevo.verify();
        console.log(c.green(`  ✔ API Brevo accessible — clé valide`));
        break;
      }
      case 'RESEND': {
        const resend = await import('../providers/resend');
        await resend.verify();
        console.log(c.green(`  ✔ API Resend accessible — clé valide`));
        break;
      }
      case 'NODEMAILER': {
        const nm = await import('../providers/nodemailer');
        await nm.verify();
        console.log(c.green(`  ✔ Serveur SMTP accessible`));
        break;
      }
      default: {
        const _exhaustive: never = provider;
        throw new Error(`Fournisseur SMTP inconnu : ${_exhaustive}`);
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errCode = (err as { code?: string })?.code;
    console.error(c.red(`  ✖ Connexion échouée: ${errMsg}`));

    if (provider === 'NODEMAILER') {
      const code = errCode;
      if (code === 'ECONNREFUSED') {
        console.error(c.yellow(`    → Le serveur SMTP est-il démarré ?`));
        console.error(c.dim(`    → Vérifiez SMTP_HOST et SMTP_PORT dans .env`));
      } else if (code === 'ENOTFOUND') {
        console.error(c.yellow(`    → Hôte SMTP introuvable — vérifiez SMTP_HOST`));
      } else if (code === 'EAUTH' || code === 'EENVELOPE') {
        console.error(c.yellow(`    → Authentification échouée — vérifiez SMTP_USER / SMTP_PASS`));
      }

      // Erreur SSL typique : secure=true sur port 587 (qui attend STARTTLS)
      if (errMsg?.includes('wrong version number') || errMsg?.includes('SSL')) {
        console.error(c.yellow(`    → Erreur SSL — vérifiez le couple SMTP_PORT / SMTP_SECURE :`));
        console.error(c.dim(`      Port 587 → SMTP_SECURE=false (STARTTLS automatique)`));
        console.error(c.dim(`      Port 465 → SMTP_SECURE=true  (TLS directe)`));
      }
    }

    if (provider === 'BREVO' || provider === 'RESEND') {
      console.error(c.yellow(`    → Vérifiez votre clé API dans .env`));
    }

    process.exit(1);
  }

  // ─── 4. Send test email (--email flag) ─────────────────────────────
  if (emailFlag) {
    if (!testTo) {
      console.error(c.red(`\n❌ Destinataire manquant.`));
      console.error(c.yellow(`   Usage : pnpm smtp:check --email=dest@example.com`));
      console.error(c.yellow(`   Ou définissez SMTP_TEST_TO dans .env`));
      process.exit(1);
    }

    console.log(c.bold(`\n📨 Envoi d'un email de test à ${testTo}:`));

    try {
      await sendEmail({
        to: testTo,
        subject: `[Atomic] Test SMTP — ${provider}`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1a1a2e;">📧 Test SMTP réussi !</h2>
            <p>Ce message confirme que la configuration SMTP fonctionne correctement.</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
              <tr><td style="padding: 8px; color: #666;">Provider</td><td style="padding: 8px; font-weight: bold;">${getProviderLabel()}</td></tr>
              <tr><td style="padding: 8px; color: #666;">From</td><td style="padding: 8px;">${from.name} &lt;${from.email}&gt;</td></tr>
              <tr><td style="padding: 8px; color: #666;">Date</td><td style="padding: 8px;">${new Date().toISOString()}</td></tr>
            </table>
            <p style="color: #999; font-size: 12px; margin-top: 24px;">Envoyé depuis smtp:check --email</p>
          </div>
        `,
        text: `Test SMTP réussi !\n\nProvider: ${getProviderLabel()}\nFrom: ${from.name} <${from.email}>\nDate: ${new Date().toISOString()}`,
      });
      console.log(c.green(`  ✔ Email envoyé à ${testTo}`));
      console.log(c.yellow(`  ⚠  Si vous ne recevez pas l'email, vérifiez :`));
      console.log(c.dim(`     - Le sender (${from.email}) est autorisé/vérifié chez votre provider`));
      console.log(c.dim(`     - Le dossier spam du destinataire`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(c.red(`  ✖ Échec de l'envoi: ${msg}`));
      process.exit(1);
    }
  }

  // ─── Done ──────────────────────────────────────────────────────────
  console.log(c.green(c.bold(`\n✅ SMTP OK — ${getProviderLabel()}`)));
  if (!emailFlag) {
    console.log(c.dim(`   Ajoutez --email ou --email=dest@example.com pour envoyer un test`));
  }
  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════\n`)));
}

main().catch((err) => {
  console.error(c.red('[smtp:check] Échec:'), err);
  process.exit(1);
});
