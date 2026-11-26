"""L'axe PREUVE du barème ``angles`` — et la preuve qu'il sait dire NON.

Le barème /100 de BELLUM-STRATEGY annonçait dans sa propre docstring qu'il
mesurait « un ANGLE = un PLAY (PROMESSE + PREUVE + ACTION) ». Il mesurait
l'ACTION (``_ACTION_MARKERS``), l'offre (``_SCOPE_RE``), le chiffrage — et
**jamais la PREUVE**, qui n'était même pas un champ. Une grille ne peut pas
noter ce qui n'a pas de nom : c'est le motif « une garde protège une règle, elle
ne l'invente pas », appliqué à un barème.

Ce fichier tient les quatre propriétés qui rendent l'axe utile :

* il **sait dire NON** — deux sorties également plausibles et bien formées, dont
  une seule cite une référence que l'ESN a déclarée, et c'est l'AXE concerné qui
  sanctionne, pas seulement le total ;
* il **note la preuve inventée sous le blanc** — l'ordre est
  ``mobilisable > absent > non_verifiable``, et cet ordre est le cœur de la
  règle : un blanc coûte une phrase, un nom de client inventé coûte le compte ;
* un axe **non mesurable sort du dénominateur** — une capture ancienne, sans
  verdict, note exactement ce qu'elle notait avant, au millième ;
* il **LIT vraiment un corpus** — le barème est confronté à la sortie que le
  gate produit réellement, pas à des dictionnaires écrits à la main qui
  pourraient dériver de la vraie forme.
"""

from __future__ import annotations

from app.eval.strategy.rubric import BAND_POINTS, MAX_SCORE, score_strategy
from app.services.angle_proof_gate import (
    PROOF_ABSENT,
    PROOF_MOBILISABLE,
    PROOF_UNVERIFIABLE,
    apply_proof_gate,
)

PROFILE = {"references": ["Decathlon", "Groupe SEB"]}


def _angle(proof: str, i: int = 0) -> dict:
    """Un play COMPLET par ailleurs : seule la preuve varie d'un cas à l'autre."""
    return {
        "title": f"Play {i}",
        "strategy": "PROMESSE: réduire le lead time de 30%. ACTION: atelier de cadrage 45 min.",
        "entryContactPersona": "Directeur Études BU Logistique",
        "specificOffer": "Audit SI logistique — 3 consultants, 4 semaines",
        "estimatedDealSize": "150-250K EUR sur 12 mois",
        "prerequisites": "Valider le sponsor budget",
        "proof": proof,
    }


def _payload(angles: list[dict]) -> dict:
    return {"research": {"angles": angles}}


def _band(angles: list[dict]):
    return score_strategy(_payload(angles)).by_name()["angles"]


# ── le barème reste un /100 ──────────────────────────────────────────────────


def test_le_bareme_somme_toujours_a_cent():
    """Les 6 points de la PREUVE sont PRÉLEVÉS sur les sous-axes du bloc, pas
    ajoutés : le total publié ne bouge pas."""
    assert sum(BAND_POINTS.values()) == MAX_SCORE == 100.0
    assert BAND_POINTS["angles"] == 35.0


# ── il sait dire NON ─────────────────────────────────────────────────────────


def test_une_preuve_inventee_est_sanctionnee_sur_l_axe_qui_la_concerne():
    """Les deux sorties sont également bien formées : mêmes six champs, même
    ACTION, même offre périmétrée, même chiffrage. SEULE la preuve diffère."""
    bonne = apply_proof_gate([_angle("Mission menée chez Decathlon", i) for i in range(3)], PROFILE)
    fautive = apply_proof_gate([_angle("Mission menée chez Carrefour", i) for i in range(3)], PROFILE)

    b, f = _band(bonne), _band(fautive)

    # L'axe concerné, d'abord — jamais seulement le total.
    assert b.data["proof_mobilisable"] == 3
    assert f.data["proof_unverifiable"] == 3
    # …et il coûte réellement des points : 6 pts d'écart sur 3 plays.
    assert b.points - f.points == 6.0
    # Les autres sous-axes n'ont pas bougé : la sanction est ciblée.
    for axis in ("complete", "with_action", "scoped_offer", "figured_size"):
        assert b.data[axis] == f.data[axis], axis


def test_une_preuve_inventee_note_SOUS_un_champ_vide():
    """L'ordre qui porte toute la règle. Un barème qui récompenserait un champ
    « rempli » pousserait exactement dans le mauvais sens."""
    mobilisable = _band(apply_proof_gate([_angle("chez Groupe SEB")], PROFILE)).points
    absent = _band(apply_proof_gate([_angle("")], PROFILE)).points
    invente = _band(apply_proof_gate([_angle("chez Carrefour")], PROFILE)).points

    assert mobilisable > absent > invente


def test_le_detail_nomme_ce_qui_n_a_pas_ete_evalue():
    """Un score n'est jamais nu : ce qui n'a pas pu être évalué est NOMMÉ."""
    detail = _band(apply_proof_gate([_angle("chez Carrefour")], PROFILE)).detail
    assert "non vérifiable" in detail


# ── un axe non mesurable sort du dénominateur ────────────────────────────────


def test_une_capture_sans_verdict_note_exactement_comme_avant():
    """Le cas qui protège l'A/B : une capture ancienne n'a pas de verdict. Elle
    ne doit pas encaisser un zéro — « non mesuré » n'est jamais « 0 » — et les
    autres axes ne doivent pas bouger d'un millième."""
    non_estampilles = [_angle("Mission menée chez Decathlon", i) for i in range(3)]
    band = _band(non_estampilles)

    assert band.data["proof_measured"] is False
    assert "NON MESURÉE" in band.detail
    # 8 (compte) + 27 (les quatre sous-axes, tous pleins, redistribués) = 35.
    assert band.points == 35.0


def test_un_axe_hors_denominateur_ne_deplace_pas_les_autres():
    """Les sous-axes gardent leurs PROPORTIONS quand la preuve sort.

    L'ACTION pèse 6 des 21 points restants ; après redistribution elle pèse
    7,714 des 27 — la MÊME fraction, 6/21. Un play qui rate l'ACTION perd donc
    exactement la même part du bloc, que la preuve ait été mesurée ou non.
    C'est ce qui garde l'A/B comparable entre une capture ancienne et une neuve.
    """
    rate_l_action = [dict(_angle("Mission menée chez Decathlon", i)) for i in range(3)]
    for a in rate_l_action:
        a["strategy"] = "Proposer du staffing data engineers."

    band = _band(rate_l_action)  # aucun verdict → preuve hors dénominateur
    assert band.data["proof_measured"] is False
    # 8 pts de compte + les 27 pts du bloc, moins la fraction 6/21 de l'ACTION.
    assert band.points == round(8.0 + 27.0 * (1 - 6.0 / 21.0), 2)


def test_un_seul_play_estampille_suffit_a_rendre_l_axe_mesurable():
    """Sinon un modèle qui oublie le champ sur deux plays sur trois échapperait
    à l'axe entier."""
    melange = apply_proof_gate([_angle("chez Decathlon")], PROFILE) + [_angle("chez Carrefour", 2)]
    band = _band(melange)
    assert band.data["proof_measured"] is True
    assert band.data["proof_stamped"] == 1


# ── il LIT vraiment ce que le gate produit ───────────────────────────────────


def test_le_corpus_note_est_celui_que_le_gate_rend_vraiment():
    """La garde qui empêche ce fichier d'être borgne : les entrées ne sont pas
    des dictionnaires écrits à la main, elles SORTENT du gate expédié. Si le
    gate changeait le nom de son champ, ce test rougirait — au lieu de continuer
    à noter une forme qui n'existe plus."""
    stamped = apply_proof_gate(
        [_angle("chez Decathlon", 0), _angle("chez Carrefour", 1), _angle("", 2)], PROFILE
    )
    assert [a["proof_status"] for a in stamped] == [
        PROOF_MOBILISABLE,
        PROOF_UNVERIFIABLE,
        PROOF_ABSENT,
    ]
    band = _band(stamped)
    assert band.data["proof_stamped"] == 3
    assert band.data["proof_mobilisable"] == 1
    assert band.data["proof_unverifiable"] == 1
