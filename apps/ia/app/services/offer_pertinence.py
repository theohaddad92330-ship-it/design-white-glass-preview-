"""PERTINENCE-PARTOUT (Louis, 25/10/2026) — « la pertinence passe avant le coût » : le MÊME tri métier à Découvrir,
à l'analyse de compte (onglet recrutements), aux signaux de Laura et à la page /signals.

Le verdict vit à UN endroit (``discover_hiring_scope.hiring_reject_reason``, GA-26) ; ce module l'applique aux
listes d'offres et de signaux, et COMPTE (reçues, retenues, rejets par motif) dans une ligne de journal par appelant
— sur le modèle de ``COMPETENCE-TROUVE`` : sans compteur, le prochain diagnostic reprend une journée au lieu de trois minutes.

Règles tenues ici :
- une offre hors métier ne s'affiche JAMAIS (#4284.1) ; un COMPTE hors métier reste, plus bas et marqué (#4284.26) ;
- sans profil exploitable il n'y a rien à comparer : on n'écarte rien, et le journal le DIT (``profile=none``) ;
- un profil sans métier déclaré ni déduit ne juge que par le tri informatique (jamais « aucun métier = tout rejeter ») ;
- aucun appel de modèle : le verdict est déterministe, il n'y a donc rien à mettre en cache ni à compter.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from app.services.discover_hiring_scope import (
    hiring_reject_reason,
    is_it_label,
    is_not_an_offer,
    sells_it,
)
from app.services.domain_job_filters import fold, inferred_role_terms, profile_job_scope

logger = logging.getLogger(__name__)

_LABEL_KEYS = ("title", "intitule", "label")


@dataclass
class TradeCount:
    """Ce qu'un appelant a reçu, gardé, et rejeté PAR MOTIF."""

    caller: str
    profile_read: bool = True
    received: int = 0
    kept: int = 0
    rejected: dict[str, int] = field(default_factory=dict)

    @property
    def outside_trade(self) -> int:
        """Toutes les offres écartées pour leur métier, quel que soit le motif."""
        return sum(self.rejected.values())

    def add(self, reason: str | None) -> None:
        self.received += 1
        if reason is None:
            self.kept += 1
        else:
            self.rejected[reason] = self.rejected.get(reason, 0) + 1

    def as_dict(self) -> dict[str, Any]:
        return {
            "received": self.received,
            "kept": self.kept,
            "outsideTrade": self.outside_trade,
            "rejected": dict(self.rejected),
        }

    def log(self) -> None:
        if self.received == 0 and self.profile_read:
            return
        logger.info(
            "PERTINENCE-OFFRES caller=%s profile=%s received=%d kept=%d outsideTrade=%d rejected=%s",
            self.caller,
            "read" if self.profile_read else "none",
            self.received,
            self.kept,
            self.outside_trade,
            dict(self.rejected),
        )


def profile_readable(profile: Mapping[str, Any] | None) -> bool:
    """Y a-t-il un profil d'espace à comparer ? Sans lui, l'offre n'est jugée sur rien (#3901)."""
    if not isinstance(profile, dict):
        return False
    return (
        profile_job_scope(profile) is not None
        or bool(inferred_role_terms(profile))
        or profile.get("recruitsForClients") is True
    )


def trade_reject_reason(label: str, profile: Mapping[str, Any] | None) -> str | None:
    """``None`` = l'offre est dans le métier (ou rien à comparer) ; sinon le motif du rejet."""
    if not profile_readable(profile):
        return None
    reason = hiring_reject_reason(label, dict(profile or {}))
    if reason == "noRoles":
        # Ni métier déclaré ni déduit : seul le tri informatique juge, et seulement pour un profil qui vend de l'IT.
        return "outsideTrade" if sells_it(dict(profile or {})) and not is_it_label(label) else None
    return reason


def _label_of(offer: Mapping[str, Any]) -> str:
    return next((str(offer[k]) for k in _LABEL_KEYS if str(offer.get(k) or "").strip()), "")


def sort_offers_by_trade(
    offers: Sequence[Any], profile: Mapping[str, Any] | None, *, caller: str
) -> tuple[list[Any], TradeCount]:
    """Les offres du métier (ordre reçu gardé) et leur compteur. L'appelant est NOMMÉ dans le journal."""
    count = TradeCount(caller=caller, profile_read=profile_readable(profile))
    kept: list[Any] = []
    for offer in offers:
        if not isinstance(offer, dict):
            kept.append(offer)
            continue
        reason = trade_reject_reason(_label_of(offer), profile)
        count.add(reason)
        if reason is None:
            kept.append(offer)
    count.log()
    return kept, count


def sort_signals_by_trade(
    signals: Iterable[Any], profile: Mapping[str, Any] | None, *, caller: str, discover_rule: bool = False
) -> tuple[list[Any], TradeCount]:
    """Les signaux sans les recrutements hors métier ; les autres signaux passent, dans leur ordre.

    ``discover_rule`` = la règle de Découvrir et de /signals : ni métier déclaré ni déduit ⇒ l'offre n'est pas un
    signal fort (``noRoles``, l'écran le dit) ; une pièce « non offre » (vidéo, titre vide) sort aussi."""
    count = TradeCount(caller=caller, profile_read=profile_readable(profile))
    kept: list[Any] = []
    for signal in signals:
        if isinstance(signal, dict) and signal.get("type") == "hiring":
            label = str(signal.get("label") or "")
            if discover_rule:
                reason = "notAnOffer" if is_not_an_offer(signal) else hiring_reject_reason(label, profile)
            else:
                reason = trade_reject_reason(label, profile)
            count.add(reason)
            if reason is not None:
                continue
        kept.append(signal)
    count.log()
    return kept, count


def apply_to_account_signals(result: dict[str, Any], profile: Mapping[str, Any] | None) -> dict[str, Any]:
    """Les signaux de Laura (réponse du pont ``accounts/signals``) : jamais une offre hors métier comme signal.

    Un compte dont il ne reste QUE des offres hors métier n'est pas retiré (#4284.26) : il reste, marqué
    ``outOfTrade``, SANS signal, et passe après les autres. Sans profil : la réponse revient telle quelle."""
    accounts = result.get("accounts")
    count = TradeCount(caller="laura", profile_read=profile_readable(profile))
    if not isinstance(accounts, list) or not count.profile_read:
        count.log()
        return result
    in_trade: list[Any] = []
    out_of_trade: list[Any] = []
    for account in accounts:
        if not isinstance(account, dict) or not isinstance(account.get("signals"), list):
            in_trade.append(account)
            continue
        kept, sub = sort_signals_by_trade(account["signals"], profile, caller="laura")
        count.received += sub.received
        count.kept += sub.kept
        for reason, n in sub.rejected.items():
            count.rejected[reason] = count.rejected.get(reason, 0) + n
        if account["signals"] and not kept and sub.rejected:
            out_of_trade.append({**account, "signals": [], "outOfTrade": True})
        else:
            in_trade.append({**account, "signals": kept})
    return {**result, "accounts": [*in_trade, *out_of_trade], "pertinence": count.as_dict()}


# ── Le piège des mots : une compétence informatique ne se reconnaît que comme TECHNOLOGIE ─────────────────
# « vue » (« en vue de l'ouverture »), « go » (« go live »), « java » (une île), « rust »… sont des mots du
# français courant : le mot nu dans une phrase ne prouve pas la technologie.
_AMBIGUOUS_SKILLS = frozenset(
    {"vue", "go", "rust", "java", "swift", "ruby", "spark", "dart", "julia", "scala", "unity"}
)
_TECH_FORMS = {
    "vue": r"vue\.?js|vuejs|vue ?[23]\b|nuxt|pinia|vuex|vue (?:router|cli)",
    "go": r"golang|go ?lang",
    "rust": r"rustlang|rust ?lang",
    "java": r"java ?(?:ee|se|fx)|j2ee|jee|java ?\d+|jvm",
}
_FRENCH_PHRASES = re.compile(
    r"\ben vue d[eu]s?\b|\bvue d ensemble\b|\bpoint de vue\b|\ba vue\b|\bvue sur\b|\bde vue\b|\bvues? (?:de|du|des)\b"
    r"|\bgo to market\b|\bgo live\b|\bgo no go\b|\bgo ?to ?market\b"
)
_TECH_CONTEXT = frozenset(
    {
        "developpeur", "developpeuse", "developpeurs", "dev", "front", "frontend", "backend", "back", "fullstack",
        "javascript", "typescript", "js", "ts", "react", "angular", "node", "framework", "web", "api", "docker",
        "kubernetes", "microservices", "spring", "maven", "jvm", "logiciel", "software", "html", "css", "sql",
        "devops", "ingenieur", "architecte", "programmation", "code",
    }
)  # fmt: skip


def _fold_text(value: object) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9#+.]+", " ", fold(value))).strip()


def mentions_as_technology(term: str, text: object) -> bool:
    """La compétence ``term`` est-elle citée dans ``text`` COMME technologie ?

    Un terme non ambigu (« React ») se lit comme un mot entier. Un terme ambigu (« vue », « go », « java ») ne compte
    que sous une forme technique (``Vue.js``, ``VueJS``, ``Vue 3``, ``Golang``) ou, nu, à côté d'un mot d'informatique
    (``Développeur Vue``) — jamais dans « en vue de l'ouverture » ni « go live »."""
    base = re.sub(r"\.?js$", "", _fold_text(term).replace(" ", ""), flags=re.IGNORECASE) if term else ""
    folded = _fold_text(text)
    if not base or not folded:
        return False
    plain = _fold_text(term)
    if base not in _AMBIGUOUS_SKILLS:
        return re.search(rf"(?<![a-z0-9]){re.escape(plain)}(?![a-z0-9])", folded) is not None
    folded = _FRENCH_PHRASES.sub(" ", folded)
    forms = _TECH_FORMS.get(base)
    if forms and re.search(rf"(?<![a-z0-9])(?:{forms})", folded):
        return True
    words = folded.split()
    for i, word in enumerate(words):
        if word == base and _TECH_CONTEXT.intersection(words[max(0, i - 3) : i] + words[i + 1 : i + 4]):
            return True
    return False
