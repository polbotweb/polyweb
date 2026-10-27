/**
 * Jetons signés du tunnel de vente (HMAC-SHA256, clé dérivée du secret applicatif) :
 * - cookie panier invité : `<cartId>.<mac>` — l'identifiant seul ne suffit pas à lire ou modifier un panier ;
 * - lien de suivi de commande invité : `<mac>` sur l'identifiant de commande.
 * Comparaison en temps constant ; aucune donnée personnelle dans les jetons.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const CART_COOKIE = "pw_cart";
/** Durée de vie du cookie (et de l'inactivité tolérée d'un panier) : 30 jours. */
export const CART_TTL_SECONDS = 30 * 24 * 3600;

const ID = /^[A-Za-z0-9_-]{8,64}$/;

const mac = (purpose: "cart" | "order", secret: string, id: string) =>
  createHmac("sha256", `polyweb:shop-${purpose}:${secret}`).update(id, "utf8").digest("base64url");

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const signCartToken = (cartId: string, secret: string) => `${cartId}.${mac("cart", secret, cartId)}`;

/** Identifiant de panier si la signature est valide, sinon null (cookie absent, altéré ou forgé). */
export const verifyCartToken = (token: string | undefined | null, secret: string): string | null => {
  if (!token || token.length > 200) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  if (!ID.test(id)) return null;
  return safeEqual(token.slice(dot + 1), mac("cart", secret, id)) ? id : null;
};

export const orderAccessToken = (orderId: string, secret: string) => mac("order", secret, orderId);

export const verifyOrderAccessToken = (orderId: string, token: string | undefined | null, secret: string) =>
  Boolean(token) && token!.length < 100 && ID.test(orderId) && safeEqual(token!, mac("order", secret, orderId));
