import type { ProjectNeedStatus } from './project.js'

/**
 * Les quatorze états d'un besoin, tels que le terrain les manipule (PDF 2 §7.4,
 * étendu par #2942 / #2152.9 / #2152.10 et par #2323.1).
 *
 * Le document proposait de DÉRIVER une phase de travail au-dessus de quatre
 * statuts contractuels. L'arbitrage de Louis a retenu l'inverse : l'état est
 * STOCKÉ. La raison tient en une phrase — un recruteur MET un besoin en veille,
 * il ne le déduit pas, et une valeur dérivée ne se pose pas à la main.
 *
 * Les quatre valeurs historiques (`open`, `staffed`, `lost`, `cancelled`)
 * restent acceptées : renommer une valeur d'enum est le premier interdit du
 * §2.3, et la garde `enum-additivity` le refuse. Deux d'entre elles ne sont plus
 * écrites — la reprise les a converties — mais rester acceptées évite qu'une
 * écriture partie juste avant le déploiement soit rejetée.
 *
 * ⚠️ #2942 (25/09/2026, tranché sans Louis — épopée gardée ouverte sur cette
 * décision, #2152.9/.10) — « Entretien » et « Négociation » manquaient entre
 * « en validation client » et « gagné » : le Pipe des besoins ne savait pas
 * distinguer un client qui a REÇU un profil (`client_review`, générique) d'un
 * client qui FAIT PASSER un entretien ou qui NÉGOCIE les conditions. Le
 * `negotiation` déjà présent ailleurs dans le dépôt est le STADE d'une
 * opportunité (`PIPELINE_STAGES`, `project.ts`) — une maille différente, celle
 * de l'affaire, pas celle du besoin individuel qu'on staffe. Deux statuts
 * STOCKÉS de plus, même patron que les onze premiers : un recruteur les pose,
 * il ne les déduit pas. Ajoutés ENTRE `client_review` et `won` (l'ordre régit
 * la progression de {@link canTransitionNeedStatus}), et EN FIN de
 * `PROJECT_NEED_STATUSES` (`project.ts`, GA-08 : cette liste-LÀ ne réordonne
 * jamais).
 *
 * ⚠️ #2323.1 — `detected` AJOUTÉ le 25/09/2026, EN TÊTE. Un besoin que le
 * contexte suggère (conversation, document) sans confirmation du client — ni
 * `to_qualify` (quelqu'un l'a acté) ni une absence. Décidé sans Louis (registre
 * #2323, tranché par le coordinateur) : `detected` se PROMEUT en `to_qualify`
 * par un geste explicite, jamais tout seul, et il n'entre dans AUCUN compteur
 * de besoins ouverts (voir {@link NEED_OPEN_STATUSES}, qui ne le porte pas) —
 * un besoin suggéré n'est pas encore un besoin que l'ESN travaille.
 */
export const NEED_STATUS_ORDER = [
  'detected',
  'to_qualify',
  'qualified',
  'to_match',
  'matching',
  'shortlist_ready',
  'submitted',
  'client_review',
  'interview',
  'negotiation',
  'won',
  'lost',
  'on_hold',
  'to_reactivate',
] as const
export type NeedWorkStatus = (typeof NEED_STATUS_ORDER)[number]

/**
 * Ce qu'une ligne peut réellement PORTER : les onze du terrain, plus
 * `cancelled`.
 *
 * `cancelled` n'est pas dans les onze parce qu'il n'est pas une colonne du
 * kanban — annuler n'est pas une étape de travail, c'est une sortie. Mais c'est
 * un état stocké de plein droit, et le confondre avec `lost` fausserait le taux
 * de perte.
 */
export type NeedStoredStatus = NeedWorkStatus | 'cancelled'

/** Les valeurs d'avant la reprise. Toujours acceptées, jamais écrites. */
export const LEGACY_NEED_STATUSES = ['open', 'staffed'] as const

/**
 * Ce qui compte comme un besoin OUVERT.
 *
 * ⚠️ `detected` n'y figure PAS, délibérément (#2323.1) : un besoin que le
 * contexte suggère sans confirmation du client n'est pas encore un besoin que
 * l'ESN travaille — l'y compter gonflerait le nombre de besoins ouverts d'une
 * suggestion jamais actée.
 *
 * `on_hold` et `to_reactivate` en font partie, et c'est délibéré : le besoin du
 * client existe toujours, seule notre attention s'est déplacée. Les sortir des
 * ouverts ferait disparaître d'un tableau de bord exactement les besoins qu'on
 * risque le plus d'oublier.
 */
export const NEED_OPEN_STATUSES: readonly ProjectNeedStatus[] = [
  'to_qualify',
  'qualified',
  'to_match',
  'matching',
  'shortlist_ready',
  'submitted',
  'client_review',
  // #2942 — l'entretien et la négociation sont des besoins TOUJOURS ouverts :
  // le client n'a ni signé ni refusé, il reste en jeu, exactement comme
  // `client_review` juste au-dessus.
  'interview',
  'negotiation',
  'on_hold',
  'to_reactivate',
  'open',
]

/**
 * #4343 — les états de besoin qui sont en réalité une ÉTAPE DE CANDIDAT
 * (`submitted`, `client_review`, `interview`) ou une étape d'AFFAIRE
 * (`negotiation`, cf. `PIPELINE_STAGES`). Décision Louis 19/10/2026 : ces
 * étapes vivent sur la fiche du besoin (candidats positionnés et leur étape)
 * ou dans le pipe d'affaires — jamais en colonne du besoin.
 *
 * Les valeurs RESTENT stockées et acceptées (contrainte SQL inchangée, aucune
 * réécriture) : seul l'affichage les replie, voir {@link needBoardStatus}.
 */
export const NEED_CANDIDATE_STAGE_STATUSES = ['submitted', 'client_review', 'interview', 'negotiation'] as const

/** Vrai pour un état de besoin qui est une étape de candidat ou d'affaire. */
export function isNeedCandidateStage(status: string): boolean {
  return (NEED_CANDIDATE_STAGE_STATUSES as readonly string[]).includes(status)
}

/** Les colonnes PROPRES au besoin : ses états ouverts moins les étapes ci-dessus. */
export const NEED_BOARD_STATUSES: readonly ProjectNeedStatus[] = NEED_OPEN_STATUSES.filter(
  status => !(NEED_CANDIDATE_STAGE_STATUSES as readonly string[]).includes(status),
)

/**
 * Où s'affiche un besoin : un besoin stocké à une étape candidat/affaire se lit
 * dans la dernière colonne qui lui appartient (`shortlist_ready` : les profils
 * sont prêts ou partis, la suite se lit sur ses candidats). Rattrapage de la
 * donnée existante : ciblé, jamais au déploiement.
 */
export function needBoardStatus(status: ProjectNeedStatus): ProjectNeedStatus {
  return isNeedCandidateStage(status) ? 'shortlist_ready' : status
}

/**
 * Ce qui compte comme CLOS.
 *
 * `cancelled` n'est pas `lost` : un besoin annulé par l'ESN n'est pas un besoin
 * perdu chez le client. Les confondre fausserait le taux de perte, qui est l'un
 * des rares chiffres que l'ESN regarde vraiment.
 */
export const NEED_CLOSED_STATUSES: readonly ProjectNeedStatus[] = ['won', 'lost', 'cancelled', 'staffed']

/**
 * Les états dont le passage exige un motif.
 *
 * Avancer n'en demande pas : un formulaire à chaque étape se contourne, et un
 * motif contourné ne vaut rien. Trois états seulement en réclament un, et pour
 * la même raison — ce sont les trois où le besoin ARRÊTE d'avancer, et où la
 * question « pourquoi » n'a plus aucune autre trace.
 *
 * ⚠️ `on_hold` a été AJOUTÉ le 27/08/2026, et c'est le point de ce lot.
 * La route acceptait déjà `{ status: 'on_hold', reason }` — le contrat le
 * déclare depuis toujours — mais le service JETAIT le motif : il n'était gardé
 * que si `needStatusRequiresReason` disait oui, ce qu'il ne disait que pour
 * `lost` et `cancelled`. « Mettre en veille avec motif » écrivait donc une
 * veille sans motif.
 *
 * OBLIGATOIRE, pas seulement persisté. Trois raisons :
 *  1. `on_hold` est dans {@link NEED_OPEN_STATUSES} — un besoin en veille
 *     continue de compter comme ouvert, donc il reste dans les tableaux de
 *     bord. Sans motif, c'est exactement le besoin que personne ne rouvre :
 *     rien ne dit ce qu'on attend ni de qui.
 *  2. C'est le même argument que sur une perte, à un mot près : sans motif, le
 *     taux de mise en veille par cause ne veut rien dire.
 *  3. Ça ne coûte rien à personne : AUCUN appelant du dépôt n'écrivait
 *     `on_hold` avant ce lot (le kanban des besoins est en lecture seule, et il
 *     le dit). Rendre le motif obligatoire ne casse donc aucun chemin existant.
 *
 * `to_reactivate` n'y est PAS, délibérément : le motif de la veille meurt quand
 * la veille finit, et le traîner à côté d'un besoin réactivé afficherait la
 * raison d'un arrêt à côté d'un besoin en marche.
 */
const REASON_REQUIRED: readonly ProjectNeedStatus[] = ['lost', 'cancelled', 'on_hold']

/** Ce que valait une ligne écrite avant la reprise. Une valeur inconnue tombe
 *  sur `to_qualify` — l'état le moins engageant — plutôt que de propager un
 *  état fantôme dans les compteurs. */
export function normaliseNeedStatus(status: string | null | undefined): NeedStoredStatus {
  if (status === 'open') return 'to_qualify'
  if (status === 'staffed') return 'won'
  if (status === 'cancelled') return 'cancelled'
  return (NEED_STATUS_ORDER as readonly string[]).includes(status ?? '') ? (status as NeedWorkStatus) : 'to_qualify'
}

export function isNeedOpen(status: string | null | undefined): boolean {
  return (NEED_OPEN_STATUSES as readonly string[]).includes(status ?? '')
}

/**
 * Une expression de colonne, et rien d'autre : `status` ou `n.status`.
 *
 * Les fabriques ci-dessous interpolent des littéraux dans du SQL. Les VALEURS
 * viennent d'énumérations figées du contrat — aucune n'a d'origine utilisateur.
 * La colonne, elle, est le seul morceau que l'appelant choisit : c'est donc le
 * seul qui se vérifie.
 */
export function assertNeedSqlColumn(fn: string, column: string): void {
  if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(column)) {
    throw new Error(`${fn} : expression de colonne invalide — ${JSON.stringify(column)}`)
  }
}

/**
 * Le MÊME test que {@link isNeedOpen}, écrit en SQL — pour les requêtes qui ne
 * peuvent pas charger un besoin en mémoire pour le lui demander.
 *
 * ⚠️ CETTE FABRIQUE EXISTE PARCE QUE LA LISTE RECOPIÉE ÉTAIT FAUSSE. Deux
 * services écrivaient `status NOT IN ('closed', 'cancelled', 'filled')`. Ni
 * `closed` ni `filled` n'ont JAMAIS existé dans {@link PROJECT_NEED_STATUSES} —
 * ce sont les noms qu'on emploie en parlant, pas ceux que la base accepte (la
 * contrainte `project_needs_status_check` ne les admet pas). Le prédicat
 * n'excluait donc qu'`cancelled` : un besoin GAGNÉ, PERDU ou POURVU restait
 * compté parmi les besoins ouverts, et remontait dans la routine « besoins sans
 * shortlist » comme s'il attendait encore quelqu'un.
 *
 * Une liste de statuts recopiée à la main n'est pas seulement une seconde
 * vérité : c'est une seconde vérité que RIEN ne relit. Le typage ne voit pas
 * l'intérieur d'une chaîne, et la base accepte volontiers `NOT IN` sur une
 * valeur qui n'existe pas — elle ne filtre simplement rien.
 *
 * Les valeurs sont interpolées en LITTÉRAUX et non en paramètres liés : ces
 * fragments s'assemblent dans des requêtes dont la numérotation des `$n`
 * appartient à l'appelant, et un fragment qui en consommerait un décalerait
 * tout ce qui suit.
 */
export function needStillOpenSql(column: string): string {
  assertNeedSqlColumn('needStillOpenSql', column)
  if (NEED_OPEN_STATUSES.length === 0) {
    throw new Error("needStillOpenSql : aucun statut ouvert — `IN ()` n'est pas du SQL valide.")
  }
  return `${column} IN (${NEED_OPEN_STATUSES.map(status => `'${status}'`).join(', ')})`
}

export function needStatusRequiresReason(status: string | null | undefined): boolean {
  return (REASON_REQUIRED as readonly string[]).includes(status ?? '')
}

/**
 * Ce qui suit ce qui, et ce qui ne suit pas.
 *
 * Deux règles portent tout le reste. **On ne saute pas la qualification** : un
 * matching lancé sur un besoin dont personne n'a renseigné les compétences
 * obligatoires ne cherche rien et rend une liste vide qui se lit « aucun profil
 * disponible ». Et **on ne rouvre pas un besoin gagné en silence** : la mission
 * existe déjà, la rouvrir la ferait disparaître de la vue de quelqu'un sans que
 * personne ne l'ait décidé — le passage par « à réactiver » est ce qui le dit.
 *
 * Le retour en arrière, lui, est AUTORISÉ entre états ouverts. C'est le métier :
 * un profil refusé renvoie à la shortlist, un client qui change d'avis renvoie
 * à la qualification. L'interdire pousserait à clore et recréer, ce qui casse
 * l'historique.
 */
export function canTransitionNeedStatus(
  from: string | null | undefined,
  to: NeedStoredStatus,
): { allowed: boolean; reason?: string } {
  const current = normaliseNeedStatus(from)
  if (current === to) return { allowed: false, reason: 'Ce besoin est déjà dans cet état.' }

  // Clore reste possible depuis n'importe quel état ouvert : un client peut
  // annuler à tout moment, et refuser de l'enregistrer ne l'empêche pas
  // d'arriver — cela le rend seulement invisible.
  if (to === 'lost' || to === 'cancelled') {
    return isNeedOpen(current) ? { allowed: true } : { allowed: false, reason: 'Ce besoin est déjà clos.' }
  }

  if (current === 'won') {
    return to === 'to_reactivate'
      ? { allowed: true }
      : { allowed: false, reason: 'Un besoin gagné se rouvre en le remettant « à réactiver », jamais en silence.' }
  }
  if (current === 'lost' || current === 'cancelled') {
    return to === 'to_reactivate'
      ? { allowed: true }
      : { allowed: false, reason: 'Un besoin clos se rouvre en le remettant « à réactiver ».' }
  }

  // Avancer : au plus d'un cran. Reculer : librement, entre états ouverts.
  const order = NEED_STATUS_ORDER.indexOf(current as NeedWorkStatus)
  const target = NEED_STATUS_ORDER.indexOf(to)
  if (target < 0) return { allowed: false, reason: 'État inconnu.' }
  if (to === 'on_hold' || to === 'to_reactivate') return { allowed: true }
  if (current === 'to_reactivate' || current === 'on_hold') return { allowed: true }
  if (target < order) return { allowed: true }
  if (target === order + 1) return { allowed: true }
  return {
    allowed: false,
    reason: 'Ce besoin doit d’abord passer par l’étape précédente — sauter la qualification lance un matching à vide.',
  }
}

/**
 * #3389.13 — la DATE DE REPRISE d'une mise en veille.
 *
 * « Un besoin éloigné passe en attente AVEC DATE » : sans date, la veille est
 * exactement le besoin que personne ne rouvre. La date est FACULTATIVE (on ne
 * l'invente pas quand le client ne l'a pas donnée) mais, quand elle est
 * posée, elle doit avoir un sens :
 *
 *  - elle n'existe que sur `on_hold` — sur une clôture ou une réouverture, une
 *    date de reprise se lirait comme une promesse que personne n'a faite ;
 *  - elle n'est pas dans le passé — une reprise « hier » est une veille déjà
 *    échue, qu'on ne crée pas.
 *
 * `today` est passé (AAAA-MM-JJ), jamais lu ici : la fonction reste pure.
 */
export function needResumeOnProblem(
  status: string,
  resumeOn: string | null | undefined,
  today: string,
): 'only_on_hold' | 'in_the_past' | null {
  if (resumeOn === null || resumeOn === undefined) return null
  if (status !== 'on_hold') return 'only_on_hold'
  return resumeOn < today ? 'in_the_past' : null
}
