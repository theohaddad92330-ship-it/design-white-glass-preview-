import { z } from 'zod'

/**
 * Le board d'EFFORT (tome 5 §28-31) — trois colonnes et une sortie.
 *
 * Il ne remplace ni la porte de priorité (`priority_gate` : ai-je décidé de
 * travailler ce compte ?), ni l'état de relation (`commercial_status` : où en
 * est la relation ?). Il répond à une troisième question, que personne ne
 * posait : **combien d'énergie je mets sur ce compte, cette semaine ?**
 *
 * Les fusionner serait la faute que le dépôt s'interdit depuis le PDF 2 (« à ne
 * JAMAIS fusionner avec `commercial_status`, ce sont deux axes ») : un compte
 * prioritaire peut être en qualification au volume, et un compte en veille peut
 * mériter l'effort maximum le jour où il bouge.
 *
 * La règle qui fait la valeur du système est le PLAFOND. Sans lui, le sprint
 * Focus se remplit, l'effort maximum devient l'effort moyen, et le principe
 * tombe entier — c'est l'erreur n°6 du document Pariente, écrite noir sur
 * blanc : « lancer 30 comptes en même temps ».
 */

/**
 * `watch` et `partner_route` — AJOUTÉS EN FIN (GA-08, BEL-SC-228, #3257) —
 * ne remplacent rien des quatre niveaux d'origine, ils comblent deux manques
 * nommés par le ticket :
 *
 *  - `watch` : un compte compatible, sans motif d'action ACTUEL — signaux
 *    suivis, aucune énergie engagée, une condition de réveil nommée
 *    ({@link sprintDecisionProblems}). Avant ce lot, ce compte sortait
 *    simplement du board (`sprint = NULL`) : invisible, et sa condition de
 *    réveil nulle part écrite.
 *  - `partner_route` : la voie d'entrée passe par une ESN partenaire ou un
 *    rang 2, pas par un effort direct. Distinct de `accountAccessLevel`
 *    (`partner.ts`), qui CONSTATE l'accès : ce niveau est la DÉCISION d'y
 *    mettre l'effort en conséquence, pas le fait d'accès lui-même.
 *
 * Le ticket nomme aussi `SPRINT` et `NO_GO` comme catégories : `NO_GO` EST
 * déjà ce niveau (aucune 5ᵉ/7ᵉ valeur à inventer), et « un compte activé sur
 * une période courte pour tester une hypothèse » est déjà `extension` —
 * `SPRINT_RULES.extension` porte exactement cette cadence courte, sans plan
 * requis. Créer une septième valeur au même sens aurait été le second objet
 * concurrent que la doctrine interdit.
 */
export const SPRINT_LEVELS = ['focus', 'extension', 'volume', 'no_go', 'watch', 'partner_route'] as const
export type SprintLevel = (typeof SPRINT_LEVELS)[number]

/**
 * #3257.7b — les deux réponses possibles à « quelle est la prochaine action de
 * ce compte ? » : la tâche ouverte à venir existe (`do_next_task`, son titre
 * vient de `tasks`), ou rien n'est programmé (`schedule_next_action`). Le
 * libellé et le lien vivent dans `next-action.ts` (dérivation unique, GA-26).
 */
export const ACCOUNT_SPRINT_NEXT_ACTIONS = ['do_next_task', 'schedule_next_action'] as const
export type AccountSprintNextAction = (typeof ACCOUNT_SPRINT_NEXT_ACTIONS)[number]

/** Le plafond DUR du sprint Focus (D80). Huit comptes, pas neuf. */
export const FOCUS_MAX_ACCOUNTS = 8

export interface SprintRules {
  /** `null` = pas de plafond ; le volume ne se borne pas, c'est son objet. */
  maxAccounts: number | null
  /** Un plan de compte complet est-il attendu à ce niveau ? */
  planRequired: boolean
  /**
   * La fourchette de contacts travaillés à ce niveau. `null` = sans objet.
   *
   * ⚠️ **DÉCLARÉ ET LU PAR PERSONNE — 01/09/2026, et c'est un constat, pas un
   * oubli qu'on découvre.** C'est le même motif que `planRequired` avant N15-B :
   * une règle écrite cinq fois qu'aucun appelant n'ouvre.
   *
   * ## Pourquoi l'erreur bloquante n°12 (« contacter hors sprint ») n'est pas
   * livrée avec ce lot
   *
   * Le refus est CHECKABLE — `accounts.sprint` porte le niveau, et `no_go`
   * écrit déjà son interdit dans `forbidden` (« Ne pas y revenir sans un signal
   * neuf »). Ce qui manque n'est pas la règle, c'est son POINT D'APPLICATION :
   * un refus de contact doit tomber là où l'on agit sur un contact, c'est-à-dire
   * dans le module `contacts` — hors du périmètre d'écriture de ce lot, qui
   * tournait en parallèle de dix autres.
   *
   * Livrer ici la fonction pure sans son appelant aurait reproduit exactement le
   * défaut que l'audit qui la demande passe son temps à nommer : « du code juste,
   * calculé, testé, que personne n'appelle ». Une règle sans appelant est une
   * règle qui n'existe pas, et elle est PIRE qu'une absence — elle se compte
   * comme livrée.
   *
   * ## Ce qu'il faut faire, et dans quel ordre
   *
   * 1. `contactOutOfSprintProblems(level: SprintLevel | null): string[]` ici,
   *    sur le modèle EXACT de {@link sprintEntryProblems} — règle et message
   *    dans le contrat, la décision reste au service ;
   * 2. l'appeler depuis le geste qui enregistre une action sur un contact
   *    (`ContactsService`), et transformer le tableau non vide en
   *    `BadRequestException` — 400 et non 409 : c'est la requête qui est
   *    incomplète, pas l'état du board qui bloque ;
   * 3. deux niveaux refusent, et pas pour la même raison : `no_go` (« on a
   *    décidé de ne pas y aller ») et `null` (« ce compte n'est sur aucun
   *    niveau »). Les fondre dans un seul message ferait perdre celle des deux
   *    qui s'apprend.
   *
   * ⚠️ Ne PAS le brancher sur `applyEvent` : cette voie est automatique, et son
   * docblock explique déjà pourquoi elle n'applique aucun blocage — une bonne
   * nouvelle doit continuer de faire avancer le compte.
   */
  contacts: [number, number] | null
  /** Les relances prévues, en jours. Vide = aucune relance à ce niveau. */
  relances: number[]
  /** Ce qu'on s'interdit à ce niveau — la moitié utile du tableau. */
  forbidden: string[]
}

export const SPRINT_RULES: Record<SprintLevel, SprintRules> = {
  focus: {
    maxAccounts: FOCUS_MAX_ACCOUNTS,
    planRequired: true,
    contacts: [10, 20],
    relances: [3, 7],
    forbidden: ['Aucun message générique.', 'Aucune séquence automatisée non personnalisée.'],
  },
  extension: {
    maxAccounts: null,
    planRequired: false,
    contacts: [5, 10],
    relances: [5],
    forbidden: ['Pas d’effort maximum d’emblée — c’est ce qui vide le Focus.'],
  },
  volume: {
    maxAccounts: null,
    planRequired: false,
    contacts: [3, 5],
    relances: [],
    forbidden: ['Pas de plan de compte. Un compte qui en demande un passe en Extension.'],
  },
  no_go: {
    maxAccounts: null,
    planRequired: false,
    contacts: null,
    relances: [],
    forbidden: ['Ne pas y revenir sans un signal neuf.'],
  },
  watch: {
    maxAccounts: null,
    planRequired: false,
    contacts: null,
    relances: [],
    forbidden: ['Aucune relance active — la veille se réactive par un signal, pas par une cadence.'],
  },
  partner_route: {
    maxAccounts: null,
    planRequired: false,
    contacts: null,
    relances: [],
    forbidden: ['Travailler ce compte en direct duplique l’effort du partenaire — l’énergie passe par lui.'],
  },
}

/**
 * BEL-SC-228 (#3257) — « chaque compte affiche : catégorie, raison, effort
 * estimé, owner, date de revue, condition de promotion, condition de
 * déclassement, prochaine action. »
 *
 * Générique aux SIX niveaux (doctrine c75) — un même petit formulaire, jamais
 * un par catégorie. `owner` et `prochaine action` ne sont PAS repris ici :
 * `owner` est déjà porté par `accounts.assigned_to` (`accountOwnerSchema`),
 * et « prochaine action » par `action_plans` — les doubler ferait le second
 * objet concurrent que la doctrine interdit. Ce type ne porte que ce qui
 * n'existait nulle part ailleurs.
 *
 * Tous nullable : la plupart des comptes d'un niveau n'ont besoin d'aucun —
 * `no_go`/`watch` sont les deux seuls à en EXIGER un ({@link sprintExitProblems},
 * {@link sprintDecisionProblems}), le reste est une précision optionnelle.
 */
export interface SprintDecisionFields {
  /** Pourquoi ce compte est à ce niveau — distinct de `sprint_exit_reason`,
   *  qui ne porte que le motif de SORTIE vers `no_go`. */
  reason: string | null
  /** Combien d'énergie, EN CLAIR — jamais un nombre hardcodé de comptes : le
   *  ticket refuse justement « trois Focus pour tous ». */
  effortEstimate: string | null
  /** Prochaine date à laquelle ce classement se rediscute (ISO `YYYY-MM-DD`). */
  reviewAt: string | null
  /** Ce qui ferait monter ce compte — la condition de réveil de `watch` EST
   *  cette condition (pas un second champ, voir {@link sprintDecisionProblems}). */
  promotionCondition: string | null
  /** Ce qui ferait descendre ou sortir ce compte. */
  demotionCondition: string | null
}

/**
 * Les évènements qui font bouger un compte d'un niveau à l'autre.
 *
 * ⚠️ GA-08 : un enum ne perd jamais de valeur et n'en insère jamais une au
 * milieu. `became_client` est ajouté en FIN de liste (D462) — la conclusion
 * commerciale la plus forte, qui manquait. Aucune règle de `shouldSwitch` ne
 * lui donne encore de transition : ce lot le rend RECEVABLE (validé côté API,
 * accepté par `applyEvent`, sans effet faute de règle) ; ce qu'il doit faire
 * au board reste une décision produit à trancher séparément — l'inventer ici
 * serait une donnée de comportement fictive.
 */
export const SPRINT_EVENTS = [
  'positive_reply',
  'meeting_booked',
  'two_relances_no_reply',
  'thirty_days_idle',
  'asks_for_plan',
  'strong_signal',
  'became_client',
  // #3257.8 — AJOUTÉS EN FIN (GA-08) : les deux évènements qui font entrer ou
  // sortir un compte de `watch` / `partner_route`.
  'wake_condition_met',
  'partner_access_found',
] as const
export type SprintEvent = (typeof SPRINT_EVENTS)[number]

/**
 * #3262.25 (épopée #3262, lot R11 29/09) — LE NOMBRE DE JOURS QUE NOMME
 * `'thirty_days_idle'` LUI-MÊME, comme constante réutilisable.
 *
 * L'évènement porte déjà sa cadence dans son propre nom (GA-26 : un réglage
 * vit à un seul endroit) — aucun appelant ne le mesurait encore avant ce lot.
 * Une bande de décision qui compterait les comptes `focus` trop anciens sans
 * cette constante recopierait `30` à la main, un second endroit qui pourrait
 * diverger du nom de l'évènement.
 */
export const FOCUS_STALE_DAYS = 30

export interface SprintSwitch {
  to: SprintLevel
  /** `true` = appliquée sans demander. Deux règles seulement, celles qui font
   *  MONTER l'effort : une bonne nouvelle ne se met pas en attente. */
  automatic: boolean
  reason: string
}

/**
 * Ce qu'un évènement fait au niveau d'effort d'un compte, ou `null`.
 *
 * Deux bascules sont automatiques, et ce sont les deux qui montent : une
 * réponse positive et un rendez-vous obtenu. Les cinq autres — celles qui
 * REDUISENT l'effort ou qui ferment — sont **proposées**. Descendre l'effort
 * d'un compte à la place du commercial, c'est décider à sa place d'abandonner.
 */
export function shouldSwitch(level: SprintLevel, event: SprintEvent): SprintSwitch | null {
  if (event === 'positive_reply' && level === 'volume')
    return { to: 'extension', automatic: true, reason: 'Réponse positive en qualification : le compte mérite un test.' }
  if (event === 'positive_reply' && level === 'no_go')
    return {
      to: 'extension',
      automatic: false,
      reason: 'Réponse positive sur un compte écarté — proposition de réouverture.',
    }
  if (event === 'meeting_booked' && (level === 'extension' || level === 'volume'))
    return { to: 'focus', automatic: true, reason: 'Rendez-vous obtenu : l’effort maximum se justifie maintenant.' }
  if (event === 'two_relances_no_reply' && level === 'extension')
    return { to: 'no_go', automatic: false, reason: 'Deux relances sans réponse — sortir, avec le motif.' }
  if (event === 'thirty_days_idle' && level === 'focus')
    return {
      to: 'extension',
      automatic: false,
      reason: 'Trente jours sans mouvement : l’effort maximum n’est pas éternel.',
    }
  if (event === 'asks_for_plan' && level === 'volume')
    return { to: 'extension', automatic: false, reason: 'Le compte demande plus qu’une qualification.' }
  if (event === 'strong_signal' && level === 'no_go')
    return { to: 'volume', automatic: false, reason: 'Signal fort sur un compte écarté — proposition de réouverture.' }
  // #3257.8 — les mouvements NOMMÉS de `watch` et `partner_route`. Aucun n'est
  // automatique : ni réveiller ni router par un partenaire ne se décide à la
  // place du commercial. Elles sont donc PROPOSÉES (jamais écrites au journal
  // `sprint_switches`, dont la contrainte ne connaît que les quatre niveaux
  // d'origine : si l'une devient automatique un jour, élargir la contrainte
  // AVANT le code, GA-11/GA-12).
  if (event === 'wake_condition_met' && level === 'watch')
    return {
      to: 'extension',
      automatic: false,
      reason: 'La condition de réveil de ce compte en veille est remplie — proposition de le réveiller en extension.',
    }
  if (event === 'strong_signal' && level === 'watch')
    return {
      to: 'extension',
      automatic: false,
      reason: 'Signal fort sur un compte en veille — proposition de le réveiller en extension.',
    }
  if (
    event === 'partner_access_found' &&
    (level === 'focus' || level === 'extension' || level === 'volume' || level === 'watch')
  )
    return {
      to: 'partner_route',
      automatic: false,
      reason: 'Un partenaire ouvre la voie d’entrée — proposition de passer en route partenaire.',
    }
  return null
}

export interface FocusAdmission {
  allowed: boolean
  /** En clair, avec le chiffre. Un refus sans son compte se lit comme un bug. */
  reason: string | null
}

/**
 * Le sprint Focus accepte-t-il un compte de plus ?
 *
 * C'est la seule règle BLOQUANTE du board, et elle l'est par nécessité : le
 * plafond n'a de sens que s'il refuse. « Focus est plein, sors-en un d'abord »
 * est un message désagréable et c'est exactement ce qu'on veut — sinon on
 * réinvente la liste de trente comptes travaillés à moitié.
 */
export function canEnterFocus(currentCount: number, capacity: number = FOCUS_MAX_ACCOUNTS): FocusAdmission {
  if (currentCount < capacity) return { allowed: true, reason: null }
  return {
    allowed: false,
    reason: `Le sprint Focus est plein (${currentCount}/${capacity} comptes). Sors-en un avant d’en ajouter un autre — l’effort maximum sur trop de comptes n’est plus un effort maximum.`,
  }
}

/**
 * Le plafond du Focus, PAS hardcodé pour tout le monde (BEL-SC-228, #3257 —
 * « ne pas hardcoder trois Focus pour tous les utilisateurs »).
 *
 * `FOCUS_MAX_ACCOUNTS` reste le plafond PAR COMMERCIAL — la règle D80 ne
 * change pas de valeur, elle cesse seulement d'être appliquée une seule fois
 * pour tout l'espace. Un espace de trois commerciaux peut tenir trois fois
 * plus de comptes en Focus sans que l'effort par compte baisse : le plafond
 * protège l'INTENSITÉ par compte, pas un total absolu.
 *
 * `null`/`undefined`/`0` retombent sur {@link FOCUS_MAX_ACCOUNTS} tel quel —
 * AUCUNE régression sur un espace dont la taille d'équipe n'est pas connue ou
 * n'a qu'un seul commercial, ce qui est la quasi-totalité du parc actuel.
 */
export function focusCapacityFor(commercialCount: number | null | undefined): number {
  if (!commercialCount || commercialCount <= 1) return FOCUS_MAX_ACCOUNTS
  return FOCUS_MAX_ACCOUNTS * commercialCount
}

/** Sortir un compte exige son motif : sans lui, on le remettra dans six mois. */
export function sprintExitProblems(to: SprintLevel, reason: string | null | undefined): string[] {
  if (to !== 'no_go') return []
  return (reason ?? '').trim().length >= 3 ? [] : ['Sortir un compte demande son motif.']
}

/**
 * BEL-SC-228 (#3257) — LA DÉCISION QUI ACCOMPAGNE UN NIVEAU, générique à tous
 * (doctrine c75 : un formulaire générique, pas treize dédiés). Aujourd'hui une
 * seule règle bloquante : entrer en `watch` exige sa condition de réveil, sans
 * quoi rien ne dit jamais quand y revenir — exactement le symptôme du ticket
 * (« Découvrir renvoie 100 comptes prioritaires » : un compte mis de côté sans
 * dire pourquoi il y reviendrait un jour).
 */
export function sprintDecisionProblems(
  to: SprintLevel,
  decision: { promotionCondition: string | null | undefined },
): string[] {
  if (to !== 'watch') return []
  return (decision.promotionCondition ?? '').trim().length > 0
    ? []
    : ['Passer un compte en veille demande sa condition de réveil — ce qui doit se produire pour y revenir.']
}

/**
 * Entrer en Focus exige-t-il un plan de compte ? (N15-B)
 *
 * `SPRINT_RULES.*.planRequired` était déclaré cinq fois — le type, et une
 * valeur par niveau — et lu par AUCUN appelant : la règle « ce board exige un
 * plan avant d'entrer en focus » était écrite, versionnée, relue en revue…
 * sans le moindre effet. Cette fonction est l'appelant qu'elle n'avait
 * jamais eu.
 *
 * Un refus MUET est pire que pas de règle — il se lit comme un bug. Le
 * message dit donc ce qui manque, avec le geste attendu.
 *
 * ⚠️ Ne s'applique qu'à un geste MANUEL (`SprintsService.move`). La bascule
 * AUTOMATIQUE (`SprintsService.applyEvent`, sur `meeting_booked`) n'appelle
 * jamais cette fonction : bloquer une bonne nouvelle parce que le plan
 * manque reviendrait à faire porter à l'absence de plan une décision que
 * l'utilisateur n'a pas prise. Si ce comportement doit changer un jour,
 * c'est un arbitrage produit à trancher séparément, pas une déduction du
 * code.
 */
export function sprintEntryProblems(to: SprintLevel, hasPlan: boolean): string[] {
  if (!SPRINT_RULES[to].planRequired) return []
  if (hasPlan) return []
  return ['Ce compte n’a pas de plan de compte — écris-en un avant d’entrer en Focus.']
}

/**
 * Les deux FILES du board (P6) — la vue, pas une permission.
 *
 * Le dépôt n'a pas de rôle « qui arbitre » / « qui exécute » : neuf rôles
 * existent (`workspace.ts`, `workspaceRoleValues`), et aucun ne porte cette
 * distinction — `owner`, `admin`, `sales_ops`, `sales`, `member` peuvent
 * TOUS écrire sur ce board (`records:write`). Séparer par PERMISSION
 * inventerait une donnée que l'espace ne fournit pas ; ce serait aussi une
 * régression pour l'ESN à un seul commercial, qui arbitre ET exécute. C'est
 * donc une VUE : chacun choisit la file qu'il regarde ; rien n'est imposé
 * côté serveur, et `GET /sprints` continue de rendre le board complet.
 *
 * La coupure suit une distinction déjà écrite dans `SPRINT_RULES`, pas une
 * opinion neuve :
 *  - **arbitrage** (où va l'effort) = les deux niveaux GATÉS, où entrer ou
 *    sortir est une DÉCISION qui peut être REFUSÉE : Focus (plafond dur de
 *    `FOCUS_MAX_ACCOUNTS`, plan de compte exigé) et Sortis (motif de sortie
 *    obligatoire, `sprintExitProblems`).
 *  - **exécution** (faire l'effort) = Extension et Volume, la cadence qui
 *    tourne une fois la décision prise (relances, contacts), sans porte
 *    d'entrée ni de sortie.
 *
 * Si un jour le dépôt distingue vraiment qui arbitre de qui exécute (un
 * champ sur le membre, une permission dédiée), cette table est l'endroit où
 * le brancher — la vue deviendrait un défaut plutôt qu'un choix. Tant que
 * cette donnée n'existe pas, l'inventer serait la faute que ce lot évite.
 */
export const SPRINT_LANES = ['arbitrage', 'execution'] as const
export type SprintLane = (typeof SPRINT_LANES)[number]

/**
 * `watch` et `partner_route` rejoignent l'arbitrage (BEL-SC-228) : aucun des
 * deux n'est une cadence de contact qu'on EXÉCUTE cette semaine — l'un dit
 * qu'on n'y met aucune énergie pour l'instant, l'autre que l'énergie va au
 * partenaire plutôt qu'au compte. Les deux sont donc des décisions sur OÙ va
 * l'effort, exactement le critère qui range déjà Focus et Sortis ici.
 */
export const SPRINT_LANE_LEVELS: Record<SprintLane, readonly SprintLevel[]> = {
  arbitrage: ['focus', 'no_go', 'watch', 'partner_route'],
  execution: ['extension', 'volume'],
}

/**
 * La partition niveau→file est-elle valide ? Chaque niveau de `SPRINT_LEVELS`
 * doit apparaître dans EXACTEMENT une file — ni deux (chevauchement), ni
 * zéro (niveau orphelin, invisible des deux vues).
 *
 * Prend `laneLevels` en paramètre (par défaut `SPRINT_LANE_LEVELS`, la vraie
 * table) uniquement pour que la garde d'architecture puisse lui passer une
 * table volontairement cassée et prouver qu'elle le détecte.
 */
export function sprintLanePartitionProblems(
  laneLevels: Record<SprintLane, readonly SprintLevel[]> = SPRINT_LANE_LEVELS,
): string[] {
  const lanesByLevel = new Map<SprintLevel, SprintLane[]>()
  for (const lane of SPRINT_LANES) {
    for (const level of laneLevels[lane]) {
      lanesByLevel.set(level, [...(lanesByLevel.get(level) ?? []), lane])
    }
  }
  const problems: string[] = []
  for (const level of SPRINT_LEVELS) {
    const lanes = lanesByLevel.get(level) ?? []
    if (lanes.length === 0) problems.push(`${level} n'est dans aucune file.`)
    if (lanes.length > 1) problems.push(`${level} est dans plusieurs files : ${lanes.join(', ')}.`)
  }
  return problems
}

/**
 * Sépare un board (comptes groupés par niveau, comme le rend
 * `SprintsService.board()`) en deux files, par id de compte.
 *
 * `laneLevels` n'est un paramètre que pour la garde d'architecture — elle
 * prouve qu'une correspondance niveau→file cassée fait apparaître un compte
 * dans les deux files (voir `laneOverlap`).
 */
export function splitBoardByLane<Account extends { id: string }>(
  board: Record<SprintLevel, readonly Account[]>,
  laneLevels: Record<SprintLane, readonly SprintLevel[]> = SPRINT_LANE_LEVELS,
): Record<SprintLane, string[]> {
  const files = {} as Record<SprintLane, string[]>
  for (const lane of SPRINT_LANES) {
    files[lane] = laneLevels[lane].flatMap(level => board[level].map(account => account.id))
  }
  return files
}

/**
 * Les ids de compte présents dans LES DEUX files — vide si la règle de
 * non-chevauchement (P6) tient. Non vide = la garde d'architecture doit
 * rougir.
 */
export function laneOverlap(files: Record<SprintLane, string[]>): string[] {
  const execution = new Set(files.execution)
  return files.arbitrage.filter(id => execution.has(id))
}

/**
 * #3405.3 — LA GARDE NO-GO, UNE SEULE RÈGLE POUR TOUS LES APPELANTS QUI RÉDIGENT.
 *
 * « Ne jamais relancer un NO-GO sans nouveau motif » : `accounts.sprint = 'no_go'`
 * est déjà un geste humain daté et motivé ; en sortir exige un nouveau niveau
 * (donc un nouveau motif). Bloquer tant que le niveau vaut `no_go` EST la règle.
 * Renvoie la phrase de refus, ou `null` quand rien ne s'oppose à la rédaction.
 *
 * Extraite de `ActionRouterService.dispatchGenerateMessage` pour que les trois
 * autres appelants de `IaClient.generateMessage` (endpoint de brouillon,
 * relance automatique d'une routine, aperçu de style) disent la MÊME chose —
 * un réglage vit à un seul endroit (GA-26).
 */
export function noGoMessageRefusal(
  sprint: string | null | undefined,
  sprintReason: string | null | undefined,
): string | null {
  if (sprint !== 'no_go') return null
  return sprintReason
    ? `Ce compte est en NO-GO (${sprintReason}) : pas de relance sans nouveau motif.`
    : 'Ce compte est en NO-GO : pas de relance sans nouveau motif.'
}
