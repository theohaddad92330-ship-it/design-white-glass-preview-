# #4982.3b — la région se lit aussi dans le lieu écrit

- Contrats (`market-pattern.ts`) : `FRENCH_CITY_DEPARTMENTS` (41 villes), `FRENCH_REGION_NAMES` (FR/EN), `FOREIGN_COUNTRY_NAMES`, `normalisePlaceText`, `placeZoneOf` (code postal → nom de région → ville nommée ; autre pays ⇒ null).
- API (`contact-seller-focus.ts`) : `ZONE_REGION_SQL` = COALESCE(code postal, nom de région, ville nommée), SQL GÉNÉRÉ depuis les contrats ; `ZONE_DEPARTMENT_SELECT_SQL` null pour une région lue au seul nom.
- `ContactsService.zoneBreakdown` : `department: string | null`, une région connue compte dans `zones`, `unknown_zone` = région inconnue seule ; le pont relaie le résultat tel quel (type propagé).
- IA (`chat_tools.py`) : directive « département non dit » pour `department` null, jamais inventé.
- Tests : contracts `market-pattern-place.test.ts` (5) + `market-pattern.test.ts` ; jest `contacts.service.spec`, `contact-seller-focus.spec`, `copilot-contacts-search.controller.spec` verts ; pytest `test_4982_laura_contacts_par_zone.py` 4 verts.
- Une assertion de `contact-seller-focus.spec.ts` (`not.toContain('lyon')`) précisée en `'%lyon%'` : « lyon » est désormais au référentiel fermé ; la garde vise toujours l'interpolation du jeton.
- Non fait : SQL non exécuté sur Postgres réel (pas de base ici) ; ni ci:local ni build (consigne).
