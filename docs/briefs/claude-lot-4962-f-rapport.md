# Rapport — lot F fiches consultants (#5016, #5017, #5018)

Branche `claude/lot-4962-f` — SHA : 1f202f21 (#5018), e5091e95 (#5017.1), 96ca289c (#5016) ; poussée, pas de PR.

- **#5018 livré 1f202f21** — `ConsultantFormDialog.tsx:~350,~394` ; clés `form.tjmPlaceholder` / `form.yearsExperiencePlaceholder` fr+en (« ex. 620 » / « e.g. 620 »). Test dans `ConsultantFormDialog.test.tsx`.
- **#5017.1 livré e5091e95** — `apps/ia/app/prompts/bellum_cv_parse.py:~44` : secteurs CITÉS (client nommé), jamais devinés ; test `test_cv_parse.py`.
- **#5017.2 bloqué** — aucun écran de la fiche compte ne liste de consultants : il faudrait un nouvel endpoint + schéma `packages/contracts` (hors périmètre) + carte web + semis démo. Non fait.
- **#5017.3** déjà là (diagnostic du brief : `TalentProfileTab.tsx:143` ← `cv-parse.service.ts:907`), non recodé.
- **#5016 livré 96ca289c** — `skill-seed.ts` : `mergeStackWithSkills`, `syncStackFromSkills` (appelée à la création/modification `consultants.service.ts` `syncStack`, et au commit de CV `cv-parse.service.ts:~257`), `runStackSyncCatchUp`. Additif, filtré par espace, aucune migration.
- **Script** `apps/api/scripts/consultant-stack-sync-catch-up.ts` : `--workspace` requis, simulation par défaut, `--appliquer` explicite, affiche le compte avant d'écrire, idempotent. NON lancé.
- **Non fait : mesure sur la démo** (pas d'accès base ici) — le nombre de fiches divergentes reste à lire en lançant le script en simulation.
- **Tests** : vitest ConsultantFormDialog.test.tsx 39 verts ; pytest test_cv_parse + prompt_cache_ttl + prompt_registry_coverage 67 verts ; jest skill-stack-sync, skill-seed, skill-prune, cv-parse.service, consultant-geocoding, consultant-manager, consent-restrictions : tous verts (cv-parse.service.spec : 2 assertions « 1 requête » passées à 2, voulu). `tsc -p apps/api` : seules erreurs `@bellum/email` non construit (étranger au lot).
- **Hors périmètre touché** : aucun. `packages/contracts` construit localement (dist, non commité) pour lancer vitest ; brief reformaté par Prettier (hook pre-push).
- **Questions** : (1) au commit de CV, la synchro AJOUTE à `stack` les compétences du référentiel même si l'arbitre avait préservé une liste corrigée à la main (rien n'est retiré) — OK ? (2) #5017.2 : valider l'ajout d'un endpoint + contrat ?
