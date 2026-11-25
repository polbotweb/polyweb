/**
 * Back-office banking : comportements navigateur déclaratifs.
 *
 * - `form[data-banking-form="<action>"]` : les champs nommés (chemins pointés `a.b.c`) sont lus
 *   selon `data-type` (`int`, `number`, `money`, `bool`, `nullable`, `list`, `json`), les blocs
 *   `[data-array="chemin"]` deviennent des tableaux d'objets (une entrée par `[data-row]`), puis
 *   l'action `actions.banking.<action>` est appelée. Après succès : téléchargement
 *   (`data-result="download"`), message (`data-result="message"` + `data-message`), redirection
 *   (`data-redirect`, `{id}` remplacé) ou rechargement.
 * - `button[data-banking-action="<action>"]` : charge utile `data-payload` (JSON), confirmation
 *   `data-confirm`, saisie obligatoire `data-prompt` + `data-prompt-field`.
 * - Import de relevé (fichier → base64), banques GoCardless, écran de rapprochement.
 * Les composants n'importent jamais `astro:actions` directement : seulement `./init`.
 */
import { actions } from "astro:actions";
import { toast } from "@atoms/toast";
import { formatMinor, parseMinor } from "../ui/format";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type ActionResult = { error?: { message: string }; data?: unknown } | null | undefined;
type Payload = Record<string, unknown>;
type ActionFn = (input: Payload) => Promise<ActionResult>;

const action = (name: string): ActionFn | null => {
  const fn = (actions.banking as unknown as Record<string, ActionFn | undefined>)[name];
  return typeof fn === "function" ? fn : null;
};

const fill = (template: string, values: Record<string, unknown>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));

const setPath = (target: Payload, path: string, value: unknown) => {
  const keys = path.split(".");
  let node = target;
  keys.slice(0, -1).forEach((key) => { node = (node[key] ??= {}) as Payload; });
  node[keys.at(-1) ?? path] = value;
};

const fieldValue = (field: Field, currency: string): { skip: boolean; value: unknown } => {
  const type = field.dataset.type ?? "string";
  const raw = field.value.trim();
  if (field instanceof HTMLInputElement && field.type === "checkbox" && type === "bool") return { skip: false, value: field.checked };
  switch (type) {
    case "int": return { skip: false, value: raw === "" ? null : Number.parseInt(raw, 10) };
    case "number": return { skip: false, value: raw === "" ? null : Number(raw.replace(",", ".")) };
    case "money": return { skip: false, value: raw === "" ? null : parseMinor(raw, field.dataset.currency ?? currency) };
    case "nullable": return { skip: false, value: raw === "" ? null : raw };
    case "json": return { skip: false, value: raw === "" ? null : JSON.parse(raw) };
    default: return { skip: false, value: raw };
  }
};

/** Lit un conteneur : champs simples, listes de cases (`data-type="list"`) et tableaux `[data-array]`. */
export function serialize(root: HTMLElement, currency = "EUR"): Payload {
  const out: Payload = {};
  const isRow = root.matches("[data-row]");
  const lists = new Map<string, string[]>();
  root.querySelectorAll<Field>("input[name], select[name], textarea[name]").forEach((field) => {
    if (field.disabled || field.closest("template")) return;
    if (isRow ? field.closest("[data-row]") !== root : field.closest("[data-array]") !== null && root.contains(field.closest("[data-array]"))) return;
    if (field.dataset.type === "list") {
      const values = lists.get(field.name) ?? [];
      if ((field as HTMLInputElement).checked) values.push(field.value);
      lists.set(field.name, values);
      return;
    }
    if (field instanceof HTMLInputElement && field.type === "checkbox" && field.dataset.type !== "bool") return;
    if (field instanceof HTMLInputElement && field.type === "file") return;
    const { skip, value } = fieldValue(field, currency);
    if (!skip) setPath(out, field.name, value);
  });
  lists.forEach((values, name) => setPath(out, name, values));
  if (!isRow) {
    root.querySelectorAll<HTMLElement>("[data-array]").forEach((array) => {
      if (array.parentElement?.closest("[data-array]")) return;
      const rows = [...array.querySelectorAll<HTMLElement>("[data-row]")].filter((row) => row.closest("[data-array]") === array && !row.closest("template"));
      setPath(out, array.dataset.array ?? "", rows.map((row) => serialize(row, currency)));
    });
  }
  return out;
}

const organizationOf = (element: HTMLElement): string | null => {
  const holder = element.closest<HTMLElement>("[data-organization-id]");
  const value = holder?.dataset.organizationId ?? "";
  return value === "" ? null : value;
};

/** Ajustements propres à certaines actions (champs optionnels repliés en `null`). */
const transforms: Record<string, (payload: Payload) => Payload> = {
  saveRule: (payload) => ({ ...payload, rule: normalizeRule(payload.rule as Payload) }),
  dryRunRule: (payload) => ({ ...payload, rule: normalizeRule(payload.rule as Payload) }),
  exportLedger: ({ account, ...payload }) => ({ ...payload, bankAccountId: account ?? null }),
  saveCsvProfile: (payload) => {
    const profile = (payload.profile ?? {}) as Payload;
    const columns = Object.fromEntries(Object.entries((profile.columns ?? {}) as Record<string, string>).filter(([, value]) => typeof value === "string" && value.trim() !== ""));
    return { ...payload, profile: { ...profile, columns } };
  },
};

function normalizeRule(rule: Payload): Payload {
  const conditions = { ...((rule.conditions ?? {}) as Payload) };
  const label = conditions.label as Payload | undefined;
  conditions.label = label && typeof label.value === "string" && label.value.trim() !== "" ? label : null;
  return { ...rule, conditions };
}

const showError = (form: HTMLElement, message: string) => {
  const box = form.querySelector<HTMLElement>("[data-form-error]");
  if (box) { box.textContent = message; box.hidden = false; box.focus(); } else toast.error(message);
};

const download = (content: string, name: string, type = "text/csv;charset=utf-8") => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const afterSuccess = (element: HTMLElement, data: unknown) => {
  const record = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const { result, message, done, redirect, downloadName } = element.dataset;
  if (result === "download") {
    download(String(record.csv ?? ""), downloadName ?? "export.csv");
    toast.success(done ?? "");
    return;
  }
  if (result === "message" && message) {
    toast.success(fill(message, record));
    const output = (element.closest("form") ?? element).querySelector<HTMLElement>("[data-result-output]");
    if (output) { output.textContent = fill(message, record); output.hidden = false; return; }
  } else if (done) toast.success(done);
  if (result === "stay") return;
  if (typeof record.link === "string" && /^https:\/\//.test(record.link)) { window.location.assign(record.link); return; }
  if (redirect) { window.location.assign(fill(redirect, { id: String(record.id ?? "") })); return; }
  window.location.reload();
};

const readFileBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

async function submitForm(form: HTMLFormElement, submitter: HTMLElement | null) {
  const name = form.dataset.bankingForm ?? "";
  const fn = action(name);
  if (!fn) return;
  let payload: Payload = { organizationId: organizationOf(form), ...serialize(form, form.dataset.currency) };
  const file = form.querySelector<HTMLInputElement>("input[type=file][name]");
  if (file) {
    const selected = file.files?.[0];
    if (!selected) { file.setAttribute("aria-invalid", "true"); file.focus(); return; }
    const max = Number(form.dataset.maxBytes ?? "0");
    if (max > 0 && selected.size > max) { showError(form, form.dataset.tooLarge ?? ""); return; }
    payload = { ...payload, fileName: selected.name, contentBase64: await readFileBase64(selected) };
  }
  payload = transforms[name]?.(payload) ?? payload;
  const result = await fn(payload);
  if (result?.error) { showError(form, result.error.message); return; }
  afterSuccess(submitter?.dataset.result ? submitter : form, result?.data);
}

function initForms() {
  document.querySelectorAll<HTMLFormElement>("form[data-banking-form]").forEach((form) => {
    if (form.dataset.bound === "1") return;
    form.dataset.bound = "1";
    form.addEventListener("submit", async (event) => {
      if (((event as SubmitEvent).submitter as HTMLElement | null)?.hasAttribute("data-native-submit")) return;
      event.preventDefault();
      const errorBox = form.querySelector<HTMLElement>("[data-form-error]");
      if (errorBox) errorBox.hidden = true;
      form.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
      const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
      const original = form.dataset.bankingForm;
      if (submitter?.dataset.formAction) form.dataset.bankingForm = submitter.dataset.formAction;
      const buttons = [...form.querySelectorAll<HTMLButtonElement>("button")];
      buttons.forEach((button) => { button.disabled = true; });
      try {
        await submitForm(form, submitter);
      } catch (error) {
        showError(form, error instanceof Error ? error.message : String(error));
      } finally {
        buttons.forEach((button) => { button.disabled = false; });
        if (original) form.dataset.bankingForm = original;
      }
    });
  });
}

function initButtons() {
  document.querySelectorAll<HTMLButtonElement>("button[data-banking-action]").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      const fn = action(button.dataset.bankingAction ?? "");
      if (!fn) return;
      if (button.dataset.confirm && !window.confirm(button.dataset.confirm)) return;
      const payload: Payload = { organizationId: organizationOf(button), ...(JSON.parse(button.dataset.payload ?? "{}") as Payload) };
      if (button.dataset.prompt) {
        const answer = window.prompt(button.dataset.prompt)?.trim();
        if (!answer) return;
        payload[button.dataset.promptField ?? "reason"] = answer;
      }
      button.disabled = true;
      try {
        const result = await fn(payload);
        if (result?.error) { toast.error(result.error.message); return; }
        afterSuccess(button, result?.data);
      } finally {
        button.disabled = false;
      }
    });
  });
}

/** Lignes répétables : `[data-add-row]` clone le `<template>` du bloc, `[data-remove-row]` retire la ligne. */
function initRows() {
  document.querySelectorAll<HTMLElement>("[data-array]").forEach((array) => {
    if (array.dataset.bound === "1") return;
    array.dataset.bound = "1";
    array.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-remove-row]")) { target.closest("[data-row]")?.remove(); return; }
      if (target.closest("[data-add-row]")) {
        const template = array.querySelector<HTMLTemplateElement>("template");
        const list = array.querySelector<HTMLElement>("[data-rows]") ?? array;
        if (template) list.append(template.content.cloneNode(true));
      }
    });
  });
}

/** Banques GoCardless : remplit la liste du formulaire de consentement. */
function initInstitutions() {
  document.querySelectorAll<HTMLButtonElement>("button[data-feed-institutions]").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      const form = button.closest<HTMLFormElement>("form");
      const select = form?.querySelector<HTMLSelectElement>("select[name=institutionId]");
      const country = form?.querySelector<HTMLInputElement>("input[name=country]")?.value.trim().toUpperCase() ?? "";
      const fn = action("feedInstitutions");
      if (!form || !select || !fn) return;
      button.disabled = true;
      const result = await fn({ organizationId: organizationOf(form), connectionId: button.dataset.feedInstitutions, country });
      button.disabled = false;
      if (result?.error) { showError(form, result.error.message); return; }
      const banks = Array.isArray(result?.data) ? result.data as { id: string; name: string }[] : [];
      select.replaceChildren(...banks.map((bank) => new Option(bank.name, bank.id)));
      select.disabled = banks.length === 0;
      select.focus();
    });
  });
}

/* ───────────── Écran de rapprochement ───────────── */

interface Candidate { readonly source: string; readonly id: string; readonly label: string; readonly openMinor: number; readonly currency: string; readonly date: string | null }
interface Proposal { readonly candidates: readonly Candidate[]; readonly score: number; readonly reasons: readonly string[] }

function initReconcile() {
  const root = document.querySelector<HTMLElement>("[data-reconcile]");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";
  const amount = Number(root.dataset.amount ?? "0");
  const currency = root.dataset.currency ?? "EUR";
  const locale = root.dataset.locale ?? "fr";
  const labels = JSON.parse(root.dataset.labels ?? "{}") as Record<string, string>;
  const sourceLabels = JSON.parse(root.dataset.sources ?? "{}") as Record<string, string>;
  const reasonLabels = JSON.parse(root.dataset.reasons ?? "{}") as Record<string, string>;
  const sign = amount < 0 ? -1 : 1;
  const exponent = () => Number(root.dataset.exponent ?? "2");
  const allocationList = root.querySelector<HTMLElement>("[data-allocations]")!;
  const adjustmentList = root.querySelector<HTMLElement>("[data-adjustments]")!;
  const remaining = root.querySelector<HTMLElement>("[data-remaining]")!;
  const proposals = root.querySelector<HTMLElement>("[data-proposals]")!;
  const candidates = root.querySelector<HTMLElement>("[data-candidates]")!;
  const submit = root.querySelector<HTMLButtonElement>("[data-reconcile-submit]")!;
  const errorBox = root.querySelector<HTMLElement>("[data-form-error]");

  const allocations = () => [...allocationList.querySelectorAll<HTMLElement>("[data-allocation]")].map((row) => ({
    source: row.dataset.source ?? "", targetId: row.dataset.target ?? "",
    amountMinor: parseMinor(row.querySelector<HTMLInputElement>("input")?.value ?? "", currency) ?? 0,
  }));
  const adjustments = () => [...adjustmentList.querySelectorAll<HTMLElement>("[data-adjustment]")].map((row) => ({
    kind: row.querySelector<HTMLSelectElement>("select")?.value ?? "write_off",
    bankEffectMinor: parseMinor(row.querySelector<HTMLInputElement>("input")?.value ?? "", currency) ?? 0,
  }));
  const gap = () => amount - sign * allocations().reduce((sum, row) => sum + row.amountMinor, 0) - adjustments().reduce((sum, row) => sum + row.bankEffectMinor, 0);

  const refresh = () => {
    const delta = gap();
    remaining.textContent = delta === 0 ? labels.balanceOk ?? "" : fill(labels.balanceGap ?? "{amount}", { amount: formatMinor(delta, currency, locale) });
    remaining.dataset.state = delta === 0 ? "ok" : "gap";
    const partial = adjustments().length === 0 && allocations().length > 0 && Math.sign(delta) === sign && Math.abs(delta) < Math.abs(amount);
    submit.disabled = allocations().length === 0 && adjustments().length === 0 ? true : !(delta === 0 || partial);
  };

  const input = (value: string, label: string) => {
    const element = Object.assign(document.createElement("input"), { type: "text", inputMode: "decimal", value, className: "min-h-11 w-32 rounded-md border px-3 text-end" });
    element.setAttribute("aria-label", label);
    element.addEventListener("input", refresh);
    return element;
  };
  const removeButton = (label: string) => {
    const button = Object.assign(document.createElement("button"), { type: "button", textContent: label, className: "min-h-11 rounded-md border px-3" });
    button.addEventListener("click", () => { button.closest("li")?.remove(); refresh(); });
    return button;
  };

  const addAllocation = (candidate: Candidate) => {
    if (allocationList.querySelector(`[data-allocation][data-target="${CSS.escape(candidate.id)}"][data-source="${CSS.escape(candidate.source)}"]`)) return;
    const already = allocations().reduce((sum, row) => sum + row.amountMinor, 0);
    const value = Math.max(0, Math.min(candidate.openMinor, Math.abs(amount) - already));
    const row = Object.assign(document.createElement("li"), { className: "flex flex-wrap items-center gap-2" });
    row.dataset.allocation = "";
    row.dataset.source = candidate.source;
    row.dataset.target = candidate.id;
    const text = Object.assign(document.createElement("span"), { className: "flex-1", textContent: `${sourceLabels[candidate.source] ?? candidate.source} — ${candidate.label} (${formatMinor(candidate.openMinor, candidate.currency, locale)})` });
    row.append(text, input((value / 10 ** exponent()).toFixed(exponent()), labels.allocate ?? ""), removeButton(labels.remove ?? "×"));
    allocationList.append(row);
    refresh();
  };
  root.querySelector<HTMLButtonElement>("[data-add-adjustment]")?.addEventListener("click", () => {
    const template = root.querySelector<HTMLTemplateElement>("template[data-adjustment-template]");
    if (!template) return;
    adjustmentList.append(template.content.cloneNode(true));
    const row = adjustmentList.lastElementChild as HTMLElement;
    const field = row.querySelector<HTMLInputElement>("input")!;
    field.value = (gap() / 10 ** exponent()).toFixed(exponent());
    field.addEventListener("input", refresh);
    row.querySelector("[data-remove]")?.addEventListener("click", () => { row.remove(); refresh(); });
    refresh();
    field.focus();
  });

  const candidateItem = (candidate: Candidate) => {
    const row = Object.assign(document.createElement("li"), { className: "flex flex-wrap items-center gap-2" });
    const text = Object.assign(document.createElement("span"), { className: "flex-1", textContent: `${sourceLabels[candidate.source] ?? candidate.source} — ${candidate.label} — ${formatMinor(candidate.openMinor, candidate.currency, locale)}${candidate.date ? ` — ${candidate.date}` : ""}` });
    const use = Object.assign(document.createElement("button"), { type: "button", textContent: labels.use ?? "+", className: "min-h-11 rounded-md border px-3" });
    use.addEventListener("click", () => addAllocation(candidate));
    row.append(text, use);
    return row;
  };

  const render = (data: { proposals: Proposal[]; candidates: Candidate[] }, withProposals: boolean) => {
    if (withProposals) {
      proposals.replaceChildren(...(data.proposals.length === 0 ? [Object.assign(document.createElement("li"), { textContent: labels.noProposal ?? "" })] : data.proposals.map((proposal) => {
        const row = Object.assign(document.createElement("li"), { className: "flex flex-wrap items-center gap-2 rounded-md border p-3" });
        const text = Object.assign(document.createElement("span"), { className: "flex-1", textContent: `${proposal.score}/100 — ${proposal.candidates.map((c) => `${sourceLabels[c.source] ?? c.source} ${c.label}`).join(" + ")} — ${proposal.reasons.map((r) => reasonLabels[r] ?? r).join(", ")}` });
        const use = Object.assign(document.createElement("button"), { type: "button", textContent: labels.use ?? "+", className: "min-h-11 rounded-md border px-3" });
        use.addEventListener("click", () => proposal.candidates.forEach(addAllocation));
        row.append(text, use);
        return row;
      })));
    }
    candidates.replaceChildren(...(data.candidates.length === 0 ? [Object.assign(document.createElement("li"), { textContent: labels.empty ?? "" })] : data.candidates.map(candidateItem)));
  };

  const load = async (search?: string) => {
    const fn = action("candidates");
    if (!fn) return;
    const result = await fn({ organizationId: organizationOf(root), transactionId: root.dataset.transactionId, ...(search ? { search } : {}) });
    if (result?.error) { if (errorBox) { errorBox.textContent = result.error.message; errorBox.hidden = false; } return; }
    render(result?.data as { proposals: Proposal[]; candidates: Candidate[] }, !search);
  };

  const searchForm = root.querySelector<HTMLFormElement>("[data-candidate-search]");
  searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = searchForm.querySelector<HTMLInputElement>("input")?.value.trim() ?? "";
    void load(value || undefined);
  });

  submit.addEventListener("click", async () => {
    const fn = action("reconcile");
    if (!fn) return;
    if (errorBox) errorBox.hidden = true;
    submit.disabled = true;
    const note = root.querySelector<HTMLTextAreaElement>("textarea[name=note]")?.value.trim() ?? "";
    const result = await fn({ organizationId: organizationOf(root), transactionIds: [root.dataset.transactionId], allocations: allocations().filter((row) => row.amountMinor > 0), adjustments: adjustments().filter((row) => row.bankEffectMinor !== 0), note: note || null });
    if (result?.error) { if (errorBox) { errorBox.textContent = result.error.message; errorBox.hidden = false; errorBox.focus(); } refresh(); return; }
    const status = (result?.data as { status?: string } | undefined)?.status;
    toast.success(status === "pending_approval" ? labels.pending ?? "" : labels.applied ?? "");
    window.location.reload();
  });

  refresh();
  void load();
}

export function initBankingAdmin(): void {
  if (typeof document === "undefined") return;
  initForms();
  initButtons();
  initRows();
  initInstitutions();
  initReconcile();
}
