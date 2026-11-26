import { describe, expect, it } from 'vitest'
import { accountSchema, createAccountSchema } from './account.js'
import { startAnalysisSchema } from './analysis.js'
import {
  describeDiscoverOriginCriteriaFr,
  discoverOriginCriteriaSchema,
  isDiscoverOriginCriteriaEmpty,
} from './discover-origin.js'

// #3819 (lot RBB, décision Louis 11/10) — les critères de Découvrir suivent le compte.
describe('discoverOriginCriteriaSchema', () => {
  it('accepte les quatre axes (secteur, zone, effectif, signal)', () => {
    const parsed = discoverOriginCriteriaSchema.parse({
      sectors: ['insurance'],
      zone: 'Lille · 59',
      headcount: ['1000+'],
      signals: ['hiring'],
    })
    expect(parsed.signals).toEqual(['hiring'])
  })

  it('refuse une clé inconnue et un signal hors vocabulaire', () => {
    expect(discoverOriginCriteriaSchema.safeParse({ score: 80 }).success).toBe(false)
    expect(discoverOriginCriteriaSchema.safeParse({ signals: ['probabilite'] }).success).toBe(false)
  })

  it('un objet sans axe est VIDE — rien à nommer, jamais « 0 critère »', () => {
    expect(isDiscoverOriginCriteriaEmpty({})).toBe(true)
    expect(isDiscoverOriginCriteriaEmpty({ sectors: [] })).toBe(true)
    expect(isDiscoverOriginCriteriaEmpty(null)).toBe(true)
    expect(isDiscoverOriginCriteriaEmpty({ zone: 'Lille' })).toBe(false)
  })

  it('se décrit en français lisible pour le cadrage de l’analyse', () => {
    expect(
      describeDiscoverOriginCriteriaFr({
        sectors: ['insurance'],
        zone: 'Lille',
        headcount: ['1000+'],
        signals: ['hiring'],
      }),
    ).toEqual(['secteur : Assurance & mutuelles', 'zone : Lille', 'effectif : 1000+ salariés', 'signal : recrutement'])
    expect(describeDiscoverOriginCriteriaFr({})).toEqual([])
  })

  // #4315 — les deux signaux de marché public portent le mot de la case du rail.
  it('nomme les signaux de marché public comme la case du rail', () => {
    expect(describeDiscoverOriginCriteriaFr({ signals: ['tender', 'award'] })).toEqual([
      "signal : appel d'offres public en cours, marché public remporté",
    ])
  })

  // #3819 (lot W-C 13/10) — la compétence cherchée est un axe comme les autres,
  // portée par le même JSON (aucune migration : la colonne n'a pas de CHECK de clés).
  it('porte la compétence cherchée et la redit au cadrage', () => {
    expect(discoverOriginCriteriaSchema.parse({ skills: ['java'] }).skills).toEqual(['java'])
    expect(isDiscoverOriginCriteriaEmpty({ skills: [] })).toBe(true)
    expect(isDiscoverOriginCriteriaEmpty({ skills: ['java'] })).toBe(false)
    expect(describeDiscoverOriginCriteriaFr({ skills: ['java', 'sap'] })).toEqual(['compétence : java, sap'])
  })
})

describe('transport des critères', () => {
  it('POST /analysis/start accepte suggestion_criteria', () => {
    const parsed = startAnalysisSchema.parse({
      company_name: 'Acme',
      suggestion_id: 'discover:552032534',
      suggestion_criteria: { zone: 'Lille' },
    })
    expect(parsed.suggestion_criteria).toEqual({ zone: 'Lille' })
  })

  it('le compte expose discover_origin_criteria, et la création le reçoit', () => {
    expect(
      createAccountSchema.parse({ company_name: 'Acme', discover_origin_criteria: { zone: 'Lille' } }),
    ).toMatchObject({
      discover_origin_criteria: { zone: 'Lille' },
    })
    const shape = accountSchema.shape.discover_origin_criteria
    expect(shape.safeParse(null).success).toBe(true)
  })
})

// #4642 — le contexte de Laura voyage avec le lot ; il priorise, il n'écarte rien.
describe('contexte Laura (#4642)', () => {
  const talent = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d'
  const criteria = {
    framed_by: 'laura' as const,
    talent_id: talent,
    skills: ['Java', 'Kafka'],
    offers: [{ title: 'Dev Java Kafka', date: '2026-10-20' }, { title: 'Architecte SI' }],
  }

  it('accepte le talent, les offres relevées et la provenance', () => {
    expect(discoverOriginCriteriaSchema.parse(criteria)).toEqual(criteria)
  })

  it('#4646.2 le lien d’une offre est http(s) ; tout autre schéma est refusé', () => {
    const ok = { offers: [{ title: 'Dev Java', url: 'https://offres.example.org/a?id=1' }] }
    expect(discoverOriginCriteriaSchema.parse(ok)).toEqual(ok)
    expect(
      discoverOriginCriteriaSchema.safeParse({ offers: [{ title: 'x', url: 'javascript:alert(1)' }] }).success,
    ).toBe(false)
    expect(discoverOriginCriteriaSchema.safeParse({ offers: [{ title: 'x', url: 'pas un lien' }] }).success).toBe(false)
  })

  it('dit NON : un talent_id qui n’est pas un uuid, une offre sans intitulé, une date devinée', () => {
    expect(discoverOriginCriteriaSchema.safeParse({ talent_id: 'camille' }).success).toBe(false)
    expect(discoverOriginCriteriaSchema.safeParse({ offers: [{ title: '' }] }).success).toBe(false)
    expect(discoverOriginCriteriaSchema.safeParse({ offers: [{ title: 'x', date: 'bientôt' }] }).success).toBe(false)
    expect(discoverOriginCriteriaSchema.safeParse({ framed_by: 'discover' }).success).toBe(false)
  })

  it('la provenance ou l’identifiant seuls ne font pas un axe (rien à nommer)', () => {
    expect(isDiscoverOriginCriteriaEmpty({ framed_by: 'laura', talent_id: talent })).toBe(true)
    expect(isDiscoverOriginCriteriaEmpty({ offers: [{ title: 'Dev Java' }] })).toBe(false)
  })

  it('se décrit : la demande en tête, prioritaire, avec les offres datées — et dit qu’aucune n’est écartée', () => {
    const lines = describeDiscoverOriginCriteriaFr(criteria)
    expect(lines[0]).toContain('demande')
    expect(lines[0]).toContain("rien n'est écarté")
    expect(lines).toContain('compétence : Java, Kafka')
    expect(lines).toContain('offres relevées par la recherche : Dev Java Kafka (2026-10-20) ; Architecte SI')
  })

  it('dit NON : sans provenance Laura, la description est celle d’avant', () => {
    expect(describeDiscoverOriginCriteriaFr({ skills: ['Java'] })).toEqual(['compétence : Java'])
  })
})

describe('#4642 — le consultant de la conversation est nommé', () => {
  it('le nom du talent fait une ligne « consultant » dans le cadrage, sans être un axe à lui seul', () => {
    const criteria = discoverOriginCriteriaSchema.parse({
      framed_by: 'laura',
      talent_name: 'Camille Fournier',
      skills: ['Java'],
    })
    expect(describeDiscoverOriginCriteriaFr(criteria)).toContain('consultant : Camille Fournier')
    expect(isDiscoverOriginCriteriaEmpty({ framed_by: 'laura', talent_name: 'Camille Fournier' })).toBe(true)
  })
})

// #4433.9 (RE-RECETTE PROD 26/10) — le palier de zone d'un compte élargi SUIT le compte jusqu'au dossier.
describe('zone_widened (#4433.9)', () => {
  const widened = { tier: 'department', area: 'Nord', place: 'Lille' } as const

  it('accepte un palier structuré et refuse « city » ou une clé inconnue', () => {
    expect(discoverOriginCriteriaSchema.safeParse({ zone_widened: widened }).success).toBe(true)
    expect(discoverOriginCriteriaSchema.safeParse({ zone_widened: { ...widened, tier: 'city' } }).success).toBe(false)
    expect(discoverOriginCriteriaSchema.safeParse({ zone_widened: { ...widened, score: 1 } }).success).toBe(false)
  })

  it('un palier posé est un axe : le critère n’est plus vide', () => {
    expect(isDiscoverOriginCriteriaEmpty({ zone_widened: widened })).toBe(false)
  })

  it('se décrit pour le cadrage : le palier est nommé en toutes lettres', () => {
    expect(describeDiscoverOriginCriteriaFr({ zone_widened: widened })).toEqual(['zone : Élargi au département · Nord'])
    expect(
      describeDiscoverOriginCriteriaFr({ zone_widened: { tier: 'radius_50', distance_km: 38.2, place: 'Lille' } }),
    ).toEqual(['zone : Élargi à 50 km · à 38 km de Lille'])
  })
})
