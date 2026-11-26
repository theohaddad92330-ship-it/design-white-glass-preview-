import { describe, expect, it } from 'vitest'
import type { CommercialBrief } from '../schemas/commercial-brief.js'
import { commercialBriefSchema } from '../schemas/commercial-brief.js'
import bpce from './bpce.fixture.json' with { type: 'json' }
import { checkCommercialBrief, OWN_PERFORMANCE_LEXICON } from './controls.js'
import type { BriefViolationCode } from './controls.js'

const base = (): CommercialBrief => commercialBriefSchema.parse(structuredClone(bpce))
const codes = (brief: CommercialBrief): BriefViolationCode[] => checkCommercialBrief(brief).map(v => v.code)
/** Un brief construit en code (seeder, pipeline) avant tout parse : le contrôle
 *  doit tenir même quand le schéma n'est pas passé. */
const unparsed = (value: unknown): CommercialBrief => value as CommercialBrief

describe('checkCommercialBrief — le brief BPCE minimal', () => {
  it('est VERT : aucune violation', () => {
    expect(checkCommercialBrief(base())).toEqual([])
  })

  it('« Strasbourg siège » est ROUGE : HQ_CONTRADICTED (incident BPCE)', () => {
    const brief = base()
    brief.headquarters = { label: 'BPCE', city: 'Strasbourg' }
    const violations = checkCommercialBrief(brief)
    expect(violations.map(v => v.code)).toContain('HQ_CONTRADICTED')
    expect(violations.find(v => v.code === 'HQ_CONTRADICTED')?.path).toBe('sites[0].city')
  })

  it('« Strasbourg » recopié comme site siège à côté de Paris est ROUGE', () => {
    const brief = base()
    brief.sites[1] = { ...brief.sites[1]!, kind: 'headquarters' }
    expect(codes(brief)).toContain('HQ_CONTRADICTED')
  })
})

describe('NOT_FRANCE', () => {
  it('un site hors de France est rouge', () => {
    const brief = base()
    brief.sites.push({ name: 'Bureau Londres', city: 'London', country: 'GB', kind: 'other' })
    expect(checkCommercialBrief(brief)).toContainEqual(
      expect.objectContaining({ code: 'NOT_FRANCE', path: 'sites[2].country' }),
    )
  })

  it('une entité déclarée hors de France est rouge', () => {
    const brief = base()
    brief.entities.push({ name: 'Natixis UK', status: 'active', country: 'GB' })
    expect(codes(brief)).toContain('NOT_FRANCE')
  })

  it('un site et une entité en France ne le sont pas', () => {
    expect(codes(base())).not.toContain('NOT_FRANCE')
  })
})

describe('NOT_SWITZERLAND (périmètre « suisse », ABB — démo clients 04/10/2026)', () => {
  const swiss = (): CommercialBrief => ({
    ...base(),
    scope: 'suisse',
    headquarters: { label: 'Zurich', city: 'Zurich' },
    sites: [{ name: 'Zurich Cityport', city: 'Zurich', country: 'CH', kind: 'headquarters' }],
    entities: [{ name: 'ABB Schweiz AG', status: 'active', country: 'CH' }],
  })

  it('un brief suisse avec des sites et entités en Suisse est vert', () => {
    expect(codes(swiss())).not.toContain('NOT_SWITZERLAND')
    expect(codes(swiss())).not.toContain('NOT_FRANCE')
  })

  it('un site français dans un brief suisse est rouge', () => {
    const brief = swiss()
    brief.sites.push({ name: 'Annecy', city: 'Annecy', country: 'FR', kind: 'other' })
    expect(checkCommercialBrief(brief)).toContainEqual(
      expect.objectContaining({ code: 'NOT_SWITZERLAND', path: 'sites[1].country' }),
    )
  })

  it('une entité hors de Suisse est rouge dans un brief suisse', () => {
    const brief = swiss()
    brief.entities.push({ name: 'Høglund', status: 'active', country: 'NO' })
    expect(codes(brief)).toContain('NOT_SWITZERLAND')
  })

  it('un site suisse dans un brief FRANCE reste rouge (NOT_FRANCE inchangé)', () => {
    const brief = { ...swiss(), scope: 'france' as const }
    expect(codes(brief)).toContain('NOT_FRANCE')
  })
})

describe('HQ_MISSING', () => {
  it('un siège sans ville est rouge', () => {
    const brief = unparsed({ ...base(), headquarters: { label: 'Tours Duo', city: ' ' } })
    expect(codes(brief)).toContain('HQ_MISSING')
  })

  it('un siège absent est rouge', () => {
    const { headquarters: _hq, ...rest } = base()
    expect(codes(unparsed(rest))).toContain('HQ_MISSING')
  })

  it('un siège nommé et situé ne l’est pas', () => {
    expect(codes(base())).not.toContain('HQ_MISSING')
  })
})

describe('HQ_CONTRADICTED', () => {
  it('deux sites sièges sont rouges', () => {
    const brief = base()
    brief.sites.push({ name: 'Autre siège', city: 'Paris', country: 'FR', kind: 'headquarters' })
    expect(codes(brief)).toContain('HQ_CONTRADICTED')
  })

  it('n’attrape pas une graphie différente de la même ville (casse, accents, arrondissement)', () => {
    const brief = base()
    brief.sites[0] = { ...brief.sites[0]!, city: 'PARIS 13e' }
    expect(codes(brief)).not.toContain('HQ_CONTRADICTED')
  })

  it('n’attrape pas un site secondaire situé dans une autre ville', () => {
    expect(codes(base())).not.toContain('HQ_CONTRADICTED')
  })
})

describe('EXITED_ENTITY_UNMARKED', () => {
  it('une personne d’une entité sortie sans `exited` est rouge (casse et accents ignorés)', () => {
    const brief = base()
    brief.people.push({ name: 'Ex Salarié', entity: 'ANCIENNE filiale' })
    expect(checkCommercialBrief(brief)).toContainEqual(
      expect.objectContaining({ code: 'EXITED_ENTITY_UNMARKED', path: 'people[1].entity' }),
    )
  })

  it('une ligne de section d’une entité sortie sans `exited: true` est rouge', () => {
    const brief = base()
    brief.sections[0]!.rows.push({ name: 'Projet cédé', entity: 'Ancienne Filiale' })
    expect(codes(brief)).toContain('EXITED_ENTITY_UNMARKED')
  })

  it('une personne ou une ligne marquée `exited` ne l’est pas', () => {
    const brief = base()
    brief.people.push({ name: 'Ex Salarié', entity: 'Ancienne Filiale', exited: true })
    brief.sections[0]!.rows.push({ name: 'Projet cédé', entity: 'Ancienne Filiale', exited: true })
    expect(codes(brief)).not.toContain('EXITED_ENTITY_UNMARKED')
  })

  it('une personne d’une entité ACTIVE n’est pas visée', () => {
    expect(codes(base())).not.toContain('EXITED_ENTITY_UNMARKED')
  })
})

describe('PRICE_CHANNEL_MISSING', () => {
  it('un prix sans canal (brief non parsé) est rouge', () => {
    const brief = base()
    const prices = [{ label: 'Dev', amount_eur_per_day: 600 }]
    expect(codes(unparsed({ ...brief, prices }))).toContain('PRICE_CHANNEL_MISSING')
  })

  it('un canal « mixed » inventé est rouge', () => {
    const prices = [{ label: 'Dev', amount_eur_per_day: 600, channel: 'mixed' }]
    expect(codes(unparsed({ ...base(), prices }))).toContain('PRICE_CHANNEL_MISSING')
  })

  it('un prix avec son canal ne l’est pas', () => {
    expect(codes(base())).not.toContain('PRICE_CHANNEL_MISSING')
  })
})

describe('PRICE_AVERAGED', () => {
  it('un KPI « TJM moyen » est rouge', () => {
    const brief = base()
    brief.kpis.push({ label: 'TJM moyen', value: 640 })
    expect(codes(brief)).toContain('PRICE_AVERAGED')
  })

  it('un graphique « Average day rate (all channels) » est rouge', () => {
    const brief = base()
    brief.charts.push({ title: 'Average day rate (all channels)', items: [] })
    expect(codes(brief)).toContain('PRICE_AVERAGED')
  })

  it('une ligne de prix « prix moyen inter-canaux » est rouge', () => {
    const brief = base()
    brief.prices.push({ label: 'Prix moyen inter-canaux', amount_eur_per_day: 610, channel: 'direct' })
    expect(codes(brief)).toContain('PRICE_AVERAGED')
  })

  it('n’attrape ni un prix par canal ni une moyenne qui n’est pas un prix', () => {
    const brief = base()
    brief.kpis.push({ label: 'Effectif moyen par site', value: 300 })
    brief.charts.push({ title: 'TJM par canal', items: [{ label: 'direct', value: 650 }] })
    expect(codes(brief)).not.toContain('PRICE_AVERAGED')
  })
})

describe('ESN_EVIDENCE_MISSING', () => {
  it('une ESN sans preuve est rouge', () => {
    const esn = [{ name: 'ESN X', evidence_level: 'hint', proof: '  ' }]
    expect(codes(unparsed({ ...base(), esn }))).toContain('ESN_EVIDENCE_MISSING')
  })

  it('une ESN sans niveau de preuve est rouge', () => {
    const esn = [{ name: 'ESN X', proof: 'offre publiée' }]
    expect(codes(unparsed({ ...base(), esn }))).toContain('ESN_EVIDENCE_MISSING')
  })

  it('une ESN prouvée ne l’est pas', () => {
    expect(codes(base())).not.toContain('ESN_EVIDENCE_MISSING')
  })
})

describe('OWN_PERFORMANCE', () => {
  it('une colonne « Statut relation » est rouge', () => {
    const brief = base()
    brief.sections.push({
      key: 'contacts',
      title: 'Contacts',
      columns: [{ key: 'relation', label: 'Statut relation' }],
      rows: [],
    })
    expect(checkCommercialBrief(brief)).toContainEqual(
      expect.objectContaining({ code: 'OWN_PERFORMANCE', path: 'sections[1].columns[0].label' }),
    )
  })

  it('une cellule « Faux numéro » est rouge', () => {
    const brief = base()
    brief.sections[0]!.rows.push({ name: 'Appel', status: 'Faux numéro' })
    expect(codes(brief)).toContain('OWN_PERFORMANCE')
  })

  it('un KPI anglais « Reply rate » est rouge', () => {
    const brief = base()
    brief.kpis.push({ label: 'Reply rate', value: '12 %' })
    expect(codes(brief)).toContain('OWN_PERFORMANCE')
  })

  it('n’attrape pas un statut de projet, ni un garde-fou qui NOMME l’interdit', () => {
    const brief = base()
    brief.guardrails.push({ point: 'Pas de taux de réponse', detail: 'Le brief ne montre jamais nos relances.' })
    expect(codes(brief)).not.toContain('OWN_PERFORMANCE')
  })

  it('le lexique couvre le français ET l’anglais', () => {
    expect(OWN_PERFORMANCE_LEXICON).toEqual(expect.arrayContaining(['taux de reponse', 'response rate']))
  })
})

describe('MEANING_MISSING', () => {
  it('un « ce que ça veut dire » recopié de « ce qu’on sait » est rouge', () => {
    const brief = base()
    brief.what_i_know.push({ rubric: 'STRUCTURE', known: 'Deux réseaux.', meaning: 'deux reseaux' })
    expect(checkCommercialBrief(brief)).toContainEqual(
      expect.objectContaining({ code: 'MEANING_MISSING', path: 'what_i_know[1].meaning' }),
    )
  })

  it('un « ce que ça veut dire » vide est rouge', () => {
    const what_i_know = [{ rubric: 'IDENTITÉ', known: 'Siège à Paris.', meaning: '' }]
    expect(codes(unparsed({ ...base(), what_i_know }))).toContain('MEANING_MISSING')
  })

  it('une interprétation distincte ne l’est pas', () => {
    expect(codes(base())).not.toContain('MEANING_MISSING')
  })
})

describe('GUARDRAILS_MISSING', () => {
  it('un brief sans garde-fou est rouge', () => {
    expect(codes(unparsed({ ...base(), guardrails: [] }))).toContain('GUARDRAILS_MISSING')
  })

  it('un garde-fou vide est rouge', () => {
    expect(codes(unparsed({ ...base(), guardrails: [{ point: '', detail: ' ' }] }))).toContain('GUARDRAILS_MISSING')
  })

  it('un brief avec garde-fou ne l’est pas', () => {
    expect(codes(base())).not.toContain('GUARDRAILS_MISSING')
  })
})
