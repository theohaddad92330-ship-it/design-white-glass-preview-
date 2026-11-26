# Rapport PR 12C — lot API-BRANCHÉE (#4492, #4497, #4498, #4502, #4503, #4507) · `claude/pr12c-api`

- **1 #4497.a conforme** : `headquarters` sur la ligne de liste (contrat + API) ; ville (`headquartersCity`) sous le secteur du tableau et sur la carte ; absente = aucun texte.
- **2 #4497.b conforme** : `q` cherche aussi dans les libellés des signaux (le sujet affiché), borne d'espace avant le OR ; placeholder « …un sujet ou un SIREN… » fr/en.
- **3 #4498.a conforme** : `status, lifecycle, sector, tag, score, gate, entityKind` = valeur seule OU liste (Zod `oneOrMany`, `IN`/`ANY`) ; modale en `FilterChips` multiples, URL scalaire (1 choix) ou liste, pastilles une par valeur. Test API : la borne `workspace_id` reste la 1re clause. **Revient sur #4496** (listes à choix unique).
- **4 #4498.b conforme** : « À ouvrir » dans Relation = `headline=withoutNextAction`, exclusif des autres relations.
- **5 #4498.c conforme** : données trouvées (`proofs.account_id`, `citation_allowed`) → filtres serveur `documentedHistory` (avec/sans) et `authorizedReferences`. **Démo** : `proofs` est « vide à dessein » (entrée existante, aucune preuve fabriquée) → ces deux filtres ne rendent rien en démo.
- **6 #4502 conforme** : `consultantTitle` (contrat + jointure `c.title`), sous le nom dans Présentations ; absent = aucune ligne.
- **7 #4503.a conforme** : `/contacts/lists` = `ContactsIntro` + `ContactsTabs`. Correctif : `activeOptions exact` (« Répertoire » se déclarait courant sur les autres routes).
- **8 #4503.b partiel** : `ContactsImportsNav` + masquage CSS + clés i18n retirés. **`ImportsSourcesPage` gardée** : `packages/figma-sync` (hors périmètre) la cite et son `validate.test` exige le fichier.
- **9 #4507 conforme** : entrée « Voir l'équipe du compte » pour tout membre (« Ajouter » si `can_edit`), fenêtre qui dit l'équipe vide ; REFUS testé : sans `can_edit`, noms visibles, ni sélecteur ni « Retirer ».
- **10 #4492 conforme** : `?vue=modeles` ouvre la bibliothèque sur `/actions/sequences` (aucune route). `SEQUENCE_LIBRARY_SEARCH` est le lien à poser dans la barre latérale (lot NAV, non touchée).
- **À trancher par Louis** : (1) « Partenaire potentiel » (maquette, Relation) : pas de donnée, non fait ; (2) `listNarrowing` ne nomme que la 1re relation cochée ; (3) `ImportsSourcesPage` à retirer avec la ligne figma-sync ; (4) lien « Modèles de séquence » du menu : à poser par NAV.
- **Tests** : `tsc` web 0 error TS ; `tsc` api = 3 erreurs d'env (`@bellum/email`) ; `vitest src/architecture` 241/241 ; `src/i18n` 26/26 ; changelog + contrat ; web ciblés verts (filtres, dialogue, page, carte/ligne, présentations, équipe, onglets, séquences) ; jest api : `accounts.list-v22-api` (15), headline-filter, submissions (61). Changelog `2026-10-24-pr12c-api-branchee`.
