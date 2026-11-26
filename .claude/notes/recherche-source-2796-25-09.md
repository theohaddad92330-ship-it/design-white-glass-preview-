# Recherche du corpus terrain — #2796 (11 points #1948.*, corpus utilisateur réel)

Base : `feat/epopees-3009-2796-25-09` (origin/main du 25/09), suite à #2796 « corpus utilisateur
réel (recherche terrain, ingestion, curation) ». Sources cherchées dans le dossier local
gitignoré `agent_docs/sources/`, par CHEMIN ABSOLU.

## Périmètre

11 points repris de #1948, hors lot du 24/09 : #1948.1 à .8, .10, .15, .56 (registre source :
`.claude/notes/registre-2026-09-12.md`, lignes 866-921).

## Ce que le registre du 12/09 disait déjà

Chaque ligne 1948.1 à .10 et .56 porte la même annotation : « PARTIEL — chiffres présents dans
`agent_docs/meta-analyse-besoins-2026-08-03.md:5-9`, **PDF sources absents du dépôt (addendum
G)** ». Cette recherche vérifie si les PDF sources sont apparus depuis, dans la recopie locale.

## Sources lues

- `agent_docs/sources/BELLUMAI_ITERATION_3_09/…/repo_historical_mirrors/
  meta-analyse-besoins-2026-08-03.md` (et son doublon dans ITERATION_3_08) : triage du 03/08,
  cite les DEUX PDF sources (`BellumAI_Meta_Analyse_Besoins_Utilisateurs_2026.pdf`, 30 p. —
  personas, familles de besoins, critères d'acceptation ; `BellumAI_Meta_Analyse_Besoins_
  Workflows_Requetes.pdf`, 25 p. — 604 réponses, 100 besoins PRIO 1, 50 PRIO 2, 60 requêtes,
  25 déclencheurs) — mais ne les CONTIENT pas : c'est un document de décisions et d'état du
  code, pas le corpus.
- `agent_docs/sources/BELLUMAI_ITERATION_3_08/…/repo_readable/agent_docs/
  couverture-rapports-2026-08-03.md` (342 lignes, trouvé via grep sur « 100 sujets »/« 25
  déclencheurs »/etc.) : couverture point par point, mais chaque section (« Les 100 besoins
  PRIO 1 », « Les 60 requêtes exécutables »…) donne des COMPTAGES agrégés par outil (« Gmail 35
  besoins, ~31 couverts ») et des ÉTATS (livré/partiel/non livré), jamais la liste nommée des
  100/50/60/25 items eux-mêmes.
- `agent_docs/sources/dossier-26-aout/sources-21-aout/BellumAICroisementMetaAnalyses.txt`
  (644 lignes, méta-analyse croisée du 21/08 par ORION) : §2.4 cite le chiffre « 604 répondants
  consolidés » et l'agrégat « besoin n°1 : prospection/relances/plan de compte » — une
  statistique, pas les réponses individuelles ni les listes de sujets/requêtes/triggers.

## Recherche du corpus brut lui-même

`find agent_docs/sources -iname "*Meta_Analyse*"` et variantes (`*Besoins_Utilisateurs*`,
`*Workflows_Requetes*`, `*RECETTE_FINALE*`) : **aucun résultat**. Les deux PDF sources (30 p. et
25 p.) qui portent le corpus réel ne sont PAS dans la recopie locale gitignorée — contrairement
aux autres PDF du même lot de triage (`pdf-1` à `pdf10`, tomes 1-8, annexes) qui, eux, y sont.

## Constat

Tout ce qui est disponible localement est une COUCHE DE TRIAGE (comptages, états de couverture,
décisions produit) construite APRÈS lecture des deux PDF sources par une session précédente —
jamais le contenu lui-même. Importer un « corpus de référence » à partir de ces seuls comptages
fabriquerait des réponses, des sujets et des verbatims inventés, ce que la doctrine interdit
explicitement (« JAMAIS de données fictives » — CLAUDE.md ; et #2796 le nomme : « fabriquer ce
contenu à la place serait la donnée fictive que la doctrine interdit »).

## Conclusion

**Aucun des 11 points n'est livrable par import.** Les deux PDF sources restent hors dépôt (Drive
de Louis, pas encore recopiés dans `agent_docs/sources/` pour cette partie). La voie alternative
que l'épopée nomme — un pipeline de curation humaine sur les canaux déjà agrégeables dans le
dépôt (`feedback.service.ts`, issues GitHub) — reste un chantier à part entière (plusieurs jours,
hors périmètre borné de cette session). Le registre `.claude/notes/registre-2026-09-12.md` n'est
pas modifié (aucune cellule d'état touchée).
