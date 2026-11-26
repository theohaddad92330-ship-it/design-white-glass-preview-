"""#4281.1 / .2 / .3 / .4 — les BESOINS HISTORIQUES structurés de la base commune.

Table `dataforge_needs` (migration API `1796560603409-DataforgeNeeds.ts`), remplie à
l'ingestion depuis `24_MISSIONS_BESOINS` / `25_PIPELINE_CRM` du pack ORION V12
(décision Louis 19/10 n°17 : « toutes les données ont de la valeur »). Avant elle,
statut / date / prescripteur n'existaient que dans le TEXTE des extraits RAG — un
modèle qui les y lit peut inventer un fait daté ; ici, chaque champ est une colonne.

Trois lectures, une seule porte :
  · `resolve_source_id(siren)` — le compte Bellum → le compte du référentiel, PAR
    SIREN (jamais par nom), même règle que `DataforgeService.resolveBySiren` côté
    API : un seul porteur, ou le primaire désigné d'une même grappe ; sinon le
    rattachement est « à vérifier » (#4281.4), jamais choisi à notre place ;
  · `historical_needs(...)` — par compte, par technologie (radar) ou par personne ;
  · `prescriber_freshness(...)` — « à revalider » au-delà d'un an (#4282.6).

Le nom du pack ne sort JAMAIS (ni DataForge, ni ORION, ni le fichier) : la vue
dit « base commune Bellum », comme `laura_dossier_reads.py`. Une panne du store
rend une liste vide, jamais une exception : un plan ou une réponse de Laura ne
tombent pas pour un historique.
"""

from __future__ import annotations

import logging
from datetime import date

from app.services.research.homonym import resolve_company_identity
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# Même seuil que `PRESCRIBER_REVALIDATE_AFTER_DAYS` (packages/contracts/src/schemas/dataforge-needs.ts),
# vérifié par `tests/test_dataforge_needs.py`.
PRESCRIBER_REVALIDATE_AFTER_DAYS = 365

STATUS_LABELS: dict[str, str] = {
    "GAGNE": "gagné",
    "PERDU": "perdu",
    "ABANDONNE": "abandonné",
    "TERMINE": "terminé",
    "EN_COURS": "en cours",
    "INCONNU": "statut non renseigné",
}

_NEED_COLUMNS = (
    "need_id, account_source_id, entreprise, title, status, need_date, tjm_eur, "
    "prescriber_name, prescriber_title, prescriber_last_seen, location, technologies"
)
_DEFAULT_LIMIT = 20


def prescriber_freshness(last_seen: object, today: date) -> dict:
    raw = str(last_seen or "").strip()[:10]
    try:
        seen = date.fromisoformat(raw)
    except ValueError:
        return {"kind": "to_revalidate", "date": None}
    if (today - seen).days > PRESCRIBER_REVALIDATE_AFTER_DAYS:
        return {"kind": "to_revalidate", "date": raw}
    return {"kind": "dated", "date": raw}


async def resolve_source_id(siren: object) -> dict | None:
    """`{"kind": "resolved", "source_id"}` | `{"kind": "to_verify", "reason"}` | `None` (inconnu)."""
    key = "".join(ch for ch in str(siren or "") if ch.isdigit())[:9]
    if len(key) != 9:
        return None
    try:
        res = await (
            get_supabase()
            .table("dataforge_accounts")
            .select("source_id, siren, cluster_id, is_cluster_primary")
            .eq("siren", key)
            .limit(20)
            .aexecute()
        )
    except Exception as exc:  # noqa: BLE001 — un rattachement indisponible n'est pas un rattachement faux
        logger.warning("Rattachement base commune indisponible (ignoré) : %s", exc)
        return None
    rows = sorted((r for r in (res.data or []) if r.get("source_id")), key=lambda r: str(r["source_id"]))
    if not rows:
        return None
    if len(rows) == 1:
        return {"kind": "resolved", "source_id": rows[0]["source_id"]}
    clusters = {r.get("cluster_id") or "" for r in rows}
    primaries = [r for r in rows if r.get("is_cluster_primary")]
    if len(clusters) == 1 and "" not in clusters and len(primaries) == 1:
        return {"kind": "resolved", "source_id": primaries[0]["source_id"]}
    # #4281.4 — le référentiel se contredit : on le DIT, on ne choisit pas.
    return {
        "kind": "to_verify",
        "reason": f"à vérifier : {len(rows)} fiches de la base commune portent ce SIREN sans rattachement univoque",
    }


def _view(row: dict, today: date) -> dict:
    name = row.get("prescriber_name")
    role = row.get("prescriber_title")
    prescriber = (
        {"name": name, "role": role, "freshness": prescriber_freshness(row.get("prescriber_last_seen"), today)}
        if name or role
        else None
    )
    status = str(row.get("status") or "INCONNU")
    tjm = row.get("tjm_eur")
    return {
        "company": row.get("entreprise"),
        "title": row.get("title"),
        "status": status,
        "status_label": STATUS_LABELS.get(status, STATUS_LABELS["INCONNU"]),
        "date": row.get("need_date"),
        "tjm_eur": tjm if isinstance(tjm, int | float) and tjm > 0 else None,
        "location": row.get("location"),
        "technologies": list(row.get("technologies") or []),
        "prescriber": prescriber,
    }


async def historical_needs(
    *,
    account_source_id: str | None = None,
    technology_code: str | None = None,
    person: str | None = None,
    limit: int = _DEFAULT_LIMIT,
    today: date | None = None,
) -> list[dict]:
    """Les besoins observés, les plus récents d'abord (date absente en dernier).

    Sans aucun filtre : `[]` sans lecture — on ne déverse pas la base commune entière."""
    if not (account_source_id or technology_code or (person or "").strip()):
        return []
    query = get_supabase().table("dataforge_needs").select(_NEED_COLUMNS)
    if account_source_id:
        query = query.eq("account_source_id", account_source_id)
    if technology_code:
        query = query.contains("technologies", [technology_code])
    if (person or "").strip():
        query = query.ilike("prescriber_name", f"%{person.strip()}%")
    try:
        res = await (
            query.order("need_date", ascending=False, nulls_last=True).limit(max(1, min(int(limit), 50))).aexecute()
        )
    except Exception as exc:  # noqa: BLE001 — un historique indisponible ne casse ni Laura ni le plan
        logger.warning("Besoins historiques indisponibles (ignorés) : %s", exc)
        return []
    rows = [r for r in (res.data or []) if isinstance(r, dict)]
    rows.sort(key=lambda r: str(r.get("need_date") or ""), reverse=True)
    current = today or date.today()
    return [_view(r, current) for r in rows]


async def needs_for_owned_account(
    account_id: object,
    user_id: object,
    *,
    workspace_id: object = None,
    today: date | None = None,
) -> dict:
    """#4281.2 — les besoins historiques DU compte (et de sa tête de groupe), pour le plan et Laura.

    Le compte est lu SCOPÉ : par l'ESPACE quand il est connu (#4294.9 — un coéquipier qui analyse le
    compte d'un collègue le lit aussi ; un autre espace ne rend rien), sinon par son créateur. Le pont
    vers la base commune passe par le SIREN. Un rattachement ambigu rend `to_verify` et AUCUN besoin :
    lire l'une des fiches serait déjà avoir choisi."""
    empty: dict = {"needs": [], "to_verify": None, "source_ids": []}
    if not account_id or not (user_id or workspace_id):
        return empty
    try:
        query = (
            get_supabase()
            .table("accounts")
            .select("id, company_name, siren, group_head_siren")
            .eq("id", str(account_id))
        )
        # #4294.9 — le cloisonnement est l'espace ; jamais un `where id` seul.
        query = query.eq("workspace_id", str(workspace_id)) if workspace_id else query.eq("user_id", str(user_id))
        res = await query.limit(1).aexecute()
    except Exception as exc:  # noqa: BLE001 — un historique indisponible ne casse pas l'appelant
        logger.warning("Compte indisponible pour les besoins historiques (ignoré) : %s", exc)
        return empty
    row = next((r for r in (res.data or []) if isinstance(r, dict)), None)
    if not row:
        return empty
    siren = row.get("siren")
    if not _nine_digits(siren):
        # Lot 762 P6 — la jointure DataForge est par SIREN SEUL : un compte sans SIREN n'avait jamais d'historique.
        # On le résout par la source d'identité existante et on l'utilise pour cette lecture (sans l'écrire : l'écriture est à l'API).
        siren = await _resolve_and_write_siren(row, workspace_id=workspace_id, user_id=user_id)
        if siren == _AMBIGUOUS:
            return {"needs": [], "to_verify": _AMBIGUOUS_REASON, "source_ids": []}
    return await _needs_for_sirens((siren, row.get("group_head_siren")), today)


_AMBIGUOUS = "__ambiguous__"
_AMBIGUOUS_REASON = "à vérifier : plusieurs entités au registre portent ce nom — aucune n'est rattachée"


def _nine_digits(value: object) -> bool:
    return len("".join(ch for ch in str(value or "") if ch.isdigit())) == 9


async def _resolve_and_write_siren(row: dict, *, workspace_id: object, user_id: object) -> str | None:
    """SIREN d'un compte qui n'en porte pas : résolu au registre, jamais deviné.

    `unique` / `selected` → rendu à l'appelant (l'IA n'écrit jamais `accounts`). `ambiguous` (plusieurs fiches) → `_AMBIGUOUS` : rien n'est rattaché, la raison
    est journalisée. Aucun candidat ou registre en panne → `None` (jamais « aucun besoin » affirmé)."""
    name = str(row.get("company_name") or "").strip()
    if not name or not row.get("id"):
        return None
    try:
        resolution = await resolve_company_identity(name, strict=True)
    except Exception as exc:  # noqa: BLE001 — un registre en panne n'est pas un compte sans SIREN
        logger.warning("SIREN du compte non résolu pour DataForge (ignoré) : %s", exc)
        return None
    if resolution.status == "ambiguous":
        logger.info(
            "DataForge : SIREN du compte %s ambigu (%s candidats) — non rattaché", row["id"], resolution.candidate_count
        )
        return _AMBIGUOUS
    if resolution.status not in ("unique", "selected", "locked") or not resolution.selected_siren:
        return None
    # L'IA n'écrit pas `accounts` (garde test_no_business_table_writes) : le SIREN résolu sert à CETTE lecture,
    # sa persistance revient à l'API, seule à savoir qui a le droit d'écrire et quoi tracer.
    siren = resolution.selected_siren
    return siren


async def needs_for_siren(siren: object, *, today: date | None = None) -> dict:
    """#4294.9 — « qu'a-t-on déjà fait chez X ? » pour une entreprise PAS (encore) au portefeuille.

    Par SIREN seulement, jamais par nom : un nom rapproché serait un rattachement deviné. Le
    référentiel est PARTAGÉ (un fait de marché, GA-16) : aucune donnée d'espace n'est lue."""
    return await _needs_for_sirens((siren,), today)


async def _needs_for_sirens(sirens: tuple[object, ...], today: date | None) -> dict:
    source_ids: list[str] = []
    to_verify: str | None = None
    for siren in dict.fromkeys(s for s in sirens if s):
        resolved = await resolve_source_id(siren)
        if resolved is None:
            continue
        if resolved["kind"] == "to_verify":
            to_verify = to_verify or resolved["reason"]
        elif resolved["source_id"] not in source_ids:
            source_ids.append(resolved["source_id"])
    if to_verify and not source_ids:
        return {"needs": [], "to_verify": to_verify, "source_ids": []}
    needs: list[dict] = []
    for source_id in source_ids:
        needs.extend(await historical_needs(account_source_id=source_id, today=today))
    needs.sort(key=lambda n: str(n.get("date") or ""), reverse=True)
    return {"needs": needs[:_DEFAULT_LIMIT], "to_verify": to_verify, "source_ids": source_ids}


_BLOCK_MAX_ROWS = 8


def _freshness_text(freshness: dict) -> str:
    if freshness.get("kind") == "dated":
        return f"vu le {freshness.get('date')}"
    seen = freshness.get("date")
    return f"à revalider (vu le {seen})" if seen else "à revalider"


def need_line(need: dict) -> str:
    """Une ligne lisible et DATÉE — le même rendu pour le plan et Laura."""
    parts = [str(need.get("title") or "Besoin sans intitulé"), str(need.get("status_label") or "")]
    parts.append(str(need.get("date")) if need.get("date") else "date non renseignée")
    if need.get("tjm_eur"):
        parts.append(f"TJM observé {int(need['tjm_eur'])} €")
    prescriber = need.get("prescriber")
    if prescriber:
        who = " — ".join(str(v) for v in (prescriber.get("name"), prescriber.get("role")) if v)
        parts.append(f"prescripteur {who} ({_freshness_text(prescriber.get('freshness') or {})})")
    return " · ".join(p for p in parts if p)


def historical_needs_block(result: dict) -> str:
    """Bloc du plan : ``""`` sans besoin ni ambiguïté — prompt byte-identique."""
    needs = list((result or {}).get("needs") or [])[:_BLOCK_MAX_ROWS]
    to_verify = (result or {}).get("to_verify")
    if not needs and not to_verify:
        return ""
    lines = [f"- {need_line(n)}" for n in needs]
    summary = needs_summary(list((result or {}).get("needs") or []))
    if summary:
        lines.insert(0, f"- Synthèse : {summary['line']}")
    if to_verify:
        lines.append(f"- Rattachement de ce compte dans la base commune : {to_verify}.")
    # #4294.9 — les besoins PÈSENT : chacun des trois usages est nommé, sinon le modèle les lit comme décor.
    return (
        "\n\n===== BESOINS HISTORIQUES OBSERVÉS SUR CE COMPTE (base commune Bellum, datés) =====\n"
        + "\n".join(lines)
        + "\nRègles : un besoin passé prouve que ce compte a DÉJÀ acheté la compétence — cite-le avec sa date, "
        "jamais comme un besoin ouvert aujourd'hui. ANGLE : une compétence achetée plusieurs fois, ou gagnée, "
        "oriente l'angle d'attaque ; un besoin perdu ou abandonné se traite comme une objection à préparer. "
        "INTERLOCUTEUR : un prescripteur daté est un relais à citer dans le plan ; « à revalider » se revalide "
        "avant d'être présenté comme relais. PREUVE : un besoin gagné ou terminé est une preuve datée, jamais une "
        "référence de l'espace. Ne nomme jamais d'où vient la donnée. Aucune probabilité."
    )


def needs_summary(needs: list[dict]) -> dict | None:
    """#4294.9 — « qu'a-t-on déjà fait chez X ? » en une synthèse CALCULÉE (sans modèle).

    `None` sans besoin : dans une liste, une absence ne fait aucune ligne — jamais « 0 besoin ».
    Le TJM est borné (min / max des seuls TJM écrits), jamais moyenné ni estimé."""
    rows = [n for n in needs or [] if isinstance(n, dict)]
    if not rows:
        return None
    by_status: dict[str, int] = {}
    for need in rows:
        status = str(need.get("status") or "INCONNU")
        by_status[status] = by_status.get(status, 0) + 1
    dates = sorted((str(n["date"]) for n in rows if n.get("date")), reverse=True)
    won = [n for n in rows if n.get("status") == "GAGNE" and n.get("date")]
    won.sort(key=lambda n: str(n["date"]), reverse=True)
    tjms = [float(n["tjm_eur"]) for n in rows if isinstance(n.get("tjm_eur"), int | float) and n["tjm_eur"] > 0]
    technologies: dict[str, int] = {}
    for need in rows:
        for code in need.get("technologies") or []:
            technologies[code] = technologies.get(code, 0) + 1
    prescribers: list[dict] = []
    seen: set[str] = set()
    for need in rows:
        prescriber = need.get("prescriber") or {}
        name = str(prescriber.get("name") or "").strip()
        if name and name.lower() not in seen:
            seen.add(name.lower())
            prescribers.append(prescriber)
    counts = ", ".join(
        f"{count} {STATUS_LABELS.get(status, STATUS_LABELS['INCONNU'])}"
        for status, count in sorted(by_status.items(), key=lambda kv: (-kv[1], kv[0]))
    )
    parts = [f"{len(rows)} besoin(s) observé(s) : {counts}"]
    if dates:
        parts.append(f"le plus récent le {dates[0]}")
    if won:
        parts.append(f"dernier gagné « {won[0].get('title') or 'sans intitulé'} » le {won[0]['date']}")
    if tjms:
        low, high = int(min(tjms)), int(max(tjms))
        parts.append(f"TJM observé {low} €" if low == high else f"TJM observé de {low} € à {high} €")
    return {
        "total": len(rows),
        "by_status": by_status,
        "latest_date": dates[0] if dates else None,
        "latest_won": {"title": won[0].get("title"), "date": won[0]["date"]} if won else None,
        "tjm_eur": {"min": int(min(tjms)), "max": int(max(tjms)), "known": len(tjms)} if tjms else None,
        "technologies": [code for code, _ in sorted(technologies.items(), key=lambda kv: (-kv[1], kv[0]))],
        "prescribers": prescribers,
        "line": " · ".join(parts),
    }


def prescriber_contacts(result: dict) -> list[dict]:
    """#4294.9 — les prescripteurs des besoins passés DU compte, au format `known_contacts` de la
    classification (#4070.3) : ils DÉPARTAGENT l'ordre, ne filtrent jamais, n'ajoutent personne."""
    out: list[dict] = []
    seen: set[str] = set()
    for need in list((result or {}).get("needs") or []):
        prescriber = (need or {}).get("prescriber") or {}
        name = str(prescriber.get("name") or "").strip()
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        freshness = prescriber.get("freshness") or {}
        out.append(
            {
                "name": name,
                "role": prescriber.get("role"),
                "relation": "prescriber",
                "last_seen": freshness.get("date"),
                "to_revalidate": freshness.get("kind") != "dated",
            }
        )
    return out


__all__ = [
    "PRESCRIBER_REVALIDATE_AFTER_DAYS",
    "STATUS_LABELS",
    "historical_needs",
    "historical_needs_block",
    "need_line",
    "needs_for_owned_account",
    "needs_for_siren",
    "needs_summary",
    "prescriber_contacts",
    "prescriber_freshness",
    "resolve_source_id",
]
