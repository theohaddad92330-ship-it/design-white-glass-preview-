"""Self-consistency (chantier A1) — double dérivation des jugements LLM clés.

ON PAR DÉFAUT (politique zéro-flag). Kill-switch break-glass uniquement :
``SELF_CONSISTENCY_DISABLED=true`` (défaut absent = mesure active).

On ne double NI la collecte (déterministe) NI le pipeline — seuls les JUGEMENTS
clés reçoivent un 2e appel indépendant (même contexte, prompt de re-dérivation) :

- **score** : le score /25 + verdict GO/PRUDENT/STOP — ré-échantillonnage à
  l'identique de la section ``evaluation`` de BELLUM-PLAN (même system prompt
  caché → lecture cache ~0.1×, même user prompt) ;
- **plays** : le top-3 des plays / périmètres prioritaires — re-dérivé depuis
  les listes candidates du dossier, ré-ordonnées alphabétiquement (la passe 2
  ne voit jamais le tri de la passe 1) ;
- **contacts** : la qualification des 5 contacts prioritaires — re-dérivée
  depuis la liste de contacts NETTOYÉE (nom/poste/entité, sans priority/role
  de la passe 1).

RÈGLES DURES :

- La valeur RETENUE est TOUJOURS la passe 1 (comportement stable) — la passe 2
  mesure, elle n'écrase jamais.
- Comparaison structurelle 100 % déterministe : accord → confiance ``high`` ;
  divergence → ``medium``/``low`` + ``divergences[]`` (quoi, valeurs des 2
  passes).
- Échec gracieux : une passe 2 qui échoue (API down, sortie inparsable) donne
  une section ``unmeasured`` (« non mesurée »), JAMAIS un run cassé.
- Le coût de la 2e passe remonte dans ``_api_metrics.token_usage`` de la phase
  plan → accumulé par le worker dans ``cost_eur`` comme le reste.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Sequence
from typing import Any

from app.prompts import bellum_self_consistency
from app.prompts.bellum_plan import build_subsection_user_prompt
from app.services.account_score import score_from_breakdown, verdict_for_score
from app.services.claude_service import CLAUDE_HAIKU_MODEL, TokenUsage
from app.services.kill_switch import SELF_CONSISTENCY_KILL_SWITCH, disabled
from app.services.text_norm import normalize_name

logger = logging.getLogger(__name__)

# ── Confidence tiers (déterministes) ─────────────────────────────────────────
CONFIDENCE_HIGH = "high"
CONFIDENCE_MEDIUM = "medium"
CONFIDENCE_LOW = "low"
CONFIDENCE_UNMEASURED = "unmeasured"

# Ordre de sévérité pour l'agrégat : l'overall est la PIRE section mesurée.
_CONFIDENCE_RANK = {CONFIDENCE_LOW: 0, CONFIDENCE_MEDIUM: 1, CONFIDENCE_HIGH: 2}

# Score /25 : même verdict + écart ≤ ce seuil = accord franc (haute confiance).
_SCORE_DELTA_HIGH = 2

# Recouvrement (ratio d'intersection sur la passe 1) → tier, pour les sections
# ensemblistes (plays / contacts). ≥ high → haute ; ≥ medium → moyenne ; sinon basse.
_PLAYS_HIGH_RATIO = 0.99  # 3/3 (ou n/n) — tout le top confirmé
_PLAYS_MEDIUM_RATIO = 0.5
_CONTACTS_HIGH_RATIO = 0.8  # 4/5
_CONTACTS_MEDIUM_RATIO = 0.6  # 3/5

# Bornes de la 2e passe (sorties courtes : un jugement, pas une génération).
# 16/10/2026 : 2000 tronquait la 2e passe 2 fois en prod (abandon à 60 s) -> 4000.
_EVAL_MAX_TOKENS = 4000
_PLAYS_MAX_TOKENS = 800
_CONTACTS_MAX_TOKENS = 1000

# Combien de contacts prioritaires (passe 1) on confronte à la re-dérivation.
_TOP_CONTACTS = 5

# Le type du point d'entrée LLM (signature de ``call_claude``). Passé par
# l'appelant (module ``phase4_plan``) pour que les tests qui patchent
# ``app.routers.phase4_plan.call_claude`` restent hermétiques — le service ne
# déclenche jamais un vrai appel réseau de son propre chef.
LlmCall = Callable[..., Awaitable[tuple[Any, TokenUsage]]]


def is_enabled() -> bool:
    """ON par défaut ; ``SELF_CONSISTENCY_DISABLED`` (break-glass) coupe tout.

    La lecture passe par le registre (``kill_switch.py``) — même comparaison au
    byte près qu'avant, mais UN seul endroit déclare l'interrupteur, donc il a
    une surface opérateur.
    """
    return not disabled(SELF_CONSISTENCY_KILL_SWITCH)


# ── Sections : constructeurs déterministes ───────────────────────────────────


def _unmeasured(reason: str) -> dict[str, Any]:
    """Échec gracieux (règle 2) : « non mesurée », jamais un run cassé."""
    return {"agree": None, "confidence": CONFIDENCE_UNMEASURED, "reason": reason}


def compare_score(pass1: dict[str, Any], pass2: dict[str, Any]) -> dict[str, Any]:
    """Compare structurellement le jugement de score des deux passes.

    ``pass_n`` = ``{"score": int (/25), "verdict": "GO"|"PRUDENT"|"STOP"}`` —
    déjà normalisés par la MÊME règle déterministe (clamp par axe + somme +
    bande), donc la comparaison ne mesure que la variance du JUGEMENT LLM.
    """
    s1, v1 = int(pass1["score"]), str(pass1["verdict"])
    s2, v2 = int(pass2["score"]), str(pass2["verdict"])
    if v1 == v2 and abs(s1 - s2) <= _SCORE_DELTA_HIGH:
        return {"agree": True, "confidence": CONFIDENCE_HIGH, "pass1": pass1, "pass2": pass2}
    if v1 == v2:
        return {
            "agree": True,
            "confidence": CONFIDENCE_MEDIUM,
            "pass1": pass1,
            "pass2": pass2,
            "divergence": {"what": "score", "pass1": s1, "pass2": s2},
        }
    return {
        "agree": False,
        "confidence": CONFIDENCE_LOW,
        "pass1": pass1,
        "pass2": pass2,
        "divergence": {"what": "verdict", "pass1": {"score": s1, "verdict": v1}, "pass2": {"score": s2, "verdict": v2}},
    }


def _compare_name_sets(
    what: str,
    pass1: Sequence[str],
    pass2: Sequence[str],
    *,
    high_ratio: float,
    medium_ratio: float,
) -> dict[str, Any]:
    """Comparaison ensembliste (normalisée accents/casse) de deux listes de noms.

    Le ratio = |intersection| / |passe 1| : « quelle part du top retenu la 2e
    dérivation confirme-t-elle ? ». Ordre ignoré (le jugement mesuré est QUI est
    dans le top, pas son rang exact).
    """
    set1 = {normalize_name(n) for n in pass1 if normalize_name(n)}
    set2 = {normalize_name(n) for n in pass2 if normalize_name(n)}
    if not set1:
        return _unmeasured(f"aucune valeur de passe 1 à confirmer ({what})")
    overlap = set1 & set2
    ratio = len(overlap) / len(set1)
    base: dict[str, Any] = {
        "pass1": list(pass1),
        "pass2": list(pass2),
        "overlap": len(overlap),
    }
    if ratio >= high_ratio:
        return {"agree": True, "confidence": CONFIDENCE_HIGH, **base}
    only1 = [n for n in pass1 if normalize_name(n) not in set2]
    only2 = [n for n in pass2 if normalize_name(n) not in set1]
    divergence = {"what": what, "pass1": only1, "pass2": only2}
    tier = CONFIDENCE_MEDIUM if ratio >= medium_ratio else CONFIDENCE_LOW
    return {"agree": False, "confidence": tier, **base, "divergence": divergence}


def compare_plays(pass1: Sequence[str], pass2: Sequence[str]) -> dict[str, Any]:
    return _compare_name_sets(
        "plays", pass1, pass2, high_ratio=_PLAYS_HIGH_RATIO, medium_ratio=_PLAYS_MEDIUM_RATIO
    )


def compare_contacts(pass1: Sequence[str], pass2: Sequence[str]) -> dict[str, Any]:
    return _compare_name_sets(
        "contacts", pass1, pass2, high_ratio=_CONTACTS_HIGH_RATIO, medium_ratio=_CONTACTS_MEDIUM_RATIO
    )


def overall_confidence(sections: dict[str, dict[str, Any]]) -> str:
    """L'agrégat honnête : la PIRE confiance mesurée ; « unmeasured » si rien ne l'est."""
    measured = [
        s["confidence"] for s in sections.values() if s.get("confidence") in _CONFIDENCE_RANK
    ]
    if not measured:
        return CONFIDENCE_UNMEASURED
    return min(measured, key=lambda c: _CONFIDENCE_RANK[c])


# ── Transparence (règle 3) : phrases FR lisibles par le dossier / le chat ─────

_SECTION_LABELS = {"score": "le score", "plays": "les plays prioritaires", "contacts": "les contacts prioritaires"}


def _notes(sections: dict[str, dict[str, Any]]) -> list[str]:
    out: list[str] = []
    score = sections.get("score") or {}
    if score.get("confidence") == CONFIDENCE_HIGH:
        p1 = score.get("pass1") or {}
        out.append(f"Score confirmé par double passe ({p1.get('score')}/25 {p1.get('verdict')} aux deux passes).")
    elif score.get("confidence") == CONFIDENCE_MEDIUM:
        p1, p2 = score.get("pass1") or {}, score.get("pass2") or {}
        out.append(
            f"Score confirmé en tendance (même verdict {p1.get('verdict')}, "
            f"{p1.get('score')}/25 vs {p2.get('score')}/25 en double passe)."
        )
    elif score.get("confidence") == CONFIDENCE_LOW:
        p1, p2 = score.get("pass1") or {}, score.get("pass2") or {}
        out.append(
            f"Divergence détectée sur le score : passe 1 {p1.get('verdict')} ({p1.get('score')}/25) "
            f"vs passe 2 {p2.get('verdict')} ({p2.get('score')}/25) — verdict retenu : passe 1."
        )
    for key in ("plays", "contacts"):
        section = sections.get(key) or {}
        label = _SECTION_LABELS[key]
        if section.get("confidence") == CONFIDENCE_HIGH:
            out.append(f"Double passe : {label} sont confirmés.")
        elif section.get("confidence") in (CONFIDENCE_MEDIUM, CONFIDENCE_LOW):
            div = section.get("divergence") or {}
            only2 = ", ".join(str(n) for n in (div.get("pass2") or [])[:3])
            detail = f" (la 2e passe propose aussi : {only2})" if only2 else ""
            out.append(f"Divergence détectée sur {label}{detail} — sélection retenue : passe 1.")
    for key, section in sections.items():
        if section.get("confidence") == CONFIDENCE_UNMEASURED:
            reason = section.get("reason") or "2e passe indisponible"
            out.append(f"Fiabilité non mesurée sur {_SECTION_LABELS.get(key, key)} ({reason}).")
    return out


def _divergences(sections: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Agrégat plat « quoi + valeurs des 2 passes » pour le front / la télémétrie."""
    out: list[dict[str, Any]] = []
    for name, section in sections.items():
        div = section.get("divergence")
        if isinstance(div, dict):
            out.append({"section": name, **div})
    return out


# ── 2e passes (re-dérivations LLM) ───────────────────────────────────────────
#
# Chaque helper renvoie ``(valeur_passe_2 | None, usage | None, raison_échec)``.
# L'usage est conservé même quand la sortie est inparsable : l'appel a été
# facturé, il DOIT compter dans cost_eur.


async def _second_pass_evaluation(
    llm_call: LlmCall,
    *,
    system_prompt: str,
    company_name: str,
    profile_data: dict,
    correlation_id: str,
) -> tuple[dict[str, Any] | None, TokenUsage | None, str]:
    out, usage = await llm_call(
        system_prompt,
        build_subsection_user_prompt(company_name=company_name, section="evaluation", profile_data=profile_data),
        response_model=dict,
        max_tokens=_EVAL_MAX_TOKENS,
        prompt_name="self_consistency_evaluation",
        correlation_id=correlation_id,
    )
    breakdown = (out.get("evaluation") or {}).get("scoreBreakdown") if isinstance(out, dict) else None
    if not isinstance(breakdown, list) or not breakdown:
        return None, usage, "sortie passe 2 sans scoreBreakdown"
    # Même normalisation déterministe que la passe 1 (_normalize_plan_scores) :
    # clamp par axe + somme /25 + bande — la comparaison ne voit que le jugement.
    score = score_from_breakdown(breakdown)
    return {"score": score, "verdict": verdict_for_score(score)}, usage, ""


async def _second_pass_plays(
    llm_call: LlmCall,
    *,
    company_name: str,
    profile_data: dict,
    account_data: dict,
    correlation_id: str,
) -> tuple[list[str] | None, TokenUsage | None, str]:
    perimeters = [
        p.get("name")
        for p in (account_data.get("priorityPerimeters") or account_data.get("priority_perimeters") or [])
        if isinstance(p, dict)
    ]
    # Élargit le vivier aux entités jouables pour que la 2e passe ait un vrai
    # choix (sinon 3 candidats → accord trivial) — toujours SANS le tri passe 1.
    perimeters += [
        e.get("name")
        for e in (account_data.get("entitiesExhaustive") or [])
        if isinstance(e, dict) and e.get("getsPlay")
    ]
    angles = [a.get("title") for a in (account_data.get("angles") or []) if isinstance(a, dict)]
    signals = [
        s.get("signal")
        for s in (account_data.get("recentSignals") or account_data.get("recent_signals") or [])
        if isinstance(s, dict)
    ]
    pains = [
        (p.get("pain") if isinstance(p, dict) else p)
        for p in (account_data.get("pains") or [])
    ]
    out, usage = await llm_call(
        bellum_self_consistency.build_plays_system_prompt(profile_data),
        bellum_self_consistency.build_plays_user_prompt(
            company_name=company_name, perimeters=perimeters, angles=angles, signals=signals, pains=pains
        ),
        response_model=dict,
        max_tokens=_PLAYS_MAX_TOKENS,
        prompt_name="self_consistency_plays",
        correlation_id=correlation_id,
    )
    raw = out.get("plays") if isinstance(out, dict) else None
    if not isinstance(raw, list) or not raw:
        return None, usage, "sortie passe 2 sans plays"
    names = [str(p.get("perimeter") or "").strip() for p in raw if isinstance(p, dict)]
    names = [n for n in names if n]
    if not names:
        return None, usage, "sortie passe 2 sans périmètres exploitables"
    return names[:3], usage, ""


async def _second_pass_contacts(
    llm_call: LlmCall,
    *,
    company_name: str,
    profile_data: dict,
    account_data: dict,
    contacts: Sequence[dict],
    correlation_id: str,
) -> tuple[list[str] | None, TokenUsage | None, str]:
    pains = [(p.get("pain") if isinstance(p, dict) else p) for p in (account_data.get("pains") or [])]
    angles = [a.get("title") for a in (account_data.get("angles") or []) if isinstance(a, dict)]
    out, usage = await llm_call(
        bellum_self_consistency.build_contacts_system_prompt(profile_data),
        bellum_self_consistency.build_contacts_user_prompt(
            company_name=company_name, contacts=list(contacts), angles=angles, pains=pains
        ),
        response_model=dict,
        max_tokens=_CONTACTS_MAX_TOKENS,
        # La passe 1 (bellum_contacts) tourne sur Haiku — la re-dérivation aussi :
        # même famille de jugement, ~12× moins cher.
        model=CLAUDE_HAIKU_MODEL,
        prompt_name="self_consistency_contacts",
        correlation_id=correlation_id,
    )
    raw = out.get("contacts") if isinstance(out, dict) else None
    if not isinstance(raw, list) or not raw:
        return None, usage, "sortie passe 2 sans contacts"
    names = [str(c.get("name") or "").strip() for c in raw if isinstance(c, dict)]
    names = [n for n in names if n]
    if not names:
        return None, usage, "sortie passe 2 sans noms exploitables"
    return names[:_TOP_CONTACTS], usage, ""


# ── Valeurs de passe 1 (extraction déterministe) ─────────────────────────────


def top_priority_contacts(contacts: Sequence[Any], limit: int = _TOP_CONTACTS) -> list[str]:
    """Les ``limit`` contacts nommés les mieux classés (priority asc, 1 = top) —
    la qualification de la passe 1 que la re-dérivation doit confirmer."""

    def _rank(c: dict) -> int:
        p = c.get("priority")
        return p if isinstance(p, int) and p >= 1 else 99

    named = [c for c in contacts if isinstance(c, dict) and (c.get("fullName") or c.get("full_name"))]
    ranked = sorted(named, key=_rank)[:limit]
    return [str(c.get("fullName") or c.get("full_name")) for c in ranked]


def _pass1_play_perimeters(plays: Sequence[Any]) -> list[str]:
    """Les périmètres réellement joués par la passe 1 (placeholders exclus)."""
    out: list[str] = []
    for p in plays:
        if not isinstance(p, dict):
            continue
        name = str(p.get("perimeter") or "").strip()
        if name and name.lower() not in {"à qualifier", "a qualifier"}:
            out.append(name)
    return out


# ── Orchestrateur ────────────────────────────────────────────────────────────


async def measure_self_consistency(
    *,
    llm_call: LlmCall,
    system_prompt: str,
    company_name: str,
    profile_data: dict,
    account_data: dict,
    evaluation: dict[str, Any] | None,
    plays: Sequence[Any],
    contacts: Sequence[Any],
    correlation_id: str = "",
) -> tuple[dict[str, Any] | None, list[TokenUsage]]:
    """Mesure la self-consistency des 3 jugements clés (2e passes concurrentes).

    Retourne ``(bloc selfConsistency | None, usages de la 2e passe)``. ``None``
    uniquement quand le kill-switch est actif ou sur une erreur d'orchestration
    inattendue — dans tous les autres cas chaque section dégrade INDIVIDUELLEMENT
    en « unmeasured ». Ne lève JAMAIS (règle : jamais un run cassé) et ne modifie
    RIEN : la valeur retenue reste la passe 1.
    """
    if not is_enabled():
        return None, []
    try:
        return await _measure(
            llm_call=llm_call,
            system_prompt=system_prompt,
            company_name=company_name,
            profile_data=profile_data,
            account_data=account_data,
            evaluation=evaluation,
            plays=plays,
            contacts=contacts,
            correlation_id=correlation_id,
        )
    except Exception as exc:  # noqa: BLE001 — advisory measure, never breaks the run
        logger.error("Self-consistency measurement failed (run unaffected): %s", exc)
        return None, []


async def _measure(
    *,
    llm_call: LlmCall,
    system_prompt: str,
    company_name: str,
    profile_data: dict,
    account_data: dict,
    evaluation: dict[str, Any] | None,
    plays: Sequence[Any],
    contacts: Sequence[Any],
    correlation_id: str,
) -> tuple[dict[str, Any], list[TokenUsage]]:
    # Valeurs de la passe 1 (celles RETENUES par le run — jamais modifiées ici).
    pass1_score: dict[str, Any] | None = None
    if isinstance(evaluation, dict):
        raw_score, raw_verdict = evaluation.get("score"), evaluation.get("verdict")
        if isinstance(raw_score, (int, float)) and not isinstance(raw_score, bool) and raw_verdict:
            pass1_score = {"score": int(raw_score), "verdict": str(raw_verdict)}
    pass1_plays = _pass1_play_perimeters(plays)
    pass1_contacts = top_priority_contacts(contacts)

    async def _run_score() -> dict[str, Any]:
        if pass1_score is None:
            return _unmeasured("pas de score /25 en passe 1")
        try:
            pass2, usage, reason = await _second_pass_evaluation(
                llm_call,
                system_prompt=system_prompt,
                company_name=company_name,
                profile_data=profile_data,
                correlation_id=correlation_id,
            )
        except Exception as exc:  # noqa: BLE001 — échec gracieux par section
            logger.warning("Self-consistency (score) 2nd pass failed: %s", exc)
            return _unmeasured("2e passe en échec")
        if usage is not None:
            usages.append(usage)
        if pass2 is None:
            return _unmeasured(reason or "2e passe inexploitable")
        return compare_score(pass1_score, pass2)

    async def _run_plays() -> dict[str, Any]:
        if not pass1_plays:
            return _unmeasured("pas de plays en passe 1")
        try:
            pass2, usage, reason = await _second_pass_plays(
                llm_call,
                company_name=company_name,
                profile_data=profile_data,
                account_data=account_data,
                correlation_id=correlation_id,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Self-consistency (plays) 2nd pass failed: %s", exc)
            return _unmeasured("2e passe en échec")
        if usage is not None:
            usages.append(usage)
        if pass2 is None:
            return _unmeasured(reason or "2e passe inexploitable")
        return compare_plays(pass1_plays, pass2)

    async def _run_contacts() -> dict[str, Any]:
        if not pass1_contacts:
            return _unmeasured("pas de contacts nommés en passe 1")
        try:
            pass2, usage, reason = await _second_pass_contacts(
                llm_call,
                company_name=company_name,
                profile_data=profile_data,
                account_data=account_data,
                contacts=[c for c in contacts if isinstance(c, dict)],
                correlation_id=correlation_id,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Self-consistency (contacts) 2nd pass failed: %s", exc)
            return _unmeasured("2e passe en échec")
        if usage is not None:
            usages.append(usage)
        if pass2 is None:
            return _unmeasured(reason or "2e passe inexploitable")
        return compare_contacts(pass1_contacts, pass2)

    usages: list[TokenUsage] = []
    score_section, plays_section, contacts_section = await asyncio.gather(
        _run_score(), _run_plays(), _run_contacts()
    )
    sections = {"score": score_section, "plays": plays_section, "contacts": contacts_section}
    block: dict[str, Any] = {
        "sections": sections,
        "divergences": _divergences(sections),
        "overallConfidence": overall_confidence(sections),
        "notes": _notes(sections),
        "secondPassCostUsd": round(sum(u.cost_usd for u in usages), 6),
    }
    return block, usages
