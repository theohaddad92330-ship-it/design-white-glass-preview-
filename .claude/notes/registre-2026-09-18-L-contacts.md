# LOT L — #2543 : la couverture contacts s'effondre sur les comptes au nom de registre

base : 4de83342330489714e4681892f9585e8e90bf300 — 18/09/2026
branche : fix/couverture-contacts-ancres-18-09

## Points

- **#2543.1 — DONE.** `apollo.py::search_people_with_status` ne combine plus
  `organization_ids` + `q_organization_domains_list` + `q_organization_name`
  dans la même requête. Précédence id > domaine > nom, une tentative par
  ancre disponible, repli à l'ancre suivante si la meilleure a
  `<= _ORG_ANCHOR_FALLBACK_MIN` (5) contacts. Arrêt dès qu'une ancre suffit
  (pas d'appel superflu). Tests : `TestOrgAnchorPrecedence` dans
  `test_apollo_service.py`.
- **#2543.2 — DONE.** `phase2_contacts.py` : `if len(seeds) < _MIN_CONTACTS_BEFORE_FALLBACK`
  → `<=`. ARQUUS (exactement 5) déclenche désormais le repli Brave+Claude.
- **#2543.3 — DONE.** `search_people()` (apollo.py) lève `ApolloUnavailableError`
  pour UNCONFIGURED / AUTH_FAILED / RATE_LIMITED / DOWN — plus jamais un `[]`
  muet. `PLAN_BLOCKED` et `EMPTY` restent gracieux (comportement testé et
  voulu : repli Brave+Claude sur compte free-plan). Ce nouveau raise nourrit
  DEUX mécanismes déjà écrits mais jamais alimentés : l'enveloppe
  `apollo_health=SourceHealth.DOWN` de `_contacts_with_envelope`, et le
  `apollo_failure` de la cascade `enrich_person_with_fallback` (déjà catché
  aux deux call sites de `_resolve_by_search`). Tests : assertions flippées
  sur `test_stops_on_api_error` / `test_degrades_on_non_json_200`, + nouveau
  `test_a_named_failure_never_becomes_an_empty_result`.
- **#2543.4 — DONE.** `search_people_with_status` retourne un 3-uplet
  `(contacts, status, total_entries)` — la population annoncée par Apollo
  n'est plus seulement journalisée. Callers internes (`search_people`,
  `search_past_employees`) mis à jour.
- **#2543.5 — PARTIEL, borné au périmètre.** `_assemble_coverage` /
  `assemble_org_graph` / `build_org_graph_payload` (org_graph_assembler.py,
  org_graph_build.py) acceptent désormais `apollo_source_status` /
  `apollo_total_entries` (optionnels, `None` = non mesuré, byte-identique) et
  les portent dans `coverage.sourceStatus` / `coverage.sourceTotalEntries`
  quand fournis. Testé directement (`test_org_graph_coverage.py`). **NON
  câblé bout-en-bout** : les valeurs réelles viendraient de
  `graph/nodes.py::contacts_node`/`classify_node` et
  `routers/phase3_classify.py`, hors périmètre de ce lot (non listés dans le
  périmètre du brief) — la capacité existe, l'appelant réel ne l'alimente pas
  encore.

## Tests

pytest ciblés (venv `/tmp/venv13`), tous verts :
`test_apollo_service.py` (58) · `test_phase2_contacts.py` (40) ·
`test_org_graph_coverage.py` (25, dont 3 nouveaux) · `test_org_graph_assembler.py`
+ 5 autres fichiers org_graph (93) · `test_reverse_prospect_past_employer.py` +
`test_provider_429_backoff_wiring.py` (45) · suite enrichissement/cascade (91) ·
`test_apollo_org.py` + `test_contacts_model.py` (31).
ruff : 0 nouvelle erreur (baseline pré-existante confirmée identique sur
`origin/main` : UP042 apollo.py, I001/F811 org_graph_assembler.py imports,
SIM117 x3 test_apollo_service.py).
