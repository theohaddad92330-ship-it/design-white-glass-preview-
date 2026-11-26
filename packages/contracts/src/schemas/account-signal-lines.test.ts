import { describe, expect, it } from 'vitest'
import {
  SIGNAL_LINE_CURRENT_DAYS,
  SIGNAL_LINE_TYPES,
  isNeedLineType,
  accountSignalLineSchema,
  accountSignalLinesSchema,
  groupSignalReformulations,
  mergeSignalLineCandidates,
  workspaceSignalHistorySchema,
  signalLinePeriod,
  toSignalLineDate,
  type SignalLineCandidate,
} from './account-signal-lines.js'

const NOW = new Date('2026-10-31T12:00:00Z')

function candidate(over: Partial<SignalLineCandidate> & Pick<SignalLineCandidate, 'key'>): SignalLineCandidate {
  return { type: 'projet', rawDate: '2026-10-01', title: 'Programme cloud', ...over }
}

describe('toSignalLineDate — la précision que la source porte, jamais plus', () => {
  it('lit le jour, le mois, l’année', () => {
    expect(toSignalLineDate('2026-10-24')).toMatchObject({ date: '2026-10-24', precision: 'day' })
    expect(toSignalLineDate('mars 2025')).toMatchObject({ date: '2025-03-01', precision: 'month' })
    expect(toSignalLineDate('2024')).toMatchObject({ date: '2024-01-01', precision: 'year' })
    expect(toSignalLineDate(new Date('2026-09-12T08:00:00Z'))).toMatchObject({ date: '2026-09-12', precision: 'day' })
  })

  it('dit NON à une date absente, illisible ou relative à une ancre inconnue', () => {
    for (const raw of [null, undefined, '', 'Non daté précisément', 'il y a 3 jours', new Date('x')]) {
      expect(toSignalLineDate(raw)).toBeNull()
    }
  })
})

describe('signalLinePeriod — une frontière, 180 jours, sur la FIN de la période', () => {
  it('sépare Actuel et Historique', () => {
    const day = 86_400_000
    expect(SIGNAL_LINE_CURRENT_DAYS).toBe(180)
    expect(signalLinePeriod(NOW.getTime() - 179 * day, NOW)).toBe('now')
    expect(signalLinePeriod(NOW.getTime() - 181 * day, NOW)).toBe('past')
  })

  it('un mois n’est pas vieilli à son premier jour', () => {
    // mai 2026 se termine le 31/05, soit 153 jours avant le 31/10 : Actuel.
    const may = toSignalLineDate('2026-05')!
    expect(signalLinePeriod(may.endMs, NOW)).toBe('now')
  })
})

describe('mergeSignalLineCandidates — les lignes du tableau', () => {
  it('une ligne sans date ou sans intitulé n’existe pas', () => {
    const lines = mergeSignalLineCandidates(
      [
        candidate({ key: 'a', rawDate: null }),
        candidate({ key: 'b', title: '   ' }),
        candidate({ key: 'c', rawDate: 'Non daté' }),
        candidate({ key: 'd' }),
      ],
      NOW,
    )
    expect(lines.map(line => line.id)).toEqual(['d'])
  })

  it('lot 794 — sans date du fait mais VUE à une date (observedAt) : la ligne reste, en Historique, à l’année', () => {
    const lines = mergeSignalLineCandidates(
      [
        candidate({ key: 'v2:seen', rawDate: null, observedAt: new Date('2026-10-20T00:00:00Z'), title: 'Poste Java' }),
        candidate({ key: 'v2:dated', rawDate: '2026-10-02', observedAt: new Date('2026-10-20T00:00:00Z') }),
        candidate({ key: 'v2:none', rawDate: null, observedAt: null, title: 'Jamais vu' }),
      ],
      NOW,
    )
    const seen = lines.find(line => line.id === 'v2:seen')
    expect(seen).toMatchObject({ period: 'past', date: '2026-01-01', date_precision: 'year' })
    expect(accountSignalLineSchema.parse(seen)).toBeTruthy()
    // La date du FAIT, quand elle se lit, gagne toujours sur la date où la source a été vue.
    expect(lines.find(line => line.id === 'v2:dated')).toMatchObject({ period: 'now', date: '2026-10-02' })
    expect(lines.map(line => line.id)).not.toContain('v2:none')
  })

  it('range chaque ligne dans sa période, les plus récentes d’abord, sans coupe', () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      candidate({
        key: `old-${index}`,
        title: `Besoin ${index} distinct${index}`,
        rawDate: `${2000 + (index % 20)}-02-0${(index % 9) + 1}`,
      }),
    )
    const lines = mergeSignalLineCandidates([candidate({ key: 'new', rawDate: '2026-10-20' }), ...many], NOW)
    expect(lines[0]).toMatchObject({ id: 'new', period: 'now' })
    expect(lines.filter(line => line.period === 'past')).toHaveLength(60)
  })

  it('fusionne les offres de la même équipe le même mois en UNE ligne dépliable', () => {
    const lines = mergeSignalLineCandidates(
      [
        candidate({
          key: 'o1',
          type: 'recrutement',
          title: 'Développeur Java back-end',
          rawDate: '2026-10-05',
          team: 'Paiements',
        }),
        candidate({
          key: 'o2',
          type: 'recrutement',
          title: 'Ingénieur DevOps',
          rawDate: '2026-10-12',
          team: 'paiements',
          url: 'https://x/o2',
        }),
        candidate({
          key: 'o3',
          type: 'recrutement',
          title: 'Ingénieur DevOps',
          rawDate: '2026-09-12',
          team: 'Paiements',
        }),
      ],
      NOW,
    )
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ id: 'o2', merged: [{ title: 'Développeur Java back-end', date: '2026-10-05' }] })
    // Une autre équipe, ou un autre mois : jamais fusionnée.
    expect(lines[1]!.merged).toBeUndefined()
  })

  it('le même sujet lu dans deux familles = UNE ligne qui garde ce que chacune savait', () => {
    const lines = mergeSignalLineCandidates(
      [
        candidate({ key: 'bellum', title: 'Centre de services data', rawDate: '2025-10-20', type: 'besoin_passe' }),
        candidate({
          key: 'crm',
          title: 'Centre de services Data',
          rawDate: '2025-10-18',
          type: 'affaire',
          outcome: 'won',
        }),
        candidate({ key: 'df', title: 'Centre de services data', rawDate: '2025-10-01', tjmEur: 650, roles: ['DSI'] }),
      ],
      NOW,
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ period: 'past', outcome: 'won', tjm_eur: 650, people_hints: { roles: ['DSI'] } })
    expect(lines[0]!.merged).toBeUndefined()
  })

  it('le même intitulé à deux ans d’écart reste deux faits', () => {
    const lines = mergeSignalLineCandidates(
      [
        candidate({ key: 'a', title: 'Tech lead Java', rawDate: '2026-10-01', type: 'recrutement' }),
        candidate({ key: 'b', title: 'Tech lead Java', rawDate: '2024-10-01', type: 'recrutement' }),
      ],
      NOW,
    )
    expect(lines.map(line => [line.id, line.period])).toEqual([
      ['a', 'now'],
      ['b', 'past'],
    ])
  })

  it('un TJM absent ou nul reste ABSENT, jamais 0', () => {
    const [line] = mergeSignalLineCandidates([candidate({ key: 'a', tjmEur: 0 })], NOW)
    expect(line).not.toHaveProperty('tjm_eur')
  })

  it('chaque ligne passe le schéma strict — aucun champ « source »', () => {
    const lines = mergeSignalLineCandidates(
      [
        candidate({
          key: 'a',
          leadId: 'lead-1',
          contactIds: ['c1', null],
          names: ['Jeanne Martin'],
          location: 'Lille',
        }),
      ],
      NOW,
    )
    expect(accountSignalLinesSchema.parse({ lines, verified_at: null, open_deals: 0 }).lines).toHaveLength(1)
    expect(() => accountSignalLineSchema.parse({ ...lines[0], source: 'DataForge' })).toThrow()
  })

  it('#5010.1 — le site d’emploi d’origine se nomme (hôte de l’URL, liste fermée) ; un hôte inconnu ne dit rien', () => {
    const lines = mergeSignalLineCandidates(
      [
        candidate({ key: 'a', type: 'recrutement', title: 'Data engineer', url: 'https://fr.indeed.com/viewjob?jk=1' }),
        candidate({
          key: 'b',
          type: 'recrutement',
          title: 'Chef de projet',
          rawDate: '2026-08-01',
          url: 'https://x.example/b',
        }),
      ],
      NOW,
    )
    expect(lines[0]!.origin).toBe('Indeed')
    expect(lines[1]).not.toHaveProperty('origin')
    expect(accountSignalLineSchema.parse(lines[0]).origin).toBe('Indeed')
  })

  it('#5010 — sans hôte connu, le job board collecté nomme le site (liste fermée)', () => {
    const lines = mergeSignalLineCandidates(
      [
        candidate({
          key: 'a',
          type: 'recrutement',
          title: 'Data engineer',
          url: 'https://agg.example/r/1',
          board: 'linkedin',
        }),
      ],
      NOW,
    )
    expect(lines[0]!.origin).toBe('LinkedIn')
  })

  it('#5005.1 — une ligne-résumé « N offres » LISTE les postes du mois (intitulé, ville), sans se répéter', () => {
    const lines = mergeSignalLineCandidates(
      [
        candidate({
          key: 's',
          type: 'recrutement',
          title: 'Vingt offres récentes couvrent la data',
          rawDate: '2026-10-01',
        }),
        candidate({ key: 'p1', type: 'recrutement', title: 'Data engineer', rawDate: '2026-10-03', location: 'Lille' }),
        candidate({
          key: 'p2',
          type: 'recrutement',
          title: 'Architecte cloud',
          rawDate: '2026-10-09',
          location: 'Paris',
        }),
        candidate({
          key: 'p3',
          type: 'recrutement',
          title: 'Data engineer',
          rawDate: '2026-09-03',
          location: 'Nantes',
        }),
      ],
      NOW,
    )
    const summary = lines.find(line => line.id === 's')!
    expect(summary.merged?.map(row => row.title).sort()).toEqual(['Architecte cloud', 'Data engineer'])
    expect(summary.merged?.find(row => row.title === 'Architecte cloud')?.location).toBe('Paris')
    expect(summary.merged?.some(row => row.title === summary.title)).toBe(false)
    // Le poste d’un autre mois reste sa propre ligne.
    expect(lines.map(line => line.id).sort()).toEqual(['p3', 's'])
  })

  it('#5005.1 — un doublon au même intitulé que la ligne mère ne fait pas une « ligne regroupée »', () => {
    const lines = mergeSignalLineCandidates(
      [
        candidate({
          key: 'a',
          type: 'recrutement',
          title: 'Vingt offres récentes',
          rawDate: '2026-10-01',
          team: 'Data',
        }),
        candidate({
          key: 'b',
          type: 'recrutement',
          title: 'Vingt offres récentes',
          rawDate: '2026-10-20',
          team: 'Data',
        }),
      ],
      NOW,
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]!.merged).toBeUndefined()
  })
})

describe('lot 767 — besoin ou fait', () => {
  it('seuls recrutement, marché public, projet, besoin passé et affaire sont des BESOINS', () => {
    expect(SIGNAL_LINE_TYPES).toContain('fait')
    expect(SIGNAL_LINE_TYPES.filter(isNeedLineType)).toEqual([
      'recrutement',
      'projet',
      'marche_public',
      'affaire',
      'besoin_passe',
    ])
    expect(isNeedLineType('annonce_legale')).toBe(false)
    expect(isNeedLineType('equipe')).toBe(false)
    expect(isNeedLineType('fait')).toBe(false)
  })

  it('cinq descriptions d’entreprise du même jour, le nom de la société retiré = UNE ligne (la plus riche)', () => {
    const base = { type: 'fait' as const, rawDate: '2025-11-27' }
    const lines = mergeSignalLineCandidates(
      [
        { ...base, key: 'a', title: 'SEMA FRANCE est active, sous forme d’EURL, depuis 2011' },
        { ...base, key: 'b', title: 'La société est active, sous forme d’EURL, depuis 2011.' },
        {
          ...base,
          key: 'c',
          title: 'Sema France : active sous forme d’EURL depuis 2011',
          detail: 'Immatriculée au RCS',
        },
        { ...base, key: 'd', title: 'Société active, forme EURL, depuis 2011' },
        { ...base, key: 'e', title: 'Active — EURL depuis 2011 (SEMA FRANCE)' },
      ],
      NOW,
      { companyName: 'SEMA FRANCE' },
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]!.detail).toBe('Immatriculée au RCS')
  })

  it('deux faits de jours différents, ou de types différents, restent deux lignes', () => {
    const title = 'Changement de dirigeant enregistré'
    const lines = mergeSignalLineCandidates(
      [
        { key: 'a', type: 'fait', rawDate: '2025-11-27', title },
        { key: 'b', type: 'fait', rawDate: '2025-11-28', title },
        { key: 'c', type: 'annonce_legale', rawDate: '2025-11-27', title: 'Dépôt des comptes annuels 2024' },
      ],
      NOW,
      { companyName: 'SEMA FRANCE' },
    )
    expect(lines).toHaveLength(3)
  })
})

describe('lot 768 — contacts proposables de l’Historique', () => {
  const line = {
    id: 'l1',
    date: '2025-05-01',
    date_precision: 'day',
    period: 'past',
    type: 'recrutement',
    title: 'Product Owner',
    detail: null,
    url: null,
    people_hints: { names: [], roles: [], location: null },
  }
  const history = (contact: Record<string, unknown>) => ({
    accounts: [
      {
        account_id: 'a1',
        company_name: 'Acme',
        sector: null,
        logo_url: null,
        website: null,
        lines: [line],
        contacts: [contact],
      },
    ],
  })
  const contact = {
    id: 'c1',
    full_name: 'Léa Martin',
    title: 'Directrice data',
    location: 'Lyon',
    place: null,
    email_verified: true,
  }

  it('porte le minimum : nom, poste, lieu, e’mail vérifié oui/non', () => {
    expect(workspaceSignalHistorySchema.safeParse(history(contact)).success).toBe(true)
  })

  it('dit NON à l’adresse e-mail elle-même et à tout champ en plus', () => {
    expect(workspaceSignalHistorySchema.safeParse(history({ ...contact, email: 'lea@acme.fr' })).success).toBe(false)
    expect(workspaceSignalHistorySchema.safeParse(history({ ...contact, photo_url: 'x' })).success).toBe(false)
  })

  it('un compte sans clé `contacts` reste valide (lecture antérieure)', () => {
    const { contacts: _omit, ...account } = history(contact).accounts[0]!
    expect(workspaceSignalHistorySchema.safeParse({ accounts: [account] }).success).toBe(true)
  })
})

describe('lot 771 — un même fait lu à deux précisions, et la source générique', () => {
  const NOW = new Date('2026-10-31T12:00:00Z')
  const fact = (key: string, rawDate: string): SignalLineCandidate => ({
    key,
    type: 'fait',
    rawDate,
    title: 'Changement de dirigeant enregistré pour SEMA FRANCE',
  })

  it('le jour et le mois du même fait = UNE ligne ; deux jours différents = deux faits', () => {
    expect(mergeSignalLineCandidates([fact('a', '2026-05-12'), fact('b', '2026-05')], NOW)).toHaveLength(1)
    expect(mergeSignalLineCandidates([fact('a', '2026-05-12'), fact('b', '2026-05-20')], NOW)).toHaveLength(2)
  })

  it('l’origine générique voyage, la première renseignée gagne ; hors énumération = refus', () => {
    const [line] = mergeSignalLineCandidates(
      [
        { ...fact('a', '2026-05-12'), origin: 'annonce' },
        { ...fact('b', '2026-05-12'), origin: 'analyse' },
      ],
      NOW,
    )
    expect(line?.origin_kind).toBe('annonce')
    expect(accountSignalLineSchema.safeParse({ ...line, origin_kind: 'hubspot.com' }).success).toBe(false)
  })
})

describe('lot 772 e) — la fusion compare une ligne aux seules têtes de son mois, sur un compte à milliers de lignes', () => {
  it('même intitulé le même mois = une ligne ; le même intitulé un autre mois = une autre ; au milieu de 3 000 autres offres', () => {
    const filler = Array.from({ length: 3000 }, (_, i) => ({
      key: `f${i}`,
      type: 'recrutement' as const,
      rawDate: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
      title: `Poste distinct numero ${i} zone ${i * 7919}`,
    }))
    const lines = mergeSignalLineCandidates(
      [
        ...filler,
        { key: 'a1', type: 'recrutement', rawDate: '2026-06-10', title: 'Développeur Java senior' },
        { key: 'a2', type: 'recrutement', rawDate: '2026-06-20', title: 'Développeur Java senior' },
        { key: 'a3', type: 'recrutement', rawDate: '2026-07-02', title: 'Développeur Java senior' },
      ],
      new Date('2026-11-01'),
    )
    expect(lines.filter(line => line.title === 'Développeur Java senior')).toHaveLength(2)
  })
})

describe("lot 773 c) — les reformulations d'un même fait ne font qu'UNE ligne à l'écran (affichage seulement)", () => {
  const line = (id: string, title: string, over: Partial<SignalLineCandidate> = {}) =>
    mergeSignalLineCandidates([{ key: id, type: 'projet', rawDate: '2026-05-10', title, ...over }], NOW)[0]!

  const pangea = [
    line(
      'a',
      "TotalEnergies a annoncé la signature d'un contrat avec Dell Technologies et NVIDIA pour le supercalculateur Pangea 5",
    ),
    line('b', "Signature d'un contrat pour le calcul haute performance Pangea 5"),
    line('c', 'Signature du contrat Pangea 5 avec Dell'),
  ]

  it('3 phrases Pangea 5 du même mois et du même type → 1 ligne ×3, les 3 formulations gardées', () => {
    const rows = groupSignalReformulations(pangea, { companyName: 'TotalEnergies' })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.members.map(member => member.id)).toEqual(['a', 'b', 'c'])
    expect(rows[0]!.line.id).toBe('a')
  })

  it('deux vrais besoins différents du même mois restent 2 lignes', () => {
    const rows = groupSignalReformulations(
      [
        line('x', 'Migration du SI vers Azure pour la filiale Raffinage'),
        line('y', 'Refonte du portail Clients Mobilité'),
      ],
      { companyName: 'TotalEnergies' },
    )
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.members.length === 1)).toBe(true)
  })

  it('un autre mois ou un autre type ne se regroupe pas', () => {
    expect(
      groupSignalReformulations([pangea[0]!, { ...pangea[1]!, date: '2026-06-10' }], { companyName: 'TotalEnergies' }),
    ).toHaveLength(2)
    expect(
      groupSignalReformulations([pangea[0]!, { ...pangea[1]!, type: 'marche_public' as const }], {
        companyName: 'TotalEnergies',
      }),
    ).toHaveLength(2)
  })

  it("deux offres d'emploi ne se regroupent jamais ici (c'est la fusion qui décide)", () => {
    const offers = [
      line('o1', 'Développeur Java Spring Boot', { type: 'recrutement' }),
      line('o2', 'Architecte Java Spring Cloud', { type: 'recrutement' }),
    ]
    expect(groupSignalReformulations(offers)).toHaveLength(2)
  })
})

describe('lot 773 e) — l’entité du groupe qui porte un besoin de base commune', () => {
  it('une ligne peut nommer l’entité du groupe (jamais le fournisseur) ; le candidat la transmet', () => {
    const [line] = mergeSignalLineCandidates(
      [
        {
          key: 'shared-need:1',
          type: 'besoin_passe',
          origin: 'memoire',
          rawDate: '2024-03',
          title: 'Migration ERP',
          entity: 'Martin Sud',
        },
      ],
      NOW,
    )
    expect(line?.entity).toBe('Martin Sud')
    expect(accountSignalLineSchema.safeParse(line).success).toBe(true)
  })
})

describe('lot 775 — la mission observée est un type à part, sans identité', () => {
  it('est un type connu et ne compte pas comme un besoin du compte', () => {
    expect(SIGNAL_LINE_TYPES).toContain('mission_observee')
    expect(isNeedLineType('mission_observee')).toBe(false)
  })

  it('une candidate mission_observee devient une ligne « Mémoire marché » datée, sans nom de personne', () => {
    const [line] = mergeSignalLineCandidates(
      [
        candidate({
          key: 'market-path:1',
          type: 'mission_observee',
          origin: 'memoire',
          rawDate: '2024',
          title: 'Un freelance Data Engineer',
          detail: '2023-2024 · via Alten',
          tjmEur: 650,
          technologies: ['Java', 'Kafka'],
          roles: ['Data Engineer'],
          location: 'Lyon',
        }),
      ],
      NOW,
    )
    expect(line).toMatchObject({ type: 'mission_observee', origin_kind: 'memoire', period: 'past', tjm_eur: 650 })
    expect(line?.people_hints.names).toEqual([])
    expect(accountSignalLineSchema.safeParse(line).success).toBe(true)
  })
})

describe('#5000.1 — le type de contrat DÉCLARÉ par l’offre voyage sur la ligne, jamais déduit du titre', () => {
  it('une offre qui déclare son contrat le porte, normalisé', () => {
    const [line] = mergeSignalLineCandidates(
      [candidate({ key: 'j1', type: 'recrutement', title: 'Joaillier (H/F) CDI', contractType: 'permanent' })],
      NOW,
    )
    expect(line?.contract_type).toBe('CDI')
    expect(accountSignalLineSchema.safeParse(line).success).toBe(true)
  })

  it('une offre sans contrat déclaré n’en porte pas, même si le titre dit « CDI »', () => {
    const [line] = mergeSignalLineCandidates(
      [candidate({ key: 'j2', type: 'recrutement', title: 'Joaillier (H/F) CDI' })],
      NOW,
    )
    expect(line?.contract_type).toBeUndefined()
  })

  it('un fait qui n’est pas une offre ne porte jamais de contrat', () => {
    const [line] = mergeSignalLineCandidates([candidate({ key: 'p', type: 'projet', contractType: 'CDI' })], NOW)
    expect(line?.contract_type).toBeUndefined()
  })

  it('une ligne regroupée garde le contrat de SA propre offre', () => {
    const lines = mergeSignalLineCandidates(
      [
        candidate({ key: 'a', type: 'recrutement', title: 'Data engineer', team: 'Data', contractType: 'CDD' }),
        candidate({ key: 'b', type: 'recrutement', title: 'Analytics lead', team: 'Data', contractType: 'CDI' }),
      ],
      NOW,
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]?.merged?.[0]?.contract_type).toBe('CDI')
  })
})
