"""#4437 (Louis 21/10/2026, épopée #4433) — le texte libre LU est rattaché au référentiel.

Un intitulé d'offre (« Développeur React / TypeScript H/F ») n'est pas normé : le modèle le rattache à un
TYPE DE FAIT (``FACT_TYPES``), une COMPÉTENCE telle qu'écrite et une FAMILLE MÉTIER (la liste fermée de
``job_family``), en citant l'EXTRAIT qui le justifie. Le rattachement est rangé AVEC le fait (la ligne d'offre
porte ``attached``), donc dans le cache commun : il est payé une fois, comme l'offre.

Rien d'inventé : un extrait absent du texte lu, une compétence absente de l'extrait, une famille ou un type
hors liste — le rattachement tombe. Le modèle en panne : les offres restent telles quelles (dégradable).

La compétence reste celle ÉCRITE : sa forme canonique et son voisinage (React → JavaScript → front) sont au
référentiel de compétences (``apps/api/src/modules/consultants/skill-referential.ts``, étendu par #4434) — ce
module n'en tient pas un second.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from collections.abc import Awaitable, Callable, Mapping
from typing import Any

from app.prompts.bellum_offer_attach import FACT_TYPES, build_system_prompt, build_user_prompt
from app.services.job_family import derive_job_family, job_families
from app.services.tech_stack import derive_technologies

logger = logging.getLogger(__name__)

#: Intitulés lus au plus par appel au modèle (une page d'offres payée en compte 25).
_MAX_TITLES = 40


def _fold(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return " " + " ".join(re.findall(r"[a-z0-9+#.]+", text)) + " "


def _valid(item: Mapping[str, Any], title: str, families: frozenset[str]) -> dict[str, Any] | None:
    fact_type = item.get("factType")
    extract = str(item.get("extract") or "").strip()
    skill = item.get("skill")
    family = item.get("family")
    if fact_type not in FACT_TYPES or not extract or _fold(extract).strip() not in _fold(title):
        return None
    if skill is not None and (not str(skill).strip() or _fold(skill).strip() not in _fold(extract)):
        return None
    if family is not None and family not in families:
        return None
    if skill is None and family is None:
        return None
    return {"factType": fact_type, "skill": skill, "family": family, "extract": extract}


#: #4437.5 — la famille d'une compétence NOMMÉE par l'intitulé (liste fermée, écrite à la main). Une compétence
#: ambiguë (SQL, SAP…) n'y est pas : « non classé » n'est jamais une famille par défaut.
_SKILL_FAMILY: dict[str, str] = {
    **dict.fromkeys(
        (
            "Java",
            "JavaScript",
            "TypeScript",
            "Python",
            "C#",
            "C++",
            "PHP",
            "Go",
            "Ruby",
            "Kotlin",
            "Swift",
            "Rust",
            "Scala",
            "React",
            "Angular",
            "Vue.js",
            "Node.js",
            ".NET",
            "Spring",
            "Django",
            "Symfony",
            "Laravel",
        ),
        "developpement",
    ),
    **dict.fromkeys(("AWS", "Azure", "GCP", "Kubernetes", "Docker", "Terraform"), "infrastructure_cloud"),
    **dict.fromkeys(("Spark", "Hadoop", "Kafka", "Power BI", "Tableau"), "data_ia"),
}


def read_offer_title(
    title: str | None,
    detail: str | None,
    listed_skills: list[str],
    attached: Mapping[str, Any] | None,
) -> tuple[list[str], str | None]:
    """#4437.5 — (compétences, famille) d'un intitulé LIBRE : le catalogue d'abord, puis le rattachement lu par
    le modèle (``attached``, déjà validé par :func:`_valid`), puis la famille de la compétence nommée. Rien de
    deviné d'un intitulé muet : ``([], None)``."""
    technologies = derive_technologies(title, detail, *listed_skills)
    skill = str(attached.get("skill") or "").strip() if isinstance(attached, Mapping) else ""
    if skill and _fold(skill) not in {_fold(t) for t in technologies}:
        technologies = [*technologies, skill]
    family = derive_job_family(title)
    if family is None and isinstance(attached, Mapping) and attached.get("family") in job_families():
        family = str(attached["family"])
    if family is None:
        family = next((_SKILL_FAMILY[t] for t in technologies if t in _SKILL_FAMILY), None)
    return technologies, family


async def attach_offer_titles(
    rows: list[dict], *, call: Callable[..., Awaitable[tuple[Any, Any]]] | None = None
) -> list[dict]:
    """Les offres ``rows``, celles dont l'intitulé est rattaché portant ``attached``. Jamais d'exception."""
    readable = [(i, str(row.get("title") or "").strip()) for i, row in enumerate(rows) if isinstance(row, dict)]
    readable = [(i, title) for i, title in readable if title][:_MAX_TITLES]
    if not readable:
        return rows
    if call is None:
        from app.services.claude_service import call_claude as call
    from app.services.model_policy import model_for

    families = job_families()
    titles = [title for _, title in readable]
    try:
        out, _usage = await call(
            build_system_prompt(sorted(families)),
            build_user_prompt(titles),
            response_model=dict,
            max_tokens=2000,
            model=model_for("bellum_offer_attach"),
            prompt_name="bellum_offer_attach",
        )
    except Exception as exc:  # noqa: BLE001 — dégradable : l'offre reste un fait sans rattachement
        logger.warning("offer_attach skipped: %s", type(exc).__name__)
        return rows
    items = out.get("items") if isinstance(out, Mapping) else None
    attached = [dict(row) if isinstance(row, dict) else row for row in rows]
    kept = 0
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, Mapping) or not isinstance(item.get("index"), int):
            continue
        position = item["index"]
        if not 0 <= position < len(readable):
            continue
        row_index, title = readable[position]
        valid = _valid(item, title, families)
        if valid is not None:
            attached[row_index]["attached"] = valid
            kept += 1
    logger.info("offer_attach titles=%d attached=%d", len(readable), kept)
    return attached


_OFFER_SIGNAL_TYPES = frozenset({"recrutement", "hiring"})


def stamp_offer_attachments(signals: object, jobs: object) -> list[dict[str, Any]]:
    """#4437.5 — chaque OFFRE du compte (Mes cibles) porte son rattachement : compétence(s), famille métier, type
    de fait, et l'EXTRAIT lu. Dérivé de l'intitulé (et de son rattachement par le modèle quand l'offre collectée est
    jointe par son URL, jamais par le texte) ; un intitulé qui ne nomme rien est « non classé » (``unclassified``),
    jamais une famille par défaut. Tout autre signal passe inchangé."""
    by_url: dict[str, Mapping[str, Any]] = {}
    for job in jobs if isinstance(jobs, list) else []:
        if isinstance(job, Mapping):
            url = str(job.get("url") or job.get("sourceUrl") or "").strip()
            if url:
                by_url.setdefault(url, job)
    out: list[dict[str, Any]] = []
    for sig in signals if isinstance(signals, list) else []:
        if not isinstance(sig, Mapping):
            continue
        item = dict(sig)
        is_offer = item.get("source_kind") == "job" or str(item.get("type") or "").strip().lower() in _OFFER_SIGNAL_TYPES
        if is_offer:
            job = by_url.get(str(item.get("url") or "").strip())
            title = str((job or {}).get("title") or item.get("signal") or item.get("label") or "").strip()
            detail = (job or {}).get("description") or item.get("detail")
            attached = (job or {}).get("attached")
            skills, family = read_offer_title(title, detail, [], attached if isinstance(attached, Mapping) else None)
            fact_type = attached.get("factType") if isinstance(attached, Mapping) else None
            item["offer_attachment"] = {
                "status": "attached" if skills or family else "unclassified",
                # #4437.5 — un intitulé non rattaché ne reçoit AUCUN type non plus : « non classé » ne pose rien.
                "fact_type": (fact_type if fact_type in FACT_TYPES else "hiring") if skills or family else None,
                "skills": skills,
                "job_family": family,
                "extract": title or None,
            }
        out.append(item)
    return out
