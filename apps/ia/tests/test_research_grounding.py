"""The grounding floor: how many dead sources make a dossier meaningless.

Two failure modes to keep apart, and the pipeline must not collapse them:

* "this source is HS" — degrade, record it, carry on. A dossier missing its
  legal registry is thinner, not false.
* "we have nothing to build on" — fail explicitly. Prompting Claude with a bare
  company name and publishing what comes back is invention, and the project
  forbids invented data outright.

The line sits at the three PRIMARY sources — web corpus (Brave), site content
(Firecrawl), legal identity (Pappers/registry). Everything else in phase 1
(news, jobs, tenders, BODACC, GitHub, INPI, DECP) decorates a dossier but
cannot constitute one, so losing all of them is not a grounding failure.
"""

from __future__ import annotations

import pytest

from app.services.research_grounding import (
    ResearchGroundingError,
    down_primary_sources,
    require_grounding,
)


# ── Which primary sources are down ────────────────────────────────────────────


def test_all_healthy_reports_nothing_down() -> None:
    assert down_primary_sources(web_hits=8, scraped_pages=4, has_registry=True) == []


def test_reports_each_dead_source_by_name() -> None:
    assert down_primary_sources(web_hits=0, scraped_pages=4, has_registry=True) == ["brave"]
    assert down_primary_sources(web_hits=8, scraped_pages=0, has_registry=True) == ["firecrawl"]
    assert down_primary_sources(web_hits=8, scraped_pages=4, has_registry=False) == ["pappers"]


def test_reports_several_dead_sources_in_a_stable_order() -> None:
    assert down_primary_sources(web_hits=0, scraped_pages=0, has_registry=True) == [
        "brave",
        "firecrawl",
    ]


# ── The threshold itself ──────────────────────────────────────────────────────


def test_healthy_run_passes() -> None:
    require_grounding(web_hits=8, scraped_pages=4, has_registry=True)


def test_exhausted_registry_alone_never_fails_the_analysis() -> None:
    """The live case that motivated this: the Pappers key hit its credit
    ceiling and returned 401 on every call. Brave + Firecrawl were healthy, so
    the dossier is still grounded — failing here would take the whole product
    down over one provider's billing problem."""
    require_grounding(web_hits=8, scraped_pages=4, has_registry=False)


def test_two_of_three_down_still_passes() -> None:
    """One surviving primary source is thin but real: a registry-only dossier
    still states facts that came from somewhere."""
    require_grounding(web_hits=0, scraped_pages=0, has_registry=True)
    require_grounding(web_hits=0, scraped_pages=0, has_registry=True)


def test_all_three_down_fails_explicitly() -> None:
    """Zero grounding. Claude would be prompted with a bare company name, so
    every fact in the output would come from training recall — invented."""
    with pytest.raises(ResearchGroundingError) as excinfo:
        require_grounding(web_hits=0, scraped_pages=0, has_registry=False)
    assert excinfo.value.down == ["brave", "firecrawl", "pappers"]


# ── The message names the real cause ──────────────────────────────────────────


def test_message_names_the_dead_sources() -> None:
    """``error_message`` has to be actionable. "research failed" tells the user
    nothing; naming WHICH NATURE of source is dead tells them whether a key
    needs recharging — without naming the fournisseur (#4074, nos fournisseurs
    ne se nomment jamais)."""
    err = ResearchGroundingError(["brave", "firecrawl", "pappers"])
    assert "la recherche web" in err.user_message
    assert "le contenu des sites" in err.user_message
    assert "le registre légal" in err.user_message
    # #4074.2 (13/10) — ce message devient `account.error_message`, donc écran
    # réel (AccountDetailStatusBanners) : aucun nom de fournisseur n'y survit.
    for brand in ("Brave", "Firecrawl", "Pappers"):
        assert brand not in err.user_message
    # str() is what ``_fail`` falls back to — it must carry the same copy.
    assert str(err) == err.user_message


def test_error_carries_a_stable_machine_code() -> None:
    assert ResearchGroundingError(["brave"]).code == "RESEARCH_NO_GROUNDING"


# ── Ce que la recette du 26/08 a trouvé sur PREVOIR (#1107, #1108, #1109) ─────
#
# Trois analyses de suite ont échoué sur RESEARCH_NO_GROUNDING pour une société
# que le registre libre connaît parfaitement (« PREVOIR VIE GROUPE PREVOIR »,
# SIREN 343286183). Le testeur en a conclu « réseau et/ou lien KO » — il n'avait
# aucun moyen de savoir mieux, puisque le message nommait trois fournisseurs
# dont deux n'étaient pas en cause.
#
# Le SEUIL (« zéro preuve n'est entrée dans le prompt ») était juste. Ce sont
# ses trois ENTRÉES qui étaient mal mesurées.


def test_gateway_hits_count_as_web_grounding() -> None:
    """Défaut n°2 : la Data Gateway (Serper → Tavily → Brave) est récoltée
    APRÈS le plancher, alors que ses hits sont ajoutés au bloc web du prompt.

    Un run avec dix résultats Serper et zéro résultat Brave mourait donc en
    annonçant qu'« aucune source n'a répondu » — pendant que dix sources
    avaient répondu.
    """
    require_grounding(web_hits=10, scraped_pages=0, has_registry=False)


def test_firecrawl_is_not_named_when_it_had_nothing_to_read() -> None:
    """Défaut n°3 : Firecrawl scrape les URL que Brave a rendues.

    Zéro hit web ⇒ zéro URL ⇒ zéro page, mécaniquement. Compter Firecrawl comme
    un fournisseur mort DANS CE CAS envoie l'utilisateur vérifier une clé qui
    n'a jamais été appelée. Le compte, lui, ne change pas : rien n'est entré
    dans le prompt, le run doit toujours échouer.
    """
    with pytest.raises(ResearchGroundingError) as excinfo:
        require_grounding(web_hits=0, scraped_pages=0, has_registry=False, firecrawl_had_urls=False)
    assert excinfo.value.down == ["brave", "firecrawl", "pappers"]
    assert excinfo.value.not_asked == ["firecrawl"]
    # Le message DIT la différence, sinon la correction reste invisible à l'écran.
    assert "aucune URL à lire" in excinfo.value.user_message
    # Et il n'envoie plus vérifier le quota d'un fournisseur jamais appelé.
    assert "le contenu des sites" not in excinfo.value.user_message.split("Vérifiez")[-1]


def test_firecrawl_is_named_when_it_was_asked_and_produced_nothing() -> None:
    """Le cas symétrique : des URL existaient, Firecrawl n'a rien rendu. Là,
    c'est bien lui qu'il faut aller regarder."""
    with pytest.raises(ResearchGroundingError) as excinfo:
        require_grounding(web_hits=0, scraped_pages=0, has_registry=False, firecrawl_had_urls=True)
    assert excinfo.value.not_asked == []
    assert "aucune URL à lire" not in excinfo.value.user_message
