"""#5 : presse/offres IT/BODACC injectées dans les prompts (le #1 gain pertinence).
Collectées mais jamais vues du LLM — ici on teste le rendu du bloc daté + son
branchement dans les prompts signals/strategy."""

from __future__ import annotations

from app.prompts import bellum_signals, bellum_strategy
from app.services.dated_signals import render_dated_signals


def test_render_empty_when_nothing():
    assert render_dated_signals(None, None, None) == ""
    assert render_dated_signals([], [], []) == ""
    # entrées non-dict / sans titre ignorées → vide
    assert render_dated_signals(["x"], [{"foo": 1}], [{"tribunal": "Paris"}]) == ""


def test_render_news_jobs_legal_dated():
    news = [{"title": "VINCI signe un contrat cloud", "age": "2 days ago", "description": "migration SAP"}]
    jobs = [{"title": "Ingénieur DevOps", "location": "Paris", "date": "2026-06-30T10:00", "skills": ["Kubernetes", "Terraform"]}]
    legal = [{"date": "2026-05-01", "type": "Modification", "label": "changement de dirigeant"}]
    out = render_dated_signals(news, jobs, legal)
    # presse : titre + âge
    assert "VINCI signe un contrat cloud" in out and "2 days ago" in out
    # offre : intitulé + date + stack (signal recrutement)
    assert "Ingénieur DevOps" in out and "2026-06-30" in out and "Kubernetes" in out
    # légal : date + type + label
    assert "Modification" in out and "changement de dirigeant" in out and "2026-05-01" in out
    # les 3 sections présentes
    assert "PRESSE RÉCENTE" in out and "OFFRES D'EMPLOI IT" in out and "ÉVÉNEMENTS LÉGAUX" in out


# #2289.13 — NO-GO : une actualité générique et ancienne ne se présente jamais
# comme "récente" (fabrication d'urgence).
def test_no_go_stale_news_excluded_from_recente():
    news = [
        {"title": "Actualité fraîche", "age": "2 days ago"},
        {"title": "Vieille dépêche relancée", "age": "3 years ago"},
    ]
    out = render_dated_signals(news, [], [])
    assert "Actualité fraîche" in out
    assert "Vieille dépêche relancée" not in out
    assert "PRESSE RÉCENTE" in out


def test_no_go_all_stale_drops_press_section_entirely():
    news = [{"title": "Vieille dépêche", "age": "5 years ago"}]
    out = render_dated_signals(news, [], [])
    assert out == ""
    assert "PRESSE RÉCENTE" not in out


def test_no_go_undated_news_is_not_treated_as_stale():
    # Absence d'âge ≠ ancienneté prouvée : on ne retire jamais un signal sur
    # une absence d'information (doctrine : une absence n'est jamais un 0).
    news = [{"title": "Sans âge connu"}]
    out = render_dated_signals(news, [], [])
    assert "Sans âge connu" in out


def test_render_caps_items():
    news = [{"title": f"news {i}"} for i in range(20)]
    out = render_dated_signals(news, [], [], max_items=6)
    assert out.count("] news") == 6


def test_render_default_cap_is_twenty():
    # #3885 — le cap par défaut du bloc daté est 20 items par source (était 8)
    # (news / jobs / legal). Les marchés publics gardent leurs mins (5 / 4).
    news = [{"title": f"news {i}"} for i in range(30)]
    jobs = [{"title": f"job {i}"} for i in range(30)]
    out = render_dated_signals(news, jobs, [])
    assert out.count("] news") == 20
    assert out.count("] job") == 20


def test_render_public_tenders_block():
    tenders = [
        {
            "title": "Infogérance du système d'information",
            "buyer": "Mairie de Lyon",
            "location": "Rhône",
            "publishedDate": "2026-06-15",
            "deadline": "2026-07-30",
            "cpv": "72000000",
        }
    ]
    out = render_dated_signals([], [], [], tenders)
    # section + date + buyer + location + title + échéance
    assert "MARCHÉS PUBLICS IT" in out
    assert "Infogérance du système d'information" in out
    assert "Mairie de Lyon" in out and "Rhône" in out
    assert "2026-06-15" in out
    assert "échéance 2026-07-30" in out


def test_render_public_tenders_caps_at_five():
    tenders = [{"title": f"marché {i}", "publishedDate": "2026-06-01"} for i in range(10)]
    out = render_dated_signals([], [], [], tenders)
    assert out.count("] marché") == 5


def test_render_jobs_shows_contract_type():
    jobs = [{"title": "Ingénieur DevOps", "location": "75 - Paris", "date": "2026-06-30", "contractType": "CDI", "skills": ["Kubernetes"]}]
    out = render_dated_signals([], jobs, [])
    assert "Ingénieur DevOps" in out and "CDI" in out and "75 - Paris" in out


def test_render_awarded_contracts_block():
    awarded = [
        {
            "title": "Développement d'une application métier",
            "buyer": "Mairie de Lyon",
            "winner": "Capgemini",
            "location": "Rhône",
            "notifiedDate": "2026-05-20",
        }
    ]
    # 5th positional param — backward-compatible with existing call sites.
    out = render_dated_signals([], [], [], None, awarded)
    assert "MARCHÉS ATTRIBUÉS" in out
    assert "Développement d'une application métier" in out
    assert "Mairie de Lyon" in out and "Capgemini" in out and "Rhône" in out
    assert "2026-05-20" in out


def test_render_awarded_caps_at_four():
    awarded = [{"title": f"marché attribué {i}", "notifiedDate": "2026-06-01"} for i in range(10)]
    out = render_dated_signals([], [], [], None, awarded)
    assert out.count("] marché attribué") == 4


def test_signals_prompt_injects_dated_block_only_when_present():
    with_block = bellum_signals.build_user_prompt("VINCI", "[]", "", "{}", dated_signals="PRESSE : X")
    assert "signaux_dates" in with_block and "PRESSE : X" in with_block
    without = bellum_signals.build_user_prompt("VINCI", "[]", "", "{}")
    assert "signaux_dates" not in without


def test_strategy_prompt_injects_dated_block_only_when_present():
    with_block = bellum_strategy.build_user_prompt("VINCI", "[]", "", "{}", dated_signals="OFFRE : Y")
    assert "signaux_dates" in with_block and "OFFRE : Y" in with_block
    without = bellum_strategy.build_user_prompt("VINCI", "[]", "", "{}")
    assert "signaux_dates" not in without
