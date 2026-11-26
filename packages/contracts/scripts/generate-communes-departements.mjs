// #4793.5 — Génère src/geo/communes-departements.data.ts depuis la source OFFICIELLE
// (geo.api.gouv.fr, Code officiel géographique : communes actuelles, métropole + DROM).
// Usage (Node ≥ 22.6) : node --experimental-strip-types scripts/generate-communes-departements.mjs
import { writeFileSync } from 'node:fs'

import { normalizeCityName } from '../src/schemas/geo-communes-normalize.ts'

const SOURCE = 'https://geo.api.gouv.fr/communes?fields=nom,code,codeDepartement&format=json&type=commune-actuelle'

let communes
for (let attempt = 1; attempt <= 5 && !communes; attempt++) {
  try {
    const res = await fetch(SOURCE)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    communes = await res.json()
  } catch (error) {
    if (attempt === 5) throw error
    await new Promise(r => setTimeout(r, 2000 * attempt))
  }
}

const byDept = new Map()
for (const { nom, codeDepartement } of communes) {
  if (!nom || !codeDepartement) continue
  const key = normalizeCityName(nom)
  if (!key) continue
  if (!byDept.has(codeDepartement)) byDept.set(codeDepartement, new Set())
  byDept.get(codeDepartement).add(key)
}

const date = new Date().toISOString().slice(0, 10)
const lines = [...byDept.keys()]
  .sort()
  .map(d => `  '${d}': '${[...byDept.get(d)].sort().join('|').replace(/'/g, "\\'")}',`)
const out = `// GÉNÉRÉ — ne pas éditer. Source : ${SOURCE}
// (Code officiel géographique, communes actuelles, métropole + DROM). Généré le ${date}.
// Régénérer : node --experimental-strip-types scripts/generate-communes-departements.mjs puis prettier --write src/geo
// Format : code département ⇒ noms de communes normalisés (\`normalizeCityName\`) séparés par « | ».
export const COMMUNES_DEPARTEMENTS: Readonly<Record<string, string>> = {
${lines.join('\n')}
}
`
// puis: prettier --write src/geo
writeFileSync(new URL('../src/geo/communes-departements.data.ts', import.meta.url), out)
console.log(`${communes.length} communes, ${byDept.size} départements, ${(out.length / 1024).toFixed(0)} Ko`)
