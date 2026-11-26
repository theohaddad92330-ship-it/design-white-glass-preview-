# Lot G — Contrats : la commune donne son département (base commune par région)

Branche : `claude/contracts-commune-departement-3110`

## Compris

Lot E (#5058) : la base commune rapproche maintenant le lieu sur la ville du compte (`dataforge_account_statuses.city`, `headquarters` = « Paris », ville seule). Limite écrite dans la PR : une recherche par RÉGION ou DÉPARTEMENT (`placePatterns` → `%(59)%`) ne peut pas retrouver un compte dont on ne connaît que la VILLE — « il n'existe pas de table ville→département dans l'API ». Objectif Louis : 50 à 100 comptes par recherche, nourris par la base commune.

## Je fais

1. **#4793.5** Dans `packages/contracts` : une table COMPACTE commune → code département (France métropole + DROM), générée depuis la source OFFICIELLE (INSEE, Code officiel géographique, fichier des communes en vigueur — ou `geo.api.gouv.fr/communes?fields=nom,codeDepartement`), par un script versionné `packages/contracts/scripts/` qui écrit le fichier de données ; le fichier de données commité, sa source et sa date en tête. Jamais une ligne écrite à la main ni devinée.
2. Fonction `departmentsOfCity(name: string): string[]` — normalisation (casse, accents, tirets/espaces, « St »/« Saint », arrondissements « Paris 15e », « Lyon 3e », « Marseille 8e »), rend TOUS les départements possibles pour un nom homonyme (ex. « Saint-Denis » ⇒ 93 et 974) — jamais un seul deviné. Fonction `cityInDepartments(name, depts)`.
3. Tests qui savent dire NON : Lille⇒59, Marcq-en-Barœul⇒59, « Paris 15e »⇒75, Saint-Denis⇒[93,974], une ville inconnue ⇒ [] (pas d'exception), « Lens » ⇒ 62 (pas 59).
4. Poids : mesurer la taille du fichier ajouté au bundle web s'il est importé côté web ; s'il dépasse ~300 Ko, l'exposer par un point d'entrée séparé (`@bellum/contracts/geo-communes`) que SEUL l'API importe. Le dire dans la PR.
5. Doc : une ligne dans la fiche `agent_docs/*` qui couvre `packages/contracts/src/schemas/` géo si elle existe.

## Je ne fais PAS

Le branchement dans `base-reader.sql.ts` / `discover-sources.service.ts` (le lot E y écrit en ce moment ; le lot F branchera ta fonction) ; rien côté web.

## Droits

Aucune surface d'accès.

## Je défais

Rien.

Périmètre : `packages/contracts/*`, `docs/briefs/*`, `agent_docs/*`, `changes/*`

## Règles communes

- Pars de `origin/main` ; push `git push origin HEAD:refs/heads/claude/contracts-commune-departement-3110` APRÈS CHAQUE POINT VERT (pre-push en fond + Monitor). Jamais main, jamais `--no-verify`.
- Plafond 150 tours. TDD. Tests ciblés (`pnpm --filter @bellum/contracts exec vitest run <fichier>`, `tsc` du paquet), garde ESM `src/esm-import-extensions.test.ts` (import relatif AVEC `.js`). Prettier 3.9.10.
- PR PRÊTE vers main, corps = points + `fichier:ligne` + taille du fichier + source/date. Rapport ≤ 10 lignes.
