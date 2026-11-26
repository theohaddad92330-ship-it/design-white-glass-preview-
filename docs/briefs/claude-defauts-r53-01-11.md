# Brief cloud — défauts de la recette prod r53 (01/11/2026)

Plafond : **300 tours** ; à 240, commit + push de ce qui est vert, rapport, stop.
Branche : `claude/defauts-r53-01-11` (ce brief y est ; elle part de `origin/main`). Tu es le SEUL pousseur. Push SIMPLE après chaque point (jamais --force/--no-verify/rebase). AUCUNE PR : le fil l'ouvre.

Ces points sont DÉJÀ livrés (PR #5094, vague 2) et ont ÉCHOUÉ à la recette en production le 01/11 (journal r53). On ne recode pas : on rend VISIBLE et JUSTE ce qui existe.

## Contrat (validé par Louis « go » 01/11 soir — sous-ensemble conservateur : ni droits, ni donnée écrite, ni décision défaite)

### 1. #2164.29 #2164.30 #2164.34 #2164.38 #2164.39 — dossier de compte après actualisation

- Constat prod (Viveris, actualisé jusqu'au bout) : les sections « Ce que nous savions déjà », « Ce qui est nouveau », « Ce que je ferais maintenant » (0bef012682) et la carte du diff `RefreshOutcomeCard` (contacts non reconfirmés, nouvelles entités — f957c1dc16) vivent dans `apps/web/src/features/accounts/view/account-detail/tabs/TabOverview.tsx` (~l. 505-525), dans un onglet qui est MASQUÉ dès qu'un brief existe (voir la logique d'onglets dans `account-detail/` — `AccountDetailTabContent.tsx` et le composant qui choisit l'onglet par défaut). Résultat : 0 des libellés visibles.
- Je fais : sur un compte qui A un brief, ces trois sections et la carte du diff s'affichent là où l'utilisateur atterrit (la vue par défaut du dossier), sans retirer l'onglet ni aucun autre chemin existant. Trouve l'endroit le plus petit (monter le bloc, pas dupliquer : GA-26 « rien n'apparaît deux fois sous la même forme » — si le bloc s'affiche dans la vue par défaut, il ne doit pas apparaître deux fois sur le même écran).
- Je ne fais pas : changer le contenu des sections, l'ordre des onglets, ni les textes.
- Test (sait dire NON) : compte avec brief + analyse actualisée ⇒ les 3 libellés et la carte sont rendus ; compte jamais actualisé ⇒ pas de carte de diff (on n'affiche pas ce qu'on n'a pas).
- Démo : vérifier qu'un compte démo actualisé les montre (`apps/api/src/modules/demo/demo-dataset.ts`) ; sinon le semer + `demo-coverage.ts`.

### 2. #2157.17 — aperçu de création de cible : l'écarté se NOMME

- Constat prod (/contacts) : l'aperçu nomme « 6 fiches sans e-mail : Carlo, Christian… », mais « Retirer » passe de 9 à 8 sans nommer la fiche retirée : le répertoire des contacts ne passe pas `excluded` à l'aperçu (commit f1b1327cb3, `CreateTargetListFromSelectionDialog` et son appelant côté contacts).
- Je fais : l'appelant du répertoire transmet `excluded` ; la fiche retirée est nommée dans la liste des écartés.
- Test : retirer une fiche ⇒ son nom apparaît parmi les écartés ; NON : sans retrait, aucune ligne « retirée ».

### 3. #2408.40 — /missions en vue liste : colonne Statut écrasée

- Constat prod : `/missions?vue=liste` avec les colonnes optionnelles Compte + Satisfaction cochées : la colonne Statut tombe à 0 px, son en-tête chevauche « Échéance » (x=816 tous deux) ; table 1440 px dans un conteneur de 1221 px, `table-layout: fixed`.
- Je fais : aucune colonne ne tombe sous sa largeur minimale ; la table défile horizontalement dans son conteneur quand elle dépasse (pas de défilement du corps de page), en-têtes alignés sur leurs cellules.
- Test : un test qui lit les classes/largeurs minimales des colonnes (jsdom ne met rien en page : tester la présence de `min-w-*`/`overflow-x-auto` sur les éléments qui portent la règle) et sait dire NON.
- Gardes de design : échelle Tailwind, aucune couleur hex, pas de `max-w-[70ch]` hors `Text` (GA-34), listes/tableaux en pleine largeur (D81).

## Règles

- TDD, trace `// #<point> — …` dans le code, commits par point avec numéros dans le sujet (scopes : web, api, contracts, tooling), pied ≤ 100 caractères.
- Toute ligne modifiée qui porte un #NNN : « garde #NNN » dans le message.
- Pièges CI : GA-252 ({{copilot}}, jamais « Laura » en dur dans une traduction), GA-251 (SelectField), GA-33, GA-34, knip, `node scripts/classer-tests-node.mjs` dans apps/web si tu ajoutes un test web.
- Tests CIBLÉS (≤ 5 specs par passe) + `pnpm --filter @bellum/web exec tsc --noEmit -p tsconfig.json` si TS touché. JAMAIS la suite complète ni le build.
- FR + EN pour tout libellé neuf, fragment `changes/defauts-r53-01-11.yml` (FR/EN).

Périmètre : apps/web/src/features/accounts/view/account-detail/**, apps/web/src/features/contacts/**, apps/web/src/features/target-lists/**, apps/web/src/features/missions/**, apps/web/src/i18n/locales/**, apps/web/src/test/tests-node.generated.ts, apps/api/src/modules/demo/**, changes/\*\*

## Droits

Aucun changement d'accès : même écrans, mêmes rôles ; la marge et les données finance restent sous `finance:read`.

## Fin

`docs/briefs/claude-defauts-r53-01-11-rapport.md` (≤ 15 lignes : par point livré (sha) / non fait (raison), SHA de tête), commit, push. STOP.
