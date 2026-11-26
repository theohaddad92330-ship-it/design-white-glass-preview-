#!/usr/bin/env node
/**
 * Régénère les modules TS des comptes de démonstration semés depuis un CSV :
 *
 *   src/modules/demo/data/sg-compte-complet.csv   → sg-compte-complet.generated.ts
 *   src/modules/demo/data/bpce-compte-complet.csv → bpce-compte-complet.generated.ts
 *
 * Pourquoi un module TS généré plutôt qu'une lecture `fs` à l'exécution
 * (FINIR-V2-27-09, décision 3) : le build de `apps/api` est un `tsc` nu
 * (`package.json` → `"build": "tsc -p tsconfig.build.json"`), pas `nest build`
 * — aucun mécanisme n'y copie un fichier non-TypeScript dans `dist`. Un module
 * TS généré est compilé comme n'importe quel fichier source, sans config
 * d'assets à ajouter ni à maintenir : c'est le chemin le plus simple qui
 * passe le build tel qu'il est réellement.
 *
 * Généralisé le 30/09/2026 (dossier Groupe BPCE) : un seul script pour les deux
 * comptes, plutôt qu'une copie par compte (GA-26 — une règle vit à un endroit).
 *
 * À relancer après toute modification d'un des CSV :
 *   node apps/api/scripts/generate-compte-csv-modules.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', 'src', 'modules', 'demo', 'data')

const COMPTES = [
  { slug: 'sg-compte-complet', constant: 'SG_COMPTE_COMPLET_CSV' },
  { slug: 'bpce-compte-complet', constant: 'BPCE_COMPTE_COMPLET_CSV' },
  // 12/10/2026 — relevé Orange déposé par Théo dans le Drive « DÉMO CLIENTS » (consultants vérifiables, annexe).
  { slug: 'orange-consultants', constant: 'ORANGE_CONSULTANTS_CSV' },
]

for (const { slug, constant } of COMPTES) {
  const raw = readFileSync(join(dataDir, `${slug}.csv`), 'utf-8')
  const banner = `/**
 * GÉNÉRÉ — ne pas éditer à la main.
 *
 * Régénérer depuis \`${slug}.csv\` avec :
 *   node apps/api/scripts/generate-compte-csv-modules.mjs
 *
 * Voir ce script pour la raison d'un module TS plutôt qu'une lecture \`fs\`
 * à l'exécution.
 */
export const ${constant}: string = ${JSON.stringify(raw)}
`
  const outPath = join(dataDir, `${slug}.generated.ts`)
  writeFileSync(outPath, banner)
  console.log(`Écrit ${outPath} (${raw.length} caractères source)`)
}
