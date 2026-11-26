import {
  ACCOUNT_MEMORY_KINDS,
  meetingInternalOutputKindSchema,
  meetingNotesInputKindSchema,
  meetingRecapSnapshotSchema,
} from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Un enregistrement déposé par l'utilisateur, en base64 — même convention que
 * l'ingestion RAG (`fileB64`), parce que le dépôt n'a pas de parseur multipart
 * et qu'en ajouter un pour une route n'en vaut pas le coût.
 */
export const transcribeSchema = z
  .object({
    audioB64: z.string().min(1).max(34_000_000),
    filename: z.string().trim().min(1).max(200),
    /** Code langue ISO. Sur des notes courtes, la détection automatique se
     *  trompe et rend un texte en anglais approximatif. */
    language: z
      .string()
      .trim()
      .regex(/^[a-z]{2}$/)
      .optional(),
    /**
     * #2319.57 — l'accord EXPLICITE des participants à l'enregistrement.
     *
     * Un `true` littéral, pas un booléen : un dépôt sans case cochée n'a pas de
     * forme qui passe. Le geste de dépôt seul ne vaut plus consentement — il dit
     * « j'ai un fichier », pas « ils ont accepté d'être enregistrés ».
     */
    recordingConsent: z.literal(true),
  })
  .strict()

export class TranscribeDto extends createZodDto(transcribeSchema) {}

/**
 * #2103.4 — un document joint (PDF/Word), en base64 — même convention que
 * `transcribeSchema.audioB64` : le dépôt n'a pas de parseur multipart. Borne
 * alignée sur `CV_UPLOAD_MAX_BYTES` (8 Mo) : un brief de rendez-vous n'a pas
 * de raison d'être plus lourd qu'un CV.
 */
export const extractMeetingDocumentSchema = z
  .object({
    fileB64: z.string().min(1).max(12_000_000),
    filename: z.string().trim().min(1).max(200),
  })
  .strict()

export class ExtractMeetingDocumentDto extends createZodDto(extractMeetingDocumentSchema) {}

/** Des notes brutes — tapées, collées, ou issues d'une transcription. */
export const structureNotesSchema = z
  .object({
    notes: z.string().trim().min(1).max(60_000),
    accountId: z.string().guid().optional(),
    attendees: z.string().trim().max(500).optional(),
    /**
     * Le texte vient-il d'une transcription ?
     *
     * C'est la seule information qui décide si un extrait CITABLE existe.
     * Exiger une citation sur des notes résumées revient à en faire fabriquer
     * une — donc le défaut est `false`, l'hypothèse prudente.
     */
    fromTranscript: z.boolean().optional(),
    /**
     * #2319.61-.62 — la nature du texte COLLÉ : notes, compte rendu importé,
     * e-mail. Un e-mail arrive ici parce que l'utilisateur l'a collé : aucune
     * route ne lit la boîte pour le trouver (D58, D65).
     */
    inputKind: meetingNotesInputKindSchema.optional(),
    /** #2319.63 — la déclaration de l'utilisateur, DISTINCTE des notes. */
    userStatement: z.string().trim().min(1).max(10_000).optional(),
    /**
     * #2103.37 — l'id du RENDEZ-VOUS source (`agendaEventSchema.id`), quand ce
     * compte rendu en vient un. Jamais deviné côté serveur : absent, le compte
     * rendu reste rattaché à rien de précis (notes libres).
     */
    sourceEventId: z.string().trim().min(1).max(200).optional(),
  })
  .strict()

export class StructureNotesDto extends createZodDto(structureNotesSchema) {}

/**
 * La validation EN LOT des écritures internes.
 *
 * ⚠️ **`kinds` ne peut pas nommer un brouillon externe, et c'est là que la
 * promesse « aucune action externe envoyée » est tenue.** Le schéma n'accepte
 * que les sept sorties internes : `follow_up_email` et `reminder` n'ont pas de
 * case où loger, ni au compilateur, ni à l'exécution. Il n'y a pas de drapeau
 * « ne pas envoyer » à oublier de cocher — la requête n'a pas de forme qui le
 * permette. Retirer le MOYEN, pas la permission.
 */
export const approveInternalSchema = z
  .object({
    kinds: z.array(meetingInternalOutputKindSchema).min(1).max(8),
    /**
     * #2855 (#2201.14) — le rendez-vous SOURCE du compte rendu qui compose
     * cette approbation, quand l'appelant le connaît (même champ que
     * `structureNotesSchema.sourceEventId`, jamais recalculé). Nomme la
     * PROVENANCE d'une proposition `crm_stage` — quel fil l'a composée —
     * plutôt que de la laisser à `null` par défaut.
     */
    sourceEventId: z.string().trim().min(1).max(200).optional(),
    /** Les actions retenues, quand `next_steps` fait partie du lot. */
    tasks: z
      .array(
        z
          .object({
            subject: z.string().trim().min(1).max(300),
            body: z.string().trim().max(4000).optional(),
            dueAt: z.string().datetime({ offset: true }),
            contactId: z.string().trim().min(1).max(100).optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    /**
     * #1934.18 — le stade RETENU, quand `crm_stage` fait partie du lot.
     *
     * L'affaire se saisit, elle ne se devine pas : le compte rendu propose un
     * LIBELLÉ de stade et ne sait pas quelle affaire du portail il désigne.
     * Absent = aucune proposition n'est déposée, et la réponse le dit
     * (`skipped`) — jamais une affaire choisie à notre place.
     *
     * ⚠️ Rien ici n'ouvre un chemin d'ÉCRITURE : ce corps dépose une demande
     * dans la file de validation. Le stade part quand quelqu'un l'autorise sur
     * sa prévisualisation figée, et pas avant.
     */
    crmStage: z
      .object({
        dealId: z.string().trim().min(1).max(100),
        /**
         * L'IDENTIFIANT du stade, choisi dans la liste RÉELLE du portail
         * (`GET /crm/deal-pipelines`). Jamais un libellé : l'API le vérifie contre
         * le pipeline de l'affaire et refuse le reste. Le nom de l'affaire, son
         * stade actuel et le libellé du stade visé sont relus sur le portail,
         * pas pris ici.
         */
        stageId: z.string().trim().min(1).max(120),
        rationale: z.string().trim().max(500).optional(),
      })
      .strict()
      .optional(),
    /**
     * #1903.12 — le compte rendu à écrire, quand `recap` fait partie du lot.
     *
     * `accountId` est envoyé par l'appelant (l'écran connaît déjà le compte
     * ouvert) : jamais deviné côté serveur. Absent ⇒ `skipped`, comme
     * `next_steps` sans tâche retenue.
     */
    recap: z
      .object({
        accountId: z.string().guid(),
        body: z.string().trim().min(1).max(20_000),
        /**
         * #3758 — l'instantané structuré (décisions, prochaines étapes,
         * relance) tel que l'écran l'a dérivé (`meetingRecapApprovalInput`),
         * jamais reconstruit ici. `null`/absent : rien n'est enregistré, pas
         * un objet vide.
         */
        snapshot: meetingRecapSnapshotSchema.nullable().optional(),
      })
      .strict()
      .optional(),
    /**
     * #2777 — les personnes CITÉES, RETENUES, quand `contacts` fait partie du
     * lot. `accountId` est envoyé par l'appelant (l'écran connaît déjà le
     * compte ouvert) : jamais deviné côté serveur. Absent ⇒ `skipped`, même
     * règle que `recap`.
     */
    contacts: z
      .object({
        accountId: z.string().guid(),
        mentioned: z
          .array(
            z
              .object({
                fullName: z.string().trim().min(1).max(160),
                role: z.string().trim().max(160).optional(),
              })
              .strict(),
          )
          .min(1)
          .max(20),
      })
      .strict()
      .optional(),
    /**
     * #2777 — l'opportunité RETENUE, quand `opportunity` fait partie du lot.
     * `accountId` est envoyé par l'appelant, même règle que `contacts`. Le
     * dépôt ne fait qu'une chose : proposer un Deal dans la file de validation
     * CRM — rien n'écrit avant qu'un humain l'y autorise.
     */
    opportunity: z
      .object({
        accountId: z.string().guid(),
        title: z.string().trim().min(1).max(200),
      })
      .strict()
      .optional(),
    /**
     * #2777 — le besoin RETENU, quand `need` fait partie du lot. `accountId`
     * est envoyé par l'appelant, même règle que ses voisines. Aucun
     * `projectId` : #2558.1 fait d'un besoin sans projet un état valide.
     */
    need: z
      .object({
        accountId: z.string().guid(),
        title: z.string().trim().min(1).max(200),
        detail: z.string().trim().max(1000).optional(),
      })
      .strict()
      .optional(),
    /**
     * #2777 — les apprentissages RETENUS, quand `learnings` fait partie du
     * lot. `accountId` est envoyé par l'appelant, même règle que ses
     * voisines. Bande `n4_bounded_auto` : l'API écrit directement, sans file
     * de validation — ni CRM ni ERP.
     */
    learnings: z
      .object({
        accountId: z.string().guid(),
        entries: z
          .array(
            z
              .object({
                kind: z.enum(ACCOUNT_MEMORY_KINDS),
                content: z.string().trim().min(1).max(1000),
              })
              .strict(),
          )
          .min(1)
          .max(20),
      })
      .strict()
      .optional(),
    /**
     * #2103.10 — le problème client RETENU, quand `client_issue` fait partie
     * du lot. `accountId` envoyé par l'appelant, même règle que ses voisines.
     * Même gabarit que `need` : un problème n'a pas de `projectId`.
     */
    clientIssue: z
      .object({
        accountId: z.string().guid(),
        title: z.string().trim().min(1).max(200),
        detail: z.string().trim().max(1000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export class ApproveInternalDto extends createZodDto(approveInternalSchema) {}

/**
 * Les actions RETENUES par l'utilisateur, à poser dans le CRM.
 *
 * L'utilisateur envoie ce qu'il a choisi, pas un identifiant de compte rendu :
 * c'est ce qui rend la confirmation réelle. Une route qui prendrait « le compte
 * rendu n°12 » créerait des tâches que personne n'a relues.
 */
export const createTasksSchema = z
  .object({
    tasks: z
      .array(
        z
          .object({
            subject: z.string().trim().min(1).max(300),
            body: z.string().trim().max(4000).optional(),
            dueAt: z.string().datetime({ offset: true }),
            contactId: z.string().trim().min(1).max(100).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()

export class CreateTasksDto extends createZodDto(createTasksSchema) {}

/** #2103.1 — l'id du rendez-vous à vérifier, tel que rendu par l'agenda. */
export const recapStatusQuerySchema = z
  .object({
    sourceEventId: z.string().trim().min(1).max(200),
  })
  .strict()

export class RecapStatusQueryDto extends createZodDto(recapStatusQuerySchema) {}
