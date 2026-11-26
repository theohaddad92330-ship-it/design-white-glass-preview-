"""Le refus de servir un angle sans preuve mobilisable (tome 5 §32.2).

Le tome écrit la structure d'un angle en trois parties — **PREUVE +
TRANSPOSITION + ENGAGEMENT** — et la preuve vient EN PREMIER. Puis il tranche le
cas où elle manque :

    « Si aucune preuve n'est disponible pour l'univers, le produit ne génère pas
    de phrase. Il dit : *Aucune preuve mobilisable dans cet univers. Collecte un
    REX ou écris ta propre accroche.* »

**Pourquoi un gate déterministe et pas seulement une consigne.** Le prompt
demandait déjà « PROMESSE + PREUVE + ACTION » depuis toujours, et la preuve
partait dans le champ libre ``strategy``, en prose, mélangée aux deux autres
tiers. Rien ne pouvait donc la vérifier : ni le contrat (``attackAngleSchema``
n'avait pas de champ), ni le barème (``score_angles`` mesurait l'ACTION et
l'offre, jamais la PREUVE, alors que sa docstring annonçait les trois), ni
l'écran (``first-move-input.ts`` écrivait ``proof: null`` en dur, faute de
champ à lire). Une consigne de prompt oubliée une fois sur cent produit
exactement la phrase qu'on ne veut pas voir dite en clientèle — c'est le même
raisonnement que ``heavy_offer_gate``, dont ce module reprend la forme.

**Le verdict a TROIS états, pas deux.** « Aucune preuve » et « une preuve que
rien ne soutient » ne se disent pas pareil :

* ``absent``        — le champ est vide. C'est HONNÊTE : le modèle a obéi.
* ``mobilisable``   — la preuve cite une référence que l'ESN a déclarée. Elle
                      est soutenable en rendez-vous, donc elle voyage.
* ``non_verifiable``— il y a une phrase, et rien dans le profil ne l'étaye.
                      Ce n'est pas « faux » — l'ESN a peut-être simplement omis
                      de déclarer la référence — mais ce n'est pas une chose à
                      dire devant un client.

Confondre les deux derniers est la cause racine « cassé et non mesurable se
ressemblent ». Et noter ``non_verifiable`` moins qu'``absent`` est délibéré :
un blanc coûte une phrase, un nom de client inventé coûte le compte.

**On retire le MOYEN, pas seulement la permission.** Une preuve non vérifiable
est EFFACÉE de la charge utile, pas seulement déconseillée : ce qui reste dans
le dossier finit un jour à l'écran. L'angle, lui, survit toujours — supprimer
le play priverait d'une action l'utilisateur qui n'a pas encore rempli son
profil, alors que le tome ne retire que la PHRASE.

Déterministe, sans LLM, sans I/O.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.services.heavy_offer_gate import declared_references
from app.services.text_norm import normalize_name

PROOF_ABSENT = "absent"
PROOF_MOBILISABLE = "mobilisable"
PROOF_UNVERIFIABLE = "non_verifiable"

# En dessous, un nom de référence se retrouverait dans n'importe quelle phrase
# (« SE », « IT ») et rendrait TOUT mobilisable. Un gate qui dit toujours oui ne
# garde rien.
MIN_REFERENCE_CHARS = 3

# Les non-valeurs que le modèle rend quand il n'a rien : elles valent un champ
# vide, jamais une preuve. Même liste d'esprit que ``_PLACEHOLDERS`` du barème.
_PLACEHOLDERS = frozenset(
    {
        "",
        "n/a",
        "na",
        "none",
        "null",
        "-",
        "—",
        "tbd",
        "a definir",
        "a preciser",
        "non detecte",
        "inconnu",
        "aucune",
        "aucune preuve",
    }
)


def _text(value: object) -> str:
    return str(value or "").strip()


def _is_blank(value: object) -> bool:
    return normalize_name(_text(value)) in _PLACEHOLDERS


def proof_verdict(proof: object, profile_data: dict[str, Any] | None) -> str:
    """Le verdict à trois états pour UNE preuve, contre les références déclarées.

    La comparaison est normalisée (casse, accents, espaces) parce que les
    registres publics stockent en majuscules non accentuées et qu'un modèle
    recopie tantôt « GROUPE SEB », tantôt « Groupe Séb ». Un verdict qui
    dépendrait de la casse refuserait une preuve VRAIE — le pire des deux
    échecs, puisqu'il punit l'ESN qui a rempli son profil.
    """
    if _is_blank(proof):
        return PROOF_ABSENT
    haystack = normalize_name(_text(proof))
    for reference in declared_references(profile_data):
        needle = normalize_name(reference)
        if len(needle) >= MIN_REFERENCE_CHARS and needle in haystack:
            return PROOF_MOBILISABLE
    return PROOF_UNVERIFIABLE


def apply_proof_gate(
    angles: object, profile_data: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Estampille chaque angle, et EFFACE une preuve non vérifiable.

    Tolérant à l'entrée : une liste qui n'en est pas une, ou un angle qui n'est
    pas un dictionnaire, rend une liste — jamais une exception. Une phase
    entière est déjà morte en production sur une virgule de sérialisation.
    """
    if not isinstance(angles, list):
        return []
    out: list[dict[str, Any]] = []
    for angle in angles:
        if not isinstance(angle, dict):
            continue
        stamped = dict(angle)
        raw_proof = stamped.get("proof", stamped.get("preuve", ""))
        verdict = proof_verdict(raw_proof, profile_data)
        stamped["proof"] = _text(raw_proof) if verdict == PROOF_MOBILISABLE else ""
        stamped.pop("preuve", None)
        stamped["proof_status"] = verdict
        out.append(stamped)
    return out


def angle_proof_directive(profile_data: dict[str, Any] | None) -> str:
    """La consigne de prompt correspondante — la PREMIÈRE barrière.

    Toujours explicite sur le POURQUOI : un modèle à qui on interdit sans dire
    la raison régénère l'interdit sous un autre nom (leçon de
    ``heavy_offer_gate``). Le gate déterministe reste celle qui tient quand la
    consigne est ignorée.
    """
    references: Sequence[str] = declared_references(profile_data)
    if references:
        return (
            'PREUVE (structure PREUVE + TRANSPOSITION + ENGAGEMENT) — chaque play porte un champ '
            '"proof" qui CITE une des références déclarées par cette ESN, mot pour mot : '
            f"{', '.join(references)}. Tu ne cites AUCUN autre nom de client, même plausible, "
            "même connu du secteur. Si aucune de ces références ne soutient réellement le play, "
            'laisse "proof" VIDE : un play sans preuve reste recevable, un play avec une preuve '
            "inventée coûte le rendez-vous le jour où le commercial la répète."
        )
    return (
        'PREUVE — ce profil ESN ne déclare AUCUNE référence client. Laisse le champ "proof" '
        "VIDE sur chacun des plays et n'invente NI nom de client, NI cas d'usage vécu, "
        "NI chiffre de réalisation : tu n'as aucun moyen de savoir ce que cette ESN a "
        "réellement livré. L'utilisateur sera invité à collecter un REX ou à écrire sa propre "
        "accroche — c'est une réponse juste, alors qu'une référence inventée est une phrase "
        "qu'il ne pourra pas soutenir."
    )
