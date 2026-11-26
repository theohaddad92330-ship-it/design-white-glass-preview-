import { describe, expect, it } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'
import {
  buildNeedDiscoveryRails,
  CLIENT_RAIL_KEYS,
  CONSULTANT_RAIL_KEYS,
  missingClientRailKeys,
  missingConsultantRailKeys,
  buildNeedRailStates,
  needReadyToStart,
} from './need-discovery-rails.js'

const NOW = new Date('2026-09-16T00:00:00.000Z')

/**
 * #2067.18-.30 — LES DEUX RAILS D'UNE AFFAIRE, ET CE QUI Y MANQUE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN RAIL N'EST PAS UNE FICHE À REMPLIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce module ne RE-RENDU aucune valeur déjà affichée ailleurs sur la fiche d'un
 * besoin (`NeedDetailPage.tsx` affiche déjà `context`, `budget_cents`,
 * `languages`/`clearances`, `start_on`…) — le refaire violerait « rien
 * n'apparaît deux fois sous la même forme » (loi 4) et GA-26. Ce qu'il calcule
 * est un DIGEST : quels champs du rail CLIENT et du rail CONSULTANT sont
 * mesurés, lesquels ne le sont pas — pour que #2067.30 puisse nommer les trous.
 */
function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    title: 'Ingénieur systèmes',
    urgency: null,
    skills: [],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'regie',
    deadline_at: null,
    status: 'to_qualify',
    status_reason: null,
    status_changed_at: null,
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: 'p-1',
    project_label: 'Refonte',
    project_stage: 'qualified',
    account_id: 'a-1',
    account_name: null,
    entity_id: null,
    entity_name: null,
    languages: [],
    clearances: [],
    ...over,
  }
}

describe('buildNeedDiscoveryRails — rail CLIENT', () => {
  it('#2067.18 — un contexte vide ou absent est le problème NON mesuré, jamais deviné', () => {
    expect(buildNeedDiscoveryRails(need({ context: null }), NOW).client.problem).toBe(false)
    expect(buildNeedDiscoveryRails(need({ context: '   ' }), NOW).client.problem).toBe(false)
    expect(
      buildNeedDiscoveryRails(need({ context: 'Le client perd des dossiers en réconciliation' }), NOW).client.problem,
    ).toBe(true)
  })

  it('#2067.19 — les exigences sont mesurées dès que langues OU habilitations ont reçu une réponse, MÊME VIDE', () => {
    // ⚠️ `[]` veut dire « ce poste n'en exige aucune » — une réponse, pas une
    // absence (docblock de `NeedRequirementsCard.tsx`). La confondre avec
    // « non renseigné » referait le zéro qui ment.
    expect(buildNeedDiscoveryRails(need({ languages: [], clearances: [] }), NOW).client.requirements).toBe(true)
    expect(
      buildNeedDiscoveryRails(need({ languages: undefined, clearances: undefined }), NOW).client.requirements,
    ).toBe(false)
  })

  it('#2067.20 — le budget est celui du champ nommé « Budget » (budget_cents), jamais déduit du TJM cible', () => {
    expect(buildNeedDiscoveryRails(need({ budget_cents: null }), NOW).client.budget).toBe(false)
    expect(buildNeedDiscoveryRails(need({ budget_cents: 50_000_00 }), NOW).client.budget).toBe(true)
  })

  it('#2067.21 / #2067.22 — décision et voie d’achat sont mesurées sur le BTMMP du projet, jamais devinées', () => {
    expect(buildNeedDiscoveryRails(need({}), NOW).client.decision).toBe(false)
    expect(buildNeedDiscoveryRails(need({ decision_known: undefined }), NOW).client.decision).toBe(false)
    expect(buildNeedDiscoveryRails(need({ decision_known: true }), NOW).client.decision).toBe(true)
    expect(buildNeedDiscoveryRails(need({}), NOW).client.buyingProcess).toBe(false)
    expect(buildNeedDiscoveryRails(need({ buying_process_known: true }), NOW).client.buyingProcess).toBe(true)
  })

  it('#2067.23 — le timing est mesuré dès qu’UN des trois signaux (démarrage, durée, échéance) existe', () => {
    expect(buildNeedDiscoveryRails(need({}), NOW).client.timing).toBe(false)
    expect(buildNeedDiscoveryRails(need({ start_on: '2026-10-01' }), NOW).client.timing).toBe(true)
    expect(buildNeedDiscoveryRails(need({ duration_months: 6 }), NOW).client.timing).toBe(true)
    expect(buildNeedDiscoveryRails(need({ deadline_at: '2026-11-01' }), NOW).client.timing).toBe(true)
  })

  it('#2067.24 — la prochaine étape RÉUTILISE needNextAction, pas un second calcul (GA-26)', () => {
    // Statut clos → `needNextAction` rend `null` : aucune action ne circule plus.
    expect(buildNeedDiscoveryRails(need({ status: 'won' }), NOW).client.nextStep).toBe(false)
    // Compétences présentes + staffable inconnu → une action existe (poser G3).
    expect(
      buildNeedDiscoveryRails(need({ skills: [{ term: 'React', level: null, required: true }], staffable: 'yes' }), NOW)
        .client.nextStep,
    ).toBe(true)
  })
})

describe('buildNeedDiscoveryRails — rail CONSULTANT', () => {
  it('#2067.25-.29 — aucun champ n’est mesuré tant qu’aucun consultant n’est POSITIONNÉ', () => {
    const rails = buildNeedDiscoveryRails(need({}), NOW)
    for (const key of CONSULTANT_RAIL_KEYS) {
      expect(rails.consultant[key]).toBe(false)
    }
    expect(rails.positionedConsultant).toBeNull()
    expect(rails.positionedConsultantsCount).toBe(0)
  })

  const positioned = {
    submissionId: 's-1',
    consultantId: 'c-1',
    consultantName: 'Inès Kaczmarek',
    submittedAt: '2026-09-09T00:00:00.000Z',
    fitScore: null,
    availability: null,
    proposedRateCents: null,
    mobilityKnown: false,
    otherActiveSubmissions: 0,
  }

  it('#2067.25 — DÉCISION Louis 17/09 : le fait vient du consultant POSITIONNÉ, jamais deviné', () => {
    const rails = buildNeedDiscoveryRails(
      need({
        positioned_consultant: { ...positioned, fitScore: 72, availability: 'sous_1_mois' },
        positioned_consultants_count: 1,
      }),
      NOW,
    )
    expect(rails.consultant.fitAndAvailability).toBe(true)
    expect(rails.positionedConsultant?.consultantName).toBe('Inès Kaczmarek')
    expect(rails.positionedConsultantsCount).toBe(1)
  })

  it('#2067.25 — un score `null` ET une disponibilité `inconnu` laissent la clé NON mesurée', () => {
    const rails = buildNeedDiscoveryRails(
      need({ positioned_consultant: { ...positioned, fitScore: null, availability: 'inconnu' } }),
      NOW,
    )
    expect(rails.consultant.fitAndAvailability).toBe(false)
  })

  it('#2067.26 — le TJM mesuré est le `proposedRateCents` DEMANDÉ sur la soumission', () => {
    expect(
      buildNeedDiscoveryRails(need({ positioned_consultant: { ...positioned, proposedRateCents: null } }), NOW)
        .consultant.tjm,
    ).toBe(false)
    expect(
      buildNeedDiscoveryRails(need({ positioned_consultant: { ...positioned, proposedRateCents: 72_000 } }), NOW)
        .consultant.tjm,
    ).toBe(true)
  })

  it('#2067.27 — la mobilité relit `mobilityKnown` (zones ou préférence remote), sans deviner', () => {
    expect(
      buildNeedDiscoveryRails(need({ positioned_consultant: { ...positioned, mobilityKnown: false } }), NOW).consultant
        .mobility,
    ).toBe(false)
    expect(
      buildNeedDiscoveryRails(need({ positioned_consultant: { ...positioned, mobilityKnown: true } }), NOW).consultant
        .mobility,
    ).toBe(true)
  })

  it('#2067.28 — « autres processus en cours » est mesuré dès qu’un consultant est positionné, `0` compris', () => {
    const rails = buildNeedDiscoveryRails(
      need({ positioned_consultant: { ...positioned, otherActiveSubmissions: 0 } }),
      NOW,
    )
    expect(rails.consultant.competingProcesses).toBe(true)
  })

  it('#2067.29 — l’accord réel et ses restrictions restent `false` : aucune source ne les porte encore', () => {
    const rails = buildNeedDiscoveryRails(need({ positioned_consultant: positioned }), NOW)
    expect(rails.consultant.realAgreement).toBe(false)
  })
})

describe('la garde — elle sait dire NON', () => {
  it('un rail CLIENT entièrement rempli ne laisse plus rien de manquant, SAUF décision/voie d’achat', () => {
    const rails = buildNeedDiscoveryRails(
      need({
        context: 'Migration ERP en retard, direction sous pression',
        languages: [],
        clearances: [],
        budget_cents: 120_000_00,
        start_on: '2026-10-01',
        skills: [{ term: 'SAP', level: null, required: true }],
        staffable: 'yes',
      }),
      NOW,
    )
    expect(missingClientRailKeys(rails)).toEqual(['decision', 'buyingProcess'])
  })

  it('#2067.21 / #2067.22 — un BTMMP renseigné sur le projet fait sortir décision/voie d’achat du manquant', () => {
    const rails = buildNeedDiscoveryRails(
      need({
        context: 'Migration ERP en retard, direction sous pression',
        languages: [],
        clearances: [],
        budget_cents: 120_000_00,
        start_on: '2026-10-01',
        skills: [{ term: 'SAP', level: null, required: true }],
        staffable: 'yes',
        decision_known: true,
        buying_process_known: true,
      }),
      NOW,
    )
    expect(missingClientRailKeys(rails)).toEqual([])
  })

  it('un rail CLIENT vide manque sur les sept clés', () => {
    // `languages`/`clearances` à `undefined` : la question elle-même n'a pas
    // de réponse (deploy-skew), distinct du `[]` par défaut de la fixture qui
    // veut dire « ce poste n'exige rien de plus » — une réponse RÉELLE.
    // `status: 'won'` : `needNextAction` ne rend `null` (aucune action ne
    // circule plus) que sur un besoin CLOS — un besoin ouvert, même vide,
    // suggère toujours au moins « qualifier les compétences ».
    const rails = buildNeedDiscoveryRails(need({ status: 'won', languages: undefined, clearances: undefined }), NOW)
    expect(missingClientRailKeys(rails)).toEqual([...CLIENT_RAIL_KEYS])
  })

  it('le rail CONSULTANT manque entièrement quand rien n’a encore été capté — CE test rougirait si une clé passait à `true` sans raison', () => {
    const rails = buildNeedDiscoveryRails(need({}), NOW)
    expect(missingConsultantRailKeys(rails)).toEqual([...CONSULTANT_RAIL_KEYS])
  })
})

describe('le corpus n’est jamais vide', () => {
  it('les deux rails déclarent chacun au moins trois champs', () => {
    expect(CLIENT_RAIL_KEYS.length).toBeGreaterThanOrEqual(3)
    expect(CONSULTANT_RAIL_KEYS.length).toBeGreaterThanOrEqual(3)
  })
})

const POSITIONED = {
  submissionId: '33333333-3333-4333-8333-333333333333',
  consultantId: '44444444-4444-4444-8444-444444444444',
  consultantName: 'Inès Kaczmarek',
  submittedAt: '2026-09-09T00:00:00.000Z',
  fitScore: 80,
  availability: 'immediate',
  proposedRateCents: 72_000,
  mobilityKnown: true,
  otherActiveSubmissions: 0,
  agreementConfirmed: true,
}

/** Un besoin dont les SEPT faits du rail client sont mesurés. */
function fullClient(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return need({
    context: 'Le client perd des dossiers en réconciliation',
    budget_cents: 10_000_00,
    decision_known: true,
    buying_process_known: true,
    start_on: '2026-10-01',
    owner_id: 'u-1',
    ...over,
  })
}

describe('#2175.29 — le rail consultant lit l’ACCORD RÉEL du positionné', () => {
  it('accord confirmé (TJM ET CV validés par geste) ⇒ mesuré ; sinon non mesuré — jamais un faux « oui »', () => {
    expect(buildNeedDiscoveryRails(need({ positioned_consultant: POSITIONED }), NOW).consultant.realAgreement).toBe(
      true,
    )
    expect(
      buildNeedDiscoveryRails(need({ positioned_consultant: { ...POSITIONED, agreementConfirmed: false } }), NOW)
        .consultant.realAgreement,
    ).toBe(false)
    // deploy-skew : une API qui ne porte pas encore le champ ne vaut pas « oui »
    const { agreementConfirmed: _omit, ...legacy } = POSITIONED
    expect(buildNeedDiscoveryRails(need({ positioned_consultant: legacy }), NOW).consultant.realAgreement).toBe(false)
  })
})

describe('#2175.30 — chaque fait porte un état parmi QUATRE', () => {
  it('mesuré ⇒ Confirmé, absent ⇒ À vérifier', () => {
    const states = buildNeedRailStates(need({ context: 'x' }), NOW)
    expect(states.client.problem).toBe('confirmed')
    expect(states.client.budget).toBe('to_verify')
  })

  it('un consultant DÉCLARÉ indisponible rend l’adéquation/disponibilité BLOQUANTE — un fait, pas un jugement', () => {
    const states = buildNeedRailStates(
      need({ positioned_consultant: { ...POSITIONED, availability: 'indisponible' } }),
      NOW,
    )
    expect(states.consultant.fitAndAvailability).toBe('blocking')
  })

  it('la mobilité est Non applicable sur un poste en full remote', () => {
    const states = buildNeedRailStates(
      need({ remote: 'full_remote', positioned_consultant: { ...POSITIONED, mobilityKnown: false } }),
      NOW,
    )
    expect(states.consultant.mobility).toBe('not_applicable')
  })

  it('sans consultant positionné, tout le rail consultant reste À vérifier (jamais Non applicable)', () => {
    const states = buildNeedRailStates(need({ positioned_consultant: null }), NOW)
    for (const key of CONSULTANT_RAIL_KEYS) expect(states.consultant[key]).toBe('to_verify')
  })
})

describe('#2175.32 — « prêt à démarrer » seulement si les DEUX rails sont sécurisés', () => {
  it('deux rails confirmés ⇒ prêt', () => {
    const states = buildNeedRailStates(fullClient({ positioned_consultant: POSITIONED }), NOW)
    expect(needReadyToStart(states)).toEqual({ ready: true, toVerify: 0, blocking: 0 })
  })

  it('un seul fait à vérifier suffit à refuser, et on dit combien', () => {
    const states = buildNeedRailStates(
      fullClient({ positioned_consultant: { ...POSITIONED, agreementConfirmed: false } }),
      NOW,
    )
    expect(needReadyToStart(states)).toEqual({ ready: false, toVerify: 1, blocking: 0 })
  })

  it('un fait bloquant refuse aussi, compté à part', () => {
    const states = buildNeedRailStates(
      fullClient({ positioned_consultant: { ...POSITIONED, availability: 'indisponible' } }),
      NOW,
    )
    expect(needReadyToStart(states)).toMatchObject({ ready: false, blocking: 1 })
  })
})
