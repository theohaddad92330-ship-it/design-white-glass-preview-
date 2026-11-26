/**
 * LES ÉCRANS SERVIS QUI ONT QUITTÉ LA NAVIGATION — #2151.1 / #2151.26.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le lot « navigation & presets » de la vague 5 a sorti « Veille » et
 * « Partenaires » des onglets de Comptes. Les deux ROUTES restent servies, et
 * les deux écrans restent des endroits où l'utilisateur peut se trouver : on y
 * entre depuis le bloc « Mes recherches et alertes » de /discover, depuis Market
 * Watch, depuis un lien déjà parti, depuis un favori de navigateur.
 *
 * Or trois dérivations différentes partaient de la navigation pour répondre à
 * une question qui n'est PAS « est-ce une destination de la barre ? » :
 *
 *  1. `appRouteTarget` (`known-routes.ts`) — « Laura a-t-elle le droit de
 *     t'envoyer là ? » : le lien mourait en silence, carte en `phase: 'failed'` ;
 *  2. `sectionForPath` (`sections.ts`) — « quelle entrée de barre s'allume ? » :
 *     l'utilisateur était sur un écran et la navigation ne lui disait plus où,
 *     c'est-à-dire exactement le défaut D51 du 26/08/2026 ;
 *  3. les deux gardes Python qui relisent la navigation du web sur le disque
 *     (`test_chat_guided_action_app_routes.py`, `test_copilote_prompt_blocks.py`)
 *     — elles réclamaient qu'on retire `/watchlist` du catalogue de Laura et du
 *     prompt, donc qu'on cesse d'y envoyer un utilisateur qui peut s'y trouver.
 *
 * **« Je ne suis plus une DESTINATION de la nav » et « je ne suis plus un
 * ÉCRAN » sont deux choses différentes.** Ce fichier nomme la seconde, et il la
 * nomme à UN SEUL endroit (GA-26) : les trois dérivations ci-dessus en partent,
 * des deux côtés de la frontière TypeScript / Python.
 *
 * ⚠️ C'est une DÉCLARATION, pas un fourre-tout. Un écran n'entre ici que s'il
 * est servi par le routeur, qu'il appartient honnêtement à une section, et que
 * sa raison d'être hors navigation est écrite — `REACHED_OTHERWISE` ou
 * `linkedFromAScreen` dans `sections.test.ts`, qui reste le registre des routes
 * sans entrée de nav (redirections et écrans à jeton compris, qui eux ne sont
 * PAS des écrans de ce fichier). `off-nav-screens.test.ts` vérifie le lien.
 *
 * ⚠️ Le champ ne s'appelle pas `to` — et ce n'est pas un détail de style. Les
 * gardes qui mesurent la navigation extraient les `to: '/…'` du disque ; nommer
 * ce champ `to` ferait recompter ces écrans comme des destinations de barre,
 * c'est-à-dire annulerait en silence la distinction que ce fichier existe pour
 * poser.
 */
export type OffNavScreen = {
  /** Le chemin, exactement comme le routeur le déclare. */
  readonly route: string
  /** La `key` de la section à laquelle l'écran appartient toujours. */
  readonly sectionKey: string
}

// #4491.2 (PR 12C) — relevés, factures, encaissements et vue financière sont redevenus des ONGLETS de
// Missions (maquette V22 « Cycle Missions et finance ») : ils ne sont plus déclarés ici.
export const OFF_NAV_SCREENS: readonly OffNavScreen[] = [
  // « Partenaires » : redevenu un onglet du dossier compte (#2151.26 / #2151.38).
  // ⚠️ `appRouteTarget('/accounts/partners')` passait AVANT ce registre, mais par
  // accident : `partners` a la forme d'un segment d'identifiant, donc la règle
  // des fiches le prenait pour le compte d'identifiant « partners ». Une
  // autorisation qui tient à une homonymie n'en est pas une.
  { route: '/accounts/partners', sectionKey: 'accounts' },
  // #2162.27 / épopée #2892 — « Nouvelle analyse » n'a jamais été un onglet : on
  // y entre depuis un compte, Découvrir, l'accueil. Laura doit pouvoir y
  // emmener quelqu'un, préremplie (`DEEP_LINK_SCREENS`, `chat_tools.py`) ;
  // l'écran fabrique un dossier de compte, d'où sa section.
  { route: '/search', sectionKey: 'accounts' },
  // Théo B r2-mes-analyses — « Mes analyses » : l'historique des analyses de l'espace, ouvert depuis /search.
  { route: '/search/history', sectionKey: 'accounts' },
  // Décision Louis du 19/10/2026 — Affaires = le Pipe seul, Talents = le Vivier seul.
  // `/projects/needs` (#4344) reste un ÉCRAN, ouvert depuis l'entête du pipe. #4359 : les
  // anciennes adresses des Pistes, des appels d'offres et des Positionnements (et `/watchlist`,
  // la Veille) ne sont plus des écrans ni des routes — Laura n'a plus le droit de les écrire.
  { route: '/projects/needs', sectionKey: 'projects' },
  // Théo C projects-presentations (Louis, 22/10/2026) — Affaires › Présentations : la liste des présentations,
  // ouverte depuis la fiche affaire (onglet « Profils & présentations »). Le Studio de propositions y est fondu.
  { route: '/projects/presentations', sectionKey: 'projects' },
  // #4197 (L6, 14/10/2026) — MISSIONS PASSE À TROIS ONGLETS (En cours · Planning ·
  // Facturation). Les huit écrans de gestion ci-dessous quittent la barre mais
  // restent des ÉCRANS : une routine y envoie (`/missions/cra`), Facturation les
  // joint par sa rangée « Administration », et `/missions/nouvelle` est le bouton
  // « Nouvelle mission » de « En cours ». `sectionForPath` continue de dire que
  // l'on est dans Missions.
  { route: '/missions/adv', sectionKey: 'missions' },
  // Théo C missions-planning.HT5 — `/expenses` est devenu un onglet ; seul le barème reste hors barre.
  { route: '/expenses/bareme', sectionKey: 'missions' },
  // Théo C missions-factures — la liste des DOCUMENTS de facture, voisine d'Encaissements.
  { route: '/missions/suivi', sectionKey: 'missions' },
  { route: '/pilotage/rex', sectionKey: 'missions' },
  { route: '/missions/nouvelle', sectionKey: 'missions' },
]

/** Les chemins seuls — ce que consomment les listes blanches de liens. */
export function offNavRoutes(): string[] {
  return OFF_NAV_SCREENS.map(screen => screen.route)
}
