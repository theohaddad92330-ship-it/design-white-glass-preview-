# Lot P — Découvrir : onglets Comptes / Autres acteurs (#4746.2) + 4 défauts de la recette F

Branche : `claude/decouvrir-p-onglets-0111`

## Compris (recette prod 01/11 ~12:40 UTC sur a5bf414389 = lot F #5075 fusionné)

- F a déclaré **non livré** le point 6 bis (#4746.2) : pas d'onglet « Autres acteurs ». Onglets actuels : Comptes, Contacts, Besoins et signaux, Partenaires, Liste d'appels. Les ESN sont dans un bloc replié « Cabinets et ESN qui recrutent sur Java (33) » sous la liste.
- « Java Hauts-de-France » → 19 comptes, dont **EXTIA (ESN)** dans Comptes ; « développeur à Lyon » → **FRANCE TRAVAIL** (site d'annonces / organisme) dans Comptes.
- « Tous les filtres » > Cibles > « Le type de compte » propose encore « Clients finaux » / « ESN partenaires » (le filtre doit QUITTER les filtres et vivre dans l'onglet).
- Tableau « sans SIREN » : 22 lignes (29 le 31/10), MAIS 10/22 lieux encore tronqués dans le DOM (« Lille, Hauts-de- ») — #4419.5 visait l'affichage non tronqué. « Choisir l'entreprise » passe à aria-expanded=true mais **aucun candidat ne s'affiche** (3 clics).
- « Data & IA » + Île-de-France : bandeau « 91 trouvés · 44 retenus — 4 hors zone » mais **0 compte affiché** (« Aucune entreprise ne montre… ») : un filtre côté web jette les 44 (#4519).
- « développeur à Lyon » : 10 comptes, pas de délai, 4 sans SIREN (PASS).

## Je fais (décisions Louis 31/10 au QCM, brief F 6 bis — lire `docs/briefs/claude-decouvrir-f-siren-3110.md` §6 bis)

1. **Onglets #4746.2** : UNE liste, deux onglets. « Comptes » (défaut) = clients finaux SEULEMENT (jamais ESN, cabinet, intérim, partenaire, site d'annonces/organisme public de l'emploi — EXTIA, FRANCE TRAVAIL sont des cas de test). « Autres acteurs » chargé AU CLIC seulement (aucune requête avant ; compteur affiché seulement une fois chargé, jamais « 0 » d'une non-mesure), tableau compact (nom · type · ville · nb d'offres · offre la plus récente · date) + pastilles « ESN · Cabinets · Intérim · Partenaires · Sites d'annonces » cochées. Le bloc « Cabinets et ESN qui recrutent » sous la liste disparaît (il devient l'onglet). Réutiliser les données déjà reçues si l'IA les rend déjà (le bloc des 33 existe) — un endpoint neuf seulement si nécessaire, le dire. L'onglet « Partenaires » existant : le lire d'abord ; s'il fait doublon avec « Autres acteurs », le fusionner (GA-26), sinon le garder et l'écrire.
2. **Filtre `entityType`** quitte « Tous les filtres » et ne vit que dans l'onglet (pastilles). Une URL avec `entityType=` existante ouvre le bon onglet / les bonnes pastilles (lister par `git grep entityType` tous les lecteurs : presets, mode partenaires, recherches enregistrées — aucune ne casse).
3. **Classement** : EXTIA et FRANCE TRAVAIL (et tout organisme public de l'emploi / site d'annonces) sortent de Comptes — règle EXISTANTE d'abord (`apps/ia/app/services/actor_typology.py`, #4746.1 / #4814.1), test avec ces deux noms.
4. **Lieux tronqués** : trouver qui coupe « Hauts-de-France » en « Hauts-de- » (IA lecture de l'offre, ou web `truncate`) ; lieu complet affiché ; test avec « Lille, Hauts-de-France ».
5. **« Choisir l'entreprise »** : les 2-5 candidats s'affichent (nom, ville, NAF, effectif) — trouver pourquoi la liste est vide (candidats non transmis par l'IA/API ? rendu ?). Test de bout en bout composant + contrat.
6. **#4519 44 retenus / 0 affichés** : reproduire en test (même filtres : expertise Data & IA, region=11) — quel filtre web jette les 44 ; corriger ; test qui dit NON.
7. Démo seedée pour les deux onglets ; mobile 390 px ; i18n toutes langues ; tests qui disent NON, un par point.

## Je ne fais PAS

TheirStack/budget (lot O), Decathlon/ville ambiguë (lot N), rayon 25 km (lot O).

## Droits

Aucune nouvelle surface ; le choix d'homonyme reste cloisonné par espace (livré par F, ne pas régresser).

## Je défais

Le bloc « Cabinets et ESN qui recrutent » sous la liste (devient l'onglet) — décision Louis 31/10 ; citer #4746, #4814, #4419 aux lignes touchées.

Périmètre : `apps/web/src/features/discover/*`, `apps/web/src/i18n/*`, `apps/web/src/test/tests-node.generated.ts`, `apps/web/src/architecture/*`, `apps/ia/app/routers/discover.py`, `apps/ia/app/services/*`, `apps/ia/tests/*`, `apps/api/src/modules/ia-proxy/*`, `apps/api/src/modules/demo/*`, `packages/contracts/*`, `docs/briefs/*`, `changes/*`

## Règles communes

- Pars de `origin/main` ; push `git push origin HEAD:refs/heads/claude/decouvrir-p-onglets-0111` (SIMPLE ; pre-push en run_in_background puis attendu) ; après chaque push `git ls-remote` = `git rev-parse HEAD`. Jamais main, jamais `--no-verify`/`--force`.
- PUSH APRÈS CHAQUE POINT VERT ; PR PRÊTE vers main dès le premier point poussé. La PR liste honnêtement ce qui n'est PAS livré.
- Plafond 300 tours ; à 240 : commit, push, PR, rapport, stop. Tests CIBLÉS ; Prettier 3.9.10 ; nouveau test web ⇒ une ligne dans `tests-node.generated.ts`.
- Doctrine : jamais de donnée fictive ; jamais un SIREN deviné ; aucune source nommée ; une absence n'est jamais « 0 ».
- Rapport ≤ 12 lignes.
