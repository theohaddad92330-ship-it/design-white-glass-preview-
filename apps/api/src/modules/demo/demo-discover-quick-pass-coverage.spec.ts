import { buildDiscoverQuickPassEntry } from '@bellum/contracts'
import { DEMO_DISCOVER_QUICK_PASS_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #2630.1 — « et en démonstration, la passe rapide montre quoi ? »
 *
 * Craft rule n°9 : la passe rapide n'a ni table ni clé `raw_analysis` à elle,
 * donc la garde par table ne poserait jamais la question. Ce fichier est
 * l'appelant, et il ne relit PAS le commentaire de `demo-coverage.ts` : il fait
 * tourner le verdict partagé sur la réponse SCRIPTÉE réelle.
 *
 * ⚠️ Volontairement SANS `discoverResponseSchema.parse`, pour la raison déjà
 * écrite dans `demo-discover-qualification-masking-coverage.spec.ts` : plusieurs
 * champs que la passe rapide lit ne sont pas déclarés dans
 * `discoverCandidateSchema`, et `.parse` les retirerait en silence — la garde
 * passerait alors au vert sur une réponse devenue muette.
 *
 * ⚠️ L'AXE ACCÈS EST DÉLIBÉRÉMENT POSÉ À `inconnu` ICI. Sa dérivation vit côté
 * web (`discoverAccessLevel`, #2646.1) et la recopier ferait un second moteur
 * (GA-26). `inconnu` est l'hypothèse la PLUS PESSIMISTE — l'axe sort du
 * dénominateur : si un verdict sort quand même, il sort a fortiori dans
 * l'application. La preuve ne dépend donc d'aucun code non partagé.
 */
type ScriptedCandidate = {
  name: string
  siren: string
  score: number | null
  scoreMax: number | null
  signals: unknown[]
  signalsSearched?: boolean
  people?: unknown[]
}

function quickPassOverDemo() {
  const response = demoDiscoverResponse({}) as { candidates: ScriptedCandidate[] }
  return response.candidates.map(candidate =>
    buildDiscoverQuickPassEntry({
      siren: candidate.siren,
      name: candidate.name,
      interest: { score: candidate.score, scoreMax: candidate.scoreMax },
      access: { level: 'inconnu' },
      signal: { searched: candidate.signalsSearched === true, count: candidate.signals.length },
      namedContact: { count: candidate.people ? candidate.people.length : null },
    }),
  )
}

describe('#2630.1 — la passe rapide, en démonstration', () => {
  it('est classée seedée, avec sa raison', () => {
    expect(DEMO_DISCOVER_QUICK_PASS_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_QUICK_PASS_COVERAGE.reason).toContain('#2630.1')
  })

  it('la garde lit bien un corpus — sinon elle passerait au vert sur du vide', () => {
    expect(quickPassOverDemo().length).toBeGreaterThan(0)
  })

  it('au moins un compte de la salle rend un VERDICT — la passe n’y est pas muette', () => {
    const verdicts = quickPassOverDemo()
      .map(entry => entry.verdict)
      .filter((verdict): verdict is 'go' | 'prudence' | 'non' => verdict !== null)
    // Si ce test tombe : la liste scriptée a perdu son score ou ses signaux, et
    // le visiteur ne verrait qu'une colonne de « pas assez d'éléments ».
    expect(verdicts.length).toBeGreaterThan(0)
  })

  it('au moins un compte montre l’AUTRE moitié : un axe non évaluable, NOMMÉ', () => {
    const named = quickPassOverDemo().filter(entry => entry.unevaluableAxes.length > 0)
    expect(named.length).toBeGreaterThan(0)
    for (const entry of named) {
      for (const axis of entry.axes.filter(item => item.state === null)) {
        // Nommé ET motivé — « deux axes non évaluables » n'apprend rien.
        expect(axis.unevaluable).toBeTruthy()
        // …et jamais chiffré : un axe non évaluable ne porte aucune mesure.
        expect(axis.measured).toBeNull()
      }
    }
  })

  it('aucune raison affichée ne chiffre une chance — le contrat l’aurait refusée', () => {
    for (const entry of quickPassOverDemo()) {
      expect(entry.reason).not.toMatch(/%|probabilit|chance/i)
    }
  })

  it('les personnes collectées et NON collectées coexistent dans la salle', () => {
    const response = demoDiscoverResponse({}) as { candidates: ScriptedCandidate[] }
    // C'est ce qui rend les DEUX moitiés de la règle visibles sans geste : une
    // ligne où l'axe se pèse, une ligne où il est nommé comme non évaluable.
    expect(response.candidates.some(candidate => candidate.people !== undefined)).toBe(true)
    expect(response.candidates.some(candidate => candidate.people === undefined)).toBe(true)
  })
})
