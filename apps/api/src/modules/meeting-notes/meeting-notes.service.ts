import {
  buildMeetingCascade,
  computeContactLifecycleState,
  // #2103.4 — même borne que le dépôt d'un CV (PDF 3 §3.2) : un brief de
  // rendez-vous n'a pas de raison d'être plus lourd qu'un CV.
  CV_UPLOAD_MAX_BYTES,
  type MeetingCascade,
  type MeetingDate,
  type MeetingEvidence,
  type MeetingExtractedItem,
  type MeetingInternalOutputKind,
  type MeetingNotesInputKind,
  type MeetingRecap,
  type MeetingRecapSnapshot,
  type MeetingSource,
  type WriteSource,
} from '@bellum/contracts'
import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { AccountsService } from '../accounts/accounts.service'
import { CrmService } from '../crm/crm.service'
import { AccountMemoryService } from '../crm-core/account-memory.service'
import { NotesService } from '../crm-core/notes.service'
import { readExtractedText, readExtractionPartial, readFailureDetail } from '../ia/document-extraction-envelope'
import { IaClient } from '../ia/ia.client'
// #2777 — LA porte d'écriture d'un besoin (GA-26, voir le docblock de
// `ProjectPipelineService.saveNeed` : « à un seul endroit »). Réutiliser cette
// écriture plutôt que de la refaire par un repository direct comme `contacts`
// est un import cross-module de PLUS (GA-07, relèvement jumeau dans
// `module-boundaries.spec.ts`) — le coût assumé pour ne pas dupliquer la
// projection d'un besoin, que ce fichier porte déjà comme dette écrite.
import { ProjectPipelineService } from '../projects/project-pipeline.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
// #1939.14 — le client de transcription vit dans un module NEUTRE : il sert le
// compte rendu de rendez-vous ET le message vocal de Laura, sans appartenir à l'un.
import { MAX_AUDIO_BYTES, readTranscriptionConfig, transcribeAudio } from '../transcription/transcription.client'
import { type BusinessUnitScopeClause } from '../accounts/business-unit-scope.clause'
import { ContactEntity } from '../../database/entities/contact.entity'
// #2777 — un critère PUR, jamais le SERVICE `ContactsService` d'un autre
// module (GA-07 compte les imports service-à-service ; la persistance seule
// ne le justifie pas ici, voir `this.contacts` plus bas). Même critère de
// doublon que `ContactsService.createFromCrmPresence`.
import { normalizeFullName } from '../contacts/contact-identity'
import { foldForNameMatch, MIN_FOLDED_NAME_LENGTH } from '../contacts/contact-name-match'

/**
 * Découpe des notes en fragments exploitables.
 *
 * Le découpage d'origine ne coupait QUE sur les retours à la ligne. Or personne
 * ne colle une liste à puces dans une démonstration : on colle un paragraphe.
 * Résultat vu en production — un seul fragment, donc le résumé, la décision et
 * les notes étaient le même bloc de texte, recopié trois fois à l'écran. Un
 * prospect y voyait la fonctionnalité ne rien faire.
 *
 * On coupe donc aussi sur la ponctuation de fin de phrase. Les fragments d'un
 * mot sont écartés : ils viennent des abréviations et ne racontent rien.
 */
function splitNotes(notes: string): string[] {
  return notes
    .split(/\r?\n|(?<=[.!?;])\s+/)
    .map(part => part.trim().replace(/^[-•*]\s*/, ''))
    .filter(part => part.length > 0 && /\s/.test(part))
}

/**
 * Le compte rendu joué en démonstration.
 *
 * Dérivé des fragments RÉELLEMENT tapés par le visiteur, et volontairement
 * mécanique : montrer la FORME du livrable sans faire croire à une analyse, et
 * sans appeler un modèle depuis un espace public.
 *
 * La règle que la première version violait : **aucun fragment ne paraît deux
 * fois**. Un résumé qui répète mot pour mot la décision juste en dessous ne
 * ressemble pas à un compte rendu, il ressemble à un copier-coller — ce qu'il
 * était. Les rôles se partagent donc les fragments sans recouvrement, dans
 * l'ordre où ils ont été écrits.
 *
 * Et quand il n'y a pas assez de matière, on le DIT plutôt que de renvoyer la
 * phrase du visiteur en guise de résumé.
 */
function demoRecap(notes: string, userStatement = '', sourceEventId: string | null = null): MeetingRecap {
  const parts = splitNotes(notes)
  // #2319.63 — la déclaration du visiteur reste À PART : elle devient SES
  // engagements, étiquetés comme sa déclaration, jamais comme une note.
  const declared: MeetingExtractedItem[] = splitNotes(userStatement).map(content => ({
    content,
    evidence: { kind: 'user-statement' },
  }))
  const sources: MeetingSource[] = [
    ...DEMO_SOURCES,
    ...(declared.length > 0 ? [{ kind: 'user_statement' as const, detail: '' }] : []),
  ]
  if (parts.length === 0) {
    return {
      ...EMPTY_RECAP,
      summary: 'Notes trop courtes pour un compte rendu.',
      userCommitments: declared,
      sources,
      sourceEventId,
    }
  }

  // Une question posée dans les notes reste une question ouverte — c'est le
  // seul classement qui repose sur un signe et non sur une position.
  const questions = parts.filter(part => part.endsWith('?'))
  const statements = parts.filter(part => !part.endsWith('?'))

  const [head, ...rest] = statements.length > 0 ? statements : parts
  // Le dernier fragment est le plus souvent ce qui a été convenu pour la suite.
  const nextStep = rest.length > 1 ? rest[rest.length - 1] : undefined
  const middle = nextStep ? rest.slice(0, -1) : rest
  const decisions = middle.slice(0, 3)

  // Ce qui reste APRÈS les trois décisions alimente les sorties de la partie
  // « après ». Le partage sans recouvrement d'origine tient donc toujours :
  // aucun fragment ne paraît deux fois, et une note courte produit exactement
  // ce qu'elle produisait avant ce chantier.
  const spare = middle.slice(3)
  const at = (index: number): string | undefined => spare[index]

  // En démonstration, l'entrée est TAPÉE : il n'y a aucune phrase du client à
  // citer, et `notes-derived` est la seule origine honnête. Prétendre citer un
  // transcript qui n'existe pas serait exactement la fabrication que ce champ
  // sert à empêcher.
  const derived: MeetingEvidence = { kind: 'notes-derived' }

  const opportunity = at(0)
  const need = at(1)
  const stageWhy = at(2)
  const objection = at(3)
  const followUp = at(4)
  // #2103.10 — distinct de `need`. Fragment ajouté en DERNIER (index 10) :
  // les index existants ne bougent pas, aucune démonstration déjà tapée ne se
  // relit autrement.
  const clientIssue = at(10)
  // #2319.64-.74 — les extractions séparées prennent les fragments SUIVANTS :
  // toujours aucun recouvrement, et une note courte n'en produit aucune.
  const item = (index: number): MeetingExtractedItem[] => {
    const content = at(index)
    return content ? [{ content, evidence: derived }] : []
  }
  const contact = firstFullName(notes)

  return {
    summary: head ?? '',
    decisions,
    nextSteps: nextStep ? [{ action: nextStep, owner: '', due: '', evidence: derived }] : [],
    openQuestions: questions.slice(0, 3),
    signals: [],
    // Le brouillon reprend ce qui a été décidé — rien d'ajouté, rien de promis.
    followUpEmail: followUp ?? '',
    // #2319.82 — des notes TAPÉES ne prouvent ni un projet confirmé ni un besoin
    // exprimé : la salle montre les deux libellés prudents, comme la production.
    opportunity: opportunity
      ? { title: opportunity, accountName: '', qualification: 'to_qualify', evidence: derived }
      : null,
    need: need ? { title: need, detail: '', qualification: 'potential', evidence: derived } : null,
    clientIssue: clientIssue ? { title: clientIssue, detail: '', evidence: derived } : null,
    mentionedContacts: contact ? [{ fullName: contact, role: '', evidence: derived }] : [],
    crmStage: stageWhy ? { proposedStage: 'Qualifié', rationale: stageWhy, evidence: derived } : null,
    // `dueLabel` reste VIDE : la démonstration ne fabrique pas plus d'échéance
    // que la production. La carte s'affiche sans date plutôt qu'avec une fausse.
    reminder: nextStep ? { content: nextStep, dueLabel: '', evidence: derived } : null,
    learnings: objection ? [{ kind: 'objection', content: objection, evidence: derived }] : [],
    facts: item(5),
    requests: item(6),
    criteria: item(7),
    // Une date n'est pas fabriquée depuis un fragment : la salle n'en montre pas.
    dates: [],
    clientCommitments: item(8),
    userCommitments: [...declared, ...item(9)],
    recapEvidence: derived,
    followUpEvidence: followUp ? derived : null,
    sources,
    // En démonstration, aucun modèle n'est appelé : ce zéro-là est VRAI.
    estimatedCredits: 0,
    sourceEventId,
  }
}

/** La démonstration ne lit que ce que le visiteur a tapé. Rien d'autre. */
const DEMO_SOURCES: readonly MeetingSource[] = [{ kind: 'notes', detail: '' }]

/**
 * Un compte rendu vide, dans sa forme COMPLÈTE.
 *
 * Écrit une fois plutôt que recopié à chaque retour : c'est ce qui garantit
 * qu'une sortie ajoutée au contrat ne reste pas absente d'un seul des chemins.
 */
const EMPTY_RECAP: MeetingRecap = {
  summary: '',
  decisions: [],
  nextSteps: [],
  openQuestions: [],
  signals: [],
  followUpEmail: '',
  opportunity: null,
  need: null,
  clientIssue: null,
  mentionedContacts: [],
  crmStage: null,
  reminder: null,
  learnings: [],
  facts: [],
  requests: [],
  criteria: [],
  dates: [],
  clientCommitments: [],
  userCommitments: [],
  recapEvidence: null,
  followUpEvidence: null,
  sources: [],
  estimatedCredits: null,
  sourceEventId: null,
}

/**
 * L'extrait rendu par le modèle, ou `null`.
 *
 * `null` n'est pas un défaut de repli : c'est le refus de laisser passer un
 * objet non sourcé en le présentant comme extrait. La cascade l'écartera et le
 * comptera. Un `excerpt` vide sous `kind: 'transcript'` est traité comme une
 * absence — un extrait vide ne cite personne.
 */
function readEvidence(value: unknown): MeetingEvidence | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (row['kind'] === 'notes-derived') return { kind: 'notes-derived' }
  // #2319.63 — la déclaration de l'utilisateur garde SON origine.
  if (row['kind'] === 'user-statement') return { kind: 'user-statement' }
  if (row['kind'] !== 'transcript') return null
  const excerpt = String(row['excerpt'] ?? '').trim()
  return excerpt ? { kind: 'transcript', excerpt: excerpt.slice(0, 500) } : null
}

/**
 * Un objet de la partie « après », gardé UNIQUEMENT s'il porte sa source.
 *
 * Le `read` rend le contenu sans la source ; c'est ici, à un seul endroit, que
 * la condition « pas de source, pas d'objet » s'applique aux cinq sorties
 * unitaires.
 */
function sourced<T>(
  row: Record<string, unknown> | null,
  read: (row: Record<string, unknown>) => T | null,
): (T & { evidence: MeetingEvidence }) | null {
  if (!row) return null
  const evidence = readEvidence(row['evidence'])
  if (!evidence) return null
  const content = read(row)
  return content ? { ...content, evidence } : null
}

/** Ce que la structuration lit — les notes, et ce qui les accompagne. */
type StructureInput = {
  notes: string
  accountId?: string
  attendees?: string
  fromTranscript?: boolean
  /** #2319.61-.62 */
  inputKind?: MeetingNotesInputKind
  /** #2319.63 */
  userStatement?: string
  /** #2103.37 — l'id du rendez-vous source, transmis par le client. */
  sourceEventId?: string | null
}

/** Une action retenue, telle qu'elle part vers le CRM. */
type MeetingTaskInput = { subject: string; body?: string; dueAt: string; contactId?: string }

/**
 * #1934.18 — la proposition de stade RETENUE par l'utilisateur.
 *
 * L'affaire ET le stade sont envoyés par l'appelant, pas devinés ici : le compte
 * rendu propose un LIBELLÉ de stade, il ne sait ni quelle affaire du portail il
 * désigne ni quel IDENTIFIANT de stade lui correspond. Deviner déplacerait la
 * mauvaise affaire, ou partirait avec un libellé que `dealstage` refuse. Même
 * règle que `tasks` : l'utilisateur envoie ce qu'il a choisi, dans la liste
 * réelle du portail.
 */
type MeetingStageInput = {
  dealId: string
  /** L'IDENTIFIANT du stade, jamais un libellé — voir `approveInternalSchema`. */
  stageId: string
  rationale?: string
}

/**
 * #1903.12 — le compte rendu RETENU, prêt à devenir une note.
 *
 * `accountId` est envoyé par l'appelant, jamais deviné ici : un compte rendu
 * sans compte identifié (réunion hors contexte) ne fabrique pas de cible.
 *
 * #3758 — `snapshot` est l'instantané structuré (décisions, prochaines
 * étapes, relance), tel que `meetingRecapApprovalInput` (`@bellum/contracts`)
 * l'a dérivé côté écran. Optionnel et additif : un appelant qui ne l'envoie
 * pas (ancien build, ou compte rendu sans rien de tout cela) écrit la note
 * exactement comme avant ce champ.
 */
type MeetingRecapWriteInput = { accountId: string; body: string; snapshot?: MeetingRecapSnapshot | null }

/**
 * #2777 — les personnes CITÉES, RETENUES par l'utilisateur, prêtes à devenir
 * des fiches.
 *
 * `accountId` est envoyé par l'appelant, jamais deviné ici — même règle que
 * `MeetingRecapWriteInput` : une personne citée hors contexte de compte ne
 * fabrique pas de cible.
 */
type MeetingContactMention = { fullName: string; role?: string }
type MeetingContactsWriteInput = { accountId: string; mentioned: readonly MeetingContactMention[] }

/**
 * #2777 — l'opportunité CANDIDATE, RETENUE par l'utilisateur, prête à être
 * PROPOSÉE comme Deal.
 *
 * `accountId` est envoyé par l'appelant, jamais deviné ici — même règle que
 * `MeetingContactsWriteInput`. Le nom du compte, lui, n'est PAS pris tel quel :
 * il est résolu côté serveur (voir `proposeOpportunity`), pour la même raison
 * que `structure()` ne fait pas confiance à un nom de compte fourni par le
 * client.
 */
type MeetingOpportunityWriteInput = { accountId: string; title: string }

/**
 * #2777 — le besoin EXPRIMÉ, RETENU par l'utilisateur, prêt à devenir une
 * ligne du pipe (`project_needs`).
 *
 * `accountId` est envoyé par l'appelant, jamais deviné ici — même règle que
 * ses voisines. Aucun `project_id` : #2558.1 a fait de « un besoin sans
 * projet » un état VALIDE (la majorité des missions d'ESN ne produisent aucun
 * signal public), donc rattacher ce besoin à un projet inventé fabriquerait
 * de la donnée vide pour satisfaire une contrainte qui n'existe plus.
 */
type MeetingNeedWriteInput = { accountId: string; title: string; detail?: string }

/**
 * #2103.10 — le problème client RETENU par l'utilisateur, prêt à rejoindre les
 * notes du compte. Même porte que `MeetingRecapWriteInput` (`notesService`) :
 * un problème décrit n'est ni un besoin de staffing ni une opportunité, il n'a
 * pas de cible dédiée — la note du compte est celle qui existe déjà.
 */
type MeetingClientIssueWriteInput = { accountId: string; title: string; detail?: string }

/**
 * #2777 — les apprentissages RETENUS, prêts à rejoindre la mémoire du compte.
 *
 * `accountId` est envoyé par l'appelant, jamais deviné ici — même règle que
 * ses voisines. Bande `n4_bounded_auto` (`MEETING_OUTPUT_AUTOMATION_LEVEL`) :
 * le clic de validation du lot EST le geste qui autorise l'écriture, aucune
 * file de validation — voir `AccountMemoryService`.
 */
type MeetingLearningEntry = { kind: 'objection' | 'commitment'; content: string }
type MeetingLearningsWriteInput = { accountId: string; entries: readonly MeetingLearningEntry[] }

/** L'issue d'une sortie approuvée. Le vocabulaire est celui de l'Action OS. */
export type MeetingApprovalResult = {
  outcomes: Array<{
    kind: MeetingInternalOutputKind
    /**
     * `proposed` (#1934.18) — DÉPOSÉE, pas écrite. Ni `done` (rien n'est parti)
     * ni `blocked` (le chemin existe) : la demande attend qu'un humain la
     * valide sur sa prévisualisation figée. Les confondre redirait exactement le
     * défaut que la porte corrige — « une action annoncée comme faite ne l'a pas
     * été ». EN FIN de liste : une valeur ne s'insère pas au milieu (GA-08).
     */
    outcome: 'done' | 'partial' | 'failed' | 'skipped' | 'blocked' | 'proposed'
    /** La capacité qui manque, quand l'issue est `blocked`. Jamais devinée. */
    missing: string | null
    detail: string | null
  }>
}

/**
 * #2777 — LES SEPT SORTIES INTERNES ONT DÉSORMAIS TOUTES LEUR PORTE.
 *
 * Cette table nommait ce qu'il fallait brancher pour chaque sortie encore
 * bloquée (`recap` en 09/2026, puis `crm_stage`, `contacts`, `opportunity`,
 * `need`, et enfin `learnings` avec ce lot). Elle est retirée plutôt que
 * laissée vide : un `Record<never, string>` qui ne sert plus à rien se relit
 * comme un vestige, alors que le contrôle qui la remplace — `kind` narrowé à
 * `never` en fin de boucle dans `approveInternal` — fait ÉCHOUER LA
 * COMPILATION si une HUITIÈME sortie interne arrivait sans son branchement.
 * C'est la même garantie que la table tenait, mais vérifiée par le
 * compilateur plutôt que par une entrée qu'on pourrait oublier d'ajouter.
 */

/**
 * Le premier nom propre du texte — deux mots capitalisés à la suite.
 *
 * Volontairement grossier, et volontairement silencieux quand il ne trouve
 * rien : la carte « personnes citées » n'apparaît alors pas. Une carte vide
 * vaudrait mieux qu'un faux nom, et pas de carte vaut mieux qu'une carte vide.
 */
function firstFullName(notes: string): string | undefined {
  const match = /\b(\p{Lu}[\p{L}'’-]+ \p{Lu}[\p{L}'’-]+)\b/u.exec(notes)
  return match?.[1]
}

/**
 * Notes de rendez-vous : transcrire, structurer, poser les actions.
 *
 * Trois gestes séparés, et c'est délibéré. Le rapport demande une chaîne
 * (§7.2 : capture → compte rendu → next steps → CRM), mais une chaîne qui
 * s'exécute d'un bloc ne laisse aucune place au « non, cette action n'est pas
 * pour moi ». Chaque étape rend son résultat ; c'est l'utilisateur qui appelle
 * la suivante.
 */
@Injectable()
export class MeetingNotesService {
  private readonly logger = new Logger(MeetingNotesService.name)

  constructor(
    private readonly ia: IaClient,
    private readonly workspaceContext: WorkspaceContextService,
    @Optional() private readonly accounts?: AccountsService,
    // Sans CRM connecté, on structure quand même : le compte rendu vaut par
    // lui-même. Seule la pose des tâches devient impossible, et elle le dit.
    @Optional() private readonly crm?: CrmService,
    // #1903.12 — la porte du carnet du compte. Optionnel comme `crm` : sans
    // lui, `recap` reste `blocked` plutôt que d'échouer au démarrage.
    @Optional() private readonly notesService?: NotesService,
    // #2777 — la porte du répertoire de contacts. Optionnel comme `notesService` :
    // sans lui, `contacts` reste `blocked` plutôt que d'échouer au démarrage.
    // Repository injecté DIRECTEMENT plutôt qu'un import du SERVICE
    // `ContactsService` d'un autre module (GA-07) : la persistance seule ne
    // justifie pas ce couplage-là ici.
    @Optional()
    @InjectRepository(ContactEntity)
    private readonly contacts?: Repository<ContactEntity>,
    // #2777 — la porte d'un besoin. Optionnel comme ses voisines : sans elle,
    // `need` reste `blocked` plutôt que d'échouer au démarrage.
    @Optional() private readonly projectPipeline?: ProjectPipelineService,
    // #2777 — la porte de la mémoire du compte. Optionnel comme ses voisines :
    // sans elle, `learnings` reste `blocked` plutôt que d'échouer au démarrage.
    @Optional() private readonly accountMemory?: AccountMemoryService,
  ) {}

  /** La transcription est-elle disponible sur ce serveur ? */
  status(): { available: boolean } {
    return { available: readTranscriptionConfig() !== null }
  }

  /**
   * #2103.1 — LE PRÉALABLE du déclencheur post-RDV : ce rendez-vous a-t-il
   * déjà un compte rendu ? `false` sans carnet de notes branché — même défaut
   * que `recap` (`blocked`) : on ne devine jamais qu'un CR existe.
   */
  async recapExists(userId: string, sourceEventId: string): Promise<{ exists: boolean }> {
    if (!this.notesService) return { exists: false }
    return { exists: await this.notesService.existsForSourceEvent(userId, sourceEventId) }
  }

  /**
   * Transcrit un enregistrement déposé par l'utilisateur.
   *
   * La borne de taille est vérifiée AVANT l'appel : envoyer vingt-cinq mégaoctets
   * pour se faire refuser au bout de deux minutes est la pire des réponses.
   */
  async transcribe(
    userId: string,
    input: { audioB64: string; filename: string; language?: string; recordingConsent?: boolean },
  ): Promise<{ text: string }> {
    // Salle de démonstration : un visiteur ne dépose pas l'enregistrement d'une
    // réunion de son entreprise sur un espace partagé, et la démo ne consomme
    // aucun service payant. Le refus est explicite.
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      throw new BadRequestException(
        'Le dépôt d’un enregistrement est désactivé dans l’espace de démonstration. Colle des notes pour voir le compte rendu.',
      )
    }
    // #2319.57 — aucun enregistrement transcrit sans l'accord EXPLICITE des
    // participants. Le schéma l'exige déjà ; le service le vérifie aussi, parce
    // qu'un appelant interne ne passe pas par le schéma. AVANT toute lecture de
    // configuration ou tout appel réseau.
    if (input.recordingConsent !== true) {
      throw new BadRequestException(
        'Un enregistrement ne se transcrit qu’avec l’accord explicite des participants. Coche-le, ou colle tes notes.',
      )
    }
    const config = readTranscriptionConfig()
    if (!config) {
      throw new ServiceUnavailableException(
        'La transcription n’est pas activée sur ce serveur. Colle tes notes écrites : le compte rendu fonctionne pareil.',
      )
    }
    const audio = Buffer.from(input.audioB64, 'base64')
    if (audio.length === 0) throw new BadRequestException('Enregistrement illisible.')
    if (audio.length > MAX_AUDIO_BYTES) {
      throw new BadRequestException(
        `Enregistrement trop long (${Math.round(audio.length / 1024 / 1024)} Mo). La limite est de ${MAX_AUDIO_BYTES / 1024 / 1024} Mo.`,
      )
    }
    return { text: await transcribeAudio(config, { audio, filename: input.filename, language: input.language }) }
  }

  /**
   * #2103.4 — le TEXTE d'un document joint (PDF/Word), avant de le proposer
   * comme matière d'un compte rendu.
   *
   * Réutilise `/cv/extract` (apps/ia) : la lecture est GÉNÉRIQUE
   * (`extract_document_text`, PDF/DOCX/XLSX/PPTX/RTF/texte), pas propre au
   * vivier — voir `document-extraction-envelope.ts` (GA-26 : un réglage vit à
   * un seul endroit, pas un second parseur pour le même besoin).
   *
   * Aucun geste de démonstration à refuser ici, contrairement à `transcribe` :
   * l'extraction ne coûte rien (pas de clé, pas d'appel payant) et ne dépose
   * aucun fichier — seul le texte lu traverse, exactement comme un collage
   * manuel. Un fichier illisible rend une erreur NOMMÉE, jamais un texte
   * inventé ni un compte rendu vide.
   */
  async extractDocument(input: { fileB64: string; filename: string }): Promise<{ text: string; partial: boolean }> {
    const bytes = Buffer.from(input.fileB64, 'base64')
    if (bytes.byteLength === 0) throw new BadRequestException('Fichier vide ou encodage invalide.')
    if (bytes.byteLength > CV_UPLOAD_MAX_BYTES) {
      throw new BadRequestException(
        `Ce fichier dépasse ${Math.round(CV_UPLOAD_MAX_BYTES / (1024 * 1024))} Mo — colle le texte directement.`,
      )
    }
    let envelope: unknown
    try {
      envelope = await this.ia.cvExtract({ fileB64: input.fileB64, filename: input.filename })
    } catch (error) {
      this.logger.warn(`Extraction de document : le service IA n’a pas répondu pour ${input.filename}`, { error })
      throw new ServiceUnavailableException(
        'Le service d’extraction est indisponible pour le moment. Réessaie, ou colle le texte directement.',
      )
    }
    const text = readExtractedText(envelope)
    if (!text) {
      const detail = readFailureDetail(envelope)
      throw new UnprocessableEntityException(
        detail ?? 'Aucun texte n’a pu être extrait de ce fichier — c’est souvent un scan. Colle le texte directement.',
      )
    }
    return { text, partial: readExtractionPartial(envelope) }
  }

  /**
   * Transforme des notes en compte rendu structuré.
   *
   * Le nom du compte n'est passé que s'il est RÉELLEMENT celui d'un dossier de
   * l'espace : un nom fourni par le client serait un moyen simple de faire
   * écrire n'importe quel en-tête dans un document qui circule.
   */
  async structure(
    userId: string,
    input: StructureInput,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR (GA-07). */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<MeetingRecap> {
    // En démonstration, la structuration est SCRIPTÉE : aucun appel modèle,
    // aucun crédit, et surtout un résultat qui reste dans la fiction du jeu de
    // données. Le fil du copilote suit la même règle.
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      return demoRecap(input.notes, input.userStatement ?? '', input.sourceEventId ?? null)
    }
    // #2319.61-.62 — une transcription reste une transcription : c'est le dépôt
    // qui le dit, pas le libellé choisi à côté.
    const inputKind: MeetingNotesInputKind = input.fromTranscript ? 'transcript' : (input.inputKind ?? 'notes')
    const userStatement = input.userStatement?.trim() ?? ''

    let accountName = ''
    if (input.accountId && this.accounts) {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      // Le périmètre (BU) de l'appelant — revue sécurité 15/09/2026 : le compte
      // rendu en CONTEXTE au modèle est un compte que l'appelant peut ouvrir.
      const result = await this.accounts.findOneForWorkspace(input.accountId, workspaceId, businessUnitScope)
      if (result.type === 'success') accountName = result.output.company_name ?? ''
    }

    const envelope = await this.ia.structureMeetingNotes({
      notes: input.notes,
      accountName,
      attendees: input.attendees ?? '',
      fromTranscript: input.fromTranscript ?? false,
      inputKind,
      ...(userStatement ? { userStatement } : {}),
    })

    const data = (envelope?.data ?? {}) as Record<string, unknown>
    const list = (value: unknown): string[] =>
      Array.isArray(value) ? value.map(item => String(item ?? '').trim()).filter(Boolean) : []
    const text = (row: Record<string, unknown>, key: string): string => String(row[key] ?? '').trim()
    const rows = (value: unknown): Record<string, unknown>[] =>
      Array.isArray(value) ? value.map(item => (item ?? {}) as Record<string, unknown>) : []
    const object = (value: unknown): Record<string, unknown> | null =>
      value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

    // Ce qu'on a RÉELLEMENT lu, et rien d'autre. La maquette écrit « transcript
    // 46 min + CRM + agenda » ; ici l'agenda n'est pas lu, donc il n'est pas
    // annoncé. Une source affichée qu'on n'a pas ouverte est une garantie
    // inventée.
    const sources: MeetingSource[] = [
      { kind: inputKind, detail: '' },
      ...(accountName ? [{ kind: 'crm' as const, detail: accountName }] : []),
      ...(userStatement ? [{ kind: 'user_statement' as const, detail: '' }] : []),
    ]
    // #2319.64-.74 — un objet extrait n'existe qu'avec son contenu ET sa source.
    const items = (value: unknown): MeetingExtractedItem[] =>
      rows(value).flatMap(row => {
        const content = text(row, 'content')
        const evidence = readEvidence(row['evidence'])
        return content && evidence ? [{ content, evidence }] : []
      })
    // #2319.71 — une date sans échéance ÉNONCÉE n'est pas une date.
    const dates = (value: unknown): MeetingDate[] =>
      rows(value).flatMap(row => {
        const label = text(row, 'label')
        const when = text(row, 'when')
        const evidence = readEvidence(row['evidence'])
        return label && when && evidence ? [{ label, when, evidence }] : []
      })

    return {
      summary: text(data, 'summary'),
      decisions: list(data['decisions']),
      nextSteps: rows(data['next_steps']).map(row => ({
        action: text(row, 'action'),
        owner: text(row, 'owner'),
        due: text(row, 'due'),
        evidence: readEvidence(row['evidence']),
      })),
      openQuestions: list(data['open_questions']),
      signals: list(data['signals']),
      followUpEmail: text(data, 'follow_up_email'),
      opportunity: sourced(object(data['opportunity']), row => {
        const title = text(row, 'title')
        // #2319.82 — seule une valeur EXACTE confirme ; tout le reste (absent,
        // inconnu) vaut « Projet à qualifier ». Aucun champ `budget` n'est lu :
        // il n'a pas de place où loger (#2319.79).
        return title
          ? {
              title,
              accountName: text(row, 'account_name'),
              qualification: row['qualification'] === 'confirmed' ? ('confirmed' as const) : ('to_qualify' as const),
            }
          : null
      }),
      need: sourced(object(data['need']), row => {
        const title = text(row, 'title')
        return title
          ? {
              title,
              detail: text(row, 'detail'),
              qualification: row['qualification'] === 'expressed' ? ('expressed' as const) : ('potential' as const),
            }
          : null
      }),
      // #2103.10 — distinct de `need` : un problème client n'est pas un besoin de staffing.
      clientIssue: sourced(object(data['client_issue']), row => {
        const title = text(row, 'title')
        return title ? { title, detail: text(row, 'detail') } : null
      }),
      mentionedContacts: rows(data['mentioned_contacts']).flatMap(row => {
        const fullName = text(row, 'full_name')
        const evidence = readEvidence(row['evidence'])
        return fullName && evidence ? [{ fullName, role: text(row, 'role'), evidence }] : []
      }),
      crmStage: sourced(object(data['crm_stage']), row => {
        const proposedStage = text(row, 'proposed_stage')
        return proposedStage ? { proposedStage, rationale: text(row, 'rationale') } : null
      }),
      reminder: sourced(object(data['reminder']), row => {
        const content = text(row, 'content')
        return content ? { content, dueLabel: text(row, 'due_label') } : null
      }),
      learnings: rows(data['learnings']).flatMap(row => {
        const content = text(row, 'content')
        const evidence = readEvidence(row['evidence'])
        if (!content || !evidence) return []
        return [
          { kind: row['kind'] === 'commitment' ? ('commitment' as const) : ('objection' as const), content, evidence },
        ]
      }),
      facts: items(data['facts']),
      requests: items(data['requests']),
      criteria: items(data['criteria']),
      dates: dates(data['dates']),
      clientCommitments: items(data['client_commitments']),
      userCommitments: items(data['user_commitments']),
      recapEvidence: readEvidence(data['recap_evidence']),
      followUpEvidence: readEvidence(data['follow_up_evidence']),
      sources,
      // Aucun crédit n'est débité par la structuration ni par la cascade : ce
      // zéro-là est VRAI, il ne remplace pas un calcul manquant. Le contrat
      // garde `null` pour le jour où un coût existe sans être chiffrable.
      estimatedCredits: 0,
      // #2103.37 — jamais deviné côté serveur : le rendez-vous source est
      // celui que le client a transmis, ou aucun.
      sourceEventId: input.sourceEventId ?? null,
    }
  }

  /**
   * Les neuf sorties du rendez-vous, prêtes à afficher.
   *
   * La cascade est DÉRIVÉE du compte rendu par `buildMeetingCascade`, dans
   * `@bellum/contracts` — la même dérivation que l'écran et que les tests. Deux
   * chemins qui la referaient divergeraient au premier ajout de sortie.
   */
  async cascade(userId: string, input: StructureInput): Promise<{ recap: MeetingRecap; cascade: MeetingCascade }> {
    const recap = await this.structure(userId, input)
    return { recap, cascade: buildMeetingCascade(recap) }
  }

  /**
   * Ce que la validation en lot écrira, sortie par sortie.
   *
   * ⚠️ Le paramètre ne peut porter QUE des sorties internes — son type l'interdit
   * au compilateur, et le schéma de la requête l'interdit à l'exécution. Il n'y
   * a donc aucun chemin, dans ce service, par lequel un mail ou une relance
   * pourrait partir avec un lot. Ce n'est pas une convention : c'est l'absence
   * de code.
   *
   * Chaque sortie rend son issue. `blocked` NOMME ce qui manque plutôt que de
   * déclarer un succès qui n'a rien écrit — le défaut que le runner de workflow
   * a déjà payé une fois.
   */
  async approveInternal(
    userId: string,
    input: {
      kinds: readonly MeetingInternalOutputKind[]
      /** #2855 (#2201.14) — le rendez-vous SOURCE du compte rendu, quand connu. */
      sourceEventId?: string
      tasks?: MeetingTaskInput[]
      crmStage?: MeetingStageInput
      recap?: MeetingRecapWriteInput
      contacts?: MeetingContactsWriteInput
      opportunity?: MeetingOpportunityWriteInput
      need?: MeetingNeedWriteInput
      learnings?: MeetingLearningsWriteInput
      clientIssue?: MeetingClientIssueWriteInput
    },
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR (GA-07) — même
     *  origine que celui de `structure()`. Utilisé par `opportunity` seule
     *  (résolution du nom de compte) ; les autres sorties n'ouvrent pas de
     *  compte par cette porte. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<MeetingApprovalResult> {
    const outcomes: MeetingApprovalResult['outcomes'] = []
    for (const kind of input.kinds) {
      // #1903.12 — LA PORTE du compte rendu. Sans compte identifié, on ne
      // devine pas une cible : `skipped`, comme `next_steps` sans tâche
      // retenue. Avec un compte, la note est réellement écrite (`notes`,
      // même table que l'onglet Notes d'une fiche) — plus jamais `blocked`.
      if (kind === 'recap') {
        if (!input.recap) {
          outcomes.push({ kind, outcome: 'skipped', missing: null, detail: 'Aucun compte identifié.' })
          continue
        }
        if (!this.notesService) {
          outcomes.push({ kind, outcome: 'blocked', missing: 'notes', detail: null })
          continue
        }
        try {
          // #2103.1 — la note GARDE son rendez-vous d'origine : c'est ce qui
          // permettra un jour de savoir « ce rendez-vous a déjà un CR », pour
          // ne jamais en reproposer un second sans changement matériel.
          // #3758 — et l'instantané structuré, quand l'écran en a dérivé un :
          // c'est lui que la carte `post_meeting_summary` de Laura relira,
          // jamais le texte libre ci-dessus.
          await this.notesService.create(
            userId,
            {
              entityType: 'account',
              entityId: input.recap.accountId,
              body: input.recap.body,
            },
            { sourceEventId: input.sourceEventId ?? null, meetingRecapSnapshot: input.recap.snapshot ?? null },
          )
          outcomes.push({ kind, outcome: 'done', missing: null, detail: null })
        } catch (error) {
          outcomes.push({
            kind,
            outcome: 'failed',
            missing: null,
            detail: error instanceof Error ? error.message : 'Note refusée.',
          })
        }
        continue
      }
      if (kind === 'next_steps') {
        const tasks = input.tasks ?? []
        if (tasks.length === 0) {
          outcomes.push({ kind, outcome: 'skipped', missing: null, detail: 'Aucune action retenue.' })
          continue
        }
        if (!this.crm) {
          outcomes.push({ kind, outcome: 'blocked', missing: 'crm', detail: null })
          continue
        }
        const result = await this.createTasks(userId, tasks)
        outcomes.push({
          kind,
          outcome: result.failed.length === 0 ? 'done' : result.created > 0 ? 'partial' : 'failed',
          missing: null,
          detail: result.failed.map(failure => `${failure.subject} : ${failure.reason}`).join(' — ') || null,
        })
        continue
      }
      if (kind === 'crm_stage') {
        // #1934.18 — LA PORTE, pas l'écriture. Le stade vient d'un modèle et la
        // personne a retenu une phrase, pas un diff de champ : la proposition
        // est DÉPOSÉE dans la file de validation (prévisualisation figée,
        // expiration 3 jours) et rien ne part avant que quelqu'un l'y autorise.
        const stage = input.crmStage
        if (!stage) {
          // Une case cochée sans stade retenu ne fabrique pas une proposition :
          // elle déplacerait une affaire que personne n'a nommée.
          outcomes.push({ kind, outcome: 'skipped', missing: null, detail: 'Aucun stade retenu.' })
          continue
        }
        if (!this.crm) {
          outcomes.push({ kind, outcome: 'blocked', missing: 'crm', detail: null })
          continue
        }
        try {
          // #2855 (#2201.14) — la PROVENANCE : quel compte rendu a composé
          // cette proposition. `null` quand aucun rendez-vous source n'est
          // connu, jamais deviné.
          const source: WriteSource = input.sourceEventId ? { kind: 'meeting_note', ref: input.sourceEventId } : null
          await this.crm.proposeDealStage(userId, { ...stage, source })
          outcomes.push({
            kind,
            outcome: 'proposed',
            missing: null,
            detail: null,
          })
        } catch (error) {
          // Un dépôt refusé est un ÉCHEC, jamais « proposé » : une proposition
          // annoncée et absente de la file ne se retrouve nulle part.
          outcomes.push({
            kind,
            outcome: 'failed',
            missing: null,
            detail: error instanceof Error ? error.message : 'Proposition refusée.',
          })
        }
        continue
      }
      if (kind === 'contacts') {
        // #2777 — LA PORTE des personnes citées. Sans compte identifié, on ne
        // devine pas une cible : `skipped`, même règle que `recap`. Avec un
        // compte, chaque mention est réellement écrite dans le répertoire de
        // contacts — plus jamais `blocked` quand le répertoire est branché.
        const request = input.contacts
        if (!request || request.mentioned.length === 0) {
          outcomes.push({ kind, outcome: 'skipped', missing: null, detail: 'Aucun compte identifié.' })
          continue
        }
        if (!this.contacts) {
          outcomes.push({ kind, outcome: 'blocked', missing: 'contacts', detail: null })
          continue
        }
        try {
          const result = await this.createMentionedContacts(userId, request.accountId, request.mentioned)
          const wrote = result.created + result.duplicates
          outcomes.push({
            kind,
            // Une AMBIGUÏTÉ (deux fiches répondent au même nom) n'écrit rien
            // pour cette personne, et ce n'est PAS un échec : « on PROPOSE une
            // fusion de doublons, on ne fusionne JAMAIS ». `skipped` quand
            // aucune mention n'a pu s'écrire pour cette raison, `partial`
            // quand certaines l'ont pu.
            outcome: result.ambiguous.length === 0 ? 'done' : wrote > 0 ? 'partial' : 'skipped',
            missing: null,
            detail:
              result.ambiguous.length > 0
                ? `Homonymes non créés (plusieurs fiches déjà présentes) : ${result.ambiguous.join(', ')}`
                : null,
          })
        } catch (error) {
          outcomes.push({
            kind,
            outcome: 'failed',
            missing: null,
            detail: error instanceof Error ? error.message : 'Fiche refusée.',
          })
        }
        continue
      }
      if (kind === 'opportunity') {
        // #2777 — LA PORTE de l'opportunité candidate. Sans opportunité
        // retenue, on ne fabrique pas une proposition : `skipped`, même règle
        // que `crm_stage` sans stade retenu. Avec un CRM connecté, le titre
        // est DÉPOSÉ en file de validation — jamais auto-approuvé, parce qu'il
        // vient d'un modèle et non d'un champ que la personne a relu.
        const request = input.opportunity
        if (!request) {
          outcomes.push({ kind, outcome: 'skipped', missing: null, detail: 'Aucune opportunité retenue.' })
          continue
        }
        if (!this.crm) {
          outcomes.push({ kind, outcome: 'blocked', missing: 'crm', detail: null })
          continue
        }
        try {
          await this.proposeOpportunity(userId, request, businessUnitScope)
          outcomes.push({ kind, outcome: 'proposed', missing: null, detail: null })
        } catch (error) {
          // Un dépôt refusé est un ÉCHEC, jamais « proposé » — même règle que
          // `crm_stage`.
          outcomes.push({
            kind,
            outcome: 'failed',
            missing: null,
            detail: error instanceof Error ? error.message : 'Proposition refusée.',
          })
        }
        continue
      }
      if (kind === 'need') {
        // #2777 — LA PORTE du besoin exprimé. Sans besoin retenu, on ne
        // fabrique pas une ligne de pipe : `skipped`, même règle que
        // `contacts` sans compte identifié. Avec le pipe branché, le besoin
        // est ÉCRIT directement — pas de file de validation, un besoin
        // n'engage pas le CRM d'un tiers.
        const request = input.need
        if (!request) {
          outcomes.push({ kind, outcome: 'skipped', missing: null, detail: 'Aucun besoin identifié.' })
          continue
        }
        if (!this.projectPipeline) {
          outcomes.push({ kind, outcome: 'blocked', missing: 'needs', detail: null })
          continue
        }
        try {
          await this.createAccountNeed(userId, request)
          outcomes.push({ kind, outcome: 'done', missing: null, detail: null })
        } catch (error) {
          outcomes.push({
            kind,
            outcome: 'failed',
            missing: null,
            detail: error instanceof Error ? error.message : 'Besoin refusé.',
          })
        }
        continue
      }
      if (kind === 'learnings') {
        // #2777 — LA PORTE de la mémoire du compte. Sans apprentissage retenu,
        // on n'écrit rien : `skipped`, même règle que ses voisines. Bande
        // `n4_bounded_auto` : le clic du lot autorise l'écriture directement,
        // aucune file de validation — ce n'est ni un CRM ni un ERP.
        const request = input.learnings
        if (!request || request.entries.length === 0) {
          outcomes.push({ kind, outcome: 'skipped', missing: null, detail: 'Aucun apprentissage retenu.' })
          continue
        }
        if (!this.accountMemory) {
          outcomes.push({ kind, outcome: 'blocked', missing: 'account_memory', detail: null })
          continue
        }
        try {
          const result = await this.accountMemory.record(userId, request.accountId, request.entries)
          outcomes.push({
            kind,
            outcome: result.created === request.entries.length ? 'done' : result.created > 0 ? 'partial' : 'skipped',
            missing: null,
            detail: null,
          })
        } catch (error) {
          outcomes.push({
            kind,
            outcome: 'failed',
            missing: null,
            detail: error instanceof Error ? error.message : 'Apprentissage refusé.',
          })
        }
        continue
      }
      if (kind === 'client_issue') {
        // #2103.10 — LA PORTE du problème client. Même gabarit que `recap` :
        // sans compte identifié, on ne devine pas une cible ; avec un compte,
        // le problème est écrit en note (titre + détail), sans fabriquer une
        // sortie dédiée qui n'existe pas encore.
        const request = input.clientIssue
        if (!request) {
          outcomes.push({ kind, outcome: 'skipped', missing: null, detail: 'Aucun problème client retenu.' })
          continue
        }
        if (!this.notesService) {
          outcomes.push({ kind, outcome: 'blocked', missing: 'notes', detail: null })
          continue
        }
        try {
          await this.notesService.create(userId, {
            entityType: 'account',
            entityId: request.accountId,
            body: request.detail ? `${request.title} — ${request.detail}` : request.title,
          })
          outcomes.push({ kind, outcome: 'done', missing: null, detail: null })
        } catch (error) {
          outcomes.push({
            kind,
            outcome: 'failed',
            missing: null,
            detail: error instanceof Error ? error.message : 'Note refusée.',
          })
        }
        continue
      }
      // Chaque sortie interne a désormais sa porte, branchée ci-dessus. Ce
      // point n'est atteignable que si `MeetingInternalOutputKind` gagne une
      // valeur sans que son branchement suive — `kind` narrowé à `never` fait
      // ÉCHOUER LA COMPILATION avant que ça arrive en production.
      const unhandled: never = kind
      throw new Error(`Sortie interne sans branchement : ${String(unhandled)}`)
    }
    return { outcomes }
  }

  /**
   * #2777 — les personnes CITÉES pendant le rendez-vous, écrites dans le
   * répertoire de contacts du compte identifié.
   *
   * Même critère de doublon qu'ailleurs dans le produit
   * (`ContactsService.createFromCrmPresence`) : nom plié (casse ET accents),
   * jamais un e-mail — une mention n'en porte pas. Une AMBIGUÏTÉ (deux fiches
   * répondent au même nom) n'écrit rien et ne fusionne rien : « on PROPOSE une
   * fusion de doublons, on ne fusionne JAMAIS ». La provenance posée
   * (`source: 'meeting'`) place ces valeurs SOUS `human` et `connector` dans
   * tout arbitre futur : le nom vient de l'extraction du compte rendu, pas
   * d'une saisie ni d'un outil connecté — une correction humaine ultérieure la
   * dominera toujours.
   */
  private async createMentionedContacts(
    userId: string,
    accountId: string,
    mentioned: readonly MeetingContactMention[],
  ): Promise<{ created: number; duplicates: number; ambiguous: string[] }> {
    const contacts = this.contacts
    if (!contacts) throw new Error('Répertoire de contacts non branché.')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const existing = await contacts.find({
      where: { account_id: accountId, deleted_at: IsNull() },
      select: ['id', 'full_name'],
    })
    let created = 0
    let duplicates = 0
    const ambiguous: string[] = []
    for (const mention of mentioned) {
      const fullName = mention.fullName.trim()
      const folded = foldForNameMatch(fullName)
      if (!fullName || folded.length < MIN_FOLDED_NAME_LENGTH) continue
      // #4479 — `idx_contacts_account_normalized_name` : le nom se compare aussi sous la clé de la base.
      const dbKey = normalizeFullName(fullName)
      const matches = existing.filter(
        row =>
          foldForNameMatch((row.full_name ?? '').trim()) === folded ||
          (dbKey !== '' && normalizeFullName(row.full_name) === dbKey),
      )
      if (matches.length > 1) {
        ambiguous.push(fullName)
        continue
      }
      if (matches.length === 1) {
        duplicates += 1
        continue
      }
      const title = mention.role?.trim() || null
      const saved = await contacts.save(
        contacts.create({
          account_id: accountId,
          user_id: userId,
          workspace_id: workspaceId,
          full_name: fullName,
          title,
          source: 'meeting',
          lifecycle_state: computeContactLifecycleState({
            fullName,
            title,
            entity: null,
            email: null,
            phone: null,
            linkedinUrl: null,
            source: 'meeting',
          }),
        }),
      )
      // Une seconde mention du MÊME nom, plus loin dans le même lot, doit
      // rejoindre la fiche qu'on vient de créer — pas en créer une deuxième.
      existing.push({ id: saved.id, full_name: fullName } as ContactEntity)
      created += 1
    }
    return { created, duplicates, ambiguous }
  }

  /**
   * #2777 — DÉPOSE l'opportunité candidate comme Deal, dans la file de
   * validation CRM.
   *
   * Le nom du compte est RÉSOLU ici, pas pris tel quel dans la requête — même
   * garde que `structure()` : un nom fourni par le client serait un moyen
   * simple de faire apparaître n'importe quel intitulé dans le CRM d'un
   * commercial. Vide s'il n'a pas pu être résolu, jamais deviné.
   */
  private async proposeOpportunity(
    userId: string,
    request: MeetingOpportunityWriteInput,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR (GA-07). */
    businessUnitScope: BusinessUnitScopeClause,
  ): Promise<void> {
    const crm = this.crm
    if (!crm) throw new Error('Aucun CRM connecté.')
    let accountName = ''
    if (this.accounts) {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const result = await this.accounts.findOneForWorkspace(request.accountId, workspaceId, businessUnitScope)
      if (result.type === 'success') accountName = result.output.company_name ?? ''
    }
    await crm.proposeCreateDeal(userId, { title: request.title, ...(accountName ? { accountName } : {}) })
  }

  /**
   * #2777 — ÉCRIT le besoin exprimé, chez le compte identifié, SANS projet
   * (#2558.1 : un besoin sans projet est un état valide, pas une donnée à
   * compléter). `source: 'meeting_notes'` et `provenance: 'model'` disent
   * d'où vient la ligne — même vocabulaire que le badge « détecté » du pipe.
   */
  private async createAccountNeed(userId: string, request: MeetingNeedWriteInput): Promise<void> {
    const projectPipeline = this.projectPipeline
    if (!projectPipeline) throw new Error('Pipe de besoins non branché.')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await projectPipeline.addNeedForAccount(workspaceId, request.accountId, {
      title: request.title,
      source: 'meeting_notes',
      provenance: 'model',
      ...(request.detail ? { context: request.detail } : {}),
    })
  }

  /**
   * Pose dans le CRM les actions que l'utilisateur a RETENUES.
   *
   * L'appelant envoie les tâches choisies, pas un identifiant de compte rendu :
   * c'est ce qui rend la confirmation réelle plutôt que décorative. Un échec sur
   * une tâche ne prive pas les autres, et il est nommé.
   */
  async createTasks(
    userId: string,
    tasks: Array<{ subject: string; body?: string; dueAt: string; contactId?: string }>,
  ): Promise<{ created: number; failed: Array<{ subject: string; reason: string }> }> {
    if (!this.crm) throw new BadRequestException('Aucun CRM connecté.')
    const failed: Array<{ subject: string; reason: string }> = []
    let created = 0
    for (const task of tasks) {
      try {
        await this.crm.createTask(userId, task)
        created += 1
      } catch (error) {
        failed.push({ subject: task.subject, reason: error instanceof Error ? error.message : 'Refusé par le CRM' })
      }
    }
    if (failed.length > 0) {
      this.logger.warn('Des actions du compte rendu n’ont pas été posées', { failed: failed.length })
    }
    return { created, failed }
  }
}
