import { z } from 'zod'
import { kpiTarget, kpiTargetSchema } from './kpi-targets.js'
import { KPI_READINGS } from './manager-kpi-reading.js'
import { KPI_PLAIN_FORMULAS, plainSourceOf } from './manager-kpi-plain.js'

/**
 * Le dictionnaire des indicateurs de pilotage (PDF 8 §8).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI PORTE TOUT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un KPI sans décision associée est une décoration. » Sept attributs
 * obligatoires, et une garde qui refuse le vide : définition, formule, source,
 * cadence, propriétaire, seuil, DÉCISION. Le dernier est celui qui compte — un
 * chiffre qu'on regarde sans savoir quoi en faire fait perdre du temps à toute
 * une réunion.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES 64 SONT LÀ, Y COMPRIS CEUX QU’ON NE SAIT PAS CALCULER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le catalogue est un contrat d'HONNÊTETÉ avant d'être un contrat de données.
 * Un indicateur dont la donnée n'existe pas reste LISTÉ, avec
 * `measurable: false` et la raison écrite. Le retirer
 * parce qu'on ne sait pas encore le mesurer est la façon la plus sûre de ne
 * jamais le mesurer ; l'afficher à zéro serait pire encore.
 *
 * Il ne CALCULE rien. Le calcul appartient aux modules qui possèdent la donnée ;
 * ce fichier dit ce qu'il est légitime d'afficher, et sous quelles réserves.
 */

/** Les six familles du §8.2, dans l'ordre du document. */
export const MANAGER_KPI_FAMILIES = [
  /** A — comptes, pipe, appels d'offres. Propriétaire : dirigeant / business manager. */
  'business',
  /** B — vivier, matching, recrutement. Propriétaire : recruteur. */
  'recruitment',
  /** C — missions tenues, satisfaction, intercontrat. Propriétaire : ops / manager. */
  'delivery',
  /** D — REX, preuves, couverture sectorielle. Propriétaire : dirigeant. */
  'capitalisation',
  /** E — facturable, marge, encaissement. Propriétaire : finance. */
  'finance',
  /** F — adoption du produit lui-même. Propriétaire : éditeur. */
  'adoption',
] as const
export const managerKpiFamilySchema = z.enum(MANAGER_KPI_FAMILIES)
export type ManagerKpiFamily = (typeof MANAGER_KPI_FAMILIES)[number]

/** À quelle fréquence l'indicateur a un sens. Comparer un mois à un trimestre
 *  est la première façon de se tromper (§8.4, « période équivalente »).
 *
 *  Exporté parce que l'écran en dépend : `KpiCataloguePanel` rend la cadence
 *  par `t('catalogue.cadences.<valeur>')` SANS `defaultValue`, et
 *  `kpi-catalogue-i18n.test.ts` parcourt cette liste pour refuser qu'une valeur
 *  arrive à l'écran sans sa traduction — sinon la fiche imprime la clé brute. */
export const MANAGER_KPI_CADENCES = ['daily', 'weekly', 'monthly', 'quarterly'] as const

/** Qui répond de ce chiffre. Un indicateur sans propriétaire n'est corrigé par
 *  personne — il est commenté par tout le monde. Exporté pour la même raison
 *  que les cadences : c'est le vocabulaire que l'écran doit savoir traduire. */
export const MANAGER_KPI_OWNERS = ['direction', 'business', 'recruitment', 'delivery', 'finance', 'product'] as const

export const managerKpiSchema = z
  .object({
    key: z.string().min(1).max(64),
    family: managerKpiFamilySchema,
    label: z.object({ fr: z.string().min(1), en: z.string().min(1) }),
    /** Ce que le chiffre compte, en une phrase. */
    definition: z.string().min(1),
    /** Comment il se calcule. Écrite pour être vérifiable, pas pour être jolie. */
    formula: z.string().min(1),
    /** La ou les tables qui le portent. `null` quand rien ne le porte. */
    source: z.string().min(1).nullable(),
    cadence: z.enum(MANAGER_KPI_CADENCES),
    owner: z.enum(MANAGER_KPI_OWNERS),
    /** Le seuil à partir duquel on regarde. Jamais une note — un repère. */
    threshold: z.string().min(1),
    /**
     * La cible CHIFFRÉE, quand la source en donne une. `null` sinon.
     *
     * ⚠️ Elle n'est jamais écrite ici : elle est RÉSOLUE depuis `KPI_TARGETS`
     * par la clé de l'indicateur. Le nombre vit à un seul endroit (GA-26) — le
     * recopier dans soixante entrées garantirait qu'une des soixante dérive.
     *
     * `threshold` (la prose) et `target` (le nombre) répondent à deux questions
     * différentes et ne se remplacent pas : la prose dit ce qui se passe quand
     * on franchit le seuil, le nombre dit où il est. Une garde
     * (`kpi-targets.test.ts`) refuse que la prose énonce un AUTRE nombre pour la
     * même question — c'est ainsi que « > 85 % » de la source était devenu
     * « sous 90 % » dans ce fichier sans que personne ne puisse le voir.
     */
    target: kpiTargetSchema.nullable(),
    /**
     * #3415 — la tendance qui INQUIÈTE et la cause à chercher d'abord. Résolues
     * depuis `KPI_READINGS` par la clé (GA-26) : jamais écrites dans l'entrée.
     * Le dictionnaire ne porte aucune valeur, donc aucune tendance MESURÉE ici.
     */
    worryingTrend: z.enum(['down', 'up', 'either']),
    /** #3529 — formule et source en phrase métier FR/EN (`KPI_PLAIN_FORMULAS`) : ce que l'écran montre. */
    formulaPlain: z.object({ fr: z.string().min(1), en: z.string().min(1) }),
    sourcePlain: z.object({ fr: z.string().min(1), en: z.string().min(1) }).nullable(),
    probableCause: z.string().min(1),
    /** CE QU'ON FAIT quand le seuil est franchi. Sans lui, c'est une décoration. */
    decision: z.string().min(1),
    /** `true` seulement si `source` est renseignée — vérifié par une garde. */
    measurable: z.boolean(),
    /** Pourquoi il ne l'est pas. Obligatoire quand `measurable` est `false`. */
    unmeasurableReason: z.string().min(1).nullable(),
    /** L'entrée du dictionnaire d'exclusions qui précise ce qu'il ne compte PAS. */
    dictionaryKey: z.string().nullable(),
  })
  .superRefine((kpi, ctx) => {
    if (kpi.measurable && !kpi.source) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${kpi.key}: mesurable sans source nommée` })
    }
    if (!kpi.measurable && !kpi.unmeasurableReason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${kpi.key}: non mesurable sans raison écrite` })
    }
  })
export type ManagerKpi = z.infer<typeof managerKpiSchema>

/**
 * ⚠️ CE FICHIER NE PORTE AUCUNE VALEUR, ET C'EST UNE DÉCISION — pas un manque.
 *
 * Il a porté, jusqu'au 28/08/2026, la moitié « lecture » du §8 : un
 * `kpiReadingSchema` (`value: number | null`, `completeness`, `excluded`,
 * `computedAt`) et son seuil d'alerte `KPI_COMPLETENESS_ALERT = 0.7`. Les deux
 * ont été retirés parce qu'aucun code n'a jamais PRODUIT une lecture : le
 * dictionnaire est servi sans chiffre (`pilotage.controller.ts`), l'écran
 * l'affiche sans chiffre, et les deux docblocks disent pourquoi — « les nombres
 * vivent là où ils sont calculés ; en afficher une seconde version ici
 * produirait deux nombres pour la même question ».
 *
 * Le seuil n'était pas non plus le doublon d'un autre : rien d'autre, dans tout
 * `pilotage`, ne mesure une complétude. Et le seul voisin qui aurait pu
 * l'accueillir — la couverture de la chaîne (`pilotageCoverage`) — a REFUSÉ ce
 * seuil explicitement : « le seuil d'activation que le PDF réclamait cherchait
 * à masquer ce symptôme ; le dire coûte une phrase et ne cache rien ».
 *
 * Le jour où une lecture sera calculée, son contrat naîtra avec le code qui la
 * calcule — pas trois mois avant lui.
 */

type Draft = Omit<
  ManagerKpi,
  | 'measurable'
  | 'unmeasurableReason'
  | 'dictionaryKey'
  | 'target'
  | 'worryingTrend'
  | 'probableCause'
  | 'formulaPlain'
  | 'sourcePlain'
> & {
  measurable?: boolean
  unmeasurableReason?: string | null
  dictionaryKey?: string | null
}

/** #3415 — la lecture (tendance qui inquiète + cause à chercher) d'un indicateur. */
function readingOf(key: string): Pick<ManagerKpi, 'worryingTrend' | 'probableCause'> {
  const reading = KPI_READINGS[key]
  if (!reading) throw new Error(`${key}: aucune lecture dans KPI_READINGS`)
  return { worryingTrend: reading.trend, probableCause: reading.cause }
}

/** #3529 — la formule en phrase métier. Jette si l'indicateur n'en a pas. */
function formulaPlainOf(key: string): ManagerKpi['formulaPlain'] {
  const plain = KPI_PLAIN_FORMULAS[key]
  if (!plain) throw new Error(`${key}: aucune formule métier dans KPI_PLAIN_FORMULAS`)
  return plain
}

/** Un indicateur MESURABLE : sa source existe et le calcul est branché ou branchable. */
function computed(draft: Omit<Draft, 'measurable' | 'unmeasurableReason'> & { source: string }): ManagerKpi {
  return {
    ...draft,
    measurable: true,
    unmeasurableReason: null,
    dictionaryKey: draft.dictionaryKey ?? null,
    target: kpiTarget(draft.key),
    formulaPlain: formulaPlainOf(draft.key),
    sourcePlain: plainSourceOf(draft.source, draft.key),
    ...readingOf(draft.key),
  }
}

/** Un indicateur qu'on VEUT suivre et qu'on ne sait pas encore calculer. La
 *  raison est écrite : c'est elle qui dit ce qu'il faudrait capturer.
 *
 *  ⚠️ Il porte quand même sa CIBLE quand la source en donne une. Une cible dit
 *  où l'on veut aller ; ne pas savoir mesurer aujourd'hui ne change pas la
 *  destination, et l'effacer serait la façon la plus sûre de l'oublier — le même
 *  raisonnement qui garde les indicateurs non mesurables dans le dictionnaire. */
function pending(draft: Omit<Draft, 'measurable' | 'unmeasurableReason' | 'source'>, reason: string): ManagerKpi {
  return {
    ...draft,
    source: null,
    measurable: false,
    unmeasurableReason: reason,
    // Le dictionnaire d'exclusions garde son sens sans la donnée : il dit ce que
    // l'indicateur ne comptera PAS le jour où on saura le compter.
    dictionaryKey: draft.dictionaryKey ?? null,
    target: kpiTarget(draft.key),
    formulaPlain: formulaPlainOf(draft.key),
    sourcePlain: null,
    ...readingOf(draft.key),
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  A · Business et acquisition — 12                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

const BUSINESS: readonly ManagerKpi[] = [
  computed({
    key: 'accounts_opened',
    family: 'business',
    label: { fr: 'Comptes ouverts', en: 'Accounts opened' },
    definition: 'Comptes passés en priorisé sur la période — pas les comptes créés.',
    formula: 'COUNT(accounts) dont priority_gate est passé à « prioritised » dans la fenêtre',
    source: 'accounts, decision_gate_crossings',
    cadence: 'monthly',
    owner: 'business',
    threshold: 'En dessous de la moitié du mois précédent, on regarde.',
    decision: 'Rouvrir la file des non-attribués et repasser la porte de priorisation sur les comptes garés.',
  }),
  computed({
    key: 'pipeline_amount',
    family: 'business',
    label: { fr: 'Montant au pipe', en: 'Pipeline value' },
    // ⚠️ La définition disait « les cinq étapes du pipe » et la formule « les
    // étapes ouvertes » : ce ne sont PAS le même ensemble — les cinq incluent
    // `won`. Les deux moitiés de la même fiche se contredisaient, et la moitié
    // fausse était celle que le code appliquait (29/08/2026). Le signé se lit à
    // part, sur la ligne « Signé » du chiffre d'affaires.
    definition: 'Somme des montants SAISIS sur les projets des quatre étapes ENCORE EN JEU. Le signé n’y entre pas.',
    formula: 'SUM(opportunities.amount_cents) sur OPEN_PIPELINE_STAGES',
    source: 'opportunities',
    cadence: 'weekly',
    owner: 'direction',
    threshold: 'Moins de trois fois l’objectif du trimestre : le pipe ne couvre pas la cible.',
    decision: 'Lancer une vague d’analyses sur les comptes suivis sans projet ouvert.',
    dictionaryKey: 'pipeline_amount',
  }),
  computed({
    key: 'stage_age_days',
    family: 'business',
    label: { fr: 'Âge d’étape', en: 'Stage age' },
    definition: 'Âge MÉDIAN de l’étape courante, sur les projets ouverts uniquement.',
    formula: 'median(now − opportunities.stage_entered_at) pour les étapes non closes',
    source: 'opportunities.stage_entered_at',
    cadence: 'weekly',
    owner: 'business',
    threshold: 'Au-delà de 30 jours, l’étape ne bouge plus.',
    decision: 'Revue des projets bloqués : soit une prochaine action est posée, soit le projet passe en sommeil.',
  }),
  computed({
    key: 'accounts_without_next_action',
    family: 'business',
    label: { fr: 'Comptes sans prochaine action', en: 'Accounts with no next action' },
    definition: 'Comptes suivis sur lesquels rien n’est programmé.',
    formula: 'COUNT(accounts suivis) sans tâche ni rappel à venir ÷ COUNT(accounts suivis)',
    source: 'accounts, tasks',
    cadence: 'weekly',
    owner: 'business',
    threshold: 'Au-delà de 30 %, le portefeuille n’est plus piloté.',
    decision: 'Chaque commercial pose une prochaine action ou rend le compte à la file.',
  }),
  computed({
    key: 'signal_to_action_days',
    family: 'business',
    label: { fr: 'Délai signal → action', en: 'Signal to action delay' },
    definition: 'Délai médian entre un signal détecté et la première action qui le suit.',
    formula: 'median(première activity.occurred_at − date du signal)',
    source: 'accounts.recent_signals, activities',
    cadence: 'weekly',
    owner: 'business',
    threshold: 'Au-delà de 7 jours, le signal est froid quand on l’exploite.',
    decision: 'Activer la routine de veille quotidienne sur les comptes concernés.',
  }),
  computed({
    key: 'detected_to_qualified',
    family: 'business',
    label: { fr: 'Détecté → qualifié', en: 'Detected to qualified' },
    definition: 'Part des projets détectés qui atteignent l’étape « qualifié ».',
    formula: 'COUNT(projets qualifiés) ÷ COUNT(projets détectés) sur la fenêtre',
    source: 'opportunities',
    cadence: 'monthly',
    owner: 'business',
    threshold: 'Sous 20 %, la détection produit surtout du bruit.',
    decision: 'Resserrer les critères de détection plutôt que d’augmenter le volume.',
  }),
  computed({
    key: 'meetings_held',
    family: 'business',
    label: { fr: 'Rendez-vous tenus', en: 'Meetings held' },
    definition: 'Rendez-vous réellement tenus, journalisés dans la timeline.',
    formula: 'COUNT(activities WHERE kind = meeting) sur la fenêtre',
    source: 'activities',
    cadence: 'weekly',
    owner: 'business',
    threshold: 'Le rythme se compare au mois précédent, jamais à un absolu.',
    decision: 'Si le rythme baisse deux semaines de suite, revoir la charge de prospection.',
  }),
  computed({
    key: 'reply_rate',
    family: 'business',
    label: { fr: 'Taux de réponse', en: 'Reply rate' },
    definition: 'Messages ayant reçu une réponse ÷ messages envoyés.',
    formula: 'COUNT(contacts replied) ÷ COUNT(contacts email_sent_at NOT NULL)',
    source: 'contacts, activities',
    cadence: 'weekly',
    owner: 'business',
    threshold: 'Sous 10 %, l’approche ne prend pas.',
    decision: 'Changer l’angle avant d’augmenter le volume — plus de messages ne répare pas un mauvais message.',
  }),
  computed({
    key: 'projects_won',
    family: 'business',
    label: { fr: 'Projets gagnés', en: 'Projects won' },
    definition: 'Projets passés en « gagné » sur la période.',
    formula: 'COUNT(opportunities WHERE stage = won) sur la fenêtre',
    source: 'opportunities',
    cadence: 'monthly',
    owner: 'direction',
    threshold: 'Se lit avec le montant : trois petits gains ne valent pas un gros.',
    decision: 'Créer les missions correspondantes et vérifier qu’aucune n’est restée sans affectation.',
  }),
  computed({
    key: 'win_rate',
    family: 'business',
    label: { fr: 'Taux de réussite', en: 'Win rate' },
    definition: 'Projets gagnés ÷ projets TRANCHÉS (gagnés + perdus).',
    formula: 'won ÷ (won + lost) — les projets ouverts n’entrent dans aucun des deux termes',
    source: 'opportunities',
    cadence: 'quarterly',
    owner: 'direction',
    threshold: 'Aucune affaire close ⇒ « non mesurable », jamais 0 %.',
    decision: 'Sous la moyenne du trimestre précédent, relire les motifs de perte enregistrés.',
  }),
  pending(
    {
      key: 'rfp_win_rate',
      family: 'business',
      label: { fr: 'Taux de réussite en appel d’offres', en: 'RFP win rate' },
      definition: 'Appels d’offres gagnés ÷ appels d’offres déposés.',
      formula: 'won ÷ submitted, sur les projets issus d’un appel d’offres',
      cadence: 'quarterly',
      owner: 'direction',
      threshold: 'Se compare à la moyenne de marché, pas à 100 %.',
      decision: 'Sous la moitié du taux de réussite hors appel d’offres, arrêter de répondre à froid.',
    },
    'Rien ne distingue en base un projet issu d’un appel d’offres d’un projet né d’une relation. Les marchés publics sont collectés (BOAMP, DECP) mais ne créent pas de projet : les compter comme tels supposerait un rattachement qui n’existe pas.',
  ),
  pending(
    {
      key: 'rank1_access_obtained',
      family: 'business',
      label: { fr: 'Accès rang 1 obtenus', en: 'Tier-1 access obtained' },
      definition: 'Comptes sur lesquels l’ESN a obtenu un référencement direct dans la période.',
      formula: 'COUNT(account_partners WHERE rank = direct) entrés dans la fenêtre',
      cadence: 'quarterly',
      owner: 'direction',
      threshold: 'Un seul par trimestre est déjà un résultat.',
      decision: 'Réaffecter l’effort de référencement vers les comptes où un partenaire rang 1 est identifié.',
    },
    'Le suivi des partenaires de compte porte le rang mais aucune date d’ENTRÉE dans ce rang. Compter les lignes existantes donnerait un stock, pas un flux — et le stock ne dit pas si on a progressé ce trimestre.',
  ),
]

/* ══════════════════════════════════════════════════════════════════════════ */
/*  B · Recrutement et matching — 11                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

const RECRUITMENT: readonly ManagerKpi[] = [
  computed({
    key: 'known_availability_rate',
    family: 'recruitment',
    label: { fr: 'Taux de disponibilité connue', en: 'Known availability rate' },
    definition: 'Part du vivier dont la disponibilité est DÉRIVABLE — d’une affectation ou d’une saisie datée.',
    formula: 'COUNT(consultants avec disponibilité dérivable) ÷ COUNT(consultants actifs)',
    source: 'consultants, mission_assignments',
    cadence: 'weekly',
    owner: 'recruitment',
    threshold: 'Sous 70 %, le matching travaille à l’aveugle sur un tiers du vivier.',
    decision: 'Relancer les consultants dont la disponibilité n’a pas été vérifiée depuis 60 jours.',
  }),
  computed({
    key: 'need_to_shortlist_days',
    family: 'recruitment',
    label: { fr: 'Délai besoin → shortlist', en: 'Need to shortlist delay' },
    definition: 'Délai médian entre l’ouverture d’un besoin et sa première shortlist.',
    formula: 'median(shortlists.created_at − project_needs.created_at)',
    source: 'project_needs, shortlists',
    cadence: 'weekly',
    owner: 'recruitment',
    threshold: 'Au-delà de 48 h, le client a déjà reçu les profils d’un concurrent.',
    decision: 'Lancer le matching dès l’ouverture du besoin plutôt qu’à la première relance client.',
  }),
  computed({
    key: 'shortlist_to_submission_days',
    family: 'recruitment',
    label: { fr: 'Délai shortlist → positionnement', en: 'Shortlist to submission delay' },
    definition: 'Délai médian entre la shortlist et l’envoi effectif d’un profil.',
    formula: 'median(submissions.created_at − shortlists.created_at)',
    source: 'shortlists, submissions',
    cadence: 'weekly',
    owner: 'recruitment',
    threshold: 'Au-delà de 24 h, la shortlist attend une validation qui n’a pas de propriétaire.',
    decision: 'Nommer qui valide le dossier client, ou l’envoyer sans validation quand le consentement est à jour.',
  }),
  computed({
    key: 'needs_without_shortlist',
    family: 'recruitment',
    label: { fr: 'Besoins sans shortlist', en: 'Needs without shortlist' },
    definition: 'Besoins ouverts pour lesquels aucune shortlist n’existe.',
    formula: 'COUNT(project_needs ouverts sans shortlist) ÷ COUNT(project_needs ouverts)',
    source: 'project_needs, shortlists',
    cadence: 'weekly',
    owner: 'recruitment',
    threshold: 'Au-delà de 20 %, des besoins meurent sans avoir été travaillés.',
    decision:
      'Passer la porte de staffabilité : soit on shortliste, soit on déclare le besoin non staffable AVEC sa cause.',
  }),
  computed({
    key: 'unstaffable_rate',
    family: 'recruitment',
    label: { fr: 'Besoins non staffables', en: 'Unstaffable needs' },
    definition: 'Besoins déclarés non staffables, avec leur répartition par cause.',
    formula: 'COUNT(project_needs.staffable = no) ÷ COUNT(besoins tranchés), ventilé par motif',
    source: 'project_needs',
    cadence: 'monthly',
    owner: 'recruitment',
    threshold: 'Une cause qui dépasse la moitié du total est un trou de compétence, pas de la malchance.',
    decision:
      'C’est le seul chiffre qui dit à l’ESN ce qu’elle ne sait pas faire : il alimente le plan de recrutement.',
  }),
  computed({
    key: 'proven_skills_rate',
    family: 'recruitment',
    label: { fr: 'Taux de compétences prouvées', en: 'Proven skills rate' },
    definition: 'Part des compétences du vivier dont la source est une mission, et non une déclaration.',
    formula: 'COUNT(consultant_skills WHERE source = mission) ÷ COUNT(consultant_skills)',
    source: 'consultant_skills',
    cadence: 'monthly',
    owner: 'recruitment',
    threshold: 'Sous 30 %, le matching classe sur du déclaratif.',
    decision: 'Alimenter le référentiel depuis les missions tenues plutôt que depuis les CV.',
  }),
  computed({
    key: 'profiles_per_need',
    family: 'recruitment',
    label: { fr: 'Profils poussés par besoin', en: 'Profiles per need' },
    definition: 'Nombre médian de profils envoyés par besoin travaillé.',
    formula: 'median(COUNT(submissions) par project_need)',
    source: 'submissions, project_needs',
    cadence: 'monthly',
    owner: 'recruitment',
    threshold: 'Au-delà de 5, on arrose ; sous 2, on n’a pas de choix à proposer.',
    decision:
      'Au-delà du seuil haut, resserrer sur les deux meilleurs scores plutôt que d’envoyer la shortlist entière.',
  }),
  computed({
    key: 'submission_win_rate',
    family: 'recruitment',
    label: { fr: 'Positionnements acceptés', en: 'Submission acceptance' },
    definition: 'Profils acceptés ÷ profils ayant reçu une VRAIE réponse du client.',
    formula: 'accepted ÷ (accepted + refused avec motif) — les sans-retour sont exclus des deux termes',
    source: 'submissions',
    cadence: 'monthly',
    owner: 'recruitment',
    threshold: 'Sous 20 %, le ciblage est mauvais avant que les profils ne le soient.',
    decision: 'Relire les motifs de refus enregistrés avant de changer quoi que ce soit au sourcing.',
    dictionaryKey: 'submission_acceptance_rate',
  }),
  computed({
    key: 'time_to_feedback_days',
    family: 'recruitment',
    label: { fr: 'Délai de retour client', en: 'Client feedback delay' },
    definition: 'Délai médian entre l’envoi d’un profil et le premier retour du client.',
    formula: 'median(première submission_feedback − submissions.created_at)',
    source: 'submissions, submission_feedback',
    cadence: 'weekly',
    owner: 'recruitment',
    threshold: 'Au-delà de 14 jours, le profil est parti ailleurs.',
    decision: 'La file d’intervention ouvre déjà une ligne à ce seuil : elle se traite, elle ne se contemple pas.',
    dictionaryKey: 'time_to_feedback',
  }),
  computed({
    key: 'interview_conversion',
    family: 'recruitment',
    label: { fr: 'Entretiens → placements', en: 'Interviews to placements' },
    definition: 'Entretiens ayant abouti à un placement ÷ entretiens dont l’issue est connue.',
    formula: 'COUNT(interviews.outcome = placed) ÷ COUNT(interviews avec issue)',
    source: 'interviews',
    cadence: 'monthly',
    owner: 'recruitment',
    threshold: 'Sous 30 %, l’entretien sert de filtre à ce qui aurait dû l’être avant.',
    decision: 'Renforcer la qualification AVANT l’entretien plutôt que d’en programmer davantage.',
  }),
  pending(
    {
      key: 'time_to_fill_days',
      family: 'recruitment',
      label: { fr: 'Délai de pourvoi', en: 'Time to fill' },
      definition: 'Délai entre l’ouverture d’un besoin et le démarrage effectif du consultant.',
      formula: 'median(mission_assignments.start_date − project_needs.created_at)',
      cadence: 'monthly',
      owner: 'recruitment',
      threshold: 'Au-delà de 45 jours, le client a organisé son projet sans nous.',
      decision: 'Remonter la chaîne : le retard se loge presque toujours entre la shortlist et l’envoi.',
    },
    'Rien ne relie une affectation de mission au BESOIN qui l’a produite : les affectations portent la mission, pas le besoin projet. Rapprocher les deux par le consultant et la date donnerait un délai plausible et parfois faux — exactement ce qu’un indicateur de pilotage ne doit pas être.',
  ),
]

/* ══════════════════════════════════════════════════════════════════════════ */
/*  C · Delivery et satisfaction — 12                                         */
/* ══════════════════════════════════════════════════════════════════════════ */

const DELIVERY: readonly ManagerKpi[] = [
  computed({
    key: 'missions_active',
    family: 'delivery',
    label: { fr: 'Missions en cours', en: 'Active missions' },
    definition: 'Missions dont l’état est « en cours » à la date de lecture.',
    formula: 'COUNT(missions WHERE status = active)',
    source: 'missions',
    cadence: 'weekly',
    owner: 'delivery',
    threshold: 'Se lit avec l’intercontrat : beaucoup de missions et beaucoup de bench est un problème d’affectation.',
    decision: 'Vérifier que chaque mission active porte au moins une affectation.',
  }),
  computed({
    key: 'missions_without_end_date',
    family: 'delivery',
    label: { fr: 'Missions sans date de fin', en: 'Missions with no end date' },
    definition: 'Missions actives dont la date de fin n’est pas renseignée.',
    formula: 'COUNT(missions actives WHERE end_date IS NULL) ÷ COUNT(missions actives)',
    source: 'missions',
    cadence: 'weekly',
    owner: 'delivery',
    threshold: 'Toute mission sans date de fin est une alerte de renouvellement qui ne se déclenchera jamais.',
    decision: 'Renseigner la date, ou déclarer la mission au forfait — les deux se pilotent, l’absence non.',
  }),
  computed({
    key: 'missions_ending_without_plan',
    family: 'delivery',
    label: { fr: 'Missions T-30 sans plan', en: 'Missions ending in 30 days with no plan' },
    definition: 'Missions qui s’arrêtent dans le mois et sur lesquelles aucune action de renouvellement n’est posée.',
    formula: 'COUNT(missions end_date < now + 30j sans tâche de renouvellement)',
    source: 'missions, tasks',
    cadence: 'weekly',
    owner: 'delivery',
    threshold: 'Une seule suffit à déclencher la revue : une fenêtre de renouvellement ne se rouvre pas.',
    decision: 'Poser la prochaine action sur le compte, ou déclarer la fin assumée.',
  }),
  computed({
    key: 'bench_rate',
    family: 'delivery',
    label: { fr: 'Taux d’intercontrat', en: 'Bench rate' },
    definition: 'Consultants sans mission active ÷ effectif dont l’affectation est connue.',
    formula: 'COUNT(consultants sans affectation active) ÷ COUNT(consultants avec affectation renseignée)',
    source: 'consultants, mission_assignments',
    cadence: 'monthly',
    owner: 'direction',
    threshold: 'Sous 5 % piloté · au-delà de 15 % critique.',
    decision: 'Au-delà de 10 % : plan de push des profils concernés et revue des TJM.',
  }),
  pending(
    {
      key: 'bench_duration_days',
      family: 'delivery',
      label: { fr: 'Durée d’intercontrat', en: 'Bench duration' },
      definition: 'Ancienneté médiane des consultants actuellement sans mission.',
      formula: 'median(now − fin de la dernière affectation) pour les consultants sans affectation active',
      cadence: 'monthly',
      owner: 'delivery',
      threshold: 'Au-delà de 30 jours, la routine d’alerte intercontrat se déclenche sur UNE personne.',
      decision: 'Le taux dit combien ; la durée dit si ce sont toujours les mêmes. Les deux se lisent ensemble.',
      dictionaryKey: 'bench_availability',
    },
    'La donnée existe (la date de fin des affectations) mais AUCUN code ne la médiane : le suivi de l’intercontrat COMPTE les consultants au-delà d’un seuil pour déclencher une bulle, il ne mesure aucune durée, et le taux d’intercontrat ne regarde que la présence d’une affectation active. Il était déclaré mesurable depuis le 22/08 sans qu’aucun appelant n’existe — « du code juste que personne n’appelle », en version « pas de code du tout ».',
  ),
  pending(
    {
      key: 'timesheets_on_time',
      family: 'delivery',
      label: { fr: 'CRA reçus à temps', en: 'Timesheets on time' },
      definition: 'Relevés d’activité déposés avant J+5 ÷ relevés attendus.',
      formula: 'COUNT(mission_timesheets déposés avant J+5) ÷ COUNT(attendus)',
      cadence: 'monthly',
      owner: 'delivery',
      // ⚠️ Disait « Sous 90 % » jusqu'au 29/08/2026. La source dit « CRA reçus
      // avant J+5 (> 85 %) » : cinq points d'écart, apparus parce que le nombre
      // de la source n'était écrit nulle part dans le code. Il l'est désormais,
      // et une seule fois (`KPI_TARGETS`).
      threshold: 'Sous la cible, la facturation du mois glisse.',
      decision:
        'La relance porte sur les MANQUANTS, jamais sur les « attendus » — relancer quelqu’un pour un mois qu’il n’a pas fini de vivre fait ignorer les relances suivantes.',
    },
    'Rien n’horodate le DÉPÔT d’un relevé : les relevés d’activité portent un statut, une date de création et une date de mise à jour, jamais une date de dépôt. La date de mise à jour bouge à chaque validation, contestation ou correction — l’utiliser ferait passer une relecture du 20 pour un dépôt tardif, et une ligne corrigée deux fois pour un retard aggravé. Le taux serait plausible et faux, ce qu’un indicateur de pilotage ne doit jamais être. La cible reste écrite : c’est la colonne qui manque, pas la destination.',
  ),
  computed({
    key: 'timesheet_gaps',
    family: 'delivery',
    label: { fr: 'Écarts de CRA inexpliqués', en: 'Unexplained timesheet gaps' },
    definition: 'Relevés dont les jours déclarés s’écartent de la charge attendue sans explication écrite.',
    formula: 'COUNT(relevés avec écart et sans explication) ÷ COUNT(relevés avec écart)',
    source: 'mission_timesheets',
    cadence: 'monthly',
    owner: 'delivery',
    threshold: 'Chaque écart inexpliqué bloque une facturation.',
    decision: 'Expliquer ou corriger : l’explication ne masque pas le nombre, elle l’accompagne.',
  }),
  computed({
    key: 'missions_at_risk',
    family: 'delivery',
    label: { fr: 'Missions à risque', en: 'Missions at risk' },
    definition: 'Missions dont le score de risque dépasse le seuil, sur les axes réellement évaluables.',
    formula: 'COUNT(missions avec score de risque calculé au-dessus du seuil)',
    source: 'missions, mission_timesheets',
    cadence: 'weekly',
    owner: 'delivery',
    threshold: 'Un score n’est calculé qu’à partir de 3 axes évaluables — sinon « non mesurable ».',
    decision: 'Une mission à risque reçoit un plan écrit, pas une case cochée.',
  }),
  computed({
    key: 'unmeasurable_missions',
    family: 'delivery',
    label: { fr: 'Missions non mesurables', en: 'Unmeasurable missions' },
    definition: 'Missions dont le score de risque NE PEUT PAS être produit, faute d’axes évaluables.',
    formula: 'COUNT(missions actives avec moins de 3 axes de risque renseignés) ÷ COUNT(missions actives)',
    source: 'missions, mission_timesheets',
    cadence: 'weekly',
    owner: 'delivery',
    // ⚠️ Ajouté le 29/08/2026. La source le nomme (« missions non mesurables
    // (< 20 %) ») et le dictionnaire ne le portait pas — si bien que sa cible
    // avait migré, seule, sur `unmeasured_margin`, dont elle n'est pas la cible.
    threshold: 'Au-delà de la cible, « missions à risque » ne décrit plus le portefeuille.',
    decision:
      'C’est le compagnon obligatoire de « Missions à risque » : il dit sur combien de missions ce chiffre porte vraiment. Sans lui, un portefeuille sans satisfaction mesurée passe pour un portefeuille sain.',
  }),
  pending(
    {
      key: 'renewal_rate',
      family: 'delivery',
      label: { fr: 'Taux de renouvellement', en: 'Renewal rate' },
      definition: 'Missions prolongées ÷ missions arrivées à leur terme sur la période.',
      formula: 'COUNT(missions prolongées) ÷ COUNT(missions dont la date de fin est passée)',
      cadence: 'quarterly',
      owner: 'direction',
      threshold: 'Le renouvellement coûte dix fois moins qu’une conquête : c’est le premier chiffre du delivery.',
      decision:
        'Sous la cible, la revue porte sur les FINS DE MISSION sans plan, pas sur la prospection — reconquérir un compte perdu coûte plus cher que de le garder.',
    },
    'Une prolongation ne laisse aucune trace distincte : la règle du §13.2 dit « nouvelle date de fin, historique conservé, PAS de nouvelle mission ». Le dénominateur est donc lisible (les missions dont la fin est passée), mais le numérateur ne l’est pas — une date de fin repoussée et une date de fin corrigée s’écrivent de la même façon. Le journal des modifications garde bien l’écriture du champ, sans dire laquelle des deux elle était. Compter les repoussements pour des renouvellements produirait un taux flatteur et faux.',
  ),
  computed({
    key: 'assignments_without_rate',
    family: 'delivery',
    label: { fr: 'Affectations sans TJM', en: 'Assignments with no rate' },
    definition: 'Affectations actives dont le tarif journalier n’est pas renseigné.',
    formula: 'COUNT(mission_assignments actives WHERE daily_rate IS NULL)',
    source: 'mission_assignments',
    cadence: 'monthly',
    owner: 'finance',
    threshold: 'Chacune retire une mission du calcul de marge — et le calcul le DIT.',
    decision: 'Renseigner, ou accepter que la marge de l’espace soit annoncée comme partielle.',
  }),
  pending(
    {
      key: 'client_nps',
      family: 'delivery',
      label: { fr: 'Satisfaction client', en: 'Client satisfaction' },
      definition: 'Note de satisfaction recueillie auprès du client en fin de mission.',
      formula: 'moyenne des notes recueillies, avec le nombre de répondants',
      cadence: 'quarterly',
      owner: 'delivery',
      threshold: 'Se lit avec le nombre de répondants : une note sur deux réponses ne dit rien.',
      decision: 'Une note basse déclenche un entretien, jamais un plan d’action automatique.',
    },
    'Aucune enquête de satisfaction n’existe dans le produit : ni table, ni envoi, ni collecte. Le calculer supposerait d’inventer la donnée.',
  ),
  pending(
    {
      key: 'consultant_nps',
      family: 'delivery',
      label: { fr: 'Satisfaction consultant', en: 'Consultant satisfaction' },
      definition: 'Note de satisfaction recueillie auprès du consultant en mission.',
      formula: 'moyenne des notes recueillies, avec le nombre de répondants',
      cadence: 'quarterly',
      owner: 'delivery',
      threshold: 'Se lit avec le taux de réponse, sans quoi seuls les mécontents répondent.',
      decision:
        'Croiser avec l’intercontrat : un consultant satisfait qui part est un problème de mission, pas de personne.',
    },
    'Même raison que la satisfaction client, avec une contrainte de plus : recueillir l’avis d’un salarié dans un outil commercial pose une question de représentation du personnel qui n’a pas été tranchée.',
  ),
  pending(
    {
      key: 'delivery_incidents',
      family: 'delivery',
      label: { fr: 'Incidents de mission', en: 'Delivery incidents' },
      definition: 'Incidents déclarés sur une mission en cours (retard, remplacement, escalade client).',
      formula: 'COUNT(incidents déclarés) par mission active',
      cadence: 'monthly',
      owner: 'delivery',
      threshold: 'Plus d’un par mission est un problème de cadrage initial.',
      decision: 'Rejoint le score de risque de la mission concernée.',
    },
    'Le produit ne porte aucune notion d’incident de mission. La porte de décision sur le risque de livraison existe, mais elle journalise une décision — elle ne collecte pas les faits qui l’ont motivée.',
  ),
]

/* ══════════════════════════════════════════════════════════════════════════ */
/*  D · Capitalisation — 10                                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

const CAPITALISATION: readonly ManagerKpi[] = [
  computed({
    key: 'proofs_collected',
    family: 'capitalisation',
    label: { fr: 'Preuves collectées', en: 'Proofs collected' },
    definition: 'Références et retours d’expérience enregistrés sur la période.',
    formula: 'COUNT(proofs) créées dans la fenêtre',
    source: 'proofs',
    cadence: 'quarterly',
    owner: 'direction',
    threshold: 'Moins d’une par mission terminée : le savoir-faire ne se capitalise pas.',
    decision: 'Poser la collecte de REX en fin de mission plutôt qu’au moment où on en a besoin.',
  }),
  computed({
    key: 'proofs_usable',
    family: 'capitalisation',
    label: { fr: 'Preuves utilisables', en: 'Usable proofs' },
    definition: 'Preuves dont la force et l’accord client permettent une utilisation devant un prospect.',
    formula: 'COUNT(proofs utilisables) ÷ COUNT(proofs)',
    source: 'proofs',
    cadence: 'quarterly',
    owner: 'direction',
    threshold: 'Sous 50 %, la moitié du capital est inexploitable au moment de vendre.',
    decision: 'Demander l’accord client au moment de la collecte, pas six mois après.',
  }),
  computed({
    key: 'proofs_reused',
    family: 'capitalisation',
    label: { fr: 'Preuves réutilisées', en: 'Proofs reused' },
    definition: 'Preuves rattachées à au moins un projet ou une réponse.',
    formula: 'COUNT(proofs rattachées) ÷ COUNT(proofs utilisables)',
    source: 'proofs',
    cadence: 'quarterly',
    owner: 'direction',
    threshold: 'Sous 20 %, la bibliothèque existe et personne ne l’ouvre.',
    decision:
      'Le problème est presque toujours la recherche, pas le contenu : vérifier que les preuves sont trouvables par secteur.',
  }),
  computed({
    key: 'sector_coverage',
    family: 'capitalisation',
    label: { fr: 'Couverture sectorielle', en: 'Sector coverage' },
    definition: 'Secteurs sur lesquels l’ESN dispose d’au moins une preuve utilisable.',
    formula: 'COUNT(DISTINCT secteur des preuves utilisables)',
    source: 'proofs, accounts.sector',
    cadence: 'quarterly',
    owner: 'direction',
    threshold: 'Un secteur travaillé sans aucune preuve est un secteur qu’on aborde à froid à chaque fois.',
    decision: 'Prioriser la collecte sur les secteurs où le pipe est ouvert et la preuve absente.',
  }),
  computed({
    key: 'partners_identified',
    family: 'capitalisation',
    label: { fr: 'Partenaires identifiés', en: 'Partners identified' },
    definition: 'Comptes sur lesquels au moins un partenaire ou un concurrent en place est connu.',
    formula: 'COUNT(DISTINCT account_id dans account_partners) ÷ COUNT(comptes suivis)',
    source: 'account_partners',
    cadence: 'quarterly',
    owner: 'business',
    threshold: 'Sous 30 %, on aborde les comptes sans savoir qui y est déjà.',
    decision: 'Lancer la détection de rang 1 sur les comptes prioritaires sans partenaire connu.',
  }),
  computed({
    key: 'skills_referential_coverage',
    family: 'capitalisation',
    label: { fr: 'Couverture du référentiel', en: 'Skills referential coverage' },
    definition: 'Compétences du vivier rattachées à un terme canonique du référentiel.',
    formula: 'COUNT(consultant_skills avec canonique) ÷ COUNT(consultant_skills)',
    source: 'consultant_skills, skill_alias_library',
    cadence: 'monthly',
    owner: 'recruitment',
    threshold: 'Une compétence hors référentiel ne remonte sur AUCUNE recherche.',
    decision: 'Trancher la file d’alias : tant qu’un terme y attend, les profils qui le portent sont invisibles.',
  }),
  computed({
    key: 'pending_skill_aliases',
    family: 'capitalisation',
    label: { fr: 'Alias en attente', en: 'Pending skill aliases' },
    definition: 'Termes de compétence en attente d’arbitrage dans le référentiel.',
    formula: 'COUNT(skill_alias WHERE status = pending)',
    source: 'skill_alias_library',
    cadence: 'weekly',
    owner: 'recruitment',
    threshold: 'Au-delà de 20, la file n’est plus traitée, elle est subie.',
    decision: 'Vider la file avant d’ajouter de nouvelles sources de CV.',
  }),
  computed({
    key: 'accounts_with_plan',
    family: 'capitalisation',
    label: { fr: 'Comptes avec plan à jour', en: 'Accounts with a current plan' },
    definition: 'Comptes prioritaires dont le plan d’action a moins de 90 jours.',
    formula: 'COUNT(accounts prioritaires avec plan récent) ÷ COUNT(accounts prioritaires)',
    source: 'accounts, action_plans',
    cadence: 'quarterly',
    owner: 'business',
    threshold: 'Sous 50 %, la moitié des comptes prioritaires est travaillée de mémoire.',
    decision: 'Relancer une analyse sur les comptes dont le plan a vieilli — pas sur ceux qui n’en ont jamais eu.',
  }),
  pending(
    {
      key: 'rex_per_mission',
      family: 'capitalisation',
      label: { fr: 'REX par mission terminée', en: 'Post-mortems per finished mission' },
      definition: 'Retours d’expérience formalisés rapportés aux missions terminées.',
      formula: 'COUNT(proofs de type REX) ÷ COUNT(missions terminées sur la fenêtre)',
      cadence: 'quarterly',
      owner: 'direction',
      threshold: 'Sous 1 pour 2, l’ESN oublie ce qu’elle vient d’apprendre.',
      decision: 'Inscrire la collecte de REX dans la chaîne de fin de mission.',
    },
    'Une preuve n’est pas rattachée à la MISSION qui l’a produite : les preuves portent un périmètre et un compte, pas une mission. Le ratio se calculerait sur deux ensembles qui ne se recouvrent pas.',
  ),
  pending(
    {
      key: 'proof_to_win_contribution',
      family: 'capitalisation',
      label: { fr: 'Preuves ayant contribué à un gain', en: 'Proofs behind a win' },
      definition: 'Projets gagnés sur lesquels une preuve avait été jointe.',
      formula: 'COUNT(projets gagnés avec preuve rattachée) ÷ COUNT(projets gagnés)',
      cadence: 'quarterly',
      owner: 'direction',
      threshold: 'C’est le seul chiffre qui justifie l’effort de capitalisation.',
      decision: 'Sous 20 %, la bibliothèque ne sert pas à vendre : revoir ce qu’on y met.',
    },
    'Le rattachement d’une preuve à un projet existe, mais rien n’enregistre qu’elle a été UTILISÉE dans la réponse. Compter le rattachement pour de l’usage ferait passer une bibliothèque bien rangée pour une bibliothèque efficace.',
  ),
]

/* ══════════════════════════════════════════════════════════════════════════ */
/*  E · Finance et cash — 9                                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

const FINANCE: readonly ManagerKpi[] = [
  computed({
    key: 'revenue_signed',
    family: 'finance',
    label: { fr: 'CA signé', en: 'Signed revenue' },
    definition: 'Montant des projets GAGNÉS sur la période, tel qu’il a été saisi.',
    formula: 'SUM(opportunities.amount_cents WHERE stage = won) — jamais TJM × durée',
    source: 'opportunities',
    cadence: 'monthly',
    owner: 'finance',
    threshold: 'Se lit à côté du produit et du facturé, jamais seul.',
    decision:
      'L’écart entre signé et produit dit si les missions démarrent ; entre produit et facturé, si la facturation suit.',
  }),
  computed({
    key: 'revenue_produced',
    family: 'finance',
    label: { fr: 'CA produit', en: 'Delivered revenue' },
    definition: 'Jours réellement travaillés × tarif journalier.',
    formula: 'SUM(mission_timesheets.days × missions.daily_rate)',
    source: 'mission_timesheets, missions',
    cadence: 'monthly',
    owner: 'finance',
    threshold: 'Un mois sans relevé ne vaut pas 0 € : il est compté à part.',
    decision: 'Relancer les relevés manquants avant de conclure quoi que ce soit sur le mois.',
  }),
  computed({
    key: 'revenue_invoiced',
    family: 'finance',
    label: { fr: 'CA facturé', en: 'Invoiced revenue' },
    definition: 'Montant réellement sorti vers l’outil comptable.',
    formula: 'SUM(invoice_readiness.invoiced_amount_cents)',
    source: 'invoice_readiness',
    cadence: 'monthly',
    owner: 'finance',
    threshold: 'L’écart avec le produit est le montant qu’on a oublié de facturer.',
    decision: 'Traiter les bloqueurs de facturation nommés, un par un — chacun porte son geste et son écran.',
    dictionaryKey: 'prepared_revenue',
  }),
  computed({
    key: 'revenue_collected',
    family: 'finance',
    label: { fr: 'CA encaissé', en: 'Collected revenue' },
    definition: 'Montant réellement payé par les clients.',
    // ⚠️ #2419.4 — cette formule disait
    // `SUM(invoiced_amount_cents WHERE paid_at IS NOT NULL)` : le FACTURÉ de
    // tout ce qui porte une date de paiement. C'était le défaut du paiement
    // partiel, écrit comme formule officielle — un règlement de 5 000 € sur
    // 10 000 € y comptait pour 10 000 € d'encaissé. Et elle DIVERGEAIT de
    // l'implémentation, qui somme bien `paid_amount_cents` : le texte que lit
    // un dirigeant et le code qui calcule disaient deux choses différentes.
    formula: 'SUM(invoice_readiness.paid_amount_cents WHERE paid_at IS NOT NULL)',
    source: 'invoice_readiness',
    cadence: 'monthly',
    owner: 'finance',
    threshold:
      'L’écart avec le facturé est la trésorerie qui manque — règlements partiels compris : ce qui reste dû sur une facture à moitié réglée est dedans.',
    decision: 'Relancer les impayées : elles ont un RETARD, pas un délai — elles sortent du calcul du DSO.',
  }),
  computed({
    key: 'gross_margin',
    family: 'finance',
    label: { fr: 'Marge brute', en: 'Gross margin' },
    definition: 'Marge de l’espace, pondérée par les JOURS déclarés.',
    formula: 'SUM((TJM − coût) × jours) ÷ SUM(TJM × jours), sur les missions chiffrées',
    source: 'missions, mission_timesheets',
    cadence: 'monthly',
    owner: 'finance',
    threshold: 'Le seuil d’alerte est réglable par espace et ÉTEINT par défaut.',
    decision: 'Une mission sous le seuil se renégocie ou se documente — elle ne se moyenne pas.',
  }),
  computed({
    key: 'unmeasured_margin',
    family: 'finance',
    label: { fr: 'Marge non mesurée', en: 'Unmeasured margin' },
    definition: 'Missions actives dont la marge ne peut pas être calculée, faute de TJM ou de coût.',
    formula: 'COUNT(missions actives sans TJM ou sans coût) ÷ COUNT(missions actives)',
    source: 'missions',
    cadence: 'monthly',
    owner: 'finance',
    // ⚠️ Disait « Au-delà de 20 % » jusqu'au 29/08/2026. La source chiffre la
    // marge non mesurée à « < 10 % » ; le 20 % existe bien au §13.3, mais il
    // appartient à un AUTRE indicateur — « missions non mesurables (< 20 %) ».
    // Deux cibles fondues en une seule, c'est-à-dire une cible perdue.
    threshold: 'Au-delà de la cible, la marge annoncée ne décrit plus l’espace.',
    decision: 'C’est cet indicateur qui dit à quel point le précédent est fiable : les deux se lisent ensemble.',
  }),
  computed({
    key: 'timesheets_received',
    family: 'finance',
    label: { fr: 'CRA reçus à la clôture', en: 'Timesheets received at close' },
    // ⚠️ « À la clôture », et non « avant la clôture ». C'est un ÉTAT à un
    // instant, pas une mesure de ponctualité — et c'est pour cela que cet
    // indicateur ne porte PAS la cible « > 85 % » du PDF 5 §13.3, qui porte,
    // elle, sur « reçus avant J+5 » (`timesheets_on_time`). Les confondre ferait
    // afficher 100 % en vert sur un mois où tout est arrivé le 28.
    definition: 'Part des relevés attendus effectivement reçus à la clôture du mois.',
    formula: 'COUNT(relevés déposés ou validés) ÷ COUNT(relevés attendus) — un forfait n’attend aucun relevé',
    source: 'mission_timesheets',
    cadence: 'monthly',
    owner: 'finance',
    threshold: 'Un relevé manquant à la clôture est une ligne de facturation qui ne partira pas ce mois-ci.',
    decision:
      'La relance vise les manquants ; un forfait sorti du dénominateur évite l’alerte qui ne se résout jamais.',
  }),
  computed({
    key: 'dso_days',
    family: 'finance',
    label: { fr: 'Délai de paiement', en: 'Days sales outstanding' },
    definition: 'Délai MÉDIAN entre l’émission d’une facture et son paiement.',
    formula: 'median(paid_at − invoiced_at) sur les factures payées et correctement datées',
    source: 'invoice_readiness',
    cadence: 'monthly',
    owner: 'finance',
    threshold: 'Non mesurable sous 10 factures payées — et il le DIT, avec le nombre qui manque.',
    decision:
      'Une médiane et non une moyenne : une facture payée après relance judiciaire ne déplace pas le portefeuille.',
  }),
  // #3271.2 (BEL-SC-242) — la vue Fondateur nomme « dépendance » et
  // « concentration client » : deux mots pour la même question, absente du
  // dictionnaire jusqu'ici. `pending()` et non un chiffre deviné : le CA
  // produit (CA produit) est total d'espace, pas encore rattaché à
  // `missions.account_id`, donc pas encore divisible par compte.
  pending(
    {
      key: 'client_concentration_top_account',
      family: 'finance',
      label: { fr: 'Concentration sur le premier compte', en: 'Top-account concentration' },
      definition: 'Part du chiffre d’affaires produit portée par le compte le plus important de l’espace.',
      formula: 'MAX(SUM(revenue_produced) GROUP BY account_id) ÷ SUM(revenue_produced)',
      cadence: 'quarterly',
      owner: 'direction',
      threshold: 'Au-delà d’un tiers du CA produit sur un seul compte, la dépendance devient un risque de gouvernance.',
      decision:
        'Documenter un plan de diversification et prioriser l’ouverture de nouveaux comptes avant l’échéance du compte concerné.',
    },
    'Le CA produit n’est agrégé qu’au niveau de l’espace : il manque le rattachement compte par compte (missions → compte → somme par compte) pour diviser un compte par le total. Rien ne doit être deviné en attendant ce calcul.',
  ),
  // #3415.1 (beta-feedback #3415, lot C14 30/09/2026) — la vue Fondateur de
  // l'issue nomme « croissance », à côté de « chiffre d'affaires », « marge »,
  // « cash », « dépendance » et « capacité ». Les cinq autres ont déjà leur
  // indicateur (`revenue_*`, `gross_margin`, `dso_days`,
  // `client_concentration_top_account`, `bench_rate`) ; la croissance
  // n'avait pas d'entrée. `pending()`, comme `client_concentration_top_account`
  // juste au-dessus : aucune photo mensuelle du CA produit d'un espace
  // n'existe pour comparer une période à la précédente — le calculer aujourd'hui
  // inventerait un pourcentage sur une seule mesure.
  pending(
    {
      key: 'revenue_growth',
      family: 'finance',
      label: { fr: 'Croissance du CA produit', en: 'Produced revenue growth' },
      definition: 'Évolution du CA produit du mois par rapport au mois précédent.',
      formula: '(SUM(revenue_produced) mois courant − SUM(revenue_produced) mois précédent) ÷ mois précédent',
      cadence: 'monthly',
      owner: 'direction',
      threshold:
        'Deux mois consécutifs de recul appellent une revue, pas un seul — un mois isolé peut être un creux de facturation.',
      decision:
        'Croiser avec le pipeline (le montant du pipeline) : un recul sans pipeline qui compense est un signal de fond, pas un accident de calendrier.',
    },
    'Aucune photo mensuelle du CA produit par espace n’est conservée aujourd’hui : seul le total courant est lu, sans historique pour le comparer au mois précédent. Rien ne doit être deviné à partir d’une seule mesure.',
  ),
]

/* ══════════════════════════════════════════════════════════════════════════ */
/*  F · Produit et adoption — 7                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

const ADOPTION: readonly ManagerKpi[] = [
  computed({
    key: 'signup_to_first_import_days',
    family: 'adoption',
    label: { fr: 'Inscription → premier import', en: 'Signup to first import' },
    definition: 'Délai entre la création du compte et le premier import de données réel.',
    formula: 'median(première import_sessions.created_at − profiles.created_at)',
    source: 'import_sessions, profiles',
    cadence: 'monthly',
    owner: 'product',
    threshold: 'Au-delà de 7 jours, l’espace reste vide et l’outil paraît inutile.',
    decision: 'C’est le premier geste qui décide de l’adoption : l’accompagner, pas le rappeler.',
  }),
  computed({
    key: 'auto_captured_activities',
    family: 'adoption',
    label: { fr: 'Activités capturées automatiquement', en: 'Auto-captured activities' },
    definition: 'Part des activités venues d’un connecteur plutôt que d’une saisie manuelle.',
    formula: 'COUNT(activities WHERE source <> manual) ÷ COUNT(activities)',
    source: 'activities',
    cadence: 'monthly',
    owner: 'product',
    threshold: 'Sous 50 %, l’équipe ressaisit ce que ses outils savent déjà.',
    decision: 'Vérifier quels connecteurs sont branchés, et lesquels ont perdu leur autorisation sans le dire.',
  }),
  computed({
    key: 'connectors_operational',
    family: 'adoption',
    label: { fr: 'Connecteurs opérationnels', en: 'Operational connectors' },
    definition: 'Connecteurs déclarés connectés ET dont une lecture récente a réussi.',
    formula: 'COUNT(outils avec preuve de lecture récente) ÷ COUNT(outils connectés)',
    source: 'google_connections, microsoft_connections, crm_connections',
    cadence: 'weekly',
    owner: 'product',
    threshold: 'Un connecteur « connecté » sans preuve de lecture est une panne silencieuse.',
    decision: 'Le panneau de diagnostic dit la portée exacte qui manque : reconnecter au hasard ne répare rien.',
  }),
  computed({
    key: 'active_members',
    family: 'adoption',
    label: { fr: 'Membres actifs', en: 'Active members' },
    definition: 'Membres ayant fait au moins une action tracée sur les 14 derniers jours.',
    formula: 'COUNT(DISTINCT user_actions.user_id sur 14 j) ÷ COUNT(sièges occupés)',
    source: 'user_actions',
    cadence: 'weekly',
    owner: 'product',
    threshold: 'Sous 70 %, des sièges sont payés et pas utilisés.',
    decision: 'Un siège inactif se réattribue ou se libère — il ne se relance pas indéfiniment.',
  }),
  computed({
    key: 'credits_consumed_ratio',
    family: 'adoption',
    label: { fr: 'Enveloppe consommée', en: 'Credit envelope used' },
    definition: 'Part de l’enveloppe de crédits du cycle déjà consommée.',
    formula: 'accounts_used ÷ (accounts_limit + report + recharges)',
    source: 'subscriptions',
    cadence: 'weekly',
    owner: 'product',
    threshold: 'À 90 %, la file d’intervention ouvre une ligne — on prévient AVANT le mur.',
    decision: 'Recharger, ou arbitrer ce qui mérite une analyse d’ici la fin du cycle.',
  }),
  computed({
    key: 'routines_active',
    family: 'adoption',
    label: { fr: 'Automatisations actives', en: 'Active routines' },
    definition: 'Routines réellement abonnées, rapportées à celles dont la capacité est disponible.',
    formula: 'COUNT(routine_subscriptions actives) ÷ COUNT(routines disponibles)',
    source: 'routine_subscriptions',
    cadence: 'monthly',
    owner: 'product',
    threshold: 'Aucune routine active : l’outil ne travaille que quand on l’ouvre.',
    decision: 'Proposer les trois routines dont la capacité est déjà branchée — pas les vingt-quatre autres.',
  }),
  computed({
    key: 'proactivity_suppressed',
    family: 'adoption',
    label: { fr: 'Notifications supprimées par le plafond', en: 'Notifications capped' },
    definition: 'Messages proactifs écartés parce que le plafond quotidien était atteint.',
    formula: 'COUNT(notifications suppressed_at NOT NULL) ÷ COUNT(candidates)',
    source: 'notifications, proactivity_counters',
    cadence: 'weekly',
    owner: 'product',
    threshold: 'Au-delà de 30 %, on produit plus d’alertes que personne ne peut en traiter.',
    decision:
      'Ce qui est supprimé reste VISIBLE dans le centre d’actions : c’est l’interruption qu’on retire, pas l’information.',
  }),
]

/**
 * Le catalogue complet — 64 indicateurs, six familles.
 *
 * Ordre stable : c'est l'ordre d'affichage, et un dictionnaire qui se réordonne
 * d'une version à l'autre ne se relit pas.
 */
export const MANAGER_KPIS: readonly ManagerKpi[] = [
  ...BUSINESS,
  ...RECRUITMENT,
  ...DELIVERY,
  ...CAPITALISATION,
  ...FINANCE,
  ...ADOPTION,
]

/**
 * Les indicateurs d'une famille, dans l'ordre du catalogue.
 *
 * ⚠️ Le catalogue est un ARGUMENT, et c'est la seule chose intéressante de
 * cette fonction. L'écran affiche ce que la route `/pilotage/kpi-catalogue` lui
 * a servi ; s'il regroupait la constante empaquetée dans son bundle, le jour où
 * le serveur filtrera (par offre, par espace, par droit) il montrerait un
 * dictionnaire que l'utilisateur n'a pas reçu — deux vérités pour la même
 * question. Le défaut par défaut sert les appelants qui N'ONT pas de payload
 * (les gardes, le serveur lui-même).
 *
 * Elle existe pour que ce filtre vive à UN seul endroit (GA-26) : il était
 * réécrit à la main dans `KpiCataloguePanel`, et deux chemins qui refont la
 * même dérivation divergent.
 */
export function kpisOfFamily(
  family: ManagerKpiFamily,
  catalogue: readonly ManagerKpi[] = MANAGER_KPIS,
): readonly ManagerKpi[] {
  return catalogue.filter(kpi => kpi.family === family)
}
