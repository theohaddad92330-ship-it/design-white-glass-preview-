"""Domain focus — dé-siloter du IT/data (Drive #9, BESOINS MÉTIERS + PDF6 §1).

The pipeline prompts historically hard-code an IT/digital lens : « Budget IT
visible », « identifie l'entité IT/digitale = cible n°1 d'un ESN », « décideur IT
DSI/CTO/RSSI », « défis IT ». That silos the reasoning to an IT-services ESN — a
cyber-only, ERP, data or non-IT engineering ESN gets reasoned about through the
wrong lens. This module derives the DOMAIN LENS so the prompts specialise via
the seller's *actual* domain instead of an assumed IT one. Two mechanisms:

1. **Explicit offer domain (PDF6 §1 — pluggable).** When the seller profile
   carries a registered NON-default ``offerDomain`` (finance, supply_chain, …),
   the matching :mod:`~app.services.offer_domains` pack supplies the whole lens
   (labels + signal grid + play vocabulary + domain brief). Selecting the
   domain IS the switch — no env flag. See ``agent_docs/offer-domains.md``.
2. **Heuristic dé-silo (Drive #9 — historical).** Without an explicit domain
   (or with the default ``esn_it``), the lens is derived from the ESN's own
   offers exactly as before — the ``_looks_like_it_esn`` guard keeps it safe.

SAFETY — the default is what protects prod:

1. An ESN whose profile reads as IT (the current customer) — or a profile with
   no declared offers, an absent/unknown ``offerDomain`` or the default
   ``offerDomain == "esn_it"`` — resolves to the exact historical IT strings,
   so rendered prompts stay byte-identical (the golden tests lock this:
   ``tests/test_prompt_golden.py``, ``tests/test_domain_focus_user_prompts.py``,
   ``tests/test_offer_domains.py``).
2. Only a genuinely non-IT ESN (heuristic, unchanged) or an explicitly-selected
   non-default domain (registry) gets a generalised / domain lens.
"""

from __future__ import annotations

from typing import Any

from app.services.offer_domains import get_offer_domain_pack, normalize_offer_domain
from app.services.portfolio_context import portfolio_context_block
from app.services.offer_domains.esn_it import DEFAULT_BLOCKS, IT_FOCUS

# Exact historical IT strings — single source of truth in
# ``offer_domains.esn_it`` (this IS the current prompt wording; any drift there
# surfaces as a failing golden diff).
_IT_FOCUS: dict[str, str] = IT_FOCUS

# Signals that a profile is (already) an IT-services ESN → keep the IT lens so no
# current customer's output shifts. Deliberately broad.
_IT_KEYWORDS = (
    "data",
    "cloud",
    "cyber",
    "dev",
    "logiciel",
    "software",
    "digital",
    "numeriq",
    "numériq",
    "infra",
    "reseau",
    "réseau",
    "informatiq",
    "tech",
    "devops",
    "sap",
    "erp",
    "web",
    "mobile",
    " si ",
    "dsi",
    " ia",
    " ml",
    "sirh",
    "esn",
)


def _profile_offers(profile_data: dict[str, Any]) -> list[str]:
    """The ESN's declared offers, tolerant of the two key spellings used across
    the pipeline (``offers``) and the profiler (``core_offers``)."""
    raw = profile_data.get("offers") or profile_data.get("core_offers") or []
    return [str(o).strip() for o in raw if str(o).strip()]


def _looks_like_it_esn(profile_data: dict[str, Any]) -> bool:
    """An ESN reads as IT when its offers / sectors / positioning mention any IT
    keyword — or when it declares no offers at all (unknown → keep the safe IT
    default rather than guess a domain)."""
    offers = _profile_offers(profile_data)
    if not offers:
        return True
    hay = " ".join(
        str(x)
        for x in [
            *offers,
            # #3673.7 — un SECTEUR n'est pas une expertise : « numérique » ou
            # « data centers » parmi les secteurs servis ne fait pas d'une ESN
            # d'ingénierie une ESN IT (aucune conversion implicite).
            profile_data.get("positioning") or "",
            profile_data.get("mainChallenge") or "",
        ]
    ).lower()
    return any(k in hay for k in _IT_KEYWORDS)


def looks_like_it_esn(profile_data: dict[str, Any] | None) -> bool:
    """Public: does this ESN profile read as an IT-services ESN (or is it absent)?

    Used by the **deterministic** phase-3/4 services (``prioritization`` P1
    boost, ``entities`` strategic-badge / relevance override) to decide whether
    to keep the historical IT thumb-on-the-scale. UNLIKE
    :func:`resolve_domain_focus` this is **flag-independent** — the
    deterministic dé-silo is profile-driven and always-on (Drive #9 phase 3, no
    new env flag). Its safety comes entirely from the default, not a flag:

    - ``None`` / ``{}`` / no declared offers  → ``True``  (current customer, or a
      run without a profile at the call site) → the IT behaviour is unchanged;
    - an IT-services ESN profile              → ``True``  → unchanged;
    - a genuinely non-IT ESN profile          → ``False`` → the IT-specific signal
      is dropped (the target's IT arm is no longer auto-P1 / auto-strategic);
    - an EXPLICIT registered non-default ``offerDomain`` (PDF6 §1) → ``False`` —
      a seller who selected finance/supply-chain/… must not get the IT
      thumb-on-the-scale, whatever its offers wording. ``esn_it`` / absent /
      unknown values keep the heuristic (byte-identical default).

    So the IT / no-profile / default-domain path stays byte-identical; only a
    non-IT ESN (or an explicit non-default domain) shifts.
    """
    profile_data = profile_data or {}
    if get_offer_domain_pack(profile_data.get("offerDomain")) is not None:
        return False
    return _looks_like_it_esn(profile_data)


def offers_or_default(
    profile_data: dict[str, Any] | None,
    *,
    it_default: list[str],
    keys: tuple[str, ...] = ("offers", "core_offers"),
) -> list[str] | str:
    """Offres à interpoler dans un prompt (#3673.4) — sans biais IT par défaut.

    Offres déclarées → rendues telles quelles (chemin historique). Aucune offre
    déclarée : un profil IT / absent garde ``it_default`` (byte-identique, golden) ;
    un vendeur d'un domaine non-IT explicite n'hérite JAMAIS de « conseil IT » —
    il reçoit une mention neutre qui n'en suppose aucune.
    """
    profile_data = profile_data or {}
    for key in keys:
        declared = profile_data.get(key)
        if declared:
            return declared
    if looks_like_it_esn(profile_data):
        return it_default
    return "non précisées (n'en suppose aucune)"


def _resolve_domain_lens(profile_data: dict[str, Any] | None) -> dict[str, str]:
    """Domain-lens labels + prompt blocks the prompts interpolate.

    Resolution order (first match wins):

    1. EXPLICIT registered non-default ``offerDomain`` → the pack's full lens
       (labels + ``signal_grid`` / ``challenge_label`` / ``play_examples_inline``
       / ``domain_brief`` blocks).
    2. IT-looking ESN / no offers / default-or-unknown domain → the exact
       historical IT strings + the historical blocks (byte-identical prompts).
    3. Genuinely non-IT ESN without an explicit domain → the historical
       offers-derived generalisation (Drive #9), with the historical blocks —
       unchanged behaviour.
    """
    profile_data = profile_data or {}
    pack = get_offer_domain_pack(profile_data.get("offerDomain"))
    if pack is not None:
        focus = pack.domain_focus(profile_data)
        # Portefeuille de domaines (DATAFORGE V10) : quand le profil en porte
        # un, la lentille énumère SES libellés plutôt que les offres libres —
        # « Risques, conformité, AML/KYC » dit au prompt ce que l'ESN vend là
        # où « nos consultants » ne disait rien. UNIQUEMENT sur le chemin pack
        # (offerDomain non-défaut) : le chemin esn_it/absent reste plus bas,
        # byte-identique — un portefeuille 100 % tech résout le pack dominant
        # `esn_it`, donc `pack is None`, donc ne passe jamais ici.
        names = [str(name) for name in (profile_data.get("offerPortfolioNames") or []) if str(name).strip()]
        if names:
            focus = {
                **focus,
                "label_long": " / ".join(names[:3]),
                "sell_examples": ", ".join(names[:4]),
            }
        return focus

    if _looks_like_it_esn(profile_data):
        return {**_IT_FOCUS, **DEFAULT_BLOCKS}

    offers = _profile_offers(profile_data)
    label = offers[0]
    label_long = " / ".join(offers[:3])
    return {
        "label": label,
        "label_long": label_long,
        "system_label": "périmètre métier",
        "budget_signal": (f"Budget {label} visible (recrutements/CDI sur le domaine, AO recents, transfo majeure)"),
        # Point the entity hunt at the ESN's own domain instead of an assumed IT
        # subsidiary; use the ESN's declared offers as the concrete sell examples.
        "tech_entity_directive": (
            f"IMPERATIF: identifie l'entite du groupe la plus pertinente pour le domaine « {label_long} » "
            "(filiale, direction ou BU qui porte ce metier) et inclus-la TOUJOURS — c'est la cible n1 d'un "
            "ESN. Pour un groupe federe / confederation (plusieurs groupes autonomes), liste les branches "
            "majeures ET l'entite metier de chacune, pas seulement la branche du SIREN resolu."
        ),
        "sell_examples": ", ".join(offers[:4]),
        # The prompt BLOCKS stay the historical ones on this heuristic path —
        # today they are profile-independent, and only an EXPLICIT domain pack
        # may swap them (précaution : le dé-silo dérivé garde le comportement
        # actuel à l'octet près).
        **DEFAULT_BLOCKS,
    }


def resolve_domain_focus(profile_data: dict[str, Any] | None) -> dict[str, str]:
    """La lentille de domaine, PLUS ce que le portefeuille d'offre ajoute.

    Le bloc du portefeuille (secteurs d'application, politique de site, lexique)
    est append au ``domain_brief`` et NULLE PART ailleurs. C'est ce que demande
    le §17.1 de l'addendum — « construit une fois, pas recopié dans huit prompts
    divergents » — et c'est ce qui fait qu'aucun prompt n'a eu à être modifié :
    tous interpolent déjà ``domain_brief``.

    Sans portefeuille enregistré, le bloc vaut ``""`` et la lentille est
    exactement celle d'avant, à l'octet près (goldens).
    """
    focus = _resolve_domain_lens(profile_data)
    block = portfolio_context_block(profile_data)
    if not block:
        return focus
    return {**focus, "domain_brief": f"{focus.get('domain_brief', '')}{block}"}


#: Le pack du domaine INDUSTRIEL. Nommé ici plutôt que recopié chez ses
#: appelants : un code de pack écrit en dur dans trois services est un code de
#: pack qu'on oublie de changer dans le troisième.
INDUSTRIAL_PACK = "industrial_engineering"


def is_industrial_seller(profile_data: dict[str, Any] | None) -> bool:
    """Le VENDEUR est-il une société de conseil en ingénierie industrielle ?

    Lu depuis le pack dominant de son portefeuille (déterministe). Profil vide,
    inconnu ou IT ⇒ ``False`` ⇒ tout appelant garde son comportement historique
    à l'octet près — ce qui est la seule façon d'ajouter une chaîne de décision
    sans changer celle de tous les clients existants.
    """
    return normalize_offer_domain((profile_data or {}).get("offerDomain")) == INDUSTRIAL_PACK


_FRENCH_ZONE_MARKERS = (
    "france", "paris", "île-de-france", "ile-de-france", "lyon", "auvergne", "rhône", "rhone", "lille",
    "hauts-de-france", "nantes", "pays de la loire", "bordeaux", "aquitaine", "toulouse", "occitanie",
    "marseille", "paca", "provence", "strasbourg", "grand est", "rennes", "bretagne", "bourgogne",
    "franche-comté", "normandie", "aura", "bfc",
)  # fmt: skip


def home_country_for(profile_data: dict[str, Any] | None) -> str | None:
    """LUDB.6 — « France » quand le vendeur INDUSTRIEL déclare une zone française.

    Réservé au pack industriel : un espace IT garde son classement byte-identique.
    Zone absente, « International » ou non reconnue ⇒ ``None`` (rien de deviné).
    """
    if not is_industrial_seller(profile_data):
        return None
    zone = str((profile_data or {}).get("geoZone") or "").strip().lower()
    if not zone or "international" in zone:
        return None
    return "France" if any(marker in zone for marker in _FRENCH_ZONE_MARKERS) else None
