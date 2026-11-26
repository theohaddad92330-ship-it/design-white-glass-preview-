# Brief — lot L (vague 2) : Laura garde la recherche, suit l'avancement, ne déborde pas (#4967.1-2, #5011.1-2, #4966)

Plafond : 300 tours (à 240 : commit du vert, push, rapport, stop).
Branche : `claude/lot-4962-l` (part de origin/main, porte ce brief). PREMIER geste : `git merge origin/claude/lot-4962-h` (lot Laura non encore fusionné ; lis `docs/briefs/claude-lot-4962-h-rapport.md`).
Périmètre : apps/web/src/_, apps/api/src/modules/chat/_, apps/api/src/modules/accounts/_, apps/ia/app/_, apps/ia/tests/_, packages/contracts/src/_, packages/i18n/_, docs/briefs/_

## Contrat validé par Louis (QCM vague 2, 31/10)

### #4967 — une recherche lancée avec Laura survit au changement d'écran

- Compris : le commercial lance une recherche dans Laura, va voir un autre écran, revient : la recherche est perdue.
- Cause (diag) : `Chat.tsx:1885` contrôleur lié au composant ; abort au changement de fil (:1282) et à « Arrêter » (:2335). Ce qui survit côté serveur : NON prouvé — à établir d'abord (le tour continue-t-il côté IA/API quand le client se démonte ? est-il persisté ?).
- 4967.1 : changer d'écran pendant une réponse ne l'interrompt pas ; en revenant sur le fil, la réponse est là (finie) ou en cours. Si le serveur abandonne le tour au démontage, le faire survivre (le flux ne dépend plus du composant monté) — jamais annoncer « continue » sans que ce soit RÉELLEMENT enregistré (#3862, garde).
- 4967.2 : l'accueil `/chat` « Reprendre » (`laura-home-grid.tsx:25,132`, `pickResumeCandidate` `home-resume.ts:40`) propose aussi un fil dont la réponse est en cours ou finie non lue.
- 4967.3 : survie à la FERMETURE d'onglet = NON (décision Louis) — ne rien faire.
- Garde : #3809 (changer de FIL abolit le tour) reste vrai ; ici c'est changer d'ÉCRAN.

### #5011 — la suite proposée dépend de l'avancement

- 5011.1 : après une réponse, les suites (`ReplyNextSteps.tsx:12-48`, monté `Chat.tsx:4263`) tiennent compte d'un état d'espace COMPTÉ (comptes, contacts, actions — lu côté API, pas deviné) : espace vide → 1re étape (analyser un compte, importer) ; espace avancé → suite concrète. Relis d'abord #2950/#2918 (fermées : guide in-app, modes guidés) — `gh issue view` — pour ne pas recoder ; nomme-les « garde » ou « revient sur » dans le commit.
- 5011.2 : chaque suite proposée s'appuie sur un fait cité (doctrine `fact()`), jamais inventée. 5011.3 déjà là (Laura propose, l'humain valide).

### #4966 — une réponse de Laura qui déborde

- Non reproduit par le diagnostic (colonne `Chat.tsx:3178` déjà bornée `min-h-0 min-w-0 flex-1`). Cherche le contenu qui peut dépasser (bloc de code, tableau, URL longue, `pre`) et borne-le (`overflow-x-auto` sur le bloc, `break-words`/`overflow-wrap:anywhere` sur le texte) ; test de rendu qui prouve qu'un tableau large et une URL longue ne créent pas de débordement de page. Recoupe #4944/#4788 (ouvertes) : nomme-les.

## Droits

Aucun changement : Laura lit les données de l'espace (filtre `workspace_id`). L'état d'espace compté (5011.1) : lecture filtrée `workspace_id` ; test REFUS : un autre espace n'est jamais compté.

## Je ne fais pas

Pas de survie à la fermeture d'onglet ; pas de nouveau mode guidé ; aucun fournisseur nommé ; aucune probabilité.

## Règles

TDD (rouge d'abord) ; tests ciblés seulement (≤ 5 specs par point + gardes `src/architecture` concernées + `tsc -p` du paquet ; pytest ciblé) ; construire `packages/{contracts,utils,errors,http,observable}` si vitest l'exige ; jamais suite complète, check-types racine ni build ; jamais .github/ ni .claude/ ; trace `// #<n>.<k>` ; i18n fr+en ; démo : si une suite neuve s'affiche, elle est remplie en démo (`demo-coverage.ts`) ; push après chaque point vert ; pas de PR.

## Rapport

`docs/briefs/claude-lot-4962-l-rapport.md` (≤ 15 lignes : SHA, livré fichier:ligne, ce que le serveur fait au démontage (preuve), tests + résultat, questions). Commit + push. STOP.
