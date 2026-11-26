import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import navEn from '@/i18n/locales/en/nav.json'
import navFr from '@/i18n/locales/fr/nav.json'
import { PLATFORM_SECTIONS } from '@/components/sidebar/items'
import { SETTINGS_SECTIONS } from '@/components/sidebar/items.settings'
import { currentAddressOf } from '@/lib/legacy-addresses'
import { OFF_NAV_SCREENS, offNavRoutes } from './off-nav-screens'
import { allNavRoutes, isNavEntryActive, NAV_SECTIONS, PLANNED_SECTION_KEYS, sectionForPath } from './sections'

/**
 * Les routes que la barre latérale servait AVANT la réduction à neuf entrées.
 *
 * Écrites en dur, à dessein : ce test vérifie qu'aucune n'a disparu de la
 * navigation, et le lire depuis la nouvelle liste le rendrait tautologique. Un
 * écran qu'on n'atteint plus est une régression, même si sa route répond encore.
 */
const ROUTES_BEFORE = [
  '/briefing',
  '/dashboard',
  '/mailbox',
  '/chat',
  '/discover',
  '/accounts',
  '/contacts',
  '/projects',
  '/consultants',
  '/team',
  '/pilotage',
  '/actions',
  '/integrations',
  '/settings',
]

describe('la navigation à neuf entrées', () => {
  it('compte QUATORZE sections, toutes livrées — #4492 (PR 12C) : Contacts, Signaux, Découvrir, Messagerie redeviennent des sections', () => {
    // Missions a rejoint la barre avec son écran (T7). Rien n'est plus
    // « annoncé » : une entrée n'existe qu'à partir du moment où elle ouvre
    // quelque chose, sinon c'est le « Active sans connecteur » que le produit
    // s'interdit.
    expect(NAV_SECTIONS).toHaveLength(14)
    expect(PLANNED_SECTION_KEYS).toEqual([])
  })

  it('ouvre bien Missions, et sous sa propre section', () => {
    expect(sectionForPath('/missions')?.section.key).toBe('missions')
  })

  it('n’a PERDU aucune surface — chaque ancienne route reste atteignable', () => {
    // La barre de RÉGLAGES compte comme navigation rendue, au même titre que la
    // barre principale et les onglets de section. C'est elle qui héberge
    // Intégrations, Connaissances et l'Assistant IA.
    //
    // Cette union est la CORRECTION du test : il ne lisait que le modèle des
    // sections, donc « Intégrations » y figurait comme onglet et le test
    // passait — alors que les écrans de Réglages ne rendent PAS les onglets de
    // section, et que l'entrée avait disparu de l'application. Un test de
    // navigation doit compter ce qui S'AFFICHE, pas ce qui est déclaré.
    // #2151.1 (16/09/2026) — élargie à REACHED_OTHERWISE : une route retirée
    // de la nav MAIS honnêtement déclarée (raison écrite) compte comme
    // atteignable au même titre qu'un onglet ou une entrée de Réglages — c'est
    // la même liste que lit le test « aucune route orpheline » plus bas, et
    // une dérivation vit à un seul endroit (GA-26).
    const reachable = new Set([...allNavRoutes(), ...settingsRoutes(), ...Object.keys(REACHED_OTHERWISE)])
    for (const route of ROUTES_BEFORE) {
      // Théo A today-jour.A8 — une route retirée mais gardée comme ancienne adresse (`/dashboard` → `/briefing`)
      // reste atteignable : son lien entrant ouvre la page qui la remplace.
      const target = currentAddressOf(route) ?? route
      expect(reachable.has(target), `route absente de la navigation : ${route}`).toBe(true)
    }
  })

  it('déclare zéro onglet sur RÉGLAGES — ils ne s’y afficheraient jamais', () => {
    // Les écrans de Réglages passent par `SettingsPage`, pas par
    // `CustomerPage` : un onglet de section y est une entrée invisible, donc
    // une promesse d'atteignabilité que personne ne tient.
    expect(NAV_SECTIONS.find(section => section.key === 'settings')?.tabs).toEqual([])
  })

  it('garde Intégrations atteignable depuis la barre de Réglages', () => {
    // Trouvé par Louis en production le 17/08 : l'entrée avait disparu des deux
    // portes à la fois.
    expect(settingsRoutes()).toContain('/integrations')
  })

  it('ne place JAMAIS la même route dans deux sections', () => {
    // Sinon l'onglet actif dépend du chemin emprunté, et l'utilisateur voit sa
    // section changer sous lui en rechargeant la page.
    const routes = allNavRoutes()
    expect(new Set(routes).size).toBe(routes.length)
  })

  it('fait toujours de la route de section son PREMIER onglet', () => {
    for (const section of NAV_SECTIONS) {
      if (section.tabs.length === 0) continue
      expect(section.tabs[0]?.to).toBe(section.to)
    }
  })

  it('n’affiche pas d’onglets sur une section qui n’a qu’un écran', () => {
    // Une barre d'onglets à un seul onglet est un ornement qui coûte une ligne.
    const single = NAV_SECTIONS.filter(section => section.tabs.length === 1)
    expect(single).toEqual([])
  })

  /**
   * ⚠️ AUCUN ÉCRAN NE NAÎT ORPHELIN.
   *
   * Le test au-dessus lit `ROUTES_BEFORE`, une liste FIGÉE des routes d'avant
   * la réduction à neuf entrées. Il protège l'historique — et il est aveugle à
   * ce qui arrive APRÈS : une route créée demain peut n'être atteignable par
   * aucun chemin sans qu'une seule assertion bouge.
   *
   * C'est arrivé. `/actions/sequences` (l'écran des séquences du PDF 2,
   * BEL-CRM-103) existait, testé, avec ses statuts dérivés — et n'était dans ni
   * la barre, ni un onglet, ni un lien. Trouvé le 26/08/2026 parce que Louis a
   * cherché un écran et ne l'a pas trouvé, pas par un test.
   *
   * Ce test-ci part donc du DISQUE : chaque fichier de route doit être
   * atteignable, ou figurer ci-dessous avec la raison de son absence de la
   * navigation. La liste ne peut que rétrécir.
   */
  it('n’a AUCUNE route orpheline — tout écran s’atteint, ou est déclaré', () => {
    const declared = new Set(Object.keys(REACHED_OTHERWISE))
    const reachable = new Set([...allNavRoutes(), ...settingsRoutes()])
    const orphans = fileRoutes().filter(
      route => !reachable.has(route) && !declared.has(route) && !linkedFromAScreen().has(route),
    )
    expect(orphans).toEqual([])
  })
})

/**
 * #2151.1 / #2151.26 (16/09/2026) — Veille et Partenaires quittent les onglets
 * de Comptes : deux destinations « moi + mes comptes » de trop, absorbées
 * ailleurs (Veille → /discover « Mes recherches et alertes » #2151.2 ;
 * Partenaires reste un ONGLET du dossier compte — section « Écosystème &
 * accès », #2151.38, déjà là — mais plus une destination de premier niveau).
 * #2151.28 : les modules backend et les routes restent, seule la nav change.
 */
describe('#2151.1 / #2151.26 — Veille et Partenaires quittent les onglets de Comptes', () => {
  const accounts = NAV_SECTIONS.find(section => section.key === 'accounts')

  it('ne déclare plus /watchlist comme onglet de Comptes', () => {
    expect(accounts?.tabs.map(tab => tab.to)).not.toContain('/watchlist')
  })

  it('ne déclare plus /accounts/partners comme onglet de Comptes', () => {
    expect(accounts?.tabs.map(tab => tab.to)).not.toContain('/accounts/partners')
  })

  it('/watchlist n’est plus une route (#4359) : la table des anciennes adresses la mène à « Mes cibles »', () => {
    expect(currentAddressOf('/watchlist')).toBe('/signals')
    expect(fileRoutes()).not.toContain('/watchlist')
  })

  it('/accounts/partners reste atteignable — des écrans le nomment déjà (Market Watch, référence Énergie)', () => {
    expect(linkedFromAScreen().has('/accounts/partners')).toBe(true)
  })

  it('n’a AUCUN écran hors nav sans raison écrite — la déclaration et le registre ne divergent pas', () => {
    // `off-nav-screens.ts` dit « cet écran est servi, liable, et appartient à
    // cette section » ; ce registre-ci dit POURQUOI il a quitté la barre. Les
    // deux répondent à deux questions, mais le second doit couvrir le premier :
    // un écran déclaré hors nav sans raison écrite est une liste blanche qui
    // grossit toute seule.
    const explained = new Set([...Object.keys(REACHED_OTHERWISE), ...linkedFromAScreen()])
    const unexplained = offNavRoutes().filter(route => !explained.has(route))
    expect(unexplained).toEqual([])
  })
})

/**
 * Les routes qu'on atteint AUTREMENT que par la navigation, et comment.
 *
 * ⚠️ Chaque entrée dit par quelle porte on y arrive. « On y arrive par une
 * URL » n'est pas une réponse : c'est la définition d'un écran orphelin.
 */
const REACHED_OTHERWISE: Record<string, string> = {
  '/actions/automatisations_/bibliotheque':
    "PORTE CONTEXTUELLE, PAS DESTINATION (Théo C automations-bibliotheque, 22/10/2026). « Des suivis prêts à adapter » est la bibliothèque de routines, qui a quitté Réglages › Routines (`/settings/routines` redirige ici). On y entre par le sous-onglet « Bibliothèque de routines » de l'écran Automatisations (`AutomationsSubNav`), par « Décrire mon besoin » et par les anciens liens. Le tiret bas du fichier de route (`automatisations_/bibliotheque.tsx`) l'écarte de la redirection de `/actions/automatisations` ; l'adresse publique est `/actions/automatisations/bibliotheque`.",
  '/actions/automatisations_/journal':
    "PORTE CONTEXTUELLE, PAS DESTINATION (Théo C automations-bibliotheque.N3, 22/10/2026). Le journal des essais est le troisième sous-onglet des Automatisations (`AutomationsSubNav`), et on y revient depuis la ligne d'un essai. Le tiret bas du fichier de route l'écarte de la redirection de `/actions/automatisations` ; l'adresse publique est `/actions/automatisations/journal`.",
  '/analyse':
    'REDIRECTION vers `/search` (#4658) : alias FRANÇAIS du verbe principal du produit, ALIAS D’URL PARTAGEABLE, pas une entrée de navigation. L’adresse se tape de mémoire, se met en favori, se colle dans un message ; elle ne rend rien, elle redirige dans son `beforeLoad` (GA-27).',
  '/analyze':
    'REDIRECTION vers `/search` (#4658) : alias ANGLAIS du verbe principal du produit, ALIAS D’URL PARTAGEABLE, pas une entrée de navigation. L’adresse se tape de mémoire, se met en favori, se colle dans un message ; elle ne rend rien, elle redirige dans son `beforeLoad` (GA-27).',
  '/affaires':
    'REDIRECTION vers `/projects` (#4710) : « Affaires » est le nom que le produit affiche, ALIAS D’URL PARTAGEABLE en français, pas une entrée de navigation. L’adresse se tape de mémoire ou se garde en favori ; elle ne rend rien, elle redirige dans son `beforeLoad` (GA-27).',
  '/comptes':
    'REDIRECTION vers `/accounts` (#4710) : « Comptes » est le nom que le produit affiche, ALIAS D’URL PARTAGEABLE en français, pas une entrée de navigation. L’adresse se tape de mémoire ou se garde en favori ; elle ne rend rien, elle redirige dans son `beforeLoad` (GA-27).',
  '/decouvrir':
    'REDIRECTION vers `/discover` (#4710) : « Découvrir » est le nom que le produit affiche, ALIAS D’URL PARTAGEABLE en français, pas une entrée de navigation. L’adresse se tape de mémoire ou se garde en favori ; elle ne rend rien, elle redirige dans son `beforeLoad` (GA-27).',
  '/equipe':
    'REDIRECTION vers `/team` (#4710) : « Équipe » est le nom que la navigation affiche ; ALIAS D’URL tapé de mémoire, pas une entrée de navigation. Elle ne rend rien, elle redirige dans son `beforeLoad` (GA-27).',
  '/facturation':
    'REDIRECTION vers `/billing` (#4710) : « Facturation » est le nom que le produit affiche, ALIAS D’URL PARTAGEABLE en français, pas une entrée de navigation. L’adresse se tape de mémoire ou se garde en favori ; elle ne rend rien, elle redirige dans son `beforeLoad` (GA-27).',
  '/signaux':
    'REDIRECTION vers `/signals` (#4710) : « Signaux » est le nom que le produit affiche, ALIAS D’URL PARTAGEABLE en français, pas une entrée de navigation. L’adresse se tape de mémoire ou se garde en favori ; elle ne rend rien, elle redirige dans son `beforeLoad` (GA-27).',
  '/vivier':
    'REDIRECTION vers `/consultants` (#4710) : « Vivier » est le nom que le produit affiche, ALIAS D’URL PARTAGEABLE en français, pas une entrée de navigation. L’adresse se tape de mémoire ou se garde en favori ; elle ne rend rien, elle redirige dans son `beforeLoad` (GA-27).',
  '/talents':
    'REDIRECTION vers `/consultants` (#4668) : « Talents » est le NOM de la section depuis la refonte CRM/ATS ' +
    "(décision Louis du 14/10/2026) ; la route servie reste `/consultants`, rien n'est renommé. L'adresse se tape " +
    'de mémoire, ou arrive par un lien écrit avec le nom de la section ; elle ne rend rien, elle redirige dans son ' +
    '`beforeLoad` (GA-27).',
  '/missions/paiements':
    'REDIRECTION vers `/missions/finance#sorties` (Théo C missions-encaissements.A4, maquette Théo V22 du 23/10/2026 : Paiements est FONDU dans la vue financière, section « Ce qui sort » ; Encaissements y renvoie). La route survit pour ses liens entrants (routines, favoris) ; elle ne rend rien.',
  '/missions/cessions':
    "REDIRECTION vers `/missions/finance#cessions` (Théo C missions-finance.A2, décision Louis du 22/10/2026) : les cessions d'affacturage sont la section « Cessions » de Missions › Finance. La route survit pour ses liens entrants ; elle ne rend rien.",
  '/settings/import':
    'REDIRECTION vers `/settings/mes-donnees?tab=imports` (#4533, Louis 24/10/2026) : les Imports sont l’onglet « Imports » de Mes données, réservé aux gestionnaires. L’adresse survit pour ses liens entrants (Laura, signets) ; elle ne rend rien.',
  '/settings/vivier-export':
    'REDIRECTION vers `/settings/mes-donnees` (#4532, Louis 24/10/2026, revient sur #3950) : « Exporter le vivier » est une carte de l’onglet Exports de Mes données. L’adresse survit pour ses liens entrants ; elle ne rend rien.',
  '/settings/billing':
    'REDIRECTION vers `/billing` (Théo D settings-outils.N4 : la facturation est une rubrique des Réglages ; sa page vit déjà dans la coque des Réglages, l’adresse « Réglages » y mène).',
  '/pilotage/pipe':
    'REDIRECTION vers `/pilotage#pipe` (Théo D, décision Louis du 22/10/2026 : Pilotage est UNE page à sections ancrées — Cockpit, Pipe, Staffing, Finance ; renverse la décision du 14/10 sur les ADRESSES). La route survit pour ses liens entrants ; elle ne rend rien.',
  '/mes-cibles':
    "REDIRECTION vers `/signals` (décision Louis du 23/10/2026 : « Mes cibles » est l'écran Signaux de Théo ; `?view=veilles` → `/signals/watches`, ancre gardée). La route survit pour ses liens entrants (favoris, Laura, messages) ; elle ne rend rien.",
  '/search/history':
    "REDIRECTION vers `/search?vue=historique` (décision Louis du 23/10/2026 : l'historique des analyses est une vue de l'écran Analyser de Théo). La route survit pour ses liens entrants ; elle ne rend rien.",
  '/pilotage/staffing':
    'REDIRECTION vers `/pilotage#staffing` (Théo D, décision Louis du 22/10/2026) — même raison que `/pilotage/pipe`.',
  '/pilotage/finance':
    'REDIRECTION vers `/pilotage#finance` (Théo D, décision Louis du 22/10/2026) — même raison que `/pilotage/pipe`.',
  '/propositions':
    "REDIRECTION vers Affaires › Présentations (Théo C HT-6, décision de Louis du 22/10/2026 : le Studio de propositions est FONDU dans le détail d'une présentation, ouvert depuis la fiche affaire). `?project=<affaire>` mène à la présentation la plus avancée de l'affaire, sans affaire à la liste `/projects/presentations`. La route survit pour ses liens entrants (Laura, favoris) ; elle ne rend plus rien.",
  '/projects/presentations':
    "PORTE CONTEXTUELLE, PAS DESTINATION (Théo C projects-presentations, 22/10/2026). La liste des présentations s'ouvre depuis l'onglet « Profils & présentations » de la fiche affaire (`ProjectDossierPage`, lien « Toutes les présentations ») ; `sectionForPath` la range sous Affaires.",
  '/projects/needs':
    "PORTE CONTEXTUELLE, PAS DESTINATION (#4344, décision de Louis du 19/10/2026 : « Besoins ouverts » quitte Talents, les besoins vivent dans Affaires). L'écran n'a plus d'onglet ; le bouton « Besoins à pourvoir » de l'entête du pipe (`ProjectsPage`) l'ouvre, et `sectionForPath` le range sous Affaires. Il n'est PAS redirigé : un besoin sans affaire (`project_id: null`, #2777) n'a aucune autre vue, le rediriger le ferait disparaître.",
  '/auth/callback': 'Rebond du fournisseur OAuth — le navigateur y est envoyé par un tiers, jamais par nous.',
  '/auth/reset-password':
    'Lien reçu par e-mail, signé et daté. Une entrée de menu vers un écran qui exige un jeton mènerait à une erreur.',
  '/demo':
    'Le lien public collé dans un message de prospection. Il ouvre une salle de démonstration, pas un écran du produit.',
  '/demo_/acces':
    'Le formulaire obligatoire avant la démo (#2705.1) : `/demo` y envoie un visiteur sans lead connu. Une étape du lien public, pas un écran du produit.',
  '/settings/profile/route': 'Fichier de disposition TanStack, pas une page : il n’a rien à afficher seul.',
}

/**
 * LE PATRON — #2201.51 (16/09/2026, arbitrage de Louis) : **une route retirée
 * de la navigation REDIRIGE.**
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET SA RAISON
 * ─────────────────────────────────────────────────────────────────────────
 * Quand une entrée quitte la barre, sa route survivait ici comme SECOND écran.
 * Résultat : deux endroits montraient la même file, et le second ne le disait
 * pas — la loi 4 du tome 7 (« rien n'apparaît deux fois sous la même forme
 * avec le même contenu ») prise en défaut à chaque retrait d'onglet. La
 * réponse est posée UNE fois, ici, parce que la question revenait à chaque
 * fois : la route redirige vers l'endroit qui porte désormais la capacité, et
 * elle CONSERVE l'identifiant s'il y en a un dans l'URL cible — une
 * notification qui nommait un objet précis doit continuer de le nommer.
 *
 * Trois formes, et aucune autre :
 *  - `redirects` — la route ne rend plus rien (le patron) ;
 *  - `never-in-nav` — elle n'a JAMAIS été une entrée : rebond d'un tiers, lien
 *    signé reçu par e-mail, lien public, fichier de disposition ;
 *  - `contextual-door` — elle est une DESTINATION, ouverte depuis un écran
 *    précis avec son contexte (un identifiant), et pas depuis une barre. Elle
 *    n'a rien à rediriger : un écran la NOMME, et la garde le vérifie ;
 *  - `awaits-absorption` — elle rend ENCORE son écran, parce que sa capacité
 *    n'est montée nulle part ailleurs. C'est un chantier OUVERT, pas un état
 *    stable : la raison doit nommer l'endroit qui doit l'absorber ET le numéro
 *    du point qui le suit. C'est la seule porte de sortie, et elle est étroite
 *    à dessein — rediriger sans avoir d'abord amené la capacité ailleurs, ce
 *    serait la SUPPRIMER en croyant la déplacer (#1508).
 *
 * ⚠️ La redirection se fait dans le `loader` / `beforeLoad`, JAMAIS avec
 * `<Navigate>` (GA-27) : il compare l'identité de son objet props et rejoue en
 * boucle — 106 erreurs React #185 mesurées.
 */
const OFF_NAV_FORM: Record<string, 'redirects' | 'never-in-nav' | 'contextual-door' | 'awaits-absorption'> = {
  '/propositions': 'redirects',
  // #4532/#4533 (24/10/2026) — Imports et Export du vivier sont les onglets de Mes données.
  '/settings/import': 'redirects',
  '/settings/vivier-export': 'redirects',
  '/projects/presentations': 'contextual-door',
  // Théo D (22/10/2026) — Pilotage est une page à sections ancrées : trois anciennes adresses redirigent.
  // Décisions Louis du 23/10/2026 — Signaux et Analyser de Théo reprennent ces deux adresses.
  '/mes-cibles': 'redirects',
  '/search/history': 'redirects',
  '/settings/billing': 'redirects',
  '/pilotage/pipe': 'redirects',
  '/pilotage/staffing': 'redirects',
  '/pilotage/finance': 'redirects',
  // #4197 (L6) — `/consultants/submissions` est de nouveau un ÉCRAN (troisième
  // onglet de Talents) : elle n'est plus ici. `/consultants/pool` redirige
  // toujours (#3962). `/missions/board` rejoint le registre : alias de `/missions`.
  // Décision Louis du 19/10/2026 — Affaires = Pipe seul, Talents = Vivier seul.
  '/projects/needs': 'contextual-door',
  '/auth/callback': 'never-in-nav',
  '/auth/reset-password': 'never-in-nav',
  '/demo': 'never-in-nav',
  '/demo_/acces': 'never-in-nav',
  '/settings/profile/route': 'never-in-nav',
  // #2151.60 — absorbée par « Mes cibles » : le seul chantier ouvert de ce
  // registre est refermé, la route ne rend plus rien.
  // #3585.1 — la mémoire collective est passée sous le Pilotage.
  // Louis 14/10/2026, refonte Pilotage (L0a) : quatre onglets supprimés ou
  // déplacés, leurs adresses redirigent. `/accounts/marches` n'est plus ici :
  // c'est de nouveau un ÉCRAN, onglet de Comptes.
  // Louis 15/10/2026 (#4163.2) : Parcours est une section de Pilotage › Pipe ; les anciennes adresses redirigent.
  // Théo C automations-bibliotheque — deux sous-onglets des Automatisations, jamais des entrées de la barre ; le tiret bas du
  // fichier de route écarte leur identifiant de la redirection de `/actions/automatisations` (comme `/demo_/acces`).
  '/actions/automatisations_/bibliotheque': 'never-in-nav',
  '/actions/automatisations_/journal': 'never-in-nav',
  // Louis 22/10/2026 (Théo C) : Paiements fusionne dans Encaissements ; l'adresse redirige.
  // #4658 — alias FR/EN du verbe principal, redirigent vers /search.
  '/analyse': 'redirects',
  '/analyze': 'redirects',
  // #4668 — alias de la section « Talents » de la refonte CRM/ATS, redirige vers /consultants.
  '/talents': 'redirects',
  // #4710 — alias français des noms affichés par la navigation, redirigent vers la vraie route.
  '/affaires': 'redirects',
  '/comptes': 'redirects',
  '/decouvrir': 'redirects',
  '/equipe': 'redirects',
  '/facturation': 'redirects',
  '/signaux': 'redirects',
  '/vivier': 'redirects',
  '/missions/paiements': 'redirects',
  // Louis 22/10/2026 (Théo C missions-finance.A2) : Cessions devient une section de Missions › Finance.
  '/missions/cessions': 'redirects',
}

/**
 * Le DÉFAUT d'une route hors navigation, ou `null`.
 *
 * Une fonction pure pour que la garde sache dire NON sans qu'on ait à casser
 * un fichier du dépôt : on lui passe une source fabriquée, elle doit NOMMER la
 * route fautive.
 */
function offNavDefect(route: string, form: string, source: string, why: string): string | null {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  if (form === 'redirects') {
    if (!/throw redirect\(/.test(stripped)) return `${route} est déclarée « redirects » mais ne redirige pas`
    if (!/(beforeLoad|loader)\s*:/.test(stripped)) return `${route} redirige hors du loader — GA-27 l'interdit`
    if (/<Navigate/.test(stripped)) return `${route} utilise <Navigate> — GA-27 l'interdit`
    if (/component\s*:/.test(stripped)) return `${route} redirige ET rend encore un écran`
    return null
  }
  if (form === 'awaits-absorption') {
    if (!/#\d{3,}/.test(why)) return `${route} rend encore son écran sans numéro de point qui le suit`
    if (!/\/[a-z]/.test(why)) return `${route} rend encore son écran sans nommer l'endroit qui doit l'absorber`
    return null
  }
  return null
}

describe('#2201.51 — une route retirée de la navigation REDIRIGE (le patron)', () => {
  const sourceOf = (route: string): string => {
    const base = join(WEB_SRC, 'routes', route.replace(/^\//, ''))
    for (const candidate of [`${base}.tsx`, join(base, 'index.tsx')]) {
      try {
        return readFileSync(candidate, 'utf8')
      } catch {
        /* le fichier suivant */
      }
    }
    return ''
  }

  it('LIT quelque chose — chaque route classée a un fichier sur le disque', () => {
    // Sans ce contrôle, une garde qui lit des fichiers absents est verte pour
    // la pire des raisons. `/auth/*` vit sous `routes/auth/`, pas ailleurs.
    const unread = Object.keys(OFF_NAV_FORM).filter(route => sourceOf(route).length === 0)
    expect(unread).toEqual([])
    expect(Object.keys(OFF_NAV_FORM).length).toBeGreaterThanOrEqual(5) // 10 → 5 : #4359 retire 27 alias de route
  })

  it('classe EXACTEMENT les mêmes routes que le registre des raisons — les deux ne divergent pas', () => {
    expect(Object.keys(OFF_NAV_FORM).sort()).toEqual(Object.keys(REACHED_OTHERWISE).sort())
  })

  it('n’a AUCUN défaut — chaque route retirée redirige, dans son loader', () => {
    const defects = Object.entries(OFF_NAV_FORM)
      .map(([route, form]) => offNavDefect(route, form, sourceOf(route), REACHED_OTHERWISE[route] ?? ''))
      .filter((defect): defect is string => defect !== null)
    expect(defects).toEqual([])
  })

  it('ne classe « contextual-door » qu’une route qu’un ÉCRAN nomme vraiment', () => {
    // La différence entre une porte contextuelle et un écran orphelin n'est pas
    // une intention écrite : c'est un `<Link to>` quelque part. On le lit.
    const doors = Object.entries(OFF_NAV_FORM).filter(([, form]) => form === 'contextual-door')
    expect(doors.length).toBeGreaterThan(0)
    const linked = linkedFromAScreen()
    const orphans = doors.filter(([route]) => ![...linked].some(target => target.startsWith(route))).map(([r]) => r)
    expect(orphans).toEqual([])
  })

  it('ne classe « never-in-nav » que des routes que la barre n’a JAMAIS servies', () => {
    const wrong = Object.entries(OFF_NAV_FORM)
      .filter(([route, form]) => form === 'never-in-nav' && ROUTES_BEFORE.includes(route))
      .map(([route]) => route)
    expect(wrong).toEqual([])
  })

  it('sait dire NON : une route « retirée » qui rend encore son écran est NOMMÉE', () => {
    const survivor = "export const Route = createFileRoute('/actions/ecritures')({ component: Page })"
    expect(offNavDefect('/actions/ecritures', 'redirects', survivor, '')).toContain('/actions/ecritures')
  })

  it('sait dire NON : une redirection écrite en <Navigate> est NOMMÉE (GA-27)', () => {
    const navigate = 'beforeLoad: () => {}\nfunction P() { return <Navigate to="/actions" /> }\nthrow redirect('
    expect(offNavDefect('/x', 'redirects', navigate, '')).toContain('GA-27')
  })

  it('sait dire NON : un écran gardé sans chantier ouvert est NOMMÉ', () => {
    expect(offNavDefect('/watchlist', 'awaits-absorption', '', 'on y arrive par une URL')).toContain('/watchlist')
  })

  it('n’attrape PAS ce qu’elle ne vise pas — une redirection juste reste verte (témoin)', () => {
    // Témoins : une redirection juste (source fabriquée — plus aucune route réelle de ce registre
    // ne redirige depuis le 22/10) et une route RÉELLE qui n'a jamais été dans la barre.
    const goodRedirect =
      "export const Route = createFileRoute('/x')({ beforeLoad: () => { throw redirect({ to: '/y' }) } })"
    expect(offNavDefect('/x', 'redirects', goodRedirect, '')).toBeNull()
    expect(offNavDefect('/demo', 'never-in-nav', sourceOf('/demo'), '')).toBeNull()
  })

  it('ne prend pas un COMMENTAIRE pour du code — une route qui parle de <Navigate> reste verte', () => {
    const commented = "/** jamais <Navigate> (GA-27) */\nbeforeLoad: () => { throw redirect({ to: '/x' }) }"
    expect(offNavDefect('/x', 'redirects', commented, '')).toBeNull()
  })
})

/**
 * #2151.60 — LA VEILLE NE REDIRIGE QUE VERS L'ÉCRAN QUI A REÇU SON CONTENU.
 *
 * Décision de Louis du 16/09/2026 : `/watchlist` rejoint « Mes cibles », **mais
 * seulement après que son contenu y ait été porté** — une redirection seule
 * détruirait le flux de signaux quotidien. Le patron ci-dessus vérifie qu'une
 * route retirée REDIRIGE ; il ne vérifie pas OÙ. Or la première version de ce
 * point visait `/discover`, qui ne monte pas le plateau : une cible changée « pour bien faire » y
 * enverrait 187 signaux dans le vide, avec une garde verte.
 *
 * Cette garde tient la CIBLE ; le CONTENU de la cible est tenu par un rendu réel
 * (`signals-library/view/SignalsLibraryPage.test.tsx`, qui monte la bibliothèque et sa vue « Par compte »).
 */
const WATCHLIST_ABSORBER = '/signals'

/** La cible d'un `throw redirect({ to: … })`, commentaires retirés, ou `null`. */
function redirectTarget(source: string): string | null {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  return /throw redirect\(\{\s*to:\s*'([^']+)'/.exec(stripped)?.[1] ?? null
}

describe('#2151.60 — /watchlist redirige vers l’écran qui porte la Veille', () => {
  // Lue DANS les `it` : `WEB_SRC` est déclaré plus bas dans ce fichier, et le
  // corps d'un `describe` s'exécute à la collecte, avant cette déclaration.
  const read = (...segments: string[]) => readFileSync(join(WEB_SRC, ...segments), 'utf8')

  it('la table des anciennes adresses (#4359) mène `/watchlist` à « Mes cibles »', () => {
    expect(currentAddressOf('/watchlist')).toBe(WATCHLIST_ABSORBER)
  })

  it('l’écran cible MONTE le plateau — sinon la redirection efface la Veille', () => {
    // Le lien fichier → écran : le rendu réel est gardé à côté, celui-ci
    // interdit qu'on débranche le montage en laissant la redirection en place.
    const content = read('features', 'signals-library', 'view', 'SignalsLibraryPage.tsx')
    const section = read('features', 'signals-library', 'view', 'SignalsByAccount.tsx')
    const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    expect(strip(content)).toMatch(/<SignalsByAccount\s*\/>/)
    expect(strip(section)).toMatch(/<WatchlistBoard\b/)
  })

  it('sait dire NON : une redirection vers un autre écran est NOMMÉE', () => {
    const elsewhere = "beforeLoad: () => {\n  throw redirect({ to: '/discover', replace: true })\n}"
    expect(redirectTarget(elsewhere)).toBe('/discover')
    expect(redirectTarget(elsewhere)).not.toBe(WATCHLIST_ABSORBER)
  })

  it('n’attrape pas ce qu’elle ne vise pas — une cible citée en COMMENTAIRE ne compte pas', () => {
    const commented =
      "// throw redirect({ to: '/mes-cibles' })\nbeforeLoad: () => { throw redirect({ to: '/accounts' }) }"
    expect(redirectTarget(commented)).toBe('/accounts')
  })
})

describe('sectionForPath', () => {
  it('rattache une FICHE à la section de sa liste', () => {
    expect(sectionForPath('/accounts/abc-123')?.section.key).toBe('accounts')
    expect(sectionForPath('/contacts/abc-123')?.activeTab).toBe('/contacts')
  })

  it('choisit l’onglet le plus SPÉCIFIQUE', () => {
    expect(sectionForPath('/settings/profile')?.section.key).toBe('settings')
  })

  it('ne confond pas deux routes qui partagent un préfixe de texte', () => {
    // `/accounts-archive` n'est PAS dans `/accounts` : comparer par
    // `startsWith` sans la barre oblique attraperait n'importe quel voisin.
    expect(sectionForPath('/accounts-archive')).toBeNull()
  })

  it('rend null hors de la navigation plutôt que de deviner une section', () => {
    expect(sectionForPath('/login')).toBeNull()
    expect(sectionForPath('/bak/home')).toBeNull()
  })

  // #4491.1 (PR 12C, Louis 24/10/2026) — la Messagerie quitte la barre de Ma journée : sa propre section.
  it('range la messagerie dans SA section, plus sous « Ma journée »', () => {
    const found = sectionForPath('/mailbox')
    expect(found?.section.key).toBe('mailbox')
    expect(found?.activeTab).toBe('/mailbox')
  })

  it('ne range plus `/rfp` : ce n’est plus une adresse (#4359) — les appels d’offres sont une lentille du pipe', () => {
    expect(sectionForPath('/rfp')).toBeNull()
  })
})

/** Les routes que la barre latérale des Réglages sert réellement. */
function settingsRoutes(): string[] {
  return SETTINGS_SECTIONS.flatMap(section => section.items.map(item => String(item.to)))
}

const WEB_SRC = join(__dirname, '..', '..')

/** Les routes que le routeur SERT, lues sur le disque. */
function fileRoutes(): string[] {
  const root = join(WEB_SRC, 'routes')
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full, `${prefix}/${entry}`)
        continue
      }
      if (!entry.endsWith('.tsx') || entry.startsWith('__') || /\.(test|spec)\.tsx$/.test(entry)) continue
      const name = entry.slice(0, -4)
      // `$id` est un paramètre : la page se rejoint depuis sa liste, pas depuis
      // une entrée de menu.
      if (name.includes('$') || prefix.includes('$')) continue
      const path = name === 'index' ? prefix : `${prefix}/${name.replace(/\./g, '/')}`
      out.push(path || '/')
    }
  }
  walk(root, '')
  return [...new Set(out)]
}

/** Les routes vers lesquelles un écran POINTE (`<Link to>` ou `navigate`). */
function linkedFromAScreen(): Set<string> {
  const found = new Set<string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) continue
      const source = readFileSync(full, 'utf8')
      for (const m of source.matchAll(/to=['"](\/[^'"]*)['"]/g)) found.add(m[1] as string)
      for (const m of source.matchAll(/to: '(\/[^']*)'/g)) found.add(m[1] as string)
    }
  }
  walk(WEB_SRC)
  return found
}

/**
 * D40 (28/08/2026) — les retours d'expérience se rangent sous MISSIONS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA MESURE QUI FONDE LA DÉCISION
 * ─────────────────────────────────────────────────────────────────────────
 * `/pilotage/rex` était livré et atteignable en deux clics — mais l'entrée
 * latérale « Pilotage » est `managerOnly` ET derrière la capacité
 * `manager_cockpit`. Celui qui A le retour — le commercial, le consultant qui
 * revient de mission — ne voyait donc pas ce chemin, alors que l'endpoint lui
 * est OUVERT : `GET /capitalisation/rex` ne porte aucun `@RequirePermission`
 * (`capitalisation.controller.ts:98`), et l'onglet ne portait ni rôle ni
 * palier. Une entrée cachée plus étroitement que son endpoint ne s'accorde à
 * personne.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI CHANGE EST LA PORTE, PAS L'ADRESSE
 * ─────────────────────────────────────────────────────────────────────────
 * La route reste `/pilotage/rex` : l'exigence A13 la NOMME, et une route SPA
 * qui ne correspond plus à rien est une cause racine déjà payée ici. Elle
 * n'est pas non plus déclarée DEUX fois — la garde « jamais la même route dans
 * deux sections » l'interdit, et pour une bonne raison : l'onglet actif
 * dépendrait alors du chemin emprunté, et la section changerait sous
 * l'utilisateur au rechargement. Un onglet dont la route ne porte pas le nom
 * de sa section est la norme ici, pas l'exception : `/rfp` est sous Projets,
 * `/team` sous Pilotage. (`/integrations` l'était aussi jusqu'au 01/09/2026 ;
 * elle n'est plus un onglet du tout — sa porte est la barre de Réglages.)
 */
describe('les retours d’expérience se rangent sous Missions (D40, 28/08/2026)', () => {
  const missions = NAV_SECTIONS.find(section => section.key === 'missions')
  const pilotage = NAV_SECTIONS.find(section => section.key === 'pilotage')

  it('déclare `/pilotage/rex` sous MISSIONS (écran hors barre, #4197), et nulle part ailleurs', () => {
    // #4197 (L6) — Missions n'a plus que trois onglets ; le débrief est un écran
    // hors barre joint depuis Facturation (`off-nav-screens.ts`).
    expect(missions?.tabs.map(tab => tab.to)).not.toContain('/pilotage/rex')
    expect(OFF_NAV_SCREENS).toContainEqual({ route: '/pilotage/rex', sectionKey: 'missions' })
    expect(pilotage?.tabs.map(tab => tab.to)).not.toContain('/pilotage/rex')
  })

  it('ouvre la porte à qui n’est PAS responsable — ni rôle, ni palier', () => {
    // Les deux filtres qui pouvaient la cacher, et ce qu'ils lisent :
    // `CustomerNavbarBody` retire les entrées `managerOnly` de la barre,
    // `SectionTabs` retire les onglets `managerOnly` de la barre d'onglets.
    expect(missions?.managerOnly).toBeUndefined()
    expect(missions?.feature).toBeUndefined()
  })

  it('laisse l’entrée Missions dans la barre d’un non-responsable', () => {
    // Lu sur la barre RÉELLE (`PLATFORM_SECTIONS`, dérivée du modèle), avec le
    // filtre de `CustomerNavbarBody` : `items.filter(item => !item.managerOnly)`.
    const visibleToNonManager = PLATFORM_SECTIONS.flatMap(section =>
      section.items.filter(item => !item.managerOnly).map(item => String(item.to)),
    )
    expect(visibleToNonManager).toContain('/missions/planification')
    // Louis 15/10/2026 : Pilotage n'est plus réservé au niveau SECTION — il porte
    // Pipe (qui porte Parcours), ouvert à tous ; ce sont les sous-onglets qui filtrent.
    // #4492.2 (PR 12C) — il vit sous « Ma journée », en SOUS-entrée ouverte à tous.
    const today = PLATFORM_SECTIONS.flatMap(section => section.items).find(item => item.to === '/briefing')
    expect(today?.subEntries?.filter(entry => !entry.managerOnly).map(entry => entry.to)).toContain('/pilotage')
  })

  it('résout `/pilotage/rex` sur Missions', () => {
    // #4197 — l'écran est hors barre : la section est Missions, l'onglet « actif »
    // est la racine de la section (la barre, elle, se retire sur un écran hors barre).
    const found = sectionForPath('/pilotage/rex')
    expect(found?.section.key).toBe('missions')
    expect(found?.activeTab).toBe('/missions/planification')
  })

  it('n’allume PAS « Pilotage » pendant que l’écran est celui de Missions', () => {
    // `/pilotage/rex` est un préfixe strict de `/pilotage` : la comparaison par
    // préfixe, seule, allumait l'entrée de l'autre section — la barre latérale
    // aurait dit « Pilotage » sous un écran qui appartient à Missions. Le modèle
    // décide (`isNavEntryActive`, D51), jamais le préfixe d'URL.
    expect(isNavEntryActive('/pilotage', '/pilotage/rex')).toBe(false)
    expect(isNavEntryActive('/missions/planification', '/pilotage/rex')).toBe(true)
    // Rien ne change partout ailleurs, y compris pour les entrées qui ne sont
    // PAS des routes de section (barre des Réglages, back-office).
    // #4492.2 (PR 12C) — Pilotage n'est plus une entrée : ses écrans allument « Ma journée ».
    expect(isNavEntryActive('/briefing', '/pilotage/finance')).toBe(true)
    expect(isNavEntryActive('/briefing', '/pilotage')).toBe(true)
    expect(isNavEntryActive('/missions/planification', '/missions/cra')).toBe(true)
    expect(isNavEntryActive('/integrations', '/integrations')).toBe(true)
    expect(isNavEntryActive('/bak/home', '/bak/home')).toBe(true)
  })

  it('ne DÉGARNIT pas le Pilotage — ses gardes ne bougent pas ; ses sections deviennent des ancres (Théo D)', () => {
    // Louis 15/10/2026 : les droits vivent par SOUS-ONGLET, plus sur la section.
    expect(pilotage?.managerOnly).toBeUndefined()
    expect(pilotage?.feature).toBeUndefined()
    // Théo D (Louis 22/10/2026) : Pilotage est UNE page, ses sections sont des ANCRES (Cockpit · Pipe ·
    // Staffing · Finance) — plus d'onglets. Le CA probable vit toujours dans la section Pipe.
    expect(pilotage?.tabs.map(tab => tab.to)).toEqual([])
  })

  it('garde la ROUTE `/pilotage/rex` servie ET atteignable — aucun 404 (A13)', () => {
    expect(fileRoutes()).toContain('/pilotage/rex')
    expect(offNavRoutes()).toContain('/pilotage/rex')
  })

  it('dit ce que l’écran FAIT, dans les deux langues', () => {
    // ⚠️ Un `:` dans une clé i18next est lu comme un NAMESPACE — la clé
    // resterait introuvable. Les deux catalogues sont lus DIRECTEMENT : passer
    // par une instance i18n non initialisée rendrait la clé elle-même.
    // ⚠️ « Retours d'expérience » NOMMAIT l'objet — du jargon de responsable,
    // pour un écran qui s'adresse à celui qui revient de mission. L'anglais dit
    // « assignment » comme le reste du catalogue.
    expect(navFr.tabs.rex).toBe('Débriefer une mission')
    expect(navEn.tabs.rex).toBe('Debrief an assignment')
  })
})

describe('les besoins ouverts vivent sous AFFAIRES (#4344, Louis 19/10/2026 — renverse #4197)', () => {
  it('`/projects/needs` n’est plus un onglet — ni de Talents, ni d’Affaires', () => {
    for (const key of ['talents', 'projects']) {
      expect(NAV_SECTIONS.find(section => section.key === key)?.tabs.map(tab => tab.to)).not.toContain(
        '/projects/needs',
      )
    }
  })

  it('la section résolue pour `/projects/needs` et la fiche d’un besoin est « Affaires »', () => {
    expect(sectionForPath('/projects/needs')?.section.key).toBe('projects')
    expect(sectionForPath('/projects/needs/abc-123')?.section.key).toBe('projects')
  })

  it('l’entrée « Affaires » s’allume pendant que l’on est sur les besoins', () => {
    expect(isNavEntryActive('/projects', '/projects/needs')).toBe(true)
  })
})

/**
 * LES GROUPES D'ONGLETS (option B, tranchée par Louis le 01/09/2026).
 *
 * « Les onglets sont super moches, et dans des cas comme Missions on a une
 * barre d'onglets infinie. » Treize onglets ne sont pas treize sujets : ce sont
 * quatre moments du mois. La barre porte les moments, chaque moment ouvre ses
 * écrans — elle ne grandit donc plus quand un écran s'ajoute, seulement quand
 * un MOMENT s'ajoute, ce qui n'arrive presque jamais.
 *
 * Ces gardes tiennent les deux façons dont un groupement se casse : un écran
 * qui n'est dans aucun groupe (donc introuvable), et un groupe qui gonfle
 * jusqu'à recréer la barre infinie qu'on retire.
 */
describe('les groupes d’onglets — la barre est bornée par construction', () => {
  const grouped = NAV_SECTIONS.filter(section => section.groups && section.groups.length > 0)

  it('#4197 (L6) — plus aucune section ne groupe ses onglets : Missions est passée à trois onglets à plat', () => {
    // Le mécanisme `groups` survit (`SectionTabs`, `GroupedTabNav`), mais le
    // groupement « commence là où la barre débordait » : trois onglets ne
    // débordent pas. Si une section en redéclare, ce test dit laquelle.
    expect(grouped.map(section => section.key)).toEqual([])
  })

  it.each(NAV_SECTIONS.map(section => [section.key, section] as const))(
    '%s — aucun onglet orphelin : un écran hors groupe est un écran introuvable',
    (_key, section) => {
      if (!section.groups?.length) {
        // Section non groupée : personne ne doit déclarer un groupe en douce,
        // sinon l'onglet se rendrait sans jamais s'ouvrir. #4492 (PR 12C) — l'exception
        // `sidebarGroup` (tiroir « Prospection ») est tombée avec lui : Comptes, Contacts et
        // Signaux sont des sections, leurs sous-entrées se lisent dans `familyEntries`.
        expect(section.tabs.every(tab => tab.group === undefined)).toBe(true)
        return
      }
      const declared = new Set(section.groups.map(group => group.key))
      for (const tab of section.tabs) {
        expect(declared.has(tab.group ?? '')).toBe(true)
      }
    },
  )

  it.each(NAV_SECTIONS.filter(s => s.groups?.length).map(s => [s.key, s] as const))(
    '%s — aucun groupe vide, et la barre reste sous six entrées',
    (_key, section) => {
      const groups = section.groups ?? []
      // Un groupe vide rendrait un menu qui n'ouvre rien.
      for (const group of groups) {
        expect(section.tabs.some(tab => tab.group === group.key)).toBe(true)
      }
      // SIX : au-delà, on a reconstruit la barre infinie avec un niveau de plus.
      expect(groups.length).toBeLessThanOrEqual(6)
    },
  )

  it('ne groupe pas une section courte — grouper trois onglets coûte un clic pour rien', () => {
    for (const section of grouped) {
      expect(section.tabs.length).toBeGreaterThanOrEqual(6)
    }
  })

  it('nomme chaque groupe dans les DEUX langues', () => {
    for (const section of grouped) {
      for (const group of section.groups ?? []) {
        const path = group.labelKey.split('.')
        const read = (dict: Record<string, unknown>) =>
          path.reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], dict)
        expect(read(navFr as Record<string, unknown>)).toBeTruthy()
        expect(read(navEn as Record<string, unknown>)).toBeTruthy()
      }
    }
  })
})

/**
 * #1800 (09/09/2026) — « tu peux supprimer la notion de favori et cette page
 * ça ne sert à rien » (Louis, arbitrage produit).
 *
 * La PAGE et L'ONGLET restent retirés — #1800 tient. Ce qui change ici est
 * #2155.27 (15/09/2026, « on archive, on ne supprime pas ») : `/favorites`
 * était SUPPRIMÉE sans redirection, et une URL qu'un bêta-testeur a mise en
 * favori doit continuer d'arriver quelque part de juste plutôt qu'une page
 * blanche. Le fichier de route REVIENT donc, mais comme pure redirection
 * (`beforeLoad`, jamais `<Navigate>` — GA-27) vers `/accounts` : aucune vue «
 * favoris » n'existe plus pour cibler plus précisément, et en inventer une
 * ranimerait une capacité que Louis a explicitement tuée.
 */
describe('#1800 — « /favorites » n’a plus de page, d’onglet ni de route (#4359)', () => {
  it('n’a plus de fichier de route : l’URL tombe sur la page « introuvable »', () => {
    expect(fileRoutes()).not.toContain('/favorites')
  })

  it("n'est servie par AUCUNE barre de navigation — ni onglet, ni entrée", () => {
    expect(allNavRoutes()).not.toContain('/favorites')
    expect(settingsRoutes()).not.toContain('/favorites')
  })

  it("ne rattache plus aucune section — la route n'a plus de sens à résoudre", () => {
    expect(sectionForPath('/favorites')).toBeFalsy()
  })
})

/**
 * #1831 — « Créer une mission » en PREMIER — RENVERSÉ le 16/09/2026 (#2153).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT GARDÉ ICI, ET POURQUOI (pour mémoire)
 * ─────────────────────────────────────────────────────────────────────────
 * Le groupe « Ouvrir » (un seul membre : `/missions/nouvelle`) se rendait en
 * bouton direct — voir `grouped-tab-nav.tsx` — et la barre suit l'ORDRE de
 * `groups`. Ces deux assertions tenaient donc une chose vraie : le bouton de
 * création le plus à GAUCHE, sans que ça change l'écran ouvert par défaut.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE REVIREMENT — Louis, 16/09/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Missions passe de treize onglets à QUATRE entrées (#2153.3 à .17). Les cinq
 * moments du 01/09 disparaissent, « Ouvrir » avec eux : il n'y a plus de
 * groupe à placer en tête. Le récit complet et ce qui TIENT ENCORE sont en
 * tête de `sections.ts` ; la garde de la réduction est
 * `missions-four-groups.test.ts`.
 *
 * Ce que ce bloc garde désormais est la part de #1831 qui SURVIT : la création
 * reste dans la barre, dans le menu le plus à gauche, et la liste reste
 * l'écran ouvert par défaut. Ce qui est perdu — le bouton DIRECT, sans clic de
 * menu — est compensé par les écrans qui mènent déjà à la création, et c'est
 * la dernière assertion qui le mesure.
 */
describe('Missions — « Nouvelle mission » est un BOUTON de « En cours » (#4197, 14/10/2026)', () => {
  const missions = NAV_SECTIONS.find(section => section.key === 'missions')

  it('n’a plus de groupe : les sept onglets V22 du cycle, à plat (#4491.2, PR 12C)', () => {
    expect(missions?.groups).toBeUndefined()
    // Théo C missions-notes-de-frais.N1 — « Notes de frais » est un onglet de Missions.
    expect(missions?.tabs.map(tab => tab.to)).toEqual([
      '/missions/planification',
      '/missions/cra',
      '/missions/notes-de-frais',
      '/missions/facturation',
      '/missions/factures',
      '/missions/encaissements',
      '/missions/finance',
    ])
  })

  it('Théo C missions-notes-de-frais.N1 — l’onglet « Notes de frais » allume Missions, et /expenses ne vit plus que par sa redirection', () => {
    expect(sectionForPath('/missions/notes-de-frais')?.section.key).toBe('missions')
    expect(sectionForPath('/missions/notes-de-frais')?.activeTab).toBe('/missions/notes-de-frais')
  })

  it('laisse Planning ouvrir la section par défaut (#4351.1) — `/missions` reste un écran hors barre', () => {
    expect(missions?.to).toBe('/missions/planification')
    expect(sectionForPath('/missions')?.section.key).toBe('missions')
  })

  it('garde `/missions/nouvelle` servi, hors barre, et joint par un bouton', () => {
    expect(offNavRoutes()).toContain('/missions/nouvelle')
    expect(allNavRoutes()).not.toContain('/missions/nouvelle')
    // La porte est MESURÉE, pas supposée : des écrans pointent vers la création
    // (fiche compte ‹ Missions › et ‹ Preuves ›, fiche projet, bouton de « En cours »).
    expect(linkedFromAScreen().has('/missions/nouvelle')).toBe(true)
  })
})
