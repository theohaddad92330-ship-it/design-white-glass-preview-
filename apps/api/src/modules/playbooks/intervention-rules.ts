import {
  columnForProject,
  contractKindSchema,
  CREDITS_EXHAUSTED_RATIO,
  detectStaffingCollisions,
  expectsEndDate,
  INTERVENTION_THRESHOLDS,
  isSettled,
  outstandingAmountCents,
  overdueDaysFromDueOn,
  MISSION_BOARD_LABELS,
  MISSION_BOARD_STALE_DAYS,
  UNDECIDED_STAGES,
  type Intervention,
  type InterventionKind,
  type ProjectStage,
  type StaffingCollisionCandidate,
} from '@bellum/contracts'

/**
 * CE QUI remonte à un responsable — les règles, séparées de la base.
 *
 * La file d'intervention existait déjà : la table, le contrat, le service,
 * l'écran, les traductions. Il manquait la seule chose qui la rende vivante —
 * **quelqu'un pour la remplir**. `PlaybooksService.open()` n'était appelé
 * nulle part : le cockpit du responsable affichait donc une file vide en
 * production, indistinguable d'une équipe qui n'a aucun problème.
 *
 * Ces fonctions sont PURES et prennent `now` en paramètre. Deux raisons, pas
 * une : elles se testent (une règle de fenêtre temporelle qui lit l'horloge
 * elle-même est intestable), et surtout elles sont relisibles — un responsable
 * à qui l'on annonce qu'un commercial est inactif a le droit de savoir ce que
 * « inactif » veut dire exactement.
 *
 * **La règle de fond : ce qu'on ne sait pas n'alerte JAMAIS.** Une mission sans
 * date de fin, un CV sans date d'envoi, un espace sans quota connu : l'inconnu
 * se tait. Une alerte fondée sur une donnée absente est une fausse alerte, et
 * une file qui crie faux ne se lit plus — ce qui coûte les vraies alertes en
 * même temps.
 *
 * ⚠️ **Une seule exception, et elle est délibérée.** `account_untouched` alerte
 * quand la date de dernière action est ABSENTE, là où les cinq autres se
 * taisent. C'est cohérent, et c'est même tout le sujet : sur les autres
 * natures, l'inconnu vient d'une donnée qu'on n'a pas su lire. Ici, l'absence
 * EST le fait — « aucune action jamais enregistrée sur ce compte suivi » est
 * exactement la situation qu'un responsable doit voir. Le message le dit dans
 * ces termes, sans jamais inventer un nombre de jours.
 *
 * Cette phrase disait « valable pour les six natures » jusqu'au 22/08 : le
 * commentaire annonçait donc l'inverse de ce que le code fait, et c'est le
 * genre d'écart qui finit par faire « corriger » le bon comportement.
 */

export type InterventionDraft = {
  kind: InterventionKind
  subjectType: Intervention['subjectType']
  subjectId: string
  /** La personne dont c'est le périmètre. `null` = personne, et c'est déjà une
   *  information. */
  ownerId: string | null
  /** Ce qui est arrivé, en une phrase, AVEC ses chiffres — un responsable doit
   *  pouvoir décider sans rouvrir l'objet. */
  detail: string
}

/** Jours pleins écoulés depuis `date`. `null` quand la date est inexploitable. */
function daysSince(date: Date | string | null | undefined, now: Date): number | null {
  if (!date) return null
  const stamp = date instanceof Date ? date.getTime() : Date.parse(String(date))
  if (!Number.isFinite(stamp)) return null
  return Math.floor((now.getTime() - stamp) / 86_400_000)
}

/** Jours pleins avant `date`. Négatif si la date est passée. */
function daysUntil(date: Date | string | null | undefined, now: Date): number | null {
  const elapsed = daysSince(date, now)
  return elapsed === null ? null : -elapsed
}

/* ------------------------------------------------------------------ */
/*  1. Un profil positionné sans le moindre retour                     */
/* ------------------------------------------------------------------ */

export type StalledSubmissionRow = {
  id: string
  submitted_at: Date | string | null
  first_feedback_at: Date | string | null
  closed_at: Date | string | null
  owner_id: string | null
  consultant_name: string | null
  account_name: string | null
}

/**
 * Un CV parti chez un client qui n'a jamais répondu.
 *
 * Ne dit RIEN d'un positionnement sans `submitted_at` : sans date d'envoi on ne
 * sait pas depuis quand on attend, et déduire la date de la création du dossier
 * compterait la sélection interne comme du silence client — on alerterait sur
 * une lenteur qui est la nôtre.
 *
 * #2335.7 — une FENÊTRE, pas un seuil bas seul : au-delà de
 * `submissionSilenceMaxDays`, l'alerte s'arrête. « Le silence crée une action
 * gouvernée, pas une relance infinie » (LAU-FINAL-076) — passé ce point, c'est
 * une décision humaine qui manque, pas un rappel de plus.
 */
export function detectStalledSubmissions(rows: readonly StalledSubmissionRow[], now: Date): InterventionDraft[] {
  const drafts: InterventionDraft[] = []
  for (const row of rows) {
    if (row.first_feedback_at || row.closed_at) continue
    const silence = daysSince(row.submitted_at, now)
    if (silence === null || silence < INTERVENTION_THRESHOLDS.submissionSilenceDays) continue
    if (silence >= INTERVENTION_THRESHOLDS.submissionSilenceMaxDays) continue
    const who = row.consultant_name ?? 'Un profil'
    const where = row.account_name ? ` chez ${row.account_name}` : ''
    drafts.push({
      kind: 'submission_stalled',
      subjectType: 'submission',
      subjectId: row.id,
      ownerId: row.owner_id,
      detail: `${who}${where} : aucun retour client depuis ${silence} jours.`,
    })
  }
  return drafts
}

/* ------------------------------------------------------------------ */
/*  2. Une mission qui se termine sans renouvellement ouvert           */
/* ------------------------------------------------------------------ */

export type RenewalRow = {
  id: string
  label: string
  ends_on: string | null
  user_id: string | null
  /** Un projet de renouvellement est-il déjà ouvert sur ce compte ? */
  has_open_renewal: boolean
}

/**
 * Une mission arrive à échéance et personne n'a rouvert la discussion.
 *
 * **Une mission sans date de fin n'alerte jamais** — la même règle que les
 * routines ATS, pour la même raison : une mission au forfait ou reconduite
 * tacitement n'a pas de `ends_on`, et lui inventer une échéance produirait une
 * alerte par mission et par jour.
 *
 * Une échéance DÉPASSÉE alerte encore : c'est même le cas le plus urgent, et
 * s'arrêter à zéro laisserait filer les missions déjà terminées sans suite.
 */
export function detectRenewalsAtRisk(rows: readonly RenewalRow[], now: Date): InterventionDraft[] {
  const drafts: InterventionDraft[] = []
  for (const row of rows) {
    if (row.has_open_renewal) continue
    const remaining = daysUntil(row.ends_on, now)
    if (remaining === null || remaining > INTERVENTION_THRESHOLDS.renewalHorizonDays) continue
    const detail =
      remaining < 0
        ? `${row.label} : échéance dépassée depuis ${Math.abs(remaining)} jours, aucun renouvellement ouvert.`
        : `${row.label} : fin prévue dans ${remaining} jours, aucun renouvellement ouvert.`
    drafts.push({ kind: 'renewal_at_risk', subjectType: 'mission', subjectId: row.id, ownerId: row.user_id, detail })
  }
  return drafts
}

/* ------------------------------------------------------------------ */
/*  3. Un mois qui reste non facturable après sa clôture               */
/* ------------------------------------------------------------------ */

export type InvoicingRow = {
  id: string
  mission_label: string | null
  period_month: string
  state: string
  invoiced_at: Date | string | null
  blockers: string[] | null
  owner_id: string | null
}

/**
 * Un mois de mission qu'on ne peut toujours pas facturer.
 *
 * On attend que le mois soit CLOS et un peu plus : alerter le 3 du mois sur un
 * mois en cours reviendrait à signaler tous les mois, tous les mois.
 */
export function detectBlockedInvoicing(rows: readonly InvoicingRow[], now: Date): InterventionDraft[] {
  const drafts: InterventionDraft[] = []
  for (const row of rows) {
    if (row.invoiced_at || row.state !== 'blocked') continue
    const age = daysSince(row.period_month, now)
    if (age === null || age < INTERVENTION_THRESHOLDS.invoicingBlockedDays) continue
    const what = row.mission_label ? `${row.mission_label} — ` : ''
    // On CITE les bloqueurs relevés plutôt que de les résumer : « il manque
    // quelque chose » n'aide personne à débloquer quoi que ce soit.
    const why = row.blockers?.length ? ` Bloqueurs : ${row.blockers.join(', ')}.` : ''
    drafts.push({
      kind: 'invoicing_blocked',
      subjectType: 'mission',
      subjectId: row.id,
      ownerId: row.owner_id,
      detail: `${what}mois ${row.period_month.slice(0, 7)} toujours non facturable après ${age} jours.${why}`,
    })
  }
  return drafts
}

/* ------------------------------------------------------------------ */
/*  4. Un compte suivi que personne ne touche                          */
/* ------------------------------------------------------------------ */

export type UntouchedAccountRow = {
  id: string
  name: string
  last_action_at: Date | string | null
  owner_id: string | null
}

/**
 * Un compte qu'on a décidé de suivre et sur lequel il ne se passe rien.
 *
 * Un compte SANS aucune action tracée alerte aussi, et c'est voulu : « on l'a
 * mis en suivi et on ne l'a jamais ouvert » est précisément le cas qu'un
 * responsable veut voir. Le libellé le dit alors autrement, pour ne pas
 * annoncer un nombre de jours qu'on ne connaît pas.
 */
export function detectUntouchedAccounts(rows: readonly UntouchedAccountRow[], now: Date): InterventionDraft[] {
  const drafts: InterventionDraft[] = []
  for (const row of rows) {
    const idle = daysSince(row.last_action_at, now)
    if (idle !== null && idle < INTERVENTION_THRESHOLDS.accountUntouchedDays) continue
    const detail =
      idle === null
        ? `${row.name} : compte suivi, aucune action jamais enregistrée.`
        : `${row.name} : aucune action depuis ${idle} jours.`
    drafts.push({ kind: 'account_untouched', subjectType: 'account', subjectId: row.id, ownerId: row.owner_id, detail })
  }
  return drafts
}

/* ------------------------------------------------------------------ */
/*  5. Un commercial inactif                                           */
/* ------------------------------------------------------------------ */

export type RepRow = {
  user_id: string
  name: string
  /** Depuis quand la personne est dans l'espace. */
  joined_at: Date | string | null
  last_action_at: Date | string | null
}

/**
 * Quelqu'un dont l'activité s'est arrêtée.
 *
 * **Une personne arrivée récemment n'alerte pas.** Sans ce garde-fou, un
 * nouveau commercial déclencherait une intervention le jour de son arrivée,
 * avant même d'avoir eu le temps d'ouvrir l'outil — et la première chose que
 * son responsable verrait de lui serait une alerte.
 *
 * L'alerte porte sur une PERSONNE : elle se lit comme un signal d'onboarding ou
 * d'accompagnement, pas comme une sanction. Le libellé est donc factuel et sans
 * jugement — c'est le responsable qui interprète, pas le produit.
 */
export function detectInactiveReps(rows: readonly RepRow[], now: Date): InterventionDraft[] {
  const drafts: InterventionDraft[] = []
  const threshold = INTERVENTION_THRESHOLDS.repInactiveDays
  for (const row of rows) {
    const tenure = daysSince(row.joined_at, now)
    if (tenure === null || tenure < threshold) continue
    const idle = daysSince(row.last_action_at, now)
    if (idle !== null && idle < threshold) continue
    const detail =
      idle === null
        ? `${row.name} : aucune action enregistrée depuis son arrivée, il y a ${tenure} jours.`
        : `${row.name} : aucune action depuis ${idle} jours.`
    drafts.push({ kind: 'rep_inactive', subjectType: 'user', subjectId: row.user_id, ownerId: row.user_id, detail })
  }
  return drafts
}

/* ------------------------------------------------------------------ */
/*  6. L'enveloppe de crédits au bout                                  */
/* ------------------------------------------------------------------ */

export type CreditsRow = {
  workspace_id: string
  /** Crédits consommés sur la période. */
  used: number
  /** Enveloppe disponible. `null` ou 0 = quota inconnu — et l'inconnu se tait. */
  limit: number | null
  ownerId: string | null
}

/**
 * L'espace arrive au bout de ses crédits.
 *
 * On prévient AVANT le mur (90 % par défaut) : découvrir qu'on ne peut plus
 * lancer d'analyse au moment de la lancer est le genre de blocage qui fait
 * refermer l'outil pour la journée.
 *
 * **Un quota inconnu ou nul ne déclenche rien.** Un espace sans enveloppe lue —
 * une ligne de crédits pas encore créée, un plan en cours de bascule — n'est pas
 * un espace épuisé, et le compter comme tel enverrait une alerte de blocage à
 * une équipe qui n'a rien consommé.
 */
export function detectCreditsExhausted(rows: readonly CreditsRow[]): InterventionDraft[] {
  const drafts: InterventionDraft[] = []
  for (const row of rows) {
    if (!row.limit || row.limit <= 0) continue
    const ratio = row.used / row.limit
    if (ratio < CREDITS_EXHAUSTED_RATIO) continue
    const remaining = Math.max(0, row.limit - row.used)
    const detail =
      remaining === 0
        ? `Enveloppe épuisée : ${row.used} crédits consommés sur ${row.limit}. Les analyses et enrichissements sont bloqués.`
        : `Enveloppe presque épuisée : ${row.used} crédits consommés sur ${row.limit}, ${remaining} restants.`
    drafts.push({
      kind: 'credits_exhausted',
      subjectType: 'workspace',
      subjectId: row.workspace_id,
      ownerId: row.ownerId,
      detail,
    })
  }
  return drafts
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  LES CINQ NATURES DU COCKPIT DU COMMERCIAL                                 */
/*                                                                            */
/*  Quatre d'entre elles étaient DÉJÀ détectées et mesurées par la sonde de    */
/*  Laura (`laura-probe.service.ts`) : comptes sans prochaine action, besoins  */
/*  ouverts sans profil positionné, relevés manquants après relances,         */
/*  encaissements en retard. Elles produisaient des bulles ou des routines,    */
/*  jamais une ligne OUVRABLE, CLASSABLE et ATTRIBUABLE.                       */
/*                                                                            */
/*  Ce qui est réutilisé, et ce qui ne l'est pas : les SEUILS et les listes de */
/*  statuts viennent tous du contrat, à l'identique — un réglage vit à un seul */
/*  endroit (GA-26). Les requêtes, elles, ne peuvent pas l'être telles quelles */
/*  (la sonde compte PAR ESPACE, le balayeur lit GLOBALEMENT et rend des       */
/*  lignes) : le prédicat est repris colonne pour colonne, et la RÈGLE — ce    */
/*  qui décide, donc ce qui doit se relire et se tester — vit ici, comme les   */
/*  six natures d'origine.                                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

/* ------------------------------------------------------------------ */
/*  7. Un compte suivi sans la moindre prochaine action                */
/* ------------------------------------------------------------------ */

export type AccountWithoutNextActionRow = {
  id: string
  name: string
  /** Depuis quand le compte existe. Sert de tenure, pas de mesure d'activité. */
  created_at: Date | string | null
  owner_id: string | null
}

/**
 * Un compte suivi sur lequel rien n'est prévu.
 *
 * ⚠️ **Ce n'est PAS `account_untouched`, et l'écart est tout le sujet.** L'autre
 * nature regarde le PASSÉ — « personne ne l'a touché depuis trente jours » ;
 * celle-ci regarde l'AVENIR — « aucune tâche ouverte ne dit ce qu'on en fait ».
 * Un compte travaillé hier et refermé sans suite passe la première et tombe
 * dans la seconde, ce qui est exactement le cas qu'un commercial doit voir.
 *
 * La définition de « prochaine action » est celle des TÂCHES OUVERTES
 * (`TASK_OPEN_STATUSES`), la même qu'à l'agenda, au cockpit de qualité et à la
 * sonde de Laura. Aucune colonne « prochaine action » n'existe, et en inventer
 * une la laisserait vide partout.
 *
 * **Un compte trop jeune n'alerte pas** : sans cette tenure, un compte ajouté au
 * portefeuille ce matin ouvrirait une intervention avant que quiconque ait eu le
 * temps de lui poser une suite. Même garde-fou que `rep_inactive`, et la date
 * ABSENTE se tait aussi — on ne sait alors pas depuis quand il est là.
 */
export function detectAccountsWithoutNextAction(
  rows: readonly AccountWithoutNextActionRow[],
  now: Date,
): InterventionDraft[] {
  const drafts: InterventionDraft[] = []
  for (const row of rows) {
    const tenure = daysSince(row.created_at, now)
    if (tenure === null || tenure < INTERVENTION_THRESHOLDS.accountNoNextActionDays) continue
    drafts.push({
      kind: 'account_no_next_action',
      subjectType: 'account',
      subjectId: row.id,
      ownerId: row.owner_id,
      detail: `${row.name} : aucune prochaine action prévue (compte ouvert il y a ${tenure} jours).`,
    })
  }
  return drafts
}

/* ------------------------------------------------------------------ */
/*  8. Un projet immobile au-delà de la durée type de son étape        */
/* ------------------------------------------------------------------ */

export type UndecidedProjectRow = {
  id: string
  label: string
  stage: string
  stage_entered_at: Date | string | null
  owner_id: string | null
}

/**
 * Un projet dont l'issue n'est pas tranchée et qui ne bouge plus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT LE SEUIL — ET POURQUOI IL N'Y EN A PAS UN SEUL
 * ─────────────────────────────────────────────────────────────────────────────
 * La source dit « immobile au-delà de la **durée type de l'étape** ». Elle donne
 * donc une durée PAR ÉTAPE, et il en existe une dans le dépôt :
 * `MISSION_BOARD_STALE_DAYS`, indexée par colonne du board Missions, à laquelle
 * `columnForProject()` relie chaque étape de projet. C'est déjà cette
 * composition qui pose l'alerte `stale` sur les cartes de projet du board.
 *
 * Un seuil uniforme aurait dit qu'un profil proposé depuis trois semaines et une
 * qualification de trois semaines sont le même fait — et aurait fait diverger la
 * file du board sur le même projet.
 *
 * Trois silences, et chacun refuse une bêtise précise :
 *  - une étape SANS colonne (`detected`, `potential`) : l'entonnoir de détection
 *    n'est pas une affaire suivie, et l'alerter noierait la file sous des
 *    signaux que personne n'a encore regardés ;
 *  - une colonne SANS durée type : « en cours » et « terminée » n'en ont pas, et
 *    une mission de dix-huit mois n'est pas en retard parce qu'elle dure ;
 *  - une étape DÉCIDÉE (`won`, `lost`) : la décision a été prise. C'est
 *    `UNDECIDED_STAGES` qui tient cette limite, `dormant` COMPRIS — une mise en
 *    veille reste une issue non tranchée, et sa durée type de quatre-vingt-dix
 *    jours dit exactement ce qu'on en attend.
 *
 * Une date d'entrée d'étape absente n'alerte JAMAIS : on ne sait pas depuis
 * quand le projet est là, et supposer « depuis toujours » ferait remonter en
 * tête de file exactement les dossiers dont on ne sait rien.
 */
export function detectProjectsWithoutDecision(rows: readonly UndecidedProjectRow[], now: Date): InterventionDraft[] {
  const drafts: InterventionDraft[] = []
  for (const row of rows) {
    if (!(UNDECIDED_STAGES as readonly string[]).includes(row.stage)) continue
    const column = columnForProject(row.stage as ProjectStage)
    if (column === null) continue
    const limit = MISSION_BOARD_STALE_DAYS[column]
    if (limit === null || limit === undefined) continue
    const idle = daysSince(row.stage_entered_at, now)
    if (idle === null || idle < limit) continue
    drafts.push({
      kind: 'project_no_decision',
      subjectType: 'project',
      subjectId: row.id,
      ownerId: row.owner_id,
      // On CITE la durée type à côté de l'âge : « immobile depuis 12 jours » ne
      // dit pas si c'est beaucoup, et personne n'a à connaître par cœur la durée
      // type de chacune des étapes.
      detail: `${row.label} : immobile à l'étape « ${MISSION_BOARD_LABELS[column].fr} » depuis ${idle} jours (durée type : ${limit} jours).`,
    })
  }
  return drafts
}

/* ------------------------------------------------------------------ */
/*  9. Un besoin ouvert sans le moindre profil positionné              */
/* ------------------------------------------------------------------ */

export type NeedWithoutShortlistRow = {
  id: string
  title: string
  /** L'âge d'ÉTAPE, jamais la date de création. */
  status_changed_at: Date | string | null
  owner_id: string | null
}

/**
 * Un besoin ouvert depuis assez longtemps sans qu'aucun profil ait été proposé.
 *
 * L'âge se lit sur `status_changed_at` — l'âge D'ÉTAPE, celui que le pied de
 * carte du kanban affiche déjà. Un besoin qui n'a jamais franchi de transition
 * n'a PAS d'âge d'étape, et le compter lui inventerait un âge : un âge inventé
 * est toujours rassurant.
 *
 * ⚠️ `subjectType` vaut `project` alors que `subjectId` est un identifiant de
 * BESOIN. Ce n'est pas une étourderie mais la convention déjà posée par
 * `invoicing_blocked`, qui porte un identifiant `invoice_readiness` sous
 * `mission` : le sujet dit **quel écran ouvrir pour traiter la ligne**, pas de
 * quelle table sort l'identifiant. Élargir `INTERVENTION_SUBJECTS` aurait rendu
 * la ligne inerte à l'écran — `interventionHref` ne connaîtrait pas la valeur
 * neuve et rendrait `null`.
 */
export function detectNeedsWithoutShortlist(rows: readonly NeedWithoutShortlistRow[], now: Date): InterventionDraft[] {
  const drafts: InterventionDraft[] = []
  for (const row of rows) {
    const age = daysSince(row.status_changed_at, now)
    if (age === null || age < INTERVENTION_THRESHOLDS.needWithoutShortlistDays) continue
    drafts.push({
      kind: 'need_without_shortlist',
      subjectType: 'project',
      subjectId: row.id,
      ownerId: row.owner_id,
      detail: `${row.title} : besoin ouvert depuis ${age} jours, aucun profil positionné.`,
    })
  }
  return drafts
}

/* ------------------------------------------------------------------ */
/*  10. Un relevé toujours manquant après les relances                 */
/* ------------------------------------------------------------------ */

export type MissingTimesheetRow = {
  id: string
  mission_label: string | null
  period_month: string
  /** Le COMPTEUR de relances réellement envoyées. */
  reminders_sent: number | null
  owner_id: string | null
}

/**
 * Un relevé de temps qui n'arrive pas, alors qu'on a déjà relancé.
 *
 * Le compteur de relances est la SEULE chose qui autorise à dire « après deux
 * relances ». Le déduire de l'âge du mois — « il a dû être relancé deux fois » —
 * annoncerait des relances qu'aucun humain n'a envoyées, sur des mois où le
 * canal n'était même pas branché. Un compteur inconnu se tait donc, comme
 * partout ailleurs.
 */
export function detectMissingTimesheets(rows: readonly MissingTimesheetRow[]): InterventionDraft[] {
  const drafts: InterventionDraft[] = []
  for (const row of rows) {
    const reminders = row.reminders_sent
    if (reminders === null || reminders === undefined) continue
    if (reminders < INTERVENTION_THRESHOLDS.timesheetRemindersBeforeAlert) continue
    const what = row.mission_label ? `${row.mission_label} — ` : ''
    drafts.push({
      kind: 'timesheet_missing',
      subjectType: 'mission',
      subjectId: row.id,
      ownerId: row.owner_id,
      detail: `${what}relevé du mois ${row.period_month.slice(0, 7)} toujours manquant après ${reminders} relances.`,
    })
  }
  return drafts
}

/* ------------------------------------------------------------------ */
/*  11. Un encaissement en retard                                      */
/* ------------------------------------------------------------------ */

export type OverduePaymentRow = {
  id: string
  mission_label: string | null
  period_month: string
  /** L'échéance ACCEPTÉE par le client. `null` = inconnue, jamais aujourd'hui. */
  due_on: string | null
  paid_at: Date | string | null
  /** #2419.4 — les DEUX montants du solde. Sans eux, la règle ne peut pas
   *  distinguer un encaissement qui clôt d'un acompte qui ne clôt rien. */
  paid_amount_cents: number | null
  invoiced_amount_cents: number | null
  disputed_at: Date | string | null
  dispute_resolved_at: Date | string | null
  owner_id: string | null
}

/**
 * Une facture émise dont l'échéance est passée sans encaissement.
 *
 * Quatre conditions, et chacune refuse une bêtise précise :
 *  - un mois SOLDÉ sort, évidemment. ⚠️ #2419.4 — ce refus disait « c'est
 *    l'encaissement qui clôt, pas le montant », et c'était faux : un client
 *    qui règle 5 000 € sur 10 000 € fait poser `paid_at` sans éteindre la
 *    dette. L'intervention s'éteignait, et plus personne n'était prévenu que
 *    5 000 € dormaient. C'est le SOLDE qui clôt. Un règlement dont on ignore
 *    le montant, lui, reste traité comme soldé : accuser un client d'un
 *    impayé sur la foi d'une absence serait pire que le défaut réparé ;
 *  - une échéance INCONNUE ne produit aucun retard : `null` est une date qu'on
 *    n'a pas, jamais « aujourd'hui », et le contraire ferait compter en retard
 *    tout ce dont on ignore la date ;
 *  - un LITIGE en cours sort : une facture contestée n'est pas une facture
 *    oubliée, et c'est précisément la distinction pour laquelle `disputed_at`
 *    existe. Un litige LEVÉ, lui, revient au compte ;
 *  - la franchise se compte depuis l'ÉCHÉANCE, jamais depuis l'émission.
 *
 * ⚠️ Ce n'est PAS `invoicing_blocked`, qui parle d'un mois qu'on ne peut pas
 * encore facturer. Ici la facture est partie ; c'est l'argent qui ne revient
 * pas.
 */
/** Des centimes en euros lisibles, dans la langue du détail (français : ces
 *  phrases sont écrites, stockées et relues telles quelles). */
function formatEuros(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

/**
 * #3671 (GA-26) — l'ancienneté d'une facture en retard n'a QU'UNE formule :
 * `overdueDaysFromDueOn` (`@bellum/contracts`), celle du brief, de l'écran
 * Encaissements et de la relance. Recette 11/10 : la carte du brief lisait 69
 * jours, « Ce qui attend ta décision » 31 — la phrase stockée à l'ouverture.
 * Au LISTAGE, le nombre se relit de l'échéance vivante et remplace celui du texte.
 */
export function withLiveOverdueDays(detail: string, dueOn: string | null, now: Date): string {
  const days = overdueDaysFromDueOn(dueOn, now)
  if (days === null || days < 0) return detail
  return detail.replace(/depuis \d+ jours?/, `depuis ${days} jours`)
}

export function detectOverduePayments(rows: readonly OverduePaymentRow[], now: Date): InterventionDraft[] {
  const drafts: InterventionDraft[] = []
  for (const row of rows) {
    // #2419.4 — un paiement partiel ne sort pas de la file : le prédicat vit
    // dans le contrat, avec celui de l'écran et celui de la cadence.
    const settlement = {
      paidAt: row.paid_at ? String(row.paid_at) : null,
      paidAmountCents: row.paid_amount_cents,
      invoicedAmountCents: row.invoiced_amount_cents,
    }
    if (isSettled(settlement)) continue
    if (row.disputed_at && !row.dispute_resolved_at) continue
    // #3671 — la formule unique (voir `withLiveOverdueDays`), jamais `daysSince`.
    const overdue = overdueDaysFromDueOn(
      (row.due_on as unknown) instanceof Date ? (row.due_on as unknown as Date).toISOString() : row.due_on,
      now,
    )
    if (overdue === null || overdue < INTERVENTION_THRESHOLDS.paymentOverdueDays) continue
    const what = row.mission_label ? `${row.mission_label} — ` : ''
    // Sur une ligne partiellement réglée, « aucun encaissement enregistré »
    // serait FAUX : de l'argent est rentré. On nomme ce qui RESTE.
    const outstanding = outstandingAmountCents(settlement)
    const money =
      row.paid_at && outstanding !== null
        ? `règlement partiel reçu, reste dû ${formatEuros(outstanding)}.`
        : 'aucun encaissement enregistré.'
    drafts.push({
      kind: 'payment_overdue',
      subjectType: 'mission',
      subjectId: row.id,
      ownerId: row.owner_id,
      detail: `${what}facture du mois ${row.period_month.slice(0, 7)} : échéance dépassée depuis ${overdue} jours, ${money}`,
    })
  }
  return drafts
}

/* ------------------------------------------------------------------ */
/*  12. Une mission qui court sans date de fin                         */
/* ------------------------------------------------------------------ */

export type MissionWithoutEndDateRow = {
  id: string
  label: string
  /** L'échéance. `null` est exactement ce que cette règle cherche. */
  ends_on: string | null
  /** Le DÉMARRAGE constaté. `null` = elle n'a pas commencé, donc elle se tait. */
  started_on: string | null
  /** Tel qu'il est en base : un `text`, jamais garanti d'être dans l'énumération. */
  contract_kind: string
  user_id: string | null
}

/**
 * `MIS-12` — « mission sans date de fin > 30 j → rappel unique au propriétaire ».
 *
 * C'est la seule règle de ce fichier qui alerte sur une ABSENCE plutôt que sur
 * un délai, et elle mérite qu'on dise pourquoi elle ne contredit pas la
 * doctrine du module (« ce qu'on ne sait pas n'alerte jamais »). Les autres se
 * taisent quand une donnée manque parce qu'elles s'en servent pour MESURER —
 * un silence vaut mieux qu'un chiffre inventé. Ici, l'absence n'est pas une
 * mesure ratée : elle EST le fait, et c'est un fait dont on connaît le coût.
 * Sans `ends_on`, `detectRenewalsAtRisk` se tait, la routine « fins de
 * mission » se tait, et le chiffre d'affaires restant exclut la mission. Le
 * board le COMPTE déjà (`withoutEndDateCount`, alerte `no_end_date`) ; personne
 * n'était prévenu. C'est la même exception, et pour la même raison, que celle
 * qu'`account_untouched` s'accorde plus haut.
 *
 * Quatre refus, chacun contre une alerte que personne ne pourrait résoudre :
 *
 *  - **pas de date de démarrage ⇒ silence.** « Depuis trente jours » ne
 *    désignerait rien, et compter depuis la création reprocherait un retard de
 *    saisie à une mission qui commence en septembre. Même refus que
 *    `plan_j30_review`, qui n'ose pas poser un point à J+30 sans démarrage ;
 *  - **forfait, recrutement, nature inconnue ⇒ silence**, via
 *    `expectsEndDate` — la question « une fin est-elle attendue ici ? » vit à
 *    un seul endroit, à côté de `expectsTimesheet` ;
 *  - **une valeur hors énumération ⇒ silence.** `missions.contract_kind` est un
 *    `text` sans contrainte : une faute de frappe ne doit pas ouvrir une file
 *    entière ;
 *  - **une date illisible ⇒ silence**, comme partout ici.
 *
 * Le garde-fou « 1 seul » de la source n'est PAS réimplémenté : il est porté
 * par l'index unique `interventions_unique (workspace_id, kind, subject_id)` et
 * le `ON CONFLICT DO NOTHING` de `PlaybooksService.open`. La ligne survit à sa
 * résolution, donc le rappel ne repart jamais. Un compteur de rappels serait
 * une seconde vérité sur le même fait.
 */
export function detectMissionsWithoutEndDate(
  rows: readonly MissionWithoutEndDateRow[],
  now: Date,
): InterventionDraft[] {
  const drafts: InterventionDraft[] = []
  for (const row of rows) {
    if (row.ends_on) continue
    const kind = contractKindSchema.safeParse(row.contract_kind)
    if (!kind.success || !expectsEndDate(kind.data)) continue
    const running = daysSince(row.started_on, now)
    if (running === null || running < INTERVENTION_THRESHOLDS.missionWithoutEndDateDays) continue
    drafts.push({
      kind: 'mission_without_end_date',
      subjectType: 'mission',
      subjectId: row.id,
      ownerId: row.user_id,
      // On DIT ce que l'absence éteint, sinon « il manque une date » se lit
      // comme une exigence administrative et se remet à demain tous les jours.
      detail: `${row.label} : en cours depuis ${running} jours sans date de fin — aucune alerte de renouvellement ne peut partir, et la mission est exclue du chiffre d’affaires restant.`,
    })
  }
  return drafts
}

/* ------------------------------------------------------------------ */
/*  13. Le même consultant, positionné sur des besoins concurrents     */
/* ------------------------------------------------------------------ */

/**
 * #2206.12 — la nature « collision équipe » du cockpit du responsable.
 *
 * Réutilise `detectStaffingCollisions` (`@bellum/contracts`, décision Louis
 * du 16/09/2026) plutôt que de réimplémenter un calcul déjà pur et déjà
 * testé : deux positionnements OUVERTS du MÊME consultant sur deux besoins
 * DISTINCTS. Cette fonction fait le seul travail qui manquait — transformer
 * la collision NOMMÉE en ligne OUVRABLE, CLASSABLE et ATTRIBUABLE.
 *
 * ⚠️ Aucun `ownerId` unique posé sur la ligne. Une collision porte sur DEUX
 * positionnements qui peuvent appartenir à deux commerciaux différents ; en
 * choisir un au hasard attribuerait la responsabilité au mauvais responsable
 * — et ce serait recréer, par la bande, la collision ENTRE COMMERCIAUX que
 * la même décision du 16/09/2026 écarte explicitement. La ligne reste donc
 * sans propriétaire désigné : un responsable qui la voit sait que PERSONNE
 * n'a encore la vue d'ensemble, ce qui est exactement le fait.
 *
 * `subjectType: 'submission'`, posée sur le PREMIER positionnement ouvert du
 * consultant : `INTERVENTION_SUBJECTS` n'a pas de nature « consultant », et
 * un positionnement s'ouvre déjà vers l'écran de travail concerné — pas de
 * migration de plus pour un objet qui n'a pas de sujet naturel unique.
 */
export function detectStaffingCollisionInterventions(
  candidates: readonly StaffingCollisionCandidate[],
): InterventionDraft[] {
  return detectStaffingCollisions(candidates).map(collision => ({
    kind: 'staffing_collision',
    subjectType: 'submission',
    subjectId: collision.submissionIds[0],
    ownerId: null,
    detail: `${collision.consultantName ?? 'Ce consultant'} est positionné sur ${collision.needIds.length} besoins concurrents à la fois (${collision.submissionIds.length} positionnements ouverts) — personne n’a encore tranché lequel prioriser.`,
  }))
}
