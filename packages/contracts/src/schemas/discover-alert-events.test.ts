import { describe, expect, it } from 'vitest'
import {
  DISCOVER_ALERT_DELIVERY_SURFACES,
  DISCOVER_ALERT_EVENT_KINDS,
  DISCOVER_ALERT_EVENT_SOURCE_KINDS,
  DISCOVER_ALERT_SURFACES,
  DISCOVER_ALERT_URGENT_KINDS,
  decideDiscoverAlertSurface,
  discoverAlertEventKey,
  discoverAlertSourceKindsOf,
  isUrgentDiscoverAlertKind,
  newItemsSince,
} from './discover-alert-events.js'

describe('#2151.14 — les événements qu’une alerte SURVEILLE', () => {
  it('nomme les dix déclencheurs du registre en sept genres distincts', () => {
    expect([...DISCOVER_ALERT_EVENT_KINDS]).toEqual([
      'new_signal',
      'new_matching_company',
      'new_confirmed_need',
      'new_relationship',
      'analysis_refreshed',
      'mission_ended',
      'new_access_path',
    ])
    expect(new Set(DISCOVER_ALERT_EVENT_KINDS).size).toBe(DISCOVER_ALERT_EVENT_KINDS.length)
  })

  it('donne à CHAQUE genre la NATURE de sa source, jamais un éditeur', () => {
    for (const kind of DISCOVER_ALERT_EVENT_KINDS) {
      expect(DISCOVER_ALERT_EVENT_SOURCE_KINDS[kind]).toBeDefined()
    }
    // #2151.9 — une source se nomme par sa nature : aucun nom de fournisseur.
    const natures = Object.values(DISCOVER_ALERT_EVENT_SOURCE_KINDS)
    expect(new Set(natures)).toEqual(new Set(['refreshed_analysis', 'public_information', 'workspace_declaration']))
  })
})

describe('#2151.25 — un événement ne sort que par UN canal', () => {
  it('Laura est une surface de LECTURE : la décision ne l’émet jamais', () => {
    expect(DISCOVER_ALERT_SURFACES).toContain('laura')
    expect(DISCOVER_ALERT_DELIVERY_SURFACES).not.toContain('laura')
    // Le témoin exhaustif : aucune combinaison d'entrée ne rend 'laura'.
    for (const kind of DISCOVER_ALERT_EVENT_KINDS) {
      for (const channel of ['in_app', 'email', 'sms', null] as const) {
        expect(decideDiscoverAlertSurface({ kind, channel })).not.toBe('laura')
      }
    }
  })

  it('rend UNE seule surface, et toujours l’une des surfaces de délivrance', () => {
    for (const kind of DISCOVER_ALERT_EVENT_KINDS) {
      for (const channel of ['in_app', 'email', 'sms', null] as const) {
        const surface = decideDiscoverAlertSurface({ kind, channel })
        expect(DISCOVER_ALERT_DELIVERY_SURFACES).toContain(surface)
      }
    }
  })

  it('#2151.23 — un genre URGENT part dans Aujourd’hui, et nulle part ailleurs', () => {
    for (const kind of DISCOVER_ALERT_URGENT_KINDS) {
      // Même quand le périmètre a choisi l'e-mail : l'urgence gagne, et elle
      // gagne SEULE — pas « en plus ».
      expect(decideDiscoverAlertSurface({ kind, channel: 'email' })).toBe('today')
      expect(decideDiscoverAlertSurface({ kind, channel: null })).toBe('today')
    }
  })

  it('un genre non urgent suit le canal choisi, et rien d’autre', () => {
    expect(decideDiscoverAlertSurface({ kind: 'new_relationship', channel: 'email' })).toBe('outbound')
    expect(decideDiscoverAlertSurface({ kind: 'new_relationship', channel: 'sms' })).toBe('outbound')
    expect(decideDiscoverAlertSurface({ kind: 'new_relationship', channel: 'in_app' })).toBe('notification')
    expect(decideDiscoverAlertSurface({ kind: 'new_relationship', channel: null })).toBe('notification')
  })

  it('isUrgentDiscoverAlertKind est le SEUL juge de l’urgence', () => {
    expect(isUrgentDiscoverAlertKind('new_signal')).toBe(true)
    expect(isUrgentDiscoverAlertKind('new_relationship')).toBe(false)
    expect(isUrgentDiscoverAlertKind('inconnu')).toBe(false)
  })
})

describe('#2151.25 — la CLÉ de déduplication', () => {
  it('le MÊME événement rend la MÊME clé', () => {
    const one = discoverAlertEventKey({ kind: 'new_signal', subjectId: 'acc-1', occurredOn: '2026-09-16' })
    const two = discoverAlertEventKey({ kind: 'new_signal', subjectId: 'acc-1', occurredOn: '2026-09-16' })
    expect(one).toBe(two)
  })

  it('le TÉMOIN INVERSE : deux événements DIFFÉRENTS rendent deux clés', () => {
    const base = { kind: 'new_signal', subjectId: 'acc-1', occurredOn: '2026-09-16' } as const
    const others = [
      { ...base, kind: 'analysis_refreshed' as const },
      { ...base, subjectId: 'acc-2' },
      { ...base, occurredOn: '2026-09-17' },
    ]
    const first = discoverAlertEventKey(base)
    for (const other of others) expect(discoverAlertEventKey(other)).not.toBe(first)
    expect(new Set([first, ...others.map(discoverAlertEventKey)]).size).toBe(4)
  })

  it('un identifiant portant le séparateur ne peut pas fabriquer la clé d’un autre', () => {
    const forged = discoverAlertEventKey({ kind: 'new_signal', subjectId: 'a:2026-09-16', occurredOn: 'x' })
    const honest = discoverAlertEventKey({ kind: 'new_signal', subjectId: 'a', occurredOn: '2026-09-16:x' })
    expect(forged).not.toBe(honest)
  })
})

describe('#2151.8 — les nouveaux éléments d’une recherche enregistrée', () => {
  it('jamais rejouée ⇒ `null`, JAMAIS 0', () => {
    expect(newItemsSince(4, null)).toBeNull()
    expect(newItemsSince(0, undefined)).toBeNull()
  })

  it('une dernière exécution ILLISIBLE ne devient pas « aucun nouvel élément »', () => {
    expect(newItemsSince(3, 'pas-une-date')).toBeNull()
  })

  it('rejouée et rien de neuf ⇒ 0, qui est alors VRAI', () => {
    expect(newItemsSince(0, '2026-09-15T08:00:00.000Z')).toBe(0)
    expect(newItemsSince(7, '2026-09-15T08:00:00.000Z')).toBe(7)
  })
})

describe('#2151.9 — la source d’une recherche enregistrée', () => {
  it('rend les NATURES des genres surveillés, dédoublonnées et ordonnées', () => {
    expect(discoverAlertSourceKindsOf(['new_signal', 'analysis_refreshed'])).toEqual([
      'public_information',
      'refreshed_analysis',
    ])
  })

  it('aucun genre surveillé ⇒ liste vide, qui se lit « source non qualifiée »', () => {
    expect(discoverAlertSourceKindsOf([])).toEqual([])
  })
})
