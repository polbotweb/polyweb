import type { CommonTranslations } from '../config';

export default {
  meta: {
    title: 'Starwind Pro — سرّع عملية التطوير',
    description: 'أنشئ تطبيقات جاهزة للإنتاج في نصف الوقت.',
  },
  pageRoutes: {
    about: 'من-نحن',
    contact: 'اتصل-بنا',
    legal: 'الشروط-القانونية',
  },
  nav: {
    features: 'الميزات',
    analytics: 'التحليلات',
    integrations: 'التكاملات',
    team: 'الفريق',
    about: 'حول',
    contact: 'اتصل بنا',
  },
  cta: {
    getStarted: 'ابدأ الآن',
    signIn: 'تسجيل الدخول',
  },
  footer: {
    socialHeading: 'شبكاتنا الاجتماعية',
    navPrimary: 'التنقل الرئيسي',
    navSecondary: 'التنقل الثانوي',
    legalHeading: 'قانوني',
    copyright: '© 2026 — جميع الحقوق محفوظة',
    home: 'الرئيسية',
    aboutLink: 'حول',
    contact: 'اتصل بنا',
    legalNotice: 'إشعار قانوني',
    privacyPolicy: 'سياسة الخصوصية',
    termsOfSale: 'الشروط العامة للبيع',
  },
  a11y: {
    openMenu: 'فتح القائمة',
    switchLanguage: 'تغيير اللغة',
    skipToContent: 'انتقل إلى المحتوى الرئيسي',
  },
  errors: {
    notFound: {
      title: 'الصفحة غير موجودة',
      heading: 'الصفحة غير موجودة',
      message: 'الصفحة التي تبحث عنها غير موجودة أو تم نقلها.',
      back: 'العودة إلى الصفحة الرئيسية',
    },
    serverError: {
      title: 'خطأ في الخادم',
      heading: 'خطأ داخلي في الخادم',
      message: 'حدث خطأ ما. يرجى المحاولة مرة أخرى لاحقاً.',
      back: 'العودة إلى الصفحة الرئيسية',
    },
  },
  rss: {
    title: 'Starwind Pro \u2014 خلاصة RSS',
    description: 'أحدث المحتويات المنشورة على Starwind Pro',
  },
} satisfies CommonTranslations;
