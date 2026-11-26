# Compteurs 26/10 — un chiffre qui dit autre chose que la liste (#4581 #4582 #4583 #4584 #4588)

Branche `claude/compteurs-2610`. **Cause commune pour #4581, #4583, #4584** : deux endroits comptent le même mot, un seul voit le filtre.

- **#4581** — `headlineCounters` recevait le `qb` FILTRÉ (recherche, statut, « Mon CRM », Favoris) : « Comptes dans l'espace » était le nombre de lignes de la vue. Il part maintenant de `spaceCountersBase` (espace + visibilité + BU + ni supprimés ni rangés), sans filtre. Les huit compteurs de bande sont des totaux d'espace ; un clic pose toujours la vue. Contacts : « Tous / Recommandés » compte la vue (le classement « recommandé » ne se paie pas sur l'espace) ; dès qu'un filtre est posé, les segments se nomment « … dans la vue ».
- **#4584** — la bande comptait des comptes SUIVIS avec une tâche ouverte à venir ; l'étagère, toute ligne avec une action écrite au plan. Désormais chaque ligne porte `to_resume` (le prédicat serveur de la bande, une seule définition `HEADLINE_FILTER_PREDICATE.toResume`) et l'étagère ne retient que ces lignes. Le 0 reste un 0 mesuré (GA-18/19 intacts).
- **#4583** — sous `lens=followed` la liste est celle de `FollowedAccountsSection`, pas celle des compteurs : la bande se tait sous cette lentille (une absence ne fait aucun chiffre).
- **#4582** — cause distincte (primitif `KeyFigureRow`) : plus de `padStart`; 2, 0, 105 s'écrivent tels quels. Décision : un nombre ne se remplit pas de zéros (écrit dans le test et le primitif). Le nom accessible gardait déjà le brut.
- **#4588** — cause distincte : `CapabilityNotice` reçoit `shown` ; liste vide → ni « Résultats plus larges que demandé » ni « Aucune entreprise ne manque ».

Tests (rouges avant, verts après) : `accounts.headline-counters.spec.ts`, `AccountsPage.followedLens.test.tsx`, `AccountsResumeShelf.test.tsx`, `KeyFigureRow.test.tsx`, `CapabilityNotice.test.tsx`, `ContactsRecommendedToggle.test.tsx`.
Démo : aucune nouvelle table ni clé `raw_analysis` (champ calculé) ; SNCF et Société Générale (suivies, tâches ouvertes à venir) alimentent l'étagère en démo.
Non fait : mesure prod Chrome (pas de navigateur/prod ici) ; l'étiquette « À ouvrir » des cartes (statut de tableau) n'est pas relue.
