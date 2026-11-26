# Brief commun — vague du 22/09 au soir (écrivains)

Ce fichier porte ce qui vaut pour TOUS les lots de la vague. Ton brief personnel ne répète
que ce qui t'est propre. **Lis-le une fois, au départ. Ne le relis jamais** : ce qui a été lu
une fois reste dans ton contexte, et une seconde lecture se paie deux fois.

## 1. Avant d'écrire — l'antériorité, sans exception

1. `agent_docs/chantiers-livres.md` — le registre de ce qui est DÉJÀ livré. Le défaut n°1 de
   ce dépôt est **du code juste, calculé, testé, que personne n'appelle** : cherche donc
   **l'APPELANT**, jamais seulement la fonction. Si une partie de ton lot existe déjà, tu
   l'écris dans ton rapport et tu ne la recodes pas.
2. `agent_docs/env-reference.md` — AVANT de toucher un connecteur, un fournisseur
   d'enrichissement, un réglage de coût ou de latence, la démo ou la facturation. « Sans clé
   = no-op STRICT » y est défini clé par clé : zéro appel réseau, chemin byte-identique,
   jamais de repli deviné. 🔴 **Jamais une VALEUR de clé dans un commit, un test, un log ou
   ton rapport** — les noms de clés seulement.
3. Une capacité livrée sous un AUTRE numéro est invisible au grep littéral : cherche par
   **clé i18n** et par **comportement**, pas par le libellé de la demande.
   `git log --oneline -S"<mot-clé>" origin/main | head` aide.

## 2. Le découpage — AVANT de coder, jamais après

1. **Numérote** chaque demande `#<issue>.<n>`. Une issue n'est jamais tout-ou-rien.
2. **Ouvre ton registre** (ton brief te donne son chemin), une ligne par point :
   `| #2705.1 | la demande en huit mots | écran/sujet | ce que tu as mesuré au code | état | preuve en recette |`
   En tête du fichier : `base : <sha d'origin/main> — 22/09/2026`.
3. États : `retenu` · `déjà là` · `livré` · `reformulé`.
   🔴 **Tu n'écris JAMAIS `écarté`.** Écarter est un arbitrage produit, il ne t'appartient
   pas. Un point que tu penses devoir écarter reste `retenu` et part dans ton rapport sous
   **QUESTIONS**.
4. La colonne **preuve en recette** commence par `CODE`, `API` ou `ÉCRAN` : c'est elle qui
   décide qui prouvera le point ensuite. Un point dont la preuve est ce que quelqu'un VOIT ne
   se ferme jamais sur un `git grep`.
5. **L'état d'un point change en éditant SA ligne**, jamais en réécrivant le fichier.
   Quand une ligne porte déjà une annotation, tu AJOUTES la tienne après un ` ‖ ` : le dernier
   segment fait foi, et rien ne s'efface.

## 3. La doctrine qui ne se re-litige pas

Le détail : § Doctrine de `CLAUDE.md` et `agent_docs/doctrine.md`. Ce qui tombe le plus souvent :

- **JAMAIS de donnée fictive** (sauf dans le jeu de démo, où c'est explicitement demandé).
  Échec d'API → **erreur claire**, jamais un repli inventé ni un nombre deviné.
- **Une valeur absente ne s'affiche JAMAIS « 0 »** (gardes GA-18/GA-19). « Non mesuré » n'est
  pas zéro : un axe non évaluable sort du dénominateur et reste NOMMÉ.
- **On n'affiche pas ce qu'on n'a pas** : dans une LISTE, une absence ne fait AUCUNE ligne ;
  sous un SCORE, les axes non évaluables restent nommés.
- **Aucune PROBABILITÉ** (chance de closing, prévisionnel pondéré) — refusé six fois.
- **Aucun critère protégé** ne pèse dans le rang d'une personne (âge, genre, origine, photo…).
- **On archive, on ne supprime pas.** Une correction humaine gagne toujours, quelle que soit
  sa date. On PROPOSE une fusion de doublons, on ne fusionne jamais.
- **Le copilote prépare, l'humain envoie.** Rien ne part vers un tiers sans geste utilisateur.
- **Nos fournisseurs ne se nomment jamais à l'écran** ; on nomme ce que l'espace a BRANCHÉ.
- **Le copilote s'appelle Laura, partout.**

## 4. Les compagnons d'un changement user-facing — avant d'écrire `livré`

- **i18n FR + EN à parité stricte.** Aucune chaîne monolingue. Une garde monolingue est
  aveugle à l'autre langue.
- **Parité démo** (craft rule n°9) : seeder ce que ta feature affiche dans
  `apps/api/src/modules/demo/demo-dataset.ts` (+ `DemoSeedService`), puis **classer** la
  nouveauté dans `demo-coverage.ts` — soit seedée, soit **vide à dessein avec sa raison**.
  Les gardes `demo-coverage.spec.ts` font échouer la CI tant que la question n'a pas de
  réponse écrite. ⚠️ Un commentaire de classification n'est PAS une preuve : la garde doit
  lire quelque chose de réel. Ne déplace jamais une entrée vers « vide à dessein » pour faire
  passer un test.
- **L'APPELANT** : le composant qui rend, la route qui expose, le service qui renseigne.
- **Le test qui sait dire NON** : casse volontairement ton comportement une fois et vérifie
  que le test rougit **en nommant le coupable**. Un cliquet qu'on n'a jamais vu rouge n'est
  pas un cliquet, c'est un fichier.
- **Changelog : NE LE TOUCHE PAS.** Il conflicte à chaque vague parallèle (les libellés
  partagent l'accolade fermante) et il est réservé à l'intégrateur.

## 5. Design — chaque règle est tenue par une garde qui fait échouer la CI

Typographie : une échelle Tailwind, plancher 12 px, tailles inline en `rem`. Parité
clair/sombre, contraste AA, **aucune couleur hexadécimale dans du JSX**. Largeur de lecture :
70 caractères pour du texte, pleine largeur pour listes et tableaux. Un réglage vit à UN seul
endroit. Mobile : borne à 768 px, `dvh` jamais `vh`. Accessibilité : icône nommée, ce qui se
clique se tabule, cibles ≥ 44 px, `<Navigate>` interdit. Mouvement : `packages/ui/src/motion.ts`,
aucun rebond, aucune parallaxe.

## 6. Le geste, et ce qui fait qu'il compte

- **TDD** : le test d'abord, toujours. Chaque endpoint FastAPI a son test pytest.
- **Commit par POINT**, le numéro dans le sujet : `fix(web): la relance s'ouvre au clic (#1096, #1095)`.
- **`git push --no-verify -u origin HEAD` après CHAQUE commit.** Un commit non poussé ne
  compte pas — mesuré ici : 61 commits parfaits jamais poussés, et rien de fermable derrière.
  Ta branche ne porte aucune PR, donc aucun push n'annule de CI.
- **La trace** : `// #1323.4 — <ce que fait la ligne>` à l'endroit du comportement.
- **Ton rapport s'écrit EN CHEMIN**, après chaque point fini, dans
  `"$(git rev-parse --absolute-git-dir)"/rapport-agent.md`. Si tu es coupé à ton plafond, tu
  es interrompu au milieu d'un appel d'outil et **aucune consigne de fin ne s'exécutera** :
  ce fichier est le seul endroit où ton travail se retrouve.
- **À 80 % de ton plafond de tours** : commit de ce qui est vert, push, rapport, STOP. Un lot
  à moitié fini qui atterrit vaut mieux qu'un lot parfait qui meurt avec toi.

## 7. Les portes, et les faux rouges de ce poste

Commandes exactes : `.claude/projet.md` §4 (`grep -n '^## 4' .claude/projet.md`, puis lecture
par `offset`/`limit`). Ce qui fait perdre des heures ici :

- **`pnpm check-types`**, jamais `tsc -b` : il n'existe pas à la racine.
- **Le job `Lint` échoue sur KNIP, pas sur ESLint.** « 0 errors » d'ESLint ne prouve rien :
  va jusqu'au bout et lis le **code de sortie**.
- **Worktree neuf** → `pnpm install` NE SUFFIT PAS : `pnpm --filter "./packages/**" build`
  derrière, sinon `Failed to resolve entry for package "<pkg>"` sur des fichiers intacts.
- **`Failed to resolve import @bellum/…`** → relancer `scripts/worktree-ready.sh`, ne pas enquêter.
- **`document is not defined`** → vitest lancé depuis la RACINE perd son environnement :
  `cd` dans l'app d'abord.
- **Tests ciblés par FICHIER, `--maxWorkers=2`**, jamais une suite de dossier, jamais
  `turbo test` : `cd apps/web && node node_modules/vitest/vitest.mjs run src/<fichiers> --maxWorkers=2`
  · `node apps/api/node_modules/jest/bin/jest.js --config apps/api/jest.config.js --maxWorkers=2 <chemin>`.
- **Un type « qui n'existe pas »** après un changement de schéma : le client généré du
  worktree est périmé, régénère-le avant d'accuser le code source.
- **`git status` refusé au premier tour** : un hook de ce poste bloque parfois git en
  worktree. Write et Edit marchent — **continue d'écrire**, et termine ton rapport par le
  chemin absolu de ton worktree et la liste des fichiers touchés : la session principale
  commitera à ta place. 🔴 **Ne modifie AUCUNE configuration pour contourner.**

## 8. Migrations et schéma

Une valeur qui voyage du code vers la base voit **sa contrainte SQL élargie AVANT** le code
qui l'écrit (GA-11/GA-12). Une migration prend un **horodatage RÉEL, jamais rond** — plusieurs
lots tournent en parallèle et deux migrations au même horodatage se percutent à l'intégration.

## 9. Sécurité — les patrons rouges

`data: req.body` tel quel · `where: { id }` sans borne d'espace · log de jeton ou de mot de
passe · `dangerouslySetInnerHTML` sur de l'entrée utilisateur · `$queryRawUnsafe` · webhook
sans parseur brut · une réponse qui inclut un `passwordHash`. Validation par schéma **côté
serveur**, toujours. Le coût d'accès ne s'agrège JAMAIS entre espaces : ce sont des concurrents.

## 10. Attribution des commits

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MyU4AWMpGNTRa3QPjGvpzo
```
