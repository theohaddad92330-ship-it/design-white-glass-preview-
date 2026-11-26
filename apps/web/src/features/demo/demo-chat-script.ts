/**
 * Le contenu scripté du copilote en espace de démonstration.
 *
 * Pourquoi scripté : le lien de démo part à des inconnus, et chaque message
 * libre serait un appel Claude facturé. Un prospect voit donc un fil DÉJÀ tenu
 * (ce à quoi ressemble le copilote après quelques échanges) et choisit ses
 * questions dans une liste — les réponses sont écrites à l'avance, aucune n'est
 * générée.
 *
 * ⚠️ Les réponses parlent de SOCIÉTÉS RÉELLES (Société Générale, Groupe BPCE,
 * SNCF, Alstom, ENGIE, TotalEnergies — les six comptes cibles de la salle
 * depuis le 01/10/2026), celles
 * que le visiteur peut ouvrir dans l'app.
 * Deux règles s'appliquent donc à chaque phrase écrite ici :
 *  - tout FAIT cité doit être dans le dossier seedé, avec sa source ;
 *  - aucune personne nommée. Les dossiers ne nomment que des mandataires
 *    sociaux du registre, et le copilote n'a aucune raison de les citer :
 *    personne n'ouvre un compte du CAC 40 par son conseil d'administration.
 */

import {
  lauraJobEstimatedCredits,
  lauraJobProgressOf,
  lauraJobResumeOf,
  lauraJobSynthesisOf,
  lauraJobToolsOf,
  lauraJobValidationsRequired,
  type LauraJobBrief,
  type LauraJobView,
  type PendingChatAction,
  type PlanBrief,
} from '@bellum/contracts'
import type { CopilotCardWire } from '@/features/chat/api/copilotCardsApi'
import { DEMO_CHAT_CAPTURE } from './demo-chat-capture'
import { demoDayClosureAction } from './demo-day-closure'
import { demoBulkEnrichmentAction } from './demo-bulk-enrichment'
import { demoMessageAudienceAction } from './demo-message-audience'
import { demoBulkMatchingAction } from './demo-long-job'
import { demoDayPlanAction, demoWeeklyPlanAction } from './demo-weekly-plan'

export const ACCOUNT_HREF_TOKEN_PREFIX = '{{account:'
export const ACCOUNT_HREF_TOKEN_SUFFIX = '}}'

/**
 * #3766 Reste (lot K06 07/10) — un jeton pour le lien de fiche d'un compte
 * SEEDÉ, jamais l'UUID lui-même : celui-ci est assigné par le semis et varie
 * par salle (`DemoSeedService`), donc aucune réponse écrite ici ne peut le
 * connaître à l'avance. `demo-turn.ts` (`resolveAccountHrefs`) le résout
 * contre les comptes réellement chargés par l'écran — jamais deviné, jamais
 * codé en dur.
 */
function accountHref(companyName: string): string {
  // `appPath` (contrat `reply-blocks.ts`) refuse tout espace : « Société Générale »,
  // « Groupe BPCE ». `demo-turn.ts` (`resolveAccountHrefs`) inverse le même remplacement.
  return `/accounts/${ACCOUNT_HREF_TOKEN_PREFIX}${companyName.replace(/ /g, '_')}${ACCOUNT_HREF_TOKEN_SUFFIX}`
}

export const CONTACT_HREF_TOKEN_PREFIX = '{{contact:'
export const CONTACT_HREF_TOKEN_SUFFIX = '}}'

/**
 * #4610.5 — même mécanique que `accountHref`, pour la FICHE d'un contact semé : son UUID est assigné par le semis
 * et varie par salle, le script nomme donc la personne par un jeton que `demo-turn.ts` résout contre les contacts
 * réellement chargés par l'écran — jamais deviné, jamais codé en dur.
 */
function contactHref(fullName: string): string {
  return `/contacts/${CONTACT_HREF_TOKEN_PREFIX}${fullName.replace(/ /g, '_')}${CONTACT_HREF_TOKEN_SUFFIX}`
}

/** Une barre du petit graphe accompagnant une réponse. */
type DemoChartBar = {
  label: string
  /** Valeur brute affichée en bout de barre. */
  value: number
  /** Ce que la valeur mesure, en toutes lettres (jamais deviné par l'axe). */
  unit?: string
}

export type DemoChart = {
  title: string
  /** Sous-titre : d'où vient le chiffre. Une démo doit rester lisible sans nous. */
  caption: string
  bars: DemoChartBar[]
}

/** Une question proposée + la réponse exacte qu'elle déclenche. */
type DemoChatPrompt = {
  id: string
  question: string
  answer: string
  chart?: DemoChart
  /** #1950 — les cartes du tour, rendues par le VRAI `CopilotCards` (barre « Plan de Laura » comprise). */
  cards?: readonly CopilotCardWire[]
  /**
   * #2679 — les réponses possibles d'une précision que Laura pose DANS son
   * texte, rendues en boutons par le VRAI composant de la conversation.
   *
   * ⚠️ Un clic ENVOIE le libellé comme message, et en démonstration le moteur
   * est le script : chaque libellé doit donc être, mot pour mot, la question
   * d'une autre amorce de cette liste — sinon le clic tombe sur la réponse
   * « hors script », et un prospect verrait un bouton qui ne mène nulle part.
   * `demo-turn.test.ts` le tient.
   */
  replyOptions?: readonly { question: string; options: readonly string[] }[]
  /**
   * #1950.4 / .7 / .12 / .13 — le résumé du plan (`context.plan_brief`), rendu
   * par la VRAIE barre « Plan de Laura » de `CopilotCards`.
   */
  planBrief?: PlanBrief
  /**
   * #2392 — les propositions du tour (`context.pending_actions`), rendues par le
   * VRAI `PendingActions`. Une FONCTION : leurs dates se calculent au tour.
   */
  pendingActions?: () => readonly PendingChatAction[]
  /**
   * #2276 — le job composite de Laura, dans la forme EXACTE que le serveur sert
   * (`context.laura_job`, `LauraJobService.toView`) : c'est la VRAIE
   * `LauraJobCard` qui le rend.
   */
  lauraJob?: LauraJobView
  /**
   * #3285 — les sources du tour (`context.sources`), dans la forme que le serveur sert. Ici : la
   * méthode citée (`kind: 'method_rule'`), jamais un document que le visiteur n'a pas déposé — sauf
   * un document FICTIF de l'ESN de la salle, semé avec la salle (#3750.8, `kind: 'knowledge_doc'`).
   */
  sources?: readonly { kind: string; label: string }[]
  /**
   * #5086 — les notes de la réponse (`context.reply_notes`) : « Précision : … » / « Contrainte retenue : … »,
   * sorties du corps et lues dans le panneau Sources. Le texte est celui que l'IA émet (`commercial_verifier.py`).
   */
  replyNotes?: readonly string[]
  /**
   * #2433.12 (épopée #2876, lot P02 09/10) — la capture SEMÉE que la question
   * porte en pièce jointe : en salle, le localiseur d'objets n'est jamais
   * appelé, la bulle de la question montre donc cette image dessinée, ses
   * bords et sa grille connus par construction (`demo-chat-capture.ts`).
   */
  imageCapture?: typeof DEMO_CHAT_CAPTURE
}

/** Les champs communs aux trois étapes du plan scripté : rien ne part de la salle. */
const DEMO_PLAN_STEP = {
  // Aucun geste offert, aucun tour : la barre du plan ne propose donc AUCUN
  // lancement (`planLaunchPreview` exige `confirm` et un tour) — elle MONTRE
  // les états, elle n'appelle jamais `POST action-os/cards/plan/:turnId/run`.
  allowedGestures: [],
  turnId: null,
  snoozedUntil: null,
  expiresAt: null,
  // #1952.24 — ces trois cartes PORTENT une proposition (`action` non nul) :
  // le bouton « voir le détail » ne se lit que sur une carte de SUIVI SANS
  // proposition (`CopilotCards.tsx`, `detailAccountId`) — jamais ici.
  accountId: null,
} as const

const BPCE_TARGET = 'Groupe BPCE — organe central'

/**
 * #1950.14 / #1950.20 / #1950.22 — UN PLAN DE LAURA AUX ÉTATS VARIÉS.
 *
 * Craft rule n°9 : la barre « Plan de Laura » (`CopilotCards.tsx`) se montre en
 * démonstration avec trois états de PLAN — faite, échouée, bloquée — parce qu'un
 * plan dont toutes les étapes seraient « à faire » ne montrerait rien de ce que
 * #1950 a livré. Chaque état dit une chose VRAIE de la salle :
 *  1. faite — le brouillon d'e-mail : c'est celui que `p-message` dit « dans le
 *     dossier », sur le même angle (une banque régionale, pas l'organe central) ;
 *  2. échouée — le message pour les réseaux professionnels : aucune génération facturée ne part d'une
 *     salle de démonstration (même règle que le micro, `demo-coverage.ts`) ;
 *  3. bloquée — le script d'appel DÉCLARE dépendre de l'étape 2 (`depends_on`) :
 *     c'est #1950.22 à l'écran, jamais une dépendance devinée depuis le rang.
 * Aucune personne nommée (`contact_name: null`) : le dossier ne nomme que
 * l'organe central. Aucun coût inventé : `costCredits`/`creditsSpent` à `null`.
 */
const DEMO_PLAN_CARDS: readonly CopilotCardWire[] = [
  {
    ...DEMO_PLAN_STEP,
    id: 'demo-plan-1',
    proposalIndex: 0,
    primary: true,
    state: 'executed',
    action: { action: 'prepare_message', contact_id: 'demo-bpce', contact_name: null, channel: 'email' },
    preview: {
      whatWillHappen: 'Générer un brouillon (e-mail) pour l’organe central du Groupe BPCE.',
      targetObject: BPCE_TARGET,
      destination: null,
      content: 'Angle : une banque régionale, cliente autonome, plutôt que l’organe central.',
      dataUsed: 'Le dossier Groupe BPCE',
      costCredits: null,
      connectionUsed: null,
      whatWillNotHappen: 'Aucun envoi : le brouillon reste à relire.',
    },
    result: {
      outcome: 'Le brouillon est dans le dossier Groupe BPCE. Rien n’a été envoyé.',
      occurredAt: null,
      actorName: null,
      targetObject: BPCE_TARGET,
      destination: null,
      connectionUsed: null,
      externalRef: null,
      creditsSpent: null,
      nextStep: 'Le relire, identifier la personne, l’envoyer toi-même.',
    },
  },
  {
    ...DEMO_PLAN_STEP,
    id: 'demo-plan-2',
    proposalIndex: 1,
    primary: false,
    state: 'failed',
    action: { action: 'prepare_message', contact_id: 'demo-bpce', contact_name: null, channel: 'linkedin' },
    preview: {
      whatWillHappen: 'Générer un message pour les réseaux professionnels, adressé à l’organe central du Groupe BPCE.',
      targetObject: BPCE_TARGET,
      destination: null,
      content: null,
      dataUsed: 'Le dossier Groupe BPCE',
      costCredits: null,
      connectionUsed: null,
      whatWillNotHappen: 'Aucun envoi : le message reste à relire.',
    },
    result: {
      outcome: 'Rien n’a été préparé : aucune génération facturée ne part d’une salle de démonstration.',
      occurredAt: null,
      actorName: null,
      targetObject: BPCE_TARGET,
      destination: null,
      connectionUsed: null,
      externalRef: null,
      creditsSpent: null,
      nextStep: null,
    },
  },
  {
    ...DEMO_PLAN_STEP,
    id: 'demo-plan-3',
    proposalIndex: 2,
    primary: false,
    state: 'prepared',
    action: {
      action: 'prepare_message',
      contact_id: 'demo-bpce',
      contact_name: null,
      channel: 'phone',
      depends_on: [1],
    },
    preview: {
      whatWillHappen: 'Générer un script d’appel de relance, à partir du message de l’étape 2.',
      targetObject: BPCE_TARGET,
      destination: null,
      content: null,
      dataUsed: 'Le message de l’étape 2',
      costCredits: null,
      connectionUsed: null,
      whatWillNotHappen: 'Aucun appel n’est passé.',
    },
    result: null,
  },
]

/**
 * #2276 — LE JOB COMPOSITE DE LAURA, EN DÉMONSTRATION.
 *
 * Une demande complexe devient une fiche de job. La salle en montre une,
 * SCRIPTÉE et DÉJÀ EXÉCUTÉE (#2276 tranche 2) : aucun job n'est persisté ni
 * lancé dans une salle (même règle que les cartes, I6), mais le prospect voit ce
 * qu'un job confirmé devient — chaque étape avec sa preuve, ce qui a été créé,
 * la validation de l'écriture CRM, et le débit RÉEL sous le coût maximum annoncé
 * (une recherche sans résultat ne débite rien). La fiche ne cite aucun fait hors
 * du dossier SNCF seedé — elle décrit un TRAVAIL, elle n'affirme rien de la
 * société. Aucun envoi : les messages sont des brouillons à relire.
 */
const DEMO_JOB_AT = '2026-09-24T09:04:00.000Z'
const DEMO_JOB_OWNER = '00000000-0000-4000-8000-000000000001'

const DEMO_LAURA_JOB_BRIEF: LauraJobBrief = {
  originalRequest: 'Trouve-moi les décideurs de chaque entité SNCF et prépare un premier message pour chacun',
  intent: 'Cartographier les décideurs des entités SNCF et préparer une première prise de contact',
  expectedOutcome: 'Dix décideurs rattachés à leur entité, chacun avec un premier message prêt à relire',
  scope: {
    description: 'Les entités SNCF du dossier de ton portefeuille',
    accountIds: [],
    // #2276.51 — les dix décideurs du périmètre (identifiants de salle) : la
    // prévisualisation dit « au plus 10 contacts », pas « aucun contact ».
    contactIds: Array.from(
      { length: 10 },
      (_, index) => `00000000-0000-4000-8000-0000000010${String(index).padStart(2, '0')}`,
    ),
  },
  assumptions: [],
  steps: [
    {
      key: 'read_dossier',
      label: 'Relire le dossier SNCF et ses entités',
      capability: 'read_workspace',
      units: 1,
      dependsOn: [],
      requiresApproval: false,
      status: 'done',
      startedAt: '2026-09-24T09:01:00.000Z',
      finishedAt: '2026-09-24T09:01:00.000Z',
      creditsSpent: null,
      creditsReserved: null,
      creditsRefunded: null,
      note: null,
      approvedBy: null,
      approvedAt: null,
      // #3860.1 / #3860.2 — job semé TERMINÉ : aucun filtre requis, aucune attente, rien de produit.
      criteria: null,
      awaiting: [],
      produced: { accountIds: [], contactIds: [] },
    },
    {
      key: 'enrich',
      label: 'Retrouver les coordonnées de dix décideurs',
      capability: 'contact_enrichment',
      units: 10,
      dependsOn: ['read_dossier'],
      requiresApproval: false,
      status: 'done',
      startedAt: '2026-09-24T09:01:00.000Z',
      finishedAt: '2026-09-24T09:03:00.000Z',
      creditsSpent: 8,
      creditsReserved: null,
      creditsRefunded: null,
      note: null,
      approvedBy: null,
      approvedAt: null,
      // #3860.1 / #3860.2 — job semé TERMINÉ : aucun filtre requis, aucune attente, rien de produit.
      criteria: null,
      awaiting: [],
      produced: { accountIds: [], contactIds: [] },
    },
    {
      key: 'messages',
      label: 'Préparer un premier message par décideur',
      capability: 'message_generation',
      units: 10,
      dependsOn: ['enrich'],
      requiresApproval: false,
      status: 'done',
      startedAt: '2026-09-24T09:03:00.000Z',
      finishedAt: DEMO_JOB_AT,
      creditsSpent: null,
      creditsReserved: null,
      creditsRefunded: null,
      note: null,
      approvedBy: null,
      approvedAt: null,
      // #3860.1 / #3860.2 — job semé TERMINÉ : aucun filtre requis, aucune attente, rien de produit.
      criteria: null,
      awaiting: [],
      produced: { accountIds: [], contactIds: [] },
    },
    {
      key: 'crm',
      label: 'Remonter les décideurs dans le CRM',
      capability: 'crm_write',
      units: 1,
      dependsOn: ['enrich'],
      requiresApproval: false,
      status: 'done',
      startedAt: DEMO_JOB_AT,
      finishedAt: DEMO_JOB_AT,
      creditsSpent: null,
      creditsReserved: null,
      creditsRefunded: null,
      note: null,
      approvedBy: DEMO_JOB_OWNER,
      approvedAt: '2026-09-24T09:03:30.000Z',
      // #3860.1 / #3860.2 — job semé TERMINÉ : aucun filtre requis, aucune attente, rien de produit.
      criteria: null,
      awaiting: [],
      produced: { accountIds: [], contactIds: [] },
    },
  ],
  sources: ['Dossier SNCF', 'Registre des entreprises'],
  // #2276.49 — en salle, une durée MESURÉE sur des étapes déjà exécutées (données
  // fictives de démonstration) : jamais une durée sans sa base.
  estimatedDurationSeconds: 240,
  estimatedDurationBasis: 12,
  intermediateResults: [
    { stepKey: 'read_dossier', summary: '1 + 0', at: '2026-09-24T09:01:00.000Z' },
    { stepKey: 'enrich', summary: '8/10', at: '2026-09-24T09:03:00.000Z' },
    { stepKey: 'messages', summary: '8/8', at: DEMO_JOB_AT },
    { stepKey: 'crm', summary: '1/1', at: DEMO_JOB_AT },
  ],
  errors: [
    {
      stepKey: 'enrich',
      message: 'Deux décideurs sans coordonnées vérifiables.',
      at: '2026-09-24T09:03:00.000Z',
    },
  ],
  createdObjects: [
    ...Array.from({ length: 8 }, (_, index) => ({
      kind: 'outreach_message',
      id: `demo-draft-${index + 1}`,
      label: `Brouillon à relire n°${index + 1}`,
    })),
    { kind: 'crm_note', id: 'demo-crm-note-1', label: 'Note CRM — décideurs SNCF' },
  ],
}

const DEMO_LAURA_JOB: LauraJobView = {
  id: '00000000-0000-4000-8000-000000002276',
  state: 'done',
  brief: DEMO_LAURA_JOB_BRIEF,
  tools: lauraJobToolsOf(DEMO_LAURA_JOB_BRIEF),
  validationsRequired: lauraJobValidationsRequired(DEMO_LAURA_JOB_BRIEF).map(step => ({
    key: step.key,
    label: step.label,
  })),
  progress: lauraJobProgressOf(DEMO_LAURA_JOB_BRIEF),
  resume: lauraJobResumeOf('done', DEMO_LAURA_JOB_BRIEF),
  ownerId: DEMO_JOB_OWNER,
  conversationId: null,
  turnId: null,
  // Le coût annoncé est celui de la grille, jamais un chiffre recopié.
  estimatedCredits: lauraJobEstimatedCredits(DEMO_LAURA_JOB_BRIEF),
  spentCredits: 8,
  startedAt: '2026-09-24T09:01:00.000Z',
  finishedAt: DEMO_JOB_AT,
  createdAt: '2026-09-24T09:00:00.000Z',
  // #3860.4 (décision Louis 09/10) — la synthèse, DERNIÈRE étape du job, lue par
  // la MÊME fonction que le serveur. Ce job semé n'a analysé aucun compte : la
  // salle n'a donc aucun nom à relire, et la synthèse montre ce qu'il a VRAIMENT
  // produit — les huit brouillons à relire et l'erreur d'enrichissement.
  synthesis: lauraJobSynthesisOf('done', DEMO_LAURA_JOB_BRIEF, { accounts: new Map(), contacts: new Map() }),
}

/**
 * Craft rule n°9 — les états « Obsolète » et « Brouillon » d'un job (#2276.22 / .29 / .31), en salle. Deux fiches qui
 * n'ont JAMAIS tourné : étapes à faire, aucune preuve, aucun débit, aucune synthèse — rien de ce qu'elles montrent
 * n'est un résultat. Chacune passe par les MÊMES dérivations du contrat que le job exécuté ci-dessus.
 */
function demoUnstartedBrief(brief: LauraJobBrief): LauraJobBrief {
  return {
    ...brief,
    steps: brief.steps.map(step => ({
      ...step,
      status: 'todo',
      startedAt: null,
      finishedAt: null,
      creditsSpent: null,
      approvedBy: null,
      approvedAt: null,
    })),
    estimatedDurationSeconds: null,
    estimatedDurationBasis: null,
    intermediateResults: [],
    errors: [],
    createdObjects: [],
  }
}

function demoUnstartedJob(id: string, state: 'superseded' | 'draft', brief: LauraJobBrief, createdAt: string) {
  return {
    id,
    state,
    brief,
    tools: lauraJobToolsOf(brief),
    validationsRequired: lauraJobValidationsRequired(brief).map(step => ({ key: step.key, label: step.label })),
    progress: lauraJobProgressOf(brief),
    resume: lauraJobResumeOf(state, brief),
    ownerId: DEMO_JOB_OWNER,
    conversationId: null,
    turnId: null,
    estimatedCredits: lauraJobEstimatedCredits(brief),
    spentCredits: 0,
    startedAt: null,
    finishedAt: null,
    createdAt,
    synthesis: lauraJobSynthesisOf(state, brief, { accounts: new Map(), contacts: new Map() }),
  } satisfies LauraJobView
}

/** « Obsolète » — la PREMIÈRE fiche de la même demande SNCF, remplacée dans le même fil par le job exécuté. */
const DEMO_LAURA_JOB_SUPERSEDED: LauraJobView = demoUnstartedJob(
  '00000000-0000-4000-8000-000000002277',
  'superseded',
  demoUnstartedBrief(DEMO_LAURA_JOB_BRIEF),
  '2026-09-24T08:58:00.000Z',
)

/** « Brouillon » — des paramètres incomplets : une supposition, aucune cible résolue (`lauraJobInitialStatus`). */
const DEMO_LAURA_JOB_DRAFT_BRIEF: LauraJobBrief = demoUnstartedBrief({
  ...DEMO_LAURA_JOB_BRIEF,
  originalRequest: 'Prépare un premier message pour les décideurs de mes comptes prioritaires',
  intent: 'Préparer une première prise de contact avec les décideurs des comptes prioritaires',
  expectedOutcome: 'Un premier message prêt à relire par décideur des comptes prioritaires',
  scope: { description: 'Tes comptes prioritaires — périmètre à préciser', accountIds: [], contactIds: [] },
  assumptions: ['« Comptes prioritaires » : aucun compte de ton portefeuille n’est encore marqué prioritaire.'],
  steps: DEMO_LAURA_JOB_BRIEF.steps.filter(step => step.key !== 'crm'),
  sources: ['Ton portefeuille'],
})

const DEMO_LAURA_JOB_DRAFT: LauraJobView = demoUnstartedJob(
  '00000000-0000-4000-8000-000000002278',
  'draft',
  DEMO_LAURA_JOB_DRAFT_BRIEF,
  '2026-09-24T09:10:00.000Z',
)

/*
 * ⚠️ `DEMO_CHAT_HISTORY` A ÉTÉ RETIRÉ LE 03/09/2026 — #1320.
 *
 * C'était le fil « déjà tenu » qui s'affichait avant tout clic : deux messages
 * sur SNCF, censés montrer à quoi ressemble le copilote après quelques
 * échanges. Louis a tranché l'inverse — « coque RÉELLE, conversation VIDE » :
 * un prospect entre sur un fil neuf, avec ses amorces, et voit Laura répondre
 * SOUS SES YEUX plutôt que de lire un échange qu'il n'a pas eu.
 *
 * Le texte n'est pas conservé « au cas où » : une donnée que plus rien ne lit
 * est exactement ce que ce dépôt appelle son défaut n°1.
 */

/**
 * Les questions proposées. La deuxième porte un graphe : c'est la question
 * « où en est mon portefeuille », celle qui appelle une comparaison chiffrée.
 */
/**
 * #3816.2 — les suites d'un compte de « missions pour ce profil » : chacune est la question d'une
 * amorce. #3816 (lot R8 07/10) — UNE fonction PAR COMPTE, jamais un texte unique : le script ne
 * portait que « SII » en dur, si bien que la carte à deux comptes (SII, Alten) ne proposait ses
 * trois suites que sous le premier — Alten n'en affichait aucune. Chaque compte de la carte porte
 * désormais SES propres suites, avec SON propre nom dans la question envoyée à Laura.
 */
function demoMissionsFollowUps(account: string) {
  return {
    analysis: `Lance l’analyse du compte ${account} pour y placer Camille Roussel.`,
    contacts: `Montre-moi à qui m’adresser chez ${account} pour placer Camille Roussel.`,
    message: `Prépare un message pour proposer Camille Roussel chez ${account} — je l’enverrai moi-même.`,
  } as const
}

const DEMO_MISSIONS_FOLLOW_UPS_SII = demoMissionsFollowUps('SII')
const DEMO_MISSIONS_FOLLOW_UPS_ALTEN = demoMissionsFollowUps('Alten')

/**
 * #4421.13 (Louis, QCM 24/10) — comme en production depuis #4421.10 : SII et Alten ne sont pas des comptes de
 * l'espace, leurs personnes à contacter sont cherchées DANS le même tour, à vérifier, et le mail est préparé pour
 * la première. Personnes SIMULÉES (jamais un dirigeant ni un salarié réel de ces entreprises), mail bâti comme le
 * gabarit de production (`_talent_prepared_message`) : seuls les faits retenus de la fiche, aucun envoi.
 */
function demoPreparedMail(firstName: string): string {
  return (
    'Objet : Consultant Kubernetes\n\n' +
    `Bonjour ${firstName},\n\n` +
    'Je vous propose un consultant Kubernetes, zone 69.\n\n' +
    'Seriez-vous disponible pour un échange de 15 minutes cette semaine ?\n\n' +
    'Bien à vous'
  )
}

// #4421.18 — comme en production, la source masque le nom de famille : « Inès G. », sans adresse, jusqu'au clic.
const DEMO_MISSIONS_PEOPLE_SII = 'Inès G. (Responsable recrutement); Julien M. (Directeur technique)'

/**
 * #4421.18 (craft rule n°9) — « Obtenir l'e-mail » en salle : la personne RÉVÉLÉE vient d'ici, jamais d'un appel
 * (aucun réseau, aucun crédit). Personnes fictives, adresses `@exemple.fr`. Une référence absente de ce jeu se lit
 * « adresse introuvable », comme en production.
 */
export const DEMO_REVEALED_PEOPLE: Readonly<Record<string, { fullName: string; email: string }>> = {
  'demo-sii-ines': { fullName: 'Inès Garnier', email: 'ines.garnier@exemple.fr' },
}
const DEMO_MISSIONS_PEOPLE_ALTEN = 'Sophie Lambert (Chargée de recrutement); Thomas Rey (Responsable d’agence Lyon)'
const DEMO_MISSIONS_MAIL_SII = demoPreparedMail('Inès')
const DEMO_MISSIONS_MAIL_ALTEN = demoPreparedMail('Sophie')

/**
 * #1321.2 — le composeur de la démonstration montre six amorces, le reste sous « voir plus ».
 * Un seul endroit (GA-26) : `DemoSuggestionRow` le lit ici, la garde #4753 aussi.
 */
export const DEMO_MAX_VISIBLE_SUGGESTIONS = 6

/**
 * #4753 — les amorces qui doivent rester VISIBLES sans déplier, dans les six premières du script.
 * Le plafond est une décision (#1321.2) : c'est l'ORDRE qu'on garde. Une amorce s'ajoute ici avec sa raison.
 */
export const DEMO_PINNED_STARTERS: readonly string[] = [
  // L'amorce phare : « par où je commence » — ce qu'un prospect clique en premier.
  'Par où je commence dans mon portefeuille ?',
]

/** #4753 — les amorces épinglées qui tombent au-delà du plafond (ou qui manquent) dans `questions`. */
export function pinnedStartersBeyondCap(
  questions: readonly string[],
  pinned: readonly string[] = DEMO_PINNED_STARTERS,
  cap: number = DEMO_MAX_VISIBLE_SUGGESTIONS,
): string[] {
  const visible = questions.slice(0, cap)
  return pinned.filter(question => !visible.includes(question))
}

export const DEMO_CHAT_PROMPTS: readonly DemoChatPrompt[] = [
  {
    id: 'p-signals',
    question: 'Quels signaux justifient de prioriser SNCF ?',
    answer:
      'Trois signaux datés portent ce dossier :\n\n' +
      '• un partenariat de trois ans sur l’IA, les données et la maintenance prédictive, annoncé en juin 2026 — des cas d’usage à industrialiser derrière ;\n' +
      '• une chaire sur l’IA et l’optimisation pour les mobilités, portée par la direction du numérique du groupe : le sponsor est identifié, reste à trouver son budget de production ;\n' +
      '• une réorganisation de la gouvernance numérique autour de six entités métiers, avec un objectif affiché d’autonomie et de résilience.\n\n' +
      "Chaque signal du dossier porte sa source et sa date. Ce qui n'a pas de source n'est pas écrit.",
  },
  {
    id: 'p-portfolio',
    question: 'Où en est mon portefeuille ?',
    // #3764 — recette prod 08/10 (U 22edd95fe1) : ce texte comptait encore
    // TROIS comptes (SNCF, Société Générale, Groupe BPCE — la salle d'avant
    // l'extension à six) alors que `DEMO_PORTFOLIO_NAMES` (et le pied de
    // réponse qui lit `active.portfolio.count`) en comptent SIX depuis
    // l'ajout d'Alstom/ENGIE/TotalEnergies — un même tour affichait donc deux
    // comptes différents sous la même question. Les deux comptent désormais
    // la MÊME salle : six comptes, trois notés (SNCF, Société Générale,
    // TotalEnergies — les trois seuls à porter une lecture structurée à
    // axes), trois pas encore arbitrés (Groupe BPCE, Alstom, ENGIE — un
    // dossier de brief, pas une note sur 25).
    answer:
      "Six comptes suivis, trois notés et trois pas encore arbitrés : Groupe BPCE, Alstom et ENGIE ont un dossier (structure, personnes, signaux), mais pas encore de note sur 25 — l'arbitrage de démonstration reprend leur brief, pas la décision de ton équipe. " +
      "SNCF sort devant les deux autres comptes notés : pas parce qu'elle est plus grosse, mais parce qu'elle est la plus ACCESSIBLE pour une structure de 50 à 150 consultants. " +
      // #1778 — la démo porte un LIEN, parce que la nouveauté est là.
      // Un écran nommé se clique désormais dans mes réponses ; sans un lien
      // ici, un prospect ne verrait jamais ce que le lot a changé, et le lien
      // de démonstration est ce qu'il voit du produit.
      "Le détail est dans [Comptes](/accounts) ; pour en ouvrir d'autres, c'est [Découvrir](/discover).",
    chart: {
      title: 'Note du compte sur 25',
      caption:
        'Espace de démonstration — six sociétés réelles dont trois notées, notes issues de l’analyse, sources citées dans chaque fiche.',
      bars: [
        { label: 'SNCF', value: 18, unit: '/ 25' },
        { label: 'Société Générale', value: 15, unit: '/ 25' },
        { label: 'TotalEnergies', value: 11, unit: '/ 25' },
      ],
    },
  },
  {
    id: 'p-message',
    question: 'Que dire à Groupe BPCE en premier message ?',
    // #5086 — le message est PRÉPARÉ, rien n'est envoyé : la limite que le vérificateur dit (#3241) est dans le panneau Sources.
    replyNotes: ['Précision : je n’ai rien envoyé ni écrit — ce message est préparé, l’envoi reste ton geste.'],
    // #2429.13 (compagnon démo) — l'approche se rend en CARTE `approach`, plus
    // en trois intitulés gras reconnus à la lettre. Mêmes phrases qu'avant :
    // aucun fait nouveau, seulement la forme.
    answer:
      'Voici l’approche que je te propose.\n\n' +
      replyCard({
        type: 'approach',
        title: 'Premier message à Groupe BPCE',
        objective: 'Obtenir trente minutes, pas vendre une mission.',
        angle:
          "Une banque régionale, pas l'organe central. Le groupe est coopératif : chaque banque régionale est cliente autonome, avec sa gouvernance, son budget et ses achats locaux.",
        use_case:
          "Un référencement central ne garantit pas l'accès aux banques régionales. Une première référence se prend plutôt sur un compte aux cycles de décision plus courts, comme les filiales de paiement.",
        next_action: {
          label: 'Relire le brouillon dans le dossier, identifier la personne, puis envoyer',
          href: '/accounts',
        },
      }),
  },
  {
    id: 'p-competition',
    // #1600 — « qui est déjà en place » APPELLE une présence actuelle, et la
    // réponse ci-dessous n'en affirme aucune : elle parle d'un partenaire
    // annoncé publiquement et d'une présence « probable, pas confirmée ».
    // La question posait donc une promesse que la réponse tenait déjà à
    // distance. « Ressortent autour de » appelle l'observation, puis la
    // vérification — c'est ce que la réponse fait.
    question: 'Quelles ESN ressortent autour de ce compte ?',
    answer:
      "Sur Groupe BPCE, le relevé importé recense quinze prestataires déjà en place : entrer frontalement sur un périmètre déjà tenu n'a pas de sens, et le dossier le dit — avec sa source.\n\n" +
      'Sur les autres comptes, les grandes ESN généralistes sont probablement présentes au niveau groupe, mais aucune source consultée ne désigne de titulaire sur les périmètres visés. Le dossier le dit comme ça : « probable », pas « confirmé ».\n\n' +
      "Ce que le dossier ne sait pas, il ne l'invente pas — s'il n'y a pas de source, la case reste vide.",
  },
  {
    id: 'p-contacts',
    question: 'Pourquoi si peu de contacts nommés ?',
    answer:
      'Parce que ce sont de vraies sociétés, et que les sources publiques ne nomment que les mandataires sociaux.\n\n' +
      "Sur ces trois dossiers, les personnes NOMMÉES viennent du registre du commerce, avec leur fonction exacte. Tout le reste est un SIÈGE de décision : un rôle, une entité, une place dans la chaîne — sans personne dessus tant que l'enrichissement n'a pas tourné.\n\n" +
      'Sur ton espace, un clic remplit ces sièges avec un nom, un e-mail et un téléphone. Ici, non : une salle de démonstration ne publie pas les coordonnées de personnes réelles.',
  },
  {
    // #1914 — LES CARTES DE RÉPONSE, EN DÉMONSTRATION (craft rule n°9).
    // Un classement de cinq comptes (top trois, puis « Voir les 2 autres ») et
    // une comparaison des deux premiers. Chaque ligne reprend un fait du
    // dossier seedé (`demo-dataset.ts` : justifications de priorité, signaux,
    // tranches d'effectif) ; ce que les sources ne disent pas — une ESN en place,
    // le budget — reste « non mesuré » ou « non évalué », comme en production.
    // #3766 Reste (lot K06 07/10) — chaque compte porte désormais un lien de
    // fiche RÉEL (`accountHref`, résolu par `demo-turn.ts` contre les comptes
    // réellement chargés par l'écran), ce qui fait apparaître « Créer une
    // liste de travail » en geste principal (≥ 2 comptes cités, `account_ranking`).
    // Posée APRÈS les amorces en texte : les tests de la coque lisent la
    // première amorce et le graphe, qu'une carte de plus ne doit pas déplacer.
    // ⚠️ Elle
    // n'est plus la DERNIÈRE depuis #2470 (`p-market-sweep` la suit), mais elle
    // reste la PREMIÈRE à porter une carte `account_ranking`, et c'est cela que
    // `demo-turn.test.ts` lit.
    id: 'p-priorities',
    question: 'Par où je commence dans mon portefeuille ?',
    answer:
      'Je commencerais par SNCF, et par une entité plutôt que par le groupe : c’est le compte le plus accessible pour une structure de 50 à 150 consultants. ' +
      'Voici l’ordre dans lequel j’ouvrirais tes six comptes, et ce qui le justifie.\n\n' +
      replyCard({
        type: 'account_ranking',
        title: 'Par où commencer',
        axes: ['Accès pour une ESN de 50 à 150 consultants', 'Signal daté', 'Ce qui bloque l’entrée'],
        items: [
          {
            name: 'SNCF',
            // #3764 (lot L1 07/10) — le même niveau par compte que la porte de forme pose en prod.
            level: 'priority',
            // #3766 Reste (lot K06 07/10) — un lien de fiche RÉEL : l'UUID assigné par le semis
            // varie par salle, donc le script nomme le compte par un jeton (`accountHref`,
            // `demo-turn.ts`) résolu contre les comptes déjà chargés par l'écran (`useAccounts`,
            // Chat.tsx), jamais deviné ni codé en dur ici.
            href: accountHref('SNCF'),
            verdict: 'À ouvrir par une entité, jamais par le groupe.',
            why: ['Six entités métiers qui gardent leurs équipes : six cycles de décision, donc six portes.'],
            why_now: 'Aucun signal récent ne crée d’urgence aujourd’hui : le potentiel est structurel.',
            limits: ['Le référencement du groupe ne se contourne que par une entité.'],
            action: { label: 'Choisir une entité et qualifier son besoin publié' },
          },
          {
            name: 'Société Générale',
            level: 'priority',
            href: accountHref('Société Générale'),
            why: [
              'Fit d’offre et calendrier bons : plan stratégique à horizon 2029, industrialisation de l’IA documentaire.',
            ],
            why_now: 'Nouveau plan stratégique à horizon 2029 annoncé pour la fin 2026.',
            limits: ['Direction informatique du groupe verrouillée, grandes ESN déjà installées.'],
            action: { label: 'Contacter la direction technique d’une filiale à autonomie propre' },
          },
          {
            name: 'Groupe BPCE',
            level: 'to_qualify',
            href: accountHref('Groupe BPCE'),
            verdict: 'À arbitrer : le relevé décrit la structure, pas la décision.',
            why: [
              'Deux réseaux coopératifs — quatorze Banques Populaires et quinze Caisses d’Epargne — dont chaque banque est cliente autonome.',
            ],
            limits: [
              'Un référencement central ne garantit pas l’accès aux banques régionales.',
              'Budget non confirmé.',
            ],
            action: { label: 'Choisir une banque régionale ou une filiale de paiement' },
          },
          // Les trois comptes semés depuis un brief commercial (01/10/2026) :
          // chaque ligne reprend un fait ou un garde-fou de SON brief, rien d'autre.
          {
            name: 'Alstom',
            level: 'priority',
            href: accountHref('Alstom'),
            why: [
              'Une fenêtre ouverte en 2026 : Belfort annonce 200 recrutements d’ici décembre, et 16 postes sont ouverts sur cinq sites, sur des métiers que tu couvres.',
            ],
            why_now:
              'Postes ouverts relevés fin septembre 2026 — volatils, un poste peut être pourvu entre deux lectures.',
            limits: [
              'Aucune autorité budgétaire confirmée : le responsable de métier exprime le besoin, qui contractualise n’est pas établi.',
              'Logiciel embarqué exclu des pistes.',
            ],
            action: { label: 'Ouvrir par Belfort, avec la liste des postes ouverts en main' },
          },
          {
            name: 'ENGIE',
            level: 'to_qualify',
            href: accountHref('ENGIE'),
            why: [
              '79 % des profils en poste identifiés sont des externes (73 sur 92) : le compte achète déjà de la prestation, l’entrée est une extension de périmètre.',
            ],
            limits: [
              'Le contrat-cadre ITSV3 est observé, pas documenté : conditions, titulaires et calendrier inconnus.',
              'Organigramme daté : rattachements à revalider avant d’appeler.',
            ],
            action: { label: 'Qualifier le statut ITSV3 : titulaire ou pas' },
          },
          {
            name: 'TotalEnergies',
            level: 'to_watch',
            href: accountHref('TotalEnergies'),
            verdict: 'À surveiller, pas à engager : le brief est hors informatique.',
            why: [
              'Une fenêtre réelle : le grand arrêt de Feyzin en 2027, 100 M€ et près de 2 000 personnes mobilisées.',
            ],
            why_now: 'La cellule de préparation du grand arrêt se constitue dès maintenant.',
            limits: ['Aucun budget de prestation documenté.', 'La cellule d’arrêt de Feyzin n’est pas nommée.'],
            action: { label: 'Identifier le responsable d’arrêt de Feyzin' },
          },
        ],
        not_evaluated: ['Budget des projets'],
      }) +
      '\n\nLes deux premiers, côte à côte :\n\n' +
      replyCard({
        type: 'comparison',
        title: 'SNCF et Société Générale',
        columns: ['SNCF', 'Société Générale'],
        rows: [
          { label: 'Porte d’entrée', cells: ['Une des six entités métiers', 'Une filiale à autonomie propre'] },
          {
            label: 'Signal daté',
            cells: ['Aucun signal récent qui crée une urgence', 'Nouveau plan stratégique à horizon 2029'],
          },
          {
            label: 'Frein principal',
            cells: ['Référencement du groupe', 'Direction informatique du groupe verrouillée'],
          },
        ],
        // #3707.5 — l'absence se dit UNE fois, ici : une ligne « non mesuré » dans chaque colonne
        // serait un bloc vide bien présenté.
        note: 'Non évalué, faute de source : les ESN en place sur le périmètre. Ce n’est pas un « non ».',
      }) +
      '\n\nLe détail de chaque compte est dans [Comptes](/accounts).' +
      // #2679 — la précision est posée DANS le texte (elle ne coûte pas un tour
      // de plus), et ses réponses possibles partent en boutons juste dessous.
      // La phrase reste : on ne remplace pas une question lisible par une liste.
      '\n\nJe poursuis sur ces comptes : les signaux, le point d’entrée et le premier message sont prêts à ouvrir.',
    replyOptions: [
      {
        question:
          'Je poursuis sur ces comptes : les signaux, le point d’entrée et le premier message sont prêts à ouvrir.',
        // ⚠️ Mot pour mot les questions de `p-signals`, `p-entity-or-group` et
        // `p-message` : en démonstration, le clic doit tomber sur une réponse
        // préparée.
        options: [
          'Quels signaux justifient de prioriser SNCF ?',
          'Faut-il attaquer SNCF par le groupe ou par une entité ?',
          'Que dire à Groupe BPCE en premier message ?',
        ],
      },
    ],
  },
  {
    // Posée APRÈS `p-priorities` : le composeur n'affiche que six amorces (#1321.2) et « Par où je commence »
    // doit rester visible — la carte Contacts (#4610.5) est la septième, derrière « voir plus ».
    // #4610.5 (craft rule n°9) — la carte Contacts de Laura, avec des noms CLIQUABLES vers les fiches de la salle.
    // Les deux personnes sont celles que le semis nomme chez SNCF (mandataires sociaux du registre du commerce) :
    // aucune coordonnée, et la carte le DIT. Les liens (`href` du contact, `company_href` du compte) sont des
    // jetons résolus par `demo-turn.ts` contre les contacts et comptes chargés par l'écran.
    id: 'p-contacts-card',
    question: 'Qui sont les contacts nommés chez SNCF ?',
    answer:
      'Deux personnes sont nommées chez SNCF, toutes deux issues du registre du commerce, avec leur fonction exacte. Ouvre une fiche depuis son nom.\n\n' +
      replyCard({
        type: 'contact_list',
        title: 'Contacts nommés chez SNCF',
        items: [
          {
            name: 'Jean Castex',
            role: 'Président du conseil d’administration et directeur général',
            company: 'SNCF',
            href: contactHref('Jean Castex'),
            company_href: accountHref('SNCF'),
            reason: 'Identifie la gouvernance du compte. Ce n’est pas une porte d’entrée.',
          },
          {
            name: 'Laurent Trévisani',
            role: 'Directeur général délégué',
            company: 'SNCF',
            href: contactHref('Laurent Trévisani'),
            company_href: accountHref('SNCF'),
            reason: 'Utile en fin de cycle, jamais en première approche.',
          },
        ],
        missing: [
          'Aucun e-mail ni téléphone : une salle de démonstration ne publie pas de coordonnées de personnes réelles.',
        ],
      }),
  },
  {
    // #1924.1 — LA STRUCTURE D'UN CONSEIL, EN DÉMONSTRATION (craft rule n°9).
    //
    // Décision de Louis du 16/09/2026 : un conseil se rend en « Verdict /
    // Pourquoi / Ce qui manque / Prochaine action ». La démonstration doit la
    // montrer, sinon un prospect voit la structure d'avant pendant qu'on décrit
    // celle d'après. Les quatre intitulés sont écrits EN GRAS parce que c'est ce
    // que `StructuredReply::RECOGNIZED_TITLES` reconnaît — un « Verdict » en
    // texte courant ne produirait aucune carte.
    //
    // ⚠️ La question est un ARBITRAGE (« par le groupe ou par une entité »), pas
    // une demande de verdict tranché : celle-là se rendrait en carte `verdict`,
    // et la carte l'emporte sur les sections (« UN SEUL FORMAT PAR RÉPONSE »).
    //
    // Chaque phrase reprend un fait déjà écrit dans le dossier seedé, repris à
    // l'identique de la carte de classement ci-dessus : six entités métiers, le
    // référencement du groupe, et aucun titulaire désigné par les sources.
    id: 'p-entity-or-group',
    question: 'Faut-il attaquer SNCF par le groupe ou par une entité ?',
    // V4-CORRECTIFS-B 4289.5 (#3247.4) — le conseil garde ses quatre sections (une réponse = UN format) et
    // y porte ce que la production mesure par candidat : « preuve dans ce secteur », la voie d'accès de
    // chaque entité et les partenaires écartés, NOMMÉS. Les entités sont celles du dossier SNCF semé (offres
    // publiées de Voyageurs et Réseau) ; aucun partenaire n'y est déclaré, donc aucune voie partenaire inventée.
    answer:
      'Voici comment je trancherais, et ce qu’il me manque pour en être sûre.\n\n' +
      '**Verdict :** par une entité, jamais par le groupe.\n\n' +
      '**Pourquoi :** six entités métiers gardent leurs équipes, donc six cycles de décision et six portes. Le référencement du groupe ne se contourne que par l’une d’elles — c’est écrit dans le dossier, avec sa source. Les deux portes que je mesure d’abord :\n' +
      '- SNCF Voyageurs — voie directe, aucun partenaire déclaré sur ce compte ; preuve dans ce secteur : ton espace en possède une ; signal actuel : Ingénieur DevOps (offre publiée), Paris.\n' +
      '- SNCF Réseau — voie directe, aucun partenaire déclaré sur ce compte ; preuve dans ce secteur : ton espace en possède une ; signal actuel : Data engineer (offre publiée), Lyon.\n\n' +
      '**Ce qui manque :** aucune source consultée ne désigne de titulaire sur les périmètres visés, et aucun budget n’est confirmé. Ce n’est pas « il n’y en a pas » : c’est que je n’ai pas pu le voir. Écartés — partenaires déclarés de l’espace, pas des cibles : Sopra Steria, CGI.\n\n' +
      '**Prochaine action :** choisir une entité et qualifier son besoin publié. Le détail est dans [Comptes](/accounts).',
  },
  {
    // V4-CORRECTIFS-B 4289.4 (#3247.3) — « Par quelle entité attaquer <compte> ? » pour Société Générale,
    // la question que le jeu démo ne savait pas encore recevoir (repli « réponses préparées »).
    // Entités, priorités et ESN observées sont celles du dossier semé (`demo-dataset.ts` :
    // périmètres Treezor P1 18/20 et Boursorama P2 13/20, ESN du brief `societe-generale.json`) ;
    // « voie partenaire » ne nomme que des partenaires déclarés de l'espace de démonstration
    // (Devoteam, mc2i) ET observés chez le compte par ce brief — jamais un chemin deviné.
    id: 'p-entity-sg',
    question: 'Par quelle entité attaquer Société Générale ?',
    answer:
      'Je commencerais par une filiale à autonomie propre plutôt que par le groupe : la direction informatique du groupe est verrouillée et de grandes ESN y sont déjà installées. Voici les portes que je mesure, avec ce que j’ai vérifié pour chacune.\n\n' +
      replyCard({
        type: 'account_ranking',
        title: 'Par quelle entité attaquer Société Générale',
        axes: ['Fait qui rend l’entité plus accessible'],
        items: [
          {
            name: 'Treezor',
            why: [
              'Même secteur ciblé : services financiers et paiement',
              'filiale du même groupe (entité à SIREN propre), avec sa direction propre — plus autonome',
              'Chemin d’accès : voie directe — aucun partenaire déclaré sur cette entité',
            ],
            limits: [
              'relation CRM : aucune trouvée',
              'présence marché : aucun externe observé',
              'preuve dans ce secteur : ton espace en possède une',
            ],
            why_now: 'Signal actuel : renfort développement API paiement et sécurisation de l’infrastructure BaaS',
          },
          {
            name: 'Boursorama / BoursoBank',
            why: [
              'Même secteur ciblé : banque en ligne',
              'filiale du même groupe (entité à SIREN propre), avec sa direction propre — plus autonome',
              'Chemin d’accès : voie directe — aucun partenaire déclaré sur cette entité',
            ],
            limits: [
              'relation CRM : aucune trouvée',
              'présence marché : aucun externe observé',
              'preuve dans ce secteur : ton espace en possède une',
            ],
            not_evaluated: [
              'signal spécifique — aucun signal actuel identifié',
              'chemin d’accès (partenaire) — aucun partenaire déclaré sur cette entité',
            ],
          },
          {
            name: 'Société Générale (niveau groupe)',
            why: [
              'Même secteur ciblé : banque de détail et services financiers',
              'Chemin d’accès : voie partenaire Devoteam (partenaire, détecté au niveau du groupe) ; voie partenaire mc2i (partenaire, détecté au niveau du groupe)',
            ],
            limits: [
              'relation CRM : aucune trouvée',
              'présence marché : externes observés sur ce compte',
              'preuve dans ce secteur : ton espace en possède une',
            ],
            not_evaluated: ['accès : direction informatique du groupe verrouillée, grandes ESN déjà installées'],
          },
        ],
        not_evaluated: ["Écartés — partenaires déclarés de l'espace, pas des cibles : Devoteam, mc2i, Sopra Steria."],
      }) +
      '\n\nProchaine action : contacter la direction technique de Treezor, puis ouvrir le détail dans [Comptes](/accounts).',
  },
  {
    // #2271.19 — LA TIMELINE D'UN COMPTE, EN DÉMONSTRATION (craft rule n°9).
    //
    // `chat_messages` reste vide à dessein (`demo-coverage.ts`) : aucun fil
    // n'est semé, donc cette carte n'existe QUE si le visiteur pose la
    // question — exactement le mécanisme déjà en place pour `account_ranking`
    // et `comparison` plus haut, par le vrai moteur de démo (`demo-turn.ts`).
    //
    // ⚠️ `account.href` reste ABSENT : contrairement à `account_ranking`, dont
    // le lien de fiche est optionnel, celui d'`account_card` (#2271.16) est
    // OBLIGATOIRE et pointe un identifiant assigné par la base au moment du
    // semis (`demo-seed.service.ts`) — jamais connu quand ce script est écrit.
    // L'inventer violerait « href jamais inventé » (doctrine, même raison que
    // `account_ranking` n'en porte déjà aucun, voir plus haut : « Aucun lien
    // de fiche : les identifiants des comptes sont tirés au semis. »). C'est
    // pourquoi #2271.16 reste classé « vide à dessein » dans `demo-coverage.ts`
    // pendant que celle-ci, elle, tourne : son propre `account` n'a pas besoin
    // de lien pour être valide (le champ est optionnel au contrat).
    //
    // Les trois événements reprennent des faits DÉJÀ écrits dans ce fichier
    // pour Groupe BPCE (`p-priorities` : relevé importé, filiales de paiement,
    // brouillon de premier message) — aucun fait nouveau. L'horodatage
    // est FIXE, même raison que `DEMO_FETCHED_AT` : calculé, il ferait glisser
    // la démonstration sans que personne la relise.
    //
    // ⚠️ Posée AVANT `p-market-sweep` : la garde `demo-laura-gestures-coverage.
    // spec.ts` lit tout ce qui suit le marqueur `p-market-sweep` dans ce
    // fichier et y exige des noms « (démo) » — cette entrée doit donc rester
    // en AMONT, jamais en aval, de `p-market-sweep`.
    id: 'p-timeline',
    question: 'Qu’est-ce qui s’est passé chez Groupe BPCE ?',
    answer:
      'Voici l’historique de ce dossier, du plus récent au plus ancien.\n\n' +
      replyCard({
        type: 'timeline',
        title: 'Historique — Groupe BPCE',
        account: { name: 'Groupe BPCE' },
        events: [
          {
            kind: 'action',
            label: 'Brouillon de premier message préparé',
            detail: 'Objectif : trente minutes, pas une vente. Angle : une banque régionale, pas l’organe central.',
            at: '2026-10-01T09:10:00.000Z',
          },
          {
            kind: 'opportunity',
            label: 'Porte d’entrée retenue : les filiales de paiement',
            detail: 'Cycles de décision plus courts et structures plus accessibles que les banques régionales.',
            at: '2026-10-01T09:05:00.000Z',
          },
          {
            kind: 'workflow',
            label: 'Relevé importé',
            detail: 'Jeu de démonstration — relevé du 30/09/2026, sources citées dans la fiche.',
            at: '2026-10-01T09:00:00.000Z',
          },
        ],
      }) +
      '\n\nLe détail complet du dossier est dans [Comptes](/accounts).',
  },
  {
    // #2271.20 — UN FICHIER EXPORTABLE, EN DÉMONSTRATION (craft rule n°9).
    //
    // Zéro destination réseau (doctrine du bloc, `reply-blocks.ts`) : les
    // lignes reprennent EXACTEMENT les notes déjà écrites dans `p-portfolio`
    // plus haut (même graphe) — rien n'est recalculé, rien ne part. Le bouton
    // de téléchargement (`FileExportCard.tsx`) reste un geste LOCAL du
    // navigateur, identique en démonstration et en production.
    //
    // ⚠️ Posée AVANT `p-market-sweep`, même raison que `p-timeline` ci-dessus.
    id: 'p-export',
    question: 'Exporte la note de mes comptes dans un fichier',
    answer:
      'Voici le fichier, prêt à télécharger — mêmes notes que dans mon message sur ton portefeuille.\n\n' +
      replyCard({
        type: 'file_export',
        title: 'Note des comptes suivis',
        filename: 'portefeuille-demo.csv',
        columns: ['Compte', 'Note sur 25'],
        rows: [{ cells: ['SNCF', '18'] }, { cells: ['Société Générale', '15'] }],
        note: 'Le détail de chaque note, avec ses sources, est dans la fiche du compte.',
      }) +
      '\n\nLe téléchargement ne part nulle part : c’est un geste local, comme sur ton espace.',
  },
  {
    // #4065 (lot LISTINGS, 12/10) — LE LISTING CROISÉ, EN DÉMONSTRATION (craft rule n°9, Laura
    // scriptée en salle — décision Louis 12/10). Même carte `file_export` que `list_records` en
    // production : source et période nommées, total lu dit, une société NON VÉRIFIÉE nommée (jamais
    // classée absente). Personnes FICTIVES « (démo) ». Garde : `demo-laura-listings-coverage.spec.ts`.
    //
    // ⚠️ Posée AVANT `p-market-sweep`, même raison que `p-timeline`/`p-export` ci-dessus.
    id: 'p-listing-agenda',
    question: 'Liste les personnes que j’ai rencontrées ces 3 derniers mois et absentes du CRM',
    answer:
      'J’ai lu ton agenda du 12 juillet au 12 octobre : 41 rendez-vous. Voici les personnes externes rencontrées que ton CRM ne connaît pas.\n\n' +
      replyCard({
        type: 'file_export',
        title: 'Agenda — du 2026-07-12 au 2026-10-12',
        filename: 'liste-agenda-2026-07-12-au-2026-10-12.csv',
        columns: ['Personne', 'E-mail', 'Société / domaine', 'Occurrences', 'Dernière date', 'Dernier objet'],
        rows: [
          {
            cells: [
              'Julie Mercier (démo)',
              'julie.mercier@atelier-occitan.example',
              'atelier-occitan.example',
              '3',
              '2026-10-02',
              'Point besoin data',
            ],
          },
          {
            cells: [
              'Karim Benali (démo)',
              'k.benali@garrigue-logistique.example',
              'garrigue-logistique.example',
              '1',
              '2026-09-18',
              'Découverte',
            ],
          },
        ],
        note: '41 éléments lus · 2 lignes',
      }) +
      '\n\nUne société n’a pas pu être vérifiée dans le CRM (cevennes-energie.example) : je ne la classe pas absente. Le contenu des messages n’est jamais lu — seulement qui, quand, objet.',
  },
  {
    // #4065.8 / #4065.9 (V10-B, 17/10) — LES LISTINGS CRM ET ATS EN DÉMONSTRATION (craft rule n°9) : les affaires
    // perdues du CRM branché avec leur interlocuteur, puis les candidats vus en entretien et les missions
    // terminées de l'ATS. Personnes et sociétés FICTIVES « (démo) » ; jamais le nom d'un éditeur.
    // Garde : `demo-laura-listings-coverage.spec.ts`.
    id: 'p-listing-crm-ats',
    question:
      'Liste les affaires perdues en 2026 et leur interlocuteur, puis les candidats vus en entretien ce trimestre',
    answer:
      'J’ai lu les affaires de ton CRM : 14 affaires clôturées, 2 perdues en 2026. Voici la liste avec leur interlocuteur.\n\n' +
      replyCard({
        type: 'file_export',
        title: 'CRM — du 2026-01-01 au 2026-10-17',
        filename: 'liste-crm-2026-01-01-au-2026-10-17.csv',
        columns: ['Société', 'Affaire', 'Statut', 'Montant', 'Interlocuteur', 'Clôturée le'],
        rows: [
          {
            cells: [
              'Atelier Occitan (démo)',
              'Migration cloud',
              'Perdue',
              '90000 €',
              'Julie Mercier (démo)',
              '2026-04-01',
            ],
          },
          {
            cells: [
              'Garrigue Logistique (démo)',
              'TMA applicative',
              'Perdue',
              '45000 €',
              'Karim Benali (démo)',
              '2026-06-12',
            ],
          },
        ],
        note: '14 éléments lus · 2 lignes',
      }) +
      '\n\nCôté ATS, 3 candidats ont passé un entretien du 1er juillet au 17 octobre ; l’ATS ne rend une date d’entretien que pour ceux-là.\n\n' +
      replyCard({
        type: 'file_export',
        title: 'ATS — du 2026-07-01 au 2026-10-17',
        filename: 'liste-ats-2026-07-01-au-2026-10-17.csv',
        columns: ['Personne', 'Titre', 'Date'],
        rows: [
          { cells: ['Inès Roche (démo)', 'Développeuse Java', '2026-09-08'] },
          { cells: ['Malik Duval (démo)', 'Data engineer', '2026-07-21'] },
        ],
        note: '3 éléments lus · 2 lignes',
      }),
  },
  {
    // LAURA-OFFRES-4563 (25/10) — « trouve-moi des offres <compétence> sur <ville> » EN DÉMONSTRATION (craft rule
    // n°9, Laura scriptée en salle — décision Louis 12/10). Même carte `file_export` que `search_job_offers` en
    // production : une ligne par OFFRE (intitulé, employeur, date, lieu, lien), le palier de recherche atteint DIT,
    // ce qui n'est pas su NOMMÉ (« non précisé », jamais 0), aucune source nommée. Employeurs FICTIFS « (démo) »,
    // liens `example.org`. Garde : `demo-laura-offres-coverage.spec.ts` (API).
    id: 'p-offres-competence',
    question: 'Trouve-moi des offres Vue et Java sur Lille',
    answer:
      'J’ai trouvé 5 offres du métier sur Lille — le plancher de 5 est atteint au palier « termes voisins » (2 à la première lecture, 3 de plus avec les écritures voisines de Vue.js). Les deux compétences d’abord, les plus récentes en tête.\n\n' +
      replyCard({
        type: 'file_export',
        title: 'Offres Vue.js et Java — Lille',
        filename: 'offres-vue-java-lille.csv',
        columns: ['Intitulé', 'Employeur', 'Date', 'Lieu', 'Lien', 'Statut', 'TJM', 'Télétravail'],
        rows: [
          {
            cells: [
              'Développeur full stack Java / Vue.js',
              'Atelier Occitan (démo)',
              '2026-10-22',
              'Lille',
              'https://offres.example.org/lille/fullstack-java-vue',
              'Freelance',
              'non précisé',
              'non précisé',
            ],
          },
          {
            cells: [
              'Ingénieur développement Java — front Vue.js',
              'Garrigue Logistique (démo)',
              '2026-10-20',
              'Lille',
              'https://offres.example.org/lille/ingenieur-java-vue',
              'CDI',
              'non précisé',
              'non précisé',
            ],
          },
          {
            cells: [
              'Développeur Vue.js 3 / TypeScript',
              'Cévennes Énergie (démo)',
              '2026-10-17',
              'Lille',
              'https://offres.example.org/lille/vue3-typescript',
              'CDI',
              'non précisé',
              'non précisé',
            ],
          },
          {
            cells: [
              'Développeur Java Spring Boot',
              'Aubrac Aerostructures (démo)',
              '2026-10-14',
              'Lille',
              'https://offres.example.org/lille/java-spring',
              'non précisé',
              'non précisé',
              'non précisé',
            ],
          },
          {
            cells: [
              'Développeur front Vuejs',
              'Marenval Financement (démo)',
              '2026-10-09',
              'Lille',
              'https://offres.example.org/lille/front-vuejs',
              'CDI',
              'non précisé',
              'non précisé',
            ],
          },
        ],
        note: '5 offres · statut, TJM et télétravail « non précisé » quand l’annonce ne les donne pas',
      }) +
      '\n\nJe n’ai rien ajouté hors de ton métier pour faire le compte : ces 5 offres sont toutes celles que la recherche a lues.',
  },
  {
    // #4748 — UNE LISTE LONGUE (plus de 20 lignes), EN DÉMONSTRATION (craft rule n°9). Recette 29/10 : « le tableau ne
    // montre que 3 éléments pourtant il en annonce 100, et Télécharger n'en prend que 3 ». Le fichier de Laura porte ici
    // 24 lignes : le tableau les rend TOUTES, le bouton dit « Télécharger les 24 lignes », le CSV en contient 24 — le
    // défaut ne peut plus revenir sans se voir. Sociétés FICTIVES « (démo) », aucune source nommée.
    // Garde : `demo-laura-liste-longue-coverage.spec.ts` (API).
    id: 'p-liste-longue',
    question: 'Donne-moi en fichier la liste complète des PME industrielles à suivre',
    answer:
      'Voici la liste complète : 24 entreprises, toutes dans le fichier — le tableau les montre toutes et le téléchargement en contient autant.\n\n' +
      replyCard({
        type: 'file_export',
        title: 'PME industrielles à suivre',
        filename: 'pme-industrielles-a-suivre.csv',
        columns: ['Entreprise', 'Ville', 'Effectif'],
        rows: Array.from({ length: 24 }, (_, index) => ({
          cells: [
            `Atelier Démo ${String(index + 1).padStart(2, '0')} (démo)`,
            ['Lyon', 'Grenoble', 'Annecy', 'Saint-Étienne'][index % 4] ?? null,
            index % 6 === 5 ? null : `${120 + index * 15}`,
          ],
        })),
        note: '24 entreprises · l’effectif reste vide quand il n’est pas connu',
      }) +
      '\n\nJe n’ai rien ajouté pour arrondir : ces 24 entreprises sont toutes celles que la liste porte.',
  },
  {
    // #3762 (BEL-LAU-1005) — LA CARTOGRAPHIE DE COMPTES, EN DÉMONSTRATION (craft rule n°9).
    //
    // Le gabarit canonique, rendu par la VRAIE `AccountMapCard` : en-tête, cadrage, synthèse, grille de
    // cartes (raison, prudence, prochaine action), blocs secondaires, actions. Les trois comptes sont
    // FICTIFS et le disent (« (démo) ») ; aucun lien de fiche — les identifiants des comptes sont tirés au
    // semis, même mur que `account_ranking` ; aucune probabilité, aucun pourcentage de complétude.
    //
    // ⚠️ Posée AVANT `p-market-sweep`, même raison que `p-timeline`/`p-export` ci-dessus.
    id: 'p-account-map',
    question: 'Ouvre mon périmètre à Montpellier et périphérie',
    answer:
      'Voici la cartographie de ton périmètre — partielle, et je te dis pourquoi.\n\n' +
      replyCard({
        type: 'account_map',
        title: 'Cartographie — Montpellier et périphérie',
        completeness: { level: 'partial', label: 'Partielle' },
        context: [
          { kind: 'territory', label: 'Montpellier + périphérie' },
          { kind: 'sector', label: 'Industrie, services numériques' },
          { kind: 'size', label: '200 à 2 000 salariés' },
        ],
        framing: {
          origin: 'Les comptes déjà enregistrés dans ton espace sur le département 34.',
          proves: 'Ces entreprises existent, sont rattachées au territoire et correspondent à ton ciblage.',
          not_proven: 'Elle ne prouve ni un budget, ni un besoin ouvert, ni que la liste est exhaustive.',
        },
        summary: {
          retained_count: 3,
          qualification: 'Un compte prioritaire, un à surveiller, un à qualifier',
          main_reserve: 'Aucun contact décisionnaire n’est encore vérifié sur deux des trois comptes.',
        },
        accounts: [
          {
            name: 'Atelier Occitan (démo)',
            status: { level: 'priority', label: 'Prioritaire' },
            proof: 'Offre d’emploi data publiée ce mois-ci : un besoin visible.',
            tags: ['Industrie', 'Data'],
            caution: 'Le budget n’est pas confirmé.',
            next_action: { label: 'Identifier le responsable des systèmes d’information' },
          },
          {
            name: 'Garrigue Logistique (démo)',
            status: { level: 'watch', label: 'À surveiller' },
            proof: 'Présent dans le registre local, activité stable.',
            tags: ['Logistique'],
            caution: 'Aucun signal daté pour l’instant.',
            next_action: { label: 'Reprendre le compte au prochain signal' },
          },
          {
            name: 'Pic Saint-Loup Conseil (démo)',
            status: { level: 'to_qualify', label: 'À qualifier' },
            proof: 'Ciblage conforme, mais aucune information sur sa taille réelle.',
            caution: 'La taille est déclarée, pas vérifiée.',
            next_action: { label: 'Vérifier la taille avant de prioriser' },
          },
        ],
        memory: ['Deux de ces comptes sont déjà apparus dans une recherche précédente de ton espace.'],
        to_document: ['Les contacts décisionnaires de deux comptes.', 'La taille réelle de Pic Saint-Loup Conseil.'],
        method_limit: 'La sélection se limite aux comptes déjà enregistrés : elle ne dit rien du reste du marché.',
        actions: {
          validate: { label: 'Valider l’ouverture de ce périmètre' },
          discover: { label: 'Ouvrir dans Découvrir', href: '/search' },
          enrich: { label: 'Enrichir la recherche' },
          save: { label: 'Sauvegarder la sélection' },
        },
      }) +
      '\n\nJe prépare, tu valides : rien ne part sans ton geste.',
  },
  {
    // #3762 — les trois gestes finaux de la cartographie ENVOIENT leur libellé (`ReplyFollowUpProvider`) :
    // en salle le moteur est le script, donc chacun a sa réponse — jamais « hors script » sous un bouton.
    id: 'p-account-map-validate',
    question: 'Valider l’ouverture de ce périmètre',
    answer:
      'C’est noté : le périmètre Montpellier et périphérie est prêt à être ouvert. En démonstration rien n’est créé ni envoyé ; sur ton espace, je prépare les comptes et les premiers messages, et tu les envoies toi-même.',
  },
  {
    id: 'p-account-map-enrich',
    question: 'Enrichir la recherche',
    answer:
      'Pour enrichir cette cartographie, je peux élargir le rayon autour de Montpellier, ajouter un secteur ou chercher les contacts décisionnaires des deux comptes qui n’en ont pas. Dis-moi lequel — je ne lance rien sans toi.',
  },
  {
    id: 'p-account-map-save',
    question: 'Sauvegarder la sélection',
    answer:
      'La sélection est prête à être sauvegardée dans ton espace. En démonstration elle n’est pas enregistrée ; sur ton espace, tu la retrouves ensuite dans tes comptes et ta recherche garde son périmètre.',
  },
  {
    // #2337 — LE TERRAIN DE JEU MULTI-TALENTS, EN DÉMONSTRATION (craft rule n°9).
    //
    // Les deux cartes sont la SORTIE du compilateur réel
    // (`apps/ia/app/services/compilers/territory_planner.py`), exécuté sur les
    // faits du jeu seedé : trois profils de `DEMO_CONSULTANTS` (Camille Roussel,
    // Inès Kaczmarek, Marc Ouedraogo — l'ESN de démonstration est FICTIVE) et
    // trois besoins ouverts du client d'exemple SNCF
    // (`demo-dataset.ts`, `openNeeds`) dont les compétences recoupent les leurs.
    // Ce qui n'est pas seedé reste NOMMÉ « non évalué » (note /25, porteur,
    // tarif) — jamais une valeur de remplissage. Aucune probabilité, rien créé.
    //
    // ⚠️ Posée AVANT `p-market-sweep`, qui doit rester la DERNIÈRE entrée.
    id: 'p-territory-plan',
    question: 'J’ai trois consultants disponibles. Construis-moi le terrain de jeu.',
    answer:
      'Un seul terrain de jeu pour les trois, pas trois recherches séparées : leurs comptes communs sont fusionnés, et un compte n’apparaît qu’une fois.\n\n' +
      replyCard({
        type: 'comparison',
        title: 'Les talents du terrain de jeu',
        columns: ['Camille R.', 'Inès K.', 'Marc O.'],
        rows: [
          {
            label: 'Disponibilité',
            cells: ['disponible immédiatement', 'libre sous un mois', 'disponible immédiatement'],
          },
          { label: 'Territoire', cells: ['IDF, 69', 'IDF, remote', 'IDF, Laval, remote'] },
        ],
        note: 'Une case vide n’a pas été renseignée : elle ne vaut ni « non » ni zéro.',
      }) +
      '\n\n' +
      replyCard({
        type: 'account_ranking',
        title: 'Terrain de jeu — 1 compte(s) actif(s) sur 3',
        axes: [
          'Talents compatibles sur le compte (complémentarité)',
          'Note du compte /25 — grille de compte existante',
          'Aptitude du talent d’entrée à être poussé (matching du vivier)',
        ],
        items: [
          {
            name: 'SNCF',
            verdict:
              'Un seul angle : ouvrir par Camille R. sur « Ingénieur infrastructure — socle conteneurisé du portail », garder Marc O. pour un second temps — pas deux CV d’un coup.',
            why: [
              'Talent d’entrée : Camille R. sur « Ingénieur infrastructure — socle conteneurisé du portail » — couvre Kubernetes, Terraform.',
              'Talent alternatif : Marc O. sur « Ingénieur systèmes — supervision des systèmes temps réel », à évoquer dans un second temps.',
              'Aussi compatible : Inès K.',
            ],
            not_evaluated: ['Note du compte /25', 'Porteur du besoin', 'Tarif'],
          },
        ],
      }) +
      '\n\nRien n’est créé : ni action, ni message. Si tu veux le tableau, je te le prépare en fichier à télécharger.',
  },
  {
    // #2778 — search_talents rend désormais une carte `consultant_shortlist`
    // en production : la démonstration doit montrer la même forme. Reprend
    // les MÊMES trois personas que `p-territory-plan` ci-dessus et les mêmes
    // compétences déjà citées là — aucune donnée nouvelle inventée.
    id: 'p-consultant-shortlist',
    question: 'Quels consultants sont disponibles pour du Kubernetes ?',
    answer:
      'Trois profils du vivier, classés par disponibilité.\n\n' +
      replyCard({
        type: 'consultant_shortlist',
        title: 'Vivier — disponibilité et compétences citées',
        need: 'Kubernetes / infrastructure conteneurisée',
        items: [
          {
            name: 'Camille R.',
            headline: 'Ingénieur infrastructure',
            fit: ['Kubernetes', 'Terraform'],
            availability: 'disponible immédiatement',
          },
          {
            name: 'Marc O.',
            headline: 'Ingénieur systèmes industriels',
            fit: ['Aussi compatible avec le besoin, à évoquer dans un second temps'],
            availability: 'disponible immédiatement',
          },
          {
            name: 'Inès K.',
            headline: 'Profil compatible',
            fit: ['Aussi compatible avec le besoin'],
            availability: 'libre sous un mois',
          },
        ],
      }) +
      '\n\nRien n’est créé : la mise en avant d’un profil reste ton geste.',
  },
  {
    // #3340 (LAU-FINAL-250, retour bêta) — un consultant décrit PAR MORCEAUX,
    // sans CV ni fiche : Laura ne bloque plus la recherche en attendant le nom
    // ou le CV, elle structure un brief PROVISOIRE avec ce qui est déjà dit et
    // NOMME ce qu'il lui manque encore (`consultant_brief`, jamais un « 0 » ni
    // une valeur devinée). Aucun fait de démonstration inventé sur une société
    // réelle : le seul contenu vient de la question elle-même, posée par le
    // visiteur — exactement le cas que l'issue décrit.
    id: 'p-consultant-brief',
    question: 'J’ai un consultant CDI sur le bench, AWS, douze ans d’XP, en fait plutôt Tech Lead Data / Data Manager',
    answer:
      'Je peux commencer l’exploration du marché avec ce brief provisoire. En revanche, je ne qualifierai aucun match comme défendable avant d’avoir validé ses technologies récentes, son TJM et sa disponibilité exacte.\n\n' +
      'Je confirme au passage : il s’agit bien du même consultant ? Est-ce que la seconde description remplace AWS ou est-ce que son profil combine Cloud et Data ?\n\n' +
      replyCard({
        type: 'consultant_brief',
        title: 'Brief provisoire — consultant sur le bench',
        role: 'Tech Lead Data',
        previous_roles: ['Data Manager', 'Consultant Cloud AWS'],
        seniority: '12 ans d’expérience',
        tech_focus: 'Cloud AWS et Data',
        contract_type: 'CDI',
        unknowns: [
          'Ses technologies récentes précises au-delà d’AWS.',
          'Son TJM ou coût cible.',
          'Sa disponibilité exacte.',
          'Sa mobilité géographique.',
        ],
      }) +
      '\n\nJe commence dès maintenant l’exploration du marché sur ce que je sais déjà — aucune piste ne s’appellera « matching » tant que ce brief reste provisoire.',
  },
  {
    // Épopée #2778 (LOT j1 26/09) —
    // `explain_talent_duplicate` rend désormais une carte `verdict` en
    // production : la démonstration doit montrer la même forme, pas un
    // paragraphe en texte (craft rule n°9). Aucune donnée inventée : « Julien
    // Fabre » existe deux fois dans le vivier semé (`demo-dataset.ts`,
    // #2569.3 — une fiche `qualified` par cooptation, une fiche `needs_review`
    // venue d'un import, sans e-mail ni téléphone pour les distinguer) et
    // `GET /talents/:id/identity` les classe RÉELLEMENT `ambiguous` (clé
    // `same_name` seule). La phrase reprise ici est EXACTEMENT celle que rend
    // `explainTalentDuplicate` (`talent-identity.ts`) pour ce signal unique —
    // aucun chiffre de confiance, doctrine « aucune probabilité ».
    id: 'p-talent-duplicate',
    question: 'Pourquoi les deux fiches de Julien Fabre sont-elles rapprochées ?',
    answer:
      'Une proposition à examiner, pas une fusion : c’est toujours toi qui trancherais depuis l’onglet Identité de la fiche.\n\n' +
      replyCard({
        type: 'verdict',
        conclusion: 'Ambigu : à confirmer avant toute décision.',
        reasons: [
          'Ces deux fiches portent le même nom, et rien d’autre ne concorde : ce n’est pas suffisant pour dire qu’il s’agit de la même personne.',
        ],
      }) +
      '\n\nRien n’est fusionné : la décision reste un clic humain sur l’écran.',
  },
  {
    // #3816 (lot C4, 07/10) — « trouve-moi des missions pour ce profil » : `find_accounts_for_talent`
    // rend une carte `account_ranking` en production, la salle montre la même (craft rule n°9). Aucun
    // fait inventé : Camille Roussel porte `'69'` et `Kubernetes` (`demo-dataset.ts`), et le dernier
    // relevé démo du Rhône classe `kubernetes` et relève sii (10 offres) et alten (9) —
    // `DEMO_MISSIONS_FOR_PROFILE_COVERAGE`. Les suites retombent sur les trois amorces juste dessous.
    id: 'p-missions-for-profile',
    question: 'Trouve-moi des missions pour ce profil : Camille Roussel',
    answer:
      // #4421.6 — une ligne d'annonce (ce que Laura a retenu de la fiche), puis le résultat : aucune question.
      'J’ai retenu : Kubernetes, zone 69. Voici où placer Camille Roussel, lu sur son marché inversé — hors portefeuille, donc même sans aucun compte suivi.\n\n' +
      replyCard({
        type: 'account_ranking',
        title: 'Comptes où placer Camille Roussel',
        axes: ['Compétences de la fiche demandées sur la zone', 'Offres publiées par l’entreprise sur la zone'],
        // #4642 — la demande dont la carte est la réponse : « Analyser la sélection » ouvre le cadrage prérempli.
        talent_context: { talent_name: 'Camille Roussel', skills: ['Kubernetes'], zone: 'Rhône' },
        items: [
          {
            name: 'SII',
            why: [
              'Compétences de la fiche demandées sur le 69 : Kubernetes.',
              'SII publie 10 offres sur le 69 (relevé de cette semaine).',
              // #4421.13 — SII n'est pas un compte du jeu de démo : ses personnes sont trouvées dans le tour, à vérifier.
              `Trouvés hors de ton espace, à vérifier : ${DEMO_MISSIONS_PEOPLE_SII}.`,
              'Mail préparé pour Inès G. — à relire, c’est toi qui l’envoies.',
            ],
            source: { label: 'Veille territoriale (offres publiques)', url: 'https://www.sii-group.com/' },
            // #4642 — les offres relevées voyagent avec l'analyse lancée depuis la carte (cadrage visible en salle).
            offers: [{ title: 'Ingénieur DevOps Kubernetes' }, { title: 'Architecte cloud Kubernetes' }],
            // #4421.18 — « Obtenir l'e-mail » sous chaque personne : en salle, la révélation vient du jeu fictif.
            reveal: {
              people: [
                { name: 'Inès G.', title: 'Responsable recrutement', person_ref: 'demo-sii-ines', mail_to: true },
                { name: 'Julien M.', title: 'Directeur technique', person_ref: 'demo-sii-julien' },
              ],
            },
            follow_ups: [
              { label: 'Lancer l’analyse', ask: DEMO_MISSIONS_FOLLOW_UPS_SII.analysis },
              { label: 'Voir les contacts', ask: DEMO_MISSIONS_FOLLOW_UPS_SII.contacts },
              { label: 'Préparer le message', ask: DEMO_MISSIONS_FOLLOW_UPS_SII.message },
            ],
          },
          {
            name: 'Alten',
            why: [
              'Compétences de la fiche demandées sur le 69 : Kubernetes.',
              'Alten publie 9 offres sur le 69 (relevé de cette semaine).',
              `Trouvés hors de ton espace, à vérifier : ${DEMO_MISSIONS_PEOPLE_ALTEN}.`,
              'Mail préparé pour Sophie Lambert — à relire, c’est toi qui l’envoies.',
            ],
            source: { label: 'Veille territoriale (offres publiques)', url: 'https://www.alten.fr/' },
            // #3816 (lot R8 07/10) — chaque compte de la carte porte ses suites, pas seulement le premier.
            follow_ups: [
              { label: 'Lancer l’analyse', ask: DEMO_MISSIONS_FOLLOW_UPS_ALTEN.analysis },
              { label: 'Voir les contacts', ask: DEMO_MISSIONS_FOLLOW_UPS_ALTEN.contacts },
              { label: 'Préparer le message', ask: DEMO_MISSIONS_FOLLOW_UPS_ALTEN.message },
            ],
          },
        ],
        not_evaluated: [
          'Ouverture à la sous-traitance (non évaluée pour : SII, Alten)',
          'La veille compte les offres par entreprise et les technologies par département, sans les croiser : elle ne dit pas que ces entreprises recrutent ce profil précisément.',
          'Zones de la fiche non reliées à un département relevé : IDF.',
        ],
      }) +
      '\n\nMail préparé pour Inès G. (SII), à relire :\n\n' +
      DEMO_MISSIONS_MAIL_SII +
      '\n\nMail préparé pour Sophie Lambert (Alten), à relire :\n\n' +
      DEMO_MISSIONS_MAIL_ALTEN +
      '\n\nCes personnes sont à vérifier (rattachement, fonction) : ce ne sont pas encore des contacts de ton espace, et leur adresse n’est pas encore connue. Je prépare, tu envoies : rien ne part sans toi.',
  },
  {
    // #3816.2 — la suite « Lancer l'analyse » : en salle, aucune analyse ne part (aucun crédit).
    id: 'p-missions-for-profile-analysis',
    question: DEMO_MISSIONS_FOLLOW_UPS_SII.analysis,
    answer:
      'Sur ton espace, je préparerais l’analyse de SII, en gardant Camille Roussel comme profil à placer. En démonstration, aucune analyse n’est lancée.',
  },
  {
    // #3816.2 — la suite « Voir les contacts » : SII n'est pas un compte analysé de la salle — on le DIT.
    id: 'p-missions-for-profile-contacts',
    question: DEMO_MISSIONS_FOLLOW_UPS_SII.contacts,
    answer:
      // #4421.13 — les personnes trouvées dans le tour (simulées en salle), à vérifier, jamais des contacts de l'espace.
      'SII n’est pas encore un compte de cet espace. Personnes trouvées, à vérifier (rattachement, fonction) : ' +
      DEMO_MISSIONS_PEOPLE_SII.replace('; ', ', ') +
      '. L’analyse en fera des contacts de ton espace, avec leur raison.',
  },
  {
    // #3816.2 — la suite « Préparer le message » : jamais d'envoi, jamais d'interlocuteur deviné.
    id: 'p-missions-for-profile-message',
    question: DEMO_MISSIONS_FOLLOW_UPS_SII.message,
    answer:
      // #4421.13 — le mail préparé pour la première personne trouvée ; rien ne part.
      'Voici le mail préparé pour Inès G. (SII), à relire — c’est toi qui l’envoies :\n\n' + DEMO_MISSIONS_MAIL_SII,
  },
  {
    // #3816 (lot R8 07/10) — même suite, sous Alten cette fois : chaque compte de la carte porte ses propres amorces.
    id: 'p-missions-for-profile-analysis-alten',
    question: DEMO_MISSIONS_FOLLOW_UPS_ALTEN.analysis,
    answer:
      'Sur ton espace, je préparerais l’analyse d’Alten, en gardant Camille Roussel comme profil à placer. En démonstration, aucune analyse n’est lancée.',
  },
  {
    id: 'p-missions-for-profile-contacts-alten',
    question: DEMO_MISSIONS_FOLLOW_UPS_ALTEN.contacts,
    answer:
      // #4421.13 — les personnes trouvées dans le tour (simulées en salle), à vérifier, jamais des contacts de l'espace.
      'Alten n’est pas encore un compte de cet espace. Personnes trouvées, à vérifier (rattachement, fonction) : ' +
      DEMO_MISSIONS_PEOPLE_ALTEN.replace('; ', ', ') +
      '. L’analyse en fera des contacts de ton espace, avec leur raison.',
  },
  {
    id: 'p-missions-for-profile-message-alten',
    question: DEMO_MISSIONS_FOLLOW_UPS_ALTEN.message,
    answer:
      // #4421.13 — le mail préparé pour la première personne trouvée ; rien ne part.
      'Voici le mail préparé pour Sophie Lambert (Alten), à relire — c’est toi qui l’envoies :\n\n' +
      DEMO_MISSIONS_MAIL_ALTEN,
  },
  {
    // #3865.1 (lot N09, 08/10) — « voici un consultant, quels besoins DÉJÀ
    // OUVERTS lui correspondent ? » (`find_needs_for_talent`, lot X05) — à
    // distinguer de `p-missions-for-profile` juste au-dessus
    // (`find_accounts_for_talent`, « où le placer », marché inversé sans
    // besoin ouvert exigé). Aucun fait inventé : les deux besoins SNCF cités
    // existent dans `demo-dataset.ts` (`openNeeds`) et Camille Roussel porte
    // réellement `stack: ['Kubernetes', 'Terraform', …]`, `clearances: []` et
    // `environments_to_avoid: ['Astreinte']` (`DEMO_CONSULTANTS`) — le même
    // rapprochement que produirait le moteur réel (`evaluateCandidate`),
    // écrit à la main parce qu'aucune carte dédiée n'existe encore au contrat
    // (la production rend aujourd'hui une PROSE nommant les compartiments,
    // jamais une liste à puces uniforme — doctrine reprise ici).
    id: 'p-needs-for-profile',
    question: 'Quels besoins compatibles avec Camille Roussel ?',
    answer:
      'Deux besoins ouverts dans l’espace ont été rapprochés de sa fiche, jamais notés en pourcentage — seulement ce qui corrobore ou écarte.\n\n' +
      '**Recommandé**\n' +
      '• SNCF — « Ingénieur infrastructure — socle conteneurisé du portail » : les deux compétences obligatoires (Kubernetes, Terraform) sont sur sa fiche, et sa disponibilité immédiate couvre le démarrage attendu.\n\n' +
      '**Écarté**\n' +
      '• SNCF — « Ingénieur systèmes — supervision des systèmes temps réel » : exige une habilitation Confidentiel Défense qu’elle ne porte pas, une astreinte qu’elle a déclaré refuser, et des compétences (SI industriel, supervision de production) absentes de sa fiche.\n\n' +
      'Aucun besoin dans les compartiments Limite ou Non évaluable pour l’instant : les deux seuls besoins ouverts de l’espace ont pu être classés sans reste.',
  },
  {
    // #2778 — `prepare_day_brief` rend désormais une carte `meeting_brief` en
    // production : la démonstration doit montrer la même forme (craft rule
    // n°9), premier outil à instruire ce type de carte. Reprend un
    // rendez-vous DÉJÀ semé (`demo-agenda.ts`, `demo-event-nova` — SNCF
    // LOGISTIQUE, Directeur technique — entité numérique voyageurs) et des faits DÉJÀ écrits ailleurs dans ce
    // fichier de démonstration : le sujet « Cadrage — programme de refonte applicative
    // et applications terrain » et l'attente d'un profil produit avant la
    // commission (mêmes échanges que ceux qui alimentent la fiche de compte)
    // — aucun fait nouveau.
    //
    // ⚠️ Posée AVANT `p-market-sweep`, même raison que `p-timeline`/`p-export`
    // ci-dessus.
    id: 'p-meeting-brief',
    question: 'Prépare mon rendez-vous de tout à l’heure avec SNCF',
    answer:
      'Dans deux heures, sur le compte SNCF.\n\n' +
      replyCard({
        type: 'meeting_brief',
        title: 'SNCF — point besoin programme de refonte applicative',
        account: { name: 'SNCF' },
        when: 'Dans 2 heures',
        attendees: [],
        objective: 'Cadrer le renfort sur le programme de refonte applicative de l’entité.',
        // #4424.4 — le pitch : profil de l'ESN de démonstration (Bellum Conseil, ses
        // offres) × enjeu déjà écrit plus haut, et la référence DÉJÀ semée au profil
        // (`client_references`) — aucun fait nouveau.
        pitch:
          'Nous sommes Bellum Conseil, nous accompagnons nos clients sur le cloud, la data et la cybersécurité. ' +
          'Chez SNCF, nous lisons un enjeu : renforcer vite le programme de refonte applicative de l’entité. ' +
          'Nous l’avons déjà fait : audit cybersécurité pour SNCF. ' +
          'L’objectif aujourd’hui : repartir avec une prochaine étape claire et datée.',
        talking_points: [
          'Un besoin est déjà publié dans l’entité : il n’y a pas à convaincre qu’il existe, seulement à le servir plus vite que le recrutement.',
          'On entre par une entité, jamais par le groupe : son référencement dépasse la taille d’une ESN moyenne.',
        ],
        questions: ['As-tu déjà un profil à proposer avant la commission ?'],
      }) +
      '\n\nLe corps des messages échangés n’en fait jamais partie.',
  },
  {
    // #2594 — LA CARTE « CE QUI ME MANQUE », EN DÉMONSTRATION (craft rule n°9).
    //
    // Vu en production le 18/09/2026 : un lien mort dans une carte
    // `missing_data`, « Comment l'obtenir : [Contacts](/contacts) » affiché
    // crochets compris. La salle doit montrer la marche suivante VIVANTE,
    // pas seulement la carte qui la porte — sinon la régression corrigée par
    // ce lot ne se voit jamais dans le lien de démonstration.
    //
    // `how` porte volontairement le lien markdown EN LIGNE plutôt qu'un
    // `href` structuré séparé : c'est exactement la forme vue en production,
    // celle que `CardLink` (`ReplyCard.tsx`) doit maintenant rendre cliquable
    // sans `href` posé à côté.
    //
    // Reprend deux faits DÉJÀ écrits dans ce fichier — les six entités métiers
    // de SNCF qui gardent leurs équipes (`p-entity-or-group`) et la règle des
    // mandataires sociaux (`p-contacts`) — aucun fait nouveau.
    //
    // ⚠️ Posée AVANT `p-market-sweep`, même raison que `p-timeline`/`p-export`
    // ci-dessus : ce marqueur doit rester la DERNIÈRE entrée du tableau.
    id: 'p-departed-contact',
    question: 'Écris un message à un contact qui a quitté SNCF',
    // #3243 (#186.9) — le challenge de Laura « contacter une personne partie »,
    // dans ses mots exacts (`commercial_challenge.detect_departed_contact`) :
    // la fiche du contact est marquée `historique`. Aucune personne nommée — la
    // règle du fichier — et aucun fait neuf sur SNCF.
    answer:
      'Avant de rédiger, je challenge ta demande.\n\n' +
      'Le problème : cette personne a quitté l’entreprise (fiche marquée historique).\n\n' +
      'L’impact : un message écrit comme à un contact actuel du compte tomberait à côté, et pourrait nuire à la relation.\n\n' +
      'Ce que je te propose à la place : l’aborder comme relation réseau, viser son nouvel employeur, ou chercher son successeur sur ce compte. Dis-moi laquelle, et je prépare le message — tu l’envoies.',
  },
  // #3876.5 (lot M13, 09/10) — une VILLE reste une ville, chez Laura comme dans
  // Découvrir : la proposition porte `city`, la carte dit « ville de Lyon » et le
  // clic ouvre Découvrir sur le champ « Ville » (commune), jamais sur le Rhône entier.
  {
    id: 'p-find-accounts-city',
    question: 'Ouvre Découvrir sur les ESN à Lyon.',
    answer:
      'Je prépare la recherche sur **la commune de Lyon** — la ville seule, pas tout le Rhône : un département ou un rayon autour de la ville sont d’autres périmètres, et je ne les choisis pas à ta place.\n\n' +
      'La zone filtre sur l’adresse du **siège** enregistré au registre : une entreprise dont seul un établissement est à Lyon n’y apparaît pas d’office. Si tu veux élargir (rayon, département), dis-le et je change le périmètre.',
    pendingActions: () => [{ action: 'find_accounts', sectors: ['it'], city: 'Lyon' }],
  },
  {
    // #3889.2 (lot I02) — l'HISTORIQUE des besoins d'un compte : les trois besoins FERMÉS de SNCF sont
    // semés (`refusedNeeds`, statut `lost`) ; en production `find_needs` les lit avec `include_closed`
    // et les marque `historical`. Un besoin fermé est un fait PASSÉ, jamais une piste ouverte. Rien
    // n'est dit des autres comptes : l'absence ailleurs n'est pas un historique vide (#3889.5).
    id: 'p-needs-history',
    question: 'SNCF a-t-il déjà eu des besoins fermés ?',
    answer:
      'Oui : **3 besoins fermés** (statut perdu) figurent à l’historique de SNCF. Ce sont des faits passés, pas des pistes ouvertes — je ne te les propose pas comme des opportunités.\n\n' +
      '**Historique (fermés)**\n' +
      '• « Ingénieur plateforme Kubernetes — socle de conteneurs » : aucun profil Kubernetes disponible dans le vivier à la date demandée.\n' +
      '• « DevOps K8s — industrialisation des déploiements » : deux profils pressentis, aucun disponible sur la fenêtre du client.\n' +
      '• « Administrateur kube — reprise d’un cluster existant » : fermé faute de profil ; le client a repris l’exploitation en interne.\n\n' +
      'Les besoins **ouverts** de SNCF sont une autre liste. Et je ne conclus rien sur les autres comptes : ne pas y trouver de besoin fermé ne dit pas qu’ils n’en ont jamais eu.',
  },
  {
    // #3871 (lot I02) — « <contact> a quitté l'entreprise » : Laura NOMME l'état déjà posé au lieu de
    // reproposer (`propose_contact_departure` : « déjà en historique » / « déjà écarté »). Les deux fiches
    // sont des interlocuteurs SIMULÉS de la salle (Société Générale), l'un `historique`, l'autre `rejete`.
    id: 'p-contact-departure-historique',
    question: 'Karim Fassi a quitté Société Générale, mets à jour le dossier',
    answer:
      'La fiche de Karim Fassi est **déjà en historique** : rien à changer. Elle reste au dossier comme réseau dormant, et ne compte plus dans le classement actif.\n\n' +
      'Je n’archive rien de plus et je ne supprime jamais une fiche : on archive, on ne supprime pas.',
  },
  {
    id: 'p-contact-departure-ecarte',
    question: 'Hélène Marchetti a quitté Société Générale, mets à jour le dossier',
    answer:
      'La fiche d’Hélène Marchetti est **déjà écartée** : tu l’as écartée à dessein, et un départ ne remplace pas ce choix. Je laisse donc son statut tel quel.\n\n' +
      'Si tu veux la réactiver, c’est un geste de ta part depuis la fiche — je ne le fais pas seule.',
  },
  {
    // #3889.1 (lot I02) — « qui a déjà travaillé chez <compte> ? » lit l'expérience DÉCLARÉE d'un CV
    // autorisé (`search_talents` + `experience_client`). Les CV de la salle citent un SECTEUR, jamais le
    // nom d'un client (un profil porte même un client explicitement masqué) : la salle montre donc la
    // réponse HONNÊTE d'un résultat vide, avec sa portée, jamais un consultant rattaché à un compte réel
    // sans fondement. La preuve du cas positif est le test `talent-experience-search.spec.ts`.
    id: 'p-experience-search',
    question: 'Quels consultants ont déjà travaillé chez SNCF ?',
    answer:
      'Je n’en trouve **aucun** parmi les CV autorisés du vivier : aucun ne déclare SNCF comme client.\n\n' +
      'Ce que cela ne dit pas : je ne lis que les CV dont le consentement est valide, et un client **masqué** (un CV qui parle d’« opérateur d’énergie » sans nom) ne se retrouve jamais par son nom. Ne pas en trouver ici ne prouve pas qu’aucun consultant n’a travaillé chez SNCF.\n\n' +
      'Une affectation de mission Bellum n’est pas nécessaire pour être retrouvé : c’est l’expérience déclarée dans le CV qui compte.',
  },
  {
    // #3889 (épopée #3977, 11/10) — « quels projets dans nos DOCUMENTS ? » (`search_document_projects`) : la
    // réponse reprend MOT POUR MOT les notes d'avant-vente FICTIVES semées au compte Sanofi
    // (`DEMO_SANOFI_PROJECT_NOTES_TITLE`, `demo-dataset.ts`), rangées sur ce que le texte DIT. Aucun fait neuf.
    id: 'p-document-projects',
    question: 'Quels projets a Sanofi dans nos documents ?',
    answer:
      'Un document de ton espace parle de projets Sanofi : **« Notes d’avant-vente — projets Sanofi (démo) »**. Je range ce qu’il écrit, sans rien deviner.\n\n' +
      '**Besoins ouverts**\n' +
      '• Deux ingénieurs data sur la qualification des données de pharmacovigilance — le document le dit « ouvert », démarrage annoncé au prochain trimestre.\n\n' +
      '**Anciens besoins**\n' +
      '• Architecte données pour la plateforme analytique R&D — « annulé par le client », regroupé dans le programme data du groupe.\n\n' +
      '**Missions**\n' +
      '• Cadrage en six semaines d’un tableau de suivi qualité — « terminée », restitution faite au comité.\n\n' +
      '**Projet du client**\n' +
      '• Programme de productivité de la R&D par l’IA — non daté.\n\n' +
      '**Statut non établi**\n' +
      '• Un chef de projet pour la refonte du portail fournisseurs, évoqué en réunion — **non daté** : le document ne dit ni quand ni s’il est encore ouvert, je ne le compte donc pas parmi les besoins ouverts.\n\n' +
      'Ces projets viennent des documents, pas des besoins enregistrés dans l’application : une absence ici ne dit rien de ceux-là. Un projet cité n’est pas créé dans le pipe.',
  },
  {
    // #3219 (#190.2 côté contact, décision Louis 11/10) — « avant que je lui écrive, quelque chose cloche ? »
    // (`get_contact_preflight`) : la réponse reprend MOT POUR MOT les deux relevés semés sur le siège
    // anonyme (`DEMO_CONTACT_SCOPE_DIFFERENCE`, `demo-dataset.ts`) — deux vérités de portée, rien de tranché.
    id: 'p-contact-preflight',
    question:
      'Avant que j’écrive au directeur technique de l’entité numérique voyageurs chez SNCF, quelque chose cloche sur sa fiche ?',
    answer:
      'Une seule différence, et ce n’est pas une erreur à corriger : **son poste n’est pas dit de la même façon selon la portée de l’analyse**.\n\n' +
      '• « Directeur technique » — analyse du dossier, portée **Groupe entier**\n' +
      '• « Directeur technique — entité numérique voyageurs » — analyse du dossier, portée **Filiales**\n\n' +
      'Les deux sont vraies, chacune dans sa portée : je ne choisis pas entre elles. Si tu écris à l’entité, le second intitulé est celui de ta cible ; si une valeur est fausse, corrige la fiche — ta correction passera devant toute source.\n\n' +
      'Rien d’autre ne diffère : le contact est dans le périmètre retenu pour le compte. Je n’envoie rien — tu relis, tu envoies.',
  },
  {
    // #3866 (lot I02) — « Trouve des comptes pour une offre Data/BI » : la taille, le siège et l'ancienneté
    // ne prouvent PAS l'adéquation. Un compte sans élément métier nommé sort « À qualifier », jamais
    // « Prioritaire » (`known_shape_gate._with_fit_verdict_capped`), et le rabaissement se NOMME. Aucun fait
    // neuf sur les comptes : la réponse dit la RÈGLE, pas un classement inventé.
    id: 'p-account-fit-data-bi',
    question: 'Trouve des comptes pour une offre Data/BI',
    answer:
      'Je ne te classe pas de « Prioritaire » sur la seule taille, le siège ou l’ancienneté d’un groupe : ce n’est pas une raison commerciale pour une offre Data/BI.\n\n' +
      'Un compte devient **Prioritaire** seulement si son dossier nomme un élément réel : un projet, une demande, une relation, une organisation documentée ou un besoin métier. Sans cela il sort **À qualifier**, et je te dis combien de comptes j’ai rabaissés pour cette raison.\n\n' +
      'Je ne remplis pas une liste pour atteindre un nombre : mieux vaut trois comptes justifiés que dix sans raison. Je n’ai pas non plus élargi tes critères à ton insu — dis-moi si tu veux le faire.',
  },
  {
    // #3867 (lot I02) — « Fais-moi toute la stratégie » : une RECOMMANDATION et de vrais arbitrages, les
    // cinq dimensions appliquées sans jamais nommer la méthode, aucun délai ni résultat garanti.
    // Reprend des faits DÉJÀ écrits ici (BPCE : une banque régionale plutôt que l'organe central) — aucun fait neuf.
    id: 'p-strategy-full',
    question: 'Fais-moi toute la stratégie sur Groupe BPCE',
    answer:
      '**Ma recommandation : entre par une banque régionale, pas par l’organe central.**\n\n' +
      '**Le périmètre.** Une entité précise du réseau, pas le groupe entier : c’est là qu’un besoin documenté peut exister.\n\n' +
      '**Le problème à traiter.** Je le formule d’après ce que le dossier établit ; ce qu’il ne dit pas, je te le demande plutôt que de l’inventer.\n\n' +
      '**Les personnes.** Je pars des rôles à approcher, sans nommer quelqu’un que le dossier ne nomme pas.\n\n' +
      '**Les preuves.** Une référence comparable et un signal daté, sinon on reste sur une approche de découverte.\n\n' +
      '**Le passage à l’action.** Un premier message court, sur un seul angle.\n\n' +
      '**Les arbitrages :** viser la banque régionale te donne un accès plus direct mais un volume plus petit ; l’organe central ouvre plus large mais plus lentement. Je retiens la première option.\n\n' +
      'Je ne promets ni délai de démarrage ni résultat commercial : rien dans le dossier ne les fonde. Les premières actions sont préparées dans cette réponse — tu relis, tu envoies.',
  },
  {
    id: 'p-contact-gap',
    question: 'As-tu le nom du décideur chez SNCF sur l’entité que je vise ?',
    answer:
      'Non, et je ne l’invente pas.\n\n' +
      replyCard({
        type: 'missing_data',
        title: 'Ce qui me manque',
        missing: [
          {
            what: 'Le nom du décideur sur cette entité',
            why: 'Six entités métiers gardent leurs équipes, et aucune source consultée ne désigne le décideur de celle que tu vises — seuls les mandataires sociaux du registre sont nommés.',
            how: 'Ajoute-le dès que tu l’identifies depuis [Contacts](/contacts) : je le reprends ensuite dans le dossier.',
          },
        ],
        still_possible: ['Écrire au siège de décision de l’entité, sans nom dessus.'],
      }) +
      '\n\nCe que le dossier ne sait pas, il ne l’invente pas.',
  },
  {
    // #3186 (recette démo 06/10) — le mode contractuel n'est PAS déclaré sur le profil de la salle : Laura
    // le dit au lieu de le deviner, et la carte mène à Réglages › Profil. Aucune donnée neuve sur personne.
    id: 'p-staffing-model-undeclared',
    question: 'Comment présenter notre modèle de staffing ?',
    answer:
      'Je ne peux pas le présenter de façon fiable : ton **mode contractuel est non déclaré** sur ton profil, et je ne le devine pas.\n\n' +
      replyCard({
        type: 'missing_data',
        title: 'Renseigner le mode contractuel',
        missing: [
          {
            what: 'Le mode contractuel de ton ESN',
            why: 'Sans lui, je ne sais pas si tu vends du temps passé, un forfait ou un engagement de résultat — et la présentation change du tout au tout.',
            how: 'Renseigne-le dans [Réglages › Profil](/settings/profile) : je reprends ensuite ta présentation avec le bon cadre.',
          },
        ],
        still_possible: ['Présenter ce qui est déclaré : ton domaine d’offre et la taille de ton équipe.'],
      }) +
      '\n\nCe que le profil ne dit pas, je ne l’invente pas.',
  },
  {
    // #3285 (recette démo 06/10) — la MÊME source qu'en production : le signal de méthode « ouverture de
    // compte fermé » (`laura_method_signal.py`, kind `method_rule`). Aucun fait neuf sur Alstom, aucune
    // personne nommée : la réponse dit comment la méthode ouvre un compte sans accès.
    id: 'p-open-closed-account',
    question: 'Par où j’ouvre ce compte ?',
    sources: [{ kind: 'method_rule', label: 'ouverture de compte fermé' }],
    answer:
      'Alstom se traite comme un **compte fermé** : pas d’accès établi, donc on n’écrit pas au sommet.\n\n' +
      '1. **Cartographier avant d’approcher** : repérer les entités et directions qui recourent à des prestataires externes.\n' +
      '2. **Entrer par un périmètre précis**, pas par le groupe : une équipe, un programme, un besoin documenté.\n' +
      '3. **Chercher un accès indirect** (relation réseau, partenaire déjà référencé) avant tout message à froid.\n\n' +
      'Je prépare, tu relis et tu envoies : je n’envoie rien. La méthode citée est visible dans les sources de cette réponse.',
  },
  {
    // #3750.8 — LE DÉCOUPAGE PAR ONGLET, EN DÉMONSTRATION. La source est le classeur FICTIF de l'ESN de
    // la salle, semé avec ses morceaux (`DEMO_RAG_DOCUMENTS`, `rag_document_chunks`) ; le libellé a la
    // forme EXACTE que sert la production pour un document découpé (« Titre — unité »,
    // `context_transparency._sources_from_docs`). La réponse ne dit RIEN que l'onglet ne porte.
    id: 'p-objection-price',
    question: 'Que répondre si on me dit que c’est trop cher ?',
    sources: [{ kind: 'knowledge_doc', label: 'Brand Messaging — Bellum Conseil (classeur, démo) — 07 · Objections' }],
    answer:
      'Ton classeur **Brand Messaging**, onglet **07 · Objections**, traite ce cas :\n\n' +
      '- **Réponse** : comparer le coût sur la durée de la mission, pas le TJM seul.\n' +
      '- **Preuve à citer** : la référence exploitation — détection d’incident divisée par quatre.\n\n' +
      'L’onglet **10 · Ton et vocabulaire** ajoute : rester concret et daté, jamais « des résultats exceptionnels ». ' +
      'Je prépare la réponse, tu relis et tu envoies : je n’envoie rien.',
  },
  {
    // #3434 (lot X62, recette prod 02/10 : « à rejouer sur un groupe non
    // analysé ») — UN GROUPE TROP LARGE n'est pas analysé en bloc. Les six
    // dossiers de la salle sont déjà analysés : le cas se joue sur une société
    // ouvertement FICTIVE de Découvrir (« (démo) »). Aucun fait nouveau sur une
    // vraie société, aucune analyse lancée, aucun crédit débité.
    id: 'p-group-too-broad',
    question: 'Analyse Verdal Distribution (démo).',
    answer:
      'Je peux lancer l’analyse, mais « Verdal Distribution (démo) » reste trop large pour produire une vraie stratégie.\n\n' +
      'Pour ton offre, le compte doit être découpé par entité, programme ou direction. Je commencerais par :\n' +
      '- les périmètres que ton offre couvre ;\n' +
      '- les entités accessibles en France ;\n' +
      '- les équipes où un recours externe ou un projet récent est documenté.\n\n' +
      'Le groupe servira de contexte ; l’action partira d’un périmètre précis. Dis-moi lequel, et je lance l’analyse sur celui-là — rien n’est débité avant ta confirmation.',
  },
  {
    // #3420 (lot X62) — LE CONTRÔLE QUALITÉ MÉTIER avant validation. Les motifs
    // sont ceux que le centre d'approbation affiche (`outreach.json` :
    // `blocker.*`) ; le message visé est celui que la salle sème bloqué sur la
    // fiche du directeur des systèmes d'information du client d'exemple
    // (« Il manque une preuve »). Aucune personne nommée.
    id: 'p-message-quality-check',
    question: 'Mon message est-il prêt à être validé ?',
    answer:
      'Pas encore — je ne le valide pas tant que ces points restent ouverts :\n\n' +
      '- **Il manque une preuve.** « Notre consultant est disponible dès lundi » : aucune disponibilité n’est prouvée dans le dossier.\n' +
      '- **Le test de généricité :** remplace le nom de l’entreprise par une autre. Si le message reste valable, il est trop générique.\n' +
      '- **Une seule question, facile :** une demande de présentation cette semaine se traite ; un rendez-vous imposé dès le premier message, non.\n\n' +
      'Les motifs se lisent aussi sur la fiche du contact, dans « Messages préparés ». Je prépare, tu relis et tu envoies : je n’envoie rien.',
  },
  {
    // #3400 (lot X62) — DEUX NOTIONS SÉPARÉES. Le ton suit le type de personne ;
    // le plan de compte suit le rôle dans la décision
    // (`apps/ia/tests/test_message.py::test_3400_4_…` rejoue le tour réel).
    id: 'p-tone-vs-decision-role',
    question: 'Pourquoi le ton de ces deux messages est-il le même, alors que leurs rôles diffèrent ?',
    answer:
      'Parce que ce sont deux choses séparées, et je les garde séparées.\n\n' +
      '- **Le type de personne** (dirigeant, manager, opérationnel, achats) règle le **ton** : deux directeurs des systèmes d’information lisent de la même façon, donc leurs messages ont le même registre.\n' +
      '- **Le rôle dans la décision** (décideur économique, champion, référent technique, utilisateur…) règle la **stratégie du plan de compte** : qui on approche d’abord, et avec quel message de fond.\n\n' +
      'Exemple : au même poste, l’un décide et l’autre utilise la plateforme — même ton, mais pas la même place dans le plan. Le rôle n’est jamais déduit du seul intitulé : la fiche affiche la raison de l’attribution et tu peux la corriger.',
  },
  {
    // #3287 (lot X62) — APRÈS UNE ACTION « RÉORIENTÉE » : Laura propose, ne crée
    // rien (`p-action-reoriented`). Le geste d'écriture reste celui du commercial.
    id: 'p-action-reoriented',
    question: 'Mon action « relancer le directeur des systèmes d’information » a été réorientée : que proposes-tu ?',
    answer:
      'Une action réorientée n’est ni un échec ni une clôture : tu as déclaré que la piste change de direction. Je ne crée rien de moi-même.\n\n' +
      '**Ce que je propose :** une action de remplacement vers l’interlocuteur que tu as indiqué, avec son prochain geste daté — à ta validation.\n\n' +
      '**Ce que je ne fais pas :** fermer l’ancienne action, ou en ouvrir une nouvelle sans ton accord. Tu confirmes depuis [Aujourd’hui](/briefing) ; je prépare, tu décides.',
  },
  {
    // #2276 — LE JOB COMPOSITE, EN DÉMONSTRATION. Raison : `DEMO_LAURA_JOB`.
    id: 'p-laura-job',
    question: 'Trouve-moi les décideurs de chaque entité SNCF et prépare un premier message pour chacun',
    answer:
      'C’est un travail en plusieurs étapes, alors je l’ai posé comme un job plutôt que de le simuler ici — tu l’as confirmé, le voici exécuté.\n\n' +
      '**Ce qui est fait :** dossier SNCF relu, 8 décideurs retrouvés sur 10, 8 premiers messages prêts à relire (rien n’est envoyé), et la remontée dans ton CRM, que tu as validée.\n\n' +
      '**Ce qui reste à faire :** relire les 8 messages, puis les envoyer toi-même.',
    lauraJob: DEMO_LAURA_JOB,
  },
  {
    // Craft rule n°9 — l'état « Obsolète » d'un job (#2276.29). Raison : `DEMO_LAURA_JOB_SUPERSEDED`.
    id: 'p-laura-job-superseded',
    question: 'Et la première fiche de job SNCF, celle d’avant ma précision ?',
    answer:
      'Elle est **obsolète** : tu as précisé ta demande, et je l’ai remplacée dans ce fil par le job exécuté juste au-dessus.\n\n' +
      '**Ce qu’elle garde :** sa fiche, lisible pour mémoire. Elle n’a jamais tourné — aucune étape n’a été faite.\n\n' +
      '**Ce qu’elle ne fait plus :** se confirmer ou se relancer. C’est le job qui l’a remplacée qui compte.',
    lauraJob: DEMO_LAURA_JOB_SUPERSEDED,
  },
  {
    // Craft rule n°9 — l'état « Brouillon » d'un job (#2276.22 / .31). Raison : `DEMO_LAURA_JOB_DRAFT`.
    id: 'p-laura-job-draft',
    question: 'Prépare un premier message pour les décideurs de mes comptes prioritaires',
    answer:
      'J’ai posé la fiche en **brouillon** : il me manque le périmètre. Aucun compte de ton portefeuille n’est encore marqué prioritaire, je ne devine pas lesquels tu vises.\n\n' +
      '**Ce qui la rend confirmable :** nomme les comptes, ou marque-les prioritaires dans ton [portefeuille](/accounts). Rien ne part tant qu’elle est en brouillon.',
    lauraJob: DEMO_LAURA_JOB_DRAFT,
  },
  {
    // #1950.14 / #1950.20 / #1950.22 — LE PLAN DE LAURA, EN DÉMONSTRATION.
    // Raison de chaque carte : `DEMO_PLAN_CARDS`, juste au-dessus du tableau.
    id: 'p-plan',
    question: 'Prépare ma relance Groupe BPCE en plusieurs étapes',
    answer:
      'Voici le plan pour relancer Groupe BPCE, en trois étapes.\n\n' +
      '**Ce qui se lance d’un geste :** les étapes qui se préparent ici. Ce qui écrirait dans ta messagerie, ton CRM ou ton agenda attend ta validation sur sa propre carte.\n\n' +
      '**Ce que montre la salle :** l’étape 1 est faite — le brouillon est dans le dossier. L’étape 2 a échoué : aucune génération facturée ne part d’une salle de démonstration. L’étape 3 dépend d’elle : elle est bloquée plutôt que de partir sans elle.',
    cards: DEMO_PLAN_CARDS,
    // #1950.4 / .7 / .12 / .13 — le résumé du plan, tel que Laura le nomme.
    // Aucune donnée manquante n'est inventée pour remplir la ligne : elle est
    // absente, donc la barre n'en rend aucune.
    planBrief: {
      objective: 'Relancer Groupe BPCE avec un message qui s’appuie sur le dossier.',
      expected_results: ['Un brouillon de relance dans le dossier', 'Un rappel pour la suite'],
      impossible: ['Générer le message en salle de démonstration : aucune génération facturée n’en part.'],
    },
  },
  {
    // #3758 (BEL-LAU-1001) — LA CARTOGRAPHIE, en carte `account_map` : groupes
    // nommés, couverture écrite, ce qui n'est PAS couvert nommé (donc carte
    // « partielle »). Mêmes comptes fictifs que `p-market-sweep` — jamais un
    // compte réel présenté comme un fait.
    id: 'p-account-map',
    question: 'Fais-moi une cartographie de mes comptes par secteur.',
    answer:
      'Voici la cartographie de ton périmètre, rangée par secteur.\n\n' +
      replyCard({
        type: 'account_map',
        title: 'Cartographie par secteur',
        coverage: 'Les comptes enregistrés dans l’espace de démonstration, classés par secteur déclaré au registre.',
        groups: [
          {
            label: 'Industrie',
            items: [
              { name: 'Altiver Industries (démo)', detail: 'Plus de 250 salariés' },
              { name: 'Aubrac Aerostructures (démo)', detail: 'Sous-traitance aéronautique civile' },
            ],
          },
          { label: 'Distribution', items: [{ name: 'Verdal Distribution (démo)', detail: 'Secteur à confirmer' }] },
        ],
        not_covered: [
          'Les entreprises que l’espace n’a pas encore enregistrées.',
          'Les comptes sans secteur déclaré au registre.',
        ],
        // #3776.5 — cette cartographie lit un classement déjà enregistré à une
        // date donnée (`as_of`), jamais relu comme l'état actuel du marché :
        // c'est la définition même de `basis: 'history'` (sourceSchema).
        source: { label: 'Jeu de démonstration', as_of: '2026-09', basis: 'history' },
      }) +
      '\n\nLa carte dit ce qu’elle couvre et ce qu’elle ne couvre pas : une cartographie partielle reste partielle.',
  },
  {
    // #2470 / #2471 — LES DEUX GESTES, EN DÉMONSTRATION.
    //
    // Retours du 16/09/2026 : « un GO devrait entraîner une recherche
    // directement et que ça alimente la conversation » et « proposer découvrir
    // pour un tour d'horizon mais aussi et surtout une vraie analyse pour aller
    // au fond de free et de ses filiales ». La salle doit montrer les DEUX :
    // une capacité livrée mais vide en démonstration se découvre en réunion.
    //
    // ⚠️ Les entreprises citées sont celles de la recherche scriptée de la
    // salle (`demo-scripts.ts`, suffixe « (démo) ») — les mêmes que le visiteur
    // retrouve sur [Découvrir](/discover), et jamais des sociétés réelles : le
    // registre ne répond pas à la salle, et inventer des noms sans les nommer
    // comme fictifs serait de la donnée fictive présentée comme un fait.
    // ⚠️ Posée APRÈS `p-priorities` : `demo-turn.test.ts` lit la PREMIÈRE carte
    // de classement, qui reste celle du portefeuille seedé.
    // ⚠️ Reste la DERNIÈRE entrée du tableau : `demo-laura-gestures-coverage.
    // spec.ts` lit tout ce qui suit le marqueur de CETTE entrée (`p` +
    // `-market-sweep`, volontairement coupé ici pour ne pas se citer
    // lui-même) et y exige que chaque `name:` porte « (démo) » — une entrée
    // ajoutée APRÈS casserait cette garde en y ajoutant un nom réel ou un
    // champ homonyme (`filename:` contient déjà la sous-chaîne `name:`).
    id: 'p-market-sweep',
    question: 'Fais-moi un tour d’horizon des industriels de plus de 250 salariés.',
    answer:
      'Deux façons d’y aller, et je peux faire l’une ou l’autre tout de suite :\n\n' +
      '• **le tour d’horizon** — je cherche et je te rends la liste ici, dans la conversation. Inclus ;\n' +
      '• **l’analyse de fond** — j’ouvre le dossier complet d’une entreprise et de son groupe, filiales comprises. Celle-là prend plus de temps : je te préviens avant de lancer.\n\n' +
      'Tu as dit go, alors voici le tour d’horizon.\n\n' +
      replyCard({
        type: 'account_ranking',
        title: 'Industriels de plus de 250 salariés',
        axes: ['Secteur visé : industrie', 'Effectif : 250 et plus', 'Établissement actif au registre'],
        items: [
          {
            name: 'Altiver Industries (démo)',
            verdict: 'Cible : taille et activité dans le périmètre demandé.',
            why: ['Effectif au-dessus de la borne demandée.', 'Activité industrielle au registre.'],
            // #3776.5 — un effectif et une activité lus au registre : un fait
            // vérifié par un outil, jamais une lecture du modèle (`basis: 'proof'`).
            source: { label: 'Jeu de démonstration', as_of: '2026-09', basis: 'proof' },
          },
          {
            name: 'Aubrac Aerostructures (démo)',
            verdict: 'Cible : sous-traitance aéronautique, périmètre civil.',
            why: ['Activité de production dans le secteur demandé.'],
            limits: ['Les programmes de défense restent hors de portée sans habilitation.'],
            source: { label: 'Jeu de démonstration', as_of: '2026-09', basis: 'proof' },
          },
          {
            name: 'Verdal Distribution (démo)',
            verdict: 'À vérifier : l’activité déclarée est en limite du périmètre.',
            why: ['Effectif dans la tranche demandée.'],
            not_evaluated: ['Secteur exact'],
            // #3776.5 — un secteur non confirmé : une LECTURE à vérifier, pas
            // un fait établi (`basis: 'interpretation'`), cohérent avec
            // « À vérifier » et `not_evaluated` ci-dessus.
            source: { label: 'Jeu de démonstration', as_of: '2026-09', basis: 'interpretation' },
          },
        ],
        not_evaluated: ['Signaux d’intention', 'Budget', 'ESN déjà en place sur le périmètre'],
      }) +
      '\n\nCe qui n’a pas pu être évalué est nommé une fois, sous la liste : « non mesuré » ne veut pas dire « non ». ' +
      'Dis-moi sur laquelle tu veux l’analyse de fond, ou ouvre [Découvrir](/discover) pour trier toi-même.',
    // #3766 — la recherche que ce tour d'horizon a composée : la carte
    // « Découvrir » (critères emportés) ET « Affiner la recherche » (bloc
    // d'actions) se voient en démonstration. Aucun identifiant de compte
    // n'est scripté : ils sont semés au hasard par session (`DemoSeedService`).
    pendingActions: () => [{ action: 'find_accounts', headcount: '250+', keywords: 'industrie' }],
  },
  {
    // LUDOVIC-D LC.6 — « avec qui appeler » : le tour d'horizon sur le MÊME moteur que Découvrir ›
    // Comptes (secteurs, zones et métiers du profil ; les métiers DITS affinent ceux du profil). Chaque
    // entreprise cite son signal daté et ses personnes connues, sinon « à trouver » + « Trouver qui
    // appeler ». Entreprises et personnes de la salle, suffixe « (démo) » — jamais des réelles.
    id: 'p-call-hiring',
    question:
      'Trouve-moi des industriels en Auvergne-Rhône-Alpes qui recrutent en méthodes ou qualité, avec qui appeler.',
    answer:
      'Voici les industriels de ta cible qui publient une offre datée en méthodes ou qualité, ceux qui recrutent dans ces métiers d’abord. ' +
      'Inclus.\n\n' +
      replyCard({
        type: 'account_ranking',
        title: 'Industriels qui recrutent en méthodes / qualité — Auvergne-Rhône-Alpes',
        axes: [
          'Secteurs de ton profil : industrie',
          'Zone : Auvergne-Rhône-Alpes',
          'Métiers demandés : méthodes, qualité',
        ],
        items: [
          {
            name: 'Altiver Industries (démo)',
            verdict: 'Cible : recrute dans tes métiers.',
            why: [
              'Signal daté : Ingénieur méthodes industrialisation H/F (2026-10-14).',
              'À appeler : Claire Vasseur (démo) — Responsable méthodes.',
            ],
            source: { label: 'Jeu de démonstration', as_of: '2026-10', basis: 'proof' },
          },
          {
            name: 'Aubrac Aerostructures (démo)',
            verdict: 'Cible : recrute dans tes métiers.',
            why: [
              'Signal daté : Technicien qualité fournisseurs (2026-10-09).',
              'Personne connue : à trouver — « Trouver qui appeler ».',
            ],
            source: { label: 'Jeu de démonstration', as_of: '2026-10', basis: 'proof' },
          },
        ],
        not_evaluated: ['Budget', 'ESN déjà en place sur le périmètre'],
      }) +
      '\n\nLes entreprises hors des secteurs de ton profil (agroalimentaire, distribution) sont écartées et comptées. ' +
      'Pour Aubrac Aerostructures (démo), personne n’est encore connu : « Trouver qui appeler » prépare la recherche, rien n’est lancé sans ton clic.',
  },
  // #2392 — la clôture de fin de journée, sur les tâches de la salle (`DEMO_TASKS`).
  {
    // X37 / #3398 — la question libre du brief : la réponse nomme la relance
    // en retard que la bulle de Laura et le brief annoncent (`DEMO_TASKS`,
    // Société Générale, échéance −2 jours) — jamais une réponse générique.
    id: 'p-overdue',
    question: 'Qu’est-ce qui est en retard sur mes comptes ?',
    answer:
      'Une relance a dépassé son échéance : la relance Société Générale sur les deux profils conformité, due depuis deux jours, ' +
      'sans réponse du directeur des systèmes d’information de la filiale de services de paiement. ' +
      'Le plus utile : l’appeler plutôt que lui réécrire. Aucune autre tâche de compte n’est en retard. ' +
      'Le détail est dans [Actions](/actions).',
  },
  // X64 / #3274.4 — la règle de méthode que les résultats de la salle ont contredite :
  // cinq actions faites sans résultat sous la règle du plan hebdomadaire, sur le client
  // d'exemple (`DEMO_PLAN_TASKS`, `methodRule`) — la même donnée que le calcul réel lit.
  {
    id: 'p-method-rule',
    question: 'Pourquoi tu ne me cites plus la règle du plan de compte hebdomadaire ?',
    answer:
      'Parce que tes propres résultats la contredisent. Cinq actions posées sous la règle « plan de compte hebdomadaire » ' +
      'sont faites, sur SNCF, et aucune n’a donné de résultat : cinq sans réponse, zéro résultat positif. ' +
      'À partir de cinq issues sans aucun résultat positif, j’écarte la règle de mes citations pour ton espace — ce que tu observes l’emporte sur ce que dit la méthode. ' +
      'Un seul résultat positif sous cette règle suffirait à la rétablir. Une règle qui a moins de cinq issues n’est jamais jugée : « pas assez servi » ne veut pas dire « contredite ».',
  },
  {
    // X66 / #3284.20 — LA PROCHAINE REVUE d'un compte écarté, comme
    // `get_focus_review` la relaie (`nextReview` : date + source). Le compte
    // écarté de la salle est Société Générale (arbitrage « No-Go »), dont la
    // fiche porte une date de revue POSÉE À LA MAIN (`nextReviewAt`) : elle
    // gagne sur tout délai calculé. Aucune date devinée.
    id: 'p-next-review',
    question: 'Quand dois-je revoir ce compte écarté ?',
    answer:
      'Société Générale est écarté (arbitrage « No-Go ») : direction informatique verrouillée, grandes ESN déjà installées. ' +
      'Sa prochaine revue est le **15 octobre 2026** — une date posée à la main sur la fiche du compte, donc elle prime sur tout délai que je calculerais. ' +
      'Si aucune date n’était posée, je te le dirais plutôt que d’en inventer une. Tu peux la changer depuis la fiche du compte.',
  },
  {
    // X66 / #3284.21 — LES ÉVÈNEMENTS QUI PEUVENT RÉACTIVER (`reactivation` de
    // `get_focus_review`, tiré de `reactivationOptions`). Ce sont des
    // PROPOSITIONS : aucun n'est appliqué sans geste du commercial.
    id: 'p-reactivation',
    question: 'Qu’est-ce qui pourrait réactiver ce compte écarté ?',
    answer:
      'Deux évènements pourraient rouvrir Société Générale, et chacun reste une proposition :\n\n' +
      '- **Une réponse positive** d’un interlocuteur du compte : je proposerais de le repasser en extension.\n' +
      '- **Un signal fort** (par exemple une filiale à autonomie propre qui revient dans les échanges) : je proposerais de le repasser en volume.\n\n' +
      'Je ne rouvre rien de moi-même : tu décides depuis la fiche du compte, et le motif de sortie reste daté.',
  },
  {
    id: 'p-day-closure',
    question: 'Clôture ma journée',
    answer:
      'Voici ta clôture du jour. Deux tâches restent ouvertes — la relance Société Générale, en retard, et l’acheteur SNCF, dû aujourd’hui : ' +
      'décide-les une par une sur la carte. Rien n’est reporté d’office, et rien ne change avant ta validation.',
    pendingActions: () => [demoDayClosureAction()],
  },
  {
    // #2844 (recette prod 02/10) — le job LONG : la question exacte de la
    // recette, sa réponse et la carte « Matching massif » (`propose_long_job`).
    // Laura PROPOSE, le clic lance : la réponse dit « tâche de fond », jamais
    // « terminé », et la carte de la salle ne lance rien (`demo-long-job.ts`).
    id: 'p-long-job-matching',
    question: 'Classe-moi le vivier contre mes trois derniers besoins ouverts, en tâche de fond',
    answer:
      'Je peux classer le vivier contre trois besoins ouverts de SNCF — le socle conteneurisé du portail, la fiabilisation des flux de suivi et le parcours d’authentification — en tâche de fond : le matching tourne pendant que tu fais autre chose, et l’avancement se suit sur l’écran des besoins. ' +
      'Rien ne démarre avant ton clic sur la carte, et la carte dira « lancé » tant que le classement n’est pas rendu.',
    pendingActions: () => [demoBulkMatchingAction()],
  },
  {
    // #3950.1 (décision Louis 09/10/2026, lot G01) — LAURA PEUT LANCER
    // L'EXPORT DU VIVIER. Même doctrine que `p-long-job-matching` juste
    // au-dessus : Laura PROPOSE, le clic lance — et dans CETTE salle, le clic
    // le dit sans rien télécharger (`demo-chat-script.ts` ne porte ni compte
    // ni session authentifiée).
    id: 'p-vivier-export-ats',
    question: 'Exporte mon vivier pour l’ATS',
    answer:
      'Je peux lancer l’export ATS du vivier — le même export que le bouton de Réglages › Mes données › Exports. ' +
      'Rien ne part avant ton clic sur la carte.',
    pendingActions: (): PendingChatAction[] => [{ action: 'launch_vivier_export', mode: 'ats', cost_credits: 0 }],
  },
  {
    // #3904.1 / #3904.3 / #3904.4 (lot M05, 09/10) — LE PLAN D'ACTIONS PAR
    // GESTE (`get_action_plan`). La réponse relit le journal SEMÉ
    // (`DEMO_ACTIVITIES`, apps/api) : SNCF a répondu en dernier (répondre),
    // Groupe BPCE attend notre relance depuis 38 jours (relancer), l'appel
    // sortant à Alstom est resté sans réponse il y a 35 jours (appeler).
    // « Proche de signer » est NOMMÉ non évalué ; les sources non branchées de
    // la salle sont NOMMÉES, jamais lues « rien à faire ».
    id: 'p-action-plan',
    question: 'Fais-moi mon plan d’actions : qui je relance, qui j’appelle cette semaine ?',
    answer:
      'Voici ton plan, rangé par geste, sur les 90 derniers jours de ton journal d’échanges :\n\n' +
      '- **Répondre** — SNCF : le dernier échange vient d’eux, une réponse nous est due.\n' +
      '- **Relancer** — Groupe BPCE : notre e-mail d’il y a 38 jours est resté sans réponse.\n' +
      '- **Appeler** — Alstom : notre appel d’il y a 35 jours est tombé sur la messagerie ; on rappelle.\n' +
      '- **Contacter** — les comptes suivis sans aucune action depuis plus de 30 jours, et les personnes de ton réseau sans échange depuis six mois, avec les critères de leur score de réactivation.\n\n' +
      '« Proche de signer » n’est pas encore évalué : le rang est décidé, pas les critères qui le fondent — je ne classe aucun compte à l’instinct. ' +
      'Ce que je n’ai pas pu lire : ton CRM, ta téléphonie, ton agenda et ta messagerie ne sont pas branchés dans cette salle. ' +
      'Rien n’est envoyé ni appelé à ta place : dis-moi par lequel commencer et je prépare le message ou l’appel.',
  },
  {
    // #3869.a (lot M05, 09/10) — LA RECHERCHE ACTIVE DE NOUVELLES PERSONNES
    // sur un rôle non pourvu (`propose_people_search`). Laura PROPOSE, le clic
    // lance — et dans CETTE salle, le clic le dit sans rien lancer ni débiter
    // (`PendingActions.tsx`, `isDemo`) : une personne jamais collectée serait
    // une personne INVENTÉE (`ContactDiscoveryService.run`).
    id: 'p-people-search',
    question: 'Trouve-moi le responsable achats et le responsable data chez SNCF',
    answer:
      'Ces deux rôles sont une carte de rôles à pourvoir, pas des contacts trouvés : je ne te donne aucun nom que je n’ai pas. ' +
      'Je peux chercher de nouvelles personnes sur ces deux fonctions chez SNCF — des personnes que ton espace ne connaît pas encore. ' +
      'Celles trouvées arriveront comme contacts à vérifier (rattachement, fonction, périmètre) ; rien n’est envoyé, et la carte annonce le coût avant ton clic.',
    pendingActions: (): PendingChatAction[] => [
      {
        action: 'propose_people_search',
        account_id: 'demo-account-sncf',
        company_name: 'SNCF',
        roles: ['Responsable achats', 'Responsable data'],
        cost_credits: 1,
        credit_kind: 'enrichment',
      },
    ],
  },
  {
    // #4057 / #4058 (lot LAURA-RECHERCHE 12/10) — « interlocuteurs cyber de X » :
    // une demande ordinaire, sans TJM, volume ni horizon ; l'expertise et le
    // secteur du client restent deux champs distincts sur la carte. Le clic ne
    // lance rien en salle (même garantie que `p-people-search`).
    id: 'p-people-search-expertise',
    question: 'Donne-moi les interlocuteurs cyber GRC de SNCF, côté énergie',
    answer:
      'Je prépare directement la recherche, sans te poser de question de volume ni d’horizon. ' +
      'L’expertise cherchée est cyber / GRC ; « énergie » est le secteur du client et reste à part — il ne remplace pas la compétence. ' +
      'Les personnes trouvées arriveront comme contacts à vérifier ; rien n’est envoyé, et la carte annonce le coût avant ton clic.',
    pendingActions: (): PendingChatAction[] => [
      {
        action: 'propose_people_search',
        account_id: 'demo-account-sncf',
        company_name: 'SNCF',
        roles: [],
        expertise: 'cyber GRC',
        sector: 'énergie',
        cost_credits: 1,
        credit_kind: 'enrichment',
      },
    ],
  },
  {
    // #2433.7 (épopée #2876, lot M10 09/10) — LAURA PRÉPARE UN SIGNALEMENT DE
    // BUG depuis une capture. Laura PROPOSE, le clic envoie par le formulaire
    // de signalement — et dans CETTE salle, le clic le dit sans rien envoyer
    // (`POST /feedback` refuse aussi la démonstration).
    id: 'p-signaler-un-bug-capture',
    question: 'L’écran Comptes affiche une erreur 500 quand je clique sur Analyser, signale-le',
    answer:
      'Je prépare le signalement avec ce que tu me décris : ce que l’écran montre, et l’écran où ça se passe. ' +
      'Je ne peux pas te dire la cause côté serveur depuis une capture — elle montre un symptôme, pas un journal. ' +
      'Rien ne part avant ton clic sur la carte.',
    pendingActions: (): PendingChatAction[] => [
      {
        action: 'prepare_bug_report',
        message: 'L’écran Comptes affiche « Erreur 500 » après le clic sur « Analyser ».',
        route: '/accounts',
        cost_credits: 0,
      },
    ],
  },
  {
    // #2433.12 (épopée #2876, lot P02 09/10) — LE RECADRAGE ET LE TABLEAU d'une
    // capture. La question porte la capture semée de la salle : son aperçu
    // propose le recadrage (jamais appliqué d'office) et rend la grille lue.
    id: 'p-capture-tableau',
    question: 'Lis le tableau de cette capture',
    imageCapture: DEMO_CHAT_CAPTURE,
    answer:
      'Voici une capture d’exemple de la salle : une grille de TJM posée sur un fond. ' +
      'J’ai trouvé les bords du document — le recadrage est proposé, pas appliqué : ouvre la pièce jointe pour le voir. ' +
      'J’y lis un tableau de quatre lignes sur trois colonnes : Tech lead Java à 750 €, Développeur React à 560 €, Architecte cloud à 890 €. ' +
      'La disponibilité du Développeur React est une case vide : je n’y ai rien lu, je ne la remplis pas.',
  },
  {
    // #2770 (recette prod 02-03/10) — le plan de SEMAINE : la question exacte de la recette, sa réponse et la
    // carte « Plan de la semaine » (`propose_weekly_plan`). Laura PROPOSE : rien n'est écrit dans l'agenda,
    // chaque bloc se valide sur la carte de son jour.
    id: 'p-weekly-plan',
    question: 'Organise-moi ma semaine : trois relances avant jeudi et une revue de pipe.',
    answer:
      'Voici une semaine qui tient : les trois relances — SNCF, Société Générale et Groupe BPCE — passent avant jeudi, la revue de pipe ferme la semaine. ' +
      // #2770 — la marge et « rien n'est créé dans ton agenda » sont dits UNE fois, par la carte.
      'Tu valides chaque bloc sur la carte de son jour.',
    pendingActions: () => [demoWeeklyPlanAction()],
  },
  {
    // #2770.69 — le plan de JOURNÉE : « Organise-moi ma journée » rend la carte « Plan de la journée »
    // (`propose_focus_plan`), horodatée, sur les comptes semés. Laura PROPOSE : rien n'est écrit dans l'agenda.
    id: 'p-day-plan',
    question: 'Organise-moi ma journée',
    answer:
      'Voici une journée qui tient : d’abord les relances SNCF, Société Générale et Groupe BPCE, puis la revue de pipe, et un point d’équipe pour arbitrer les priorités. ' +
      'Tu valides chaque bloc sur la carte.',
    pendingActions: () => [demoDayPlanAction()],
  },
  {
    // #2434.56 (épopée #3579) — l'enrichissement EN MASSE : Laura annonce le PLAFOND de
    // crédits avant le clic, jamais un enrichissement fait. La carte de la salle ne
    // débite rien (`demo-bulk-enrichment.ts`).
    id: 'p-bulk-enrichment',
    question: 'Enrichis ces trois contacts d’un coup : Palmieri, Trévisani et Castex',
    answer:
      'Je peux enrichir les coordonnées de trois contacts — Pierre Palmieri (Société Générale), Laurent Trévisani et Jean Castex (SNCF) — en un seul lot. ' +
      'Je cherche leurs coordonnées auprès de nos sources d’enrichissement. ' +
      'Rien ne part avant ton clic sur la carte, et la carte dira ce qui a été trouvé, jamais plus.',
    pendingActions: () => [demoBulkEnrichmentAction()],
  },
  {
    // #3894.3 (c74 assoupli, Louis 10/10) — un message à PLUSIEURS contacts, parce que la personne
    // les a NOMMÉS. Un brouillon par destinataire, chacun validé à part ; rien n'est envoyé
    // (`demo-message-audience.ts`).
    id: 'p-message-audience',
    question: 'Prépare un message de relance pour Trévisani et Castex',
    answer:
      'Je prépare un message de relance pour les deux contacts que tu m’as nommés : Laurent Trévisani et Jean Castex (SNCF). ' +
      'Un brouillon chacun, que tu valides un par un sur les cartes. Rien n’est envoyé : tu relis, tu envoies.',
    pendingActions: () => [demoMessageAudienceAction()],
  },
  {
    // #3703 / #3704 — le cas du call : « Neutre » + luxe ne retombe PAS sur le profil ESN IT. Le
    // profil de la salle est ESN IT ; ce tour dit ce que Neutre ne lit pas, rend des cibles NOUVELLES
    // (aucune n'est dans l'espace, aucun compte créé), dit qu'il n'y en a que deux sur trois
    // demandées et propose — sans l'appliquer — l'élargissement. Jeu de démonstration, pas une
    // recherche en direct.
    id: 'p-neutral-luxe',
    question: 'En mode Neutre, trouve-moi trois maisons de luxe en Île-de-France.',
    answer:
      'En Neutre, je ne lis ni ton profil, ni ton portefeuille, ni ton CRM, ni ta boîte mail : je cherche sur tes seuls critères — maisons de luxe, Île-de-France. ' +
      'Aucun filtre sur les technologies habituelles de ton ESN, et aucune adéquation « à ton activité » n’est annoncée.\n\n' +
      replyCard({
        type: 'account_ranking',
        title: 'Maisons de luxe en Île-de-France — nouvelles cibles',
        axes: ['Secteur : luxe', 'Région : Île-de-France', 'Établissement actif au registre'],
        items: [
          {
            name: 'Maison Lumière (démo)',
            verdict: 'Nouvelle cible — pas dans ton espace, aucun compte créé.',
            // #3704.2 — recette prod 06/10 : le badge structuré (pas seulement le
            // verdict en prose) marque désormais la ligne, comme en production.
            already_in_workspace: false,
            why: ['Maroquinerie de luxe, siège à Paris.', 'Établissement actif au registre.'],
            source: { label: 'Jeu de démonstration', as_of: '2026-10' },
          },
          {
            name: 'Atelier Vendôme (démo)',
            verdict: 'Nouvelle cible — pas dans ton espace, aucun compte créé.',
            already_in_workspace: false,
            why: ['Joaillerie, établissement à Paris 1er.'],
            source: { label: 'Jeu de démonstration', as_of: '2026-10' },
          },
        ],
        not_evaluated: ['Signaux d’intention', 'Demandes actuelles connues', 'ESN déjà en place'],
      }) +
      '\n\nSeules deux entreprises sur les trois demandées répondent à ces critères : je ne complète pas avec des maisons hors cible. ' +
      'Pour en trouver une troisième, je te propose d’élargir à toute la France métropolitaine — je ne l’applique pas sans ton accord. ' +
      'Une entreprise sans besoin documenté reste proposée : l’absence de besoin connu n’est pas l’absence de potentiel.',
  },
  {
    // P05.a (#3246, lot 09/10) — « CE QUI MARCHE AILLEURS », la base anonyme
    // commune (`c92_base_anonyme_commune`). Les comptes cités sont EXACTEMENT
    // ceux que le semis de la salle laisse passer (`DEMO_SHARED_BASE_ACTION_OUTCOMES`,
    // quatre espaces FICTIFS) — `demo-shared-base-coverage.spec.ts` (API) le tient.
    // « Chez nous » : la salle ne déclare aucune issue par étape de relance.
    id: 'p-shared-base-elsewhere',
    question: 'Quelle cadence de relance marche le mieux, chez nous et ailleurs ?',
    answer:
      '**Chez nous**, je n’ai pas encore assez d’issues déclarées par étape de relance pour comparer : je ne recommande rien sur notre seule mesure.\n\n' +
      '**Ailleurs** — la base anonyme commune à tous les espaces, sans un seul nom d’ESN, de client ou de personne :\n\n' +
      '- **Relance** : 10 issues positives sur 18, sur 4 espaces.\n' +
      '- **Preuve sociale** : 8 sur 12, sur 3 espaces.\n' +
      '- **Premier message** : pas assez de données communes (moins de trois espaces) — je ne le compare pas.\n\n' +
      'Ce sont des comptes, pas une chance de succès : ce qui a marché ailleurs t’indique où regarder, sans rien promettre sur tes comptes.',
  },
  {
    // P05.b (#3246, lot 09/10) — les cas gagnés / perdus « dans la base commune »,
    // au profil EXACT du dossier Société Générale (NAF 64.19Z, 10 000 salariés et
    // plus, tête de groupe). Les comptes cités sont ceux que le semis laisse passer
    // (`DEMO_SHARED_BASE_CASE_OUTCOMES`) — `demo-shared-base-coverage.spec.ts` (API) le tient.
    id: 'p-shared-base-cases',
    question: 'Des comptes comme Société Générale, ça se gagne dans les autres espaces ?',
    answer:
      '**Dans la base commune** — les cas gagnés et perdus de tous les espaces, sans un seul nom de client :\n\n' +
      '- **Même secteur** (division NAF 64, services financiers) : 5 gagnés, 4 perdus, sur 4 espaces.\n' +
      '- **Même taille** (grande entreprise) : 4 gagnés, 3 perdus, sur 3 espaces.\n' +
      '- **Même position** (tête de groupe) : 4 gagnés, 3 perdus, sur 3 espaces.\n\n' +
      'Ce sont des comptes, pas une chance de succès, et la base ne dit pas POURQUOI ces affaires se sont perdues. ' +
      'Les cas de ton propre espace, avec leurs raisons, restent la référence pour préparer ton approche.',
  },
  {
    // P05.c (#3246, lot 09/10) — les signaux qui précèdent une affaire, « ailleurs ».
    // Les comptes cités sont ceux que le semis laisse passer
    // (`DEMO_SHARED_BASE_SIGNAL_DEALS`) — `demo-shared-base-coverage.spec.ts` (API) le tient.
    id: 'p-shared-base-signals',
    question: 'Un signal budget, ça débouche souvent sur une affaire ailleurs ?',
    answer:
      '**Dans la base commune** — tous les espaces, sans un seul nom : **4 signaux budget sur 11** ont été suivis d’une affaire ouverte sur le même compte dans les 90 jours, sur 4 espaces.\n\n' +
      'Pour les **nominations**, pas assez de données communes (moins de trois espaces) : je ne conclus rien.\n\n' +
      'C’est un compte, pas une causalité ni une chance de signer : le signal n’a pas provoqué l’affaire. Il te dit seulement que ce genre de signal mérite qu’on s’y arrête.',
  },
  {
    // #3989 (Louis 11/10/2026, c94) — les faits société de la base commune : des
    // RÔLES apportés par l'utilisateur d'un autre espace, ANONYMISÉS (le rôle,
    // jamais la personne ni l'espace). Les rôles cités sont ceux que le semis
    // laisse passer (`DEMO_SHARED_BASE_COMPANY_ROLES`) — `demo-shared-base-coverage.spec.ts` (API) le tient.
    id: 'p-shared-base-roles',
    question: 'Qu’est-ce que la base commune sait de Société Générale que je n’ai pas encore ?',
    answer:
      '**D’après la base commune** — ce que d’autres espaces ont apporté, anonymisé : chez Société Générale, il existe un poste de **Responsable achats IT** et un poste de **Directeur de la transformation digitale**, que ton dossier ne couvre pas encore.\n\n' +
      'Je n’ai pas de nom : ces rôles ont été apportés par un utilisateur, la base garde le rôle, jamais la personne ni l’espace d’où il vient.\n\n' +
      'Je peux lancer une recherche de personnes sur ces deux rôles si tu veux.',
  },
  {
    // #4286.15.c (Louis 22/10/2026, craft rule n°9) — `market_pattern` : les tendances de marché entre
    // espaces autour de Société Générale. Les comptes cités sont ceux que le semis laisse passer
    // (`DEMO_SHARED_BASE_MARKET_PATTERNS`) — `demo-shared-base-coverage.spec.ts` (API) le tient.
    id: 'p-shared-base-market-patterns',
    question: 'Qu’est-ce qui recrute autour de Société Générale, ailleurs ?',
    answer:
      '**Dans la base commune** — des recrutements repérés, comptés sans un seul nom d’espace ni de client, sur les 6 derniers mois :\n\n' +
      '- **Data et IA** — 5 recrutements dans les grandes banques d’Île-de-France, *observé dans 4 espaces*.\n' +
      '- **Cloud et DevOps** — 3 recrutements dans les grandes banques, toutes régions, *observé dans 3 espaces*.\n\n' +
      'Pour la **cybersécurité**, pas assez de données communes (moins de trois espaces) : je ne conclus rien.\n\n' +
      'C’est ce que Bellum a vu passer, pas une mesure du marché : ni un taux, ni un prix.',
  },
  {
    // #4282.13 (craft rule n°9) — le radar par technologie en salle : les MÊMES comptes, dans le
    // MÊME ordre, que le radar SAP préparé de Découvrir (`demo-technology-radar.ts`, API). Sept blocs,
    // tout fictif, aucune probabilité, aucune source nommée.
    id: 'p-technology-radar',
    question: 'Fais-moi un radar SAP France',
    answer:
      '**1. Missions plaçables maintenant**\n' +
      '• Consultant SAP FI/CO — migration S/4HANA, publiée par Cabinet Talentis (démo), Lyon, TJM affiché 680 € — client final non affiché : la cible est le publieur.\n' +
      '• Chef de projet SAP SD, Cabinet Talentis (démo), Paris — TJM non affiché.\n' +
      '• Architecte SAP S/4HANA, Aubrac Aerostructures (démo), Toulouse.\n\n' +
      '**2. Comptes les plus chauds**\n' +
      '• Rang 3 · Cévennes Défense Systèmes (démo) — programme « Migration SAP ECC vers S/4HANA (RISE) », appel d’offres ouvert.\n\n' +
      '**3. Routes de rang 2**\n' +
      '• Rang 4 · Intégrateur Causses (démo) — titulaire du lot 2 AMOA SAP S/4 : c’est lui qui a besoin de capacité.\n\n' +
      '**4. Besoins historiques**\n' +
      '• Groupe Aurélys (démo) — Consultant SAP MM, gagné, TJM observé 650 €, prescripteur DSI adjointe.\n' +
      '• Marenval Financement (démo) — Chef de projet S/4HANA Finance, perdu.\n\n' +
      '**5. Relais et prescripteurs**\n' +
      '• Claire Fontanel (démo), DSI adjointe chez Groupe Aurélys — vue il y a deux mois.\n' +
      '• Hugo Lestrade (démo), DAF chez Marenval Financement — à revalider.\n\n' +
      '**6. Empreinte par compte**\n' +
      '• Groupe Aurélys (démo) : 14 profils observés ; Aubrac Aerostructures (démo) : 6. Ce sont des profils observés, pas des missions ouvertes.\n\n' +
      '**7. Classement en trois poches**\n' +
      '• Placement immédiat : Rang 1 Cabinet Talentis (démo), Rang 2 Aubrac Aerostructures (démo).\n' +
      '• Programmes nommés : Rang 3 Cévennes Défense Systèmes (démo).\n' +
      '• Rang 2 pré-identifié : Rang 4 Intégrateur Causses (démo).\n\n' +
      'Le même radar, dans le même ordre, est dans [Découvrir](/discover/radar?technology=SAP).',
  },
  {
    // #4294.9 (craft rule n°9) — « qu'a-t-on déjà fait chez X ? » en salle : la synthèse CALCULÉE
    // d'abord (`needs_summary`), puis une ligne datée par besoin. Mêmes trois besoins, dont un gagné il
    // y a 14 mois, que la carte Découvrir de Cévennes (`demo-scripts.ts`). Tout fictif, aucune
    // probabilité, aucune source nommée ; un prescripteur vu il y a plus d'un an se dit « à revalider ».
    id: 'p-historical-needs-account',
    question: 'Qu’a-t-on déjà fait chez Cévennes Défense Systèmes ?',
    answer:
      '**Synthèse** : 3 besoins observés sur Cévennes Défense Systèmes (démo) — 1 gagné, 1 terminé, 1 perdu ; le plus récent il y a 14 mois ; TJM observé 700 €.\n\n' +
      '**Besoins passés**\n' +
      '• Consultant ServiceNow ITSM — gagné, il y a 14 mois, TJM observé 700 €, prescripteur Sabine Arlès (démo), responsable outillage IT — à revalider (vue il y a 14 mois).\n' +
      '• Chef de projet MCO applicatif — terminé, il y a 2 ans.\n' +
      '• Data engineer Snowflake — perdu, il y a 3 ans.\n\n' +
      'Ce sont des faits PASSÉS : ils prouvent que ce compte a déjà acheté ces compétences, pas qu’un besoin est ouvert aujourd’hui. ' +
      'Angle : le besoin ServiceNow gagné est ta preuve datée ; le besoin perdu est une objection à préparer. ' +
      'Interlocuteur : revalide Sabine Arlès avant de la citer comme relais.',
  },
]

/**
 * Une carte de réponse, écrite exactement comme Laura l'écrit : un bloc JSON
 * entre deux clôtures `bellum-block` (contrat `reply-blocks.ts`). Rien ne la
 * valide à l'exécution — `demo-turn.test.ts` le fait.
 */
function replyCard(block: Record<string, unknown>): string {
  return ['```bellum-block', JSON.stringify(block), '```'].join('\n')
}

/**
 * #4069.4 (recette R6 14/10) — « QUE SAIS-TU DE DATÉ SUR CE COMPTE ? », sur Renault, EDF, Airbus
 * ou Thales (les QUATRE comptes analysés, Louis 12/10/2026).
 *
 * Ces quatre dossiers portent une vraie analyse de production (`apps/api/.../analysed-accounts/
 * *.json`, `recent_signals` à dates réelles), mais aucune amorce de `DEMO_CHAT_PROMPTS` ne les
 * nomme : une question LIBRE posée sur l'un d'eux ne correspondait à rien et tombait sur le texte
 * générique « choisis une des questions proposées » (0 fait), alors que le dossier en porte.
 *
 * La question est GÉNÉRIQUE (« ce compte », jamais « Renault ») : sans le nom du compte ouvert,
 * le moteur ne peut pas savoir lequel des quatre documenter — `demoTurn` reçoit donc le nom du
 * compte actif (`selectedAccountName`, déjà résolu côté écran, aucun appel réseau neuf).
 *
 * Les faits ci-dessous sont COPIÉS du JSON semé, jamais recalculés ni inventés — même date, même
 * nature — à l'exclusion des offres de STAGE (#4044 : semées, jamais servies) ; la source n'est
 * jamais nommée (doctrine).
 */
export const DEMO_DATED_FACTS_BY_ACCOUNT: Readonly<Record<string, string>> = {
  Renault:
    'Trois faits datés sur ce dossier :\n\n' +
    '• un partenariat avec EDF sur la recharge de véhicules électriques, annoncé le 8 octobre 2026 ;\n' +
    '• le plan stratégique « futuREady », lancé en mars 2026, avec un axe dédié à l’accélération de l’innovation ;\n' +
    '• un recrutement Buyer ADAS (H/F), publié le 11 octobre 2026.\n\n' +
    'Chaque fait porte sa date ; ce qui n’en a pas n’est pas écrit.',
  EDF:
    'Trois faits datés sur ce dossier :\n\n' +
    '• un partenariat avec Renault Group sur la recharge de véhicules électriques, annoncé le 8 octobre 2026 ;\n' +
    '• une participation à un projet de centrale solaire de 240 MW dans l’État de New York, le 28 septembre 2026 ;\n' +
    '• une stratégie de campus de centres de données haute puissance, initiée en 2025.\n\n' +
    'Chaque fait porte sa date ; ce qui n’en a pas n’est pas écrit.',
  Airbus:
    'Deux faits datés sur ce dossier :\n\n' +
    '• le premier vol européen du drone de combat U740 Valkyrie, avec Kratos, le 12 octobre 2026 ;\n' +
    '• le lancement de l’Airbus Tech Hub au Canada, le 20 mai 2026.\n\n' +
    'Chaque fait porte sa date ; ce qui n’en a pas n’est pas écrit.',
  Thales:
    'Deux faits datés sur ce dossier :\n\n' +
    '• l’ouverture annoncée d’une base de maintenance militaire au Japon, le 12 octobre 2026 ;\n' +
    '• un contrat de 26,1 millions d’euros avec l’Agence spatiale européenne (Thales Alenia Space), le 5 mai 2026.\n\n' +
    'Chaque fait porte sa date ; ce qui n’en a pas n’est pas écrit.',
}

/** Les formulations EXACTES (normalisées comme `DEMO_CHAT_PROMPTS`) qui déclenchent la réponse ci-dessus. */
export const DEMO_DATED_FACTS_QUESTIONS: readonly string[] = [
  'Que sais-tu de daté sur ce compte ?',
  'Quels faits datés as-tu sur ce compte ?',
  'What dated facts do you have on this account?',
]
