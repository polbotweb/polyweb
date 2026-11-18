/**
 * Punch-out cXML (à la cXML 1.2) : génération de PunchOutSetupRequest et lecture
 * de PunchOutOrderMessage, sans dépendance. Le secret n'est jamais journalisé.
 */
import { createHash } from "node:crypto";
import { Effect } from "effect";
import { escapeXml } from "@/core/einvoice/cii";
import { InvalidPurchaseOrderError } from "./errors";

export interface PunchOutIdentity {
  readonly domain: string;
  readonly identity: string;
  readonly secret: string;
}

export interface PunchOutSetup {
  readonly buyerCookie: string;
  readonly from: PunchOutIdentity;
  readonly to: PunchOutIdentity;
  readonly sender: PunchOutIdentity;
  readonly hookUrl: string;
  readonly timestamp: Date;
}

export interface PunchOutItem {
  readonly supplierPartId: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly currency: string;
}

const text = (name: string, value: string, attrs: Record<string, string> = {}) => {
  const attributes = Object.entries(attrs).map(([key, val]) => ` ${key}="${escapeXml(val)}"`).join("");
  return `<${name}${attributes}>${escapeXml(value)}</${name}>`;
};

const credential = (tag: string, party: PunchOutIdentity, withSecret = false) =>
  `<${tag}>`
  + `<Credential domain="${escapeXml(party.domain)}">${text("Identity", party.identity)}`
  + (withSecret ? text("SharedSecret", party.secret) : "")
  + `</Credential></${tag}>`;

/** Jeton HMAC-SHA256 (hex) pour authentifier le retour fournisseur (buyerCookie déjà unique). */
export const punchOutMac = (cookie: string, secret: string) =>
  createHash("sha256").update(`cxml:${cookie}:${secret}`).digest("hex");

export const renderPunchOutSetupRequest = (input: PunchOutSetup): Effect.Effect<string, InvalidPurchaseOrderError> => {
  if (!input.buyerCookie.trim() || input.buyerCookie.length > 200) {
    return Effect.fail(new InvalidPurchaseOrderError({ field: "buyerCookie", value: input.buyerCookie }));
  }
  if (!/^https?:\/\//i.test(input.hookUrl)) {
    return Effect.fail(new InvalidPurchaseOrderError({ field: "hookUrl", value: input.hookUrl }));
  }
  const payloadId = `${input.timestamp.getTime()}@polyweb`;
  const timestamp = input.timestamp.toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<cXML payloadID="${escapeXml(payloadId)}" timestamp="${escapeXml(timestamp)}" xml:lang="en">`
    + `<Header>${credential("From", input.from)}${credential("To", input.to)}${credential("Sender", input.sender, true)}${text("UserAgent", "polyweb")}</Header>`
    + `<Request><PunchOutSetupRequest operation="create">`
    + text("BuyerCookie", input.buyerCookie)
    + `<BrowserFormPost>${text("URL", input.hookUrl)}</BrowserFormPost>`
    + `</PunchOutSetupRequest></Request></cXML>\n`;
  return Effect.succeed(xml);
};

const tag = (xml: string, name: string): string[] => {
  const re = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([^<]*)</(?:[\\w-]+:)?${name}>`, "gi");
  return [...xml.matchAll(re)].map((match) => decodeXml(match[1] ?? ""));
};

const attr = (xml: string, name: string, attribute: string): string | null => {
  const re = new RegExp(`<(?:[\\w-]+:)?${name}[^>]*\\s${attribute}="([^"]*)"`, "i");
  const match = re.exec(xml);
  return match ? decodeXml(match[1] ?? "") : null;
};

const decodeXml = (value: string) =>
  value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();

const moneyMinor = (decimal: string, currency: string) => {
  const [int = "0", frac = ""] = decimal.trim().replace(",", ".").split(".");
  const exp = currency === "JPY" ? 0 : currency === "KWD" ? 3 : 2;
  const fracPadded = (frac + "000").slice(0, exp);
  const n = Number(int) * 10 ** exp + Number(fracPadded || "0");
  return Number.isSafeInteger(n) ? n : null;
};

/** Lit un PunchOutOrderMessage (panier renvoyé par le fournisseur). */
export const parsePunchOutOrderMessage = (xml: string): Effect.Effect<{ cookie: string; items: PunchOutItem[] }, InvalidPurchaseOrderError> => {
  if (/<!DOCTYPE|<\!ENTITY/i.test(xml)) return Effect.fail(new InvalidPurchaseOrderError({ field: "cxml", value: "doctype" }));
  const cookie = tag(xml, "BuyerCookie")[0];
  if (!cookie) return Effect.fail(new InvalidPurchaseOrderError({ field: "buyerCookie", value: "" }));
  const blocks = xml.split(/<(?:[\w-]+:)?ItemIn\b/i).slice(1);
  const items: PunchOutItem[] = [];
  for (const block of blocks) {
    const quantity = Number(attr(`<ItemIn ${block}`, "ItemIn", "quantity") ?? tag(block, "Quantity")[0] ?? "0");
    const currency = attr(block, "UnitPrice", "currency") ?? attr(block, "Money", "currency") ?? "EUR";
    const priceText = tag(block, "Money")[0] ?? "0";
    const unitPriceMinor = moneyMinor(priceText, currency);
    const part = tag(block, "SupplierPartID")[0] ?? "";
    const description = tag(block, "Description")[0] ?? part;
    if (!part || !Number.isSafeInteger(quantity) || quantity <= 0 || unitPriceMinor === null || unitPriceMinor < 0) {
      return Effect.fail(new InvalidPurchaseOrderError({ field: "item", value: part || "invalid" }));
    }
    items.push({ supplierPartId: part, description, quantity, unitPriceMinor, currency: currency.toUpperCase() });
  }
  if (items.length === 0) return Effect.fail(new InvalidPurchaseOrderError({ field: "items", value: "0" }));
  return Effect.succeed({ cookie, items });
};
