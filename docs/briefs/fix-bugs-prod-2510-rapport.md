# Rapport — lot FIX-BUGS-PROD (claude/fix-bugs-prod-2510)

Constat d'ensemble : `origin/main` portait déjà un correctif pour 6 des 7 issues (commits cités). Ce lot ajoute ce qui manquait
sur #4479 et livre #4473.

## #4479 — livré ici (51131f92)

- Cause TROUVÉE : `bulkInsert` (collecte/rejeu) ne publie aucune clé de nom pour un prénom seul porté par Apollo (on ne fusionne pas deux
  « Séverine »). Une ligne dont l'identité ne matche pas partait en INSERT et la base la refusait (23505) ; le repli ligne à ligne l'écartait
  EN PERDANT l'apport, après l'erreur de base. (86904371, déjà dans main, couvrait les autres écrivains.)
- Correctif : avant l'INSERT, si la fiche EXISTANTE du compte porte le même nom normalisé (`normalizeFullName`, miroir de l'index), on s'y
  rattache : seule la source du second apport est gardée (`raw_data.alsoSeenFrom`), aucune colonne touchée. Contrainte inchangée.
- Tests (rouge → vert) : `contacts.service.spec.ts` « #4479 » — pas de création, pas d'exception, source gardée, aucune valeur écrasée.
- Hors de portée : deux homonymes au sein d'UN même lot restent départagés par le repli existant (écartés + comptés), car un test existant
  fige « deux Séverine = deux créations en mémoire ». L'index interdit de toute façon la 2e ligne.

## #4478 — déjà livré (1c5f3b18, dans main)

`fetch_last_loss` utilise l'API réelle de `TableQuery` ; `tests/test_tablequery_api_reelle.py` + `test_message_last_loss.py` : 12 verts relus. Rien à changer.

## #4480 — déjà livré (77837f09, dans main)

Repli après panne, noms en cache, erreur dite une fois ; `railway.client.spec.ts`. Non rejoué ici (hors reproduction).

## #4473 — livré ici (48d0811e)

- Cause TROUVÉE : refus 400 du fournisseur « API key not scoped to a workspace » ; les deux routeurs le noyaient dans `commercial_brief_failed` / `dossier_blocks_failed`.
- Correctif : `app/services/model_key_scope.py` reconnaît cette cause seule ; 502 avec `detail: model_key_scope_missing` (code lu par l'API) et
  `user_message` français sans nom de fournisseur ; `logger.error` marqué `model_key_scope_missing` (canal Sentry) ; aucun contenu fabriqué ; aucun rejeu.
- Tests : `tests/test_model_key_scope_4473.py` (reconnaissance, message, 2 routes, code historique conservé). 42 verts avec les suites brief/blocs.
- ⚠ RESTE (geste de Louis) : poser côté fournisseur une clé d'ESPACE DE TRAVAIL pour le service IA sur Railway. Aucun secret touché.
- Non fait : les autres prompts du palier REASONING et `/profiler/generate` n'ont pas été rebranchés sur ce module ; l'API n'affiche pas encore `user_message`.

## #4470, #4474 — déjà livrés (d20db469 + 50edb22a ; 46683ecd, dans main)

Tests de rendu présents. Relance locale impossible : `@bellum/contracts` non construit sur cette VM (hors périmètre `packages/*`).

## #4472 — déjà livré (16557e20, dans main)

DPA/registre disent europe-west4 (Pays-Bas), garde `railway-region.spec.ts` ; le code fixe `.railway/railway.ts:37`.

Gates lancés : jest `contacts.service.spec.ts` (527 verts), pytest 42 verts, tsc sans erreur sur les fichiers touchés (erreurs préexistantes `@bellum/email`).
