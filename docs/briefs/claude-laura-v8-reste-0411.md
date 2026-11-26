# Brief — lot Laura V8 reste (04/11/2026)

**Branche** `claude/laura-v8-reste-0411` (déjà poussée, contient ce brief). Base `origin/main`.
**Plafond** : 300 tours. ≤ 40 points. Un livrable : une PR prête (pas brouillon), puis STOP (ne pas suivre la CI).
**Modèle** : sonnet. Pas de conception lourde.

## Étape 0 — antériorité (OBLIGATOIRE, avant toute ligne)

Pour CHAQUE issue ci-dessous : `git log origin/main --oneline -i --grep '<numéro>'` et `gh pr list --state all --search '<numéro>'`,
puis relire le code cité sur `origin/main` (pas une branche locale). Si le défaut est déjà corrigé sur main → noter « déjà là »
avec le commit, ne rien recoder. La PR #5219 (lot W14, ouverte, autre session) touche aussi `apps/web/src/features/chat/` :
lire son diff (`gh pr diff 5219`) pour ne pas recoder ce qu'elle porte ; ne JAMAIS pousser sur sa branche.

## Les 4 issues (lire `gh issue view <n>` en entier — la preuve attendue y est écrite)

1. **#5179** — `/chat` à 1512 px : le pied du composeur déborde (barre 954/1054, formulaire 1040/1097), bouton « Français » coupé.
   Attendu : `scrollWidth === clientWidth` sur barre ET formulaire à 1512, 1280 et 390 px ; bouton de langue entier, cible ≥ 44 px (GA-32).
   Le pied V8 = 5 contrôles (décision Louis 31/10) : ils tiennent ou se replient (menu ⋯), jamais coupés. Ne pas retirer de contrôle.
2. **#4594** — puces suggérées du composeur coupées en plein mot par « Voir tout » (`Chat.tsx` commentaire `#3774.2.1`).
   Attendu : on affiche MOINS de puces, jamais une coupée ; « Voir tout » reste atteignable ; 1485 et 390 px.
   Mesure de largeur réelle (ResizeObserver ou `overflow` + calcul), pas un bord en dur.
3. **#4944** — 390 px : bouton « Changer ce que Laura lit » (`apps/web/src/features/chat/scope/ScopeButton.tsx:31`, monté dans l'en-tête de `Chat.tsx`) écrasé à 16 px.
   Attendu : ≥ 44 × 44 (GA-35), `scrollWidth ≤ clientWidth`, nom lu (aria-label), parité clair/sombre. Le titre « Laura / Assistante IA » peut céder (truncate), pas le bouton.
4. **#5180** — au premier tour, Laura répond « J'ai repris le fil : la dernière demande… » au lieu de refaire le travail
   (question : « donne-moi les comptes les plus faciles où entrer par rapport à ce que je vends »).
   Chercher la source de « J'ai repris le fil » (`grep -rn "repris le fil" apps/`) et la logique de reprise de fil (IA `apps/ia` et/ou API).
   Règle : reconnaître une demande déjà vue est permis, mais la réponse PORTE LE RÉSULTAT (outil rappelé / cartes rendues), jamais un renvoi seul.
   Test pytest/jest qui échoue AVANT (le premier tour d'une demande semblable rend un résumé sans appel d'outil) et passe APRÈS.

## Règles

- TDD : test rouge d'abord, puis code. Tests CIBLÉS seulement (≤ 5 fichiers de test, `vitest run <fichier>` / `pytest <fichier>` / `jest <fichier>`), jamais la suite complète, jamais le build.
- Gardes de design (`apps/web/src/architecture/`) : lancer seulement celles qui concernent les fichiers touchés (GA-31 typo, GA-32/35 cibles, GA-33 couleurs).
- Démo (craft rule 9) : aucun écran neuf ici ; si un texte de Laura change, vérifier `demo-dataset.ts` n'en porte pas l'ancien.
- Commits `fix(web): …` / `fix(ia): …` citant `(#NNNN)`. Push SIMPLE (`git push`), jamais --force ; preuve du push = `gh api repos/Bellum-AI/belllum-monorepo/branches/claude/laura-v8-reste-0411 --jq .commit.sha`.
- PR prête vers main, titre `fix: Laura V8 — composeur à 1512/390 px, puces entières, premier tour qui agit (#5179 #4594 #4944 #5180)`,
  corps = tableau critère → commit → AVANT → APRÈS (test qui le lit), et « déjà là » nommés. STOP.
