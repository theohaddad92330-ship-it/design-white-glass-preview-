"""Lot T point 1 (décision Louis, QCM 02/11/2026) — reconnaître une ESN ou un cabinet que le NAF ne dit pas.

Le NAF du registre d'une ESN est souvent celui de l'ingénierie (71.12B), d'une holding (64.20Z, 70.10Z) ou de
l'immobilier (68.20B) : un classement par NAF seul ne la sort pas de « Comptes ». Deux preuves, et deux seulement :

* ``referential`` — le référentiel élargi (``app/data/esn_referentiel.json``, source de chaque entrée citée en tête de
  fichier) la nomme : par SIREN, ou par nom distinctif (appariement STRICT d'``esn_name_match``) ;
* ``offers`` — SON NAF est ambigu ET au moins ``ESN_OFFER_MIN_MATCHES`` de ses propres offres le disent
  (« chez nos clients », « intercontrat »…).

Sans l'une ni l'autre l'entreprise reste ce qu'elle était : jamais devinée (GA-18/19). Aucun appel réseau."""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Iterable, Mapping
from functools import lru_cache
from pathlib import Path
from typing import Literal

from app.services.esn_name_match import build_esn_index, match_esn

EsnRecognition = Literal["referential", "offers"]

_REFERENTIAL = Path(__file__).resolve().parent.parent / "data" / "esn_referentiel.json"

#: Combien d'offres concordantes il faut — UN seul endroit. Une offre isolée peut citer « chez nos clients » pour
#: un client final qui parle de sa propre clientèle ; deux offres distinctes ne s'y trompent presque jamais.
ESN_OFFER_MIN_MATCHES = 2

#: Les NAF « ambigus » pour la lecture des offres : ceux qu'une ESN porte sans que ce soit un NAF d'ESN.
#: Préfixes de chiffres (71.12B → 7112). Un NAF hors de cette liste (énergie, commerce…) ne passe JAMAIS par les offres.
_AMBIGUOUS_NAF_PREFIXES: tuple[str, ...] = ("7112", "7022", "6420", "7010", "6820", "620", "6190")

#: Les formulations d'offre qui disent « nous plaçons des consultants chez des clients ». Pliées (sans accents).
_PHRASES: tuple[str, ...] = (
    "societe de conseil",
    "cabinet de conseil",
    "societe de services numeriques",
    "entreprise de services du numerique",
    "chez nos clients",
    "pour le compte de nos clients",
    "intercontrat",
    "inter contrat",
    "mission chez un client",
    "missions chez nos clients",
    "consultant en regie",
    "consultants en regie",
)
_ESN_WORD = re.compile(r"\besn\b")


def _fold(text: object) -> str:
    folded = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", folded).split())


def _digits(value: object) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


@lru_cache(maxsize=1)
def _referential() -> tuple[frozenset[str], dict[tuple[str, ...], str]]:
    entries = json.loads(_REFERENTIAL.read_text(encoding="utf-8")).get("entries") or []
    sirens = frozenset(s for s in (_digits(e.get("siren")) for e in entries) if len(s) == 9)
    return sirens, build_esn_index(e.get("name") for e in entries if not e.get("siren"))


def in_referential(*, siren: object, name: object) -> bool:
    """Le référentiel élargi nomme cette entreprise (SIREN, sinon nom d'une entrée sans SIREN)."""
    sirens, names = _referential()
    if _digits(siren) in sirens:
        return True
    return bool(name) and match_esn(str(name), names) is not None


def naf_reads_offers(naf: object) -> bool:
    """Ce NAF est-il de ceux où le NAF seul ne tranche pas, et où les offres peuvent le faire ?"""
    digits = "".join(ch for ch in str(naf or "") if ch.isdigit())
    return bool(digits) and digits.startswith(_AMBIGUOUS_NAF_PREFIXES)


def offer_says_esn(title: object, description: object = None) -> bool:
    """Une offre qui se dit celle d'une ESN ou d'un cabinet (formulations fermées ci-dessus)."""
    text = _fold(f"{title or ''} {description or ''}")
    return bool(_ESN_WORD.search(text)) or any(phrase in text for phrase in _PHRASES)


def count_esn_offers(offers: Iterable[Mapping[str, object]]) -> int:
    return sum(1 for o in offers if offer_says_esn(o.get("title"), o.get("description")))


def recognize_esn(
    *, naf: object, siren: object = None, name: object = None, esn_offer_count: int = 0
) -> EsnRecognition | None:
    """``"referential"`` · ``"offers"`` · ``None`` (reste ce que le NAF disait : jamais deviné)."""
    if in_referential(siren=siren, name=name):
        return "referential"
    if naf_reads_offers(naf) and esn_offer_count >= ESN_OFFER_MIN_MATCHES:
        return "offers"
    return None
