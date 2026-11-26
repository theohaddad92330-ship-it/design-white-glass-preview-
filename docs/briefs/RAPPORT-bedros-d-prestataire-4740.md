# Rapport lot D — prestataire crédité (#4740, #4741)

Branche : claude/bedros-d-prestataire-4740 · code : 33bcee3e · base origin/main.

## Fait

- #4740 : la borne `known_esn_names()` ne filtre plus. Un prestataire hors référentiel est retenu
  si la page le crédite EXPLICITEMENT (marqueur de crédit immédiatement suivi d'un nom en majuscule).
  Certitude « moyenne » (une preuve) ; nom du référentiel inchangé, « forte ».
  Écartés : plateformes (WordPress, Wix…), pronoms/articles (« nos équipes »), noms sans marqueur, URL.
- #4741 : champs additifs `qualification` (web / infra / applicatif / tout / non_qualifie) et
  `qualificationEvidence`, lus UNIQUEMENT sur la ligne de crédit après le nom. Sans mot-preuve : `non_qualifie`.
  La qualification est aussi écrite dans `evidence` (donc visible par la note existante).
- Sous-domaines/whois toujours exclus (#3095).

## Fichiers

apps/ia/app/services/site_credit_partners.py, apps/ia/tests/test_site_credit_partners.py.
`esn_presence.py`, `actor_typology.py`, `knowledge/__init__.py` : non touchés (rien à y changer).

## Tests (réels)

Rouge d'abord : 8 failed / 9 passed. Puis : `pytest tests/test_site_credit_partners.py tests/test_provider_footprint_mentions.py` -> 27 passed. ruff check + format propres.

## Reste / questions ouvertes

- `qualification` n'est PAS persistée en colonne (`account_partners`) ni rendue en champ dédié : cela demande
  migration + API + écran, hors périmètre de fichiers. Elle voyage dans `raw_analysis.esnPresence` et dans le texte de preuve.
- Démo (règle n°9) : non modifiée, aucun nouvel écran/clé de table ; la ligne illustrative existante couvre le circuit.
  À décider : champ dédié (migration) si Louis veut afficher la qualification en badge.
- Qualifier par la page PROPRE du prestataire (objet social, références) exigerait un fetch réseau : non fait.
- Pas de tsc lancé (aucun fichier TS touché).
