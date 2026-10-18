export function getRegconfig(locale: string): string {
  switch (locale) {
    case "fr": return "french";
    case "en": return "english";
    case "es": return "spanish";
    default: return "simple";
  }
}

export function buildTsQuery(raw: string): string | null {
  const tokens = raw
    .split(/\s+/)
    .map((word) => word.replace(/[&|!():'\\<>]/g, "").trim())
    .filter((word) => word.length > 0);
  if (!tokens.length) return null;
  return tokens.map((word, index) => index === tokens.length - 1 ? `${word}:*` : word).join(" & ");
}
