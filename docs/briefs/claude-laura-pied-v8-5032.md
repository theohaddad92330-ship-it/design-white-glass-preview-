# Brief — #5032 : pied de réponse Laura V8

Branche : `claude/laura-pied-v8-5032` (ce fichier est déjà dessus). Dépôt : Bellum-AI/belllum-monorepo, base `origin/main`.
Agent : écrivain. **Plafond : 300 tours.** À 80 %, commit et push de ce qui est vert, rapport, stop.
Issue : #5032 (la lire : `gh issue view 5032`). Registre : `.claude/notes/registre-2026-10-31-laura-pied.md` (21 points). Édite la ligne du point quand il change d'état, jamais le fichier entier.

## Contrat validé par Louis (31/10)

**Compris** : sous chaque réponse de Laura, deux ou trois lignes de contrôles noient la réponse.

**Je fais** (/chat ET bulle Laura) :

- Une seule rangée, **invisible au repos**. Elle apparaît au survol ou au focus clavier de la réponse (`group-hover` / `focus-within`). Contenu : **Sources** (ou **Contexte** sans source) · **Copier** · **Enregistrer** (icône signet, qui ouvre le choix de typologie actuel de `SaveReply`) · **Ajuster** (l'ex-« Retravailler », `ReplyTransformMenu`) · **⋯**.
- Mobile (≤ 768 px, la borne de GA-28) : la rangée est visible sous la **dernière** réponse seulement. Toucher une réponse plus ancienne affiche la sienne.
- **⋯** contient : Exporter (si la réponse a des blocs, `ReplyExportMenu`), Signaler un problème (`ReplyFeedback`, ses 6 choix et la correction « Donnée fausse » intacts), Réessayer / Modifier ma demande / Autre angle (`ReplyRetryMenu`).
- Ce qui passe dans le panneau Sources : la fraîcheur (« Donnée du … »), le nombre de sources, les badges (`ReplyBadges`), « Laura a lu ce fil » (la version inline part, celle du panneau `placement="source"` existe déjà). Le panneau garde TOUT son contenu actuel (`ReplyBasis`, `ContextDisclosure`, mémoire consultée).
- Ajuster gagne une entrée **« Approfondir (avec devis) »** qui ouvre le flux de `DeepenActions` (devis avant lancement, puis delta rejoué, #2452). Le CTA « Lancer une qualification complémentaire » de `ReplyActions` (`onQualify`) ouvre ce même flux. Un seul chemin vers le moteur (GA-26).
- **Ce qui est supprimé** : l'heure ; le repli « Aller plus loin sur cette réponse » (`ReplyNextSteps.tsx:37`, `LauraBubblePanel.tsx:383`) ; **Commentaires** (composant, hook, tests ET la partie API qui ne sert QUE les commentaires de réponse de chat) ; **Écouter** (`ListenReply` et ses tests).

**Je ne fais PAS** : le corps des réponses ; les CTA métier dans le corps (`ReplyActions`, #3766, à part le branchement de `onQualify`) ; l'en-tête du mode dégradé (`ReplyHeader`, #2840) ; « Voir l'activité » ; les autres surfaces de la maquette (#5033) ; `AccountRankingCard` (qui utilise aussi `ReplyBadges`, on n'y touche pas).

**Droits** : aucun changement d'accès.

**Je défais**, en le citant dans le commit (« revient sur #N ») : #3765 (fraîcheur et nombre de sources dans le pied), #3764 (badges dans la ligne), #1940.6 (commentaires de réponse), #1939.12 (écouter), #2452.1 / #2907 (« Aller plus loin » dans la bulle), #3768 (« Retravailler » renommé), #3896 / #3897 (ligne de base dans le panneau, gardée). Si `porte-lot.py anteriorite` nomme d'autres `#N`, ajoute « revient sur #N » ou « garde #N » dans un commit.

## Pièges à vérifier AVANT de supprimer

- **Commentaires** : `ReplyComments` → `features/chat/hooks/useChatComments` → API `apps/api/src/modules/team-comments/`. Ce module sert peut-être d'autres surfaces (comptes, fils…). Ne supprime que ce qui n'a plus AUCUN appelant après le retrait : `git grep` de chaque route et de chaque hook. **Aucune migration, aucune table supprimée** (on archive, on ne supprime pas une donnée).
- **Écouter** : `ListenReply` est référencé par `voice/useVoiceConversation.ts` et `voice/voice-read-policy.ts`. Le mode conversation vocale (#1939) doit continuer à lire ses réponses. Supprime le bouton et ce qui ne sert qu'à lui ; garde ce dont la voix a besoin.
- **Retirer un chemin** : liste par `git grep` tout ce qu'on n'atteignait QUE par ces boutons avant de les retirer, et écris-le dans le rapport.
- Craft rule 9 (démo) : si `demo-coverage.ts` ou une garde de démo référence un élément retiré, mets-les à jour. Ne déplace jamais une entrée vers « vide à dessein » juste pour faire passer un test.
- Changelog : `packages/contracts/src/changelog/` (`entries.ts` + `labels.fr.ts` + `labels.en.ts`, parité stricte). i18n : fr ET en, clés orphelines retirées.

## Périmètre

Périmètre : apps/web/src/features/chat/view/**, apps/web/src/features/chat/voice/**, apps/web/src/features/chat/hooks/**, apps/web/src/features/chat/api/**, apps/web/src/features/laura/bubble/**, apps/web/src/i18n/locales/**, apps/api/src/modules/team-comments/**, apps/api/src/modules/demo/**, packages/contracts/src/changelog/**, packages/figma-sync/src/spec/overlays/**, .claude/notes/registre-2026-10-31-laura-pied.md

Un fichier hors périmètre nécessaire : n'y touche pas, nomme-le dans le rapport.

## TDD et gates — CIBLÉS seulement

- Tests d'abord : `ReplyFooter.test.tsx` (rangée cachée au repos, présente au focus ; ordre des 5 contrôles ; ⋯ ; panneau qui porte fraîcheur, nombre de sources et badges ; absence de l'heure, des commentaires et d'écouter) ; un test mobile (dernière réponse) ; `DeepenActions` atteint par Ajuster.
- `node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json`
- `pnpm --filter @bellum/web exec vitest run <au plus 5 fichiers de test touchés>` + les gardes `apps/web/src/architecture/` qui citent les fichiers touchés (GA-26/27/28/32/33/35).
- API touchée : `cd apps/api && node node_modules/jest/bin/jest.js <specs team-comments>` et `pnpm --filter @bellum/api check-types:tests`.
- `pnpm lint:exports:types` (knip, bloque au pre-push).
- **JAMAIS** la suite complète, le `check-types` racine ou le build : c'est le travail de la CI.

## Livrer

Commits groupés par écran, avec les numéros : `feat(web): pied de réponse Laura V8 — rangée cachée, Sources/Copier/Enregistrer/Ajuster/⋯ (#5032.1-.21)`. Une trace `// #5032.N` à l'endroit de chaque comportement. Push sur `claude/laura-pied-v8-5032` après chaque point vert. **N'ouvre PAS de PR** : le fil l'ouvre.

Rapport (≤ 15 lignes) : branche + SHA, points passés à `livré` (preuve en `fichier:ligne`), points non faits avec la raison, fichiers hors périmètre nommés, chemins orphelins trouvés. Puis STOP.
