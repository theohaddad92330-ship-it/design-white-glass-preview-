# Lot 740 — #4814 Découvrir › « Clients finaux » sans intérim, VMS, MSP, apporteurs d'affaires

Périmètre : apps/ia/app/services/actor_typology.py, apps/ia/app/services/intermediation.py, apps/ia/app/routers/discover_signals.py, apps/api/src/modules/demo/demo-scripts.ts, apps/web/src/i18n/locales/\*/discover.json, apps/api/src/modules/demo/demo-scripts.spec.ts

Décision de Louis (31/10) : « Oui, les quatre ». Même raison que les ESN (#4746, garde #4746 : la décision touchée est nommée, on la garde et on l'élargit).

- Un seul chemin d'exclusion (GA-26) : `_NOT_AN_END_CLIENT` / `matches_end_client` élargis ; `isIntermediary` dérive de `INTERMEDIARY_ACTOR_TYPES`, que le filtre web lit déjà (aucun second filtre).
- Preuve : intérim = NAF 78.20Z ou liste nommée existante ; VMS / MSP / apporteur = le NOM (listes courtes, mots entiers). Hors preuve : jamais retiré (GA-18/19).
- Ne fait pas : pas de nouvelle surface d'accès, pas de migration, pas de changement des lectures « ESN » / « tous ».
- Démo (règle n°9) : quatre comptes fictifs `isIntermediary` dans la salle.
- Tests : un cas par famille retirée + un vrai client final conservé (pytest, vitest, jest).

Décisions touchées, gardées : garde #4727, garde #4731, garde #4751, garde #4758, garde #4761, garde #4769, garde #4775 (lignes de démo / imports voisins, compteurs de la salle relevés de 34 à 38, rien d'autre ne change).
