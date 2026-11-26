# Lot r22-ecran-c1

LOT=R22-ECRAN-C1. Écrivain cloud, dépôt Bellum-AI/belllum-monorepo. Plafond 300 tours ; à 80 % : commit du vert, push, rapport, STOP. AUCUN sous-agent ; AUCUNE commande en arrière-plan ; rien sous `.claude/` ; jamais main, jamais --force/--no-verify ; n'ouvre PAS de PR.

`git fetch origin && git checkout -B claude/r22-ecran-c1 origin/claude/theo-b-base` (la base porte déjà le design system de Théo, les retraits B1, l'envoi programmé et le sélecteur de Laura).
LIS D'ABORD : `git show origin/claude/briefs-r22-ecrans:docs/briefs/r22-ecrans/COMMUN.md` — décisions TRANCHÉES par Louis, sources des pages, doctrine. Ne rien remonter en question : tout est tranché.

ÉCRANS DE CE LOT (domaine C) : actions-aujourdhui, sequences-bibliotheque.
Pour chacun : la page appliquée (`docs/maquettes/theo-v22/_appliquees/c/<page>.html`, branche amendée d'abord, cf. COMMUN.md) + sa section dans le fichier d'écarts (`git ls-tree -r --name-only origin/claude/theo-v22-ecarts-c -- docs/maquettes/theo-v22/_ecarts`, puis git show) : listes 1 REDESSIN, 2 FEATURES NEUVES, 3 ABSENTES (TOUTES gardées, comptées N/N dans le rapport) ; la section « RIEN NE SE PERD » de COMMUN.md prime + la ligne « Mise en page » de COMMUN.md pour la page.
Spécifique : Actions = 3 onglets de Théo (À traiter · Séquences · Automatisations) — ⚠️ RENVERSE c122 côté navigation : dater le renversement dans agent_docs/doctrine.md + packages/contracts/src/schemas/doctrine-registry.ts (GA-38). Moteur commun gardé.
Tout signal, offre, article ou fait affiché porte le LIEN vers sa page d'origine, VISIBLE directement sur la ligne/carte sans ouvrir de détail (COMMUN.md, « SOURCES CLIQUABLES, VISIBLES DIRECTEMENT ») — vérifie que l'API renvoie l'URL, sinon l'ajouter (jamais inventée).
Ne touche PAS aux autres écrans (un autre lot les code en parallèle) ; un composant partagé indispensable = commit séparé, nommé « partagé ».

Règles : TDD ; trace `// Théo C <page>.<R|N|A><n> — …` ; compagnons : i18n fr+en, changelog (entries.ts + labels fr/en, capacité nommée jamais l'outil), semis démo + demo-coverage, l'APPELANT (la route est atteignable depuis la navigation), `node scripts/garde-derive-doc.mjs origin/main...HEAD`, `pnpm lint:exports:types`.
Install : `pnpm install --frozen-lockfile && pnpm --filter "./packages/*" build`. Web : `cd apps/web && npx vitest run <tests>` (≤ 5 fichiers/passe) + `npx vitest run src/architecture src/i18n` avant push ; API si touchée : `cd apps/api && npx jest <specs>` + `npx jest src/architecture` ; IA si touchée : `cd apps/ia && env -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy uv run --python 3.12 --extra dev pytest <tests> --timeout=120` ; tsc des paquets touchés (`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p .`, 0 `error TS`).
Commits par point ou groupe de points d'un même écran, push après chaque : `git push -u origin claude/r22-ecran-c1` (vérifie `git ls-remote`). Rapport ≤ 15 lignes : par écran, points livrés (SHA) / déjà là / non faits + raison.
