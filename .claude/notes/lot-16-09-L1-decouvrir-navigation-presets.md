# Lot — L1-decouvrir-navigation-presets

**30 points.** Extraits de leur registre, à l'état `retenu`.
L'état se change dans le REGISTRE d'origine (édition de SA ligne), jamais ici.

| Point | La demande, en huit mots | Sujet | Existant (preuve fichier:ligne + APPELANT) | État | Preuve en recette |
| ----- | ------------------------ | ----- | ----------------------------------------- | ---- | ----------------- |
| 2151.1 | Retirer Veille comme onglet autonome de Comptes | navigation | onglet monté `apps/web/src/components/navigation/sections.ts:133` (`/watchlist`), rendu par `AppSidebar.tsx` | retenu | CODE: l'entrée `/watchlist` ne figure plus dans `sections.ts` |
| 2151.26 | Retirer Partenaires comme destination principale | navigation | onglet `sections.ts:139` (`/accounts/partners`), page `apps/web/src/routes/accounts/partners.tsx:12` | retenu | CODE: l'onglet disparaît de `sections.ts` |
| 2151.2 | Créer dans Découvrir « Mes recherches et alertes » | écran | `DiscoverSidebar` liste des recherches, aucune alerte — appelant `Discover.tsx:673` | retenu | ÉCRAN: le bloc porte ce libellé exact sur /discover |
| 2151.29 | Dans Découvrir : « Trouver des partenaires ou ESN » | écran | aucun mode partenaire dans `discover-filters.ts` ni `Discover.tsx` | retenu | ÉCRAN: le libellé exact est une entrée de /discover |
| 2151.46 | Vue enregistrée de Comptes « Écosystème ESN » | écran | table `saved_views` (`saved-view.entity.ts:9`) + scope `accounts` (`packages/contracts/src/schemas/governance.ts:25`) — MAIS l'unique appelant web est `SavedNeedViews.tsx:55` (scope `projects`) | retenu | AMBIGUÏTÉ TRANCHÉE 15/09, code PAS TOUCHÉ (hors périmètre de ce lot — reste dans le « Lot A » 14 pts déjà cadré) : le préréglage SE COMPOSE, il ne se SÈME pas — un objectif semé attribuerait au visiteur une intention qu'il n'a pas formulée. Le principe est déjà écrit mot pour mot dans `demo-coverage.ts:948-949` (entrée `saved_views`, datée 15/09/2026, couvre nommément #2151.3 à .13) : aucun code ne sème aujourd'hui un objectif ou une vue « Écosystème ESN » (vérifié par grep, aucune occurrence hors i18n de contenu déjà livré) — rien à corriger, rien à construire ici. À appliquer TEL QUEL quand le Lot A (recherches enregistrées côté serveur) sera pris. |
| 2165.4 | Grande saisie en langage naturel | écran | `rail.keywordsLabel` = mots-clés d'offres seulement (`FilterRail.tsx:222-229`) ; aucun parseur | retenu | ÉCRAN: une phrase libre produit des critères visibles |
| 2166.54 | Sélection multiple des résultats | écran | `visible.map` sans case à cocher `Discover.tsx:540/556` | retenu | ÉCRAN: cocher plusieurs lignes |
| 2166.72 | Dans Découvrir : « Mes recherches et alertes » | écran | doublon de 2151.2 | retenu | ÉCRAN: libellé exact |
| 2165.12 | Preset « Compatibles avec mon offre » | preset | 4 presets seulement, `discover-presets.ts:27-39` — appelant `Discover.tsx:587` | retenu | ÉCRAN: le libellé exact est un preset |
| 2165.13 | Preset « Proches de mes meilleures références » | preset | `likeReferences` existe (`discover-presets.ts:37`) mais pose taille+âge, pas les références | retenu | ÉCRAN: idem |
| 2165.14 | Preset « Avec recours externe observé » | preset | absent | retenu | ÉCRAN: idem |
| 2165.16 | Preset « Filiales accessibles de grands groupes » | preset | absent | retenu | ÉCRAN: idem |
| 2165.17 | Preset « Où positionner un consultant » | preset | absent de Découvrir (reverse-market vit sur `/consultants/$id_.reverse-market`) | retenu | ÉCRAN: idem |
| 2165.18 | Preset « Décideurs sur une expertise » | preset | absent (dépend de 2165.7) | retenu | ÉCRAN: idem |
| 2165.19 | Preset « Partenaires possibles » | preset | absent (dépend de 2165.9) | retenu | ÉCRAN: idem |
| 2151.23 | Une alerte importante apparaît dans Aujourd'hui | destination | `/briefing` porte déjà `accountsToWatch` avec un signal RÉEL, `apps/api/src/modules/briefing/briefing.controller.ts:57` | retenu | ÉCRAN: l'alerte d'une recherche enregistrée apparaît sur /briefing |
| 2151.24 | Le détail vit dans Découvrir ou l'objet | destination | absent | retenu | ÉCRAN: le clic depuis /briefing ouvre /discover au bon endroit |
| 2166.63 | Enregistrer : créer une cible snapshot | choix | dépend de 2166.46 | retenu | API: la cible fige sa liste |
| 2166.64 | Enregistrer : créer une cible dynamique | choix | dépend de 2166.46 | retenu | API: la cible rejoue ses critères |
| 2166.65 | Enregistrer : créer une veille | choix | dépend de 2151.14 | retenu | API: la veille existe et tourne |
| 2165.3 | Sous-titre personnalisé nommant les cinq axes | libellé | absent ; ⚠ « la mémoire BellumAI » nomme NOTRE moteur, pas un outil du client | retenu | Écran/parcours — tranché par Claude sur la doctrine déjà écrite (Louis 15/09 : « prends-les tous, ne me redemande rien »). Se prouve en recette. |
| 2165.5 | Afficher les quatre exemples de requête | libellé | absent (`SearchExampleChips` existe sur /search, pas sur /discover) | retenu | ÉCRAN: les quatre phrases exactes sont cliquables |
| 2165.57 | La demande explicite du tour domine le profil | règle | `autopilotPlan(profileContext…)` `Discover.tsx:315` ne s'applique qu'au démarrage à blanc | retenu | ÉCRAN: un critère saisi n'est jamais réécrit par le profil |
| 2165.58 | Le profil complète les trous | règle | `applyIcpSectors` `Discover.tsx:347-350` est MANUEL (« Appliquer ma cible ») | retenu | ÉCRAN: les trous se remplissent, visiblement |
| 2151.28 | Conserver les capacités backend de Partenaires/Accès | contrainte | modules `partners`, `partner-pipeline`, `esn-directory`, `account-access` présents | retenu | CODE: les modules restent montés après le retrait des écrans |
| 2151.52 | Ne jamais écrire « présente chez le client » sans preuve | contrainte | tenu par la prose (`observed.caveat`), AUCUNE garde d'architecture | retenu | CODE: garde qui casse si un libellé affirme la présence |
| 2165.10 | Un seul type principal par recherche | contrainte | sans objet aujourd'hui | retenu | ÉCRAN: le sélecteur est exclusif |
| 2166.61 | Preview avant action | contrainte | aucune prévisualisation de lot | retenu | ÉCRAN: la prévisualisation précède l'exécution |
| 2166.71 | Une observation historique seule ne déclenche pas d'urgence | contrainte | doublon de 2151.15, aligné `doctrine-registry.ts:1792` | retenu | CODE: garde sur le déclencheur |
| 2166.73 | Dans Aujourd'hui : seulement ce qui justifie une action | contrainte | `/briefing` porte déjà un tri par signal réel (`briefing.controller.ts:57-68`) | retenu | ÉCRAN: aucune ligne sans action possible |
