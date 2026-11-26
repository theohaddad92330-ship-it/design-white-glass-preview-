"""#2631.1 — le plancher de rôles : le gate voit CE compte-là, pas la moyenne.

DÉCISION LOUIS 21/09/2026 (#2631.1, doctrine `c77_gate_qualite_ia_bloque_sur_role_cle`) :
une moyenne qui monte peut cacher la perte d'un rôle sur un seul compte nommé.
Le banc mesurait la régression en MOYENNE (`compare_to_baseline`) ; il mesure
désormais AUSSI, par compte de référence, que chaque rôle clé déclaré reste
couvert.

Ce que cette suite tient, et pourquoi chacun :

1. **Dire NON** — retirer l'acheteur d'un dossier de référence fait échouer le
   plancher, et le message NOMME le compte et le rôle (pas un écart chiffré).
2. **Ne pas crier au loup** — un dossier sans AUCUN contact n'a pas « perdu »
   ses rôles : il n'a pas pu être évalué. GA-18/GA-19 : « non mesuré » n'est
   jamais « 0 », et un axe non évaluable sort du dénominateur.
3. **Refuser de passer à vide** — si rien n'a été lu, « aucun rôle perdu » est
   VRAI et le vert serait faux. Le verdict porte un compteur de ce qu'il a
   réellement lu et échoue quand il vaut zéro.
4. **Lire quelque chose de réel** — le plancher est relu depuis les fichiers
   `golden/*.json` committés et rejoué sur les fixtures committées, jamais
   depuis une liste recopiée dans le test.
5. **Aucun compte muet** — un golden sans plancher déclaré est NOMMÉ, il ne
   passe pas en silence (le trou exact que LOT C-5b a déjà payé sur la baseline).

Hermétique : que des fixtures committées, zéro réseau.
"""

from __future__ import annotations

import copy

from app.eval.golden import list_goldens, load_golden, resolve_analysis
from app.eval.metrics import evaluate
from app.eval.role_floor import (
    ROLE_FLOOR_KEY,
    account_role_floor,
    check_role_floor,
    declared_floor,
)

# Les cinq comptes NOMMÉS par la décision #2631.1.
COMPTES_NOMMES = ("decathlon", "accor", "carrefour", "axa", "cacib")


def _paire(slug: str):
    golden = load_golden(slug)
    return golden, resolve_analysis(golden)


def _sans_role(analysis: dict, fragment_de_titre: str) -> dict:
    """Le dossier privé du contact dont le titre contient ``fragment_de_titre``."""
    out = copy.deepcopy(analysis)
    out["classified_contacts"] = [
        c
        for c in (out.get("classified_contacts") or [])
        if fragment_de_titre.lower() not in str(c.get("title", "")).lower()
    ]
    return out


# ── 1. la garde sait dire NON ────────────────────────────────────────────────


def test_un_role_cle_qui_disparait_fait_echouer_le_plancher() -> None:
    golden, analysis = _paire("accor")
    ampute = _sans_role(analysis, "Achats")

    verdict = check_role_floor([(golden, ampute)])

    assert not verdict.passed()
    assert verdict.lost_pairs() == (("accor", "procurement"),)
    # Le message nomme le COMPTE et le RÔLE, pas un écart chiffré : quelqu'un
    # qui lit la CI à 2 h du matin doit savoir quoi regarder.
    message = "\n".join(verdict.problems)
    assert "Accor" in message
    assert "Acheteur" in message
    assert "disparu" in message
    assert "0." not in message  # aucun score nu dans le message d'échec


def test_une_moyenne_INCHANGEE_cache_un_siege_perdu_et_le_plancher_le_voit() -> None:
    """LA démonstration de #2631.1, mesurée sur le corpus committé.

    On ÉCHANGE le siège « Acheteur » d'Accor contre un « Décideur budget » :
    la métrique ``buying_committee`` compte toujours 2 sièges clés sur 5, donc
    son score et l'agrégat du compte ne bougent pas d'un millième — la
    comparaison à la baseline reste VERTE. Le plancher, lui, dit NON et nomme
    le siège parti.
    """
    golden, analysis = _paire("accor")
    permute = copy.deepcopy(analysis)
    for contact in permute["classified_contacts"]:
        if "Achats" in str(contact.get("title", "")):
            contact["title"] = "Directrice Financière"
            contact["decisionRole"] = "economic"

    avant = evaluate(analysis, golden.as_expectations())
    apres = evaluate(permute, golden.as_expectations())

    # Le banc agrégé ne voit RIEN.
    assert apres.aggregate() == avant.aggregate()
    assert apres.by_name()["buying_committee"].score == avant.by_name()["buying_committee"].score

    # Le plancher, si.
    verdict = check_role_floor([(golden, permute)])
    assert verdict.lost_pairs() == (("accor", "procurement"),)
    assert not verdict.passed()


def test_la_moyenne_qui_monte_ne_sauve_pas_un_role_perdu() -> None:
    """Le cœur de #2631.1 : le plancher ne regarde AUCUN agrégat."""
    golden, analysis = _paire("carrefour")
    ampute = _sans_role(analysis, "Chief Technology Officer")

    floor = account_role_floor(golden, ampute)

    assert floor.lost == ("technical_buyer",)
    assert floor.covered == ("procurement",)
    # Il reste un rôle couvert sur deux : une moyenne dirait « 0,5, ça passe ».
    assert floor.score() == 0.5
    assert not floor.passed()


# ── 2. « non évaluable » n'est PAS « perdu » (GA-18 / GA-19) ─────────────────


def test_un_dossier_sans_contact_na_pas_perdu_ses_roles() -> None:
    golden, analysis = _paire("axa")
    vide = copy.deepcopy(analysis)
    vide["classified_contacts"] = []

    floor = account_role_floor(golden, vide)

    assert floor.lost == ()  # rien n'a été perdu : rien n'a pu être évalué
    assert floor.unevaluable == floor.expected
    assert floor.evaluable is False
    # « Non mesuré » n'est JAMAIS « 0 » (GA-18).
    assert floor.score() is None


def test_un_dossier_non_evaluable_est_nomme_et_ne_passe_pas_en_silence() -> None:
    golden, analysis = _paire("axa")
    vide = copy.deepcopy(analysis)
    vide["classified_contacts"] = []

    verdict = check_role_floor([(golden, vide)])

    assert not verdict.passed()
    message = "\n".join(verdict.problems)
    assert "AXA" in message
    assert "NON ÉVALUABLE" in message
    assert "disparu" not in message  # surtout pas « rôle perdu »


def test_un_role_non_evaluable_sort_du_denominateur() -> None:
    """GA-19 : le dénominateur ne compte que ce qui a pu être évalué."""
    golden, analysis = _paire("cacib")
    floor = account_role_floor(golden, analysis)

    assert floor.unevaluable == ()
    assert floor.score() == 1.0
    assert floor.evaluable is True


# ── 3. la garde refuse de passer à vide ──────────────────────────────────────


def test_le_plancher_echoue_quand_il_na_rien_lu() -> None:
    verdict = check_role_floor([])

    assert verdict.roles_checked == 0
    assert not verdict.passed()
    assert any("AUCUN rôle" in p for p in verdict.problems)


def test_le_plancher_echoue_quand_le_corpus_ne_declare_rien() -> None:
    """Un jeu de référence chargé mais sans plancher déclaré ne garde rien."""
    golden, analysis = _paire("accor")
    muet = type(golden)(slug=golden.slug, company=golden.company, expect={}, fixture=golden.fixture)

    verdict = check_role_floor([(muet, analysis)])

    assert not verdict.passed()
    assert verdict.undeclared == ("accor",)
    assert verdict.roles_checked == 0
    assert any(ROLE_FLOOR_KEY in p for p in verdict.problems)


# ── 4 & 5. la garde LIT le corpus committé, et aucun compte n'est muet ───────


def test_chaque_compte_nomme_declare_son_plancher() -> None:
    lus = 0
    for slug in COMPTES_NOMMES:
        attendus = declared_floor(load_golden(slug))
        assert attendus, f"{slug} : aucun plancher de rôles déclaré"
        lus += len(attendus)
    # Le compteur : une boucle sur une liste vide serait verte sans rien lire.
    assert lus >= 2 * len(COMPTES_NOMMES)


def test_aucun_golden_du_depot_nest_sans_plancher() -> None:
    goldens = list_goldens()
    assert len(goldens) >= len(COMPTES_NOMMES)
    muets = [g.slug for g in goldens if not declared_floor(g)]
    assert muets == []


def test_le_corpus_committe_passe_le_plancher_aujourdhui() -> None:
    """Le relevé positif : sur le dépôt tel qu'il est, le plancher est vert —
    sinon le rouge des autres tests ne prouverait rien."""
    paires = [(g, resolve_analysis(g)) for g in list_goldens()]
    verdict = check_role_floor(paires)

    assert verdict.problems == ()
    assert verdict.passed()
    assert verdict.accounts_read == len(paires)
    assert verdict.roles_checked >= 2 * len(COMPTES_NOMMES)


def test_un_role_inconnu_dans_le_plancher_est_refuse() -> None:
    """Un rôle mal orthographié serait « perdu » à jamais : on le nomme."""
    golden, analysis = _paire("accor")
    faute = type(golden)(
        slug=golden.slug,
        company=golden.company,
        expect={ROLE_FLOOR_KEY: ["technical_buyerr"]},
        fixture=golden.fixture,
    )

    verdict = check_role_floor([(faute, analysis)])

    assert not verdict.passed()
    assert any("inconnu" in p for p in verdict.problems)
