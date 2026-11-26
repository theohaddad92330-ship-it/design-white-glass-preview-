/**
 * GA-109 — un zéro MESURÉ n'est pas un inconnu, et un taux dit sur combien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX DÉFAUTS, MESURÉS EN RECETTE LIVE SUR LA PRODUCTION LE 30/08/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Écran `/pilotage`, deux cartes voisines de celle qui affichait « Taux de
 * correction 0 % » à côté de « Éléments corrigés 12 » (GA-108) :
 *
 *  - **Qualification** : « Rendez-vous 0 · Besoins qualifiés 0 · Taux de
 *    qualification 0 % ». Le calcul est JUSTE — un dénominateur nul rend `null`
 *    depuis le 27/08, donc ce 0 % est une mesure réelle sur des besoins pris en
 *    charge. Mais le dénominateur n'était écrit nulle part, si bien qu'un
 *    décrochage à crier (« 0 qualifié sur 43 ») et une division par rien
 *    s'affichaient exactement pareil. « Un score n'est jamais nu » — un quotient
 *    non plus. Le pipeline du CRM, sur le MÊME écran, écrivait déjà « sur 12
 *    affaires tranchées » : deux taux voisins, deux façons de le dire.
 *
 *  - **Expansion** : « Clients actifs 0 », peint du gris de « non mesuré » et
 *    surmonté de l'icône de « non mesuré ». Or ce zéro a été LU — un `COUNT(*)
 *    FILTER (WHERE commercial_status = 'customer')` sur les comptes de l'espace
 *    — et il est VRAI. La carte montrait un chiffre en disant qu'elle n'en avait
 *    pas. La cause est nommée dans le contrat lui-même : « `non_mesure` dit
 *    moins que ce qu'il promet » — c'est une COULEUR (rien à juger), pas une
 *    absence de mesure. L'écran, lui, le lisait comme une absence.
 *
 * ⚠️ Le piège à ne pas retourner : « Rendez-vous 0 » et « Besoins qualifiés 0 »
 * sont VRAIS. Remplacer un vrai zéro par « non mesuré » ment tout autant. Ce
 * qu'on répare est la LISIBILITÉ de la distinction, jamais la valeur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE — ET CE QU'ELLE NE SAIT PAS LIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle EXÉCUTE le vrai calcul de chaîne et les vraies décisions d'affichage,
 * puis relit les deux catalogues de traduction. Elle ne se contente pas de
 * vérifier « la carte affiche une valeur » : elle vérifie qu'elle DISTINGUE
 * zéro d'inconnu — une garde qui ne ferait pas cette différence serait borgne,
 * et le dépôt en a produit sept en trois jours.
 *
 * Ce qu'elle NE vérifie PAS : **elle ne sait pas lire une couleur rendue.** Elle
 * vérifie que la décision passe par `metricTone` / `levelReading` et que ces
 * deux-là répondent juste ; le fait que le JSX applique bien la classe rendue
 * est tenu par les tests de rendu de `LevelDetail.test.tsx`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluatePilotageChain, type PilotageInputs } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { levelReading, metricTone } from '@/features/pilotage/view/chain-reading'

const WEB_SRC = join(__dirname, '..')
/**
 * ⚠️ Le corpus est `LevelDetail.tsx` et non `PilotagePage.tsx` depuis le
 * 04/09/2026 (#1433). La mosaïque de huit cartes est devenue une chaîne de six,
 * et la LIGNE d'indicateur — la seule qui décide d'un dénominateur et d'un ton —
 * a été extraite dans son propre module.
 *
 * La garde a rougi au déplacement, et c'est ce qu'on lui demande : ancrée sur un
 * nom de fichier, elle serait devenue muette si on l'avait « réparée » en
 * pointant l'écran survivant, qui ne porte plus rien de ce qu'elle vérifie.
 */
const PILOTAGE_PAGE = join(WEB_SRC, 'features', 'pilotage', 'view', 'LevelDetail.tsx')
const LOCALES = join(WEB_SRC, 'i18n', 'locales')

/** Les quatre taux de la chaîne. Aucun n'a le droit d'être nu. */
const RATE_KEYS = ['replyRate', 'qualificationRate', 'conversionRate', 'correctionRate'] as const

/** Un espace qui a tout lu et où tout coule — chaque taux y est mesuré. */
const MEASURED: PilotageInputs = {
  contactsTargeted: 40,
  signals: 12,
  profilesPushed: 3,
  emailsSent: 20,
  replied: 6,
  meetings: 3,
  needsQualified: 4,
  needsTriaged: 10,
  needsDecided: 3,
  benchAvailable: 8,
  conversions: 2,
  marginBand: null,
  activeClients: 5,
  rejectedItems: 1,
  totalContacts: 120,
}

/** Aucune source n'a répondu. Pas un chiffre ne sort. */
const UNREAD: PilotageInputs = Object.fromEntries(
  Object.keys(MEASURED).map(key => [key, null]),
) as unknown as PilotageInputs

function locale(language: 'fr' | 'en'): Record<string, Record<string, string>> {
  return JSON.parse(readFileSync(join(LOCALES, language, 'pilotage.json'), 'utf8')) as Record<
    string,
    Record<string, string>
  >
}

function pageSource(): string {
  return readFileSync(PILOTAGE_PAGE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('GA-109 — la garde LIT un corpus réel', () => {
  it('l’écran et les deux catalogues existent, et la chaîne produit des taux', () => {
    expect(existsSync(PILOTAGE_PAGE), 'la ligne d’indicateur du pilotage a disparu').toBe(true)
    expect(Object.keys(locale('fr')).length).toBeGreaterThan(10)
    expect(Object.keys(locale('en')).length).toBeGreaterThan(10)
    const rates = evaluatePilotageChain(MEASURED)
      .levels.flatMap(level => level.metrics)
      .filter(metric => metric.unit === 'rate')
    // Sans cette ligne, tous les tests de dénominateur passeraient au vert sur
    // une liste vide — le défaut « une garde qui ne lit rien ».
    expect(rates.length).toBe(RATE_KEYS.length)
  })
})

describe('GA-109 — un taux affiché porte son dénominateur', () => {
  it('chaque taux MESURÉ dit sur combien il est calculé', () => {
    const naked = evaluatePilotageChain(MEASURED)
      .levels.flatMap(level => level.metrics)
      .filter(metric => metric.unit === 'rate' && metric.value !== null && metric.denominator == null)
    expect(naked.map(metric => metric.key)).toEqual([])
  })

  it('un taux NON MESURÉ n’en porte aucun — il n’y en a pas', () => {
    const invented = evaluatePilotageChain(UNREAD)
      .levels.flatMap(level => level.metrics)
      .filter(metric => metric.unit === 'rate' && metric.denominator != null)
    expect(invented.map(metric => metric.key)).toEqual([])
  })

  it('l’écran LIT le dénominateur et le rend', () => {
    const source = pageSource()
    expect(source).toContain('metric.denominator')
    expect(source).toMatch(/over\.\$\{metric\.key\}/)
  })

  it('les deux langues nomment la population de CHAQUE taux', () => {
    // Un dénombrement sans nom (« sur 43 ») ne dit pas 43 quoi. Et une clé
    // absente d'un seul des deux catalogues laisse l'autre langue muette.
    for (const language of ['fr', 'en'] as const) {
      const over = locale(language).over ?? {}
      for (const key of RATE_KEYS) {
        expect(over[key], `${language}.over.${key}`).toBeTruthy()
        expect(over[`${key}_other`], `${language}.over.${key}_other`).toBeTruthy()
      }
    }
  })

  it('les deux langues portent les trois écritures d’un pourcentage', () => {
    for (const language of ['fr', 'en'] as const) {
      const rate = locale(language).rate ?? {}
      for (const key of ['exact', 'belowOne', 'aboveNinetyNine']) {
        expect(rate[key], `${language}.rate.${key}`).toBeTruthy()
      }
    }
  })
})

describe('GA-109 — un zéro mesuré ne se peint pas comme un inconnu', () => {
  it('la couleur se décide sur la VALEUR, et les deux cas ne se confondent pas', () => {
    const measuredZero = metricTone({ value: 0, status: 'non_mesure' })
    const neverRead = metricTone({ value: null, status: 'non_mesure' })
    expect(measuredZero).toBe('measured')
    expect(neverRead).toBe('unknown')
    expect(measuredZero).not.toBe(neverRead)
  })

  it('le maillon distingue « lu, rien à juger » de « pas lu »', () => {
    const read = levelReading({
      status: 'non_mesure',
      metrics: [{ key: 'activeClients', value: 0, unit: 'count', status: 'non_mesure' }],
    })
    const unread = levelReading({
      status: 'non_mesure',
      metrics: [{ key: 'activeClients', value: null, unit: 'count', status: 'non_mesure' }],
    })
    expect(read).toBe('nothingToJudge')
    expect(unread).toBe('unread')
  })

  it('l’écran DÉLÈGUE les deux décisions, il ne les refait pas', () => {
    // Le défaut : l'écran choisissait sa couleur sur `metric.status`, si bien
    // qu'un zéro lu portait le gris de l'inconnu.
    const source = pageSource()
    expect(source).toContain('metricTone(metric)')
    expect(source).toContain('levelReading(level)')
    expect(source).not.toMatch(/metric\.status\s*===\s*'non_mesure'/)
  })

  it('les deux langues NOMMENT les quatre états d’un maillon', () => {
    for (const language of ['fr', 'en'] as const) {
      const status = locale(language).status ?? {}
      for (const key of ['ok', 'alerte', 'nothingToJudge', 'unread']) {
        expect(status[key], `${language}.status.${key}`).toBeTruthy()
      }
      // « lu, rien à juger » et « non mesuré » ne peuvent pas être la même
      // phrase : ce serait la confusion qu'on répare, réintroduite au libellé.
      expect(status.nothingToJudge).not.toBe(status.unread)
    }
  })
})
