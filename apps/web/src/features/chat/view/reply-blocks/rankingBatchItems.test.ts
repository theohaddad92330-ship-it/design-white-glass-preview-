import { describe, expect, it } from 'vitest'
import { rankingBatchItems } from './rankingBatchItems'

// #4432.3 — depuis une carte de Laura, les critères de zone voyagent avec le nom (ils devenaient le
// nom seul : un dossier Safran « en Occitanie » partait sur le siège parisien).
describe('rankingBatchItems', () => {
  it('chaque nom part avec son origine Laura et la zone de la recherche', () => {
    expect(rankingBatchItems(['SAFRAN'], { regions: ['Occitanie'] })).toEqual([
      {
        name: 'SAFRAN',
        suggestion_id: 'laura:SAFRAN',
        suggestion_criteria: { zone: 'Occitanie', zone_regions: ['Occitanie'] },
      },
    ])
    expect(rankingBatchItems(['ACME'], { city: 'Toulouse', departments: ['Haute-Garonne'] })[0]).toMatchObject({
      suggestion_criteria: {
        zone: 'Toulouse · Haute-Garonne',
        zone_city: 'Toulouse',
        zone_departments: ['Haute-Garonne'],
      },
    })
  })

  it('dit NON : sans zone cherchée, le nom part seul (analyse nationale)', () => {
    expect(rankingBatchItems(['SAFRAN'], undefined)).toEqual([{ name: 'SAFRAN' }])
    expect(rankingBatchItems(['SAFRAN'], {})).toEqual([{ name: 'SAFRAN' }])
  })
})

// #4642 — depuis « Comptes où placer X », le cadrage (compétences, offres relevées, zone, fiche du talent)
// voyage avec chaque nom. Il PRIORISE côté dossier : rien ne devient un périmètre, rien n'est écarté.
describe('rankingBatchItems — le cadrage de la conversation (#4642)', () => {
  const TALENT = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d'

  it('#4642 — le nom du talent voyage avec sa fiche, et seul il ne fait pas un cadrage', () => {
    const [framed] = rankingBatchItems(['JEMS'], undefined, {
      talentId: TALENT,
      talentName: 'Camille Fournier',
      skills: ['Java'],
    })
    expect(framed?.suggestion_criteria).toMatchObject({ talent_id: TALENT, talent_name: 'Camille Fournier' })
    expect(
      rankingBatchItems(['JEMS'], undefined, { talentId: TALENT, talentName: 'Camille Fournier', skills: [] }),
    ).toEqual([{ name: 'JEMS' }])
  })
  const offers = new Map([['JEMS', [{ title: 'Dev Java Kafka', date: '2026-10-20' }, { title: 'Architecte SI' }]]])
  const framing = { talentId: TALENT, skills: ['Java', 'Kafka'], zone: 'Rhône', offers }

  it('chaque nom part avec la fiche, les compétences, la zone et SES offres', () => {
    expect(rankingBatchItems(['JEMS', 'Alten'], undefined, framing)).toEqual([
      {
        name: 'JEMS',
        suggestion_id: 'laura:JEMS',
        suggestion_criteria: {
          framed_by: 'laura',
          talent_id: TALENT,
          skills: ['Java', 'Kafka'],
          zone: 'Rhône',
          offers: [{ title: 'Dev Java Kafka', date: '2026-10-20' }, { title: 'Architecte SI' }],
        },
      },
      {
        name: 'Alten',
        suggestion_id: 'laura:Alten',
        suggestion_criteria: { framed_by: 'laura', talent_id: TALENT, skills: ['Java', 'Kafka'], zone: 'Rhône' },
      },
    ])
  })

  it('dit NON : la zone du cadrage est un libellé, jamais un périmètre (aucune clé zone_*)', () => {
    const [item] = rankingBatchItems(['JEMS'], undefined, framing)
    const keys = Object.keys(item?.suggestion_criteria ?? {})
    expect(keys.filter(key => key.startsWith('zone_'))).toEqual([])
  })

  it('un axe retiré ne part pas : plus de compétence, plus d’offres, plus de fiche', () => {
    const [item] = rankingBatchItems(['JEMS'], undefined, { skills: [], zone: 'Rhône' })
    expect(item?.suggestion_criteria).toEqual({ framed_by: 'laura', zone: 'Rhône' })
  })

  it('dit NON : tout retiré, le nom part comme avant (jamais un cadrage vide ni une fiche seule)', () => {
    expect(rankingBatchItems(['JEMS'], undefined, { talentId: TALENT, skills: [] })).toEqual([{ name: 'JEMS' }])
    expect(rankingBatchItems(['JEMS'], { regions: ['Occitanie'] }, { talentId: TALENT, skills: [] })).toEqual(
      rankingBatchItems(['JEMS'], { regions: ['Occitanie'] }),
    )
  })

  it('dit NON : sans cadrage (hors conversation), la sortie est celle d’avant, octet pour octet', () => {
    expect(rankingBatchItems(['SAFRAN'], { regions: ['Occitanie'] }, undefined)).toEqual(
      rankingBatchItems(['SAFRAN'], { regions: ['Occitanie'] }),
    )
  })

  it('la zone cherchée (#4432.3) garde sa place de périmètre, le cadrage s’y ajoute sans la remplacer', () => {
    const [item] = rankingBatchItems(['JEMS'], { departments: ['Rhône'] }, { skills: ['Java'], zone: 'Lyon' })
    expect(item?.suggestion_criteria).toMatchObject({
      framed_by: 'laura',
      zone: 'Rhône',
      zone_departments: ['Rhône'],
      skills: ['Java'],
    })
  })
})
