"""#3668.7-.8 — la règle de sélection tenue après le modèle, et la couverture honnête."""

from __future__ import annotations

from app.services.signal_coverage import signal_coverage
from app.services.signal_layers import layer_signals
from app.services.signal_selection import select_signals

T = "Alpha Rail"


def _sig(text: str, **kw: str) -> dict[str, str]:
    return {"signal": text, "type": kw.pop("type", "projet"), "date": kw.pop("date", "2026-03"), "source": kw.pop("source", "Presse"), **kw}


def test_programme_general_sans_chantier_est_du_contexte() -> None:
    out, rep = select_signals([_sig("Alpha Rail lance son programme Climat Ambition 2026-2030")], target=T)
    assert out[0]["selectionRole"] == "context" and "Programme général" in out[0]["selectionReason"]
    assert rep["context"] == 1


def test_programme_avec_chantier_nomme_reste_une_piste() -> None:
    out, _ = select_signals([_sig("Alpha Rail : programme Climat, appel d'offres lot 3 migration cloud")], target=T)
    assert out[0]["selectionRole"] == "lead"


def test_budget_global_n_est_pas_une_enveloppe_accessible() -> None:
    out, _ = select_signals([_sig("Alpha Rail annonce 4 milliards d'euros d'investissement", type="budget")], target=T)
    assert out[0]["selectionRole"] == "context" and "Budget global" in out[0]["selectionReason"]


def test_signal_defavorable_jamais_retrograde() -> None:
    out, _ = select_signals([_sig("Alpha Rail : réorganisation, plan Ambition 2026-2030 gelé", type="restructuration")], target=T)
    assert out[0]["selectionRole"] == "lead"


def test_autre_entite_nommee_sans_la_cible_est_contexte_mais_conservee() -> None:
    out, rep = select_signals(
        [_sig("Beta Logistique recrute 40 ingénieurs"), _sig("Alpha Rail et Beta Logistique signent un marché")],
        target=T,
        other_entities=["Beta Logistique", "Alpha Rail Holding"],
    )
    assert out[0]["entityMatch"] == "other_entity" and out[0]["selectionRole"] == "context"
    assert out[1]["entityMatch"] == "target" and out[1]["selectionRole"] == "lead"
    assert len(out) == 2 and rep["otherEntity"] == 1


def test_absence_de_nom_ne_condamne_pas() -> None:
    out, _ = select_signals([_sig("Recrutement de 12 ingénieurs systèmes")], target=T, other_entities=["Beta Logistique"])
    assert out[0]["entityMatch"] == "unverified" and out[0]["selectionRole"] == "lead"


def test_doublons_fusionnes_sources_additionnees() -> None:
    a = _sig("Alpha Rail recrute 30 ingénieurs systèmes embarqués", source="Les Echos", type="recrutement")
    b = _sig("Alpha Rail recrute 30 ingénieurs systèmes embarqués.", source="APEC", type="recrutement")
    out, rep = select_signals([a, b], target=T)
    assert len(out) == 1 and rep["duplicatesMerged"] == 1 and out[0]["source"] == "Les Echos · APEC"


def test_projet_industriel_non_reecrit_en_projet_it() -> None:
    sig = _sig("Alpha Rail : ligne d'assemblage de bogies, recrutement ingénieurs mécanique", type="recrutement")
    out, _ = select_signals([sig], target=T)
    assert out[0]["signal"] == sig["signal"] and out[0]["type"] == "recrutement"


def test_contexte_passe_apres_les_pistes_dans_les_couches() -> None:
    sigs = [{**_sig("Programme Climat général"), "selectionRole": "context", "freshness": "current"},
            {**_sig("Appel d'offres lot 2", type="achat"), "selectionRole": "lead", "freshness": "current"}]
    layers = layer_signals(sigs)
    assert layers["visible"][0]["selectionRole"] == "lead"


def test_couverture_trois_etats() -> None:
    assert signal_coverage(2, [])["status"] == "found"
    assert signal_coverage(0, [])["status"] == "none_found"
    cov = signal_coverage(0, [{"source": "brave_news", "reason": "timeout"}, {"source": "firecrawl", "reason": "x"}])
    assert cov["status"] == "incomplete" and [u["source"] for u in cov["unreachable"]] == ["brave_news"]
    assert "brave_news" not in cov["consulted"]
