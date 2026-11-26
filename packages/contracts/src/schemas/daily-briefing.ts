import { z } from 'zod'
import { accountFactBriefSchema } from './account-facts.js'
import { agendaEventSchema, agendaConflictSchema } from './agenda.js'
import { chainBlockerSchema } from './chain.js'
import { contactAccessPathSchema } from './contact-ranking.js'
import { discoverAlertEventSchema } from './discover-alert-events.js'
import { mailThreadSchema } from './mailbox.js'
// L'échelle d'autorité d'une source (`human > connector > pipeline > model`)
// vit là et nulle part ailleurs : une carte de brief qui s'en écrirait une
// seconde finirait par contredire la première sur la même donnée (GA-26).
import { fieldSourceSchema } from './provenance.js'
import { protectedTimeSchema } from './protected-time.js'
import { agendaPreferencesSchema } from './agenda-preferences.js'
import { taskSchema } from './task.js'
import {
  FOCUS_PLAN_ACTUAL_MINUTES_MAX,
  FOCUS_PLAN_OUTCOME_NOTE_MAX,
  focusPlanBlockOutcomeSchema,
} from './focus-plan.js'

/**
 * LE BRIEF DU JOUR — déclencheur n°1 des méta-analyses besoins (« Digest matin
 * quotidien, 08:30, agenda + emails + relances + fins de mission ») et première
 * démonstration de l'ordre recommandé.
 *
 * Deux partis pris structurent ce contrat.
 *
 * 1. Chaque bloc porte SA propre disponibilité (`available`) et sa raison
 *    d'indisponibilité. Un brief où le bloc « messagerie » est vide parce
 *    qu'aucune boîte n'est connectée ne doit pas se lire comme « rien à faire
 *    aujourd'hui » : c'est la différence entre un produit honnête et un produit
 *    qui rassure. Le rapport le dit sous une autre forme — « si Gmail n'est pas
 *    connecté, ne pas afficher Active ».
 *
 * 2. Le brief n'invente aucune action : chaque item pointe vers un objet réel
 *    (un évènement, un fil, un compte) et vers une action déjà exécutable
 *    ailleurs dans le produit. C'est un aiguilleur, pas une couche de plus.
 */

/** Pourquoi un bloc du brief est vide. Distinguer les cas est tout l'intérêt. */
export const briefingBlockStateSchema = z.enum([
  /** Servi : la source répond et il y a (ou non) des éléments. */
  'ready',
  /**
   * Servi À MOITIÉ : une partie des sources a répondu, une autre non.
   *
   * Le cas est réel et il s'affichait comme un succès : deux agendas branchés,
   * l'un en panne côté fournisseur, l'autre vide — le brief annonçait « aucun
   * rendez-vous » à quelqu'un dont la journée était pleine dans l'agenda qui
   * n'avait pas répondu. Ni `ready` (ce serait mentir), ni `unavailable` (il y
   * a bien quelque chose à montrer) : le bloc montre ce qu'il a ET dit qu'il
   * lui manque une source.
   */
  'partial',
  /** La capacité n'est pas connectée dans cet espace. */
  'not_connected',
  /** Connectée mais la portée manque (jeton trop étroit) : reconnexion requise. */
  'missing_scope',
  /** La source a échoué maintenant — on le dit, on ne le masque pas. */
  'unavailable',
])
export type BriefingBlockState = z.infer<typeof briefingBlockStateSchema>

/**
 * UN RISQUE CRITIQUE AGRÉGÉ (#3256, BEL-SC-227.19).
 *
 * Pas un score de plus (doctrine #3249 règle 4) : un COMPTE où au moins deux
 * signaux déjà calculés ailleurs (`buildOverdueInvoices`,
 * `buildRenewalsNotEngaged`, `buildRfpsWithUncoveredRequirements`) convergent
 * — l'exemple du ticket est « deux missions du même compte en fin de contrat
 * la même semaine ». Une carte de brief individuelle raconte déjà CHAQUE
 * signal ; ce bloc dit seulement où ils se cumulent sur le MÊME compte.
 */
export const criticalRiskKindSchema = z.enum([
  /** `payment_overdue` — un impayé sur une mission du compte. */
  'financial',
  /** Mission active du compte en fenêtre de renouvellement, rien d'engagé. */
  'mission',
  /** Appel d'offres du compte avec une exigence obligatoire non couverte. */
  'contractual',
])
export type CriticalRiskKind = z.infer<typeof criticalRiskKindSchema>

export const criticalRiskSchema = z.object({
  accountId: z.string(),
  companyName: z.string(),
  /** Les genres de signaux qui convergent sur ce compte, au moins deux occurrences au total. */
  kinds: z.array(criticalRiskKindSchema),
  /** Nombre total de signaux en collision (peut compter deux fois le même genre). */
  count: z.number().int().min(2),
})
export type CriticalRisk = z.infer<typeof criticalRiskSchema>

const blockMeta = {
  state: briefingBlockStateSchema,
  /** Message court, déjà rédigé côté serveur pour les états non servis. */
  reason: z.string().nullable(),
  /**
   * #2098.9 — LA FRAÎCHEUR RÉELLE DE CETTE SOURCE, ISO 8601, ou `null`.
   *
   * `generatedAt` (racine du brief) ne dit que l'instant d'assemblage — pas
   * QUAND chaque source a répondu. `readAt` complète, PAR bloc : l'instant où
   * CETTE lecture a réussi (`ready` ou `partial`).
   *
   * `null` n'est jamais un oubli : c'est la seule valeur correcte quand la
   * source n'a pas été lue avec succès (`not_connected`, `missing_scope`,
   * `unavailable`) — l'inventer ferait la donnée fictive que la doctrine
   * interdit (CLAUDE.md « JAMAIS de données fictives »). Une source non lue
   * n'a PAS d'heure, et ce champ le dit.
   *
   * Additif et optionnel (défaut `null`) : pendant les minutes qui séparent le
   * déploiement du front de celui de l'API, un ancien payload sans ce champ
   * reste valide.
   */
  readAt: z.string().nullable().default(null),
}

export const briefingAgendaBlockSchema = z.object({
  ...blockMeta,
  events: z.array(agendaEventSchema),
  conflicts: z.array(agendaConflictSchema),
  /** Rendez-vous externes dans les 24 h : ceux qui méritent une préparation. */
  needsPreparation: z.array(agendaEventSchema),
  /**
   * #2095.12 (épopée #2993) — rendez-vous externes TERMINÉS, dans la fenêtre
   * de rattrapage, sans AUCUNE note qui porte leur `sourceEventId`
   * (`notes.existsForSourceEvent`, déjà posé par #2103.1 — jamais recalculé
   * ici). Distinct de `needsPreparation` (à VENIR) : ceux-ci sont déjà
   * passés, et c'est ce qui en fait un rendez-vous qu'on a pu oublier de
   * suivre. Sert aussi de bassin de résolution CÔTÉ ÉCRAN pour la carte
   * `meeting_no_followup` (même patron que `events`/`meeting_prep`,
   * `BriefingPage.tsx`) : ces évènements ne vivent pas dans `events`, qui
   * reste la fenêtre À VENIR affichée par `AgendaCompact`.
   *
   * Optionnel (jamais `.default()`, contrairement à `readAt` ci-dessus) :
   * `.default()` rendrait le champ OBLIGATOIRE dans le type TS inféré — chaque
   * fixture de test qui construit un `BriefingAgendaBlock` à la main (il y en
   * a des dizaines) devrait alors le porter, pour un genre de carte qu'elle ne
   * teste pas. `undefined` se lit comme `[]` côté appelant (`BriefingPage.tsx`),
   * jamais comme une valeur absente à part entière.
   */
  unfollowedMeetings: z.array(agendaEventSchema).optional(),
})
export type BriefingAgendaBlock = z.infer<typeof briefingAgendaBlockSchema>

export const briefingMailBlockSchema = z.object({
  ...blockMeta,
  /** Fils sortants restés sans réponse au-delà du seuil de silence. */
  awaitingReply: z.array(mailThreadSchema),
  /** Non lus qui viennent d'un interlocuteur externe. */
  unread: z.array(mailThreadSchema),
  /** Fils dont le dernier message entrant ressemble à un accord (à qualifier). */
  positiveReplies: z.array(mailThreadSchema),
})
export type BriefingMailBlock = z.infer<typeof briefingMailBlockSchema>

/**
 * Les TÂCHES ouvertes de l'utilisateur (T3).
 *
 * Le bloc porte les DEUX chiffres séparément — `overdueCount` et `todayCount` —
 * parce que les fondre montrerait « 7 tâches aujourd'hui » quand cinq traînent
 * depuis trois semaines : le nombre serait juste et la lecture fausse.
 *
 * `state` est ici pour la même raison que sur les autres blocs, avec une
 * différence : les tâches ne dépendent d'aucun fournisseur, donc `not_connected`
 * ne peut pas arriver. Seul `unavailable` reste possible, et il veut dire ce
 * qu'il dit — la base n'a pas répondu, ce n'est pas « tu n'as rien à faire ».
 */
export const briefingTasksBlockSchema = z.object({
  ...blockMeta,
  /** Toutes les tâches ouvertes, non filtrées par date : c'est l'écran qui
   *  range en paniers, et couper ici ferait disparaître le retard. */
  tasks: z.array(taskSchema),
  overdueCount: z.number().int().nonnegative(),
  todayCount: z.number().int().nonnegative(),
})
export type BriefingTasksBlock = z.infer<typeof briefingTasksBlockSchema>

/**
 * LA CAPACITÉ d'où vient un fait de carte — jamais le nom d'un éditeur.
 *
 * Doctrine du dépôt : on nomme « ton agenda », « ta messagerie », jamais le
 * fournisseur qui les sert (seule exception : Réglages › Intégrations, où
 * l'utilisateur autorise lui-même l'accès). Une carte de brief est de l'autre
 * côté de cette ligne : elle DIT d'où vient son fait, elle ne dit pas chez qui.
 *
 * Les quatre valeurs sont exactement les quatre sources que le brief lit
 * aujourd'hui. Elles ne se devinent pas : ajouter une carte servie par une
 * cinquième source oblige à l'ajouter ici, donc à décider comment elle se
 * nomme devant l'utilisateur.
 */
// #2107.3 — « needs » s'ajoute : les besoins ouverts sans shortlist sont une
// CINQUIÈME source que le brief lit, distincte des quatre premières. Voir
// `briefing-actions.ts` (producteur `need_stale`).
// #2095.2 — « missions » s'ajoute : une SIXIÈME source, les missions dont la
// fin approche (`missions.ends_on`). Voir `briefing-actions.ts` (producteur
// `mission_end`). #2106.8/#2107.7 réutilisent la même capacité pour les
// missions à échéance de renouvellement.
// #2095.7 — « invoices » s'ajoute : une SEPTIÈME source, les factures client en
// retard de règlement (`invoice_readiness`). Voir `briefing-actions.ts`
// (producteur `payment_overdue`).
// #2095.8 — « rfps » s'ajoute : une HUITIÈME source, les appels d'offres dont
// l'échéance approche (`rfps.due_at`). Voir `briefing-actions.ts` (producteur
// `rfp_due`).
export const BRIEFING_FACT_CAPABILITIES = [
  'agenda',
  'mailbox',
  'signals',
  'tasks',
  'needs',
  'missions',
  'invoices',
  'rfps',
  // #2107.18 — « accounts » s'ajoute : une NEUVIÈME source, la propriété d'un
  // compte (`accounts.assigned_to`). Distinct de « signals » (déjà utilisé
  // par `account` pour un mouvement DÉTECTÉ) : ici le fait porte sur une
  // colonne humaine, jamais déduite.
  'accounts',
  // #2106.9/#2107.1 (doublon, épopée #2801) — « projects » s'ajoute : une
  // DIXIÈME source, le diagnostic de pipe (`pipelineHealth`,
  // opportunity-pipeline-health.ts) sur `opportunities`/`tasks`. Distinct de
  // « needs » (`project_needs`, un rôle à staffer) : ici le fait porte sur
  // l'AFFAIRE elle-même — sa dernière étape, sa tâche encore ouverte.
  'projects',
  // #2095.41 (épopée #2993) — « contacts » s'ajoute : une ONZIÈME source, le
  // rebond d'e-mail (`contacts.email_bounced_at`, posé par le seul webhook
  // fournisseur, #2733). Distinct de « signals » (un mouvement de COMPTE
  // détecté) : ici le fait porte sur un CONTACT précis, une colonne mesurée,
  // jamais déduite.
  'contacts',
] as const
export const briefingFactCapabilitySchema = z.enum(BRIEFING_FACT_CAPABILITIES)
export type BriefingFactCapability = z.infer<typeof briefingFactCapabilitySchema>

/**
 * LA PROVENANCE d'un fait de carte — la source ET la date, jamais l'une seule.
 *
 * `source` réutilise l'échelle d'autorité de la provenance par champ
 * (`human > connector > pipeline > model`) plutôt que d'en écrire une seconde :
 * un réglage vit à un seul endroit, et deux échelles finiraient par se
 * contredire sur la même donnée.
 *
 * ⚠️ `observedAt` est NULLABLE et sans valeur par défaut. C'est le cœur du
 * contrat : une carte dont le fait n'a pas de date DIT que la date est
 * inconnue. Mettre `now` par défaut écrirait « observé aujourd'hui » sur un
 * fait dont personne ne sait quand il a été vu — c'est le même défaut que
 * rendre « 0 » pour « non mesuré », une phrase de plus loin de la vérité.
 */
export const briefingFactProvenanceSchema = z.object({
  source: fieldSourceSchema,
  capability: briefingFactCapabilitySchema,
  /** ISO 8601 de l'OBSERVATION du fait, ou `null` quand elle est inconnue. */
  observedAt: z.string().nullable(),
})

/**
 * LE FAIT qui a produit la carte, daté et sourcé.
 *
 * ⚠️ `fact` vaut `null` — en entier — quand la carte ne sait pas dire d'où
 * vient son fait. Elle n'invente pas « détecté par Bellum » : un fait sans
 * source ne s'affiche pas comme un fait, et l'écran n'affiche alors aucun
 * bandeau de provenance. C'est un aveu, pas un échec.
 *
 * ⚠️ `labelKey` vaut `null` quand le LIBELLÉ DE LA CARTE énonce déjà le fait
 * — « X n'a pas répondu depuis 9 jours » EST le fait. Le répéter dans un
 * second bloc afficherait deux fois la même phrase (loi 4 du tome 7) ; le bloc
 * ne porte alors que la provenance, qui est la seule chose neuve.
 */
export const briefingFactSchema = z.object({
  labelKey: z.string().min(1).nullable(),
  labelVars: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  provenance: briefingFactProvenanceSchema,
})
export type BriefingFact = z.infer<typeof briefingFactSchema>

/**
 * POURQUOI CETTE CARTE, MAINTENANT.
 *
 * Le contexte n'est pas un commentaire : c'est le CRITÈRE DE SÉLECTION qui a
 * fait entrer la carte dans la liste d'aujourd'hui — « rendez-vous dans moins
 * de 24 h », « silence au-delà du seuil », « signal apparu dans les 48 h ».
 * Écrit, il se conteste ; deviné, il se subit. `null` quand la carte n'a rien
 * de plus à dire que son fait.
 */
export const briefingCardContextSchema = z.object({
  labelKey: z.string().min(1),
  labelVars: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
})

/** Les formes d'objet qu'une carte peut avoir DÉJÀ prêtes. Liste fermée. */
// #2095.60 — `angle` AJOUTÉ EN FIN (GA-08) : l'angle d'attaque DÉJÀ calculé
// pour le compte de la carte (`attack_angles`, le recommandé d'abord), jamais
// un angle rédigé pour l'occasion.
export const BRIEFING_ARTIFACT_KINDS = ['draft_message', 'shortlist', 'checklist', 'angle'] as const
export const briefingArtifactKindSchema = z.enum(BRIEFING_ARTIFACT_KINDS)

/**
 * L'OBJET MÉTIER dont la carte — ou l'artefact — parle (#2095.16, #2095.17,
 * #2099.4, #2106.12).
 *
 * CINQ formes, et cinq seulement : ce sont celles qui ont VRAIMENT un
 * dossier où atterrir (`/accounts/$id`, `/contacts/$id`, `/missions/$id`,
 * `/consultants/$id`, `/projects/$id`). La liste est celle de `ObjectMention`,
 * la primitive qui rend la mention — l'écrire ici en plus large fabriquerait
 * un lien mort, ce qui est précisément ce que cette primitive refuse depuis
 * son premier jour.
 *
 * ⚠️ #2801 — `project` REJOINT la liste (29/08 : encore refusé, la fiche
 * n'existait pas — `/projects/$id` livrée par l'épopée #2801). Avant lui,
 * `kind: 'project'` était explicitement REJETÉ par
 * `daily-briefing.candidate.test.ts` : lever cette limite AVANT que la route
 * existe aurait été le lien mort exact que ce champ refuse.
 *
 * ⚠️ `name` peut être vide : l'écran dit alors « non mesuré », il n'invente pas
 * un nom. `null` sur le champ entier veut dire que la carte — ou l'artefact —
 * ne parle d'aucun objet ouvrable — un conflit d'agenda, par exemple, parle de
 * deux créneaux.
 */
export const briefingBusinessObjectSchema = z.object({
  kind: z.enum(['account', 'contact', 'mission', 'talent', 'project']),
  id: z.string().min(1),
  name: z.string().nullable(),
  /**
   * #2097.21 — LE LOGO DU COMPTE, quand la lecture le porte. `null` par
   * défaut : aucun producteur ne devine un logo, `CompanyAvatar` (web) retombe
   * alors sur le monogramme qu'il affiche déjà partout ailleurs sans logo
   * résolu — jamais un logo générique inventé pour l'occasion.
   */
  logoUrl: z.string().nullable().default(null),
  /**
   * #2097.21 (correctif) — LE SITE DU COMPTE, pour le MÊME repli favicon que
   * `/accounts` (`CompanyAvatar`, `apps/web/src/lib/company-logo.ts`).
   * Mesuré en prod le 25/09 : `logoUrl` seul ne suffit pas — c'est le logo
   * Apollo PERSISTÉ, quasi toujours vide, alors que `/accounts` retombe
   * d'abord sur le favicon RÉEL du site. Sans ce champ, une carte de brief ne
   * pouvait jamais montrer que le monogramme, même pour un compte dont le
   * site sert un favicon. `null` par défaut : jamais un domaine deviné.
   */
  website: z.string().nullable().default(null),
})

/** #2106.16 — le statut d'un artefact préparé. Liste fermée, une seule valeur
 * pour l'instant : aucun producteur ne fait encore vieillir un artefact
 * indépendamment de sa carte (la carte disparaît, l'artefact avec elle). En
 * ajouter une seconde sans producteur qui la pose serait l'état inventé que
 * la doctrine interdit — GA-26, un réglage vit à un seul endroit, ici la
 * liste fermée plutôt qu'une valeur devinée à l'écran. */
export const BRIEFING_ARTIFACT_STATUSES = ['ready'] as const
export const briefingArtifactStatusSchema = z.enum(BRIEFING_ARTIFACT_STATUSES)

/**
 * CE QUI EST DÉJÀ PRÊT sur cette carte — un brouillon, une liste courte, une
 * check-list.
 *
 * ⚠️ Un tableau VIDE veut dire « rien n'est prêt », et ce n'est PAS un échec à
 * signaler : l'écran ne montre simplement pas le bloc. Écrire « aucun élément
 * préparé » sur les cartes qui n'en ont pas ajouterait une ligne de bruit à
 * chacune des cinq cartes du matin.
 *
 * `href` est nullable pour la même raison que celui d'une carte : un artefact
 * qui n'a pas d'écran où atterrir se montre, il ne se promet pas cliquable.
 *
 * #2106.12 à #2106.19 — SEPT CHAMPS DÉDIÉS, ADDITIFS (un artefact à cinq
 * champs, écrit avant ce lot, continue de parser — voir
 * `daily-briefing.test.ts`). Chacun rend sa valeur NEUTRE par défaut, jamais
 * une donnée inventée :
 */
export const briefingArtifactSchema = z.object({
  id: z.string().min(1),
  kind: briefingArtifactKindSchema,
  labelKey: z.string().min(1),
  labelVars: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  href: z.string().min(1).nullable(),
  /** #2106.12 — l'objet métier que CET artefact concerne. `null` par défaut :
   * un artefact qui n'a pas encore de résolution d'objet (ex. la liste des
   * participants d'un rendez-vous) ne prétend viser aucun dossier. */
  businessObject: briefingBusinessObjectSchema.nullable().default(null),
  /** #2106.13 — QUAND cet artefact a été compilé, ISO 8601. Vit sur
   * l'artefact et non sur la carte (la carte a sa propre date, le `fact`) :
   * un artefact peut être régénéré alors que le fait de la carte, lui, ne
   * bouge pas. `null` quand l'instant de compilation n'est pas connu — jamais
   * l'instant de lecture posé par défaut. */
  preparedAt: z.string().nullable().default(null),
  /** #2106.14 — la version de l'artefact. Commence à 1 : la liste d'un
   * versionnage commence toujours à un, jamais à zéro (qui se lirait « non
   * versionné », la même famille de défaut que « non mesuré » rendu `0`). */
  version: z.number().int().min(1).default(1),
  /** #2106.15 — la source qui a permis de le compiler (même échelle qu'une
   * carte, `human > connector > pipeline > model`). `null` par défaut : aucune
   * source connue tant que le producteur ne la déclare pas. */
  source: fieldSourceSchema.nullable().default(null),
  /** #2106.16 — son statut, dans la liste fermée ci-dessus. */
  status: briefingArtifactStatusSchema.default('ready'),
  /** #2106.18 — qui l'a préparé. Toujours Laura : le copilote s'appelle Laura
   * partout (D82), et rien dans ce module ne fait préparer un artefact par un
   * humain. */
  preparedBy: z.literal('laura').default('laura'),
  /** #2106.19 — le coût éventuel, en crédits, d'une régénération de cet
   * artefact. `null` par défaut : la lecture qui le compile aujourd'hui
   * (`meetingAttendeesArtifact`) ne débite rien. Garde crédit : jamais
   * négatif — un coût qui descend sous zéro n'est pas un remboursement, c'est
   * une donnée corrompue. */
  creditsCost: z.number().int().min(0).nullable().default(null),
})
export type BriefingArtifact = z.infer<typeof briefingArtifactSchema>

/**
 * LES AXES DU CLASSEMENT (#2095.61 à #2095.67, étendu #2397.2).
 *
 * Ils sont NOMMÉS et jamais chiffrés. Le retour demande que chaque priorité
 * explique pourquoi elle passe avant les autres (#2095.81) et, dans la même
 * issue, qu'aucun score ni poids interne ne soit exposé comme vérité
 * (#2095.83, #2099.48). Les deux se tiennent exactement comme ceci : on dit
 * QUELS axes ont pesé, jamais COMBIEN.
 *
 * ⚠️ `dataConfidence` est un axe du classement — la confiance de la DONNÉE, qui
 * fait descendre un fait douteux (#2095.72). Ce n'est pas une chance de
 * réussite : aucune probabilité ne s'affiche dans ce produit, refusée six fois.
 */
export const BRIEFING_RANKING_AXES = [
  /** La conséquence commerciale ou financière si on ne fait rien. */
  'consequence',
  /** L'urgence RÉELLE — une échéance, pas une impression. */
  'urgency',
  /** La possibilité d'agir maintenant : un problème insoluble descend. */
  'actionableNow',
  /** L'adéquation avec le rôle et les objectifs de la personne. */
  'roleFit',
  /** La confiance de la donnée : un fait douteux ne passe pas devant un fait vérifié. */
  'dataConfidence',
  /** L'effort nécessaire. */
  'effort',
  /** L'engagement DÉJÀ pris envers un tiers — une promesse faite pèse. */
  'commitment',
  // #2397.2 — DÉPENDANCE et OPPORTUNITÉ, deux des dix axes du corps de
  // l'issue #2397 (§AXES DE PRIORISATION) qu'aucun des sept ci-dessus ne
  // nommait. Ajoutés EN FIN (GA-08). Aucune catégorie ne les marque encore
  // `evaluated` — ni `briefing-actions.ts` ne trace de dépendance entre
  // actions, ni son seul signal de mouvement favorable n'est `verified`
  // (`account`, confiance `inferred`) : ils restent NOMMÉS, non évalués,
  // jusqu'au calcul qui saura vraiment les peser.
  /** Une autre action attend-elle celle-ci avant de pouvoir avancer ? */
  'dependency',
  /** Un mouvement favorable VÉRIFIÉ — jamais une inférence présentée comme telle. */
  'opportunity',
] as const
export const briefingRankingAxisSchema = z.enum(BRIEFING_RANKING_AXES)

/**
 * CE QU'ON A PU DIRE D'UN AXE — et le mot qui compte est `evaluated`.
 *
 * `false` ne veut pas dire « axe nul » : il veut dire que la donnée ne permet
 * pas de l'évaluer. L'axe reste NOMMÉ à l'écran et sort du dénominateur
 * (GA-18 / GA-19). C'est la différence entre « cette carte passe devant sur
 * deux axes sur deux » et « sur deux axes sur sept », qui ne racontent pas la
 * même histoire du tout.
 */
export const briefingRankingAxisReadingSchema = z.object({
  axis: briefingRankingAxisSchema,
  evaluated: z.boolean(),
})
export type BriefingRankingAxisReading = z.infer<typeof briefingRankingAxisReadingSchema>

/**
 * LE VERDICT D'UN JEU D'AXES — nommés d'un côté, non évaluables de l'autre.
 *
 * ⚠️ `denominator` vaut `null`, jamais `0`, quand aucun axe n'a pu être
 * évalué. Un « 0/7 » se lit « cette carte ne vaut rien » ; la vérité est « je
 * n'ai rien pu mesurer », et les deux phrases mènent à des gestes opposés.
 *
 * Les doublons sont écrasés : une liste servie deux fois le même axe ne doit
 * pas gonfler le dénominateur — un dénominateur qui grandit sans que rien de
 * neuf soit mesuré est la forme la plus discrète du chiffre faux.
 */
export function briefingRankingAxesVerdict(readings: readonly BriefingRankingAxisReading[]): {
  evaluated: BriefingRankingAxis[]
  unevaluable: BriefingRankingAxis[]
  denominator: number | null
} {
  const seen = new Map<BriefingRankingAxis, boolean>()
  for (const reading of readings) {
    seen.set(reading.axis, (seen.get(reading.axis) ?? false) || reading.evaluated)
  }
  const evaluated: BriefingRankingAxis[] = []
  const unevaluable: BriefingRankingAxis[] = []
  for (const axis of BRIEFING_RANKING_AXES) {
    const reading = seen.get(axis)
    if (reading === undefined) continue
    if (reading) evaluated.push(axis)
    else unevaluable.push(axis)
  }
  return { evaluated, unevaluable, denominator: evaluated.length > 0 ? evaluated.length : null }
}
export type BriefingRankingAxis = z.infer<typeof briefingRankingAxisSchema>

/**
 * LE NIVEAU DE CONFIANCE de ce que la carte affirme (#2095.29, #2099.11).
 *
 * Trois niveaux nommés, et surtout PAS un pourcentage : « 82 % de confiance »
 * est un chiffre qu'on ne peut ni vérifier ni contredire, et qui se lit comme
 * une probabilité de réussite — refusée six fois dans ce produit.
 *
 *  - `verified` : vu dans une source qui fait foi (un connecteur, un humain) ;
 *  - `reported` : rapporté par une source qui ne fait pas foi ;
 *  - `inferred` : déduit par nous, et donc à confirmer.
 */
export const BRIEFING_CONFIDENCE_LEVELS = ['verified', 'reported', 'inferred'] as const
export const briefingConfidenceSchema = z.enum(BRIEFING_CONFIDENCE_LEVELS)

/**
 * LES NEUF ÉTATS DE TRAITEMENT d'une priorité (#2099.33 à #2099.41).
 *
 * ⚠️ `seen` et `done` sont deux états, pas un : « une priorité n'est pas
 * terminée juste parce qu'on l'a ouverte » (#2099.42). Les fondre ferait
 * disparaître de la journée tout ce qu'on a consulté sans traiter — c'est-à-dire
 * exactement ce qu'il faut revoir.
 *
 * `dismissed` (refusée) et `obsolete` (le fait n'est plus vrai) sont également
 * distincts : le premier est une DÉCISION de la personne, qui doit être
 * respectée (#2099.52) ; le second est un fait du monde, qui laisse une trace
 * (#2099.53).
 */
export const BRIEFING_CANDIDATE_PROCESSING_STATES = [
  'suggested',
  'seen',
  'prepared',
  'awaiting_validation',
  'scheduled',
  'done',
  'postponed',
  'dismissed',
  'obsolete',
] as const
export const briefingCandidateProcessingStateSchema = z.enum(BRIEFING_CANDIDATE_PROCESSING_STATES)

/**
 * Combien de cartes le moteur CLASSE, et combien l'écran REND d'emblée.
 *
 * Deux nombres et non un : le classement est une décision de tri, l'affichage
 * une décision de lecture. Sept classées, trois rendues d'emblée, le reste
 * derrière un dépli qui DIT combien il cache. Les deux vivent ici parce que
 * l'API et l'app web en ont besoin ensemble — un plafond recopié des deux
 * côtés diverge le jour où l'un des deux bouge.
 *
 * ⚠️ Le plafond est un MAXIMUM, jamais une cible : on ne complète pas la liste
 * jusqu'à sept pour faire joli. S'il y a trois actions, il y en a trois.
 *
 * #2095.78 — `SHOWN` est descendu de 5 à 3 : classer davantage en backend
 * (`MAX` inchangé) et n'en montrer que trois d'emblée, le reste restant
 * derrière le dépli existant plutôt que d'être jeté.
 */
export const BRIEFING_ACTIONS_MAX = 7
export const BRIEFING_ACTIONS_SHOWN = 3

/**
 * Les quatre champs qu'une carte a gagnés — la liste que la parité démo
 * interrogera.
 *
 * Elle existe parce que ces champs n'ajoutent AUCUNE table : la garde de
 * couverture démo, qui raisonne par table, ne les verrait jamais passer. Un
 * cinquième champ ajouté au contrat sans être classé « seedé » ou « vide à
 * dessein » fait donc rougir `demo-briefing-card-coverage.spec.ts` — c'est
 * exactement le silence que la craft rule n°9 existe pour rompre.
 */
export const BRIEFING_CARD_FIELDS = [
  'fact',
  'context',
  'preparedArtifacts',
  'expiresAt',
  // #2095 / #2099 — les sept facettes du contrat canonique de candidat. Elles
  // sont ici pour la MÊME raison que les quatre premières : elles n'ajoutent
  // aucune table, donc la garde de couverture démo ne les verrait jamais
  // passer, et une fondation invisible en démo est une fondation que personne
  // ne remplit.
  'businessObject',
  'verdict',
  'consequence',
  'confidence',
  'estimatedMinutes',
  'rankingAxes',
  'processingState',
  // #2095.19 / #2095.34 / #2993 — les deux derniers champs du contrat des 23 :
  // `owner` (toujours le lecteur, le brief reste individuel) et `permission`
  // (dérivée du catalogue des écrans pour l'écran que la carte ouvre). Le seul
  // champ des 23 qui reste hors de cette liste est `coût éventuel` (#2095.35) :
  // arbitrage Louis 31/10 (c132, crédits implicites) — jamais visible côté
  // client, il ne voyage donc pas sur la carte.
  'owner',
  'permission',
] as const

// #2107.3 — `need_stale` : un besoin ouvert depuis plus de cinq jours, sans
// shortlist. Doublon de #2106.7 (« Besoin ouvert : shortlist consultants ») —
// les deux se livrent ici, avec la même preuve.
//
// #2397.7 — nommé à part (GA-26, un réglage vit à un seul endroit) : le retour
// utilisateur (`briefing-role-fit.ts`) se scope sur CE jeu de valeurs, jamais
// une copie qui pourrait diverger de l'énumération réelle des cartes.
export const BRIEFING_ACTION_KINDS = [
  'meeting_prep',
  'follow_up',
  'reply',
  'account',
  'mission_end',
  'conflict',
  'task',
  'need_stale',
  // #2095.7 — un paiement client en retard de règlement.
  'payment_overdue',
  // #2095.8 — un appel d'offres dont l'échéance approche.
  'rfp_due',
  // #2106.6 — un consultant dont TOUTES les affectations en cours finissent
  // sous peu (même fenêtre que `consultantsFreeingSoon`, laura-probe.service.ts).
  'consultant_available',
  // #2107.6 — une disponibilité saisie il y a plus de 60 jours, jamais
  // reconfirmée depuis (routine déjà existante, `talent-routines.service.ts`).
  'availability_reconfirm',
  // #2107.8 — une mission ACTIVE sans date de fin : `mission_end` l'EXCLUT
  // explicitement (`ends_on IS NOT NULL`), elle ne peut donc jamais y
  // apparaître. Sans ce genre distinct, une mission sans date reste invisible
  // du brief pour toujours, jamais parce que tout va bien.
  'mission_no_end_date',
  // #2107.15 — un connecteur CONNECTÉ mais DÉGRADÉ (droit d'écriture retiré) :
  // les routines qui en dépendent se désactivent en silence, aucune n'alerte
  // sur la panne elle-même avant ce lot.
  'connector_broken',
  // #2107.10 — une mission entre dans sa fenêtre de renouvellement
  // (#2106.8/#2107.7) ET aucune conversation n'a été engagée
  // (`renewal_status IS NULL OR 'non_engage'`) : un fait DISTINCT de
  // `mission_end`, plus actionnable — même échéance, rien n'a commencé.
  'renewal_not_engaged',
  // #2107.4 — un profil envoyé chez un client (`submissions.substatus =
  // 'presented'`) sans AUCUN retour (`first_feedback_at IS NULL`) depuis
  // plus de N jours — la fiche du consultant s'ouvre.
  'submission_no_response',
  // #2107.14 — un appel d'offres porte au moins une exigence OBLIGATOIRE non
  // couverte (`computeRfpCompliance(requirements).mandatoryUnanswered > 0`,
  // fonction pure déjà utilisée côté écran). Même famille que `rfp_due` :
  // aucun dossier PAR appel d'offres n'existe, la carte ouvre la liste.
  'rfp_requirement_gap',
  // #2107.18 — un compte ACTIF (`commercial_status <> 'archived'`) sans
  // propriétaire assigné (`accounts.assigned_to IS NULL`) : une zone blanche
  // au sens de `ManagerService.coverageMap` (agrégée par segment), ici portée
  // au niveau INDIVIDUEL — un compte précis, ouvrable.
  'account_no_owner',
  // #2106.9/#2107.1 (doublon, épopée #2801) — une affaire EN JEU
  // (`TRIAGED_STAGES`) sans AUCUNE tâche encore ouverte qui lui soit
  // rattachée (`pipelineHealth`, raison `without_next_action` — la MÊME
  // lecture que la carte du pipe, #1325, jamais recalculée). Bloqué jusqu'à
  // #2801 : sans `/projects/$id`, la carte n'avait aucun dossier où ouvrir.
  'project_no_next_action',
  // #2107.2 (épopée #2801) — une affaire EN JEU dont la fraîcheur
  // (`pipelineHealth`, raisons `ageing`/`stale` — la MÊME lecture que la carte
  // du pipe, jamais recalculée) a dépassé le seuil de fraîcheur de
  // l'ontologie (`opportunityFreshness`, `opportunity-ontology.ts`). Même
  // fondation que `project_no_next_action` juste au-dessus : bloqué jusqu'à
  // #2801, débloqué avec lui.
  'project_stale',
  // #2107.9 — le CRA du mois précédent manque sur une mission ACTIVE
  // (`buildTimesheetLine`, `../delivery/timesheet-view` — statut `missing`).
  'cra_missing',
  // #2107.11 — le mois précédent est prêt à facturer (`assessInvoiceReadiness`,
  // `@bellum/contracts` — `state === 'ready'`, aucun bloqueur restant).
  'invoice_ready',
  // #2107.16 — la porte « prêt à facturer » (`assessInvoiceReadiness`) bloque
  // pour une DONNÉE MANQUANTE sur l'objet — jamais un statut de relevé, déjà
  // porté par `cra_missing`.
  'invoicing_blocked_missing_data',
  // #2095.41 (épopée #2993) — un contact CONNU dont le dernier e-mail a
  // REBONDI (`contacts.email_bounced_at IS NOT NULL`, posé par le seul
  // webhook fournisseur, #2733) : la première famille CONTACTS du brief, sa
  // fiche s'ouvre directement (`/contacts/:id`, #2158).
  'contact_bounced',
  // #2095.12 (épopée #2993) — un rendez-vous externe TERMINÉ dans la fenêtre
  // de rattrapage sans AUCUNE note qui porte son `sourceEventId`. Distinct de
  // `meeting_prep` : celui-là prépare un rendez-vous À VENIR, celui-ci
  // rattrape un rendez-vous déjà passé sans suite écrite.
  'meeting_no_followup',
  // #2095.6 — la porte « prêt à facturer » bloque pour une AUTRE raison qu'une
  // donnée manquante (déjà `invoicing_blocked_missing_data`) ou qu'un CRA
  // absent (déjà `cra_missing`) : relevé non soumis, non validé, contesté,
  // rejeté, anomalies, écart inexpliqué, bon de commande hors période, contrat
  // inactif — les autres codes de `INVOICE_BLOCKERS`.
  'invoice_blocked',
  // #2095.10 / #2107.16 / #2095.49 — famille QUALITÉ DES DONNÉES : une donnée
  // CRITIQUE manquante sur un objet du portefeuille, lue par une règle
  // générique (`BRIEFING_CRITICAL_FIELDS` ci-dessous), jamais un champ deviné.
  'critical_data_missing',
  // #2095.45 — famille MISSIONS : une mission qui DÉMARRE (`started_on` dans
  // la fenêtre de démarrage).
  'mission_starting',
  // #2095.45 — famille MISSIONS : un avenant envoyé, en attente de signature
  // (`mission_documents.kind = 'amendment'`, statut `sent`/`pending`).
  'mission_amendment_pending',
  // #2095.41 — famille CONTACTS, au-delà du rebond : un contact passé
  // `historique` (n'est plus en poste) — la relation est à reprendre.
  'contact_left',
] as const
export const briefingActionKindSchema = z.enum(BRIEFING_ACTION_KINDS)

/**
 * #2095.10 / #2107.16 / #2095.49 — LES DONNÉES CRITIQUES, une liste FERMÉE.
 *
 * « Donnée critique manquante » n'est pas un champ vide quelconque : c'est un
 * champ dont l'absence EMPÊCHE un geste qui suit. Chaque entrée nomme le geste
 * qu'elle bloque — sans lui, ce n'est pas critique, c'est de l'hygiène, et
 * l'hygiène vit sur les fiches (`data-hygiene.ts`), pas dans le brief.
 *
 *  - `mission_consultant` : une mission ACTIVE sans AUCUNE affectation en cours
 *    — ni CRA, ni facture, ni fin de mission ne peuvent se calculer ;
 *  - `billing_contact_email` : l'interlocuteur de facturation d'une mission
 *    ACTIVE n'a pas d'e-mail — la facture préparée n'a nulle part où partir.
 *
 * Les cinq bloqueurs « donnée manquante » de la porte de facturation restent
 * portés par `invoicing_blocked_missing_data` (#2107.16) : jamais deux cartes
 * pour le même manque. Ajout EN FIN seulement (GA-08).
 */
export const BRIEFING_CRITICAL_FIELDS = ['mission_consultant', 'billing_contact_email'] as const
export type BriefingCriticalField = (typeof BRIEFING_CRITICAL_FIELDS)[number]
export type BriefingActionKind = z.infer<typeof briefingActionKindSchema>

/** Une action que Bellum sait déjà exécuter, proposée en tête de journée. */
export const briefingActionSchema = z.object({
  id: z.string().min(1),
  /** Clé de libellé i18n — le serveur ne renvoie pas de copy figée. */
  labelKey: z.string().min(1),
  /** Valeurs d'interpolation du libellé (nom de compte, nombre, date…). */
  labelVars: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  /**
   * Route SPA à ouvrir, ou `null` quand l'action n'a pas d'écran où atterrir.
   *
   * Nullable et non « une route par défaut » : une action qui pointe vers une
   * page inexistante ouvre « Page introuvable », et une action qui pointe vers
   * l'écran qu'on est déjà en train de lire ne fait rien au clic. Les deux se
   * lisent comme une panne. Une action sans destination est affichée comme un
   * constat — c'est ce qu'elle est.
   */
  href: z.string().min(1).nullable(),
  kind: briefingActionKindSchema,
  /** Rang de priorité, 1 = le plus urgent. */
  priority: z.number().int().min(1),

  // ───────────────────────────────────────────────────────────────────────
  // CE QUE LA CARTE DISAIT, ET CE QU'ELLE NE DISAIT PAS
  // ───────────────────────────────────────────────────────────────────────
  // Une carte portait six champs : un identifiant, une phrase, une
  // destination, un genre, un rang. Elle ne disait NI quel fait l'a produite,
  // NI d'où ce fait vient, NI ce qui est déjà préparé, NI quand le fait cesse
  // d'être vrai. Le commercial lisait « Vinci a bougé cette semaine » sans
  // pouvoir répondre à la seule question qui décide s'il agit : d'où sors-tu
  // ça, et de quand ?
  //
  // Les quatre champs ci-dessous sont ADDITIFS — aucun des six n'est retiré,
  // aucun n'est rendu obligatoire. Une charge utile écrite avant eux parse
  // toujours, et rend l'absence : `null`, `null`, `[]`, `null`. C'est voulu :
  // une carte qui ne peut rien remplir est un aveu utile, pas une panne.
  /**
   * LE FAIT qui a produit la carte, daté et sourcé — `null` quand la carte ne
   * sait pas dire d'où vient son fait. Elle n'invente alors pas de source.
   */
  fact: briefingFactSchema.nullable().default(null),
  /** POURQUOI cette carte, maintenant — le critère qui l'a fait entrer. */
  context: briefingCardContextSchema.nullable().default(null),
  /** Ce qui est DÉJÀ prêt. Vide = l'écran ne montre pas le bloc, pas un échec. */
  preparedArtifacts: z.array(briefingArtifactSchema).default([]),
  /**
   * QUAND le fait cesse d'être vrai (ISO 8601), ou `null`.
   *
   * `null` ne veut pas dire « jamais » : il veut dire que rien, dans la
   * donnée, ne permet de dater la fin du fait. Un silence de neuf jours ne
   * cesse pas d'être vrai ; un rendez-vous à préparer, si — à l'heure où il
   * commence. On date ce qui se date, on laisse `null` le reste, et on ne
   * pose surtout pas une échéance plausible.
   */
  expiresAt: z.string().nullable().default(null),

  // ───────────────────────────────────────────────────────────────────────
  // #2095 / #2099 — LE CONTRAT CANONIQUE DU CANDIDAT DU JOUR
  // ───────────────────────────────────────────────────────────────────────
  // #2095.13 demande « un contrat canonique de candidat quotidien » et en
  // liste les champs ; #2099 demande que la CARTE sache les dire. Les deux
  // décrivent le même objet, et cet objet est celui que l'écran rend déjà :
  // un second schéma de vingt-trois champs à côté de celui-ci aurait donné
  // deux vérités pour une carte, dont une seule servie.
  //
  // Les sept champs ci-dessous sont ADDITIFS, comme les quatre précédents :
  // une charge utile écrite avant eux parse toujours et rend l'absence. Un
  // champ absent ne fait AUCUNE ligne à l'écran — sauf les axes, qui restent
  // NOMMÉS même non évaluables (les deux moitiés de la même doctrine).
  /** #2099.4 — L'OBJET dont la carte parle, quand il a un dossier à ouvrir. */
  businessObject: briefingBusinessObjectSchema.nullable().default(null),
  /** #2099.6 — LE VERDICT : ce qu'il faut retenir, en une phrase. */
  verdict: briefingCardContextSchema.nullable().default(null),
  /** #2099.7 — LA CONSÉQUENCE MÉTIER si on ne fait rien. Jamais une menace vague. */
  consequence: briefingCardContextSchema.nullable().default(null),
  /** #2099.11 — LA CONFIANCE, en niveau nommé. Jamais un pourcentage. */
  confidence: briefingConfidenceSchema.nullable().default(null),
  /**
   * #2099.12 — LE TEMPS ESTIMÉ, en minutes.
   *
   * `positive()` refuse `0` : une carte qui coûte zéro minute n'existe pas, et
   * « 0 min » est la forme la plus courte de « non mesuré » affiché comme un
   * chiffre (GA-18). Non mesuré reste `null`, et l'écran n'écrit pas la ligne.
   */
  estimatedMinutes: z.number().int().positive().nullable().default(null),
  /** #2095.61-67 — LES AXES qui ont pesé. Nommés, jamais chiffrés. */
  rankingAxes: z.array(briefingRankingAxisReadingSchema).default([]),
  /** #2099.33-41 — OÙ EN EST cette priorité. « Suggérée » par défaut : c'est ce
   *  qu'elle est quand personne ne l'a encore touchée. */
  processingState: briefingCandidateProcessingStateSchema.default('suggested'),
  /**
   * #2095.19 / #2993 — QUI ce candidat regarde, en identifiant d'utilisateur.
   *
   * Le brief reste STRICTEMENT individuel (doctrine `c76_role_reordonne_
   * jamais_ne_filtre`, Louis 21/09/2026) : `owner` vaut donc TOUJOURS le
   * lecteur du brief, jamais un tiers — une vue d'équipe agrégée n'est pas
   * différée, elle est REFUSÉE. Le champ existe pour que le contrat du
   * candidat soit complet sans qu'on invente une vue qu'on ne construit pas.
   * `null` seulement quand l'appelant ne connaît pas encore le lecteur
   * (aucune carte de production n'est dans ce cas).
   */
  owner: z.string().min(1).nullable().default(null),
  /**
   * #2095.34 / #2993 — LA PERMISSION requise pour agir sur cette carte, au-delà
   * de celle du lecteur, ou `null` quand aucune n'est requise.
   *
   * #2095.34 (L1, 31/10/2026) — DÉRIVÉE, jamais déclarée à la main : c'est la
   * permission que le catalogue des écrans (`routeContractFor`,
   * `product-screens-catalog.ts`) exige pour l'écran que la carte ouvre
   * (`href`). Plusieurs permissions = « l'UNE suffit », même sémantique que
   * `requiredPermission` du catalogue et que `@RequirePermission` côté
   * serveur. `null` = l'écran n'exige aucun droit distinct (ou la carte
   * n'ouvre rien) — une valeur SUE, lue au catalogue, jamais un défaut.
   */
  permission: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .nullable()
    .default(null),
})
export type BriefingAction = z.infer<typeof briefingActionSchema>

/**
 * #2105.53 — L'IDENTITÉ STABLE d'une carte, pour la comparer à une tâche déjà
 * transformée SANS jamais traduire : le serveur n'a pas de dictionnaire de
 * traduction (voir `briefing-labels.spec.ts`, apps/api) et ne doit pas en
 * gagner un pour cette seule comparaison — le texte affiché varie avec la
 * langue du lecteur, cette clé non. Même priorité que `briefingActionHeadline`
 * (apps/web, `action-task-transform.ts`) qui construit le TEXTE à partir des
 * deux mêmes champs : le fait l'emporte sur la carte quand il en porte un.
 *
 * Les variables entrent dans la clé, triées pour une sérialisation stable
 * indépendante de l'ordre d'écriture : deux cartes du même genre mais sur un
 * fait différent (deux RFP « à répondre bientôt » distincts du même compte)
 * ne doivent pas se confondre l'une avec l'autre.
 */
export function briefingActionSourceKey(action: Pick<BriefingAction, 'labelKey' | 'labelVars' | 'fact'>): string {
  const labelKey = action.fact?.labelKey ?? action.labelKey
  const labelVars = action.fact?.labelKey ? action.fact.labelVars : action.labelVars
  const sortedVars = Object.keys(labelVars)
    .sort()
    .map(key => `${key}=${String(labelVars[key])}`)
    .join('&')
  return `${labelKey}?${sortedVars}`
}

/**
 * #2397.2 — LE POIDS D'UNE CARTE, jamais exposé.
 *
 * DÉPLACÉ depuis `apps/api/.../briefing-actions.ts` (#2095.81, #2993) : la web
 * en a besoin pour EXPLIQUER un rang (« pourquoi celle-ci passe devant la
 * suivante »), et une seconde formule écrite côté web aurait fini par
 * diverger de celle qui décide réellement le tri (GA-26) — même raison que
 * `briefingRankingAxesVerdict` juste au-dessus, qui vit ici pour la même
 * cause. `briefing-actions.ts` réexporte `compareBriefingActions` telle
 * quelle : son tri ne change pas d'une virgule.
 *
 * Somme, sur les SEULS axes `evaluated: true`, de leur place dans
 * `BRIEFING_RANKING_AXES` (le premier axe déclaré — la conséquence
 * commerciale — pèse le plus) : un ordre déjà écrit et documenté au contrat,
 * jamais un chiffre neuf inventé pour ce calcul. Un axe non mesurable NOMMÉ
 * mais `evaluated: false` ne contribue rien — même règle que
 * `briefingRankingAxesVerdict` (l'affichage), ici appliquée au tri.
 *
 * ⚠️ Ce nombre ne quitte JAMAIS cette fonction : il ne rejoint ni le contrat
 * ni la réponse API (#2095.83, « aucun score interne exposé ») — seuls les
 * axes NOMMÉS (`rankingAxes`) le sont, exactement comme avant.
 */
function rankingWeight(axes: readonly BriefingRankingAxisReading[]): number {
  return axes.reduce((total, reading) => {
    if (!reading.evaluated) return total
    const index = BRIEFING_RANKING_AXES.indexOf(reading.axis)
    return total + (BRIEFING_RANKING_AXES.length - index)
  }, 0)
}

/**
 * #2095.72 — LA FIABILITÉ DU FAIT, AVANT LE NOMBRE D'AXES PESÉS.
 *
 * `verified` (0) < `reported` (1) < `inferred` (2) : l'ordre de
 * `BRIEFING_CONFIDENCE_LEVELS`, jamais un chiffre neuf inventé pour ce calcul
 * (même règle que `rankingWeight`). Une confiance ABSENTE (`null`, ou le champ
 * omis par un appelant qui ne la porte pas encore) vaut `verified` : la
 * doctrine punit une donnée SUE douteuse, jamais une donnée dont on ignore
 * simplement la fiabilité — ce serait inventer une méfiance que rien n'affirme.
 */
function confidenceRank(confidence: BriefingAction['confidence'] | undefined): number {
  if (confidence === null || confidence === undefined) return 0
  return BRIEFING_CONFIDENCE_LEVELS.indexOf(confidence)
}

/**
 * #2397.2 — LE COMPARATEUR DU BRIEF.
 *
 * `priority` garde le dernier mot — « ce qui a une heure passe avant ce qui
 * n'en a pas » (#2095) reste la règle première, inchangée. À priorité ÉGALE
 * seulement, les axes RÉELLEMENT pesés pour CETTE carte départagent — c'est
 * la seule chose qui manquait : `BRIEFING_RANKING_AXES` n'alimentait avant
 * ce commit AUCUN calcul, seulement l'affichage (« quels axes ont pesé »).
 */
export function compareBriefingActions(
  a: Pick<BriefingAction, 'priority' | 'rankingAxes'> & Partial<Pick<BriefingAction, 'confidence'>>,
  b: Pick<BriefingAction, 'priority' | 'rankingAxes'> & Partial<Pick<BriefingAction, 'confidence'>>,
): number {
  return (
    a.priority - b.priority ||
    confidenceRank(a.confidence) - confidenceRank(b.confidence) ||
    rankingWeight(b.rankingAxes) - rankingWeight(a.rankingAxes)
  )
}

/**
 * #2095.81 / #2993 — « CHAQUE PRIORITÉ EXPLIQUE POURQUOI ELLE PASSE AVANT LES
 * AUTRES », tranché sans Louis sur la PORTÉE : la carte SUIVANTE dans le
 * classement, jamais toutes les autres — comparer contre chacune des six
 * suivantes répéterait la même poignée d'axes six fois pour une seule carte,
 * sans rien ajouter que la première comparaison ne dise déjà.
 *
 * MÊME comparateur que le tri réel (`compareBriefingActions`) : jamais une
 * seconde règle qui pourrait décider un ordre différent de celui affiché.
 *  - la carte suivante a un rang de priorité DIFFÉRENT → `'priority'` (la
 *    règle première, #2095, jamais contournée par les axes) ;
 *  - à priorité égale, une confiance DIFFÉRENTE → `'confidence'` (#2095.72) ;
 *  - à priorité et confiance égales, les axes ÉVALUÉS sur cette carte que la
 *    suivante n'a PAS pu évaluer → `'axes'`, NOMMÉS jamais chiffrés (même
 *    doctrine que `rankingAxes`, #2095.83).
 *
 * `null` pour la DERNIÈRE carte (rien à comparer) et pour deux cartes
 * VRAIMENT à égalité (aucun des trois critères ne diffère) : l'ordre entre
 * les deux est alors stable mais arbitraire, et l'affirmer serait la donnée
 * inventée que la doctrine interdit.
 */
export type BriefingDominationReason =
  { kind: 'priority' } | { kind: 'confidence' } | { kind: 'axes'; axes: BriefingRankingAxis[] } | null

export function explainBriefingDomination(
  sorted: readonly (Pick<BriefingAction, 'priority' | 'rankingAxes'> & Partial<Pick<BriefingAction, 'confidence'>>)[],
): BriefingDominationReason[] {
  return sorted.map((card, index) => {
    const next = sorted[index + 1]
    if (!next) return null
    if (card.priority !== next.priority) return { kind: 'priority' }
    if (confidenceRank(card.confidence) !== confidenceRank(next.confidence)) return { kind: 'confidence' }
    if (rankingWeight(card.rankingAxes) === rankingWeight(next.rankingAxes)) return null
    const nextEvaluated = new Set(next.rankingAxes.filter(reading => reading.evaluated).map(reading => reading.axis))
    const axes = card.rankingAxes
      .filter(reading => reading.evaluated && !nextEvaluated.has(reading.axis))
      .map(reading => reading.axis)
    return { kind: 'axes', axes }
  })
}

/**
 * #2147.5 (épopée #2785) — LA CARTE DE SUIVI D'UN JOB EN COURS, LES NEUF
 * CHAMPS NOMMÉS PAR LE TICKET (titre, étape actuelle, progression réelle,
 * coût réservé, durée estimée, résultats intermédiaires, validations
 * attendues, bouton ouvrir, bouton annuler).
 *
 * ⚠️ CORRECTIF (26/09 soir) — les trois nuits précédentes ont cherché un
 * modèle de job unifié sous des noms littéraux (« job métier », `BusinessJob`,
 * `JobMetier`) qui n'existent en effet nulle part, et ont conclu à un système
 * absent. Il existe pourtant, sous UN AUTRE NOM : `LauraJob` (#2276,
 * `packages/contracts/src/schemas/laura-job.ts`) — la fiche `workflow_runs.job`
 * porte déjà les seize champs de #2147.1/.3/.4 et les dix états Brouillon→
 * Obsolète (#2276.22-.31). CLAUDE.md le nommait déjà : « chercher l'APPELANT,
 * pas seulement la fonction ». Cette carte lit maintenant DEUX types de job
 * réels — l'analyse de compte (`analysis_runs`, `kind: 'account_analysis'`) ET
 * le job composite de Laura (`kind: 'laura_job'`) — au lieu d'un seul, sans
 * jamais inventer un champ que son type de job ne porte pas : `null` reste
 * `null` (doctrine : « on n'affiche pas ce qu'on n'a pas »).
 *
 * L'enveloppe de contexte à 18 champs (#2147.9/.10) reste, elle, absente comme
 * TYPE UNIQUE — un besoin distinct (voir `surface-context-contract.ts`), non
 * traité ici.
 */
export const jobTrackingCardSchema = z.object({
  id: z.string(),
  /** Le type de job réel derrière la carte — décide ce que l'écran sait en faire (ouvrir, annuler). */
  kind: z.enum(['account_analysis', 'laura_job']),
  /** Titre du job — le compte en cours d'analyse, ou l'intention du job composite. */
  title: z.string(),
  /** Étape actuelle, en langage lisible (« Analyse en cours », ou le libellé de l'étape en cours). */
  currentStepLabel: z.string(),
  /**
   * #3666 (Louis 13/10, « étapes, pas de % ») — les étapes TERMINÉES du job sur
   * ses étapes réelles, ou `null` quand ce type de job n'en mesure pas. Jamais
   * un pourcentage : l'écran dit « 1 étape sur 2 terminée ».
   */
  progressSteps: z
    .object({ done: z.number().int().min(0), total: z.number().int().min(1) })
    .nullable()
    .default(null),
  /** Coût en CRÉDITS encore réservé sur ce job — jamais des euros (la grille facture en crédits). */
  reservedCredits: z.number().int().min(0).nullable().default(null),
  estimatedDurationMinutes: z.number().nullable().default(null),
  intermediateResults: z.array(z.string()).nullable().default(null),
  pendingValidations: z.array(z.string()).nullable().default(null),
  /** Où le bouton « ouvrir » emmène. */
  openHref: z.string(),
  /** `true` quand un bouton « annuler » existe réellement pour ce job. */
  cancelable: z.boolean().default(false),
})
export type JobTrackingCard = z.infer<typeof jobTrackingCardSchema>

export const dailyBriefingSchema = z.object({
  /** Jour couvert, `YYYY-MM-DD` dans le fuseau de l'utilisateur. */
  date: z.string(),
  timeZone: z.string(),
  /** Prénom de l'utilisateur, pour le tutoiement de l'interface. Null si inconnu. */
  firstName: z.string().nullable(),
  agenda: briefingAgendaBlockSchema,
  mail: briefingMailBlockSchema,
  tasks: briefingTasksBlockSchema,
  /**
   * #2101.13 — LE TEMPS PROTÉGÉ de cette personne (`protected-time.ts`),
   * réglé dans Réglages › Mémoire de Laura, ou `null` tant qu'elle ne l'a pas
   * choisi. Additif et optionnel (défaut `null`) : un ancien payload sans ce
   * champ, pendant la fenêtre de déploiement, reste valide — même garde que
   * `readAt` plus bas.
   */
  protectedTime: protectedTimeSchema.nullable().default(null),
  /**
   * #2101.17 — les préférences d'agenda de cette personne, AU-DELÀ du seul
   * temps protégé (`agenda-preferences.ts`) : combien de minutes lui faut un
   * dossier, combien de créneaux garder en réserve. Chaque champ est
   * indépendant et facultatif — absent, le calcul de capacité garde son
   * défaut global (`agenda-compact.ts`), jamais une valeur devinée ici.
   * Additif comme `protectedTime` : un ancien payload sans ce champ reste
   * valide.
   */
  agendaPreferences: agendaPreferencesSchema.partial().default({}),
  /** Comptes suivis qui ont bougé depuis hier (signaux frais). */
  accountsToWatch: z.array(
    z.object({
      accountId: z.string(),
      companyName: z.string(),
      reasonKey: z.string(),
      href: z.string(),
      /**
       * QUAND le signal a été repéré (ISO 8601), ou `null` quand la date est
       * illisible. La ligne disait « Nouveau signal détecté » — une phrase qui
       * affirme qu'un signal EXISTE sans jamais dire lequel ni de quand, donc
       * une phrase qu'on ne peut ni vérifier ni contredire. Avec la date, elle
       * redevient un fait ; sans elle, l'écran DIT que la date est inconnue et
       * ne met surtout pas aujourd'hui.
       */
      detectedAt: z.string().nullable().default(null),
      /**
       * `false` pour les lignes issues du backfill : on sait seulement que le
       * signal était DÉJÀ là à cette date, pas qu'il y est apparu. L'écran dit
       * alors « suivi depuis », jamais « repéré le » — la même distinction que
       * `signal_history.first_detection_exact`, d'où la valeur vient.
       */
      detectionExact: z.boolean().default(true),
      /**
       * #2107.28 — CE QUI a bougé (« Levée de fonds Série B »), pas seulement
       * quand. `null` quand la matérialisation du signal n'a rien écrit —
       * jamais une phrase de repli inventée.
       */
      signalLabel: z.string().nullable().default(null),
      /**
       * #2107.33 — « la raison pour laquelle cela concerne cette ESN ». La
       * lecture commerciale (`sales_implication`) que l'analyse a déjà écrite
       * SUR CE SIGNAL précis — jamais une phrase générique sur le compte, et
       * `null` quand cette lecture est absente : la carte omet alors la ligne,
       * elle n'écrit pas une raison inventée.
       */
      esnReason: z.string().nullable().default(null),
      /**
       * Théo A today-jour (« sources cliquables, visibles directement », Louis 22/10) — le LIEN vers la page d'origine
       * du signal (l'offre, l'article, le communiqué), lu sur le signal lui-même (`recent_signals`, #3922). `null` =
       * aucune URL http(s) vérifiable : la carte n'affiche alors aucun lien, jamais un lien deviné ni une recherche.
       */
      signalSourceUrl: z.string().nullable().default(null),
      signalSourceKind: z.string().nullable().default(null),
      /** #2097.21 — même logo que `businessObject.logoUrl` : une seule
       *  lecture, jamais recalculée deux fois pour le même compte (GA-26). */
      logoUrl: z.string().nullable().default(null),
      /** #2097.21 (correctif) — même site, même raison, que
       *  `businessObject.website` : sans lui, le repli favicon de
       *  `CompanyAvatar` n'a rien à essayer et la carte reste au monogramme
       *  même quand `/accounts` afficherait un vrai favicon. */
      website: z.string().nullable().default(null),
      /**
       * #2107.40 — « potentiel structurel » : le NOMBRE de parcours de marché
       * observés pour ce compte (`MarketMemoryService.pathsFor`), déjà lu par
       * `BriefingController.today()` pour le TRI seul (`accounts-to-watch-market-rank.ts`,
       * GA-262) et jusqu'ici jeté après usage. `null` sous le seuil de
       * couverture (`MARKET_MEMORY_MIN_PATHS`) ou si la mémoire marché est
       * indisponible — jamais un `0` qui se lirait comme une mesure. Un
       * compte réel, jamais deviné : la même lecture que le badge du
       * cockpit (`StructuralPotentialBadge`).
       */
      structuralPotentialPaths: z.number().nullable().default(null),
      /**
       * #2107.42 — « accès réel » : la voie d'accès du contact le mieux classé
       * du compte (`ContactsService.rankForAccount`, MÊME classement que
       * l'onglet Contacts, `PriorityPathSection.tsx`) — jamais une deuxième
       * dérivation (GA-26). `null` quand le compte n'a aucun contact classable
       * (classement indisponible, ou aucun contact éligible) ; `missing_reason:
       * 'never_searched'` reste à `null` côté écran (« on n'affiche pas ce
       * qu'on n'a pas ») — c'est l'écran qui décide, comme sur la fiche compte.
       */
      accessPath: contactAccessPathSchema.nullable().default(null),
      /**
       * #4068.6 — ce que l'espace SAIT déjà de ce compte, daté et typé (affaire perdue, mission passée, besoin
       * exprimé…), les plus pesants d'abord, trois au plus. Le lecteur unique des faits (`AccountFactsService`) ;
       * la date est ABSOLUE — un fait ancien ne passe jamais pour récent — et la provenance ne voyage jamais.
       * Vide si rien n'est lisible : une absence ne fait aucune ligne. Champ ajouté avec un défaut vide, comme
       * les autres champs neufs de ce contrat (déploiement Vercel / Railway décalé).
       */
      history: z.array(accountFactBriefSchema).max(3).default([]),
    }),
  ),
  /**
   * LES BLOCAGES DE PARCOURS (#1506).
   *
   * Seulement ce qui BLOQUE — jamais le parcours complet : « Aujourd'hui » sert
   * à décider quoi faire en premier, pas à contempler une carte du processus.
   *
   * ⚠️ Optionnel avec un défaut vide, comme les autres champs neufs de ce
   * contrat : pendant les minutes qui séparent le déploiement de Vercel de celui
   * de Railway, l'écran reçoit encore la réponse de l'API PRÉCÉDENTE. Un champ
   * neuf déclaré obligatoire y devient `undefined` et casse la page — c'est
   * arrivé sur `/actions/chaines` le 05/09/2026.
   */
  chainBlockers: z.array(chainBlockerSchema).default([]),
  /**
   * #3256 (BEL-SC-227.19) — LES RISQUES CRITIQUES AGRÉGÉS.
   *
   * Seulement les comptes où au moins deux signaux convergent — un compte
   * avec un seul signal reste visible via sa carte individuelle ailleurs
   * dans le brief, ce bloc ne la duplique pas.
   *
   * ⚠️ Optionnel avec un défaut vide, même raison que `chainBlockers` : un
   * champ neuf reçu `undefined` pendant le déploiement ne doit pas casser
   * la page.
   */
  criticalRisks: z.array(criticalRiskSchema).default([]),
  /**
   * #2151.23 / #2151.61 — LES ALERTES DE DÉCOUVRIR QUI MÉRITENT AUJOURD'HUI.
   *
   * Seulement les genres jugés urgents (`DISCOVER_ALERT_URGENT_KINDS`), et
   * seulement ceux que personne n'a encore acquittés. Le DÉTAIL vit ailleurs —
   * sur l'objet ou dans Découvrir (#2151.24) : cette liste dit qu'il s'est
   * passé quelque chose, elle ne rejoue pas l'écran.
   *
   * ⚠️ **Une liste vide ne veut pas dire « rien ne s'est passé sur le marché »**,
   * elle veut dire « rien n'a été détecté depuis la dernière fois ». L'écran
   * écrit « aucun déclenchement depuis <date> », jamais « 0 alerte » — la
   * seconde phrase affirme quelque chose du marché que nous ne savons pas.
   *
   * ⚠️ Optionnel avec un défaut vide, comme les autres champs neufs de ce
   * contrat : pendant les minutes qui séparent le déploiement du front de celui
   * de l'API, l'écran reçoit encore la réponse de l'API PRÉCÉDENTE.
   */
  discoverAlerts: z.array(discoverAlertEventSchema).default([]),
  /**
   * La date du dernier événement consigné, ou `null` — « aucun déclenchement
   * depuis qu'on surveille ». C'est ce qui permet à l'écran de dire son vide
   * avec une date plutôt qu'avec un zéro.
   */
  discoverAlertsLastEventAt: z.string().nullable().default(null),
  /**
   * #2147.5 — LES JOBS EN COURS, MIS EN AVANT (épopée #2785). Aujourd'hui,
   * uniquement les analyses de compte `analyzing` — le seul job async dont
   * le brief peut honnêtement remplir la carte. Optionnel avec un défaut
   * vide, même raison que `chainBlockers`/`discoverAlerts` : un champ neuf
   * reçu `undefined` pendant le déploiement ne doit pas casser la page.
   */
  runningJobs: z.array(jobTrackingCardSchema).default([]),
  /**
   * #2387.7 (épopée #2767) — « EN ATTENTE DES AUTRES », SECONDE SOURCE : les
   * profils ENVOYÉS au client (`submissions.stage = 'submitted'`) restés sans
   * AUCUN retour au-delà du seuil (`SUBMISSION_NO_RESPONSE_AFTER_DAYS`). Même
   * lecture que la carte d'action #2107.4 (jamais un second calcul) ; `days`
   * vient de la lecture. Une liste vide ou absente ne monte AUCUNE ligne.
   *
   * Optionnel sans défaut : un `.default()` rendrait le champ obligatoire dans
   * le type inféré, donc dans chaque fixture écrite à la main.
   */
  awaitingClientProfiles: z
    .array(
      z.object({
        consultantId: z.string(),
        consultantName: z.string(),
        days: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  /** Les actions du jour, déjà triées — au plus {@link BRIEFING_ACTIONS_MAX}. */
  actions: z.array(briefingActionSchema),
  generatedAt: z.string(),
})
export type DailyBriefing = z.infer<typeof dailyBriefingSchema>

/**
 * LE SIGNAL « PREMIÈRE OUVERTURE DU JOUR » (#1936, lot 7A).
 *
 * Décision de Louis du 12/09/2026 : la 1re ouverture de Laura dans la journée
 * EST le brief du matin. `POST /briefing/first-open-today` ne rend AUCUN
 * contenu de brief — cette forme est délibérément séparée de
 * {@link dailyBriefingSchema} : elle porte une DÉCISION consommée une fois,
 * pas un écran à afficher.
 *
 * ⚠️ `timeZone` est le fuseau du NAVIGATEUR au moment de l'appel, jamais
 * stocké. Un identifiant illisible ou absent ne fait PAS échouer la requête
 * — il retombe côté serveur sur le fuseau par défaut du produit : deviner un
 * fuseau à partir d'un texte qu'on ne sait pas lire serait pire que le repli.
 */
export const firstOpenTodayRequestSchema = z.object({
  timeZone: z.string().min(1).optional(),
})
export type FirstOpenTodayRequest = z.infer<typeof firstOpenTodayRequestSchema>

export const firstOpenTodayResponseSchema = z.object({
  /** `true` UNE fois par jour civil et par utilisateur ; `false` sinon — y
   *  compris sur une panne de lecture/écriture, jamais une exception. */
  isFirstOpenToday: z.boolean(),
})
export type FirstOpenTodayResponse = z.infer<typeof firstOpenTodayResponseSchema>

/**
 * #2391.54 / #2391.55 — CE QUE LA PERSONNE A DÉCLARÉ d'un bloc de son plan de
 * journée, RELU. `setFocusPlanBlockOutcome` écrivait l'état, le résultat libre
 * (`result_note`) et la durée réelle (`actual_minutes`) ; aucune lecture ne les
 * rendait — trois champs écrits que personne ne pouvait consulter.
 *
 * `note` et `actualMinutes` restent `null` quand la personne ne les a pas
 * donnés : un clic seul est un geste complet, et « non déclaré » n'est jamais
 * « 0 minute » (GA-18). Jamais mesurés ni déduits (#2391.56).
 */
export const focusPlanBlockOutcomeReadSchema = z.object({
  eventId: z.string().min(1),
  outcome: focusPlanBlockOutcomeSchema,
  note: z.string().min(1).max(FOCUS_PLAN_OUTCOME_NOTE_MAX).nullable(),
  actualMinutes: z.number().int().min(1).max(FOCUS_PLAN_ACTUAL_MINUTES_MAX).nullable(),
  /** Dernière correction, ISO 8601 — une correction humaine gagne toujours. */
  updatedAt: z.string(),
})
export type FocusPlanBlockOutcomeRead = z.infer<typeof focusPlanBlockOutcomeReadSchema>
