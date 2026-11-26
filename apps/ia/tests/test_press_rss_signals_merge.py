"""#3917.1 — la presse RSS (datée, avec son lien) devient un SIGNAL lisible.

``pressSignals`` était écrit par la phase 1 (``press_signals``) mais aucun écran ni
aucune route ne le lisait : « presse datée visible, sans lien » en recette AE. Ils
rejoignent ``recentSignals`` avec leur date de publication et leur lien d'article.
"""

from __future__ import annotations

from app.services.data_sources.press_rss import merge_press_signals

ITEM = {
    "type": "levee",
    "title": "ACME lève 40 M€ pour accélérer sa plateforme data",
    "url": "https://www.lesechos.fr/acme-leve-40-me",
    "published_at": "2026-10-02T08:00:00+00:00",
    "source": "lesechos.fr",
    "matched_on": "siren",
}


def test_article_becomes_a_dated_linked_signal():
    out = merge_press_signals([], [ITEM])
    assert len(out) == 1
    sig = out[0]
    assert sig["signal"] == ITEM["title"]
    assert sig["date"] == "2026-10-02"
    assert sig["url"] == ITEM["url"]
    assert sig["source_kind"] == "press"
    assert sig["source"] == "lesechos.fr"
    assert sig["type"] == "budget"  # levée de fonds → catégorie budget de la veille


def test_existing_signal_with_same_url_is_not_duplicated():
    existing = [{"signal": "déjà", "url": ITEM["url"]}]
    assert len(merge_press_signals(existing, [ITEM])) == 1


def test_item_without_title_url_or_date_is_dropped_not_invented():
    bad = [{**ITEM, "title": ""}, {**ITEM, "url": ""}, {**ITEM, "published_at": ""}, "x"]
    assert merge_press_signals([], bad) == []


def test_non_http_url_is_refused():
    assert merge_press_signals([], [{**ITEM, "url": "javascript:alert(1)"}]) == []


def test_non_list_inputs_are_tolerated():
    assert merge_press_signals(None, None) == []
