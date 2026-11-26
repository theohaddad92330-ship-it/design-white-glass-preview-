"""#2899 / #2443.10 — LE LECTEUR des échantillons de production anonymisés.

Le corpus « erreurs production anonymisées » (``ChatCorpusSource.ANONYMIZED_PRODUCTION_ERRORS``)
n'avait aucun lecteur : les espaces qui cochent (Réglages › Laura) versent leurs demandes
anonymisées dans ``chat_eval_samples`` (côté API), et rien ne les relisait. Ce module les relit par
le pont interne (``GET /internal/chat-eval-samples``).

Trois propriétés :

1. **No-op strict sans pont.** Sans ``API_INTERNAL_URL``/``INTERNAL_API_SECRET`` : zéro réseau, le
   rapport dit ``UNAVAILABLE`` et ``measured=False`` — « non mesuré », jamais « 0 échantillon »
   (gardes GA-18 / GA-19).
2. **Texte seul.** Seuls le texte et la date sont gardés ; tout autre champ de la réponse est
   ignoré (jamais un espace, une personne, un identifiant).
3. **Défense en profondeur.** ``screen_sample`` re-vérifie, SANS modèle, qu'un échantillon ne porte
   ni e-mail, ni téléphone, ni lien, ni SIREN/SIRET, ni IBAN : l'anonymiseur de l'API est
   heuristique (c93 ``gap``), cette seconde lecture compte ce qui lui aurait échappé.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from app.services import bellum_api

_DEFAULT_LIMIT = 100


class ProdSampleStatus(StrEnum):
    OK = "ok"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class ProdSample:
    text: str
    sampled_at: str


@dataclass(frozen=True)
class ProdSampleReport:
    status: ProdSampleStatus
    samples: list[ProdSample] = field(default_factory=list)
    not_anonymous: int = 0

    @property
    def measured(self) -> bool:
        """Faux quand le pont est éteint : « non mesuré » n'est jamais « 0 »."""
        return self.status is ProdSampleStatus.OK

    @property
    def clean(self) -> int:
        return len(self.samples) - self.not_anonymous


#: Ce qu'un échantillon anonymisé ne doit JAMAIS contenir. Même vocabulaire que l'anonymiseur de l'API
#: (``chat-eval-anonymizer.ts``) : e-mail, téléphone, lien, SIREN/SIRET, IBAN.
_LEAK_PATTERNS: dict[str, re.Pattern[str]] = {
    "email": re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),
    "url": re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE),
    "iban": re.compile(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,}\b"),
    "siren": re.compile(r"\b\d{3}\s?\d{3}\s?\d{3}(?:\s?\d{5})?\b"),
    "phone": re.compile(r"(?:\+\d{1,3}[\s.-]?|\b0)\d(?:[\s.-]?\d{2}){4}\b"),
}


def screen_sample(text: str) -> str | None:
    """Le nom de la première fuite trouvée dans ``text``, ou ``None`` s'il est propre."""
    for name, pattern in _LEAK_PATTERNS.items():
        if pattern.search(text):
            return name
    return None


def _parse(payload: Any) -> list[ProdSample] | None:
    items = payload.get("samples") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return None
    samples: list[ProdSample] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        text = item.get("text")
        if not isinstance(text, str) or not text.strip():
            continue
        sampled_at = item.get("sampledAt")
        samples.append(ProdSample(text=text.strip(), sampled_at=sampled_at if isinstance(sampled_at, str) else ""))
    return samples


async def load_prod_samples(limit: int = _DEFAULT_LIMIT) -> ProdSampleReport:
    """Relit les échantillons par le pont. Aucun modèle, aucun repli inventé."""
    samples = _parse(await bellum_api.chat_eval_samples(limit))
    if samples is None:
        return ProdSampleReport(status=ProdSampleStatus.UNAVAILABLE)
    leaks = sum(1 for sample in samples if screen_sample(sample.text) is not None)
    return ProdSampleReport(status=ProdSampleStatus.OK, samples=samples, not_anonymous=leaks)
