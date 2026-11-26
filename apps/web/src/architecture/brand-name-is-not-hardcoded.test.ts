import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-252 — LE NOM DU PRODUIT NE S'ÉCRIT PAS EN DUR DANS UNE TRADUCTION.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────
 * Le marque blanche (01/09/2026) donne à un client le droit de voir SA marque.
 * Il tient à une seule condition : que le produit ne connaisse son propre nom
 * qu'à UN endroit. Avant ce lot il le connaissait à 893 — 537 fois « Bellum »,
 * 356 fois « Laura » — et c'est exactement pour ça que le marque blanche
 * paraissait impossible : il n'y avait pas un mot à remplacer, il y en avait
 * mille.
 *
 * Les traductions portent maintenant `{{brand}}` et `{{copilot}}`, résolus par
 * `defaultVariables` d'i18next. Une seule clé qui réécrirait « Bellum » en
 * toutes lettres suffirait à faire apparaître notre nom sur l'écran d'un
 * client — et personne ne le verrait avant lui.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE REGARDE PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * Elle ne lit QUE `src/i18n/locales`. Le code TypeScript cite légitimement la
 * marque — un nom de token CSS (`--bellum-primary-500`), un chemin
 * (`@bellum/ui`), un commentaire qui raconte ce lot. Les confondre rendrait la
 * garde ininstallable, et une garde ininstallable se fait désactiver.
 *
 * Le journal des nouveautés (`packages/contracts/src/changelog`) échappe aussi,
 * et c'est délibéré : une entrée de septembre qui raconte « Laura montre son
 * visage » décrit ce qui S'EST PASSÉ. Réécrire un journal au nom d'une marque
 * changerait l'histoire plutôt que l'affichage.
 */

const LOCALES = join(__dirname, '../i18n/locales')

/** Les deux noms qui doivent passer par une variable. */
const BRAND_WORDS = [/\bBellum\w*/g, /\bLaura\b/g]

function jsonFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (entry.endsWith('.json')) out.push(full)
    }
  }
  walk(root)
  return out
}

const CATALOGS = jsonFiles(LOCALES).map(path => ({ path, source: readFileSync(path, 'utf8') }))

describe('GA-252 — la marque passe par une variable, jamais par le mot', () => {
  it('LIT vraiment les catalogues, et ils ne sont pas vides', () => {
    // Preuve n°1 : un chemin faux rendrait cette garde verte en ne lisant
    // rien — le pire des faux verts, parce qu'il se lit comme une victoire.
    expect(CATALOGS.length).toBeGreaterThan(80)
    expect(CATALOGS.some(c => c.path.includes('/fr/'))).toBe(true)
    expect(CATALOGS.some(c => c.path.includes('/en/'))).toBe(true)
  })

  it('sait dire NON — les trois graphies rencontrées sont refusées', () => {
    // Preuve n°2. `BellumAI` et la coquille `BellumAl` (un L minuscule à la
    // place du I, trouvée en français pendant la conversion) doivent tomber
    // aussi : c'est le même nom, mal écrit.
    for (const phrase of ['Ce que Bellum retient', 'les alertes BellumAI', 'la doc BellumAl', 'Demander à Laura']) {
      expect(
        BRAND_WORDS.some(re => new RegExp(re.source).test(phrase)),
        phrase,
      ).toBe(true)
    }
  })

  it('n’attrape PAS ce qu’elle ne vise pas', () => {
    // Preuve n°3. Les marqueurs eux-mêmes, et un texte qui parle du copilote
    // par son nom COMMUN — « copilote » est un positionnement, pas une marque :
    // un client renomme son copilote, il ne renomme pas le fait que c'en soit un.
    for (const phrase of ['Ce que {{brand}} retient', 'Demander à {{copilot}}', 'ton copilote commercial']) {
      expect(
        BRAND_WORDS.some(re => new RegExp(re.source).test(phrase)),
        phrase,
      ).toBe(false)
    }
  })

  it('ne trouve aucun nom de marque écrit en toutes lettres', () => {
    const offences: string[] = []
    for (const { path, source } of CATALOGS) {
      source.split('\n').forEach((line, index) => {
        for (const pattern of BRAND_WORDS) {
          const found = line.match(new RegExp(pattern.source, 'g'))
          if (found) offences.push(`${path.split('/locales/')[1]}:${index + 1} — ${found.join(', ')}`)
        }
      })
    }

    expect(
      offences,
      offences.length === 0
        ? ''
        : `Noms de marque écrits en dur dans une traduction :\n` +
            offences.map(o => `  ${o}`).join('\n') +
            `\n\nUtiliser {{brand}} pour le produit et {{copilot}} pour le copilote.\n` +
            `Les deux sont fournis à TOUTE clé par i18next (defaultVariables),\n` +
            `donc il n'y a rien à passer à t().`,
    ).toEqual([])
  })
})
