# Brief A — 4 correctifs issus de la recette prod du 01/11 (décision Louis 02/11)

Branche `claude/correctifs-recette-0211`. Plafond 300 tours. Commits + PR prête, puis STOP.

1. /contacts : le compteur « Avec e-mail » du bandeau compte encore les fiches dont l'e-mail est un gabarit (10 au lieu de 0 après rattrapage d'affichage). Utiliser `placeholder-email.ts` / `displayedContactEmail` (et côté requête de comptage API si le compte vient du serveur).
2. Autocomplétion /search : la liste se RÉORDONNE ~1 s après le premier affichage quand le groupe « Dans ton portefeuille » arrive ⇒ un clic tombe sur une autre entité. Rendre l'ordre stable sous le pointeur (groupes réservés dès le premier rendu, ou insertion APRÈS les résultats déjà affichés ; sélection par id). Test RTL : réponses en deux temps ⇒ l'élément sous la souris ne change pas.
3. Hors chemin prioritaire (listes par persona de l'onglet Contacts d'un compte), une même personne (« Prénom NOM » / « Prénom N. », même employeur) apparaît sous DEUX personas (Décideur économique + Champion). Étendre la règle livrée par la PR #5108 (doublon probable ⇒ une seule apparition, fiche la plus complète, persona la plus haute ; on PROPOSE la fusion, jamais automatique).
4. Démo SG : (a) la piste « Préparer l'approche » (#3679) est introuvable à l'écran (?tab=brief / ?tab=plan) alors que la spec `demo-qualification-leads-coverage` passe — trouver où elle doit s'afficher et pourquoi elle n'y est pas ; (b) l'onglet Contacts du compte démo affiche « 17 doublons possibles » (paires « Nom Prénom / Prénom NOM » semées) — corriger la donnée semée pour ne pas montrer de faux doublons au prospect.

## Règles communes

- Étape 0 antériorité (`git grep`) par point ; déjà fait ⇒ « DÉJÀ LÀ fichier:ligne » au rapport.
- TDD. Tests CIBLÉS (≤ 5 specs par point + `tsc -p` paquets touchés). JAMAIS suite complète, build global, check-types racine.
- Toute fonctionnalité user-facing remplie en DÉMO (`demo-dataset.ts`, `DemoSeedService`, classée dans `demo-coverage.ts`).
- « Non mesuré » ≠ 0 ; aucune probabilité affichée ; nos fournisseurs ne se nomment jamais à l'écran.
- Garde doc↔code `node scripts/garde-derive-doc.mjs origin/main...HEAD`. Commitlint scopes web|api|ia|contracts|…
- Aucun nom de personne réelle dans code/tests/commits/PR.
- PR prête vers main, corps finissant par :

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01RZu8c5wyRFXed6whEKHsXj
