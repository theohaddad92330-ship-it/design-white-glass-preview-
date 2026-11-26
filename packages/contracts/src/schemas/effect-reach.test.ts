import { describe, expect, it } from 'vitest'
import { reachesOutsideProduct } from './action-os.js'
import { actionIntentTypeSchema } from './action-router.js'
import {
  EFFECT_EXECUTIONS,
  EFFECT_REACHES,
  executionForReach,
  reachFromTable,
  UNDECLARED_EFFECT_REACH,
  type EffectReach,
} from './effect-reach.js'
import {
  OUTREACH_SEQUENCE_TEMPLATES,
  OUTREACH_STEP_REACH,
  outreachStepExecution,
  outreachStepKindSchema,
  outreachStepReach,
} from './outreach-sequence.js'

/**
 * #2378.9 — LA FRONTIÈRE : ce qui SORT attend, ce qui est INTERNE part.
 *
 * DÉCISION LOUIS 21/09/2026. Ce fichier teste le VOCABULAIRE de la frontière
 * (`effect-reach.ts`) et les deux tables qui la déclarent — les intents de
 * l'Action Router (`INTENT_REACH`, déjà là depuis #1931) et les natures
 * d'étape du constructeur de séquences (`OUTREACH_STEP_REACH`, neuve).
 *
 * Ce qui compte ici n'est pas « auto-exécution interdite » — c'est que CHAQUE
 * nature d'étape DÉCLARE son côté, et qu'une nature qui ne l'a pas déclaré
 * tombe du côté qui ATTEND, jamais du côté qui part.
 */

describe('#2378.9 — le vocabulaire de la frontière', () => {
  it('deux côtés, deux exécutions, listes fermées', () => {
    expect([...EFFECT_REACHES]).toEqual(['internal', 'external'])
    expect([...EFFECT_EXECUTIONS]).toEqual(['awaits_validation', 'runs_on_schedule'])
  })

  it('ce qui SORT attend ; ce qui est INTERNE part à l’heure dite', () => {
    expect(executionForReach('external')).toBe('awaits_validation')
    expect(executionForReach('internal')).toBe('runs_on_schedule')
  })

  it('le côté par DÉFAUT d’une nature non déclarée est celui qui attend', () => {
    expect(UNDECLARED_EFFECT_REACH).toBe('external')
    expect(executionForReach(UNDECLARED_EFFECT_REACH)).toBe('awaits_validation')
  })

  it('une clé ABSENTE de la table tombe du côté qui attend — jamais du côté qui part', () => {
    const table: Record<'reminder', EffectReach> = { reminder: 'internal' }
    expect(reachFromTable(table, 'reminder')).toBe('internal')
    // Une nature qu'aucun développeur n'a encore déclarée : `sms`, `whatsapp`,
    // `linkedin_invite`. Aucune n'est dans la table — toutes attendent.
    for (const undeclared of ['sms', 'whatsapp', 'linkedin_invite', '']) {
      expect(reachFromTable(table, undeclared)).toBe('external')
    }
  })

  it('une table ne peut pas faire partir ce qu’elle n’a pas déclaré, même en mentant sur son type', () => {
    // Le cas qui a produit ce défaut ailleurs : une valeur venue de la BASE
    // (colonne `kind` élargie par une migration) arrive dans du code dont le
    // type dit qu'elle est impossible. `reachFromTable` ne la croit pas.
    const table = { email: 'external', reminder: 'internal' } as Record<string, EffectReach>
    expect(reachFromTable(table, 'video_message')).toBe('external')
  })
})

describe('#2378.9 — le constructeur de séquences déclare chaque nature d’étape', () => {
  it('toute nature du contrat est déclarée, et rien de plus', () => {
    expect(Object.keys(OUTREACH_STEP_REACH).sort()).toEqual([...outreachStepKindSchema.options].sort())
  })

  it('un e-mail SORT ; un rappel et une tâche sont internes', () => {
    expect(outreachStepReach('email')).toBe('external')
    expect(outreachStepReach('reminder')).toBe('internal')
    expect(outreachStepReach('task')).toBe('internal')
  })

  it('une étape programmée qui SORT attend une validation, même lancée', () => {
    expect(outreachStepExecution('email')).toBe('awaits_validation')
    expect(outreachStepExecution('reminder')).toBe('runs_on_schedule')
    expect(outreachStepExecution('task')).toBe('runs_on_schedule')
  })

  it('une nature d’étape NEUVE, non déclarée, attend — c’est ce qui rend la règle tenable', () => {
    expect(outreachStepReach('sms')).toBe('external')
    expect(outreachStepExecution('sms')).toBe('awaits_validation')
  })

  it('toutes les étapes des six modèles livrés ont un côté déclaré', () => {
    const kinds = Object.values(OUTREACH_SEQUENCE_TEMPLATES).flatMap(template => template.steps.map(step => step.kind))
    expect(kinds.length).toBeGreaterThan(0)
    for (const kind of kinds) expect(Object.keys(OUTREACH_STEP_REACH)).toContain(kind)
  })
})

describe('#2378.9 — les deux tables parlent la MÊME langue (GA-26)', () => {
  it('`reachesOutsideProduct` rend exactement le côté `external` du vocabulaire partagé', () => {
    for (const intentType of actionIntentTypeSchema.options) {
      expect(reachesOutsideProduct(intentType)).toBe(
        intentType === 'send_email' || intentType === 'create_calendar_event',
      )
    }
  })

  it('un intent INCONNU de la table des intents attend, lui aussi', () => {
    // @ts-expect-error — la table est exhaustive au compilateur ; ce test vise
    // la valeur qui arrive d'ailleurs (BDD, JSON d'un workflow importé).
    expect(reachesOutsideProduct('post_on_linkedin')).toBe(true)
  })
})
