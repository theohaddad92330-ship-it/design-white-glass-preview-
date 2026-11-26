"""#2975 (#2440.74-80) — le routage fournisseur VÉRIFIE avant de router.

Sept vérifications, chacune rendant ``ok`` / ``failed`` / ``not_evaluated`` :
capacité, outils, multimodal, contexte, coût, conformité, santé. Une donnée
absente (fenêtre d'un modèle inconnu, tarif absent, aucune liste de conformité
posée) est ``not_evaluated`` — jamais « ok » par défaut, jamais « failed »
par soupçon : seul ``failed`` bloque, et le repli (Anthropic) est annoncé.

Fonction PURE : aucune lecture d'environnement ni d'état global ici — la
passerelle (``llm_gateway``) donne les exigences et les faits mesurés.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Status = Literal["ok", "failed", "not_evaluated"]

#: Échecs d'exécution consécutifs au-delà desquels un fournisseur est dit malsain.
HEALTH_FAILURE_THRESHOLD = 3


@dataclass(frozen=True)
class RoutingRequirements:
    """Ce que l'APPEL exige — déclaré par lui, jamais déduit du fournisseur."""

    structured_output: bool = False
    needs_tools: bool = False
    needs_multimodal: bool = False
    estimated_input_tokens: int | None = None
    max_output_tokens: int | None = None
    #: Plafond de coût de sortie, USD par million de jetons. ``None`` = aucun plafond posé.
    max_output_usd_per_mtok: float | None = None
    #: Fournisseurs autorisés pour des données personnelles. ``None`` = aucune liste posée.
    cleared_providers: frozenset[str] | None = None


@dataclass(frozen=True)
class FitCheck:
    name: str
    status: Status
    detail: str


@dataclass(frozen=True)
class FitVerdict:
    checks: tuple[FitCheck, ...]

    @property
    def failed(self) -> tuple[str, ...]:
        return tuple(c.name for c in self.checks if c.status == "failed")

    @property
    def fit(self) -> bool:
        return not self.failed


#: Capacités CONNUES par fournisseur : (sortie structurée, outils, multimodal).
_CAPABILITIES: dict[str, tuple[bool, bool, bool]] = {
    "anthropic": (True, True, True),
    "openai": (True, True, True),
}

#: Fenêtres de contexte (jetons) connues, par PRÉFIXE de modèle, le plus spécifique d'abord.
#: Un modèle absent de cette table n'est pas évalué, jamais deviné.
_CONTEXT_WINDOWS: tuple[tuple[str, int], ...] = (
    ("claude", 200_000),
    ("gpt-4o", 128_000),
    ("gpt-4.1", 1_000_000),
    ("o4-mini", 200_000),
    ("o3", 200_000),
)


def _window(model: str) -> int | None:
    low = (model or "").lower()
    for prefix, window in _CONTEXT_WINDOWS:
        if low.startswith(prefix):
            return window
    return None


def check_provider_fit(
    provider: str,
    model: str,
    req: RoutingRequirements,
    *,
    output_usd_per_mtok: float | None = None,
    runtime_failure_streak: int = 0,
) -> FitVerdict:
    caps = _CAPABILITIES.get(provider)
    checks: list[FitCheck] = []

    def capability(name: str, index: int, needed: bool, label: str) -> FitCheck:
        if caps is None:
            return FitCheck(name, "not_evaluated", f"profil du fournisseur « {provider} » inconnu")
        if not needed:
            return FitCheck(name, "ok", f"{label} non exigé")
        if caps[index]:
            return FitCheck(name, "ok", f"{label} pris en charge")
        return FitCheck(name, "failed", f"{label} exigé, non pris en charge par {provider}")

    checks.append(capability("capability", 0, req.structured_output, "sortie structurée"))
    checks.append(capability("tools", 1, req.needs_tools, "outils"))
    checks.append(capability("multimodal", 2, req.needs_multimodal, "multimodal"))

    if req.estimated_input_tokens is None:
        checks.append(FitCheck("context", "not_evaluated", "taille de l'appel non estimée"))
    else:
        window = _window(model)
        needed = req.estimated_input_tokens + (req.max_output_tokens or 0)
        if window is None:
            checks.append(FitCheck("context", "not_evaluated", f"fenêtre du modèle « {model} » inconnue"))
        elif needed > window:
            checks.append(FitCheck("context", "failed", f"{needed} jetons nécessaires, fenêtre de {window}"))
        else:
            checks.append(FitCheck("context", "ok", f"{needed} jetons nécessaires, fenêtre de {window}"))

    if req.max_output_usd_per_mtok is None:
        checks.append(FitCheck("cost", "not_evaluated", "aucun plafond de coût posé"))
    elif output_usd_per_mtok is None:
        checks.append(FitCheck("cost", "not_evaluated", f"tarif du modèle « {model} » inconnu"))
    elif output_usd_per_mtok > req.max_output_usd_per_mtok:
        checks.append(
            FitCheck("cost", "failed", f"{output_usd_per_mtok} $/M en sortie, plafond {req.max_output_usd_per_mtok}")
        )
    else:
        checks.append(FitCheck("cost", "ok", f"{output_usd_per_mtok} $/M en sortie sous le plafond"))

    if req.cleared_providers is None:
        checks.append(FitCheck("compliance", "not_evaluated", "aucune liste de conformité posée"))
    elif provider in req.cleared_providers:
        checks.append(FitCheck("compliance", "ok", f"{provider} autorisé pour des données personnelles"))
    else:
        checks.append(FitCheck("compliance", "failed", f"{provider} hors de la liste autorisée"))

    if runtime_failure_streak >= HEALTH_FAILURE_THRESHOLD:
        checks.append(FitCheck("health", "failed", f"{runtime_failure_streak} échecs d'exécution consécutifs"))
    else:
        checks.append(FitCheck("health", "ok", f"{runtime_failure_streak} échec(s) d'exécution consécutif(s)"))

    return FitVerdict(tuple(checks))
