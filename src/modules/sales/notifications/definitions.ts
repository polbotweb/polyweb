/**
 * Notifications du module sales : relances de factures échues (N6-A).
 * - E-mail client : transactionnel (D3), hors préférences et sans désinscription.
 * - Alerte in-app de l'auteur : optionnelle (catégorie `billing`, désactivable).
 */
import { defineModuleNotifications } from "@/core/notifications/registry";
import { invoiceReminderEmail } from "./invoice-reminder-email";
import { INVOICE_REMINDER_DUE, INVOICE_REMINDER_SENT, invoiceReminderSource } from "./invoice-reminders";
import { INVOICE_REMINDER_TEMPLATE } from "./invoice-reminder-email";

export const salesNotifications = defineModuleNotifications(
  "sales",
  [
    { type: INVOICE_REMINDER_SENT, category: "billing", channels: ["in_app"] },
    { type: INVOICE_REMINDER_DUE, category: "billing", channels: ["email"], emailTemplate: INVOICE_REMINDER_TEMPLATE, transactional: true },
  ],
  [invoiceReminderEmail],
  [invoiceReminderSource],
);
