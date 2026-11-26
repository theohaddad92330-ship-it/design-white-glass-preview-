import { DEMO_DOSSIERS, DEMO_SIMILAR_CASES, DEMO_LOST_DEAL_REX, DEMO_SECOND_LOST_DEAL } from './demo-dataset'
import { deriveSimilarCases, type CaseCandidate, type CaseTarget } from '../capitalisation/similar-cases'
import { CASE_BUYING_MODELS, CASE_STRATEGIES, createLostDealRexSchema, LOSS_REASON_CODES } from '@bellum/contracts'

/**
 * #3246 (recette prod 02/10) — en démo, `find_similar_cases` rendait « aucun cas
 * comparable » sur chaque dossier. Ce test REJOUE la comparaison de l'outil sur
 * le jeu de données : le dossier Société Générale doit retrouver un cas GAGNÉ et
 * un cas PERDU, chacun avec ses ressemblances nommées.
 */
const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')!.account
const { lost, won } = DEMO_SIMILAR_CASES
// Décision Louis 04/10/2026 — les cas vivent sur un VRAI dossier de la salle.
const account = DEMO_DOSSIERS.find(
  dossier => dossier.account.company_name === DEMO_SIMILAR_CASES.account.company_name,
)!.account

const target: CaseTarget = {
  accountId: 'sg',
  sector: sg.sector,
  employees: sg.employees,
  groupRole: sg.group_role ?? null,
  country: sg.registry_country,
}
const base = {
  accountId: 'carrier',
  accountLabel: account.company_name,
  sector: account.sector,
  employees: account.employees,
  groupRole: account.group_role ?? null,
  country: account.registry_country,
}
const candidates: CaseCandidate[] = [
  {
    ...base,
    outcome: 'won',
    missionLabel: won.label,
    whatWorked: won.rex.what_worked,
    whatFailed: won.rex.what_failed,
    projectLabel: null,
    lossReason: null,
    closedAt: null,
  },
  {
    ...base,
    outcome: 'lost',
    missionLabel: null,
    whatWorked: null,
    whatFailed: null,
    projectLabel: lost.label,
    lossReason: lost.loss_reason,
    closedAt: null,
  },
]

describe('#3246 — les cas comparables de la salle de démonstration', () => {
  it('Société Générale retrouve un cas gagné ET un cas perdu, avec leurs ressemblances', () => {
    const cases = deriveSimilarCases(target, candidates)
    expect(cases.map(c => c.outcome).sort()).toEqual(['lost', 'won'])
    for (const c of cases) {
      // Décision Louis 04/10/2026 — porteur réel (BNP Paribas) : le secteur de
      // registre est commun ; aucune position de groupe n'est inventée.
      expect(c.similarities).toEqual(expect.arrayContaining([expect.stringContaining('Même secteur')]))
    }
    expect(cases.find(c => c.outcome === 'lost')?.lossReason).toBe(lost.loss_reason)
  })

  it('sait dire NON : un compte d’un autre secteur ne retrouve aucun cas (aucun cas inventé)', () => {
    const other: CaseTarget = {
      accountId: 'other',
      sector: 'Transport et logistique',
      employees: '480',
      groupRole: null,
    }
    expect(deriveSimilarCases(other, candidates)).toEqual([])
  })

  it('le porteur est un VRAI dossier de la salle, jamais un compte fictif (décision Louis 04/10/2026)', () => {
    expect(account.company_name).toBe('BNP Paribas')
    expect(account.company_name).not.toMatch(/exemple/i)
    expect(account.website ?? '').not.toMatch(/\.example\b/)
  })

  it('la mission du cas gagné est terminée depuis plus de 61 jours (jamais un faux bloqueur de facturation)', () => {
    expect(won.status).toBe('ended')
    expect(-won.ends_in_days).toBeGreaterThan(61)
  })
})

// #3544.4 — recette prod 02/10 : « 3 REX mission au texte identique (SNCF, AIRBUS, LVMH) ».
// Tracé : le semis démo ne porte qu'UN retour (le cas gagné ci-dessus), aucun code
// ne génère ni ne réutilise un texte de REX ; les trois lignes vues venaient de
// données saisies, pas du jeu de données. Cette garde tient la règle pour la suite :
// tout REX semé porte un texte PROPRE, jamais recopié d'un autre retour.
describe('#3544.4 — un texte de REX par mission semée', () => {
  const texts = [won.rex.summary, won.rex.what_worked, won.rex.what_failed]

  it('les trois champs du retour semé sont distincts et non vides', () => {
    expect(texts.every(text => text.trim().length > 20)).toBe(true)
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('aucun autre texte semé (mission, motif de perte) ne recopie le retour', () => {
    const others: string[] = [won.label, lost.label, lost.detail, lost.loss_reason]
    for (const text of texts) expect(others).not.toContain(text)
  })
})

// #3295 — démo des pertes. Décision Louis (brief P01 07/10) : pas de dossier fictif « (exemple) »,
// le REX de perte vit sur la même opportunité perdue que `DEMO_SIMILAR_CASES.lost` (BNP Paribas).
describe('#3295 — le REX de perte de la salle vit sur un VRAI dossier, jamais un fictif', () => {
  it('ses champs passent le contrat `createLostDealRexSchema` une fois complétés des identifiants réels', () => {
    const parsed = createLostDealRexSchema.safeParse({
      project_id: '00000000-0000-0000-0000-000000000001',
      account_id: '00000000-0000-0000-0000-000000000002',
      perimeter: null,
      need: null,
      people_involved: null,
      real_decider: null,
      sponsor: DEMO_LOST_DEAL_REX.sponsor,
      route_used: DEMO_LOST_DEAL_REX.route_used,
      proof_used: null,
      angle_tried: null,
      angles_not_tried: [],
      last_action: DEMO_LOST_DEAL_REX.last_action,
      declared_motif: DEMO_LOST_DEAL_REX.declared_motif,
      declared_motif_note: DEMO_LOST_DEAL_REX.declared_motif_note,
      suspected_motif: DEMO_LOST_DEAL_REX.suspected_motif,
      suspected_motif_note: DEMO_LOST_DEAL_REX.suspected_motif_note,
      competitor: null,
      timing: null,
      cycle_days: null,
      procurement_friction: null,
      consultant_gap: null,
      economics: null,
      what_team_knows_now: DEMO_LOST_DEAL_REX.what_team_knows_now,
      revisit_on: null,
      reuse_targets: [],
    })
    expect(parsed.success).toBe(true)
  })

  it('le motif DÉCLARÉ (ce que le client a dit) rejoint le motif de perte déjà semé (« hors panel »)', () => {
    expect(DEMO_LOST_DEAL_REX.declared_motif).toBe('panel')
    expect(DEMO_LOST_DEAL_REX.declared_motif_note.distinction).toBe('retour_client')
  })

  it('le motif SUPPOSÉ reste une hypothèse, jamais présentée comme un fait acquis', () => {
    expect(DEMO_LOST_DEAL_REX.suspected_motif_note.distinction).toBe('hypothese')
    expect(DEMO_LOST_DEAL_REX.last_action.distinction).toBe('fait_confirme')
  })

  it('aucun texte du REX ne recopie un texte déjà semé par le cas comparable (#3544.4)', () => {
    const rexTexts = [
      DEMO_LOST_DEAL_REX.sponsor,
      DEMO_LOST_DEAL_REX.route_used,
      DEMO_LOST_DEAL_REX.last_action.value,
      DEMO_LOST_DEAL_REX.declared_motif_note.value,
      DEMO_LOST_DEAL_REX.suspected_motif_note.value,
      DEMO_LOST_DEAL_REX.what_team_knows_now.value,
    ]
    expect(new Set(rexTexts).size).toBe(rexTexts.length)
    const others: string[] = [lost.label, lost.detail, lost.loss_reason, won.rex.summary]
    for (const text of rexTexts) expect(others).not.toContain(text)
  })
})

// #3295 — décision Louis (11/10 nuit) : un 2e REX de perte, sur un AUTRE vrai compte de la salle.
describe('#3295 — le 2e REX de perte de la salle', () => {
  const second = DEMO_SECOND_LOST_DEAL
  it('vit sur un vrai dossier de la salle, distinct du porteur du premier', () => {
    const names = DEMO_DOSSIERS.map(dossier => dossier.account.company_name)
    expect(names).toContain(second.account.company_name)
    expect(second.account.company_name).not.toBe(DEMO_SIMILAR_CASES.account.company_name)
    expect(second.account.company_name).not.toMatch(/exemple/i)
  })

  it('porte le MÊME motif que le premier : deux pertes qui se ressemblent, le bouton « Proposer une règle » se joue', () => {
    expect(second.rex.declared_motif).toBe(DEMO_LOST_DEAL_REX.declared_motif)
    expect(second.rex.suspected_motif).toBe(DEMO_LOST_DEAL_REX.suspected_motif)
  })

  it('passe le contrat et garde la distinction fait / hypothèse', () => {
    const parsed = createLostDealRexSchema.safeParse({
      project_id: '00000000-0000-0000-0000-000000000001',
      account_id: '00000000-0000-0000-0000-000000000002',
      perimeter: null,
      need: null,
      people_involved: null,
      real_decider: null,
      sponsor: second.rex.sponsor,
      route_used: second.rex.route_used,
      proof_used: null,
      angle_tried: null,
      angles_not_tried: [],
      last_action: second.rex.last_action,
      declared_motif: second.rex.declared_motif,
      declared_motif_note: second.rex.declared_motif_note,
      suspected_motif: second.rex.suspected_motif,
      suspected_motif_note: second.rex.suspected_motif_note,
      competitor: null,
      timing: null,
      cycle_days: null,
      procurement_friction: null,
      consultant_gap: null,
      economics: null,
      what_team_knows_now: second.rex.what_team_knows_now,
      revisit_on: null,
      reuse_targets: [],
    })
    expect(parsed.success).toBe(true)
    expect(second.rex.suspected_motif_note.distinction).toBe('hypothese')
  })

  it('aucun texte ne recopie le premier REX (#3544.4)', () => {
    const texts = (r: typeof DEMO_LOST_DEAL_REX | typeof second.rex): string[] => [
      r.sponsor,
      r.route_used,
      r.last_action.value,
      r.declared_motif_note.value,
      r.suspected_motif_note.value,
      r.what_team_knows_now.value,
    ]
    const all = [...texts(DEMO_LOST_DEAL_REX), ...texts(second.rex), second.lost.label, second.lost.loss_reason]
    expect(new Set(all).size).toBe(all.length)
  })
})

// #3246 / #3210.3 (lot W9) — les deux vocabulaires fermés sont renseignés sur
// les cas semés (vrai compte de la salle, aucun compte « exemple »).
describe('#3246 (lot W9) — stratégie et modèle d’achat des cas semés', () => {
  it('le cas gagné et le cas perdu portent un code du vocabulaire FERMÉ', () => {
    expect(CASE_STRATEGIES).toContain(won.rex.strategy)
    expect(CASE_BUYING_MODELS).toContain(won.rex.buying_model)
    expect(CASE_STRATEGIES).toContain(lost.strategy)
    expect(CASE_BUYING_MODELS).toContain(lost.buying_model)
  })

  it('la comparaison les exploite : une stratégie ou un modèle d’achat identique ou différent est nommé', () => {
    const cases = deriveSimilarCases({ ...target, strategy: won.rex.strategy, buyingModel: lost.buying_model }, [
      { ...candidates[0], strategy: won.rex.strategy, buyingModel: won.rex.buying_model },
      { ...candidates[1], strategy: lost.strategy, buyingModel: lost.buying_model },
    ])
    const text = cases.flatMap(c => [...c.similarities, ...c.differences]).join(' ')
    expect(text).toMatch(/stratégie d’approche/)
    expect(text).toMatch(/modèle d’achat/)
  })
})

// #3989.9 (Louis 15/10/2026) — craft n°9 : les pertes de la salle portent un motif de la liste FERMÉE commune.
describe('#3989.9 — motif de perte fermé, en démo', () => {
  it('les deux pertes semées portent un code de LOSS_REASON_CODES', () => {
    for (const code of [DEMO_SIMILAR_CASES.lost.loss_reason_code, DEMO_SECOND_LOST_DEAL.lost.loss_reason_code]) {
      expect(LOSS_REASON_CODES).toContain(code)
    }
  })
})
