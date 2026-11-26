import { describe, expect, it } from 'vitest'
import {
  BRIDGE_ACTIONS,
  CROSSABLE_CIRCLES,
  LABEL_SOURCE_COLUMNS,
  MEMORY_CIRCLES,
  MEMORY_CROSSING_GRAPH_IDS,
  MEMORY_CROSSING_KINDS,
  MEMORY_PRIVATE_KINDS,
  NEVER_CROSSED_CIRCLE,
  OBJECT_LABEL_MAX_LENGTH,
  bridgeColleagueSchema,
  bridgeConnectionsSchema,
  crossableCircleSchema,
  memoryBridgeViewSchema,
  memoryCrossingSchema,
  memoryObjectRefSchema,
  objectLabel,
  workspaceMemoryPolicySchema,
} from './memory-crossing.js'

const label = (value: string) => objectLabel('company_name', value)

/** Un croisement G1 complet, tel que le service le construit. */
function openDoorCrossing() {
  return {
    kind: 'openDoor' as const,
    circle: 'c2' as const,
    subject: { kind: 'account' as const, id: '11111111-1111-4111-8111-111111111111', label: label('BNP Paribas') },
    colleague: {
      kind: 'member' as const,
      userId: '22222222-2222-4222-8222-222222222222',
      displayName: label('David'),
      role: 'sales' as const,
    },
    action: 'talkToOwnerFirst' as const,
    observedAt: '2026-03-04T09:00:00.000Z',
    expiresAt: null,
    provenance: 'missions' as const,
    detail: {
      kind: 'openDoor' as const,
      mission: {
        kind: 'mission' as const,
        id: '33333333-3333-4333-8333-333333333333',
        label: label('Consultant Java'),
      },
      startedOn: '2026-03-04',
      stillActive: true,
    },
  }
}

describe('les quatre cercles', () => {
  it('nomme les quatre, C4 compris — un interdit qui n’a pas de nom ne se garde pas', () => {
    expect(MEMORY_CIRCLES).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(NEVER_CROSSED_CIRCLE).toBe('c4')
  })

  it('un croisement ne peut pas porter le cercle C4 — le schéma le refuse', () => {
    expect(CROSSABLE_CIRCLES).not.toContain(NEVER_CROSSED_CIRCLE)
    expect(crossableCircleSchema.safeParse('c4').success).toBe(false)
    expect(memoryCrossingSchema.safeParse({ ...openDoorCrossing(), circle: 'c4' }).success).toBe(false)
  })
})

describe('objectLabel — la seule porte par laquelle du texte entre dans un croisement', () => {
  it('refuse une colonne qui n’est pas une colonne de NOM', () => {
    // `body`, `content`, `note` ne sont pas dans la liste : l'appel ne compile
    // pas en TypeScript, et il rend `null` si un appelant JS force le passage.
    expect(objectLabel('body' as never, 'Bonjour, suite à notre échange…')).toBeNull()
    for (const forbidden of ['body', 'content', 'note', 'notes', 'detail', 'subject', 'cv_text', 'value']) {
      expect(LABEL_SOURCE_COLUMNS).not.toContain(forbidden)
    }
  })

  it('refuse un texte plus long qu’un nom d’objet', () => {
    expect(objectLabel('company_name', 'x'.repeat(OBJECT_LABEL_MAX_LENGTH))).not.toBeNull()
    expect(objectLabel('company_name', 'x'.repeat(OBJECT_LABEL_MAX_LENGTH + 1))).toBeNull()
  })

  it('refuse ce qui n’est pas un texte, et le vide', () => {
    expect(objectLabel('company_name', null)).toBeNull()
    expect(objectLabel('company_name', 42)).toBeNull()
    expect(objectLabel('company_name', '   ')).toBeNull()
  })

  it('rend l’étiquette détourée', () => {
    expect(objectLabel('company_name', '  BNP Paribas  ')).toBe('BNP Paribas')
  })
})

describe('une référence d’objet', () => {
  it('accepte un objet nommé', () => {
    const parsed = memoryObjectRefSchema.safeParse({
      kind: 'need',
      id: '44444444-4444-4444-8444-444444444444',
      label: 'Data',
    })
    expect(parsed.success).toBe(true)
  })

  it('refuse une clé de plus — le schéma est strict, rien ne voyage en passager clandestin', () => {
    const parsed = memoryObjectRefSchema.safeParse({
      kind: 'need',
      id: '44444444-4444-4444-8444-444444444444',
      label: 'Data',
      body: 'le corps du dernier e-mail',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('le collègue à contacter', () => {
  it('se nomme quand il est identifié', () => {
    const parsed = bridgeColleagueSchema.safeParse({
      kind: 'member',
      userId: '22222222-2222-4222-8222-222222222222',
      displayName: 'Sarah',
      role: 'sales',
    })
    expect(parsed.success).toBe(true)
  })

  it('se réduit à un rôle quand la personne n’est pas désignable', () => {
    // « Sales Ops » de la maquette : le croisement pointe une fonction, pas
    // quelqu'un. C'est l'« anonymized member » de la spec.
    const parsed = bridgeColleagueSchema.safeParse({ kind: 'role', role: 'sales_ops' })
    expect(parsed.success).toBe(true)
  })

  it('ne porte NI photo NI aucun critère protégé — GA-06', () => {
    for (const forbidden of ['photoUrl', 'age', 'gender', 'nationality', 'address']) {
      const parsed = bridgeColleagueSchema.safeParse({
        kind: 'role',
        role: 'sales_ops',
        [forbidden]: 'x',
      })
      expect(parsed.success).toBe(false)
    }
  })
})

describe('les quatre croisements de ce lot', () => {
  it('portent les identifiants de graphe de la maquette', () => {
    expect(MEMORY_CROSSING_KINDS).toEqual(['openDoor', 'prospectionCollision', 'crossStaffing', 'knownReferencing'])
    expect(MEMORY_CROSSING_GRAPH_IDS).toEqual({
      openDoor: 'G1',
      prospectionCollision: 'G4',
      crossStaffing: 'G9',
      knownReferencing: 'G11',
    })
  })

  it('proposent une action prise dans une liste fermée — jamais une phrase libre', () => {
    expect(BRIDGE_ACTIONS).toEqual([
      'talkToOwnerFirst',
      'coordinateOrArbitrate',
      'introduceBothOwners',
      'useFrameworkChannel',
    ])
    expect(memoryCrossingSchema.safeParse({ ...openDoorCrossing(), action: 'reassignTheAccount' }).success).toBe(false)
  })

  it('acceptent un G1 complet', () => {
    expect(memoryCrossingSchema.safeParse(openDoorCrossing()).success).toBe(true)
  })

  it('refusent un détail dont la nature ne suit pas celle du croisement', () => {
    const mismatched = {
      ...openDoorCrossing(),
      detail: { kind: 'crossStaffing' as const, consultant: null, need: null },
    }
    expect(memoryCrossingSchema.safeParse(mismatched).success).toBe(false)
  })

  it('refusent un rang de référencement à zéro — un rang commence à 1, « non mesuré » est `null`', () => {
    const base = {
      kind: 'knownReferencing' as const,
      circle: 'c1' as const,
      subject: openDoorCrossing().subject,
      colleague: { kind: 'role' as const, role: 'sales_ops' as const },
      action: 'useFrameworkChannel' as const,
      observedAt: '2024-01-01T00:00:00.000Z',
      expiresAt: null,
      provenance: 'accessFacts' as const,
    }
    expect(
      memoryCrossingSchema.safeParse({
        ...base,
        detail: { kind: 'knownReferencing', rank: 2, sinceYear: 2024 },
      }).success,
    ).toBe(true)
    expect(
      memoryCrossingSchema.safeParse({
        ...base,
        detail: { kind: 'knownReferencing', rank: null, sinceYear: null },
      }).success,
    ).toBe(true)
    expect(
      memoryCrossingSchema.safeParse({
        ...base,
        detail: { kind: 'knownReferencing', rank: 0, sinceYear: 2024 },
      }).success,
    ).toBe(false)
  })
})

describe('ce qui reste privé', () => {
  it('nomme les cinq natures de la maquette', () => {
    expect(MEMORY_PRIVATE_KINDS).toEqual([
      'messages',
      'personalNotes',
      'transcripts',
      'marginsAndAmounts',
      'privateComments',
    ])
  })
})

describe('la politique de l’espace', () => {
  it('n’a qu’un seul mode de partage — le pont. Il n’y a pas de mode « dossier »', () => {
    const policy = {
      sharingMode: 'bridge',
      ownerPriorityDays: 7,
      kAnonymityThreshold: 5,
      morningBudget: 'shared',
      restrictedAccounts: false,
    }
    expect(workspaceMemoryPolicySchema.safeParse(policy).success).toBe(true)
    expect(workspaceMemoryPolicySchema.safeParse({ ...policy, sharingMode: 'dossier' }).success).toBe(false)
  })

  it('refuse un k-anonymat sous 2 — un agrégat « anonyme » sur une observation ne l’est pas', () => {
    const policy = {
      sharingMode: 'bridge' as const,
      ownerPriorityDays: 7,
      kAnonymityThreshold: 1,
      morningBudget: 'shared' as const,
      restrictedAccounts: false,
    }
    expect(workspaceMemoryPolicySchema.safeParse(policy).success).toBe(false)
  })

  it('ne porte AUCUN réglage de réattribution — il n’y en a pas à régler', () => {
    const parsed = workspaceMemoryPolicySchema.safeParse({
      sharingMode: 'bridge',
      ownerPriorityDays: 7,
      kAnonymityThreshold: 5,
      morningBudget: 'shared',
      restrictedAccounts: false,
      autoReassign: false,
    })
    expect(parsed.success).toBe(false)
  })
})

describe('le compteur de mises en relation', () => {
  it('distingue « aucune ce mois-ci » de « pas assez d’historique »', () => {
    const measuredZero = bridgeConnectionsSchema.parse({
      connectionsThisMonth: 0,
      measuredSince: '2026-06-01T00:00:00.000Z',
    })
    expect(measuredZero.connectionsThisMonth).toBe(0)

    const neverMeasured = bridgeConnectionsSchema.parse({ connectionsThisMonth: null, measuredSince: null })
    expect(neverMeasured.connectionsThisMonth).toBeNull()
  })
})

describe('la vue complète', () => {
  it('nomme les sources qu’elle n’a PAS pu lire — une source tombée n’est pas une absence de croisement', () => {
    const view = memoryBridgeViewSchema.parse({
      account: openDoorCrossing().subject,
      crossings: [openDoorCrossing()],
      policy: {
        sharingMode: 'bridge',
        ownerPriorityDays: 7,
        kAnonymityThreshold: 5,
        morningBudget: 'shared',
        restrictedAccounts: false,
      },
      connections: { connectionsThisMonth: 14, measuredSince: '2026-06-01T00:00:00.000Z' },
      unreadableSources: ['projectNeeds'],
    })
    expect(view.unreadableSources).toEqual(['projectNeeds'])
  })
})
