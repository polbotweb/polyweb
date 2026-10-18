import type { AboutTranslations } from '../config';
import { stone, bronze, houseCivilization, polish } from '../../assets/images/brand';
import { avatar1, avatar2, avatar3 } from '../../assets/images/avatars';

export default {
  meta: {
    title: 'من نحن – كلان',
    description: 'اكتشف القصة والمهمة والفريق وراء كلان. نبني الحضارة طبقة بعد طبقة.',
  },
  hero: {
    eyebrow: 'قصتنا',
    title: 'بناء حضارة طبقة بعد طبقة',
    description: 'وُلد كلان من قناعة: كل جيل يُبنى على الأسس التي خلّفها من سبقه. مهمتنا هي هيكلة هذا النقل حتى تُحفظ كل طبقة من المعرفة والثقافة والخبرة وتبقى متاحة.',
  },
  mission: {
    eyebrow: 'سبب وجودنا',
    title: 'المهمة والرؤية',
    description: 'ركيزتان توجّهان كل قراراتنا.',
    cards: [
      {
        icon: 'mdi:target',
        title: 'مهمتنا',
        description: 'مرافقة المجتمعات التي تبني على إرث من سبقها. نصنع الأدوات التي تمكّن من النقل بين الأجيال للمعارف والقيم والموارد.',
      },
      {
        icon: 'mdi:eye-outline',
        title: 'رؤيتنا',
        description: 'عالم يستطيع فيه كل مجتمع البناء بشكل مستدام، طبقة بعد طبقة، على أسس صلبة. حيث لا يُفقد الإرث الجماعي بل يُضخّم.',
      },
    ],
  },
  values: {
    eyebrow: 'ما يُعرّفنا',
    title: 'قيمنا',
    description: 'المبادئ المؤسسة التي توجّه كلان كل يوم.',
    items: [
      {
        title: 'الإرث',
        description: 'نؤمن بأن الماضي كنز. كل معرفة وكل تجربة تستحق أن تُحفظ وتُنقل إلى الأجيال القادمة. الإرث ليس عبئًا، بل هو نقطة انطلاق.',
        image: stone,
        value: 'heritage',
      },
      {
        title: 'النقل',
        description: 'المعرفة التي لا تُنقل هي معرفة مفقودة. نبذل كل ما في وسعنا لضمان تدفق الحكمة بحرية بين الأجيال والمجتمعات.',
        image: bronze,
        value: 'transmission',
      },
      {
        title: 'المجتمع',
        description: 'وحدك تسير سريعًا، معًا نصل بعيدًا. يضع كلان المجتمع في صميم كل شيء. في الجماعة تولد المشاريع الأكثر طموحًا واستدامة.',
        image: houseCivilization,
        value: 'community',
      },
      {
        title: 'النزاهة',
        description: 'البناء على أسس صلبة يتطلب الشفافية والأصالة. نلتزم بالتصرف بأمانة تجاه مجتمعنا وشركائنا وأنفسنا.',
        image: polish,
        value: 'integrity',
      },
    ],
  },
  team: {
    eyebrow: 'البنّاؤون',
    title: 'فريقنا',
    description: 'أشخاص شغوفون يعملون كل يوم لإحياء رؤية كلان.',
    members: [
      {
        name: 'يوسف منصوري',
        role: 'المؤسس والرئيس التنفيذي',
        bio: 'صاحب رؤية شغوف بالنقل بين الأجيال وبناء المجتمعات.',
        image: avatar2,
        socials: [
          { name: 'LinkedIn', icon: 'linkedin', href: '#' },
          { name: 'X', icon: 'twitter', href: '#' },
          { name: 'Email', icon: 'mail', href: 'mailto:youssef@klan.com' },
        ],
      },
      {
        name: 'أمينة بلقاسم',
        role: 'مديرة العمليات',
        bio: 'خبيرة في إدارة المجتمعات والتطوير المؤسسي.',
        image: avatar1,
        socials: [
          { name: 'LinkedIn', icon: 'linkedin', href: '#' },
          { name: 'Email', icon: 'mail', href: 'mailto:amina@klan.com' },
        ],
      },
      {
        name: 'كريم وعدة',
        role: 'المدير التقني',
        bio: 'مهندس برمجيات متخصص في منصات المجتمعات واسعة النطاق.',
        image: avatar3,
        socials: [
          { name: 'LinkedIn', icon: 'linkedin', href: '#' },
          { name: 'X', icon: 'twitter', href: '#' },
          { name: 'Email', icon: 'mail', href: 'mailto:karim@klan.com' },
        ],
      },
      {
        name: 'سارة دوبون',
        role: 'مسؤولة المجتمع',
        bio: 'منشّطة مجتمعات ملتزمة تنسج الروابط بين أعضاء كلان.',
        image: avatar1,
        socials: [
          { name: 'LinkedIn', icon: 'linkedin', href: '#' },
          { name: 'X', icon: 'twitter', href: '#' },
          { name: 'Email', icon: 'mail', href: 'mailto:sarah@klan.com' },
        ],
      },
    ],
  },
  cta: {
    title: 'انضم إلى مغامرة كلان',
    description: 'كن فاعلاً في هذا البناء الجماعي. كل حجر يُحسب في الصرح المشترك.',
    primaryButton: { text: 'انضم إلى كلان', href: '#' },
    secondaryButton: { text: 'تواصل معنا', href: '#' },
  },
} satisfies AboutTranslations;
