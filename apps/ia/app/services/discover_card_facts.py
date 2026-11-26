"""#4068 (lot DECOUVRIR-CARTE, Louis 13/10) — fort, contexte ou hors carte (jumeau de ``classifyCardFact``).

Le classement d'un fait de carte Découvrir vit dans ``packages/contracts/src/schemas/discover-card-facts.ts`` ;
ce module en est la copie Python, tenue par le MÊME jeu de cas
(``packages/contracts/src/fixtures/discover-card-facts.json``). L'IA s'en sert pour ne plus compter dans le
rang d'un candidat ce que sa carte n'affichera jamais : un acte de capital, un titre vide, un stage, un fait de
plus de 180 j. Les plafonds (5 forts, 10 de contexte) et le dédoublonnage restent à la carte.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from datetime import date
from typing import Any

from app.services.internship_posting import is_internship_posting

MAX_AGE_DAYS = 180

_STRONG = {"hiring", "need", "project", "leader", "deal", "space"}
_OFF = {"internship", "legal_admin", "contentless"}

_LEADER_EVENT = re.compile(
    r"(nomm|nomination|rejoint|arrivee|depart|quitte|succede|prend la tete|promu|"
    r"nouvel(le)? (directeur|directrice|president|presidente|dg|ceo|cio|cto|dsi))"
)
_LEADER_ROLE = re.compile(
    r"\b(pdg|president|presidente|directeur|directrice|dg|ceo|cio|cto|cfo|coo|dsi|chief|head of|vp|"
    r"vice-president|responsable|gerant)\b"
)
_LEGAL_ADMIN = re.compile(
    r"(capital|modifications? diverses|administrat|changement de dirigeant|depot des comptes|comptes annuels|siege social|"
    r"transfert du siege|denomination|statuts|forme juridique|objet social|commissaire aux comptes|"
    r"immatriculation|radiation)"
)
_LEGAL_SUBSTANTIVE = re.compile(
    r"(cession|vente|fusion|procedure collective|sauvegarde|redressement|liquidation|acquisition|rachat)"
)
# #4285.1 — l'augmentation de capital BODACC d'une société (fait de carte, libellé EXACT du signal
# `bodacc_capital.SIGNAL_LABEL`) : de la vie de l'entreprise, pas un acte administratif. Contexte, jamais fort.
_CAPITAL_INCREASE = re.compile(r"^augmentation de capital$")
_DEAL = re.compile(
    r"(contrat|remporte|attribu|marche public|accord-cadre|accord cadre|levee de fonds|leve \d|appel d'offres|"
    r"commande de|rachat|rachet|acqui)"
)
_PROJECT = re.compile(
    r"(programme|projet|transformation|migration|deploiement|modernisation|refonte|digitalisation|"
    r"plan strategique|nouvelle usine|lance )"
)
# #4045.6 — « déménagement » : fait FORT rangé sous ``project`` (jumeau de ``MOVE``). Presse seulement.
_MOVE = re.compile(r"(demenag|emmenag|nouveau siege|nouveaux locaux|nouveau campus|nouvelle implantation)")
_HIRING_WORDS = re.compile(r"(recrute|recrutement|embauche|postes? a pourvoir|offres? d'emploi)")
_EVENT = re.compile(r"(salon|forum|congres|conference|evenement|exposition|bourget|webinaire|summit|meetup)")
_FINANCIAL = re.compile(
    r"(chiffre d'affaires|\bca\b|resultat|benefice|ebitda|\bebit\b|marge|semestr|trimestr|\bs[12]\b|\bt[1-4]\b|"
    r"perte nette|exercice|carnet de commandes)"
)
_STOPWORDS = set(
    (
        "les des du une et en au aux pour par sur dans avec quelles quel quels quelle que qui quoi est sont son ses sa "
        "leur leurs ce cette ces plus moins vers chez apres avant entre comme mais donc"
    ).split()
)
_SPLIT = re.compile(r"[^a-z0-9]+")


# #4115 (Louis 13/10) — alternance / apprentissage : visible, jamais fort. Jumeau de ``isWorkStudyPosting``.
_WORK_STUDY = re.compile(r"alternan|apprenti|apprentissage|work[- ]?study")


def _fold(value: str) -> str:
    folded = "".join(c for c in unicodedata.normalize("NFD", value) if not unicodedata.combining(c))
    return folded.replace("’", "'").replace("`", "'").lower()


def _tokens(label: str, company_name: str | None) -> list[str]:
    company = set(_SPLIT.split(_fold(company_name))) if company_name else set()
    words = [w for w in _SPLIT.split(_fold(label)) if w and w not in company and w not in _STOPWORDS]
    return [w for w in words if len(w) >= 3 or any(ch.isdigit() for ch in w)]


def _contentless(label: str, company_name: str | None) -> bool:
    if len(_tokens(label, company_name)) < 2:
        return True
    trimmed = label.strip()
    return trimmed.endswith("?") and not any(ch.isdigit() for ch in trimmed)


def _leader(text: str) -> bool:
    return bool(_LEADER_EVENT.search(text) and _LEADER_ROLE.search(text))


def _news_nature(text: str) -> str:
    for pattern, nature in (
        (_DEAL, "deal"),
        (_PROJECT, "project"),
        (_HIRING_WORDS, "hiring"),
        (_EVENT, "event"),
        (_FINANCIAL, "financial"),
    ):
        if pattern.search(text):
            return nature
    return "economy"


def _nature(fact: dict[str, Any], company_name: str | None) -> str:
    if isinstance(fact.get("nature"), str) and fact["nature"]:
        return fact["nature"]
    label = str(fact.get("label") or "")
    text = _fold(label)
    kind = fact.get("type")
    if kind == "hiring":
        if is_internship_posting(label, fact.get("contractType")):
            return "internship"
        return "work_study" if _WORK_STUDY.search(_fold(f"{label} {fact.get('contractType') or ''}")) else "hiring"
    if kind == "tender":
        return "need"
    if kind in ("award", "funding"):
        return "deal"
    if kind == "tech":
        return "contentless" if _contentless(label, company_name) else "tech"
    if kind == "legal":
        if _leader(text):
            return "leader"
        return "economy" if _LEGAL_SUBSTANTIVE.search(text) else "legal_admin"
    if _leader(text):
        return "leader"
    if _MOVE.search(text):
        return "project"
    if _CAPITAL_INCREASE.match(text.strip()):
        return "economy"
    if _LEGAL_ADMIN.search(text):
        return "legal_admin"
    if _contentless(label, company_name):
        return "contentless"
    return _news_nature(text)


def _age_days(value: Any, now: date) -> int | None:
    try:
        return (now - date.fromisoformat(str(value)[:10])).days
    except ValueError:
        return None


def classify_card_fact(fact: dict[str, Any], *, now: date, company_name: str | None = None) -> dict[str, str]:
    """``{"tier": "strong"|"context", "nature": …}`` ou ``{"tier": "off", "reason": …}``."""
    nature = _nature(fact, company_name)
    if nature in _OFF:
        return {"tier": "off", "reason": nature}
    if not fact.get("fromSpace"):
        age = _age_days(fact.get("date"), now)
        if age is None or age > MAX_AGE_DAYS:
            return {"tier": "off", "reason": "too_old"}
    return {"tier": "strong" if nature in _STRONG else "context", "nature": nature}


def drop_off_card_facts(signals: Iterable[Any], *, company_name: str | None = None) -> list[dict]:
    """Les signaux dont le CONTENU a sa place sur une carte, dans leur ordre ; un non-dict est écarté.

    L'âge (180 j) n'est PAS jugé ici : le rang de l'IA décote déjà la fraîcheur
    (``discover_scoring._freshness``) et la carte coupe à l'affichage."""
    return [s for s in signals if isinstance(s, dict) and _nature(s, company_name) not in _OFF]
