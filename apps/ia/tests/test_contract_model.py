"""#2291.2 — COMMENT UNE ENTREPRISE CIBLE CONTRACTUALISE, OBSERVÉ (jamais déduit).

DÉCISION Louis 19/09/2026 (QCM) : l'OBSERVER, sur les sources réelles déjà
interrogées par Découvrir — les offres d'emploi que la cible publie (le type de
contrat NATIF de France Travail) et les avis de marchés publics qu'elle passe
(quand l'avis DIT « assistance technique », « en régie » ou « au forfait »).

Ces tests verrouillent ce que l'observation a le droit d'affirmer :
  · elle porte sa SOURCE, sa DATE (fenêtre des faits comptés + jour du constat)
    et son VOLUME ;
  · une offre n'est comptée que si l'employeur EST la cible (jamais un cabinet
    qui publie pour elle, jamais une offre anonymisée) ;
  · un code de contrat non vérifié n'est jamais classé au jugé ;
  · sans aucun fait attribuable : ``None`` — « non observé », jamais une
    préférence déduite.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.services.contract_model import job_kind, observe_contract_model

NOW = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)


def _offer(code: str | None, date: str | None = "2026-09-01T10:00:00Z", company: str | None = "DECATHLON", **over):
    row = {"title": "Développeur", "date": date, "company": company, "contractCode": code, "contractType": None}
    row.update(over)
    return row


def _tender(title: str, buyer: str | None = "DECATHLON", date: str | None = "2026-08-10") -> dict:
    return {"title": title, "buyer": buyer, "publishedDate": date}


def test_job_offers_are_counted_by_native_contract_code_with_source_window_and_volume() -> None:
    offers = [
        _offer("CDI", "2026-09-15T08:00:00Z"),
        _offer("CDI", "2026-07-01T08:00:00Z"),
        _offer("LIB", "2026-08-20T08:00:00Z"),
        _offer("MIS", "2026-06-21T08:00:00Z"),
        _offer("CDD", "2026-09-02T08:00:00Z"),
    ]
    obs = observe_contract_model("DECATHLON SE", offers, [], now=NOW)
    assert obs is not None
    assert obs["observedAt"] == "2026-09-19"
    jobs = obs["jobOffers"]
    # #4074 revient sur #2291.3 (18/09), délibérément — décision Louis 12/10 : aucune source ne se nomme.
    assert jobs["source"] == "Offres d'emploi publiques"
    assert jobs["total"] == 5
    assert jobs["counts"] == {"permanent": 2, "fixedTerm": 1, "interim": 1, "freelance": 1, "other": 0}
    assert jobs["since"] == "2026-06-21"
    assert jobs["until"] == "2026-09-15"
    assert obs["publicContracts"] is None


def test_an_offer_published_by_someone_else_is_never_attributed_to_the_target() -> None:
    """Un cabinet qui publie POUR la cible, ou une offre anonymisée, ne disent
    rien de la façon dont la cible contractualise."""
    offers = [
        _offer("MIS", company="RANDSTAD"),
        _offer("LIB", company=None),
        _offer("LIB", company=""),
    ]
    assert observe_contract_model("DECATHLON SE", offers, [], now=NOW) is None


def test_the_employer_name_matches_through_legal_suffixes_and_brand_tokens() -> None:
    offers = [_offer("CDI", company="Decathlon France"), _offer("LIB", company="DÉCATHLON")]
    obs = observe_contract_model("DECATHLON SE", offers, [], now=NOW)
    assert obs is not None
    assert obs["jobOffers"]["total"] == 2


def test_an_unverified_code_or_a_free_text_label_is_never_classified_by_guess() -> None:
    """`SAI` n'a pas été vérifié ; « Contrat à durée indéterminée » est un
    libellé, pas le code natif — tous deux restent « autre », jamais CDI."""
    offers = [
        _offer("SAI"),
        _offer(None, contractType="Contrat à durée indéterminée"),
        # Un `contractType` qui EST un code vérifié (libellé absent à la source).
        _offer(None, contractType="CDI"),
    ]
    obs = observe_contract_model("DECATHLON", offers, [], now=NOW)
    assert obs is not None
    assert obs["jobOffers"]["counts"] == {"permanent": 1, "fixedTerm": 0, "interim": 0, "freelance": 0, "other": 2}


def test_an_undated_offer_is_not_counted() -> None:
    obs = observe_contract_model(
        "DECATHLON", [_offer("LIB", date=None), _offer("LIB", date="pas une date")], [], now=NOW
    )
    assert obs is None


def test_public_contracts_count_only_what_the_notice_says_for_the_target_as_buyer() -> None:
    tenders = [
        _tender("Assistance technique pour le pilotage du SI", date="2026-09-10"),
        _tender("Prestations de développement en régie", date="2026-05-02"),
        _tender("TMA de l'application RH au forfait", date="2026-07-15"),
        _tender("Refonte du portail — prix forfaitaire, assistance technique ponctuelle", date="2026-06-01"),
        _tender("Maintenance du parc informatique", date="2026-08-01"),
        # Un autre acheteur : jamais attribué à la cible.
        _tender("Assistance technique", buyer="VILLE DE LILLE", date="2026-09-01"),
    ]
    obs = observe_contract_model("DECATHLON SE", [], tenders, now=NOW)
    assert obs is not None
    assert obs["jobOffers"] is None
    contracts = obs["publicContracts"]
    assert contracts["source"] == "Avis de marchés publics"
    assert contracts["total"] == 5
    # Un avis peut nommer les deux modes : chacun est compté là où l'avis le DIT.
    assert contracts["regie"] == 3
    assert contracts["fixedPrice"] == 2
    assert contracts["since"] == "2026-05-02"
    assert contracts["until"] == "2026-09-10"


def test_a_public_body_named_regie_is_not_a_regie_contract() -> None:
    """« Régie des eaux » est un ACHETEUR, pas un mode de contractualisation ;
    « forfait mobile » est un abonnement. Seules les tournures qui disent le
    mode (« en régie », « assistance technique », « au forfait »,
    « forfaitaire ») comptent."""
    tenders = [
        _tender("Maintenance du SI de la Régie des eaux"),
        _tender("Forfaits de téléphonie mobile"),
    ]
    obs = observe_contract_model("DECATHLON", [], tenders, now=NOW)
    assert obs is not None
    assert obs["publicContracts"]["total"] == 2
    assert obs["publicContracts"]["regie"] == 0
    assert obs["publicContracts"]["fixedPrice"] == 0


def test_nothing_attributable_is_not_observed_never_a_deduced_preference() -> None:
    assert observe_contract_model("DECATHLON", [], [], now=NOW) is None
    assert observe_contract_model("", [_offer("CDI")], [_tender("Assistance technique")], now=NOW) is None
    assert observe_contract_model("DECATHLON", None, None, now=NOW) is None


# ── #2616.1 — job_kind, alias public réutilisé par discover_signals.py pour
#    distinguer le CDI (GA-26 : une seule table de correspondance, jamais
#    dupliquée) ─────────────────────────────────────────────────────────────


def test_job_kind_reads_the_same_verified_code_table() -> None:
    assert job_kind({"contractCode": "CDI"}) == "permanent"
    assert job_kind({"contractCode": "CDD"}) == "fixedTerm"
    assert job_kind({"contractCode": "SAI"}) == "other"  # jamais classé au jugé
    assert job_kind({}) == "other"
