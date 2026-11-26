# Reprise — 15/09/2026, nuit

`origin/main` = `61432eab9`. Prod : web + IA sur `61432eab9`, **API encore sur `2055e51e3`** (surveillance en fond).
Page de suivi : https://claude.ai/artifact/UwAs2A2aRGsCu4n6dFLeSi

## 1. Le registre

4 309 points · `à trancher` = 0
`recetté` 846 (+29 cette nuit) · `retenu` 2 299 · `déjà là` 860 · `livré` 257 · `reformulé` 19 · `écarté` 25

## 2. ⚠️ LA cause qui bloquait tout, et qui est traitée

**14 branches finies n'étaient dans aucune PR** — ~30 commits de travail terminé. Tant qu'un point
n'est pas en production, il ne peut pas passer à `recetté`, donc **aucune issue ne peut se fermer**.
Ce n'était pas un manque de code, c'était un défaut d'atterrissage.

Traité : #2247 et #2249 mergées, #2246 en cours, `integration-audit-profiler` ouverte.
**Restent orphelines, côté comptes/prospection** : `cibles-modele-et-statuts`,
`ecosysteme-relations-qualifiees`, `favoris-ecran`, `pistes-a-qualifier`,
`plan-et-actions-une-seule-ligne`, `refresh-explique-et-diff`, `statuts-commerciaux-renommes`,
`worktree-agent-a7bf7ed615cdeda05`, plus les deux vieilles `integration-i` (26 h) et `integration-q` (16 h).
**C'est le prochain lot d'intégration, et c'est lui qui débloque le plus de points.**

## 3. Mergé cette nuit

- **#2247** (`2055e51e3`) — nav à plat, Action OS L4. Cause racine des deux rouges : `/favorites`
  revenait sans mettre à jour les DEUX registres dérivés du dossier des routes (`route-titles.ts`,
  `PRODUCT_SCREENS`).
- **#2249** (`61432eab9`) — 4 branches orphelines onboarding/welcome. ⚠️ **3 sur 4 n'apportaient aucun
  octet** : leur contenu était déjà sur `main` par un autre chemin. `git branch --no-merged` dit
  l'ascendance, pas le contenu — vérifier `git diff` après fusion.

## 4. En vol au moment d'écrire

| Quoi | Où |
| --- | --- |
| C1 — progression par résultat + récap (#2023, #2030) | écrivain |
| W18/19/20 — connecteurs, import, restitution (#2078/.79/.80) | écrivain |
| W8 — corpus de non-régression multi-persona (#2070) | écrivain |
| Queues de Laura — 19 issues à ≤ 4 points | écrivain |
| #2246 (conflit résolu) + `integration-audit-profiler` | intégrateur |

**Branches finies, en attente d'intégration** : `worktree-agent-a99c6c0e56db502da` (guide Laura
onboarding, `abcbeb2ba`), `feat/plafond-growth-100` (`d7a101023`), `feat/profiler-prompt-systeme-audit`
(`af71ac70e`), `worktree-agent-ac5d92bcb91877afe` (`924b8ce4c`).

## 5. Décision de Louis appliquée

**Plafond Growth → 100 messages/24 h.** ⚠️ Le plafond effectif est le **MINIMUM** du plan et de
`CHAT_DAILY_MESSAGE_LIMIT` : tant que cette variable vaut 50 sur Railway, **Growth reste bridé à 50**.
La ligne à poser : `CHAT_DAILY_MESSAGE_LIMIT=100`. C'est un geste d'hébergeur, il appartient à Louis.

## 6. ⚠️ Les quatre choses à ne pas réapprendre

1. **29 points étaient `livré` alors que leur propre preuve disait « ABSENT CONFIRMÉ »** (25 sur #2130,
   les fixtures golden ; vérifié au code : elles n'existent pas sur `main`). Corrigés en `retenu`.
   **Un faux `livré` n'est jamais revisité** — celui-là aurait fermé #2130 à tort.
2. **`taille: 0` sur une sonde d'écran n'est PAS un écran vide, c'est une page non peinte.** Deux
   relevés faux avant de le voir. La sonde doit BOUCLER jusqu'à ce que le texte dépasse un seuil,
   et une capture d'écran tranche en un appel.
3. **Un « Oups » juste après un déploiement est d'abord un BUNDLE PÉRIMÉ.** Mesuré : l'erreur
   `Cannot read properties of undefined (reading 'component')` venait de `index-B1aKKsV0.js` alors que
   l'index servait déjà `index-BmrvtOqK.js`. Le geste : comparer le bundle chargé dans l'onglet à celui
   que sert `/` avant d'ouvrir une enquête.
4. **`M=origin/main; git show $M:apps/…` est corrompu par zsh** — `:a` est un modificateur (chemin
   absolu), le chemin devient `…/origin/mainpps/apps/…`. Écrire la révision en littéral.
   Et un heredoc `<<PY` non quoté fait exécuter les backticks du contenu.

## 7. Défauts ouverts, non corrigés

- **`POST onboarding/refresh` n'a aucun appelant web** (`onboarding.controller.ts:122` ; `git grep` côté
  `apps/web/src` ne rend que des tests). La reconfiguration guidée de #2022 est **inatteignable depuis
  le produit**, et c'est aussi ce qui rend la page 0 de #2013 non recettable pour un compte établi.
- **Six questions d'onboarding sont posées, enregistrées, et personne ne lit la réponse** (trouvé en
  corrigeant #2246 : elles n'entrent ni dans `esnAnswersToProfileData` ni dans les prompts). Lot à ouvrir.
- **Six points de Laura touchent les droits d'un rôle** → arrêt obligatoire, décision due :
  #1911.15, #1918.7, #1934.19, #1941.5, #1941.8, #1941.15.
- **#1912.11 était un REFUS PÉRIMÉ** : la règle « jamais de nom d'éditeur côté app » a été remplacée le
  13/09 par « on nomme ce que l'espace client a BRANCHÉ, par injection ». Le point redevient livrable.

## 8. Recetté cette nuit (29 points, prod `2055e51e3` / `61432eab9`)

- **#2128** — 19 points : la recherche transversale du dossier compte (champ compact, raccourci « / »,
  sept types indexés dont six vus, type/libellé/contexte/date/section/action sur chaque ligne,
  `find=` dans l'URL, sans rechargement, les trois raccourcis).
- **#2123.49-.55** — 7 points : le module « Travailler ce compte avec Laura » et ses six suggestions.
- **#2120.14** — « Voir tous les contacts » ouvre la liste avec recherche ET filtres.
- **#1962.4** — les préférences personnelles, avec « Personne d'autre ne les voit. »
- Sonde de mise en page **vide** sur `/accounts/<id>` (tous onglets vus) et `/settings/memory`,
  zéro débordement horizontal.

## 9. Le prochain geste

1. Merger #2246 dès que sa CI est verte (surveillance en fond, `scratchpad/veille.sh`).
2. **Ouvrir l'intégration des 10 branches orphelines comptes/prospection** — c'est le plus gros
   gisement de points bloqués.
3. Reprendre la recette sur `accounts-metier-2` (74 points sans mention de branche) et sur les
   queues de Laura une fois le lot rendu.
