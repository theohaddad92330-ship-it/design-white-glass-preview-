import { describe, expect, it } from 'vitest'
import { UNKNOWN_ANSWER_LABELS } from '@bellum/contracts'
import { THEMES } from '@/features/onboarding/lib/theme-catalog'
import { buildFramingExport, framingToJson, framingToText } from '@/features/onboarding/lib/framing-export'

const t = (key: string): string => key
const [a, b, c] = THEMES[0]!.questions

describe('buildFramingExport — Emporter ton cadrage (Théo O onboarding-relecture.N4)', () => {
  it('ne contient que les questions ayant une réponse ou un statut — jamais une ligne vide inventée', () => {
    const rows = buildFramingExport({ [a!.key]: 'Altimance' }, { [b!.key]: 'answer_later' })
    expect(rows.map(r => r.key)).toEqual([a!.key, b!.key])
  })

  it('nomme le statut de chaque ligne', () => {
    const rows = buildFramingExport(
      { [a!.key]: 'Altimance', [c!.key]: UNKNOWN_ANSWER_LABELS.not_applicable },
      { [b!.key]: 'to_verify_with_team' },
    )
    expect(rows.find(r => r.key === a!.key)?.status).toBe('answered')
    expect(rows.find(r => r.key === b!.key)?.status).toBe('to_verify_with_team')
    expect(rows.find(r => r.key === c!.key)?.status).toBe('not_applicable')
  })

  it('une valeur qui n’est qu’un statut n’est jamais exportée comme une réponse mesurée', () => {
    const rows = buildFramingExport({ [c!.key]: UNKNOWN_ANSWER_LABELS.not_applicable }, {})
    expect(rows[0]!.value).toBeNull()
  })

  it('le JSON redonne les statuts, le texte range par thème', () => {
    const rows = buildFramingExport({ [a!.key]: 'Altimance' }, {})
    expect(JSON.parse(framingToJson(rows))).toMatchObject({
      answers: [{ key: a!.key, status: 'answered', value: 'Altimance' }],
    })
    expect(framingToText(rows, t)).toContain('Altimance')
    expect(framingToText(rows, t)).toContain(THEMES[0]!.labelKey)
  })

  it('un cadrage sans aucune réponse ne fabrique aucune ligne', () => {
    expect(buildFramingExport({}, {})).toEqual([])
  })
})
