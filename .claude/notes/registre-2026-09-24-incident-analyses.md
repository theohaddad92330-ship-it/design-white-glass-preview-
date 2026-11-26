# Registre — #2915 suites de l'incident analyses du 24/09

base : a04c54e3c6 — 24/09/2026

| Point | La demande, en huit mots | Sujet | État | Preuve en recette |
| --- | --- | --- | --- | --- |
| 2915.1 | Échec API arrête le run côté IA | pipeline | livré | LIVRÉ 24/09 nuit branche fix/suites-incident-2915-24-09 (07731a7ef5) — packages/http client.ts streamSse : reader.cancel() dans le finally, l'IA reçoit la déconnexion ; tests client.test.ts + test_graph_analyze.py |
| 2915.2 | Expliquer puis supprimer le démarrage retardé 15 min | infra | retenu | — |
| 2915.3 | Historique des analyses : horodatage juste et rafraîchi | fiche compte | livré | LIVRÉ 24/09 nuit branche fix/suites-incident-2915-24-09 (f405ed0b17) — analysis-subscription.ts invalide accountKeys.runs(id) sur analysis:done/error |
