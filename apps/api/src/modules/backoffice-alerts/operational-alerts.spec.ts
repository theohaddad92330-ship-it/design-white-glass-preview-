import {
  MIN_ANALYSIS_SAMPLE,
  MIN_COST_HISTORY_DAYS,
  analysisFailureRateExceeds,
  apiUnavailable,
  costExceedsMedian,
  stuckAnalysisJobsExceed,
} from './operational-alerts'

/** Une connexion JAMAIS établie — `dispatchFailureOutcome` (`@bellum/contracts`)
 *  la classe `failed` : rejouable, un vrai incident. */
function connexionJamaisEtablie(code: string): Error {
  return Object.assign(new Error(`connect ${code}`), { code })
}

/** Une requête PARTIE sans réponse — `dispatchFailureOutcome` la classe
 *  `unknown` : on ne sait pas, ce n'est ni sain ni en défaut. */
function requetePartieSansReponse(code: string): Error {
  return Object.assign(new Error(`read ${code}`), { code })
}

describe('costExceedsMedian — coût quotidien > 200% de la médiane', () => {
  it('non mesuré sous le plancher d’historique — jamais un faux "sain"', () => {
    const measure = costExceedsMedian([10, 12], 500)
    expect(measure.state).toBe('unmeasured')
  })

  it('mesuré et sain quand le jour reste dans la médiane', () => {
    const measure = costExceedsMedian([10, 12, 11, 9], 15)
    expect(measure).toEqual({ state: 'measured', breached: false, sample: 4 })
  })

  it('sait dire NON — un jour à plus de 200% de la médiane déclenche', () => {
    const measure = costExceedsMedian([10, 12, 11, 9], 25)
    expect(measure.state).toBe('measured')
    if (measure.state === 'measured') {
      expect(measure.breached).toBe(true)
      if (measure.breached) expect(measure.detail).toContain('médiane')
    }
  })

  it('n’attrape pas ce qu’elle ne vise pas — exactement 200% ne déclenche pas (borne stricte >)', () => {
    const measure = costExceedsMedian([10, 10, 10], 20)
    expect(measure).toEqual({ state: 'measured', breached: false, sample: 3 })
  })

  it('une médiane nulle ne peut jamais être "dépassée" — non mesuré, pas un zéro qui ment', () => {
    const measure = costExceedsMedian([0, 0, 0], 5)
    expect(measure.state).toBe('unmeasured')
  })

  it('le plancher est bien celui documenté', () => {
    expect(MIN_COST_HISTORY_DAYS).toBe(3)
  })
})

describe('analysisFailureRateExceeds — taux d’échec > 20% sur 1h', () => {
  it('non mesuré sous le plancher d’échantillon', () => {
    const measure = analysisFailureRateExceeds(['error', 'error'])
    expect(measure.state).toBe('unmeasured')
  })

  it('exclut les runs encore en vol ou annulés du dénominateur', () => {
    const statuses = ['completed', 'completed', 'completed', 'completed', 'analyzing', 'canceled']
    const measure = analysisFailureRateExceeds(statuses)
    // 4 conclus (tous "completed"), 0 échec — mesuré, sain, sample = 4 (< plancher 5)
    expect(measure.state).toBe('unmeasured')
  })

  it('sait dire NON — un taux au-delà du seuil déclenche avec son détail', () => {
    const statuses = ['error', 'error', 'error', 'completed', 'completed']
    const measure = analysisFailureRateExceeds(statuses)
    expect(measure.state).toBe('measured')
    if (measure.state === 'measured') {
      expect(measure.breached).toBe(true)
      if (measure.breached) expect(measure.detail).toContain('%')
    }
  })

  it('un taux sous le seuil ne déclenche rien', () => {
    const statuses = ['error', 'completed', 'completed', 'completed', 'completed']
    const measure = analysisFailureRateExceeds(statuses)
    expect(measure).toEqual({ state: 'measured', breached: false, sample: 5 })
  })

  it('le plancher est bien celui documenté', () => {
    expect(MIN_ANALYSIS_SAMPLE).toBe(5)
  })
})

/**
 * #1676.1 — les deux mesures NEUVES de ce lot : `api_indisponible` (sonde DB
 * réelle) et `job_bloque` (ancienneté d'un run encore `analyzing` au-delà du
 * délai dur du worker). Même exigence que les deux `describe` ci-dessus :
 * savoir dire NON, et ne pas attraper ce qu'elles ne visent pas.
 *
 * ⚠️ `apiUnavailable` reçoit maintenant l'ERREUR BRUTE de la sonde (pas un
 * `{ok, detail}` déjà résumé) : la classification « échec confirmé / on ne
 * sait pas » doit rester À L'INTÉRIEUR de ce fichier pur, testable sans DB —
 * exactement la même raison que `median()` ci-dessus n'est pas dans le
 * service. Elle réemploie `dispatchFailureOutcome` (`@bellum/contracts`),
 * la SEULE dérivation du dépôt qui répond à « la requête a-t-elle pu
 * partir ? » (GA-26 — l'écrire une seconde fois ici divergerait).
 */
describe('apiUnavailable — api_indisponible (sonde DB réelle, pas une santé déclarée)', () => {
  it('sain n’est jamais déclaré : une sonde qui répond rend measured/breached:false', () => {
    const mesure = apiUnavailable({ ok: true })
    expect(mesure).toEqual({ state: 'measured', breached: false, sample: 1 })
  })

  it('sait dire NON — une connexion jamais établie (échec rejouable) rend measured/breached:true avec le détail RÉEL', () => {
    const mesure = apiUnavailable({ ok: false, error: connexionJamaisEtablie('ECONNREFUSED') })
    expect(mesure.state).toBe('measured')
    if (mesure.state === 'measured') {
      expect(mesure.breached).toBe(true)
      if (mesure.breached) expect(mesure.detail).toContain('ECONNREFUSED')
    }
  })

  describe('échec rejouable contre `unknown` — « la requête a-t-elle pu PARTIR ? »', () => {
    it('une connexion jamais établie (ECONNREFUSED) est un échec CONFIRMÉ — breached:true', () => {
      const mesure = apiUnavailable({ ok: false, error: connexionJamaisEtablie('ECONNREFUSED') })
      expect(mesure).toMatchObject({ state: 'measured', breached: true })
    })

    it('une requête partie sans réponse (ECONNRESET) est `unknown` — jamais « tout va bien », jamais un faux défaut', () => {
      const mesure = apiUnavailable({ ok: false, error: requetePartieSansReponse('ECONNRESET') })
      expect(mesure.state).toBe('unmeasured')
      // Ni breached:true (crierait au loup sur un hoquet réseau), ni
      // breached:false (annoncerait une santé qu'on n'a pas observée).
      expect(mesure).not.toHaveProperty('breached')
    })

    it('⚠️ `UND_ERR_CONNECT_TIMEOUT` porte le mot « timeout » et n’en est pas un — classé échec, pas `unknown`', () => {
      const mesure = apiUnavailable({ ok: false, error: connexionJamaisEtablie('UND_ERR_CONNECT_TIMEOUT') })
      expect(mesure).toMatchObject({ state: 'measured', breached: true })
    })

    it('une mesure impossible (`unknown`) ne dit JAMAIS « tout va bien » — jamais measured/breached:false non plus', () => {
      const mesure = apiUnavailable({ ok: false, error: requetePartieSansReponse('ETIMEDOUT') })
      expect(mesure.state).not.toBe('measured')
      expect(mesure.state).toBe('unmeasured')
      if (mesure.state === 'unmeasured') expect(mesure.reason.length).toBeGreaterThan(0)
    })
  })

  it('n’attrape pas ce qu’elle ne vise pas — une erreur non reconnue reste un échec confirmé (défaut prudent, pas un flou)', () => {
    const mesure = apiUnavailable({ ok: false, error: new Error('quelque chose de jamais vu') })
    expect(mesure).toMatchObject({ state: 'measured', breached: true })
  })
})

describe('stuckAnalysisJobsExceed — job_bloque (ancienneté d’un run encore `analyzing`)', () => {
  it('n’attrape pas ce qu’elle ne vise pas — aucun run bloqué → mesuré, sain', () => {
    const mesure = stuckAnalysisJobsExceed({ staleCount: 0, oldestAgeMinutes: null })
    expect(mesure).toEqual({ state: 'measured', breached: false, sample: 0 })
  })

  it('sait dire NON — un seul run bloqué suffit (pas de seuil d’échantillon, contrairement au taux d’échec)', () => {
    const mesure = stuckAnalysisJobsExceed({ staleCount: 1, oldestAgeMinutes: 25 })
    expect(mesure.state).toBe('measured')
    if (mesure.state === 'measured') expect(mesure.breached).toBe(true)
  })

  it('le détail porte le compte ET l’ancienneté du plus vieux run', () => {
    const mesure = stuckAnalysisJobsExceed({ staleCount: 3, oldestAgeMinutes: 47 })
    expect(mesure).toEqual({
      state: 'measured',
      breached: true,
      sample: 3,
      detail: expect.stringContaining('47'),
    })
    expect((mesure as { detail: string }).detail).toContain('3')
  })
})
