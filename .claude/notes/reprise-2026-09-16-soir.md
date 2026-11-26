# Où reprendre — 16/09/2026, fin d'après-midi

## L'état en une ligne

**PR #2460 est la seule chose qui compte** : elle porte 13 branches et débloque
une douzaine de clôtures d'issues. Tout le reste attend derrière elle.

## Les chiffres mesurés

- **412 issues ouvertes** (427 ce matin) · **6 fermées aujourd'hui** : #1945, #2054, #2034, #2026, #2025, #1922
- Production sert **`408cdd9d7`** (API/web) et `3993b432b` (IA) — les deux se déploient séparément
- `origin/main` = **`96ffef641`** (PR #2458 mergée : la garde des registres)
- **4 309 points** dans 9 registres, cohérence **OK**

## Les PR ouvertes

| PR | Quoi | État |
| --- | --- | --- |
| **#2460** | Intégration vague 13 — 13 branches + main | CI relancée après le correctif IA `3e85ec18e` |
| **#2459** | Recette de production + 17 anomalies + la garde qui lit son corpus | verte, mais ses registres font DOUBLON avec #2460 |
| #2447 | perf(ci) — gardes sans jsdom, cache, hôte à prix fixe | un shard web en attente |
| #1487 | fix(infra) Railway | ancienne |

⚠️ **#2460 a absorbé une version ANCIENNE de la branche de #2459** (avant son
rebase). Il manque donc à #2460 : l'étape de CI « La cohérence des registres »
et la recette de #2115.50/.52/.53. **Ordre à tenir** : merger #2460, puis
rebaser #2459 dessus — il ne restera que ce qui manque.

## Ce qui a bloqué #2460, et comment ça s'est réparé

`Test (IA / Python)` rouge sur **une** assertion :
`test_the_app_catalogue_matches_the_navigation_exactly` tient exactement égaux
deux ensembles — les écrans de la navigation web, et les écrans où Laura sait
emmener quelqu'un. La vague 13 a ajouté `/missions/renouvellements` d'un côté
seulement. Une ligne dans `apps/ia/app/services/chat_tools.py` : **7 993 tests
verts** avec, un seul rouge sans.

⚠️ L'intégrateur ne pouvait pas le voir : `fastapi` est absent de son worktree.
**Le venv du dépôt principal (`apps/ia/.venv`) fait tourner la suite IA d'un
worktree** — c'est ce qui a permis de reproduire en une minute :
```sh
cd <worktree>/apps/ia && BELLUM_SCHEMA_STRICT=true \
  /Users/louisschlegel/Desktop/belllum-monorepo/apps/ia/.venv/bin/python -m pytest -q
```

## Les branches PRÊTES mais HORS vague 13

- **`feat/renouvellement-statuts-16-09`** (`fe5ce9e8c`) — 12 points livrés,
  2 écartés. ⚠️ **La migration `1795100000001` doit tourner AVANT le déploiement
  du web** : sans la colonne, `renewal_status` est `undefined` et l'écran dit
  « non lu » (pas d'erreur, donc invisible).
- Les deux lots d'écrivains encore en vol au moment d'écrire : **quatre
  arbitrages** (#2022.7, #2024.3, #1960, #1911.5) et **deux gardes qui visent à
  côté** (#1624 `isObservedOnly`, #2062.4/.19).

## Le moteur de clôture — il est écrit, il marche

Deux scripts dans le scratchpad :

1. **la vue fusionnée** — pour chaque point, l'état le plus avancé parmi
   `origin/main` + toutes les branches en vol ; sinon on lit un registre périmé.
2. **le calculateur** — une issue ferme quand TOUS ses points sont
   `recetté` / `déjà là` / `écarté`, **et** que chaque `recetté` cite un commit
   qui est un **ancêtre de ce que la production sert**. C'est ce dernier test qui
   distingue une preuve d'une promesse.

**Ce qu'il reste dans le tuyau** : ~12 issues sont à 1-2 points d'être fermées,
et ces points sont `livré` sur des branches de la vague 13 — #1912, #1925, #1941,
#1905, #1910, #1923, #1936, #2013, #2071, #1934. **Elles ferment le jour où
#2460 est déployée**, pas avant.

**179 points** restent `recetté` sans aucun commit déployé cité : c'est le
prochain gisement, et il demande une VRAIE mesure, pas un déplacement de preuve.

## Les arbitrages qui attendent Louis

- **#2195.33** — « construire la proposition » = une opportunité au pipe
  (tranché), mais `projects.controller.ts` n'a **aucun `POST /projects`** :
  rattacher voudrait dire écrire une création d'affaire depuis `delivery`.
- **#2195.12** — le manager du consultant **n'existe pas en base** (aucune
  colonne hiérarchique, aucune des 14 migrations qui altèrent `consultants`).
  Ce n'est pas une résolution de nom qui manque, c'est le LIEN.
- **#2195.8** — les 3 garde-fous sont écrits ; poser le code demande de sortir
  `RenewalWindow` de son énumération à noms fixes (`j15`…`j60` MENTIRAIENT si un
  espace règle [20, 40, 70, 100]).

## Les leçons du jour, chacune payée

1. **Une ligne de registre peut porter NEUF cellules**, pas sept — la preuve en
   occupe trois et le SHA vit au-delà de la première. Un script qui lit
   `colonnes[6]` seul a rétrogradé deux vrais `recetté`.
2. **`input.focus()` en JS ne déclenche pas le `onFocus` de React** — seul un
   vrai clic l'a fait. La mesure au `focus()` ressemblait exactement à une absence.
3. **Compter les TYPES rendus, jamais le mot dans le texte** — un
   `innerText.match(/Source/)` a rendu « OUI » pour un type qui n'existait pas.
4. **Une garde qu'on ne pointe jamais sur son corpus ne protège rien** — la garde
   des registres était verte en CI pendant que `main` portait 17 anomalies.
5. **Le SHA dans la colonne ANALYSE ne compte pas** — 67 preuves de production
   étaient invisibles au compteur de clôture pour cette seule raison.
