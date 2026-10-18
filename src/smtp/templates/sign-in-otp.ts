/**
 * Code de connexion à usage unique (plugin Better Auth emailOTP).
 * Remplace le flux OTP maison d'annuaire2 par le plugin officiel ; libellés i18n fr/en/es/ar.
 */
import type { Locale } from '@i18n/config';
import { getEmailTranslations } from './i18n';
import { renderEmailHtml, renderEmailText } from './layout';

export type OtpPurpose = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email';

const STRINGS: Record<Locale, { subject: Record<OtpPurpose, string>; heading: string; body: string; button: string; expiry: string; ignore: string; greeting: string }> = {
  fr: {
    subject: { 'sign-in': 'Votre code de connexion', 'email-verification': 'Votre code de vérification', 'forget-password': 'Votre code de réinitialisation', 'change-email': 'Votre code de changement d’e-mail' },
    greeting: 'Bonjour,', heading: 'Votre code : {code}', body: 'Saisissez ce code à usage unique pour continuer.', button: 'Ouvrir la page de connexion',
    expiry: 'Ce code expire dans {minutes} minutes.', ignore: 'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.',
  },
  en: {
    subject: { 'sign-in': 'Your sign-in code', 'email-verification': 'Your verification code', 'forget-password': 'Your password reset code', 'change-email': 'Your email change code' },
    greeting: 'Hello,', heading: 'Your code: {code}', body: 'Enter this one-time code to continue.', button: 'Open the sign-in page',
    expiry: 'This code expires in {minutes} minutes.', ignore: 'If you did not request this, you can ignore this email.',
  },
  es: {
    subject: { 'sign-in': 'Tu código de acceso', 'email-verification': 'Tu código de verificación', 'forget-password': 'Tu código de restablecimiento', 'change-email': 'Tu código de cambio de correo' },
    greeting: 'Hola,', heading: 'Tu código: {code}', body: 'Introduce este código de un solo uso para continuar.', button: 'Abrir la página de acceso',
    expiry: 'Este código caduca en {minutes} minutos.', ignore: 'Si no lo solicitaste, ignora este correo.',
  },
  ar: {
    subject: { 'sign-in': 'رمز تسجيل الدخول', 'email-verification': 'رمز التحقق', 'forget-password': 'رمز إعادة تعيين كلمة المرور', 'change-email': 'رمز تغيير البريد الإلكتروني' },
    greeting: 'مرحبًا،', heading: 'رمزك: {code}', body: 'أدخل هذا الرمز لمرة واحدة للمتابعة.', button: 'فتح صفحة تسجيل الدخول',
    expiry: 'تنتهي صلاحية هذا الرمز خلال {minutes} دقائق.', ignore: 'إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.',
  },
};

export function signInOtpTemplate(opts: { locale: Locale; code: string; purpose: OtpPurpose; signInUrl: string; expiresInMinutes: number }) {
  const t = STRINGS[opts.locale] ?? STRINGS.fr;
  const { layout } = getEmailTranslations(opts.locale);
  const section = {
    heading: t.heading.replace('{code}', opts.code),
    greeting: t.greeting,
    body: t.body,
    buttonText: t.button,
    buttonUrl: opts.signInUrl,
    extra: t.expiry.replace('{minutes}', String(opts.expiresInMinutes)),
    footnote: t.ignore,
  };
  return {
    subject: `${t.subject[opts.purpose]} — Polyweb`,
    html: renderEmailHtml(opts.locale, layout, section),
    text: renderEmailText(section),
  };
}
