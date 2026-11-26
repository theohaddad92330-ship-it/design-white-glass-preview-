# Lot cloud — fix/4962-r2-zone-contacts (correctifs de recette du lot #4962, 01/11/2026)

- Plafond : 300 tours.
- Un livrable, puis STOP.
- Rapport final : 15 lignes au plus, en dernier message.

## Contexte

Le lot de retours bêta #4962 à #5029 a été fusionné (PR #5081), puis recetté en production le 01/11/2026.
Tes six points ont été vus en défaut (FAIL ou PARTIAL). Le constat de production est recopié dans chaque point ci-dessous.

- Le retour client exact se lit avec `gh issue view <n>`. Un retour est un SYMPTÔME, pas une spécification.
- La doctrine du dépôt est dans `CLAUDE.md` à la racine. Elle ne se re-litige pas.
- Décision de Louis du 27/10, à ne pas renverser : l'élargissement AUTOMATIQUE de zone s'arrête à la RÉGION.
  - Aucune requête « France » ne part d'un élargissement automatique.
  - Le plafond est `ZONE_AUTO_MAX_TIER = "region"` dans `zone_tiers.py`, `zone-tiers.ts` et `zone-tiers.constants.json`.
- Un réglage vit à UN seul endroit (GA-26) : on ÉTEND l'existant.
  - Avant de coder, fais `git log origin/main --oneline --grep <n>` et `git grep` : le point est peut-être livré mais non branché.
  - Cherche alors l'APPELANT.

## Points

### 5008.1 (PARTIAL) — l'implantation dans la zone n'apparaît pas

- Constat : sur `/discover?city=Lille&keywords=commerce détail`, aucune des 12 cartes ne porte « Siège à … · implantée dans la zone ».
- Exemple : Décathlon affiche « VILLENEUVE-D'ASCQ · 59 » et « Sites : Lille (59) ».
- Le code existe déjà (`discover-geography.ts`, `CandidateRow.tsx:358`), mais il ne s'affiche pas sur ce chemin.
- À faire : trouver pourquoi, et le brancher.

### 4989.2 (FAIL) — le filtre Zone de /accounts ignore les implantations

- Constat : la modale dit « La zone se juge sur le siège inscrit au registre : les implantations ne sont pas encore lues ».
- À faire : faire lire au filtre les implantations (sites et établissements déjà collectés), si la donnée existe.
- Sinon : le dire dans le rapport, en nommant où la donnée manque.

### 4998.1 (PARTIAL) — la lecture de la demande arrive trop tard

- Constat : « Ta demande, telle qu'elle a été appliquée » n'apparaît qu'APRÈS Explorer.
- À faire : montrer la lecture de la demande AVANT le lancement.

### 4998.2 (PARTIAL) — une zone inconnue n'est pas dite

- Constat : « Zorglub-sur-Mer » est lu comme « le nom « Zorglub » ».
- À faire : une zone non reconnue doit être DITE « zone non reconnue ».
- `unrecognizedFreetextZone` existe déjà côté besoins : le réutiliser.

### 4986.1 (FAIL) — l'e-mail deviné n'est pas marqué

- Constat : `/contacts` affiche « E-mail disponible » sans dire quand l'e-mail est DEVINÉ (construit par motif).
- À faire : distinguer à l'écran un e-mail vérifié d'un e-mail deviné.

### 4986.2 (FAIL) — le taux d'échec hors France n'est pas exposé

- Constat : aucun taux d'échec des e-mails hors France n'est exposé.
- À faire : lire #4986. Si la donnée existe (rebonds par pays), l'exposer.
- Sinon : le dire dans le rapport, sans rien inventer. Un taux mesure ce qu'on SAIT.

## Méthode

1. Travaille sur CETTE branche, `fix/4962-r2-zone-contacts`, partie d'origin/main.
2. Écris les tests d'abord (TDD).
3. Respecte les gardes `apps/web/src/architecture/` :
   - une absence ne s'affiche jamais « 0 » ;
   - libellés i18n en fr ET en en ;
   - aucune couleur hexadécimale ;
   - cibles de 44 px au moins.
4. Démo (craft rule n°9) : une donnée neuve affichée se seede dans `apps/api/src/modules/demo/demo-dataset.ts`, puis se classe dans `demo-coverage.ts`.
5. Tests CIBLÉS seulement : au plus 5 specs, plus `tsc -p` du paquet touché. Jamais la suite complète, jamais le build.
6. Commits conventionnels :
   - scope `web`, `api` ou `ia` ;
   - lignes de moins de 100 caractères ;
   - aucune ligne de corps qui commence par `#` ;
   - pied `Refs #<n>`.
7. Push SIMPLE : `git push origin HEAD`. N'ouvre PAS de PR, un intégrateur réunit les branches.
8. Ne ferme ni ne commente aucune issue.

## Rapport

- Branche et SHA.
- Pour chaque point : fait, déjà là (où), ou pas fait (pourquoi).
- Tests lancés, avec leur résultat.
