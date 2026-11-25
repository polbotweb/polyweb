/**
 * Scoring et propositions (pur) : une pièce seule, puis combinaisons de pièces d'un même tiers
 * (paiement groupé) dont la somme égale le mouvement à la tolérance près. Recherche bornée en
 * nombre de pièces et en temps ; ordre déterministe (score, écart, identifiants).
 */
import { daysBetween, nameSimilarity, normalizeIban, normalizeReference, referenceFound } from "./normalize";
import { extractRfReferences } from "./rf";
import type { MatchReason, MatchSettings, Proposal, ReconCandidate, ReconLine } from "./types";

/** Tolérance applicable à un montant attendu : max(absolue, % du montant). */
export const toleranceFor = (expectedMinor: number, settings: Pick<MatchSettings, "toleranceAbsoluteMinor" | "tolerancePercent">) =>
  Math.max(settings.toleranceAbsoluteMinor, Math.floor((Math.abs(expectedMinor) * settings.tolerancePercent) / 100));

/** Texte normalisé du mouvement (libellé + références) où chercher les références des pièces. */
export const lineHaystack = (line: ReconLine) => normalizeReference([line.label, ...line.references].join(" "));

const directionOf = (line: ReconLine) => (line.amountMinor >= 0 ? "in" : "out");

interface Components {
  readonly reference: number;
  readonly amount: number;
  readonly iban: number;
  readonly name: number;
  readonly date: number;
  readonly reasons: MatchReason[];
  readonly deltaMinor: number;
  readonly exactAmount: boolean;
}

const components = (line: ReconLine, candidates: readonly ReconCandidate[], settings: MatchSettings, haystack: string): Components => {
  const reasons: MatchReason[] = [];
  const expectedMinor = candidates.reduce((sum, c) => sum + c.openMinor, 0);
  const deltaMinor = Math.abs(line.amountMinor) - expectedMinor;
  const tolerance = toleranceFor(expectedMinor, settings);
  const rf = new Set(extractRfReferences([line.label, ...line.references].join(" ")));
  const referenced = candidates.filter((c) => c.references.some((ref) => referenceFound(ref, haystack) || rf.has(normalizeReference(ref))));
  const reference = candidates.length === 0 ? 0 : referenced.length / candidates.length;
  if (reference > 0) reasons.push("reference");
  let amount = 0;
  if (deltaMinor === 0) { amount = 1; reasons.push("amount_exact"); }
  else if (Math.abs(deltaMinor) <= tolerance) { amount = 0.7 * (1 - Math.abs(deltaMinor) / (tolerance + 1)); reasons.push("amount_tolerance"); }
  const iban = normalizeIban(line.counterpartyIban);
  const ibanScore = iban && candidates.every((c) => c.counterpartyIbans.map(normalizeIban).includes(iban)) ? 1 : 0;
  if (ibanScore) reasons.push("iban");
  const names = candidates.map((c) => Math.max(nameSimilarity(line.counterpartyName, c.counterpartyName), nameSimilarity(line.label, c.counterpartyName)));
  const name = names.length ? Math.min(...names) : 0;
  if (name >= 0.5) reasons.push("name");
  const gaps = candidates.map((c) => daysBetween(line.valueDate ?? line.bookingDate, c.date));
  const window = Math.max(settings.dateWindowDays, 0);
  const dateScores = gaps.map((gap) => (gap === null ? 0.5 : gap <= window ? 1 - gap / (window + 1) * 0.5 : 0));
  const date = dateScores.length ? Math.min(...dateScores) : 0;
  if (date >= 0.5 && gaps.some((gap) => gap !== null)) reasons.push("date");
  return { reference, amount, iban: ibanScore, name, date, reasons, deltaMinor, exactAmount: deltaMinor === 0 };
};

const totalWeight = (settings: MatchSettings) =>
  Math.max(1, settings.weights.reference + settings.weights.amount + settings.weights.iban + settings.weights.name + settings.weights.date);

const toProposal = (line: ReconLine, candidates: readonly ReconCandidate[], settings: MatchSettings, haystack: string): Proposal => {
  const c = components(line, candidates, settings, haystack);
  const w = settings.weights;
  const raw = (c.reference * w.reference + c.amount * w.amount + c.iban * w.iban + c.name * w.name + c.date * w.date) / totalWeight(settings);
  const reasons = candidates.length > 1 ? [...c.reasons, "combination" as const] : c.reasons;
  return {
    candidates,
    score: Math.round(raw * 100),
    reasons,
    expectedMinor: candidates.reduce((sum, x) => sum + x.openMinor, 0),
    deltaMinor: c.deltaMinor,
    exact: c.exactAmount && c.reference === 1,
  };
};

const compareProposals = (a: Proposal, b: Proposal) =>
  b.score - a.score || Math.abs(a.deltaMinor) - Math.abs(b.deltaMinor) || a.candidates.length - b.candidates.length
  || a.candidates.map((c) => `${c.source}:${c.id}`).join(",").localeCompare(b.candidates.map((c) => `${c.source}:${c.id}`).join(","));

/**
 * Combinaisons de 2 à `maxCombination` pièces dont la somme est dans la tolérance du mouvement.
 * Parcours en profondeur trié par montant décroissant, élagage par somme, arrêt au budget de temps.
 */
export const findCombinations = (target: number, candidates: readonly ReconCandidate[], settings: MatchSettings, now: () => number = Date.now): ReconCandidate[][] => {
  const sorted = [...candidates].filter((c) => c.openMinor > 0).sort((a, b) => b.openMinor - a.openMinor || a.id.localeCompare(b.id)).slice(0, 40);
  const tolerance = toleranceFor(target, settings);
  const deadline = now() + Math.max(settings.combinationTimeMs, 1);
  const results: ReconCandidate[][] = [];
  const suffix = sorted.map((_, index) => sorted.slice(index).reduce((sum, c) => sum + c.openMinor, 0));
  const pick: ReconCandidate[] = [];
  let steps = 0;
  const walk = (start: number, sum: number): boolean => {
    if (++steps % 256 === 0 && now() > deadline) return false;
    if (pick.length >= 2 && Math.abs(target - sum) <= tolerance) {
      results.push([...pick]);
      if (results.length >= 50) return false;
    }
    if (pick.length >= settings.maxCombination) return true;
    for (let index = start; index < sorted.length; index++) {
      const next = sorted[index]!;
      if (sum + next.openMinor > target + tolerance) continue;
      if (sum + suffix[index]! < target - tolerance) break;
      pick.push(next);
      const keepGoing = walk(index + 1, sum + next.openMinor);
      pick.pop();
      if (!keepGoing) return false;
    }
    return true;
  };
  walk(0, 0);
  return results;
};

/**
 * Propositions pour un mouvement : pièces seules de même sens, puis combinaisons par tiers
 * (`groupKey`) et parmi les pièces citées par référence. Triées, au plus `maxProposals`.
 */
export const proposeMatches = (line: ReconLine, candidates: readonly ReconCandidate[], settings: MatchSettings, now: () => number = Date.now): Proposal[] => {
  const direction = directionOf(line);
  const eligible = candidates.filter((c) => c.direction === direction && c.openMinor > 0 && c.currency.toUpperCase() === line.currency.toUpperCase());
  const haystack = lineHaystack(line);
  const proposals: Proposal[] = eligible.map((c) => toProposal(line, [c], settings, haystack)).filter((p) => p.score > 0);
  const target = Math.abs(line.amountMinor);
  const groups = Map.groupBy(eligible.filter((c) => c.groupKey), (c) => c.groupKey!);
  const referenced = eligible.filter((c) => c.references.some((ref) => referenceFound(ref, haystack)));
  const pools: ReconCandidate[][] = [...groups.values()].filter((pool) => pool.length >= 2);
  if (referenced.length >= 2) pools.push(referenced);
  const seen = new Set<string>();
  for (const pool of pools) {
    for (const combo of findCombinations(target, pool, settings, now)) {
      const key = combo.map((c) => `${c.source}:${c.id}`).sort().join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      proposals.push(toProposal(line, combo, settings, haystack));
    }
  }
  return proposals.sort(compareProposals).slice(0, Math.max(1, settings.maxProposals));
};
