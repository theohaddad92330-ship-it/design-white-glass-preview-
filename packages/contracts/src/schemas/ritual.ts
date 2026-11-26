import { z } from 'zod'
import { HYGIENE_CHECKS } from './data-hygiene.js'
import { metricDelta, type MetricSeries } from './metric-snapshot.js'
import { STOCK_METRIC_KEYS } from './stock-snapshot.js'

/**
 * Les rituels d'équipe (PDF 8 §7).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'UN RITUEL EST, ET CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ce qui distingue un rituel d'une routine : une durée, un ordre du jour, des
 * participants, et des décisions tracées. » Le produit avait les routines — qui
 * notifient — et rien de l'ordre du jour.
 *
 * Ce que ce catalogue apporte est la moitié qui rend le système TRANSMISSIBLE :
 * un nouveau manager reprend la réunion telle quelle, avec ses points, leur
 * durée, et les chiffres à regarder sur chacun. C'est la valeur que le document
 * lui-même met en avant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON NE PROMET PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Ni séance enregistrée, ni chronomètre, ni compte rendu automatique. La raison
 * n'est pas l'effort : le dépôt a DÉJÀ deux journaux de décision — le journal des
 * portes (`decision_gate_crossings`, qui est un audit) et la file d'intervention.
 * Un troisième, attaché à une réunion, ferait un troisième endroit où chercher
 * « qu'est-ce qui a été décidé sur ce compte », et c'est exactement le genre de
 * fragmentation qui fait qu'on ne cherche plus nulle part.
 *
 * Une décision prise en réunion a déjà sa place : la porte qu'elle franchit, ou
 * la tâche qu'elle crée.
 *
 * Le catalogue vit dans le CODE, comme les routines et les chaînes : un ordre du
 * jour éditable sans revue cesse d'être un standard d'équipe au bout de trois
 * semaines.
 */

export const RITUAL_KEYS = ['daily', 'weekly', 'monthly', 'quarterly', 'rank1'] as const
export const ritualKeySchema = z.enum(RITUAL_KEYS)
export type RitualKey = (typeof RITUAL_KEYS)[number]

const localized = z.object({ fr: z.string().min(1), en: z.string().min(1) })

/**
 * #2405.9 — qui PORTE ce point. Un RÔLE, jamais une personne : la doctrine
 * interdit tout classement nominatif de commerciaux, et un rituel qui nommerait
 * quelqu'un serait exactement ça, écrit dans le code. `manager` = le manager
 * l'anime et tranche ; `sales_ops` = qualité de données / outillage ; `team` =
 * chaque membre rapporte le sien tour à tour (le pipe de CHACUN, pas d'UN).
 */
export const RITUAL_OWNERS = ['manager', 'sales_ops', 'team'] as const
export const ritualOwnerSchema = z.enum(RITUAL_OWNERS)
export type RitualOwner = z.infer<typeof ritualOwnerSchema>

export const ritualAgendaItemSchema = z.object({
  /** 1-indexé : l'ordre du jour est un ORDRE. */
  position: z.number().int().min(1),
  label: localized,
  /** Minutes allouées. C'est ce qui empêche un point d'en manger trois. */
  minutes: z.number().int().min(5).max(240),
  /**
   * Les chiffres à ouvrir sur ce point, tirés de ce que le produit CALCULE déjà.
   * Un point sans chiffre reste légitime (« blocages », « arbitrages ») — c'est
   * une conversation, pas un tableau.
   */
  watch: z.array(z.enum(HYGIENE_CHECKS)),
  /** L'écran à ouvrir pendant ce point. `null` = aucun. */
  link: z.string().nullable(),
  /** #2405.9 — qui porte le point, TOUJOURS un rôle. */
  owner: ritualOwnerSchema,
})
export type RitualAgendaItem = z.infer<typeof ritualAgendaItemSchema>

export const ritualSchema = z.object({
  key: ritualKeySchema,
  label: localized,
  cadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'on_demand']),
  /** Durée annoncée, en minutes. La somme des points ne la dépasse jamais. */
  minutes: z.number().int().min(5).max(480),
  agenda: z.array(ritualAgendaItemSchema).min(1),
  /**
   * #3271.8 (BEL-SC-242) — qui doit être dans la salle. Toujours des RÔLES
   * (comme `owner` sur chaque point) : nommer une personne romprait la même
   * doctrine qui interdit tout classement nominatif de commerciaux.
   */
  participants: z.array(ritualOwnerSchema).min(1),
  /**
   * #3271.8 — le GENRE de décision que ce rituel doit produire, en une
   * phrase. Un rituel qui ne nomme aucune décision attendue est exactement le
   * symptôme que #3271.11/.12 détectent (rituel tenu sans jamais décider) —
   * autant le dire dès le catalogue.
   */
  expectedDecisions: localized,
})
export type Ritual = z.infer<typeof ritualSchema>

export const RITUAL_CATALOG: readonly Ritual[] = [
  {
    key: 'daily',
    label: { fr: 'Point quotidien', en: 'Daily stand-up' },
    cadence: 'daily',
    minutes: 20,
    agenda: [
      {
        position: 1,
        label: { fr: 'Pipe : nouveaux, relances, rendez-vous', en: 'Pipe: new, follow-ups, meetings' },
        minutes: 5,
        watch: ['accounts_without_next_action'],
        link: '/projects',
        owner: 'team',
      },
      {
        position: 2,
        label: { fr: 'Staffing : besoins ouverts et matchs', en: 'Staffing: open needs and matches' },
        minutes: 5,
        watch: ['needs_without_skills'],
        link: '/projects/needs',
        owner: 'team',
      },
      {
        position: 3,
        label: { fr: 'Priorités du jour', en: 'Today’s priorities' },
        minutes: 5,
        watch: [],
        link: '/briefing',
        owner: 'team',
      },
      // Un point sans chiffre : c'est une conversation, et l'y forcer un
      // indicateur ferait parler du chiffre plutôt que du blocage.
      { position: 4, label: { fr: 'Blocages', en: 'Blockers' }, minutes: 5, watch: [], link: null, owner: 'manager' },
    ],
    participants: ['team', 'manager'],
    expectedDecisions: {
      fr: 'Qui relance qui aujourd’hui, et quel blocage remonte au manager.',
      en: 'Who follows up with whom today, and which blocker gets escalated to the manager.',
    },
  },
  {
    key: 'weekly',
    label: { fr: 'Revue hebdomadaire', en: 'Weekly review' },
    cadence: 'weekly',
    minutes: 105,
    agenda: [
      {
        position: 1,
        label: { fr: 'Sourcing et recrutement', en: 'Sourcing and recruitment' },
        minutes: 15,
        watch: ['needs_without_skills', 'talents_unknown_availability'],
        link: '/consultants',
        owner: 'sales_ops',
      },
      {
        position: 2,
        label: { fr: 'Comptes et opportunités', en: 'Accounts and opportunities' },
        minutes: 25,
        watch: ['accounts_without_next_action', 'projects_without_amount'],
        link: '/accounts',
        owner: 'team',
      },
      {
        position: 3,
        label: { fr: 'Indicateurs et arbitrages', en: 'Indicators and trade-offs' },
        minutes: 20,
        watch: [],
        link: '/pilotage',
        owner: 'manager',
      },
      {
        position: 4,
        label: { fr: 'Plan d’actions et expérimentations', en: 'Action plan and experiments' },
        minutes: 30,
        watch: [],
        link: '/actions',
        owner: 'manager',
      },
      /**
       * #2405.9 — le rituel ne couvrait ni le prévisionnel ni l'adoption.
       * AUCUNE probabilité ici (doctrine, refusée six fois) : le point ouvre
       * les montants et comptes RÉELS du pipe (`pipeline_value`, missions sans
       * coût/échéance) et l'usage réel de l'outil (crédits, playbooks) —
       * jamais un pourcentage de closing deviné.
       */
      {
        position: 5,
        label: { fr: 'Prévisionnel et adoption', en: 'Forecast and adoption' },
        minutes: 15,
        watch: ['missions_without_cost', 'missions_without_end_date'],
        link: '/pilotage',
        owner: 'manager',
      },
    ],
    participants: ['sales_ops', 'team', 'manager'],
    expectedDecisions: {
      fr: 'Quels comptes se rouvrent ou se ferment, et quel plan d’action change pour la semaine.',
      en: 'Which accounts reopen or close, and which action plan changes for the week.',
    },
  },
  {
    key: 'monthly',
    label: { fr: 'Revue mensuelle', en: 'Monthly review' },
    cadence: 'monthly',
    minutes: 240,
    agenda: [
      {
        position: 1,
        label: { fr: 'Retours d’expérience et opportunités', en: 'Post-mortems and opportunities' },
        minutes: 60,
        watch: [],
        link: '/projects',
        owner: 'team',
      },
      {
        position: 2,
        label: { fr: 'Moyens : vivier et intercontrat', en: 'Resources: pool and bench' },
        minutes: 60,
        watch: ['talents_unknown_availability'],
        link: '/consultants',
        owner: 'sales_ops',
      },
      {
        position: 3,
        label: { fr: 'Tableau de bord du mois', en: 'Monthly dashboard' },
        minutes: 60,
        watch: ['missions_without_cost', 'missions_without_end_date'],
        link: '/pilotage',
        owner: 'manager',
      },
      {
        position: 4,
        label: { fr: 'Qualité des données et des outils', en: 'Data and tooling quality' },
        minutes: 60,
        watch: ['contacts_without_email', 'unresolved_duplicates'],
        link: '/integrations',
        owner: 'sales_ops',
      },
    ],
    participants: ['team', 'sales_ops', 'manager'],
    expectedDecisions: {
      fr: 'Quels sujets de qualité de données ou de moyens sont traités ce mois-ci, et par qui.',
      en: 'Which data-quality or resourcing issues get worked this month, and by whom.',
    },
  },
  {
    key: 'quarterly',
    label: { fr: 'Revue trimestrielle', en: 'Quarterly review' },
    cadence: 'quarterly',
    minutes: 420,
    agenda: [
      {
        position: 1,
        label: { fr: 'Positionnement et angle', en: 'Positioning and wedge' },
        minutes: 120,
        watch: [],
        link: '/settings/knowledge', // #4359 — `/knowledge` n'est plus qu'une adresse légataire
        owner: 'manager',
      },
      {
        position: 2,
        label: { fr: 'Offres et cas clients', en: 'Offers and client cases' },
        minutes: 120,
        watch: [],
        link: '/settings/knowledge', // #4359 — `/knowledge` n'est plus qu'une adresse légataire
        owner: 'team',
      },
      {
        position: 3,
        label: { fr: 'Segments et cibles', en: 'Segments and ICP' },
        minutes: 90,
        watch: [],
        link: '/discover',
        owner: 'manager',
      },
      {
        position: 4,
        label: { fr: 'Feuille de route outils', en: 'Tooling roadmap' },
        minutes: 90,
        watch: [],
        link: '/integrations',
        owner: 'sales_ops',
      },
    ],
    participants: ['manager', 'team', 'sales_ops'],
    expectedDecisions: {
      fr: 'Quel positionnement, quelle offre ou quel segment change pour le trimestre.',
      en: 'Which positioning, offer or segment changes for the quarter.',
    },
  },
  {
    key: 'rank1',
    label: { fr: 'Revue rang 1', en: 'Tier-1 review' },
    cadence: 'on_demand',
    minutes: 30,
    agenda: [
      {
        position: 1,
        label: { fr: 'État des partenaires', en: 'Partner status' },
        minutes: 8,
        watch: [],
        link: '/accounts',
        owner: 'manager',
      },
      {
        position: 2,
        label: { fr: 'Preuves collectées', en: 'Proofs collected' },
        minutes: 7,
        watch: [],
        link: '/settings/knowledge', // #4359 — `/knowledge` n'est plus qu'une adresse légataire
        owner: 'team',
      },
      {
        position: 3,
        label: { fr: 'Comptes à la porte de priorisation', en: 'Accounts at the priority gate' },
        minutes: 8,
        watch: ['accounts_without_next_action'],
        link: '/accounts',
        owner: 'manager',
      },
      {
        position: 4,
        label: { fr: 'Approches et décisions', en: 'Approaches and decisions' },
        minutes: 7,
        watch: [],
        link: null,
        owner: 'manager',
      },
    ],
    participants: ['manager', 'team'],
    expectedDecisions: {
      fr: 'Quelle approche se tente auprès de quel partenaire ce cycle.',
      en: 'Which approach gets tried with which partner this cycle.',
    },
  },
]

/**
 * #3271.10/.12 (BEL-SC-242) — « laisser le workspace personnaliser » et
 * « proposer de supprimer un rituel inutile ». Le catalogue lui-même reste en
 * CODE (§ ci-dessus, « un ordre du jour éditable sans revue cesse d'être un
 * standard d'équipe ») : ce qu'un espace personnalise est UNIQUEMENT s'il
 * tient ou non ce rituel — jamais son contenu.
 *
 * Une DÉSACTIVATION, jamais une suppression : « on archive, on ne supprime
 * pas » s'applique à un rituel comme à tout le reste. Un rituel désactivé
 * reste dans `RITUAL_CATALOG`, nommé, réactivable — l'écran le range à part,
 * il ne l'efface pas.
 */
export const ritualPreferenceSchema = z.object({
  ritualKey: ritualKeySchema,
  disabled: z.boolean(),
})
export type RitualPreference = z.infer<typeof ritualPreferenceSchema>

/** La SAISIE — un geste par rituel, jamais un tableau à réconcilier. */
export const setRitualPreferenceSchema = z.object({ disabled: z.boolean() })
export type SetRitualPreferenceInput = z.infer<typeof setRitualPreferenceSchema>

/**
 * Ce qui EMPÊCHE un rituel d'être tenu tel quel. Vide = il est bien formé.
 *
 * Une réunion dont les points dépassent la durée annoncée n'est pas une réunion
 * de 90 minutes : c'est une réunion de 90 minutes qui déborde toujours, et
 * l'équipe apprend en trois semaines à ne plus croire l'horaire de fin.
 */
export function ritualProblems(ritual: Ritual): string[] {
  const problems: string[] = []
  const positions = ritual.agenda.map(item => item.position)
  if (new Set(positions).size !== positions.length) problems.push('deux points partagent la même position')
  if (positions.some((position, index) => position !== index + 1))
    problems.push('les positions ne se suivent pas depuis 1')
  const total = ritual.agenda.reduce((sum, item) => sum + item.minutes, 0)
  if (total > ritual.minutes) problems.push(`l’ordre du jour dure ${total} min pour ${ritual.minutes} min annoncées`)
  return problems
}

/**
 * #3271.11 (BEL-SC-242, suite #3298) — DÉTECTER UN RITUEL RÉPÉTÉ SANS DÉCISION,
 * SANS UN TROISIÈME JOURNAL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE DÉTECTION COMPOSE, ET N'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le catalogue refuse explicitement toute séance enregistrée ou compte rendu
 * (§ en tête de fichier) : le dépôt porte déjà deux journaux de décision, un
 * troisième ferait un troisième endroit où chercher. Une détection honnête
 * reste possible sans ce journal : les points d'ordre du jour d'un rituel
 * `watch` déjà un sous-ensemble de {@link STOCK_METRIC_KEYS} (`stock-snapshot.ts`)
 * — les MÊMES compteurs que la vue Qualité — et {@link metricDelta} (`metric-snapshot.ts`)
 * est déjà LA lecture de variation du produit. Cette fonction ne recalcule
 * rien : elle COMPOSE les deux, jamais un second détecteur.
 *
 * `daily` / `weekly` / `rank1` restent HORS PÉRIMÈTRE : `stock_snapshots` est
 * une photo MENSUELLE (`StockSnapshotService`), et comparer un rituel
 * hebdomadaire sur une granularité mensuelle produirait un faux verdict —
 * jamais deviné.
 */
export const RITUAL_EFFECTIVENESS_CADENCES = ['monthly', 'quarterly'] as const
export type RitualEffectivenessCadence = (typeof RITUAL_EFFECTIVENESS_CADENCES)[number]

/** Trois photos au moins avant de conclure — un point de départ et un point
 *  d'arrivée ne suffisent pas à distinguer « stable » de « pas encore mesuré ». */
const MIN_MONTHS_FOR_EFFECTIVENESS = 3

export type RitualEffectivenessVerdict =
  /** Aucun des indicateurs observés n'a bougé sur la fenêtre — le rituel n'a
   *  produit aucun effet mesurable RÉCEMMENT (jamais « jamais »). */
  | 'no_measurable_effect'
  /** Au moins un indicateur observé a bougé. */
  | 'moved'
  /** Pas assez de photos, ou aucun indicateur lisible — jamais confondu avec
   *  « stable » (doctrine : non mesuré n'est jamais 0). */
  | 'not_evaluable'

export interface RitualEffectivenessReport {
  ritualKey: RitualKey
  verdict: RitualEffectivenessVerdict
  /** Les clés de `STOCK_METRIC_KEYS` réellement observées par ce rituel — vide
   *  pour un rituel dont aucun point d'ordre du jour ne porte de `watch`. */
  watchedKeys: string[]
  monthsCovered: number
  /**
   * #3298 (suite #3271.11, historique d'occurrence) — le mois le plus ANCIEN,
   * DANS LA FENÊTRE COUVERTE, à partir duquel TOUS les indicateurs observés
   * sont restés à leur valeur actuelle. `null` sauf verdict
   * `no_measurable_effect` — jamais deviné au-delà de ce que `series` porte
   * réellement (une valeur plus ancienne, hors fenêtre, reste NON MESURÉE,
   * jamais supposée identique). DÉRIVÉ de la même série que le verdict,
   * jamais un second journal (§ docblock en tête de fichier).
   */
  sinceMonth: string | null
}

/**
 * Rituels `monthly`/`quarterly` UNIQUEMENT (voir docblock). `null` pour tout
 * autre rituel, ou un rituel dont AUCUN point n'observe de compteur de stock
 * — rien à mesurer n'est pas un verdict d'échec.
 */
/**
 * #3298 (suite #3271.11, historique d'occurrence) — le mois depuis lequel
 * TOUS les indicateurs de `watchedKeys` sont restés à leur valeur actuelle.
 * COMPOSE {@link metricDelta} paire à paire, en remontant depuis la photo la
 * plus récente — jamais un second calcul de variation (§ docblock en tête de
 * fichier). Un indicateur qui vient tout juste de se stabiliser fait
 * repartir la fenêtre à zéro pour LE RITUEL entier : « sans effet » porte sur
 * l'ENSEMBLE observé, jamais sur un seul indicateur.
 */
function _ritualEffectivenessSinceMonth(
  watchedKeys: readonly string[],
  series: readonly Pick<MetricSeries, 'metricKey' | 'unit' | 'points'>[],
): string | null {
  let sinceMonth: string | null = null
  for (const key of watchedKeys) {
    const s = series.find(entry => entry.metricKey === key)
    const points = s?.points ?? []
    if (!s || points.length < 2) continue
    let flatSince = points[points.length - 1].month
    for (let i = points.length - 1; i > 0; i--) {
      const delta = metricDelta({ unit: s.unit, previous: points[i - 1], current: points[i] })
      if (!delta.measured || delta.change !== 0) break
      flatSince = points[i - 1].month
    }
    if (sinceMonth === null || flatSince > sinceMonth) sinceMonth = flatSince
  }
  return sinceMonth
}

export function detectRitualEffectiveness(input: {
  ritual: Ritual
  series: readonly Pick<MetricSeries, 'metricKey' | 'unit' | 'points'>[]
  monthsCovered: number
}): RitualEffectivenessReport | null {
  if (!(RITUAL_EFFECTIVENESS_CADENCES as readonly string[]).includes(input.ritual.cadence)) return null

  const watchedKeys = [...new Set(input.ritual.agenda.flatMap(item => item.watch))].filter(key =>
    (STOCK_METRIC_KEYS as readonly string[]).includes(key),
  )
  if (watchedKeys.length === 0) return null

  if (input.monthsCovered < MIN_MONTHS_FOR_EFFECTIVENESS) {
    return {
      ritualKey: input.ritual.key,
      verdict: 'not_evaluable',
      watchedKeys,
      monthsCovered: input.monthsCovered,
      sinceMonth: null,
    }
  }

  let anyMeasured = false
  let anyMoved = false
  for (const key of watchedKeys) {
    const series = input.series.find(s => s.metricKey === key)
    const points = series?.points ?? []
    if (!series || points.length < 2) continue
    const delta = metricDelta({ unit: series.unit, previous: points[0], current: points[points.length - 1] })
    if (!delta.measured) continue
    anyMeasured = true
    if (delta.change !== 0) anyMoved = true
  }

  if (!anyMeasured) {
    return {
      ritualKey: input.ritual.key,
      verdict: 'not_evaluable',
      watchedKeys,
      monthsCovered: input.monthsCovered,
      sinceMonth: null,
    }
  }
  const verdict = anyMoved ? 'moved' : 'no_measurable_effect'
  return {
    ritualKey: input.ritual.key,
    verdict,
    watchedKeys,
    monthsCovered: input.monthsCovered,
    sinceMonth: verdict === 'no_measurable_effect' ? _ritualEffectivenessSinceMonth(watchedKeys, input.series) : null,
  }
}

/**
 * #3271.8 reste (suite #3298) — LA MARQUE LÉGÈRE DE DERNIÈRE TENUE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ S'ARRÊTE CETTE MARQUE, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * « Date suivante » suppose de savoir QUAND le rituel a été tenu — et rien ne
 * le journalise (§ en tête de fichier : ni séance, ni compte rendu). La marque
 * posée ici est volontairement PAUVRE : une date, un auteur, rien d'autre —
 * jamais une note, jamais un ordre du jour tenu, jamais une liste de
 * participants réels. C'est ce qui la distingue d'une séance : un fait daté,
 * pas un contenu à relire. « Actions créées » (l'autre moitié du point) reste
 * HORS de cette tranche : savoir QUELLES actions un rituel a produites
 * demanderait un journal PAR rituel, exactement le troisième journal que ce
 * catalogue refuse.
 */
export const ritualLastHeldSchema = z.object({
  ritualKey: ritualKeySchema,
  heldAt: z.string(),
  heldBy: z.string().guid().nullable(),
})
export type RitualLastHeld = z.infer<typeof ritualLastHeldSchema>

/**
 * #3271.8 reste (suite #3298) — « ACTIONS CRÉÉES » PAR RITUEL, SANS TROISIÈME
 * JOURNAL.
 *
 * La solution honnête n'est pas un journal de séance mais de taguer la TÂCHE à
 * sa création (`tasks.ritual_key`, posé par le geste « Créer une action » de
 * l'écran des rituels — jamais déduit d'une fenêtre de temps). Le compte est
 * donc une LECTURE des tâches, rien d'autre. Seuls les rituels qui ont au
 * moins une action créée figurent (`count >= 1`) : dans une liste, une absence
 * ne fait aucune ligne — et les tâches antérieures au geste ne sont pas
 * rattachables, donc un « 0 » se lirait « rien produit » alors qu'on ne sait pas.
 */
export const ritualActionsCreatedSchema = z.object({
  ritualKey: ritualKeySchema,
  count: z.number().int().min(1),
})
export type RitualActionsCreated = z.infer<typeof ritualActionsCreatedSchema>

/**
 * La prochaine date, dérivée de la CADENCE du catalogue — jamais une valeur
 * saisie séparément (GA-26 : un réglage vit à un seul endroit, ici la cadence
 * du rituel). `null` sans marque de dernière tenue, ou pour un rituel
 * `on_demand` qui n'a pas de prochaine date par construction.
 */
export function nextRitualDate(cadence: Ritual['cadence'], lastHeldAt: string | null): string | null {
  if (!lastHeldAt || cadence === 'on_demand') return null
  const date = new Date(lastHeldAt)
  if (Number.isNaN(date.getTime())) return null
  if (cadence === 'daily') date.setUTCDate(date.getUTCDate() + 1)
  else if (cadence === 'weekly') date.setUTCDate(date.getUTCDate() + 7)
  else if (cadence === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1)
  else if (cadence === 'quarterly') date.setUTCMonth(date.getUTCMonth() + 3)
  return date.toISOString().slice(0, 10)
}
