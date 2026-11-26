# Rapport — CONTACT-POSTE-4465 (#4465.1, #4465.2)

Branche `claude/contact-poste-4465-2510` · code : 377bc6fc (ce rapport : commit suivant). Pas de PR.

| Point              | Commit   | AVANT (prod 25/10)                                                                         | APRÈS (lu par le test)                                                                                                        |
| ------------------ | -------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| #4465.1 sous-titre | 377bc6fc | « IT Manager - Safran Aircraft Engines » (ancien poste) sous « Head of IT Transformation » | `contact-apollo-subtitle` = intitulé du poste `current` ; aucun `current` ⇒ aucun sous-titre, titre libre non affiché         |
| #4465.2 départ     | 377bc6fc | 0 mention sur 10 cartes, 6 fiches ; organigramme inchangé                                  | pastille « A quitté l'entreprise » (ligne + fiche), groupe « parti » replié, décompte organigramme sans les partis            |
| Démo               | 377bc6fc | aucun contact à 3 postes ni à date de fin                                                  | contacts à 3 postes dont 1 « Actuel » ; contacts `historique` avec fin de poste datée ; `DEMO_CONTACT_POSTE_COVERAGE` (seedé) |

## Tests qui disent NON (rouge sur l'ancien code)

1. Sous-titre = poste `current` (ContactApolloProfile.test) — rouge : oui.
2. Aucun `current` ⇒ aucun sous-titre — rouge : oui (titre libre affiché).
3. Parti = absent du décompte, toujours dans la liste (organigrammeData.test) — rouge : oui ; groupement idem (contactGrouping.test).
4. Sans historique / sans nom de compte ⇒ aucune mention (contactDeparture.test) — rouge : module absent seulement (pas de rouge « métier »).

## Contrôles

tsc web : rc=0. vitest `src/features/contacts` + `tabs` : 465 fichiers, 4033 tests verts. jest démo ciblé : vert. Aucun `apps/api` autre que la démo.

## Limites

- Pas de colonne, migration, rejeu ni appel réseau. Le départ est déduit de `apollo_enrichment.employment_history` ; la preuve serveur `employment_left` gagne si présente.
- Faux « parti » possible si le compte et l'employeur ont des noms sans inclusion (« SG » vs « Société Générale »).
- Le graphe de l'organigramme (51 personnes, venant de `raw_analysis`) n'est PAS filtré : seul le décompte des contacts l'est.
- Le titre libre (`headline`) n'est plus affiché ; l'en-tête garde `contact.title`.
- Non vérifié sur une vraie fiche en production.
- Pour tester ici, j'ai construit contracts/utils/errors/observable (artefacts hors commit).
