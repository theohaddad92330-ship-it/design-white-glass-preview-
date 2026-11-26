import type { PlanFeatureKey } from '@bellum/contracts'

import { OFF_NAV_SCREENS } from './off-nav-screens'

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * REVIREMENT — 14/10/2026, Louis (#4197, épopée #4191, L6) : AFFAIRES · TALENTS ·
 * MISSIONS, TROIS ONGLETS CHACUNE
 * ═════════════════════════════════════════════════════════════════════════════
 * Le récit du 16/09/2026 ci-dessous (Missions à QUATRE entrées groupées) est
 * RENVERSÉ pour Missions : trois onglets à plat — « En cours », « Planning »,
 * « Facturation » — et plus aucun groupe déroulant. Les écrans de gestion
 * (relevés, ADV, notes de frais, encaissements, cessions, paiements, suivi,
 * débrief) sortent de la barre vers `off-nav-screens.ts` et se joignent par la
 * rangée « Administration » de Facturation. Rien n'est supprimé : les routes
 * sont servies, liées et mises en favori comme avant.
 *
 * Les notes 1 à 5 ci-dessous restent vraies pour ce qu'elles disent des ROUTES
 * (« aucune route ne quitte le routeur », `/missions/cra` reste une destination
 * déclarée pour la routine des relevés manquants) ; ce qui change est le
 * REGROUPEMENT. `/missions/board` redirige vers `/missions`.
 */

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * REVIREMENT — 16/09/2026, Louis : MISSIONS PASSE DE TREIZE ONGLETS À QUATRE
 * ═════════════════════════════════════════════════════════════════════════════
 * CE QUI EST RENVERSÉ (#2153.3 à .17, ENG-850) : le regroupement du 01/09/2026
 * en CINQ moments — « Ouvrir » · « Piloter » · « Produire » · « Encaisser » ·
 * « Archives » — et avec lui #1831, qui voulait « Créer une mission » en bouton
 * direct, le plus à gauche de la barre. Les treize onglets se rendent désormais
 * sous QUATRE entrées, celles que l'issue NOMME, dans son ordre :
 *
 *   « En cours » · « Planification » · « Renouvellements » · « Administration / Finance »
 *
 * ⚠️ Ce n'est un oubli ni du 01/09 ni de #1831 : Louis a tranché en
 * connaissance de cause. La MESURE qui fondait les cinq moments reste vraie et
 * est gardée ci-dessous pour mémoire — treize onglets à plat débordaient, et
 * « Paiements » et « Suivi » sortaient du champ sans que rien ne dise qu'ils
 * existaient. Ce qui a changé n'est donc pas la mesure, c'est l'arbitrage
 * produit : cinq moments obligeaient encore à deviner dans lequel une question
 * était rangée ; quatre répondent à la question que la section pose —
 * « qu'est-ce qui est en cours, qu'est-ce qui menace le revenu et quelle suite
 * faut-il préparer ? ».
 *
 * CE QUI CONVERGE, et qui rend la décision plus solide qu'un changement d'avis :
 * la doctrine MOBILE du dépôt borne déjà la navigation à QUATRE entrées —
 * au-delà, les cibles tactiles passent sous 44 px (gardes GA-28 / GA-29 /
 * GA-30). Le produit demandait donc quatre d'un côté et en rendait cinq de
 * l'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI TIENT ENCORE — à NE PAS « réparer » en croyant à une régression
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. La réduction ne SUPPRIME rien, exactement comme celle à neuf entrées
 *     décrite juste en dessous : les treize routes restent servies, liées et
 *     mises en favori. Aucune ne quitte le routeur. Gardes : les deux de
 *     `sections.test.ts` (chaque ancienne route reste atteignable ; aucune
 *     route orpheline) et `missions-four-groups.test.ts`, qui NOMME la route
 *     qui manquerait.
 *  2. `/missions/cra` reste une DESTINATION déclarée. La routine « relevés
 *     d'activité manquants » y envoie un lien profond — vérifié, pas supposé :
 *     `apps/api/src/modules/routines/routine-executors.ts:365`,
 *     `link: '/missions/cra'`. L'onglet passe sous « Administration / Finance »
 *     et `sectionForPath('/missions/cra')` rend toujours la section `missions`
 *     avec `/missions/cra` pour onglet actif : la notification arrive sur
 *     l'écran, pas sur la porte de la section.
 *  3. L'écran « Suivi » (revirement de Louis du 31/08, raconté plus bas sur
 *     l'onglet Planification) n'est ni retiré ni fusionné : il reste un onglet,
 *     sous « En cours ». Ses trois colonnes du milieu continuent de distinguer
 *     « sans objet », « à faire » et « non mesuré » — c'est la condition à
 *     laquelle Louis a accepté cet écran, et un regroupement qui écraserait ces
 *     trois populations en deux rendrait la table menteuse sur trois colonnes.
 *     La dérivation ne bouge pas : `features/mission-tracking/derive.ts`.
 *  4. « Historique » n'est toujours PAS « Piloter » (#1376, 04/09) : le board
 *     montre ce qui a ÉTÉ, il ne suit pas une affaire en cours. Le GROUPE
 *     `archive` disparaît, la DISTINCTION survit — le board quitte le moment
 *     « ce qui tourne » pour « Renouvellements », celui où une mission se
 *     termine et où l'on décide de la suite. C'est déjà là que la lentille
 *     « Renouvellements » de la liste renvoie ses missions terminées
 *     (`features/missions/view/MissionsPage.tsx:263`, `<Link to="/missions/board">`).
 *  5. `/missions/nouvelle` garde son palier `needs` et sa place dans la barre :
 *     deuxième entrée de « En cours », la porte par laquelle on lance ce qui
 *     tournera. #1831 la voulait le plus à GAUCHE ; elle est maintenant à un
 *     clic DANS le menu le plus à gauche. Trois écrans y mènent par ailleurs
 *     directement (`TabMissions.tsx:168`, `TabProofs.tsx:425`,
 *     `ProjectPropertiesContent.tsx`, ex-`ProjectDetailSheet`, #4194) : c'est la capacité qui compte, et elle est
 *     intacte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT DÛ, ET QUI EST RÉSORBÉ — #2195.1, 16/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Le doublon de LIBELLÉ que ce fichier déclarait « assumé et daté » n'existe
 * plus. « Renouvellements » désignait deux choses : ce GROUPE, et une lentille
 * de `/missions` qui rendait une autre liste — ce que la loi 4 du tome 7
 * interdit (« rien n'apparaît deux fois sous la même forme avec le même
 * contenu »).
 *
 * Il est résorbé PAR LE HAUT, comme annoncé : `/missions/renouvellements` est
 * la page de décision de #2195 (ENG-891), première entrée du groupe, et la
 * lentille de `/missions` a été RETIRÉE dans le même lot. Elle n'avait pas
 * d'URL — son état vivait en mémoire de composant — donc aucun lien partagé
 * n'est cassé, et `/missions` garde ses deux lentilles restantes (« En cours »
 * et « Prêt à facturer »), qui répondent chacune à une autre question.
 *
 * ⚠️ Le libellé de l'ONGLET n'est pas « Renouvellements » et ce n'est pas un
 * oubli : un onglet qui répète le nom de son groupe rejouerait exactement le
 * doublon qu'on vient de retirer. Il porte ce que l'écran FAIT — « Décider de
 * la suite » —, ce que l'objectif de l'issue dit mot pour mot (« créer une
 * vraie page de décision »).
 */

/**
 * La navigation, en NEUF entrées.
 *
 * Le produit en avait seize, et le rapport en fait un risque nommé : au-delà de
 * dix, personne ne cherche plus — on utilise les trois qu'on connaît, et les
 * treize autres deviennent des écrans livrés que personne n'ouvre. Le coût réel
 * n'est pas l'encombrement, c'est que chaque écran ajouté rend les précédents
 * moins visibles.
 *
 * La réduction ne SUPPRIME rien : chaque surface absorbée garde sa route, ses
 * liens partagés et ses favoris, et réapparaît comme ONGLET de la section qui
 * l'accueille. C'est la seule forme de réduction acceptable — faire disparaître
 * un écran auquel quelqu'un a envoyé un lien est une régression, pas une
 * simplification.
 *
 * Deux gardes tiennent la promesse (`sections.test.ts`) :
 *  1. toute route de la nav précédente est encore ATTEIGNABLE, comme section ou
 *     comme onglet ;
 *  2. aucune route n'apparaît deux fois — un écran présent dans deux sections
 *     rend l'onglet actif imprévisible selon le chemin emprunté.
 */

type SectionTab = {
  to: string
  /**
   * #4491 (PR 12C, maquette V22) — la VUE que l'onglet ouvre, quand elle voyage dans l'URL et non dans le
   * chemin : « Mon agenda » (`/briefing?vue=agenda`), les vues de la Messagerie (`/mailbox?vue=drafts`),
   * « Mes listes de cibles » (`/accounts?lens=lists`). Aucune route n'est créée pour elles (contrat du lot).
   * L'onglet s'allume quand CHAQUE paramètre déclaré a sa valeur ; sinon c'est l'onglet SANS paramètre du
   * même chemin qui s'allume (`activeNavEntry`).
   */
  search?: Readonly<Record<string, string>>
  /** Clé i18n dans le namespace `nav` (`tabs.contacts`). */
  labelKey: string
  /**
   * #4492.1 — le libellé de la SOUS-ENTRÉE de barre latérale quand il diffère de l'onglet du haut.
   * « Ma journée » en haut de l'écran ; « Mon activité » sous l'entrée « Ma journée » qui le porte déjà.
   */
  subLabelKey?: string
  /**
   * #2112.13-16 — LE RÔLE de la destination, clé i18n dans `nav`
   * (`tabHints.today`). Rendu en aide au SURVOL par `TabNav`, jamais affiché
   * en permanence.
   *
   * ⚠️ Optionnel, et il le reste : trois destinations qu'un novice confond
   * méritent une phrase ; treize onglets de Missions n'en méritent pas treize.
   * Une section qui n'en déclare pas n'affiche aucune aide — rien n'est dérivé
   * du libellé.
   */
  hintKey?: string
  /** Palier requis. L'onglet reste visible, verrouillé — voir `items.ts`. */
  feature?: PlanFeatureKey
  /** Réservé aux responsables (cockpit d'équipe). */
  managerOnly?: boolean
  /** #4158.9 — absent d'un espace solo (moins de deux membres actifs). */
  requiresTeam?: boolean
  /**
   * Le GROUPE qui porte cet onglet dans la barre (option B, 01/09/2026).
   *
   * Obligatoire dès que la section déclare des `groups` — un onglet sans groupe
   * ne serait rendu nulle part, donc introuvable. Garde dans `sections.test.ts`.
   */
  group?: string
}

/** Un moment de travail, pas un sujet : voir `NAV_SECTIONS` § Missions. */
type SectionTabGroup = {
  key: string
  /** Clé i18n dans le namespace `nav` (`groups.missionsPilot`). */
  labelKey: string
}

type NavSection = {
  /** Identifiant stable de la section, utilisé par les tests et l'analytique. */
  key: string
  /** La route de la section elle-même : celle du premier onglet. */
  to: string
  labelKey: string
  feature?: PlanFeatureKey
  managerOnly?: boolean
  /** #4158.9 — l'entrée n'existe que si l'espace compte au moins deux membres
   *  ACTIFS (`workspace.memberCount`, invitations en attente exclues). */
  requiresTeam?: boolean
  /**
   * Les surfaces absorbées, y compris la section elle-même en premier.
   *
   * Vide = la section n'a qu'un écran, et l'entête n'affiche aucun onglet : une
   * barre d'onglets à un seul onglet est un ornement qui coûte une ligne.
   */
  tabs: SectionTab[]
  /**
   * LES GROUPES DE LA BARRE (option B, tranchée par Louis le 01/09/2026).
   *
   * Absent = la section rend ses onglets à plat. Grouper trois onglets coûte un
   * clic et n'apprend rien : le groupement commence là où la barre débordait.
   */
  groups?: SectionTabGroup[]
  /**
   * #4492.2 (PR 12C, Louis 24/10/2026) — la section qui PORTE celle-ci. Équipe et Pilotage quittent le
   * premier niveau de la barre latérale : ils vivent sous « Ma journée », en sous-entrées ET en onglets du
   * haut (Ma journée · Mon agenda · Équipe · Pilotage). Leur route, leurs onglets propres (Équipe › Vue
   * d'ensemble…) et leurs droits ne changent pas.
   */
  parent?: string
  /**
   * La section qui la porte SUR MOBILE seulement (≤ 768 px). La coque mobile n'a que quatre onglets en bas
   * et pas de barre latérale (GA-28) : Contacts, Signaux et Découvrir s'y atteignent depuis la barre de
   * Comptes, la Messagerie depuis celle de Ma journée — comme avant la séparation des sections.
   */
  mobileParent?: string
  /**
   * L'écran dessine LUI-MÊME ces onglets, avec ce que seul lui connaît (compteurs, vue locale) : la barre
   * du haut ne les recopie pas (« rien n'apparaît deux fois sous la même forme »), la barre latérale les lit
   * ICI pour ses sous-entrées.
   */
  tabsInPage?: boolean
  /**
   * Comme `tabsInPage`, mais POUR CES CHEMINS SEULEMENT : l'écran de la route dessine déjà les onglets de la
   * section (recette PR 12, 24/10 : /team portait deux rangées qui se doublaient). Les autres routes de la
   * section, dont l'écran n'en dessine aucun, gardent la rangée de la barre du haut.
   */
  tabsInPageAt?: readonly string[]
  /** #2155.26 — l'étiquette qui nomme, sur mobile, la famille de sections portée par cette barre. */
  mobileFamilyLabelKey?: string
}

/**
 * Les sections, dans l'ordre de la barre latérale (maquette V22 : Ma journée, Comptes, Contacts, Signaux,
 * Affaires, Talents, Missions, Actions, Messagerie). Une section FILLE (`parent`) se range sous l'entrée qui
 * la porte ; une section absente de la rubrique (`NOT_IN_SIDEBAR`, `items.ts`) garde sa propre porte.
 *
 * L'ordre suit la journée d'un commercial : ce qui l'attend ce matin, puis ce
 * sur quoi il travaille (comptes → projets → talents → missions), puis ce qu'il
 * a fait, puis ses outils.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'today',
    to: '/briefing',
    labelKey: 'items.today',
    /*
     * #4491.1 (PR 12C, contrat validé par Louis le 24/10/2026, maquette V22 `.a14-daynav`) — LA BARRE DE
     * MA JOURNÉE : Ma journée · Mon agenda · Équipe · Pilotage, la MÊME sur /briefing, sur l'agenda
     * (`?vue=agenda`, la route existante), sur /team et sur /pilotage. Équipe et Pilotage y entrent comme
     * sections FILLES (`parent: 'today'`), pas comme onglets recopiés.
     *
     * ⚠️ Revient sur la Messagerie « descendue en onglet de Ma journée » (on ne l'ouvre pas pour voir, on
     * l'ouvre parce que quelque chose attend) : décision Louis 24/10, #4491. Elle redevient une SECTION,
     * entrée de premier niveau de la barre latérale ; sur mobile seulement, elle reste un tap plus loin
     * depuis cette barre (`mobileParent`), la coque mobile n'ayant que quatre onglets (GA-28).
     */
    tabs: [
      { to: '/briefing', labelKey: 'tabs.today', subLabelKey: 'tabs.myActivity', hintKey: 'tabHints.today' },
      { to: '/briefing', search: { vue: 'agenda' }, labelKey: 'tabs.myAgenda' },
    ],
  },
  {
    key: 'accounts',
    /*
     * #4492.3 (PR 12C) — Comptes, Contacts et Signaux redeviennent TROIS sections, chacune avec ses sous-
     * entrées V22 (revient sur #3132, décision Louis 24/10, #4492 : le tiroir retiré revient sous la forme
     * V22, une sous-navigation sous l'entrée ACTIVE). Les routes ne bougent pas.
     *
     * « Mes listes de cibles » quitte la page Comptes (lot COMPTES-LISTE) : elle vit ICI, en sous-entrée et
     * en onglet, sur la lentille existante `?lens=lists` (#4088.8) — aucune route neuve.
     * Marchés locaux (Louis 14/10/2026 : « Marché est de la prospection, pas du pilotage ») reste l'onglet
     * de Comptes qu'il était. `/accounts/marches/$zoneId` reste une fiche, atteinte depuis un compte.
     */
    to: '/accounts',
    labelKey: 'items.accounts',
    mobileFamilyLabelKey: 'items.prospection',
    tabs: [
      { to: '/accounts', labelKey: 'tabs.portfolio' },
      { to: '/accounts', search: { lens: 'lists' }, labelKey: 'tabs.targetLists' },
      { to: '/accounts/marches', labelKey: 'tabs.market' },
    ],
  },
  {
    key: 'contacts',
    /*
     * Un contact n'existe pas sans son compte, mais il a sa propre entrée V22 et ses trois vues :
     * Répertoire · Mes listes (Théo B c2, contacts ET comptes) · Imports & sources (Théo B c3). L'écran les
     * dessine lui-même, avec le nombre de listes (`tabsInPage`) : la barre latérale les lit ici.
     */
    to: '/contacts',
    labelKey: 'items.contacts',
    mobileParent: 'accounts',
    tabsInPage: true,
    tabs: [
      { to: '/contacts', labelKey: 'tabs.directory' },
      { to: '/contacts/lists', labelKey: 'tabs.contactLists' },
      { to: '/contacts/imports', labelKey: 'tabs.contactImports' },
    ],
  },
  {
    key: 'signals',
    /*
     * #2155.2 / .13 — « Signaux » (ex-« Mes cibles »). Ses vues (Tous · Enregistrés · Écartés · Corbeille)
     * sont des filtres de l'écran (lot SIGNAUX), pas des routes : aucun onglet de section.
     * `/watchlist` n'est qu'une redirection vers `/mes-cibles` — `sections.test.ts` REACHED_OTHERWISE.
     */
    to: '/signals',
    labelKey: 'items.signals',
    mobileParent: 'accounts',
    tabs: [],
  },
  {
    key: 'discover',
    /*
     * #4312 / #3610 — Découvrir a SON bouton lavande en haut de la barre latérale (`CustomerNavbarBody`) :
     * c'est sa porte, il n'est pas une entrée de la rubrique (`NOT_IN_SIDEBAR`). Il était le dernier onglet
     * de Comptes ; séparé, il garde sa porte mobile depuis la barre de Comptes (`mobileParent`).
     */
    to: '/discover',
    labelKey: 'items.discover',
    feature: 'discover',
    mobileParent: 'accounts',
    tabs: [],
  },
  /**
   * #4197 (L6, épopée #4191 — Louis, 14/10/2026) — AFFAIRES · TALENTS · MISSIONS.
   *
   * Trois sections de TROIS onglets, neuf destinations en tout. Les URL
   * existantes sont CONSERVÉES : renommer `/projects` ou `/consultants` aurait
   * cassé des centaines de liens partagés et ceux que Laura a écrits
   * (`apps/ia`). Seuls changent les LIBELLÉS et le rangement.
   *
   * « Affaires » — ce qui se vend : le Pipe (`/projects`), les Pistes détectées
   * à qualifier (`/projects/pistes`, ex-lentille `?lens=portfolio`, qui
   * redirige) et les appels d'offres, TOUJOURS visibles (plus de `hiddenUnless`
   * : un onglet qui apparaît quand on a de l'usage se lisait comme une panne).
   *
   * Le CA probable n'est plus ici : il vit dans Pilotage › Pipe
   * (`/pilotage/pipe`, `PipeScreen`), un seul endroit (GA-26).
   */
  {
    key: 'projects',
    to: '/projects',
    labelKey: 'items.affairs',
    feature: 'needs',
    /*
     * ⚠️ DÉCISION LOUIS DU 19/10/2026 (call refonte UX + QCM) — renversement
     * ASSUMÉ de l'arbitrage 1 de #4191 (14/10), écrit daté dans
     * `agent_docs/doctrine.md`. Affaires = le Pipe SEUL, donc aucun onglet (une
     * barre à un onglet est un ornement, `sections.test.ts`). Rien n'est perdu :
     *  - #4340 — les Pistes rejoignaient Signaux ; #4545 (Louis 25/10) revient dessus :
     *    `/projects/pistes` redirige vers le panneau des pistes du Pipe (`/projects?pistes=1`) ;
     *  - #4341 — les appels d'offres vivent DANS le pipe (`/projects?lens=rfp`,
     *    bouton de l'entête) : `/rfp` y redirige ;
     *  - #4344 — les besoins ouverts quittent Talents : `/projects/needs` n'est
     *    plus déclaré, `sectionForPath` le range donc sous `/projects`.
     *
     * ⚠️ PAS D'ONGLET « PROPOSITIONS » (retiré le 05/09/2026, #1453) : on entre
     * dans le studio depuis le dossier concerné (« Préparer la proposition »,
     * `ProjectPropertiesContent`). La route survit en lien profond.
     */
    tabs: [],
  },
  /**
   * TALENTS = LE VIVIER SEUL (décision Louis du 19/10/2026, renversement ASSUMÉ
   * de l'arbitrage 1 de #4191 du 14/10, écrit daté dans `agent_docs/doctrine.md`).
   *
   *  - #4344 — « Besoins ouverts » quitte Talents : un besoin client est une
   *    affaire, l'écran vit sous Affaires (`/projects/needs`, plus déclaré ici).
   *  - #4349 — « Positionnements » quitte Talents ; #4528 (Louis 24/10/2026,
   *    revient sur #4502 côté Talents) — une présentation ne vit qu'à UN
   *    endroit, Affaires › Présentations (`/projects/presentations`) :
   *    `/consultants/submissions`, `/consultants#positionnements` et
   *    `/consultants?view=submissions` y redirigent ; une présentation se lit
   *    aussi sur la fiche consultant et sur l'affaire.
   *
   * ⚠️ La raison du 27/08/2026 TIENT — les deux écrans « n'étaient
   * atteignables que par une URL tapée à la main » — et elle reste HONORÉE :
   * les deux contenus ont une porte visible, ils n'ont plus d'onglet. `vivier-is-one-page-with-views.test.ts`.
   */
  {
    key: 'talents',
    to: '/consultants',
    labelKey: 'items.talents',
    feature: 'talent_pool',
    tabs: [],
  },
  /**
   * #4197 (L6) — MISSIONS : TROIS ONGLETS, PLUS DE GROUPES DÉROULANTS.
   *
   * ⚠️ Ceci REMPLACE les quatre entrées du 16/09/2026 (récit en tête de ce
   * fichier). Ce qui est conservé : AUCUNE route ne disparaît. Les écrans de
   * gestion — relevés (`/missions/cra`), ADV, notes de frais, encaissements,
   * cessions, paiements, suivi, débrief (`/pilotage/rex`) et la création
   * (`/missions/nouvelle`) — sortent de la barre et vivent dans
   * `off-nav-screens.ts` (section `missions`). Ils restent joignables : par la
   * rangée « Administration » de Facturation, par le bouton « Nouvelle mission »
   * de « En cours », et par les liens profonds des routines
   * (`routine-executors.ts` → `/missions/cra`).
   *
   * `/missions/board` (Historique) redirige vers `/missions` : le board ne
   * possède aucun état (`mission-board-owns-no-state.spec.ts`) et ses missions
   * terminées se lisent dans « En cours » (filtre de fin de mission).
   */
  {
    key: 'missions',
    // #4351.1 — « En cours » quitte la barre (Louis, 19/10/2026) : Planning est
    // le premier onglet et l'ENTRÉE de la section. `/missions` nu redirige vers
    // lui ; la liste, servie sous `?vue=liste`, se joint par le bouton « Liste
    // des missions » de Planning.
    to: '/missions/planification',
    labelKey: 'items.missions',
    /*
     * #4491.2 (PR 12C, maquette V22 `.v18-tabs` « Cycle Missions et finance ») — les SEPT onglets du cycle :
     * Planning · Relevés d'activité · Notes de frais · Prêt à facturer · Factures · Encaissements · Vue
     * financière. Relevés, factures, encaissements et vue financière sortent de `off-nav-screens.ts` : ce
     * sont des onglets, plus des écrans joints par la rangée « Administration » seule.
     */
    tabs: [
      { to: '/missions/planification', labelKey: 'tabs.missionsPlanning' },
      { to: '/missions/cra', labelKey: 'tabs.missionsCra' },
      // Théo C missions-notes-de-frais.N1 — « Notes de frais » est un ONGLET de Missions (Louis
      // 22/10/2026) : la page de `/expenses` y est montée, `/expenses` redirige ici.
      { to: '/missions/notes-de-frais', labelKey: 'tabs.missionsExpenses' },
      { to: '/missions/facturation', labelKey: 'tabs.missionsReady' },
      { to: '/missions/factures', labelKey: 'tabs.missionsInvoiceList' },
      { to: '/missions/encaissements', labelKey: 'tabs.missionsCollections' },
      { to: '/missions/finance', labelKey: 'tabs.missionsFinance' },
    ],
  },
  {
    key: 'actions',
    to: '/actions',
    labelKey: 'items.actions',
    tabs: [
      // Lot L-A (#4164) — l'onglet « Actions » devient « Aujourd'hui » : UN endroit où l'on agit.
      // La clé `tabs.actions` reste celle de la barre mobile (`mobile-nav.ts`), qui garde son libellé.
      // #4492.3 (PR 12C) — « À traiter » en haut de l'écran, « Mes tâches » sous l'entrée Actions (V22).
      { to: '/actions', labelKey: 'tabs.todayQueue', subLabelKey: 'tabs.myTasks' },
      /*
       * ⚠️ PAS d'onglet « Parcours » ici — retiré le 14/10/2026 (lot L-D1, #4167, épopée #4163).
       *
       * Le tableau des parcours quitte la barre d'Actions : un autre lot (L-D2) le range sous
       * Pilotage › Pipe, où l'on lit où l'on coince dans les étapes. Sa ROUTE (`/actions/chaines`) et
       * ses liens existants ne bougent pas — seule l'entrée de la barre change. Sa place est prise par
       * « Automatisations », plus bas : une seule entrée pour « quand ceci arrive, prépare cela ».
       */
      /**
       * Les écritures CRM à valider (BEL-INT-603).
       *
       * Rangées sous Actions, avec ce qui s'EXÉCUTE : une demande d'écriture
       * est une action en attente d'un feu vert, pas un réglage. La ranger
       * sous Réglages › Intégrations l'aurait mise derrière un intitulé qu'on
       * n'ouvre pas en travaillant — et une file d'approbation qu'on n'ouvre
       * pas est une file perdue, ce que cet écran existe précisément pour
       * empêcher.
       */
      /*
       * ⚠️ PAS d'onglet « Outils connectés » ici — retiré le 01/09/2026.
       *
       * Il avait été remonté sous Actions le 17/08 (NAV-01) pour rapprocher
       * l'état d'un connecteur de ce qu'il conditionne. La mesure d'usage a
       * tranché l'inverse : `/integrations` rend `SettingsPage`, donc le clic
       * SORTAIT de la barre d'onglets d'Actions pour retomber dans la coquille
       * des Réglages — l'onglet promettait une sous-section d'Actions et
       * livrait un aller simple. Le sujet a déjà sa porte, exacte et unique :
       * Réglages › Intégrations (`SETTINGS_SECTIONS`), verrouillée par
       * `sections.test.ts` et `active-entry.test.tsx`.
       *
       * La ROUTE ne bouge pas et reste atteignable — c'est la seule chose que
       * ce retrait ne doit pas casser.
       */
      /**
       * Les séquences d'approche (PDF 2, BEL-CRM-103).
       *
       * ⚠️ L'écran existait, testé, avec ses statuts DÉRIVÉS et son `canSend`
       * qui porte la vraie capacité d'envoi — et il n'était atteignable par
       * AUCUN chemin : ni la barre, ni un onglet, ni un lien depuis un autre
       * écran. Six mois de travail derrière une URL que personne ne tape.
       *
       * Trouvé le 26/08/2026 parce que Louis a cherché un écran et ne l'a pas
       * trouvé — pas par un test. La garde de navigation ne pouvait pas le
       * voir : elle vérifie une liste FIGÉE des routes d'avant la refonte à
       * neuf entrées, et cette route est née après.
       *
       * Rangée sous Actions et non sous Contacts : une séquence est une suite
       * d'ENVOIS programmés, c'est-à-dire de l'exécution — le même rayon que
       * les chaînes et que l'état des connecteurs qui conditionnent l'envoi.
       */
      { to: '/actions/sequences', labelKey: 'tabs.sequences' },
      /*
       * Automatisations — de nouveau un ONGLET (décision Louis 22/10/2026, QCM C/D, maquettes Théo V22,
       * `c130_actions_trois_onglets_automatisations_theo`). Renverse c122 (19/10) côté NAVIGATION ; le
       * moteur reste commun : une automatisation est une séquence déclenchée par un signal.
       */
      { to: '/actions/automatisations', labelKey: 'tabs.automations' },
    ],
  },
  {
    key: 'mailbox',
    /*
     * #4491.1 / #4492.3 (PR 12C) — la Messagerie redevient une entrée de premier niveau (maquette V22), avec
     * ses quatre vues en sous-entrées : À traiter · Brouillons · À venir · Historique (Théo B m1/m2). Les vues
     * voyagent dans `?vue=` (`MAILBOX_VIEWS`) et l'écran les dessine lui-même avec leurs compteurs
     * (`MailboxViewTabs`, `tabsInPage`).
     */
    to: '/mailbox',
    labelKey: 'items.mailbox',
    mobileParent: 'today',
    tabsInPage: true,
    tabs: [
      { to: '/mailbox', labelKey: 'tabs.mailboxInbox' },
      { to: '/mailbox', search: { vue: 'drafts' }, labelKey: 'tabs.mailboxDrafts' },
      { to: '/mailbox', search: { vue: 'scheduled' }, labelKey: 'tabs.mailboxScheduled' },
      { to: '/mailbox', search: { vue: 'history' }, labelKey: 'tabs.mailboxHistory' },
    ],
  },
  {
    key: 'copilot',
    to: '/chat',
    labelKey: 'items.copilot',
    feature: 'chat_ai',
    /**
     * AUCUN ONGLET — et c'est le point de #1321.
     *
     * La section portait « Conversation » et « Commandes ». La bibliothèque
     * répondait à « qu'est-ce que je peux lui demander ? », une bonne question
     * — mais posée dans un écran à part, elle créait « une deuxième interface
     * concurrente » (les mots de Louis). Elle est devenue un tiroir de la ligne
     * d'outils du composer, là où l'on est déjà en train d'écrire.
     *
     * Reste un seul écran, donc AUCUNE barre : « une barre d'onglets à un seul
     * onglet est un ornement qui coûte une ligne » — la règle du dépôt, tenue
     * par `sections.test.ts`.
     *
     * La route `/chat/commandes` redirige vers `/chat` : elle a des liens
     * entrants et des favoris.
     */
    tabs: [],
  },
  /**
   * #4158.9 / .10 (Louis, 14/10/2026) — ÉQUIPE, entrée de premier niveau.
   *
   * Elle vivait en dernier onglet de Pilotage, sans lien latéral : un espace
   * d'une seule personne voyait un cockpit d'équipe à un membre. Elle devient
   * une entrée de barre, sous Actions et au-dessus de Pilotage, DÈS que
   * l'espace compte au moins deux membres actifs (`requiresTeam` — les
   * invitations en attente ne comptent pas). Le palier `manager_cockpit` et le
   * rôle gérant continuent de filtrer l'écran, comme avant.
   *
   * La barre latérale est la même sur mobile (tiroir) : aucun cinquième onglet
   * du bas n'est ajouté. Réglages › Équipe (`items.settings.ts`) reste visible
   * pour tous — c'est là qu'on invite le premier collègue.
   */
  {
    key: 'team',
    to: '/team',
    labelKey: 'items.team',
    managerOnly: true,
    feature: 'manager_cockpit',
    requiresTeam: true,
    // Recette PR 12 (24/10) — l'écran de /team dessine ses six onglets (`TeamTabBar`) : la barre du haut ne les double pas.
    tabsInPageAt: ['/team'],
    // #4492.2 (PR 12C, Louis 24/10/2026) — Équipe quitte le premier niveau de la barre latérale : elle vit
    // sous Ma journée (sous-entrée et onglet du haut), managers seulement, comme avant.
    parent: 'today',
    // Théo D (Louis 22/10/2026, « Théo exact pour les 8 écrans ») — Équipe devient une section à onglets :
    // la vue d'ensemble puis les écrans de ce lot (Recherches, Activité & échanges, Administration).
    tabs: [
      { to: '/team', labelKey: 'tabs.teamOverview', managerOnly: true, feature: 'manager_cockpit' },
      { to: '/team/recherches', labelKey: 'tabs.teamResearch', managerOnly: true, feature: 'manager_cockpit' },
      { to: '/team/activite', labelKey: 'tabs.teamActivity', managerOnly: true, feature: 'manager_cockpit' },
      { to: '/team/admin', labelKey: 'tabs.teamAdmin', managerOnly: true, feature: 'manager_cockpit' },
    ],
  },
  {
    key: 'pilotage',
    to: '/pilotage',
    labelKey: 'items.pilotage',
    // #4492.2 (PR 12C) — Pilotage vit sous Ma journée, ouvert à tous (décision 15/10/2026, droits par section).
    parent: 'today',
    // Louis 22/10/2026 (QCM A/D) — Pilotage est UNE page à sections ANCRÉES (Cockpit · Pipe · Staffing ·
    // Finance, barre d'ancres dans la page), plus quatre onglets : `/pilotage/pipe|staffing|finance`
    // redirigent vers `/pilotage#pipe|staffing|finance`. Le droit se règle par SECTION dans la page
    // (Louis 15/10/2026 : « que le réglage de confidentialité se fasse par sous-onglet pas par onglet »),
    // donc la section reste ouverte à tous, sans `managerOnly` ni `feature`.
    // Les retours d'expérience (PDF 2 §12) vivent sous Missions depuis le 28/08/2026 (D40) ; « Équipe »
    // est la section `team` ci-dessus (#4158.10). Marché, Mémoire collective, Énergie et Qualité des données
    // ont quitté Pilotage le 14/10/2026 (L0a) : leur contenu est redistribué, leurs routes redirigent.
    tabs: [],
  },
  {
    key: 'settings',
    to: '/settings',
    labelKey: 'items.settings',
    /**
     * AUCUN onglet, et c'est la correction d'une régression réelle.
     *
     * Les Réglages ont leur PROPRE barre latérale (`items.settings.ts`), qui
     * est déjà la sous-navigation de la section. Leurs écrans ne passent pas
     * par `CustomerPage`, donc les onglets de section n'y apparaissent JAMAIS :
     * en déclarer ici en faisait des entrées invisibles. C'est ce qui a fait
     * disparaître « Intégrations » de l'application pendant un déploiement —
     * retirée de la barre principale, et « rattrapée » par un onglet qui ne
     * s'affichait nulle part. Ce que la section absorbe (intégrations,
     * connaissances) vit dans `SETTINGS_SECTIONS`, et une garde le vérifie.
     */
    tabs: [],
  },
]

/**
 * Les sections ANNONCÉES mais pas encore livrées.
 *
 * Vide depuis que Missions a son écran (T7). La constante reste : c'est elle qui
 * documente la règle — une entrée de barre latérale n'existe qu'à partir du
 * moment où elle ouvre quelque chose, sinon c'est le « Active sans connecteur »
 * que le produit s'interdit.
 */
export const PLANNED_SECTION_KEYS: readonly string[] = []

/**
 * La section qui contient une route, et l'onglet actif à l'intérieur.
 *
 * La comparaison est PRÉFIXÉE (`/accounts/123` appartient à `/accounts`) parce
 * qu'une fiche est dans la même section que sa liste. L'onglet le plus LONG
 * gagne — sans ça, `/` avalerait tout, et une future route `/accounts/settings`
 * ne saurait pas se distinguer de `/accounts`.
 */
export function sectionForPath(pathname: string): { section: NavSection; activeTab: string } | null {
  let best: { section: NavSection; activeTab: string; length: number } | null = null

  for (const section of NAV_SECTIONS) {
    const candidates = section.tabs.length > 0 ? section.tabs.map(tab => tab.to) : [section.to]
    for (const candidate of candidates) {
      if (!matchesRoute(pathname, candidate)) continue
      if (!best || candidate.length > best.length) {
        best = { section, activeTab: candidate, length: candidate.length }
      }
    }
  }

  // #2151.1 — un écran SORTI de la navigation reste un écran : `/accounts/partners`
  // n'est plus un onglet de Comptes, mais on y entre toujours (Market Watch, lien
  // déjà parti, favori) et la barre doit continuer de dire OÙ L'ON EST. Sans ce
  // repli, la route n'allumait plus rien — le défaut D51 exactement, rejoué par
  // un lot de navigation. La liste est déclarée à un seul endroit
  // (`off-nav-screens.ts`), d'où partent aussi la liste blanche de liens de Laura
  // et les deux gardes Python qui relisent la navigation sur le disque.
  //
  // #4197 (L6) — ces écrans CONCOURENT désormais avec les onglets, à longueur
  // égale de règle : `/pilotage/rex` est plus long que l'onglet `/pilotage` de
  // Pilotage, il appartient donc à Missions (où il vit depuis D40) ; `/missions/cra`
  // est plus long que l'onglet `/missions`. Avant, le repli ne jouait que si AUCUN
  // onglet ne correspondait — vrai tant que les huit écrans de gestion étaient des
  // onglets eux-mêmes.
  for (const screen of OFF_NAV_SCREENS) {
    if (!matchesRoute(pathname, screen.route)) continue
    const owner = NAV_SECTIONS.find(section => section.key === screen.sectionKey)
    // Aucune section : on ne DEVINE pas. `off-nav-screens.test.ts` interdit ce
    // cas, et ici il vaut « je ne sais pas », pas une section au hasard.
    if (!owner) continue
    if (!best || screen.route.length > best.length) {
      best = { section: owner, activeTab: owner.to, length: screen.route.length }
    }
  }

  // #4351.1 — `/missions` (la liste, ex-« En cours ») n'est plus un onglet. Sa
  // correspondance est EXACTE, jamais par préfixe : `/missions/facturation`
  // garde sa barre, et la liste reste dans la section Missions.
  if (!best && pathname === '/missions') {
    const missions = NAV_SECTIONS.find(section => section.key === 'missions')
    if (missions) return { section: missions, activeTab: missions.to }
  }

  return best ? { section: best.section, activeTab: best.activeTab } : null
}

/** Les routes des sections — les seules entrées que le modèle sait arbitrer. */
const SECTION_ROUTES = new Set(NAV_SECTIONS.map(section => section.to))

/** `/accounts` matche `/accounts` et `/accounts/123`, jamais `/accounts-archive`. */
function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

/** Les routes qui apparaissent comme ENTRÉE de barre latérale — une par section. */
const SECTION_ENTRY_PATHS: ReadonlySet<string> = new Set(NAV_SECTIONS.map(section => section.to))

/**
 * L'entrée de barre latérale que ce chemin doit ALLUMER — D51 (26/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE : c'est le MODÈLE qui décide, jamais le préfixe d'URL.
 * ─────────────────────────────────────────────────────────────────────────
 * L'allumage se décidait par préfixe, et neuf routes n'allumaient donc RIEN :
 * `/rfp`, `/team`, `/integrations`, `/mailbox`, `/contacts`, `/discover`,
 * `/watchlist`, `/propositions`, `/pilotage/rex`. Toutes sont des routes
 * d'ONGLET — la réduction à neuf entrées les a absorbées dans une section, mais
 * leur chemin ne préfixe pas celui de la section qui les accueille. L'utilisateur
 * était sur un écran et la navigation ne lui disait pas où.
 *
 * La dérivation vit ICI et pas dans la barre (GA-26) : c'est la MÊME question
 * que `sectionForPath`, qui range déjà chaque chemin sous sa section. Deux
 * réponses tenues à part divergeraient au premier onglet déplacé — et il y en a
 * eu un le 26/08, quand `/pilotage/rex` est passé sous Missions.
 *
 * ⚠️ LE REPLI PAR PRÉFIXE RESTE, et il n'est pas une tolérance :
 *  - la barre du BACKOFFICE (`/bak/home`) n'a pas de section au modèle. Sans le
 *    repli, elle s'éteindrait entièrement ;
 *  - un chemin que le modèle ne possède pas (`/login`, `/search`) n'allume rien,
 *    et c'est le préfixe qui le dit — pas une exception écrite à la main.
 *
 * ⚠️ LA BARRE DE RÉGLAGES N'APPELLE PAS CETTE FONCTION, et c'est voulu : ses
 * entrées sont des routes-feuilles À L'INTÉRIEUR d'une seule section. « La
 * section qui possède le chemin » y allumerait « Préférences » sur les quatorze
 * écrans. Elle pose une autre question, elle garde sa réponse.
 */
export function isNavEntryActive(entryPath: string, pathname: string): boolean {
  // #4312 — Découvrir (`/discover`, `/discover/lots…`) a SON bouton lavande en haut de la barre
  // (`CustomerNavbarBody`, `onDiscover`) : c'est lui le repère, aucune entrée de la rubrique ne s'allume.
  if (SECTION_ENTRY_PATHS.has(entryPath) && matchesRoute(pathname, '/discover')) return false
  if (SECTION_ENTRY_PATHS.has(entryPath)) {
    const owner = sectionForPath(pathname)
    // Le modèle possède ce chemin : lui seul dit quelle entrée s'allume — celle de la section qui le porte
    // dans la barre (#4492.2 : /team et /pilotage allument « Ma journée »). S'il le range sous une section
    // absente de la barre (le copilote, dont la porte est le bouton « Demander à Laura »), aucune ne s'allume.
    if (owner) return rootSection(owner.section).to === entryPath
  }
  return matchesRoute(pathname, entryPath)
}

/**
 * #2155.1 — l'onglet le plus spécifique que le modèle attribue à un chemin. Sur `/contacts/lists`, c'est
 * « Mes listes » et pas « Répertoire ».
 */
export function isNavTabActive(tabPath: string, pathname: string): boolean {
  return sectionForPath(pathname)?.activeTab === tabPath
}

/**
 * #4491 / #4492 (PR 12C) — UNE ENTRÉE DE FAMILLE : ce que la barre du haut rend en onglet ET ce que la barre
 * latérale rend en sous-entrée, sous l'entrée active. Une seule dérivation, ici (GA-26, #4492.4) : jamais
 * recopiée dans `sidebar/items.ts`.
 */
export type NavEntry = {
  /** Clé stable : le chemin, suivi de sa vue (`/mailbox?vue=drafts`). */
  key: string
  to: string
  search?: Readonly<Record<string, string>>
  labelKey: string
  /** Le libellé de sous-entrée latérale (`subLabelKey`), sinon celui de l'onglet. */
  subLabelKey: string
  hintKey?: string
  feature?: PlanFeatureKey
  managerOnly?: boolean
  requiresTeam?: boolean
  /** La section dont l'entrée est l'ÉCRAN (une section fille), absente pour un onglet propre. */
  childSectionKey?: string
}

type FamilyContext = { mobile: boolean }

/** `/mailbox` + `{ vue: 'drafts' }` → `/mailbox?vue=drafts`. */
function navEntryKey(to: string, search?: Readonly<Record<string, string>>): string {
  if (!search || Object.keys(search).length === 0) return to
  return `${to}?${new URLSearchParams(Object.entries(search)).toString()}`
}

function sectionByKey(key: string | undefined): NavSection | undefined {
  return key ? NAV_SECTIONS.find(section => section.key === key) : undefined
}

/** La section dont l'entrée de BARRE porte celle-ci : elle-même, ou sa section mère (#4492.2). */
export function rootSection(section: NavSection, context: FamilyContext = { mobile: false }): NavSection {
  const parent = sectionByKey(section.parent) ?? (context.mobile ? sectionByKey(section.mobileParent) : undefined)
  return parent ?? section
}

/**
 * Les entrées d'une section racine : ses onglets propres, puis ses sections filles (Équipe, Pilotage sous
 * Ma journée) — et, sur mobile seulement, celles qu'elle porte faute de barre latérale (`mobileParent`).
 */
export function familyEntries(root: NavSection, context: FamilyContext = { mobile: false }): NavEntry[] {
  const children = NAV_SECTIONS.filter(
    section => section.parent === root.key || (context.mobile && section.mobileParent === root.key),
  )
  const own: NavEntry[] = root.tabs.map(tab => ({
    key: navEntryKey(tab.to, tab.search),
    to: tab.to,
    labelKey: tab.labelKey,
    subLabelKey: tab.subLabelKey ?? tab.labelKey,
    ...(tab.search ? { search: tab.search } : {}),
    ...(tab.hintKey ? { hintKey: tab.hintKey } : {}),
    ...(tab.feature ? { feature: tab.feature } : {}),
    ...(tab.managerOnly ? { managerOnly: true } : {}),
    ...(tab.requiresTeam ? { requiresTeam: true } : {}),
  }))
  // Une racine sans onglet mais avec des filles s'annonce elle-même en premier : sinon son propre écran
  // n'aurait aucun onglet dans sa barre.
  const self: NavEntry[] =
    own.length === 0 && children.length > 0
      ? [{ key: root.to, to: root.to, labelKey: root.labelKey, subLabelKey: root.labelKey }]
      : []
  return [
    ...self,
    ...own,
    ...children.map(child => ({
      key: child.to,
      to: child.to,
      labelKey: child.labelKey,
      subLabelKey: child.labelKey,
      childSectionKey: child.key,
      ...(child.feature ? { feature: child.feature } : {}),
      ...(child.managerOnly ? { managerOnly: true } : {}),
      ...(child.requiresTeam ? { requiresTeam: true } : {}),
    })),
  ]
}

/** Chaque paramètre déclaré par l'onglet a sa valeur dans l'URL. */
function searchMatches(expected: Readonly<Record<string, string>>, search: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(expected).every(([name, value]) => String(search[name] ?? '') === value)
}

/**
 * OÙ L'ON EST, en une réponse que lisent la barre du haut et la barre latérale : la section racine, ses
 * entrées, l'entrée allumée — et, quand on est dans une section fille qui a ses propres onglets (Équipe ›
 * Vue d'ensemble…), cette section et son onglet allumé.
 *
 * L'onglet à vue (`search`) s'allume quand sa vue est dans l'URL ; sinon c'est l'onglet SANS vue du même
 * chemin : `/accounts?lens=effort` reste « Portefeuille », `/accounts?lens=lists` est « Mes listes de cibles ».
 */
export function activeNavFamily(
  pathname: string,
  search: Readonly<Record<string, unknown>> = {},
  context: FamilyContext = { mobile: false },
): {
  root: NavSection
  entries: NavEntry[]
  activeKey: string
  inner: { section: NavSection; activeTab: string }
} | null {
  const found = sectionForPath(pathname)
  if (!found) return null
  const root = rootSection(found.section, context)
  const entries = familyEntries(root, context)
  if (root !== found.section) {
    return { root, entries, activeKey: found.section.to, inner: found }
  }
  const sameRoute = entries.filter(entry => !entry.childSectionKey && entry.to === found.activeTab)
  const withView = sameRoute.find(entry => entry.search && searchMatches(entry.search, search))
  const plain = sameRoute.find(entry => !entry.search)
  return { root, entries, activeKey: (withView ?? plain)?.key ?? found.activeTab, inner: found }
}

/** Toutes les routes atteignables depuis la nav — sections ET onglets. */
export function allNavRoutes(): string[] {
  // Un chemin à plusieurs vues (`/mailbox`, `/briefing`, `/accounts`) reste UNE route de sa section.
  return NAV_SECTIONS.flatMap(section =>
    section.tabs.length > 0 ? [...new Set(section.tabs.map(tab => tab.to))] : [section.to],
  )
}
