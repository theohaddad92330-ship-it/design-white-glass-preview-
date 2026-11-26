# Brief — #5044 : corps des réponses de Laura (V8), replis et note de substance → panneau Sources

Branche : `claude/laura-corps-v8-5044` (ce fichier est déjà dessus). Dépôt : Bellum-AI/belllum-monorepo, base `origin/main` (qui contient #5032 : rangée de pied + panneau Sources).
Agent : écrivain. **Plafond : 300 tours.** À 240 : commit et push de ce qui est vert, rapport, stop.
Issue : #5044 (la lire en entier avec ses commentaires : `gh api repos/Bellum-AI/belllum-monorepo/issues/5044` et `/comments`). Épopée : #5033.

Maquette (hors dépôt, extraits ici) : `docs/briefs/laura-v8-maquette/reponses-app-js-1160-1270.txt` (gabarits de réponse V8) et `v5-conversation-contract.txt`.

## Contrat (Louis 31/10 : « forme de la maquette, fonction gardée » + arbitrages en commentaire de #5044)

**Compris** : le corps d'une réponse empile des replis « Voir pourquoi / Voir les sources / Voir les limites » et une note de substance, alors que le panneau Sources de #5032 porte déjà la transparence.

**Je fais** :

1. **Replis du corps → panneau Sources.** Les sections que `detailKindOf` (`apps/web/src/features/chat/view/reply-disclosure.ts`) repliait (Sources, Limites, Méthode, Contexte…) ne s'affichent plus dans le corps : leur TEXTE (écrit par Laura) part dans le panneau Sources du pied (`ReplyFooter.tsx`, bloc ouvert par le bouton Sources/Contexte), sous un intertitre par nature (« Pourquoi », « Sources citées par Laura », « Limites de cette analyse »…). Rien ne disparaît : ce qui était plié est lisible dans le panneau. Le bouton du pied devient « Sources » (ou « Contexte ») dès qu'une de ces sections existe, même sans `context`.
2. **Preuve d'un « Pourquoi »** (`splitWhyForDisclosure`) : la raison courte reste visible dans le corps ; la suite (preuve) part dans le panneau Sources, plus de repli dans le corps.
3. **Note de substance** (`reply-blocks/ReplySubstanceNotice.tsx`, appelée par `StructuredReply.tsx`) : elle quitte le corps et va dans le panneau Sources, en tête. Le bouton Sources porte alors une **pastille d'alerte** (point coloré + nom accessible, par ex. « Sources — réponse partielle à vérifier ») et reste visible même au repos (exception à la rangée cachée : une alerte ne se cache pas). Couleur par token `--bellum-*`, aucun hexadécimal (D79).
4. **Restylage V8 léger du corps** : espacements, titres de sections reconnues (`StructuredReply.tsx` : Objectif, Pourquoi, Ce qui manque, Prochaine action…) alignés sur les gabarits de la maquette. Pas de refonte des 18 cartes typées dans ce lot.

**Je ne fais PAS** : les 18 cartes typées (`reply-blocks/*Card*`, `ReplyBlockView.tsx`) restent telles quelles (restylage = lot suivant de #5044) ; la file d'attente ; l'en-tête « Réponse partielle » et le mode dégradé (`reply-kit/header.tsx`, #2840) restent en tête ; « Ce qui manque », le verdict et la prochaine action ne se plient JAMAIS et restent dans le corps (#3763) ; aucune donnée inventée ; pas de changement du pied hors panneau + pastille.

**Droits** : aucun changement d'accès.

**Je défais** : #3763 (replis du corps) — revient sur la FORME, garde sa règle « ne jamais cacher une information critique » ; la note de substance (cherche son `#N` par `git blame` sur `ReplySubstanceNotice.tsx`) ; nomme dans un commit (« revient sur #N » / « garde #N ») chaque `#N` que `git blame` attache aux lignes modifiées (la porte `anteriorite` le vérifie). Lis le titre de chaque issue avant de choisir.

## Pièges

- Le corps et le pied sont deux composants : il faut faire remonter les sections extraites (et les `findings` de substance) du rendu du message jusqu'au `ReplyFooter`. Cherche où `Chat.tsx` / `LauraBubblePanel.tsx` rendent `StructuredReply` et `ReplyFooter` pour le même message, et passe une prop dérivée d'une fonction PURE (ex. `extractDisclosedSections(text)`), testée seule. Pas de contexte React global.
- Bulle Laura (`features/laura/bubble/LauraBubblePanel.tsx`) : même comportement que /chat.
- Gardes : `a-reply-never-shows-a-completeness-line`, `accessible-names`, `no-hardcoded-colors`, `hover-only-reveal-has-a-focus-companion`, et toute garde qui cite `reply-disclosure` ou `ReplySubstanceNotice` (`git grep -l`).
- Démo (craft rule 9) : une réponse de démo avec une section « Limites » ou « Sources » doit montrer le texte dans le panneau ; vérifie `apps/api/src/modules/demo/` et `features/demo/` (réponses scriptées).
- Retirer un chemin : `git grep` de `ReplyDisclosure`, `detailKindOf`, `splitWhyForDisclosure`, clés `chat.json` des replis ; supprime le code ET les clés i18n fr/en devenus orphelins.
- Changelog : `packages/contracts/src/changelog/` (`entries.ts` + `labels.fr.ts` + `labels.en.ts`, parité).
- Prettier : config du dépôt (printWidth 120, guillemets simples) ; jamais un reformatage de fichier entier.

## Périmètre

Périmètre : apps/web/src/features/chat/view/**, apps/web/src/features/laura/bubble/**, apps/web/src/features/demo/**, apps/web/src/i18n/locales/**, apps/api/src/modules/demo/**, packages/contracts/src/changelog/**, packages/figma-sync/src/spec/overlays/**

Un fichier hors périmètre nécessaire : n'y touche pas, nomme-le dans le rapport.

## TDD et gates — CIBLÉS seulement

- Tests d'abord : la fonction d'extraction (sections reconnues / non reconnues, « Ce qui manque » jamais extrait) ; corps sans repli ; panneau Sources qui montre le texte extrait ; pastille d'alerte visible au repos quand il y a une note de substance, absente sinon (test qui sait dire NON) ; bulle identique.
- `node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` (filtre TS6305, ou `pnpm --filter @bellum/contracts build` d'abord).
- `pnpm --filter @bellum/web exec vitest run <≤ 5 fichiers>` + les gardes ci-dessus.
- `pnpm lint:exports:types` (knip).
- **JAMAIS** la suite complète, le `check-types` racine, le build, ni `pnpm ci:local`.

## Livrer

Commits groupés (sujet ≤ 100 caractères, scope web/api/contracts/tooling) : `feat(web): replis et note de substance dans le panneau Sources (#5044)`. Trace `// #5044` à l'endroit de chaque comportement. **Push** : `GARDE_PORTE_PUSH=0 git push --no-verify origin HEAD:claude/laura-corps-v8-5044` après chaque étape verte (le hook pre-push lance `ci:local`, la suite complète, qui ne finit pas dans la VM : la CI de la PR la jouera). **N'ouvre PAS de PR.**

Rapport (≤ 15 lignes) : SHA poussé, critères tenus (preuve `fichier:ligne`), non faits + raison, fichiers hors périmètre, chemins orphelins. Puis STOP.
