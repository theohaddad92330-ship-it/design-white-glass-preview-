/**
 * LES NEUF INDICATEURS CRM QUI MANQUAIENT (PDF 2 §16, items 241-253).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ ILS VIVENT, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * **Back-office uniquement**, comme les indicateurs de qualité et les coûts
 * fournisseurs. L'arbitrage du 03/08 tient : un taux affiché à un commercial
 * devient une promesse chiffrée qu'il faut tenir ; affiché à l'opérateur, il
 * devient un outil pour la tenir.
 *
 * Le treizième KPI du document — la « chance de closing » — reste REFUSÉ : c'est
 * une probabilité, et l'arbitrage n°4 du 16/08 les interdit toutes. Quatre
 * autres existaient déjà (valeur de pipe, projets sans montant…) et ne sont pas
 * recalculés ici : deux calculs du même chiffre finissent toujours par diverger.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, LA MÊME QUE PARTOUT
 * ─────────────────────────────────────────────────────────────────────────────
 * On n'invente pas un dénominateur. Un taux sans observations vaut `null` et
 * s'affiche « non mesuré » — jamais 0 %, qui envoie chercher une panne sur un
 * espace qui n'a simplement rien fait encore.
 *
 * Tout est PUR : les entrées sont des décomptes déjà lus, `now` est un
 * paramètre. C'est ce qui rend les seuils testables sans base de données.
 */

export const CRM_KPI_KEYS = [
  /** Comptes PASSÉS en priorisé sur la fenêtre — pas les comptes créés. */
  'accounts_prioritised',
  /** Comptes suivis sur lesquels rien n'est programmé. */
  'accounts_without_next_action',
  /** Délai médian entre un signal et la première action qui le suit. */
  'signal_to_action_days',
  /** Part des projets détectés qui atteignent « qualifié ». */
  'detected_to_qualified',
  /** Âge médian de l'étape courante, tous projets ouverts. */
  'stage_age_days',
  /** Besoins ouverts pour lesquels aucune shortlist n'existe. */
  'needs_without_shortlist',
  /** Besoins déclarés non staffables, par cause. */
  'unstaffable_by_reason',
  /** Fraîcheur médiane des plans d'action. */
  'plan_freshness_days',
  /** Part des contacts engagés dans une paire de doublons. */
  'duplicate_contact_rate',
  /** Part des activités capturées automatiquement plutôt que saisies. */
  'auto_captured_activity',
] as const
type CrmKpiKey = (typeof CRM_KPI_KEYS)[number]

export type CrmKpi = {
  key: CrmKpiKey
  value: number | null
  unit: 'rate' | 'days' | 'count'
  /** Sur combien d'observations. Zéro ⇒ `value` est `null`. */
  sample: number
  /**
   * La répartition, quand l'indicateur en a une (les causes de non-staffabilité).
   * Absente ailleurs — un objet vide se lirait « aucune cause », ce qui est faux.
   */
  breakdown?: Record<string, number>
}

export type CrmKpiInput = {
  prioritisedInWindow: number
  trackedAccounts: number
  accountsWithoutNextAction: number
  /** Délais signal → action, en jours. Vide = jamais mesuré. */
  signalToActionDays: readonly number[]
  detectedProjects: number
  qualifiedProjects: number
  /** Âges d'étape, en jours, des projets OUVERTS uniquement. */
  stageAges: readonly number[]
  openNeeds: number
  needsWithoutShortlist: number
  unstaffableByReason: Record<string, number>
  /** Âges des plans d'action, en jours. */
  planAges: readonly number[]
  totalContacts: number
  contactsInDuplicatePairs: number
  totalActivities: number
  autoCapturedActivities: number
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

/**
 * La MÉDIANE, jamais la moyenne.
 *
 * Un signal traité six mois plus tard — parce que quelqu'un a repris un vieux
 * dossier — déplacerait une moyenne de plusieurs semaines et ferait conclure
 * que l'équipe est lente. Même arbitrage que le temps de réponse du §12 et que
 * le délai de paiement.
 */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2) : sorted[middle]!
}

export function computeCrmKpis(input: CrmKpiInput): CrmKpi[] {
  const unstaffableTotal = Object.values(input.unstaffableByReason).reduce((sum, count) => sum + count, 0)

  return [
    {
      key: 'accounts_prioritised',
      // Un DÉCOMPTE, pas un taux : « combien de comptes ai-je ouverts ce
      // mois-ci » est la question, et la rapporter à un total en ferait une
      // note plutôt qu'une mesure.
      value: input.prioritisedInWindow,
      unit: 'count',
      sample: input.prioritisedInWindow,
    },
    {
      key: 'accounts_without_next_action',
      value: rate(input.accountsWithoutNextAction, input.trackedAccounts),
      unit: 'rate',
      sample: input.trackedAccounts,
    },
    {
      key: 'signal_to_action_days',
      value: median(input.signalToActionDays),
      unit: 'days',
      sample: input.signalToActionDays.length,
    },
    {
      key: 'detected_to_qualified',
      value: rate(input.qualifiedProjects, input.detectedProjects),
      unit: 'rate',
      sample: input.detectedProjects,
    },
    {
      key: 'stage_age_days',
      value: median(input.stageAges),
      unit: 'days',
      sample: input.stageAges.length,
    },
    {
      key: 'needs_without_shortlist',
      value: rate(input.needsWithoutShortlist, input.openNeeds),
      unit: 'rate',
      sample: input.openNeeds,
    },
    {
      key: 'unstaffable_by_reason',
      // Le seul chiffre qui dise à une ESN ce qu'elle ne sait PAS faire. Sans
      // la répartition il ne vaut rien : « 12 besoins non staffables » ne dit
      // pas s'il manque des Java ou une couverture géographique.
      value: unstaffableTotal || null,
      unit: 'count',
      sample: unstaffableTotal,
      ...(unstaffableTotal > 0 ? { breakdown: input.unstaffableByReason } : {}),
    },
    {
      key: 'plan_freshness_days',
      value: median(input.planAges),
      unit: 'days',
      sample: input.planAges.length,
    },
    {
      key: 'duplicate_contact_rate',
      value: rate(input.contactsInDuplicatePairs, input.totalContacts),
      unit: 'rate',
      sample: input.totalContacts,
    },
    {
      key: 'auto_captured_activity',
      value: rate(input.autoCapturedActivities, input.totalActivities),
      unit: 'rate',
      sample: input.totalActivities,
    },
  ]
}
