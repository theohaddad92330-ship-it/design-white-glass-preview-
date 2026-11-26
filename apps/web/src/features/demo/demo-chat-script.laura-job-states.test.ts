import { describe, expect, it } from 'vitest'
import { lauraJobInitialStatus, lauraJobViewSchema, type LauraJobView } from '@bellum/contracts'
import { demoTurn } from '@/features/chat/api/demo-turn'
import { DEMO_CHAT_PROMPTS } from './demo-chat-script'

/**
 * Craft rule n°9 — les états « Obsolète » et « Brouillon » d'un job de Laura (#2276.22 / .29 / .31) se voient en
 * salle de démonstration : chacun porté par une amorce, servi par `demoTurn` dans la forme EXACTE du serveur
 * (`context.laura_job`), rendu par la VRAIE `LauraJobCard`.
 */
function jobOf(state: LauraJobView['state']) {
  const prompt = DEMO_CHAT_PROMPTS.find(candidate => candidate.lauraJob?.state === state)
  return { prompt, job: prompt?.lauraJob }
}

describe('salle démo — les jobs de Laura « Obsolète » et « Brouillon »', () => {
  it('le job OBSOLÈTE est remplacé dans le même fil : même demande que le job exécuté, état `superseded`', () => {
    const { prompt, job } = jobOf('superseded')
    const done = jobOf('done').job
    expect(job && lauraJobViewSchema.safeParse(job).success).toBe(true)
    expect(job?.brief.originalRequest).toBe(done?.brief.originalRequest)
    expect(job?.id).not.toBe(done?.id)
    // Obsolète : ni coût engagé, ni reprise, ni synthèse — il n'a jamais tourné.
    expect(job?.spentCredits).toBe(0)
    expect(job?.resume.resumable).toBe(false)
    expect(job?.synthesis).toBeNull()
    expect(demoTurn(prompt?.question ?? '', 'REPLI').context?.laura_job).toEqual(job)
  })

  it('le BROUILLON a des paramètres incomplets : la règle du contrat le pose en `draft`, jamais confirmable', () => {
    const { prompt, job } = jobOf('draft')
    expect(job && lauraJobViewSchema.safeParse(job).success).toBe(true)
    expect(job && lauraJobInitialStatus(job.brief)).toBe('draft')
    expect(job?.brief.assumptions.length).toBeGreaterThan(0)
    expect(job?.startedAt).toBeNull()
    expect(demoTurn(prompt?.question ?? '', 'REPLI').context?.laura_job).toEqual(job)
  })
})
