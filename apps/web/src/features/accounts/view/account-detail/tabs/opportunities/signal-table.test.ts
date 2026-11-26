import type { AccountSignalLine } from '@bellum/contracts'
import {
  countsByType,
  filterLines,
  groupClosedEstablishments,
  groupEntitiesSummary,
  groupTableRows,
  proposalForLine,
  lauraSynthesis,
  mostRecurringPeople,
  observedTjmRange,
  outcomeCounts,
  recurringTheme,
} from './signal-table'
import type { ProposableContact } from './signal-contacts'

function line(over: Partial<AccountSignalLine> & Pick<AccountSignalLine, 'id' | 'title'>): AccountSignalLine {
  return {
    date: '2026-10-10',
    date_precision: 'day',
    period: 'now',
    type: 'projet',
    detail: null,
    url: null,
    people_hints: { names: [], roles: [], location: null },
    ...over,
  }
}

describe('signal-table — le modèle du tableau', () => {
  it('compte par type sans jamais poser de « 0 »', () => {
    const counts = countsByType([
      line({ id: 'a', title: 'A', type: 'recrutement' }),
      line({ id: 'b', title: 'B', type: 'recrutement' }),
    ])
    expect([...counts.entries()]).toEqual([['recrutement', 2]])
    expect(counts.has('projet')).toBe(false)
  })

  it('la recherche lit l’intitulé, les technologies et les lignes regroupées, sans accents', () => {
    const lines = [
      line({
        id: 'a',
        title: 'Ingénieur DevOps',
        merged: [{ title: 'Développeur Java', date: '2026-10-01', url: null }],
      }),
      line({ id: 'b', title: 'Data engineer', technologies: ['Python'] }),
    ]
    expect(filterLines(lines, { type: null, query: 'java' }).map(l => l.id)).toEqual(['a'])
    expect(filterLines(lines, { type: null, query: 'ingenieur' }).map(l => l.id)).toEqual(['a'])
    expect(filterLines(lines, { type: null, query: 'python' }).map(l => l.id)).toEqual(['b'])
    expect(filterLines(lines, { type: 'recrutement', query: '' })).toEqual([])
  })

  it('« Qui revient le plus » : trois au plus, par nombre de lignes', () => {
    const c = (id: string, name: string) => ({ id, full_name: name }) as ProposableContact
    const top = mostRecurringPeople(
      new Map([
        ['l1', [c('1', 'Anne'), c('2', 'Bruno')]],
        ['l2', [c('2', 'Bruno')]],
        ['l3', [c('3', 'Chloé'), c('4', 'David')]],
      ]),
    )
    expect(top.map(entry => [entry.contact.full_name, entry.lines])).toEqual([
      ['Bruno', 2],
      ['Anne', 1],
      ['Chloé', 1],
    ])
  })

  it('TJM min–max ; aucun TJM connu = null, jamais « 0 € »', () => {
    expect(
      observedTjmRange([line({ id: 'a', title: 'A', tjm_eur: 550 }), line({ id: 'b', title: 'B', tjm_eur: 700 })]),
    ).toEqual({
      min: 550,
      max: 700,
    })
    expect(observedTjmRange([line({ id: 'a', title: 'A' })])).toBeNull()
  })

  it('issues et thème récurrent — un thème cité une seule fois n’en est pas un', () => {
    const lines = [
      line({ id: 'a', title: 'A', outcome: 'won', technologies: ['Java'] }),
      line({ id: 'b', title: 'B', outcome: 'lost', technologies: ['java', 'SAP'] }),
    ]
    expect(outcomeCounts(lines)).toEqual({ won: 1, lost: 1, none: 0 })
    expect(recurringTheme(lines)).toEqual({ label: 'Java', lines: 2 })
    expect(recurringTheme([lines[0]!])).toBeNull()
  })

  it('la phrase de Laura n’existe pas sans ligne', () => {
    expect(lauraSynthesis([], 'now')).toBeNull()
    expect(lauraSynthesis([line({ id: 'a', title: 'A', lead_id: 'x' })], 'now')).toEqual({
      total: 1,
      topType: null,
      topCount: 0,
      leads: 1,
    })
  })
})

describe('#5031 (lot 763) — les établissements fermés se regroupent, sans rien supprimer', () => {
  const closed = (id: string, date: string) =>
    line({ id, title: 'Établissement fermé', type: 'annonce_legale', period: 'past', date, date_precision: 'year' })

  it('plusieurs « Établissement fermé » = UNE ligne datée de la plus récente, les autres dépliables', () => {
    const lines = [
      line({ id: 'x', title: 'Besoin SAP', period: 'past', date: '2025-01-01' }),
      closed('c1', '2003-01-01'),
      closed('c2', '1998-01-01'),
      closed('c3', '1993-01-01'),
      closed('c4', '2001-01-01'),
    ]
    const rows = groupClosedEstablishments(lines)
    expect(rows).toHaveLength(2)
    const group = rows.find(row => row.closed)
    expect(group?.closed?.members.map(member => member.id)).toEqual(['c1', 'c4', 'c2', 'c3'])
    expect(group?.line.date).toBe('2003-01-01')
    expect(group?.line.title).toBe('Établissement fermé')
  })

  it('une fermeture seule reste une ligne ordinaire ; les autres lignes ne bougent pas', () => {
    const lines = [line({ id: 'x', title: 'Besoin SAP' }), closed('c1', '2003-01-01')]
    const rows = groupClosedEstablishments(lines)
    expect(rows.map(row => row.line.id)).toEqual(['x', 'c1'])
    expect(rows.every(row => !row.closed)).toBe(true)
  })

  it('la recherche et les filtres s’appliquent AVANT le regroupement : rien n’est perdu', () => {
    const rows = groupClosedEstablishments([closed('c1', '2003-01-01'), closed('c2', '1998-01-01')])
    expect(rows.flatMap(row => row.closed?.members ?? [row.line])).toHaveLength(2)
  })
})

describe('#5031 (lot 763) — proposalForLine remonte la raison de chaque contact', () => {
  const jeanne = { id: 'c1', full_name: 'Jeanne Martin', title: 'Responsable développement Java' } as never

  it('la personne que la ligne nomme par identifiant garde la raison « named »', () => {
    const result = proposalForLine({
      line: line({ id: 'a', title: 'Fait', contact_ids: ['c1'] }),
      contacts: [jeanne],
      perimeter: undefined,
    })
    expect(result.people.map(p => p.id)).toEqual(['c1'])
    expect(result.reasons.get('c1')).toEqual({ kind: 'named' })
  })

  it('un métier en commun donne « craft » ; personne ne recoupe ⇒ aucune raison, aucun contact', () => {
    const craft = proposalForLine({
      line: line({ id: 'a', title: 'Développeur Java back-end', type: 'recrutement' }),
      contacts: [jeanne],
      perimeter: undefined,
    })
    expect(craft.reasons.get('c1')?.kind).toBe('craft')
    const none = proposalForLine({
      line: line({ id: 'b', title: 'Augmentation de capital' }),
      contacts: [jeanne],
      perimeter: undefined,
    })
    expect(none.people).toEqual([])
    expect(none.reasons.size).toBe(0)
  })
})

describe('#5065 (lot 766) — proposalForLine exclut le nom du compte des raisons', () => {
  it('Viveris / Secteur / Lyon ne produisent jamais « craft »', () => {
    const contact = {
      id: 'c9',
      full_name: 'Luc Roy',
      title: 'Directeur Viveris Secteur Lyon',
      location: 'Lyon',
    } as never
    const result = proposalForLine({
      line: line({ id: 'z', title: 'Viveris — offre secteur industrie à Lyon', type: 'recrutement' }),
      contacts: [contact],
      perimeter: undefined,
      accountName: 'Viveris',
    })
    expect([...result.reasons.values()].some(reason => reason.kind === 'craft')).toBe(false)
  })
})

describe('#5065 (lot 766) — les dépôts de comptes se regroupent par le MÊME mécanisme', () => {
  const accounts = (id: string, date: string) =>
    line({
      id,
      title: 'Comptes annuels et rapports',
      type: 'annonce_legale',
      period: 'past',
      date,
      date_precision: 'year',
    })

  it('plusieurs « Comptes annuels et rapports » = UNE ligne « dépôts de comptes », datée de la plus récente', () => {
    const rows = groupClosedEstablishments([
      accounts('a1', '2021-06-01'),
      line({ id: 'x', title: 'Besoin SAP', period: 'past', date: '2025-01-01' }),
      accounts('a2', '2024-06-01'),
      accounts('a3', '2022-06-01'),
    ])
    expect(rows).toHaveLength(2)
    const group = rows.find(row => row.closed)
    expect(group?.closed?.kind).toBe('accounts')
    expect(group?.closed?.members.map(member => member.id)).toEqual(['a2', 'a3', 'a1'])
    expect(group?.line.date).toBe('2024-06-01')
  })

  it('un dépôt seul reste ordinaire ; fermés et dépôts forment deux groupes distincts, rien n’est supprimé', () => {
    const closed = (id: string) =>
      line({ id, title: 'Établissement fermé', type: 'annonce_legale', period: 'past', date: '2003-01-01' })
    const rows = groupClosedEstablishments([accounts('a1', '2021-06-01'), closed('c1'), closed('c2')])
    expect(rows.map(row => row.closed?.kind ?? 'line')).toEqual(['line', 'closed'])
    const all = groupClosedEstablishments([
      accounts('a1', '2021-06-01'),
      accounts('a2', '2022-06-01'),
      closed('c1'),
      closed('c2'),
    ])
    expect(all.flatMap(row => row.closed?.members ?? [row.line])).toHaveLength(4)
  })
})

describe('lot 768 — le prescripteur d’un besoin passé passe en tête (« a porté ce besoin »)', () => {
  const lea = { id: 'c-lea', full_name: 'Léa Martin', title: 'Directrice des opérations' } as never
  const paul = { id: 'c-paul', full_name: 'Paul Roy', title: 'Responsable Power BI' } as never
  const past = (names: string[]) =>
    line({
      id: 'p',
      title: 'Consultant Power BI',
      type: 'besoin_passe',
      period: 'past',
      people_hints: { names, roles: [], location: null },
    })

  it('un prescripteur qui est un contact du compte vient en premier, raison « carried »', () => {
    const result = proposalForLine({ line: past(['Léa Martin']), contacts: [paul, lea], perimeter: undefined })
    // Une personne LIÉE au fait écarte les simples « même métier » (la règle de l'onglet, inchangée).
    expect(result.people.map(p => p.id)).toEqual(['c-lea'])
    expect(result.reasons.get('c-lea')).toEqual({ kind: 'carried' })
  })

  it('un prescripteur absent des contacts du compte ne crée personne ; rapprochement par le nom ENTIER', () => {
    expect(proposalForLine({ line: past(['Léa']), contacts: [lea], perimeter: undefined }).people).toEqual([])
    const unknown = proposalForLine({ line: past(['Zoé Inconnue']), contacts: [paul], perimeter: undefined })
    expect(unknown.people.map(p => p.id)).toEqual(['c-paul'])
    expect(unknown.reasons.get('c-paul')?.kind).toBe('craft')
  })

  it('le métier ou le lieu commun ne LIE personne : jamais « carried » sans le nom', () => {
    const result = proposalForLine({ line: past([]), contacts: [paul], perimeter: undefined })
    expect([...result.reasons.values()].some(reason => reason.kind === 'carried')).toBe(false)
  })
})

describe('lot 772 (a) — un besoin passé reformulé par l’analyse recoupe un contact du compte', () => {
  it('« Une offre de Product Owner a été publiée à Paris » + « Head of Product, Paris » ⇒ proposé, avec sa raison', () => {
    const contact = {
      id: 'c1',
      full_name: 'Alice Durand',
      title: 'Head of Product',
      location: 'Paris, France',
    } as never
    const result = proposalForLine({
      line: line({
        id: 'p1',
        title: 'Une offre de Product Owner a été publiée à Paris.',
        type: 'recrutement',
        period: 'past',
        people_hints: { names: [], roles: [], location: 'Paris' },
      }),
      contacts: [contact],
      perimeter: undefined,
      accountName: 'Thales',
    })
    expect(result.people.map(person => person.id)).toEqual(['c1'])
    expect(result.reasons.get('c1')?.kind).toBe('craft')
  })
})

describe('lot 773 c) — groupTableRows : établissements fermés ET reformulations, un seul modèle', () => {
  const pangea = [
    line({ id: 'a', title: 'TotalEnergies a annoncé un contrat avec Dell Technologies et NVIDIA pour Pangea 5' }),
    line({ id: 'b', title: 'Signature d’un contrat pour le calcul Pangea 5' }),
    line({ id: 'c', title: 'Signature du contrat Pangea 5 avec Dell' }),
  ]

  it('3 phrases Pangea 5 → 1 ligne ×3, les 3 formulations gardées', () => {
    const rows = groupTableRows(pangea, 'TotalEnergies')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.reformulations?.map(member => member.id)).toEqual(['a', 'b', 'c'])
  })

  it('deux vrais besoins différents du même mois restent 2 lignes, sans « ×N »', () => {
    const rows = groupTableRows(
      [
        line({ id: 'x', title: 'Migration SI vers Azure Raffinage' }),
        line({ id: 'y', title: 'Refonte portail Clients Mobilité' }),
      ],
      'TotalEnergies',
    )
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.reformulations === undefined)).toBe(true)
  })
})

describe('lot 773 e) — « N besoins sur M entités du groupe »', () => {
  const shared = (id: string, entity?: string) =>
    line({ id, title: `Besoin ${id}`, type: 'besoin_passe', origin_kind: 'memoire', period: 'past', entity })

  it('compte les besoins de la base commune et les entités (celle du compte comprise) quand le groupe en couvre plusieurs', () => {
    expect(
      groupEntitiesSummary([
        shared('a'),
        shared('b', 'Martin Sud'),
        shared('c', 'Martin Sud'),
        shared('d', 'Martin Nord'),
      ]),
    ).toEqual({
      needs: 4,
      entities: 3,
    })
  })

  it('aucune entité différente du compte ⇒ aucune phrase (jamais « 1 entité du groupe »)', () => {
    expect(groupEntitiesSummary([shared('a'), shared('b')])).toBeNull()
    expect(groupEntitiesSummary([])).toBeNull()
  })
})
