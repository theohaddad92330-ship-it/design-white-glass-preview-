# Lot F — Découvrir : moins d'employeurs sans SIREN, deux tableaux compacts

Branche : `claude/decouvrir-f-siren-3110`

## Compris (prod 31/10, « java » région 32, captures de Louis)

- 26 comptes avec SIREN, mais **29 « employeurs prouvés par une offre — sans SIREN »** et **31 cabinets/ESN**. Louis : « on met de côté la moitié des offres parce qu'on n'a pas de SIREN » ; les deux blocs sont « moches de fou ».
- La plupart des 29 ne sont PAS inconnus : la ligne dit « Plusieurs entreprises portent ce nom » (Consort Group, HELPLINE, we+ France, CGI, Smile Group, NEXTON) — homonymie NON tranchée, alors que `resolve_employer` (`apps/ia/app/services/discover_skill_offers.py:692`) a déjà un départage par département (#4419.3, `_place_tiebreak`) et par établissement sur place (#4712, `_site_tiebreak`, motif `homonym_on_site`).
- Indice : les lieux d'offre arrivent tronqués (« Lille, Hauts-de- », « Marcq-en-Barœul, Hauts-de- ») ⇒ le département de l'offre est peut-être absent ⇒ aucun départage. À MESURER avant de coder.
- « Forums Talents Handicap » (7 offres) et « FREE-WORK GROUP » sont des sites d'annonces, pas des employeurs.

## Je fais (Louis 31/10, QCM : les 4 outils + tableau compact)

0. **Mesurer d'abord** : sur un jeu d'offres réelles « java » HdF (fixture tirée du cache ou d'un test existant, jamais inventée), compter les motifs d'échec de `resolve_employer` (`homonym`, `homonym_on_site`, `registry_silent`, `brand_or_program`, `deadline`…) et la présence du département. Le chiffre va dans la PR (avant/après).
1. **#4419.5 lieu de l'offre** : la ville/département de l'offre est lu proprement (« Lille, Hauts-de- » ⇒ Lille, 59 ; code postal « 59800 » ⇒ 59) et passé à `resolve_employer(department=…)`. L'affichage du lieu n'est plus tronqué.
2. **#4419.6 départager les homonymes** : parmi les homonymes, garder l'entité qui a un ÉTABLISSEMENT dans la ville (ou à défaut le département) de l'offre ; à égalité, celle dont le NAF colle au métier ; puis la TÊTE de groupe (siège, plus grand effectif) quand les candidats sont des entités d'un même groupe. Un seul candidat doit rester, sinon `homonym` (on ne devine JAMAIS). Tests avec homonymes réels de la fixture.
3. **#4419.7 base commune et CRM d'abord** : avant le registre public, chercher le nom (et le domaine du site si l'offre le porte) dans `dataforge_accounts` (lecteur commun `apps/api/src/modules/base-reader/base-reader.sql.ts`, garde GA-26 « un seul lecteur ») et dans les comptes de l'ESPACE qui ont un SIREN (le CRM d'un espace ne sert QUE cet espace — cloisonnement #4791.3). Un nom présent une seule fois avec SIREN ⇒ identité. Choisir le chemin le plus simple qui garde un seul lecteur (endpoint interne API existant `/internal/dataforge/…` si présent).
4. **#4419.8 le commercial choisit** : sur une ligne « Plusieurs entreprises portent ce nom », un geste « Choisir l'entreprise » ouvre les 2 à 5 candidats (nom, ville, NAF, effectif) ; le choix est gardé POUR L'ESPACE et gagne toujours sur le calcul (doctrine : la correction humaine gagne). RÉUTILISER le choix d'homonyme existant de la fiche compte (`accountDetail.json` « Plusieurs entreprises portent ce nom — laquelle est la bonne ? » — trouver son composant et son stockage) avant d'écrire du neuf. Une fois choisi, la ligne rejoint la liste des comptes.
5. **#4419.9 sortir les sites d'annonces** : un employeur qui est un site d'annonces / organisateur de forums / plateforme freelance (Forums Talents Handicap, Free-Work…) sort des « employeurs » et rejoint les intermédiaires. Liste ou règle EXISTANTE d'abord (`actor_typology.py`, typologie cabinets/ESN) ; test avec ces deux noms.
6. **#4419.10 deux tableaux compacts** : « Employeurs prouvés par une offre — sans SIREN » et « Cabinets et ESN qui recrutent » deviennent deux TABLEAUX repliés par défaut avec leur compte : colonnes nom · type/motif court · ville · nb d'offres · offre la plus récente (lien) · date ; triables (offres, date) ; pleine largeur (D81 : listes = pleine largeur) ; mobile 390 px lisible (gardes GA-28..30) ; aucun pavé de texte d'explication répété par ligne (une ligne d'aide sous le titre max). Démo : mettre à jour le semis/la couverture si l'affichage change (`demo-coverage.ts`). Toutes les langues (`i18n/locales/*/discoverSkill.json`).
   6 bis. **#4746.2 deux onglets (Louis 31/10 soir, QCM)** — remplace la partie « Cabinets et ESN » du point 6 :
   - UNE liste, deux onglets. **« Comptes »** (défaut) : clients finaux SEULEMENT — jamais une ESN, un cabinet, un intérim, un partenaire, un site d'annonces (garde #4746.1 / #4814.1). Sous la liste, le tableau compact « employeurs prouvés par une offre — sans SIREN » (point 6) avec « Choisir l'entreprise » (point 4) ; un SIREN trouvé ou choisi fait entrer la ligne dans la liste.
   - **« Autres acteurs »** : chargé AU CLIC seulement (aucune requête ni calcul avant), tableau compact (nom · type · ville · nb d'offres · offre la plus récente · date), avec une rangée de pastilles de type « ESN · Cabinets · Intérim · Partenaires · Sites d'annonces » toutes cochées par défaut. Le filtre de type actuel (`entityType`, « clients finaux / partenaires / ESN… ») QUITTE la barre de filtres principale et ne vit plus que là (GA-26 : un réglage à un seul endroit). Une URL avec `entityType=` existante ouvre le bon onglet/les bonnes pastilles (ne pas casser les recherches enregistrées : lister par `git grep entityType` tous les lecteurs).
   - Compteur de chaque onglet affiché ; « Autres acteurs » affiche son compte seulement une fois chargé (jamais « 0 » d'une non-mesure).
   - Démo seedée pour les deux onglets ; mobile 390 px ; test de NON : aucune ESN dans « Comptes ».
     6 ter. **#4632.2 brancher les champs du rail (Louis 31/10 soir)** : « Famille de rôles observée » (`roleFamilyObserved`, #4632) et « Écosystèmes liés à » (`ecosystemObserved`) n'alimentaient que « Marché observé » (retiré par E, PR #5058) — la garde GA-275 les dit inertes. Les BRANCHER sur la recherche : ils voyagent jusqu'à l'API/IA (`searchByFilters` : `roleFamily`, `esn` — lire l'existant) et FILTRENT réellement la liste (un compte sans la famille de rôles observée / sans lien à l'écosystème sort, ou est classé — choisir ce que le service existant sait faire et le dire). Test de NON : le filtre posé change la liste ; GA-275 mise à jour (champ plus inerte).
7. Tests qui savent dire NON, un par point.

## Je ne fais PAS

Nouvelle source payante ; fusion en base (on PROPOSE) ; fiche compte ; ce que fait le lot E (base commune `$3`, marque, Market Memory, « Marché observé »).

## Droits

Le choix d'homonyme (point 4) est une ÉCRITURE : visible et modifiable par les membres de l'espace qui peuvent ajouter un compte ; refusé à un autre espace (test de REFUS : l'espace B ne voit pas le choix de l'espace A). Aucune autre surface d'accès.

## Je défais

Rien de décidé. Lignes touchées portant un `#NNN` (#4419.3, #4712, #4617, #4674, #4791.3) : les citer (« garde #N » / « revient sur #N »).

Périmètre : `apps/ia/app/routers/discover.py`, `apps/ia/app/services/*`, `apps/ia/tests/*`, `apps/api/src/modules/ia-proxy/*`, `apps/api/src/modules/base-reader/*`, `apps/api/src/modules/accounts/*`, `apps/api/src/modules/demo/*`, `apps/api/src/migrations/*`, `apps/web/src/features/discover/*`, `apps/web/src/test/tests-node.generated.ts`, `apps/web/src/i18n/*`, `packages/contracts/*`, `docs/briefs/*`, `agent_docs/*`, `changes/*`

## Règles communes (lire avant tout)

- Pars de `origin/main` APRÈS fusion du lot E (et du lot G si fusionné : brancher `departmentsOfCity` de `@bellum/contracts` dans `placePatterns` de `base-reader.sql.ts` pour qu'une région/département retrouve un compte connu par sa seule ville) ; push `git push origin HEAD:refs/heads/claude/decouvrir-f-siren-3110`. Jamais main, jamais `--no-verify`.
- **PUSH APRÈS CHAQUE POINT VERT** (pre-push en fond + Monitor). PR PRÊTE vers main dès le premier point poussé, complétée ensuite.
- **Plafond : 300 tours.** À 240 : commit du vert, push, PR, rapport, stop.
- TDD, trace `// #<issue>.<n> — …`. Migration éventuelle (stockage du choix) : contrainte SQL élargie AVANT le code (GA-11/12), up/down.
- Doctrine : jamais de donnée fictive, jamais un SIREN deviné, une absence n'est jamais « 0 », aucune source nommée sur une ligne.
- Tests CIBLÉS seulement ; `rtk proxy …` ; Prettier 3.9.10 ; nouveau test web ⇒ une ligne dans `tests-node.generated.ts` ; fiche `agent_docs/*` couvrant un fichier touché ⇒ à jour.
- Rapport ≤ 15 lignes : chiffre avant/après des employeurs sans SIREN.
