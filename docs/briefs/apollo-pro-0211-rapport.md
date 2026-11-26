# Rapport — apollo-pro-0211 (routine cloud, écrivain)

Branche `claude/apollo-pro-0211`. Commits : 652a76d933 (web), 1b77e08761 (ia), b2fb04751e (api + docs).

1. **Croissance d'effectif** — IA (`apollo_org.py` l.101-103, 317-321, 421) et contrat (`analysis-payloads.ts:290`) DÉJÀ LÀ ; `accounts.apollo_enrichment` est servi tel quel à la fiche. Ajouté : ligne « Évolution de l'effectif » (`ApolloFirmographicsCard.tsx`, 12 mois sinon 6 sinon 24 ; absent ⇒ rien). Test rouge→vert : `ApolloFirmographicsCard.test.tsx` (17).
2. **Fraîcheur du poste** — `POST /phase/2/people/employment-freshness` (`employment_freshness.py`, hors cache, crédit D19 via `_enrich_person_uncached`), `IaClient.employmentFreshness`, `rereadContactEmployment` bascule dessus (fiche ouverte >30 j ou routine champions). Écrit `employmentCheck` = confirmed / left(+leftOn) / not_found. Tests : pytest `test_employment_freshness_service.py` (7), jest `routine-executors.employment-check` + `ia.client` (employmentFreshness).
3. **Rattrapage e-mails verrouillés** — `POST /internal/admin/contacts/locked-email-catchup` (`locked-email-catchup.{service,controller}.ts`). Aucune trace du verrou : critère étroit = provider apollo + résultat matched/no_new_data + e-mail absent + tentative < 2026-11-01. Tests : 6 service + 3 contrôleur.
   Pas fait / à trancher :

- **Démo** : `headcountGrowth` NON semé (comptes de la salle = groupes réels, doctrine « apollo_enrichment vide à dessein ») ; classé « vide » dans `changes/apollo-pro-0211.yml` (fragment à fusionner). Question : semer quand même un chiffre fictif ?
- Point 2 : la relecture à l'ouverture de fiche devient PAYANTE (~0,025 $/contact, 1 fois/30 j/contact) ; un « parti » sans employeur actuel nommé n'est pas affiché comme départ (employmentLeftOf exige l'employeur). L'affichage de `leftOn` n'est pas câblé côté web.
- Non lancé : `tsc -p` API (erreurs préexistantes `@bellum/email` non buildé, aucune dans mes fichiers) ; tsc web lancé sans erreur ; pas de ci:local.
