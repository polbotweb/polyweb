/**
 * core/xml — lecteur XML minimal, sûr et sans dépendance (relevés CAMT, OFX 2, factures).
 *
 * - Refuse toute DTD (`<!DOCTYPE`) et toute déclaration d'entité (`<!ENTITY`) : pas de XXE ni
 *   d'expansion exponentielle (« billion laughs »).
 * - Entités : seulement les 5 prédéfinies et les références numériques ; une entité inconnue échoue.
 * - Bornes configurables : taille, profondeur, nombre de nœuds (défauts prudents) ; temps linéaire
 *   (parcours par `indexOf`, aucune expression régulière à retour arrière sur l'entrée).
 * - Espaces de noms : le préfixe est conservé dans `name`, `local` porte le nom sans préfixe
 *   (les formats bancaires varient de préfixe d'une banque à l'autre).
 */
import { Data, Effect } from "effect";

export class XmlParseError extends Data.TaggedError("XmlParseError")<{
  readonly reason: "empty" | "doctype" | "entity" | "syntax" | "limit";
  readonly detail: string;
}> {
  override get message() {
    return `XML illisible (${this.reason}) : ${this.detail}`;
  }
}

export interface XmlElement {
  readonly name: string;
  readonly local: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
  /** Texte direct concaténé (hors sous-éléments), entités décodées, non rogné. */
  readonly text: string;
}

export interface XmlLimits {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

export const DEFAULT_XML_LIMITS = { maxBytes: 50 * 1024 * 1024, maxDepth: 64, maxNodes: 2_000_000 } as const;

const PREDEFINED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** Décode les entités prédéfinies et numériques ; `null` si une entité inconnue est rencontrée. */
export const decodeXmlEntities = (raw: string): string | null => {
  if (!raw.includes("&")) return raw;
  let out = "";
  let index = 0;
  while (index < raw.length) {
    const amp = raw.indexOf("&", index);
    if (amp < 0) { out += raw.slice(index); break; }
    out += raw.slice(index, amp);
    const semi = raw.indexOf(";", amp);
    if (semi < 0 || semi - amp > 12) return null;
    const name = raw.slice(amp + 1, semi);
    if (name.startsWith("#x") || name.startsWith("#X")) {
      const code = Number.parseInt(name.slice(2), 16);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return null;
      out += String.fromCodePoint(code);
    } else if (name.startsWith("#")) {
      const code = Number.parseInt(name.slice(1), 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return null;
      out += String.fromCodePoint(code);
    } else if (Object.hasOwn(PREDEFINED, name)) {
      out += PREDEFINED[name];
    } else {
      return null;
    }
    index = semi + 1;
  }
  return out;
};

/** Contrôle préalable commun : vide, DTD, déclaration d'entité. */
export const assertSafeXml = (raw: string): Effect.Effect<string, XmlParseError> => {
  const text = raw.replace(/^\uFEFF/, "");
  if (!text.trim()) return Effect.fail(new XmlParseError({ reason: "empty", detail: "document vide" }));
  const upper = text.slice(0, Math.min(text.length, 1_000_000)).toUpperCase();
  if (upper.includes("<!DOCTYPE") || upper.includes("<!ENTITY")) return Effect.fail(new XmlParseError({ reason: "doctype", detail: "DTD ou entité interdite" }));
  return Effect.succeed(text);
};

const localOf = (name: string) => {
  const colon = name.indexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
};

const isNameChar = (code: number) =>
  (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || code === 45 || code === 46 || code === 58 || code > 127;

interface Building { name: string; local: string; attrs: Record<string, string>; children: XmlElement[]; text: string }

/** Analyse un document XML en arbre ; échoue proprement (jamais d'exception) sur toute anomalie. */
export const parseXml = (input: string, limits: XmlLimits = {}): Effect.Effect<XmlElement, XmlParseError> =>
  Effect.flatMap(assertSafeXml(input), (xml) => Effect.suspend(() => {
    const maxBytes = limits.maxBytes ?? DEFAULT_XML_LIMITS.maxBytes;
    const maxDepth = limits.maxDepth ?? DEFAULT_XML_LIMITS.maxDepth;
    const maxNodes = limits.maxNodes ?? DEFAULT_XML_LIMITS.maxNodes;
    if (xml.length > maxBytes) return Effect.fail(new XmlParseError({ reason: "limit", detail: `taille > ${maxBytes}` }));
    const fail = (reason: XmlParseError["reason"], detail: string) => Effect.fail(new XmlParseError({ reason, detail }));
    const stack: Building[] = [];
    let root: XmlElement | null = null;
    let nodes = 0;
    let i = 0;
    const n = xml.length;
    while (i < n) {
      const lt = xml.indexOf("<", i);
      const textEnd = lt < 0 ? n : lt;
      if (textEnd > i) {
        const chunk = xml.slice(i, textEnd);
        if (stack.length > 0) {
          const decoded = decodeXmlEntities(chunk);
          if (decoded === null) return fail("entity", "entité inconnue");
          stack[stack.length - 1]!.text += decoded;
        } else if (chunk.trim()) {
          return fail("syntax", "texte hors de l'élément racine");
        }
      }
      if (lt < 0) break;
      if (xml.startsWith("<!--", lt)) {
        const end = xml.indexOf("-->", lt + 4);
        if (end < 0) return fail("syntax", "commentaire non fermé");
        i = end + 3;
        continue;
      }
      if (xml.startsWith("<![CDATA[", lt)) {
        const end = xml.indexOf("]]>", lt + 9);
        if (end < 0 || stack.length === 0) return fail("syntax", "CDATA invalide");
        stack[stack.length - 1]!.text += xml.slice(lt + 9, end);
        i = end + 3;
        continue;
      }
      if (xml.startsWith("<?", lt)) {
        const end = xml.indexOf("?>", lt + 2);
        if (end < 0) return fail("syntax", "instruction non fermée");
        i = end + 2;
        continue;
      }
      if (xml.startsWith("<!", lt)) return fail("doctype", "déclaration interdite");
      const gt = xml.indexOf(">", lt + 1);
      if (gt < 0) return fail("syntax", "balise non fermée");
      if (xml[lt + 1] === "/") {
        const name = xml.slice(lt + 2, gt).trim();
        const open = stack.pop();
        if (!open || open.name !== name) return fail("syntax", `fermeture inattendue </${name}>`);
        const element: XmlElement = open;
        if (stack.length === 0) {
          if (root) return fail("syntax", "plusieurs racines");
          root = element;
        } else {
          stack[stack.length - 1]!.children.push(element);
        }
        i = gt + 1;
        continue;
      }
      // Balise ouvrante : nom puis attributs (valeurs entre guillemets, `>` interdit hors guillemets).
      let j = lt + 1;
      while (j < n && isNameChar(xml.charCodeAt(j))) j++;
      const name = xml.slice(lt + 1, j);
      if (!name) return fail("syntax", "nom d'élément vide");
      const attrs: Record<string, string> = {};
      let selfClosing = false;
      let k = j;
      for (;;) {
        while (k < n && /\s/.test(xml[k]!)) k++;
        if (k >= n) return fail("syntax", "balise non fermée");
        if (xml[k] === ">") { k++; break; }
        if (xml[k] === "/" && xml[k + 1] === ">") { selfClosing = true; k += 2; break; }
        const start = k;
        while (k < n && isNameChar(xml.charCodeAt(k))) k++;
        const attr = xml.slice(start, k);
        if (!attr) return fail("syntax", `attribut invalide dans <${name}>`);
        while (k < n && /\s/.test(xml[k]!)) k++;
        if (xml[k] !== "=") return fail("syntax", `attribut sans valeur dans <${name}>`);
        k++;
        while (k < n && /\s/.test(xml[k]!)) k++;
        const quote = xml[k];
        if (quote !== '"' && quote !== "'") return fail("syntax", `valeur d'attribut non citée dans <${name}>`);
        const close = xml.indexOf(quote, k + 1);
        if (close < 0) return fail("syntax", "valeur d'attribut non fermée");
        const value = decodeXmlEntities(xml.slice(k + 1, close));
        if (value === null) return fail("entity", "entité inconnue");
        attrs[attr] = value;
        k = close + 1;
      }
      nodes += 1;
      if (nodes > maxNodes) return fail("limit", `plus de ${maxNodes} éléments`);
      const element: Building = { name, local: localOf(name), attrs, children: [], text: "" };
      if (selfClosing) {
        if (stack.length === 0) {
          if (root) return fail("syntax", "plusieurs racines");
          root = element;
        } else stack[stack.length - 1]!.children.push(element);
      } else {
        if (stack.length >= maxDepth) return fail("limit", `profondeur > ${maxDepth}`);
        if (stack.length === 0 && root) return fail("syntax", "plusieurs racines");
        stack.push(element);
      }
      i = k;
    }
    if (stack.length > 0) return fail("syntax", `élément <${stack[stack.length - 1]!.name}> non fermé`);
    if (!root) return fail("empty", "aucun élément");
    return Effect.succeed(root);
  }));

// ── Navigation ──────────────────────────────────────────────────────────────

/** Premier enfant direct de nom local `local`. */
export const child = (element: XmlElement | null | undefined, local: string): XmlElement | null =>
  element?.children.find((c) => c.local === local) ?? null;

/** Enfants directs de nom local `local`. */
export const childrenOf = (element: XmlElement | null | undefined, local: string): readonly XmlElement[] =>
  element ? element.children.filter((c) => c.local === local) : [];

/** Descend un chemin de noms locaux (premier enfant à chaque étape). */
export const path = (element: XmlElement | null | undefined, ...locals: readonly string[]): XmlElement | null => {
  let current: XmlElement | null | undefined = element;
  for (const local of locals) {
    current = child(current, local);
    if (!current) return null;
  }
  return current ?? null;
};

/** Texte rogné d'un élément (ou ""). */
export const textOf = (element: XmlElement | null | undefined): string => (element ? element.text.trim() : "");

/** Texte rogné au bout d'un chemin (ou ""). */
export const pathText = (element: XmlElement | null | undefined, ...locals: readonly string[]): string => textOf(path(element, ...locals));

/** Tous les descendants (profondeur d'abord) de nom local `local`. */
export const descendants = (element: XmlElement | null | undefined, local: string): XmlElement[] => {
  const out: XmlElement[] = [];
  if (!element) return out;
  const stack: XmlElement[] = [...element.children].reverse();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.local === local) out.push(current);
    for (let index = current.children.length - 1; index >= 0; index--) stack.push(current.children[index]!);
  }
  return out;
};

/** Texte de tous les descendants concaténé (lecture de zones libres). */
export const deepText = (element: XmlElement | null | undefined): string => {
  if (!element) return "";
  const parts: string[] = [];
  const walk = (current: XmlElement) => {
    if (current.text.trim()) parts.push(current.text.trim());
    for (const c of current.children) walk(c);
  };
  walk(element);
  return parts.join(" ");
};
