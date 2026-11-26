import { z } from 'zod'
import { INTERVENTION_KINDS, INTERVENTION_SEVERITY, type InterventionKind } from './playbook.js'

/**
 * #2402 — LAU-FINAL-116 — EVENT & TRIGGER REGISTRY CANONIQUE.
 *
 * Le registre confirme l'antériorité (23/09) : cinq pipelines détectent déjà
 * des signaux — `intervention-rules.ts` (12 natures, TS), `discover_signals.py`
 * (AO/hiring/legal/tech, Python), `credits.service.ts` (`credit_low`),
 * `governance` (`duplicate_pairs`), `DeliveryRoutinesService` (trois
 * routines) — sans schéma commun ni catalogue partagé. Les unifier tous est
 * « chantier > 1 journée » (registre `.claude/notes/registre-2026-09-20-chat-
 * lot2.md`, ligne #2402.1) : cette tranche pose le SCHÉMA canonique et le
 * CATALOGUE (#2402.9/.1), migre le premier émetteur réel
 * (`interventions.sweeper.ts`, les douze natures TS — voir son appel à
 * {@link buildTriggerEvent}), et NOMME le reste sans le cacher (`status:
 * 'known-unlinked'` ou `'planned'`) plutôt que d'inventer une couverture
 * qu'aucun code ne tient.
 *
 * #2875 (#2402.1, vague F/G 27/09) — LES CINQ PIPELINES SONT DÉSORMAIS TOUS
 * MIGRÉS. `interventions.sweeper.ts` construisait déjà chaque `TriggerEvent`
 * (pour la corrélation #2402.14) mais ne le PERSISTAIT pas — il lui manquait
 * l'appel à `TriggerRegistryService.record`, ajouté dans ce lot.
 * `GovernanceService.proposeDuplicates` (`duplicate_pair_detected`) restait le
 * seul à persister depuis le lot précédent. `credits.service.ts`
 * (`credit_low`), `DeliveryRoutinesService` (les trois routines) et
 * `IaProxyController.discoverSignals` (`ao_publie`, l'appelant réel du signal
 * BOAMP de `discover_signals.py` — lui seul connaît l'espace et le compte
 * suivi) migrent dans ce lot. Un seul point de construction reste vrai :
 * {@link buildTriggerEvent} — même pour `ao_publie`, dont le détecteur vit en
 * Python mais dont l'événement canonique est construit et persisté côté API.
 *
 * **17 champs**, exactement ceux listés par l'issue (event_id, type, source,
 * object, timestamp, scope, evidence, confidence, severity, urgency,
 * dedupe_key, cooldown, expiration, eligible_actions, eligible_notifications,
 * permission, status) — en camelCase, comme le reste de ce paquet.
 *
 * ⚠️ **`confidence` n'est PAS une probabilité.** La doctrine refuse toute
 * chance de closing ou prévisionnel pondéré (six fois déjà, `CLAUDE.md` §
 * Doctrine). Ici, « confidence » qualifie la PROVENANCE de la donnée —
 * mesurée directement à la source, ou estimée — jamais un pourcentage de
 * réussite. Même refus dans {@link combineTriggerEvents} : la composition de
 * plusieurs signaux ne rend ni somme ni moyenne pondérée, seulement le MAX de
 * gravité et la liste des signaux impliqués.
 */

export const TRIGGER_FAMILIES = ['commercial', 'talent', 'mission', 'finance', 'produit', 'equipe'] as const
export type TriggerFamily = (typeof TRIGGER_FAMILIES)[number]
export const triggerFamilySchema = z.enum(TRIGGER_FAMILIES)

/** D'où le catalogue sait qu'un type de déclencheur est appelé — la preuve
 *  qu'un point n'est pas « du code que personne n'appelle » (CLAUDE.md, « Ce
 *  qui est déjà livré »). `null` = aucun détecteur, nommé quand même. */
export type TriggerCatalogStatus = 'unified' | 'known-unlinked' | 'planned'

export type TriggerCatalogEntry = {
  readonly family: TriggerFamily
  /** Le pipeline qui détecte ce signal aujourd'hui — vide (null) quand aucun
   *  ne le fait encore. Jamais une référence inventée : soit un `fichier.ts`
   *  ou `fichier.py` réel, soit `null`. */
  readonly detector: string | null
  /** `unified` : câblé, émet un {@link TriggerEvent} canonique via
   *  {@link buildTriggerEvent} (appelant réel, cette tranche).
   *  `known-unlinked` : un détecteur réel existe ailleurs, pas encore migré.
   *  `planned` : nommé par l'issue, aucun détecteur nulle part. */
  readonly status: TriggerCatalogStatus
}

/**
 * Le registre unique (#2402.1). Trois groupes :
 *  1. les treize natures déjà détectées par `intervention-rules.ts`, migrées
 *     ICI (`unified`) — {@link buildTriggerEvent} est leur appelant réel
 *     depuis `interventions.sweeper.ts` ;
 *  2. les signaux détectés AILLEURS mais pas encore unifiés (`known-unlinked`)
 *     — nommés pour ne pas se faire recoder une sixième fois par une page qui
 *     ignorerait qu'ils existent déjà ;
 *  3. les DIX signaux COMMERCIAUX listés textuellement par LAU-FINAL-116
 *     (#2402.3), dont deux seulement recouvrent une nature déjà détectée —
 *     les huit autres sont nommés `planned`, jamais tus.
 *
 * Une clé absente d'ici est un déclencheur HORS CATALOGUE : la garde
 * `apps/api/src/architecture/ga-388-un-declencheur-hors-catalogue-est-refuse.spec.ts`
 * (#2402.2) et {@link triggerEventSchema} (via `triggerTypeSchema`) le
 * refusent tous les deux.
 */
/** Le nom RÉEL de la fonction pure qui détecte chaque nature —
 *  `apps/api/src/modules/playbooks/intervention-rules.ts`. Une table
 *  explicite, jamais dérivée du nom de la clé : l'ordre des mots n'est pas le
 *  même partout (`submission_stalled` → `detectStalledSubmissions`, pas
 *  `detectSubmissionStalled`) et une génération automatique aurait fabriqué
 *  une référence qui n'existe pas dans le code. */
const INTERVENTION_DETECTOR_FUNCTION: Record<InterventionKind, string> = {
  submission_stalled: 'detectStalledSubmissions',
  renewal_at_risk: 'detectRenewalsAtRisk',
  invoicing_blocked: 'detectBlockedInvoicing',
  account_untouched: 'detectUntouchedAccounts',
  rep_inactive: 'detectInactiveReps',
  credits_exhausted: 'detectCreditsExhausted',
  account_no_next_action: 'detectAccountsWithoutNextAction',
  project_no_decision: 'detectProjectsWithoutDecision',
  need_without_shortlist: 'detectNeedsWithoutShortlist',
  timesheet_missing: 'detectMissingTimesheets',
  payment_overdue: 'detectOverduePayments',
  mission_without_end_date: 'detectMissionsWithoutEndDate',
  staffing_collision: 'detectStaffingCollisionInterventions',
}

export const TRIGGER_CATALOG: Record<string, TriggerCatalogEntry> = {
  // ── 1. Les treize natures d'intervention, migrées dans cette tranche ────
  ...Object.fromEntries(
    INTERVENTION_KINDS.map(kind => [
      kind,
      {
        family: interventionFamily(kind),
        detector: `apps/api/src/modules/playbooks/intervention-rules.ts (${INTERVENTION_DETECTOR_FUNCTION[kind]})`,
        status: 'unified' as const,
      },
    ]),
  ),

  // ── 2. Signaux détectés ailleurs, désormais unifiés ──────────────────────
  // #2875/#2402.1 (vague F/G 27/09) — `CreditsService.maybeNotifyCreditLow`
  // construit désormais AUSSI un `TriggerEvent` canonique, juste avant de
  // poser la notification in-app (best-effort, hors chemin critique du débit).
  credit_low: {
    family: 'produit',
    detector: 'apps/api/src/modules/credits/credits.service.ts (maybeNotifyCreditLow)',
    status: 'unified',
  },
  // #2875/#2402.1 (lot g20, 26/09) — deuxième émetteur migré après
  // `interventions.sweeper.ts` : `GovernanceService.proposeDuplicates` construit
  // désormais AUSSI un `TriggerEvent` canonique pour chaque paire RÉELLEMENT
  // insérée (jamais sur `DO NOTHING`), journalisé comme le premier émetteur —
  // voir son appel à {@link buildTriggerEvent}.
  duplicate_pair_detected: {
    family: 'equipe',
    detector: 'apps/api/src/modules/crm-core/governance.service.ts (proposeDuplicates)',
    status: 'unified',
  },
  // #2875/#2402.1 (vague F/G 27/09) — les trois routines Delivery construisent
  // désormais AUSSI un `TriggerEvent` canonique, dans `DeliveryRoutinesService`
  // même (qui connaît l'espace, contrairement à `RoutineExecutors`), sur la
  // même détection que la notification — jamais un second calcul.
  timesheet_chase: {
    family: 'mission',
    detector: 'apps/api/src/modules/delivery (DeliveryRoutinesService.missingTimesheets)',
    status: 'unified',
  },
  invoice_readiness_routine: {
    family: 'finance',
    detector: 'apps/api/src/modules/delivery (DeliveryRoutinesService.blockedInvoicing)',
    status: 'unified',
  },
  margin_alert: {
    family: 'finance',
    detector: 'apps/api/src/modules/delivery (DeliveryRoutinesService.marginsBelowThreshold)',
    status: 'unified',
  },
  // #2875/#2402.1 (vague F/G 27/09) — `discover_signals.py` ne connaît ni
  // l'espace ni le compte suivi (une recherche BOAMP libre, sans portefeuille) :
  // c'est son APPELANT réel côté API, `IaProxyController.discoverSignals`
  // (après `withPortfolioState`, qui seul sait quel candidat est déjà un
  // compte possédé), qui construit et persiste l'événement — jamais un second
  // point de construction côté Python (#2402.2 reste TS-only).
  ao_publie: {
    family: 'commercial',
    detector: 'apps/api/src/modules/ia-proxy/ia-proxy.controller.ts (recordAoPublieTriggers, signal BOAMP)',
    status: 'unified',
  },
  // ── 3. Les DIX signaux COMMERCIAUX de l'issue (#2402.3) ──────────────────
  // Trois recouvrent un détecteur déjà réel — le libellé de l'issue EST le
  // libellé français de la nature existante, pas une équivalence devinée :
  //  - signal_nouveau / besoin_entrant → un SIXIÈME pipeline trouvé en
  //    creusant au-delà des cinq que le registre du 23/09 nommait :
  //    `discover_alert_events` (table dédiée, CHECK constraint,
  //    `discover-alert-event.sweeper.ts` + `watchlist-refresh.worker.ts`),
  //    qui émet déjà SEPT genres d'événement Découvrir — le docblock de
  //    `discover-alert-events.ts` dit lui-même « les dix déclencheurs du
  //    registre, dédoublonnés ». Nommé ici pour ne pas redevenir invisible
  //    sous un septième numéro.
  // #2875/#2402.1/#2402.3 (lot R03, 29/09) — `WatchlistRefreshWorker` construit
  // désormais AUSSI un `TriggerEvent` canonique quand un signal RÉELLEMENT
  // neuf survit à la comparaison avant/après du rafraîchissement — la MÊME
  // comparaison qui alimente déjà `recordDiscoverEvent('new_signal', …)` et
  // `notifyBuySignalForAccount`, jamais un second calcul.
  signal_nouveau: {
    family: 'commercial',
    detector: 'apps/api/src/modules/watchlist-refresh/watchlist-refresh.worker.ts (process, nouveau signal)',
    status: 'unified',
  },
  compte_sans_prochaine_action: {
    family: 'commercial',
    detector: 'apps/api/src/modules/playbooks/intervention-rules.ts (detectAccountsWithoutNextAction)',
    status: 'unified',
  },
  silence_client: {
    family: 'commercial',
    detector: 'apps/api/src/modules/playbooks/intervention-rules.ts (detectStalledSubmissions)',
    status: 'unified',
  },
  // #2875/#2402.3 (lot V11, 28/09) — `MailboxService.reconcileReplySequences`
  // construit désormais AUSSI un `TriggerEvent` canonique quand une réponse
  // classe `positive` (`classifyThread`, `reply-classify.ts`) — le MÊME
  // classement qui arrête déjà la séquence et crée l'action de qualification
  // (#2381.6), jamais un second calcul.
  reponse_positive: {
    family: 'commercial',
    detector: 'apps/api/src/modules/mailbox/mailbox.service.ts (reconcileReplySequences)',
    status: 'unified',
  },
  // #2875/#2402.3 (lot P06, 30/09) — `contacts.decision_role` passe d'un rôle
  // décisionnel à un autre : un trigger SQL consigne la transition
  // (`contact_decision_role_history`), le balayage la transforme en événement.
  changement_decideur: {
    family: 'commercial',
    detector:
      'apps/api/src/modules/notifications/discover-alerts/discover-alert-event.sweeper.ts (sweepChangementDecideur, mémoire contact_decision_role_history)',
    status: 'unified',
  },
  // #2875/#2402.1/#2402.3 (lot R03, 29/09) — `DiscoverAlertEventSweeper`
  // construit désormais AUSSI un `TriggerEvent` canonique sur un
  // `new_confirmed_need` RÉELLEMENT consigné (jamais un doublon) — jamais un
  // second calcul.
  besoin_entrant: {
    family: 'commercial',
    detector:
      'apps/api/src/modules/notifications/discover-alerts/discover-alert-event.sweeper.ts (kind new_confirmed_need)',
    status: 'unified',
  },
  opportunite_vieillissante: {
    family: 'commercial',
    detector: 'apps/api/src/modules/playbooks/intervention-rules.ts (detectProjectsWithoutDecision)',
    status: 'unified',
  },
  // #2875 (#2402.3) — besoins issus d'un appel d'offres (`project_needs.source =
  // 'tender'`, `deadline_at`) dont la remise tombe sous 7 jours.
  deadline_ao: {
    family: 'commercial',
    detector: 'apps/api/src/modules/notifications/discover-alerts/discover-alert-event.sweeper.ts (sweepDeadlineAo)',
    status: 'unified',
  },
  // #2875 (lot X54, 02/10) — un fait d'accès PAR ESPACE : `access_facts`
  // (kind `mode`, valeur `direct_reference`) — espace, compte et date réels.
  referencement_detecte: {
    family: 'commercial',
    detector:
      'apps/api/src/modules/notifications/discover-alerts/discover-alert-event.sweeper.ts (sweepReferencementDetecte, fait access_facts direct_reference)',
    status: 'unified',
  },
  // #3918 (lot Y12, 08/10) — le cache CRM (`crm_deal_facts`) transformé en
  // signaux datés et sourcés : une affaire perdue, dormante, ou gagnée depuis
  // le cycle de renouvellement connu. Trois règles pures, un seul émetteur.
  affaire_perdue: {
    family: 'commercial',
    detector: 'apps/api/src/modules/crm/crm-deal-signal-rules.ts (detectLostDeals)',
    status: 'unified',
  },
  affaire_dormante: {
    family: 'commercial',
    detector: 'apps/api/src/modules/crm/crm-deal-signal-rules.ts (detectDormantDeals)',
    status: 'unified',
  },
  affaire_renouvellement: {
    family: 'commercial',
    detector: 'apps/api/src/modules/crm/crm-deal-signal-rules.ts (detectDealsForRenewal)',
    status: 'unified',
  },
  // #3918.2 (lot M01, 09/10) — « un contact connu a changé de poste » : le
  // détecteur réel existait (`contactsWhoMayHaveMoved`), son appelant
  // (`RoutineExecutors.contactJobChange`) n'écrivait rien au registre.
  contact_changement_poste: {
    family: 'commercial',
    detector: 'apps/api/src/modules/routines/crm-routines.service.ts (contactsWhoMayHaveMoved)',
    status: 'unified',
  },
} as const

/** Classement des treize natures existantes dans les familles de l'issue —
 *  documenté ligne par ligne parce qu'aucune n'est évidente d'elle-même. */
function interventionFamily(kind: InterventionKind): TriggerFamily {
  const table: Record<InterventionKind, TriggerFamily> = {
    // Silence client après positionnement = un signal commercial.
    submission_stalled: 'commercial',
    // Échéance de mission sans renouvellement ouvert.
    renewal_at_risk: 'mission',
    invoicing_blocked: 'finance',
    // « Compte suivi que personne n'a touché » = un signal commercial, pas
    // une alerte produit.
    account_untouched: 'commercial',
    // Un commercial inactif est un sujet d'ÉQUIPE (charge/attention), pas un
    // signal sur un compte.
    rep_inactive: 'equipe',
    credits_exhausted: 'produit',
    account_no_next_action: 'commercial',
    project_no_decision: 'commercial',
    need_without_shortlist: 'talent',
    timesheet_missing: 'mission',
    payment_overdue: 'finance',
    mission_without_end_date: 'mission',
    // Un consultant disputé entre deux besoins est un sujet d'ÉQUIPE
    // (staffing), pas un signal sur un compte ou une mission précise.
    staffing_collision: 'equipe',
  }
  return table[kind]
}

const triggerTypeSchema = z.enum(Object.keys(TRIGGER_CATALOG) as [string, ...string[]])

export const TRIGGER_SOURCES = [
  'playbooks',
  'discover',
  'credits',
  'governance',
  'delivery-routines',
  // #2875/#2402.3 (lot V11, 28/09) — le sixième émetteur migré : une réponse
  // classée `positive` par `MailboxService.reconcileReplySequences` (#2381.4/.6,
  // le même classement qui arrête déjà la séquence et crée l'action de
  // qualification — jamais un second calcul).
  'mailbox',
  // #2875/#2402.1/#2402.3 (lot R03, 29/09) — le septième émetteur migré :
  // `WatchlistRefreshWorker` (un signal neuf après rafraîchissement de veille).
  'watchlist-refresh',
  // #2875 (lot P06, 30/09) — `changement_decideur` : la mémoire de transition
  // du rôle décisionnel d'un contact.
  'contacts',
  // #3918 (lot Y12, 08/10) — le douzième émetteur migré : `CrmDealSignalsSweeper`
  // (les trois règles sur le cache `crm_deal_facts`).
  'crm-deal-signals',
  // #3918.2 (lot M01, 09/10) — le treizième émetteur migré : la routine
  // `contact_job_change` (`RoutineExecutors.contactJobChange`).
  'routines',
] as const
export type TriggerSource = (typeof TRIGGER_SOURCES)[number]

/** Qualitatif, jamais un nombre : « mesurée » vient directement de la donnée
 *  source, « estimée » d'une règle qui en déduit l'état (ex. staleness). */
export const TRIGGER_CONFIDENCE = ['mesuree', 'estimee'] as const
export type TriggerConfidence = (typeof TRIGGER_CONFIDENCE)[number]

export const TRIGGER_STATUSES = ['open', 'acknowledged', 'resolved'] as const
export type TriggerStatus = (typeof TRIGGER_STATUSES)[number]

export const TRIGGER_URGENCY = ['normal', 'urgent'] as const
export type TriggerUrgency = (typeof TRIGGER_URGENCY)[number]

/**
 * Le schéma canonique commun à tout événement (#2402.9). Un `type` absent du
 * {@link TRIGGER_CATALOG} est refusé — c'est la garde d'exécution derrière la
 * garde d'architecture (#2402.2).
 */
export const triggerEventSchema = z
  .object({
    eventId: z.string().guid(),
    type: triggerTypeSchema,
    source: z.enum(TRIGGER_SOURCES),
    object: z
      .object({
        subjectType: z.string().trim().min(1),
        subjectId: z.string().trim().min(1),
      })
      .strict(),
    timestamp: z.string().datetime({ offset: true }),
    scope: z
      .object({
        workspaceId: z.string().trim().min(1),
        ownerId: z.string().trim().min(1).nullable(),
      })
      .strict(),
    // Ce qui est arrivé, EN CHIFFRES — même règle que InterventionDraft.detail
    // (intervention-rules.ts) : un responsable décide sans rouvrir l'objet.
    evidence: z.string().trim().min(1).max(500),
    confidence: z.enum(TRIGGER_CONFIDENCE),
    severity: z.number().int().min(0).max(100),
    urgency: z.enum(TRIGGER_URGENCY),
    dedupeKey: z.string().trim().min(1),
    cooldownDays: z.number().int().min(0).nullable(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    eligibleActions: z.array(z.string()),
    eligibleNotifications: z.array(z.string()),
    permission: z.string().trim().min(1).nullable(),
    status: z.enum(TRIGGER_STATUSES),
  })
  .strict()
export type TriggerEvent = z.infer<typeof triggerEventSchema>

/**
 * #2875 — le qualificatif de date d'une clé de déduplication pour un fait qui
 * se RÉPÈTE : `day` (2026-10-15), `week` (2026-W42, semaine ISO), `month`
 * (2026-10). Calculé en UTC, comme `timestamp`.
 */
export function triggerPeriodQualifier(now: Date, period: 'day' | 'week' | 'month'): string {
  const iso = now.toISOString()
  if (period === 'day') return iso.slice(0, 10)
  if (period === 'month') return iso.slice(0, 7)
  const thursday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7))
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * Construit et VALIDE un événement canonique. C'est le seul point de
 * construction attendu (#2402.2) — un appelant qui compose l'objet à la main
 * contourne la garde d'architecture GA-389.
 */
export function buildTriggerEvent(input: {
  type: string
  source: TriggerSource
  subjectType: string
  subjectId: string
  workspaceId: string
  ownerId: string | null
  evidence: string
  now: Date
  confidence?: TriggerConfidence
  cooldownDays?: number | null
  expiresAt?: string | null
  eligibleActions?: readonly string[]
  eligibleNotifications?: readonly string[]
  permission?: string | null
  status?: TriggerStatus
  /** #2875 — date le fait quand il est RÉCURRENT (échéance, semaine, mois) :
   *  sans qualificatif la clé reste `(espace, type, sujet)`, un fait unique. */
  dedupeQualifier?: string
}): TriggerEvent {
  const severity = input.type in INTERVENTION_SEVERITY ? INTERVENTION_SEVERITY[input.type as InterventionKind] : 50
  return triggerEventSchema.parse({
    eventId: cryptoRandomUuid(),
    type: input.type,
    source: input.source,
    object: { subjectType: input.subjectType, subjectId: input.subjectId },
    timestamp: input.now.toISOString(),
    scope: { workspaceId: input.workspaceId, ownerId: input.ownerId },
    evidence: input.evidence,
    confidence: input.confidence ?? 'mesuree',
    severity,
    // Même logique que `isInterventionStale` (playbook.ts) appliquée à
    // l'instant de détection : rien ici n'invente un nouveau seuil, la
    // fraîcheur EST l'instant de construction — l'événement vient d'être vu.
    urgency: severity >= 70 ? 'urgent' : 'normal',
    dedupeKey: `${input.workspaceId}:${input.type}:${input.subjectId}${input.dedupeQualifier ? `:${input.dedupeQualifier}` : ''}`,
    cooldownDays: input.cooldownDays ?? null,
    expiresAt: input.expiresAt ?? null,
    eligibleActions: input.eligibleActions ?? [],
    eligibleNotifications: input.eligibleNotifications ?? [],
    permission: input.permission ?? null,
    status: input.status ?? 'open',
  })
}

/**
 * #2875 (#2402.9) — le LECTEUR de `status` et `expiresAt`. Un événement résolu,
 * ou dont l'échéance est atteinte, ne déclenche plus d'alerte : il reste
 * archivé (on ne supprime pas), il ne sonne plus. `acknowledged` est vu, pas
 * clos : il reste actif. Une échéance illisible n'est pas devinée — l'événement
 * reste actif plutôt que d'être éteint sur une date inventée.
 */
export function isTriggerEventActive(event: Pick<TriggerEvent, 'status' | 'expiresAt'>, now: Date): boolean {
  if (event.status === 'resolved') return false
  if (event.expiresAt === null) return true
  const expires = new Date(event.expiresAt).getTime()
  if (Number.isNaN(expires)) return true
  return expires > now.getTime()
}

/** uuid v4 minimal, sans dépendance : évite de tirer `node:crypto` dans un
 *  paquet qui doit rester utilisable côté navigateur. */
function cryptoRandomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = (Math.random() * 16) | 0
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

/**
 * Ce qu'un événement seul ne dit pas (#2402.14) — plusieurs signaux sur le
 * MÊME sujet forment un cas plus fort. Exemple de l'issue : mission T-45 +
 * satisfaction positive + besoin adjacent → une stratégie de renouvellement.
 *
 * ⚠️ Ne rend JAMAIS de probabilité : la gravité composée est le MAX des
 * gravités membres (pas une somme, qui favoriserait artificiellement un
 * sujet à beaucoup de petits signaux), et `strength` est qualitatif
 * (`single`/`combined`), jamais un score entre 0 et 1.
 */
export type CombinedTriggerStrategy = {
  readonly subjectType: string
  readonly subjectId: string
  readonly triggerTypes: readonly string[]
  readonly strength: 'single' | 'combined'
  readonly severity: number
  readonly evidence: readonly string[]
}

export function combineTriggerEvents(events: readonly TriggerEvent[]): CombinedTriggerStrategy {
  if (events.length === 0) throw new Error('combineTriggerEvents: aucun événement à combiner')
  const [first, ...rest] = events
  for (const event of rest) {
    if (event.object.subjectType !== first.object.subjectType || event.object.subjectId !== first.object.subjectId) {
      throw new Error(
        'combineTriggerEvents: corréler n’est pas mélanger — tous les événements doivent porter sur le même sujet',
      )
    }
  }
  return {
    subjectType: first.object.subjectType,
    subjectId: first.object.subjectId,
    triggerTypes: events.map(event => event.type),
    strength: events.length > 1 ? 'combined' : 'single',
    severity: Math.max(...events.map(event => event.severity)),
    evidence: events.map(event => event.evidence),
  }
}
