# #4982.3 — Laura « répartis mes contacts par région » (rapport)

- Branche `fix/4982-3-laura-zone` (non poussée en PR). Cause : pas de `sort=zone` ET 200 lignes lues au lieu de comptes.
- API : `ContactsService.zoneBreakdown` (GROUP BY `ZONE_REGION_SQL`/`ZONE_DEPARTMENT_SELECT_SQL`, la zone du tri ; mêmes filtres + `applyWorkspaceScope` + périmètre BU que la liste) → `{zones:[{region,department,count}], unknown_zone, total}`.
- Pont : `byZone: true` dans `CopilotContactsSearchDto` + `copilot-contacts-search.controller.ts` (aucune ligne de contact, aucun corps de message).
- IA : outil `search_workspace_contacts` param `by_zone` (description « répartis / région / département / zone »), `bellum_api.workspace_contacts(by_zone=)`, consigne « lieu inconnu : N ».
- Région = `FRENCH_REGION_DEPARTMENTS` (contrats), déjà utilisée par le tri. Hors métropole/sans code postal = « lieu inconnu » (compté, jamais deviné).
- Tests verts : jest controller (+1) et service (+1, bornage workspace), pytest `test_4982_laura_contacts_par_zone.py` (+2). Jest ciblés `-t 4982|2294`.
- Non fait : pas de ci:local ; pas d'éval promptfoo (aucune liste d'outils à mettre à jour trouvée) ; tests écrits avec le code, pas rouge-d'abord strict.
