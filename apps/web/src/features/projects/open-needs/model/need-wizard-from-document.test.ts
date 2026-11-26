import { describe, expect, it } from 'vitest'
import type { MissionExtraction } from '@/features/missions/mission-extraction'
import { applyMissionExtractionToDraft, emptyNeedWizardDraft } from './need-wizard'

// #2560 — « Depuis un contrat / une fiche de poste (PDF, DOCX) » : une extraction est une
// PROPOSITION. Elle pré-remplit le brouillon, champ par champ, jamais au-delà de ce que le
// document dit — et ne choisit JAMAIS le compte à la place de l'utilisateur.
function extraction(
  over: Partial<MissionExtraction['fields']> = {},
  status: MissionExtraction['status'] = 'ok',
): MissionExtraction {
  const empty = { value: null, confidence: 0, sourceExcerpt: '' }
  return {
    status,
    costUsd: null,
    fields: {
      accountName: { value: 'ACME Industries', confidence: 0.9, sourceExcerpt: 'Client : ACME Industries' },
      roleTitle: { value: 'Architecte cloud', confidence: 0.9, sourceExcerpt: 'Poste : Architecte cloud' },
      startedOn: { value: '2026-11-03', confidence: 0.9, sourceExcerpt: 'à compter du 3 novembre 2026' },
      endsOn: empty,
      dailyRate: { value: 650, confidence: 0.8, sourceExcerpt: 'TJM 650 €' },
      days: empty,
      ...over,
    },
  }
}

describe('applyMissionExtractionToDraft (#2560)', () => {
  it('pré-remplit l’intitulé, le démarrage et le TJM (en centimes)', () => {
    const next = applyMissionExtractionToDraft(emptyNeedWizardDraft(), extraction())
    expect(next.title).toBe('Architecte cloud')
    expect(next.start_on).toBe('2026-11-03')
    expect(next.target_tjm_cents).toBe(65_000)
  })

  it('un champ non lu reste vide, jamais deviné', () => {
    const next = applyMissionExtractionToDraft(
      emptyNeedWizardDraft(),
      extraction({
        roleTitle: { value: null, confidence: 0, sourceExcerpt: '' },
        dailyRate: { value: null, confidence: 0, sourceExcerpt: '' },
      }),
    )
    expect(next.title).toBe('')
    expect(next.target_tjm_cents).toBeNull()
  })

  it('ne choisit jamais le compte : le nom lu dans le document n’est qu’une indication', () => {
    const next = applyMissionExtractionToDraft(emptyNeedWizardDraft(), extraction())
    expect(next.accountId).toBe('')
    expect(next.projectId).toBe('')
  })

  it('une lecture échouée ne touche pas au brouillon', () => {
    const draft = { ...emptyNeedWizardDraft(), title: 'Déjà saisi' }
    expect(applyMissionExtractionToDraft(draft, extraction({}, 'unreadable'))).toEqual(draft)
  })

  it('ne remplace pas ce que l’utilisateur a déjà saisi', () => {
    const draft = { ...emptyNeedWizardDraft(), title: 'Mon titre', target_tjm_cents: 70_000 }
    const next = applyMissionExtractionToDraft(draft, extraction())
    expect(next.title).toBe('Mon titre')
    expect(next.target_tjm_cents).toBe(70_000)
    expect(next.start_on).toBe('2026-11-03')
  })
})
