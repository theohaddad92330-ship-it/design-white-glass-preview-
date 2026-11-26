# Lot 679 — EPOPEE #4923 (contacts & organigramme)

Périmètre : apps/ia/app/services/contact_themes.py, apps/ia/app/services/apollo.py, apps/ia/app/services/web_role_search.py, apps/ia/app/routers/phase2_contacts.py, apps/ia/tests/**, agent_docs/env-reference.md, docs/briefs/**

## Traité

- #4923.1-.8 : `target_families`, taxonomie (22 familles ≥ 24 titres, rôles de tête), couverture tête / partielle, relance active par défaut (plafond 6, par nom sans ancre), passe dirigeants sans seuil.
- #4923.9 : `exhaust_anchors` (toutes les ancres, fusion) sur les passes de têtes.
- #4923.10-.11 : `web_role_search` (Serper, no-op sans clé) + fusion Apollo gagnant.
- #4923.17 : env-reference.

## Décisions touchées

Revient sur #2290.3 (relance éteinte, plafond 2) et le seuil de la passe d'élargissement (#2543). Garde #2290.8, #2655.1, #3911.1, #4622, #4428, #4463 (lignes de constantes et de version portées par ces PR d'intégration, valeurs inchangées hors celles nommées ci-dessus).

## Droits

Aucune surface d'accès touchée (pas de route, garde ni rôle).

## Non fait

#4923.12-.16 (organigramme TS, recommandés, banc d'éval, rattrapage, démo) : lots 3 et 4 de l'issue.
