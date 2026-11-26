import { INTERVENTION_VISIBLE_COUNT, type Intervention } from '@bellum/contracts'

/**
 * LE COCKPIT DU COMMERCIAL — la logique, séparée de l'écran (BEL-BO-002).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le cockpit répond à « comment va MON mois ? ». Chacune de ses réponses est un
 * arbitrage sur l'absence — quand un chiffre manque, faut-il écrire « 0 »,
 * « non mesuré », ou ne rien écrire du tout ? Ces trois réponses mènent à trois
 * gestes différents, et aucune ne se relit dans du JSX.
 *
 * Tout ce qui suit est PUR et prend `now` en paramètre : deux lectures des
 * mêmes données rendent le même écran, et chaque règle se teste seule.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE FAIT PAS — ET C'EST LE POINT
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne CLASSE rien. Le bloc « ce qui m'attend » est une file d'interventions,
 * et cette file a déjà son moteur : `rankInterventions` (gravité × âge
 * PLAFONNÉ, `packages/contracts/src/schemas/playbook.ts`), appliqué côté
 * serveur par `PlaybooksService.listInterventions`. Le cockpit FILTRE cet ordre,
 * il ne le refait pas.
 *
 * C'est une décision, pas une facilité. Deux moteurs de priorité sur le même
 * objet finissent par se contredire — le tableau de bord du responsable dirait
 * qu'une facture bloquée passe en premier, le brief du commercial dirait autre
 * chose, sur la même ligne, le même matin. Le seul écart admissible est le
 * PÉRIMÈTRE : le responsable voit la file de l'espace, le commercial voit la
 * sienne.
 *
 * Le détecteur de Laura (`laura-detector.ts`) n'a pas été retenu comme source :
 * il rend des CLÉS d'intervention à partir de compteurs d'espace
 * (`accountsWithoutNextAction`, `activeMissions`…), sans objet, sans
 * propriétaire et sans date d'ouverture. On ne peut donc ni ouvrir la ligne, ni
 * la classer par âge, ni savoir si elle me concerne — et sa sortie est de toute
 * façon plafonnée pour une BULLE, pas pour une file.
 */

/* ────────────────────────────────────────────────────────────────────────── */
/*  L'état d'une source                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Les quatre états d'une source du cockpit.
 *
 * `refused` et `failed` sont séparés parce que les deux appellent des gestes
 * opposés : un refus est un DROIT que l'utilisateur n'a pas — il n'y a rien à
 * réparer, et le bloc disparaît. Une panne est une lecture qui a raté — le bloc
 * le dit, et la réessayer a un sens. Les confondre affiche « indisponible » à
 * quelqu'un qui n'aura jamais ce droit, ou fait chercher une panne à quelqu'un
 * qui n'en a pas.
 */
export type SourceState = 'loading' | 'ready' | 'refused' | 'failed'

/** Ce que le cockpit lit d'une requête, sans dépendre de TanStack Query. */
type QueryLike = {
  isLoading: boolean
  isError: boolean
  error?: unknown
  data?: unknown
}

/** Le code HTTP porté par une erreur d'API, ou `null` quand il n'y en a pas. */
export function httpStatusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null | undefined)?.status
  return typeof status === 'number' ? status : null
}

export function sourceState(query: QueryLike): SourceState {
  // L'erreur passe AVANT le chargement : une requête en échec n'est plus en
  // cours, et l'ordre inverse laisserait un bloc refusé afficher un « … » qui
  // ne finit jamais.
  if (query.isError) return httpStatusOf(query.error) === 403 ? 'refused' : 'failed'
  if (query.isLoading || query.data === undefined) return 'loading'
  return 'ready'
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Bloc 4 — ce qu'il reste à vendre                                           */
/* ────────────────────────────────────────────────────────────────────────── */

/** Combien de mois le cockpit regarde devant lui. Trois mois pleins ≈ 90 jours,
 *  et c'est la maille que le service sait produire — un « 90 jours » glissant
 *  supposerait une lecture qui n'existe pas. */
export const CAPACITY_HORIZON_MONTHS = 3

type CapacityWindowInput = { periodMonth: string; availableDays: number | null } | undefined

type CapacityWindow = {
  /** Jours à vendre sur l'horizon. `null` dès qu'un mois manque. */
  sellableDays: number | null
  /** Combien de mois n'ont rien pu rendre. Nommé, jamais fondu dans un total. */
  unmeasuredMonths: number
  /** Les mois effectivement mesurés, du plus proche au plus lointain. */
  months: string[]
}

/**
 * Les jours à vendre sur l'horizon — ou l'aveu qu'on ne sait pas.
 *
 * ⚠️ La somme n'est rendue que si les TROIS mois sont mesurés. Additionner deux
 * mois sur trois produirait un nombre plus petit qui a l'air juste, et
 * « 42 jours à vendre » se lirait comme un total alors qu'il en manquerait un
 * tiers. C'est la même règle que le plancher du pipe, sauf qu'ici il n'y a pas
 * de plancher à annoncer : un mois absent peut valoir n'importe quoi.
 *
 * Et surtout : jamais `0`. « 0 jour à vendre » se lit « tout le monde est
 * staffé », alors que la vérité est « je ne sais pas » — deux conclusions
 * opposées sur la même case vide.
 */
export function capacityWindow(months: readonly CapacityWindowInput[]): CapacityWindow {
  const measured = months.filter(
    (month): month is { periodMonth: string; availableDays: number } =>
      month !== undefined && month.availableDays !== null,
  )
  const unmeasuredMonths = months.length - measured.length
  return {
    sellableDays:
      unmeasuredMonths > 0
        ? null
        : Number(measured.reduce((total, month) => total + month.availableDays, 0).toFixed(2)),
    unmeasuredMonths,
    months: measured.map(month => month.periodMonth),
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Bloc 5 — ce qui m'attend                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

type MyQueue = {
  /** Les cinq premières, DANS L'ORDRE DU SERVEUR — jamais reclassées ici. */
  shown: Intervention[]
  /** Ce que la file replie. Annoncé, jamais coupé en silence. */
  hidden: number
  total: number
}

/**
 * MA file d'intervention.
 *
 * Le filtre est le seul geste : l'ordre vient de `rankInterventions`, appliqué
 * par le serveur (gravité × âge plafonné, une ligne déjà prise en compte
 * recule). Le refaire ici donnerait deux vérités sur la même ligne, selon qu'on
 * la lit dans le brief ou dans le tableau de bord du responsable.
 *
 * ⚠️ Sans identité connue, la file est VIDE et non « tout l'espace ». Une
 * session pas encore lue ne veut pas dire « tout est à moi » : un commercial
 * verrait un instant la file entière de son ESN, dont les lignes de ses
 * collègues.
 */
export function myQueue(
  items: readonly Intervention[],
  userId: string | null,
  limit: number = INTERVENTION_VISIBLE_COUNT,
): MyQueue {
  const mine = userId ? items.filter(item => item.ownerId === userId) : []
  return { shown: mine.slice(0, limit), hidden: Math.max(0, mine.length - limit), total: mine.length }
}

/**
 * Où mène une ligne de la file.
 *
 * `null` quand l'objet n'a pas d'écran : un `user` ou un `workspace` ne
 * s'ouvrent pas, et un lien qui ne mène nulle part est pire qu'une ligne qui ne
 * se clique pas. Même règle que les actions du brief sans `href`.
 *
 * ⚠️ #2107.3 — RÉFUTÉ en prod le 21/09/2026 : `need_without_shortlist` porte
 * `subjectType: 'project'` par convention (le sujet dit quel ÉCRAN ouvrir, pas
 * de quelle table sort l'identifiant — voir `intervention-rules.ts`), mais
 * `subjectId` est un identifiant de BESOIN. Un `switch` sur le seul
 * `subjectType` renvoyait donc la liste générique `/projects` au lieu de la
 * fiche du besoin — le même défaut qu'ailleurs dans ce dépôt : un identifiant
 * disponible, jamais lu. Ce `kind` a donc sa route à part, AVANT le switch ;
 * les autres natures qui partagent `subjectType: 'project'`
 * (`project_no_decision`) gardent la liste générique, elles n'ont pas de fiche
 * par identifiant.
 */
export function interventionHref(
  item: Pick<Intervention, 'subjectType' | 'subjectId'> & Partial<Pick<Intervention, 'kind'>>,
): string | null {
  if (item.kind === 'need_without_shortlist') return `/projects/needs/${item.subjectId}`
  switch (item.subjectType) {
    case 'account':
      return `/accounts/${item.subjectId}`
    case 'mission':
      return '/missions'
    case 'project':
      return '/projects'
    case 'submission':
      return '/consultants'
    default:
      return null
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  L'état de l'écran                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Les blocs du cockpit tel qu'il est AFFICHÉ sur le brief, dans l'ordre.
 *
 * ⚠️ #1394 — « pipe » et « missions » en sont SORTIS le 04/09/2026, avec les
 * deux sous-blocs qui les rendaient. Ils sont toujours LUS (c'est ce couple qui
 * distingue un espace neuf d'un espace calme), mais un compteur « N blocs sur
 * M » doit compter ce que l'écran MONTRE : les garder ici ferait annoncer
 * « 3 blocs sur 5 » à un écran complet, et chercher une panne inexistante — le
 * défaut que le dénominateur de `cockpitState` évite déjà dans l'autre sens.
 *
 * Leur détail n'a pas disparu du produit : le pipe par étape est rendu par
 * `/projects`, la liste des missions par `/missions`.
 */
// #2567.K2 (18/09/2026) — `awaiting` en est SORTI : la file « ce qui m'attend »
// n'est plus rendue par « Mon activité » (voir `DailyGesturesBlock.tsx`), donc
// elle ne compte plus dans le « N blocs sur M » de CET écran-ci. `myQueue` et
// `interventionHref`, juste en dessous, restent : le nouveau bloc les réutilise
// tels quels.
export const COCKPIT_BLOCKS = ['revenue', 'capacity', 'sinceLastVisit'] as const
export type CockpitBlock = (typeof COCKPIT_BLOCKS)[number]

type CockpitState = {
  kind: 'loading' | 'ready' | 'partial'
  /** Combien de blocs ont répondu. */
  served: number
  /** Combien on en ATTENDAIT — les blocs refusés en sortent. */
  expected: number
  /** Ceux dont la lecture a échoué, nommés : « le calcul de marge n'a pas répondu ». */
  failed: CockpitBlock[]
}

/**
 * « 3 blocs sur 4 » — et ce qui manque, nommé.
 *
 * ⚠️ Un bloc REFUSÉ sort du dénominateur ; un bloc en PANNE y reste. C'est la
 * règle du score décomposé appliquée à un écran : un axe non évaluable sort du
 * calcul, sinon la mesure devient celle de nos droits et non celle de l'état du
 * mois. Sans ça, un commercial sans droit financier lirait « 2 blocs sur 4 » en
 * permanence et chercherait une panne inexistante.
 */
export function cockpitState(states: Readonly<Record<CockpitBlock, SourceState>>): CockpitState {
  const entries = COCKPIT_BLOCKS.map(block => [block, states[block]] as const)
  const expected = entries.filter(([, state]) => state !== 'refused').length
  const served = entries.filter(([, state]) => state === 'ready').length
  const failed = entries.filter(([, state]) => state === 'failed').map(([block]) => block)
  if (failed.length > 0) return { kind: 'partial', served, expected, failed }
  return { kind: served < expected ? 'loading' : 'ready', served, expected, failed }
}

/**
 * « Rien n'a jamais existé ici. »
 *
 * ⚠️ La question ne se pose QUE sur des sources qui ont répondu. Conclure d'un
 * silence est le défaut que le dépôt a déjà payé : une lecture en panne rendrait
 * un espace plein indistinguable d'un espace neuf, et l'écran proposerait de
 * lancer une recherche à quelqu'un qui a quarante dossiers.
 *
 * Ce que le cockpit sait vraiment : son PIPE est vide — aucun projet, aucune
 * entrée détectée, aucun signal — et il ne porte aucune mission. Sur un espace
 * où une seule analyse a tourné, l'entonnoir n'est pas vide. Le geste proposé
 * est donc le bon dans les deux cas de figure qui produisent cet état : un
 * espace neuf, et une base importée que personne n'a encore analysée.
 */
export function isBlankWorkspace(input: {
  pipe: { total_count: number; intake: number; signals: number } | undefined
  pipeState: SourceState
  missions: number | undefined
  missionsState: SourceState
}): boolean {
  if (input.pipeState !== 'ready' || input.missionsState !== 'ready') return false
  if (!input.pipe || input.missions === undefined) return false
  return input.pipe.total_count === 0 && input.pipe.intake === 0 && input.pipe.signals === 0 && input.missions === 0
}
