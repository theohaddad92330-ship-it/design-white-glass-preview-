import {
  COST_SPIKE_BASELINE_DAYS,
  COST_SPIKE_RATIO,
  detectDailyCostSpike,
  overThreshold,
  readThresholdUsd,
  summariseCosts,
  type CostRow,
  type DailyCostPoint,
} from './cost-alert'

/**
 * Ce que ces tests défendent : un chiffre d'alerte qui SOUS-ESTIME est pire que
 * pas d'alerte du tout — il rassure.
 *
 * Le registre contient des lignes dont le coût est inconnu (fournisseur non
 * tarifé sur cet environnement). Les compter comme des zéros ferait passer un
 * espace dispendieux pour un espace sage : c'est exactement le mécanisme qui a
 * fait croire qu'un run coûtait 0,75 € quand la console facturait sept fois plus.
 */

const row = (partial: Partial<CostRow>): CostRow => ({
  workspaceId: 'ws1',
  costUsd: 1,
  provider: 'anthropic',
  ...partial,
})

describe('summariseCosts', () => {
  it('additionne par espace et classe les fournisseurs du plus cher au moins cher', () => {
    const summaries = summariseCosts([
      row({ costUsd: 2, provider: 'anthropic' }),
      row({ costUsd: 0.5, provider: 'firecrawl' }),
      row({ costUsd: 1, provider: 'anthropic' }),
      row({ workspaceId: 'ws2', costUsd: 10, provider: 'apollo' }),
    ])

    expect(summaries[0]?.workspaceId).toBe('ws2')
    const first = summaries.find(entry => entry.workspaceId === 'ws1')
    expect(first?.totalUsd).toBe(3.5)
    expect(first?.providers.map(p => p.provider)).toEqual(['anthropic', 'firecrawl'])
  })

  it('une ligne NON TARIFÉE sort du total et se compte à part', () => {
    // « Non tarifé » ne veut pas dire « gratuit ». L'absorber comme un zéro
    // ferait passer une consommation réelle pour rien.
    const summaries = summariseCosts([row({ costUsd: 1 }), row({ costUsd: null }), row({ costUsd: null })])

    expect(summaries[0]?.totalUsd).toBe(1)
    expect(summaries[0]?.unpricedLines).toBe(2)
  })

  it('les additions de flottants restent lisibles', () => {
    const summaries = summariseCosts([row({ costUsd: 0.1 }), row({ costUsd: 0.2 })])

    expect(summaries[0]?.totalUsd).toBe(0.3)
  })

  it('une dépense hors espace de travail n’est pas jetée', () => {
    // Une tâche de fond consomme sans appartenir à un espace : la faire
    // disparaître masquerait une dépense bien réelle.
    const summaries = summariseCosts([row({ workspaceId: null, costUsd: 4 })])

    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.workspaceId).toBeNull()
  })
})

describe('overThreshold', () => {
  const summaries = summariseCosts([row({ costUsd: 5 }), row({ workspaceId: 'ws2', costUsd: 1 })])

  it('ne retient que ce qui dépasse VRAIMENT', () => {
    expect(overThreshold(summaries, 4).map(entry => entry.workspaceId)).toEqual(['ws1'])
    expect(overThreshold(summaries, 5)).toEqual([])
  })

  it('un seuil absent ou aberrant ne déclenche rien', () => {
    // Une alerte qui part sur un réglage mal saisi apprend à ignorer les
    // alertes — ce qui coûte plus cher que de ne pas en avoir.
    expect(overThreshold(summaries, null)).toEqual([])
    expect(overThreshold(summaries, 0)).toEqual([])
    expect(overThreshold(summaries, Number.NaN)).toEqual([])
  })
})

describe('readThresholdUsd', () => {
  it('lit un seuil valide et refuse le reste', () => {
    expect(readThresholdUsd('12.5')).toBe(12.5)
    expect(readThresholdUsd(' 30 ')).toBe(30)
    expect(readThresholdUsd(undefined)).toBeNull()
    expect(readThresholdUsd('')).toBeNull()
    expect(readThresholdUsd('beaucoup')).toBeNull()
    expect(readThresholdUsd('-5')).toBeNull()
  })
})

/**
 * #1661 — « Un coût quotidien > 150 % de la médiane 7 jours remonte dans la
 * file de décision. »
 *
 * Ce que ces tests défendent, autant que le seuil : **une médiane qui n'existe
 * pas ne produit AUCUNE alerte.** Pas de données ⇒ pas de pic. Une alarme
 * allumée par un trou de données n'est plus une alarme — c'est ce qui apprend à
 * les ignorer, et une alerte ignorée coûte plus cher qu'une alerte absente.
 */
describe('detectDailyCostSpike (#1661)', () => {
  /** Sept journées au même coût : une médiane franche, faite pour être dépassée. */
  function septJoursA(cout: number): DailyCostPoint[] {
    return Array.from({ length: 7 }, (_, index) => ({
      day: `2026-09-0${index + 1}`,
      costUsd: cout,
    }))
  }

  it('les deux repères vivent ICI, et nulle part ailleurs', () => {
    // La file de décision (#1647) importe ces deux constantes plutôt que de les
    // recopier : deux dérivations du même seuil divergent à la première
    // modification de l'une des deux.
    expect(COST_SPIKE_RATIO).toBe(1.5)
    expect(COST_SPIKE_BASELINE_DAYS).toBe(7)
  })

  it('dit OUI — une journée au-delà de 150 % de la médiane EST un pic', () => {
    const verdict = detectDailyCostSpike([...septJoursA(10), { day: '2026-09-08', costUsd: 16 }], '2026-09-08')

    expect(verdict).toEqual({
      spike: true,
      day: '2026-09-08',
      costUsd: 16,
      medianUsd: 10,
      ratio: 1.6,
      thresholdUsd: 15,
    })
  })

  it('dit NON — exactement 150 % n’est pas un dépassement', () => {
    // Le seuil est STRICT : « > 150 % ». Une journée pile à 15 $ sur une
    // médiane de 10 $ est la limite, pas le dérapage.
    const verdict = detectDailyCostSpike([...septJoursA(10), { day: '2026-09-08', costUsd: 15 }], '2026-09-08')

    expect(verdict).toEqual({
      spike: false,
      reason: 'under_threshold',
      day: '2026-09-08',
      costUsd: 15,
      medianUsd: 10,
      ratio: 1.5,
      thresholdUsd: 15,
    })
  })

  it('SIX journées ne font pas une médiane 7 jours — aucun verdict', () => {
    // La règle jumelle du seuil. Six jours suffiraient techniquement à calculer
    // une médiane ; ce n'est pas celle qu'on a promise.
    const history = [...septJoursA(10).slice(0, 6), { day: '2026-09-08', costUsd: 999 }]

    expect(detectDailyCostSpike(history, '2026-09-08')).toEqual({
      spike: false,
      reason: 'not_enough_days',
      observedDays: 6,
      requiredDays: 7,
    })
  })

  it('une médiane à ZÉRO ne produit aucune alerte — c’est un trou, pas un pic', () => {
    // Sept journées à 0 $ : n'importe quel centime serait « infiniment
    // au-dessus ». C'est la signature d'un registre qui n'écrivait pas.
    const history = [...septJoursA(0), { day: '2026-09-08', costUsd: 0.01 }]

    expect(detectDailyCostSpike(history, '2026-09-08')).toEqual({
      spike: false,
      reason: 'baseline_is_zero',
      observedDays: 7,
    })
  })

  it('une journée NON MESURÉE ne peut pas être un pic', () => {
    // Elle n'est simplement pas dans l'historique : « 0 $ » y serait une
    // affirmation qu'on ne peut pas faire.
    expect(detectDailyCostSpike(septJoursA(10), '2026-09-08')).toEqual({
      spike: false,
      reason: 'day_not_measured',
      day: '2026-09-08',
    })
  })

  it('n’attrape pas ce qu’elle ne vise pas — la journée évaluée sort de sa propre médiane', () => {
    // Le piège : si la journée à 60 $ entrait dans la ligne de base, elle
    // tirerait la médiane vers le haut et se cacherait elle-même. Ici, la
    // médiane reste celle des SEPT journées antérieures.
    const verdict = detectDailyCostSpike([...septJoursA(10), { day: '2026-09-08', costUsd: 60 }], '2026-09-08')

    expect(verdict.spike).toBe(true)
    expect(verdict).toMatchObject({ medianUsd: 10, ratio: 6 })
  })

  it('ne lit que les SEPT journées les plus récentes, quel que soit l’ordre reçu', () => {
    // L'historique arrive trié par le SQL, mais rien dans la signature ne
    // l'impose : une dérivation qui dépendrait de l'ordre d'entrée serait une
    // bombe à retardement. Les vingt journées d'août à 100 $ ne doivent PAS
    // entrer dans la médiane — elles feraient disparaître le pic.
    const vieux = Array.from({ length: 20 }, (_, index) => ({
      day: `2026-08-${String(index + 1).padStart(2, '0')}`,
      costUsd: 100,
    }))
    const history = [{ day: '2026-09-08', costUsd: 16 }, ...septJoursA(10), ...vieux]

    expect(detectDailyCostSpike([...history].reverse(), '2026-09-08')).toEqual({
      spike: true,
      day: '2026-09-08',
      costUsd: 16,
      medianUsd: 10,
      ratio: 1.6,
      thresholdUsd: 15,
    })
  })

  it('une journée POSTÉRIEURE ne pèse jamais dans la ligne de base', () => {
    // `point.day < day` compare des chaînes `YYYY-MM-DD`, ce qui est un ordre
    // chronologique correct — et c'est la seule raison pour laquelle ce fichier
    // n'a besoin d'aucune horloge.
    const history = [...septJoursA(10), { day: '2026-09-08', costUsd: 16 }, { day: '2026-09-30', costUsd: 1000 }]

    expect(detectDailyCostSpike(history, '2026-09-08')).toMatchObject({ spike: true, medianUsd: 10 })
  })
})
