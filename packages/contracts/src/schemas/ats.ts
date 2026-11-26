import { z } from 'zod'
import { writeRequestTargetSchema } from './write-request-target.js'

/**
 * L'ATS/ERP de l'ESN — les consultants, les besoins clients, les missions.
 *
 * Nommé par sa CAPACITÉ (`ats`) et non par son éditeur, comme la messagerie et
 * l'agenda. Aujourd'hui un seul connecteur l'implémente ; le contrat, lui,
 * n'en suppose aucun.
 *
 * Ce que les méta-analyses en attendent (§5.4, 15 besoins PRIO 1) tient en
 * quatre questions qu'un business manager se pose chaque semaine : qui est
 * disponible, quels besoins sont ouverts, quelles missions se terminent, et qui
 * est en intercontrat depuis trop longtemps. Le contrat n'expose que ça — pas
 * un miroir de l'ERP.
 *
 * **Lecture seule, décision assumée.** Écrire dans l'ERP d'une ESN (créer une
 * mission, changer un TJM) engage sa facturation et sa paie. Bellum lit,
 * rapproche et alerte ; il n'écrit pas dans le système qui fait foi.
 */

export const atsProviderSchema = z.enum(['boondmanager'])
export type AtsProvider = z.infer<typeof atsProviderSchema>

/**
 * Connecter l'ATS : plus aucun secret collé (#4688). La Marketplace BoondManager impose OAuth2 ; la route rend l'URL
 * d'autorisation de l'éditeur, le navigateur y est redirigé, le retour passe par le callback serveur.
 * Aucune base d'API dans le corps : le client secret de l'App partirait vers l'hôte choisi par l'appelant. L'instance
 * dédiée se règle côté serveur (`BOONDMANAGER_BASE_URL`).
 */
export const atsConnectSchema = z
  .object({
    provider: atsProviderSchema.default('boondmanager'),
  })
  .strict()

/**
 * #4688.11 — le verdict de « Vérifier la connexion » : joignable ou non, et les `meta.warnings` rendus par l'éditeur
 * (ex. `appOauthRedirection`). Liste vide = rien rendu ; jamais un avertissement deviné.
 */
export const atsTestResultSchema = z.object({
  reachable: z.boolean(),
  warnings: z.array(z.string()).default([]),
})
export type AtsTestResult = z.infer<typeof atsTestResultSchema>

export const atsConnectResultSchema = z.object({ url: z.string().url() })
export type AtsConnectResult = z.infer<typeof atsConnectResultSchema>

export const atsStatusSchema = z.object({
  connected: z.boolean(),
  provider: atsProviderSchema.nullable(),
  /** Comment la connexion s'authentifie — utile au support, jamais le secret. `user_token` / `client_jwt` = héritage à migrer. */
  authMode: z.enum(['user_token', 'client_jwt', 'oauth2']).nullable(),
  connectedAt: z.string().nullable(),
  /** La connexion vient-elle de la configuration serveur plutôt que de l'espace ? */
  fromEnvironment: z.boolean(),
  /** #4688 — OAuth2 : le dernier échange réussi avec l'éditeur (ISO). `null` = aucun, jamais une date devinée. */
  lastExchangeAt: z.string().nullable().default(null),
  /** #4688 — le refresh a été refusé : il faut reconnecter. Plus rien n'est tenté d'ici là. */
  needsReconnect: z.boolean().default(false),
  /** #4688 — les scopes accordés par l'éditeur, tels que rendus. `null` = non rendus. */
  scopes: z.string().nullable().default(null),
  /** #4688 — le nom de l'instance, quand on le SAIT (démonstration seulement : Boond n'en rend aucun à l'échange). */
  instanceLabel: z.string().nullable().default(null),
  /** #4688 — l'App OAuth est configurée sur le serveur : sans elle, le bouton « Connecter » ne s'affiche pas. */
  oauthAvailable: z.boolean().default(false),
})
export type AtsStatus = z.infer<typeof atsStatusSchema>

/** Un consultant du vivier de l'ESN, réduit à ce qui sert commercialement. */
export const atsConsultantSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  title: z.string().nullable(),
  /** Date de disponibilité déclarée (ISO), quand l'ERP la porte. */
  availableAt: z.string().nullable(),
  /** Jours depuis la fin de la dernière mission. `null` = inconnu, jamais 0 par défaut. */
  daysWithoutMission: z.number().int().nonnegative().nullable(),
  dailyRate: z.number().nullable(),
  skills: z.array(z.string()),
})
export type AtsConsultant = z.infer<typeof atsConsultantSchema>

/** Un besoin client ouvert. */
export const atsNeedSchema = z.object({
  id: z.string(),
  title: z.string(),
  companyName: z.string().nullable(),
  createdAt: z.string().nullable(),
  state: z.string().nullable(),
})
export type AtsNeed = z.infer<typeof atsNeedSchema>

/** Une mission en cours, avec sa date de fin — la matière des alertes J-30. */
export const atsMissionSchema = z.object({
  id: z.string(),
  title: z.string(),
  companyName: z.string().nullable(),
  consultantName: z.string().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  /** Jours restants avant la fin. `null` quand la date de fin est absente. */
  daysRemaining: z.number().int().nullable(),
})
export type AtsMission = z.infer<typeof atsMissionSchema>

/** #4065.9 — un candidat de l'ATS. `interviewedAt` = `null` quand l'ERP ne rend aucune date d'entretien. */
export const atsCandidateSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  title: z.string().nullable(),
  interviewedAt: z.string().nullable(),
})
export type AtsCandidate = z.infer<typeof atsCandidateSchema>

export const atsSnapshotSchema = z.object({
  status: atsStatusSchema,
  /** Missions se terminant dans la fenêtre demandée, les plus urgentes d'abord. */
  endingMissions: z.array(atsMissionSchema),
  /** Consultants sans mission depuis plus longtemps que le seuil. */
  benchedConsultants: z.array(atsConsultantSchema),
  openNeeds: z.array(atsNeedSchema),
  /** #4065.9 — missions TERMINÉES dans la fenêtre passée demandée (absent = non demandé). */
  endedMissions: z.array(atsMissionSchema).optional(),
  /** #4065.9 — candidats vus en entretien dans la fenêtre passée (absent = non demandé). */
  interviewedCandidates: z.array(atsCandidateSchema).optional(),
  /** #4065.9 — `false` : la liste des candidats n'a pas pu être lue (≠ « aucun candidat vu »). */
  candidatesRead: z.boolean().optional(),
})
export type AtsSnapshot = z.infer<typeof atsSnapshotSchema>

/**
 * Une demande d'écriture dans l'ERP, telle que l'écran la reçoit.
 *
 * L'API rendait l'entité brute. Elle ne portait donc pas la seule chose qu'un
 * écran a besoin de savoir AVANT d'afficher deux boutons : est-ce que CETTE
 * personne peut trancher ? La règle est double (validation d'un responsable, et
 * jamais par son propre demandeur) et vit côté serveur — la recopier dans le
 * client la ferait diverger au premier changement de rôle.
 *
 * Donc le serveur répond, et il répond avec la RAISON : un bouton grisé sans
 * explication fait cliquer trois fois puis écrire un message au support.
 */
export const atsWriteRequestViewSchema = z.object({
  id: z.string(),
  kind: z.enum(['create_mission', 'update_tjm', 'update_need_status', 'log_call']),
  /** Prévisualisation FIGÉE au moment de la demande — ce qui partira, mot pour
   *  mot. Jamais un recalcul : entre la demande et la décision, le monde a pu
   *  changer, et on ne fait pas approuver autre chose que ce qui a été montré. */
  preview: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  /** L'utilisateur est-il l'auteur de la demande ? */
  requestedByYou: z.boolean(),
  /** Peut-il la trancher ? */
  canDecide: z.boolean(),
  /** Pourquoi il ne peut pas, quand c'est le cas. */
  blockedReason: z.string().nullable(),
  /**
   * #2200.12 / #2200.17 / #2201.21 — l'objet visé. Une écriture ERP ne porte
   * ni compte ni contact bellum PAR NATURE (un TJM ou une mission concerne un
   * consultant et un besoin, pas notre CRM) : `accountId`/`contactId` restent
   * `null` sans que ce soit une absence de mesure. `ownerName` et `risk`, eux,
   * sont réellement connus et remplis.
   *
   * Optionnel : le socle #2200/#2201 ACT2 pose le contrat ; le remplissage côté
   * `AtsWriteService` (owner + risque) suit dans un lot séparé. Une vue d'avant
   * ce champ reste valide.
   */
  target: writeRequestTargetSchema.optional(),
  /**
   * #2864 — reste du lot précédent : le collègue à qui la demande est
   * CONFIÉE (`AtsWriteService.assign`). `null` = circuit d'origine — même
   * contrat que la vue CRM (`crm-write-request.ts`).
   */
  assignedTo: z.string().nullable().optional(),
  /**
   * #2856 — reste du lot précédent : reportée jusqu'à cette date
   * (`AtsWriteService.snooze`). La demande reste en attente : reporter ne
   * décide rien, elle sort seulement de la file active jusque-là.
   */
  snoozedUntil: z.string().nullable().optional(),
})
export type AtsWriteRequestView = z.infer<typeof atsWriteRequestViewSchema>
