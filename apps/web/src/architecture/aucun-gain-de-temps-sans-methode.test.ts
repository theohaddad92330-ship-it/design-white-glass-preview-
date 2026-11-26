import { describe, expect, it } from 'vitest'
import { resources } from '@/i18n/resources'

/**
 * GA-382 — #2389.8 (LAU-FINAL-103, morning brief) : AUCUN GAIN DE TEMPS
 * AFFICHÉ SANS MÉTHODE CALCULÉE.
 *
 * Numéro vérifié le 22/09/2026 : GA-381 était le plus haut existant, sur les
 * deux espaces (`apps/web/src/architecture` et `apps/api/src/architecture`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue #2389 (§ « AUCUN FAUX CALCUL ») interdit d'afficher « 3 heures
 * gagnées » sans méthode définie, et prescrit la forme honnête : « Temps de
 * préparation évité estimé : 30–45 min. » — un gain de temps CHIFFRÉ ne se lit
 * jamais sans un mot qui dit qu'il est ESTIMÉ / calculé par une méthode.
 *
 * Mesure du 22/09/2026 (lot H) : AUCUN libellé du dépôt n'affiche aujourd'hui
 * de gain de temps chiffré, avec ou sans méthode — le NO-GO est donc respecté
 * par ABSENCE, mais rien ne l'empêchait de cesser de l'être. Cette garde fait
 * de l'absence une PROPRIÉTÉ tenue, sur tout le catalogue i18n (pas seulement
 * `briefing.json` : la règle est générale, "AUCUN FAUX CALCUL" n'est pas
 * scopée à un seul écran dans l'issue).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS PREUVES QU'UNE GARDE DOIT DONNER
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Elle sait dire NON — des phrases fabriquées (FR + EN, gain avant et après
 *    la durée) la font rougir, nommées par leur clé.
 * 2. Elle LIT quelque chose — tout `resources.fr` / `resources.en` (96
 *    catalogues par langue), non vides.
 * 3. Elle n'attrape PAS ce qu'elle ne vise pas — un gain QUALIFIÉ (« estimé »),
 *    une heure d'horloge (« il y a 3 heures »), et « gagner du temps » sans
 *    chiffre passent.
 */

/** Une durée chiffrée : `3h`, `3 heures`, `45 min`, `2.5 hours`… */
const DURATION = String.raw`\d+([.,]\d+)?\s*(h|heures?|hours?|min(?:utes?)?)\b`
/**
 * Un verbe de gain, FR + EN — bornes par lookaround sur `\p{L}`, jamais `\b` :
 * en JavaScript `\b` est ASCII, donc juste après un participe accentué
 * (« gagné », « économisé ») il ne matche rien, comme
 * `aucune-presence-esn-sans-preuve.test.ts` (GA-336) le documente déjà.
 */
const GAIN = String.raw`(?<![\p{L}])(gagn[\p{L}]*|économis[\p{L}]*|saved|gained)(?![\p{L}])`

/** Un gain de temps CHIFFRÉ, durée puis verbe, ou verbe puis durée — la
 *  fenêtre de 40 caractères tolère « 3 heures ont été gagnées » sans attraper
 *  deux phrases voisines sans rapport. */
const FORBIDDEN: readonly RegExp[] = [
  new RegExp(String.raw`${DURATION}[^.!?]{0,40}${GAIN}`, 'iu'),
  new RegExp(String.raw`${GAIN}[^.!?]{0,40}${DURATION}`, 'iu'),
]

/** Ce qui rend le gain honnête : il se dit ESTIMÉ / méthodé, pas assené. */
const QUALIFIER = /\b(estimé(e|s|es)?|estimation|méthode|estimated|estimate|method)\b/iu

type Entry = { key: string; value: string }

function flatten(node: unknown, prefix = ''): Entry[] {
  if (typeof node === 'string') return [{ key: prefix, value: node }]
  if (!node || typeof node !== 'object') return []
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    flatten(value, prefix ? `${prefix}.${key}` : key),
  )
}

/** LE DÉTECTEUR. Un gain de temps chiffré doit porter son qualificatif —
 *  sinon, violation. */
function gainSansMethode(entries: readonly Entry[]): Entry[] {
  return entries.filter(entry => {
    const asserts = FORBIDDEN.some(pattern => pattern.test(entry.value))
    return asserts && !QUALIFIER.test(entry.value)
  })
}

const FR = Object.entries(resources.fr).flatMap(([ns, tree]) => flatten(tree, ns))
const EN = Object.entries(resources.en).flatMap(([ns, tree]) => flatten(tree, ns))
const CORPUS = [...FR, ...EN]

describe('GA-382 — la garde LIT quelque chose', () => {
  it('aplatit les deux catalogues, non vides', () => {
    expect(FR.length).toBeGreaterThan(500)
    expect(EN.length).toBeGreaterThan(500)
    expect(CORPUS.every(entry => entry.value.length > 0)).toBe(true)
  })
})

describe('GA-382 — aucun gain de temps chiffré sans méthode', () => {
  it('le catalogue i18n complet est propre, dans les deux langues', () => {
    expect(gainSansMethode(CORPUS)).toEqual([])
  })
})

describe('GA-382 — elle sait dire NON', () => {
  it('rougit sur « 3 heures gagnées » (durée puis verbe, FR)', () => {
    expect(
      gainSansMethode([{ key: 'brief.x', value: 'Cette relance t’a fait gagner 3 heures cette semaine.' }]),
    ).toHaveLength(1)
  })

  it('rougit sur « gagné 2h » (verbe puis durée, FR)', () => {
    expect(gainSansMethode([{ key: 'brief.y', value: 'Tu as gagné 2h grâce à Laura.' }])).toHaveLength(1)
  })

  it('rougit sur « saved 3 hours » (EN)', () => {
    expect(gainSansMethode([{ key: 'brief.z', value: 'You saved 3 hours this week.' }])).toHaveLength(1)
  })

  it('rougit quand on casse VOLONTAIREMENT le vrai corpus', () => {
    const casse = CORPUS.map((entry, index) =>
      index === 0 ? { ...entry, value: `${entry.value} 3 heures gagnées aujourd’hui.` } : entry,
    )
    expect(gainSansMethode(casse).map(e => e.key)).toEqual([CORPUS[0]?.key])
  })
})

describe('GA-382 — elle n’attrape PAS ce qu’elle ne vise pas', () => {
  it('laisse passer un gain QUALIFIÉ, forme prescrite par #2389', () => {
    expect(gainSansMethode([{ key: 'brief.a', value: 'Temps de préparation évité estimé : 30–45 min.' }])).toEqual([])
    expect(gainSansMethode([{ key: 'brief.b', value: 'Estimated time saved: 30–45 min.' }])).toEqual([])
  })

  it('laisse passer une heure d’horloge, pas un gain', () => {
    expect(gainSansMethode([{ key: 'brief.c', value: 'Dernière visite il y a 3 heures.' }])).toEqual([])
  })

  it('laisse passer « gagner du temps » sans chiffre', () => {
    expect(gainSansMethode([{ key: 'brief.d', value: 'Ces brouillons te font gagner du temps ce matin.' }])).toEqual([])
  })
})
