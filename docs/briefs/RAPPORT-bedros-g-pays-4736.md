# Rapport — lot G, #4736 (full remote sur sept pays)

Branche : `claude/bedros-g-pays-4736` (base origin/main). SHA : voir `git log` de la branche (commit « docs: rapport lot G »).

## Fait

- **Packs DE / GB / ES écrits** (`country_packs/de.py`, `gb.py`, `es.py`) + `DegradedCountryPack` dans `base.py`,
  enregistrés dans `COUNTRY_PACKS`. Statut `beta`, contrat `documented` : vocabulaire + ontologie, **zéro réseau**,
  jamais d'identifiant deviné (aucun endpoint libre vérifié : Handelsregister, Registro Mercantil, Companies House = clé).
- **COMPLIANCE.md** : sections DE / GB / ES (base de transfert, collectable / non collectable, libellés remote).
- **remote_policy.py** : marqueurs full remote DE/ES/GB (« vollständig/komplett remote », « 100 % remoto », « fully remote »…).
  « Homeoffice möglich » / « teletrabajo posible » ne sont PAS full remote (None, jamais deviné) ; hybride DE/ES/EN reconnu.
- **Preuve de branchement** : `tests/test_country_packs_wiring.py` — pour BE/CH/LU/US/DE/GB/ES : registre → `get_active_pack`
  → `collect_country_signals` et `suggest_registry_entities` atteignent le pack ; l'appelant (phase1_research, companies) est
  lu dans sa source (la garde sait dire NON). Les packs BE/CH/LU/US sont bien branchés (appelants trouvés, test vert d'emblée).
- **France** : couverte par le chemin par défaut (recherche-entreprises, BODACC, France Travail), aucun pack par conception ;
  testé (`get_active_pack("FR") is None`).
- Miroir `registry-contract.ts` (+ test) : DE/GB/ES `documented` (garde `test_pack_contracts_match…`).

## Tests lancés (ciblés)

- `pytest tests/test_country_packs_wiring.py tests/test_remote_policy.py tests/test_country_packs.py` → 144 passed
  (rouge avant : 24 failed). `test_sig_c_registres_pays.py` vert. `vitest registry-contract.test.ts` → 5 passed.
- Non lancé : tsc, suites complètes (CI).

## Reste / questions ouvertes

1. **GB réel** : brancher l'API Companies House demande une clé (nom à décider dans `env-reference.md`), un seau
   `rate_limiter` (hors périmètre) et une vérification sur instance réelle. À planifier.
2. **DE / ES** : pas de source libre vérifiée ; décision produit si on veut GLEIF (comme LU, RA par pays à vérifier).
3. **workspaceMarketValues** (`workspace.ts`, contrainte SQL, `market-labels.ts`) ne liste pas DE/GB/ES : un espace ne peut
   pas les choisir comme marché. Hors périmètre (GA-11/12, migration) — à trancher.
4. **Démo (règle n°9)** : aucune table ni clé `raw_analysis` neuve ⇒ rien à seeder/classer dans `demo-coverage.ts`; non touché.
5. `discover-filters.ts` non touché (lot B). Le test de filtre full remote existant (`discover-filters.test.ts:431-465`) n'a pas été relancé.
