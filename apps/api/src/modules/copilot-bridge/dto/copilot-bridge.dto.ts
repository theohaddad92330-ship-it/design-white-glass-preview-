import {
  agendaRangeRequestSchema,
  relationStagesBySirenRequestSchema,
  analysisContextPresetSchema,
  analysisScopeModeSchema,
  analysisScopeSelectionSchema,
  changeNeedStatusSchema,
  contactListQuerySchema,
  contactPreflightActionSchema,
  forecastHorizonSchema,
  freeSlotsRequestSchema,
  mailSearchRequestSchema,
  toolFamilySchema,
  MARKET_MEMORY_GROUP_MAX_ENTITIES,
  OUTREACH_CHANNELS,
  OUTREACH_PERSONAS,
  messageLibraryStepSchema,
  OUTREACH_SCENARIO_IDS,
} from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * `userId` est le SEUL champ ajouté aux schémas partagés : l'appelant interne
 * dit pour qui il lit. Tout le reste réutilise le contrat public — pas de
 * seconde vérité sur les bornes.
 */
const withUser = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) => schema.extend({ userId: z.string().guid() })

/**
 * #3973 — les OUTILS décochés pour ce fil (« Outils et sources »), identifiants
 * du registre déjà recoupés par `resolveToolExclusions` côté `/chat` et relayés
 * par le service IA. Second champ ajouté aux lectures de messagerie et d'agenda,
 * et seulement à elles : il choisit QUEL backend est lu, jamais ce qu'on y
 * cherche. Absent = tous les backends branchés, comme avant.
 */
const excludedToolProviders = z
  .array(
    z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9_-]+$/),
  )
  .max(40)
  .optional()
const withUserAndExclusions = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  withUser(schema).extend({ excludedProviders: excludedToolProviders })

export class CopilotMailSearchDto extends createZodDto(withUserAndExclusions(mailSearchRequestSchema)) {}
/** #4016 L3 — le corps d'un fil de la boîte de l'utilisateur nommé (jamais celle d'un autre). */
export class CopilotMailThreadDto extends createZodDto(
  withUserAndExclusions(
    z
      .object({
        threadId: z.string().min(1).max(256),
        counterpart: z.string().max(320).optional(),
        windowDays: z.number().int().min(1).max(365).default(90),
      })
      .strict(),
  ),
) {}
/** #4406.5 (c96) — les conversations Beeper de l'utilisateur nommé, et UNE conversation lue pour lui. */
export class CopilotBeeperConversationsDto extends createZodDto(withUser(z.object({}).strict())) {}
export class CopilotBeeperChatDto extends createZodDto(
  withUser(z.object({ chatId: z.string().min(1).max(512) }).strict()),
) {}
export class CopilotAgendaEventsDto extends createZodDto(withUserAndExclusions(agendaRangeRequestSchema)) {}
export class CopilotFreeSlotsDto extends createZodDto(withUserAndExclusions(freeSlotsRequestSchema)) {}
export class CopilotBriefingDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      businessRole: z.string().max(120).optional(),
      /** #3973 — les outils décochés pour ce fil : la messagerie/l'agenda décoché n'est pas lu. */
      excludedProviders: excludedToolProviders,
      /** #3973 — les familles décochées en entier : le bloc messagerie/agenda n'est pas lu du tout. */
      excludedFamilies: z.array(toolFamilySchema).max(40).optional(),
    })
    .strict(),
) {}
/** #2392 — la clôture de journée : le fuseau est facultatif (absent = celui du brief). */
export class CopilotDayClosureDto extends createZodDto(
  z.object({ userId: z.string().guid(), timeZone: z.string().max(64).optional() }).strict(),
) {}
/** #3212.3/.4/.6 (épopée #3235) — le versioning et la révision de verdict du
 *  dernier run d'UN compte déjà possédé (ownership vérifiée côté chat AVANT
 *  cet appel, ET revérifiée ici par `AccountsService.findOne`). */
export class CopilotAccountVersioningDto extends createZodDto(
  z.object({ userId: z.string().guid(), accountId: z.string().guid() }).strict(),
) {}

/** LOT (15/10) DATA-B.4 — l'organigramme d'UN compte déjà possédé (même forme que le versioning). */
export class CopilotAccountOrgChartDto extends createZodDto(
  z.object({ userId: z.string().guid(), accountId: z.string().guid() }).strict(),
) {}

/**
 * Les six lectures du domaine ATS / delivery (PDF 6 §9, décision D44).
 *
 * Elles n'ont aucun schéma public à réutiliser : ce sont des questions du
 * copilote, pas des requêtes d'écran. Elles portent donc leur propre contrat,
 * volontairement pauvre — un mois, un seuil, un identifiant. Tout ce qui
 * ressemblerait à un filtre libre ouvrirait une surface que personne ne relit.
 */
const userOnly = z.object({ userId: z.string().guid() }).strict()
const withMonth = z.object({
  userId: z.string().guid(),
  /** `YYYY-MM`. Absent = le mois précédent, comme les écrans. */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
})

/** #3889.1 — « qui a travaillé chez <compte> ? » : l'expérience déclarée d'un CV autorisé. */
export class CopilotTalentExperienceSearchDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      client: z.string().trim().min(1).max(200),
    })
    .strict(),
) {}

export class CopilotTalentSearchDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      /** Nom, intitulé de poste ou compétence. Vide = tout le vivier. */
      query: z.string().trim().max(200).optional(),
      /** Ne rendre que ceux qui se libèrent sous N jours. */
      availableWithinDays: z.number().int().min(0).max(365).optional(),
      // #3222 — le tiroir « Ville et rayon » (`talentSearchQuerySchema`, PDF-22
      // §01) existait déjà côté API/écran, jamais exposé à Laura : sans lui,
      // « un consultant Java à Lyon » ne pouvait pas se filtrer par ville, une
      // capacité manquante nommée par l'épopée #3222 (corpus reverse-market).
      zone: z.string().trim().max(120).optional(),
      radiusKm: z.number().int().min(1).max(500).optional(),
    })
    .strict(),
) {}
/**
 * #2327.26 — Laura EXPLIQUE un rapprochement de talents, elle ne le fusionne
 * jamais (`c37_fusion_doublons`). `talentId` est la fiche consultée ;
 * `otherTalentId`, omis, rend l'explication de TOUS ses rapprochements
 * possibles — fourni, il cible une paire précise, comme `GET
 * :id/identity/:otherId` côté écran.
 */
export class CopilotTalentIdentityExplainDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      talentId: z.string().guid(),
      otherTalentId: z.string().guid().optional(),
    })
    .strict(),
) {}
/**
 * #2367.11 — le REX d'un push consultant, pour que Laura puisse répondre
 * « pourquoi ce profil a été refusé ». `consultantId` est vérifié APPARTENIR
 * à l'espace de `userId` côté service (`ConsultantsService.findScoped`) —
 * cette DTO ne porte que la FORME de la question.
 */
export class CopilotConsultantFeedbackDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      consultantId: z.string().guid(),
    })
    .strict(),
) {}
/**
 * #2857 (#2201.31) — « Demander une explication » sur une carte de
 * validation en attente. `approvalRequestId` est vérifié APPARTENIR à
 * l'espace de `userId` côté service (`WorkflowRunnerService.explainApprovalRequest`)
 * — cette DTO ne porte que la FORME de la question.
 */
export class CopilotApprovalExplainDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      approvalRequestId: z.string().guid(),
    })
    .strict(),
) {}
export class CopilotMissionsDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      /** Fenêtre de fin de mission, en jours. Défaut 30 — « quelles missions
       *  finissent bientôt » est la question qu'on pose. */
      endingWithinDays: z.number().int().min(1).max(365).optional(),
    })
    .strict(),
) {}
export class CopilotTimesheetsDto extends createZodDto(withMonth.strict()) {}
export class CopilotInvoiceBlockersDto extends createZodDto(withMonth.strict()) {}
/**
 * #2424.13 — `accountId` optionnel : Laura le transmet quand un compte
 * précis est nommé dans la conversation (résolu par un appel antérieur, ex.
 * `search_accounts`). Absent, la bibliothèque entière reste rendue, comme
 * avant.
 */
export class CopilotProofsDto extends createZodDto(
  userOnly.extend({
    accountId: z.string().guid().optional(),
    /**
     * #2424.12 — les trois FACETTES déjà portées par `usableProofs`
     * (`sector`/`expertise`/`technologies`, `capitalisation.service.ts`),
     * jamais relayées jusqu'ici par ce pont : Laura ne pouvait donc jamais
     * les transmettre, même quand le modèle les proposait.
     */
    sector: z.string().trim().min(1).max(120).optional(),
    expertise: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    technologies: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  }),
) {}
/** #2424.10 — câblage restant de l'expansion depuis un REX positif : le
 *  compte est REQUIS, contrairement à `CopilotProofsDto` (une lecture ciblée,
 *  jamais une bibliothèque entière). */
export class CopilotAccountRexDto extends createZodDto(userOnly.extend({ accountId: z.string().guid() })) {}
/**
 * #2124.49 à .55 — ce que Laura PROPOSE pour la preuve d'une mission.
 *
 * Une LECTURE, comme tout ce pont. L'écriture, elle, n'a pas de porte ici : la
 * validation part de l'écran, sur un clic humain, et jamais d'un outil du
 * copilote.
 */
export class CopilotProofProposalDto extends createZodDto(userOnly.extend({ missionId: z.string().guid() })) {}
/** BEL-SC-239 — le plan de proposition (Proposal Studio) d'UN besoin. */
export class CopilotProposalOutlineDto extends createZodDto(userOnly.extend({ projectId: z.string().guid() })) {}
export class CopilotInterventionsDto extends createZodDto(userOnly) {}
/** Les blocages de parcours — « où est-ce que mes dossiers bloquent ? » (#1506). */
export class CopilotChainBlockersDto extends createZodDto(userOnly) {}
/**
 * #3264.14 — la collision de sollicitation (#2325.35, `@bellum/contracts`)
 * réduite à UN contact : ce que `prepare_message_for_contact` (`apps/ia`)
 * interroge AVANT de préparer un message, pour savoir si un collègue a déjà
 * une séquence active sur ce contact.
 */
export class CopilotContactCollisionDto extends createZodDto(userOnly.extend({ contactId: z.string().guid() })) {}
/** #3219 (#190.2 côté contact, 11/10) — le contrôle avant action d'UN contact. `action` optionnelle :
 *  absente, le contrôle reste le même (l'action change le cadre, jamais les lignes). */
export class CopilotContactPreflightDto extends createZodDto(
  userOnly.extend({ contactId: z.string().guid(), action: contactPreflightActionSchema.optional() }).strict(),
) {}
/** #3289 (#3264.31/.32/.33) — le timing appris de l'espace, filtrable par persona (séniorité). */
/** #3289 (#3264.41) — les règles méthode contredites par l'espace de l'appelant. */
export class CopilotContradictedRulesDto extends createZodDto(userOnly) {}
// #3181.2 (épopée #3247) — les secteurs où l'espace a une preuve.
export class CopilotProofSectorGroupsDto extends createZodDto(userOnly) {}
export class CopilotSendTimingDto extends createZodDto(
  userOnly.extend({ seniority: z.string().min(1).max(60).optional() }),
) {}

/**
 * Les neuf lectures qui manquaient encore aux vingt requêtes prioritaires
 * (§9.2 du PDF 6, dette T6.4 — et T4.1, le point d'entrée 4 du matching).
 *
 * Après le premier lot d'outils, treize des vingt requêtes restaient sans
 * moyen d'être servies : les besoins, le classement d'un besoin, l'explication
 * d'un profil, les missions à risque, les profils à repositionner, les appels
 * d'offres, les comptes qui attendent une décision, le brief d'un rendez-vous
 * et la création d'un rendez-vous. Toutes ont leur API et leur écran depuis les
 * PDF 2 à 5 ; il ne leur manquait que l'outil.
 */
export class CopilotFindNeedsDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      /** Libellé, compétence ou nom de compte. Vide = tous les besoins ouverts.
       *  Borne alignée sur celle de l'écran (120) : une borne plus large ici
       *  ferait échouer le parse en aval au lieu de refuser à l'entrée. */
      query: z.string().trim().max(120).optional(),
      /**
       * #3852 (recette prod 08/10, 2e passe) — un besoin déjà LU dans ce fil
       * (identifiant connu, ex. depuis `run_matching` ou une fiche ouverte) se
       * résout par son identité, jamais par une recherche texte qui peut ne
       * rien retrouver sur un titre mal découpé. Même filtre `id` que l'écran
       * (`openNeedsQuerySchema.id`) : il ignore le repli « ouverts seulement »,
       * donc un besoin clos reste trouvable par ce chemin aussi.
       */
      needId: z.string().guid().optional(),
      /** #3889.2 — l'historique : les besoins FERMÉS (gagné, perdu, annulé, pourvu) en plus des ouverts. */
      includeClosed: z.boolean().optional(),
      /**
       * #4287.9 — l'historique d'un COMPTE se lit par son identité (`need.account_id`, le filtre de l'écran), jamais
       * par son nom en recherche texte : « Servier » ne retrouvait pas un besoin d'un compte nommé autrement.
       */
      accountId: z.string().guid().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    })
    .strict(),
) {}

/**
 * #AM.59 (#4059) — comparer des profils à un besoin COLLÉ, sans le créer : les critères lus dans le texte, jamais écrits.
 * Rien d'autre que ce que le texte dit (aucun TJM, aucune date par défaut).
 */
export class CopilotMatchDraftNeedDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      need: z
        .object({
          role: z.string().trim().min(1).max(200),
          skills: z
            .array(
              z
                .object({
                  term: z.string().trim().min(1).max(120),
                  required: z.boolean().optional(),
                  level: z.string().trim().max(60).nullable().optional(),
                })
                .strict(),
            )
            .max(30),
          seniority: z.string().trim().max(120).nullable().optional(),
          location: z.string().trim().max(160).nullable().optional(),
          startOn: z.string().trim().max(40).nullable().optional(),
          contractKind: z.string().trim().max(60).nullable().optional(),
          environment: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
          accountName: z.string().trim().max(200).nullable().optional(),
        })
        .strict(),
    })
    .strict(),
) {}

export class CopilotMatchNeedDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      needId: z.string().guid(),
      /**
       * Quand il est fourni, la réponse porte l'explication AXE PAR AXE de ce
       * profil-là. C'est la requête « compare ce consultant avec ce besoin »,
       * et elle rejoue le classement figé plutôt que de relire un cache.
       */
      consultantId: z.string().guid().optional(),
    })
    .strict(),
) {}

/**
 * #3865.2 (lot X05, 08/10) — le matching INVERSE d'UN consultant : « à quels
 * besoins ce profil répond-il ? ». `.strict()`, comme `CopilotMatchNeedDto`
 * juste au-dessus.
 */
export class CopilotMatchTalentNeedsDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      consultantId: z.string().guid(),
      /** « mine » restreint aux besoins dont CE talent est le porteur — même
       *  vocabulaire que `scope` sur `GET consultants/:id/match-inverse`. */
      mineOnly: z.boolean().optional(),
    })
    .strict(),
) {}

/**
 * #3182.3 (épopée #3248) — les prérequis d'un POSITIONNEMENT, pour UN
 * consultant sur UN run de classement déjà exécuté (`runId`, rendu par
 * `CopilotMatchNeedDto` plus haut). Un run rejoué plutôt qu'un needId seul :
 * la préflight doit dire la vérité du moment du calcul, jamais un recalcul
 * silencieux.
 */
export class CopilotSubmissionPreflightDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      needId: z.string().guid(),
      runId: z.string().guid(),
      consultantId: z.string().guid(),
    })
    .strict(),
) {}

/**
 * #2320.24 (épopée #2967) — l'état de la chaîne commerciale d'UN besoin :
 * statut actuel + historique de transition. Même forme bornée que
 * `CopilotMatchNeedDto` juste au-dessus — une lecture, un besoin.
 */
export class CopilotNeedTransitionsDto extends createZodDto(userOnly.extend({ needId: z.string().guid() })) {}

/**
 * #2320.26 / #2320.27 (épopée #2967) — le verdict d'UNE transition SANS
 * l'exécuter : `nextStatus` réutilise le MÊME enum que la porte d'écriture
 * (`changeNeedStatusSchema`) — jamais une seconde liste qui promettrait un
 * statut que l'écriture refuserait.
 */
export class CopilotNeedTransitionCheckDto extends createZodDto(
  userOnly.extend({ needId: z.string().guid(), nextStatus: changeNeedStatusSchema.shape.status }),
) {}

/**
 * #2339.1/.2/.3/.5/.6/.10/.11/.13 (épopée #2795) — les six lectures de
 * `NeedCommercialStateService` prennent TOUTES la même forme : l'appelant et
 * le besoin, rien de plus. Une seule classe plutôt que six homonymes.
 */
export class CopilotNeedIdDto extends createZodDto(userOnly.extend({ needId: z.string().guid() })) {}

export class CopilotMissionRisksDto extends createZodDto(userOnly) {}
/**
 * #2338.8 / #2409.8 — la checklist de démarrage d'UNE mission (verdict +
 * réserves NOMMÉES), pour que Laura puisse l'annoncer en conversation. Même
 * forme que `CopilotProofProposalDto` : une lecture bornée à une mission
 * précise.
 */
export class CopilotMissionStartReadinessDto extends createZodDto(userOnly.extend({ missionId: z.string().guid() })) {}
/**
 * #2423.9 — les avenants DÉJÀ proposés sur UNE mission, pour que Laura vérifie
 * que la mission appartient à l'espace avant de préparer une nouvelle
 * proposition (même forme que `CopilotMissionStartReadinessDto`).
 */
export class CopilotMissionAmendmentsDto extends createZodDto(userOnly.extend({ missionId: z.string().guid() })) {}
/** #2324.39 — l'état ACTUEL d'une opportunité, lu avant d'en proposer une mise à jour. */
export class CopilotProjectReadDto extends createZodDto(userOnly.extend({ projectId: z.string().guid() })) {}
export class CopilotReactivationDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      /** Un des sept segments du pool. Absent = les effectifs de chacun. */
      segment: z.string().trim().max(60).optional(),
    })
    .strict(),
) {}
export class CopilotRfpsDto extends createZodDto(
  z.object({ userId: z.string().guid(), rfpId: z.string().guid().optional() }).strict(),
) {}
export class CopilotAccountsToActDto extends createZodDto(userOnly) {}

/** #3211.9 (épopée #3234) — les actions échues sans résultat déclaré. */
export class CopilotActionsAwaitingOutcomeDto extends createZodDto(userOnly) {}

/** #3427 — le modèle approuvé choisi par canal, scénario et persona. */
export class CopilotMessageTemplateSelectDto extends createZodDto(
  userOnly.extend({
    channel: z.enum(OUTREACH_CHANNELS),
    scenarioId: z.enum(OUTREACH_SCENARIO_IDS),
    persona: z.enum(OUTREACH_PERSONAS),
    /** #3437/#3438/#3440 — l'étape de la séquence (invitation, M1, M2, M3) ; absente = la plus précoce. */
    step: messageLibraryStepSchema.optional(),
    /** #3443 — `inspiration` = un exemple de COMPORTEMENT (jamais récité) ; défaut : le modèle verbatim. */
    mode: z.enum(['verbatim', 'inspiration']).optional(),
  }),
) {}

/** #3422.20 — un message soumis à la checklist « avant d'envoyer ». */
export class CopilotMessagePreSendCheckDto extends createZodDto(
  userOnly.extend({
    body: z.string().min(1).max(5000),
    subject: z.string().max(300).nullish(),
    step: z.number().int().min(1).max(10).optional(),
    persona: z.enum(OUTREACH_PERSONAS).nullish(),
    /** #3436 — l'entreprise et la personne visées, SI elles sont établies. */
    recipientTerms: z.array(z.string().max(200)).max(6).optional(),
  }),
) {}

/**
 * #4462.9 — Laura déclare le lot d'analyses qu'elle vient de lancer depuis une liste de noms : `launched` (en cours,
 * attendues) et `known` (déjà analysées, au classement). Au plus 20 noms par message (#4462.2).
 */
export class CopilotFollowAnalysisBatchDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      launched: z.array(z.string().guid()).max(20),
      known: z.array(z.string().guid()).max(20).default([]),
    })
    .strict(),
) {}

/** #3209 (LAU-FINAL-215) — la répartition du portefeuille en quatre catégories. */
export class CopilotPortfolioPrioritiesDto extends createZodDto(userOnly) {}

/**
 * #3182.2 (épopée #3248, reste « disponibilité de l'équipe commerciale ») —
 * le modèle d'équipe minimal : scopé à l'ESPACE de l'appelant, jamais à un
 * compte (contrairement à {@link CopilotAccountStaffingHistoryDto}).
 */
export class CopilotCommercialLoadCapacityDto extends createZodDto(userOnly) {}

/** #2770.37 — la politique d'équipe de l'espace actif, lue par le plan de journée/semaine de Laura. */
export class CopilotTeamPolicyDto extends createZodDto(userOnly) {}

/** #3210 (LAU-FINAL-216) — les cas passés (gagnés/perdus) comparables à un compte. */
export class CopilotSimilarCasesDto extends createZodDto(userOnly.extend({ accountId: z.string().guid() })) {}

/** #3278.3 — les canaux MESURÉS de l'espace (réponse sous 14 j) ; #3234 — `by: 'role'` les coupe par rôle de décision. */
export class CopilotChannelPerformanceDto extends createZodDto(
  // #3211.11 (#3234, lot M11) — + cadence/route/priorité : recommandation par dimension.
  // P05.a (#3246, lot 09/10) — + `accountId` : le segment (secteur, taille) du
  // compte, pour lire « ailleurs » dans la cellule commune la plus proche.
  userOnly.extend({
    by: z.enum(['channel', 'role', 'angle', 'cadence', 'route', 'priority']).optional(),
    accountId: z.string().guid().optional(),
  }),
) {}

/** #3262.23 (épopée #3284) — la phrase de Laura sur un compte Focus qui stagne. */
export class CopilotFocusReviewDto extends createZodDto(userOnly.extend({ accountId: z.string().guid() })) {}

/**
 * #3919 — « qu'est-ce qui bouge chez ce compte ? ». `accountId` ABSENT = tout
 * le portefeuille (« les comptes où ça bouge ») ; PRÉSENT = un seul compte,
 * jamais les deux lectures confondues.
 */
export class CopilotAccountSignalsDto extends createZodDto(
  userOnly.extend({ accountId: z.string().guid().optional() }),
) {}

/**
 * #3903 — le bilan de relance sur une fenêtre. `sinceDate` (ISO, YYYY-MM-DD)
 * borne la fenêtre par le bas ; sans elle, `windowDays` (défaut 90) la
 * calcule depuis aujourd'hui. Le modèle résout lui-même « depuis le 1er
 * juillet » / « 90 derniers jours » AVANT d'appeler — même convention que
 * `reminder_at` ailleurs dans ce pont.
 */
export class CopilotEngagementReportDto extends createZodDto(
  userOnly.extend({
    sinceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    windowDays: z.number().int().min(1).max(365).optional(),
  }),
) {}

/**
 * Les quatre lectures du BACK-OFFICE (PDF 2 §5.1) : le pipe, le chiffre
 * d'affaires, la capacité vendable et les encaissements en retard.
 *
 * Elles réutilisent `withMonth` là où la question porte sur un mois, avec le
 * même défaut que les écrans — le mois PRÉCÉDENT. Le 5 du mois, « combien j'ai
 * encaissé » ne porte pas sur un mois qui n'est pas fini.
 *
 * ⚠️ La capacité fait exception : elle porte sur le mois EN COURS, parce que
 * « combien de jours j'ai à vendre » est une question sur maintenant. Le
 * contrôleur applique ce défaut-là, comme `GET /delivery/finance/capacity`.
 */
export class CopilotPipelineDto extends createZodDto(userOnly) {}
export class CopilotRevenueDto extends createZodDto(withMonth.strict()) {}
export class CopilotCapacityDto extends createZodDto(withMonth.strict()) {}
/** #2425.8 — le prévisionnel par horizon. Absent = le mois, comme l'écran. */
export class CopilotForecastHorizonsDto extends createZodDto(
  z.object({ userId: z.string().guid(), horizon: forecastHorizonSchema.optional() }).strict(),
) {}
export class CopilotOverduePaymentsDto extends createZodDto(withMonth.strict()) {}
export class CopilotMeetingBriefDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      /** Jour visé (`YYYY-MM-DD`). Absent = demain, la question qu'on pose. */
      day: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      /** #3973 — les outils décochés pour ce fil : l'agenda décoché n'est pas lu. */
      excludedProviders: excludedToolProviders,
    })
    .strict(),
) {}

/**
 * Les cinq lectures du SECOND MARCHÉ et de l'ACCÈS (tome 6 §16).
 *
 * Le §16 nomme quatorze outils. Mesuré le 29/08/2026 : aucun n'existait, alors
 * que dix des quatorze capacités avaient déjà leur route. Ce qui manquait
 * n'était pas le calcul, c'était la porte par laquelle le copilote l'atteint.
 *
 * Contrat volontairement pauvre, comme les précédents : un compte, un
 * département, un nombre de mois. Rien qui ressemble à un filtre libre.
 */
export class CopilotAccountAccessDto extends createZodDto(
  z.object({ userId: z.string().guid(), accountId: z.string().guid() }).strict(),
) {}
export class CopilotAccountPartnersDto extends createZodDto(
  z.object({ userId: z.string().guid(), accountId: z.string().guid() }).strict(),
) {}
/** #3345.2 (LAU-FINAL-255, recette prod 30/09) — même contrat pauvre : un
 *  utilisateur, un compte. Les décisions déjà prises sur ses pistes à
 *  qualifier, jamais un filtre libre. */
export class CopilotQualificationLeadDecisionsDto extends createZodDto(
  z.object({ userId: z.string().guid(), accountId: z.string().guid() }).strict(),
) {}
/** #3345 (recette 03/10) — retrouver une piste à qualifier par son LIBELLÉ (ou
 *  le nom de son compte) ; `accountId` borne la recherche quand il est connu. */
export class CopilotQualificationLeadResolveDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      label: z.string().min(1).max(300),
      accountId: z.string().guid().optional(),
    })
    .strict(),
) {}
/** #1791.2 — lire le CRM (branché à l'espace) pour UN compte Bellum, en LECTURE
 *  SEULE. Même contrat pauvre que `CopilotAccountAccessDto` : un utilisateur,
 *  un compte — rien qui laisse le modèle composer une requête CRM libre. */
export class CopilotCrmPresenceDto extends createZodDto(
  z.object({ userId: z.string().guid(), accountId: z.string().guid() }).strict(),
) {}
/**
 * #3181.2 (épopée #3247) — même lecture CRM que {@link CopilotCrmPresenceDto},
 * mais par IDENTITÉ (nom/domaine/siren) plutôt que par `accountId` — même
 * distinction que {@link CopilotMarketMemoryContextDto} face aux routes
 * scopées compte. Sert un candidat du pool d'alternatives, qui n'est PAS un
 * compte possédé du portefeuille : `CrmReadService.findAccountPresence` ne
 * l'exige déjà pas (voir `describeAccountHistory`, appelé à l'analyse AVANT
 * qu'un compte existe), seule la route accountId l'imposait.
 */
export class CopilotCrmCompanyPresenceDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      companyName: z.string().trim().min(1).max(200),
      domain: z.string().trim().min(1).max(300).optional(),
      siren: z.string().trim().min(1).max(20).optional(),
    })
    .strict(),
) {}
// #3181.4 (épopée #3247) — le lien SIREN partenaire↔client, lu pour UN POOL de candidats d'un coup
// (jamais un aller-retour par candidat).
export class CopilotAccessBySirenDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      sirens: z
        .array(
          z
            .string()
            .trim()
            .regex(/^\d{9}$/),
        )
        .min(1)
        .max(20),
    })
    .strict(),
) {}
// #4289.12 — le stade de relation par SIREN : la forme vient du contrat partagé ia ↔ api, jamais redite ici.
export class CopilotRelationStagesBySirenDto extends createZodDto(relationStagesBySirenRequestSchema) {}
// #2271.19 — même forme que `CopilotCrmPresenceDto` : un compte s'ouvre TOUJOURS
// par son id ET l'utilisateur qui lit, jamais l'un sans l'autre.
export class CopilotAccountTimelineDto extends createZodDto(
  z.object({ userId: z.string().guid(), accountId: z.string().guid() }).strict(),
) {}
// #3895 — les notes d'UN compte : même forme (compte ET utilisateur qui lit).
export class CopilotAccountNotesDto extends createZodDto(
  z.object({ userId: z.string().guid(), accountId: z.string().guid() }).strict(),
) {}
// #2623.1 — même forme, encore : « découvrir → analyser → proposer les
// contacts » manquait cette porte-ci pour enchaîner sans quitter la
// conversation.
export class CopilotAccountContactsDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      accountId: z.string().guid(),
      // #2533 (recette prod 07/10, UNEO) — « qui contacter à la DSI de X » :
      // la FONCTION cherchée dans TOUS les contacts du compte, pas seulement
      // les cinq premiers du classement.
      titleQuery: z.string().trim().min(1).max(120).optional(),
      // #2547 — « N personnes par entreprise » : jusqu'à dix, cinq par défaut.
      limit: z.number().int().min(1).max(10).optional(),
    })
    .strict(),
) {}
// #3182.2 (épopée #3248) — même forme, encore : l'historique de staffing d'UN
// compte, jamais un vivier balayé en entier.
export class CopilotAccountStaffingHistoryDto extends createZodDto(
  z.object({ userId: z.string().guid(), accountId: z.string().guid() }).strict(),
) {}
// #2308 (LAU-FINAL-049) — même forme, encore : la carte de couverture du chat
// s'ouvre TOUJOURS par le compte ET l'utilisateur qui lit.
export class CopilotAccountCoverageMapDto extends createZodDto(
  z.object({ userId: z.string().guid(), accountId: z.string().guid() }).strict(),
) {}
// #2985 (revue manager, section G de #2319) — même forme, encore : un compte
// s'ouvre TOUJOURS par son id ET l'utilisateur qui lit.
export class CopilotAccountManagerReviewDto extends createZodDto(
  z.object({ userId: z.string().guid(), accountId: z.string().guid() }).strict(),
) {}
// #2285.2 (épopée #2786) — même forme, encore : la façade canonique d'UN
// compte (`AccountIntelligenceContextService.contextFor`) s'ouvre TOUJOURS
// par le compte ET l'utilisateur qui lit.
export class CopilotAccountIntelligenceContextDto extends createZodDto(
  z.object({ userId: z.string().guid(), accountId: z.string().guid() }).strict(),
) {}
// #3277.1 (épopée #3277, BEL-SC-225 suite) — même forme, encore : la
// projection 5P s'ouvre TOUJOURS par le compte ET l'utilisateur qui lit,
// jamais l'un sans l'autre.
export class CopilotAccountStrategy5PDto extends createZodDto(
  z.object({ userId: z.string().guid(), accountId: z.string().guid() }).strict(),
) {}
// #3258.14 (épopée #3362, lot E25 30/09) — même forme, encore : la matrice
// intérêt × pénétrabilité s'ouvre TOUJOURS par le compte ET l'utilisateur qui
// lit, jamais l'un sans l'autre.
export class CopilotAccountInterestPenetrabilityDto extends createZodDto(
  z.object({ userId: z.string().guid(), accountId: z.string().guid() }).strict(),
) {}
export class CopilotPartnerPipelineDto extends createZodDto(userOnly) {}
export class CopilotTerritoryDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      /** Un département français : deux chiffres, ou `2A` / `2B`, ou un DOM. */
      department: z.string().trim().min(1).max(10),
      /** Fenêtre d'observation des offres. Défaut 90 jours, comme l'écran. */
      sinceDays: z.number().int().min(1).max(730).optional(),
    })
    .strict(),
) {}
export class CopilotDormantContactsDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      /** Le silence minimum, en MOIS. Défaut 6 — l'option la plus utilisée à l'écran. */
      months: z.number().int().min(1).max(60).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      /** La langue des libellés d'axes rendus à Laura. Défaut français, comme le produit. */
      locale: z.enum(['fr', 'en']).optional(),
    })
    .strict(),
) {}

/**
 * Les contacts qui ont PEUT-ÊTRE changé de poste (§14, tome 4 / tome 6 §16).
 *
 * Aucun filtre : `contactsWhoMayHaveMoved` ne s'ouvre pas au-delà de
 * l'espace de l'appelant, comme `search_partners`.
 */
export class CopilotJobChangesDto extends createZodDto(userOnly) {}

/**
 * PRÉPARER UNE ANALYSE, PUIS LA LANCER (#1489).
 *
 * Deux appels, et pas un : le premier rend ce qu'on sait déjà du compte, le
 * coût, le solde et les QUESTIONS ; le second lance, et n'accepte qu'un jeton
 * que seul le premier sait produire.
 *
 * ⚠️ Le nom d'entreprise n'est pas validé par `companyNameRejection` ici : c'est
 * `AnalysisService.start` qui tranche, et le faire deux fois ferait deux
 * vérités sur ce qu'est un nom acceptable. La préparation, elle, doit pouvoir
 * répondre « ce nom ne marchera pas » sans que le contrôleur ait déjà jeté.
 */
export class CopilotAnalysisPlanDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      company: z.string().trim().min(1).max(200),
      /** La langue des questions rendues. Défaut français, comme le produit. */
      locale: z.enum(['fr', 'en']).optional(),
    })
    .strict(),
) {}

export class CopilotAnalysisStartDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      company: z.string().trim().min(1).max(200),
      /** Le jeton rendu par la préparation. Sans lui, rien ne part. */
      planToken: z.string().trim().min(1).max(400),
      preset: analysisContextPresetSchema.optional(),
      /**
       * Les réponses aux questions, champ par champ.
       *
       * ⚠️ TOUTES facultatives, et c'est le cœur de la décision : « possibilité
       * de go sans avoir répondu à tout ». Un objet vide est un contexte valide
       * — le run part comme il serait parti depuis l'écran sans rien saisir.
       */
      answers: z.record(z.string(), z.string().trim().max(1000)).optional(),
      // #2624.1 — le mécanisme existe déjà (`analysisScopeSelectionSchema`,
      // consommé par `AnalysisService.start`) : il manquait seulement ICI. Ce
      // DTO est `.strict()`, donc un cadrage envoyé par la conversation était
      // silencieusement rejeté — jamais une erreur, juste une clé qui disparaît.
      scope_mode: analysisScopeModeSchema.optional(),
      scope_selection: analysisScopeSelectionSchema.optional(),
      /**
       * #3704.5 — l'identité LÉGALE d'une entreprise trouvée par la recherche : même
       * format que `startAnalysisSchema.siren` (le scope lock), jamais deviné par le modèle.
       */
      siren: z
        .string()
        .regex(/^\d{9}$/)
        .optional(),
      /**
       * #3218 (lot RAW, recette G4 prod 11/10) — une relance DEMANDÉE dans la conversation
       * (« lance-la » après la question de périmètre, mode Approfondi, « relance l'analyse »).
       * Sans elle, `AnalysisService.start` réutilise tout dossier frais (`cache_hit`) : ce DTO
       * `.strict()` la rejetait, un lancement demandé rendait « dossier réutilisé sans débit ».
       */
      relaunch: z.boolean().optional(),
    })
    .strict(),
) {}

/**
 * #1596.6-10 / #1628.1 — LA RECHERCHE PAR FILTRE dans la mémoire marché, à
 * l'inverse de toutes les lectures ci-dessus qui partent d'une IDENTITÉ.
 *
 * `userId` est porté comme sur chaque DTO de ce pont — l'appelant interne dit
 * pour QUI il lit. La lecture du CORPUS n'est PAS scopée par espace : les tables
 * de la mémoire marché sont PARTAGÉES entre tous les espaces (GA-16). ⚠️ #1961.21
 * — `userId` sert désormais à résoudre l'espace de l'appelant pour lire SON
 * portefeuille (le lien vers la fiche d'un compte), jamais à filtrer le corpus.
 *
 * ⚠️ Le `.refine()` est la MÊME règle que celle que `MarketMemoryService
 * .searchByFilters` applique elle-même : au moins un filtre discriminant est
 * obligatoire. La dupliquer ici n'invente rien — elle transforme un refus
 * profond (`BadRequestException` levée dans le service) en un 400 immédiat, à
 * la porte, avant même d'atteindre le service. Les deux DOIVENT dire la même
 * chose ; c'est le service qui reste la source de vérité (GA-258).
 */
export class CopilotMarketMemorySearchDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      /** Une technologie citée par les parcours observés (ex. « Java »). */
      technology: z.string().trim().min(1).max(120).optional(),
      /** Ville, région ou pays de la zone OBSERVÉE (#1608 / #1630.10). */
      location: z.string().trim().min(1).max(120).optional(),
      /** #1961.5 — la VILLE seule, distincte de `location` (le repli large). */
      city: z.string().trim().min(1).max(120).optional(),
      /** #1961.5 — la RÉGION seule, même logique que `city`. Département reste
       *  absent : le corpus ne porte pas cette donnée (voir `MarketMemoryService`). */
      region: z.string().trim().min(1).max(120).optional(),
      /** Une société de services observée autour des entreprises cherchées. */
      esn: z.string().trim().min(1).max(120).optional(),
      /** Une famille de rôles observée (ex. « Data »). */
      roleFamily: z.string().trim().min(1).max(120).optional(),
      employeeMin: z.number().int().min(0).max(5_000_000).optional(),
      employeeMax: z.number().int().min(0).max(5_000_000).optional(),
      /**
       * #2991 (#2287.15) — la TAILLE, une valeur FERMÉE du corpus
       * (`headcount_bracket`, ex. « 51-200 »), distincte de `employeeMin` /
       * `employeeMax` (des bornes chiffrées).
       */
      size: z.string().trim().min(1).max(120).optional(),
      /**
       * #2991 (#2287.17) — le RECOURS EXTERNE OBSERVÉ, GÉNÉRIQUE : distinct
       * d'`esn` (une société de services NOMMÉE). `z.literal(true)` — jamais
       * `z.boolean()` — parce que `false` n'est pas un filtre valide ici
       * (doctrine c65/GA-259, voir `MarketMemoryService`) : l'accepter
       * laisserait croire qu'on peut demander « n'externalise pas ».
       */
      externalRecourseObserved: z.literal(true).optional(),
      /**
       * #2991 (#2287.14) — LE TYPE D'ENTREPRISE, au sens de la SEULE
       * classification que porte le corpus (`is_service_company`). `z.literal(true)`
       * — même raison qu'`externalRecourseObserved` (c65/GA-259) : la colonne
       * défaut à `false` à l'ingestion quand la cellule est vide, `false`
       * mélangerait « mesuré non-ESN » et « non mesuré ».
       */
      isServiceCompany: z.literal(true).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    })
    .strict()
    .refine(
      value =>
        Boolean(
          value.technology ||
          value.location ||
          value.city ||
          value.region ||
          value.esn ||
          value.roleFamily ||
          value.employeeMin !== undefined ||
          value.employeeMax !== undefined ||
          value.size ||
          value.externalRecourseObserved ||
          value.isServiceCompany,
        ),
      {
        message:
          'Au moins un filtre est requis : technologie, localisation, ville, région, société de services ' +
          'observée, famille de rôle, effectif, taille, recours externe observé, ou type d’entreprise.',
      },
    ),
) {}

/**
 * #1611.4 / #1611.5 — LA MÉMOIRE MARCHÉ PAR IDENTITÉ, POUR LE PLAN ET LES MESSAGES.
 *
 * Contrairement à `CopilotMarketMemorySearchDto` (recherche PAR CRITÈRES), cet
 * appel part d'une IDENTITÉ — la même forme que `MarketCompanyLookup`
 * (`market-memory.service.ts`) : `ref` est l'identifiant de l'appelant (ici
 * `accountId`, pour qu'il s'y retrouve dans ses logs), `companyName` est le nom
 * à résoudre. Relayé TEL QUEL vers `MarketMemoryService.coverageFor` — aucune
 * seconde règle de résolution ici (GA-258 : un seul point d'entrée).
 */
export class CopilotMarketMemoryContextDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      ref: z.string().trim().min(1).max(200),
      companyName: z.string().trim().min(1).max(200),
      website: z.string().trim().min(1).max(300).optional(),
      country: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
) {}

/**
 * #2284.26 (#2978, lot SRC2 28/09/2026) — MÊME forme que
 * `CopilotMarketMemoryContextDto` ci-dessus (une identité, pas un critère) :
 * le résolveur d'entité (`apps/ia`) demande le domaine que la mémoire marché
 * peut PROUVER par alias pour ce compte. Relayé TEL QUEL vers
 * `MarketMemoryService.aliasProvenDomain`.
 */
export class CopilotMarketAliasDomainDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      ref: z.string().trim().min(1).max(200),
      companyName: z.string().trim().min(1).max(200),
      website: z.string().trim().min(1).max(300).optional(),
      country: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
) {}

/**
 * #3177.2 / épopée #3225 — LA MÉMOIRE MARCHÉ D'UN GROUPE : une entité racine
 * (le compte résolu, `company_id`) et ses filiales connues, une entrée par
 * entité, MÊME forme que {@link CopilotMarketMemoryContextDto} répétée — pas
 * un second contrat d'identité. `entities[0]` EST la racine : c'est elle qui
 * porte `rootAccountId` pour que le service puisse rendre sa route de fiche
 * (`/accounts/:id`), et c'est sa panne, seule, qui rend le groupe entier
 * `unavailable` (voir `MarketMemoryService.coverageForGroup`).
 *
 * Bornée à {@link MARKET_MEMORY_GROUP_MAX_ENTITIES} ICI, à la porte — la MÊME
 * constante que le service applique lui-même en second rempart (GA-258 : un
 * seul point d'entrée, mais un refus qui n'attend pas de l'atteindre).
 */
const marketMemoryGroupEntitySchema = z.object({
  ref: z.string().trim().min(1).max(200),
  companyName: z.string().trim().min(1).max(200),
  website: z.string().trim().min(1).max(300).optional(),
  country: z.string().trim().min(1).max(120).optional(),
})

export class CopilotMarketMemoryGroupContextDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      rootAccountId: z.string().guid(),
      entities: z.array(marketMemoryGroupEntitySchema).min(1).max(MARKET_MEMORY_GROUP_MAX_ENTITIES),
    })
    .strict(),
) {}

/**
 * Laura compte avant de proposer (décision Louis, 15/09/2026) — RÉUTILISE le
 * contrat PUBLIC de `/contacts` (`contactListQuerySchema`, le MÊME que
 * `ListContactsDto`) : pas de seconde vérité sur ce qu'un filtre accepte. Le
 * service IA n'y ajoute que ce qu'il traduit lui-même depuis l'URL proposée
 * (ex. `dormant` → `dormantMonths`) avant d'appeler ce pont — voir
 * `_contacts_count_payload` (`chat_tools.py`).
 */
export class CopilotContactsCountDto extends createZodDto(withUser(contactListQuerySchema)) {}

/**
 * #2337 — le terrain de jeu multi-talents : deux à quatre profils du vivier.
 * Un seul profil a déjà son écran (le marché inversé) ; au-delà de quatre, ce
 * n'est plus un terrain de jeu COMMUN (`TERRITORY_PLAN_MAX_TALENTS`).
 */
export class CopilotTerritoryPlanDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      consultantIds: z.array(z.string().guid()).min(2).max(4),
    })
    .strict(),
) {}

/**
 * #3816.1 — le marché inversé d'UN talent, lu par Laura. `.strict()` : l'espace
 * vient du demandeur, jamais de l'appelant.
 */
export class CopilotReverseMarketDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      consultantId: z.string().guid().optional(),
      // KEVIN-FIX K.6 — le profil dit EN TEXTE LIBRE : sa zone (départements) et ses compétences priment sur la fiche.
      skills: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
      zones: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
    })
    .strict()
    .refine(dto => Boolean(dto.consultantId) || (dto.skills?.length ?? 0) > 0, {
      message: 'consultantId ou skills requis',
    }),
) {}

/**
 * #2987.56 — la file des notes de frais SOUMISES qui attendent une décision
 * (valider/refuser), pour qu'une session (vocale ou texte) avec Laura puisse
 * proposer la décision — jamais l'exécuter (`_proposal`, côté service IA). Le
 * montant n'en sort JAMAIS (`canReadFinance: false` EN DUR côté contrôleur,
 * même motif que `talents/search` pour le TJM) : ce pont interne n'a pas de
 * rôle à faire valoir. `reportId` optionnel resserre la file à UNE note
 * précise (déjà nommée dans la conversation) plutôt que de la relister.
 */
export class CopilotExpenseReportsPendingDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      reportId: z.string().guid().optional(),
    })
    .strict(),
) {}
