"""#2257.44/.45/.46/.48 — reste du 25/09/2026 (feat/reste-2257-bis-25-09).

Ces quatre points du registre (`.claude/notes/registre-2026-09-17-lau-002-2257.md`)
étaient bloqués par la MÊME tension : le corpus de recette (#2257.38-43,
`intent_corpus.json`) étiquette `expected_intention_principale` sur un
vocabulaire LIBRE écrit à la main (ex. ``"conseil_sur_compte"``), pendant que
le routeur d'intention (#2321, ``intent_router.py``) ne produit QUE dix
valeurs FERMÉES (``CHAT_INTENT_KINDS``). Comparer les deux aurait comparé deux
vocabulaires différents.

RÈGLE DU DÉPÔT du 22/09/2026 (Louis) : plus aucune question produit, on
applique la recommandation déjà écrite au registre. Donc : le vocabulaire
fermé du routeur devient l'UNIQUE référence, et chaque étiquette libre du
corpus est ré-étiquetée dessus — ``"autre"`` quand aucune des dix ne convient.

Le MAPPING ÉCRIT (étiquette libre du corpus → valeur fermée du routeur), une
fois pour toutes, DANS L'ORDRE où les étiquettes apparaissent au corpus :

    conseil_sur_compte          -> information_client   (qualifier un signal/topo sur un compte nommé)
    brief_avant_rdv              -> information_client   (même famille : résumé d'un compte)
    recherche_contacts           -> autre                (aucune des dix ne vise l'objet "contact")
    plan_action                  -> autre                (plan sur UN compte nommé, hors diagnostic-portefeuille)
    comparaison_comptes          -> autre                (comparaison de deux comptes existants, absente des dix)
    definition_exclusions        -> autre                (#2257.11 : aucun producteur d'exclusions générique)
    diagnostic_relation          -> autre                (diagnostic RELATIONNEL, absent des dix)
    redaction_message            -> autre                (rédaction seule = étape terminale du pipeline, pas une intention)
    shortlist_vivier              -> proposer             (marqueur "shortlist" explicite)
    diagnostic_rfp                -> besoin               (marqueur "appel d'offres" explicite)
    verdict_tranche               -> autre                (verdict go/no-go sur UNE opportunité, absent des dix)
    decouverte_compte             -> information_client   (découverte/qualification d'un compte inconnu)
    preparation_approche          -> autre                (angle d'approche sur un compte CIBLÉ, absent des dix)
    orientation_generale          -> diagnostic           (marqueurs "par ou commencer"/"aide moi" explicites)
    plan_prospection              -> autre                (plan sur UN compte nommé, absent des dix)
    action_urgente                -> autre                (urgence pure, #2257.13, pas une intention métier)
    reformulation_niveau_detail   -> autre                (format/détail, #2257.14, pas une intention métier)
    qualification_besoin          -> besoin               (vérifier un budget/besoin ouvert)
    identification_blocages       -> information_client   (qualifier ce qui bloque sur un compte)
    perimetre_double              -> information_client   (qualifier deux facettes d'un même compte)
    action_suivante                -> diagnostic           (« quel geste concret » ~ "quoi faire")
    changement_de_perimetre        -> autre                (pivot de portée en conversation, pas une intention)
    correction_perimetre           -> autre                (correction de référence en conversation, pas une intention)
    action_a_planifier             -> autre                (signal d'urgence contradictoire, pas une intention)
    besoin_metier_sous_jacent      -> besoin               (#2257.20 : le besoin métier cité est un besoin)

Ce mapping est VÉRIFIÉ tourner contre le routeur réel (aucune donnée
inventée) : sur les 32 cas, seuls trois messages portent un marqueur DÉCLARÉ
au sens strict (frontière de mot) et le routeur les reconnaît — les trois
correspondent exactement à ce mapping (aucun faux déclenchement mesuré) :
``telecom-01`` -> ``proposer``, ``secteur_public-01`` -> ``besoin``,
``media-01`` -> ``diagnostic``. Les 29 autres restent ``non_declaree`` côté
routeur (langage naturel sans marqueur), ce qui EST la limite documentée du
routeur (``intent_router.py`` : « il n'invente rien »), pas un défaut de ce
lot.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.services.compilers.intent_router import (
    CHAT_INTENT_KINDS,
    CHAT_INTENT_ROUTING_TABLE,
    UNDECLARED_CHAT_INTENT,
    route_chat_intent,
)

_CORPUS_PATH = Path(__file__).resolve().parent.parent / "app" / "eval" / "chat" / "intent_corpus.json"

#: Vocabulaire fermé accepté pour `expected_intention_router` : les dix
#: valeurs du routeur, plus "autre" (aucune des dix ne couvre la demande).
_CLOSED_VOCABULARY = set(CHAT_INTENT_KINDS) | {"autre"}


def _load_cases() -> list[dict]:
    data = json.loads(_CORPUS_PATH.read_text(encoding="utf-8"))
    return data["cases"]


def test_chaque_cas_porte_une_intention_router_du_vocabulaire_ferme_du_2321():
    """#2257.44 — le champ existe et n'utilise QUE le vocabulaire fermé du
    routeur (les dix valeurs de `CHAT_INTENT_KINDS`) ou "autre"."""
    cases = _load_cases()
    for case in cases:
        assert "expected_intention_router" in case, f"{case['id']} : expected_intention_router manquant"
        assert case["expected_intention_router"] in _CLOSED_VOCABULARY, (
            f"{case['id']} : {case['expected_intention_router']!r} hors du vocabulaire fermé du routeur #2321"
        )


def test_chaque_etiquette_libre_pointe_vers_une_seule_valeur_fermee():
    """Le mapping est une FONCTION : une même étiquette libre
    (`expected_intention_principale`) ne pointe jamais vers deux valeurs
    fermées différentes selon le cas — sinon ce n'est pas un mapping écrit,
    c'est une décision ad hoc par cas."""
    cases = _load_cases()
    seen: dict[str, str] = {}
    for case in cases:
        label = case["expected_intention_principale"]
        router_value = case["expected_intention_router"]
        if label in seen:
            assert seen[label] == router_value, (
                f"étiquette {label!r} : {seen[label]!r} pour un cas, {router_value!r} pour {case['id']}"
            )
        else:
            seen[label] = router_value


def test_le_routeur_ne_se_trompe_jamais_de_route_sur_le_corpus():
    """#2257.44 / #2257.48 — À L'ÉCHELLE DU CORPUS : quand le routeur
    reconnaît un marqueur sur une demande réaliste, l'intention reconnue est
    TOUJOURS celle qu'un humain attend — jamais une redirection déclenchée à
    tort par un mot-clé isolé. Le routeur peut légitimement ne rien
    reconnaître (`non_declaree`) sur du langage naturel sans marqueur ; ce
    test ne l'exige jamais, il interdit seulement le faux déclenchement."""
    cases = _load_cases()
    for case in cases:
        route = route_chat_intent(message=case["message"])
        if route.intent == UNDECLARED_CHAT_INTENT:
            continue
        assert route.intent == case["expected_intention_router"], (
            f"{case['id']} : routeur a rendu {route.intent!r} (marqueur {route.reasoning!r}), "
            f"attendu {case['expected_intention_router']!r}"
        )


def test_le_taux_de_reconnaissance_du_corpus_ne_regresse_pas():
    """#2257.44 — mesure de référence (pas un jugement sémantique nouveau) :
    sur ce corpus réaliste, le routeur reconnaît correctement au moins 22 des
    32 cas (19 "autre" correctement laissés `non_declaree`, 3 valeurs fermées
    correctement reconnues) — mesuré le 25/09/2026. Une régression sous ce
    plancher est un signal réel (marqueur cassé) ; un progrès (un marqueur de
    plus reconnu) fait juste remonter le plancher au prochain lot."""
    cases = _load_cases()
    correct = 0
    for case in cases:
        route = route_chat_intent(message=case["message"])
        expected = case["expected_intention_router"]
        if expected == "autre":
            if route.intent == UNDECLARED_CHAT_INTENT:
                correct += 1
        elif route.intent == expected:
            correct += 1
    assert correct >= 22, f"seulement {correct}/{len(cases)} cas correctement routés (plancher 22)"


def test_le_resultat_attendu_correspond_a_lintention_quand_reconnue():
    """#2257.46 — DÉRIVÉ, pas dupliqué (GA-26) : `resultat_attendu` est déjà
    une fonction 1-vers-1 de l'intention dans `CHAT_INTENT_ROUTING_TABLE`. Pas
    besoin d'une deuxième étiquette libre dans le corpus : quand le routeur
    reconnaît l'intention ATTENDUE, son `expected_result` doit être celui que
    la table déclare pour cette intention — sinon la table et le routeur ont
    divergé."""
    cases = _load_cases()
    checked = 0
    for case in cases:
        expected_intent = case["expected_intention_router"]
        if expected_intent == "autre":
            continue
        route = route_chat_intent(message=case["message"])
        if route.intent != expected_intent:
            continue  # couvert par test_le_routeur_ne_se_trompe_jamais_de_route_sur_le_corpus
        checked += 1
        assert route.expected_result == CHAT_INTENT_ROUTING_TABLE[expected_intent].expected_result
    assert checked >= 3, "aucun cas du corpus n'a pu vérifier la correspondance resultat_attendu/intention"
