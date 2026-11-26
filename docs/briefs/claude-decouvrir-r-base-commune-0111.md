# Lot R — Découvrir : la base commune ne rapporte RIEN en prod (common_base=0) + #4519 Data & IA

Plafond : 300 tours. Brief autonome.

## Compris (prod 01/11)

- Décision Louis 31/10 : la base COMMUNE (DataForge, tables `dataforge_*`, lue via `base_reader` / `discover-sources.service.ts` côté API) est une SOURCE de candidats Découvrir. Or chaque recherche prod journalise `app.routers.discover discover registry_calls=0 … registry=0 offers=25 common_base=0` (16:51 UTC, ia 9710fb9192). Le 31/10, l'erreur SQL « could not determine data type of parameter $3 » (`discover-sources.service.ts:~206`) a été corrigée par le lot E (#5058), mais common_base est resté à 0 depuis. Personne n'a encore trouvé POURQUOI.
- #4519 : « Data & IA + Île-de-France » rend 0 compte et le bandeau « Résultat non vérifiable » (`network_error` à 0 candidat, `Discover.tsx:~1999`) en 20-24 s, sous le budget liste (~36,7 s, `discover.py:~548`). Deux causes compatibles, non tranchées : timeout registre de 8 s + réessai (`apps/ia/app/services/recherche_entreprises.py:~57, ~431`), ou coupe-circuit 5 échecs / 30 s (`:~121`). Le lot Q (#5121) n'a posé qu'une garde (candidats résolus conservés). Le cas antérieur « 44 retenus / 0 affichés » (filtre web, `apps/web/src/features/discover/lib/discover-filters.ts`) n'a jamais été traité.
- Critères #4519 : une expertise du référentiel est traduite en termes métier (data engineer, data scientist, ML, BI…), jamais envoyée comme libellé littéral ; aucun compte hors métier n'entre par un palier sans être nommé ; Data & IA (France, puis Île-de-France) rend des DIZAINES de comptes ; la résolution des employeurs n'est plus coupée à 5 restants.

## Je fais

1. **common_base=0** : tracer bout en bout l'appel IA → API (lecteur de base commune) sur une recherche « développeur Java » région 32. L'IA appelle-t-elle l'API (URL, secret interne, timeout) ? La requête SQL a-t-elle des lignes pour ces filtres (`dataforge_needs` / companies ; colonnes de zone = code région, département, commune ?) ? Les résultats sont-ils jetés après (filtre, dédup, coupe) ? Écrire la cause fichier:ligne dans la PR, puis corriger. Test de NON qui rejoue une base doublée avec 10 lignes compatibles ⇒ `common_base >= 1` dans le log et ≥ 1 candidat de cette source dans la réponse. Quand c'est 0, le log doit dire POURQUOI (`common_base=0 reason=no_rows|api_error|filtered`).
2. **#4519 cause** : doubler le client du registre (lenteur 9 s, 5 échecs) et trancher entre les deux causes. Corriger pour qu'un registre lent ne rende jamais 0 compte quand des employeurs d'offres sont connus. Résolution non coupée à 5 restants.
3. **#4519 expertise** : traduction expertise → termes métier, à un seul endroit (GA-26). Test Data & IA ⇒ requêtes métier, jamais le libellé.
4. **44 retenus / 0 affichés** : test web (expertise Data & IA, region=11) — trouver le filtre qui jette, corriger, test qui dit NON.

## Je ne fais PAS

Classement ESN, Decathlon, lieux, durée (lot Q). Budget TheirStack. Ma cible / paliers (lot S, en parallèle sur Discover.tsx : rester étroit).

Périmètre : `apps/ia/app/routers/discover.py`, `apps/ia/app/services/*`, `apps/ia/app/data/*`, `apps/ia/tests/*`, `apps/api/src/modules/discover*/**`, `apps/api/src/modules/ia-proxy/*`, `apps/web/src/features/discover/*`, `apps/web/src/test/tests-node.generated.ts`, `packages/contracts/*`, `docs/briefs/*`, `changes/*`

## Règles communes

- Pars de `origin/main` (contient le lot Q #5121, ea329980eb). Push `git push origin HEAD:refs/heads/claude/decouvrir-r-base-commune-0111` (push SIMPLE ; pre-push lancé en run_in_background puis attendu ; si check-types exige les dépendances : `pnpm --filter @bellum/contracts build`). Après chaque push, vérifier que `git ls-remote` = `git rev-parse HEAD`. Jamais main, jamais `--no-verify` / `--force`, jamais `.github/workflows`.
- PUSH APRÈS CHAQUE POINT VERT. PR PRÊTE vers main dès le premier point poussé. La PR liste honnêtement ce qui n'est PAS livré. Un point n'est livré que si son APPELANT prod est cité fichier:ligne.
- Plafond 300 tours ; à 240 : commit, push, PR, rapport, stop. Tests CIBLÉS (≤ 5 specs, pytest ciblé) ; Prettier 3.9.10 ; tout nouveau test web ⇒ une ligne dans `apps/web/src/test/tests-node.generated.ts`.
- Doctrine : jamais de donnée fictive ; jamais un SIREN deviné ; aucune source ni fournisseur nommé à l'écran ; une absence n'est jamais « 0 » ; démo seedée (craft rule 9, `demo-coverage.ts`).
- Rapport ≤ 12 lignes.
