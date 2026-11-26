import {
  ACTIONABLE_RENEWAL_WINDOWS,
  BLOCKER_ACTIONS,
  craStatusOf,
  isInvoicedState,
  type InvoiceBlocker,
  type InvoiceReadiness,
  type MissionStatus,
  type RenewalWindow,
} from '@bellum/contracts'
import { derivePaymentStatus } from '@/features/mission-tracking/derive'

/**
 * LA CHAÎNE DE LA SIGNATURE AU CASH — #2199.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Les cinq écrans de la chaîne existent tous — les relevés (`/missions/cra`),
 * la facturation (`/missions/facturation`), les encaissements
 * (`/missions/encaissements`) et le Reverse Market d'un consultant
 * (`/consultants/$id/reverse-market`). **Rien ne les reliait.** Le dossier
 * d'une mission montrait son entête, son parcours générique et cinq onglets,
 * et ne répondait à aucune des trois questions qu'on se pose en l'ouvrant : où
 * en est cette mission, qu'est-ce qui la bloque, où je clique pour agir.
 *
 * C'est le motif que `agent_docs/chantiers-livres.md` répète à chaque
 * chantier : du code juste, calculé, testé, que personne n'appelle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUNE DÉRIVATION NEUVE (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce fichier ne recalcule NI un bloqueur de facturation, NI un retard
 * d'encaissement, NI une fenêtre de renouvellement. Les trois vivent déjà
 * ailleurs et y restent :
 *
 *  - `craStatusOf` (contracts) répartit les six codes `timesheet_*` ;
 *  - `derivePaymentStatus` (`mission-tracking/derive.ts`) compose l'état
 *    d'encaissement — lui-même bâti sur `collectionStatus` de
 *    `features/missions/collections` ;
 *  - `mission.renewal` est calculé par le SERVEUR (`delivery.service.ts`) avec
 *    l'échelle de renouvellement de l'ESPACE, et n'est jamais recalculé ici
 *    depuis `ends_on` — le refaire ignorerait ce réglage, et deux écrans
 *    annonceraient deux échéances.
 *
 * Ce que ce fichier ajoute est la COMPOSITION : cinq étapes, leur position,
 * leur motif de blocage NOMMÉ et leur destination. Deux chemins qui referaient
 * l'un de ces trois calculs divergeraient au premier ajout — c'est exactement
 * l'objection que la grande table de `/missions/suivi` a déjà tranchée, et la
 * réponse y était la même : composer, jamais recalculer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUN TAUX, AUCUN POURCENTAGE D'AVANCEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * La chaîne montre des ÉTAPES franchies ou non. « 3 étapes sur 5 » serait un
 * taux de complétude de NOS données déguisé en avancement d'une mission, et
 * « 60 % » se lirait comme une probabilité — refusée six fois dans ce dépôt
 * (`c26_probabilite`). Rien ici ne rend un nombre, et un test le garde.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ « NON MESURÉ » N'EST NI « 0 » NI « FAIT »
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est le défaut le plus probable de cet écran, et il a un sens privilégié :
 * une étape dont on n'a pas la donnée ressemble beaucoup à une étape franchie.
 * Cinq états distincts, jamais repliés l'un sur l'autre :
 *
 *  - `done` — un FAIT positif est là (relevé validé, mois facturé, paiement
 *    enregistré) ;
 *  - `blocked` — un motif NOMMÉ empêche d'avancer ;
 *  - `pending` — rien ne bloque, l'étape n'est simplement pas franchie, et on
 *    sait pourquoi ;
 *  - `not_applicable` — la question ne se pose pas sur cette mission (un
 *    forfait n'a pas de relevé mensuel) ;
 *  - `not_measured` — on n'a pas la donnée, et la RAISON est nommée.
 *
 * `not_applicable` et `not_measured` ne se confondent jamais : la première ne
 * se répare pas, la seconde se répare en allant regarder.
 */

/**
 * LES CINQ ÉTAPES, dans l'ordre de la chaîne.
 *
 * ⚠️ Une valeur ajoutée ici l'est EN FIN (GA-08) — le rang d'une étape est lu
 * par la bande, et en déplacer une au milieu réordonnerait l'écran sans
 * qu'aucun test ne bouge.
 */
export const MISSION_CHAIN_STEPS = ['timesheet', 'billable', 'invoice', 'collection', 'reposition'] as const
/** ⚠️ NON exporté : il n'est consommé que dans ce fichier (règle « ne jamais
 *  exporter un type consommé nulle part ailleurs », `pnpm lint:exports:types`).
 *  Les autres fichiers nomment les étapes par `MISSION_CHAIN_STEPS`. */
type MissionChainStep = (typeof MISSION_CHAIN_STEPS)[number]

/**
 * #2421.2 — SEPT états. Les cinq d'origine gardent leur rang ; `not_due` (le
 * moment de l'étape n'est pas venu — l'échéance est à venir, la période n'est
 * pas finie) et `in_progress` (l'étape a commencé sans être franchie — un
 * paiement partiel, une période qu'on est en train de délivrer) sont ajoutés
 * EN FIN (GA-08). Correspondance avec la demande : non due = `not_due`, attendue
 * = `pending`, en cours = `in_progress`, terminée = `done`, bloquée = `blocked`,
 * non applicable = `not_applicable`, inconnue = `not_measured`.
 *
 * ⚠️ `not_due` n'est pas `not_applicable` : la première viendra, la seconde ne
 * se posera jamais. Les cinq maillons de la bande n'emploient toujours que les
 * cinq premiers ; les deux derniers ne servent qu'à la timeline détaillée.
 */
export const MISSION_CHAIN_STATES = [
  'done',
  'pending',
  'blocked',
  'not_applicable',
  'not_measured',
  'not_due',
  'in_progress',
] as const
export type MissionChainState = (typeof MISSION_CHAIN_STATES)[number]

/** Une destination : un chemin RÉEL de l'application, et le paramètre qu'il
 *  attend. La garde GA-351 les confronte à `routeTree.gen.ts`. */
type ChainDestination = { route: string; param?: 'id' }

/**
 * OÙ CHAQUE ÉTAPE SE RÉPARE — l'écran qui existe DÉJÀ, jamais un écran neuf.
 *
 * ⚠️ `billable` et `invoice` partagent `/missions/facturation`, et c'est exact :
 * `InvoicingPage` monte `InvoiceReadinessPanel`, qui porte les deux gestes (ce
 * qui est prêt à facturer, et « marquer comme facturé »). Leur donner deux
 * routes en inventerait une.
 *
 * ⚠️ Aucun de ces quatre écrans n'accepte aujourd'hui de PRÉSÉLECTION par
 * mission : `routes/missions/cra.tsx`, `facturation.tsx` et `encaissements.tsx`
 * ne déclarent aucun `validateSearch`, et les trois composants ne prennent
 * aucun identifiant de mission en propriété (mesuré le 16/09/2026). Le lien
 * mène donc à l'écran, pas à la ligne — et c'est pour cela que la bande NOMME
 * le motif : le lecteur sait ce qu'il cherche en arrivant.
 */
export const MISSION_CHAIN_DESTINATIONS: Readonly<Record<MissionChainStep, ChainDestination>> = {
  timesheet: { route: '/missions/cra' },
  billable: { route: '/missions/facturation' },
  invoice: { route: '/missions/facturation' },
  collection: { route: '/missions/encaissements' },
  reposition: { route: '/consultants/$id/reverse-market', param: 'id' },
}

/**
 * Un maillon rendu : sa position, ce qui la bloque, et où cliquer.
 *
 * `blocker` porte le motif NOMMÉ — jamais un compte. « CRA de septembre non
 * validé » est une phrase qu'on peut aller réparer ; « 1 blocage » envoie
 * ouvrir trois écrans pour savoir lequel, et on ne le fait pas.
 */
export type MissionChainLink = {
  step: MissionChainStep
  state: MissionChainState
  /** Le bloqueur de facturation, quand c'en est un. `null` sinon — un litige ou
   *  un retard de paiement N'EST PAS un `InvoiceBlocker`, et lui en fabriquer
   *  un ferait entrer une valeur que la contrainte SQL ne couvre pas. */
  blocker: InvoiceBlocker | null
  /** Pourquoi cette étape est où elle est, quand aucun bloqueur ne le dit.
   *  Suffixe de clé i18n (`chain.why.<reasonKey>`), jamais une phrase en dur. */
  reasonKey: string | null
  /**
   * LE GESTE QUI LÈVE LE BLOCAGE — #2199.13, .14.
   *
   * ⚠️ Il est LU dans `BLOCKER_ACTIONS`, la table qui le déclare déjà pour sept
   * écrans du dépôt : jamais recopié ici. Il répond à « quoi faire » et,
   * accessoirement, à « qui » — « relancer le consultant » et « relancer le
   * client » ne désignent pas la même main.
   *
   * ⚠️ Et c'est TOUT ce que le dépôt sait de la propriété d'une étape : aucune
   * colonne ne porte un « responsable d'étape », et en inventer un serait une
   * donnée fictive. `null` quand aucun bloqueur ne nomme de geste.
   */
  actionKey: string | null
  /** `null` = aucune porte. Jamais une route devinée : un lien mort est pire
   *  qu'un motif sans lien — le premier fait douter du produit entier. */
  route: string | null
  params: Readonly<Record<string, string>>
}

/** Ce que la chaîne a besoin de savoir — jamais les entités complètes. */
export type MissionChainInput = {
  /**
   * `renewal` est l'identifiant de position calculé par le serveur.
   * ABSENT (`undefined`) = une API plus ancienne que ce code — le web se
   * déploie une dizaine de minutes avant l'API, mesuré le 04/09/2026 sur un
   * autre champ de cette même ligne. L'étape dit alors « non mesuré », jamais
   * « trop tôt ».
   */
  mission: {
    renewal?: RenewalWindow
    /* #2421 — ce que la timeline détaillée lit de la mission. Tous OPTIONNELS :
     * la bande des cinq maillons n'en a pas besoin, et une API plus ancienne
     * rend « non mesuré », jamais une étape devinée. */
    status?: MissionStatus
    created_at?: string
    started_on?: string | null
    ends_on?: string | null
    stage_entered_at?: string | null
    /** Le porteur, résolu en nom par le serveur. `null` = AUCUN porteur (une
     *  exception) ; `undefined` = non lu (API plus ancienne) — jamais confondus. */
    ownerName?: string | null
  }
  /** La ligne de facturation du mois lu. `undefined` = aucune ligne sur ce mois
   *  pour cette mission. */
  readiness: InvoiceReadiness | undefined
  /**
   * `false` quand la lecture du mois n'a pas abouti (erreur, chargement).
   * Sans ce drapeau, « la requête a échoué » et « ce mois ne couvre pas la
   * mission » rendraient le même vide : c'est la cause racine « cassé et non
   * mesurable se ressemblent », et elle se paie ici en « rien à faire » sur une
   * mission qui brûle.
   */
  readinessKnown: boolean
  /** L'identité du consultant à repositionner. `null` = aucune affectation, ou
   *  une affectation SANS identité (forme d'avant le 04/09/2026) : on n'ouvre
   *  pas la fiche d'un homonyme deviné. */
  consultantId: string | null
  /** #2421.6 — le NOM du consultant affecté, responsable de sa période et de
   *  son relevé. `null` = personne d'affecté ; absent = non fourni. */
  consultantName?: string | null
  now: Date
}

/** Les six codes `timesheet_*` — ceux dont l'étape CRA répond, et qui ne
 *  doivent donc PAS être re-nommés par l'étape suivante (loi 4 du tome 7 :
 *  rien n'apparaît deux fois sous la même forme avec le même contenu). */
const TIMESHEET_BLOCKERS: ReadonlySet<InvoiceBlocker> = new Set([
  'missing_timesheet',
  'timesheet_not_submitted',
  'timesheet_not_validated',
  'timesheet_disputed',
  'timesheet_anomalies',
  'timesheet_rejected',
])

function destinationOf(
  step: MissionChainStep,
  consultantId: string | null,
): Pick<MissionChainLink, 'route' | 'params'> {
  const destination = MISSION_CHAIN_DESTINATIONS[step]
  if (!destination.param) return { route: destination.route, params: {} }
  // ⚠️ Un paramètre attendu et non fourni ne se devine pas : sans lui, le lien
  // pointerait sur une URL littérale contenant « $id ». Pas de porte, alors.
  if (!consultantId) return { route: null, params: {} }
  return { route: destination.route, params: { id: consultantId } }
}

function link(
  step: MissionChainStep,
  state: MissionChainState,
  detail: { blocker?: InvoiceBlocker | null; reasonKey?: string | null; consultantId?: string | null },
): MissionChainLink {
  const blocker = detail.blocker ?? null
  return {
    step,
    state,
    blocker,
    reasonKey: detail.reasonKey ?? null,
    actionKey: blocker ? (BLOCKER_ACTIONS[blocker]?.action ?? null) : null,
    // ⚠️ Un bloqueur inconnu de `BLOCKER_ACTIONS` n'ouvre AUCUNE porte — même
    // vérification que `deriveNextAction`, et pour la même raison : une valeur
    // ajoutée à la taxonomie sans son geste ne doit pas produire un lien qui ne
    // répare rien.
    ...(blocker && !BLOCKER_ACTIONS[blocker]
      ? { route: null, params: {} }
      : destinationOf(step, detail.consultantId ?? null)),
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Les cinq étapes                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

function timesheetLink(input: MissionChainInput): MissionChainLink {
  if (!input.readinessKnown) return link('timesheet', 'not_measured', { reasonKey: 'readingFailed' })
  if (!input.readiness) return link('timesheet', 'not_measured', { reasonKey: 'noRowThisMonth' })
  const status = craStatusOf(input.readiness)
  // `null` = mois non dû (forfait, jalon) : lui prêter un statut de relevé —
  // même « validé » — répondrait à une question qui ne se pose pas.
  if (status === null) return link('timesheet', 'not_applicable', { reasonKey: 'notMonthly' })
  if (status === 'validated') return link('timesheet', 'done', {})
  const blocker = input.readiness.blockers.find(candidate => TIMESHEET_BLOCKERS.has(candidate)) ?? null
  return link('timesheet', 'blocked', { blocker, reasonKey: blocker ? null : 'craBlockedWithoutCode' })
}

function billableLink(input: MissionChainInput): MissionChainLink {
  if (!input.readinessKnown) return link('billable', 'not_measured', { reasonKey: 'readingFailed' })
  if (!input.readiness) return link('billable', 'not_measured', { reasonKey: 'noRowThisMonth' })
  const { state, blockers } = input.readiness
  if (state === 'not_due') return link('billable', 'not_applicable', { reasonKey: 'notMonthly' })
  // #2197.41 — un DÉCLARÉ a franchi l'étape « facturable » comme un PROUVÉ.
  if (state === 'ready' || isInvoicedState(state)) return link('billable', 'done', {})
  // ⚠️ Quand les SEULS bloqueurs sont des relevés, l'étape précédente les nomme
  // déjà : les redire ici afficherait deux fois la même cause sous deux
  // libellés, et le lecteur chercherait deux réparations pour une seule.
  const ownBlocker = blockers.find(candidate => !TIMESHEET_BLOCKERS.has(candidate)) ?? null
  if (!ownBlocker) return link('billable', 'pending', { reasonKey: 'waitingOnTimesheet' })
  return link('billable', 'blocked', { blocker: ownBlocker })
}

function invoiceLink(input: MissionChainInput): MissionChainLink {
  if (!input.readinessKnown) return link('invoice', 'not_measured', { reasonKey: 'readingFailed' })
  if (!input.readiness) return link('invoice', 'not_measured', { reasonKey: 'noRowThisMonth' })
  const row = input.readiness
  if (row.state === 'not_due') return link('invoice', 'not_applicable', { reasonKey: 'notMonthly' })
  // ⚠️ `invoicedAt` et non `state === 'invoiced'` : c'est la DATE qui est le
  // fait. Bellum n'émet aucune facture, elle consigne qu'une facture est partie
  // ailleurs — et le jour où les deux divergeront, c'est la date qu'il faudra
  // croire.
  if (row.invoicedAt !== null) return link('invoice', 'done', {})
  if (row.state === 'ready') return link('invoice', 'pending', { reasonKey: 'readyToInvoice' })
  return link('invoice', 'pending', { reasonKey: 'waitingOnBillable' })
}

function collectionLink(input: MissionChainInput): MissionChainLink {
  if (!input.readinessKnown) return link('collection', 'not_measured', { reasonKey: 'readingFailed' })
  // `derivePaymentStatus` est la dérivation de `/missions/encaissements` et de
  // `/missions/suivi`. En écrire une troisième ferait dire à trois écrans trois
  // choses du même retard.
  const status = derivePaymentStatus(input.readiness, input.now)
  switch (status) {
    case 'paid':
      return link('collection', 'done', {})
    case 'disputed':
      return link('collection', 'blocked', { reasonKey: 'disputed' })
    case 'overdue':
      return link('collection', 'blocked', { reasonKey: 'overdue' })
    case 'pending':
      return link('collection', 'pending', { reasonKey: 'awaitingPayment' })
    case 'not_invoiced':
      // « Pas encore facturé » est un FAIT dont on connaît parfaitement la
      // cause : la facture n'est pas partie. Le rendre « non mesuré » serait la
      // cause racine « cassé et non mesurable se ressemblent », à l'envers.
      return link('collection', 'pending', { reasonKey: 'notInvoicedYet' })
    case 'not_applicable':
      return link('collection', 'not_applicable', { reasonKey: 'notMonthly' })
    case 'unknown':
      return link('collection', 'not_measured', { reasonKey: 'noRowThisMonth' })
  }
}

/**
 * LE REPOSITIONNEMENT — la cinquième étape, et la seule qui ne se conclut
 * JAMAIS « fait ».
 *
 * ⚠️ Aucune donnée de ce dépôt ne dit qu'un consultant A ÉTÉ repositionné : le
 * Reverse Market propose des besoins, il n'enregistre pas un placement. Écrire
 * « fait » serait conclure d'un silence — exactement le défaut que la doctrine
 * refuse, pris à l'envers. L'étape dit donc « c'est le moment » ou « pas
 * encore », et jamais qu'elle est derrière nous.
 */
function repositionLink(input: MissionChainInput): MissionChainLink {
  const window = input.mission.renewal
  const consultantId = input.consultantId
  if (window === undefined) return link('reposition', 'not_measured', { reasonKey: 'noRenewalWindow', consultantId })
  // `unknown` = la mission n'a pas de date de fin. On ne sait pas quand elle
  // s'arrête, donc pas quand repositionner — ce n'est pas « jamais ».
  if (window === 'unknown') return link('reposition', 'not_measured', { reasonKey: 'noEndDate', consultantId })
  if (!ACTIONABLE_RENEWAL_WINDOWS.includes(window)) {
    return link('reposition', 'not_applicable', { reasonKey: 'tooEarly', consultantId })
  }
  return link('reposition', 'pending', { reasonKey: `window.${window}`, consultantId })
}

/**
 * LA CHAÎNE — un maillon par étape, TOUJOURS les cinq, dans l'ordre.
 *
 * ⚠️ Elle ne saute jamais une étape, même non mesurable : une chaîne à quatre
 * maillons se lit « il n'y a que quatre étapes », et l'étape absente est
 * justement celle dont personne ne s'occupe.
 */
export function deriveMissionChain(input: MissionChainInput): MissionChainLink[] {
  return [timesheetLink(input), billableLink(input), invoiceLink(input), collectionLink(input), repositionLink(input)]
}

/**
 * LES ÉTAPES QUE LA CHAÎNE NE REND PAS — le détecteur de la garde GA-351.
 *
 * Il vit ICI, à côté de la taxonomie qu'il compare, plutôt que dans le fichier
 * de la garde : une garde qui recopierait la liste des cinq étapes resterait
 * verte le jour où une sixième naîtrait sans être rendue.
 */
export function missingChainSteps(links: readonly MissionChainLink[]): MissionChainStep[] {
  const rendered = new Set(links.map(item => item.step))
  return MISSION_CHAIN_STEPS.filter(step => !rendered.has(step))
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  #2421 — LA TIMELINE MISSION-TO-CASH : quatorze étapes SOUS les cinq      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * LES QUATORZE ÉTAPES — #2421.1, de la mission créée à la période clôturée.
 *
 * ⚠️ CE N'EST PAS UNE DEUXIÈME CHAÎNE (GA-26, décision Louis 22/09 soir §3 :
 * étendre ce fichier, jamais une seconde chaîne). Chaque étape est rattachée à
 * UN des cinq maillons (`MISSION_TO_CASH_PARENT`) — ou au dossier lui-même pour
 * les trois étapes de la mission — et se DÉRIVE des mêmes calculs que la bande :
 * `craStatusOf`, `derivePaymentStatus`, et les dates déjà portées par la ligne
 * de facturation. Aucun bloqueur, aucun retard, aucune fenêtre n'est recalculé.
 *
 * ⚠️ Deux étapes restent HONNÊTEMENT inconnues, et c'est voulu :
 *  - `invoice_sent` — Bellum PRÉPARE, il n'émet ni n'envoie aucune facture
 *    (doctrine « BellumAI SUIT le financier, il ne COMPTABILISE pas ») : il ne
 *    voit pas l'envoi. L'écrire « fait » depuis une date de facturation serait
 *    conclure d'un silence ;
 *  - `payment_reconciled` — « Bellum ne rapproche aucun compte bancaire »
 *    (`invoice-readiness.service.ts`) : un paiement consigné n'est pas un
 *    paiement rapproché.
 *
 * Une valeur ajoutée ici l'est EN FIN (GA-08).
 */
export const MISSION_TO_CASH_STAGES = [
  'mission_created',
  'mission_ready',
  'mission_active',
  'period_delivered',
  'timesheet_submitted',
  'timesheet_validated',
  'billable_computed',
  'invoice_prepared',
  'invoice_created',
  'invoice_sent',
  'invoice_due',
  'payment_received',
  'payment_reconciled',
  'period_closed',
] as const
type MissionToCashStageName = (typeof MISSION_TO_CASH_STAGES)[number]

/** Le maillon de la bande dont chaque étape est le DÉTAIL — et donc l'écran qui
 *  la répare. `null` = l'étape se lit dans le dossier lui-même. */
const MISSION_TO_CASH_PARENT: Readonly<Record<MissionToCashStageName, MissionChainStep | null>> = {
  mission_created: null,
  mission_ready: null,
  mission_active: null,
  period_delivered: 'timesheet',
  timesheet_submitted: 'timesheet',
  timesheet_validated: 'timesheet',
  billable_computed: 'billable',
  invoice_prepared: 'invoice',
  invoice_created: 'invoice',
  invoice_sent: 'invoice',
  invoice_due: 'collection',
  payment_received: 'collection',
  payment_reconciled: 'collection',
  period_closed: 'collection',
}

type MissionToCashOwnerRule = 'mission_owner' | 'consultant'

/**
 * #2421.6 — LA RÈGLE D'ATTRIBUTION de chaque étape (« un responsable OU une
 * règle d'attribution », dit l'issue).
 *
 * ⚠️ Une RÈGLE, jamais une personne inventée : le seul porteur que le dépôt
 * connaît est `missions.owner_id` (le chargé d'affaires, résolu en nom par le
 * serveur), et le seul consultant est celui de l'affectation. La période et le
 * relevé reviennent au consultant ; tout le reste — y compris relancer le
 * client pour une validation ou un paiement — revient au porteur, la main qui
 * agit côté ESN. Quand la règle ne résout AUCUN nom, l'étape ouverte devient une
 * EXCEPTION : c'est ce que l'issue demande, et c'est le contraire de deviner.
 */
const MISSION_TO_CASH_OWNER_RULE: Readonly<Record<MissionToCashStageName, MissionToCashOwnerRule>> = {
  mission_created: 'mission_owner',
  mission_ready: 'mission_owner',
  mission_active: 'mission_owner',
  period_delivered: 'consultant',
  timesheet_submitted: 'consultant',
  timesheet_validated: 'mission_owner',
  billable_computed: 'mission_owner',
  invoice_prepared: 'mission_owner',
  invoice_created: 'mission_owner',
  invoice_sent: 'mission_owner',
  invoice_due: 'mission_owner',
  payment_received: 'mission_owner',
  payment_reconciled: 'mission_owner',
  period_closed: 'mission_owner',
}

/**
 * #2421.3 — LA PREUVE d'une étape : le FAIT qui l'a fait avancer, daté, avec sa
 * source quand elle compte (c80 : « facturé » se garde, sa SOURCE se nomme —
 * prouvée par le connecteur OU déclarée par quelqu'un, jamais confondues).
 * `key` est un suffixe de clé i18n (`chain.proof.<key>`).
 */
type MissionToCashProof = {
  key: string
  at: string | null
  by?: string | null
  reference?: string | null
  amountCents?: number | null
}

export type MissionToCashStage = Omit<MissionChainLink, 'step'> & {
  stage: MissionToCashStageName
  /** Le maillon de la bande dont l'étape est le détail ; `null` = le dossier. */
  step: MissionChainStep | null
  /** #2421.6 — la règle, et le nom qu'elle résout. `name: null` = la règle ne
   *  résout personne ; `undefined` = le porteur n'a pas été lu. */
  owner: { rule: MissionToCashOwnerRule; name: string | null | undefined }
  /** #2421.3 — DEPUIS QUAND l'étape est dans cet état (`YYYY-MM-DD` ou ISO).
   *  `null` = aucune date connue — jamais « 0 jour ». */
  since: string | null
  proof: MissionToCashProof | null
  /** #2421.6/.7 — l'étape relève de l'exception : bloquée, ou ouverte sans
   *  responsable. */
  exception: boolean
}

/** Les états où il reste quelque chose à FAIRE sur l'étape. */
const OPEN_STATES: ReadonlySet<MissionChainState> = new Set(['pending', 'in_progress', 'blocked'])

type StageDetail = {
  blocker?: InvoiceBlocker | null
  reasonKey?: string | null
  since?: string | null
  proof?: MissionToCashProof | null
}

/** La fin de la période lue — le premier jour du mois suivant, `YYYY-MM-DD`. */
function periodEndOf(periodMonth: string): string {
  const [year, month] = periodMonth.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(year ?? 1970, month ?? 1, 1)).toISOString().slice(0, 10)
}

function stageOf(
  input: MissionChainInput,
  stage: MissionToCashStageName,
  state: MissionChainState,
  detail: StageDetail = {},
): MissionToCashStage {
  const parent = MISSION_TO_CASH_PARENT[stage]
  // La porte, le geste et le motif se lisent par `link` — la même fabrique que
  // les cinq maillons : un bloqueur sans geste n'ouvre aucune porte, ici aussi.
  const reason = { blocker: detail.blocker, reasonKey: detail.reasonKey, consultantId: input.consultantId }
  const base = parent ? link(parent, state, reason) : { ...link('timesheet', state, reason), route: null, params: {} }
  const rule = MISSION_TO_CASH_OWNER_RULE[stage]
  const name = rule === 'consultant' ? input.consultantName : input.mission.ownerName
  return {
    ...base,
    stage,
    step: parent,
    owner: { rule, name },
    since: detail.since ?? null,
    proof: detail.proof ?? null,
    // #2421.6 — « une étape sans owner devient une exception ». `undefined`
    // (non lu) n'accuse personne : une API plus ancienne n'est pas un trou.
    exception: state === 'blocked' || (OPEN_STATES.has(state) && name === null),
  }
}

function missionStages(input: MissionChainInput): MissionToCashStage[] {
  const { mission } = input
  const created =
    mission.created_at === undefined
      ? stageOf(input, 'mission_created', 'not_measured', { reasonKey: 'missionNotRead' })
      : stageOf(input, 'mission_created', 'done', {
          since: mission.created_at,
          proof: { key: 'created', at: mission.created_at },
        })
  const status = mission.status
  if (status === undefined) {
    return [
      created,
      stageOf(input, 'mission_ready', 'not_measured', { reasonKey: 'missionNotRead' }),
      stageOf(input, 'mission_active', 'not_measured', { reasonKey: 'missionNotRead' }),
    ]
  }
  const entered = mission.stage_entered_at ?? null
  if (status === 'onboarding') {
    return [
      created,
      stageOf(input, 'mission_ready', 'in_progress', { reasonKey: 'onboarding', since: entered }),
      stageOf(input, 'mission_active', 'not_due', { reasonKey: 'notStartedYet' }),
    ]
  }
  const startProof: MissionToCashProof = mission.started_on
    ? { key: 'startedOn', at: mission.started_on }
    : { key: 'missionStatus', at: entered }
  const startedSince = mission.started_on ?? entered
  const ready = stageOf(input, 'mission_ready', 'done', { since: startedSince, proof: startProof })
  // Une mission suspendue est BLOQUÉE, nommément : sa facturation s'arrête avec elle.
  const active =
    status === 'paused'
      ? stageOf(input, 'mission_active', 'blocked', { reasonKey: 'paused', since: entered })
      : stageOf(input, 'mission_active', 'done', { since: startedSince, proof: startProof })
  return [created, ready, active]
}

/** Les onze étapes du MOIS lu, quand on ne sait rien du mois. */
function unknownMonthStages(input: MissionChainInput, reasonKey: string): MissionToCashStage[] {
  return MISSION_TO_CASH_STAGES.slice(3).map(stage => stageOf(input, stage, 'not_measured', { reasonKey }))
}

function timesheetStages(
  input: MissionChainInput,
  row: InvoiceReadiness,
  delivered: boolean,
  waitingSince: string | null,
): MissionToCashStage[] {
  // `craStatusOf`, la répartition des six codes — jamais relue ailleurs.
  const cra = craStatusOf(row) ?? 'validated'
  const craBlocker = row.blockers.find(candidate => TIMESHEET_BLOCKERS.has(candidate)) ?? null
  if (cra === 'not_submitted') {
    // Pendant que la période court, un relevé absent n'est pas encore un retard.
    const submitted =
      !delivered && craBlocker === 'missing_timesheet'
        ? stageOf(input, 'timesheet_submitted', 'not_due', { reasonKey: 'periodRunning' })
        : stageOf(input, 'timesheet_submitted', 'blocked', {
            blocker: craBlocker,
            reasonKey: craBlocker ? null : 'craBlockedWithoutCode',
            since: waitingSince,
          })
    const validated = stageOf(input, 'timesheet_validated', delivered ? 'pending' : 'not_due', {
      reasonKey: 'waitingOnSubmission',
      since: waitingSince,
    })
    return [submitted, validated]
  }
  const submitted = stageOf(input, 'timesheet_submitted', 'done', { proof: { key: `cra.${cra}`, at: null } })
  const validated =
    cra === 'validated'
      ? stageOf(input, 'timesheet_validated', 'done', { proof: { key: 'cra.validated', at: null } })
      : stageOf(input, 'timesheet_validated', 'blocked', {
          blocker: craBlocker,
          reasonKey: craBlocker ? null : 'craBlockedWithoutCode',
          since: waitingSince,
        })
  return [submitted, validated]
}

function invoiceStages(
  input: MissionChainInput,
  row: InvoiceReadiness,
  delivered: boolean,
  waitingSince: string | null,
): MissionToCashStage[] {
  const invoiced = isInvoicedState(row.state)
  const reached = row.state === 'ready' || invoiced
  const ownBlocker = row.blockers.find(candidate => !TIMESHEET_BLOCKERS.has(candidate)) ?? null
  const waiting = delivered ? 'pending' : 'not_due'
  // Même règle que le maillon `billable` : un bloqueur de relevé est déjà nommé
  // à l'étape du relevé, il ne se redit pas ici.
  const billable = reached
    ? stageOf(input, 'billable_computed', 'done', {
        proof: { key: 'billable', at: null, amountCents: row.preparedAmountCents },
      })
    : ownBlocker
      ? stageOf(input, 'billable_computed', 'blocked', { blocker: ownBlocker, since: waitingSince })
      : stageOf(input, 'billable_computed', waiting, { reasonKey: 'waitingOnTimesheet', since: waitingSince })
  // Bellum PRÉPARE — « préparée » ≠ « créée » ≠ « envoyée » (doctrine #2564).
  const prepared = reached
    ? stageOf(input, 'invoice_prepared', 'done', {
        proof: { key: 'prepared', at: null, amountCents: row.preparedAmountCents },
      })
    : stageOf(input, 'invoice_prepared', waiting, { reasonKey: 'waitingOnBillable', since: waitingSince })
  const created =
    row.invoicedAt !== null
      ? stageOf(input, 'invoice_created', 'done', {
          since: row.invoicedAt,
          // c80 — PROUVÉE par le connecteur (`invoiced`) ou DÉCLARÉE par
          // quelqu'un (`invoiced_declared`) : la source se NOMME.
          proof:
            row.state === 'invoiced_declared'
              ? { key: 'invoicedDeclared', at: row.invoicedAt, by: row.invoicedByName ?? null }
              : { key: 'invoicedProven', at: row.invoicedAt, reference: row.invoiceReference },
        })
      : stageOf(input, 'invoice_created', waiting, {
          reasonKey: row.state === 'ready' ? 'readyToInvoice' : 'waitingOnBillable',
          since: waitingSince,
        })
  const sent =
    row.invoicedAt !== null
      ? stageOf(input, 'invoice_sent', 'not_measured', { reasonKey: 'sendNotTracked' })
      : stageOf(input, 'invoice_sent', 'not_due', { reasonKey: 'notInvoicedYet' })
  return [billable, prepared, created, sent]
}

function dueStage(input: MissionChainInput, row: InvoiceReadiness, today: string): MissionToCashStage {
  const payment = derivePaymentStatus(row, input.now)
  if (row.invoicedAt === null || payment === 'not_invoiced') {
    return stageOf(input, 'invoice_due', 'not_due', { reasonKey: 'notInvoicedYet' })
  }
  if (row.dueOn === null) return stageOf(input, 'invoice_due', 'not_measured', { reasonKey: 'noDueDate' })
  // Le retard est celui de `collectionStatus` — la durée contractuelle avant
  // l'échéance n'est PAS un retard (#2421.5), elle se lit « non due ».
  if (payment === 'overdue') return stageOf(input, 'invoice_due', 'blocked', { reasonKey: 'overdue', since: row.dueOn })
  if (today < row.dueOn && payment !== 'paid') {
    return stageOf(input, 'invoice_due', 'not_due', { reasonKey: 'dueLater', since: row.invoicedAt })
  }
  return stageOf(input, 'invoice_due', 'done', { proof: { key: 'dueOn', at: row.dueOn } })
}

function paymentStages(input: MissionChainInput, row: InvoiceReadiness): MissionToCashStage[] {
  // `derivePaymentStatus` — la dérivation de `/missions/encaissements` et de
  // `/missions/suivi`. Une troisième ferait dire trois choses du même retard.
  const payment = derivePaymentStatus(row, input.now)
  let received: MissionToCashStage
  switch (payment) {
    case 'paid':
      received = stageOf(input, 'payment_received', 'done', {
        since: row.paidAt,
        proof: { key: 'paid', at: row.paidAt, amountCents: row.paidAmountCents },
      })
      break
    case 'disputed':
      received = stageOf(input, 'payment_received', 'blocked', { reasonKey: 'disputed', since: row.disputedAt })
      break
    case 'overdue':
    case 'pending':
      // Un règlement consigné sans solder la ligne est un paiement PARTIEL
      // (#2419.4) : « en cours », jamais « fait » — le reste dû se nomme.
      received =
        row.paidAt !== null
          ? stageOf(input, 'payment_received', 'in_progress', { reasonKey: 'partialPayment', since: row.paidAt })
          : stageOf(input, 'payment_received', 'pending', { reasonKey: 'awaitingPayment', since: row.invoicedAt })
      break
    case 'not_applicable':
      received = stageOf(input, 'payment_received', 'not_applicable', { reasonKey: 'notMonthly' })
      break
    case 'unknown':
      received = stageOf(input, 'payment_received', 'not_measured', { reasonKey: 'noRowThisMonth' })
      break
    case 'not_invoiced':
      received = stageOf(input, 'payment_received', 'not_due', { reasonKey: 'notInvoicedYet' })
      break
  }
  const paid = payment === 'paid'
  const reconciled = paid
    ? stageOf(input, 'payment_reconciled', 'not_measured', { reasonKey: 'noReconciliation' })
    : stageOf(input, 'payment_reconciled', 'not_due', { reasonKey: 'notPaidYet' })
  // La période se CLÔT quand le solde est encaissé : c'est la dernière étape
  // dont Bellum tient la preuve. Un rapprochement inconnu ne la rouvre pas —
  // il n'a jamais été à Bellum de le faire.
  const closed = paid
    ? stageOf(input, 'period_closed', 'done', { since: row.paidAt, proof: { key: 'paid', at: row.paidAt } })
    : stageOf(input, 'period_closed', 'not_due', { reasonKey: 'notPaidYet' })
  return [received, reconciled, closed]
}

function monthStages(input: MissionChainInput, row: InvoiceReadiness): MissionToCashStage[] {
  const periodEnd = periodEndOf(row.periodMonth)
  const today = input.now.toISOString().slice(0, 10)
  const delivered = today >= periodEnd
  const deliveredStage = delivered
    ? stageOf(input, 'period_delivered', 'done', { since: periodEnd, proof: { key: 'periodEnded', at: periodEnd } })
    : stageOf(input, 'period_delivered', 'in_progress', { reasonKey: 'periodRunning', since: row.periodMonth })

  // Un mois non dû (forfait, jalon) : relevé, facture et encaissement MENSUELS
  // ne se posent pas — même lecture que la bande (`notMonthly`).
  if (row.state === 'not_due') {
    return [
      deliveredStage,
      ...MISSION_TO_CASH_STAGES.slice(4).map(stage =>
        stageOf(input, stage, 'not_applicable', { reasonKey: 'notMonthly' }),
      ),
    ]
  }
  // Tant que la période court, le temps d'attendre n'a pas commencé.
  const waitingSince = delivered ? periodEnd : null
  return [
    deliveredStage,
    ...timesheetStages(input, row, delivered, waitingSince),
    ...invoiceStages(input, row, delivered, waitingSince),
    dueStage(input, row, today),
    ...paymentStages(input, row),
  ]
}

/**
 * LA TIMELINE — TOUJOURS les quatorze étapes, dans l'ordre (#2421.1). Même règle
 * que la bande : une étape qu'on ne sait pas lire reste rendue, « inconnue »
 * avec sa raison — une timeline à neuf étapes se lirait « il n'y en a que neuf ».
 */
export function deriveMissionToCash(input: MissionChainInput): MissionToCashStage[] {
  const mission = missionStages(input)
  if (!input.readinessKnown) return [...mission, ...unknownMonthStages(input, 'readingFailed')]
  if (!input.readiness) return [...mission, ...unknownMonthStages(input, 'noRowThisMonth')]
  return [...mission, ...monthStages(input, input.readiness)]
}

/**
 * L'ÉTAPE ACTUELLE — la première qui reste à faire. C'est la réponse au NO-GO de
 * #2421 : jamais « facturation en cours », toujours l'étape EXACTE. `null` =
 * rien d'ouvert.
 */
export function currentMissionToCashStage(stages: readonly MissionToCashStage[]): MissionToCashStage | null {
  return stages.find(item => OPEN_STATES.has(item.state)) ?? null
}

/**
 * #2421.7 — LA GARDE NO-GO, en code : « la mission affiche "facturation en
 * cours" sans indiquer l'étape exacte, le blocage, le responsable et la
 * preuve ». Rend les violations nommées (`<étape>:<défaut>`), `[]` sinon :
 *  - une étape BLOQUÉE nomme son motif (bloqueur ou raison) ;
 *  - une étape OUVERTE a un responsable, ou elle est marquée exception ;
 *  - une étape FAITE porte sa preuve.
 */
export function missionToCashNoGo(stages: readonly MissionToCashStage[]): string[] {
  const violations: string[] = []
  for (const item of stages) {
    if (item.state === 'blocked' && !item.blocker && !item.reasonKey) {
      violations.push(`${item.stage}:blockedWithoutReason`)
    }
    if (OPEN_STATES.has(item.state) && item.owner.name === null && !item.exception) {
      violations.push(`${item.stage}:openWithoutOwner`)
    }
    if (item.state === 'done' && !item.proof) violations.push(`${item.stage}:doneWithoutProof`)
  }
  return violations
}
