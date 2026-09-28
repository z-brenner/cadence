/**
 * Drives the built UI end to end with Playwright and writes screenshots.
 *
 *   npm run build
 *   DATABASE_URL=postgres://... npx tsx scripts/ui/serve.ts &   # serves dist/ + API on :5199
 *   node scripts/ui/walkthrough.mjs ./shots
 *
 * Exits non-zero on any page error or console error. Playwright is a
 * devDependency; the Chromium binary comes from `npx playwright install chromium`
 * unless PLAYWRIGHT_CHROMIUM is set to an existing executable.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const out = process.argv[2] ?? "./shots";
fs.mkdirSync(out, { recursive: true });
const errors = [];
const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });
const settle = (ms = 400) => p.waitForTimeout(ms);
const expect = (cond, msg) => { if (!cond) errors.push("assert: " + msg); else console.log("ok  ", msg); };

await p.goto("http://localhost:5199/");
await p.getByText("Need an account?").click();
await p.getByPlaceholder("Name").fill("Walkthrough");
await p.getByPlaceholder("Email").fill(`ui-${Date.now()}@example.com`);
await p.getByPlaceholder("Password").fill("password123");
await p.getByRole("button", { name: "Create account" }).click();
await p.getByRole("button", { name: "New workspace" }).click();
await p.getByPlaceholder("Acme").fill("Walkthrough Org");
await p.getByPlaceholder("Engineering").fill("Engineering");
await p.getByLabel("Technical").check();
await p.getByRole("button", { name: "Create" }).click();
await p.waitForSelector(".columns");

for (const t of ["Local PII detector: false positives on phone numbers", "Regex pack v3 for SSNs", "Pre-send masking UI polish", "Model quantization for M1"]) {
  await p.getByPlaceholder("New issue").fill(t);
  await p.getByRole("button", { name: "New issue" }).click();
  await settle(250);
}
expect((await p.locator(".card").count()) === 4, "four issues on the board");

// Create a sprint. The filter must stay on All because the sprint is empty.
await p.getByRole("button", { name: "Manage" }).click();
await p.getByRole("button", { name: /New sprint/i }).click();
await p.getByRole("button", { name: "Create" }).click();
await settle();
await shot("01-technical-board-cycles");
expect((await p.locator(".card").count()) === 4, "creating an empty sprint does not empty the board");

// Keyboard-editing the year must not persist an intermediate value.
const start = p.locator(".cycle-row:not(.draft) input[type=date]").first();
await start.focus();
await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); // to the year segment (mm/dd/yyyy)
await p.keyboard.type("2");
await settle(300);
const cyclesOnServer = async () => p.evaluate(async () => {
  const ws = await (await fetch("/api/workspaces", { credentials: "include" })).json();
  return (await fetch(`/api/workspaces/${ws[0].id}/cycles`, { credentials: "include" })).json();
});
const saved = (await cyclesOnServer())[0].startsOn;
expect(!saved.startsWith("000"), `intermediate year is not persisted while typing (server has ${saved})`);
await p.keyboard.press("Escape");
await settle(200);
expect(!(await start.inputValue()).startsWith("000"), "Escape restores the saved date in the input");
await p.getByRole("button", { name: "Close" }).click();

// Assign two items via the card picker, then filter to the sprint.
const pickers = p.locator(".card select[title='Sprint']");
await pickers.nth(0).selectOption({ index: 1 });
await pickers.nth(1).selectOption({ index: 1 });
await settle();
await p.locator(".ws-header select").first().selectOption({ index: 2 });
await settle();
expect((await p.locator(".card").count()) === 2, "sprint filter shows the two assigned issues");
await shot("02-technical-board-filtered");

// New issue while filtered joins the sprint.
await p.getByPlaceholder("New issue").fill("Created inside sprint");
await p.getByRole("button", { name: "New issue" }).click();
await settle();
expect((await p.locator(".card").count()) === 3, "issue created while filtered appears in the sprint");

await p.getByRole("button", { name: "List" }).click(); await settle(); await shot("03-technical-list");
await p.getByRole("button", { name: "Reports" }).click(); await settle(1500); await shot("04-technical-reports");
await p.getByRole("button", { name: "Board" }).click(); await settle();

// Delete the sprint while it is the active filter: board must fall back to All and creation must still work.
await p.getByRole("button", { name: "Manage" }).click();
await p.getByRole("button", { name: "Delete" }).first().click();
await p.getByRole("button", { name: /Delete sprint/i }).click();
await settle();
await p.getByRole("button", { name: "Close" }).click();
await settle(4500); // past one poll
expect((await p.locator(".card").count()) === 5, "after deleting the filtered sprint the board shows everything");
await p.getByPlaceholder("New issue").fill("After delete");
await p.getByRole("button", { name: "New issue" }).click();
await settle();
expect((await p.locator(".card").count()) === 6, "creating an issue after the delete works");
await shot("05-technical-after-delete");

// Mode switch keeps the data.
await p.locator(".ws-header select").last().selectOption("knowledge");
await settle(800);
expect((await p.locator(".card").count()) === 6, "switching to knowledge mode keeps all items");
await p.getByRole("button", { name: "Calendar" }).click(); await settle(); await shot("06-knowledge-calendar");
await p.getByRole("button", { name: "Board" }).click(); await settle(); await shot("07-knowledge-board");

await b.close();
if (errors.length) { console.error("\nFAILURES:\n" + errors.join("\n")); process.exit(1); }
console.log("\nWALKTHROUGH PASS");
