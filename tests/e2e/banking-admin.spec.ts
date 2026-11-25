/**
 * Back-office banque (admin uniquement) : compte, import OFX (unique à chaque exécution), ligne
 * ignorée puis réintégrée, règle simulée et enregistrée, réglages, grand livre CSV, comptabilité.
 */
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";

const ofx = (tag: string, date: string) => Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><TRNUID>1</TRNUID><STMTRS><CURDEF>EUR</CURDEF>
<BANKACCTFROM><BANKID>30006</BANKID><ACCTID>${tag}</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>
<BANKTRANLIST><DTSTART>${date}000000</DTSTART><DTEND>${date}235959</DTEND>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>${date}120000</DTPOSTED><TRNAMT>-12.34</TRNAMT><FITID>${tag}-1</FITID><NAME>${tag} FRAIS TENUE</NAME></STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>987.66</BALAMT><DTASOF>${date}</DTASOF></LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
`, "utf8");

test("admin banque : compte, import, ligne, règle, réglages, grand livre, comptabilité", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  test.setTimeout(150_000);
  const tag = `E2E${Date.now().toString(36).toUpperCase()}`;
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  await signInAsAdmin(page);

  await page.goto("/fr/admin/banking/accounts", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Comptes bancaires", level: 1 })).toBeVisible();
  const accountForm = page.locator("form[data-banking-form=saveAccount]");
  await accountForm.locator("input[name=label]").fill(`Compte ${tag}`);
  await accountForm.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText(`Compte ${tag}`, { exact: true })).toBeVisible({ timeout: 15_000 });

  await page.goto("/fr/admin/banking/imports", { waitUntil: "networkidle" });
  const importForm = page.locator("form[data-banking-form=importStatement]");
  await importForm.locator("select[name=bankAccountId]").selectOption({ label: `Compte ${tag} (EUR)` });
  await importForm.locator("input[type=file]").setInputFiles({ name: `${tag}.ofx`, mimeType: "application/x-ofx", buffer: ofx(tag, date) });
  await importForm.getByRole("button", { name: "Importer" }).click();
  await expect(importForm.locator("[data-result-output]")).toContainText("Import terminé : 1 nouvelle(s) ligne(s)", { timeout: 20_000 });

  await page.goto(`/fr/admin/banking?status=&q=${tag}`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: `${tag} FRAIS TENUE` }).click();
  await expect(page.getByRole("heading", { name: "Rapprocher la ligne", level: 1 })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept("Ligne de test"));
  await page.getByRole("button", { name: "Ignorer la ligne" }).click();
  await expect(page.getByRole("button", { name: "Réintégrer la ligne" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Réintégrer la ligne" }).click();
  await expect(page.getByRole("button", { name: "Ignorer la ligne" })).toBeVisible({ timeout: 15_000 });

  await page.goto("/fr/admin/banking/rules", { waitUntil: "networkidle" });
  const ruleForm = page.locator("form[data-banking-form=saveRule]");
  await ruleForm.locator("input[name='rule.name']").fill(`Règle ${tag}`);
  await ruleForm.locator("input[name='rule.conditions.label.value']").fill(tag);
  await ruleForm.locator("select[name='rule.actions.kind']").selectOption("fee");
  await ruleForm.getByRole("button", { name: "Simuler" }).click();
  await expect(ruleForm.locator("[data-result-output]")).toContainText("1 ligne(s) concernée(s)", { timeout: 15_000 });
  await ruleForm.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText(`Règle ${tag}`)).toBeVisible({ timeout: 15_000 });

  await page.goto("/fr/admin/banking/settings", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Réglages banque", level: 1 })).toBeVisible();
  await page.locator("input[name='settings.agingDays']").fill("9");
  const saved = page.waitForResponse((response) => response.url().includes("saveSettings") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  expect((await saved).ok()).toBe(true);
  await page.waitForLoadState("networkidle");
  await page.goto("/fr/admin/banking/settings", { waitUntil: "networkidle" });
  await expect(page.locator("input[name='settings.agingDays']")).toHaveValue("9");

  await page.goto("/fr/admin/banking/ledger", { waitUntil: "networkidle" });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter en CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/^grand-livre-banque-.*\.csv$/);

  await page.goto("/fr/admin/accounting", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Comptabilité", level: 1 })).toBeVisible();
  await page.locator("form[data-banking-form=saveAccountingSettings]").getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator("form[data-banking-form=saveAccountingSettings] [data-form-error]")).toBeHidden();
});
