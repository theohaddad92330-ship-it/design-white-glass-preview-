"""Le score d'un compte en cinq axes, expliqué (recette finale §27-28).

Le rapport ne reproche pas la note — « la logique est juste » — mais deux choses
qui la rendent inutilisable en réunion.

D'abord elle est **tronquée sans le dire** : « le score est tronqué par un profil
ESN non précisé et une collecte encore partielle ». Un 4/10 obtenu parce que le
compte est difficile et un 4/10 obtenu parce qu'on ne sait rien de l'ESN
appellent des décisions opposées — passez votre chemin, ou complétez votre
profil. Affichés pareil, ils font abandonner des comptes pour une mauvaise raison.

Ensuite elle n'est **pas actionnable** : le §28 veut pouvoir écrire « avec une
référence bancaire ou un partenaire rang 2, le score passerait à 6 ». Un score
qui ne dit pas ce qui le ferait monter est un verdict, pas un outil.

Le calcul est déterministe — règles sur la sortie, aucun appel modèle. C'est le
même choix que pour la fraîcheur des signaux ou la qualification des candidats :
une note demandée à un modèle change d'un run à l'autre sur le même dossier, et
deux commerciaux ne lisent alors pas le même compte.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

#: Les cinq axes du §28, chacun sur 5 — total 25, la grille déjà en vigueur.
AXES = ("fit", "signal", "accessibility", "capacity", "data_quality")
AXIS_MAX = 5
TOTAL_MAX = len(AXES) * AXIS_MAX


def _count(value: Any) -> int:
    return len(value) if isinstance(value, (list, tuple)) else 0


def _clamp(points: int) -> int:
    return max(0, min(AXIS_MAX, points))


def _fit_axis(analysis: Mapping[str, Any], profile: Mapping[str, Any]) -> dict[str, Any]:
    """Adéquation avec les expertises de l'ESN.

    Sans profil, l'axe ne vaut PAS zéro : zéro voudrait dire « aucune adéquation
    », ce qui est une affirmation sur le compte. On rend le milieu et on dit que
    la note est plafonnée par le profil manquant — c'est la distinction du §27.
    """
    offers = [o for o in (profile.get("offers") or []) if str(o).strip()]
    if not offers:
        return {
            "axis": "fit",
            "points": 2,
            "evidence": "Profil ESN incomplet : l'adéquation ne peut pas être jugée.",
            "lever": "Compléter les expertises et références dans le profil pour débloquer cet axe.",
            "limitedByData": True,
        }

    needs = analysis.get("painPoints") or analysis.get("challenges") or []
    matched = 0
    haystack = " ".join(str(n).lower() for n in needs if n)
    for offer in offers:
        if str(offer).strip().lower() in haystack:
            matched += 1

    points = _clamp(1 + min(4, matched * 2))
    return {
        "axis": "fit",
        "points": points,
        "evidence": (
            f"{matched} de vos expertises recoupent les besoins détectés."
            if matched
            else "Aucune de vos expertises ne recoupe explicitement les besoins détectés."
        ),
        "lever": None if points >= AXIS_MAX else "Une référence comparable sur ce secteur ferait monter cet axe.",
        "limitedByData": False,
    }


def _signal_axis(analysis: Mapping[str, Any]) -> dict[str, Any]:
    """Urgence : ce qui rend le moment favorable, et seulement s'il est daté.

    #3928 — comptait auparavant tout ce qui n'était pas « archive », ce qui
    comptait aussi un signal SANS date (``freshness`` absent ou ``undated``,
    `signal_freshness.classify_signal_freshness`) comme vivant. Seul
    ``current`` est un signal daté de moins de ~24 mois — même règle que
    `isSignalArchived` côté TS (`packages/contracts/src/schemas/account.ts`) :
    un signal non mesuré ne devient jamais un signal récent.
    """
    signals = analysis.get("recentSignals") or []
    live = [s for s in signals if isinstance(s, Mapping) and s.get("freshness") == "current"]
    jobs = _count(analysis.get("itJobSignals") or analysis.get("it_job_signals"))

    points = _clamp(min(AXIS_MAX, len(live) + (1 if jobs >= 3 else 0)))
    if not live and not jobs:
        return {
            "axis": "signal",
            "points": 0,
            "evidence": "Aucun signal daté de moins de 24 mois.",
            "lever": "Une actualisation ciblée peut faire remonter des faits récents.",
            "limitedByData": True,
        }
    return {
        "axis": "signal",
        "points": points,
        "evidence": f"{len(live)} signal(aux) récent(s)" + (f", {jobs} offre(s) d'emploi IT." if jobs else "."),
        "lever": None if points >= AXIS_MAX else "Un budget confirmé ou un programme nommé ferait monter cet axe.",
        "limitedByData": False,
    }


def _accessibility_axis(analysis: Mapping[str, Any]) -> dict[str, Any]:
    """Y a-t-il une porte d'entrée réelle — un interlocuteur joignable ?"""
    contacts = analysis.get("contacts") or []
    reachable = [
        c
        for c in contacts
        if isinstance(c, Mapping) and (c.get("email") or c.get("phone") or c.get("linkedin_url"))
    ]
    if not contacts:
        return {
            "axis": "accessibility",
            "points": 0,
            "evidence": "Aucun interlocuteur identifié sur ce compte.",
            "lever": "Lancer une recherche de contacts sur le périmètre visé.",
            "limitedByData": True,
        }
    points = _clamp(1 + min(4, len(reachable)))
    return {
        "axis": "accessibility",
        "points": points,
        "evidence": f"{len(reachable)} interlocuteur(s) joignable(s) sur {len(contacts)} identifié(s).",
        "lever": None if points >= AXIS_MAX else "Enrichir un décideur du périmètre ferait monter cet axe.",
        "limitedByData": len(reachable) == 0,
    }


def _capacity_axis(analysis: Mapping[str, Any], profile: Mapping[str, Any]) -> dict[str, Any]:
    """Capacité à entrer — la seule qui dépend de l'ESN, pas de la cible.

    Elle reste donc jugeable même quand on ne sait rien du compte : c'est ce qui
    la distingue des trois axes précédents, et pourquoi elle n'est jamais
    marquée comme plafonnée par les données.
    """
    competitors = _count(analysis.get("competitorsPresent") or analysis.get("esnPresence"))
    references = _count(profile.get("references"))
    size = str(profile.get("consultantSize") or profile.get("consultant_size") or "")

    points = _clamp(3 + (1 if references else 0) - (1 if competitors >= 3 else 0))
    parts = []
    if competitors:
        parts.append(f"{competitors} ESN déjà en place")
    if references:
        parts.append(f"{references} référence(s) mobilisable(s)")
    if size:
        parts.append(f"taille déclarée : {size}")
    return {
        "axis": "capacity",
        "points": points,
        "evidence": " · ".join(parts) if parts else "Aucun élément de concurrence ni de référence connu.",
        "lever": None if points >= AXIS_MAX else "Un partenaire de rang 2 ou une référence sectorielle ouvrirait l'accès.",
        "limitedByData": False,
    }


def _data_quality_axis(analysis: Mapping[str, Any]) -> dict[str, Any]:
    """Fiabilité de ce qu'on avance — l'axe qui plafonne les autres."""
    sources = _count(analysis.get("sources"))
    signals = analysis.get("recentSignals") or []
    dated = sum(1 for s in signals if isinstance(s, Mapping) and s.get("freshness") == "current")
    entities = _count(analysis.get("entitiesExhaustive"))

    points = _clamp(min(AXIS_MAX, (1 if sources else 0) + (1 if dated else 0) + (1 if entities else 0) + (2 if sources >= 3 else 0)))
    return {
        "axis": "data_quality",
        "points": points,
        "evidence": f"{sources} source(s), {dated} signal(aux) daté(s) récent(s), {entities} entité(s) cartographiée(s).",
        "lever": None if points >= AXIS_MAX else "Une actualisation élargirait les sources et daterait davantage de faits.",
        "limitedByData": False,
    }


def compute_axes(
    analysis: Mapping[str, Any] | None,
    profile: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Les cinq axes, leur total, et ce qui est plafonné par un manque de données.

    Rend aussi ``limitedByData`` : la liste des axes dont la note est bridée par
    ce qu'on ne sait pas, plutôt que par le compte. C'est ce qui permet d'écrire
    « votre profil ESN n'est pas assez renseigné » au lieu de laisser croire que
    le compte est mauvais.
    """
    a = dict(analysis or {})
    p = dict(profile or {})

    axes: list[dict[str, Any]] = [
        _fit_axis(a, p),
        _signal_axis(a),
        _accessibility_axis(a),
        _capacity_axis(a, p),
        _data_quality_axis(a),
    ]
    total = sum(int(axis["points"]) for axis in axes)
    return {
        "axes": axes,
        "total": min(TOTAL_MAX, total),
        "max": TOTAL_MAX,
        "limitedByData": [axis["axis"] for axis in axes if axis.get("limitedByData")],
    }


def score_headline(score: Mapping[str, Any], company: str, esn: str | None = None) -> str:
    """La phrase du §28 : la note, ce qui la bride, et ce qui la ferait monter.

    Écrite ici plutôt que côté modèle parce qu'elle doit être VRAIE : chaque
    élément qu'elle cite vient du calcul, et aucune tournure ne peut promettre
    une progression que les axes ne prévoient pas.
    """
    total = score.get("total", 0)
    limited: Sequence[str] = score.get("limitedByData") or []
    who = f"pour {esn}" if esn else ""
    head = f"Je note {company} {total}/{TOTAL_MAX} {who}".strip() + "."

    if limited:
        head += " Cette note est PLAFONNÉE par ce qu'on ne sait pas encore, pas par le compte lui-même."

    levers = [str(axis.get("lever")) for axis in score.get("axes", []) if axis.get("lever")]
    if levers:
        head += " " + levers[0]
    return head
