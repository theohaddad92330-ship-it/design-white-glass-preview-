# Brief — lot M2 : la ville + rayon garde les communes du cercle (#4627)

Plafond : 150 tours. Branche : `claude/lot-4962-m2` (part de origin/main, porte ce brief). PREMIER geste : `git merge origin/claude/lot-4962-m` (lis `docs/briefs/claude-lot-4962-m-rapport.md`).
Périmètre : apps/web/src/_, packages/i18n/_, docs/briefs/*

## Contrat validé par Louis (QCM 31/10 15:55)

- #4627 : en mode Signaux, `passesCity` (`discover-filters.ts:1332`) compare le NOM de la ville et ignore le rayon : « Revenir à 100 km » rend 0 alors que des communes voisines sont dans le cercle. Louis : le RAYON prime. Une ville + rayon garde toute entreprise dont la commune (coordonnées connues) est dans le cercle ; coordonnées inconnues = comportement actuel (nom), jamais deviné.
- Je défais : la garde GA-275 (`discover-filters-reach-the-search`, city « écarte ») — « revient sur GA-275, décision Louis 31/10 : le rayon prime sur le nom » dans le commit ET dans le test de la garde (la garde est adaptée, jamais supprimée : elle doit toujours savoir dire NON — une commune HORS du cercle reste écartée).
- Tests rouges d'abord : commune voisine dans 100 km gardée ; commune à 150 km écartée ; coordonnées inconnues → règle du nom.

## Droits

Aucun.

## Règles

Tests ciblés seulement (≤ 5 specs + la garde GA-275 + `tsc -p apps/web`) ; trace `// #4627` ; pas de PR. PUSH : `git push --no-verify -u origin HEAD:refs/heads/claude/lot-4962-m2` ; si refusé, push normal en arrière-plan et le dire. Jamais de force-push.

## Rapport

`docs/briefs/claude-lot-4962-m2-rapport.md` (≤ 10 lignes). Commit + push. STOP.
