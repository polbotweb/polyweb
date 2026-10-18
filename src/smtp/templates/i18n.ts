import type { Locale } from '@i18n/config';

// ─── Email Translation Dictionaries ──────────────────────────────────
// Shared i18n strings for all transactional email templates.
// Each template can also define its own specific strings below.

export interface EmailLayoutStrings {
  fallbackLink: string;
  footer: string;
}

export interface VerifyEmailStrings {
  subject: string;
  heading: string;
  greeting: string;
  body: string;
  button: string;
  ignore: string;
}

export interface ResetPasswordStrings {
  subject: string;
  heading: string;
  greeting: string;
  body: string;
  button: string;
  expiry: string;
  ignore: string;
}

export interface DeleteAccountStrings {
  subject: string;
  heading: string;
  greeting: string;
  body: string;
  button: string;
  warning: string;
  ignore: string;
}

export interface OrganizationInvitationStrings {
  subject: string;
  heading: string;
  greeting: string;
  body: string;
  button: string;
  ignore: string;
}

export interface BlogNewsletterStrings {
  subject: string;
  heading: string;
  greeting: string;
  greetingGeneric: string;
  body: string;
  button: string;
  extra: string;
  ignore: string;
  unsubscribedSubject: string;
  unsubscribedHeading: string;
  unsubscribedBody: string;
}

type EmailTranslations = {
  layout: EmailLayoutStrings;
  verifyEmail: VerifyEmailStrings;
  resetPassword: ResetPasswordStrings;
  deleteAccount: DeleteAccountStrings;
  organizationInvitation: OrganizationInvitationStrings;
  blogNewsletter: BlogNewsletterStrings;
};

const translations: Record<Locale, EmailTranslations> = {
  fr: {
    layout: {
      fallbackLink: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur\u00a0:',
      footer: 'Cet email a été envoyé automatiquement par Atomic. Ne répondez pas à ce message.',
    },
    verifyEmail: {
      subject: 'Confirmez votre adresse email',
      heading: 'Confirmez votre email',
      greeting: 'Bonjour {name},',
      body: 'Merci d\'avoir créé votre compte. Confirmez votre adresse email en cliquant sur le bouton ci-dessous.',
      button: 'Vérifier mon email',
      ignore: 'Si vous n\'avez pas créé de compte sur Atomic, ignorez simplement cet email.',
    },
    resetPassword: {
      subject: 'Réinitialisez votre mot de passe',
      heading: 'Réinitialisation du mot de passe',
      greeting: 'Bonjour {name},',
      body: 'Nous avons reçu une demande de réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.',
      button: 'Réinitialiser le mot de passe',
      expiry: 'Ce lien expirera dans 1 heure.',
      ignore: 'Si vous n\'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe restera inchangé.',
    },
    deleteAccount: {
      subject: 'Confirmation de suppression de compte',
      heading: 'Suppression de votre compte',
      greeting: 'Bonjour {name},',
      body: 'Vous avez demandé la suppression de votre compte. Cliquez sur le bouton ci-dessous pour confirmer cette action irréversible.',
      button: 'Confirmer la suppression',
      warning: 'Cette action est définitive. Toutes vos données seront supprimées de manière permanente.',
      ignore: 'Si vous n\'avez pas demandé la suppression de votre compte, ignorez cet email. Votre compte restera actif.',
    },
    organizationInvitation: {
      subject: 'Invitation à rejoindre {orgName}',
      heading: 'Vous êtes invité(e) à rejoindre une organisation',
      greeting: 'Bonjour,',
      body: '{inviterName} vous invite à rejoindre l\'organisation {orgName} en tant que {role}. Cliquez sur le bouton ci-dessous pour accepter l\'invitation.',
      button: 'Accepter l\'invitation',
      ignore: 'Si vous ne souhaitez pas rejoindre cette organisation, ignorez simplement cet email.',
    },
    blogNewsletter: {
      subject: 'Confirmez votre inscription à la newsletter',
      heading: 'Newsletter du blog',
      greeting: 'Bonjour {name},',
      greetingGeneric: 'Bonjour,',
      body: 'Confirmez votre inscription à notre newsletter pour recevoir nos meilleurs articles directement dans votre boîte mail.',
      button: 'Confirmer l\'inscription',
      extra: '',
      ignore: 'Si vous n\'avez pas demandé cette inscription, ignorez cet email ou {unsubscribeUrl}.',
      unsubscribedSubject: 'Désinscription confirmée',
      unsubscribedHeading: 'Vous êtes désabonné',
      unsubscribedBody: 'Vous ne recevrez plus notre newsletter. Vous pouvez vous réinscrire à tout moment.',
    },
  },
  en: {
    layout: {
      fallbackLink: 'If the button doesn\'t work, copy and paste this link into your browser:',
      footer: 'This email was sent automatically by Atomic. Please do not reply.',
    },
    verifyEmail: {
      subject: 'Verify your email address',
      heading: 'Verify your email',
      greeting: 'Hi {name},',
      body: 'Thanks for creating your account. Please verify your email address by clicking the button below.',
      button: 'Verify my email',
      ignore: 'If you didn\'t create an account on Atomic, you can safely ignore this email.',
    },
    resetPassword: {
      subject: 'Reset your password',
      heading: 'Password reset',
      greeting: 'Hi {name},',
      body: 'We received a request to reset your password. Click the button below to choose a new one.',
      button: 'Reset password',
      expiry: 'This link will expire in 1 hour.',
      ignore: 'If you didn\'t request this reset, please ignore this email. Your password will remain unchanged.',
    },
    deleteAccount: {
      subject: 'Account deletion confirmation',
      heading: 'Delete your account',
      greeting: 'Hi {name},',
      body: 'You requested to delete your account. Click the button below to confirm this irreversible action.',
      button: 'Confirm deletion',
      warning: 'This action is permanent. All your data will be permanently deleted.',
      ignore: 'If you didn\'t request to delete your account, please ignore this email. Your account will remain active.',
    },
    organizationInvitation: {
      subject: 'Invitation to join {orgName}',
      heading: 'You\'ve been invited to join an organization',
      greeting: 'Hello,',
      body: '{inviterName} has invited you to join {orgName} as a {role}. Click the button below to accept the invitation.',
      button: 'Accept invitation',
      ignore: 'If you don\'t want to join this organization, simply ignore this email.',
    },
    blogNewsletter: {
      subject: 'Confirm your newsletter subscription',
      heading: 'Blog newsletter',
      greeting: 'Hi {name},',
      greetingGeneric: 'Hello,',
      body: 'Confirm your subscription to our newsletter to receive our best articles straight to your inbox.',
      button: 'Confirm subscription',
      extra: '',
      ignore: 'If you didn\'t request this subscription, ignore this email or {unsubscribeUrl}.',
      unsubscribedSubject: 'Unsubscription confirmed',
      unsubscribedHeading: 'You are unsubscribed',
      unsubscribedBody: 'You will no longer receive our newsletter. You can subscribe again at any time.',
    },
  },
  es: {
    layout: {
      fallbackLink: 'Si el botón no funciona, copie y pegue este enlace en su navegador:',
      footer: 'Este correo fue enviado automáticamente por Atomic. No responda a este mensaje.',
    },
    verifyEmail: {
      subject: 'Confirme su dirección de correo',
      heading: 'Confirme su correo',
      greeting: 'Hola {name},',
      body: 'Gracias por crear su cuenta. Confirme su dirección de correo haciendo clic en el botón de abajo.',
      button: 'Verificar mi correo',
      ignore: 'Si no creó una cuenta en Atomic, puede ignorar este correo.',
    },
    resetPassword: {
      subject: 'Restablezca su contraseña',
      heading: 'Restablecimiento de contraseña',
      greeting: 'Hola {name},',
      body: 'Recibimos una solicitud para restablecer su contraseña. Haga clic en el botón de abajo para elegir una nueva.',
      button: 'Restablecer contraseña',
      expiry: 'Este enlace expirará en 1 hora.',
      ignore: 'Si no solicitó este restablecimiento, ignore este correo. Su contraseña no será modificada.',
    },
    deleteAccount: {
      subject: 'Confirmación de eliminación de cuenta',
      heading: 'Eliminar su cuenta',
      greeting: 'Hola {name},',
      body: 'Ha solicitado la eliminación de su cuenta. Haga clic en el botón de abajo para confirmar esta acción irreversible.',
      button: 'Confirmar eliminación',
      warning: 'Esta acción es definitiva. Todos sus datos serán eliminados permanentemente.',
      ignore: 'Si no solicitó la eliminación de su cuenta, ignore este correo. Su cuenta permanecerá activa.',
    },
    organizationInvitation: {
      subject: 'Invitación para unirse a {orgName}',
      heading: 'Ha sido invitado a unirse a una organización',
      greeting: 'Hola,',
      body: '{inviterName} le invita a unirse a {orgName} como {role}. Haga clic en el botón de abajo para aceptar la invitación.',
      button: 'Aceptar invitación',
      ignore: 'Si no desea unirse a esta organización, simplemente ignore este correo.',
    },
    blogNewsletter: {
      subject: 'Confirme su suscripción al boletín',
      heading: 'Boletín del blog',
      greeting: 'Hola {name},',
      greetingGeneric: 'Hola,',
      body: 'Confirme su suscripción a nuestro boletín para recibir nuestros mejores artículos directamente en su correo.',
      button: 'Confirmar suscripción',
      extra: '',
      ignore: 'Si no solicitó esta suscripción, ignore este correo o {unsubscribeUrl}.',
      unsubscribedSubject: 'Baja confirmada',
      unsubscribedHeading: 'Está dado de baja',
      unsubscribedBody: 'Ya no recibirá nuestro boletín. Puede suscribirse de nuevo cuando quiera.',
    },
  },
  ar: {
    layout: {
      fallbackLink: 'إذا لم يعمل الزر، انسخ هذا الرابط والصقه في متصفحك:',
      footer: 'تم إرسال هذا البريد تلقائيًا من Atomic. لا تقم بالرد على هذه الرسالة.',
    },
    verifyEmail: {
      subject: 'أكّد عنوان بريدك الإلكتروني',
      heading: 'تأكيد البريد الإلكتروني',
      greeting: 'مرحبًا {name}،',
      body: 'شكرًا لإنشاء حسابك. يرجى تأكيد عنوان بريدك الإلكتروني بالنقر على الزر أدناه.',
      button: 'تأكيد بريدي الإلكتروني',
      ignore: 'إذا لم تقم بإنشاء حساب على Atomic، يمكنك تجاهل هذا البريد.',
    },
    resetPassword: {
      subject: 'أعد تعيين كلمة المرور',
      heading: 'إعادة تعيين كلمة المرور',
      greeting: 'مرحبًا {name}،',
      body: 'تلقينا طلبًا لإعادة تعيين كلمة المرور الخاصة بك. انقر على الزر أدناه لاختيار كلمة مرور جديدة.',
      button: 'إعادة تعيين كلمة المرور',
      expiry: 'ستنتهي صلاحية هذا الرابط خلال ساعة واحدة.',
      ignore: 'إذا لم تطلب إعادة التعيين هذه، تجاهل هذا البريد. لن يتم تغيير كلمة المرور.',
    },
    deleteAccount: {
      subject: 'تأكيد حذف الحساب',
      heading: 'حذف حسابك',
      greeting: 'مرحبًا {name}،',
      body: 'لقد طلبت حذف حسابك. انقر على الزر أدناه لتأكيد هذا الإجراء غير القابل للتراجع.',
      button: 'تأكيد الحذف',
      warning: 'هذا الإجراء نهائي. سيتم حذف جميع بياناتك بشكل دائم.',
      ignore: 'إذا لم تطلب حذف حسابك، تجاهل هذا البريد. سيبقى حسابك نشطًا.',
    },
    organizationInvitation: {
      subject: 'دعوة للانضمام إلى {orgName}',
      heading: 'لقد تمت دعوتك للانضمام إلى مؤسسة',
      greeting: 'مرحبًا،',
      body: '{inviterName} يدعوك للانضمام إلى {orgName} بصفة {role}. انقر على الزر أدناه لقبول الدعوة.',
      button: 'قبول الدعوة',
      ignore: 'إذا لم ترغب في الانضمام إلى هذه المؤسسة، تجاهل هذا البريد.',
    },
    blogNewsletter: {
      subject: 'أكّد اشتراكك في النشرة البريدية',
      heading: 'نشرة المدونة',
      greeting: 'مرحبًا {name}،',
      greetingGeneric: 'مرحبًا،',
      body: 'أكّد اشتراكك في نشرتنا البريدية لتصلك أفضل مقالاتنا مباشرة إلى بريدك.',
      button: 'تأكيد الاشتراك',
      extra: '',
      ignore: 'إذا لم تطلب هذا الاشتراك، تجاهل هذا البريد أو {unsubscribeUrl}.',
      unsubscribedSubject: 'تم تأكيد الإلغاء',
      unsubscribedHeading: 'تم إلغاء اشتراكك',
      unsubscribedBody: 'لن تتلقى نشرتنا البريدية بعد الآن. يمكنك الاشتراك مجددًا في أي وقت.',
    },
  },
};

export function getEmailTranslations(locale: Locale): EmailTranslations {
  return translations[locale] ?? translations.fr;
}

/** Escape HTML special characters to prevent XSS in email templates */
function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Replace `{name}` placeholder in a string, HTML-escaping values */
export function interpolate(str: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, htmlEscape(value)),
    str,
  );
}
