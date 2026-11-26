// #5069 — Génère src/geo/communes-coordonnees.data.ts : nom normalisé → lat/lon des communes françaises.
//
// Sources (ouvertes, figées dans le dépôt — AUCUN appel réseau à l'exécution) :
//  · COG + populations : paquet npm `@etalab/decoupage-administratif` 6.0.0 (Etalab, publié le 2026-03-09),
//    fichier data/communes.json — Code officiel géographique INSEE, licence ouverte Etalab 2.0.
//  · Contours : https://github.com/gregoiredavid/france-geojson (communes.geojson, dérivé d'IGN Admin Express,
//    licence ouverte Etalab 2.0) — le point est le centroïde du contour de la commune.
//
// Usage (Node ≥ 22.6) :
//   node --experimental-strip-types scripts/generate-communes-coordonnees.mjs <communes.json> <communes.geojson>
//   puis prettier --write src/geo
import { readFileSync, writeFileSync } from 'node:fs'

import { normalizeCityName } from '../src/schemas/geo-communes-normalize.ts'

const [cogPath, geojsonPath] = process.argv.slice(2)
if (!cogPath || !geojsonPath)
  throw new Error('usage: generate-communes-coordonnees.mjs <communes.json> <communes.geojson>')

// Budget : ≤ 700 Ko non compressé. Les ~35 000 communes feraient ~900 Ko : on garde celles de plus de 500 habitants
// ET les communes déjà citées par l'ancienne table de 19 villes (siteGeo.ts).
const MIN_POPULATION = 500
const LEGACY_CITIES = [
  'paris',
  'marseille',
  'lyon',
  'toulouse',
  'nice',
  'nantes',
  'strasbourg',
  'montpellier',
  'bordeaux',
  'lille',
  'rennes',
  'reims',
  'grenoble',
  'rouen',
  'caen',
  'nancy',
  'pau',
  'ajaccio',
  'bastia',
]

const cog = JSON.parse(readFileSync(cogPath, 'utf8')).filter(c => c.type === 'commune-actuelle')

// Centroïde d'une commune : barycentre pondéré par l'aire des anneaux extérieurs (planaire, suffisant à l'échelle d'une commune).
function centroid(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  let area = 0
  let cx = 0
  let cy = 0
  for (const polygon of polygons) {
    const ring = polygon[0]
    let a = 0
    let x = 0
    let y = 0
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i]
      const [x1, y1] = ring[i + 1]
      const cross = x0 * y1 - x1 * y0
      a += cross
      x += (x0 + x1) * cross
      y += (y0 + y1) * cross
    }
    area += a / 2
    cx += x / 6
    cy += y / 6
  }
  return area === 0 ? null : [cy / area, cx / area]
}

const points = new Map()
for (const feature of JSON.parse(readFileSync(geojsonPath, 'utf8')).features) {
  const point = centroid(feature.geometry)
  if (point) points.set(feature.properties.code, point)
}

// Homonymes : un nom porté par plusieurs communes de France ne se résout QUE par le département.
const nationwide = new Map()
const perDept = new Map()
for (const c of cog) {
  const key = normalizeCityName(c.nom)
  nationwide.set(key, (nationwide.get(key) ?? 0) + 1)
  const dk = `${c.departement}|${key}`
  perDept.set(dk, (perDept.get(dk) ?? 0) + 1)
}

const byDept = new Map()
let kept = 0
for (const c of cog) {
  const key = normalizeCityName(c.nom)
  if (!key || !c.departement) continue
  if (!((c.population ?? 0) > MIN_POPULATION || LEGACY_CITIES.includes(key))) continue
  if (perDept.get(`${c.departement}|${key}`) > 1) continue // deux communes du même nom dans un département : jamais devinée
  const point = points.get(c.code)
  if (!point) continue
  const [lat, lon] = point
  const entry = `${key}|${lat.toFixed(3)}|${lon.toFixed(3)}${nationwide.get(key) > 1 ? '|h' : ''}`
  if (!byDept.has(c.departement)) byDept.set(c.departement, [])
  byDept.get(c.departement).push(entry)
  kept++
}

const missing = LEGACY_CITIES.filter(k => ![...byDept.values()].some(list => list.some(e => e.startsWith(`${k}|`))))
if (missing.length) throw new Error(`communes historiques absentes : ${missing.join(', ')}`)

const lines = [...byDept.keys()].sort().map(d => `  '${d}': '${byDept.get(d).sort().join(';').replace(/'/g, "\\'")}',`)
const out = `// GÉNÉRÉ par scripts/generate-communes-coordonnees.mjs — ne pas éditer à la main.
// #5069 — référentiel STATIQUE des coordonnées des communes françaises (rayon en km), versionné : aucun appel réseau.
// Sources : COG INSEE + populations (npm @etalab/decoupage-administratif 6.0.0, publié le 2026-03-09) et contours
// IGN Admin Express (github.com/gregoiredavid/france-geojson) — licence ouverte Etalab 2.0. Généré le ${new Date().toISOString().slice(0, 10)}.
// Communes gardées : plus de ${MIN_POPULATION} habitants + les 19 villes de l'ancienne table de siteGeo.ts (budget ≤ 700 Ko) —
// ${kept} communes, MÉTROPOLE seulement (le fichier de contours ne porte pas les DROM). Une commune absente n'a PAS de coordonnées : la règle du nom, jamais une distance devinée.
// Format : code département ⇒ « nom normalisé|lat|lon[|h] » séparés par « ; » (\`normalizeCityName\`, 3 décimales ;
// \`h\` = le nom est porté par plusieurs communes de France : il ne se résout que par le département).
export const COMMUNES_COORDONNEES: Readonly<Record<string, string>> = {
${lines.join('\n')}
}
`
writeFileSync(new URL('../src/geo/communes-coordonnees.data.ts', import.meta.url), out)
console.log(`${kept} communes, ${byDept.size} départements, ${(out.length / 1024).toFixed(0)} Ko`)
