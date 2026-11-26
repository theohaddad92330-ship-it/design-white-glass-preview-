/**
 * Le registre des raccourcis clavier — UN seul endroit (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI COMMANDE CE FICHIER
 * ─────────────────────────────────────────────────────────────────────────
 * Tome 7 §30 : « **tout raccourci est affiché dans le tooltip du bouton
 * correspondant. Un raccourci qu'il faut découvrir n'existe pas.** »
 *
 * Elle n'était tenue nulle part. Mesuré le 29/08/2026 : le dépôt entier ne
 * contenait qu'UN seul `<kbd>`, celui de la liste `⌘/` — c'est-à-dire que le
 * seul endroit qui affichait les raccourcis était lui-même atteint par un
 * raccourci que personne ne pouvait deviner. Une liste d'aide invisible n'aide
 * personne.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OÙ ELLE EST TENUE DEPUIS LE 30/08 — ET POURQUOI PLUS DANS LA BARRE
 * ─────────────────────────────────────────────────────────────────────────
 * La première réponse a collé les touches sur chaque entrée de navigation.
 * Louis a mesuré le résultat à l'écran le lendemain : `G J`, `G C`, `G P`,
 * `G T`, `G M`, `G A`, `G L` et `⌘ K` — **sept capuchons visibles en
 * permanence sur huit lignes**, dans la colonne la plus étroite du produit,
 * ouverte huit heures par jour. « Plus que ça pollue l'interface. »
 *
 * La règle n'est pas contestée : l'ENDROIT l'est. Elle porte sur la
 * VISIBILITÉ, pas sur l'emplacement — et une PAGE dédiée y répond mieux qu'un
 * capuchon, parce qu'elle dit en plus la PORTÉE de chaque raccourci et ce
 * qu'il fait, ce qu'aucun capuchon ne pourra jamais tenir dans deux lettres.
 *
 * D'où la forme actuelle du fichier :
 *  - `descriptionKey` — ce que fait le raccourci, en une phrase. La page
 *    l'affiche ; sans elle, une liste de touches est une grille de mots
 *    croisés.
 *  - `tooltipIn` — le FICHIER du bouton dont l'INFOBULLE porte le raccourci.
 *    Une infobulle ne pollue rien : elle n'existe que pendant qu'on survole.
 *    C'est d'ailleurs ce que le §30 demandait littéralement, « le tooltip du
 *    bouton correspondant ».
 *
 * La garde `shortcuts-are-shown.test.tsx` (GA-44) MONTE la page et vérifie que
 * chaque entrée d'ici s'y affiche. Sa version précédente ne vérifiait que
 * l'existence du fichier déclaré — une garde d'emplacement, restée verte le
 * jour où les capuchons ont quitté la barre alors que le fichier, lui,
 * continuait d'importer ce registre pour son infobulle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS LÀ, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * Le §30 décrit treize lignes. **N'y figure que ce qui tourne réellement.**
 * Un raccourci listé qui ne fait rien est pire qu'un raccourci absent : la
 * première fois, l'utilisateur croit s'être trompé de touche ; la deuxième, il
 * cesse d'ouvrir la liste.
 *
 * - `⌘J` (Laura) — aucun gestionnaire. `⌘K` mène à Laura et le remplace.
 * - `N` (créer), `F` (focus filtre), `↑ ↓` / `→` / `Espace` (curseur de liste),
 *   `M` (déplacer au kanban), `E` (éditer le champ survolé) — **aucun modèle de
 *   curseur ni de survol n'existe** dans le produit. Les câbler suppose de
 *   construire ce modèle écran par écran ; l'annoncer avant serait annoncer du
 *   vide.
 * - `⌘↵` — il EXISTE dans le composer de Laura, mais c'est une PRÉFÉRENCE
 *   (`sendCommentOn`, dont le défaut est Entrée seule). Le graver ici
 *   afficherait `⌘↵` à quelqu'un chez qui c'est Entrée : le registre mentirait
 *   pour la majorité. Il reste donc là où il se règle, dans les Préférences.
 *
 * Ce qui A ÉTÉ ajouté par rapport à l'inventaire précédent : `⌘B`, le repli de
 * la barre latérale. Il existait depuis toujours (`packages/ui`, le composant
 * `Sidebar`) et n'était écrit nulle part — un raccourci parfaitement fonctionnel
 * que personne ne pouvait apprendre.
 */

/**
 * La portée d'un raccourci, au sens du §30.
 *
 * Deux valeurs seulement, parce que deux portées seulement sont câblées. Les
 * autres portées du tome (`liste`, `kanban`, `fiche`, `formulaire`) n'ont
 * aucun raccourci : les nommer ici donnerait un vocabulaire dont aucune entrée
 * ne se sert, et un lecteur en conclurait qu'il existe des raccourcis de liste.
 *
 * ⚠️ La page dédiée AFFICHE cette portée, en toutes lettres et avec sa
 * définition. C'est la moitié de l'information que les capuchons ne pouvaient
 * pas porter : `G C` collé sur une ligne ne dit pas s'il répond partout ou
 * seulement dans une liste, et un raccourci dont on ignore où il répond ne
 * s'essaie qu'une fois.
 */
// #2128.32 / #2128.59 — `dossier` ajouté en FIN : la touche « / » ne répond que
// sur le dossier d'un compte, où le composant qui la lit est monté.
// #4164 — `rafale` ajouté en FIN : les touches du mode rafale de /actions, qui ne
// répondent que dans le panneau plein écran (BurstPanel).
export const SHORTCUT_SCOPES = ['goto', 'global', 'dossier', 'rafale'] as const

type ShortcutScope = (typeof SHORTCUT_SCOPES)[number]

export type Shortcut = {
  /** Identifiant stable. Les boutons et les tests le CITENT — jamais la touche. */
  id: string
  /**
   * Les touches, en segments.
   *
   * `MOD` = ⌘ sur un clavier Apple, Ctrl ailleurs — la seule écriture qui ne
   * ment pas sur les deux plateformes, et c'est `ShortcutKeys` qui la résout.
   * `ESC` porte son nom traduit (« Échap » / « Esc »).
   *
   * `SHIFT` n'apparaît qu'en position centrale (`['MOD', 'SHIFT', <lettre>]`)
   * — #2207.67 : `⌘K` mène déjà à Laura, et la recherche globale a besoin
   * d'une combinaison DISTINCTE plutôt que de la lui voler. `⌘⇧K` est le choix :
   * aucun navigateur ni système ne le réserve, contrairement à `⌘F` (chercher
   * dans la page) ou `⌘P` (imprimer) qui, eux, sont des habitudes plus
   * anciennes que le produit.
   */
  keys: readonly string[]
  scope: ShortcutScope
  /** Clé i18n du libellé, namespace `shortcuts`. */
  labelKey: string
  /**
   * Clé i18n de CE QUE FAIT le raccourci, en une phrase, namespace `shortcuts`.
   *
   * Distincte du libellé, qui n'est qu'un nom : « Comptes » ne dit pas si l'on
   * arrive sur la liste ou sur le dernier compte ouvert. La page l'affiche en
   * colonne — c'est la différence entre une aide et une grille de mots croisés.
   */
  descriptionKey: string
  /** La route atteinte, pour les raccourcis qui mènent quelque part. */
  to?: string
  /**
   * Le fichier du bouton dont l'INFOBULLE porte ce raccourci. Chemin relatif à
   * `apps/web/src`. LU par la garde, pas décoratif.
   *
   * Une infobulle et non un capuchon permanent : elle n'apparaît qu'à la
   * demande, ne prend aucune place, et répond là où la question se pose.
   *
   * Absent = ce raccourci ne double aucun bouton (`Échap` n'en a pas), et il
   * ne s'apprend que sur la page dédiée.
   */
  tooltipIn?: string
  /**
   * Répond-il PENDANT qu'on écrit ?
   *
   * Un seul le fait, et c'est assumé : `⌘K` est le geste que tout le monde
   * tente en premier dans un outil, et une porte qui ne répond pas depuis le
   * champ où l'on vient de taper n'est pas une porte. Tous les autres se
   * taisent — sans quoi taper « Groupe TF1 » dans une recherche partirait sur
   * une autre page à la lettre suivante.
   */
  firesWhileTyping?: boolean
}

/**
 * La lettre qui ARME la séquence de navigation.
 *
 * Une SÉQUENCE et non une combinaison : `⌘C` est déjà pris par le système sur
 * toutes les plateformes, et une navigation ne mérite pas de voler un raccourci
 * que l'utilisateur emploie cent fois par jour.
 */
export const SEQUENCE_LEAD = 'G'

/**
 * Le délai au-delà duquel `G` cesse d'attendre sa seconde touche.
 *
 * Une seconde et demie : assez pour une frappe hésitante, assez court pour
 * qu'un `G` tapé dans un champ oublié ne détourne pas la lettre suivante.
 */
export const SEQUENCE_TIMEOUT_MS = 1500

/**
 * Les raccourcis, tous, dans l'ordre où la liste `⌘/` les montre.
 *
 * ⚠️ `sidebar` (`⌘B`) est le seul dont le GESTIONNAIRE vit ailleurs — dans
 * `packages/ui/src/components/sidebar.tsx`, qui ne peut pas importer l'app web.
 * La lettre est donc écrite à deux endroits, et c'est exactement le genre de
 * doublon qui diverge : la garde `shortcuts-are-shown.test.ts` LIT la constante
 * de `packages/ui` et la compare à celle-ci.
 */
export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: 'laura',
    // Théo D settings-prefs (tranché Louis 22/10) : Laura sur ⌘J, ⌘K redevient la
    // recherche globale. Renverse #2207.67 (Laura ⌘K / recherche ⌘⇧K).
    keys: ['MOD', 'J'],
    scope: 'global',
    labelKey: 'global.launcher',
    descriptionKey: 'describe.laura',
    to: '/chat',
    // L'infobulle NATIVE du lien (`title`), et non un capuchon : c'est la seule
    // surface qui survive au rail replié, où le libellé disparaît.
    tooltipIn: 'components/sidebar/CustomerNavbarBody.tsx',
    firesWhileTyping: true,
  },
  {
    id: 'help',
    keys: ['MOD', '/'],
    scope: 'global',
    labelKey: 'global.help',
    descriptionKey: 'describe.help',
    // Il MÈNE désormais à la page dédiée au lieu d'ouvrir une modale. Deux
    // écrans qui listent les mêmes raccourcis sous la même forme, c'est la loi 4
    // du tome 7 retournée contre nous — et la page en dit strictement plus.
    to: '/settings/shortcuts',
    // Le menu du compte : une surface à la demande, elle aussi — elle n'existe
    // que le menu ouvert.
    tooltipIn: 'components/sidebar/UserDropdownMenu.tsx',
  },
  {
    id: 'sidebar',
    keys: ['MOD', 'B'],
    scope: 'global',
    labelKey: 'global.sidebar',
    descriptionKey: 'describe.sidebar',
    tooltipIn: 'components/sidebar/SidebarCollapseToggle.tsx',
  },
  // #2207.67 — la recherche globale multi-entités (épopée #3015). `⌘K` mène
  // déjà à Laura ; `⌘⇧K` en est distinct dans les deux sens (voir
  // `matchesChord`), et ne double aucune habitude du navigateur ou du système.
  // PAS de `firesWhileTyping` : contrairement à Laura, ouvrir la recherche
  // PAR-DESSUS une saisie en cours ailleurs (un formulaire, une note) n'est pas
  // le geste réflexe que `⌘K` est devenu — c'est le même arbitrage que `⌘/`.
  {
    id: 'global-search',
    keys: ['MOD', 'K'],
    scope: 'global',
    labelKey: 'global.search',
    descriptionKey: 'describe.global-search',
    tooltipIn: 'components/sidebar/GlobalSearchTrigger.tsx',
  },
  {
    // Aucun `tooltipIn` : `Échap` ne double pas un bouton, il ferme ce qui est
    // ouvert. L'afficher sur la croix d'une modale serait vrai, et l'afficher
    // sur les quarante croix du produit serait du bruit.
    id: 'escape',
    keys: ['ESC'],
    scope: 'global',
    labelKey: 'global.escape',
    descriptionKey: 'describe.escape',
  },
  {
    id: 'goto-today',
    keys: [SEQUENCE_LEAD, 'J'],
    scope: 'goto',
    labelKey: 'goto.today',
    descriptionKey: 'describe.goto-today',
    to: '/briefing',
    tooltipIn: 'components/sidebar/AppSidebar.tsx',
  },
  {
    id: 'goto-accounts',
    keys: [SEQUENCE_LEAD, 'C'],
    scope: 'goto',
    labelKey: 'goto.accounts',
    descriptionKey: 'describe.goto-accounts',
    to: '/accounts',
    tooltipIn: 'components/sidebar/AppSidebar.tsx',
  },
  {
    id: 'goto-projects',
    keys: [SEQUENCE_LEAD, 'P'],
    scope: 'goto',
    labelKey: 'goto.projects',
    descriptionKey: 'describe.goto-projects',
    to: '/projects',
    tooltipIn: 'components/sidebar/AppSidebar.tsx',
  },
  {
    id: 'goto-talents',
    keys: [SEQUENCE_LEAD, 'T'],
    scope: 'goto',
    labelKey: 'goto.talents',
    descriptionKey: 'describe.goto-talents',
    to: '/consultants',
    tooltipIn: 'components/sidebar/AppSidebar.tsx',
  },
  {
    id: 'goto-missions',
    keys: [SEQUENCE_LEAD, 'M'],
    scope: 'goto',
    labelKey: 'goto.missions',
    descriptionKey: 'describe.goto-missions',
    to: '/missions',
    tooltipIn: 'components/sidebar/AppSidebar.tsx',
  },
  {
    id: 'goto-actions',
    keys: [SEQUENCE_LEAD, 'A'],
    scope: 'goto',
    labelKey: 'goto.actions',
    descriptionKey: 'describe.goto-actions',
    to: '/actions',
    tooltipIn: 'components/sidebar/AppSidebar.tsx',
  },
  {
    id: 'goto-pilotage',
    keys: [SEQUENCE_LEAD, 'L'],
    scope: 'goto',
    labelKey: 'goto.pilotage',
    descriptionKey: 'describe.goto-pilotage',
    to: '/pilotage',
    tooltipIn: 'components/sidebar/AppSidebar.tsx',
  },
  // #2128.32 / #2128.59 — rechercher dans le dossier d'un compte sans savoir
  // dans quelle section vit ce qu'on cherche. Une touche SEULE, comme dans les
  // outils où « / » ouvre la recherche : aucune collision avec ⌘K (Laura), ⌘/
  // (cette page) ni la séquence G — le composant ignore « / » avec un
  // modificateur et pendant une saisie.
  {
    id: 'dossier-search',
    keys: ['/'],
    scope: 'dossier',
    labelKey: 'dossier.search',
    descriptionKey: 'describe.dossier-search',
    tooltipIn: 'features/accounts/view/account-detail/search/DossierSearchField.tsx',
  },
  // #4164 — le mode rafale (/actions › Aujourd'hui). `Échap` n'y figure pas : c'est le
  // raccourci global `escape` (même combinaison), que l'aide de la rafale cite aussi.
  {
    id: 'rafale-next',
    keys: ['j'],
    scope: 'rafale',
    labelKey: 'rafale.next',
    descriptionKey: 'describe.rafale-next',
  },
  {
    id: 'rafale-prev',
    keys: ['k'],
    scope: 'rafale',
    labelKey: 'rafale.prev',
    descriptionKey: 'describe.rafale-prev',
  },
  {
    id: 'rafale-edit',
    keys: ['e'],
    scope: 'rafale',
    labelKey: 'rafale.edit',
    descriptionKey: 'describe.rafale-edit',
  },
  {
    id: 'rafale-primary',
    keys: ['↵'],
    scope: 'rafale',
    labelKey: 'rafale.primary',
    descriptionKey: 'describe.rafale-primary',
  },
  {
    id: 'rafale-snooze',
    keys: ['s'],
    scope: 'rafale',
    labelKey: 'rafale.snooze',
    descriptionKey: 'describe.rafale-snooze',
  },
  {
    id: 'rafale-skip',
    keys: ['x'],
    scope: 'rafale',
    labelKey: 'rafale.skip',
    descriptionKey: 'describe.rafale-skip',
  },
  {
    id: 'rafale-help',
    keys: ['?'],
    scope: 'rafale',
    labelKey: 'rafale.help',
    descriptionKey: 'describe.rafale-help',
    tooltipIn: 'features/today/BurstPanel.tsx',
  },
]

/** Les raccourcis d'une portée, dans l'ordre du registre. Lu par la liste `⌘/`. */
export function shortcutsInScope(scope: ShortcutScope): Shortcut[] {
  return SHORTCUTS.filter(shortcut => shortcut.scope === scope)
}

/**
 * Le raccourci d'un identifiant.
 *
 * Il LÈVE quand l'identifiant n'existe pas, au lieu de rendre `undefined` : un
 * bouton qui affiche silencieusement rien parce que son identifiant a été
 * renommé est précisément le défaut que ce fichier existe pour empêcher.
 */
export function shortcutById(id: string): Shortcut {
  const found = SHORTCUTS.find(shortcut => shortcut.id === id)
  if (!found) throw new Error(`Raccourci inconnu : ${id}`)
  return found
}

/**
 * La route d'un raccourci, par identifiant.
 *
 * Elle LÈVE quand le raccourci n'en porte pas, comme `shortcutById` lève sur un
 * identifiant inconnu. La tentation était d'écrire `shortcutById('laura').to ??
 * '/chat'` — mais ce repli RECOPIE l'adresse à côté du registre, et le jour où
 * `/chat` devient autre chose, la ligne oubliée est toujours celle du repli.
 */
export function shortcutTarget(id: string): string {
  const { to } = shortcutById(id)
  if (to === undefined) throw new Error(`Raccourci sans destination : ${id}`)
  return to
}

/** Le raccourci qui mène à cette route, s'il y en a un. Lu par la barre latérale. */
export function shortcutForRoute(to: string): Shortcut | undefined {
  return SHORTCUTS.find(shortcut => shortcut.to === to)
}

/**
 * Cette frappe déclenche-t-elle ce raccourci ?
 *
 * `MOD` accepte ⌘ ET Ctrl : c'est ce que fait tout le monde, et refuser Ctrl
 * sur un Mac punirait un clavier externe branché sur une machine Apple.
 *
 * `shiftKey` est optionnel dans le type de l'appelant (les combinaisons SANS
 * `SHIFT`, majoritaires, n'ont jamais eu à le fournir) mais la comparaison
 * elle-même est STRICTE dans les deux sens : sans elle, ⌘⇧K déclencherait AUSSI
 * Laura (⌘K), qui ne regarde pas `shiftKey` — la collision que #2207.67 existe
 * pour éviter.
 */
export function matchesChord(
  shortcut: Shortcut,
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'> & { shiftKey?: boolean },
): boolean {
  const [modifier, second, third] = shortcut.keys
  if (modifier !== 'MOD') return false
  const requiresShift = second === 'SHIFT'
  const letter = requiresShift ? third : second
  if (letter === undefined) return false
  if (!event.metaKey && !event.ctrlKey) return false
  if ((event.shiftKey === true) !== requiresShift) return false
  return event.key.toLowerCase() === letter.toLowerCase()
}

/**
 * Faut-il ignorer cette frappe ?
 *
 * La règle qui rend les séquences supportables : **on ne détourne jamais une
 * touche pendant que quelqu'un écrit**. Sans ce garde, taper « Groupe TF1 »
 * dans une recherche enverrait sur une autre page à la lettre suivante.
 *
 * ⚠️ `closest` et non le seul `event.target` : une combobox ARIA porte
 * `role="textbox"` sur un conteneur, et un éditeur riche met le curseur dans un
 * descendant. Tester la cible seule laissait passer les deux.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  // `=== true` et non la valeur brute : `isContentEditable` vaut `undefined`
  // sur un élément qui ne le porte pas, et la fonction annonce un booléen.
  if (target.isContentEditable === true) return true
  return target.closest('[role="textbox"],[role="combobox"],[role="searchbox"]') !== null
}

/**
 * Une frappe peut-elle faire partie d'une séquence `G` + lettre ? (#3562.5, recette Y9)
 *
 * Une séquence est faite de lettres NUES : ni ⌘/Ctrl/Alt (déjà gardés), ni MAJ.
 * « Garantie » tapé hors d'un champ s'ouvrait en `G` majuscule (MAJ+g) puis `a` :
 * c'était la séquence « aller aux actions », et l'écran changeait au milieu de
 * la phrase. Une majuscule est de la saisie, jamais un raccourci. La répétition
 * automatique d'une touche tenue n'arme rien non plus.
 */
export function isPlainSequenceKey(event: {
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  repeat?: boolean
}): boolean {
  return !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && !event.repeat
}

/**
 * Où les séquences `G` + lettre répondent-elles ? Pas dans la conversation :
 * `/chat` est l'écran où l'on TAPE, et toute lettre perdue hors du composeur y
 * est du texte (la recette Y9 a vu `/chat` partir sur `/actions` en cours de
 * frappe). Les raccourcis `⌘K` / `⌘/` y restent actifs.
 */
export function sequencesAllowedOn(pathname: string): boolean {
  return pathname !== '/chat' && !pathname.startsWith('/chat/')
}

/** La route visée par une séquence `G` + lettre, ou `null`. */
export function gotoTarget(letter: string): string | null {
  const wanted = letter.toUpperCase()
  const found = SHORTCUTS.find(shortcut => shortcut.scope === 'goto' && shortcut.keys[1] === wanted)
  return found?.to ?? null
}
