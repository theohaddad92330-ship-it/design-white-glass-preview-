# Brief — lot M : Découvrir dit QUEL filtre vide la liste (#4997, famille #4627)

Plafond : 300 tours (à 240 : commit du vert, push, rapport, stop).
Branche : `claude/lot-4962-m` (part de origin/main, porte ce brief). PREMIER geste : `git merge origin/claude/lot-4962-c` (lot Découvrir non encore fusionné ; lis `docs/briefs/claude-lot-4962-c-rapport.md`).
Périmètre : apps/web/src/_, packages/i18n/_, apps/api/src/modules/discover/_, apps/ia/app/_, apps/ia/tests/_, docs/briefs/_

## Contrat (vague 2 validée par Louis, 31/10)

- Compris : un commercial combine des filtres dans Découvrir (« ferroviaire + IDF », « routier/maritime + IDF 50 km + 1000+ ») et obtient une liste vide ou incohérente sans savoir pourquoi.
- 4997.3 (le cœur) : quand la combinaison rend 0, l'écran NOMME le filtre qui retire tout (« le filtre <X> retire les N résultats restants ») avec le geste « retirer ce filtre ». Calcul : sur les résultats avant filtrage côté client (`discover-filters.ts`, compteur :325-345, `applyRailConstraints`), compter ce que chaque filtre actif retire seul ; nommer celui (ou ceux) sans qui la liste ne serait pas vide. Si le vide vient de la source (0 avant tout filtre client), le dire autrement (« aucun résultat pour ces critères de recherche »), jamais accuser un filtre. Modèle existant à réutiliser : `relationChipImpacts` (`ProjectionResults.tsx`, PartnersResults).
- 4997.1-2 : reproduire les deux combinaisons en TEST (jeu de résultats fictifs de test, pas de prod) à travers `discover-filters.ts`. Si un filtre se combine mal (bug : ET au lieu de OU, rayon appliqué deux fois…), le corriger, test rouge d'abord. Si tout est cohérent, le dire au rapport (le rejeu prod se fera en recette).
- #4627 (ouverte, même famille : « Revenir à 100 km » rend 0, « Trop de filtres » avec 1 filtre) : si la cause est la même, corriger et le nommer dans le commit (`#4627`) ; sinon, nommer la cause au rapport sans coder.
- Antériorité à GARDER : #3908, #3875 (fermées) ; nomme-les dans le commit si tu touches leurs lignes.

## Droits

Aucun : lecture de résultats déjà autorisés, aucun menu ni route.

## Je ne fais pas

Pas de nouveau filtre ; pas de changement de la source (collecte) ; aucun fournisseur nommé ; aucun mot « crédit ».

## Règles

TDD (rouge d'abord) ; tests ciblés seulement (≤ 5 specs par point + gardes `src/architecture` concernées + `tsc -p apps/web`) ; construire `packages/{contracts,utils,errors,http,observable}` si vitest l'exige ; jamais suite complète ni build ; jamais .github/ ni .claude/ ; trace `// #4997.3` ; i18n fr+en ; démo : si le message apparaît en démo, une combinaison démo qui le déclenche existe ou la raison est écrite dans `demo-coverage.ts` ; pas de PR.
PUSH : toujours `git push --no-verify -u origin HEAD:refs/heads/claude/lot-4962-m` (le hook pre-push lance ci:local, 30-60 min dans la VM ; la CI de la PR est la porte). Jamais de force-push. Commitlint : scopes permis web, api, ia, contracts, tooling, infra… (pas `briefs`).

## Rapport

`docs/briefs/claude-lot-4962-m-rapport.md` (≤ 15 lignes : SHA, livré fichier:ligne, verdict des deux combinaisons, #4627 même cause oui/non, tests + résultat, questions). Commit + push. STOP.
