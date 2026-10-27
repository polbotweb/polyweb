/** Back-office : demande de remboursement (formulaire `RefundPanel`, POST → 303 vers la page d'origine). */
import type { APIRoute } from "astro";
import { handleRefundPost } from "@/core/refunds/admin";

export const prerender = false;
export const POST: APIRoute = (context) => handleRefundPost(context);
