#!/usr/bin/env node
// Recette navigateur de l'aperçu statique : npm n'est pas nécessaire.
// Exécuter : node scripts/recette-parcours.mjs
import { createServer } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(import.meta.dirname, '../dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://local').pathname.replace(/\/$/, '/index.html')));
  if (path !== root && !path.startsWith(root + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(path);
    response.writeHead(200, { 'Content-Type': `${mime[extname(path)] || 'application/octet-stream'}; charset=utf-8` }).end(data);
  } catch {
    response.writeHead(404).end();
  }
});
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const checks = [];
async function check(label, fn) {
  await fn();
  checks.push(label);
  process.stdout.write(`✓ ${label}\n`);
}
async function open(page, base, fragment) {
  await page.goto(`${base}/#${fragment}`);
  await page.locator('main h1').first().waitFor({ state: 'visible' });
  const heading = (await page.locator('main h1').first().innerText()).trim();
  assert(heading.length > 3, `Titre absent : ${fragment}`);
  assert((await page.locator('main').innerText()).trim().length > 130, `Écran presque vide : ${fragment}`);
  return heading;
}

let browser;
try {
  await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browserPath = process.env.BELLUM_CHROMIUM_PATH || chromium.executablePath();
  try { await access(browserPath); }
  catch { throw new Error(`Navigateur Chromium absent (${browserPath}). Définir BELLUM_CHROMIUM_PATH puis relancer.`); }
  browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });

  const demo = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const demoPage = await demo.newPage();
  const errors = [];
  demoPage.on('pageerror', error => errors.push(error.message));
  await demoPage.goto(base);
  await check('choix explicite entre espace personnel et exemple fictif', async () => {
    await demoPage.locator('[data-action="mode-start-personal"]').waitFor();
    await demoPage.locator('[data-action="mode-start-scenario"]').click();
    await demoPage.locator('[data-action="team-tab"]').first().waitFor();
    assert(/donn[eé]es d.exemple.*non synchronis[eé]es/i.test(await demoPage.locator('.preview-note').innerText()), 'Provenance de l’exemple non signalée');
  });
  for (const [fragment, label] of [
    ['today', 'Ma journée'], ['agenda', 'Mon agenda'],
    ['team?tab=vue', 'Équipe · vue'], ['team?tab=objectifs', 'Équipe · objectifs'],
    ['team?tab=plans', 'Équipe · plans'], ['team?tab=recherches', 'Équipe · recherches'],
    ['team?tab=activite', 'Équipe · activité'], ['team?tab=administration', 'Équipe · carte'],
  ]) await check(`scénario : ${label}`, async () => { await open(demoPage, base, fragment); });
  for (const [id, label] of [['cockpit', 'Cockpit'], ['pipe', 'Affaires'], ['staffing', 'Staffing'], ['finance', 'Finance']]) {
    await check(`scénario : Pilotage · ${label}`, async () => {
      await open(demoPage, base, `pilotage?section=${id}`);
      assert(await demoPage.locator(`#p-${id}`).count() === 1, `Section Pilotage absente : ${id}`);
      assert(await demoPage.locator(`[data-anchor="${id}"].active`).count() === 1, `Onglet inactif : ${id}`);
    });
  }
  await check('scénario : carte France et drilldown BU', async () => {
    await open(demoPage, base, 'team?tab=administration');
    assert(await demoPage.locator('[data-action="map-city"]').count() > 0, 'Ville non sélectionnable');
    await demoPage.locator('[data-action="map-city"]').first().click();
    assert(await demoPage.locator('[data-action="map-bu"]').count() > 0, 'BU absente après ville');
  });
  assert(errors.length === 0, `Erreurs JS scénario : ${errors.join(' ; ')}`);
  await demo.close();

  const local = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await local.newPage();
  const localErrors = [];
  page.on('pageerror', error => localErrors.push(error.message));
  await page.goto(base);
  await page.locator('[data-action="mode-start-personal"]').click();
  await check('local : contexte demandé une fois et nom personnalisé', async () => {
    await page.locator('[data-profile-form]').waitFor();
    await page.locator('[data-profile-form] [name="firstName"]').fill('Maëlle');
    await page.locator('[data-profile-form] [name="companyName"]').fill('Altimance');
    await page.locator('[data-profile-form] [name="jobRole"]').selectOption('direction');
    await page.locator('[data-profile-form]').evaluate(form => form.requestSubmit());
    await page.getByText('Altimance', { exact: false }).first().waitFor();
    assert((await page.locator('main').innerText()).includes('Maëlle'), 'Prénom absent de Ma journée');
    assert((await page.locator('main').innerText()).includes('Altimance'), 'ESN absente de Ma journée');
    assert(/(?:appareil|navigateur).*(?:non connect[eé]s|sans connexion)/i.test(await page.locator('.preview-note').innerText()), 'Source locale non visible');
  });
  const firstUse = [
    ['today', /action|journée|démarr/i, 'Ma journée'],
    ['agenda', /rendez-vous|agenda/i, 'Agenda'],
    ['team?tab=vue', /Qui travaille où|périmètre/i, 'Équipe · Vue'],
    ['team?tab=objectifs', /cap|objectif/i, 'Équipe · Objectifs'],
    ['team?tab=plans', /prochaine étape|plan d.action/i, 'Équipe · Plans'],
    ['team?tab=recherches', /hypothèse|recherche/i, 'Équipe · Recherches'],
    ['team?tab=activite', /journal de vos gestes|activité/i, 'Équipe · Activité'],
    ['team?tab=administration', /carte|agence/i, 'Équipe · Carte'],
    ['pilotage?section=cockpit', /cap et mesure|trajectoire/i, 'Pilotage · Cockpit'],
    ['pilotage?section=pipe', /pipeline|affaires en cours/i, 'Pilotage · Affaires'],
    ['pilotage?section=staffing', /staffing|capacité/i, 'Pilotage · Staffing'],
    ['pilotage?section=finance', /échéances|finance/i, 'Pilotage · Finance'],
  ];
  for (const [fragment, unique, label] of firstUse) await check(`local : ${label}`, async () => {
    await open(page, base, fragment);
    const body = await page.locator('main').innerText();
    assert(unique.test(body), `Contenu métier manquant : ${fragment}`);
    assert(!body.includes('Groupe Sillage'), `Scénario fictif mélangé à l'espace local : ${fragment}`);
  });
  await check('local : création d’agence sur la carte', async () => {
    await open(page, base, 'team?tab=administration');
    const form = page.locator('[data-org-form="agency"]');
    await form.waitFor();
    await form.locator('[name="name"]').fill('Agence Test Paris');
    await form.locator('[name="city"]').selectOption({ label: 'Paris' });
    await form.evaluate(element => element.requestSubmit());
    await page.getByText('Agence Test Paris').first().waitFor();
  });
  assert(localErrors.length === 0, `Erreurs JS local : ${localErrors.join(' ; ')}`);
  await local.close();
  process.stdout.write(`\n${checks.length} contrôles navigateur réussis.\n`);
} catch (error) {
  process.stderr.write(`Échec après ${checks.length} contrôles : ${error.stack || error}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolveDone => server.close(resolveDone));
}
