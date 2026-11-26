import { accountFactSchema, weighAccountFacts } from '@bellum/contracts'
import {
  documentFacts,
  feedbackFacts,
  marketObservationFacts,
  missionFacts,
  renewalDueFacts,
  needFacts,
  noteFacts,
  signalHistoryFacts,
  signalKindOf,
  crmDealFacts,
  projectDealFacts,
  currentSignalFacts,
  dormantDealFacts,
  exchangeFacts,
  careerFacts,
} from './account-facts.sources'

const AS_OF = new Date('2026-10-12T08:00:00.000Z')
const SUPPLIER_WORDS =
  /hubspot|salesforce|pipedrive|dataforge|mémoire marché|market memory|apollo|pappers|brave|firecrawl|drive|notion/i

describe('#4069.1 — familles de faits du compte (lecteurs → faits bruts)', () => {
  it('A — historique des signaux : tout âge, daté par le fait sinon par la première détection, nature déduite', () => {
    const facts = signalHistoryFacts([
      {
        label: 'Recrute 3 développeurs Java',
        signal_type: 'recrutement',
        signal_date: '2024-05-02',
        first_detected_at: '2024-05-10T00:00:00Z',
      },
      {
        label: 'Appel d’offres TMA',
        signal_type: 'appel_offres',
        signal_date: null,
        first_detected_at: new Date('2025-01-03T00:00:00Z'),
      },
      {
        label: 'Levée de fonds',
        signal_type: null,
        signal_date: 'mars 2023',
        first_detected_at: '2023-03-20T00:00:00Z',
      },
      { label: '  ', signal_type: null, signal_date: null, first_detected_at: '2023-03-20T00:00:00Z' },
    ])
    expect(facts).toEqual([
      { date: '2024-05-02', kind: 'hiring', label: 'Recrute 3 développeurs Java' },
      { date: '2025-01-03', kind: 'need', label: 'Appel d’offres TMA' },
      { date: '2023-03-20', kind: 'signal', label: 'Levée de fonds' },
    ])
  })

  it('A — signaux COURANTS du dossier : datés seulement par leur propre date ISO, lien public gardé', () => {
    expect(
      currentSignalFacts([
        {
          signal: 'Recrute un architecte cloud',
          type: 'recrutement',
          date: '2026-09-20',
          url: 'https://exemple.fr/offre',
        },
        { signal: 'Nouveau DSI nommé', type: 'nomination', date: null },
        { signal: 'Levée', type: null, date: 'récemment' },
        'pas un signal',
      ]),
    ).toEqual([
      { date: '2026-09-20', kind: 'hiring', label: 'Recrute un architecte cloud', url: 'https://exemple.fr/offre' },
    ])
    expect(currentSignalFacts(null)).toEqual([])
  })

  it('A — la nature d’un signal se lit sur son type, jamais devinée au-delà', () => {
    expect(signalKindOf('Recrutement')).toBe('hiring')
    expect(signalKindOf('job_posting')).toBe('hiring')
    expect(signalKindOf('besoin')).toBe('need')
    expect(signalKindOf('rfp')).toBe('need')
    expect(signalKindOf('nomination')).toBe('signal')
    expect(signalKindOf(null)).toBe('signal')
  })

  it('B — affaires closes : gagnée / perdue datées par la clôture ; une close sans issue connue ne fait AUCUNE ligne', () => {
    const facts = crmDealFacts([
      { name: 'TMA SI RH', is_won: true, closed_at: '2025-02-01T00:00:00Z', last_activity_at: null },
      { name: 'Data platform', is_won: false, closed_at: null, last_activity_at: '2024-11-15T00:00:00Z' },
      { name: 'Inconnue', is_won: null, closed_at: '2025-02-01T00:00:00Z', last_activity_at: null },
      { name: null, is_won: true, closed_at: '2025-02-01T00:00:00Z', last_activity_at: null },
    ])
    expect(facts).toEqual([
      { date: '2025-02-01', kind: 'deal_won', label: 'TMA SI RH' },
      { date: '2024-11-15', kind: 'deal_lost', label: 'Data platform' },
    ])
  })

  it('B — affaires NATIVES (`opportunities`) : gagnée / perdue par `outcome`, datées par la clôture ; abandonnée, en jeu, sans date ou sans libellé = AUCUNE ligne', () => {
    expect(
      projectDealFacts([
        { label: 'Refonte SI RH', outcome: 'lost', closed_at: '2026-06-10T00:00:00Z', stage_entered_at: null },
        { label: 'TMA paie', outcome: 'won', closed_at: null, stage_entered_at: '2026-01-05T00:00:00Z' },
        { label: 'Abandonnée', outcome: 'abandoned', closed_at: '2026-06-10T00:00:00Z', stage_entered_at: null },
        { label: 'En jeu', outcome: null, closed_at: null, stage_entered_at: '2026-06-10T00:00:00Z' },
        { label: 'Sans date', outcome: 'lost', closed_at: null, stage_entered_at: null },
        { label: null, outcome: 'lost', closed_at: '2026-06-10T00:00:00Z', stage_entered_at: null },
      ]),
    ).toEqual([
      { date: '2026-06-10', kind: 'deal_lost', label: 'Refonte SI RH' },
      { date: '2026-01-05', kind: 'deal_won', label: 'TMA paie' },
    ])
  })

  it('B — affaires en sommeil, datées par le fait', () => {
    expect(
      dormantDealFacts([
        { evidence: 'Affaire « Cloud » sans activité depuis 9 mois', occurred_at: '2026-01-04T00:00:00Z' },
      ]),
    ).toEqual([{ date: '2026-01-04', kind: 'deal_dormant', label: 'Affaire « Cloud » sans activité depuis 9 mois' }])
  })

  it('D — observation de marché : datée par la fin de période, jamais sans date, jamais sans couverture', () => {
    const covered = {
      status: 'ok' as const,
      coverage: {
        covered: true,
        marketPaths: 42,
        esnObserved: [{ esnName: 'Alpha Conseil' }, { esnName: 'Beta IT' }],
        roleFamilies: [
          { family: 'data', persons: 4 },
          { family: 'cloud', persons: 2 },
        ],
        periodEnd: '2026-06-30',
      },
    }
    const [fact] = marketObservationFacts(covered)
    expect(fact).toMatchObject({ date: '2026-06-30', kind: 'market_observation' })
    expect(fact?.label).toContain('Alpha Conseil')
    expect(fact?.label).toContain('data')
    expect(fact?.label).not.toMatch(SUPPLIER_WORDS)
    expect(marketObservationFacts({ ...covered, coverage: { ...covered.coverage, periodEnd: null } })).toEqual([])
    expect(marketObservationFacts({ status: 'ok', coverage: { covered: false } })).toEqual([])
    expect(marketObservationFacts({ status: 'unavailable' })).toEqual([])
  })

  it('E — documents : le titre et la date, jamais le contenu', () => {
    expect(
      documentFacts([
        { title: 'CR comité Sanofi', created_at: '2025-09-01T10:00:00Z' },
        { title: null, created_at: '2025-09-01T10:00:00Z' },
      ]),
    ).toEqual([{ date: '2025-09-01', kind: 'document', label: 'CR comité Sanofi' }])
  })

  it('F — missions, datées par leur démarrage sinon leur création', () => {
    expect(
      missionFacts([
        { label: 'Architecte data', started_on: '2024-01-08', created_at: '2023-12-01T00:00:00Z' },
        { label: 'PMO', started_on: null, created_at: '2023-12-01T00:00:00Z' },
      ]),
    ).toEqual([
      { date: '2024-01-08', kind: 'mission', label: 'Architecte data' },
      { date: '2023-12-01', kind: 'mission', label: 'PMO' },
    ])
  })

  it('#3918.6 — renouvellement : ligne datée 90 jours avant la fin connue, rien sans date de fin', () => {
    const rows = [
      { label: 'Architecte data', status: 'active', ends_on: '2026-12-01' }, // 2026-09-02 ≤ AS_OF ≤ fin
      { label: 'PMO', status: 'active', ends_on: '2027-03-01' }, // fenêtre pas encore ouverte
      { label: 'Run', status: 'active', ends_on: null }, // fin inconnue
      { label: 'Ancienne', status: 'ended', ends_on: '2026-11-01' }, // terminée
      { label: 'Passée', status: 'active', ends_on: '2026-09-01' }, // fin dépassée
    ]
    expect(renewalDueFacts(rows, AS_OF)).toEqual([
      { date: '2026-09-02', kind: 'deal_renewal', label: 'Architecte data' },
    ])
  })

  it('G — besoins enregistrés, notes, comptes rendus, corrections', () => {
    expect(needFacts([{ title: 'Migration paie', created_at: '2026-03-01T00:00:00Z' }])).toEqual([
      { date: '2026-03-01', kind: 'need', label: 'Migration paie' },
    ])
    expect(
      noteFacts([
        { body: 'Le DSI\n part   en juin.', created_at: '2026-02-01T00:00:00Z', is_meeting: false },
        { body: 'RDV de cadrage', created_at: '2026-02-03T00:00:00Z', is_meeting: true },
        { body: 'x'.repeat(400), created_at: '2026-02-03T00:00:00Z', is_meeting: false },
      ]).map(f => [f.kind, f.label.length <= 280, f.label.slice(0, 22)]),
    ).toEqual([
      ['note', true, 'Le DSI part en juin.'],
      ['meeting', true, 'RDV de cadrage'],
      ['note', true, 'x'.repeat(22)],
    ])
    expect(
      feedbackFacts([
        {
          target_ref: 'Angle cyber',
          verdict: 'inutile',
          note: 'Déjà couvert par un concurrent',
          created_at: '2026-04-01T00:00:00Z',
        },
        { target_ref: '', verdict: 'utile', note: null, created_at: '2026-04-01T00:00:00Z' },
      ]),
    ).toEqual([{ date: '2026-04-01', kind: 'correction', label: 'Angle cyber — Déjà couvert par un concurrent' }])
  })

  it('chaque fait produit, une fois pesé, respecte le contrat — aucun champ de provenance', () => {
    const raw = [
      ...signalHistoryFacts([
        { label: 'Levée', signal_type: null, signal_date: '2024-01-01', first_detected_at: '2024-01-01' },
      ]),
      ...needFacts([{ title: 'Migration', created_at: '2026-03-01T00:00:00Z' }]),
    ]
    for (const fact of weighAccountFacts(raw, AS_OF)) expect(accountFactSchema.safeParse(fact).success).toBe(true)
  })
})

// #4072.2 / #4072.3
describe('H — échanges en MÉTADONNÉES (date, destinataire, sujet — jamais le corps)', () => {
  it('dit le geste, la personne et le sujet, daté par l’événement', () => {
    const facts = exchangeFacts([
      {
        kind: 'email',
        direction: 'outbound',
        subject: 'Point projet TMA',
        occurred_at: '2026-09-02T09:00:00Z',
        contact_name: 'Jeanne Martin',
      },
      { kind: 'call', direction: 'inbound', subject: null, occurred_at: '2026-08-02T09:00:00Z', contact_name: null },
    ])
    expect(facts.map(f => f.kind)).toEqual(['exchange', 'exchange'])
    expect(facts[0]).toMatchObject({ date: '2026-09-02' })
    expect(facts[0]?.label).toBe('E-mail envoyé à Jeanne Martin — « Point projet TMA »')
    expect(facts[1]?.label).toBe('Appel reçu')
  })

  it('ignore les lignes internes ou sans date, et ne lit jamais un corps', () => {
    expect(
      exchangeFacts([
        { kind: 'email', direction: 'internal', subject: 'x', occurred_at: '2026-09-02', contact_name: null },
        { kind: 'email', direction: 'outbound', subject: 'x', occurred_at: null, contact_name: null },
        { kind: 'note', direction: 'outbound', subject: 'x', occurred_at: '2026-09-02', contact_name: null },
      ]),
    ).toEqual([])
    const withBody = exchangeFacts([
      {
        kind: 'email',
        direction: 'outbound',
        subject: 'S',
        occurred_at: '2026-09-02',
        contact_name: 'A',
        body: 'CORPS SECRET',
      } as never,
    ])
    expect(JSON.stringify(withBody)).not.toContain('CORPS SECRET')
  })

  it('produit des faits valides au contrat, sans provenance', () => {
    const [f] = weighAccountFacts(
      exchangeFacts([
        { kind: 'meeting', direction: 'outbound', subject: 'Cadrage', occurred_at: '2026-09-02', contact_name: 'Léa' },
      ]),
      AS_OF,
    )
    expect(accountFactSchema.safeParse(f).success).toBe(true)
    expect(JSON.stringify(f)).not.toMatch(SUPPLIER_WORDS)
  })
})

// #4284.19 (recette prod 19-20/10, Renault) — « 0 fait > 90 j, 0 parcours » : les trajectoires de personnes n'étaient
// lues nulle part. Un rôle passé ou présent CHEZ ce compte, daté par ses propres dates ISO, devient un fait « Parcours ».
describe('#4284.19 — parcours des personnes chez le compte', () => {
  const people = [
    {
      full_name: 'Marie Durand',
      employment_history: [
        {
          organization_name: 'Renault Group',
          title: 'Directrice des achats IT',
          start_date: '2018-02-01',
          end_date: '2023-06-30',
          current: false,
        },
        { organization_name: 'Stellantis', title: 'Head of Procurement', start_date: '2023-09-01', current: true },
      ],
    },
    {
      full_name: 'Paul Martin',
      employment_history: [
        { organization_name: 'Renault', title: 'DSI', start_date: '2021-01-15', current: true },
        { organization_name: 'Renault', title: 'Sans date', start_date: 'mars 2020', current: false },
      ],
    },
  ]

  it('un rôle PASSÉ chez le compte est daté par sa fin, un rôle EN COURS par son début ; les autres employeurs sont ignorés', () => {
    const facts = careerFacts(people, 'Renault')
    expect(facts).toEqual([
      {
        date: '2023-06-30',
        kind: 'career',
        label: 'Marie Durand — Directrice des achats IT chez Renault Group (2018 – 2023)',
      },
      { date: '2021-01-15', kind: 'career', label: 'Paul Martin — DSI chez Renault (depuis 2021)' },
    ])
  })

  it('sait dire NON : une date illisible ne fait aucune ligne, jamais une date devinée', () => {
    expect(careerFacts(people, 'Renault').some(fact => fact.label.includes('Sans date'))).toBe(false)
  })

  it('sans nom de compte, ou sans parcours, aucun fait ; ne nomme aucun fournisseur', () => {
    expect(careerFacts(people, '')).toEqual([])
    expect(careerFacts([{ full_name: 'X', employment_history: null }], 'Renault')).toEqual([])
    expect(JSON.stringify(careerFacts(people, 'Renault'))).not.toMatch(SUPPLIER_WORDS)
  })

  it('un nom de compte court ne s’accroche pas à un autre employeur (frontière de mot)', () => {
    const facts = careerFacts(
      [
        {
          full_name: 'A B',
          employment_history: [
            { organization_name: 'Renaultech Conseil', title: 'CTO', start_date: '2020-01-01', current: true },
          ],
        },
      ],
      'Renault',
    )
    expect(facts).toEqual([])
  })
})
