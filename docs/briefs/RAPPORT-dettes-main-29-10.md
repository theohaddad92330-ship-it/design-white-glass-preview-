# Rapport — dettes de main (29/10), branche fix/dettes-main-29-10

Environnement : le node_modules du worktree avait zod 3.25 (le dépôt veut 4.6) -> `pnpm install --frozen-lockfile` relancé (aucun fichier suivi touché).

- #4777 — corrigé : le commit 27859b66ce avait écrasé ~900 lignes (pas seulement le frontmatter). Patch inversé en 3 voies, bloc Railway --kv conservé, aucune valeur. ga-413 + microsoft-config : 14/14 (avant : 2 rouges). garde-derive-doc.mjs : rc=2 « rien à comparer » (la fiche est désormais sous garde, 8 fiches) ; pas de contradiction. Poussé seul : fix/dettes-doc-4777-29-10.
- #4785 — corrigé : notes par entity_type/entity_id ; périmètre BU posé (lecture+écriture), route non inscrite au registre ; nouveau account-failed-shells.route.spec.ts (3 tests). sql-column-names + read-coverage + failed-shells : verts.
- #4786 — corrigé par INSCRIPTION au registre (getAccountLinks = exception Louis 28/10, seul `GET :id/links` ; le compte propre reste cloisonné par assertAccountInScope, refus BU étrangère prouvé par business-unit-account-routes.spec). 57/57.
- #4783 — corrigé : 5 requêtes via returnedRows (vrai défaut : `rows?.[0]` lisait le couple). Specs de fusion rejouées avec le format [lignes, n] + cas restored=false. 39/39.
- #4781 — corrigé : CONSTRAINT user_angles_source_check hors colonne (nom/horodatage de migration inchangés). check-constraints : 13/13.
- #4782 — corrigé : MAPPING GA-12, account_crm_fusions_basis_check et user_angles_source_check à `null` avec raison (unions littérales, pas d'enum TS).
- #4780 — corrigé SANS renommage : 2 fichiers ajoutés à la liste legacy gelée (déjà en prod ; TypeORM ne lit que les 13 derniers chiffres du nom de classe -> ordre intact). migrations.spec 10/10. À toi de valider que c'est bien un ajout de liste légitime.
- #4784 — corrigé : 8->9, 7->8, imported:3 dans les deux specs + test de valeur propre (9 vs 3). 15/15.
- #4779 — corrigé : /analyse, /analyze, /talents au catalogue (nature technique, redirections) ; une seule clé /talents. GA-265 7/7, catalogue contracts 22/22.
- #4778 — corrigé : dates relatives calculées une fois. 17/17.
- Plancher prettier — 193 -> 0 : re-mesuré (rc=0, 0 `[warn]`) + contrôle négatif (rc=1, `[warn]`). tsc apps/api : rc=0, 0 `error TS`.

## Arrêts / trouvailles

- ci.yml:1466 lit le plafond par `tr -cd '0-9'` sur TOUT le fichier : les chiffres des commentaires s'accolaient (l'ancien plafond valait « 193 » suivi des dates). Le nouveau fichier est SANS chiffre en commentaire (plafond lu = 0). Le job devrait ignorer les lignes `#` : à corriger par l'autre session (ci.yml interdit pour moi).
- Hook porte-push : lit le SHA du dépôt principal si `git push` sans `-C` ; j'ai utilisé `git -C`.
