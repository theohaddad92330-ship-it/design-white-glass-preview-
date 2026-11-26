"""La barrière d'achat — six proxies, quatre classes (tome 3 §4-5).

⚠️ LE GOLDEN CI-DESSOUS EST FIGÉ À LA MAIN, ET C'EST DÉLIBÉRÉ.

Le tome livre 281 comptes scorés (entrées ET sorties). Rejouer la formule sur les
281 lignes a donné, le 22/08 : **0 désaccord sur la barrière, 0 sur la classe**,
et six écarts d'un dixième sur l'accessibilité, tous expliqués par le même détail
— la référence calcule l'accessibilité sur la barrière ARRONDIE, ce que ce module
fait aussi depuis.

Le fichier vit dans `agent_docs/sources/`, qui est GITIGNORÉ : un test qui le
lirait passerait au vert en local et tomberait en CI, ce qui est pire qu'un test
absent. On embarque donc un sous-ensemble qui couvre les six statuts, les quatre
classes et les deux bornes de chaque palier.
"""

from __future__ import annotations

import re
from datetime import date

import pytest

from app.services.access_scoring import (
    ACCESS_PROXIES,
    MIN_PROXIES_MESURABLES,
    STATUT_BARRIERE,
    access_barrier,
)

TODAY = date(2026, 8, 22)

#: (nom, statut, effectif, coté, commande publique, décentralisé, barrière, accessibilité, classe)
GOLDEN: tuple[tuple[str, str, int, int, int, int, float, float, str], ...] = (
    ("Clever Cloud", "scaleup", 100, 0, 0, 0, 0.6, 9.4, "A"),
    ("Veepee", "scaleup", 3000, 0, 0, 1, 1.4, 9.3, "A"),
    ("Groupe Duval", "eti_familiale", 1500, 0, 0, 1, 1.6, 9.1, "A"),
    ("April", "eti_fonds", 2500, 0, 0, 1, 2.0, 8.7, "A"),
    ("Cdiscount", "filiale_etrangere", 2000, 0, 0, 1, 2.3, 8.4, "A"),
    ("Alice & Bob", "scaleup", 150, 0, 1, 0, 2.1, 7.9, "A"),
    ("Showroomprivé", "scaleup", 800, 1, 0, 0, 2.2, 7.8, "A"),
    ("Fleury Michon", "eti_familiale", 3500, 1, 0, 1, 3.5, 7.2, "B"),
    ("Lactalis", "eti_familiale", 85000, 0, 0, 1, 3.5, 7.2, "B"),
    ("Club Med", "filiale_etrangere", 25000, 0, 0, 1, 3.7, 7.0, "B"),
    ("Boursorama", "filiale_etrangere", 1200, 0, 0, 0, 3.1, 6.9, "B"),
    ("Center Parcs France", "groupe_cote", 4000, 0, 0, 1, 4.1, 6.6, "B"),
    ("Radiall", "eti_familiale", 2500, 1, 1, 1, 4.3, 6.4, "B"),
    ("Suravenir", "public_parapublic", 800, 0, 0, 0, 4.6, 5.4, "B"),
    ("TF1", "groupe_cote", 3000, 1, 0, 1, 5.3, 5.4, "C"),
    ("Lisi Group", "eti_familiale", 10000, 1, 1, 1, 5.7, 5.0, "C"),
    ("Apicil", "public_parapublic", 2000, 0, 1, 1, 5.8, 4.9, "C"),
    ("Point P", "groupe_cote", 12000, 0, 1, 1, 6.3, 4.4, "C"),
    ("Forsee Power", "groupe_cote", 800, 1, 1, 0, 6.4, 3.6, "C"),
    ("Crédit Mutuel Arkéa", "public_parapublic", 11000, 0, 1, 1, 7.2, 3.5, "D"),
    ("Accor", "groupe_cote", 20000, 1, 1, 1, 7.5, 3.2, "D"),
)


def _run(statut: str, headcount: int, listed: int, public: int, decentralise: int) -> dict:
    return access_barrier(
        statut=statut,
        headcount=headcount,
        listed=bool(listed),
        public_procurement=bool(public),
        # Le modèle du tome prend un booléen ; ici c'est un NOMBRE d'établissements.
        # 12 franchit le seuil, 1 ne le franchit pas — on rejoue donc la même
        # décision avec l'entrée réelle du registre.
        etablissements=12 if decentralise else 1,
        creation_date="2005-01-01",
        now=TODAY,
    )


@pytest.mark.parametrize("row", GOLDEN, ids=[r[0] for r in GOLDEN])
def test_the_model_reproduces_the_reference_base(row) -> None:
    _name, statut, headcount, listed, public, decentralise, barriere, accessibilite, klass = row
    out = _run(statut, headcount, listed, public, decentralise)
    assert out["score"] == pytest.approx(barriere, abs=0.051)
    assert out["accessibility"] == pytest.approx(accessibilite, abs=0.051)
    assert out["access_class"] == klass


def test_the_six_proxies_are_always_reported_even_when_unmeasurable() -> None:
    """Un proxy absent ne DISPARAÎT pas : il est rendu, marqué non mesurable, et
    porte la raison. C'est ce qui distingue « on n'a pas regardé » de « c'est nul »."""
    out = access_barrier(statut="scaleup", headcount=100, public_procurement=False, now=TODAY)
    assert [p["key"] for p in out["proxies"]] == list(ACCESS_PROXIES)
    unmeasured = {p["key"] for p in out["proxies"] if not p["measurable"]}
    assert unmeasured == {"cotation", "decentralisation", "anciennete"}
    assert set(out["missing"]) == unmeasured


def test_no_class_is_produced_under_three_measurable_proxies() -> None:
    """§4.4 : sous trois proxies, aucune classe. Un compte sans effectif ET sans
    statut ne sort JAMAIS en classe A — c'est l'erreur qui coûte huit mois."""
    out = access_barrier(headcount=None, statut=None, listed=None, now=TODAY)
    assert out["measurable"] is False
    assert out["score"] is None and out["access_class"] is None and out["label"] is None
    assert "statut" in out["missing"] and "effectif" in out["missing"]

    two = access_barrier(statut="scaleup", headcount=100, now=TODAY)
    assert MIN_PROXIES_MESURABLES == 3
    assert two["measurable"] is False, "deux proxies mesurables ne suffisent pas"


def test_a_missing_proxy_is_never_scored_zero() -> None:
    """Comparaison directe : le même compte, une fois avec « pas de marché
    public » (une MESURE), une fois sans information. Les deux ne donnent pas la
    même chose — et c'est tout le sujet."""
    measured = access_barrier(
        statut="groupe_cote", headcount=20000, listed=True, public_procurement=False, etablissements=1, now=TODAY
    )
    unknown = access_barrier(
        statut="groupe_cote", headcount=20000, listed=True, public_procurement=None, etablissements=1, now=TODAY
    )
    assert measured["score"] == unknown["score"], "l'absence n'ajoute ni ne retire de points"
    assert "commande_publique" in unknown["missing"]
    assert "commande_publique" not in measured["missing"]


def test_every_proxy_carries_a_french_evidence() -> None:
    out = access_barrier(
        statut="public_parapublic",
        headcount=11000,
        listed=False,
        public_procurement=True,
        etablissements=40,
        creation_date="1990-01-01",
        now=TODAY,
    )
    for proxy in out["proxies"]:
        assert proxy["evidence"].strip(), proxy["key"]
        assert len(proxy["evidence"]) > 15, proxy["key"]
        # Pas de clé technique jetée à l'écran : « public_procurement: true » ne
        # dit rien à un commercial.
        assert not re.search(r"[a-z_]+\s*:\s*(true|false)", proxy["evidence"]), proxy["key"]


def test_the_label_never_promises() -> None:
    """« Ouvert PROBABLE », jamais « ouvert », jamais « facile » (D88)."""
    a = access_barrier(statut="scaleup", headcount=100, listed=False, public_procurement=False, etablissements=1, now=TODAY)
    assert a["label"] == "Ouvert probable"
    labels = {
        access_barrier(
            statut=s, headcount=20000, listed=True, public_procurement=True, etablissements=40, now=TODAY
        )["label"]
        for s in STATUT_BARRIERE
    }
    for label in labels:
        assert "facile" not in (label or "").lower()


def test_the_registry_only_knows_eti_and_takes_the_more_closed_value() -> None:
    """Le registre ne distingue pas l'ETI familiale (3,0) de l'ETI sous fonds
    (4,0). On retient la plus FERMÉE : se tromper du côté « ouvert » coûte huit
    mois, l'inverse suggère seulement de viser une filiale."""
    assert STATUT_BARRIERE["eti"] == STATUT_BARRIERE["eti_fonds"]
    assert STATUT_BARRIERE["eti"] > STATUT_BARRIERE["eti_familiale"]


def test_a_creation_date_in_the_future_is_not_an_age() -> None:
    out = access_barrier(statut="scaleup", headcount=100, listed=False, creation_date="2030-01-01", now=TODAY)
    assert "anciennete" in out["missing"]


# ── L'axe A1 de Découvrir prend la barrière quand rien de public ne parle ────


def test_the_lock_axis_reads_the_end_date_the_tome_2_collects() -> None:
    """L'échéance était COLLECTÉE et l'axe écrivait « échéance inconnue » en dur.
    Une donnée qu'on a et qu'on n'affiche pas est une donnée qu'on n'a pas."""
    from app.services.discover_scoring import _lock_axis

    axis = _lock_axis([{"type": "award", "label": "TMA", "date": "2026-03-01", "endsOn": "2029-03-01"}])
    assert axis is not None
    assert "en cours jusqu'au 2029-03-01" in axis["evidence"]
    assert "inconnue" not in axis["evidence"]


def test_the_estimated_barrier_feeds_the_lock_axis_when_no_public_trace_exists() -> None:
    """D71 : « la formule du tome 3 CALCULE l'axe A1 ». Sans marché public, la
    barrière estimée prend le relais — en DISANT que c'est une estimation."""
    from app.services.discover_scoring import _lock_axis

    barrier = access_barrier(
        statut="scaleup", headcount=100, listed=None, public_procurement=None, etablissements=1,
        creation_date="2019-01-01", now=TODAY,
    )
    axis = _lock_axis([], barrier)
    assert axis is not None
    assert axis["points"] < 6, "une estimation ne vaut pas une consultation ouverte constatée"
    assert "estimation" in axis["evidence"] or "estimée" in axis["evidence"]


def test_an_unmeasurable_barrier_scores_no_lock_axis_at_all() -> None:
    """Sous trois proxies, il n'y a pas de classe — donc pas de points. L'axe
    sort du dénominateur, il ne vaut pas zéro."""
    from app.services.discover_scoring import _lock_axis

    barrier = access_barrier(statut=None, headcount=None, now=TODAY)
    assert _lock_axis([], barrier) is None


def test_a_market_ending_within_a_year_lowers_the_barrier_and_can_change_the_class() -> None:
    from app.services.access_scoring import barrier_for_company

    company = {"sizeClass": "GE", "headcountTranche": "52", "establishmentCount": 203, "creationDate": "2000-09-02"}
    running = barrier_for_company(company, signals=[{"type": "award", "endsOn": "2031-01-01"}], now=TODAY)
    closing = barrier_for_company(company, signals=[{"type": "award", "endsOn": "2026-11-01"}], now=TODAY)
    assert closing["score"] < running["score"]
    assert [c["key"] for c in closing["corrections"]] == ["echeance_proche"]
    assert running["corrections"] == []


# ── Lot G — la procédure collective (§28, cas limite) ───────────────────────


def test_a_collective_proceeding_is_a_warning_and_never_a_score() -> None:
    """Le cas limite du §28. Une entreprise en redressement n'est pas « plus
    dure d'accès » — elle est souvent JOIGNABLE, et c'est bien le piège. Confondre
    l'accessibilité et la solvabilité ferait remonter en tête de liste un compte
    qui ne signera rien. On AVERTIT, on ne touche pas au barème."""
    from app.services.access_scoring import barrier_for_company

    company = {"sizeClass": "ETI", "headcountTranche": "41", "establishmentCount": 3}
    legal = [{"date": "2026-05-12", "type": "Procédure collective", "label": "ACME SA"}]
    with_warning = barrier_for_company(company, legal_signals=legal, now=date(2026, 8, 22))
    without = barrier_for_company(company, now=date(2026, 8, 22))

    assert with_warning["score"] == without["score"]
    assert with_warning["access_class"] == without["access_class"]
    assert with_warning["warning"] == {
        "kind": "procedure_collective",
        "date": "2026-05-12",
        "label": "Procédure collective",
        "url": None,
    }
    assert without["warning"] is None


def test_the_warning_carries_the_bodacc_link_when_the_row_has_one() -> None:
    """#3916.1 — jusqu'ici l'avertissement portait une date mais jamais de
    lien : un commercial ne pouvait pas vérifier l'annonce d'un clic."""
    from app.services.access_scoring import barrier_for_company

    legal = [
        {
            "date": "2026-05-12",
            "type": "Procédure collective",
            "label": "ACME SA",
            "url": "https://bodacc-datadila.opendatasoft.com/explore/dataset/annonces-commerciales/table/?q=552032534",
        }
    ]
    b = barrier_for_company({"sizeClass": "ETI"}, legal_signals=legal, now=date(2026, 8, 22))
    assert b["warning"]["url"] == (
        "https://bodacc-datadila.opendatasoft.com/explore/dataset/annonces-commerciales/table/?q=552032534"
    )


def test_an_old_collective_proceeding_is_not_reported() -> None:
    """Une procédure de 2019 est de l'histoire : l'annoncer comme un risque
    actuel ferait écarter un compte redressé depuis longtemps."""
    from app.services.access_scoring import barrier_for_company

    legal = [{"date": "2019-03-01", "type": "Procédure collective", "label": "ACME SA"}]
    b = barrier_for_company({"sizeClass": "PME"}, legal_signals=legal, now=date(2026, 8, 22))
    assert b["warning"] is None


def test_an_undated_collective_proceeding_is_reported_without_a_date() -> None:
    """Sans date on ne peut pas savoir si c'est vieux — et taire un risque
    faute de date est la pire des deux erreurs."""
    from app.services.access_scoring import barrier_for_company

    legal = [{"type": "Procédure collective"}]
    b = barrier_for_company({"sizeClass": "PME"}, legal_signals=legal, now=date(2026, 8, 22))
    assert b["warning"] is not None
    assert b["warning"]["date"] is None


def test_other_legal_announcements_are_not_warnings() -> None:
    """Un dépôt de comptes ou une modification de dirigeant n'a rien d'un
    risque : les faire remonter en avertissement rendrait l'avertissement muet."""
    from app.services.access_scoring import barrier_for_company

    for kind in ("Dépôt des comptes", "Modification", "Création d'établissement", "Vente"):
        b = barrier_for_company({"sizeClass": "PME"}, legal_signals=[{"type": kind}], now=date(2026, 8, 22))
        assert b["warning"] is None, kind


def test_a_non_estimable_barrier_still_carries_its_warning() -> None:
    """Ne pas savoir estimer la barrière n'empêche pas de savoir qu'une
    procédure est en cours — ce sont deux questions différentes."""
    from app.services.access_scoring import barrier_for_company

    b = barrier_for_company({}, legal_signals=[{"type": "Procédure collective", "date": "2026-07-01"}], now=date(2026, 8, 22))
    assert b["measurable"] is False
    assert b["warning"] is not None


def _anciennete_evidence(creation_date: str) -> str:
    out = access_barrier(statut="scaleup", headcount=100, listed=False, creation_date=creation_date, now=TODAY)
    return next(p["evidence"] for p in out["proxies"] if p["key"] == "anciennete")


def test_x58_the_age_agrees_in_number_instead_of_writing_an_s() -> None:
    """Recette Y14 02/10 : « 126 an(s) » — le pluriel est tranché par le nombre."""
    assert "126 ans" in _anciennete_evidence("1900-01-01")
    assert "an(s)" not in _anciennete_evidence("1900-01-01")
    assert " 1 an " in _anciennete_evidence("2025-01-01") or " 0 an " in _anciennete_evidence("2025-01-01")


def test_x58_the_establishment_count_groups_thousands_and_agrees() -> None:
    """Recette Y14 02/10 : « 2320 établissements » sans séparateur de milliers."""
    big = access_barrier(
        statut="groupe_cote", headcount=20000, listed=True, etablissements=2320, now=TODAY
    )
    evidence = next(p["evidence"] for p in big["proxies"] if p["key"] == "decentralisation")
    assert evidence.startswith("2 320 établissements")
    one = access_barrier(statut="groupe_cote", headcount=20000, listed=True, etablissements=1, now=TODAY)
    single = next(p["evidence"] for p in one["proxies"] if p["key"] == "decentralisation")
    assert single.startswith("1 établissement ") and "(s)" not in single
