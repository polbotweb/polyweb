import { defineModuleNotifications } from "@/core/notifications/registry";
import { PURCHASE_ORDER_SEND_TEMPLATE, purchaseOrderSendEmail } from "./po-send-email";

export const purchasingNotifications = defineModuleNotifications(
  "purchasing",
  [{ type: "PURCHASE_ORDER_SENT", category: "purchasing", channels: ["email"], emailTemplate: PURCHASE_ORDER_SEND_TEMPLATE, transactional: true }],
  [purchaseOrderSendEmail],
);
