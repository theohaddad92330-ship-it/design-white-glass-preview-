# Dette mesurée — huit numéros de garde revendiqués par dix-neuf gardes

Mesuré le 20/09/2026 sur `origin/main` = `555e8fd82`, à partir d'une réserve signalée
par l'intégrateur de la vague AC. **Aucune des branches du jour n'en introduit** : la dette
est antérieure.

## La mesure

Le critère n'est pas « le numéro apparaît dans deux fichiers » — un `GA-*` est légitimement
**cité** par la garde ET par le code qu'elle protège. Le critère est : **deux gardes
différentes ouvrent un `describe('GA-N …')`**, donc deux gardes se disent propriétaires du
même numéro.

```sh
/usr/bin/git grep -l -E "describe\('GA-<n> " origin/main -- apps
```

| numéro | gardes qui le revendiquent |
| --- | --- |
| GA-42 | `api/architecture/controller-services-exported.spec.ts` · `web/architecture/persisted-cache-buster.test.ts` |
| GA-44 | `api/architecture/websocket-gateways-authenticate.spec.ts` · `web/architecture/no-vendor-names-in-app.test.ts` · `web/architecture/shortcuts-are-shown.test.tsx` |
| GA-45 | `web/architecture/api-origin-single-door.test.ts` · `web/architecture/connector-failure-names-the-capability.test.ts` |
| GA-46 | `api/architecture/workspace-isolation.spec.ts` · `web/architecture/analytics-behind-consent.test.ts` |
| GA-62 | `api/architecture/need-open-definition.spec.ts` · `web/architecture/no-separate-recruiter-dashboard.test.ts` |
| GA-126 | `api/architecture/local-day-not-utc.spec.ts` · `web/architecture/laura-has-a-face.test.tsx` · `web/architecture/org-relation-verify-has-a-subject.test.ts` |
| GA-286 | `web/architecture/esn-market-memory-says-what-it-observes.test.ts` · `web/architecture/les-deux-projets-couvrent-la-suite.test.ts` |
| GA-338 | `api/architecture/declarative-fields-do-not-score.spec.ts` · `web/architecture/dialog-close-label-is-translated.test.ts` |

**Dix-neuf gardes, huit numéros.**

## Ce que ça casse

Le dépôt traite un numéro de garde comme une **adresse** : la doctrine le cite (`GA-18`,
`GA-43`…), les briefs d'agents le citent, les commentaires de code le citent. Une adresse
qui mène à deux endroits ne permet plus de dire « la règle GA-44 » sans ambiguïté — et
l'intégrateur de la vague AB a justement renumé­roté `GA-365` en `GA-366`/`GA-367` le même
jour pour éviter d'en créer une neuvième.

## Le motif

Sept collisions sur huit opposent **une garde `apps/api` à une garde `apps/web`** : les deux
espaces ont numéroté chacun de leur côté en croyant lire « le plus haut en service ».
La huitième, **GA-286, est un doublon à l'intérieur de `apps/web`** — celle-là n'a pas
d'excuse de cloisonnement.

## Ce qu'on en fait

Rien dans l'immédiat : la correction est mécanique mais touche dix-neuf fichiers, et elle
entrerait en conflit avec les branches en vol et les deux vagues qui atterrissent. À faire
quand le chantier est calme, en **un seul commit dédié**, en gardant le numéro au
propriétaire le plus ancien et en renumérotant l'autre au-dessus du plus haut en service
(**GA-368** au 20/09/2026, pris par « une question affiche son libellé, pas sa clé »).

⚠️ Une renumérotation doit aussi corriger **les citations** : le fichier de doctrine, les
commentaires de code, et `agent_docs/`. Un numéro changé sans ses citations remplace une
ambiguïté par un mensonge.
