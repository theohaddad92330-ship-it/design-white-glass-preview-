"""Vocabulaire du groupe — construction DÉTERMINISTE (build_vocabulary) +
enrichissement LLM opt-in (enrich_vocabulary / AccountVocabularyBuilder).

Le déterministe réutilise le niveau-1 (entities relevance + truth_status) pour
tagger sans LLM la moitié des termes ; l'enrichissement ajoute meaning/commercialWhy
et les termes que le déterministe rate (ERP Codex, POSIT'V…). Voir
agent_docs/knowledge-architecture.md."""

from __future__ import annotations

import logging
import os
import re
from collections.abc import Awaitable, Callable
from typing import Any

from app.models.outputs.vocabulary import AccountVocabulary, VocabularyTerm
from app.services.text_norm import normalize_name
from app.services.truth_status import FAIT, HYPOTHESE, REGISTRE, RISQUE, SIGNAL, normalise_status

logger = logging.getLogger(__name__)

# A pure acronym: 2-6 uppercase letters/digits, no lowercase, no space — "TDSI",
# "DSI", "MLOps" is mixed-case (stays a programme), "cortAIx" too. Lets the
# deterministic tagger fix the "types mal classés" (retour Thales).
_ACRONYM_RE = re.compile(r"^[A-Z0-9]{2,6}$")

# Deterministic "sens" + "pourquoi commercial" per kind — GUARANTEE non-empty
# columns without an LLM call (Théo : les colonnes sont vides). ``enrich_vocabulary``
# only improves on this floor. ``meaning`` may be overridden per-term (an entity's
# relevanceReason is more specific than the generic template).
_KIND_FILL: dict[str, tuple[str, str]] = {
    "entity": (
        "Entité opérationnelle du groupe.",
        "Périmètre adressable — cible potentielle de mission.",
    ),
    "trap_noise": (
        "Véhicule juridique (SCI / holding / GIE) sans activité opérationnelle.",
        "Piège : ne pas prospecter — aucune DSI ni budget IT derrière.",
    ),
    "internal_competitor": (
        "ESN / acteur IT déjà présent sur le compte.",
        "Soit le concurrencer, soit le solliciter en rang 2 (co / sous-traitance).",
    ),
    "program": (
        "Programme / initiative interne du groupe.",
        "Point d'accroche : rattacher l'offre à ce programme prioritaire.",
    ),
    "tool_erp": (
        "Outil / technologie présent dans le SI.",
        "Levier de mission : intégration, migration ou run autour de cette techno.",
    ),
    "acronym": (
        "Acronyme / terme interne du groupe.",
        "Parler le vocabulaire du compte = crédibilité immédiate en rendez-vous.",
    ),
    "person": (
        "Personne clé identifiée sur le compte.",
        "Interlocuteur ou sponsor potentiel à cartographier.",
    ),
    "angle": (
        "Angle d'attaque commercial retenu.",
        "Fil directeur du message et de l'offre proposée.",
    ),
}


def join_sentences(*parts: str) -> str:
    """#3278 — colle des phrases par une espace en rendant à la première son point
    quand il lui manque (« … 4 à 8 personnes C'est … » en recette prod 14/10)."""
    out = ""
    for part in (p.strip() for p in parts):
        if not part:
            continue
        if out and out[-1] not in ".!?…:;":
            out += "."
        out = f"{out} {part}" if out else part
    return out


def _name_of(item: Any) -> str:
    if isinstance(item, dict):
        return str(item.get("name") or item.get("term") or "").strip()
    return str(item or "").strip()


def _coerce_refs(raw: Any) -> list[str]:
    """A clean, deduped ``list[str]`` of provenance refs from a str / list / None —
    NEVER invents (absent or blank → ``[]``). Shared by the deterministic build and
    the LLM pass so every term's ``sourceRefs`` is well-formed for the front (Théo
    p.12/17 : chaque terme = sens + impact commercial + source)."""
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for x in raw:
        s = str(x).strip()
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _llm_status(lt: dict[str, Any]) -> str:
    """Canonical truth status from an LLM term (``truthStatus``/``truth_status``),
    or ``""`` if absent/unrecognised — normalised against the 7 statuts de vérité."""
    return normalise_status(str(lt.get("truthStatus") or lt.get("truth_status") or "")) or ""


def _fill(kind: str, *, meaning: str = "", commercial_why: str = "") -> tuple[str, str]:
    """Fill missing meaning / commercial_why from the per-kind template so no
    column is ever blank (retour Thales). Explicit values win."""
    default_meaning, default_why = _KIND_FILL.get(kind, _KIND_FILL["acronym"])
    return (meaning.strip() or default_meaning, commercial_why.strip() or default_why)


def _esn_presence_index(research: dict[str, Any]) -> dict[str, dict]:
    """Competitor name (normalised) → its ESN-presence entry (competeAngle /
    partnershipAngle) so an internal competitor's 'pourquoi commercial' is
    concrete (concurrencer vs rang 2) rather than generic."""
    idx: dict[str, dict] = {}
    for e in research.get("esnPresence") or research.get("esn_presence") or []:
        if isinstance(e, dict) and e.get("name"):
            idx[normalize_name(e["name"])] = e
    return idx


def build_vocabulary(research: dict[str, Any]) -> dict[str, Any]:
    """Deterministic ``AccountVocabulary`` from the Phase-1 research. Deduped by
    normalised term (first occurrence wins). Every term carries a non-empty
    ``meaning`` + ``commercialWhy`` (per-kind templates); the LLM pass only
    refines them. Serialised by alias for the front."""
    terms: list[VocabularyTerm] = []
    seen: set[str] = set()
    esn_idx = _esn_presence_index(research)

    def add(
        term: str,
        kind: str,
        *,
        related: str = "",
        status: str = "",
        meaning: str = "",
        commercial_why: str = "",
        source_refs: Any = None,
    ) -> None:
        name = term.strip()
        key = normalize_name(name)
        if not key or key in seen:
            return
        seen.add(key)
        filled_meaning, filled_why = _fill(kind, meaning=meaning, commercial_why=commercial_why)
        terms.append(
            VocabularyTerm(
                term=name,
                kind=kind,
                relatedEntity=related,
                truthStatus=status,
                meaning=filled_meaning,
                commercialWhy=filled_why,
                # Provenance concrète : propagée quand la source amont la porte (honnête,
                # jamais inventée). Le truthStatus déterministe reste la provenance-par-nature.
                sourceRefs=_coerce_refs(source_refs),
            )
        )

    # Entities — kind from the S2 relevance gate; noise legal vehicles are traps.
    for e in research.get("entitiesExhaustive") or research.get("entities_exhaustive") or []:
        if not isinstance(e, dict):
            continue
        name = _name_of(e)
        relevance = e.get("relevance")
        kind = "trap_noise" if relevance == "noise" else "entity"
        status = REGISTRE if kind == "entity" else FAIT
        reason = str(e.get("relevanceReason") or "")
        # An out-of-sector arm is a real entity but OFF the ESN's target — say so
        # in the commercial column instead of the generic "cible potentielle".
        why = ""
        if relevance == "out_of_sector":
            why = f"Hors cœur de cible ESN ({reason or 'secteur non adressable'}) — pas d'attaque directe."
        add(
            name,
            kind,
            status=status,
            meaning=reason,
            commercial_why=why,
            source_refs=e.get("sourceRefs") or e.get("source_refs"),
        )

    # Competitors on the account — internal competitors to defuse (risk). Pull the
    # concrete compete/rang-2 angle from the ESN-presence view when available.
    for c in research.get("competitors") or []:
        name = _name_of(c)
        pres = esn_idx.get(normalize_name(name))
        why = ""
        refs: Any = None
        if pres:
            compete = str(pres.get("competeAngle") or "").strip()
            partner = str(pres.get("partnershipAngle") or "").strip()
            why = join_sentences(compete, partner)
            refs = pres.get("sourceRefs") or pres.get("source_refs")
        add(name, "internal_competitor", status=RISQUE, commercial_why=why, source_refs=refs)

    # Named programmes / initiatives (Leonard, POSIT'V…) — signals, not registry.
    # A pure acronym (TDSI, DSI) is reclassified as such (types mal classés).
    for p in research.get("programNames") or research.get("program_names") or []:
        name = _name_of(p)
        kind = "acronym" if _ACRONYM_RE.match(name) else "program"
        add(name, kind, status=SIGNAL)

    # Detected tech stack / tools (ERP, SI) — observed facts.
    for t in research.get("detectedTechStack") or research.get("technologyStack") or []:
        add(_name_of(t), "tool_erp", status=FAIT)

    return AccountVocabulary(terms=terms).model_dump(by_alias=True)


def _vocabulary_model() -> str:
    """Modèle de l'enrichissement de vocabulaire — vide = défaut de ``call_claude``.

    Lu à chaque appel (et non au chargement du module) pour qu'un changement de
    variable Railway prenne effet au redémarrage du service sans toucher au code.
    Une valeur blanche vaut « non réglée » : router vers un modèle ``""`` ferait
    un 400 sur chaque appel.
    """
    return (os.getenv("VOCABULARY_MODEL") or "").strip()


async def enrich_vocabulary(
    vocab: dict[str, Any],
    sources_excerpt: str,
    company: str,
    call: Callable[..., Awaitable[tuple[Any, Any]]] | None = None,
) -> dict[str, Any]:
    """Enrich the deterministic vocab with an LLM pass (AccountVocabularyBuilder):
    fills meaning/commercialWhy on existing terms (by normalised key) and appends
    terms the deterministic tagger missed. OPT-IN (LLM cost) and DEGRADABLE — returns
    the vocab UNCHANGED on any error. ``call`` is injectable for tests."""
    terms: list[dict] = [t for t in (vocab.get("terms") or []) if isinstance(t, dict)]
    if call is None:
        from app.services.claude_service import call_claude as call
    try:
        from app.prompts import bellum_vocabulary_builder as vb

        model = _vocabulary_model()
        out, _usage = await call(
            vb.build_system_prompt(),
            vb.build_user_prompt(company, sources_excerpt, terms),
            response_model=dict,
            # A rich vocab needs ~7k output tokens; the old 2000 floor truncated
            # every run and paid for a 2000→4000→8000 retry ladder (~2 min wasted).
            # Size it right up front so the call lands in one shot.
            max_tokens=8000,
            prompt_name="bellum_vocabulary_builder",
            # CACHE-LLM (15/10) — classe A : sources PUBLIQUES du compte ; une sortie
            # sans liste de termes ne se garde pas.
            response_cache=True,
            response_cache_validate=lambda out: isinstance(out, dict) and isinstance(out.get("terms"), list),
            # Étiquetage pur (term / kind dans une énumération fermée / meaning
            # / commercialWhy) avec un gros budget de sortie : le profil que le
            # repo a déjà basculé sur Haiku ailleurs (bellum_signals, contacts,
            # organigramme). Le défaut reste le modèle par défaut — bascule via
            # VOCABULARY_MODEL=claude-haiku-4-5, sans redéploiement.
            **({"model": model} if model else {}),
        )
        llm_terms = out.get("terms") if isinstance(out, dict) else None
        if not isinstance(llm_terms, list):
            return vocab
    except Exception as exc:  # degradable — deterministic vocab stands
        logger.warning("vocabulary enrichment skipped: %s", exc)
        return vocab

    by_key = {normalize_name(t.get("term")): t for t in terms}
    for lt in llm_terms:
        if not isinstance(lt, dict):
            continue
        name = str(lt.get("term") or "").strip()
        key = normalize_name(name)
        if not key:
            continue
        why = str(lt.get("commercialWhy") or lt.get("commercial_why") or "")
        if key in by_key:
            ex = by_key[key]
            # LLM value wins when present (richer than the deterministic template
            # floor); fall back to the existing deterministic text otherwise.
            ex["meaning"] = str(lt.get("meaning") or "").strip() or ex.get("meaning") or ""
            ex["commercialWhy"] = why.strip() or ex.get("commercialWhy") or ""
            if not ex.get("aliases") and isinstance(lt.get("aliases"), list):
                ex["aliases"] = [str(a) for a in lt["aliases"]]
            # Provenance (Théo p.12/17) — ADDITIF : le LLM peut fournir des sources /
            # un statut de vérité pour un terme qui n'en avait pas ; ne JAMAIS écraser
            # une valeur déterministe déjà posée.
            llm_refs = _coerce_refs(lt.get("sourceRefs") or lt.get("source_refs"))
            if llm_refs and not ex.get("sourceRefs"):
                ex["sourceRefs"] = llm_refs
            llm_st = _llm_status(lt)
            if llm_st and not ex.get("truthStatus"):
                ex["truthStatus"] = llm_st
        else:
            new = VocabularyTerm(
                term=name,
                kind=str(lt.get("kind") or "acronym"),
                meaning=str(lt.get("meaning") or ""),
                commercialWhy=why,
                relatedEntity=str(lt.get("relatedEntity") or ""),
                # Terme AJOUTÉ par le LLM : provenance obligatoire pour le front. Statut
                # LLM explicite s'il est canonique, sinon HYPOTHESE (déduction IA à valider).
                truthStatus=_llm_status(lt) or HYPOTHESE,
                sourceRefs=_coerce_refs(lt.get("sourceRefs") or lt.get("source_refs")),
            ).model_dump(by_alias=True)
            terms.append(new)
            by_key[key] = new
    return {**vocab, "terms": terms}
