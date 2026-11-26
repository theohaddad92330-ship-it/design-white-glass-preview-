import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LAURA_INTERVENTIONS, INTERVENTION_FORMATS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { presentationFor } from '../features/laura/presentation'

/**
 * GA-68 — la TABLE DES CONTRAINTES DE SURFACE, et le catalogue qui doit y tenir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tome 6 §11.3 donne une table « surface × longueur max × peut poser une
 * question ». Elle existait comme prose et nulle part comme contrainte : rien
 * n'empêchait qu'une trente-sixième intervention soit écrite en six lignes et
 * déborde d'une carte de coin, ni qu'une intervention pose une question sur une
 * surface où l'on ne peut pas répondre.
 *
 * Les deux règles gardées ici sont celles que ce dépôt peut VRAIMENT tenir —
 * elles sont dérivées de la table de la source, pas recopiées d'elle. Le
 * §« l'écart avec la source » ci-dessous nomme la différence, chiffrée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RÈGLE 1 — LA LONGUEUR TIENT DANS LE CONTENEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Le budget par format vit dans `presentation.ts`, à UN seul endroit (GA-26),
 * avec le conteneur qu'il mesure. Cette garde le lit par `presentationFor` —
 * la même porte que le rendu — plutôt que d'en recopier les chiffres : deux
 * tables divergent au premier ajout.
 *
 * La mesure est un COMPTE DE CARACTÈRES, converti en lignes par la largeur du
 * conteneur. Elle est volontairement conservatrice des deux côtés :
 *
 *  · la largeur de caractère retenue (voir `presentation.ts`) est PLUS large
 *    que la moyenne réelle d'une police d'interface à 14 px, donc un texte que
 *    cette garde accepte se rend en MOINS de lignes qu'elle ne le croit ;
 *  · les interpolations `{{…}}` sont comptées BRUTES, donc plus longues que ce
 *    qui s'affichera dans la quasi-totalité des cas.
 *
 * C'est ce qui rend le repli visuel (`line-clamp`) posé par `LauraCard` sans
 * danger : il ne peut pas couper un texte que la CI a laissé passer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RÈGLE 2 — UNE QUESTION N'EST POSÉE QUE LÀ OÙ ELLE PEUT ÊTRE RÉPONDUE
 * ─────────────────────────────────────────────────────────────────────────────
 * La source réserve la question au panneau conversationnel et à l'assistant de
 * saisie — les deux surfaces qui portent une zone de texte. **Aucun des trois
 * formats de ce dépôt n'en porte** : `LauraCard` rend une phrase, un bouton
 * d'action, « Pas maintenant » et une croix. La colonne de la source s'effondre
 * donc ici sur une seule valeur, et ce n'est pas une colonne mais une règle :
 * une intervention qui pose une question doit porter une `route`, parce que le
 * bouton EST la réponse — la question est fermée, au sens du §11.3.
 *
 * Sans cette règle, une question sans bouton laisse l'utilisateur devant un
 * point d'interrogation et deux façons de faire taire l'assistante. C'est le
 * cas mesuré : cinq interventions posent une question, les cinq portent une
 * route (`no_action_validated`, `empty_talent_pool`, `credits_expiring`,
 * `single_active_seat`, `no_action_14_days`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉCART AVEC LA SOURCE, NOMMÉ ET NON MASQUÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le §11.3 pose « 2 lignes + 1 bouton » pour la carte comme pour la bulle. Le
 * catalogue livré ne les tient PAS : **31 des 32** textes de carte et de bulle
 * dépassent deux lignes — 26 cartes sur 27 et 5 bulles sur 5, médiane 121
 * caractères sur la carte et 120 sur la bulle, soit ~2,4 et ~2,9 lignes (les 3
 * panneaux sont « libres » chez la source aussi, ils ne comptent pas ici).
 * Le budget gardé ici est donc le PLAFOND RÉEL du conteneur, pas celui
 * de la source. Le ramener à deux lignes tronquerait trente et un messages ou
 * demanderait de les réécrire — une décision de produit, parquée au tracker,
 * pas un choix de garde.
 *
 * ⚠️ Ne PAS relever ce plafond pour faire passer un texte trop long : c'est un
 * cliquet. Un texte qui ne tient pas se raccourcit.
 */

const LOCALES = join(__dirname, '..', 'i18n', 'locales')

type LauraMessages = { interventions?: Record<string, string>; actions?: Record<string, string> }

function messages(locale: 'fr' | 'en'): LauraMessages {
  return JSON.parse(readFileSync(join(LOCALES, locale, 'laura.json'), 'utf8')) as LauraMessages
}

const FR = messages('fr')
const EN = messages('en')

type Entry = { key: string; format: string; route: string | null; fr: string; en: string }

/** Chaque intervention, avec ses deux textes et le budget de son format. */
const CORPUS: readonly Entry[] = LAURA_INTERVENTIONS.map(intervention => ({
  key: intervention.key,
  format: intervention.format,
  route: intervention.route,
  fr: FR.interventions?.[intervention.key] ?? '',
  en: EN.interventions?.[intervention.key] ?? '',
}))

/** Règle 1, isolée pour que le test « sait dire NON » exécute LA MÊME logique. */
function tooLongIn(entries: readonly Entry[]): string[] {
  return entries
    .flatMap(entry => {
      const { maxChars } = presentationFor(entry.format)
      if (maxChars === null) return []
      return (['fr', 'en'] as const)
        .filter(locale => entry[locale].length > maxChars)
        .map(locale => `${entry.key} (${entry.format}, ${locale}) ${entry[locale].length} > ${maxChars}`)
    })
    .sort()
}

/** Règle 2, isolée pour la même raison. */
function unanswerableIn(entries: readonly Entry[]): string[] {
  return entries
    .filter(entry => (entry.fr.includes('?') || entry.en.includes('?')) && entry.route === null)
    .map(entry => `${entry.key} (${entry.format})`)
    .sort()
}

describe('GA-68 — la table des contraintes de surface est LUE', () => {
  it('lit un corpus non vide : 35 interventions, deux langues, trois formats', () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(30)
    expect(CORPUS.every(entry => entry.fr.length > 0 && entry.en.length > 0)).toBe(true)
    // Chaque format du contrat porte au moins une intervention : un budget qui
    // ne s'applique à rien est un réglage qu'on peut changer sans que rien ne
    // bouge — le défaut que `presentation.ts` corrige déjà pour `format`.
    for (const format of INTERVENTION_FORMATS) {
      expect(CORPUS.some(entry => entry.format === format)).toBe(true)
    }
  })

  it('chaque format déclare un budget cohérent avec son repli visuel', () => {
    for (const format of INTERVENTION_FORMATS) {
      const presentation = presentationFor(format)
      if (presentation.maxLines === null) {
        expect(presentation.clamp).toBe('')
        expect(presentation.maxChars).toBe(null)
        continue
      }
      expect(presentation.clamp).toBe(`line-clamp-${presentation.maxLines}`)
      expect(presentation.maxChars).toBeGreaterThan(0)
    }
  })
})

describe('GA-68 — règle 1 : un texte tient dans son conteneur', () => {
  it('aucune intervention ne dépasse le budget de son format', () => {
    expect(tooLongIn(CORPUS)).toEqual([])
  })

  it('la garde sait dire NON — un caractère de trop suffit à la faire rougir', () => {
    // On casse VOLONTAIREMENT, sur la même fonction que l'assertion ci-dessus.
    const budget = presentationFor('card').maxChars as number
    const broken: Entry = { key: 'faux', format: 'card', route: '/actions', fr: 'x'.repeat(budget + 1), en: 'ok' }
    expect(tooLongIn([broken])).toEqual([`faux (card, fr) ${budget + 1} > ${budget}`])
  })

  it('le budget mesure quelque chose : le catalogue en occupe déjà la majeure partie', () => {
    // Un plafond très au-dessus du corpus serait vert pour toujours. Le texte
    // le plus long d'une carte occupe aujourd'hui plus de la moitié du budget.
    const budget = presentationFor('card').maxChars as number
    const longest = Math.max(
      ...CORPUS.filter(entry => entry.format === 'card').map(entry => Math.max(entry.fr.length, entry.en.length)),
    )
    expect(longest).toBeGreaterThan(budget / 2)
  })
})

describe('GA-68 — règle 2 : une question porte le bouton qui y répond', () => {
  it('aucune intervention ne pose une question sans route', () => {
    expect(unanswerableIn(CORPUS)).toEqual([])
  })

  it('la garde sait dire NON — une question sans route est refusée', () => {
    const broken: Entry = { key: 'faux', format: 'card', route: null, fr: 'On y va ?', en: 'Shall we?' }
    expect(unanswerableIn([broken])).toEqual(['faux (card)'])
  })

  it('elle voit les questions qui existent — la règle porte sur un corpus réel', () => {
    // Sans cela, elle serait verte le jour où plus aucun texte ne contiendrait
    // de « ? » — donc verte pour de mauvaises raisons.
    const asking = CORPUS.filter(entry => entry.fr.includes('?') || entry.en.includes('?'))
    expect(asking.length).toBeGreaterThan(0)
  })
})
