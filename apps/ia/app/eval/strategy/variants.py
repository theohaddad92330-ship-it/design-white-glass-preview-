"""A/B variants for the #274 strategy-output campaign — levers as CONFIG.

A variant is a **named set of environment overrides**, never a code edit. That is
what makes the A/B honest: ``baseline`` sets nothing at all, so it exercises the
exact production code path, and every other variant differs from it only by the
env vars listed here.

Levers (all no-op at their default — see ``app/prompts/strategy_levers.py``):

* ``STRATEGY_MAX_TOKENS`` — hard cap on the generation (default 12000).
* ``STRATEGY_CONCISION``  — ``off`` | ``on`` | ``strict`` concision block.
* ``STRATEGY_SCHEMA``     — ``full`` | ``tight`` JSON-schema annotations.

L'axe « modèle »
----------------
Changer de modèle est exactement le même genre de levier : le routage de la
passerelle (``app/services/llm_gateway.py``) et la table des modèles
(``app/services/model_policy.py``) se pilotent tous les deux par
l'environnement. Un bras « ce modèle-là » est donc une entrée de dictionnaire,
pas du code :

* ``LLM_ROUTE_<TÂCHE>`` — ``strategy`` → ``openai:gpt-5.6-luna`` : change le
  FOURNISSEUR et le modèle d'une tâche.
* ``MODEL_<PROMPT_NAME>`` — ``MODEL_BELLUM_STRATEGY=claude-haiku-4-5`` : change
  le modèle qu'un prompt demande, chez le même fournisseur.

:func:`model_variant` fabrique ces variantes à la demande ; le registre livré
plus bas reste **inchangé**, et aucun défaut de production ne bouge.

Adding a variant = adding an entry here. No production code changes, which is
why nothing in this module can alter shipped behaviour on its own.
"""

from __future__ import annotations

import os
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

# The production default, restated so a variant can be diffed against it and so
# ``baseline`` is provably "change nothing".
DEFAULT_STRATEGY_MAX_TOKENS = 12000

BASELINE = "baseline"


@dataclass(frozen=True)
class Variant:
    """One A/B arm: a name, a rationale, and the env overrides it applies."""

    name: str
    description: str
    env: dict[str, str] = field(default_factory=dict)

    @property
    def is_baseline(self) -> bool:
        return not self.env

    def max_tokens(self) -> int:
        return int(self.env.get("STRATEGY_MAX_TOKENS", DEFAULT_STRATEGY_MAX_TOKENS))

    def as_dict(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description, "env": dict(self.env)}


# ── the shipped variant registry ──────────────────────────────────────────────

VARIANTS: dict[str, Variant] = {
    BASELINE: Variant(
        BASELINE,
        "Production telle quelle — AUCUN override. C'est le point de comparaison.",
        {},
    ),
    "cap-8k": Variant(
        "cap-8k",
        "Plafond de génération 12000 → 8000 tokens. Levier le plus brutal : mesure "
        "d'abord si le modèle utilise vraiment son budget.",
        {"STRATEGY_MAX_TOKENS": "8000"},
    ),
    "cap-6k": Variant(
        "cap-6k",
        "Plafond 6000 tokens. Attention : un plafond trop bas fait TRONQUER la sortie "
        "(ClaudeError) au lieu de la raccourcir — surveiller les erreurs, pas juste les tokens.",
        {"STRATEGY_MAX_TOKENS": "6000"},
    ),
    "concise": Variant(
        "concise",
        "Bloc de concision dans le system prompt : respecter les minimas du schéma sans "
        "les dépasser, zéro reformulation. Ne retire aucun champ requis.",
        {"STRATEGY_CONCISION": "on"},
    ),
    "concise-strict": Variant(
        "concise-strict",
        "Concision stricte : exactement le minimum du schéma, phrases courtes.",
        {"STRATEGY_CONCISION": "strict"},
    ),
    "tight-schema": Variant(
        "tight-schema",
        "Schéma resserré : les compteurs « MIN 4, viser 5 » deviennent « EXACTEMENT 4 » "
        "et les budgets de prose les plus longs sont réduits.",
        {"STRATEGY_SCHEMA": "tight"},
    ),
    "tight-concise": Variant(
        "tight-concise",
        "Combo schéma resserré + concision — la variante la plus agressive sans toucher "
        "au plafond de tokens.",
        {"STRATEGY_SCHEMA": "tight", "STRATEGY_CONCISION": "on"},
    ),
    "tight-concise-cap8k": Variant(
        "tight-concise-cap8k",
        "Combo complet : schéma resserré + concision + plafond 8000.",
        {"STRATEGY_SCHEMA": "tight", "STRATEGY_CONCISION": "on", "STRATEGY_MAX_TOKENS": "8000"},
    ),
}


def get_variant(name: str) -> Variant:
    if name not in VARIANTS:
        raise KeyError(f"Unknown variant {name!r}. Known: {', '.join(sorted(VARIANTS))}")
    return VARIANTS[name]


def variant_names() -> list[str]:
    return sorted(VARIANTS)


@contextmanager
def applied(variant: Variant, environ: dict[str, str] | None = None) -> Iterator[None]:
    """Temporarily apply a variant's env overrides, then restore exactly.

    ``baseline`` applies nothing, so the block runs under untouched production
    configuration. Restoration deletes keys that were absent rather than setting
    them to ``""`` — an empty string is a *different* configuration from unset.
    """
    env = environ if environ is not None else os.environ
    previous: dict[str, str | None] = {k: env.get(k) for k in variant.env}
    try:
        env.update(variant.env)
        yield
    finally:
        for key, old in previous.items():
            if old is None:
                env.pop(key, None)
            else:
                env[key] = old


def describe(variant: Variant) -> str:
    if variant.is_baseline:
        return f"{variant.name} (aucun override — production)"
    overrides = ", ".join(f"{k}={v}" for k, v in sorted(variant.env.items()))
    return f"{variant.name} ({overrides})"


def diff_from_baseline(variant: Variant) -> Mapping[str, str]:
    """The env overrides that make this variant differ from production."""
    return dict(variant.env)


# ── l'axe « modèle » ──────────────────────────────────────────────────────────

#: Le fournisseur sous-entendu quand on écrit juste ``claude-haiku-4-5``.
DEFAULT_PROVIDER = "anthropic"

#: Préfixe d'un nom de bras fabriqué à la volée depuis un identifiant de modèle.
MODEL_VARIANT_PREFIX = "model:"


def known_providers() -> tuple[str, ...]:
    """Les fournisseurs que la PASSERELLE connaît — jamais une copie locale.

    Import paresseux : ``llm_gateway`` tire ``claude_service`` (donc anthropic,
    instructor, sentry), et ce module doit rester importable à froid.
    """
    from app.services.llm_gateway import _PROVIDERS

    return tuple(sorted(_PROVIDERS))


@dataclass(frozen=True)
class ModelSpec:
    """Un modèle candidat : son fournisseur et son identifiant."""

    provider: str
    model: str

    @classmethod
    def parse(cls, raw: str) -> ModelSpec:
        """``"claude-haiku-4-5"`` ou ``"openai:gpt-5.6-luna"``.

        Un préfixe présent DOIT être un fournisseur connu : sans cette règle,
        ``"opnai:gpt-4o"`` deviendrait silencieusement un modèle Anthropic
        nommé ``opnai:gpt-4o``, et le banc comparerait autre chose que ce qu'on
        lui a demandé.
        """
        text = (raw or "").strip()
        if not text:
            raise ValueError("identifiant de modèle vide")
        head, sep, tail = text.partition(":")
        if not sep:
            return cls(DEFAULT_PROVIDER, text)
        provider = head.strip().lower()
        if provider not in known_providers():
            raise ValueError(
                f"fournisseur inconnu : {head!r}. Connus : {', '.join(known_providers())}. "
                "Un modèle sans préfixe est routé sur " + DEFAULT_PROVIDER + "."
            )
        model = tail.strip()
        if not model:
            raise ValueError(f"identifiant de modèle manquant après {head!r}:")
        return cls(provider, model)

    @property
    def label(self) -> str:
        """La forme TOUJOURS explicite — c'est elle qui est écrite au rapport."""
        return f"{self.provider}:{self.model}"

    @property
    def route_value(self) -> str:
        """La valeur attendue par ``LLM_ROUTE_<TÂCHE>``."""
        return self.label


def model_env(
    spec: ModelSpec,
    *,
    tasks: Sequence[str] = (),
    prompts: Sequence[str] = (),
) -> dict[str, str]:
    """Les surcharges d'environnement qui posent ``spec`` sur ces tâches/prompts."""
    env = {f"LLM_ROUTE_{task.upper()}": spec.route_value for task in tasks}
    env.update({f"MODEL_{prompt.upper()}": spec.model for prompt in prompts})
    return env


def model_variant(
    spec: ModelSpec,
    *,
    tasks: Sequence[str] = (),
    prompts: Sequence[str] = (),
    name: str | None = None,
    description: str | None = None,
) -> Variant:
    """Un bras A/B « ce modèle-là », fabriqué à la volée.

    Rien n'est enregistré dans :data:`VARIANTS` : un modèle candidat est une
    QUESTION du moment, pas une décision de produit. Le registre livré ne porte
    donc aucune surcharge de modèle — ``tests/test_model_bench.py`` le vérifie.
    """
    env = model_env(spec, tasks=tasks, prompts=prompts)
    if not env:
        raise ValueError("un bras « modèle » doit viser au moins une tâche ou un prompt")
    return Variant(
        name or f"{MODEL_VARIANT_PREFIX}{spec.label}",
        description or (
            f"Modèle {spec.label} sur "
            + (", ".join(tasks) if tasks else "")
            + (" / " if tasks and prompts else "")
            + (", ".join(prompts) if prompts else "")
            + ". Mesure seule — aucun défaut de production ne change."
        ),
        env,
    )
