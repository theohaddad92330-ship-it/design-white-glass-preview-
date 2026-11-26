import type { OrgDeclaredPerson, OrgGraph } from '@bellum/contracts'
import { applyDeclaredPeople, mergeDeclaredPeople, personKey } from './org-graph-declare'

/**
 * #1103 — « Ici il faudrait pouvoir […] soit charger un organigramme si on en a
 * un, soit pouvoir décrire des éléments et ensuite ça intègre. »
 *
 * Ce que ces tests protègent, c'est moins la greffe que ses quatre REFUS : ne
 * pas dupliquer une personne, ne pas inventer d'entité, ne pas deviner un N+1,
 * ne rien écrire qui casse le contrat.
 */

const DECLARED_AT = '2026-08-26T10:00:00.000Z'

function graph(over: Partial<OrgGraph> = {}): OrgGraph {
  return {
    graphVersion: 1,
    entities: [
      { id: 'e-groupe', name: 'MUTUELLE UNEO', type: 'groupe', status: 'operating', sources: [], confidence: 80 },
    ],
    people: [],
    hierarchyEdges: [],
    influenceEdges: [],
    relationalEdges: [],
    buyingCommittee: [],
    uncoveredZones: [],
    recommendedPath: [],
    rejectedItems: [],
    ...over,
  }
}

const person = (over: Partial<OrgDeclaredPerson> = {}): OrgDeclaredPerson => ({
  fullName: 'Caroline Jaouen',
  title: 'Directrice des Systèmes d’Information',
  declaredAt: DECLARED_AT,
  ...over,
})

describe('la greffe des personnes déclarées (#1103)', () => {
  it('ajoute la personne avec une preuve de rang A et la confiance maximale', () => {
    const next = applyDeclaredPeople(graph(), [person()])!

    expect(next.people).toHaveLength(1)
    const added = next.people[0]!
    expect(added.fullName).toBe('Caroline Jaouen')
    expect(added.confidence).toBe(100)
    expect(added.identityStatus).toBe('verified_identity')
    // Quelqu'un qui travaille le compte affirme connaître cette personne : c'est
    // une preuve de rang A, au même titre qu'une page « gouvernance ».
    expect(added.sources[0]).toMatchObject({ kind: 'org_chart', grounding: 'A', date: DECLARED_AT })
  })

  it('CONFIRME une personne déjà connue au lieu de la dupliquer', () => {
    // Deux fiches pour la même personne dans un organigramme est ce qu'un
    // commercial ne pardonne pas.
    const existing = graph({
      people: [
        {
          id: 'p-caroline-jaouen',
          fullName: 'Caroline JAOUEN',
          entityId: 'e-groupe',
          decisionRoles: [],
          identityStatus: 'seed',
          sources: [],
          confidence: 40,
        },
      ],
    })

    const next = applyDeclaredPeople(existing, [person()])!

    expect(next.people).toHaveLength(1)
    expect(next.people[0]!.id).toBe('p-caroline-jaouen')
    expect(next.people[0]!.confidence).toBe(100)
    expect(next.people[0]!.title).toBe('Directrice des Systèmes d’Information')
  })

  it("n'efface pas un titre existant quand le formulaire laisse le champ vide", () => {
    const existing = graph({
      people: [
        {
          id: 'p-caroline-jaouen',
          fullName: 'Caroline Jaouen',
          title: 'DSI',
          entityId: null,
          decisionRoles: [],
          identityStatus: 'seed',
          sources: [],
          confidence: 40,
        },
      ],
    })

    const next = applyDeclaredPeople(existing, [person({ title: undefined })])!

    expect(next.people[0]!.title).toBe('DSI')
  })

  it("rattache à l'entité quand son nom correspond", () => {
    const next = applyDeclaredPeople(graph(), [person({ entityName: 'mutuelle unéo' })])!

    expect(next.people[0]!.entityId).toBe('e-groupe')
  })

  it("n'invente JAMAIS une entité qu'on ne retrouve pas", () => {
    // Fabriquer l'entité inventerait une branche d'organigramme à partir d'une
    // faute de frappe.
    const next = applyDeclaredPeople(graph(), [person({ entityName: 'Direction Truc' })])!

    expect(next.entities).toHaveLength(1)
    expect(next.people[0]!.entityId).toBeNull()
  })

  it('pose un lien hiérarchique VÉRIFIÉ vers un manager retrouvé', () => {
    const next = applyDeclaredPeople(graph(), [
      person({ fullName: 'Marc Petit' }),
      person({ fullName: 'Caroline Jaouen', managerName: 'marc petit' }),
    ])!

    const edge = next.hierarchyEdges.find(e => e.type === 'reports_to')
    expect(edge).toMatchObject({ verified: true, confidence: 100 })
    expect(next.people.find(p => p.id === edge!.fromId)!.fullName).toBe('Caroline Jaouen')
    expect(next.people.find(p => p.id === edge!.toId)!.fullName).toBe('Marc Petit')
  })

  it('ne pose AUCUN lien quand le manager est introuvable', () => {
    // Jamais un lien vers le « plus proche » : se tromper de N+1 oriente toute
    // une approche commerciale vers la mauvaise personne.
    const next = applyDeclaredPeople(graph(), [person({ managerName: 'Quelqu’un qu’on ne connaît pas' })])!

    expect(next.hierarchyEdges).toHaveLength(0)
  })

  it('ne se rattache pas à elle-même', () => {
    const next = applyDeclaredPeople(graph(), [person({ managerName: 'Caroline JAOUEN' })])!

    expect(next.hierarchyEdges).toHaveLength(0)
  })

  it('lève le rejet de quelqu’un qu’on redéclare', () => {
    // Redéclarer EST un geste humain postérieur au rejet. Et le contrat refuse
    // qu'un id soit à la fois actif et sur l'ardoise : sans cette levée, la
    // greffe entière serait rejetée et la personne resterait invisible.
    const before = graph({ rejectedItems: [{ sourceId: 'p-declared-caroline-jaouen', reason: 'écarté' }] })

    const next = applyDeclaredPeople(before, [person()])!

    expect(next.rejectedItems).toHaveLength(0)
    expect(next.people).toHaveLength(1)
  })

  it('ne réécrit rien quand il n’y a rien à déclarer', () => {
    expect(applyDeclaredPeople(graph(), [])).toBeNull()
  })

  it('est IDEMPOTENTE — la réappliquer après un run ne double rien', () => {
    const once = applyDeclaredPeople(graph(), [person()])!
    const twice = applyDeclaredPeople(once, [person()])!

    expect(twice.people).toHaveLength(1)
    expect(twice.people[0]!.sources).toHaveLength(1)
  })
})

describe("l'ardoise des déclarations", () => {
  it('remplace une déclaration au lieu d’en empiler une seconde', () => {
    // Deux déclarations de la même personne se contrediraient un jour, et
    // personne ne saurait laquelle fait foi.
    const merged = mergeDeclaredPeople([person({ title: 'DSI' })], [person({ title: 'Directrice SI' })])

    expect(merged).toHaveLength(1)
    expect(merged[0]!.title).toBe('Directrice SI')
  })

  it('neutralise la forme, jamais l’orthographe', () => {
    expect(personKey('Caroline JAOUEN')).toBe(personKey('caroline  jaouen'))
    // « Jean Dupond » n'est toujours pas « Jean Dupont ».
    expect(personKey('Jean Dupond')).not.toBe(personKey('Jean Dupont'))
  })
})

describe('déclarer quelqu’un, c’est le VÉRIFIER — et une vérification a une date', () => {
  it('une personne AJOUTÉE porte la date du geste comme date de vérification', () => {
    const next = applyDeclaredPeople(graph(), [person()])!
    expect(next.people[0]!.lastVerifiedAt).toBe(DECLARED_AT)
  })

  it('CONFIRMER une personne déjà connue rafraîchit sa date de vérification', () => {
    const existing = graph({
      people: [
        {
          id: 'p-caroline-jaouen',
          fullName: 'Caroline JAOUEN',
          entityId: 'e-groupe',
          decisionRoles: [],
          identityStatus: 'seed',
          sources: [],
          confidence: 40,
        },
      ],
    })
    // Avant le geste, rien ne dit quand cette personne a été vérifiée.
    expect(existing.people[0]!.lastVerifiedAt).toBeUndefined()

    const next = applyDeclaredPeople(existing, [person({ declaredAt: '2026-08-31T09:00:00.000Z' })])!
    expect(next.people[0]!.lastVerifiedAt).toBe('2026-08-31T09:00:00.000Z')
  })
})

describe('#2553.3 — un organigramme importé porte la date du DOCUMENT, pas celle du clic', () => {
  // « importer un organigramme qui a 3 ans, [que] les users en ont
  // conscience » (retour client 17/09/2026). `declaredAt` reste la date du
  // geste (obligatoire côté serveur) ; `documentDate` porte la date du fichier
  // quand il y en a une — c'est elle qui doit alimenter la fraîcheur, sinon un
  // organigramme de 2023 se lirait « vérifié aujourd'hui ».
  it('une personne AJOUTÉE depuis un document daté porte la date du DOCUMENT comme vérification', () => {
    const next = applyDeclaredPeople(graph(), [person({ documentDate: '2023-06-01' })])!

    expect(next.people[0]!.lastVerifiedAt).toBe('2023-06-01')
    expect(next.people[0]!.sources[0]).toMatchObject({ date: '2023-06-01' })
  })

  it('CONFIRMER une personne déjà connue avec un document daté reprend la date du document', () => {
    const existing = graph({
      people: [
        {
          id: 'p-caroline-jaouen',
          fullName: 'Caroline JAOUEN',
          entityId: 'e-groupe',
          decisionRoles: [],
          identityStatus: 'seed',
          sources: [],
          confidence: 40,
        },
      ],
    })

    const next = applyDeclaredPeople(existing, [person({ documentDate: '2023-06-01' })])!

    expect(next.people[0]!.lastVerifiedAt).toBe('2023-06-01')
  })

  // #2553 / #3740 — « marquer l'année pour que l'utilisateur sache que la
  // donnée a 3 ans » : la source nomme l'organigramme importé ET son année.
  it('la source nomme « organigramme importé (année) » quand le document est daté', () => {
    const next = applyDeclaredPeople(graph(), [person({ documentDate: '2023-06-01' })])!
    expect(next.people[0]!.sources[0]).toMatchObject({ ref: 'organigramme importé (2023)' })
  })

  it('sans documentDate, la source reste « saisi dans Bellum »', () => {
    const next = applyDeclaredPeople(graph(), [person()])!
    expect(next.people[0]!.sources[0]).toMatchObject({ ref: 'saisi dans Bellum' })
  })

  it('sans documentDate, le comportement ne change pas — la date du geste fait foi', () => {
    const next = applyDeclaredPeople(graph(), [person()])!

    expect(next.people[0]!.lastVerifiedAt).toBe(DECLARED_AT)
    expect(next.people[0]!.sources[0]).toMatchObject({ date: DECLARED_AT })
  })

  it('le lien hiérarchique posé depuis un document daté porte aussi la date du document', () => {
    const next = applyDeclaredPeople(graph(), [
      person({ fullName: 'Marc Petit', documentDate: '2023-06-01' }),
      person({ fullName: 'Caroline Jaouen', managerName: 'marc petit', documentDate: '2023-06-01' }),
    ])!

    const edge = next.hierarchyEdges.find(e => e.type === 'reports_to')
    expect(edge!.lastVerifiedAt).toBe('2023-06-01')
  })
})
