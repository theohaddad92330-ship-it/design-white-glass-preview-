import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import type {
  CreateOutreachSequenceRequest,
  CreateOutreachStepInput,
  DeclareOutreachEngagementSignalInput,
  DuplicateOutreachSequenceRequest,
  OutreachDelayUnit,
  OutreachScenario,
  OutreachSequence,
  OutreachSequenceStep,
  OutreachSequenceStopEvent,
  OutreachStepKind,
  OutreachTemplateKey,
  UpdateOutreachStepInput,
} from '@bellum/contracts'
import {
  OUTREACH_DEFAULT_DELAY_UNIT,
  OUTREACH_SEQUENCE_MAX_STEPS,
  OUTREACH_SEQUENCE_TEMPLATES,
  addBusinessDays,
  blockingEnrollmentExclusions,
  businessDaysBetween,
  evaluateEnrollmentExclusions,
  notNowRevalidationDue,
  outreachChannelForbidden,
  outreachMessageCount,
  outreachMessageSpacingProblems,
  scenarioForRelationship,
  type OutreachSequenceNotNowRevalidation,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import { OutreachSequenceStepEntity } from '../../database/entities/outreach-sequence-step.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import type { ContactApolloDetails } from '@bellum/contracts'
import { contactSourceTag } from '../analysis/contact-score'
import { resolveRelationshipEvidence } from '../contacts/cadence-templates'
import { ActionRouterService, type ActionPrincipal } from '../action-router/action-router.service'
import { maxLevel, resolveSettings } from '../action-os/approval-policy'
import { ContactStopService } from '../contact-stop/contact-stop.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { workspaceGestureWhere, workspaceScopeWhere } from '../workspace/workspace-scoping'
import { automaticSequenceIntent } from './sequence-frontier'

/** Une étape résolue (échéance datée) prête à persister. */
type ResolvedStep = {
  kind: OutreachStepKind
  due_at: Date
  label: string
  note?: string
  /** #2202.33 — ce que l'étape cherche à obtenir, distinct de `note`. */
  objective?: string
  /** #3756.2 — brouillon RÉSOLU d'un modèle de bibliothèque. */
  draft?: { subject: string; body: string }
  /** #3756.3 — variables sans valeur : l'étape est BLOQUÉE, sans brouillon. */
  blocked_variables?: string[]
  /** Lot L-B — le délai demandé (jours ouvrés ou calendaires selon la séquence), gardé pour l'éditeur. */
  offset_days?: number
}

const DEFAULT_STEP_LABEL: Record<OutreachStepKind, string> = {
  email: 'Email à envoyer',
  reminder: 'Rappel',
  task: 'Tâche',
  linkedin_invite: 'Invitation LinkedIn',
  linkedin_message: 'Message LinkedIn',
  call: 'Appel',
}

/**
 * #2374.23 — l'une des 6 conditions d'arrêt nommées pour le nurturing :
 * « horizon dépassé ». `max_delay_reached` existe dans le vocabulaire fermé
 * des 17 événements d'arrêt depuis #2381 (`OUTREACH_SEQUENCE_STOP_EVENTS`)
 * mais n'était appliqué NULLE PART — une séquence dont la dernière étape
 * n'est jamais marquée `done` restait « active » indéfiniment, même des mois
 * après son horizon (J+60 pour `nurturing`). Fenêtre de grâce avant de la
 * considérer dépassée : le temps qu'un commercial revienne d'une absence
 * courte sans que la séquence s'arrête sous ses pieds.
 */
const MAX_DELAY_GRACE_DAYS = 14

/** Lot L-B — la phrase de chaque exclusion forçable, pour le refus de `create`. */
const ENROLLMENT_EXCLUSION_TEXT: Record<
  'active_sequence' | 'recently_contacted' | 'rgpd_opposition' | 'already_client',
  string
> = {
  active_sequence: 'une séquence est déjà active sur ce contact',
  recently_contacted: 'un message lui a été envoyé il y a moins de 30 jours',
  rgpd_opposition: 'il a demandé à ne plus être contacté',
  already_client: 'son compte est déjà client',
}

/** Lot L-B — « compte déjà client », seulement quand le modèle porte la preuve ; sinon `null`, jamais deviné. */
function clientStatusOf(account: Pick<AccountEntity, 'raw_analysis' | 'commercial_status'> | null): boolean | null {
  if (!account) return null
  const { state, evidence } = resolveRelationshipEvidence(account)
  return evidence.length === 0 ? null : state === 'client_actif'
}

/**
 * Séquences d'outreach multi-touch (roadmap §8 « programme une relance/séquence »
 * + §5 « mes relances ») — une cadence de touches DATÉES sur un contact
 * (ex. J0 email préparé → J+4 rappel → J+10 relance email).
 *
 * RÈGLE ABSOLUE : une étape `email` n'envoie JAMAIS d'email. Elle PRÉPARE —
 * snapshot du brouillon `email_message` existant dans le payload de l'étape —
 * et crée un rappel interne daté « à envoyer ». L'envoi reste un geste humain
 * via la capacité send-email (#394), qui garde tous ses garde-fous (ownership,
 * idempotence, opt-out, cadence).
 *
 * Les rappels datés RÉUTILISENT le mécanisme existant : chaque étape est
 * dispatchée en intent `schedule_reminder` à l'{@link ActionRouterService}, qui
 * journalise le rappel dans `user_actions` (jamais un second moteur de rappel).
 *
 * Scoping : lectures scope workspace (comme le feed `user_actions`), mutations
 * strictes propriétaire (`user_id`) — on ne pause/annule pas la séquence d'un
 * collègue. La création exige que le contact soit de l'espace actif (#4158.47).
 *
 * #2381.1/.6 — Arrêt automatique à la réponse : quand le contact passe
 * `replied`/`meeting` (via `ContactsService.updateStatus`), ses séquences
 * actives ET en pause s'ARRÊTENT (`cancelled`, jamais une simple pause —
 * « pas d'étape suivante pour être sûr »), avec la cause journalisée dans
 * `outreach_transitions` (UPDATE + INSERT best-effort côté contacts — voir
 * `updateStatus`, évite un import circulaire contacts ↔ outreach).
 */
@Injectable()
export class OutreachService {
  private readonly logger = new Logger(OutreachService.name)

  constructor(
    @InjectRepository(OutreachSequenceEntity)
    private readonly sequences: Repository<OutreachSequenceEntity>,
    @InjectRepository(OutreachSequenceStepEntity)
    private readonly steps: Repository<OutreachSequenceStepEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    // Les seuils d'approbation de l'espace. Lus ici et non devinés : les six
    // niveaux N0→N5 existent depuis l'Action OS et ce chemin ne les regardait
    // jamais — un réglage qui ne gouverne rien est un réglage qui ment.
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly actionRouter: ActionRouterService,
    // La PORTE : « cette personne a-t-elle demandé qu'on cesse ? ». Injectée ici
    // et non résolue au contrôleur — ce chemin ARME quatre touches datées, et un
    // garde-fou qui vit hors du code qui arme n'en est pas un. Coût GA-07 assumé
    // et daté (30/08/2026), voir `module-boundaries.spec.ts`.
    private readonly contactStops: ContactStopService,
  ) {}

  /**
   * Refuse d'armer une séquence sur un contact étiqueté `RISQUE`.
   *
   * Le calcul est le MÊME que celui du badge et du score — importer la fonction
   * pure plutôt que réinventer la comparaison ici, sinon l'écran et le serveur
   * finiraient par ne plus dire la même chose. Un compte introuvable ne bloque
   * rien : sans nom d'entreprise, la comparaison n'a pas de sens, et refuser
   * sur une donnée absente serait pire que de laisser passer.
   */
  private assertNotStaleContact(contact: ContactEntity, account: AccountEntity | null, acknowledged: boolean): void {
    if (acknowledged) return
    if (!account?.company_name) return
    const apolloDetails = ((contact.raw_data ?? {}) as { apolloDetails?: ContactApolloDetails }).apolloDetails ?? null
    const tag = contactSourceTag(contact.source ?? null, apolloDetails, account.company_name, contact.entity ?? null)
    if (tag !== 'RISQUE') return
    throw new BadRequestException(
      "L'employeur détecté pour ce contact ne correspond pas à ce compte : il l'a probablement quitté. Confirme explicitement pour l'inscrire quand même.",
    )
  }

  /**
   * #2380.66 — exclusion de conformité « entreprise hors scope ». La porte G1
   * (`AccountEntity.priority_gate = 'parked'`) existe déjà et `list()` s'en
   * sert pour ARRÊTER, sous leurs pieds, les séquences déjà actives dont le
   * compte devient `parked` en cours de route (`applyAccountExcluded`) — mais
   * rien n'empêchait d'en ARMER une NOUVELLE sur un contact dont le compte
   * était DÉJÀ écarté au moment même de la création : le trou n'était pas
   * dans la porte, mais dans son absence à l'entrée. Même famille que
   * `assertNotStaleContact` (une raison nommée, pas un refus générique), mais
   * sans `acknowledge_risk` : un compte `parked` est un NON déjà écrit par un
   * humain (`gate_reason`, `AccountGateService.decide`) — le lever suppose de
   * rouvrir le compte (retour à `pending`), pas de cocher une case ici.
   */
  private assertAccountInScope(account: AccountEntity | null): void {
    if (!account || account.priority_gate !== 'parked') return
    const reason = account.gate_reason?.trim()
    throw new BadRequestException(
      `Ce compte est écarté (hors cible${reason ? ` : ${reason}` : ''}). ` +
        'Aucune séquence ne peut être programmée tant qu’il n’est pas rouvert.',
    )
  }

  /**
   * #2296.45 — refuse de PROLONGER une séquence sur un contact devenu
   * `historique` (ex-employé, `computeContactLifecycleState` /
   * `contact-eligibility.ts` #2160.53). `create` refuse déjà à l'armement
   * (`assertNotStaleContact`) — mais le changement peut être détecté APRÈS,
   * pendant que la séquence tourne : `lifecycle_state` bascule au fil de
   * l'eau (écriture contact), sans que la séquence ne bouge toute seule.
   * Cette porte couvre les deux gestes qui PROLONGENT l'engagement — reprendre
   * une séquence en pause, ajouter une touche future — jamais `stepDone` /
   * `pause` / `cancel`, qui constatent ou arrêtent sans rien écrire de neuf
   * vers ce contact. Un contact introuvable ne bloque rien — même tolérance
   * que `assertNotStaleContact`.
   */
  private assertNotHistoricalContact(contact: ContactEntity | null): void {
    if (!contact) return
    if (contact.lifecycle_state !== 'historique') return
    throw new BadRequestException(
      "Ce contact a quitté l'entreprise détectée depuis l'armement de cette séquence : impossible de la prolonger. Mets-la en pause ou annule-la.",
    )
  }

  /**
   * #2380.49 nommait déjà la séquence en place ; #2380.50 demande la PROPOSITION
   * qui manquait — de quoi collaborer avec le collègue qui la porte, pas
   * seulement un refus. Le texte du message reste côté client (i18n FR/EN,
   * GA-26) : ce service ne fournit que l'identité du propriétaire, jamais une
   * phrase toute faite — et rien n'est envoyé, ce refus prépare un CONTACT
   * possible, il n'écrit ni ne notifie personne lui-même.
   *
   * Aucune proposition quand la séquence en place est la sienne propre : se
   * "collaborer avec soi-même" n'a pas de sens, et `listMembers` n'a rien à
   * apporter dans ce cas.
   */
  private async collisionRefusal(
    active: OutreachSequenceEntity,
    contact: ContactEntity,
    requesterId: string,
  ): Promise<BadRequestException> {
    const message = `Une séquence est déjà active sur ce contact (« ${active.name} ») — mets-la en pause ou annule-la avant d'en créer une seconde.`
    if (active.user_id === requesterId) return new BadRequestException(message)

    const members = await this.workspaceContext.listMembers(requesterId)
    const owner = members.find(m => m.userId === active.user_id) ?? null
    return new BadRequestException({
      message,
      code: 'outreach_sequence_collision',
      sequenceId: active.id,
      sequenceName: active.name,
      contactName: contact.full_name,
      ownerName: owner?.fullName ?? null,
      ownerEmail: owner?.email ?? null,
    })
  }

  /**
   * Le scénario d'approche qui gouverne le RYTHME de cette séquence, ou `null`
   * quand rien ne permet de le nommer.
   *
   * Le registre `OUTREACH_SCENARIOS` porte quatre cadences (0 / 5 / 7 pour une
   * approche froide, 0 / 4 / 7 pour un contact recommandé) : on n'espace pas de
   * la même façon un inconnu et quelqu'un qui vient d'être présenté. Jusqu'ici
   * le chemin d'écriture appliquait à tout le monde le plancher plat, c'est-à-
   * dire le plus permissif des quatre.
   *
   * Deux refus délibérés, et ce sont eux qui rendent le branchement tenable.
   *
   * 1. **Un GABARIT n'est jamais soumis au scénario.** `cold_email` écrit à
   *    J0 / J+4 / J+10 / J+18 : deux de ses écarts sont sous la cadence du
   *    scénario froid. Le registre (issu du document source) et le gabarit
   *    livré se contredisent — c'est un arbitrage produit, et refuser un
   *    gabarit que des utilisateurs choisissent par son nom serait casser du
   *    livré pour satisfaire une table. Le scénario gouverne donc ce que
   *    l'APPELANT compose, que l'API accepte librement ; le gabarit est une
   *    cadence déjà tranchée et relue.
   *
   * 2. **Un état de relation SANS preuve ne vaut pas un scénario.**
   *    `resolveRelationshipEvidence` retombe sur « froid » quand elle ne sait
   *    rien, et le dit en ne citant aucune preuve. Prendre ce défaut pour une
   *    approche froide établie appliquerait la cadence la plus stricte à tous
   *    les comptes jamais analysés — un verdict conclu d'un silence. Sans
   *    preuve, on garde le plancher plat.
   *
   * La lecture réutilise la dérivation des cadences de contact plutôt que d'en
   * écrire une seconde : deux lectures de `salesContext.relationship`
   * finiraient par ne plus dire la même chose.
   */
  private cadenceScenario(dto: CreateOutreachSequenceRequest, account: AccountEntity | null): OutreachScenario | null {
    if (dto.template || !account) return null
    const { state, evidence } = resolveRelationshipEvidence(account)
    if (evidence.length === 0) return null
    return scenarioForRelationship(state)
  }

  /**
   * Crée une séquence sur un contact de l'ESPACE ACTIF (#4158.47 — plus le seul
   * contact dont l'appelant est propriétaire) depuis un template OU des étapes custom — chaque étape
   * datée. Persiste la séquence + steps, puis programme un rappel interne daté
   * par étape via l'Action Router (`schedule_reminder`, best-effort : un rappel
   * en échec n'invalide pas la séquence, qui porte déjà ses échéances).
   */
  async create(
    dto: CreateOutreachSequenceRequest,
    principal: ActionPrincipal,
    canSend: boolean,
    // #2378.7 — la séquence dont celle-ci est la copie (duplication), sinon rien.
    // Lot L-D1 (#4167) — `expected_workspace_id` : une automatisation porte l'espace de SA règle ; si
    // l'espace actif de la personne est un autre, rien ne s'écrit (jamais une séquence dans le mauvais espace).
    // #5029.1 — `consultant_id` : le consultant en intercontrat que la séquence PROPOSE (Reverse Market) ;
    // vérifié dans l'espace par l'appelant (`BenchPushService.prepare`), jamais lu du corps d'une requête.
    origin: { duplicated_from?: string; expected_workspace_id?: string; consultant_id?: string } = {},
  ): Promise<OutreachSequence> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(principal.userId)
    if (origin.expected_workspace_id && origin.expected_workspace_id !== workspaceId) {
      throw new ConflictException('L’espace actif n’est pas celui de la règle : aucune séquence n’est créée.')
    }
    const settings = resolveSettings(
      (await this.workspaces.findOne({
        where: { id: workspaceId },
        select: ['approval_default_level', 'approval_bulk_threshold', 'approval_spend_threshold'],
      })) ?? {},
    )

    // #4158.47 — préparer une séquence (brouillon : rien ne part) est permis sur
    // tout contact de l'ESPACE ACTIF ; l'expéditeur reste l'appelant (`user_id`
    // de la séquence ci-dessous) et l'envoi reste un geste humain. Un contact
    // d'un autre espace est introuvable (404). La confirmation « contacté il y a
    // N j par un collègue » (#21) est posée par l'écran, jamais un blocage dur.
    const contact = await this.contacts.findOne({ where: { id: dto.contact_id, workspace_id: workspaceId } })
    if (!contact) throw new NotFoundException('Contact introuvable dans cet espace.')

    // Le compte du contact, lu UNE fois : il sert à deux questions différentes
    // — l'employeur détecté (garde `RISQUE`) et l'état de la relation (cadence).
    // #1473 — un contact à qualifier n'a pas de compte. `null` ici est déjà
    // l'état que la suite gère (compte illisible) : la garde RISQUE se tait et
    // la cadence retombe sur le motif standard.
    const account = contact.account_id ? await this.accounts.findOne({ where: { id: contact.account_id } }) : null

    // UN REFUS ARRÊTE, IL NE S'ENREGISTRE PAS.
    //
    // Premier contrôle, avant tous les autres, et sans échappatoire : ni
    // `acknowledge_risk`, ni un réglage d'espace, ni un rôle de responsable ne
    // le lèvent. Les autres gardes de cette méthode protègent la délivrabilité
    // ou la pertinence — celle-ci protège une personne qui a dit non.
    //
    // Ce chemin était le trou le plus large du produit : les huit chemins
    // d'ENVOI d'e-mail consultent la liste de suppression depuis des mois, mais
    // celui qui ARME quatre touches datées ne consultait rien. On pouvait donc
    // inscrire en cadence quelqu'un qui s'était désabonné ; le refus n'arrivait
    // qu'au clic d'envoi de la première touche, après que l'écran eut affiché
    // une séquence active et des échéances.
    const stop = await this.contactStops.verdict(workspaceId, contact.id)
    if (stop) {
      throw new ForbiddenException(
        `Ce contact a demandé à ne plus être contacté (${stop.reason}, le ${stop.since.slice(0, 10)}). ` +
          'Aucune séquence ne peut être programmée.',
      )
    }

    // Un contact dont l'employeur détecté ne correspond pas au compte a
    // probablement quitté l'entreprise (PDF 2 §5.2). Le mettre en séquence,
    // c'est écrire quatre fois à quelqu'un qui n'y travaille plus — et brûler
    // l'adresse au passage. On refuse, en le DISANT, tant que personne n'a
    // regardé le badge et décidé.
    this.assertAccountInScope(account)
    this.assertNotStaleContact(contact, account, dto.acknowledge_risk === true)

    // Lot L-B (#4165) — les exclusions à l'inscription, nommées. La collision de
    // séquence (ci-dessous) et l'opposition RGPD (ci-dessus) gardent leur
    // propre refus ; restent ici les deux exclusions que l'utilisateur peut
    // lever d'un geste explicite : « contacté il y a moins de 30 jours » et
    // « compte déjà client » (seulement quand l'information existe).
    const lastSent = await this.lastSentAt(workspaceId, contact.id)
    const exclusions = evaluateEnrollmentExclusions({
      hasActiveSequence: false,
      lastSentAt: lastSent,
      erased: false,
      alreadyClient: clientStatusOf(account),
      now: new Date(),
    })
    const blocking = blockingEnrollmentExclusions(exclusions, dto.override_exclusions === true)
    if (blocking.length > 0) {
      throw new BadRequestException({
        message:
          'Ce contact ne peut pas être inscrit tel quel : ' +
          blocking.map(exclusion => ENROLLMENT_EXCLUSION_TEXT[exclusion.code]).join(' ; ') +
          '. Confirme explicitement pour l’inscrire quand même.',
        code: 'outreach_enrollment_excluded',
        exclusions: blocking,
      })
    }

    // #1935.17 — deux séquences ACTIVES sur la même personne écrivent chacune
    // leurs propres échéances : le contact reçoit deux cadences qui ne se
    // parlent pas, sans qu'aucun des deux commerciaux ne le voie. Le message
    // nomme la séquence en place plutôt qu'un refus générique — c'est elle
    // qu'il faut mettre en pause ou annuler pour continuer. Même portée que
    // `list()` : l'ESPACE, pas le seul créateur, parce qu'un contact possédé
    // est possédé par une personne mais visible de tout le workspace.
    const activeOnContact = await this.sequences.findOne({
      where: { ...workspaceScopeWhere(workspaceId), contact_id: contact.id, status: 'active' },
    })
    // #2380.67 — LE FORÇAGE : un motif écrit non vide lève le refus, mais ne
    // le CONTOURNE pas — l'ancienne séquence passe en pause avant que la
    // nouvelle ne se crée, jamais deux cadences actives sur la même personne
    // à la fois (#1935.17, la raison même de ce refus). Aucun droit de plus
    // n'est vérifié ici : c'est la même permission qui crée une séquence
    // (`RequirePermission('messages:send')`, au contrôleur) qui force.
    const forceJustification = dto.force_justification?.trim() || null
    let forcedOverSequenceId: string | null = null
    if (activeOnContact) {
      if (!forceJustification) {
        throw await this.collisionRefusal(activeOnContact, contact, principal.userId)
      }
      activeOnContact.status = 'paused'
      await this.sequences.save(activeOnContact)
      forcedOverSequenceId = activeOnContact.id
    }

    // Lot L-B — toute séquence NEUVE compte en jours OUVRÉS ; l'existant reste
    // en jours calendaires (défaut SQL), aucun changement silencieux.
    const delayUnit: OutreachDelayUnit = dto.delay_unit ?? OUTREACH_DEFAULT_DELAY_UNIT
    const resolved = resolveSteps(dto, new Date(), delayUnit)
    if (resolved.length === 0) throw new BadRequestException('La séquence doit contenir au moins une étape.')

    // Deux MESSAGES trop rapprochés ne sont pas une cadence — c'est la même
    // personne écrite deux fois, et c'est la façon la plus rapide de se faire
    // ignorer. La règle porte sur les étapes qui ÉCRIVENT : une tâche et un
    // message le même jour sont l'ordre voulu (« vérifier le signal », puis
    // « premier contact »), et l'interdire casserait le seul scénario qui
    // demande d'agir vite. Les gabarits sont conformes ; ce qui est gardé ici,
    // ce sont les étapes CUSTOM, que l'API accepte librement.
    const scenario = this.cadenceScenario(dto, account)
    const spacing = outreachMessageSpacingProblems(resolved, scenario)
    if (spacing.length > 0) {
      const first = spacing[0]
      throw new BadRequestException(
        `Deux messages à ${first?.days ?? 0} jour(s) d'intervalle : il en faut au moins ` +
          `${first?.required ?? 0}. La patience est le meilleur différenciant d'une relance.`,
      )
    }

    // #2374.24 (épopée #2800) — plafond PAR TYPE DE RELATION ET CANAL, sinon
    // stop. Comme la cadence ci-dessus, ne s'applique qu'aux étapes CUSTOM sur
    // une relation dont l'état est PROUVÉ (`scenario` non nul) — un gabarit
    // choisi par son nom garde sa composition déjà tranchée (même exception
    // que `cadenceScenario`), et un état inconnu ne conclut pas d'un silence.
    if (scenario) {
      if (outreachChannelForbidden(resolved, scenario)) {
        throw new BadRequestException(
          `Cette relation (« ${scenario.id} ») n'autorise que ${scenario.allowedChannels.join('/')} — ` +
            "pas d'e-mail automatisé dans cette séquence.",
        )
      }
      const messageCount = outreachMessageCount(resolved)
      if (messageCount > scenario.maxSteps) {
        throw new BadRequestException(
          `Cette relation (« ${scenario.id} ») autorise au plus ${scenario.maxSteps} messages — ` +
            `${messageCount} sont programmés ici.`,
        )
      }
    }

    // La politique d'approbation de l'espace, traversée pour de bon.
    //
    // Une étape e-mail est IRRÉVERSIBLE par nature, et `levelForStep` place un
    // pas irréversible au minimum à « validation utilisateur » — que le clic sur
    // « créer » constitue, exactement comme pour une écriture CRM déclenchée par
    // un geste humain. Le même calcul est refait ici avec les mêmes primitives
    // (`maxLevel`) plutôt qu'en fabriquant un faux `WorkflowStep` : un pas de
    // workflow porte une intention, une capacité et une politique de reprise
    // qu'une séquence n'a pas, et les inventer pour satisfaire un type
    // produirait une gouvernance en trompe-l'œil.
    //
    // Ce qui change réellement : l'espace qui a RELEVÉ son niveau à « validation
    // responsable » voit enfin son réglage agir sur ce chemin. Une cible unique
    // ne franchit ni le seuil de volume ni celui de dépense — c'est le chemin
    // d'envoi en LOT qui les rencontre, et il a déjà ses quatre garde-fous.
    if (resolved.some(step => step.kind === 'email')) {
      if (maxLevel('n2_user_approval', settings.defaultLevel) === 'n3_manager_approval') {
        throw new ForbiddenException(
          'Cet espace demande une validation responsable avant de programmer une séquence qui envoie.',
        )
      }
    }

    const sequence = await this.sequences.save(
      this.sequences.create({
        workspace_id: workspaceId,
        user_id: principal.userId,
        contact_id: contact.id,
        name: dto.name?.trim() || defaultSequenceName(dto),
        // #2203.32 → .38 — l'étiquette de campagne, telle qu'elle a été
        // demandée. Aucun défaut : une séquence lancée seule n'appartient à
        // aucune campagne, et lui en fabriquer une ferait de chaque envoi
        // solitaire une « campagne d'une personne » dans le filtre.
        campaign_label: dto.campaign_label?.trim() || null,
        // #2378.6 — le gabarit d'origine se garde, même quand la cadence a été
        // personnalisée : il ne décide plus du rythme, il reste nommé.
        template_key: dto.template ?? dto.template_key ?? null,
        duplicated_from: origin.duplicated_from ?? null,
        consultant_id: origin.consultant_id ?? null,
        forced_over_sequence_id: forcedOverSequenceId,
        force_justification: forcedOverSequenceId ? forceJustification : null,
        status: 'active',
        delay_unit: delayUnit,
        vacation_paused_at: null,
        vacation_until: null,
      }),
    )

    const stepRows = await this.steps.save(
      resolved.map((step, position) =>
        this.steps.create({
          sequence_id: sequence.id,
          position,
          due_at: step.due_at,
          kind: step.kind,
          payload: buildStepPayload(step, contact),
          status: 'pending',
          done_at: null,
        }),
      ),
    )

    // Rappels internes datés — RÉUTILISE l'Action Router (`schedule_reminder` →
    // journal `user_actions`). JAMAIS un envoi : pour une étape email le rappel
    // dit « à envoyer », le geste d'envoi reste humain. Best-effort par étape.
    //
    // #2378.9 — une étape qui SORT attend, une étape INTERNE part. C'est ICI que
    // la frontière s'exerce : `automaticSequenceIntent` refuse tout intent qui
    // atteindrait quelqu'un d'extérieur, quelle que soit l'étape qui l'a
    // programmé (garde GA-374, `sequence-frontier.ts`).
    for (const step of stepRows) {
      try {
        const result = await this.actionRouter.dispatch(
          {
            type: automaticSequenceIntent('schedule_reminder'),
            contactId: contact.id,
            at: step.due_at.toISOString(),
            note: reminderNote(sequence.name, step),
          },
          principal,
        )
        if (result.status === 'done' && result.externalRef) {
          step.payload = { ...step.payload, reminder_action_id: result.externalRef }
          await this.steps.save(step)
        } else if (result.status !== 'done') {
          this.logger.warn('outreach reminder dispatch not done', {
            sequenceId: sequence.id,
            stepId: step.id,
            status: result.status,
            reason: result.reason,
          })
        }
      } catch (error) {
        this.logger.warn('outreach reminder dispatch failed', { error, sequenceId: sequence.id, stepId: step.id })
      }
    }

    // À la CRÉATION, le contact n'a par construction pas encore répondu à une
    // séquence qui n'existait pas — mais on lit son statut plutôt que de poser
    // `false` : une séquence peut être créée sur un contact déjà en discussion.
    // ⚠️ Le compte est celui du CONTACT, relu ici plutôt que recopié : à la
    // création, le contact vient d'être chargé et son nom d'entreprise n'est
    // pas dans la même entité. Une lecture de plus sur un chemin qui en fait
    // déjà six vaut mieux qu'une ligne qui naît sans son compte et l'obtient
    // au rafraîchissement suivant — l'écran clignoterait.
    const accountName = contact.account_id
      ? ((await this.accounts.findOne({ where: { id: contact.account_id }, select: ['company_name'] }))?.company_name ??
        null)
      : null

    return toSequenceDto(
      sequence,
      stepRows,
      {
        name: contact.full_name ?? '',
        replied: contact.user_status === 'replied' || contact.user_status === 'meeting',
        role: contact.title ?? null,
        accountId: contact.account_id ?? null,
        accountName,
      },
      canSend,
    )
  }

  /** Lot L-B — le dernier message ENVOYÉ à ce contact (journal canonique), ou `null`. */
  private async lastSentAt(workspaceId: string, contactId: string): Promise<Date | null> {
    const rows = await this.sequences.query<{ last_sent_at: Date | string | null }[]>(
      `SELECT MAX(t.occurred_at) AS last_sent_at
         FROM outreach_transitions t
         JOIN outreach_messages m ON m.id = t.subject_id
        WHERE t.subject_kind = 'message' AND t.to_state = 'sent'
          AND m.workspace_id = $1 AND m.contact_id = $2`,
      [workspaceId, contactId],
    )
    const value = rows?.[0]?.last_sent_at
    return value ? new Date(value) : null
  }

  /** Liste les séquences du workspace actif (optionnellement filtrées par
   *  contact), plus récentes d'abord, avec étapes + prochaine échéance. */
  async list(userId: string, canSend: boolean, contactId?: string, consultantId?: string): Promise<OutreachSequence[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.applyMaxDelayReached(workspaceId)
    await this.applyAccountExcluded(workspaceId)
    const sequences = await this.sequences.find({
      where: {
        ...workspaceScopeWhere(workspaceId),
        ...(contactId ? { contact_id: contactId } : {}),
        ...(consultantId ? { consultant_id: consultantId } : {}),
      },
      order: { created_at: 'DESC' },
    })
    if (sequences.length === 0) return []

    const steps = await this.steps.find({
      where: { sequence_id: In(sequences.map(s => s.id)) },
      order: { position: 'ASC' },
    })
    const names = await this.contactNames(
      workspaceId,
      sequences.map(s => s.contact_id),
    )
    const cancelReasons = await this.cancelReasons(
      workspaceId,
      sequences.filter(s => s.status === 'cancelled').map(s => s.id),
    )
    const notNowRevalidation = await this.notNowRevalidationInfo(workspaceId, sequences, new Date())
    return sequences.map(sequence =>
      toSequenceDto(
        sequence,
        steps.filter(step => step.sequence_id === sequence.id),
        names.get(sequence.contact_id) ?? null,
        canSend,
        cancelReasons.get(sequence.id) ?? null,
        notNowRevalidation.get(sequence.id) ?? null,
      ),
    )
  }

  /** Une séquence du workspace actif, avec ses étapes. */
  async get(userId: string, id: string, canSend: boolean): Promise<OutreachSequence> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const sequence = await this.sequences.findOne({ where: { id, ...workspaceScopeWhere(workspaceId) } })
    if (!sequence) throw new NotFoundException('Séquence introuvable.')
    return this.hydrate(sequence, workspaceId, canSend)
  }

  /** Pause une séquence ACTIVE possédée (les rappels restants ne sont plus à
   *  jouer tant qu'elle est en pause). */
  async pause(userId: string, id: string, canSend: boolean): Promise<OutreachSequence> {
    const sequence = await this.loadOwned(userId, id)
    if (sequence.status !== 'active') {
      throw new BadRequestException(`Impossible de mettre en pause une séquence « ${sequence.status} ».`)
    }
    sequence.status = 'paused'
    await this.sequences.save(sequence)
    return this.hydrate(sequence, sequence.workspace_id, canSend)
  }

  /** Reprend une séquence en pause (ex. après une pause automatique à la
   *  réponse du contact, si le commercial veut continuer la cadence). */
  async resume(userId: string, id: string, canSend: boolean): Promise<OutreachSequence> {
    const sequence = await this.loadOwned(userId, id)
    if (sequence.status !== 'paused') {
      throw new BadRequestException(`Impossible de reprendre une séquence « ${sequence.status} ».`)
    }
    this.assertNotHistoricalContact(await this.contacts.findOne({ where: { id: sequence.contact_id } }))
    sequence.status = 'active'
    await this.sequences.save(sequence)
    return this.hydrate(sequence, sequence.workspace_id, canSend)
  }

  /**
   * Annule une séquence possédée (active ou en pause) : les étapes restantes
   * passent `skipped` — rien n'est supprimé, l'historique reste lisible.
   *
   * #2374.23 — l'une des 6 conditions d'arrêt nommées pour le nurturing :
   * « owner manuel ». `manual_stop` existe dans le vocabulaire fermé des
   * dix-sept événements d'arrêt (#2381, `OUTREACH_SEQUENCE_STOP_EVENTS`)
   * depuis sa création mais n'était JAMAIS écrit — ce geste, le SEUL arrêt
   * qu'un humain déclenche directement (les seize autres sont tous
   * automatiques), ne laissait donc aucune cause lisible dans
   * `outreach_transitions`, et `cancelReasons()` rendait `null` pour toute
   * séquence annulée à la main. `actor_kind: 'user'` la distingue des causes
   * automatiques (`'system'`) déjà écrites par `mailbox.service.ts`.
   */
  async cancel(userId: string, id: string, canSend: boolean): Promise<OutreachSequence> {
    const sequence = await this.loadOwned(userId, id)
    if (sequence.status === 'completed' || sequence.status === 'cancelled') {
      throw new BadRequestException(`La séquence est déjà « ${sequence.status} ».`)
    }
    const previousStatus = sequence.status
    sequence.status = 'cancelled'
    await this.sequences.save(sequence)
    await this.steps.update({ sequence_id: sequence.id, status: 'pending' }, { status: 'skipped' })
    await this.sequences.query(
      `INSERT INTO outreach_transitions
         (workspace_id, user_id, subject_kind, subject_id, from_state, to_state, actor, actor_kind, cause, result)
       VALUES ($1, $2, 'sequence', $3, $4, 'cancelled', $2, 'user', 'manual_stop', 'applied')`,
      [sequence.workspace_id, userId, sequence.id, previousStatus],
    )
    return this.hydrate(sequence, sequence.workspace_id, canSend)
  }

  /**
   * #2374.23 — l'une des 6 conditions d'arrêt nommées pour le nurturing :
   * « compte hors cible ». Réutilise la porte G1 déjà là (`AccountEntity
   * .priority_gate`, `AccountGateService.decide`) plutôt que d'inventer un
   * second champ ICP/target : un compte `parked` EST « hors cible » — c'est
   * le mot que porte déjà `AccountGateService` (« le motif traîné afficherait
   * “hors cible” à côté d'un compte qu'on travaille »). Best-effort à chaque
   * lecture (`list`), même patron qu'un balayage temporel : ce module n'a
   * aucune infrastructure de tâche planifiée. Une panne ici ne doit jamais
   * faire échouer une lecture.
   */
  private async applyAccountExcluded(workspaceId: string | null): Promise<void> {
    if (!workspaceId) return
    try {
      const excluded = await this.sequences.query<
        { id: string; workspace_id: string | null; user_id: string; previous_status: string }[]
      >(
        `WITH targeted AS (
           SELECT s.id, s.workspace_id, s.user_id, s.status AS previous_status
             FROM outreach_sequences s
             JOIN contacts c ON c.id = s.contact_id
             JOIN accounts a ON a.id = c.account_id
            WHERE s.workspace_id = $1 AND s.status IN ('active', 'paused') AND a.priority_gate = 'parked'
         ), updated AS (
           UPDATE outreach_sequences s SET status = 'cancelled'
             FROM targeted WHERE s.id = targeted.id
         )
         SELECT id, workspace_id, user_id, previous_status FROM targeted`,
        [workspaceId],
      )
      if (excluded.length === 0) return
      const ids = excluded.map(row => row.id)
      await this.sequences.query(
        `UPDATE outreach_sequence_steps SET status = 'skipped' WHERE sequence_id = ANY($1::uuid[]) AND status = 'pending'`,
        [ids],
      )
      for (const row of excluded) {
        await this.sequences.query(
          `INSERT INTO outreach_transitions
             (workspace_id, user_id, subject_kind, subject_id, from_state, to_state, actor, actor_kind, cause, result)
           VALUES ($1, $2, 'sequence', $3, $4, 'cancelled', $2, 'system', 'account_excluded', 'applied')`,
          [row.workspace_id, row.user_id, row.id, row.previous_status],
        )
      }
    } catch (cause) {
      this.logger.warn('auto-stop account-excluded outreach sequences failed', { error: cause, workspaceId })
    }
  }

  /**
   * Marque une étape `done` (fait avancer la séquence : la prochaine étape
   * `pending` devient la suivante à jouer). Quand plus aucune étape n'est
   * `pending`, la séquence passe `completed`. Journalise l'avancement dans
   * `user_actions` (best-effort). Marquer `done` NE déclenche AUCUN envoi —
   * c'est un constat que le geste (humain) a été fait.
   */
  async stepDone(userId: string, sequenceId: string, stepId: string, canSend: boolean): Promise<OutreachSequence> {
    const sequence = await this.loadOwned(userId, sequenceId)
    if (sequence.status === 'completed' || sequence.status === 'cancelled') {
      throw new BadRequestException(`La séquence est « ${sequence.status} » — étape non modifiable.`)
    }
    const step = await this.steps.findOne({ where: { id: stepId, sequence_id: sequence.id } })
    if (!step) throw new NotFoundException('Étape introuvable dans cette séquence.')
    if (step.status !== 'pending') {
      throw new BadRequestException(`L'étape est déjà « ${step.status} ».`)
    }

    step.status = 'done'
    step.done_at = new Date()
    await this.steps.save(step)

    const remaining = await this.steps.count({ where: { sequence_id: sequence.id, status: 'pending' } })
    if (remaining === 0) {
      sequence.status = 'completed'
      // Épopée #2873 (#2367.14) — la date RÉELLE du passage à `completed`,
      // pas une déduction ultérieure : c'est elle que la routine
      // `sequence_completed_crm_update` lit pour ne signaler que le récent.
      sequence.completed_at = new Date()
      await this.sequences.save(sequence)
    }

    await this.journalStepDone(sequence, step, userId)
    return this.hydrate(sequence, sequence.workspace_id, canSend)
  }

  /** #4418 — le contact d'une séquence, pour planifier ses relances (lecture seule ; `null` si introuvable). */
  async contactOf(contactId: string): Promise<ContactEntity | null> {
    return this.contacts.findOne({ where: { id: contactId } })
  }

  /**
   * #2153.39 — « Elle ne doit pas être une liste figée. » Une séquence ARMÉE
   * ne pouvait plus recevoir de touche : `create` est la seule porte qui
   * écrit des étapes. Ajoute une étape à la FIN d'une séquence encore vivante
   * (active ou en pause) — jamais au milieu : réordonner une cadence déjà
   * partiellement jouée déciderait pour des étapes déjà `done`/`skipped`, ce
   * qu'aucun écran ne montre et qu'aucun contrat ne prévoit.
   *
   * Réutilise EXACTEMENT les gardes de `create` sur la nouvelle étape :
   * `resolveSteps` (même résolution d'échéance), `OUTREACH_SEQUENCE_MAX_STEPS`
   * (même plafond) et `outreachMessageSpacingProblems` (même règle
   * d'espacement, plancher plat — l'état de relation n'est pas rejoué ici).
   */
  async addStep(
    userId: string,
    sequenceId: string,
    input: CreateOutreachStepInput,
    canSend: boolean,
  ): Promise<OutreachSequence> {
    const sequence = await this.loadOwned(userId, sequenceId)
    if (sequence.status === 'completed' || sequence.status === 'cancelled') {
      throw new BadRequestException(`La séquence est « ${sequence.status} » — aucune étape ne peut plus s'ajouter.`)
    }

    const existing = await this.steps.find({ where: { sequence_id: sequence.id }, order: { position: 'ASC' } })
    if (existing.length >= OUTREACH_SEQUENCE_MAX_STEPS) {
      throw new BadRequestException(`Une séquence ne porte pas plus de ${OUTREACH_SEQUENCE_MAX_STEPS} étapes.`)
    }

    // Les gardes de FORME (échéance, plafond, espacement) d'abord — pures,
    // sans lecture de plus — avant la lecture du contact, qui ne sert qu'à
    // construire le payload de l'étape retenue.
    const [resolved] = resolveSteps(
      {
        contact_id: sequence.contact_id,
        steps: [input],
      } as CreateOutreachSequenceRequest,
      new Date(),
      sequence.delay_unit ?? 'calendar_days',
    )
    if (!resolved) throw new BadRequestException('Étape invalide.')

    const last = existing[existing.length - 1]
    if (last && resolved.due_at.getTime() <= last.due_at.getTime()) {
      throw new BadRequestException(
        'La nouvelle étape doit être datée après la dernière étape — une cadence se prolonge, elle ne se réordonne pas.',
      )
    }

    const spacing = outreachMessageSpacingProblems([
      ...existing.map(step => ({ kind: step.kind, due_at: step.due_at })),
      resolved,
    ])
    if (spacing.length > 0) {
      const problem = spacing[spacing.length - 1]
      throw new BadRequestException(
        `Deux messages à ${problem?.days ?? 0} jour(s) d'intervalle : il en faut au moins ${problem?.required ?? 0}.`,
      )
    }

    const contact = await this.contacts.findOne({ where: { id: sequence.contact_id } })
    if (!contact) throw new NotFoundException('Contact introuvable.')
    this.assertNotHistoricalContact(contact)

    await this.steps.save(
      this.steps.create({
        sequence_id: sequence.id,
        position: existing.length,
        due_at: resolved.due_at,
        kind: resolved.kind,
        payload: buildStepPayload(resolved, contact),
        status: 'pending',
        done_at: null,
      }),
    )

    return this.hydrate(sequence, sequence.workspace_id, canSend)
  }

  /**
   * #2378.5 — modifier une étape ENCORE À FAIRE (date, libellé, note). Les
   * gardes de la création se rejouent (reco du registre tranchée le 22/09
   * soir) : l'ordre des étapes ne s'inverse pas, et deux messages ne se
   * rapprochent pas sous l'espacement minimal.
   */
  async updateStep(
    userId: string,
    sequenceId: string,
    stepId: string,
    input: UpdateOutreachStepInput,
    canSend: boolean,
  ): Promise<OutreachSequence> {
    const sequence = await this.loadOwned(userId, sequenceId)
    if (sequence.status === 'completed' || sequence.status === 'cancelled') {
      throw new BadRequestException(`La séquence est « ${sequence.status} » — ses étapes ne se modifient plus.`)
    }
    const all = await this.steps.find({ where: { sequence_id: sequence.id }, order: { position: 'ASC' } })
    const target = all.find(step => step.id === stepId)
    if (!target) throw new NotFoundException('Étape introuvable.')
    if (target.status !== 'pending') {
      throw new BadRequestException(
        'Une étape déjà faite ou retirée ne se modifie pas : elle appartient à l’historique.',
      )
    }
    // Lot L-B — le délai en jours (ouvrés ou calendaires selon la séquence)
    // depuis sa création : on le traduit en échéance, puis les gardes ordinaires
    // (ordre, espacement) s'appliquent à cette échéance comme à une date saisie.
    if (input.offset_days !== undefined && input.due_at !== undefined) {
      throw new BadRequestException('Donne soit une date, soit un délai en jours — pas les deux.')
    }
    const createdAt = sequence.created_at ?? new Date()
    const requestedDue =
      input.offset_days !== undefined
        ? dueAtForOffset(parisDate(createdAt), input.offset_days, createdAt, sequence.delay_unit ?? 'calendar_days')
        : input.due_at !== undefined
          ? new Date(input.due_at)
          : null
    // Lot L-B — changer le CANAL d'une étape à faire. Une étape e-mail dont le
    // brouillon est déjà préparé porte un message canonique : on la retire et on
    // en ajoute une autre plutôt que de l'orpheliner.
    let nextKind = target.kind
    if (input.kind !== undefined && input.kind !== target.kind) {
      if (target.kind === 'email' && target.payload?.['draft_available'] === true) {
        throw new BadRequestException(
          'Cette étape e-mail a déjà un brouillon préparé : retire-la et ajoute une autre étape pour changer de canal.',
        )
      }
      nextKind = input.kind
    }
    if (nextKind !== target.kind) {
      const contact = await this.contacts.findOne({ where: { id: sequence.contact_id } })
      if (!contact) throw new NotFoundException('Contact introuvable.')
      const kept = Object.fromEntries(
        Object.entries(target.payload ?? {}).filter(([key]) =>
          ['label', 'note', 'objective', 'owner_id', 'offset_days', 'reminder_action_id'].includes(key),
        ),
      )
      const label = typeof kept['label'] === 'string' ? kept['label'] : DEFAULT_STEP_LABEL[nextKind]
      target.kind = nextKind
      target.payload = {
        ...buildStepPayload({ kind: nextKind, due_at: target.due_at, label }, contact),
        ...kept,
      }
    }
    if (requestedDue !== null) {
      const due = requestedDue
      const live = all.filter(step => step.status !== 'skipped')
      const index = live.findIndex(step => step.id === stepId)
      const before = live[index - 1]
      const after = live[index + 1]
      if ((before && due.getTime() <= before.due_at.getTime()) || (after && due.getTime() >= after.due_at.getTime())) {
        throw new BadRequestException(
          'La nouvelle date doit rester entre l’étape précédente et la suivante — une cadence se retouche, elle ne se réordonne pas.',
        )
      }
      const spacing = outreachMessageSpacingProblems(
        live.map(step => ({ kind: step.kind, due_at: step.id === stepId ? due : step.due_at })),
      )
      if (spacing.length > 0) {
        const problem = spacing[0]
        throw new BadRequestException(
          `Deux messages à ${problem?.days ?? 0} jour(s) d'intervalle : il en faut au moins ${problem?.required ?? 0}.`,
        )
      }
      target.due_at = due
      if (input.offset_days !== undefined) target.payload = { ...target.payload, offset_days: input.offset_days }
    } else if (input.kind !== undefined) {
      // Un changement de canal seul : l'espacement entre messages se rejoue.
      const live = all.filter(step => step.status !== 'skipped')
      const spacing = outreachMessageSpacingProblems(live.map(step => ({ kind: step.kind, due_at: step.due_at })))
      if (spacing.length > 0) {
        const problem = spacing[0]
        throw new BadRequestException(
          `Deux messages à ${problem?.days ?? 0} jour(s) d'intervalle : il en faut au moins ${problem?.required ?? 0}.`,
        )
      }
    }
    // #3702 — l'objet et le corps écrits par la personne : seulement sur une
    // étape e-mail SANS brouillon. Un brouillon préparé se révise dans « À
    // valider » (versions), jamais en silence ici.
    if (input.email_draft !== undefined) {
      if (target.kind !== 'email') {
        throw new BadRequestException('Seule une étape e-mail porte un objet et un corps.')
      }
      const existing = target.payload?.['email_draft']
      if (existing && typeof existing === 'object' && (existing as { body?: unknown }).body) {
        throw new BadRequestException(
          'Cette étape a déjà un brouillon préparé : il se révise dans « À valider », pas ici.',
        )
      }
    }
    // #2202.36 — le responsable de l'étape : un membre de l'espace, jamais un identifiant quelconque ; `null` l'efface.
    if (input.owner_id) {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      await this.workspaceContext.assertMember(input.owner_id, workspaceId)
    }
    if (input.owner_id === null) {
      const { owner_id: _removed, ...kept } = (target.payload ?? {}) as Record<string, unknown>
      target.payload = kept
    }
    target.payload = {
      ...target.payload,
      ...(input.owner_id ? { owner_id: input.owner_id } : {}),
      ...(input.email_draft !== undefined
        ? {
            email_draft: { subject: input.email_draft.subject, body: input.email_draft.body, channel: 'email' },
            draft_available: true,
          }
        : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.objective !== undefined ? { objective: input.objective } : {}),
    }
    await this.steps.save(target)
    return this.hydrate(sequence, sequence.workspace_id, canSend)
  }

  /**
   * #2378.5 — retirer une étape à faire. On ARCHIVE (`skipped` + trace), on ne
   * supprime pas : l'historique d'une cadence dit aussi ce qu'on a renoncé à faire.
   */
  async removeStep(userId: string, sequenceId: string, stepId: string, canSend: boolean): Promise<OutreachSequence> {
    const sequence = await this.loadOwned(userId, sequenceId)
    const all = await this.steps.find({ where: { sequence_id: sequence.id }, order: { position: 'ASC' } })
    const target = all.find(step => step.id === stepId)
    if (!target) throw new NotFoundException('Étape introuvable.')
    if (target.status !== 'pending') {
      throw new BadRequestException('Seule une étape encore à faire se retire.')
    }
    target.status = 'skipped'
    target.payload = { ...target.payload, removed_by_user: true, removed_at: new Date().toISOString() }
    await this.steps.save(target)
    return this.hydrate(sequence, sequence.workspace_id, canSend)
  }

  /**
   * #2909 (#2378.2) — déclarer (ou effacer, `null`) le signal d'ouverture/clic
   * RAPPORTÉ par le commercial sur une étape. Jamais détecté automatiquement
   * (voir `OUTREACH_ENGAGEMENT_SIGNALS`, `outreach-sequence.ts`) : un geste
   * déclaratif, comme « Fait » (c81) — jamais confondu avec une preuve. Aucune
   * restriction de statut : une étape déjà faite reste le seul endroit où
   * rapporter ce qu'on y a observé, et une correction humaine gagne toujours.
   */
  async declareEngagementSignal(
    userId: string,
    sequenceId: string,
    stepId: string,
    input: DeclareOutreachEngagementSignalInput,
    canSend: boolean,
  ): Promise<OutreachSequence> {
    const sequence = await this.loadOwned(userId, sequenceId)
    const target = await this.steps.findOne({ where: { id: stepId, sequence_id: sequence.id } })
    if (!target) throw new NotFoundException('Étape introuvable.')
    target.engagement_signal = input.engagement_signal
    target.engagement_signal_at = input.engagement_signal ? new Date() : null
    await this.steps.save(target)
    return this.hydrate(sequence, sequence.workspace_id, canSend)
  }

  /**
   * #2378.7 — dupliquer = reprendre les étapes À VENIR de cette séquence pour
   * UN AUTRE contact (reco (a) du registre, tranchée le 22/09 soir). La copie
   * passe par `create` — donc par TOUTES ses gardes (opt-out, contact RISQUE,
   * une seule séquence active par contact) — et garde la trace de son origine.
   * L'originale et ses inscriptions ne bougent pas (c74 : mono-contact).
   */
  async duplicate(
    principal: ActionPrincipal,
    sequenceId: string,
    dto: DuplicateOutreachSequenceRequest,
    canSend: boolean,
  ): Promise<OutreachSequence> {
    const original = await this.loadOwned(principal.userId, sequenceId)
    if (dto.contact_id === original.contact_id) {
      throw new BadRequestException(
        'Une copie part vers un AUTRE contact : sur le même, reprenez ou ajoutez une étape à la séquence existante.',
      )
    }
    const all = await this.steps.find({ where: { sequence_id: original.id }, order: { position: 'ASC' } })
    const kept = all.filter(step => step.status !== 'skipped')
    if (kept.length === 0) throw new BadRequestException('Cette séquence n’a aucune étape à reprendre.')
    const firstAt = kept[0]?.due_at ?? new Date(0)
    const first = firstAt.getTime()
    const day = 86_400_000
    // Lot L-B — la copie garde l'UNITÉ de l'originale : le rythme d'une cadence en
    // jours ouvrés se reprend en jours ouvrés (sinon 14 jours calendaires
    // deviendraient 14 jours ouvrés), et une séquence ancienne reste calendaire.
    const unit: OutreachDelayUnit = original.delay_unit ?? 'calendar_days'
    const steps = kept.map(step => ({
      kind: step.kind,
      // Le RYTHME se reprend, pas les dates : la copie démarre aujourd'hui.
      offset_days:
        unit === 'business_days'
          ? businessDaysBetween(firstAt, step.due_at)
          : Math.max(0, Math.round((step.due_at.getTime() - first) / day)),
      label: readLabel(step),
    }))
    return this.create(
      {
        contact_id: dto.contact_id,
        name: original.name,
        steps,
        delay_unit: unit,
        ...(original.template_key ? { template_key: original.template_key as OutreachTemplateKey } : {}),
        ...(dto.acknowledge_risk ? { acknowledge_risk: true } : {}),
        ...(dto.force_justification ? { force_justification: dto.force_justification } : {}),
      },
      principal,
      canSend,
      { duplicated_from: original.id },
    )
  }

  /** #4804 — charge une séquence de l'ESPACE de l'appelant (ou sa ligne ancienne) pour un geste. */
  private async loadOwned(userId: string, id: string): Promise<OutreachSequenceEntity> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const sequence = await this.sequences.findOne({
      where: workspaceGestureWhere<OutreachSequenceEntity>(workspaceId, userId, { id }),
    })
    if (!sequence) throw new NotFoundException('Séquence introuvable.')
    return sequence
  }

  /** Recharge steps + nom du contact et projette le DTO. */
  private async hydrate(
    sequence: OutreachSequenceEntity,
    workspaceId: string | null,
    canSend: boolean,
  ): Promise<OutreachSequence> {
    const steps = await this.steps.find({ where: { sequence_id: sequence.id }, order: { position: 'ASC' } })
    const names = await this.contactNames(workspaceId, [sequence.contact_id])
    const cancelReasons = await this.cancelReasons(workspaceId, sequence.status === 'cancelled' ? [sequence.id] : [])
    const notNowRevalidation = await this.notNowRevalidationInfo(workspaceId, [sequence], new Date())
    return toSequenceDto(
      sequence,
      steps,
      names.get(sequence.contact_id) ?? null,
      canSend,
      cancelReasons.get(sequence.id) ?? null,
      notNowRevalidation.get(sequence.id) ?? null,
    )
  }

  /**
   * #2374.23 — arrête automatiquement toute séquence ACTIVE ou EN PAUSE dont
   * la dernière étape est en retard depuis plus de {@link MAX_DELAY_GRACE_DAYS}
   * jours : cause `max_delay_reached`, le seul des dix-sept événements
   * d'arrêt (#2381, `OUTREACH_SEQUENCE_STOP_EVENTS`) jamais appliqué avant ce
   * lot. Même patron que `ContactsService.autoStopOutreachSequences` (skip
   * des étapes restantes + journal `outreach_transitions`, actor `system`),
   * mais déclenché par le TEMPS et non par un événement contact — appelé en
   * best-effort à chaque lecture (`list`) plutôt que par un cron dédié : ce
   * module n'a aucune infrastructure de tâche planifiée, et en ajouter une
   * pour une vérification purement calendaire aurait été disproportionné.
   * Une panne ici ne doit jamais faire échouer une lecture.
   */
  private async applyMaxDelayReached(workspaceId: string | null): Promise<void> {
    if (!workspaceId) return
    try {
      const overdue = await this.sequences.query<
        { id: string; workspace_id: string | null; user_id: string; previous_status: string }[]
      >(
        `WITH horizons AS (
           SELECT s.id, s.workspace_id, s.user_id, s.status AS previous_status, MAX(st.due_at) AS horizon
             FROM outreach_sequences s
             JOIN outreach_sequence_steps st ON st.sequence_id = s.id
            WHERE s.workspace_id = $1 AND s.status IN ('active', 'paused')
            GROUP BY s.id
         ), stale AS (
           SELECT id, workspace_id, user_id, previous_status FROM horizons
            WHERE horizon < now() - ($2 || ' days')::interval
         ), updated AS (
           UPDATE outreach_sequences s SET status = 'cancelled'
             FROM stale WHERE s.id = stale.id
         )
         SELECT id, workspace_id, user_id, previous_status FROM stale`,
        [workspaceId, MAX_DELAY_GRACE_DAYS],
      )
      if (overdue.length === 0) return
      const ids = overdue.map(row => row.id)
      await this.sequences.query(
        `UPDATE outreach_sequence_steps SET status = 'skipped' WHERE sequence_id = ANY($1::uuid[]) AND status = 'pending'`,
        [ids],
      )
      for (const row of overdue) {
        await this.sequences.query(
          `INSERT INTO outreach_transitions
             (workspace_id, user_id, subject_kind, subject_id, from_state, to_state, actor, actor_kind, cause, result)
           VALUES ($1, $2, 'sequence', $3, $4, 'cancelled', $2, 'system', 'max_delay_reached', 'applied')`,
          [row.workspace_id, row.user_id, row.id, row.previous_status],
        )
      }
    } catch (cause) {
      this.logger.warn('auto-stop max-delay outreach sequences failed', { error: cause, workspaceId })
    }
  }

  /**
   * #2202.48/#2202.51 — la CAUSE de l'arrêt d'une séquence annulée, relue dans
   * `outreach_transitions` (subject_kind='sequence', to_state='cancelled') —
   * jamais recalculée : `stopSequencesForContact` (`mailbox.service.ts`) y
   * écrit déjà la cause exacte au moment de l'arrêt (#2381). `DISTINCT ON` +
   * tri décroissant : la transition la PLUS RÉCENTE, au cas où une séquence
   * aurait plusieurs lignes (elle ne s'annule qu'une fois, mais le journal est
   * APPEND-ONLY et ne le garantit pas par construction).
   */
  private async cancelReasons(
    workspaceId: string | null,
    sequenceIds: string[],
  ): Promise<Map<string, OutreachSequenceStopEvent>> {
    const unique = [...new Set(sequenceIds)]
    if (unique.length === 0 || !workspaceId) return new Map()
    const rows = await this.sequences.query<{ subject_id: string; cause: OutreachSequenceStopEvent }[]>(
      `SELECT DISTINCT ON (subject_id) subject_id, cause
         FROM outreach_transitions
        WHERE subject_kind = 'sequence' AND subject_id = ANY($1::uuid[]) AND to_state = 'cancelled'
          AND workspace_id = $2
        ORDER BY subject_id, occurred_at DESC`,
      [unique, workspaceId],
    )
    return new Map(rows.map(row => [row.subject_id, row.cause]))
  }

  /**
   * #3061 — ce qu'une pause `not_now_deferred` sait dire à l'écran, sans
   * inventer un planificateur : QUAND elle a été posée (`outreach_transitions`,
   * même DISTINCT ON que {@link cancelReasons}), et la SEULE revérification
   * automatique honnête aujourd'hui — le poste, `contact.lifecycle_state`, le
   * même fait que `resume()` vérifie déjà. Contexte/signal/pertinence sont
   * NOMMÉS non évalués, jamais devinés (doctrine : un axe non mesuré sort du
   * dénominateur, il ne se tait pas).
   */
  private async notNowRevalidationInfo(
    workspaceId: string | null,
    sequences: OutreachSequenceEntity[],
    now: Date,
  ): Promise<Map<string, OutreachSequenceNotNowRevalidation>> {
    const pausedIds = [...new Set(sequences.filter(s => s.status === 'paused').map(s => s.id))]
    if (pausedIds.length === 0 || !workspaceId) return new Map()
    // #3061 (fix 53bc0cf82c) — `outreach_transitions` n'a pas de colonne
    // `created_at`, seulement `occurred_at` (migration OutreachCanonicalModel).
    const rows = await this.sequences.query<{ subject_id: string; cause: string; occurred_at: Date }[]>(
      `SELECT DISTINCT ON (subject_id) subject_id, cause, occurred_at
         FROM outreach_transitions
        WHERE subject_kind = 'sequence' AND subject_id = ANY($1::uuid[]) AND to_state = 'paused'
          AND workspace_id = $2
        ORDER BY subject_id, occurred_at DESC`,
      [pausedIds, workspaceId],
    )
    const pausedByNotNow = new Map(
      rows.filter(row => row.cause === 'not_now_deferred').map(row => [row.subject_id, row]),
    )
    if (pausedByNotNow.size === 0) return new Map()

    const contactIds = [...new Set(sequences.filter(s => pausedByNotNow.has(s.id)).map(s => s.contact_id))]
    const contacts = await this.contacts.find({
      where: { id: In(contactIds), ...workspaceScopeWhere(workspaceId) },
      select: ['id', 'lifecycle_state'],
    })
    const lifecycleByContact = new Map(contacts.map(c => [c.id, c.lifecycle_state]))

    const out = new Map<string, OutreachSequenceNotNowRevalidation>()
    for (const sequence of sequences) {
      const row = pausedByNotNow.get(sequence.id)
      if (!row) continue
      out.set(sequence.id, {
        due: notNowRevalidationDue(row.occurred_at, now),
        poste_still_valid: lifecycleByContact.get(sequence.contact_id) !== 'historique',
        not_evaluated: ['contexte', 'signal', 'pertinence'],
      })
    }
    return out
  }

  /** Noms des contacts, scope workspace (jamais de fuite cross-tenant). */
  private async contactNames(workspaceId: string | null, contactIds: string[]): Promise<Map<string, ContactSummary>> {
    const unique = [...new Set(contactIds)]
    if (unique.length === 0 || !workspaceId) return new Map()
    const rows = await this.contacts.find({
      where: { id: In(unique), ...workspaceScopeWhere(workspaceId) },
      // `user_status` voyage avec le nom : c'est la même lecture, et c'est ce
      // qui alimente enfin la colonne « Réponses ». Les deux statuts retenus
      // sont exactement ceux qui mettent une séquence en pause côté contacts —
      // une troisième liste ferait diverger l'écran du moteur.
      //
      // ⚠️ #1515 — `title` et `account_id` voyagent avec eux, pour la même
      // raison et sans requête de plus : le cockpit doit dire QUI est contacté
      // et CHEZ QUI. Une ligne « Séquence · Marie Dubois » ne suffit pas à
      // décider s'il faut la relancer.
      //
      // ⚠️ `photo_url` n'y est PAS. C'est un critère protégé, et cette charge
      // utile sert aussi à choisir qui contacter : une photo s'affiche sur une
      // fiche, elle n'entre pas dans une liste qui ordonne des gens.
      select: ['id', 'full_name', 'user_status', 'title', 'account_id'],
    })

    // Les noms de compte, en UNE requête pour toutes les séquences. Les
    // résoudre ligne par ligne ferait N+1 sur un écran qui en affiche cinquante.
    const accountIds = [...new Set(rows.map(row => row.account_id).filter((id): id is string => !!id))]
    const accountNames = new Map<string, string>()
    if (accountIds.length > 0) {
      const accounts = await this.accounts.find({
        where: { id: In(accountIds), ...workspaceScopeWhere(workspaceId) },
        select: ['id', 'company_name'],
      })
      for (const account of accounts) accountNames.set(account.id, account.company_name)
    }

    return new Map(
      rows.map(row => [
        row.id,
        {
          name: row.full_name,
          replied: row.user_status === 'replied' || row.user_status === 'meeting',
          role: row.title ?? null,
          accountId: row.account_id ?? null,
          // ⚠️ `?? null` et non le nom du compte manquant : un compte hors du
          // périmètre de lecture n'a pas de nom ici, et écrire « Compte
          // inconnu » à sa place inventerait une entreprise.
          accountName: row.account_id ? (accountNames.get(row.account_id) ?? null) : null,
        },
      ]),
    )
  }

  /** Avancement → feed d'activité (`plan_action_completed`). Best-effort : un
   *  échec de journal n'annule jamais l'avancement déjà persisté.
   *
   * #2718.1 — retour SKAIZen Group (22/09/2026) : « si on exécute une
   * séquence, on voit aussi le changement depuis le compte ». Ce journal
   * ÉCRIVAIT `account_id: null` en dur : `AccountTimelineService` filtre ses
   * `user_actions` sur `account_id` (`account-timeline.service.ts:89`), donc
   * l'étape n'apparaissait JAMAIS dans le fil du compte. Le compte se lit sur
   * le CONTACT de la séquence — jamais deviné si le contact n'en a pas. */
  private async journalStepDone(
    sequence: OutreachSequenceEntity,
    step: OutreachSequenceStepEntity,
    userId: string,
  ): Promise<void> {
    try {
      const contact = await this.contacts.findOne({
        where: { id: sequence.contact_id },
        select: ['account_id'],
      })
      await this.userActions.save(
        this.userActions.create({
          user_id: userId,
          workspace_id: sequence.workspace_id,
          account_id: contact?.account_id ?? null,
          contact_id: sequence.contact_id,
          action_type: 'plan_action_completed',
          channel: null,
          metadata: {
            label: 'Étape de séquence faite',
            detail: `Séquence « ${sequence.name} » — ${readLabel(step)}`,
            status: 'Terminée',
            source: 'outreach_sequence',
            sequence_id: sequence.id,
            step_id: step.id,
          },
        }),
      )
    } catch (error) {
      this.logger.warn('outreach stepDone journal write failed', { error, sequenceId: sequence.id, stepId: step.id })
    }
  }
}

/* ------------------------------ pure helpers ------------------------------ */

/**
 * Résout les étapes datées d'une requête de création : depuis le template
 * (offsets J+n ancrés sur la date calendaire Europe/Paris du jour) ou depuis
 * les étapes custom (`due_at` explicite, ou `offset_days`). Triées par échéance
 * croissante — la `position` persistée suit cet ordre.
 */
export function resolveSteps(
  dto: CreateOutreachSequenceRequest,
  now: Date = new Date(),
  unit: OutreachDelayUnit = 'calendar_days',
): ResolvedStep[] {
  const anchor = parisDate(now)
  const inputs = dto.template
    ? OUTREACH_SEQUENCE_TEMPLATES[dto.template].steps.map(step => ({
        ...step,
        due_at: undefined,
        note: undefined,
        objective: undefined,
      }))
    : (dto.steps ?? [])

  const resolved = inputs.map((step): ResolvedStep => {
    const dueAt = step.due_at ? new Date(step.due_at) : dueAtForOffset(anchor, step.offset_days ?? 0, now, unit)
    return {
      kind: step.kind,
      due_at: dueAt,
      label: step.label?.trim() || DEFAULT_STEP_LABEL[step.kind],
      ...(!step.due_at && step.offset_days !== undefined ? { offset_days: step.offset_days } : {}),
      ...(step.note ? { note: step.note } : {}),
      ...(step.objective ? { objective: step.objective } : {}),
      ...(step.draft ? { draft: step.draft } : {}),
      ...(step.blocked_variables?.length ? { blocked_variables: step.blocked_variables } : {}),
    }
  })
  return resolved.sort((a, b) => a.due_at.getTime() - b.due_at.getTime())
}

/** Payload persisté d'une étape. Pour `email`, snapshot du brouillon PRÉPARÉ
 *  (`email_message`) — jamais de contenu inventé : sans brouillon,
 *  `draft_available: false` et l'humain le prépare avant d'envoyer. */
export function buildStepPayload(step: ResolvedStep, contact: ContactEntity): Record<string, unknown> {
  // #3756 — étape d'un modèle de bibliothèque : brouillon résolu, OU bloquée
  // (variables nommées, AUCUN brouillon — jamais un `{{firstName}}` littéral).
  const blocked = step.kind === 'email' && step.blocked_variables?.length
  const fromTemplate = step.kind === 'email' && step.draft
  return {
    label: step.label,
    ...(step.offset_days !== undefined ? { offset_days: step.offset_days } : {}),
    ...(step.note ? { note: step.note } : {}),
    ...(step.objective ? { objective: step.objective } : {}),
    ...manualChannelPayload(step.kind, contact, step.draft?.body),
    ...(blocked ? { email_draft: null, draft_available: false, blocked_variables: step.blocked_variables } : {}),
    ...(!blocked && fromTemplate && step.draft
      ? { email_draft: { subject: step.draft.subject, body: step.draft.body, channel: 'email' }, draft_available: true }
      : {}),
    ...(step.kind === 'email' && !blocked && !fromTemplate
      ? { email_draft: contact.email_message ?? null, draft_available: contact.email_message != null }
      : {}),
  }
}

/**
 * Lot L-B — ce que prépare une étape LinkedIn ou appel : le texte déjà écrit
 * pour ce contact (`linkedin_message`, `phone_script`) et le profil à ouvrir.
 * Jamais un texte inventé : sans lui, `draft_available: false` et le commercial
 * le prépare avant de faire le geste. Bellum ne pilote ni LinkedIn ni le
 * téléphone — ce payload n'est que la matière du geste manuel.
 */
function manualChannelPayload(
  kind: OutreachStepKind,
  contact: ContactEntity,
  prepared?: string,
): Record<string, unknown> {
  // Lot L-C (#4166) — le texte PRÉPARÉ pour cette étape (modèle, assistant) prime
  // sur celui du contact ; sans lui, le comportement du lot L-B est inchangé.
  if (kind === 'linkedin_invite' || kind === 'linkedin_message') {
    const body = prepared?.trim() || contact.linkedin_message?.trim() || null
    return {
      linkedin_draft: body ? { body, profile_url: contact.linkedin_url ?? null } : null,
      draft_available: body !== null,
      profile_url: contact.linkedin_url ?? null,
    }
  }
  if (kind === 'call') {
    const script = prepared?.trim() || contact.phone_script?.trim() || null
    return { call_script: script, draft_available: script !== null }
  }
  return {}
}

/** Note du rappel interne : pour une étape email, dit explicitement « envoi
 *  manuel » — le rappel prépare le geste, il ne le fait pas. */
function reminderNote(sequenceName: string, step: OutreachSequenceStepEntity): string {
  const label = readLabel(step)
  return step.kind === 'email'
    ? `Séquence « ${sequenceName} » — ${label} (envoi manuel depuis Bellum)`
    : `Séquence « ${sequenceName} » — ${label}`
}

function readLabel(step: OutreachSequenceStepEntity): string {
  const label = step.payload?.['label']
  return typeof label === 'string' && label.trim().length > 0 ? label : DEFAULT_STEP_LABEL[step.kind]
}

function defaultSequenceName(dto: CreateOutreachSequenceRequest): string {
  return dto.template ? OUTREACH_SEQUENCE_TEMPLATES[dto.template].name : 'Séquence personnalisée'
}

/**
 * Échéance d'un offset J+n : la date calendaire Europe/Paris du jour + n jours,
 * à 07:00 UTC (≈ 09:00 à Paris l'été, 08:00 l'hiver — début de matinée
 * commerciale). Si l'échéance calculée est déjà passée (J0 créé l'après-midi),
 * l'échéance devient « maintenant » — jamais une étape née en retard.
 */
function dueAtForOffset(anchorIsoDate: string, offsetDays: number, now: Date, unit: OutreachDelayUnit): Date {
  const [y, m, d] = anchorIsoDate.split('-').map(Number)
  // Lot L-B — en jours OUVRÉS, samedi et dimanche ne comptent pas ; une
  // échéance déjà passée devient « maintenant », comme en jours calendaires.
  if (unit === 'business_days') {
    const base = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 7, 0, 0))
    const businessDue = addBusinessDays(base, offsetDays)
    return businessDue.getTime() < now.getTime() ? now : businessDue
  }
  const due = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + offsetDays, 7, 0, 0))
  if (due.getTime() < now.getTime()) return now
  // #2378.4 — une échéance FUTURE qui tombe un jour non ouvré (samedi/dimanche,
  // calendrier Europe/Paris — même convention que l'ancre) glisse au jour ouvré
  // suivant : une relance commerciale n'attend personne un week-end. Le
  // rattrapage « maintenant » ci-dessus n'est jamais concerné : une étape déjà
  // en retard part telle quelle, elle ne se reporte pas.
  const weekday = due.getUTCDay()
  if (weekday === 6) due.setUTCDate(due.getUTCDate() + 2)
  else if (weekday === 0) due.setUTCDate(due.getUTCDate() + 1)
  return due
}

/** Date calendaire Europe/Paris `YYYY-MM-DD` — même convention que le cockpit
 *  « overdue Europe/Paris » et le cron de relance. */
function parisDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(date)
}

/* --------------------------------- mapping -------------------------------- */

function toStepDto(row: OutreachSequenceStepEntity): OutreachSequenceStep {
  return {
    id: row.id,
    sequence_id: row.sequence_id,
    position: row.position,
    due_at: row.due_at.toISOString(),
    kind: row.kind,
    payload: row.payload ?? {},
    status: row.status,
    done_at: row.done_at ? row.done_at.toISOString() : null,
    engagement_signal: row.engagement_signal as OutreachSequenceStep['engagement_signal'],
    engagement_signal_at: row.engagement_signal_at ? row.engagement_signal_at.toISOString() : null,
  }
}

/** Ce que le service lit d'un contact pour une ligne de séquence. */
type ContactSummary = {
  name: string
  replied: boolean
  role: string | null
  accountId: string | null
  accountName: string | null
}

function toSequenceDto(
  sequence: OutreachSequenceEntity,
  steps: OutreachSequenceStepEntity[],
  contact: ContactSummary | null,
  canSend: boolean,
  // #2202.48/#2202.51 — la cause de l'arrêt, relue depuis `outreach_transitions`
  // (voir `OutreachService.cancelReasons`). `null` pour toute séquence non
  // annulée, ou une séquence annulée dont la transition n'a pas été retrouvée.
  cancelReason: OutreachSequenceStopEvent | null = null,
  // #3061 — voir `OutreachService.notNowRevalidationInfo`. `null` sauf pour
  // une séquence en pause CAUSÉE par `not_now_deferred`.
  notNowRevalidation: OutreachSequenceNotNowRevalidation | null = null,
): OutreachSequence {
  const ordered = [...steps].sort((a, b) => a.position - b.position)
  const nextStep = ordered.find(step => step.status === 'pending')
  return {
    id: sequence.id,
    contact_id: sequence.contact_id,
    contact_name: contact?.name ?? null,
    contact_role: contact?.role ?? null,
    account_id: contact?.accountId ?? null,
    account_name: contact?.accountName ?? null,
    contact_replied: contact?.replied ?? false,
    cancel_reason: sequence.status === 'cancelled' ? cancelReason : null,
    not_now_revalidation: sequence.status === 'paused' ? notNowRevalidation : null,
    name: sequence.name,
    campaign_label: sequence.campaign_label ?? null,
    template_key: sequence.template_key ?? null,
    consultant_id: sequence.consultant_id ?? null,
    duplicated_from: sequence.duplicated_from ?? null,
    forced_over_sequence_id: sequence.forced_over_sequence_id ?? null,
    force_justification: sequence.force_justification ?? null,
    status: sequence.status,
    delay_unit: sequence.delay_unit ?? 'calendar_days',
    vacation_until:
      sequence.status === 'paused' && sequence.vacation_until ? sequence.vacation_until.toISOString() : null,
    created_at: sequence.created_at ? sequence.created_at.toISOString() : new Date().toISOString(),
    steps: ordered.map(toStepDto),
    next_step: nextStep && sequence.status !== 'cancelled' ? toStepDto(nextStep) : null,
    can_send: canSend,
  }
}
