import { z } from 'zod'

/**
 * Les règles d'interaction déjà arbitrées — Tome 7, §7, §25 et §28.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois chapitres entiers du tome 7 n'étaient nommés dans AUCUN des trois
 * trackers censés le clore : les douze lois d'interaction (§28), les neuf
 * conflits de placement (§7) et les neuf règles de rendu graphique (§25).
 *
 * Ce n'est pas un oubli de lecture, c'est un défaut de forme : les trackers
 * reprennent les LOIS des chapitres et jettent les TABLEAUX qui les appliquent.
 * Or ces trente lignes sont déjà tranchées — il n'y a rien à décider, seulement
 * à ne pas les perdre. Les laisser dans un PDF garantit qu'on les redemandera
 * au premier écran qui les rencontre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE REGISTRE FAIT, ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il DÉCRIT. Il n'exécute rien, comme `flow-registry` et `doctrine-registry`.
 * Chaque règle porte son état — `guarded` quand un test tomberait, `held` quand
 * elle est appliquée sans filet, `open` quand personne ne la tient — et l'état
 * `open` exige de dire POURQUOI, sans quoi le registre deviendrait une liste de
 * bonnes intentions.
 *
 * ⚠️ Une règle n'est pas gardée parce qu'elle est importante. Elle l'est quand
 * une violation est MESURABLE : « le produit ne félicite pas » se garde (on
 * cherche « bravo » et les confettis), « un écran, une décision principale » ne
 * se garde pas (il faudrait reconnaître la dominance visuelle dans du JSX).
 */

export const INTERACTION_RULE_STATES = ['guarded', 'held', 'open'] as const
export const interactionRuleStateSchema = z.enum(INTERACTION_RULE_STATES)
export type InteractionRuleState = (typeof INTERACTION_RULE_STATES)[number]

export const INTERACTION_RULE_FAMILIES = ['law', 'placement', 'dataviz'] as const
export const interactionRuleFamilySchema = z.enum(INTERACTION_RULE_FAMILIES)

export const interactionRuleSchema = z.object({
  key: z.string().min(1),
  family: interactionRuleFamilySchema,
  /** La règle, à la forme où on la cite pour refuser une maquette. */
  rule: z.string().min(1),
  state: interactionRuleStateSchema,
  /** Ce qui la tient, en chemins relatifs. Vide quand `open`. */
  holders: z.array(z.string().min(1)),
  /** Pourquoi elle n'est pas gardée. Exigé dès que l'état n'est pas `guarded` :
   *  une règle sans filet ET sans explication est une règle qu'on perdra. */
  gap: z.string().min(1).nullable(),
})
export type InteractionRule = z.infer<typeof interactionRuleSchema>

/** §28 — les douze lois. Elles tranchent les cas qu'aucune spécification
 *  d'écran ne prévoit, ce qui est précisément pourquoi elles doivent vivre
 *  ailleurs que dans une spécification d'écran. */
const LAWS: InteractionRule[] = [
  {
    key: 'law_nothing_is_lost',
    family: 'law',
    rule: 'Rien ne se perd : toute action destructive a une annulation de 5 s, et tout objet supprimé reste 30 jours.',
    state: 'held',
    holders: ['packages/contracts/src/schemas/import.ts'],
    gap: "Tenue là où elle a été payée — l'annulation d'import garde ce qu'un humain a touché — et nulle part ailleurs. Aucune corbeille de 30 jours n'existe : les suppressions du produit sont des archivages, ce qui donne le même résultat sans porter le nom.",
  },
  {
    key: 'law_nothing_leaves_without_a_click',
    family: 'law',
    rule: 'Rien ne part sans clic : aucune action externe sans validation, sauf aux niveaux N4/N5 avec leurs garde-fous.',
    state: 'guarded',
    holders: ['packages/contracts/src/schemas/effect-panel.ts', 'packages/contracts/src/schemas/effect-panel.test.ts'],
    gap: null,
  },
  {
    key: 'law_nothing_moves_under_the_cursor',
    family: 'law',
    rule: "Rien ne bouge sous le curseur : une liste ne se réordonne jamais pendant qu'on la lit ; un rafraîchissement PROPOSE « 3 nouveaux ».",
    state: 'open',
    holders: [],
    gap: "Le tome la désigne comme « celle qu'on viole le plus facilement ». Rien ne la tient : les listes se re-rendent à l'invalidation de leur requête, et un score recalculé peut déplacer une ligne sous le doigt. Se garde mal (il faudrait observer un rendu), se répare écran par écran.",
  },
  {
    key: 'law_one_screen_one_decision',
    family: 'law',
    rule: "Un écran, une décision principale : un seul appel à l'action visuellement dominant.",
    state: 'open',
    holders: [],
    gap: 'Non gardable : reconnaître la dominance visuelle dans du JSX demanderait de rendre la page et de la mesurer. Tenue par la revue.',
  },
  {
    key: 'law_empty_is_information',
    family: 'law',
    rule: "Le vide est une information : jamais d'écran blanc, toujours pourquoi c'est vide et comment le remplir.",
    state: 'guarded',
    holders: [
      'apps/api/src/architecture/qualified-empty-lists.spec.ts',
      'apps/web/src/architecture/display-primitives.test.ts',
    ],
    gap: "Gardée côté API (une route de connecteur ne rend jamais un tableau nu) et côté primitives d'affichage. Un écran qui rend une liste vide sans phrase reste possible.",
  },
  {
    key: 'law_errors_name_the_gesture',
    family: 'law',
    rule: "L'erreur nomme le geste : jamais « une erreur est survenue », toujours quoi faire.",
    state: 'guarded',
    holders: ['packages/contracts/src/schemas/connector-error.ts'],
    gap: "Gardée sur les connecteurs, où l'écart coûtait une journée (« réessaie plus tard » sur une portée jamais accordée). Les erreurs génériques du reste du produit ne le sont pas.",
  },
  {
    key: 'law_keyboard_does_everything',
    family: 'law',
    rule: 'Le clavier fait tout : toute action à la souris a un équivalent clavier.',
    state: 'guarded',
    holders: ['apps/web/src/architecture/accessible-names.test.ts'],
    gap: "GA-35 impose qu'un élément cliquable soit un `<button>` — donc tabulable et actionnable au clavier. L'équivalent des gestes composés (glisser-déposer du pipe) n'existe pas.",
  },
  {
    key: 'law_navigation_is_reversible',
    family: 'law',
    rule: "La navigation est réversible : le retour arrière ramène à l'état exact, filtres compris.",
    state: 'open',
    holders: [],
    gap: "Conséquence directe de la loi suivante : sans état dans l'URL, le retour arrière ne peut pas restaurer un filtre. Se répare avec elle.",
  },
  {
    key: 'law_state_lives_in_the_url',
    family: 'law',
    rule: "L'état est dans l'URL : filtres, onglet, objet ouvert — une vue se partage par un lien.",
    state: 'open',
    holders: [],
    gap: "MESURÉ le 25/08 : vingt-trois écrans tiennent un état de vue (onglet, filtre, recherche, période) dans un `useState` sans le refléter dans l'URL. Un commercial ne peut donc pas envoyer « regarde cette vue » à son responsable. Non gardée par un cliquet malgré la mesure : le signal attrape aussi des états qui n'ont RIEN à faire dans une URL — le mode d'un formulaire de connexion, la recherche interne d'un champ — et une garde qui crie sur du code légitime s'apprend à être ignorée. Se répare écran par écran, en commençant par ceux qu'on partage : le portefeuille, la veille, le centre d'actions.",
  },
  {
    key: 'law_missing_data_is_named',
    family: 'law',
    rule: 'La donnée manquante est nommée : « il manque la date de fin », jamais « données incomplètes ».',
    state: 'guarded',
    holders: [
      'apps/web/src/architecture/display-primitives.test.ts',
      'packages/contracts/src/schemas/measurability.ts',
    ],
    gap: null,
  },
  {
    key: 'law_no_congratulations',
    family: 'law',
    rule: 'Le produit ne félicite pas : pas de confettis, pas de « bravo ».',
    state: 'guarded',
    holders: ['apps/web/src/i18n/lexicon.test.ts'],
    gap: null,
  },
  {
    key: 'law_silence_is_valid',
    family: 'law',
    rule: 'Le silence est un état valide : rien à dire ⇒ rien affiché, et on ne commente pas le silence.',
    state: 'held',
    holders: ['apps/web/src/features/laura/useLaura.ts'],
    gap: "Appliquée là où elle compte le plus — Laura ne rend rien quand elle se tait, pas même un « tout va bien ». Rien n'empêche un autre écran d'annoncer son propre silence.",
  },
]

/** §7 — les neuf conflits de placement, DÉJÀ tranchés. Ils ne coûtent rien à
 *  enregistrer et évitent de rouvrir neuf débats au premier écran concerné. */
const PLACEMENTS: InteractionRule[] = [
  [
    'placement_needs',
    'Les besoins : drawer projet POUR le contexte, écran dédié POUR la vue transverse du recruteur — les deux, deux personas.',
  ],
  [
    'placement_submissions',
    "Les positionnements : onglet de la fiche talent pour l'historique, écran dédié pour le suivi actif — les deux.",
  ],
  [
    'placement_matching',
    'Le matching : un DRAWER avec URL partageable, jamais un écran — il se fait depuis un besoin ou un talent, jamais dans le vide.',
  ],
  [
    'placement_incumbents',
    "Les ESN présentes : onglet ACCÈS, pas Partenaires — c'est une information d'accès avant d'être une relation.",
  ],
  [
    'placement_margin',
    "La marge : fiche mission pour l'unité, COLONNE de la liste pour comparer, pilotage pour l'agrégat — les trois, gardées identiquement par `finance:read` et calculées par le même noyau (D43, 28/08/2026).",
  ],
  [
    'placement_proofs',
    'Les preuves : écran REX pour la bibliothèque, onglet du compte pour ce qui est mobilisable ICI — filtres différents.',
  ],
  [
    'placement_territory',
    "Le territoire : Découvrir pour explorer, Pilotage pour suivre les siens — prospecter n'est pas piloter.",
  ],
  [
    'placement_account_plan',
    "Le plan de compte : onglet VIVANT plus export FIGÉ et daté — l'un se rafraîchit, l'autre se partage.",
  ],
  [
    'placement_sprints',
    'Les sprints : une COLONNE dans le portefeuille pour trier, et un ÉCRAN de board pour arbitrer.',
  ],
].map(([key, rule]) => ({
  key: key as string,
  family: 'placement' as const,
  rule: rule as string,
  state: 'held' as const,
  holders: [],
  gap: 'Arbitrage enregistré, pas gardé : un placement ne se vérifie pas mécaniquement. Sa valeur est de ne plus être rediscuté.',
}))

/** §25 — les neuf règles de rendu. La troisième est la règle « non mesuré n'est
 *  pas zéro » transposée aux graphiques, et c'est celle qui compte. */
const DATAVIZ: InteractionRule[] = [
  {
    key: 'viz_no_pie',
    family: 'dataviz',
    rule: "Aucun camembert : l'œil compare mal des angles, des barres disent la même chose mieux.",
    state: 'held',
    holders: [],
    gap: "Tenue par constat : le produit n'a qu'un seul usage de `recharts` et zéro camembert. Une garde posée aujourd'hui serait verte sur du vide.",
  },
  {
    key: 'viz_axis_starts_at_zero',
    family: 'dataviz',
    rule: "L'axe des ordonnées part de zéro sur toute échelle de quantité — sinon on ment par cadrage.",
    state: 'open',
    holders: [],
    gap: "Aucun graphique de quantité à axe tronqué aujourd'hui. À garder quand la dataviz s'étoffera.",
  },
  {
    key: 'viz_unknown_is_hatched',
    family: 'dataviz',
    rule: 'Les valeurs inconnues sont HACHURÉES, jamais absentes ni à zéro.',
    state: 'open',
    holders: [],
    gap: "C'est l'invariant « non mesuré n'est pas zéro » appliqué aux graphiques. Les primitives `UnknownValue`/`MeasuredValue` le tiennent dans le TEXTE ; rien ne le tient dans un graphe, et un point manquant y devient un creux qui se lit comme une chute.",
  },
  {
    key: 'viz_carries_completeness',
    family: 'dataviz',
    rule: 'Toute visualisation porte sa complétude — « calculé sur 62 % des missions ».',
    state: 'open',
    holders: [],
    gap: "`measurability.ts` sait produire la phrase ; aucun graphique ne l'affiche.",
  },
  {
    key: 'viz_carries_computed_at',
    family: 'dataviz',
    rule: 'Toute visualisation porte sa date de calcul.',
    state: 'open',
    holders: [],
    gap: 'Même mécanique que la complétude, même absence.',
  },
  {
    key: 'viz_seven_series_max',
    family: 'dataviz',
    rule: 'Maximum sept séries dans un même graphique — au-delà on ne distingue plus.',
    state: 'open',
    holders: [],
    gap: "Aucun graphique n'approche sept séries.",
  },
  {
    key: 'viz_no_long_entry_animation',
    family: 'dataviz',
    rule: "Pas d'animation d'entrée sur les données au-delà de 400 ms — on lit, on ne regarde pas un spectacle.",
    state: 'guarded',
    holders: ['apps/web/src/architecture/motion-grammar.test.ts', 'packages/ui/src/motion.ts'],
    gap: 'Tenue par la grammaire du mouvement, dont le palier le plus long au-delà duquel il faut une raison est déjà borné.',
  },
  {
    key: 'viz_bars_are_clickable',
    family: 'dataviz',
    rule: "Toute barre est cliquable et mène à la liste des objets qu'elle représente — un graphique qui ne mène nulle part est une décoration.",
    state: 'held',
    holders: ['packages/contracts/src/schemas/manager-kpi.ts'],
    gap: "La règle jumelle est tenue côté indicateurs (chaque ligne d'hygiène mène à sa liste, et une garde vérifie la destination). Elle ne l'est pas sur les graphiques.",
  },
  {
    key: 'viz_needs_a_decision',
    family: 'dataviz',
    rule: "Un graphique sans décision associée n'existe pas — même règle que les indicateurs.",
    state: 'guarded',
    holders: ['packages/contracts/src/schemas/manager-kpi.ts', 'packages/contracts/src/schemas/manager-kpi.test.ts'],
    gap: null,
  },
]

export const INTERACTION_RULES: readonly InteractionRule[] = [...LAWS, ...PLACEMENTS, ...DATAVIZ]

/** Ce que le registre ne promet pas : les règles que rien ne tient, avec leur
 *  raison. C'est la liste qu'on relit avant d'ouvrir un écran neuf. */
export function unheldInteractionRules(): { key: string; gap: string }[] {
  return INTERACTION_RULES.filter(rule => rule.state === 'open' && rule.gap).map(rule => ({
    key: rule.key,
    gap: rule.gap as string,
  }))
}
