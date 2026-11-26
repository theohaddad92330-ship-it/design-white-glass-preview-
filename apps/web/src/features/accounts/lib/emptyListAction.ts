/**
 * Ce qu'on PROPOSE quand la liste de comptes ne rend rien (#1134, généralisé
 * le 30/08 — manque C).
 *
 * La liste cherche dans le PORTEFEUILLE, pas dans le monde : une société qui
 * existe mais qu'on n'a jamais analysée n'y figure pas. L'état vide ne
 * proposait que « modifie ta recherche ou réinitialise les filtres » — deux
 * gestes qui, précisément dans ce cas, ne peuvent RIEN faire apparaître. Le
 * retour du testeur est donc la bonne question posée au bon endroit : il a
 * cherché un nom réel, l'écran a répondu « aucun résultat », et rien ne lui
 * disait que le geste suivant était de lancer une analyse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE 30/08 : UN SEUL FILTRE SUR QUATRE ÉTAIT NOMMÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le rangement du cycle commercial (`lifecycle`) était le SEUL axe de
 * restriction que l'écran savait NOMMER dans son état vide : « aucun de tes
 * comptes n'est rangé en “À potentiel” ». Un filtre de statut, de score, de
 * secteur ou de priorité qui ne rendait rien recevait le message générique du
 * portefeuille FILTRÉ, sans jamais dire LEQUEL des filtres posés était en
 * cause — le motif connu « cassé et non mesurable se ressemblent », ici en
 * version « un filtre nommé et un filtre tu se ressemblent ».
 *
 * `filters` remplace donc « le rangement, ou rien » par LA LISTE des axes de
 * restriction actifs — quelle que soit leur nature. Cette fonction ne connaît
 * AUCUN filtre par son nom : elle ne fait que COMPTER des axes, ce qui est
 * précisément ce qui la généralise sans ajouter un cas par filtre.
 *
 *  - AUCUN axe actif : « analyser » si un nom est tapé, sinon rien à relâcher ;
 *  - EXACTEMENT UN axe actif : on le NOMME et on offre de le retirer, SEUL —
 *    jamais un geste qui coûte des crédits pour un problème qu'un clic résout,
 *    et jamais « les filtres » au pluriel devant une barre qui n'en montre
 *    qu'un — que cet axe soit une pastille de la barre de filtres OU le
 *    rangement du cycle commercial (qui n'en a ni pastille ni onglet) ;
 *  - PLUSIEURS axes actifs à la fois : on ne sait plus dire LEQUEL retirer
 *    isolément — le geste générique (« réinitialiser les filtres ») reste.
 *
 * Pur et testé plutôt qu'un ternaire dans le JSX : la distinction porte une
 * décision produit (quand a-t-on le droit de proposer un débit de crédits), et
 * une décision se relit.
 */

/**
 * Un axe de restriction NOMMÉ — une pastille de la barre de filtres
 * (`status` / `score` / `sector` / `gate` / `accessClass`…) ou le rangement du
 * cycle commercial (`lifecycle`). `id` n'est jamais lu par cette fonction :
 * c'est l'appelant, qui a la traduction, qui transforme `{id, value}` en
 * phrase.
 *
 * Non exporté, comme `EmptyListAction` ci-dessous : un appelant construit un
 * littéral `{id, value}[]` et TypeScript le vérifie STRUCTURELLEMENT, sans
 * import — exporter ce nom violerait « un type consommé dans son seul fichier
 * ne s'exporte pas » (`pnpm lint:exports:types`).
 */
type NarrowingFilterAxis = { readonly id: string; readonly value: string }

/** Non exporté : consommé par la seule fonction ci-dessous, et inféré par
 *  l'appelant depuis son retour. Un type qui ne sort pas de son fichier ne
 *  s'exporte pas — `pnpm lint:exports:types` le refuse. */
type EmptyListAction =
  | { kind: 'analyse'; company: string }
  | { kind: 'namedFilter'; axis: NarrowingFilterAxis }
  | { kind: 'filters' }

export function emptyListAction(query: string, filters: readonly NarrowingFilterAxis[] = []): EmptyListAction {
  const company = query.trim()
  // Un SEUL axe actif, de N'IMPORTE QUELLE nature : on le nomme, on offre de
  // le retirer seul, et JAMAIS « analyser » — même avec un nom tapé, la
  // société est peut-être déjà là, simplement hors du rayon que cet axe pose.
  if (filters.length === 1) return { kind: 'namedFilter', axis: filters[0]! }
  // Plusieurs axes : on ne sait plus lequel nommer isolément.
  if (filters.length > 1) return { kind: 'filters' }
  // Aucun axe. Sans nom tapé, seuls des filtres à facettes pourraient être
  // posés — et il n'y en a aucun ici : le geste utile serait de les relâcher,
  // mais il n'y a rien à relâcher.
  if (!company) return { kind: 'filters' }
  return { kind: 'analyse', company }
}
