import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3939.a (craft rule n°9) — l'onglet Veille montre désormais les hypothèses
 * qualifiées ET leurs signaux fondateurs (`WatchHypothesesPanel`). La salle doit
 * montrer le cas : au moins un dossier porte des hypothèses, et chaque
 * identifiant cité (`based_on_signal_ids`) retrouve un signal semé du MÊME
 * dossier — sinon le panneau afficherait une hypothèse sans fondateur.
 */
type Hypothesis = { hypothesis?: string | null; based_on_signal_ids?: string[] }

function hypothesesOf(rawAnalysis: Record<string, unknown>): Hypothesis[] {
  const list = rawAnalysis['qualified_hypotheses']
  return Array.isArray(list) ? (list as Hypothesis[]) : []
}

function signalIdsOf(rawAnalysis: Record<string, unknown>): Set<string> {
  const list = rawAnalysis['recent_signals']
  if (!Array.isArray(list)) return new Set()
  return new Set(
    list
      .map(signal => (signal && typeof signal === 'object' ? (signal as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  )
}

describe('démo — hypothèses qualifiées et signaux fondateurs (#3939.a)', () => {
  it('au moins un dossier de la salle porte des hypothèses rattachées à ses signaux', () => {
    const linked = DEMO_DOSSIERS.filter(dossier =>
      hypothesesOf(dossier.account.raw_analysis).some(h => (h.based_on_signal_ids ?? []).length > 0),
    )
    expect(linked.length).toBeGreaterThan(0)
  })

  it('chaque identifiant cité retrouve un signal semé du même dossier', () => {
    for (const dossier of DEMO_DOSSIERS) {
      const ids = signalIdsOf(dossier.account.raw_analysis)
      for (const hypothesis of hypothesesOf(dossier.account.raw_analysis)) {
        for (const cited of hypothesis.based_on_signal_ids ?? []) {
          expect({ company: dossier.account.company_name, cited, found: ids.has(cited) }).toMatchObject({
            found: true,
          })
        }
      }
    }
  })
})
