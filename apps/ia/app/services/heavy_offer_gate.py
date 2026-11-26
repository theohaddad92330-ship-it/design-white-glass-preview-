"""Garde-fou « pas d'audit flash par réflexe » (DoD p31 n°5).

L'anti-recommandation est répétée à l'identique sur SIX pages du rapport (p15 à
p20) : « Ne jamais proposer automatiquement un audit flash, un C-level ou un
grand programme si le profil ne possède ni accès, ni preuve, ni capacité. »

Or la chaîne « audit flash » était écrite en dur, sans condition, dans le prompt
strategy et dans trois packs d'offres. Elle sortait donc pour un freelance sans
référence exactement comme pour une ESN de 300 personnes — c'est la définition du
réflexe générique que le critère n°5 interdit.

Le garde-fou lit la moitié PROFIL de la condition, qui est celle que la phrase
nomme (« si LE PROFIL ne possède pas ») et la seule connue au moment où le prompt
système se construit :
  - PREUVE    → des références clients déclarées ;
  - CAPACITÉ  → un stade ESN au moins « en structuration » (p3 : c'est à ce stade
                qu'apparaissent les plans de compte et le sourcing industrialisé ;
                en dessous, la p3 prescrit le réseau et le wedge, pas le programme).

Profil vide ⇒ gate FERMÉ. C'est délibéré et c'est le cœur du critère : proposer
un audit flash à un vendeur dont on ne sait rien EST le réflexe générique. Les
offres légères (atelier de cadrage, renfort, mission pilote bornée, push d'un
profil) restent proposées dans tous les cas — on ne prive personne d'une action,
on interdit de promettre ce qu'on ne peut pas tenir.

Déterministe, sans LLM, sans I/O.
"""

from __future__ import annotations

from typing import Any

from app.services.esn_stage import classify_esn_stage, size_int, stage_at_least

# Stade minimum à partir duquel une offre lourde est tenable (p3).
_MIN_STAGE_FOR_HEAVY = "structuration"

# Les offres d'entrée qui n'exigent ni preuve ni capacité de programme : elles
# restent disponibles quel que soit le profil.
LIGHT_PLAYS = (
    "atelier de cadrage 45 min",
    "push d'un profil qualifié",
    "mission pilote courte à périmètre borné",
    "renfort d'équipe sur un pic",
)

# Les offres que la p31 interdit par réflexe.
HEAVY_PLAYS = ("audit flash", "grand programme", "squad pilote")


# Les trois orthographes sous lesquelles un profil ESN déclare ses références.
_REFERENCE_KEYS = ("references", "client_references", "clientReferences")


def declared_references(profile_data: dict[str, Any] | None) -> tuple[str, ...]:
    """Les références clients DÉCLARÉES par l'ESN, dans l'ordre, dédoublonnées.

    ⚠️ **C'est la source unique** (GA-26). Deux lecteurs qui refont la lecture
    des trois clés divergent le jour où une quatrième apparaît : ``angle_proof_gate``
    relit cette fonction plutôt que les clés, et ``has_declared_proof`` en dérive
    au lieu de les relire lui-même.

    Une chaîne unique compte pour une référence — un profil rempli à la main
    écrit souvent « Decathlon » sans en faire une liste.
    """
    profile = profile_data or {}
    out: list[str] = []
    seen: set[str] = set()
    for key in _REFERENCE_KEYS:
        value = profile.get(key)
        items = [value] if isinstance(value, str) else (value if isinstance(value, (list, tuple)) else ())
        for item in items:
            name = str(item or "").strip()
            if name and name.casefold() not in seen:
                seen.add(name.casefold())
                out.append(name)
    return tuple(out)


def has_declared_proof(profile_data: dict[str, Any] | None) -> bool:
    """L'ESN a-t-elle une PREUVE mobilisable ? (références clients déclarées)."""
    return bool(declared_references(profile_data))


def has_declared_capacity(profile_data: dict[str, Any] | None) -> bool:
    """L'ESN a-t-elle la CAPACITÉ d'un programme ? (stade ≥ structuration).

    Une taille non déclarée répond False : on ne présume pas une capacité, et
    `classify_esn_stage` retomberait sur « petite » — qui serait de toute façon
    sous le seuil."""
    raw_size = (profile_data or {}).get("size")
    if size_int(raw_size) is None:
        return False
    return stage_at_least(classify_esn_stage(raw_size), _MIN_STAGE_FOR_HEAVY)


def heavy_offer_allowed(profile_data: dict[str, Any] | None) -> bool:
    """Le profil peut-il porter une offre lourde ? Preuve ET capacité, les deux."""
    return has_declared_proof(profile_data) and has_declared_capacity(profile_data)


def play_examples_inline(profile_data: dict[str, Any] | None, heavy_first: str) -> str:
    """La liste d'ACTIONS proposée au modèle, filtrée par le garde-fou.

    ``heavy_first`` est la formulation lourde du pack d'offres appelant (« audit
    flash du perimetre »…). Elle n'est conservée que si le profil la porte."""
    plays = list(LIGHT_PLAYS)
    if heavy_offer_allowed(profile_data):
        plays.insert(0, heavy_first)
    return ", ".join(plays)


def heavy_offer_directive(profile_data: dict[str, Any] | None) -> str:
    """La directive de prompt correspondante. Toujours explicite : le modèle doit
    savoir POURQUOI il n'a pas le droit, sinon il régénère l'offre interdite sous
    un autre nom."""
    if heavy_offer_allowed(profile_data):
        return (
            "Ce profil porte une offre lourde (références déclarées + capacité de delivery) : "
            "un audit flash ou un programme cadré est recevable s'il est justifié par un signal."
        )
    manques = []
    if not has_declared_proof(profile_data):
        manques.append("aucune référence client déclarée")
    if not has_declared_capacity(profile_data):
        manques.append("capacité de delivery non établie à ce stade")
    return (
        "INTERDIT (anti-recommandation p31) : ne propose NI audit flash, NI grand programme, "
        f"NI squad pilote — {', '.join(manques)}. Une offre que ce profil ne peut pas tenir est "
        "une offre à SUPPRIMER, pas à nuancer. Reste sur les portes d'entrée légères : "
        f"{', '.join(LIGHT_PLAYS)}."
    )
