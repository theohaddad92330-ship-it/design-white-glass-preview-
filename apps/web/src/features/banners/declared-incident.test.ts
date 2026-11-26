import { describe, expect, it } from 'vitest'
import { bannerKindValues, type BannerKind, type PublicBanner } from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'
import { chatErrorMessage } from '@/features/chat/chat-error'
import { declaredIncidentMessage } from './declared-incident'

/**
 * #1960.13 — UN INCIDENT SE DÉCLARE, IL NE SE DEVINE PAS.
 *
 * Ce fichier sait dire NON de trois façons :
 *  1. faire retomber `declaredIncidentMessage` sur n'importe quelle bannière
 *     (retirer le `banner.kind === 'incident'`) fait rougir LE TÉMOIN — les
 *     trois autres kinds ne déclarent aucun incident ;
 *  2. décorer un refus AU PLAFOND (429) ou une session morte avec l'incident
 *     fait rougir : ce sont des refus corrects d'un produit qui marche ;
 *  3. il LIT un corpus non vide — `bannerKindValues`, l'enum réel du contrat,
 *     doit contenir `incident` ET garder les trois autres (GA-08).
 *
 * Et le cas qui compte le plus : SANS DRAPEAU POSÉ, rien ne change d'un octet.
 */

const banner = (over: Partial<PublicBanner> = {}): PublicBanner =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'incident',
    variant: 'critical',
    title: { fr: 'Incident en cours', en: 'Ongoing incident' },
    body: { fr: 'Les analyses sont ralenties.', en: 'Analyses are slowed down.' },
    cta: null,
    dismissible: false,
    priority: 0,
    version: 1,
    ...over,
  }) as PublicBanner

const TEXTS = {
  fallback: 'Une erreur est survenue.',
  networkLost: 'Connexion perdue.',
  sessionExpired: 'Session expirée.',
}

describe('declaredIncidentMessage — le drapeau de l’opérateur, et rien d’autre', () => {
  it('le corpus relu n’est pas vide : `incident` est dans l’enum, et les trois autres y restent (GA-08)', () => {
    const kinds: readonly string[] = bannerKindValues
    expect(kinds).toContain('incident')
    for (const kept of ['announcement', 'maintenance', 'offer']) expect(kinds).toContain(kept)
    // AJOUTÉ EN FIN : une valeur insérée au milieu décalerait les lignes déjà
    // écrites si l'enum devenait un jour ordinal.
    expect(kinds[kinds.length - 1]).toBe('incident')
  })

  it('une bannière `incident` posée rend SON message, dans la langue du lecteur', () => {
    expect(declaredIncidentMessage([banner()], 'fr')).toBe('Les analyses sont ralenties.')
    expect(declaredIncidentMessage([banner()], 'en-GB')).toBe('Analyses are slowed down.')
  })

  it('sans corps, le TITRE de l’opérateur sert — mais jamais une phrase de remplissage', () => {
    expect(declaredIncidentMessage([banner({ body: { fr: '  ', en: '' } })], 'fr')).toBe('Incident en cours')
    expect(declaredIncidentMessage([banner({ body: { fr: '', en: '' }, title: { fr: '', en: '' } })], 'fr')).toBeNull()
  })

  it('LE TÉMOIN — aucun autre kind de bannière ne déclare un incident', () => {
    const others: BannerKind[] = bannerKindValues.filter(kind => kind !== 'incident')
    expect(others.length).toBe(3)
    for (const kind of others) {
      expect(declaredIncidentMessage([banner({ kind })], 'fr')).toBeNull()
    }
  })

  it('aucune bannière, ou aucune lecture → aucun incident', () => {
    expect(declaredIncidentMessage([], 'fr')).toBeNull()
    expect(declaredIncidentMessage(undefined, 'fr')).toBeNull()
    expect(declaredIncidentMessage(null, 'fr')).toBeNull()
  })
})

describe('chatErrorMessage — le refus sert l’incident DÉCLARÉ, et seulement lui', () => {
  it('SANS drapeau posé, chaque refus est byte-identique à celui d’avant', () => {
    // C'est la promesse du point : « sans drapeau posé, le comportement actuel
    // ne change pas d'un octet ».
    expect(chatErrorMessage(new ApiError('Boom', 500), TEXTS)).toBe(TEXTS.fallback)
    expect(chatErrorMessage(new TypeError('Failed to fetch'), TEXTS)).toBe(TEXTS.networkLost)
    expect(chatErrorMessage(new ApiError('nope', 401), TEXTS)).toBe(TEXTS.sessionExpired)
  })

  it('avec un drapeau posé, une PANNE dit qu’on la connaît', () => {
    const texts = { ...TEXTS, knownIncident: 'Incident connu, en cours de résolution : ça rame.' }
    expect(chatErrorMessage(new ApiError('Boom', 500), texts)).toBe(`${texts.knownIncident} ${TEXTS.fallback}`)
    expect(chatErrorMessage(new TypeError('Failed to fetch'), texts)).toBe(
      `${texts.knownIncident} ${TEXTS.networkLost}`,
    )
  })

  it('LE TÉMOIN — un plafond atteint et une session morte ne sont PAS des incidents', () => {
    // Un produit qui refuse correctement n'est pas en panne. Coller « incident
    // connu » ferait attendre un rétablissement qui ne viendra pas, et ferait
    // taire quelqu'un qui aurait dû nous écrire.
    const texts = { ...TEXTS, knownIncident: 'Incident connu, en cours de résolution : ça rame.' }
    expect(chatErrorMessage(new ApiError('nope', 401), texts)).toBe(TEXTS.sessionExpired)
    expect(chatErrorMessage(new ApiError('Plafond quotidien atteint.', 429), texts)).toBe('Plafond quotidien atteint.')
  })
})
