# Rapport IMPORT-CONTEXTE-4426 (25/10/2026) — audit seul, aucun code

Base `origin/main` @ 84e77fd4. Branche `claude/r21-lot-je-import-contexte` : introuvable (déjà fusionnée). Le lot est déjà dans main (commits #4426.1 à .8).

**#4426.1 — DÉJÀ LÀ.** `ContextPackDropzone` (csv, tsv, xlsx, docx, pptx, pdf, md, txt, json ; `CONTEXT_PACK_EXTENSIONS`) montée dans `OnboardingReviewPage.tsx:228` ET `routes/settings/import.tsx:66` (avec `moreChoices={<UniversalImportLauncher />}`). Plusieurs fichiers d'un coup. Tests : `ContextPackDropzone.test.tsx`, `ImportSettingsPage.structure.test.tsx`.
**#4426.2 — DÉJÀ LÀ.** `POST /import/context-pack/classify` (déterministe, sans modèle) + `classifyContextPackFile` (contracts) ; destination et raison visibles et modifiables avant le clic « Ajouter » ; liens « Voir… » par résultat ; historique `context_pack_imports` (#4422.1) ; lecture Laura (#4426.8).
**#4426.3 — DÉJÀ LÀ.** `qualification_grid` (csv/xlsx) est une destination de la même zone, donc importable depuis /settings/import.
**Démo (règle n°9) — DÉJÀ LÀ.** `DEMO_CONTEXT_PACK_IMPORT_COVERAGE` (vide à dessein : c'est un geste ; 5 destinations semées) et `context_pack_imports` classée dans `demo-coverage.ts`.

**MANQUANT, non codé :** décisions 5 (original conservé + aperçu + URL signée) et 6 (BullMQ) ne sont pas vérifiables sur le chemin context-pack : le contrôleur ne fait que classer/historiser, l'import réel passe par les importeurs existants (import universel : parts en storage, jobs reprenables). Je n'ai pas tranché si la conservation du fichier d'origine est due pour les fichiers de connaissances.
**Recommandation (arbitrage nommé) :** ouvrir une issue dédiée « conserver l'original des documents de contexte » (seau privé + URL signée via `StorageClient.createSignedUrl`, migration additive), plutôt que de la greffer sans cadrage ; lot trop transversal pour un audit de nuit.
**Tests lancés :** aucun (pas de code modifié). Rien en démo à semer de plus.
