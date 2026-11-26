import { describe, expect, it } from 'vitest'
import { parseAccountAnalysis } from './account-analysis.js'
import { qualifiedHypothesisSchema, recentSignalSchema } from './research.js'

/**
 * #2687 — le LIEN hypothèse qualifiée → signal traverse le contrat.
 *
 * Rien ne reliait les deux dans ce qui existait : `based_on_signals` est du
 * texte libre reformulé, le signal n'avait pas d'identifiant, et les hypothèses
 * n'étaient même pas DÉCLARÉES ici — `parseAccountAnalysis` ne garde que les
 * clés de `accountAnalysisShape`, donc `qualified_hypotheses` était jeté avant
 * d'atteindre le web. L'angle ESN existait et personne ne pouvait le lire.
 */

describe('#2687 — le signal porte un identifiant citable', () => {
  it('garde l’`id` que l’analyse pose sur le signal', () => {
    const parsed = recentSignalSchema.parse({ signal: 'recrute 12 data engineers', id: 's3' })
    expect(parsed.id).toBe('s3')
  })

  it('reste lisible sur une analyse écrite AVANT le lien (aucun `id`)', () => {
    // Additif seulement : des milliers d'analyses n'ont pas la clé. Absent se
    // lit « ce signal n'est cité par aucune hypothèse », jamais un index deviné.
    const parsed = recentSignalSchema.parse({ signal: 'x' })
    expect(parsed.id).toBeUndefined()
  })
})

describe('#2687 — l’hypothèse qualifiée entre au contrat', () => {
  it('garde les `id` cités, l’angle ESN et la première action', () => {
    const parsed = qualifiedHypothesisSchema.parse({
      hypothesis: 'industrialise ses modèles ML',
      based_on_signals: ['recrut. data', 'plateforme'],
      based_on_signal_ids: ['s1', 's4'],
      confidence: 'probable',
      esn_angle: 'renfort MLOps',
      first_action: 'cadrer le besoin avec le CDO',
    })
    expect(parsed.based_on_signal_ids).toEqual(['s1', 's4'])
    expect(parsed.esn_angle).toBe('renfort MLOps')
    expect(parsed.first_action).toBe('cadrer le besoin avec le CDO')
  })

  it('accepte une hypothèse sans lien : l’absence de `id` n’est pas une erreur', () => {
    const parsed = qualifiedHypothesisSchema.parse({ hypothesis: 'migre vers le cloud' })
    expect(parsed.based_on_signal_ids).toBeUndefined()
  })
})

describe('#2687 — `parseAccountAnalysis` ne jette plus les hypothèses', () => {
  it('garde `qualified_hypotheses`, camelCase de l’IA comprise', () => {
    // Le service IA écrit en camelCase (`model_dump(by_alias=True)`) ; la
    // première passe de `parseAccountAnalysis` renomme. C'est cette forme-là qui
    // arrive des analyses réelles.
    const analysis = parseAccountAnalysis({
      recentSignals: [{ signal: 'recrute 12 data engineers', id: 's1' }],
      qualifiedHypotheses: [
        {
          hypothesis: 'industrialise ses modèles ML',
          basedOnSignalIds: ['s1'],
          esnAngle: 'renfort MLOps',
          firstAction: 'cadrer le besoin avec le CDO',
        },
      ],
    })
    expect(analysis.recent_signals?.[0]?.id).toBe('s1')
    expect(analysis.qualified_hypotheses).toHaveLength(1)
    expect(analysis.qualified_hypotheses?.[0]?.based_on_signal_ids).toEqual(['s1'])
    expect(analysis.qualified_hypotheses?.[0]?.esn_angle).toBe('renfort MLOps')
    expect(analysis.qualified_hypotheses?.[0]?.first_action).toBe('cadrer le besoin avec le CDO')
  })

  it('une analyse sans hypothèse reste une analyse — pas de tableau fabriqué', () => {
    const analysis = parseAccountAnalysis({ recentSignals: [{ signal: 'x' }] })
    expect(analysis.qualified_hypotheses).toBeUndefined()
  })
})
