"""7-level source-reliability taxonomy (#2289.8) + the corroboration rule
(#2289.9), for the multi-source research engine (#2769 / LAU-FINAL-030).

Composition, not rewrite: ``source_judge`` already judges datation (status)
and a 3-way quality (strong/weak/reconstruction) per source; this module names
WHICH of the 7 doctrine tiers a provider sits at, using the SAME
``is_weak_source`` config this codebase already maintains. It never
re-implements the weak/reconstruction detection, only refines its placement.

Tiers, most to least reliable (exact French labels from #2289 — doctrine
requires naming, never renumbering silently)::

    officiel > primaire > public fiable > presse reconnue > source secondaire
             > agrégateur > non vérifiable

A provider this module cannot identify is NEVER guessed upward: doctrine is
"on n'affiche pas ce qu'on n'a pas" — an unknown, non-weak provider lands at
``agrégateur`` (an unverified aggregation, not an official/primary claim), not
at ``officiel``. Only two tiers are reachable purely from provider identity
today: ``presse reconnue`` and ``source secondaire`` need a curated
press/secondary-domain registry that does not exist yet (reste — voir le
commentaire d'épopée #2769).
"""

from __future__ import annotations

from collections.abc import Sequence

from app.services.source_quality import is_weak_source

TIER_OFFICIEL = "officiel"
TIER_PRIMAIRE = "primaire"
TIER_PUBLIC_FIABLE = "public fiable"
TIER_PRESSE_RECONNUE = "presse reconnue"
TIER_SOURCE_SECONDAIRE = "source secondaire"
TIER_AGGREGATEUR = "agrégateur"
TIER_NON_VERIFIABLE = "non vérifiable"

# Ordered, most to least reliable — the index IS the rank.
RELIABILITY_TIERS: tuple[str, ...] = (
    TIER_OFFICIEL,
    TIER_PRIMAIRE,
    TIER_PUBLIC_FIABLE,
    TIER_PRESSE_RECONNUE,
    TIER_SOURCE_SECONDAIRE,
    TIER_AGGREGATEUR,
    TIER_NON_VERIFIABLE,
)

# Tiers a claim cannot rely on ALONE when a primary source is expected
# (#2289.9). The bottom three: none of them is a first-hand, checkable record.
_WEAK_TIERS = frozenset({TIER_SOURCE_SECONDAIRE, TIER_AGGREGATEUR, TIER_NON_VERIFIABLE})

# Registres officiels — identité légale / administrative, vérifiable par un
# tiers indépendant du fournisseur qui la sert.
_OFFICIAL_PROVIDERS = frozenset({"pappers", "boamp", "decp", "bodacc", "inpi", "france_travail"})

# Le site propre de l'entreprise, scrapé — source primaire (elle parle
# d'elle-même, mais c'est bien la sienne).
_PRIMARY_PROVIDERS = frozenset({"firecrawl"})

# Recherche web publique généraliste — fiable dans son rôle de repérage, mais
# n'est ni un registre ni la source elle-même.
_PUBLIC_RELIABLE_PROVIDERS = frozenset({"brave"})


def classify_source_reliability(provider: str | None) -> str:
    """One of :data:`RELIABILITY_TIERS` for ``provider`` — never guessed
    upward. ``None``/empty and anything the weak-sources config lists
    (``is_weak_source``, e.g. the ``ia_reconstruction`` marker) is
    ``TIER_NON_VERIFIABLE``; an unrecognised provider is ``TIER_AGGREGATEUR``,
    not silently promoted to a tier this module cannot prove.
    """
    token = str(provider or "").strip().lower()
    if not token:
        return TIER_NON_VERIFIABLE
    if is_weak_source(token):
        return TIER_NON_VERIFIABLE
    if token in _OFFICIAL_PROVIDERS:
        return TIER_OFFICIEL
    if token in _PRIMARY_PROVIDERS:
        return TIER_PRIMAIRE
    if token in _PUBLIC_RELIABLE_PROVIDERS:
        return TIER_PUBLIC_FIABLE
    return TIER_AGGREGATEUR


def has_sufficient_grounding(tiers: Sequence[str], *, primary_expected: bool) -> bool:
    """Rule #2289.9 — ``False`` when ``primary_expected`` and every tier in
    ``tiers`` is one of the three weak tiers (or ``tiers`` is empty): the
    claim would then rest exclusively on non-primary evidence. When a primary
    source isn't expected for this kind of claim, weak tiers alone are fine —
    this function only gates the "affirmation importante" case.
    """
    if not primary_expected:
        return True
    return any(t not in _WEAK_TIERS for t in tiers)
