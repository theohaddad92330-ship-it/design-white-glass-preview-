"""#4070.5 — LE JUGE REJETTE UN FAIT ANCIEN PRÉSENTÉ COMME RÉCENT ET TOUTE SOURCE NOMMÉE.

Déterministe, zéro appel Claude (le juge reste hermétique). Il SIGNALE, ne réécrit
jamais, ne supprime jamais. Chaque règle a son test qui sait dire NON : un fait
récent n'est pas accusé, un fait ancien daté n'est pas accusé, un registre public
cité comme un mot ordinaire ne l'est pas non plus."""

from __future__ import annotations

import copy

import pytest

from app.graph.judge import build_verdict

OLD_NEED = {"kind": "need", "label": "Migration paie cloud", "date": "2025-08-12", "age_days": 426}
FRESH_NEED = {"kind": "need", "label": "Refonte du portail achats", "date": "2026-10-01", "age_days": 11}
SOURCED = {
    "businessDescription": "Banque",
    "sector": "Banque",
    "sources": {"tags": {"sector": "PUBLIC"}, "citations": {}},
    "confidence": {"score": 80},
}
CONTACTS = [{"fullName": "Hélène Bernard", "title": "DSI"}]


def _state(plan_texts: list[str], facts: list[dict] | None = None) -> dict:
    state = {
        "research": SOURCED,
        "classified_contacts": CONTACTS,
        "plan": {
            "actionPlan": {"strategy": "S", "phases": []},
            "nextActions": [{"action": "Appeler", "rationale": t} for t in plan_texts],
        },
        "gate": {"decision": "go", "score": 3},
    }
    if facts is not None:
        state["account_facts"] = facts
    return state


def _types(verdict: dict) -> list[str]:
    return [i["type"] for i in verdict["issues"]]


# ── un fait ancien présenté comme récent ─────────────────────────────────────


def test_un_fait_ancien_presente_comme_recent_est_rejete():
    verdict = build_verdict(
        _state(["Le besoin de migration paie cloud est récent : appelez la DSI cette semaine."], [OLD_NEED])
    )
    stale = [i for i in verdict["issues"] if i["type"] == "stale_fact_as_recent"]
    assert stale and stale[0]["severity"] == "critical"
    assert "Migration paie cloud" in stale[0]["detail"] and "il y a 14 mois" in stale[0]["detail"]
    assert verdict["passed"] is False


def test_NON_un_fait_ancien_DATE_n_est_pas_accuse():
    ok = build_verdict(
        _state(["Un besoin de migration paie cloud est apparu il y a 14 mois et revient : relancez."], [OLD_NEED])
    )
    assert "stale_fact_as_recent" not in _types(ok)
    ok_year = build_verdict(
        _state(["Le besoin de migration paie cloud, noté en 2025, reste récent à traiter."], [OLD_NEED])
    )
    assert "stale_fact_as_recent" not in _types(ok_year)


def test_NON_un_fait_recent_decrit_comme_recent_n_est_pas_accuse():
    verdict = build_verdict(
        _state(["Le besoin de refonte du portail achats est récent : appelez la DSI."], [FRESH_NEED])
    )
    assert "stale_fact_as_recent" not in _types(verdict)


def test_NON_une_phrase_sans_marqueur_de_recence_n_est_pas_accusee():
    verdict = build_verdict(_state(["Reprendre le sujet migration paie cloud avec la DSI."], [OLD_NEED]))
    assert "stale_fact_as_recent" not in _types(verdict)


def test_NON_sans_fait_aucune_accusation_de_fraicheur():
    verdict = build_verdict(_state(["Le besoin de migration paie cloud est récent."], None))
    assert "stale_fact_as_recent" not in _types(verdict)


def test_le_fait_est_reconnu_meme_paraphrase():
    verdict = build_verdict(
        _state(["Besoin tout juste apparu : la migration de la paie vers le cloud, à traiter maintenant."], [OLD_NEED])
    )
    assert "stale_fact_as_recent" in _types(verdict)


# ── une source nommée ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "text",
    [
        "Selon Pappers, le chiffre d'affaires progresse.",
        "Signal détecté par DataForge sur le secteur.",
        "D'après la mémoire marché Bellum, ce compte est observé.",
        "Contact trouvé via Apollo.",
        "Annonce relevée au BODACC.",
        "Voir l'appel d'offres du BOAMP.",
        "Offre vue sur France Travail.",
        "Profil enrichi par Dropcontact.",
        "Page lue avec Firecrawl.",
        "Résultat de Brave Search.",
    ],
)
def test_une_source_nommee_est_rejetee(text):
    verdict = build_verdict(_state([text]))
    named = [i for i in verdict["issues"] if i["type"] == "source_named"]
    assert named and named[0]["severity"] == "critical"
    assert verdict["passed"] is False


@pytest.mark.parametrize(
    "text",
    [
        "Votre CRM mentionne une affaire perdue en 2024.",
        "Annonce légale publiée au registre public il y a 3 mois.",
        "Le directeur Hunter Smith est connu de l'équipe.",
        "Un brave choix de périmètre, à valider.",
        "Une gare de chemin de fer, pas un railway tool.",
    ],
)
def test_NON_un_mot_ordinaire_ou_votre_crm_n_est_pas_une_source_nommee(text):
    assert "source_named" not in _types(build_verdict(_state([text])))


def test_NON_les_cles_techniques_de_provenance_ne_sont_pas_lues():
    state = _state(["Rien à signaler."])
    state["plan"]["nextActions"][0]["source"] = "pappers"
    state["plan"]["nextActions"][0]["provider"] = "apollo"
    assert "source_named" not in _types(build_verdict(state))


# ── forme : le juge reste un lecteur ─────────────────────────────────────────


def test_le_juge_ne_modifie_rien():
    state = _state(["Le besoin de migration paie cloud est récent, selon Pappers."], [OLD_NEED])
    before = copy.deepcopy(state)
    build_verdict(state)
    assert state == before


def test_un_dossier_propre_passe_toujours():
    verdict = build_verdict(_state(["Appeler la DSI pour cadrer le besoin."], [OLD_NEED, FRESH_NEED]))
    assert verdict["passed"] is True and verdict["issues"] == []
    assert verdict["confidence"] == 1.0


def test_les_deux_controles_sont_annonces():
    verdict = build_verdict(_state(["ok"]))
    assert verdict["checks"][-2:] == ["provenance", "freshness"]
