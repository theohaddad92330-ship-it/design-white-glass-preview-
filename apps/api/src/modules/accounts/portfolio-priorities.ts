import { FOCUS_MAX_ACCOUNTS, type AccountFact } from '@bellum/contracts'

/**
 * #3209 (LAU-FINAL-215) — « parmi tout ce que je pourrais faire, où dois-je
 * investir mon temps cette semaine ? ».
 *
 * Fonction pure, séparée du service qui lit la base (même découpage que
 * `pendingFrom` dans `capitalisation.service.ts`) : la RÈGLE se teste sans
 * base de données, la lecture SQL n'a qu'une prédicat à porter.
 *
 * Quatre catégories, jamais un tri par score (NO-GO explicite de la spec) :
 * les deux axes déjà réels du dépôt — `sprint` (le board d'effort, D80) et
 * `priority_gate` (la décision de travailler ou non) — portent la décision,
 * jamais `priority_score` seul, qui ne fait que départager au sein d'un
 * groupe pour la diversité.
 */

export type PortfolioAccountRow = {
  id: string
  companyName: string
  sprint: string | null
  sprintExitReason: string | null
  priorityGate: string
  priorityScore: number | null
  priorityJustification: string | null
  commercialStatus: string
  groupHeadSiren: string | null
  lastActionAt: string | null
  /**
   * #3245 (reste de #3209.5) — les MÊMES champs que `get_account_briefing`
   * (`build_account_briefing`, `apps/ia/app/services/chat_tools.py`) :
   * `raw_analysis.plan.recommendedMovement.rationale` et le PREMIER de
   * `raw_analysis.plan.nextActions`. Rien n'est recalculé ici — un dossier
   * qui n'a pas encore de plan rend `null`, jamais une valeur devinée.
   */
  movementRationale: string | null
  firstActionLabel: string | null
  firstActionHorizon: string | null
  /**
   * #3245 (reste de #3209.6) — le PROFIL DE PARI, DÉCLARÉ par le commercial
   * (`PATCH /accounts/:id/bet-profile`), jamais déduit d'un texte libre ni
   * d'un effectif. `null` = non déclaré : ce n'est ni « court », ni « petit »,
   * ni « ouvert » — une absence ne fait jamais compter un compte dans une règle.
   */
  betHorizon: string | null
  betSize: string | null
  betAccess: string | null
  betResource: string | null
  /**
   * #3769.7 (recette prod nuit 08→09/10) — le siège du registre, MÊME colonne que
   * `run_account_search` (#3762) : un raffinement géographique sur une carte déjà rendue
   * (« seulement en Occitanie ») lit ce fait réel au lieu de redemander faute de donnée.
   */
  headquarters: string | null
  /**
   * #3399 — l'interlocuteur principal du compte (contact visible le mieux noté).
   * `null` = AUCUN contact lisible (Laura écrit « Interlocuteur à identifier ») ;
   * `undefined` = non lu par l'appelant (rien n'est affirmé).
   */
  interlocutor?: PortfolioInterlocutor | null
  /**
   * #4054.1 — le dossier vient d'un import (`status: 'imported'`), jamais analysé : sans score ni plan.
   * Absent/`false` = dossier analysé. Rien (échange, sponsor, relation) n'est déduit d'un simple fichier.
   */
  imported?: boolean
  /** #4054.1 — les contacts visibles DÉJÀ connus (jusqu'à cinq, les mieux notés). `undefined` = non lus. */
  knownContacts?: readonly { name: string | null; role: string | null; scope: string | null }[]
}

type PortfolioInterlocutor = { name: string; role: string | null; scope: string | null }

/** #4054.1 — ce qui MANQUE pour décider, nommé : jamais un « 0 » ni une valeur devinée. */
type PortfolioMissing = 'analysis' | 'contact' | 'headquarters'

type PortfolioBucket = 'now' | 'to_verify' | 'to_watch' | 'not_now'

/**
 * #4070.1 — un fait DÉCOTÉ qui dit « pourquoi maintenant » : la date du fait lui-même et son âge (le lecteur
 * unique des faits, #4069.1), jamais la date de collecte ni un poids (un rang n'est pas une probabilité).
 */
type PortfolioWhyNowFact = { date: string; kind: string; label: string; ageDays: number }

/** Les natures qui disent POURQUOI MAINTENANT (celles de la phase recherche du pipeline) ; les plus pesantes d'abord. */
const WHY_NOW_KINDS: ReadonlySet<string> = new Set(['hiring', 'need', 'signal', 'market_observation', 'correction'])
const WHY_NOW_MAX = 2

export function whyNowOf(facts: readonly AccountFact[]): PortfolioWhyNowFact[] {
  return facts
    .filter(fact => WHY_NOW_KINDS.has(fact.kind) && fact.weight > 0)
    .slice(0, WHY_NOW_MAX)
    .map(fact => ({ date: fact.date, kind: fact.kind, label: fact.label, ageDays: fact.ageDays }))
}

type PortfolioPriorityItem = {
  id: string
  companyName: string
  bucket: PortfolioBucket
  reason: string
  /** #3209.3 — ce qui ferait cesser d'y investir, ou changer de catégorie. */
  stopCondition: string
  lastActionAt: string | null
  /** #3399 — absent pour « ne pas travailler » ; `null` = aucun contact lisible. */
  interlocutor?: PortfolioInterlocutor | null
  /** #3769.7 — le siège du registre, copié tel quel ; `null` = non renseigné, jamais deviné. */
  headquarters: string | null
  /** #4054.1 — dossier importé, jamais analysé ; absent sinon. */
  fromImport?: true
  /** #4054.1 — les contacts déjà connus (nom, rôle, périmètre), absents si les contacts n'ont pas été lus. */
  knownContacts?: PortfolioInterlocutor[]
  /** #4054.1 — les éléments manquants, dans l'ordre analyse → contact → siège ; absent si rien ne manque. */
  missing?: PortfolioMissing[]
  /** #4070.1 — pour `bucket: 'now'` : les faits décotés qui disent pourquoi maintenant ; absent sans fait lisible. */
  whyNow?: PortfolioWhyNowFact[]
  /** Uniquement pour `bucket: 'now'` — la seule catégorie que #3209.5 justifie. */
  objective?: string
  firstAction?: string
  expectedTime?: string
  /**
   * #3245 — recette 07/10 : Accor/AIRBUS déclarés « Pari long » individuellement,
   * mais `diversityNotes` n'écrit « uniquement des paris longs » que si CHAQUE
   * compte de « maintenant » le déclare (règle #3209.6, inchangée) — ce qui laissait
   * Laura sans rien à dire sur un portefeuille hétérogène. L'horizon voyage donc
   * aussi PAR COMPTE, même doctrine qu'`objective`/`firstAction` : absent sans
   * déclaration, jamais déduit. Recette NB 10/10 : il voyage sur TOUT compte qui le déclare
   * (aussi « à surveiller » / « à vérifier »), la redescente ne l'efface plus.
   */
  betHorizon?: string
}

type PortfolioDeclaredBet = { id: string; companyName: string; bucket: PortfolioBucket; betHorizon: string }

export type PortfolioPriorities = {
  /** COMPTES À TRAVAILLER MAINTENANT — plafonnée par `capacityCap`. */
  now: PortfolioPriorityItem[]
  /** COMPTES À VÉRIFIER — une donnée manque avant décision. */
  toVerify: PortfolioPriorityItem[]
  /** COMPTES À SURVEILLER — compatibles mais sans mouvement. */
  toWatch: PortfolioPriorityItem[]
  /** COMPTES À NE PAS TRAVAILLER — coût d'opportunité trop élevé. */
  notNow: PortfolioPriorityItem[]
  /** #3245 (RAN) — TOUS les paris déclarés (horizon), quelle que soit la catégorie : à citer sans en omettre. */
  declaredBets: PortfolioDeclaredBet[]
  /**
   * Le plafond RÉEL de « maintenant » — celui du board d'effort (D80,
   * `FOCUS_MAX_ACCOUNTS`), jamais un nombre inventé pour cette spec : un
   * compte en sprint Focus a déjà passé ce plafond à l'entrée
   * (`SprintsService.canEnterFocus`), cette fonction ne fait que le nommer.
   */
  capacityCap: number
  /** #3209.4 — les catégories SANS compte : nommées vides, jamais remplies. */
  emptyBuckets: PortfolioBucket[]
  /**
   * #3209.6 — les déséquilibres NOMMÉS de « maintenant » au-delà du groupe.
   * Aucun compte n'est retiré pour eux (retirer tous les comptes d'un panier
   * homogène viderait « maintenant ») : la note dit l'homogénéité, l'humain
   * arbitre. Vide quand un seul compte n'a pas déclaré son profil.
   */
  diversityNotes: PortfolioDiversityNote[]
  /**
   * #3540 — les comptes dénombrés ICI, par la source : Laura écrit « 3 comptes
   * sur 46 » depuis ces champs, jamais d'un total qu'elle aurait compté
   * elle-même (un chiffre hors résultat d'outil n'est pas écrit).
   */
  counts: PortfolioCounts
  /**
   * #5014 — les dossiers venus d'un IMPORT (`imported`), dénombrés par la source. `0` = l'espace n'a AUCUN
   * import : Laura le DIT (« je n'ai pas lu ton CRM : il n'est pas importé »), distinct d'un CRM non connecté.
   */
  importedCount: number
}

/**
 * `outsideNow` (#3540, recette Y7) — « 43 autres comptes » : le reste du portefeuille hors
 * « maintenant » est DÉNOMBRÉ ici ; une soustraction faite par Laura (46 − 3) n'est dans aucun
 * résultat d'outil et déclenchait « Précision : certains chiffres… ».
 */
type PortfolioCounts = {
  now: number
  toVerify: number
  toWatch: number
  notNow: number
  total: number
  outsideNow: number
}

type PortfolioDiversityNote = { code: 'only_long_bets' | 'only_closed_large_accounts'; message: string }

const STOP_CONDITION: Record<PortfolioBucket, string> = {
  now: "Arrêter si aucun échange n'a lieu d'ici la fin de la semaine, ou si le compte sort du focus.",
  to_verify: 'Arrêter dès que la donnée manquante est établie : le compte change alors de catégorie.',
  to_watch: "Passer en « maintenant » à l'apparition d'un signal actuel ; sinon ne pas y investir de temps.",
  not_now: 'Ne pas y revenir tant que le motif de sortie ne change pas.',
}

/** #3209.6 — pas plus de deux filiales du même groupe dans « maintenant ». */
const GROUP_DIVERSITY_MAX = 2

/** #3209.6 — pas plus de deux comptes qui réclament la MÊME ressource déclarée. */
const RESOURCE_DIVERSITY_MAX = 2

const resourceKey = (value: string | null): string | null => value?.trim().toLocaleLowerCase('fr') || null

const clean = (value: string | null | undefined): string | null => value?.trim() || null

/**
 * #3399 (Y3 02/10) — l'interlocuteur principal parmi les candidats déjà rangés par score : une
 * personne NOMMÉE (prénom + nom) qui porte un rôle d'abord, puis un nom complet sans rôle, puis
 * le premier lisible. Le rôle absent reste `null` — jamais deviné.
 */
export function pickInterlocutor(
  candidates: readonly { name: string | null; role: string | null; scope: string | null }[],
): PortfolioInterlocutor | null {
  const readable = candidates
    .map(c => ({ name: clean(c.name), role: clean(c.role), scope: clean(c.scope) }))
    .filter((c): c is PortfolioInterlocutor => c.name !== null)
  const fullName = (c: PortfolioInterlocutor) => c.name.split(/\s+/).length >= 2
  return readable.find(c => fullName(c) && c.role !== null) ?? readable.find(fullName) ?? readable[0] ?? null
}

/** #3399 — le champ n'existe que si l'appelant a lu les contacts : jamais un `null` affirmé sans lecture. */
const readableContacts = (row: PortfolioAccountRow): PortfolioInterlocutor[] | undefined =>
  row.knownContacts === undefined
    ? undefined
    : row.knownContacts
        .map(c => ({ name: clean(c.name), role: clean(c.role), scope: clean(c.scope) }))
        .filter((c): c is PortfolioInterlocutor => c.name !== null)

/**
 * #4054.1 — « compte et périmètre, raison, contacts déjà connus, éléments manquants » : les contacts
 * RÉELS du compte, sa provenance d'import, et ce qui manque (analyse, contact, siège). Un contact
 * n'est dit absent que si les contacts ONT été lus ; une absence ne fabrique aucune relation.
 */
const knownFields = (
  row: PortfolioAccountRow,
): Pick<PortfolioPriorityItem, 'fromImport' | 'knownContacts' | 'missing'> => {
  const contacts = readableContacts(row)
  const missing: PortfolioMissing[] = []
  if (row.priorityScore === null) missing.push('analysis')
  if (contacts !== undefined && contacts.length === 0) missing.push('contact')
  if (!clean(row.headquarters)) missing.push('headquarters')
  return {
    ...(row.imported ? { fromImport: true as const } : {}),
    ...(contacts !== undefined && contacts.length > 0 ? { knownContacts: contacts } : {}),
    ...(missing.length > 0 ? { missing } : {}),
  }
}

const interlocutorField = (row: PortfolioAccountRow): { interlocutor?: PortfolioInterlocutor | null } =>
  row.interlocutor === undefined ? {} : { interlocutor: row.interlocutor }

/**
 * #3245 (recette NB 10/10) — le pari DÉCLARÉ voyage sur TOUT compte qui le porte, pas
 * seulement « maintenant » : 0 compte en focus + 55 « à surveiller » laissait Accor et
 * AIRBUS (déclarés « Pari long ») sans nulle part où être cités. Absent sans déclaration.
 */
const betHorizonField = (row: PortfolioAccountRow): { betHorizon?: string } => {
  const betHorizon = row.betHorizon?.trim()
  return betHorizon ? { betHorizon } : {}
}

export function derivePortfolioPriorities(rows: readonly PortfolioAccountRow[]): PortfolioPriorities {
  const now: PortfolioPriorityItem[] = []
  const toVerify: PortfolioPriorityItem[] = []
  const toWatch: PortfolioPriorityItem[] = []
  const notNow: PortfolioPriorityItem[] = []
  const groupHeadByAccount = new Map<string, string | null>()
  const rowById = new Map<string, PortfolioAccountRow>()

  for (const row of rows) {
    groupHeadByAccount.set(row.id, row.groupHeadSiren)
    rowById.set(row.id, row)

    // Écarté prime sur tout le reste : une décision humaine (parqué) ou un
    // sprint clos (no_go) ne se rediscute pas au vu du score.
    if (row.sprint === 'no_go' || row.priorityGate === 'parked') {
      notNow.push({
        id: row.id,
        companyName: row.companyName,
        bucket: 'not_now',
        reason: row.sprintExitReason?.trim() || 'Priorité écartée.',
        stopCondition: STOP_CONDITION.not_now,
        lastActionAt: row.lastActionAt,
        headquarters: row.headquarters,
        // #3245 (RAN) — un pari DÉCLARÉ ne se perd pas en changeant de panier.
        ...betHorizonField(row),
      })
      continue
    }

    // Rien à décider sans le score : jamais une case devinée.
    if (row.priorityScore === null) {
      toVerify.push({
        id: row.id,
        companyName: row.companyName,
        bucket: 'to_verify',
        reason: row.imported
          ? "Compte importé de votre base, pas encore analysé : aucun échange, sponsor ni relation n'est déduit du fichier."
          : 'Score non mesuré — le dossier est incomplet.',
        stopCondition: STOP_CONDITION.to_verify,
        lastActionAt: row.lastActionAt,
        headquarters: row.headquarters,
        ...interlocutorField(row),
        ...knownFields(row),
        ...betHorizonField(row),
      })
      continue
    }

    if (row.sprint === 'focus') {
      const item: PortfolioPriorityItem = {
        id: row.id,
        companyName: row.companyName,
        bucket: 'now',
        reason: row.priorityJustification?.trim() || 'En focus cette semaine.',
        stopCondition: STOP_CONDITION.now,
        lastActionAt: row.lastActionAt,
        headquarters: row.headquarters,
        ...interlocutorField(row),
        ...knownFields(row),
      }
      const objective = row.movementRationale?.trim()
      if (objective) item.objective = objective
      const firstAction = row.firstActionLabel?.trim()
      if (firstAction) item.firstAction = firstAction
      const expectedTime = row.firstActionHorizon?.trim()
      if (expectedTime) item.expectedTime = expectedTime
      const betHorizon = row.betHorizon?.trim()
      if (betHorizon) item.betHorizon = betHorizon
      now.push(item)
      continue
    }

    toWatch.push({
      id: row.id,
      companyName: row.companyName,
      bucket: 'to_watch',
      reason:
        row.priorityGate === 'pending'
          ? 'En attente de décision, pas de mouvement récent.'
          : 'Compte compatible, sans mouvement actuel.',
      stopCondition: STOP_CONDITION.to_watch,
      lastActionAt: row.lastActionAt,
      headquarters: row.headquarters,
      ...interlocutorField(row),
      ...knownFields(row),
      ...betHorizonField(row),
    })
  }

  // Diversité : au-delà de deux comptes du même groupe en « maintenant »,
  // les suivants redescendent en « à surveiller » plutôt que de saturer la
  // semaine avec des filiales du même compte (l'exemple même de la spec).
  // #3209.5 — « maintenant » ne dépasse jamais le plafond réel : le surplus
  // redescend en « à surveiller » avec sa raison, jamais silencieusement.
  const groupCounts = new Map<string, number>()
  const resourceCounts = new Map<string, number>()
  const keptNow: PortfolioPriorityItem[] = []
  for (const item of now) {
    const groupHeadSiren = groupHeadByAccount.get(item.id) ?? null
    if (groupHeadSiren && (groupCounts.get(groupHeadSiren) ?? 0) >= GROUP_DIVERSITY_MAX) {
      // #3209.5 — objectif/première action/temps attendu ne valent que pour
      // « maintenant » : une redescente en « à surveiller » les efface, elle
      // ne les recopie pas dans un panier qu'ils ne concernent plus.
      toWatch.push({
        id: item.id,
        companyName: item.companyName,
        bucket: 'to_watch',
        reason: `Coût d'opportunité — déjà ${GROUP_DIVERSITY_MAX} comptes du même groupe en priorité cette semaine.`,
        stopCondition: STOP_CONDITION.to_watch,
        lastActionAt: item.lastActionAt,
        headquarters: item.headquarters,
        ...(item.interlocutor === undefined ? {} : { interlocutor: item.interlocutor }),
        ...(item.fromImport ? { fromImport: item.fromImport } : {}),
        ...(item.knownContacts ? { knownContacts: item.knownContacts } : {}),
        ...(item.missing ? { missing: item.missing } : {}),
        ...(item.betHorizon === undefined ? {} : { betHorizon: item.betHorizon }),
      })
      continue
    }
    if (keptNow.length >= FOCUS_MAX_ACCOUNTS) {
      // #3209.5 — la redescente efface objectif/première action/temps attendu.
      const { objective: _objective, firstAction: _firstAction, expectedTime: _expectedTime, ...rest } = item
      toWatch.push({
        ...rest,
        bucket: 'to_watch',
        reason: `Plafond de ${FOCUS_MAX_ACCOUNTS} comptes « maintenant » atteint — celui-ci attend.`,
        stopCondition: STOP_CONDITION.to_watch,
      })
      continue
    }
    const resource = resourceKey(rowById.get(item.id)?.betResource ?? null)
    if (resource && (resourceCounts.get(resource) ?? 0) >= RESOURCE_DIVERSITY_MAX) {
      const { objective: _objective, firstAction: _firstAction, expectedTime: _expectedTime, ...rest } = item
      toWatch.push({
        ...rest,
        bucket: 'to_watch',
        reason: `Coût d'opportunité — déjà ${RESOURCE_DIVERSITY_MAX} comptes qui réclament la même ressource (${rowById.get(item.id)?.betResource?.trim()}).`,
        stopCondition: STOP_CONDITION.to_watch,
      })
      continue
    }
    if (resource) resourceCounts.set(resource, (resourceCounts.get(resource) ?? 0) + 1)
    if (groupHeadSiren) groupCounts.set(groupHeadSiren, (groupCounts.get(groupHeadSiren) ?? 0) + 1)
    keptNow.push(item)
  }

  const emptyBuckets: PortfolioBucket[] = []
  if (keptNow.length === 0) emptyBuckets.push('now')
  if (toVerify.length === 0) emptyBuckets.push('to_verify')
  if (toWatch.length === 0) emptyBuckets.push('to_watch')
  if (notNow.length === 0) emptyBuckets.push('not_now')

  // #3245 (RAN, recette ND 10/10) — Accor ET AIRBUS déclarés « Pari long », seul AIRBUS cité :
  // dans 55 lignes le modèle en oublie. Les paris déclarés sont donc AUSSI nommés à part, toutes
  // catégories confondues, dans l'ordre du portefeuille. Vide sans déclaration, jamais déduit.
  const bucketById = new Map<string, PortfolioBucket>()
  for (const item of [...keptNow, ...toVerify, ...toWatch, ...notNow]) bucketById.set(item.id, item.bucket)
  const declaredBets: PortfolioDeclaredBet[] = []
  for (const row of rows) {
    const betHorizon = row.betHorizon?.trim()
    const bucket = bucketById.get(row.id)
    if (betHorizon && bucket) declaredBets.push({ id: row.id, companyName: row.companyName, bucket, betHorizon })
  }

  return {
    now: keptNow,
    toVerify,
    toWatch,
    notNow,
    declaredBets,
    capacityCap: FOCUS_MAX_ACCOUNTS,
    emptyBuckets,
    diversityNotes: diversityNotesFor(keptNow.map(item => rowById.get(item.id))),
    // #5014 — mesuré sur les lignes, jamais déduit d'une absence de CRM connecté.
    importedCount: rows.filter(row => row.imported).length,
    counts: {
      now: keptNow.length,
      toVerify: toVerify.length,
      toWatch: toWatch.length,
      notNow: notNow.length,
      total: rows.length,
      outsideNow: rows.length - keptNow.length,
    },
  }
}

/**
 * #3209.6 — « uniquement des paris longs », « uniquement de très grands comptes
 * fermés ». Une note exige au moins DEUX comptes et que CHACUN ait déclaré la
 * valeur : un profil non déclaré sort de la règle, il ne la remplit pas.
 */
function diversityNotesFor(kept: readonly (PortfolioAccountRow | undefined)[]): PortfolioDiversityNote[] {
  const rows = kept.filter((row): row is PortfolioAccountRow => row !== undefined)
  if (rows.length < 2) return []
  const notes: PortfolioDiversityNote[] = []
  if (rows.every(row => row.betHorizon === 'long')) {
    notes.push({
      code: 'only_long_bets',
      message: 'Tous les comptes « maintenant » sont des paris longs : aucun ne peut conclure à court terme.',
    })
  }
  if (rows.every(row => row.betSize === 'very_large' && row.betAccess === 'closed')) {
    notes.push({
      code: 'only_closed_large_accounts',
      message: 'Tous les comptes « maintenant » sont de très grands comptes fermés : aucun accès direct déclaré.',
    })
  }
  return notes
}
