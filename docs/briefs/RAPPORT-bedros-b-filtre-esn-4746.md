# Rapport — Lot B (#4746 P0, #4751, #4750)

Branche `claude/bedros-b-filtre-esn-4746` (base `origin/main`). Pas de PR. SHA : voir `git log` (4 commits de code + celui-ci).

## #4746 — « clients finaux uniquement » (FAIT)

Causes : (1) côté IA le filtre ne lisait que le NAF résolu (`matches_entity_type`) : un groupe ESN au NAF de siège/holding (64.20Z) ou une plateforme freelance (63.12Z, aucun NAF unique) passait pour client final ; « FreeWork » n'était pas dans la liste des plateformes. (2) côté web `registryPart` ne transmet pas `entityType` et `applyRailConstraints` ne le lisait pas : mode Registre sans aucun filtre.
Correctif : `actor_typology.matches_end_client` (ESN, ESN connue par son nom, cabinet, plateforme, freelance, sous-traitant, partenaire déclaré sortent ; non classé et ambigu restent, GA-18/19) appelé par `discover_signals.py` ; plateformes FreeWork ajoutées ; `passesEndClientsOnly` dans les deux modes côté web. Rang 2 : lectures `esn`/`all` inchangées (`esn` reconnaît en plus l'ESN par son nom).
⚠️ Hors périmètre listé : 1 appel dans `routers/discover_signals.py` (seul appelant du filtre).

## #4751 — volume et doublon (PARTIEL)

- Cause du volume trouvée côté lecture : `read_request("Product Owner à Lille")` rendait `leftover=('Product','Owner')` — le métier sortait de la recherche. Désormais lu comme profil recruté (`profile_words`, intention « recrute »), liste fermée d'intitulés (`_JOB_TITLE_PHRASES`).
- Chiffres avant/après : lecture, pas prod. Avant : 2 mots non appliqués, `hiringProfile=None`. Après : 0 mot non appliqué, `hiringProfile="Product Owner"`. Le volume de comptes à Lille en production n'est PAS mesuré : la VM n'a ni accès au registre/France Travail (HTTP refusé) ni clés. À rejouer en recette.
- Doublon : NON reproduit. La fusion par SIREN (`_build_candidates`) tient (3 écritures du même employeur → 1 compte, test de non-régression). Hypothèse restante non traitée : deux personnes morales distinctes d'une même marque (SIREN différents) — les fusionner contredirait la doctrine « on propose, on ne fusionne jamais ». Pas la cause de #4603 (analyse d'une société venue du CRM).

## #4750 — intitulés libres (PARTIEL : primitives IA seulement)

`hierarchy_level.expand_job_titles` (saisie d'abord, puis variantes connues, sans doublon, critères protégés ignorés) et `title_matches_wanted` (mots entiers). Les niveaux existants ne sont pas touchés.
NON fait, hors périmètre : champ de saisie (`FilterRail.tsx`), transport (`discover-query.ts`, contrats, API, `discover.py`), message « cet intitulé ne rend rien », seed démo (craft rule 9 : à classer dans `demo-coverage.ts` avec la fonctionnalité visible). Les primitives n'ont encore aucun appelant : à brancher dans le lot qui touche ces fichiers.

## Tests lancés (réels)

`pytest` test_4746 + test_4751 + test_hierarchy_level + test_discover_signals_router + test_actor_typology : 246 passed. Avec test_intermediation/test_discover_signals : 218 passed. Web : `vitest discover/lib` 1382 passed (1 suite non chargée : `@bellum/utils` non construit, sans lien) ; `tsc --noEmit -p apps/web` propre.
Déjà rouge sans mes changements : `test_discover_request_reading.py::test_a_slow_place_lookup…` (réseau).

## Questions ouvertes

Louis : fusion d'affichage des entités d'une même marque (Décathlon) ? Libellé exact du filtre coché en démo (issue #4746, « À préciser »).
