# Brief commun — écrivains onboarding, 15/09/2026 soir

Dépôt principal : `/Users/louisschlegel/Desktop/belllum-monorepo` (monorepo BellumAI, pnpm + turborepo).
Tu travailles dans un **worktree isolé**. `origin/main` = `50aad8ef8`. Branche depuis `origin/main` frais.

## 0. Premier tour, deux gestes

1. `git status`. **Si git est refusé** avec un message d'isolation de worktree (« a worktree-isolated agent's git operations must target its own worktree »), ce n'est PAS ton code et ce n'est PAS définitif : Write et Edit marchent. Continue à écrire, et termine ton rapport par le **chemin absolu de ton worktree + la liste des fichiers touchés** — la session principale commitera à ta place. N'essaie pas sept formulations de `git`, n'en conclus pas qu'aucun agent ne peut committer, et **ne modifie aucune configuration pour contourner**.
2. Ton registre n'est PAS dans ton worktree (fichier non suivi par git). Lis-le par son **chemin absolu dans le dépôt principal**, indiqué dans ton brief.

## 1. Ce que tu livres

Les points de ton lot dont l'état est **`retenu`**, et eux seuls. Un point `déjà là`, `recetté`, `écarté` ou `à trancher` ne se retravaille pas. Ne déborde pas sur les points d'un autre lot, même si tu vois le défaut — **signale-le dans ton rapport** (une ligne), c'est ainsi qu'on ouvre un lot dessus.

## 2. Comment (craft rules du dépôt)

- **TDD** : le test AVANT le code, et il doit savoir dire NON (casse volontairement le code protégé pour le vérifier).
- TypeScript strict : pas de `any`, imports nommés, pas de default export (sauf modules NestJS).
- Optional chaining obligatoire sur données Supabase : `data?.champ || repli`.
- **Jamais de donnée fictive.** Échec API → erreur claire. Champ illisible = `null`.
- **Trace** : le numéro du point en commentaire, à l'endroit du comportement — `// #2023.4 — la progression compte les résultats, pas les écrans`.

## 3. Les compagnons — avant d'écrire « livré »

| Compagnon | Ce que c'est |
| --- | --- |
| **Les deux langues** | toute chaîne existe en FR **et** EN (`apps/web/src/i18n/locales/{fr,en}/`). Une chaîne monolingue est un défaut. |
| **L'APPELANT** | du code juste que personne n'appelle est le défaut le plus fréquent du dépôt. Cite `fichier:ligne` de l'appelant. |
| **La démo** | toute fonctionnalité user-facing est AUSSI remplie en démo : semer dans `apps/api/src/modules/demo/demo-dataset.ts` (+ `DemoSeedService`), puis classer dans `demo-coverage.ts` — soit seedée, soit **vide à dessein avec sa raison**. La garde `demo-coverage.spec.ts` fait échouer la CI sinon. |
| **Le changelog** | ⚠️ **INTERDIT dans ce lot.** `packages/contracts/src/changelog/` conflicte à chaque vague parallèle ; l'intégrateur s'en charge. Écris juste, dans ton rapport, la ligne FR + EN que tu proposes. |

## 4. Les règles de design qui font échouer la CI

- **Jamais `{valeur ?? 0}`** : une valeur absente ne s'affiche jamais « 0 ». Primitives `UnknownValue` / `MeasuredValue` / `ScoreWithAxes` / `Provenance`. Question : _si cette valeur est absente, « 0 » est-il VRAI ?_
- **Aucune couleur hexadécimale dans du JSX**, aucune classe de palette Tailwind en couleur de texte (`text-amber-400`), aucune nuance fixe de la gamme primaire pour du texte → `--bellum-text-accent`, et `*-soft-text` pour les couleurs sémantiques. Les deux thèmes sont à parité AA.
- **Typographie** : l'échelle Tailwind uniquement (12·14·16·18·20·24·30·36), plancher 12 px, et une taille en style inline s'écrit en `rem`, jamais en px.
- **Ce qui se clique se tabule** : `<button type="button">`, jamais `<div onClick>`. Un bouton icône seule porte un nom. Cibles ≥ 44 px en pointeur grossier.
- **`<Navigate>` de TanStack Router est interdit** (boucle de rendu).
- Mouvement : `packages/ui/src/motion.ts` uniquement. Aucun rebond, aucune parallaxe.
- Échelle d'empilement nommée (`nav`/`overlay`/`toast`/…), jamais `z-[9999]`.
- Largeur de lecture : texte et formulaires bornés à 70 caractères (le composant `Text` le fait) ; listes et tableaux en pleine largeur.

## 5. La doctrine — ce qui ne se re-litige pas

- **Aucune PROBABILITÉ affichée** (pas de « chance de closing », pas de score de fit présenté comme une chance). Un score est DÉCOMPOSÉ, ses axes nommés, et ce qui n'a pas pu être évalué est NOMMÉ. Sous 3 axes, il n'y a pas de score.
- **Un axe non évaluable SORT du dénominateur.**
- **Aucun critère protégé ne pèse dans le rang d'une personne** (âge, genre, origine, nationalité, photo, situation familiale, adresse) — ni dans le code, ni dans un prompt.
- **NOS fournisseurs ne se nomment JAMAIS** (enrichissement, collecte, modèles, hébergement), ni à l'écran ni dans un prompt. On nomme l'outil que le CLIENT a branché, par injection (`connectedClientTools`), jamais en dur. Un outil non connecté → on nomme la capacité (« ta messagerie »).
- **Le copilote s'appelle Laura, partout.** « copilote » est le nom de la catégorie.
- **On archive, on ne supprime pas.** Un fait périmé redevient inconnu AVEC SA DATE.
- **Rien n'écrit tout seul** : on propose une fusion, on ne fusionne pas ; Laura n'envoie jamais d'e-mail ; une écriture CRM passe par une porte.
- **Base de données : ajout seulement.** Une valeur qui voyage du code vers la base voit sa contrainte SQL élargie AVANT le code qui l'écrit. Un enum ne perd jamais de valeur et n'en insère jamais au milieu.

## 6. Les arrêts — tu t'ARRÊTES et tu le mets dans ton rapport

Authentification / session / droits d'un rôle · filtrage `workspace_id` · facturation, abonnements, tarifs, crédits, consommation · suppression de données en masse · migration qui rétrécit · envoi sortant réel.

Un point d'un de ces sujets ne se code pas : il se PARQUE dans le rapport, avec sa question et ta recommandation.

## 7. Les faux rouges de worktree neuf

- `Failed to resolve entry for package "@bellum/…"` → `pnpm install` PUIS `pnpm --filter "./packages/**" build`.
- `document is not defined` → tu as lancé vitest depuis la racine ; `cd apps/web` d'abord.
- Un `grep` vide peut être un faux zéro : `grep` sans `-E` traite `|` littéralement, `git grep -lin` n'existe pas (`-l -i -n`), et un `grep` sur un chemin inexistant rend 0 avec `exit 0`. Relis la commande avant de conclure à une absence.

## 8. Gates avant de committer

Les commandes exactes sont en **§4 de `/Users/louisschlegel/Desktop/belllum-monorepo/.claude/projet.md`** — lis cette section, appelle les binaires par leur chemin, et relève `echo "rc=$?"` après chacune. Un zéro n'est une mesure qu'avec son code de sortie.

## 9. Fin de lot

- Commits groupés **par écran / par fichier**, tous les numéros de points dans le sujet : `feat(web): la progression compte les résultats (#2023.4, #2023.5, #2030.2)`.
- Terminer les messages de commit par :
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01PiZvtoa7ffue5Szp6nx7uZ
  ```
- `git push` de ta branche. **Tu n'ouvres PAS de PR, tu ne merges pas, tu ne surveilles pas la CI.** Puis **STOP**.
- **Plafond 300 tours.** À 200 : tu commites ce qui est vert, tu écris ton rapport, tu t'arrêtes. Un lot à moitié fait qui rend son rapport vaut mieux qu'un agent coupé qui ne rend rien.

## 10. Rapport final, ≤ 15 lignes

Nom de branche + SHA · un point par ligne : `#<issue>.<n>` → livré / parqué (avec la raison) · les `rc` des gates · la ligne de changelog FR+EN proposée · les défauts vus HORS de ton lot (une ligne chacun).
