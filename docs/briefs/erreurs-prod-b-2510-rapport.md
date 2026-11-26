# Lot ERREURS-PROD-B — rapport (branche claude/erreurs-prod-b-2510)

Constat : 4 points sur 5 étaient DÉJÀ corrigés sur origin/main ; aucun code produit réécrit.

- #4478 : déjà livré (1c5f3b18) — `fetch_last_loss` utilise `not_is`/`order(ascending=False)`, test `test_tablequery_api_reelle.py`. Non rejoué ici (pas de `.venv` dans la VM).
- #4479 : déjà livré (86904371, 51131f92, 9dc56b48) — écrivains de contacts alignés sur la clé du nom normalisé. Aucun autre insert brut trouvé hors `workspace-merge.sql-store`.
- #4480 : déjà livré (77837f09) — repli après panne, erreur dite une fois.
- #4471 : déjà livré (8646b178) — balayage par curseur sur tout l'espace.
- #4487 : normalisation RFC 3339 sans millisecondes déjà dans `readList` (#4465). Ajouté : test `it.each` sur les 4 ressources triées (persons, organizations, deals, activities) × 3 formes de curseur. jest pipedrive.read.spec : 18/18 vert.
  Arbitrage nommé : le curseur « n'avance pas sur un échec » n'a pas été re-audité (run en erreur écrit `error`, voir crm-import.service) ; à confirmer en recette.
  Reste : la preuve prod (journal sans « read organizations failed ») ne peut se faire depuis le cloud.
