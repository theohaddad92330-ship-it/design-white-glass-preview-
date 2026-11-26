"""LUDOVIC-D LC.6 — « trouve-moi des entreprises industrielles en AURA qui recrutent en méthodes/qualité,
avec qui appeler » : Laura lit le MÊME moteur que Découvrir › Comptes, sans second moteur.

Recette prod 19/10 (Stelya, ESN industrielle en régie) : Côte Boulange, Lindt, Boulangeries Paul
(agroalimentaire), motifs taille/ancienneté, 0 signal daté, 0 personne. Trois causes, trois corrections,
chacune sur une pièce qui existe déjà :

- **Les métiers de la DEMANDE affinent ceux du profil** : ils deviennent les ``placedRoles`` du profil le
  temps de la recherche (même contrat que le cadrage d'un run, ``run_cadrage.profile_with_run_roles``) —
  le moteur de Découvrir (``discover_registry``) ne garde alors que les offres dans ces métiers.
- **Un secteur demandé DANS la cible du profil l'affine, il ne la lève pas** : « industrielles » pour un
  profil qui cible l'industrie garde le filtre cible de Découvrir (``sector_matches_profile_targets``) ;
  l'agroalimentaire (``food_beverage``, table NAF partagée) n'en fait partie que si le profil le nomme.
  Un secteur HORS du profil demandé explicitement reste servi tel quel (décision #2489.3/D1).
- **L'ordre** : une offre datée dans les métiers demandés d'abord (le rang de « Comptes qui recrutent »),
  puis un autre signal daté, puis le reste dans l'ordre reçu. Rien n'est inventé : chaque entreprise cite
  son signal (intitulé + date) et ses personnes CONNUES, sinon « personne connue : à trouver » + l'action
  « Trouver qui appeler ».

Pur, sans I/O (les personnes connues sont lues par l'appelant).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from app.services.application_sector_naf import naf_prefixes_for_sectors
from app.services.discover_scoring import sector_matches_profile_targets, target_sectors_of
from app.services.domain_job_filters import fold
from app.services.naf_sections import NAF_SECTION_TO_APPLICATION_GROUPS, SECTOR_TO_NAF_SECTION
from app.services.run_cadrage import profile_with_run_roles

#: Ce qu'un profil écrit pour dire qu'il cible l'agroalimentaire.
_AGRIFOOD_WORDS = ("agroalimentaire", "agro alimentaire", "alimentaire")

PEOPLE_TO_FIND = "personne connue : à trouver"
FIND_WHO_TO_CALL = "Trouver qui appeler"


def demand_trades(raw: object) -> list[str]:
    """Les métiers DITS dans la demande (« méthodes », « qualité »), propres, sans doublon."""
    if not isinstance(raw, (list, tuple)):
        return []
    return list(dict.fromkeys(str(t).strip() for t in raw if isinstance(t, str) and str(t).strip()))[:6]


def profile_for_demand(profile: Mapping[str, Any] | None, trades: Sequence[str]) -> dict[str, Any] | None:
    """Le profil dont les métiers placés sont ceux de la demande (copie) ; sans métier dit, tel quel."""
    return profile_with_run_roles(dict(profile) if profile else profile, {"business_families": list(trades)})


def _section_words(sector: str) -> str:
    section = SECTOR_TO_NAF_SECTION.get(sector, "")
    return " ".join(NAF_SECTION_TO_APPLICATION_GROUPS.get(section, ()))


def demand_refines_profile(sectors: Sequence[str], profile: Mapping[str, Any] | None) -> bool:
    """Vrai quand le profil déclare une cible et que chaque secteur demandé y tombe (ou aucun n'est dit)."""
    targets = target_sectors_of(profile or {})
    if not targets:
        return False
    return all(sector_matches_profile_targets(_section_words(sector), targets) for sector in sectors)


def _naf4(code: object) -> str:
    return "".join(ch for ch in str(code or "") if ch.isdigit())[:4]


def keep_profile_target(
    rows: Iterable[Mapping[str, Any]], profile: Mapping[str, Any] | None
) -> tuple[list[Mapping[str, Any]], list[str]]:
    """Le filtre cible de Découvrir appliqué aux lignes du registre. Rend ``(gardées, activités_écartées)``.

    Activité inconnue : gardée (GA-18/GA-19, l'inconnu n'est pas « hors cible »)."""
    targets = target_sectors_of(profile or {})
    agrifood_targeted = any(word in " ".join(targets).lower() for word in _AGRIFOOD_WORDS)
    agrifood = set(naf_prefixes_for_sectors(["food_beverage"]))
    kept: list[Mapping[str, Any]] = []
    excluded: list[str] = []
    for row in rows:
        activity = str(row.get("nafLabel") or row.get("sector") or "").strip()
        if not activity:
            kept.append(row)
            continue
        in_agrifood = _naf4(row.get("nafCode")) in agrifood
        if in_agrifood:
            # « Fabrication INDUSTRIELLE de pain » n'est pas l'industrie d'un profil qui ne cible pas l'agro.
            if agrifood_targeted:
                kept.append(row)
            else:
                excluded.append(activity)
            continue
        if not sector_matches_profile_targets(activity, targets):
            excluded.append(activity)
            continue
        kept.append(row)
    return kept, excluded


def _dated(signal: Mapping[str, Any]) -> bool:
    return bool(str(signal.get("date") or "").strip()) and bool(str(signal.get("label") or "").strip())


def _in_trades(signal: Mapping[str, Any], trades: Sequence[str]) -> bool:
    if str(signal.get("type") or "") != "hiring":
        return False
    if not trades:
        return True
    label = fold(signal.get("label"))
    return any(fold(trade) in label for trade in trades)


def call_signal(item: Mapping[str, Any], trades: Sequence[str]) -> dict[str, str] | None:
    """Le signal à CITER : l'offre datée dans les métiers demandés, sinon le premier signal daté."""
    signals = [s for s in item.get("signals") or [] if isinstance(s, Mapping) and _dated(s)]
    best = next((s for s in signals if _in_trades(s, trades)), None) or (signals[0] if signals else None)
    if best is None:
        return None
    return {"label": str(best["label"]).strip(), "date": str(best["date"]).strip()}


def _tier(item: Mapping[str, Any], trades: Sequence[str]) -> int:
    signals = [s for s in item.get("signals") or [] if isinstance(s, Mapping) and _dated(s)]
    if any(_in_trades(s, trades) for s in signals):
        return 0
    return 1 if signals else 2


def order_for_call(items: Sequence[dict[str, Any]], trades: Sequence[str]) -> list[dict[str, Any]]:
    """Offre datée dans les métiers demandés, puis autre signal daté, puis le reste — tri STABLE."""
    return sorted(items, key=lambda item: _tier(item, trades))


#: #4421.3 — les contacts à joindre d'un compte (même plafond que les missions d'un talent).
PEOPLE_TO_CALL_MAX = 10


def attach_call_facts(
    items: Sequence[dict[str, Any]], trades: Sequence[str], people: Mapping[str, Sequence[Mapping[str, Any]]]
) -> None:
    """Pose sur chaque item : ``call_signal`` (intitulé + date, absent si aucun) et ``people_to_call``
    (les personnes CONNUES du compte de l'espace) — sinon ``people_note`` + l'action « Trouver qui appeler »."""
    for item in items:
        signal = call_signal(item, trades)
        if signal:
            item["call_signal"] = signal
        known = [p for p in people.get(str(item.get("account_id") or ""), ()) if str(p.get("name") or "").strip()]
        if known:
            # #4421.3 — dix au plus : un geste « Préparer le mail à … » par contact connu.
            item["people_to_call"] = [dict(p) for p in known[:PEOPLE_TO_CALL_MAX]]
            continue
        item["people_note"] = PEOPLE_TO_FIND
        item["find_who_to_call"] = {
            "label": FIND_WHO_TO_CALL,
            **(
                {"tool": "propose_people_search", "account_id": item["account_id"]}
                if item.get("account_id")
                else {"tool": "plan_account_analysis", "siren": item.get("siren")}
            ),
            **({"roles": list(trades)} if trades else {}),
        }
