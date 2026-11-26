#!/usr/bin/env node
/**
 * Re-mesure la table `APPLICATION_SECTOR_NAF` contre le registre gouv.fr.
 *
 * POURQUOI CE SCRIPT N'EST PAS UN TEST DE CI
 * ──────────────────────────────────────────
 * Il interroge un service EXTERNE, 382 fois, sous limite de débit. En CI il
 * serait rouge le jour où le registre tousse — un test qui échoue pour une
 * raison qui n'est pas la sienne finit désactivé, et c'est une garde de moins.
 * Il s'exécute donc à la main, quand on TOUCHE la table :
 *
 *   node tools/validate-naf-mapping.mjs
 *
 * Ce qu'il prouve : chaque code EXISTE dans la nomenclature interrogeable. Ce
 * qu'il ne prouve pas : que le code soit rangé dans le bon secteur — le point
 * d'entrée ne publie aucun libellé, cette part-là s'audite en lisant.
 *
 * ⚠️ Il échoue AUSSI si le registre bascule en NAF 2025 : les codes rév. 2
 * cesseraient de répondre. C'est voulu — l'alternative est une liste vide en
 * production, sans erreur.
 */
import { APPLICATION_SECTOR_NAF } from '../packages/contracts/src/schemas/application-sector-naf.ts'

const BASE = 'https://recherche-entreprises.api.gouv.fr/search'
const codes = [...new Set(Object.values(APPLICATION_SECTOR_NAF).flat())].sort()
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Le registre limite le débit : une rafale rend des réponses VIDES qu'on
 *  prendrait pour des codes inconnus. Trois essais espacés, et on ne conclut
 *  jamais d'un silence. */
async function probe(code) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}?per_page=1&activite_principale=${encodeURIComponent(code)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      if (typeof body.total_results === 'number') return body.total_results
      throw new Error('total_results absent')
    } catch (error) {
      if (attempt === 2) return { error: String(error).slice(0, 90) }
      await sleep(1500 * (attempt + 1))
    }
  }
}

console.log(`${codes.length} codes à vérifier…`)
const broken = []
for (const [index, code] of codes.entries()) {
  const total = await probe(code)
  if (typeof total !== 'number' || total === 0) broken.push({ code, total })
  if ((index + 1) % 40 === 0) console.log(`  ${index + 1}/${codes.length}`)
  await sleep(300)
}

if (broken.length > 0) {
  console.error(`\n✗ ${broken.length} code(s) inconnu(s) ou vide(s) :`)
  for (const row of broken) console.error('   ', row.code, JSON.stringify(row.total))
  process.exit(1)
}
console.log(`\n✓ ${codes.length} codes, tous connus du registre.`)
