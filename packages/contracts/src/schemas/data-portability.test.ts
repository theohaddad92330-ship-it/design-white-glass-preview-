import { describe, expect, it } from 'vitest'
import { TABLE_SCOPES, type TableScope } from './table-scopes.js'
import {
  DATA_CLASSIFICATION_LEVELS,
  PORTABLE_OBJECTS,
  WITHHELD_KINDS,
  portableTables,
  withheldFromExport,
} from './data-portability.js'

/**
 * LA RÉVERSIBILITÉ AFFICHÉE — PDF 7 §9.2, ticket `BEL-INT-608` PR1.
 *
 * « La section "CE QUE VOUS N'EMPORTEZ PAS" est OBLIGATOIRE, avec sa raison en
 * une ligne. »
 *
 * Ce que ces tests tiennent, et c'est le cœur de l'exigence : cette section est
 * DÉRIVÉE de ce que l'export sait produire. Une liste rédigée une fois périme
 * au premier objet ajouté — et une réversibilité qui ment sur ce qu'elle laisse
 * derrière est pire qu'une clause de CGU, parce qu'on la croit.
 */
describe('withheldFromExport — la section est dérivée, jamais rédigée', () => {
  it('classe CHAQUE table du registre exactement une fois', () => {
    const exported = new Set(portableTables())
    const groups = withheldFromExport(TABLE_SCOPES)
    const seen = new Map<string, number>()
    for (const table of exported) seen.set(table, (seen.get(table) ?? 0) + 1)
    for (const group of groups) {
      for (const table of group.tables) seen.set(table, (seen.get(table) ?? 0) + 1)
    }

    const missing = Object.keys(TABLE_SCOPES).filter(table => !seen.has(table))
    const twice = [...seen].filter(([, count]) => count > 1).map(([table]) => table)
    expect(missing).toEqual([])
    expect(twice).toEqual([])
  })

  it('une table AJOUTÉE au registre entre d’office dans la section — elle ne périme pas', () => {
    const scopes: Record<string, TableScope> = {
      ...TABLE_SCOPES,
      un_nouveau_referentiel: { category: 'shared', audience: 'market', reason: 'du marché, pas de vous' },
    }
    const market = withheldFromExport(scopes).find(group => group.kind === 'shared_market')
    expect(market?.tables).toContain('un_nouveau_referentiel')
  })

  it('une table qui devient EXPORTABLE quitte la section, sans qu’on l’y retire à la main', () => {
    // Le pendant du test précédent : la dérivation doit répondre AUX DEUX
    // mouvements. Une section qui n'apprend que les ajouts finit par promettre
    // de retenir ce qu'elle rend déjà.
    const before = withheldFromExport(TABLE_SCOPES).flatMap(group => group.tables)
    const promoted = before[0] as string
    const after = withheldFromExport(TABLE_SCOPES, new Set([...portableTables(), promoted])).flatMap(
      group => group.tables,
    )
    expect(before).toContain(promoted)
    expect(after).not.toContain(promoted)
  })

  it('chaque groupe porte une RAISON, et aucun groupe vide ne s’affiche', () => {
    for (const group of withheldFromExport(TABLE_SCOPES)) {
      expect(group.tables.length).toBeGreaterThan(0)
      expect(WITHHELD_KINDS).toContain(group.kind)
      expect(group.reasonKey.length).toBeGreaterThan(0)
    }
  })

  it('une table PARTAGÉE ne peut jamais être exportée — le registre l’interdit', () => {
    const shared = Object.entries(TABLE_SCOPES)
      .filter(([, scope]) => scope.category === 'shared')
      .map(([table]) => table)
    expect(shared.length).toBeGreaterThan(0)
    for (const table of shared) expect(portableTables()).not.toContain(table)
  })

  it('une table encore À CLASSER n’est pas exportée en silence — elle est DITE', () => {
    const scopes: Record<string, TableScope> = {
      ...TABLE_SCOPES,
      table_en_suspens: { category: 'to-classify', question: 'à qui appartient-elle ?' },
    }
    const unclassified = withheldFromExport(scopes).find(group => group.kind === 'unclassified')
    expect(unclassified?.tables).toContain('table_en_suspens')
  })
})

describe('PORTABLE_OBJECTS — ce qu’on emporte vraiment', () => {
  it('chaque objet nomme au moins une table et propose CSV ET JSON', () => {
    expect(PORTABLE_OBJECTS.length).toBeGreaterThan(0)
    for (const object of PORTABLE_OBJECTS) {
      expect(object.tables.length).toBeGreaterThan(0)
      expect([...object.formats].sort()).toEqual(['csv', 'json'])
    }
  })

  it('deux objets ne se disputent jamais la même table', () => {
    const all = PORTABLE_OBJECTS.flatMap(object => [...object.tables])
    expect(all.length).toBe(new Set(all).size)
  })
})

/**
 * #2439.2 — CLASSER CHAQUE DONNÉE, SIX NIVEAUX NOMMÉS, DE PUBLIC À TECHNIQUE.
 *
 * Le catalogue déclare déjà QUI possède un objet (`perimeter`) ; il ne disait
 * pas à quel point il est sensible. Six niveaux fixes, du plus visible
 * (`public`) au plus opérationnel (`technique`) — jamais une échelle continue
 * qu'on pourrait affiner sans fin, jamais un septième niveau ad hoc.
 */
/**
 * #2439.1 / #2439.3 — LA PROVENANCE, DÉCLARÉE COMME LE RESTE.
 *
 * Le centre données répondait déjà à « quoi » et « jusqu'à quand » (formats,
 * classification) mais restait silencieux sur « pourquoi » (finalité), « pour
 * combien de temps CET objet » (rétention) et « d'où » (provenance). Les trois
 * suivent la même règle que `classification` : DÉCLARÉES sur le catalogue,
 * jamais dérivées — une valeur juste par accident reste fausse.
 */
describe('provenance, finalité, rétention (#2439.1 / #2439.3) — déclarées sur chaque objet', () => {
  it('chaque objet exportable porte les trois clés, non vides', () => {
    for (const object of PORTABLE_OBJECTS) {
      expect(object.purposeKey.length).toBeGreaterThan(0)
      expect(object.retentionKey.length).toBeGreaterThan(0)
      expect(object.provenanceKey.length).toBeGreaterThan(0)
    }
  })

  it('finalité et rétention sont PROPRES à chaque objet — aucune ne se recopie d’un objet à l’autre', () => {
    // Une clé copiée-collée d'un objet voisin est le défaut exact que la
    // déclaration est censée éviter : elle se lirait juste, sans l'être.
    // La provenance, elle, est un petit VOCABULAIRE partagé (comme la
    // classification) : plusieurs objets déclarés par la même main partagent
    // légitimement la même clé.
    for (const key of ['purposeKey', 'retentionKey'] as const) {
      const values = PORTABLE_OBJECTS.map(object => object[key])
      expect(new Set(values).size).toBe(values.length)
    }
  })
})

describe('suppression (#2439.3, 8e attribut) — ce que ta suppression de compte fait à chaque objet', () => {
  it('chaque objet porte une clé de suppression, non vide', () => {
    for (const object of PORTABLE_OBJECTS) {
      expect(object.deletionKey.length).toBeGreaterThan(0)
    }
  })

  it("l'objet workspace jamais touché par une suppression personnelle le dit — pas confondu avec une rétention normale", () => {
    const esnProfile = PORTABLE_OBJECTS.find(object => object.payloadKey === 'esnProfiles')
    expect(esnProfile?.deletionKey).toBe('deletionReason.untouchedWorkspaceOwned')
  })

  it('le seul objet réellement SUPPRIMÉ (pas anonymisé, pas conservé) est le canal SMS — vérifié sur PrivacyDeletionService', () => {
    const smsChannel = PORTABLE_OBJECTS.find(object => object.payloadKey === 'smsChannel')
    expect(smsChannel?.deletionKey).toBe('deletionReason.deletedOnErasure')
  })
})

describe('classification (#2439.2) — six niveaux nommés, de public à technique', () => {
  it('déclare exactement les six niveaux, dans cet ordre', () => {
    expect(DATA_CLASSIFICATION_LEVELS).toEqual([
      'public',
      'interne',
      'confidentiel',
      'personnel',
      'sensible',
      'technique',
    ])
  })

  it('chaque objet exportable porte un niveau parmi les six', () => {
    for (const object of PORTABLE_OBJECTS) {
      expect(DATA_CLASSIFICATION_LEVELS).toContain(object.classification)
    }
  })
})
