import { DEFAULT_STAGE_LABELS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import missionsEn from '@/i18n/locales/en/missions.json'
import missionsFr from '@/i18n/locales/fr/missions.json'
import pipelineSlaEn from '@/i18n/locales/en/pipelineSla.json'
import pipelineSlaFr from '@/i18n/locales/fr/pipelineSla.json'
import projectsEn from '@/i18n/locales/en/projects.json'
import projectsFr from '@/i18n/locales/fr/projects.json'

/**
 * #4335.2 — décision Louis du 19/10/2026 : l'étape finale d'une AFFAIRE se dit
 * « Signé », partout (le pipe disait « Signé », la file des besoins, le board des
 * missions et la note de SLA disaient « Gagné »). Un appel d'offres, lui, se
 * GAGNE (`rfp.json`) : il n'est pas visé.
 */
function at(bundle: unknown, path: string): string | undefined {
  const value = path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], bundle)
  return typeof value === 'string' ? value : undefined
}

describe('#4335.2 — « Signé » partout pour l’étape finale d’une affaire', () => {
  it('le pipe et ses voisins disent « Signé », jamais « Gagné »', () => {
    // ⚠️ Théo C projects-pipeline.R2 (Louis 22/10/2026) — RENVERSE ce point pour la SEULE colonne du kanban :
    // elle se lit « Gagnée » (écran de Théo). Les voisins ci-dessous (file des besoins, board, SLA) restent « Signé ».
    expect(DEFAULT_STAGE_LABELS.won.fr).toBe('Gagnée')
    const read = [
      findWon(projectsFr),
      findKey(projectsFr, 'signedSection'),
      findKey(missionsFr, 'gagnee'),
      at(pipelineSlaFr, 'wonNote'),
    ]
    expect(read.every(value => typeof value === 'string' && value.length > 0)).toBe(true)
    expect(read.filter(value => /Gagn/.test(value ?? ''))).toEqual([])
    expect(read.filter(value => /Sign/.test(value ?? ''))).toHaveLength(read.length)
  })

  it('en anglais aussi : « Signed », jamais « Won »', () => {
    const read = [
      findWon(projectsEn),
      findKey(projectsEn, 'signedSection'),
      findKey(missionsEn, 'gagnee'),
      at(pipelineSlaEn, 'wonNote'),
    ]
    expect(read.filter(value => /\bWon\b/.test(value ?? ''))).toEqual([])
    expect(read.filter(value => /Signed/.test(value ?? ''))).toHaveLength(read.length)
  })

  it('sait dire NON : un « Gagné » glissé dans une valeur lue est attrapé', () => {
    expect(['Gagné'].filter(value => /Gagn/.test(value))).toHaveLength(1)
  })
})

/** La première valeur `key` trouvée en profondeur. */
function findKey(bundle: unknown, key: string): string | undefined {
  if (!bundle || typeof bundle !== 'object') return undefined
  for (const [k, v] of Object.entries(bundle as Record<string, unknown>)) {
    if (k === key && typeof v === 'string') return v
    const deeper = findKey(v, key)
    if (deeper) return deeper
  }
  return undefined
}

/** Le `won` de la liste d'étapes qui porte aussi `negotiation` et `interview` (la file des besoins). */
function findWon(bundle: unknown): string | undefined {
  if (!bundle || typeof bundle !== 'object') return undefined
  const node = bundle as Record<string, unknown>
  if (typeof node.won === 'string' && 'interview' in node && 'negotiation' in node) return node.won
  for (const v of Object.values(node)) {
    const deeper = findWon(v)
    if (deeper) return deeper
  }
  return undefined
}
