import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STAGE_LABELS,
  isPipelineStage,
  PIPELINE_STAGES,
  pipelineSummary,
  PROJECT_STAGES,
  stageOrder,
  stageTransitionEffects,
} from './project.js'

describe('le cycle du projet', () => {
  it('range les étapes de la détection à la signature', () => {
    expect(stageOrder('detected')).toBeLessThan(stageOrder('qualified'))
    expect(stageOrder('qualified')).toBeLessThan(stageOrder('negotiation'))
    expect(stageOrder('negotiation')).toBeLessThan(stageOrder('won'))
  })

  // #4338.1 — décision Louis 19/10 : « Besoin exprimé » (le client l'a dit)
  // AVANT « Qualifié » (on sonde ses consultants). Migration d'ORDRE seulement :
  // les valeurs stockées `confirmed` / `qualified` gardent leur sens et leur nom.
  it('lit le pipe dans l’ordre d’une affaire d’ESN : Besoin exprimé → Qualifié → Profils → Négociation → Signé', () => {
    expect([...PIPELINE_STAGES]).toEqual(['confirmed', 'qualified', 'profiles_submitted', 'negotiation', 'won'])
    expect(stageOrder('confirmed')).toBeLessThan(stageOrder('qualified'))
    expect(stageOrder('potential')).toBeLessThan(stageOrder('confirmed'))
    // Théo C projects-pipeline.R2 (22/10) — les LIBELLÉS sont ceux de Théo ; les valeurs stockées n'ont pas bougé.
    expect(DEFAULT_STAGE_LABELS.confirmed.fr).toBe('À qualifier')
    expect(DEFAULT_STAGE_LABELS.qualified.fr).toBe('Cadrage')
  })

  it('compte exactement CINQ étapes de pipe, toutes nommées FR et EN', () => {
    expect(PIPELINE_STAGES).toHaveLength(5)
    for (const stage of PIPELINE_STAGES) {
      expect(DEFAULT_STAGE_LABELS[stage].fr.trim().length).toBeGreaterThan(0)
      expect(DEFAULT_STAGE_LABELS[stage].en.trim().length).toBeGreaterThan(0)
    }
  })

  it('garde `detected`, `potential`, `lost` et `dormant` HORS du pipe', () => {
    expect(isPipelineStage('detected')).toBe(false)
    expect(isPipelineStage('potential')).toBe(false)
    expect(isPipelineStage('lost')).toBe(false)
    expect(isPipelineStage('dormant')).toBe(false)
    expect(isPipelineStage('qualified')).toBe(true)
  })

  it('ne connaît qu’un seul champ d’état — toutes les étapes sont dans une liste', () => {
    expect(new Set(PROJECT_STAGES).size).toBe(PROJECT_STAGES.length)
  })
})

describe('stageTransitionEffects', () => {
  const now = new Date('2026-08-17T10:00:00.000Z')

  it('clôt le projet quand il est gagné', () => {
    expect(stageTransitionEffects('won', now)).toEqual({ stage_entered_at: now, closed_at: now, outcome: 'won' })
  })

  it('clôt le projet quand il est perdu, sans le confondre avec un abandon', () => {
    expect(stageTransitionEffects('lost', now).outcome).toBe('lost')
  })

  it('ne clôt PAS un projet endormi — personne n’a gagné et rien ne dit que c’est fini', () => {
    expect(stageTransitionEffects('dormant', now)).toEqual({
      stage_entered_at: now,
      closed_at: null,
      outcome: null,
    })
  })

  it('efface la clôture quand un projet clos repart', () => {
    expect(stageTransitionEffects('negotiation', now)).toEqual({
      stage_entered_at: now,
      closed_at: null,
      outcome: null,
    })
  })
})

describe('pipelineSummary', () => {
  it('somme les montants SAISIS et compte les autres à part', () => {
    const summary = pipelineSummary([
      { stage: 'qualified', amount_cents: 500_000 },
      { stage: 'qualified', amount_cents: null },
      { stage: 'negotiation', amount_cents: 1_200_000 },
    ])

    const qualified = summary.columns.find(column => column.stage === 'qualified')
    expect(qualified).toMatchObject({ count: 2, amount_cents: 500_000, without_amount: 1 })
    expect(summary.total_amount_cents).toBe(1_700_000)
    expect(summary.total_without_amount).toBe(1)
    expect(summary.total_count).toBe(3)
  })

  it('ne traite JAMAIS un montant absent comme un zéro', () => {
    const summary = pipelineSummary([{ stage: 'qualified' }, { stage: 'qualified', amount_cents: undefined }])
    const qualified = summary.columns.find(column => column.stage === 'qualified')
    // Deux projets, aucun euro déclaré : le pipe vaut 0 € ET dit que deux
    // projets n'ont pas de montant. Sans ce compteur, « 0 € » se lit
    // « ça ne vaut rien » au lieu de « personne n'a chiffré ».
    expect(qualified?.count).toBe(2)
    expect(qualified?.amount_cents).toBe(0)
    expect(qualified?.without_amount).toBe(2)
  })

  it('sort les détectés du pipe et les compte dans l’entonnoir', () => {
    const summary = pipelineSummary([
      { stage: 'detected', amount_cents: 999 },
      { stage: 'potential' },
      { stage: 'qualified', amount_cents: 100 },
    ])

    expect(summary.intake).toBe(2)
    expect(summary.total_count).toBe(1)
    // Un montant posé sur un projet non encore regardé n'entre pas au pipe.
    expect(summary.total_amount_cents).toBe(100)
  })

  it('compte les SIGNAUX à part — un fait daté n’est pas un projet en attente', () => {
    // Vu en production le 17/08 : l'entonnoir affichait 439 quand la lentille
    // Portefeuille en annonçait 211. La différence était faite de signaux, et
    // deux chiffres pour la même chose sur le même écran ne se croient ni l'un
    // ni l'autre.
    const summary = pipelineSummary([
      { stage: 'detected', kind: 'signal' },
      { stage: 'detected', kind: 'signal' },
      { stage: 'detected', kind: 'pain' },
      { stage: 'potential', kind: 'challenge' },
    ])

    expect(summary.signals).toBe(2)
    expect(summary.intake).toBe(2)
  })

  it('laisse un signal REPRIS dans le pipe — à ce moment-là c’est un projet', () => {
    // La distinction porte sur l'entonnoir, pas sur le pipe : dès que quelqu'un
    // a déplacé la ligne, il en a fait un projet, et l'écarter la ferait
    // disparaître de la colonne où son porteur l'a mise.
    const summary = pipelineSummary([{ stage: 'qualified', kind: 'signal', amount_cents: 5000 }])
    expect(summary.total_count).toBe(1)
    expect(summary.signals).toBe(0)
  })

  it('ignore les projets perdus et endormis — ils ne sont plus dans le pipe', () => {
    const summary = pipelineSummary([
      { stage: 'lost', amount_cents: 900_000 },
      { stage: 'dormant', amount_cents: 800_000 },
    ])
    expect(summary.total_count).toBe(0)
    expect(summary.total_amount_cents).toBe(0)
    expect(summary.intake).toBe(0)
  })

  it('n’additionne JAMAIS le signé au reste — un total ne mélange pas deux statuts', () => {
    // ANOMALIES CRM du 16/08, ligne 14 : « YGL Agence + Bellum → consolider
    // SANS ADDITIONNER LES STATUTS ». Une affaire signée et une en négociation
    // ne se somment pas : le résultat a l'air d'un pipe, et il contient de
    // l'argent déjà gagné qui n'en sortira plus jamais.
    const summary = pipelineSummary([
      { stage: 'negotiation', amount_cents: 100_000 },
      { stage: 'won', amount_cents: 900_000 },
    ])

    expect(summary.total_amount_cents).toBe(100_000)
    expect(summary.total_count).toBe(1)
    expect(summary.signed_amount_cents).toBe(900_000)
    expect(summary.signed_count).toBe(1)
  })

  it('compte les signées SANS montant à part, elles aussi', () => {
    const summary = pipelineSummary([{ stage: 'won' }, { stage: 'won', amount_cents: 4_200 }, { stage: 'qualified' }])

    expect(summary.signed_count).toBe(2)
    expect(summary.signed_amount_cents).toBe(4_200)
    expect(summary.signed_without_amount).toBe(1)
    expect(summary.total_count).toBe(1)
    expect(summary.total_without_amount).toBe(1)
  })

  it('garde la colonne Signé sur le tableau — elle est vue, elle n’est pas sommée', () => {
    const summary = pipelineSummary([{ stage: 'won', amount_cents: 900_000 }])
    const signed = summary.columns.find(column => column.stage === 'won')

    expect(signed?.count).toBe(1)
    expect(signed?.amount_cents).toBe(900_000)
    expect(summary.total_amount_cents).toBe(0)
  })

  it('affiche les cinq colonnes même vides — une colonne absente se lit « il manque une étape »', () => {
    const summary = pipelineSummary([])
    expect(summary.columns.map(column => column.stage)).toEqual([...PIPELINE_STAGES])
    expect(summary.columns.every(column => column.count === 0)).toBe(true)
  })

  it('utilise le libellé de l’espace quand il existe, le défaut sinon', () => {
    const summary = pipelineSummary([], { profiles_submitted: 'Shortlist envoyée' }, 'fr')
    const renamed = summary.columns.find(column => column.stage === 'profiles_submitted')
    const untouched = summary.columns.find(column => column.stage === 'negotiation')
    expect(renamed?.label).toBe('Shortlist envoyée')
    expect(untouched?.label).toBe('Proposition')
  })

  it('ignore un libellé vide plutôt que d’afficher une colonne sans nom', () => {
    const summary = pipelineSummary([], { qualified: '   ' }, 'en')
    expect(summary.columns.find(column => column.stage === 'qualified')?.label).toBe('Scoping')
  })
})
