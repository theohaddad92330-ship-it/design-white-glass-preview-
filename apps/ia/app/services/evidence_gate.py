"""#2368 — OUTREACH CONTEXT PACKET PAR DESTINATAIRE : ce que Laura refuse.

Trois refus, un seul module pour qu'ils ne divergent pas (GA-26) :

* #2368.2  — ne jamais appeler le modèle sur un packet vague (nom, poste,
  entreprise seuls) : ``assert_context_is_not_vague`` bloque AVANT l'appel,
  zéro coût.
* #2368.12 — la personnalisation minimale exige une raison PROPRE à la
  personne : connaître son nom n'en est pas une — on lui écrit, donc son nom
  figure TOUJOURS dans le message. ``has_personal_reason`` exclut
  ``precise_contact`` (le nom du destinataire lui-même) de ce qui compte
  comme un motif, sinon un packet vide serait indétectable.
* #2368.14 — NO-GO : toute affirmation du message est tracée à une preuve du
  packet (le ``user_prompt`` envoyé au modèle). ``assert_claims_are_grounded``
  bloque APRÈS génération si une preuve déclarée par le modèle est
  introuvable dans ce packet.

Doctrine (CLAUDE.md, code rules) : « JAMAIS de donnée fictive — échec API →
erreur claire, pas de repli inventé. » Les deux gardes lèvent
``HTTPException(422)`` : pas de message renvoyé, pas d'appel Claude payé sur
un packet vide, pas de brouillon avec une preuve fabriquée.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Protocol

from fastapi import HTTPException

from app.services.recommendation_specificity import SPECIFICITY_ELEMENTS, SpecificityRegistry
from app.services.text_norm import normalize_name

# #2368.12 — connaître le NOM du destinataire n'est pas une raison de lui
# écrire : `/message/generate` cible TOUJOURS un contact précis, donc
# `precise_contact` est disponible par construction. Sans cette exclusion,
# un packet réduit à "nom/poste/entreprise" (#2368.2) serait indétectable.
_TRIVIAL_KINDS = frozenset({"precise_contact"})

# #2123.65-.67 — signal, offre, preuve choisis dans le composer : un texte
# tapé là est une raison propre à la personne, même absente du dossier.
_CHOSEN_PARAMETER_KEYS = ("signal", "offer", "proof")


class _Claim(Protocol):
    text: str
    proof: str


def has_personal_reason(registry: SpecificityRegistry, *, context: str, parameters: Mapping[str, str]) -> bool:
    """Une raison PROPRE à cette personne : un angle tapé par le commercial, un
    signal/offre/preuve choisi dans le composer, ou un élément structuré du
    dossier au-delà du seul nom du contact."""
    if context.strip() or any((parameters or {}).get(key) for key in _CHOSEN_PARAMETER_KEYS):
        return True
    return any(registry.matchers.get(kind) for kind, _label in SPECIFICITY_ELEMENTS if kind not in _TRIVIAL_KINDS)


def assert_context_is_not_vague(registry: SpecificityRegistry, *, context: str, parameters: Mapping[str, str]) -> None:
    """#2368.2 — bloque AVANT tout appel au modèle : nom, poste et entreprise
    seuls ne suffisent jamais à personnaliser."""
    if not has_personal_reason(registry, context=context, parameters=parameters):
        raise HTTPException(
            status_code=422,
            detail=(
                "packet de contexte insuffisant pour personnaliser : le dossier n'offre qu'un nom, un "
                "poste et une entreprise pour ce contact — ajoutez un signal, une référence, une "
                "contrainte connue ou un angle avant de générer"
            ),
        )


# #4981 (recette prod 01/11, Cartier) — le modèle cite « 198,3 M€ », le packet porte « 198 300 000 » :
# même montant, autre forme ⇒ la porte refusait à tort et la rédaction échouait 2 fois sur 2.
# Un montant AVEC unité (€, k€, M€, Md€…) est comparé en valeur, à la précision écrite près ;
# un montant absent du packet reste refusé.
_UNIT_SCALE = {
    "": 1.0, "k": 1e3, "millier": 1e3, "milliers": 1e3,
    "m": 1e6, "mn": 1e6, "mio": 1e6, "million": 1e6, "millions": 1e6,
    "md": 1e9, "mds": 1e9, "mrd": 1e9, "milliard": 1e9, "milliards": 1e9, "bn": 1e9,
}
_AMOUNT = re.compile(
    r"(?<![\d.,])(\d{1,3}(?:[\s\u00a0\u202f.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?!\d)"
    r"\s*(milliards?|millions?|milliers?|mds?|mrd|mio|mn|bn|k|m)?(?![a-zà-ÿ])\s*(€|eur(?:os?)?\b)?",
    re.IGNORECASE,
)


def _parse_number(raw: str, *, has_unit: bool) -> tuple[float, int]:
    """(valeur, nombre de décimales écrites). `198 300 000` ⇒ groupes ; `198,3` ⇒ décimale."""
    txt = re.sub(r"[\s\u00a0\u202f]", "", raw)
    if "." in txt and "," in txt:
        dec_sep = "." if txt.rfind(".") > txt.rfind(",") else ","
    else:
        sep = "." if "." in txt else "," if "," in txt else ""
        tail = txt.rsplit(sep, 1)[1] if sep else ""
        if not sep or (txt.count(sep) == 1 and not (len(tail) == 3 and not has_unit)):
            dec_sep = sep
        else:
            dec_sep = ""
    if dec_sep:
        whole, frac = txt.rsplit(dec_sep, 1)
        whole = re.sub(r"[.,]", "", whole)
        return float(f"{whole}.{frac}"), len(frac)
    return float(re.sub(r"[.,]", "", txt)), 0


def _amounts(text: str) -> list[tuple[float, float, bool, tuple[int, int]]]:
    """(valeur, tolérance, porte_une_unité, span) de chaque montant du texte."""
    out = []
    for m in _AMOUNT.finditer(text or ""):
        unit = (m.group(2) or "").lower()
        has_unit = bool(unit) or bool(m.group(3))
        try:
            value, decimals = _parse_number(m.group(1), has_unit=has_unit)
        except ValueError:
            continue
        scale = _UNIT_SCALE.get(unit, 1.0)
        out.append((value * scale, 0.5 * (10 ** -decimals) * scale, has_unit, m.span()))
    return out


def _amount_proof_is_in_packet(proof: str, packet_norm: str, packet_amounts: list) -> bool:
    """La preuve est un montant avec unité, retrouvé en valeur dans le packet ; le reste de
    la phrase doit lui aussi y figurer (aucun mot inventé autour d'un chiffre vrai)."""
    amounts = [a for a in _amounts(proof) if a[2]]
    if not amounts:
        return False
    for value, tol, _unit, _span in amounts:
        if not any(abs(pv - value) <= max(tol, 1e-9) for pv, _t, _u, _s in packet_amounts):
            return False
    rest = proof
    for _v, _t, _u, (a, b) in sorted(amounts, key=lambda x: -x[3][0]):
        rest = rest[:a] + " " + rest[b:]
    words = [w for w in re.findall(r"[a-z0-9]{4,}", normalize_name(rest)) if w not in ("euro", "euros")]
    return all(w in packet_norm for w in words)


def ungrounded_claims(claims: Iterable[_Claim] | None, packet_text: str) -> list[str]:
    """Les affirmations (texte) dont la preuve est introuvable dans le packet."""
    packet_norm = normalize_name(packet_text)
    packet_amounts: list | None = None
    bad: list[str] = []
    for claim in claims or ():
        proof = (getattr(claim, "proof", "") or "").strip()
        if proof and normalize_name(proof) in packet_norm:
            continue
        if proof:
            if packet_amounts is None:
                packet_amounts = _amounts(packet_text)
            if _amount_proof_is_in_packet(proof, packet_norm, packet_amounts):
                continue
        bad.append(getattr(claim, "text", "") or proof or "(affirmation sans texte)")
    return bad


def assert_claims_are_grounded(claims: Iterable[_Claim] | None, packet_text: str) -> None:
    """#2368.14 — NO-GO : chaque affirmation déclarée par le modèle doit citer une preuve
    PRÉSENTE dans le packet envoyé au modèle (verbatim après normalisation, ou — pour un
    montant — même valeur sous une autre forme, #4981). Une preuve introuvable ou vide
    bloque le brouillon : on ne renvoie pas un message qui invente."""
    bad = ungrounded_claims(claims, packet_text)
    if bad:
        raise HTTPException(status_code=422, detail=f"NO-GO : affirmation sans preuve dans le packet — « {bad[0]} »")


# #3248.3/.4 (recette prod 29/09, épopée #3182/#3248) — deux défauts du brouillon
# vus dans le même fil : « Je pars sur Je partirai sur… » (l'annonce d'hypothèse
# de `laura_role_and_voice._ONE_HYPOTHESIS`, réservée à la réponse de Laura,
# ayant fui dans un texte destiné au prospect) et une signature tronquée
# (« pour L. »). Les deux sont NOMMÉS ici plutôt que devinés côté prompt : un
# texte qui les porte n'est jamais envoyable, qu'il vienne du chat ou du
# composer — un seul gate, jamais deux règles qui pourraient diverger (GA-26).
_HYPOTHESIS_LEAK_MARKERS: tuple[str, ...] = (
    "je pars sur",
    "je partirai sur",
    "tu peux corriger",
    "tu peux ajuster",
    "n'hésite pas à corriger",
    "n'hésite pas à ajuster",
)

# Une signature coupée en plein mot : « pour » suivi d'une ou deux majuscules
# et d'un point final — jamais une vraie initiale de nom (« Louis M. »), qui ne
# suit pas la préposition « pour ».
_TRUNCATED_SIGNOFF = re.compile(r"\bpour\s+[A-ZÀ-ÖØ-Þ]{1,2}\.\s*$")


def find_draft_defects(body: str) -> list[str]:
    """Les défauts CONNUS d'un brouillon — jamais deviné, jamais silencieux :
    chaque défaut porte sa propre phrase, comme un axe non évaluable
    (doctrine « non mesuré ≠ 0 »)."""
    text = body or ""
    defects: list[str] = []
    lowered = text.casefold()
    if any(marker in lowered for marker in _HYPOTHESIS_LEAK_MARKERS):
        defects.append(
            "annonce d'hypothèse ou offre de correction laissée dans un texte destiné à un tiers — "
            "cette phrase appartient à la réponse de Laura, jamais au message envoyé"
        )
    if _TRUNCATED_SIGNOFF.search(text.rstrip()):
        defects.append("signature tronquée en fin de message")
    return defects


def assert_draft_is_clean(body: str) -> None:
    """#3248.3/.4 — bloque APRÈS génération plutôt que de renvoyer un brouillon
    qui porte un défaut déjà repéré en recette : on ne l'envoie ni ne le
    corrige à la place du modèle, on refuse et on nomme pourquoi."""
    defects = find_draft_defects(body)
    if defects:
        raise HTTPException(status_code=422, detail="Brouillon rejeté : " + " ; ".join(defects))
