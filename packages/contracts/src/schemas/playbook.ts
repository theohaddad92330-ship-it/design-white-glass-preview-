import { z } from 'zod'
import { writeRequestTargetSchema } from './write-request-target.js'

/**
 * Les PLAYBOOKS de niveau 5 — les seules automatisations qui ATTEIGNENT un
 * client sans clic humain.
 *
 * Arbitrage Louis (#13) : les trois playbooks, relance client automatique
 * incluse, SOUS GARDE-FOUS. C'est la décision la plus risquée de tout le
 * chantier — un envoi automatique mal borné abîme une réputation d'expéditeur
 * en une nuit et se répare en semaines — donc les six garde-fous ne sont pas
 * négociables et sont tous dans le même endroit, testé :
 *
 * 1. **Arrêt dès réponse.** Une réponse reçue ferme la séquence, définitivement.
 *    C'est le garde-fou le plus important : relancer quelqu'un qui vient de
 *    répondre est la façon la plus rapide de se faire ignorer.
 * 2. **Une relance MAXIMUM par règle.** Pas de cadence, pas d'escalade
 *    automatique. Ce qui reste sans réponse après une relance est un sujet
 *    humain.
 * 3. **Opt-out vérifié**, à chaque envoi, jamais en cache.
 * 4. **Heures calmes.** Rien avant 8 h, rien après 19 h, rien le week-end : un
 *    e-mail automatique reçu un dimanche à 3 h se voit, et il se voit mal.
 * 5. **Plafond quotidien par espace.** Une boucle qui s'emballe s'arrête sur un
 *    nombre, pas sur la vigilance de quelqu'un.
 * 6. **Opt-in par espace, avec bouton d'arrêt.** Rien ne part tant qu'un humain
 *    n'a pas armé le playbook, et un seul clic éteint tout.
 */

/**
 * Les TROIS playbooks. Trois, et pas un catalogue : chacun est un envoi réel à
 * un client, et chaque playbook ajouté multiplie la surface d'un accident.
 */
export const PLAYBOOK_KEYS = [
  /** Un CV est parti, le client n'a rien dit depuis N jours. */
  'submission_no_reply',
  /** Une mission arrive à échéance et personne n'a ouvert le renouvellement. */
  'mission_renewal',
  /** Un devis / une proposition est resté sans réponse. */
  'proposal_no_reply',
] as const
export const playbookKeySchema = z.enum(PLAYBOOK_KEYS)
export type PlaybookKey = (typeof PLAYBOOK_KEYS)[number]

/** Heures calmes — un e-mail automatique reçu un dimanche à 3 h se voit mal. */
export const QUIET_HOURS_START = 8
export const QUIET_HOURS_END = 19
/** Jours ouvrés ISO (1 = lundi … 5 = vendredi). */
export const PLAYBOOK_WORKDAYS: readonly number[] = [1, 2, 3, 4, 5]
/** Plafond d'envois automatiques par espace et par jour. */
export const PLAYBOOK_DAILY_CAP = 25
/** Une relance maximum par règle et par cible. Pas de cadence, pas d'escalade. */
export const PLAYBOOK_MAX_PER_TARGET = 1

export const playbookSubscriptionSchema = z.object({
  playbook: playbookKeySchema,
  /** Défaut FAUX. Rien ne part tant qu'un humain n'a pas armé. */
  enabled: z.boolean(),
  /** Silence minimum avant de relancer, en jours. */
  silenceDays: z.number().int().min(1).max(90),
  updatedAt: z.string(),
})
export type PlaybookSubscription = z.infer<typeof playbookSubscriptionSchema>

export const updatePlaybookSchema = z
  .object({
    enabled: z.boolean(),
    silenceDays: z.number().int().min(1).max(90).default(7),
  })
  .strict()
export type UpdatePlaybookInput = z.infer<typeof updatePlaybookSchema>

/**
 * Pourquoi un envoi automatique a été REFUSÉ.
 *
 * Chaque refus est nommé et journalisé. Un playbook qui « n'a rien envoyé » sans
 * dire pourquoi est indistinguable d'un playbook en panne, et personne ne peut
 * décider s'il faut le réparer ou s'en réjouir.
 */
export const PLAYBOOK_BLOCK_REASONS = [
  'not_enabled',
  'replied',
  'already_sent',
  'opted_out',
  'quiet_hours',
  'daily_cap',
  'not_silent_enough',
  'no_recipient',
  /**
   * Une relance est PRÊTE et attend la validation d'un humain.
   *
   * Ajoutée le 26/08/2026 avec l'approbation obligatoire. Elle ne remplace pas
   * `already_sent`, elle la désambiguïse : « rien n'est parti parce que tu ne
   * l'as pas encore validé » et « rien n'est parti parce que c'est déjà relancé »
   * appellent deux gestes différents, et les confondre ferait chercher une panne
   * là où il n'y a qu'une décision en attente.
   */
  'awaiting_approval',
] as const
export const playbookBlockReasonSchema = z.enum(PLAYBOOK_BLOCK_REASONS)
export type PlaybookBlockReason = (typeof PLAYBOOK_BLOCK_REASONS)[number]

/** Ce que le garde-fou a besoin de savoir. Rien de plus. */
export type PlaybookCandidate = {
  /** L'espace a-t-il armé ce playbook ? */
  enabled: boolean
  /** Le client a-t-il répondu, à un moment quelconque ? */
  hasReply: boolean
  /** Une relance de CE playbook est-elle déjà partie sur cette cible ? */
  alreadySent: boolean
  /** Le destinataire s'est-il désabonné ? Lu à CHAQUE envoi, jamais en cache. */
  optedOut: boolean
  /** Jours de silence écoulés. `null` = inconnu — et l'inconnu ne relance pas. */
  silenceDays: number | null
  /** Seuil configuré par l'espace. */
  requiredSilenceDays: number
  /** Adresse du destinataire. */
  recipient: string | null
  /** Combien d'envois automatiques l'espace a déjà faits aujourd'hui. */
  sentToday: number
}

export type PlaybookVerdict = { allowed: true } | { allowed: false; reason: PlaybookBlockReason }

/**
 * Les SIX garde-fous, dans l'ordre où ils protègent.
 *
 * `now` est un paramètre : un garde-fou d'heures calmes qui lit l'horloge
 * lui-même ne se teste pas, et c'est exactement celui qu'on veut tester.
 *
 * L'ordre n'est pas cosmétique. « Le client a répondu » passe AVANT « il est
 * 3 h du matin » : les deux bloquent, mais le premier ferme la séquence pour
 * toujours alors que le second la reporte de quelques heures, et un journal qui
 * dirait « heures calmes » sur une cible qui a répondu ferait croire qu'un envoi
 * partira demain.
 */
export function playbookVerdict(candidate: PlaybookCandidate, now: Date): PlaybookVerdict {
  if (!candidate.enabled) return { allowed: false, reason: 'not_enabled' }
  // Le garde-fou n°1 : une réponse ferme la séquence, définitivement.
  if (candidate.hasReply) return { allowed: false, reason: 'replied' }
  if (candidate.alreadySent) return { allowed: false, reason: 'already_sent' }
  if (candidate.optedOut) return { allowed: false, reason: 'opted_out' }
  if (!candidate.recipient) return { allowed: false, reason: 'no_recipient' }
  // Un silence INCONNU ne relance pas : sans date, on ne sait pas depuis quand
  // on attend, et relancer « au cas où » est exactement ce qu'un client
  // remarque.
  if (candidate.silenceDays === null || candidate.silenceDays < candidate.requiredSilenceDays) {
    return { allowed: false, reason: 'not_silent_enough' }
  }
  if (candidate.sentToday >= PLAYBOOK_DAILY_CAP) return { allowed: false, reason: 'daily_cap' }
  if (!withinQuietHours(now)) return { allowed: false, reason: 'quiet_hours' }
  return { allowed: true }
}

/**
 * Sommes-nous dans une plage d'envoi acceptable ?
 *
 * Jours ouvrés, 8 h – 19 h. Le week-end est exclu entièrement : un e-mail
 * commercial automatique reçu un samedi dit à son destinataire qu'aucun humain
 * ne l'a relu.
 */
export function withinQuietHours(now: Date): boolean {
  const isoDay = now.getDay() === 0 ? 7 : now.getDay()
  if (!PLAYBOOK_WORKDAYS.includes(isoDay)) return false
  const hour = now.getHours()
  return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END
}

// ───────────────────────────── simulation (dry-run) ──────────────────────────

/**
 * Ce qu'un playbook FERAIT s'il était armé, sans que rien ne parte.
 *
 * Le §43 du rapport l'exige pour toute automatisation de niveau 4 ou 5, et la
 * porte G5 du §53 en fait une condition de déploiement : « simulation sur
 * données réelles sans write ». La raison est simple — personne ne peut
 * raisonnablement autoriser des e-mails automatiques vers ses clients sans
 * avoir vu, sur SES données, qui les recevrait.
 *
 * La simulation évalue les six garde-fous COMME SI le playbook était armé.
 * Sinon chaque ligne rendrait `not_enabled`, ce qui est exact et parfaitement
 * inutile : la seule question intéressante est ce qui se passerait après
 * l'armement.
 */
export const playbookDryRunEntrySchema = z.object({
  /** L'objet visé (positionnement, mission, projet). */
  targetId: z.string(),
  /** De quoi il s'agit, en clair — « Marie Dupont chez ACME ». */
  label: z.string(),
  /** L'adresse qui recevrait le message. `null` = aucune, et c'est un refus. */
  recipient: z.string().nullable(),
  /** Partirait-il ? */
  wouldSend: z.boolean(),
  /** Pourquoi pas, le cas échéant. Toujours nommé. */
  reason: playbookBlockReasonSchema.nullable(),
  /** Jours de silence écoulés. `null` = inconnu, et l'inconnu ne relance pas. */
  silenceDays: z.number().int().nullable(),
  /** L'objet du message qui partirait — la seule façon de juger le ton. */
  subject: z.string(),
})
export type PlaybookDryRunEntry = z.infer<typeof playbookDryRunEntrySchema>

export const playbookDryRunSchema = z.object({
  playbook: playbookKeySchema,
  /** L'état RÉEL de l'abonnement — la simulation ne l'arme pas. */
  enabled: z.boolean(),
  /** Horodatage de l'évaluation : les heures calmes en dépendent. */
  evaluatedAt: z.string(),
  /** Combien partiraient maintenant. */
  wouldSend: z.number().int().nonnegative(),
  /** Combien seraient écartés, et pourquoi — le décompte par motif. */
  blocked: z.partialRecord(playbookBlockReasonSchema, z.number().int().nonnegative()),
  entries: z.array(playbookDryRunEntrySchema),
})
export type PlaybookDryRun = z.infer<typeof playbookDryRunSchema>

/** Borne de la simulation : au-delà, on ne lit plus une liste, on la subit. */
export const PLAYBOOK_DRY_RUN_LIMIT = 50

// ─────────────────────── file d'intervention du manager ──────────────────────

/**
 * Ce qui remonte à un responsable. Liste FERMÉE : une file d'intervention qui
 * accepte n'importe quoi devient une seconde boîte de réception, et une seconde
 * boîte de réception ne se lit pas.
 */
/**
 * Les objets sur lesquels une intervention peut porter.
 *
 * Exporté plutôt qu'écrit en ligne dans le schéma : la garde GA-12 compare
 * chaque contrainte `CHECK` de la base à SON énumération TypeScript, et elle ne
 * peut comparer que ce qui porte un nom. Une valeur enfouie dans un objet zod
 * est invisible pour elle — donc invisible le jour où quelqu'un en ajoute une
 * sans élargir la contrainte.
 */
export const INTERVENTION_SUBJECTS = ['account', 'project', 'mission', 'submission', 'user', 'workspace'] as const
export const interventionSubjectSchema = z.enum(INTERVENTION_SUBJECTS)

export const INTERVENTION_KINDS = [
  /** Un profil positionné sans retour depuis trop longtemps. */
  'submission_stalled',
  /** Une mission arrive à échéance sans renouvellement ouvert. */
  'renewal_at_risk',
  /** Un mois non facturable depuis trop longtemps. */
  'invoicing_blocked',
  /** Un compte suivi que personne n'a touché. */
  'account_untouched',
  /** Un commercial qui n'a rien fait depuis trop longtemps. */
  'rep_inactive',
  /** L'espace arrive au bout de son enveloppe de crédits. */
  'credits_exhausted',
  /*
   * ───────────────────────────────────────────────────────────────────────────
   * LES CINQ NATURES DU COCKPIT DU COMMERCIAL — ajoutées EN FIN (GA-08)
   * ───────────────────────────────────────────────────────────────────────────
   * Les six ci-dessus sont celles du tableau de bord du RESPONSABLE. Le bloc
   * « Ce qui m'attend » du cockpit du commercial (§2.4) en demande six autres,
   * dont une seule était déjà couverte — « mission non sécurisée », qui est
   * `renewal_at_risk` sous un autre nom.
   *
   * Quatre des cinq suivantes étaient DÉJÀ détectées et mesurées : la sonde de
   * Laura les compte toutes les quatre. Elles n'écrivaient simplement aucune
   * ligne d'intervention — donc rien d'OUVRABLE, de CLASSABLE ni
   * d'ATTRIBUABLE. Le motif que ce dépôt connaît par cœur : du code juste que
   * personne n'appelle.
   */
  /** Un compte suivi sans la moindre prochaine action prévue. */
  'account_no_next_action',
  /** Un projet immobile au-delà de la durée type de son étape. */
  'project_no_decision',
  /** Un besoin ouvert depuis trop longtemps sans le moindre profil positionné. */
  'need_without_shortlist',
  /** Un relevé de temps toujours manquant après les relances. */
  'timesheet_missing',
  /** Une facture émise dont l'échéance est passée sans encaissement. */
  'payment_overdue',
  /*
   * ───────────────────────────────────────────────────────────────────────────
   * `MIS-12` DU PDF 5 §12 — ajoutée EN FIN (GA-08), le 29/08/2026
   * ───────────────────────────────────────────────────────────────────────────
   * « Mission sans date de fin > 30 j → rappel unique au propriétaire ».
   *
   * Le produit sait déjà COMPTER ces missions : alerte `no_end_date` sur la
   * carte du board, `withoutEndDateCount` dans son en-tête, cible zéro au KPI
   * du PDF 5, et le risque les classe `unknown` plutôt que de leur inventer une
   * échéance. Ce qui manquait est le RAPPEL — et l'absence coûte deux fois,
   * parce que tout le reste du module s'interdit d'agir sans cette date :
   * `detectRenewalsAtRisk` se tait, la routine « fins de mission » se tait, le
   * CA restant l'exclut. Le silence est juste, il n'était adressé à personne.
   */
  'mission_without_end_date',
  /*
   * ───────────────────────────────────────────────────────────────────────────
   * #2206.12 — « COLLISION ÉQUIPE », LA SIXIÈME NATURE DE TOP DÉCISIONS DU
   * COCKPIT RESPONSABLE — ajoutée EN FIN (GA-08), le 25/09/2026
   * ───────────────────────────────────────────────────────────────────────────
   * Le calcul existait déjà, pur et testé : `detectStaffingCollisions`
   * (`staffing-collision.ts`, #2107.17/#2108.18/#2108.30, décision Louis du
   * 16/09/2026) — deux positionnements OUVERTS du MÊME consultant sur deux
   * besoins DISTINCTS. Il alimentait déjà le diagnostic de pipe
   * (`ProjectPipelineService.health`) et le contexte de Laura côté IA, mais
   * aucun des deux n'ouvrait de ligne d'intervention : rien d'OUVRABLE, de
   * CLASSABLE ni d'ATTRIBUABLE pour un responsable. Le motif que ce dépôt
   * connaît par cœur : du code juste que personne n'appelle.
   *
   * ⚠️ Ce n'est PAS la collision ENTRE COMMERCIAUX (deux vendeurs qui
   * travaillent le même compte) — CETTE lecture reste écartée par la même
   * décision du 16/09/2026, pour la même raison (« l'analytique mesure le
   * PRODUIT, jamais la personne »). `staffing-collision.ts` ne compare JAMAIS
   * deux `ownerId`, et cette nature non plus : voir `intervention-rules.ts`.
   */
  'staffing_collision',
] as const
export const interventionKindSchema = z.enum(INTERVENTION_KINDS)
export type InterventionKind = (typeof INTERVENTION_KINDS)[number]

/**
 * Les seuils de détection, en JOURS.
 *
 * Écrits dans le code et non en variables d'environnement : le dépôt a déjà
 * appris qu'un réglage que personne ne relit devient une loterie (une valeur
 * traînait en production depuis des semaines sans qu'aucun log ne le dise). Ce
 * sont des décisions produit ; elles se changent par une revue, pas par une
 * console.
 */
export const INTERVENTION_THRESHOLDS = {
  /** Un CV parti sans le moindre retour. Deux semaines pleines : en dessous,
   *  on alerterait sur des congés. */
  submissionSilenceDays: 14,
  /**
   * #2335.7 (LAU-FINAL-076) — le délai MAXIMAL avant que l'alerte s'arrête.
   *
   * « Le silence crée une action gouvernée. Pas une relance infinie. » —
   * au-delà de deux mois pleins, répéter la même alerte n'aide plus personne :
   * c'est une décision humaine qui manque (clore le positionnement, le
   * retirer), pas un rappel de plus. `detectStalledSubmissions` s'arrête ici.
   */
  submissionSilenceMaxDays: 60,
  /** Fenêtre d'alerte avant la fin PRÉVUE d'une mission. Un mois laisse le
   *  temps de rouvrir la discussion ; une semaine, non. */
  renewalHorizonDays: 30,
  /** Un mois non facturable qui le reste après sa clôture. */
  invoicingBlockedDays: 40,
  /** Un compte suivi que personne n'a touché. */
  accountUntouchedDays: 30,
  /** Un commercial sans la moindre action tracée. */
  repInactiveDays: 14,
  /**
   * Depuis combien de temps un compte doit exister avant que l'absence de
   * prochaine action lui soit reprochée.
   *
   * Sans ce garde-fou, un compte ajouté au portefeuille ce matin ouvrirait une
   * intervention avant même que quelqu'un ait eu le temps de lui poser une
   * suite — c'est la même précaution que la tenure de `rep_inactive`, pour la
   * même raison.
   *
   * ⚠️ Même valeur que {@link accountUntouchedDays}, et pourtant une entrée à
   * part : ce sont DEUX faits différents (« personne ne l'a touché » regarde le
   * passé, « aucune suite prévue » regarde l'avenir), et les fusionner ferait
   * bouger l'un le jour où quelqu'un règle l'autre.
   */
  accountNoNextActionDays: 30,
  /**
   * « Ce besoin est ouvert depuis 5 jours » sans le moindre profil positionné.
   *
   * Compté sur l'âge D'ÉTAPE et non sur la date de création : c'est la mesure
   * que le pied de carte du kanban affiche déjà, et deux âges pour le même
   * besoin feraient deux vérités sur le même écran.
   *
   * ⚠️ Ce seuil vivait en double, dans `laura-probe.service.ts`, sous le nom
   * `NEED_STALE_DAYS`. La sonde l'importe désormais d'ici : un réglage vit à un
   * seul endroit (GA-26), et la bulle de Laura comme la ligne d'intervention
   * parlent du MÊME fait.
   */
  needWithoutShortlistDays: 5,
  /**
   * « Relevé manquant après 2 relances » — un COMPTEUR lu, pas un délai deviné.
   *
   * La cadence des relances vit dans `REMINDER_SCHEDULE_DAYS`, côté relevés ;
   * la recopier ici en ferait une seconde vérité. On lit ce que ce module a
   * réellement écrit, et un compteur inconnu n'alerte pas.
   *
   * ⚠️ Ce n'est PAS un nombre de jours, contrairement à ses voisins.
   */
  timesheetRemindersBeforeAlert: 2,
  /**
   * « Encaissement en retard de 30 j », compté depuis l'ÉCHÉANCE.
   *
   * Jamais depuis l'émission : l'échéance est la date que le client a acceptée,
   * et c'est celle que l'écran de facturation affiche. Le cockpit de mission,
   * lui, compte tout retard sans franchise — il répond à une autre question
   * (« cette mission est-elle à risque ? »). Deux questions, deux mesures ; ce
   * qui serait faux serait deux mesures pour la MÊME question.
   */
  paymentOverdueDays: 30,
  /**
   * « Cette mission court depuis plus de trente jours et n'a toujours pas de
   * date de fin » (`MIS-12`).
   *
   * Compté depuis le DÉMARRAGE, jamais depuis la création : une mission créée
   * pour un projet qui commencera en septembre n'a rien à se reprocher en
   * juillet, et lui reprocher un retard de saisie apprendrait à ignorer la
   * file. Sans date de démarrage, la règle se tait — « depuis trente jours » ne
   * désignerait rien, exactement comme `plan_j30_review` refuse de poser un
   * point à J+30 d'une mission qui n'a pas commencé.
   *
   * ⚠️ Même valeur que {@link renewalHorizonDays}, et pourtant une entrée à
   * part : ce sont DEUX faits différents. L'un regarde une échéance CONNUE qui
   * approche, l'autre l'ABSENCE d'échéance ; les fusionner ferait bouger la
   * fenêtre d'alerte de renouvellement le jour où quelqu'un règle la patience
   * qu'on accorde à une saisie. C'est la même précaution que
   * {@link accountNoNextActionDays} face à {@link accountUntouchedDays}.
   */
  missionWithoutEndDateDays: 30,
} as const

/**
 * ⚠️ « PROJET SANS DÉCISION » N'A PAS DE SEUIL ICI, ET C'EST VOULU.
 *
 * La source demande « immobile au-delà de la **durée type de l'étape** ». Une
 * durée UNIFORME dirait qu'un profil proposé depuis trois semaines et une
 * qualification de trois semaines sont le même fait ; ils ne le sont pas.
 *
 * Cette durée type existe déjà, par étape, et elle a été tranchée ailleurs :
 * `MISSION_BOARD_STALE_DAYS` (`mission-board.ts`), indexée par colonne du board
 * Missions, à laquelle `columnForProject()` relie chaque étape de projet. C'est
 * exactement cette composition qui pose déjà l'alerte `stale` sur les cartes de
 * PROJET du board (`mission-board.service.ts`) : la file d'intervention ouvre
 * une ligne sur les cartes que le board marque déjà, et pas sur d'autres.
 *
 * En écrire un nombre de plus ici produirait deux vérités sur le même fait —
 * un projet « immobile » sur un écran et « à l'heure » sur l'autre.
 */

/**
 * Part de l'enveloppe consommée à partir de laquelle on prévient.
 *
 * On alerte AVANT le mur, pas dessus : découvrir qu'on n'a plus de crédits au
 * moment de lancer une analyse est exactement le genre de blocage qui fait
 * abandonner un outil un mardi matin.
 */
export const CREDITS_EXHAUSTED_RATIO = 0.9

export const INTERVENTION_STATES = ['open', 'acknowledged', 'resolved'] as const
export const interventionStateSchema = z.enum(INTERVENTION_STATES)
export type InterventionState = (typeof INTERVENTION_STATES)[number]

export const interventionSchema = z.object({
  id: z.string().guid(),
  kind: interventionKindSchema,
  /**
   * L'objet concerné, pour que le responsable puisse l'ouvrir.
   *
   * `user` et `workspace` ne sont pas des objets commerciaux : ce sont les
   * sujets des alertes qui portent sur des PERSONNES (un commercial inactif,
   * une équipe au bout de ses crédits). La contrainte CHECK correspondante est
   * élargie par la migration `1789503118742`.
   */
  subjectType: interventionSubjectSchema,
  subjectId: z.string().guid(),
  subjectLabel: z.string().nullable(),
  /** La personne dont c'est le périmètre. `null` = personne — et c'est déjà une
   *  information : un compte sans propriétaire n'est suivi par personne. */
  ownerId: z.string().guid().nullable(),
  ownerName: z.string().nullable(),
  /** Ce qui est arrivé, en une phrase, avec ses chiffres. */
  detail: z.string(),
  state: interventionStateSchema,
  openedAt: z.string(),
  resolvedAt: z.string().nullable(),
  /**
   * Recette 14/10 : 98 factures en retard faisaient 98 cartes quasi identiques.
   * Les `payment_overdue` d'un même CLIENT sont REGROUPÉES en une ligne côté
   * serveur. Absent = une intervention seule. `outstandingCents` `null` = au moins
   * un montant inconnu : jamais une somme partielle, jamais 0.
   */
  group: z
    .object({
      clientLabel: z.string().nullable(),
      ids: z.array(z.string().guid()),
      invoiceCount: z.number().int(),
      outstandingCents: z.number().int().nullable(),
      oldestOverdueDays: z.number().int().nullable(),
    })
    .optional(),
})
export type Intervention = z.infer<typeof interventionSchema>

/**
 * L'ORDRE de la file d'intervention.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN CLASSEMENT, ET PAS L'ANCIENNETÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * La file était servie `ORDER BY opened_at ASC` : la plus ancienne d'abord.
 * C'est le pire ordre possible pour un responsable — une alerte ancienne est
 * souvent celle que tout le monde a déjà choisi de ne pas traiter, et une
 * facture bloquée découverte ce matin passe derrière.
 *
 * Deux facteurs, multipliés :
 *  · la GRAVITÉ de la nature (un mois non facturable est de l'argent qui ne
 *    rentrera pas ; un compte que personne n'a touché est un manque à gagner
 *    futur — les deux comptent, pas pareil) ;
 *  · l'ÂGE, qui monte lentement et PLAFONNE. Sans plafond, une alerte oubliée
 *    depuis six mois finirait par dominer la file pour toujours, et c'est
 *    exactement ce qu'on veut éviter.
 *
 * Une intervention déjà `acknowledged` recule : quelqu'un l'a vue et a décidé
 * de la porter. La remettre en tête ferait douter de son propre geste.
 *
 * Pur et déterministe : `now` est un paramètre. Deux lectures de la même file à
 * la même seconde rendent le même ordre.
 */
export const INTERVENTION_SEVERITY: Record<InterventionKind, number> = {
  /** L'espace est au bout de son enveloppe : tout s'arrête, y compris le reste
   *  de cette file. */
  credits_exhausted: 100,
  /** De l'argent déjà gagné qui ne rentre pas. */
  invoicing_blocked: 80,
  /** De l'argent déjà FACTURÉ que le client n'a pas payé. Juste en dessous du
   *  mois bloqué, et l'ordre n'est pas arbitraire : un mois non facturé peut
   *  devenir INfacturable (une échéance contractuelle passe), une facture en
   *  retard reste due — elle se relance. */
  payment_overdue: 75,
  /** Une mission qui s'arrête dans moins d'un mois — la fenêtre pour rouvrir la
   *  discussion se referme, et elle ne se rouvre pas. */
  renewal_at_risk: 70,
  /** Le relevé qui manque est la CAUSE du mois bloqué, attrapée un cran plus
   *  tôt et pour un geste qui ne coûte rien — une relance. En dessous du mois
   *  bloqué parce que rien n'est encore perdu ; au-dessus du reste parce que
   *  c'est le seul de la file qui, laissé filer, en produit un autre. */
  timesheet_missing: 60,
  /** Un CV parti sans retour : une affaire en cours qui se refroidit. */
  submission_stalled: 55,
  /** Un besoin ouvert sans le moindre profil positionné : une occasion qui se
   *  referme toute seule. Sous le positionnement en souffrance — celui-là est
   *  plus avancé, et un silence client se rattrape plus difficilement qu'une
   *  sélection qu'on n'a pas encore commencée. */
  need_without_shortlist: 50,
  /** Une affaire immobile au-delà de la durée type de son étape. Elle est
   *  encore en jeu — c'est ce qui la met au-dessus des deux natures de suivi
   *  qui suivent, et en dessous de tout ce qui porte déjà un engagement. */
  project_no_decision: 45,
  /** Un commercial sans la moindre action tracée. Grave, mais ce n'est pas une
   *  affaire qui se perd aujourd'hui. */
  rep_inactive: 40,
  /** Un compte suivi sans aucune suite prévue. Au-dessus du compte non touché :
   *  celui-ci nomme une DÉCISION qui manque (« et ensuite ? »), là où l'autre
   *  ne décrit qu'un passé sans geste. */
  account_no_next_action: 30,
  /** Un compte suivi que personne n'a touché : un manque à gagner futur. */
  account_untouched: 25,
  /**
   * Une mission en cours dont personne n'a saisi la fin.
   *
   * Sous le renouvellement à risque, et l'écart dit quelque chose : là-bas
   * l'échéance est connue et la fenêtre se referme ; ici on ne sait même pas
   * qu'il y en a une. Mais AU-DESSUS des deux natures de suivi de compte,
   * parce que celle-ci ÉTEINT une autre alerte — tant que la date manque,
   * `renewal_at_risk` ne pourra jamais s'ouvrir sur cette mission. C'est la
   * seule ligne de la file dont la conséquence est un silence ailleurs.
   */
  mission_without_end_date: 35,
  /**
   * #2206.12 — un consultant positionné sur deux besoins concurrents. Entre
   * le besoin sans shortlist (50) et le projet immobile (45) : l'affaire est
   * encore gagnable des deux côtés, mais un choix qui traîne perd la
   * confiance du client sur celui qu'on ne sert pas — plus urgent qu'un
   * projet simplement lent, moins qu'un client qui n'a encore AUCUN profil.
   */
  staffing_collision: 47,
}

/** Au-delà, l'âge n'ajoute plus rien — voir le commentaire ci-dessus. */
const AGE_PLATEAU_DAYS = 21

/** Ce qu'une intervention pèse dans la file. Exporté pour être testable seul. */
export function interventionWeight(intervention: Pick<Intervention, 'kind' | 'state' | 'openedAt'>, now: Date): number {
  const severity = INTERVENTION_SEVERITY[intervention.kind] ?? 0
  const opened = Date.parse(intervention.openedAt)
  // Une date illisible ne devient JAMAIS « maintenant » ni « très vieux » : elle
  // vaut zéro jour, c'est-à-dire qu'elle est classée sur sa seule gravité.
  const days = Number.isNaN(opened) ? 0 : Math.max(0, (now.getTime() - opened) / 86_400_000)
  const age = 1 + Math.min(days, AGE_PLATEAU_DAYS) / AGE_PLATEAU_DAYS
  const seen = intervention.state === 'acknowledged' ? 0.5 : 1
  return severity * age * seen
}

/**
 * #2402.13 — au-delà, un signal OUVERT arrête d'être marqué URGENT : il reste
 * dans la file (on archive, on ne supprime pas), mais son badge cesse de
 * crier. Tranché sans Louis : 60 jours (~2 mois), un multiple généreux du
 * plateau de classement ({@link AGE_PLATEAU_DAYS}, 21 jours) — le POIDS d'une
 * alerte plafonne bien avant qu'on cesse de la dire urgente ; ce sont deux
 * seuils différents pour deux questions différentes (combien ça pèse dans
 * l'ordre / est-ce encore « urgent » à l'écran).
 */
export const INTERVENTION_STALE_DAYS = 60

/** Vrai seulement pour une intervention encore OUVERTE : une fois vue
 *  (`acknowledged`) ou close (`resolved`), l'âge ne dit plus rien de neuf. */
export function isInterventionStale(intervention: Pick<Intervention, 'state' | 'openedAt'>, now: Date): boolean {
  if (intervention.state !== 'open') return false
  const opened = Date.parse(intervention.openedAt)
  if (Number.isNaN(opened)) return false
  const days = (now.getTime() - opened) / 86_400_000
  return days > INTERVENTION_STALE_DAYS
}

/**
 * La file, du plus urgent au moins urgent. Ne filtre RIEN : c'est l'écran qui
 * décide combien il en montre, et il annonce toujours combien il en cache.
 */
export function rankInterventions<T extends Pick<Intervention, 'kind' | 'state' | 'openedAt' | 'id'>>(
  items: readonly T[],
  now: Date,
): T[] {
  return [...items].sort((left, right) => {
    const delta = interventionWeight(right, now) - interventionWeight(left, now)
    // L'identifiant départage : sans lui, deux interventions de même poids
    // pourraient changer d'ordre d'un rafraîchissement à l'autre, et une file
    // qui bouge toute seule n'est plus une file.
    return delta !== 0 ? delta : left.id.localeCompare(right.id)
  })
}

/** Combien de cartes l'écran montre avant de replier le reste (§7.4). */
export const INTERVENTION_VISIBLE_COUNT = 5

/**
 * Trancher une intervention.
 *
 * Le motif est OBLIGATOIRE pour `resolved`, et facultatif pour `acknowledged` —
 * les deux gestes ne disent pas la même chose. « Je l'ai vue » n'a rien à
 * justifier ; « c'est réglé » ferme la ligne, et une file qu'on vide sans dire
 * ce qui a été fait ne s'explique plus au bout de trois semaines. C'est la même
 * règle que le journal des portes de décision : ce qui compte n'est pas la
 * décision, c'est de pouvoir la relire.
 */
export const decideInterventionSchema = z
  .object({
    state: z.enum(['acknowledged', 'resolved']),
    reason: z.string().trim().min(1).max(300).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.state === 'resolved' && !value.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Dis ce qui a été fait : une intervention close sans motif ne se relit pas.',
      })
    }
  })
export type DecideInterventionInput = z.infer<typeof decideInterventionSchema>

/**
 * #2206.53 — attribuer une intervention.
 *
 * `InterventionsBlock.tsx` affichait déjà l'`ownerId` d'une intervention, mais
 * en LECTURE SEULE : `AssignmentController` (`PATCH /accounts/:id/assign`)
 * réassigne un COMPTE, jamais une ligne de la file. Le critère de recette
 * (« le manager peut attribuer une action ») demandait exactement ce geste,
 * absent.
 *
 * `ownerId: null` LIBÈRE la ligne — même vocabulaire que l'attribution de
 * compte (`assigned_to: null`) : une ligne sans propriétaire est déjà un état
 * valide et affiché (`noOwner`), pas une erreur à empêcher.
 */
export const assignInterventionSchema = z.object({ ownerId: z.string().guid().nullable() }).strict()
export type AssignInterventionInput = z.infer<typeof assignInterventionSchema>

// ────────────────────────────── dictionnaire KPI ─────────────────────────────

/**
 * Le DICTIONNAIRE des indicateurs.
 *
 * Chaque chiffre du produit y dit ce qu'il compte, sur quelle période, et — le
 * plus important — **ce qu'il ne compte pas**. Deux personnes qui lisent le même
 * tableau de bord en tirent sinon deux conclusions différentes, et la réunion se
 * passe à discuter du chiffre plutôt que du sujet.
 */
export const kpiDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  /** Ce que le chiffre compte, en une phrase. */
  definition: z.string(),
  /** Ce qu'il EXCLUT. Le champ le plus utile du dictionnaire. */
  excludes: z.string(),
  /** `null` quand l'indicateur n'a pas de dénominateur — et l'écran doit alors
   *  afficher « non mesurable », jamais 0 %. */
  denominator: z.string().nullable(),
})
export type KpiDefinition = z.infer<typeof kpiDefinitionSchema>

/**
 * Les indicateurs du CRM/ATS et leur définition exacte.
 *
 * Écrit dans le CODE et non en base : une définition d'indicateur éditable sans
 * revue rendrait deux exports incomparables d'un mois à l'autre.
 */
export const KPI_DICTIONARY: readonly KpiDefinition[] = [
  {
    key: 'pipeline_amount',
    label: 'Montant au pipe',
    definition: 'Somme des montants SAISIS sur les projets des quatre étapes ENCORE EN JEU.',
    excludes:
      'Les projets SIGNÉS — ils ont leur propre ligne, et les additionner ferait monter le pipe à chaque victoire. Les projets détectés non repris, les signaux, les projets perdus ou en sommeil, et tout projet sans montant — qui est compté à part, jamais comme 0 €.',
    denominator: null,
  },
  {
    key: 'submission_acceptance_rate',
    label: 'Taux d’acceptation des profils',
    definition: 'Profils acceptés ÷ profils ayant reçu une vraie réponse du client.',
    excludes:
      'Les positionnements restés sans retour : les compter comme des refus ferait chuter le taux sans qu’aucun client n’ait dit non.',
    denominator: 'Positionnements acceptés ou refusés avec un motif autre que « sans retour ».',
  },
  {
    key: 'time_to_feedback',
    label: 'Délai de retour client',
    definition: 'MÉDIANE des jours entre l’envoi d’un CV et le premier retour, quel qu’il soit.',
    excludes:
      'Les envois sans retour, et les retours datés avant l’envoi. Une médiane et non une moyenne : un seul retour à trois mois déplacerait la seconde.',
    denominator: 'Positionnements envoyés ET ayant reçu un retour.',
  },
  {
    key: 'prepared_revenue',
    label: 'Montant préparatoire à facturer',
    definition: 'Jours déclarés × TJM, pour les mois non encore facturés ailleurs.',
    excludes:
      'Les mois déjà facturés dans l’outil comptable, et les lignes non chiffrables — comptées à part, jamais absorbées comme des zéros. Ce n’est ni un dû ni une facture.',
    denominator: null,
  },
  {
    key: 'bench_availability',
    label: 'Disponibilité du vivier',
    definition: 'Talents dont les affectations laissent une capacité aujourd’hui.',
    excludes:
      'Les talents SANS affectation enregistrée : on ne sait pas s’ils sont libres, et les compter comme disponibles ferait proposer des gens en poste.',
    denominator: 'Talents ayant au moins une affectation connue.',
  },
]

/* ────────────────────────────────────────────────────────────────────────────
 * L'APPROBATION D'UN ENVOI AUTOMATIQUE — arbitrage Louis du 26/08/2026
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Les playbooks de niveau 5 envoyaient un vrai e-mail à un contact client sans
 * qu'aucun humain ne voie partir CE message-là. Les six garde-fous tenaient, et
 * ils ne répondent pas à la même question : ils disent « cette cible est
 * relançable », jamais « ce texte peut partir chez ce client aujourd'hui ».
 *
 * L'arbitrage tient en une phrase de Louis — « le N5 peut être mis en place mais
 * on doit quand même avoir une notif qui nous demande de valider pour être sûr ».
 * Le niveau reste N5 (la machine choisit la cible, compose le message et le fait
 * partir) ; ce qui change est qu'un humain voit le message avant l'envoi.
 *
 * Trois règles, chacune contre un accident précis :
 *
 *  1. **Ce qui est montré est ce qui part.** Objet et corps sont FIGÉS au moment
 *     de la demande. Recomposer à l'approbation ferait valider un texte et en
 *     envoyer un autre — le dossier a pu changer entre-temps.
 *  2. **Un refus vaut pour toujours, sur cette cible.** L'index unique de
 *     `playbook_sends` le garantit. Reproposer demain la relance qu'on vient de
 *     refuser serait du harcèlement d'utilisateur, et la seule issue serait de
 *     désarmer le playbook entier.
 *  3. **Une demande périme, et périmée elle ne part JAMAIS.** Trois jours, comme
 *     les approbations de l'Action OS et les écritures ERP. Approuver un lundi
 *     une relance préparée dix jours plus tôt enverrait un message qui parle
 *     d'un silence qui n'existe plus.
 */

/**
 * Le cycle de vie d'une relance automatique.
 *
 * `sent` est l'état HISTORIQUE : avant le 26/08, une ligne de `playbook_sends`
 * ne pouvait signifier que « c'est parti ». La migration les laisse donc à
 * `sent`, ce qui est vrai — et c'est pour cette raison que la valeur est en
 * tête et que le défaut SQL est `sent`.
 */
export const PLAYBOOK_SEND_STATES = [
  /** Historique : parti sans approbation (avant le 26/08), ou approuvé et parti. */
  'sent',
  /** Composé, réservé, en attente d'un humain. Rien n'est parti. */
  'pending_approval',
  /**
   * Validé, envoi en cours.
   *
   * État bref, et pourtant nécessaire : la décision est écrite AVANT l'appel à
   * la messagerie. Sans lui, un envoi parti pendant que la ligne dit encore
   * « en attente » serait renvoyé au clic suivant — et un doublon chez un
   * client ne se rattrape pas. Une ligne qui reste ici veut dire qu'on n'a pas
   * pu écrire le résultat de l'envoi, ce qui se voit et se répare.
   */
  'approved',
  /** Un humain a refusé. Définitif pour cette cible. */
  'rejected',
  /** Personne n'a tranché en trois jours. Ne partira pas. */
  'expired',
  /**
   * Approuvé, mais l'envoi lui-même a échoué.
   *
   * ⚠️ Ce n'est PAS `pending_approval` : la décision a été prise. Le remettre en
   * attente ferait revalider ce qui l'a déjà été, et un second envoi partirait
   * si le premier était en réalité passé. « On a essayé et ça n'est pas passé »
   * est une information ; « rien ne s'est passé » n'en est pas une.
   */
  'failed',
] as const
export const playbookSendStateSchema = z.enum(PLAYBOOK_SEND_STATES)
export type PlaybookSendState = (typeof PLAYBOOK_SEND_STATES)[number]

/** Trois jours — la même échéance que l'Action OS et les écritures ERP. */
export const PLAYBOOK_APPROVAL_EXPIRY_DAYS = 3

/** Une relance en attente de validation, telle que l'écran la montre. */
export const playbookApprovalSchema = z.object({
  id: z.string(),
  playbook: playbookKeySchema,
  /** À qui elle partirait. Affiché : on ne valide pas un envoi en aveugle. */
  recipient: z.string(),
  /** Le texte EXACT qui partira. Figé à la demande. */
  subject: z.string(),
  body: z.string(),
  requestedAt: z.string(),
  expiresAt: z.string(),
  /**
   * #2200.10 / #2200.17 / #2201.21 — l'objet visé. `channel` vaut TOUJOURS
   * `'email'` : une relance de playbook part par la messagerie, jamais par un
   * autre canal — ce n'est pas une supposition, c'est ce que `subject`/`body`
   * décrivent déjà. `ownerName` est celui qui décide (la file est personnelle,
   * D58) ; `accountName`/`contactName` sont ceux connus au moment où la relance
   * a été composée, portés depuis lors par la ligne (jamais recalculés).
   *
   * Optionnel : le socle #2200/#2201 ACT2 pose le contrat ; le remplissage
   * côté `PlaybooksService` (migration `playbook_sends` pour porter le nom du
   * compte) suit dans un lot séparé. Une ligne d'avant ce champ reste valide.
   */
  target: writeRequestTargetSchema.optional(),
  /**
   * #2856 — reste : reportée jusqu'à cette date (`PlaybooksService.snooze`),
   * même convention que `CrmWriteRequestView.snoozedUntil` / `AtsWrite`.
   * Absent ou `null` : dans la file active.
   */
  snoozedUntil: z.string().nullable().optional(),
})
export type PlaybookApproval = z.infer<typeof playbookApprovalSchema>

export const decidePlaybookSendSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    /** Facultatif : pourquoi on refuse. Utile en relecture, jamais exigé. */
    reason: z.string().max(500).optional(),
  })
  .strict()
export type DecidePlaybookSendInput = z.infer<typeof decidePlaybookSendSchema>

/**
 * Une demande d'approbation est-elle périmée ?
 *
 * Pure, pour que l'échéance se teste sans horloge. `expiresAt` illisible ⇒
 * **périmé** : un envoi client dont on ne sait pas dater l'autorisation ne part
 * pas. C'est le seul repli sûr — l'inverse enverrait sur une donnée cassée.
 */
export function isPlaybookApprovalExpired(expiresAt: string | Date | null | undefined, now: Date): boolean {
  if (expiresAt === null || expiresAt === undefined) return true
  const deadline = expiresAt instanceof Date ? expiresAt : new Date(expiresAt)
  const time = deadline.getTime()
  if (Number.isNaN(time)) return true
  return time <= now.getTime()
}

/** L'échéance d'une demande créée maintenant. */
export function playbookApprovalDeadline(now: Date): Date {
  return new Date(now.getTime() + PLAYBOOK_APPROVAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
}
