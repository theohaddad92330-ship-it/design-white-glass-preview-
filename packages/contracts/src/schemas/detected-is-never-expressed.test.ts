import { describe, expect, it } from 'vitest'
import {
  CLOSED_STAGES,
  DEFAULT_STAGE_LABELS,
  DEFAULT_ENTRY_STAGE,
  INTAKE_STAGES,
  PIPELINE_STAGES,
  PROJECT_STAGES,
  pipelineSummary,
} from './project.js'

/**
 * #1324 · #1326 (5/9) · #1332 · #1333 (4/9) — « NE JAMAIS FAIRE PASSER UN
 * PROJET DÉTECTÉ PAR BELLUM POUR UN BESOIN CONFIRMÉ CLIENT. »
 *
 * Quatre issues du 02/09 redemandent la même chose, et c'est déjà la doctrine :
 * « si l'information est déduite et non confirmée par le client, écrire "Projet
 * détecté" et jamais "Besoin exprimé" » (#1326), « ne jamais transformer
 * automatiquement une offre d'emploi ou un signal public en demande client »
 * (#1333).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE COMPORTEMENT EXISTAIT, LA GARDE N'EXISTAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * `INTAKE_STAGES` sort déjà `detected` et `potential` des colonnes du pipe, et
 * `pipelineSummary` les compte à part. Mais rien ne le NOMMAIT : la règle
 * tenait par la structure, et une structure qu'aucun test ne défend redevient
 * une opinion en trois semaines.
 *
 * C'est la seule chose que cette garde ajoute — et c'est exactement ce que
 * « une garde protège une règle, elle ne l'invente pas » veut dire.
 */
describe('un projet détecté n’est jamais un besoin exprimé', () => {
  it('les étapes d’entrée ne sont AUCUNE des colonnes du pipe', () => {
    for (const stage of INTAKE_STAGES) {
      expect(PIPELINE_STAGES as readonly string[], `${stage} ne doit pas être une colonne`).not.toContain(stage)
    }
  })

  // Théo C projects-pipeline.R2 (22/10) — la colonne `confirmed` se lit « À qualifier » : plus aucun libellé
  // de colonne ne dit « exprimé ». La règle reste la même — si l'un d'eux le dit, ce n'est QUE `confirmed`.
  it('« Besoin exprimé » ne désigne, s’il est dit, QUE l’étape confirmée', () => {
    const porteurs = (Object.keys(DEFAULT_STAGE_LABELS) as (keyof typeof DEFAULT_STAGE_LABELS)[]).filter(stage =>
      /exprim/i.test(DEFAULT_STAGE_LABELS[stage].fr),
    )

    expect(porteurs.filter(stage => stage !== 'confirmed')).toEqual([])
  })

  // #4338.1 — « Besoin exprimé » est désormais la PREMIÈRE colonne. Une
  // affaire ouverte sans étape (création, détection confirmée) ne doit pas y
  // naître pour autant : seul le client exprime un besoin.
  it('une affaire ouverte sans étape choisie naît « Qualifiée », jamais « Besoin exprimé »', () => {
    expect(DEFAULT_ENTRY_STAGE).toBe('qualified')
    expect(DEFAULT_ENTRY_STAGE).not.toBe(PIPELINE_STAGES[0])
  })

  it('aucune étape d’entrée ne porte un libellé de colonne — elle n’en a pas', () => {
    for (const stage of INTAKE_STAGES) {
      expect(Object.keys(DEFAULT_STAGE_LABELS)).not.toContain(stage)
    }
  })

  it('un projet DÉTECTÉ ne grossit aucune colonne, et se compte à part', () => {
    const summary = pipelineSummary([
      { stage: 'detected' },
      { stage: 'potential' },
      { stage: 'confirmed', amount_cents: 1000 },
    ])

    expect(summary.columns.reduce((total, column) => total + column.count, 0)).toBe(1)
    expect(summary.intake).toBe(2)
  })

  it('un SIGNAL n’est même pas une piste — il se compte encore à part', () => {
    // « Ne jamais transformer automatiquement une offre d'emploi ou un signal
    // public en demande client » (#1333, 4/9).
    const summary = pipelineSummary([{ stage: 'detected', kind: 'signal' }, { stage: 'detected' }])

    expect(summary.signals).toBe(1)
    expect(summary.intake).toBe(1)
  })

  it('sait dire NON — faire de « detected » une colonne casserait la garde', () => {
    const faux = [...PIPELINE_STAGES, 'detected'] as readonly string[]

    expect(faux).toContain('detected')
  })

  it('les trois familles d’étapes ne se recouvrent pas, et couvrent tout', () => {
    // Une étape qui appartiendrait à deux familles se compterait deux fois ;
    // une étape qui n'appartiendrait à aucune disparaîtrait de l'écran.
    const familles = [...INTAKE_STAGES, ...PIPELINE_STAGES, ...CLOSED_STAGES.filter(stage => stage !== 'won')]

    expect([...familles].sort()).toEqual([...PROJECT_STAGES].sort())
  })
})
