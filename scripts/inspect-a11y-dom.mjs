import { chromium } from "@playwright/test";
import fs from "node:fs/promises";

const browser = await chromium.launch({ headless: true });
const publicContext = await browser.newContext();
const adminContext = await browser.newContext();
let cookieFile = null;
try {
  cookieFile = JSON.parse(await fs.readFile(".a11y-cookies.json", "utf8"));
} catch {
  cookieFile = null;
}

const adminCookie = cookieFile?.adminCookie?.split("=", 2);

if (adminCookie?.length === 2) {
  await adminContext.addCookies([
    {
      name: adminCookie[0],
      value: adminCookie[1],
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

const checks = [
  { name: "public-about", url: "http://localhost:4323/fr/a-propos" },
  { name: "admin-site", url: "http://localhost:4323/en/admin/site" },
];

for (const check of checks) {
  const page = await (check.name === "admin-site" ? adminContext : publicContext).newPage();
  await page.goto(check.url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");
  const data = await page.evaluate(() => {
    const triggers = Array.from(document.querySelectorAll('[data-slot="dropdown-trigger"]')).map((el) => ({
      tag: el.tagName,
      asChild: el.hasAttribute("data-as-child"),
      ariaHaspopup: el.getAttribute("aria-haspopup"),
      ariaExpanded: el.getAttribute("aria-expanded"),
      text: el.textContent?.trim().slice(0, 60) ?? "",
    }));

    const cookie = document.querySelector("#cc-banner > div:nth-child(1) > p");
    const cookieBanner = document.getElementById("cc-banner");
    const labels = Array.from(document.querySelectorAll(".locale-settings-form label")).slice(0, 8).map((el) => ({
      text: el.textContent?.trim(),
      htmlFor: el.getAttribute("for"),
    }));
    const inputs = Array.from(document.querySelectorAll(".locale-settings-form input, .locale-settings-form textarea")).slice(0, 8).map((el) => ({
      tag: el.tagName,
      id: el.getAttribute("id"),
      name: el.getAttribute("name"),
    }));

    return {
      triggers,
      cookieBanner: cookieBanner
        ? {
            className: cookieBanner.getAttribute("class"),
            color: getComputedStyle(cookieBanner).color,
            background: getComputedStyle(cookieBanner).backgroundColor,
            boxShadow: getComputedStyle(cookieBanner).boxShadow,
          }
        : null,
      cookie: cookie
        ? {
            className: cookie.getAttribute("class"),
            color: getComputedStyle(cookie).color,
            background: getComputedStyle(cookie).backgroundColor,
          }
        : null,
      labels,
      inputs,
    };
  });

  console.log(JSON.stringify({ check, data }, null, 2));
  await page.close();
}

await publicContext.close();
await adminContext.close();
await browser.close();