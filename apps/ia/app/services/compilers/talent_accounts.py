"""#3816.1 — « Trouve-moi des missions pour ce profil » : le marché inversé d'UN talent, en comptes.

Pur, sans réseau : reçoit ce que le pont a rendu (`ReverseMarketService.forTalent`, le calcul de
l'écran `/consultants/:id/reverse-market`) et le met en forme pour le fil de Laura. Aucun calcul
neuf (GA-26) — seulement la lecture, compte par compte, de ce que la veille a relevé.

CE QUE CETTE LECTURE REFUSE D'AFFIRMER (même discipline que `reverse-market.ts`) :
  * la veille compte les offres PAR ENTREPRISE et les technologies PAR DÉPARTEMENT, sans croiser
    les deux. La raison dit donc « ses compétences X, Y sont demandées sur le 69 » ET « cette
    entreprise y publie N offres » — jamais « cette entreprise recrute ce profil » ;
  * une entreprise qui recrute sur un département où AUCUNE compétence de la fiche n'est demandée
    n'a pas de lien avec le profil : elle n'est PAS listée (on n'invente aucune cible pour
    remplir une liste), elle est COMPTÉE dans les limites ;
  * une ouverture à la sous-traitance jamais déclarée n'est pas « non » : elle est NOMMÉE ;
  * une lecture impossible (pas de zone, pas de compétence, pas de relevé) se NOMME — jamais
    « 0 compte », jamais « marché vide ».
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

#: Au-delà, ce n'est plus une liste qu'on lit (même borne que `REVERSE_MARKET_RECRUITERS_MAX`).
#: #4421.3 — c'est le DÉFAUT : le volume DEMANDÉ dans le prompt (« 3 comptes », « 20 comptes ») le remplace,
#: borné par `TALENT_ACCOUNTS_LIMIT`.
TALENT_ACCOUNTS_MAX = 10

#: #4421.3 — le plafond d'un volume demandé : au-delà, le moteur de Découvrir ne lit pas plus d'employeurs.
TALENT_ACCOUNTS_LIMIT = 25

#: #4421.3 — par compte, les besoins (offres relevées) et les contacts à joindre rendus dans le fil.
TALENT_NEEDS_MAX = 10
TALENT_CONTACTS_MAX = 10

#: Les axes qui ORDONNENT la liste — un rang n'est jamais nu.
TALENT_ACCOUNTS_AXES = (
    "Compétences de la fiche demandées sur la zone",
    "Offres publiées par l'entreprise sur la zone",
)

#: La source telle que l'écran la nomme — nos fournisseurs ne se nomment jamais.
TALENT_ACCOUNTS_SOURCE = "Veille territoriale (offres publiques)"

#: Pourquoi la lecture n'a pas pu se faire — la liste FERMÉE du contrat (`REVERSE_MARKET_UNAVAILABLE_REASONS`).
UNAVAILABLE_MESSAGES: dict[str, str] = {
    # REVIENT SUR #4421.12 (« zones_missing : aucune question », renvoi vers la fiche) — arbitrage Louis 31/10/2026 :
    # un critère bloquant manque (le lieu) → UNE question à choix, puis Laura agit.
    "zones_missing": "La fiche de {name} ne porte aucune zone : dans quel territoire cherches-tu ses missions ?",
    # #4421.12 — le SEUL manque qui fait demander : UNE question, qui dit quoi fournir pour lancer la recherche.
    "skills_missing": "La fiche de {name} ne porte aucune compétence : quelles sont ses compétences principales (ou joins son CV) ?",
    "zones_unresolved": "Les zones de {name} ({zones}) ne désignent aucun département relevé par la veille : je ne sais pas les relier. Précise un département sur sa fiche.",
    "no_snapshot": "La veille n'a encore rien relevé sur les zones de {name} : ce n'est pas un marché vide, c'est un territoire pas encore regardé.",
}

#: Les deux critères BLOQUANTS (métier/compétence, lieu) : la raison → (critère, champ de l'outil qui porte la réponse).
_BLOCKING_CRITERION: dict[str, tuple[str, str]] = {
    "zones_missing": ("zones", "zones"),
    "skills_missing": ("skills", "skills"),
}

_OPEN_NOT_DECLARED = "Ouverture à la sous-traitance"
_LIMIT_NOT_CROSSED = (
    "La veille compte les offres par entreprise et les technologies par département, sans les croiser : "
    "elle ne dit pas que ces entreprises recrutent ce profil précisément."
)
_LIMIT_PUBLIC = "Offres publiques : une entreprise concurrente lit exactement les mêmes."


def _int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _matched_by_department(demand: Sequence[Mapping[str, Any]]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for row in demand:
        department = str(row.get("department") or "").strip()
        terms = [
            str(t.get("term")).strip()
            for t in (row.get("matchedTechnologies") or [])
            if isinstance(t, Mapping) and str(t.get("term") or "").strip()
        ]
        if department:
            out[department] = terms
    return out


def compile_talent_accounts(
    market: Mapping[str, Any],
    *,
    consultant_id: str,
    consultant_name: str,
    skill_accounts: Sequence[dict[str, Any]] = (),
    skill_zone: Sequence[str] = (),
    max_accounts: int = TALENT_ACCOUNTS_MAX,
) -> dict[str, Any]:
    """Le marché inversé d'un talent → la sortie de l'outil `find_accounts_for_talent`.

    KEVIN-FIX K.6 — ``skill_accounts`` vient du moteur de Découvrir (mêmes critères : compétences de la fiche ×
    départements de sa zone) ; il PASSE AVANT la veille, et une veille muette ne le fait pas taire.
    """
    consultant = {"id": consultant_id, "name": consultant_name}
    reason = market.get("unavailableReason")
    if skill_accounts and isinstance(reason, str) and reason:
        return {
            "status": "ok",
            "consultant": consultant,
            "axes": list(TALENT_ACCOUNTS_AXES),
            "source": TALENT_ACCOUNTS_SOURCE,
            "accounts": list(skill_accounts)[:max_accounts],
            "limits": [
                _LIMIT_PUBLIC,
                "Comptes relevés par leurs offres datées (moins de 90 jours) qui citent une compétence de la fiche.",
            ],
        }
    if isinstance(reason, str) and reason and skill_zone:
        return {
            "status": "ok",
            "consultant": consultant,
            "axes": list(TALENT_ACCOUNTS_AXES),
            "source": TALENT_ACCOUNTS_SOURCE,
            "accounts": [],
            "limits": [_LIMIT_PUBLIC],
            "message": (
                f"Aucune offre récente (moins de 90 jours) ne cite les compétences de {consultant_name} "
                f"sur {', '.join('le ' + d for d in skill_zone)} : ce n'est pas un marché prouvé vide, "
                "seulement rien de relevé."
            ),
        }
    if isinstance(reason, str) and reason:
        template = UNAVAILABLE_MESSAGES.get(reason, "Le marché inversé de {name} n'a pas pu être lu.")
        zones = ", ".join(str(z) for z in (market.get("unresolvedZones") or market.get("zones") or []))
        out: dict[str, Any] = {
            "status": "unavailable",
            "consultant": consultant,
            "reason": reason,
            "message": template.format(name=consultant_name, zones=zones or "—"),
        }
        if reason in _BLOCKING_CRITERION:
            criterion, then_pass_in = _BLOCKING_CRITERION[reason]
            out["clarification"] = {
                "criterion": criterion,
                "via": "ask_clarification",
                "question": out["message"],
                "options_rule": (
                    "2 ou 3 options tirées de ce que la conversation, le CV ou l'espace ont déjà montré, plus « Autre » : "
                    "jamais inventées. Une seule question, jamais une série."
                ),
                "then_pass_in": then_pass_in,
                "then": "find_accounts_for_talent",
            }
        return out

    matched = _matched_by_department([d for d in (market.get("demand") or []) if isinstance(d, Mapping)])
    accounts: list[dict[str, Any]] = []
    unlinked: set[str] = set()
    for row in market.get("recruiters") or []:
        if not isinstance(row, Mapping):
            continue
        name = str(row.get("name") or "").strip()
        department = str(row.get("department") or "").strip()
        if not name or not department:
            continue
        skills = matched.get(department) or []
        if not skills:
            unlinked.add(name.casefold())
            continue
        offers = _int(row.get("offers"))
        observed_on = str(row.get("observedOn") or "")[:10] or None
        why = [f"Compétences de la fiche demandées sur le {department} : {', '.join(skills[:6])}."]
        dated = f" (relevé du {observed_on})" if observed_on else ""
        if offers is not None:
            why.append(f"{name} publie {offers} offres sur le {department}{dated}.")
        else:
            why.append(f"{name} publie des offres sur le {department}{dated}.")
        open_to = row.get("openToSubcontracting")
        not_evaluated: list[str] = []
        if open_to is True:
            why.append("Ouverte à la sous-traitance (déclaré).")
        elif open_to is None:
            not_evaluated.append(_OPEN_NOT_DECLARED)
        accounts.append(
            {
                "name": name,
                "department": department,
                "observed_on": observed_on,
                "offers": offers,
                "matched_skills": skills[:6],
                "open_to_subcontracting": open_to if isinstance(open_to, bool) else None,
                "why": why,
                "not_evaluated": not_evaluated,
                "_rank": (len(skills), offers or 0),
            }
        )
    # Un compte n'apparaît qu'une fois : la ligne la mieux reliée au profil gagne.
    by_name: dict[str, dict[str, Any]] = {}
    for account in accounts:
        key = account["name"].casefold()
        if key not in by_name or account["_rank"] > by_name[key]["_rank"]:
            by_name[key] = account
    ranked = sorted(by_name.values(), key=lambda a: (-a["_rank"][0], -a["_rank"][1], a["name"]))
    for account in ranked:
        account.pop("_rank", None)
    if skill_accounts:
        ranked = merge_talent_accounts(ranked, skill_accounts)

    limits = [_LIMIT_NOT_CROSSED, _LIMIT_PUBLIC]
    unlinked -= set(by_name)
    if unlinked:
        n = len(unlinked)
        noun = "entreprise recrute" if n == 1 else "entreprises recrutent"
        limits.append(
            f"{n} {noun} sur sa zone sans qu'aucune de ses compétences figure parmi les technologies "
            "les plus demandées : non listée(s)."
        )
    unresolved = [str(z) for z in (market.get("unresolvedZones") or []) if str(z).strip()]
    if unresolved:
        limits.append(f"Zones de la fiche non reliées à un département relevé : {', '.join(unresolved)}.")
    if ranked[max_accounts:]:
        limits.append(f"{len(ranked) - max_accounts} autres comptes au-delà des {max_accounts} premiers.")

    out: dict[str, Any] = {
        "status": "ok",
        "consultant": consultant,
        "axes": list(TALENT_ACCOUNTS_AXES),
        "source": TALENT_ACCOUNTS_SOURCE,
        "accounts": ranked[:max_accounts],
        "limits": limits,
    }
    if not ranked:
        # Une lecture faite, sans compte relié au profil : une réponse, pas une panne — et pas « 0 ».
        out["message"] = (
            f"Aucune entreprise relevée sur la zone de {consultant_name} ne recrute sur ses compétences "
            "dans le dernier relevé."
        )
    return out


def accounts_from_skill_search(
    found_accounts: Sequence[Mapping[str, Any]], *, departments: Sequence[str]
) -> list[dict[str, Any]]:
    """KEVIN-FIX K.6 / K.14 — les comptes que le moteur de Découvrir (compétence → offres → employeurs) rend.

    Un compte n'est listé que s'il porte une PREUVE liée à la demande : une offre datée qui cite une compétence
    de la fiche. Une ancienneté, un effectif ou un secteur seuls ne sont pas une raison — pas de remplissage.
    """
    zone = ", ".join(f"le {d}" for d in departments) if departments else "sa zone"
    out: list[dict[str, Any]] = []
    for row in found_accounts:
        name = str(row.get("name") or "").strip()
        evidence = row.get("skillEvidence")
        if not name or not isinstance(evidence, Mapping):
            continue
        skill = str(evidence.get("skill") or "").strip()
        count = _int(evidence.get("offerCount"))
        latest = evidence.get("latestOffer") if isinstance(evidence.get("latestOffer"), Mapping) else {}
        observed_on = str(latest.get("date") or "")[:10] or None
        if not skill or not count or not observed_on:
            continue
        noun = "offre" if count == 1 else "offres"
        title = str(latest.get("title") or "").strip()
        why = [
            f"{name} publie {count} {noun} citant {skill}, une compétence de la fiche, sur {zone} "
            f"(dernière offre du {observed_on}{f' : {title}' if title else ''})."
        ]
        department = str(row.get("department") or "").strip() or None
        out.append(
            {
                "name": name,
                "siren": row.get("siren"),
                "department": department,
                "observed_on": observed_on,
                "offers": count,
                "matched_skills": [skill],
                "open_to_subcontracting": None,
                "why": why,
                "not_evaluated": [_OPEN_NOT_DECLARED],
                "needs": _skill_needs(evidence, skill),
            }
        )
    return out


def _skill_needs(evidence: Mapping[str, Any], skill: str) -> list[dict[str, str]]:
    """#4421.3 — les BESOINS relevés d'un compte : ses offres datées (titre, date, compétence qui matche, ville),
    la plus récente d'abord, jusqu'à `TALENT_NEEDS_MAX`. Le moteur rend ``offers`` quand il les garde, sinon sa
    seule ``latestOffer`` : on rend ce qu'il a, jamais une offre devinée. Une offre sans date n'est pas un besoin
    daté : elle n'est pas listée. La source reste dans la donnée du moteur, jamais ici (doctrine)."""
    raw = evidence.get("offers")
    offers = raw if isinstance(raw, list) else [evidence.get("latestOffer")]
    needs: list[dict[str, str]] = []
    for offer in offers:
        if not isinstance(offer, Mapping):
            continue
        date = str(offer.get("date") or "")[:10]
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            continue
        need = {
            "title": str(offer.get("title") or "").strip(),
            "date": date,
            "skill": str(offer.get("skill") or skill).strip(),
            "city": str(offer.get("city") or "").strip(),
        }
        needs.append({key: value for key, value in need.items() if value})
    needs.sort(key=lambda need: need["date"], reverse=True)
    return needs[:TALENT_NEEDS_MAX]


def merge_talent_accounts(
    market_accounts: Sequence[dict[str, Any]], skill_accounts: Sequence[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Les comptes de Découvrir d'abord (une offre qui cite la compétence), puis ceux de la veille qui n'y sont
    pas déjà ; un compte présent des deux côtés garde les deux raisons."""
    merged: dict[str, dict[str, Any]] = {a["name"].casefold(): dict(a) for a in skill_accounts}
    for account in market_accounts:
        key = account["name"].casefold()
        if key in merged:
            merged[key]["why"] = [*merged[key]["why"], *account.get("why", [])]
        else:
            merged[key] = dict(account)
    return list(merged.values())


def talent_zone_departments(market: Mapping[str, Any]) -> list[str]:
    """Les départements de la zone de la fiche : un code de la fiche (« 59 ») EST un département ; un libellé
    (« Lille », « 59 — Nord », « Hauts-de-France ») se lit par la table des zones. Inconnu ⇒ rien (jamais deviné)."""
    from app.services.contact_zone import zone_departments

    out: set[str] = set()
    for raw in [*(market.get("departments") or []), *(market.get("zones") or [])]:
        text = str(raw or "").strip()
        if re.fullmatch(r"(?:2[AB]|\d{2,3})", text.upper()):
            out.add(text.upper())
        else:
            out |= set(zone_departments([text]))
    return sorted(out)


def merge_unique_accounts(
    first: Sequence[dict[str, Any]], more: Sequence[dict[str, Any]]
) -> list[dict[str, Any]]:
    """#4421.3 — ``first`` d'abord (les exacts gardent leur rang), puis les comptes de ``more`` qui n'y sont pas
    (par SIREN, à défaut par nom plié) ; un compte déjà présent reste tel quel."""
    out = list(first)
    seen = {str(a.get("siren") or a.get("name") or "").casefold() for a in out}
    for account in more:
        key = str(account.get("siren") or account.get("name") or "").casefold()
        if key and key not in seen:
            seen.add(key)
            out.append(account)
    return out
