"""Offer-domain packs (PDF6 §1 — sortir du verrou IT sans changer le défaut).

Three guarantees:

1. **Byte-identity of the default.** ``offerDomain`` absent, ``"esn_it"`` or an
   unknown value renders EXACTLY the committed golden baselines — every
   registered SYSTEM prompt (``tests/golden/system/``) and every lens-threaded
   USER prompt (``tests/golden/user/``, incl. the ``strategy.txt`` baseline
   captured from the PRE-change code). The live product cannot shift.
2. **Explicit domain → the pack drives the lens.** A ``finance`` profile swaps
   the IT wording (entity directive, signal grid, plays, domain brief) for the
   finance vocabulary while the JSON data-contract keys stay untouched.
3. **Registry hygiene.** Every domain of the contracts enum is registered, the
   default is gated to ``None``, metadata is enumerable and deterministic.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.prompts import bellum_contacts, bellum_facts, bellum_plan, bellum_signals, bellum_strategy
from app.prompts.registry import SYSTEM_PROMPTS
from app.services.domain_focus import looks_like_it_esn, resolve_domain_focus
from app.services.offer_domains import (
    DEFAULT_OFFER_DOMAIN,
    OFFER_DOMAIN_PACKS,
    get_offer_domain_pack,
    list_offer_domains,
    normalize_offer_domain,
)
from app.services.seller_context import esn_row_to_profile_data
from tests.test_consulting_domains_parity import offer_domains_from_contract
from tests.test_prompts_new import SAMPLE_PROFILE

_GOLDEN_SYSTEM = Path(__file__).parent / "golden" / "system"
_GOLDEN_USER = Path(__file__).parent / "golden" / "user"

# Miroir de l'enum contracts (packages/contracts/src/schemas/onboarding.ts
# OFFER_DOMAINS). Il reste une CONSTANTE parce que les `parametrize` en
# dépendent à l'import — mais il n'est plus recopié à l'aveugle : le test
# `test_all_domains_mirrors_the_contract` ci-dessous le compare au fichier TS.
# Un miroir que rien ne vérifie finit toujours par diverger.
_ALL_DOMAINS = (
    "esn_it",
    "finance",
    "supply_chain",
    "product_design",
    "pmo",
    "rh",
    "generic",
    "industrial_engineering",
    "ia",
    "cyber",
    "hse",
)

_FINANCE_PROFILE = {
    "companyName": "FinConseil",
    "offers": ["Consolidation", "Contrôle de gestion", "Trésorerie"],
    "offerDomain": "finance",
}

_IA_PROFILE = {
    "companyName": "Aquila",
    "offers": ["Data Science", "Machine Learning", "GenAI"],
    "offerDomain": "ia",
}

_CYBER_PROFILE = {
    "companyName": "Cindynia",
    "offers": ["Audit securite", "SOC manage", "IAM"],
    "offerDomain": "cyber",
}

_HSE_PROFILE = {
    "companyName": "Enviro Conseil",
    "offers": ["Audit HSE", "Conformite ICPE", "Certification ISO 14001"],
    "offerDomain": "hse",
}

# ── 1. Byte-identity of the default (the non-negotiable guarantee) ───────────


@pytest.mark.parametrize("spec", SYSTEM_PROMPTS, ids=[s.name for s in SYSTEM_PROMPTS])
@pytest.mark.parametrize("domain_value", [None, "esn_it", "ESN_IT", "", "unknown_domain"])
def test_default_domain_system_prompts_are_byte_identical(spec, domain_value):
    """Every registered system prompt renders the committed golden baseline for
    the default/unknown domain — with the canonical profile AND an empty one."""
    expected = (_GOLDEN_SYSTEM / f"{spec.name}.txt").read_text(encoding="utf-8")
    profile = dict(SAMPLE_PROFILE)
    if domain_value is not None:
        profile["offerDomain"] = domain_value
    assert spec.build(profile) == expected


@pytest.mark.parametrize("spec", SYSTEM_PROMPTS, ids=[s.name for s in SYSTEM_PROMPTS])
def test_empty_profile_with_default_domain_matches_no_domain(spec):
    assert spec.build({"offerDomain": "esn_it"}) == spec.build({})


# Fixed sample args — the strategy entries must match tests/golden/user/strategy.txt
# (captured from the PRE-change code); the others mirror
# tests/test_domain_focus_user_prompts.py and its committed baselines.
_USER_SAMPLE = {
    "facts": dict(
        target_company="ACME",
        brave_results="BRAVE_SAMPLE",
        scraped_content="SCRAPE_SAMPLE",
        pappers_data="PAPPERS_SAMPLE",
        user_context="CTX_SAMPLE",
    ),
    "signals": dict(
        target_company="ACME",
        brave_results="BRAVE_SAMPLE",
        scraped_content="SCRAPE_SAMPLE",
        pappers_data="PAPPERS_SAMPLE",
        dated_signals="DATED_SAMPLE",
    ),
    "contacts": dict(
        company_name="ACME",
        contacts="CONTACTS_SAMPLE",
        entities="ENTITIES_SAMPLE",
        angles="ANGLES_SAMPLE",
        pains="PAINS_SAMPLE",
    ),
    "plan_evaluation": dict(company_name="ACME", section="evaluation"),
    "strategy": dict(
        target_company="ACME",
        brave_results="BRAVE_SAMPLE",
        scraped_content="SCRAPE_SAMPLE",
        pappers_data="PAPPERS_SAMPLE",
        user_context="CTX_SAMPLE",
        dated_signals="DATED_SAMPLE",
    ),
}

_USER_BUILDERS = {
    "facts": bellum_facts.build_user_prompt,
    "signals": bellum_signals.build_user_prompt,
    "contacts": bellum_contacts.build_user_prompt,
    "plan_evaluation": bellum_plan.build_subsection_user_prompt,
    "strategy": bellum_strategy.build_user_prompt,
}


def _render_user(name: str, profile: dict | None) -> str:
    return _USER_BUILDERS[name](**_USER_SAMPLE[name], profile_data=profile)


@pytest.mark.parametrize("name", sorted(_USER_BUILDERS))
@pytest.mark.parametrize("domain_value", [None, "esn_it", "unknown_domain"])
def test_default_domain_user_prompts_are_byte_identical(name, domain_value):
    """Every lens-threaded USER prompt renders the committed baseline for the
    default/unknown domain — including `strategy`, whose baseline was captured
    from the code BEFORE the domain plumbing existed (the strongest proof that
    the default path did not move by a single byte)."""
    expected = (_GOLDEN_USER / f"{name}.txt").read_text(encoding="utf-8")
    profile = None if domain_value is None else {"offerDomain": domain_value}
    assert _render_user(name, profile) == expected


def test_it_profile_with_explicit_esn_it_stays_byte_identical():
    it_profile = {"companyName": "DataForge", "offers": ["Data & IA", "Cloud AWS", "Cybersécurité"]}
    for name in _USER_BUILDERS:
        assert _render_user(name, {**it_profile, "offerDomain": "esn_it"}) == _render_user(name, it_profile)


def test_default_lens_is_the_historical_it_lens():
    lens = resolve_domain_focus({"offerDomain": "esn_it"})
    assert lens["label"] == "IT"
    assert lens["budget_signal"].startswith("Budget IT visible")
    assert lens["domain_brief"] == ""
    assert lens == resolve_domain_focus(None) == resolve_domain_focus({})


# ── 2. Explicit non-default domain → the pack drives the lens ────────────────


def test_finance_system_prompts_carry_the_finance_lens():
    for builder in (bellum_facts, bellum_signals, bellum_strategy, bellum_contacts):
        rendered = builder.build_system_prompt(_FINANCE_PROFILE)
        assert "DOMAINE D'OFFRE : FINANCE" in rendered
        assert "Direction financiere (CFO/DAF)" in rendered


def test_finance_signal_grid_replaces_the_it_grid():
    rendered = bellum_signals.build_system_prompt(_FINANCE_PROFILE)
    assert "Offres CDI tech 10+" not in rendered
    assert "Changement de CFO/DAF" in rendered
    # The domain-agnostic convergence rule survives the swap.
    assert "REGLE DE CONVERGENCE" in rendered


def test_finance_facts_user_prompt_redirects_the_entity_hunt():
    rendered = _render_user("facts", _FINANCE_PROFILE)
    assert "entite IT/digitale" not in rendered
    assert "fonction FINANCE" in rendered
    # JSON data-contract keys are untouched (parsers depend on them).
    assert '"itAutonomy":' in rendered
    assert '"it_implications_for_esn":' in rendered
    assert '"programNames":' in rendered


def test_finance_strategy_user_prompt_swaps_challenge_and_plays():
    rendered = _render_user("strategy", _FINANCE_PROFILE)
    assert "Pour chaque defi Finance :" in rendered
    assert "SAP, cyber/SOC, data, workplace/M365" not in rendered
    assert "consolidation/EPM" in rendered
    assert '"itChallenges":' in rendered  # contract key untouched


# ── 2 ter. IA — #2633.1, le domaine du lot « la collecte reconnaît l'IA » ────


def test_ia_system_prompts_carry_the_ia_lens():
    for builder in (bellum_facts, bellum_signals, bellum_strategy, bellum_contacts):
        rendered = builder.build_system_prompt(_IA_PROFILE)
        assert "DOMAINE D'OFFRE : IA" in rendered
        assert "Data Science" in rendered


def test_ia_signal_grid_replaces_the_it_grid():
    rendered = bellum_signals.build_system_prompt(_IA_PROFILE)
    assert "Offres CDI tech 10+" not in rendered
    assert "Chief AI Officer" in rendered
    assert "REGLE DE CONVERGENCE" in rendered


def test_ia_facts_user_prompt_redirects_the_entity_hunt():
    rendered = _render_user("facts", _IA_PROFILE)
    assert "entite IT/digitale" not in rendered
    assert "Data Science" in rendered
    # JSON data-contract keys are untouched (parsers depend on them).
    assert '"itAutonomy":' in rendered
    assert '"it_implications_for_esn":' in rendered
    assert '"programNames":' in rendered


def test_ia_strategy_user_prompt_swaps_challenge_and_plays():
    rendered = _render_user("strategy", _IA_PROFILE)
    assert "Pour chaque defi IA :" in rendered
    assert "SAP, cyber/SOC, data, workplace/M365" not in rendered
    assert "GenAI" in rendered
    assert '"itChallenges":' in rendered  # contract key untouched


def test_ai_ml_genai_portfolio_code_resolves_to_the_ia_pack():
    """#2633.1 — LA cause : un vendeur qui choisit « IA, machine learning,
    GenAI & agents » dans son portefeuille retombait sur `esn_it`."""
    from app.services.offer_domains.portfolio import dominant_pack

    assert dominant_pack(["AI_ML_GENAI"]) == "ia"


# ── 2 quater. Cyber — #3186.3, retour bêta LAU-FINAL-192 ─────────────────────


def test_cyber_system_prompts_carry_the_cyber_lens():
    for builder in (bellum_facts, bellum_signals, bellum_strategy, bellum_contacts):
        rendered = builder.build_system_prompt(_CYBER_PROFILE)
        assert "DOMAINE D'OFFRE : CYBERSÉCURITÉ" in rendered
        assert "CISO" in rendered or "RSSI" in rendered


def test_cyber_signal_grid_replaces_the_it_grid():
    rendered = bellum_signals.build_system_prompt(_CYBER_PROFILE)
    assert "Offres CDI tech 10+" not in rendered
    assert "NIS2" in rendered
    assert "REGLE DE CONVERGENCE" in rendered


def test_cyber_iam_grc_portfolio_code_resolves_to_the_cyber_pack():
    """#3186.3 — LA cause : un vendeur cyber pur (CYBER_IAM_GRC) retombait
    sur `esn_it`, le meme trou que #2633.1 pour `ia`."""
    from app.services.offer_domains.portfolio import dominant_pack

    assert dominant_pack(["CYBER_IAM_GRC"]) == "cyber"


# ── 2 quinquies. Environnement / HSE — #3186.5, retour bêta LAU-FINAL-192 ────


def test_hse_system_prompts_carry_the_hse_lens():
    for builder in (bellum_facts, bellum_signals, bellum_strategy, bellum_contacts):
        rendered = builder.build_system_prompt(_HSE_PROFILE)
        assert "DOMAINE D'OFFRE : ENVIRONNEMENT & HSE" in rendered
        assert "ICPE" in rendered


def test_hse_signal_grid_replaces_the_it_grid():
    rendered = bellum_signals.build_system_prompt(_HSE_PROFILE)
    assert "Offres CDI tech 10+" not in rendered
    assert "ICPE" in rendered
    assert "REGLE DE CONVERGENCE" in rendered


def test_quality_validation_hse_portfolio_code_resolves_to_the_hse_pack():
    """#3186.5 — un cabinet QHSE/environnement pur (QUALITY_VALIDATION_HSE)
    retombait sur `industrial_engineering` (bureau d'etudes)."""
    from app.services.offer_domains.portfolio import dominant_pack

    assert dominant_pack(["QUALITY_VALIDATION_HSE"]) == "hse"


# ── 2 bis. Ingénierie industrielle — le domaine du retour bêta du 24/08 ──────

_INDUSTRIAL_PROFILE = {
    "companyName": "Stelya",
    "offers": ["Bureau d'etudes", "Methodes", "Maintenance"],
    "offerDomain": "industrial_engineering",
}


def test_industrial_pack_carries_its_lens_in_every_system_prompt():
    for builder in (bellum_facts, bellum_signals, bellum_strategy, bellum_contacts):
        rendered = builder.build_system_prompt(_INDUSTRIAL_PROFILE)
        assert "DOMAINE D'OFFRE : INGÉNIERIE INDUSTRIELLE" in rendered
        assert "Bureau d'etudes & conception" in rendered


def test_industrial_signal_grid_replaces_the_it_grid():
    rendered = bellum_signals.build_system_prompt(_INDUSTRIAL_PROFILE)
    # Le prisme IT disparaît…
    assert "Offres CDI tech 10+" not in rendered
    # …et les signaux industriels du retour bêta apparaissent.
    for expected in ("CAPEX", "plan de charge", "Arret programme"):
        assert expected in rendered
    assert "REGLE DE CONVERGENCE" in rendered


def test_industrial_pack_never_reads_internal_activity_as_a_purchase():
    """La règle de fond du retour : une activité INTERNE n'est pas une preuve
    d'achat externe. Un recrutement technique en volume doit rester à confirmer,
    jamais compter comme un signal d'externalisation."""
    rendered = bellum_signals.build_system_prompt(_INDUSTRIAL_PROFILE)
    assert "jamais une preuve d'externalisation" in rendered


def test_industrial_facts_user_prompt_targets_the_SITE_not_the_it_entity():
    rendered = _render_user("facts", _INDUSTRIAL_PROFILE)
    assert "entite IT/digitale" not in rendered
    assert "SITE industriel" in rendered
    # La taille du groupe ne vaut pas la surface d'un site (§8 de l'addendum).
    assert "La taille du GROUPE ne dit rien" in rendered
    # Clés du contrat JSON inchangées — les parseurs en dépendent.
    assert '"itAutonomy":' in rendered
    assert '"it_implications_for_esn":' in rendered
    assert '"programNames":' in rendered


def test_industrial_domains_resolve_to_the_industrial_pack():
    """Un portefeuille de domaines industriels choisit le pack industriel — il
    résolvait `generic` avant le 24/08, ce qui donnait un prisme sans aucun
    vocabulaire d'ingénierie."""
    profile = esn_row_to_profile_data(
        {
            "esn_name": "Stelya",
            "offer_domains": [
                "MECHANICAL_ENGINEERING",
                "INDUSTRIALIZATION_METHODS",
                "MAINTENANCE_MRO",
                "QUALITY_VALIDATION_HSE",
            ],
        }
    )
    assert profile["offerDomain"] == "industrial_engineering"
    rendered = bellum_signals.build_system_prompt(profile)
    assert "DOMAINE D'OFFRE : INGÉNIERIE INDUSTRIELLE" in rendered


def test_scaffold_domain_gets_its_label_and_generic_blocks():
    rendered = bellum_signals.build_system_prompt({"offerDomain": "supply_chain", "offers": ["Planification S&OP"]})
    assert "DOMAINE D'OFFRE : SUPPLY CHAIN" in rendered
    assert "Offres CDI tech 10+" not in rendered


def test_generic_domain_drops_the_it_prism_even_for_it_offers():
    # Explicitly selecting `generic` must override the IT heuristic.
    profile = {"offers": ["Data & IA", "Cloud AWS"], "offerDomain": "generic"}
    lens = resolve_domain_focus(profile)
    assert lens["label"] == "Data & IA"
    assert "entite du groupe la plus pertinente" in lens["tech_entity_directive"]


def test_deterministic_it_thumb_is_dropped_for_explicit_domains():
    # An IT-looking profile keeps the thumb by default…
    it_profile = {"offers": ["Data & IA", "Cloud AWS"]}
    assert looks_like_it_esn(it_profile) is True
    assert looks_like_it_esn({**it_profile, "offerDomain": "esn_it"}) is True
    assert looks_like_it_esn({**it_profile, "offerDomain": "unknown_domain"}) is True
    # …but an explicit non-default domain drops it, whatever the offers wording.
    assert looks_like_it_esn({**it_profile, "offerDomain": "finance"}) is False
    assert looks_like_it_esn({**it_profile, "offerDomain": "generic"}) is False
    assert looks_like_it_esn(None) is True


# ── 3. Registry hygiene ───────────────────────────────────────────────────────


def test_every_contract_domain_is_registered():
    assert set(OFFER_DOMAIN_PACKS) == set(_ALL_DOMAINS)


def test_default_domain_is_gated_to_none():
    assert get_offer_domain_pack(None) is None
    assert get_offer_domain_pack("") is None
    assert get_offer_domain_pack("esn_it") is None
    assert get_offer_domain_pack("ESN_IT") is None
    assert get_offer_domain_pack("nope") is None
    assert get_offer_domain_pack("finance") is OFFER_DOMAIN_PACKS["finance"]
    assert get_offer_domain_pack(" Finance ") is OFFER_DOMAIN_PACKS["finance"]


def test_normalize_offer_domain_falls_back_to_default():
    assert normalize_offer_domain(None) == DEFAULT_OFFER_DOMAIN
    assert normalize_offer_domain("") == DEFAULT_OFFER_DOMAIN
    assert normalize_offer_domain(42) == DEFAULT_OFFER_DOMAIN
    assert normalize_offer_domain(" FINANCE ") == "finance"


def test_list_offer_domains_is_deterministic_and_default_first():
    listing = list_offer_domains()
    assert listing[0]["code"] == DEFAULT_OFFER_DOMAIN
    assert [m["code"] for m in listing] == [m["code"] for m in list_offer_domains()]
    for meta in listing:
        assert meta["label_fr"] and meta["label_en"]
        assert meta["status"] in ("live", "scaffold")
    by_code = {m["code"]: m for m in listing}
    assert by_code["esn_it"]["status"] == "live"
    assert by_code["finance"]["status"] == "live"
    assert by_code["generic"]["status"] == "live"
    assert by_code["supply_chain"]["status"] == "scaffold"


def test_every_pack_lens_carries_the_full_key_set():
    required = {
        "label",
        "label_long",
        "system_label",
        "budget_signal",
        "tech_entity_directive",
        "sell_examples",
        "signal_grid",
        "challenge_label",
        "play_examples_inline",
        "domain_brief",
    }
    for code, pack in OFFER_DOMAIN_PACKS.items():
        lens = pack.domain_focus({"offers": ["Offre A", "Offre B"]})
        assert required <= set(lens), f"pack {code} misses {required - set(lens)}"
        assert pack.perimeters() and pack.signal_families() and pack.play_examples()


# ── 4. Seller-context mapping (scorer / weekly batch path) ───────────────────


def test_esn_row_maps_offer_domain():
    assert esn_row_to_profile_data({"offer_domain": "finance"}) == {"offerDomain": "finance"}
    assert esn_row_to_profile_data({"offer_domain": "  "}) == {}
    assert esn_row_to_profile_data({"offer_domain": None}) == {}
    assert esn_row_to_profile_data({}) == {}


def test_all_domains_mirrors_the_contract() -> None:
    """Le miroir local suit le contrat TS — ordre compris (c'est l'ordre de
    départage de ``dominant_pack``)."""
    ts_order = offer_domains_from_contract()
    if ts_order is None:
        pytest.skip("monorepo absent (image de déploiement) — la parité se vérifie en CI")
    assert ts_order == _ALL_DOMAINS
