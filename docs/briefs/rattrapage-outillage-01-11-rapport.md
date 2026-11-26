# Rapport — rattrapage outillage 01/11 (branche `claude/rattrapage-outillage-01-11`)

Aucune PR (le fil l'ouvre). Tests ciblés verts ; `check-types` : voir la dernière ligne.

## Par point

- #4869.2 — **livré** (3f5b1c93) : `tools/ci/ci-status.mjs` nomme le job rouge ou ANNULÉ avec son `timeout-minutes` ; appelant = étape de `ci-status` (`ci.yml`). Test : `ci-status-diagnostic.test.ts`.
- #4869.3 — **livré** (3f5b1c93) : `test-ia` en matrice 3 shards (`tools/ci/shard-ia.mjs`, par taille ; 557/560/560 fichiers) ; lock/pip-audit/schémas vendorisés sur le shard 1 seul. Garde : `ci-shard-ia.test.ts` (union = la suite, sans doublon).
- #4869.5 — **livré** (3f5b1c93) : `if:` = pull_request (portée ia) OU `schedule` ; `test-ia` ajouté aux `needs` de `suite-complete-rouge` (garde `alarme-main-couvre-tous-les-jobs` verte). `ci-tests-concernes.test.ts` retire `test-ia` de « sauté hors PR » et le dit en test.
- #4873.2 — **livré** (4b6cf61c) : `.github/workflows/jobs-sans-succes.yml`, lundi 07:00 UTC ; `docs/ci.md`.
- #4895.4 — **livré** (2befae04) : `exclude-patterns` étendu (@nestjs/\*, typeorm, jest, react, react-dom, next, eslint, @sentry/\*, stripe, @anthropic-ai/sdk, lucide-react) ; `dependabot-majeures.test.ts`.
- #4895.6 — **livré** (bd8f9cd1) : `briefcase` n'est PAS retirée en lucide 1.x (vérifié sur `lucide-react@1.62.0` : `briefcase.mjs` existe) ; le lecteur de figma-sync ne cherchait que `.js`. Lecteur corrigé (`.js` et `.mjs`, alias compris), lu avec succès sur les icônes de la barre dans le vrai 1.62. Le lock reste en 0.462 : le build figma-sync sous 1.x n'est pas rejoué ici.
- #4714.1 — **livré** (600178bd) : registre `c147_synchro_crm_remplit_un_champ_vide_jamais_n_ecrase`, `agent_docs/doctrine.md`, une ligne dans `CLAUDE.md` (11 601 / 15 000).
- #4714.2 — **livré** (600178bd) : `crm-sync-exception-champ-vide.spec.ts` (2 sites d'écriture décidés, aucune autre écriture, exception nommée dans le service ; sait dire NON sur 6 dérives).
- #4875.2 — **non fait** : l'arbitrage du #4875 (la clé exigée de type liste refuse l'incertitude, OU la porte l'accepte) n'est écrit nulle part (`docs/briefs/lot401` et `lot630` le disent « QUESTION pour Louis ») ; un test commun serait rouge aujourd'hui et choisir un sens serait une décision neuve.
- #4616.4 — **non fait** : aucune décision chiffrée sur la part du pool réservée au travail de fond. Mesure statique pour Louis : les workers déclarent ~39 de concurrence cumulée (11×1, 5×2, 3×3, un 5, un 4, plus `CV_AUTO_PARSE_CONCURRENCY`) contre `DB_POOL_MAX` 10 par défaut ; tous ne tiennent pas une connexion en continu, donc aucun seuil posé.

## Questions pour Louis

1. #4714 : `CRM_SYNC_OVERWRITE=true` écrase une valeur non vide (faux par défaut) — franchit l'exception « jamais écrase ». Retirer le réglage, ou le router par la porte ? Dit dans c147 (`gap`) et `doctrine.md`.
2. #4875 : sens 1 (la clé exigée refuse « Je ne sais pas encore ») ou sens 2 (la porte l'accepte et le persiste) ?
3. #4616.4 : quelle part de `DB_POOL_MAX` pour le travail de fond ?

Aucune écriture user-facing : pas de FR/EN, de semis démo ni de `demo-coverage`. Fragment `changes/rattrapage-outillage-01-11.yml` (ligne `chantiers-livres.md`). Laura V8, #4962-#5029, #4945, ManagerDashboardPage : non touchés.
