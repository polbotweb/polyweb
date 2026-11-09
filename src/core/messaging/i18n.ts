export type MessagingTranslations = {
  title: string; inbox: string; empty: string; send: string; bodyLabel: string; deleteForMe: string;
  report: string; preferenceLabel: string; whoEveryone: string; whoSharedOrg: string; whoNobody: string;
  saved: string; error: string; newConversation: string; peerLabel: string;
};
const fr: MessagingTranslations = { title:"Messages", inbox:"Boîte de réception", empty:"Aucune conversation.", send:"Envoyer", bodyLabel:"Message", deleteForMe:"Supprimer pour moi", report:"Signaler", preferenceLabel:"Qui peut m'écrire", whoEveryone:"Tout le monde", whoSharedOrg:"Membres d'organisations partagées", whoNobody:"Personne", saved:"Préférence enregistrée.", error:"Action impossible.", newConversation:"Nouvelle conversation", peerLabel:"Destinataire (identifiant)" };
const en: MessagingTranslations = { title:"Messages", inbox:"Inbox", empty:"No conversations.", send:"Send", bodyLabel:"Message", deleteForMe:"Delete for me", report:"Report", preferenceLabel:"Who can message me", whoEveryone:"Everyone", whoSharedOrg:"Members of shared organizations", whoNobody:"Nobody", saved:"Preference saved.", error:"Action failed.", newConversation:"New conversation", peerLabel:"Recipient (user id)" };
const es: MessagingTranslations = { title:"Mensajes", inbox:"Bandeja", empty:"Sin conversaciones.", send:"Enviar", bodyLabel:"Mensaje", deleteForMe:"Eliminar para mí", report:"Denunciar", preferenceLabel:"Quién puede escribirme", whoEveryone:"Todo el mundo", whoSharedOrg:"Miembros de organizaciones compartidas", whoNobody:"Nadie", saved:"Preferencia guardada.", error:"Acción imposible.", newConversation:"Nueva conversación", peerLabel:"Destinatario (id)" };
const ar: MessagingTranslations = { title:"الرسائل", inbox:"الوارد", empty:"لا محادثات.", send:"إرسال", bodyLabel:"الرسالة", deleteForMe:"حذف لي", report:"إبلاغ", preferenceLabel:"من يمكنه مراسلتي", whoEveryone:"الجميع", whoSharedOrg:"أعضاء المنظمات المشتركة", whoNobody:"لا أحد", saved:"تم حفظ التفضيل.", error:"تعذّر الإجراء.", newConversation:"محادثة جديدة", peerLabel:"المستلم (المعرّف)" };
export function getMessagingTranslations(locale: string): MessagingTranslations {
  if (locale.startsWith("en")) return en; if (locale.startsWith("es")) return es; if (locale.startsWith("ar")) return ar; return fr;
}
