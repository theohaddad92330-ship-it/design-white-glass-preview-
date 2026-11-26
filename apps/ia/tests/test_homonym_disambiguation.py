"""Déterministe homonym disambiguation — scoring + selection.

Couvre les cas du retour Théo (p.10 / homonyme) :
  - nom unique → sélection directe ;
  - nom homonyme avec un candidat qui domine (taille) → sélection factuelle ;
  - nom homonyme sans dominant → ``ambiguous`` (liste scorée, PAS de choix au hasard) ;
  - SIREN fourni → court-circuite (``locked``) ;
  - NAF IT privilégié à confiance égale → sélection de l'entité IT ;
  - aucun candidat fiable → ``none``, aucun SIREN inventé.
"""

from __future__ import annotations

from app.services.homonym_disambiguation import (
    Candidate,
    candidate_from_registry_row,
    disambiguate,
    score_candidate,
    tranche_to_employees,
)


def _c(siren: str, name: str, **kw) -> Candidate:
    return Candidate(siren=siren, name=name, **kw)


# ── Unique name → direct selection ──────────────────────────────────────────
def test_single_plausible_candidate_is_selected():
    res = disambiguate("Doctolib", [_c("794598813", "Doctolib", naf_code="6201Z", size_class="ETI")])
    assert res.status == "unique"
    assert res.selected_siren == "794598813"
    assert res.confidence > 0.6


def test_exact_name_scores_full_on_name():
    scored = score_candidate("Société Générale", _c("552120222", "SOCIETE GENERALE SA"))
    assert scored.name_score == 1.0  # suffix-stripped, accent/case-folded exact


# ── Homonym with a dominant candidate (size) → selection ────────────────────
def test_homonym_big_group_dominates_tiny_namesake():
    # « THALES » : le groupe aéro (10000+ salariés, multi-établissements) doit
    # l'emporter sur l'homonyme transports fluviaux TPE (1-2 salariés).
    group = _c("552059024", "THALES", naf_code="7010Z", headcount=10000, establishment_count=40)
    tpe = _c("999999999", "THALES", naf_code="5040Z", headcount=1)
    res = disambiguate("THALES", [tpe, group])  # order must not matter
    assert res.status == "selected"
    assert res.selected_siren == "552059024"
    # les DEUX homonymes restent exposés pour transparence
    assert {c.siren for c in res.candidates} == {"552059024", "999999999"}


# ── Homonym, no dominant candidate → ambiguous (no silent guess) ────────────
def test_homonym_similar_candidates_are_ambiguous():
    # Deux entités actives au nom identique, taille inconnue, secteurs distincts
    # mais aucun signal départageant → on NE devine pas, on renvoie la liste.
    a = _c("111111111", "Groupe Martin", naf_code="4321A", city="Paris")
    b = _c("222222222", "Groupe Martin", naf_code="1071C", city="Lyon")
    res = disambiguate("Groupe Martin", [a, b])
    assert res.status == "ambiguous"
    assert res.selected_siren is None
    assert res.candidate_count == 2
    assert len(res.candidates) == 2
    # scores présents pour que l'UI tranche
    assert all(c.score > 0 for c in res.candidates)


# ── SIREN provided (scope lock) → short-circuit ─────────────────────────────
def test_provided_siren_short_circuits_disambiguation():
    a = _c("111111111", "Groupe Martin")
    b = _c("222222222", "Groupe Martin")
    res = disambiguate("Groupe Martin", [a, b], siren_lock="222 222 222")
    assert res.status == "locked"
    assert res.selected_siren == "222222222"
    assert res.confidence == 1.0


def test_provided_siren_short_circuits_even_without_candidates():
    res = disambiguate("Whatever", [], siren_lock="552120222")
    assert res.status == "locked"
    assert res.selected_siren == "552120222"


# ── NAF IT privileged at equal confidence → selection of the IT entity ──────
def test_naf_it_breaks_the_tie_at_equal_name_confidence():
    # Noms identiques, taille inconnue des deux côtés : seul le NAF IT (div. 62)
    # départage → l'entité IT (cible n°1 d'une ESN) est retenue.
    it = _c("300000001", "SEB Digital", naf_code="6201Z")  # programmation informatique
    non_it = _c("300000002", "SEB Digital", naf_code="2599B")  # métallurgie
    res = disambiguate("SEB Digital", [non_it, it])
    assert res.status == "selected"
    assert res.selected_siren == "300000001"
    assert next(c for c in res.candidates if c.siren == "300000001").naf_is_it is True


def test_naf_it_does_not_override_a_clearly_better_name_match():
    # Un homonyme IT au nom FAIBLE ne doit pas voler la place d'un bien meilleur
    # match de nom non-IT : le nom prime, le NAF IT n'est qu'un départage à nom égal.
    strong_non_it = _c("400000001", "Michelin", naf_code="2211Z", headcount=10000, establishment_count=30)
    weak_it = _c("400000002", "Michelin Data Services SudEst", naf_code="6201Z")
    res = disambiguate("Michelin", [weak_it, strong_non_it])
    assert res.selected_siren == "400000001"


# ── No reliable candidate → clear failure, no invented SIREN ────────────────
def test_no_plausible_candidate_returns_none_status():
    # Aucun nom assez proche de la requête.
    res = disambiguate("Boulangerie Dupont", [_c("500000001", "Airbus Group", naf_code="3030Z")])
    assert res.status == "none"
    assert res.selected_siren is None


def test_all_ceased_candidates_are_not_selected():
    # Homonymes tous cessés → aucun retenu (statut none), aucune invention.
    dead1 = _c("600000001", "Photomaton", is_active=False)
    dead2 = _c("600000002", "Photomaton", is_active=False)
    res = disambiguate("Photomaton", [dead1, dead2])
    assert res.status == "none"
    assert res.selected_siren is None


def test_empty_candidate_list_is_none_not_crash():
    res = disambiguate("Inconnue SARL", [])
    assert res.status == "none"
    assert res.selected_siren is None
    assert res.candidates == []


# ── Selection prefers the active entity over a ceased namesake ──────────────
def test_active_entity_wins_over_ceased_namesake():
    ceased = _c("700000001", "Camaïeu", is_active=False, headcount=5000)
    active = _c("700000002", "Camaïeu", is_active=True, size_class="PME")
    res = disambiguate("Camaïeu", [ceased, active])
    # only the active one is viable → unique selection on it
    assert res.selected_siren == "700000002"
    assert res.status == "unique"


# ── The scored candidates carry the transparency payload ────────────────────
def test_registry_row_carries_the_legal_category_into_the_candidate():
    # #2616.2 — la MÊME projection ``candidate_from_registry_row`` (research/
    # homonym.py) doit porter le champ, pas seulement la construction directe
    # utilisée par les autres tests de ce fichier.
    candidate = candidate_from_registry_row({"siren": "216901234", "name": "COMMUNE DE X", "legalCategory": "7210"})
    assert candidate.legal_category == "7210"


def test_scored_candidate_carries_the_legal_category():
    # #2616.2 — la catégorie juridique INSEE (`legalCategory`) était captée par
    # `recherche-entreprises` puis JETÉE à la projection `Candidate`/
    # `ScoredCandidate` — exactement le défaut déjà corrigé pour
    # `headcountTranche`/`creationDate` (« le registre les publiait, le
    # candidat les jetait »). `is_public_employer` (`account_qualification.py`)
    # en a besoin pour distinguer un employeur public sur un signal `hiring`.
    scored = score_candidate(
        "Commune de X", _c("216901234", "COMMUNE DE X", legal_category="7210")
    )
    assert scored.model_dump(by_alias=True)["legalCategory"] == "7210"


def test_scored_candidate_exposes_disambiguation_fields():
    scored = score_candidate(
        "Euro-Information",
        _c("312730733", "EURO-INFORMATION", naf_code="6201Z", city="Strasbourg",
           department="67", size_class="GE", establishment_count=12),
    )
    dumped = scored.model_dump(by_alias=True)
    assert dumped["siren"] == "312730733"
    assert dumped["nafIsIt"] is True
    assert dumped["city"] == "Strasbourg"
    assert dumped["sizeClass"] == "GE"
    assert dumped["score"] > 0
    assert any("NAF IT" in r for r in dumped["reasons"])


# ── Le meilleur candidat est PLAUSIBLE ≠ il n'y a AUCUN candidat ────────────
#
# Mesuré en prod sur le registre libre : « Enedis », « Dalkia », « Framatome »
# renvoyaient ``ambiguous`` (donc AUCUN SIREN) alors que le 1er candidat est un
# match de nom EXACT face à des dérivés ("ENEDIS SIC", "DALKIA BIOGAZ"). Le
# départage ne regardait que l'écart de score COMPOSITE (< 0.15 → ambigu), aveugle
# au fait que le nom, lui, tranchait nettement. D'où « 21 entreprise(s) non
# rattachée(s) à un SIREN » sur Découvrir.
def test_exact_name_beats_its_own_derivatives():
    # Le nom EXACT domine largement les dérivés (« X SIC », « X BIOGAZ ») qui ne
    # sont pas des homonymes mais des filiales : on doit sélectionner.
    exact = _c("444608442", "ENEDIS", naf_code="3513Z", headcount=10000, establishment_count=1580)
    derived = _c("789459427", "ENEDIS SIC", naf_code="7740Z", headcount=5000, establishment_count=3)
    res = disambiguate("Enedis", [derived, exact])
    assert res.status == "selected"
    assert res.selected_siren == "444608442"


def test_registry_facts_break_a_name_tie_between_a_giant_and_a_shell():
    # « Electricité de France » : deux entités au nom équivalent, mais l'une a
    # 10000 salariés et 9157 établissements, l'autre 1 établissement et une taille
    # inconnue. Les FAITS registre tranchent (c'est leur raison d'être).
    real = _c("552081317", "ELECTRICITE DE FRANCE", naf_code="3511Z",
              headcount=10000, establishment_count=9157)
    shell = _c("776222275", "ELECTRICITE DE FRANCE", naf_code="0601", establishment_count=1)
    res = disambiguate("Electricite de France", [shell, real])
    assert res.status == "selected"
    assert res.selected_siren == "552081317"


def test_a_field_of_comparable_big_namesakes_stays_ambiguous():
    """Garde anti-régression « Carrefour → SCI du Cannet ».

    Le match de nom EXACT est une coquille (1 établissement, taille inconnue,
    NAF immobilier) tandis que les gros porteurs du nom sont des dérivés
    comparables entre eux : rien ne se détache → on N'invente PAS."""
    hyper = _c("451321335", "CARREFOUR HYPERMARCHES", naf_code="4711F",
               headcount=10000, establishment_count=231)
    stations = _c("451321376", "CARREFOUR STATIONS SERVICE", naf_code="4730Z",
                  headcount=5000, establishment_count=203)
    shell = _c("503932568", "CARREFOUR", naf_code="6832A", establishment_count=1)
    res = disambiguate("Carrefour", [hyper, stations, shell])
    assert res.status == "ambiguous"
    assert res.selected_siren is None


def test_equally_named_shells_stay_ambiguous():
    # Noms identiques ET faits registre également inconnus → aucune sélection.
    a = _c("111111111", "Groupe Martin", establishment_count=1)
    b = _c("222222222", "Groupe Martin", establishment_count=1)
    res = disambiguate("Groupe Martin", [a, b])
    assert res.status == "ambiguous"
    assert res.selected_siren is None


def test_legal_name_is_scored_alongside_the_trade_name():
    """Le registre renvoie « ELECTRICITE DE FRANCE (EDF) » en nom d'usage et
    « ELECTRICITE DE FRANCE » en raison sociale. Un scorer qui n'en voit qu'un
    déclasse la bonne entité."""
    scored = score_candidate(
        "Electricite de France",
        _c("552081317", "ELECTRICITE DE FRANCE (EDF)", legal_name="ELECTRICITE DE FRANCE"),
    )
    assert scored.name_score == 1.0


# ── INSEE tranche helper ────────────────────────────────────────────────────
def test_tranche_to_employees_maps_known_codes():
    assert tranche_to_employees("51") == 2000
    assert tranche_to_employees("01") == 1
    assert tranche_to_employees("NN") is None
    assert tranche_to_employees(None) is None
