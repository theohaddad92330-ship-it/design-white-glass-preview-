# Brief — fix/4962-r3-zone-acces (3 points, lot retours bêta 4962, round 3)

Plafond : 300 tours. Un livrable : commits + rapport `docs/briefs/fix-4962-r3-zone-acces-rapport.md`, UN push simple, puis STOP.
Base : `claude/integration-4962-r2` (PR #5103, non fusionnée) — ce lot la GROSSIRA, ne pas ouvrir de PR.

## Règles

- TDD : test rouge d'abord, puis le code. Tests CIBLÉS seulement (≤ 5 specs voisines, `tsc --noEmit -p apps/web` si besoin). Jamais suite complète, check-types racine, build, ci:local.
- Antériorité AVANT de coder : `git log --oneline -20 origin/main -- <fichier>` et chercher l'appelant. Si un point est déjà livré dans main ou dans cette branche, NE PAS le recoder : l'écrire dans le rapport avec le commit.
- Doctrine (CLAUDE.md) : on n'affiche pas ce qu'on n'a pas ; nos fournisseurs ne se nomment jamais ; libellés FR humains, jamais une clé technique brute ; démo remplie (craft rule 9) si un écran change.
- Ne pas toucher `.github/workflows`, `.claude/`.

## Points

1. **#4989.2** — `/accounts` : le filtre « Zone » du portefeuille ne juge que la ville du SIÈGE. Attendu (issue #4989, `gh issue view 4989 --comments` si gh dispo, sinon ce brief) : un compte dont une IMPLANTATION (site/établissement connu) est dans la zone ressort aussi. Pistes : `apps/web/src/features/accounts` (`portfolioFilters.ts`, `AccountContent.tsx`), endpoint liste des comptes côté API ; les sites d'un compte ont été posés par #5008 (« sites sur la ligne ») — réutiliser cette donnée, ne pas en collecter une nouvelle. Le commit 6c8c26e841 de cette branche corrige la zone côté Découvrir seulement : s'en inspirer (même règle de zone). Un compte sans implantation connue reste jugé sur le siège (ne rien inventer).
2. **#5013 défaut 2** — cartes de Laura (« comptes les plus faciles où entrer ») : des puces affichent des valeurs brutes « Partielle / territory / sector ». Attendu : libellés humains FR (i18n fr+en), aucune clé technique visible. Pistes : `apps/web/src/features/chat/view/reply-blocks`, `CopilotCards`. Garder « non mesuré ≠ 0 ».
3. **#5013 défaut 3** — l'ordre des comptes par classe d'accès sort A, C, B au lieu de A, B, C. Pistes : `apps/ia/app/services/chat_tools.py` (~l.13462, tri `sort_by` access) ; test pytest qui prouve l'ordre A < B < C (comptes sans classe après, sans disparaître). Le commit b9fad7eb71 de cette branche a corrigé le COMPTE par classe : ne pas le défaire.

## Rapport (≤ 15 lignes)

Par point : fait / déjà livré (commit) / impossible (raison) ; fichiers ; tests lancés et résultat.
