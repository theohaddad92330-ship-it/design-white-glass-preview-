"""Thread achats — consolidation des marchés IT ATTRIBUÉS (DECP) en un fil.

Les marchés attribués (``awardedContracts``, source DECP) sont déjà collectés et
injectés bruts dans les prompts de recherche (voir ``dated_signals``). Ils sont
riches mais plats : une liste de lignes « objet · acheteur · titulaire ». Ce
service en fait le **thread achats** du compte — la lecture consolidée que Théo
demande (Drive top-3) :

- un **fil chronologique** (date, objet, montant si dispo, titulaire, acheteur) ;
- un regroupement **par prestataire** (le titulaire = le concurrent qui a déjà
  gagné — « ces N ESN ont déjà vendu à ce groupe ») ;
- un regroupement **par entité acheteuse** (quelle entité du groupe achète quoi).

100 % déterministe, aucune invention : tout sort des champs DECP. Un montant
absent n'est jamais affiché (jamais reconstruit). Vide en entrée → vide en sortie
(le dossier / le prompt ne grossit que sur de la donnée réelle).
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.services.text_norm import normalize_name

# Date la plus ancienne possible — les lignes sans date parseable coulent en fin
# de fil (comme la source DECP elle-même), sans être jetées.
_MIN_DATE = datetime.min.replace(tzinfo=UTC)


def _clean(value: object, limit: int | None = None) -> str:
    s = " ".join(str(value or "").split())
    return s[:limit] if limit else s


def _clean_or_none(value: object, limit: int | None = None) -> str | None:
    s = _clean(value, limit)
    return s or None


def _parse_date(value: object) -> datetime | None:
    """Best-effort ISO parse (accepte ``YYYY-MM-DD`` et l'horodatage complet)."""
    s = str(value or "").strip()
    if not s:
        return None
    s = s.replace("Z", "+00:00")
    for candidate in (s, s[:10]):
        try:
            dt = datetime.fromisoformat(candidate)
        except ValueError:
            continue
        return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt
    return None


def _normalized_item(contract: dict) -> dict | None:
    """Une ligne DECP → une entrée typée du fil. ``None`` si trop pauvre pour être
    actionnable (ni objet, ni titulaire, ni acheteur)."""
    title = _clean_or_none(contract.get("title"), 300)
    supplier = _clean_or_none(contract.get("winner"), 160)
    buyer = _clean_or_none(contract.get("buyer"), 160)
    if not (title or supplier or buyer):
        return None
    return {
        # Date affichable (YYYY-MM-DD) — jamais reconstruite, None si absente.
        "date": (_clean(contract.get("notifiedDate"))[:10] or None),
        "object": title,
        # Montant : factuel, affiché seulement s'il est présent (Théo : pas d'invention).
        "amount": _clean_or_none(contract.get("amount"), 40),
        # Titulaire = le concurrent qui a gagné le marché.
        "supplier": supplier,
        # Acheteur = l'entité du groupe qui a passé le marché.
        "buyer": buyer,
        "location": _clean_or_none(contract.get("location"), 80),
        "cpv": _clean_or_none(contract.get("cpv"), 40),
        "url": _clean_or_none(contract.get("url"), 400),
    }


def _group(
    items: list[tuple[datetime, dict]],
    key_field: str,
    other_field: str,
    count_label: str,
    last_label: str,
    others_label: str,
) -> list[dict]:
    """Regroupe le fil par ``key_field`` (supplier ou buyer). Déterministe :
    trié par nombre de marchés décroissant, puis nom normalisé. ``others`` = les
    contreparties distinctes (buyers d'un titulaire, ou titulaires d'un acheteur)."""
    groups: dict[str, dict] = {}
    for dt, item in items:
        name = item.get(key_field)
        if not name:
            continue
        norm = normalize_name(name)
        g = groups.get(norm)
        if g is None:
            g = groups[norm] = {
                "name": name,
                count_label: 0,
                last_label: None,
                "_last_dt": _MIN_DATE,
                others_label: [],
                "_others_seen": set(),
                "objects": [],
            }
        g[count_label] += 1
        if dt > g["_last_dt"]:
            g["_last_dt"] = dt
            g[last_label] = item.get("date")
        other = item.get(other_field)
        if other and normalize_name(other) not in g["_others_seen"]:
            g["_others_seen"].add(normalize_name(other))
            g[others_label].append(other)
        obj = item.get("object")
        if obj and len(g["objects"]) < 3 and obj not in g["objects"]:
            g["objects"].append(obj)

    ordered = sorted(
        groups.values(),
        key=lambda g: (-g[count_label], normalize_name(g["name"])),
    )
    for g in ordered:
        g.pop("_last_dt", None)
        g.pop("_others_seen", None)
    return ordered


def build_purchasing_thread(awarded_contracts: object) -> dict:
    """Consolide les marchés IT attribués (DECP) en un thread achats typé.

    Retourne ``{items, bySupplier, byBuyer, incumbents, summary}`` :
    - ``items`` — fil chronologique (récent d'abord) : date, objet, montant (si
      dispo), titulaire (concurrent), acheteur (entité du groupe) ;
    - ``bySupplier`` — regroupement par prestataire (titulaire) : nombre de
      marchés gagnés, entités servies, dernier marché ;
    - ``byBuyer`` — regroupement par entité acheteuse du groupe ;
    - ``incumbents`` — les titulaires en place (concurrents à déloger), du plus
      actif au moins actif — la matière du « ces N ESN ont déjà vendu à ce groupe » ;
    - ``summary`` — compteurs (marchés, prestataires, acheteurs, montants connus).

    Déterministe et factuel : un ``awarded_contracts`` vide/None → un thread vide.
    """
    contracts = awarded_contracts if isinstance(awarded_contracts, list) else []

    scored: list[tuple[datetime, dict]] = []
    for c in contracts:
        if not isinstance(c, dict):
            continue
        item = _normalized_item(c)
        if item is None:
            continue
        scored.append((_parse_date(item.get("date")) or _MIN_DATE, item))

    # Fil chronologique : plus récent d'abord ; départage stable (objet, titulaire)
    # pour un ordre 100 % déterministe malgré des dates égales/absentes.
    scored.sort(
        key=lambda t: (t[0], _clean(t[1].get("object")), _clean(t[1].get("supplier"))),
        reverse=True,
    )
    items = [item for _dt, item in scored]

    by_supplier = _group(scored, "supplier", "buyer", "contractsWon", "lastWonDate", "buyers")
    by_buyer = _group(scored, "buyer", "supplier", "contractsAwarded", "lastAwardedDate", "suppliers")

    # Titulaires en place = concurrents à déloger, du plus actif au moins actif.
    incumbents = [
        {
            "supplier": g["name"],
            "contractsWon": g["contractsWon"],
            "buyers": list(g["buyers"]),
            "lastWonDate": g["lastWonDate"],
        }
        for g in by_supplier
    ]

    return {
        "items": items,
        "bySupplier": by_supplier,
        "byBuyer": by_buyer,
        "incumbents": incumbents,
        "summary": {
            "totalContracts": len(items),
            "supplierCount": len(by_supplier),
            "buyerCount": len(by_buyer),
            "withAmount": sum(1 for i in items if i.get("amount")),
        },
    }


def render_purchasing_thread_block(thread: object, *, max_suppliers: int = 5, max_items: int = 6) -> str:
    """Bloc directive compact du thread achats pour le prompt de plan (Phase 4).

    Met en avant les titulaires en place (concurrents ayant déjà vendu au groupe)
    + un extrait chronologique, et pousse la reco « déloger un titulaire ». Vide
    ("") quand il n'y a aucun marché — le prompt ne grossit que sur du réel.
    """
    if not isinstance(thread, dict):
        return ""
    incumbents = [i for i in (thread.get("incumbents") or []) if isinstance(i, dict)]
    items = [i for i in (thread.get("items") or []) if isinstance(i, dict)]
    if not incumbents and not items:
        return ""

    lines = [
        "THREAD ACHATS (source : données de la commande publique, marchés IT attribués récents — factuel) :",
        "Ces prestataires ont DÉJÀ vendu de l'IT à ce groupe (titulaires en place = concurrents à déloger) :",
    ]
    for inc in incumbents[:max_suppliers]:
        supplier = _clean(inc.get("supplier"))
        if not supplier:
            continue
        count = inc.get("contractsWon") or 0
        buyers = ", ".join(_clean(b) for b in (inc.get("buyers") or []) if _clean(b))
        last = _clean(inc.get("lastWonDate"))
        meta = []
        if count:
            meta.append(f"{count} marché{'s' if count > 1 else ''} IT")
        if buyers:
            meta.append(f"pour {buyers}")
        if last:
            meta.append(f"dernier {last}")
        lines.append(f"- {supplier}" + (f" — {' · '.join(meta)}" if meta else ""))

    detailed = [i for i in items if i.get("object")][:max_items]
    if detailed:
        lines.append("Marchés attribués récents (le plus récent d'abord) :")
        for it in detailed:
            date = _clean(it.get("date"))
            obj = _clean(it.get("object"), 140)
            supplier = _clean(it.get("supplier"))
            amount = _clean(it.get("amount"))
            meta = " · ".join(
                p for p in (date, f"→ {supplier}" if supplier else "", amount) if p
            )
            lines.append(f"- {obj}" + (f" [{meta}]" if meta else ""))

    lines.append(
        "→ EXPLOITE-LE : pour chaque titulaire en place, propose un angle de DÉLOGEMENT "
        "(renfort/co-traitance sur son périmètre, expertise de niche qu'il ne couvre pas, "
        "fin de marché à anticiper) — jamais frontal aveugle. Ne cite QUE les titulaires ci-dessus."
    )
    return "\n".join(lines).strip()
