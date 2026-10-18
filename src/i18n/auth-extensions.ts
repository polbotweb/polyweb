/** Libellés des méthodes d'authentification additionnelles (brique h). */
import type { Locale } from '@i18n/config';

export interface AuthExtStrings {
  or: string;
  otpTitle: string; otpEmail: string; otpSend: string; otpSent: string; otpCode: string; otpVerify: string;
  passkeySignIn: string; socialContinue: string;
  twoFactorTitle: string; twoFactorHelp: string; twoFactorCode: string; twoFactorVerify: string; useBackupCode: string; trustDevice: string;
  securityTitle: string; securityDescription: string;
  totpEnable: string; totpDisable: string; totpEnabled: string; totpDisabled: string; totpScan: string; totpConfirm: string; passwordPrompt: string;
  backupCodesTitle: string; backupCodesHelp: string;
  passkeysTitle: string; passkeyAdd: string; passkeyName: string; passkeyDelete: string; passkeyNone: string; passkeyAdded: string;
  error: string; success: string;
}

const fr: AuthExtStrings = {
  or: 'ou', otpTitle: 'Recevoir un code par e-mail', otpEmail: 'Adresse e-mail', otpSend: 'Envoyer le code', otpSent: 'Code envoyé — vérifiez votre boîte de réception.', otpCode: 'Code à 6 chiffres', otpVerify: 'Se connecter avec le code',
  passkeySignIn: 'Se connecter avec une passkey', socialContinue: 'Continuer avec {provider}',
  twoFactorTitle: 'Vérification en deux étapes', twoFactorHelp: 'Saisissez le code de votre application d’authentification.', twoFactorCode: 'Code', twoFactorVerify: 'Vérifier', useBackupCode: 'Utiliser un code de secours', trustDevice: 'Faire confiance à cet appareil 30 jours',
  securityTitle: 'Sécurité du compte', securityDescription: 'Double authentification (TOTP) et passkeys.',
  totpEnable: 'Activer la 2FA', totpDisable: 'Désactiver la 2FA', totpEnabled: 'Double authentification activée.', totpDisabled: 'Double authentification désactivée.', totpScan: 'Scannez ce QR code avec votre application (Aegis, 1Password, Google Authenticator…), puis saisissez le code affiché.', totpConfirm: 'Confirmer', passwordPrompt: 'Mot de passe actuel',
  backupCodesTitle: 'Codes de secours', backupCodesHelp: 'Conservez ces codes en lieu sûr : chacun permet une connexion si vous perdez votre appareil.',
  passkeysTitle: 'Passkeys', passkeyAdd: 'Ajouter une passkey', passkeyName: 'Nom de la passkey', passkeyDelete: 'Supprimer', passkeyNone: 'Aucune passkey enregistrée.', passkeyAdded: 'Passkey ajoutée.',
  error: 'Une erreur est survenue.', success: 'Connexion réussie',
};
const en: AuthExtStrings = {
  or: 'or', otpTitle: 'Get a code by email', otpEmail: 'Email address', otpSend: 'Send code', otpSent: 'Code sent — check your inbox.', otpCode: '6-digit code', otpVerify: 'Sign in with code',
  passkeySignIn: 'Sign in with a passkey', socialContinue: 'Continue with {provider}',
  twoFactorTitle: 'Two-step verification', twoFactorHelp: 'Enter the code from your authenticator app.', twoFactorCode: 'Code', twoFactorVerify: 'Verify', useBackupCode: 'Use a backup code', trustDevice: 'Trust this device for 30 days',
  securityTitle: 'Account security', securityDescription: 'Two-factor authentication (TOTP) and passkeys.',
  totpEnable: 'Enable 2FA', totpDisable: 'Disable 2FA', totpEnabled: 'Two-factor authentication enabled.', totpDisabled: 'Two-factor authentication disabled.', totpScan: 'Scan this QR code with your authenticator app, then enter the displayed code.', totpConfirm: 'Confirm', passwordPrompt: 'Current password',
  backupCodesTitle: 'Backup codes', backupCodesHelp: 'Keep these codes safe: each one lets you sign in if you lose your device.',
  passkeysTitle: 'Passkeys', passkeyAdd: 'Add a passkey', passkeyName: 'Passkey name', passkeyDelete: 'Delete', passkeyNone: 'No passkey registered.', passkeyAdded: 'Passkey added.',
  error: 'Something went wrong.', success: 'Signed in',
};
const es: AuthExtStrings = {
  or: 'o', otpTitle: 'Recibir un código por correo', otpEmail: 'Correo electrónico', otpSend: 'Enviar código', otpSent: 'Código enviado: revisa tu bandeja de entrada.', otpCode: 'Código de 6 dígitos', otpVerify: 'Iniciar sesión con el código',
  passkeySignIn: 'Iniciar sesión con una passkey', socialContinue: 'Continuar con {provider}',
  twoFactorTitle: 'Verificación en dos pasos', twoFactorHelp: 'Introduce el código de tu app de autenticación.', twoFactorCode: 'Código', twoFactorVerify: 'Verificar', useBackupCode: 'Usar un código de respaldo', trustDevice: 'Confiar en este dispositivo 30 días',
  securityTitle: 'Seguridad de la cuenta', securityDescription: 'Autenticación en dos pasos (TOTP) y passkeys.',
  totpEnable: 'Activar 2FA', totpDisable: 'Desactivar 2FA', totpEnabled: '2FA activada.', totpDisabled: '2FA desactivada.', totpScan: 'Escanea este código QR con tu app y luego introduce el código.', totpConfirm: 'Confirmar', passwordPrompt: 'Contraseña actual',
  backupCodesTitle: 'Códigos de respaldo', backupCodesHelp: 'Guarda estos códigos: cada uno permite iniciar sesión si pierdes tu dispositivo.',
  passkeysTitle: 'Passkeys', passkeyAdd: 'Añadir una passkey', passkeyName: 'Nombre de la passkey', passkeyDelete: 'Eliminar', passkeyNone: 'Ninguna passkey registrada.', passkeyAdded: 'Passkey añadida.',
  error: 'Se produjo un error.', success: 'Sesión iniciada',
};
const ar: AuthExtStrings = {
  or: 'أو', otpTitle: 'تلقي رمز عبر البريد', otpEmail: 'البريد الإلكتروني', otpSend: 'إرسال الرمز', otpSent: 'تم إرسال الرمز — تحقق من بريدك.', otpCode: 'رمز من 6 أرقام', otpVerify: 'تسجيل الدخول بالرمز',
  passkeySignIn: 'تسجيل الدخول بمفتاح المرور', socialContinue: 'المتابعة باستخدام {provider}',
  twoFactorTitle: 'التحقق بخطوتين', twoFactorHelp: 'أدخل الرمز من تطبيق المصادقة.', twoFactorCode: 'الرمز', twoFactorVerify: 'تحقق', useBackupCode: 'استخدام رمز احتياطي', trustDevice: 'الوثوق بهذا الجهاز لمدة 30 يومًا',
  securityTitle: 'أمان الحساب', securityDescription: 'المصادقة الثنائية ومفاتيح المرور.',
  totpEnable: 'تفعيل المصادقة الثنائية', totpDisable: 'تعطيل المصادقة الثنائية', totpEnabled: 'تم تفعيل المصادقة الثنائية.', totpDisabled: 'تم تعطيل المصادقة الثنائية.', totpScan: 'امسح رمز QR بتطبيق المصادقة ثم أدخل الرمز.', totpConfirm: 'تأكيد', passwordPrompt: 'كلمة المرور الحالية',
  backupCodesTitle: 'رموز احتياطية', backupCodesHelp: 'احفظ هذه الرموز في مكان آمن.',
  passkeysTitle: 'مفاتيح المرور', passkeyAdd: 'إضافة مفتاح مرور', passkeyName: 'اسم المفتاح', passkeyDelete: 'حذف', passkeyNone: 'لا توجد مفاتيح مرور.', passkeyAdded: 'تمت إضافة المفتاح.',
  error: 'حدث خطأ.', success: 'تم تسجيل الدخول',
};

const ALL: Record<Locale, AuthExtStrings> = { fr, en, es, ar };
export function getAuthExtStrings(locale: Locale): AuthExtStrings {
  return ALL[locale] ?? fr;
}
