"""#2293.8 / .9 / .10 / #2303.4-.22 — NORMALISER une comparaison de comptes AVANT le modèle.

Cinq axes de PROFONDEUR, calculés en code, jamais écrits par le modèle (un
chiffre écrit par un LLM n'est pas un fait) :

* **périmètre** — l'entité ancrée (`accounts.siren`) et son rôle de groupe
  (`group_role`). Le mode groupe/entité du run vit sur `analysis_runs`, que cette
  lecture n'atteint pas : il n'est PAS deviné ;
* **couverture** — les personnes de l'organigramme
  (`raw_analysis.org.orgGraph.coverage.discovered`, sinon `len(people)`) ;
* **preuves** — les sources citées par l'organigramme (personnes + entités) et
  les signaux datés (`raw_analysis.recent_signals`) ;
* **axes** — les axes du dossier (`raw_analysis.plan.evaluation.dossier_read.axes`),
  évalués ou non (`state == "unknown"`) ;
* **fraîcheur** — `accounts.signals_collected_at` (jamais `updated_at`, qui ne
  dit la fraîcheur de rien — account.entity.ts).

Cinq axes de CONTENU (#2303.4/.6/.10/.15/.16 — épopée #2790), chacun un ÉTAT
NOMMÉ (#2303.19-.22 : `measured`/`unknown`/`not_applicable`/`to_verify`) plutôt
qu'une valeur nue :

* **recours externe observé** — l'axe `capacite_achat_externe` du dossier
  (`state == "partial"` ⇒ `to_verify`, jamais un fait affirmé à moitié) ;
* **voie d'achat** — `dossier_read.access_path` ; `not_applicable` avant que le
  périmètre soit ancré (une voie d'achat suppose une entité identifiée) ;
* **barrière de référencement** — `raw_analysis.accessBarrier.label`
  (`access_scoring.py`) ; `measurable: false` reste `unknown`, jamais estimé ;
* **risque** — le risque du plan (`plan.evaluation.risks`) au plus fort impact ;
* **premier test/action** — `dossier_read.next_action` ; `not_applicable` sous
  un NO-GO actif (comparer un « premier geste » n'a pas de sens tant qu'il tient).

#2303.12 (capacité commerciale nécessaire) reste HORS de ce lot : aucun signal
existant ne la porte, et en écrire une formule serait un contrat DEVINÉ, que la
doctrine interdit (« un contrat d'API non vérifiable ne se devine pas »).

Une valeur absente reste `None` et se NOMME dans `unknowns` — jamais `0`
(GA-18/19). Un compte non terminé ou introuvable est ÉCARTÉ avec sa raison, au
lieu d'être comparé sur un dossier vide. Et quand les dossiers n'ont pas la même
profondeur, `comparable_on_equal_footing` le dit : on ne compare pas un compte
très documenté à un compte peu couvert comme si leurs scores se valaient (#2293.9).
"""

from __future__ import annotations

from typing import Any

#: Part d'axes évalués au-delà de laquelle un dossier est « solide » / « partiel ».
_SOLID_RATIO = 0.7
_PARTIAL_RATIO = 0.4

#: #2303.19-.22 — les QUATRE états qu'un axe de comparaison peut porter. Jamais
#: une cinquième valeur : un axe qu'on ne sait pas nommer parmi ceux-ci N'EXISTE
#: PAS pour ce compte (même règle que `normalize_dossier_axis`).
COMPARISON_AXIS_STATES: tuple[str, ...] = ("measured", "unknown", "not_applicable", "to_verify")


def _dig(data: Any, *path: str) -> Any:
    for key in path:
        if not isinstance(data, dict):
            return None
        data = data.get(key)
    return data


def _text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def _count_sources(rows: Any) -> int | None:
    if not isinstance(rows, list):
        return None
    return sum(len(r.get("sources") or []) for r in rows if isinstance(r, dict) and isinstance(r.get("sources"), list))


def _axis(state: str, value: Any = None) -> dict[str, Any]:
    return {"state": state, "value": value}


def _external_recourse_axis(raw: dict) -> dict[str, Any]:
    """#2303.4 — le recours externe observé, sur l'axe `capacite_achat_externe`
    du dossier (`dossier_read.py`). `partial` ⇒ `to_verify` : un axe à moitié
    noté n'est pas un fait mesuré, mais ce n'est pas rien non plus."""
    axes_rows = _dig(raw, "plan", "evaluation", "dossier_read", "axes")
    rows = [r for r in axes_rows if isinstance(r, dict)] if isinstance(axes_rows, list) else []
    row = next((r for r in rows if r.get("key") == "capacite_achat_externe"), None)
    if row is None or row.get("state") == "unknown":
        return _axis("unknown")
    label = _text(row.get("impact")) or _text(row.get("lever"))
    value = label or (f"{row.get('value')}/5" if row.get("value") is not None else None)
    if row.get("state") == "partial":
        return _axis("to_verify", value)
    return _axis("measured", value)


def _buying_path_axis(raw: dict, perimeter: dict | None) -> dict[str, Any]:
    """#2303.6 — la voie d'achat (`dossier_read.access_path`). Sans périmètre
    ancré, la question elle-même n'a pas de sens : `not_applicable`, pas
    `unknown` (on n'a pas juste manqué de la mesurer)."""
    if perimeter is None:
        return _axis("not_applicable")
    path = _text(_dig(raw, "plan", "evaluation", "dossier_read", "access_path"))
    return _axis("measured", path) if path else _axis("unknown")


def _referencing_barrier_axis(raw: dict) -> dict[str, Any]:
    """#2303.10 — la barrière de référencement (`accessBarrier.label`,
    `access_scoring.py`). `measurable: false` reste `unknown` : une barrière
    non mesurable ne s'estime pas à sa place."""
    barrier = raw.get("accessBarrier")
    if not isinstance(barrier, dict) or barrier.get("measurable") is False:
        return _axis("unknown")
    label = _text(barrier.get("label"))
    return _axis("measured", label) if label else _axis("unknown")


#: #2303.15 — l'ordre de gravité d'un risque du plan (`Risk.impact`,
#: `app/models/outputs/plan.py`) : le pire d'abord, jamais une moyenne.
_RISK_IMPACT_ORDER: dict[str, int] = {"critique": 0, "important": 1, "modere": 2}


def _risk_axis(raw: dict) -> dict[str, Any]:
    """#2303.15 — le risque le plus grave nommé par le plan (`plan.evaluation.risks`)."""
    risks = _dig(raw, "plan", "evaluation", "risks")
    named = [r for r in risks if isinstance(r, dict) and _text(r.get("risk"))] if isinstance(risks, list) else []
    if not named:
        return _axis("unknown")
    top = min(named, key=lambda r: _RISK_IMPACT_ORDER.get(r.get("impact"), len(_RISK_IMPACT_ORDER)))
    return _axis("measured", _text(top.get("risk")))


def _first_action_axis(raw: dict) -> dict[str, Any]:
    """#2303.16 — le premier test/action (`dossier_read.next_action`). Sous un
    NO-GO actif, comparer un « premier geste » n'a pas de sens : `not_applicable`,
    pas `unknown` — ce n'est pas qu'on n'a pas mesuré, c'est que la question ne
    se pose pas tant que le NO-GO tient (#2303.29 le rappelle : temporaire, jamais
    enterré, donc réévaluée au prochain rejeu)."""
    dossier_read = _dig(raw, "plan", "evaluation", "dossier_read")
    if isinstance(dossier_read, dict) and dossier_read.get("no_go"):
        return _axis("not_applicable")
    action = _dig(raw, "plan", "evaluation", "dossier_read", "next_action")
    label = _text(action.get("label")) if isinstance(action, dict) else None
    return _axis("measured", label) if label else _axis("unknown")


def _comparison_axes(raw: dict, perimeter: dict | None) -> dict[str, dict[str, Any]]:
    return {
        "external_recourse": _external_recourse_axis(raw),
        "buying_path": _buying_path_axis(raw, perimeter),
        "referencing_barrier": _referencing_barrier_axis(raw),
        "risk": _risk_axis(raw),
        "first_action": _first_action_axis(raw),
    }


def _normalize_one(account: dict) -> dict[str, Any]:
    raw = account.get("raw_analysis") if isinstance(account.get("raw_analysis"), dict) else {}
    graph = _dig(raw, "org", "orgGraph")
    unknowns: list[str] = []

    siren = account.get("siren") or None
    perimeter = {"siren": siren, "group_role": account.get("group_role") or None} if siren else None
    if perimeter is None:
        unknowns.append("périmètre (entité non ancrée)")

    discovered = _dig(graph, "coverage", "discovered")
    people = _dig(graph, "people")
    if isinstance(discovered, int) and not isinstance(discovered, bool):
        coverage: dict[str, int] | None = {"people": discovered}
    elif isinstance(people, list):
        coverage = {"people": len(people)}
    else:
        coverage = None
        unknowns.append("couverture de l'organigramme")

    counts = [_count_sources(people), _count_sources(_dig(graph, "entities"))]
    signals = raw.get("recent_signals")
    if isinstance(signals, list):
        counts.append(len(signals))
    measured = [c for c in counts if c is not None]
    evidence = {"sources": sum(measured)} if measured else None
    if evidence is None:
        unknowns.append("preuves citées")

    axes_rows = _dig(raw, "plan", "evaluation", "dossier_read", "axes")
    axes: dict[str, Any] | None = None
    if isinstance(axes_rows, list) and axes_rows:
        rows = [r for r in axes_rows if isinstance(r, dict)]
        unmeasured = [str(r.get("key")) for r in rows if r.get("state") == "unknown"]
        axes = {"evaluated": len(rows) - len(unmeasured), "total": len(rows), "unmeasured": unmeasured}
        if unmeasured:
            unknowns.append("axes non évaluables : " + ", ".join(unmeasured))
    else:
        unknowns.append("axes du dossier")

    collected_at = account.get("signals_collected_at") or None
    freshness = {"collected_at": collected_at} if collected_at else None
    if freshness is None:
        unknowns.append("date de collecte")

    if axes is None or axes["total"] == 0:
        depth = "non_mesure"
    else:
        ratio = axes["evaluated"] / axes["total"]
        depth = "solide" if ratio >= _SOLID_RATIO else "partiel" if ratio >= _PARTIAL_RATIO else "mince"

    return {
        "account_id": account.get("id"),
        "company": account.get("company_name"),
        "perimeter": perimeter,
        "coverage": coverage,
        "evidence": evidence,
        "axes": axes,
        "freshness": freshness,
        "depth": depth,
        "unknowns": unknowns,
        # #2303.4/.6/.10/.15/.16/.19-.22 — les cinq axes de CONTENU comparés par
        # périmètre, chacun un état nommé. Additif : ne remplace aucune des clés
        # ci-dessus, lues par le prompt et par ≥2 tests d'intégration.
        "comparison_axes": _comparison_axes(raw, perimeter),
    }


#: États du verdict d'entité où l'identifiant est ANCRÉ (même règle que le
#: contrat : ``ANCHORED_STATES`` de ``entity-resolution.ts``).
_ANCHORED_STATES = frozenset({"resolved", "manual_override", "inactive"})


def _effective_siren(account: dict, corrections: list[dict]) -> str | None:
    """#2284.1 / #2284.67 — le SIREN qui IDENTIFIE ce compte pour une comparaison.

    Une correction de l'espace gagne toujours sur le calcul, quelle que soit sa
    date : la plus haute version « c'est bien celle-ci » donne le SIREN ; un
    « ce n'est pas celle-ci » sur le SIREN calculé l'efface. Sans identifiant
    légal : ``None`` — un NOM ne rapproche jamais deux comptes (#2284.28, .61)."""
    resolution = _dig(account, "raw_analysis", "entity_resolution")
    computed: str | None = None
    if isinstance(resolution, dict) and resolution.get("state") in _ANCHORED_STATES:
        siren = _dig(resolution, "identifiers", "siren")
        computed = siren if isinstance(siren, str) and siren else None
    if computed is None:
        column = account.get("siren")
        computed = column if isinstance(column, str) and column else None

    confirmed: str | None = None
    has_confirmation = False
    rejected: set[str] = set()
    for row in sorted(corrections, key=lambda r: r.get("version") if isinstance(r.get("version"), int) else 0):
        decision = row.get("decision")
        target = row.get("target_siren") if isinstance(row.get("target_siren"), str) else None
        if decision == "confirmed":
            has_confirmation, confirmed = True, target
            if target:
                rejected.discard(target)
        elif decision == "rejected" and target:
            rejected.add(target)
            if confirmed == target:
                has_confirmation, confirmed = False, None
    if has_confirmation:
        return confirmed
    return None if computed in rejected else computed


def identity_overlaps(accounts: list[dict], corrections: list[dict]) -> list[dict[str, Any]]:
    """#2284.1 — les comptes d'une comparaison qui désignent la MÊME entreprise.

    Nommés, jamais fusionnés : chacun reste comparable, l'écran dit qu'ils
    comptent la même cible. Seul un identifiant légal rapproche."""
    by_account: dict[str, list[dict]] = {}
    for row in corrections:
        if isinstance(row, dict) and row.get("decision") in ("confirmed", "rejected") and row.get("account_id"):
            by_account.setdefault(str(row["account_id"]), []).append(row)
    groups: dict[str, list[dict]] = {}
    for account in accounts:
        siren = _effective_siren(account, by_account.get(str(account.get("id")), []))
        if siren:
            groups.setdefault(siren, []).append(account)
    return [
        {
            "relation": "same_entity",
            "account_ids": [str(a.get("id")) for a in members],
            "companies": [a.get("company_name") for a in members],
            "siren": siren,
        }
        for siren, members in groups.items()
        if len(members) > 1
    ]


def normalize_accounts(
    account_ids: list[str], accounts: list[dict], corrections: list[dict] | None = None
) -> dict[str, Any]:
    """Normalise les comptes demandés, dans l'ordre ; écarte ce qui ne se compare pas."""
    by_id = {str(a.get("id")): a for a in accounts if isinstance(a, dict) and a.get("id")}
    normalization: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for account_id in account_ids:
        account = by_id.get(str(account_id))
        if account is None:
            excluded.append({"account_id": account_id, "company": None, "reason": "compte introuvable dans ton espace"})
            continue
        if account.get("status") != "completed":
            excluded.append(
                {"account_id": account_id, "company": account.get("company_name"), "reason": "analyse non terminée"}
            )
            continue
        normalization.append(_normalize_one(account))
    depths = {row["depth"] for row in normalization}
    comparable_ids = {row["account_id"] for row in normalization}
    return {
        "normalization": normalization,
        "excluded": excluded,
        # #2284.1 — résoudre AVANT de comparer : deux comptes, une même entreprise.
        # ``None`` = non mesuré (corrections de l'espace illisibles ou non fournies).
        "identity_overlaps": None
        if corrections is None
        else identity_overlaps(
            [by_id[str(i)] for i in account_ids if str(i) in by_id and by_id[str(i)].get("id") in comparable_ids],
            corrections,
        ),
        "comparable": [row["account_id"] for row in normalization],
        "comparable_on_equal_footing": len(depths) <= 1 and "non_mesure" not in depths,
    }
