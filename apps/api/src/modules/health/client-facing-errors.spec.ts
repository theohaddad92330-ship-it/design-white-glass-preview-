import { CONNECTOR_ERROR_CODES } from '@bellum/contracts'
import {
  aggregateClientFacingErrors,
  CAPACITY_ERROR_CODES,
  isCapacityError,
  type ProbeErrorRow,
} from './client-facing-errors'

const NOW = new Date('2026-09-07T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function row(overrides: Partial<ProbeErrorRow> = {}): ProbeErrorRow {
  return {
    workspaceId: 'ws-1',
    capability: 'read',
    code: 'provider_unavailable',
    occurredAt: new Date(NOW.getTime() - HOUR),
    ...overrides,
  }
}

describe('isCapacityError — une erreur de capacité n’est pas un incident', () => {
  it('LIT le vocabulaire fermé du contrat — les deux familles le couvrent EN ENTIER', () => {
    // Un code du contrat qui ne serait dans aucune des deux familles sortirait
    // en incident sans que personne l'ait décidé. Ce contrôle rend la lacune
    // visible le jour où un sixième code apparaît.
    expect(CONNECTOR_ERROR_CODES.length).toBeGreaterThan(0)
    const capacite = CONNECTOR_ERROR_CODES.filter(code => isCapacityError(code))
    const incidents = CONNECTOR_ERROR_CODES.filter(code => !isCapacityError(code))
    expect(capacite.length + incidents.length).toBe(CONNECTOR_ERROR_CODES.length)
    expect(capacite.sort()).toEqual([...CAPACITY_ERROR_CODES].sort())
    expect(incidents.sort()).toEqual(['provider_unavailable', 'rate_limited'])
  })

  it('⚠️ LE TEST DE L’ISSUE — `scope_missing` est une erreur de CAPACITÉ', () => {
    expect(isCapacityError('scope_missing')).toBe(true)
  })

  it('« il y a quelque chose à brancher » et « une case à cocher » aussi', () => {
    expect(isCapacityError('not_connected')).toBe(true)
    expect(isCapacityError('provider_api_disabled')).toBe(true)
  })

  it('sait dire NON — un fournisseur muet ou saturé EST un incident', () => {
    expect(isCapacityError('provider_unavailable')).toBe(false)
    expect(isCapacityError('rate_limited')).toBe(false)
  })

  it('un code inconnu compte comme incident, à dessein', () => {
    // Mieux vaut un faux incident qu'on regarde qu'une panne classée « attendue »
    // sans que personne l'ait décidé.
    expect(isCapacityError('quelque_chose_de_neuf')).toBe(false)
    expect(isCapacityError(null)).toBe(false)
    expect(isCapacityError(undefined)).toBe(false)
  })
})

describe('aggregateClientFacingErrors', () => {
  it('⚠️ LE TEST DE L’ISSUE — un 503 `scope_missing` est ABSENT de la liste', () => {
    const rapport = aggregateClientFacingErrors(
      [row({ code: 'scope_missing', capability: 'search' }), row({ code: 'provider_unavailable', capability: 'read' })],
      { now: NOW, windowDays: 7 },
    )
    expect(rapport.errors.map(erreur => erreur.capability)).toEqual(['read'])
    expect(JSON.stringify(rapport.errors)).not.toContain('scope_missing')
  })

  it('mais l’exclusion se COMPTE — un tableau qui tait son filtre passe pour complet', () => {
    const rapport = aggregateClientFacingErrors(
      [row({ code: 'scope_missing' }), row({ code: 'not_connected' }), row({ code: 'provider_unavailable' })],
      { now: NOW, windowDays: 7 },
    )
    expect(rapport.capacityErrorsExcluded).toBe(2)
  })

  it('compte les ESPACES distincts, jamais les lignes', () => {
    const rapport = aggregateClientFacingErrors(
      [
        row({ workspaceId: 'ws-1', capability: 'read' }),
        row({ workspaceId: 'ws-1', capability: 'read' }),
        row({ workspaceId: 'ws-2', capability: 'read' }),
      ],
      { now: NOW, windowDays: 7 },
    )
    expect(rapport.errors[0]?.workspacesAffected).toBe(2)
  })

  it('ne publie AUCUN identifiant d’espace — un nombre, jamais une liste', () => {
    const rapport = aggregateClientFacingErrors([row({ workspaceId: 'ws-secret-42' })], { now: NOW, windowDays: 7 })
    expect(JSON.stringify(rapport)).not.toContain('ws-secret-42')
  })

  it('garde la dernière occurrence, et écarte ce qui déborde de la fenêtre', () => {
    const rapport = aggregateClientFacingErrors(
      [
        row({ occurredAt: new Date(NOW.getTime() - 8 * DAY) }),
        row({ occurredAt: new Date(NOW.getTime() - 2 * DAY) }),
        row({ occurredAt: new Date(NOW.getTime() - 6 * DAY) }),
      ],
      { now: NOW, windowDays: 7 },
    )
    expect(rapport.errors[0]?.lastOccurredAt).toBe(new Date(NOW.getTime() - 2 * DAY).toISOString())
  })

  it('trie par nombre d’espaces touchés — un écran d’incident, pas un inventaire', () => {
    const rapport = aggregateClientFacingErrors(
      [
        row({ capability: 'send', workspaceId: 'ws-1' }),
        row({ capability: 'read', workspaceId: 'ws-1' }),
        row({ capability: 'read', workspaceId: 'ws-2' }),
        row({ capability: 'read', workspaceId: 'ws-3' }),
      ],
      { now: NOW, windowDays: 7 },
    )
    expect(rapport.errors.map(erreur => erreur.capability)).toEqual(['read', 'send'])
  })

  it('une occurrence sans date ne compte pas — on ne la place pas « maintenant »', () => {
    const rapport = aggregateClientFacingErrors([row({ occurredAt: null })], { now: NOW, windowDays: 7 })
    expect(rapport.errors).toEqual([])
  })

  it('un code hors vocabulaire se range en « n’a pas répondu », jamais inventé', () => {
    const rapport = aggregateClientFacingErrors([row({ code: 'boum' })], { now: NOW, windowDays: 7 })
    expect(rapport.errors[0]?.codes).toEqual(['provider_unavailable'])
  })

  it('`now` est un PARAMÈTRE — le même jeu rend le même rapport, à l’octet', () => {
    const jeu = [row(), row({ capability: 'send' })]
    expect(JSON.stringify(aggregateClientFacingErrors(jeu, { now: NOW, windowDays: 7 }))).toBe(
      JSON.stringify(aggregateClientFacingErrors(jeu, { now: NOW, windowDays: 7 })),
    )
  })
})
