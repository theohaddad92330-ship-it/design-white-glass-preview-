import { describe, expect, it } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { buildCommitteeScreenData, CORE_SEATS, hiddenCommitteeContacts } from './committeeScreenData'

const person = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  fullName: `Nom ${id}`,
  title: 'Directeur',
  entityId: 'e1',
  identityStatus: 'actionable',
  confidence: 80,
  sources: [],
  ...over,
})

const raw = (
  people: Record<string, unknown>[],
  committee: Record<string, unknown>[],
  entities: Record<string, unknown>[] = [{ id: 'e1', name: 'Groupe X', type: 'groupe', confidence: 80 }],
) => ({
  org: {
    orgGraph: {
      graphVersion: 1,
      entities,
      people,
      hierarchyEdges: [],
      influenceEdges: [],
      buyingCommittee: committee,
      uncoveredZones: [],
      recommendedPath: [],
      rejectedItems: [],
    },
  },
})

const NOW = new Date('2026-09-29T00:00:00.000Z')

describe('buildCommitteeScreenData — #3282 / #3263.39', () => {
  it('null sans graphe : l’écran dit « à qualifier », il n’invente pas de comité', () => {
    expect(buildCommitteeScreenData({}, NOW)).toBeNull()
  })

  it('nomme les sièges cœur vides (#3263.42), sans les remplir', () => {
    const data = buildCommitteeScreenData(raw([person('p1')], [{ personId: 'p1', role: 'economic_buyer' }]), NOW)
    expect(data?.vacantSeats).toEqual(CORE_SEATS.filter(role => role !== 'economic_buyer'))
    expect(data?.seats.map(seat => seat.role)).toEqual(['economic_buyer'])
  })

  // #4324.1 (26/10, STG SERVICES / DHL) — une place n'est « à pourvoir » que si AUCUN contact du dossier ne peut la tenir.
  describe('#4324.1 — un contact du dossier tient la place, même « à qualifier »', () => {
    const contact = (full_name: string, title: string, over: Record<string, unknown> = {}) =>
      ({ id: `c-${full_name}`, full_name, title, decision_role: 'unknown', ...over }) as unknown as Contact
    const build = (contacts: Contact[]) =>
      buildCommitteeScreenData(raw([person('p1')], [{ personId: 'p1', role: 'champion' }]), NOW, contacts)

    it('CFO → décideur économique tenu ; Chief Procurement Officer → achats tenu ; IT « à qualifier » → technique tenu', () => {
      const data = build([
        contact('Ernesto Riera', 'CFO'),
        contact('Anna S.', 'Chief Procurement Officer'),
        contact('Zoé Martin', 'Responsable de Domaine IT / Pole Transport & Logistique'),
      ])
      expect(data?.vacantSeats).toEqual(['user_buyer'])
      expect(data?.contactHeldSeats.map(seat => seat.role)).toEqual([
        'economic_buyer',
        'technical_buyer',
        'procurement',
      ])
      expect(data?.contactHeldSeats[0]?.names).toEqual(['Ernesto Riera'])
    })

    it('SAIT DIRE NON : aucun contact ne peut tenir la place → elle reste à pourvoir', () => {
      const data = build([contact('Paul Chauffeur', 'Chauffeur livreur'), contact('Léa Com', 'Directeur Commercial')])
      expect(data?.vacantSeats).toEqual(CORE_SEATS.filter(role => role !== 'champion'))
      expect(data?.contactHeldSeats).toEqual([])
    })

    it('un contact masqué ne tient pas la place (il ne siège plus tant qu’il est masqué)', () => {
      const data = build([contact('Ernesto Riera', 'CFO', { hidden: true })])
      expect(data?.vacantSeats).toContain('economic_buyer')
    })

    it('un siège déjà tenu par le graphe n’est pas doublé en « tenu par un contact »', () => {
      const data = buildCommitteeScreenData(raw([person('p1')], [{ personId: 'p1', role: 'economic_buyer' }]), NOW, [
        contact('Ernesto Riera', 'CFO'),
      ])
      expect(data?.contactHeldSeats).toEqual([])
    })
  })

  it('NO-GO #3263.50 : l’ordre suit les sièges puis le graphe, jamais la séniorité', () => {
    const data = buildCommitteeScreenData(
      raw(
        [
          person('junior', { hierarchyLevel: 'L4' }),
          person('pdg', { hierarchyLevel: 'L0', title: 'PDG' }),
          person('achats', { hierarchyLevel: 'L3' }),
        ],
        [
          { personId: 'achats', role: 'procurement' },
          { personId: 'junior', role: 'champion' },
          { personId: 'pdg', role: 'champion' },
        ],
      ),
      NOW,
    )
    // champion avant procurement (ordre des sièges) ; dans champion : junior avant pdg (ordre du graphe).
    expect(data?.seats.map(seat => seat.role)).toEqual(['champion', 'procurement'])
    expect(data?.seats[0].members.map(m => m.personId)).toEqual(['junior', 'pdg'])
  })

  it('#3263.21 : jamais vérifié reste « jamais vérifié » (âge null, pas 0) ; périmé va dans À vérifier (#3263.41)', () => {
    const data = buildCommitteeScreenData(
      raw(
        [
          person('neuf'),
          person('vieux', { lastVerifiedAt: '2025-01-01' }),
          person('frais', { lastVerifiedAt: '2026-09-01' }),
        ],
        [
          { personId: 'neuf', role: 'champion' },
          { personId: 'vieux', role: 'technical_buyer' },
          { personId: 'frais', role: 'user_buyer' },
        ],
      ),
      NOW,
    )
    const byId = Object.fromEntries((data?.seats ?? []).flatMap(s => s.members).map(m => [m.personId, m]))
    expect(byId['neuf'].freshness).toEqual({ state: 'never_verified', lastVerifiedAt: null, ageDays: null })
    expect(byId['frais'].freshness.state).toBe('fresh')
    expect(data?.toVerify.map(m => m.personId)).toEqual(['vieux'])
  })

  it('une personne rejetée ne siège jamais', () => {
    const data = buildCommitteeScreenData(
      raw([person('p1', { identityStatus: 'rejected' })], [{ personId: 'p1', role: 'champion' }]),
      NOW,
    )
    // Le contrat refuse déjà ce graphe ; dans tous les cas, aucun siège occupé.
    expect(data?.seats ?? []).toEqual([])
  })

  /**
   * #3263.17/.18/.19/.44/.46/.48/.38/.40/.11 (épopée #3282, lot E22 30/09) —
   * l'identité, RÉSOLUE, pas inventée. Trois lots précédents (R10, comité,
   * P05, 29/09) ont laissé ces neuf points ouverts en citant l'ABSENCE d'un
   * `contact.id` sur le siège comme blocage architectural. Ce n'est pas
   * exact : `organigrammeData.ts::resolveServerPath` rapproche DÉJÀ le chemin
   * recommandé (même graphe, même `p-{slug}`) à de vrais `Contact` par
   * `orgPersonSlug(full_name)` — la même technique, jamais un second
   * mécanisme, réutilisée ici. Divergence volontaire sur les DOUBLONS :
   * `resolveServerPath` (lecture seule) garde le dernier ; un siège qui
   * powers un CTA d'ÉCRITURE (masquer, corriger…) refuse de deviner —
   * `contactId: null` sur un slug ambigu.
   */
  it('#3263.17-etc — résout `contactId` par le même rapprochement de nom que le chemin recommandé', () => {
    const data = buildCommitteeScreenData(
      raw([person('p1', { fullName: 'Claire Basset' })], [{ personId: 'p1', role: 'champion' }]),
      NOW,
      [{ id: 'c-42', full_name: 'Claire Basset' } as Contact],
    )
    expect(data?.seats[0].members[0].contactId).toBe('c-42')
  })

  // #3282 / #3263.30 — « trop haut » se calcule sur le niveau d'entrée SAISI, jamais sur un titre ou un texte libre.
  it('#3263.30 — `tooHigh` se calcule sur le niveau d’entrée déclaré', () => {
    const rawData = raw(
      [person('p1', { hierarchyLevel: 'L1' }), person('p2', { hierarchyLevel: 'L3' })],
      [
        { personId: 'p1', role: 'economic_buyer' },
        { personId: 'p2', role: 'champion' },
      ],
    )
    const data = buildCommitteeScreenData(rawData, NOW, [], 'manager')
    const members = data?.seats.flatMap(seat => seat.members) ?? []
    expect(members.find(m => m.personId === 'p1')?.tooHigh).toBe(true)
    expect(members.find(m => m.personId === 'p2')?.tooHigh).toBe(false)
  })

  it('#3263.30 — sans niveau d’entrée déclaré, personne n’est signalé « trop haut »', () => {
    const data = buildCommitteeScreenData(
      raw([person('p1', { hierarchyLevel: 'L0' })], [{ personId: 'p1', role: 'economic_buyer' }]),
      NOW,
      [],
      null,
    )
    expect(data?.seats[0].members[0].tooHigh).toBe(false)
  })

  it('aucun contact ne porte ce nom : `contactId` reste `null`, jamais deviné', () => {
    const data = buildCommitteeScreenData(
      raw([person('p1', { fullName: 'Claire Basset' })], [{ personId: 'p1', role: 'champion' }]),
      NOW,
      [{ id: 'c-1', full_name: 'Quelqu’un d’autre' } as Contact],
    )
    expect(data?.seats[0].members[0].contactId).toBeNull()
  })

  it('deux contacts homonymes : `contactId` reste `null` — un CTA d’écriture ne devine jamais', () => {
    const data = buildCommitteeScreenData(
      raw([person('p1', { fullName: 'Jean Martin' })], [{ personId: 'p1', role: 'champion' }]),
      NOW,
      [{ id: 'c-1', full_name: 'Jean Martin' } as Contact, { id: 'c-2', full_name: 'Jean Martin' } as Contact],
    )
    expect(data?.seats[0].members[0].contactId).toBeNull()
  })
})

/**
 * #3263.43 (épopée #3282, lot E22 30/09) — LA VUE « MASQUÉS ».
 *
 * `useHideContact` (masquage) existe déjà côté Contacts — ce n'est PAS un
 * second mécanisme : `hiddenCommitteeContacts` ne fait que FILTRER les
 * contacts déjà chargés par la fiche Compte (`findByAccount`, qui ne retire
 * pas les masqués — contrairement à `GET /contacts`). Aucun rapprochement
 * avec `OrgPerson` : le siège comité n'entre pas en jeu, seul `Contact.hidden`
 * compte — donc aucun risque d'homonymie (contrairement à #3263.17-19/.44-48,
 * qui restent bloqués sur l'identité).
 */
/**
 * #3263.37 / #3263.31 (épopée #3282) — deux règles de jugement transverses,
 * dérivées du MÊME graphe déjà résolu (entités + personnes), jamais un
 * second calcul :
 *
 *  - #3263.37 « un dirigeant MONDIAL ne doit pas être recommandé par
 *    défaut » — un exécutif (`hierarchyLevel: 'L1'`) rattaché à l'entité
 *    RACINE du groupe (`type: 'groupe'`), alors qu'une entité plus précise
 *    (filiale/BU) est déjà représentée par un AUTRE membre nommé du comité.
 *  - #3263.31 « interlocuteur trop éloigné du périmètre » — un membre
 *    rattaché à une entité qui n'a AUCUN lien d'ascendance avec l'entité
 *    majoritaire du comité (une branche entièrement différente), distinct
 *    du dirigeant mondial qui reste sur la MÊME branche, juste trop haut.
 *
 * Les deux se taisent (`false`) quand il n'y a personne d'autre à comparer —
 * doctrine « on n'affiche pas ce qu'on n'a pas », même raison que l'absence
 * de dépendance excessive sur un compte à un seul contact (#3263 multithreading).
 */
const ENTITIES_MULTI = [
  { id: 'groupe', name: 'Groupe X', type: 'groupe', confidence: 80 },
  { id: 'bu-data', name: 'BU Data', type: 'bu', parentId: 'groupe', confidence: 80 },
  { id: 'bu-rh', name: 'BU RH', type: 'bu', parentId: 'groupe', confidence: 80 },
]

describe('buildCommitteeScreenData — #3263.37 dirigeant mondial', () => {
  it('nomme le dirigeant du groupe quand une BU plus précise est déjà représentée', () => {
    const data = buildCommitteeScreenData(
      raw(
        [
          person('dg', { fullName: 'DG Groupe', entityId: 'groupe', hierarchyLevel: 'L1' }),
          person('dsi', { fullName: 'DSI BU', entityId: 'bu-data', hierarchyLevel: 'L2' }),
        ],
        [
          { personId: 'dg', role: 'champion' },
          { personId: 'dsi', role: 'technical_buyer' },
        ],
        ENTITIES_MULTI,
      ),
      NOW,
    )
    const byId = Object.fromEntries((data?.seats ?? []).flatMap(s => s.members).map(m => [m.personId, m]))
    expect(byId['dg'].tooGlobalExecutive).toBe(true)
    expect(byId['dsi'].tooGlobalExecutive).toBe(false)
  })

  it('SAIT DIRE NON — seul au comité, le dirigeant du groupe n’a personne de plus précis à préférer', () => {
    const data = buildCommitteeScreenData(
      raw(
        [person('dg', { fullName: 'DG Groupe', entityId: 'groupe', hierarchyLevel: 'L1' })],
        [{ personId: 'dg', role: 'champion' }],
        ENTITIES_MULTI,
      ),
      NOW,
    )
    expect(data?.seats[0].members[0].tooGlobalExecutive).toBe(false)
  })

  it('SAIT DIRE NON — un dirigeant de BU (pas groupe) n’est jamais nommé « mondial »', () => {
    const data = buildCommitteeScreenData(
      raw(
        [
          person('dir-bu', { fullName: 'Dir BU Data', entityId: 'bu-data', hierarchyLevel: 'L1' }),
          person('autre', { fullName: 'Autre BU', entityId: 'bu-rh', hierarchyLevel: 'L2' }),
        ],
        [
          { personId: 'dir-bu', role: 'champion' },
          { personId: 'autre', role: 'user_buyer' },
        ],
        ENTITIES_MULTI,
      ),
      NOW,
    )
    const byId = Object.fromEntries((data?.seats ?? []).flatMap(s => s.members).map(m => [m.personId, m]))
    expect(byId['dir-bu'].tooGlobalExecutive).toBe(false)
  })

  it('SAIT DIRE NON — un membre du groupe non-exécutif (L2) n’est jamais nommé « mondial »', () => {
    const data = buildCommitteeScreenData(
      raw(
        [
          person('manager-groupe', { fullName: 'Manager Groupe', entityId: 'groupe', hierarchyLevel: 'L2' }),
          person('dsi', { fullName: 'DSI BU', entityId: 'bu-data', hierarchyLevel: 'L2' }),
        ],
        [
          { personId: 'manager-groupe', role: 'champion' },
          { personId: 'dsi', role: 'technical_buyer' },
        ],
        ENTITIES_MULTI,
      ),
      NOW,
    )
    const byId = Object.fromEntries((data?.seats ?? []).flatMap(s => s.members).map(m => [m.personId, m]))
    expect(byId['manager-groupe'].tooGlobalExecutive).toBe(false)
  })
})

describe('buildCommitteeScreenData — #3263.31 interlocuteur trop éloigné', () => {
  it('nomme un membre rattaché à une branche sans aucun lien avec l’entité majoritaire du comité', () => {
    const data = buildCommitteeScreenData(
      raw(
        [
          person('dsi1', { fullName: 'DSI 1', entityId: 'bu-data', hierarchyLevel: 'L2' }),
          person('dsi2', { fullName: 'DSI 2', entityId: 'bu-data', hierarchyLevel: 'L3' }),
          person('rh', { fullName: 'Resp RH', entityId: 'bu-rh', hierarchyLevel: 'L3' }),
        ],
        [
          { personId: 'dsi1', role: 'technical_buyer' },
          { personId: 'dsi2', role: 'user_buyer' },
          { personId: 'rh', role: 'champion' },
        ],
        ENTITIES_MULTI,
      ),
      NOW,
    )
    const byId = Object.fromEntries((data?.seats ?? []).flatMap(s => s.members).map(m => [m.personId, m]))
    expect(byId['rh'].outOfPerimeter).toBe(true)
    expect(byId['dsi1'].outOfPerimeter).toBe(false)
  })

  it('SAIT DIRE NON — le dirigeant du groupe reste sur la MÊME branche : trop haut, jamais trop éloigné', () => {
    const data = buildCommitteeScreenData(
      raw(
        [
          person('dg', { fullName: 'DG Groupe', entityId: 'groupe', hierarchyLevel: 'L1' }),
          person('dsi1', { fullName: 'DSI 1', entityId: 'bu-data', hierarchyLevel: 'L2' }),
          person('dsi2', { fullName: 'DSI 2', entityId: 'bu-data', hierarchyLevel: 'L3' }),
        ],
        [
          { personId: 'dg', role: 'champion' },
          { personId: 'dsi1', role: 'technical_buyer' },
          { personId: 'dsi2', role: 'user_buyer' },
        ],
        ENTITIES_MULTI,
      ),
      NOW,
    )
    const byId = Object.fromEntries((data?.seats ?? []).flatMap(s => s.members).map(m => [m.personId, m]))
    expect(byId['dg'].outOfPerimeter).toBe(false)
  })

  it('SAIT DIRE NON — un comité sur une seule entité ne nomme personne « trop éloigné »', () => {
    const data = buildCommitteeScreenData(
      raw(
        [person('a', { fullName: 'A', entityId: 'bu-data' }), person('b', { fullName: 'B', entityId: 'bu-data' })],
        [
          { personId: 'a', role: 'champion' },
          { personId: 'b', role: 'technical_buyer' },
        ],
        ENTITIES_MULTI,
      ),
      NOW,
    )
    const byId = Object.fromEntries((data?.seats ?? []).flatMap(s => s.members).map(m => [m.personId, m]))
    expect(byId['a'].outOfPerimeter).toBe(false)
    expect(byId['b'].outOfPerimeter).toBe(false)
  })
})

describe('hiddenCommitteeContacts — #3263.43', () => {
  it('ne retient que les contacts masqués, triés par nom', () => {
    const visible = { id: 'c1', full_name: 'Alice Visible', hidden: false } as Contact
    const zed = { id: 'c2', full_name: 'Zed Masqué', hidden: true } as Contact
    const anna = { id: 'c3', full_name: 'Anna Masquée', hidden: true } as Contact

    expect(hiddenCommitteeContacts([visible, zed, anna])).toEqual([anna, zed])
  })

  it('aucun masqué → liste vide, pas une vue qui affirme le contraire', () => {
    const visible = { id: 'c1', full_name: 'Alice Visible', hidden: false } as Contact
    expect(hiddenCommitteeContacts([visible])).toEqual([])
  })
})

// #4813.1 — en recette prod (Swiss Life Lux, Sopra CE I2S, SGCIB) le badge « Dirigeant du groupe » ne sortait
// jamais : le graphe réel ne porte souvent NI `hierarchyLevel` NI entité de rattachement pour le dirigeant.
describe('buildCommitteeScreenData — #4813.1 dirigeant du groupe sans niveau ni entité', () => {
  const byIdOf = (data: ReturnType<typeof buildCommitteeScreenData>) =>
    Object.fromEntries((data?.seats ?? []).flatMap(s => s.members).map(m => [m.personId, m]))
  const build = (dg: Record<string, unknown>) =>
    buildCommitteeScreenData(
      raw(
        [dg, person('dsi', { fullName: 'DSI BU', entityId: 'bu-data', hierarchyLevel: 'L2' })],
        [
          { personId: dg.id as string, role: 'champion' },
          { personId: 'dsi', role: 'technical_buyer' },
        ],
        ENTITIES_MULTI,
      ),
      NOW,
    )

  it('un titre de dirigeant sans `hierarchyLevel` se lit c_level : badge sur le DG rattaché au groupe', () => {
    const data = build(person('dg', { title: 'Directeur général', entityId: 'groupe', hierarchyLevel: undefined }))
    expect(byIdOf(data)['dg'].tooGlobalExecutive).toBe(true)
  })

  it('un dirigeant sans entité de rattachement est au niveau du groupe : badge', () => {
    const data = build(person('dg', { title: 'Directeur général', entityId: undefined, hierarchyLevel: 'L1' }))
    expect(byIdOf(data)['dg'].tooGlobalExecutive).toBe(true)
  })

  it('SAIT DIRE NON — un titre non dirigeant sans niveau ne reçoit pas le badge', () => {
    const data = build(person('chef', { title: 'Responsable achats', entityId: 'groupe', hierarchyLevel: undefined }))
    expect(byIdOf(data)['chef'].tooGlobalExecutive).toBe(false)
  })
})
