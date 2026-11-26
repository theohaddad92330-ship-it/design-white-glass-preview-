# Rapport — lot N-CLÔTURE-CODE (25/10/2026) — branche `claude/n-cloture-code-2510`

## #4293.7 — journée sans messagerie : bloc « Non placé » — AJOUTÉ

- **Déjà là** : le mécanisme `deferred_blocks` (« Non placé » + raison, `chat_tools.py` `_focus_tools_split`, raison `outil_non_branche`,
  clé i18n `chat.json` `deferredReason.outil_non_branche`) — mais il ne se déclenchait que si Laura déclarait `requires_tool: "email"`.
  Une journée sans messagerie pouvait donc se rendre sans rien dire.
- **Ajouté** : `_mailbox_unplaced` (`apps/ia/app/services/chat_tools.py`), appelé par `propose_focus_plan` : familles connues et `email`
  absente ⇒ un bloc `{type: follow_ups, title: "Traiter la messagerie", reason: outil_non_branche}`. Familles inconnues (`None`) ⇒ rien
  d'affirmé ; un bloc mail déjà écarté par Laura n'est pas doublé. Clé i18n RÉUTILISÉE (GA-26), aucune nouvelle.
- **Test qui le fige** : `apps/ia/tests/test_4293_7_journee_sans_messagerie.py` (rouge pour la bonne raison d'abord : 2 échecs, puis vert).
  52 tests verts avec les plans voisins. `discover_hiring_scope.py` non touché.
- **Démo** : aucune table ni clé `raw_analysis` neuve ; l'espace de démo a sa messagerie, donc le bloc n'y apparaît pas — pas d'entrée
  `demo-coverage.ts` à créer. (Question : si la démo doit montrer le cas « sans messagerie », c'est hors de ce périmètre.)

## #4294.2 — pièce tardive rattachée côté serveur — PROUVÉ (comportement existant, test ajouté)

- **Déjà là** : le serveur rattache une pièce tardive par `PATCH /rag-documents/:id/scope` → `RagService.updateScopeForUser`
  (`rag.service.ts:126`), appelé par `bindToAccount` du web (`useAnalysisAttachments.ts:211`) ; au lancement, `AnalysisAttachmentBinderService`
  ne range que ce que `/analysis/start` connaît. Aucun appelant manquant : le défaut n'était pas l'appelant, c'était l'absence de preuve.
- **Ajouté** : `apps/api/src/modules/analysis/analysis-attachment-late-binding.spec.ts` (5 cas, dépôt qui APPLIQUE les `where`) : même
  compte, même ligne, aucun `insert`/`save`, aucune ligne créée ; compte d'un autre espace refusé ; pièce d'un collègue refusée avec
  `not_found` NOMMÉ ; échec d'écriture nommé (`update_failed`) ; rejeu sans effet et le binder de lancement ne reprend pas une pièce rangée.
  Mutation vérifiée : retirer `user_id` du `where` fait échouer le cas collègue. Verts d'emblée (comportement déjà correct).
- Délai de 10 s (`Search.tsx:156`) et écran : non touchés.
- **Je mesure** : NON MESURÉ — cette session n'a aucun accès à la base (et ne doit lire aucun secret). Requête lecture seule à lancer :
  dossiers dont un `rag_documents.account_id = accounts.id` a `created_at > ` début du premier run d'analyse du compte. Le chiffre
  reste à produire ; ce n'est pas « 0 ».

## #4295.2 — « Reprendre » dans la carte — NON AJOUTÉ, à dessein (`unknown`)

- **Déjà là** : « Continuer à consulter » (`AnalysisProgressCard.tsx:370`, testé `:169`/`:175`). « Reprendre » (`accounts.json:899`) vit dans
  la bannière d'ERREUR du dossier (`AccountDetailStatusBanners.tsx:178-182`, `useResumeAnalysis`), c.-à-d. sur un échec CONNU.
- **Pourquoi pas dans la carte** : l'« attente anormale » est un silence de plus de 10 min sur un run `analyzing`
  (`lib/analysis-wait.ts:11`, `isRunQuiet`) — aucune preuve de vie, donc on ignore si la course a abouti : c'est un `unknown`. Un timeout n'est
  pas un échec, `unknown` arrête la reprise (`agent_docs/doctrine.md:127`) ; la carte dit elle-même « rien n'est relancé ni débité une
  seconde fois » (`analysis.json:22`). Reprendre pourrait relancer/redébiter une analyse qui tourne encore (`analysis.service.ts:1954`).
- **Ajouté** : test négatif dans `AnalysisProgressCard.test.tsx` (« attente anormale ») : aucun « Reprendre » (bouton, lien, texte), silence
  récent ou prolongé. Mutation vérifiée (ajouter un bouton fait échouer). Aucune clé i18n créée, `__root` non touché.

## Gates lancés

- `uv run --python 3.12 --all-extras pytest` : 52 verts (fichiers cités). `npx jest` spec de rattachement : 5 verts.
- `npx vitest run AnalysisProgressCard.test.tsx` : 16 verts (le paquet `packages/contracts` a dû être construit localement pour que vitest résolve).
- `Search.test.tsx` : non relancé (aucune ligne de l'écran modifiée).
- `tsc --noEmit -p .` : web 0 erreur ; api 3 erreurs, toutes `TS2307 Cannot find module @bellum/email` (paquet non construit dans la VM, hors périmètre, aucune dans les fichiers touchés).

Questions : (1) la mesure #4294.2 demande un accès base lecture seule ; (2) la démo « sans messagerie » si Louis la veut visible.
