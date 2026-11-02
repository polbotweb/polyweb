/** Notifications du module sales : relances de factures échues (N6-A), e-mail client + in-app auteur. */
import { defineModuleNotifications } from "@/core/notifications/registry";
import { invoiceReminderEmail } from "./invoice-reminder-email";
import { INVOICE_REMINDER_SENT, invoiceReminderSource } from "./invoice-reminders";

export const salesNotifications = defineModuleNotifications(
  "sales",
  [{ type: INVOICE_REMINDER_SENT, category: "billing", channels: ["in_app"] }],
  [invoiceReminderEmail],
  [invoiceReminderSource],
);
