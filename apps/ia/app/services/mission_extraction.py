"""LA LECTURE AUTOMATIQUE D'UN DOCUMENT DE MISSION (#2560).

─────────────────────────────────────────────────────────────────────────────
CE QUE CE LOT CORRIGE
─────────────────────────────────────────────────────────────────────────────
Trois retours du call bêta François Thomas du 17/09/2026 (#2560/#2561/#2562) :
« ce que le client a déjà — un contrat, une fiche de poste, un e-mail — ne
doit pas être retapé dans BellumAI ». Ce module tient la moitié #2560 : lire un
document et proposer compte, rôle, dates, TJM et jours — jamais une écriture,
toujours une proposition que l'écran affiche modifiable, validée par le clic de
l'utilisateur.

Le chemin, dans l'ordre, est CELUI de `rfp.service.ts` / `expense_extraction.py`
et non un troisième chemin réinventé : texte déjà extrait côté web, ou fichier
brut dont `document_text.extract_document_text` tire le texte ici, côté
serveur — la même raison que l'ingestion RAG (lire un `.docx` en UTF-8 côté
navigateur produit du mojibake). Contrairement à `expense_extraction.py`, PAS
d'OCR : un contrat ou une fiche de poste a presque toujours un calque de texte,
et l'ajouter ici referait le même connecteur pour un cas marginal — un PDF
scanné reste `STATUS_UNREADABLE`, un statut nommé plutôt qu'une panne.

─────────────────────────────────────────────────────────────────────────────
LA RÈGLE QUI COMMANDE TOUT : UN CHAMP PEU SÛR RESTE VIDE
─────────────────────────────────────────────────────────────────────────────
Même garde que `bellum_cv_parse` et `expense_extraction` : sous
`_MIN_CONFIDENCE`, ou sans citation retrouvable dans le texte source, le champ
est rendu à `null` — jamais affiché comme lu. « Un TJM lu à 90 % de confiance
n'est PAS un TJM, c'est une proposition. »

─────────────────────────────────────────────────────────────────────────────
LE PLAFOND
─────────────────────────────────────────────────────────────────────────────
`_MAX_TEXT_CHARS` : un contrat ou une fiche de poste tient sur quelques pages ;
au-delà, on REFUSE l'appel plutôt que de payer un prompt qui ne rendrait rien
d'exploitable — `STATUS_TOO_LARGE`, avant tout appel de modèle.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from app.prompts import bellum_mission_extract as prompt
from app.services.claude_service import call_claude
from app.services.document_reader import read_document
from app.services.document_text import DocumentTextError
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)

#: Nommé explicitement — c'est aussi la clé enregistrée dans `PROMPT_MODELS`
#: (`model_policy.py`) et lue par `test_every_prompt_is_registered`.
PROMPT_NAME = "mission_extract"

STATUS_OK = "ok"
STATUS_UNREADABLE = "unreadable"
STATUS_TOO_LARGE = "too_large"

#: Même palier que `expense_extraction._MIN_CONFIDENCE` et
#: `bellum_cv_parse` : sous ce seuil, un champ lu reste VIDE.
_MIN_CONFIDENCE = 0.6

#: Voir « LE PLAFOND » ci-dessus — un contrat/une fiche de poste tient sur
#: quelques pages, plus large qu'un justificatif (`expense_extraction`, 6 000).
_MAX_TEXT_CHARS = 20_000

FIELD_KEYS: tuple[str, ...] = (
    "account_name",
    "role_title",
    "started_on",
    "ends_on",
    "daily_rate",
    "days",
    # X66 / #3547 — AJOUTÉ EN FIN : le forfait encadré, réalisé par les salariés du client.
    "supervised_forfait",
)


@dataclass(frozen=True)
class ExtractedField:
    """Une proposition — jamais une valeur affirmée. `confidence` et
    `source_excerpt` restent à `0.0` / `""` quand `value` est `None`, pour
    qu'un appelant n'ait jamais à distinguer « pas lu » de « lu mais écarté »."""

    value: Any = None
    confidence: float = 0.0
    source_excerpt: str = ""

    def to_camel(self) -> dict[str, Any]:
        return {"value": self.value, "confidence": self.confidence, "sourceExcerpt": self.source_excerpt}


def _absent() -> ExtractedField:
    return ExtractedField()


@dataclass(frozen=True)
class MissionExtractionResult:
    status: str
    #: `None` = aucun appel de modèle n'a eu lieu, OU son tarif est inconnu —
    #: jamais un coût à zéro qui se lirait « gratuit ».
    cost_usd: float | None = None
    fields: dict[str, ExtractedField] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        fields = {**_empty_fields(), **self.fields}
        return {
            "status": self.status,
            "costUsd": self.cost_usd,
            "fields": {
                "accountName": fields["account_name"].to_camel(),
                "roleTitle": fields["role_title"].to_camel(),
                "startedOn": fields["started_on"].to_camel(),
                "endsOn": fields["ends_on"].to_camel(),
                "dailyRate": fields["daily_rate"].to_camel(),
                "days": fields["days"].to_camel(),
                "supervisedForfait": fields["supervised_forfait"].to_camel(),
            },
        }


def _empty_fields() -> dict[str, ExtractedField]:
    return {key: _absent() for key in FIELD_KEYS}


def _result(
    status: str,
    *,
    cost_usd: float | None = None,
    fields: dict[str, ExtractedField] | None = None,
) -> MissionExtractionResult:
    return MissionExtractionResult(status=status, cost_usd=cost_usd, fields=fields or _empty_fields())


async def extract(text: str | None, data: bytes | None = None, filename: str | None = None) -> MissionExtractionResult:
    """Lit un document (texte déjà extrait, ou fichier brut) et propose compte,
    rôle, dates, TJM et jours — ou dit pourquoi elle ne peut pas.

    Ne lève JAMAIS pour un motif métier (les deux statuts d'échec couvrent
    tout) ; seule une panne du modèle structurant (réseau, 5xx) remonte une
    exception — à l'appelant (le routeur) de la traduire en 502, comme
    `/expenses/extract` et `/cv/parse`.
    """
    resolved = (text or "").strip()
    if not resolved and data:
        try:
            resolved = (await read_document(data, filename)).text.strip()
        except DocumentTextError:
            return _result(STATUS_UNREADABLE)

    if not resolved:
        return _result(STATUS_UNREADABLE)

    if len(resolved) > _MAX_TEXT_CHARS:
        logger.warning(
            "Extraction de mission refusée : %d caractères, au-delà de la borne de %d",
            len(resolved),
            _MAX_TEXT_CHARS,
        )
        return _result(STATUS_TOO_LARGE)

    result, usage = await call_claude(
        prompt.build_system_prompt(),
        prompt.build_user_prompt(resolved),
        response_model=dict,
        max_tokens=600,
        prompt_name=PROMPT_NAME,
        model=model_for(PROMPT_NAME),
    )
    # Un tarif inconnu ne se lit jamais « gratuit » (même discipline que
    # `claude_service._log_usage`).
    cost_usd = usage.cost_usd if usage is not None and usage.cost_known else None

    payload = result if isinstance(result, dict) else {}
    fields = _validate_fields(payload, resolved)
    return _result(STATUS_OK, cost_usd=cost_usd, fields=fields)


def _normalise(value: str) -> str:
    """Casse et espaces ne distinguent pas deux citations du même passage —
    identique à `bellum_cv_parse._normalise` et `expense_extraction._normalise`."""
    return " ".join(value.split()).casefold()


def _validated(raw: dict[str, Any], text: str, key: str, checker: Any) -> ExtractedField:
    entry = raw.get(key)
    if not isinstance(entry, dict):
        return _absent()

    value = entry.get("value")
    confidence = entry.get("confidence")
    excerpt = entry.get("source_excerpt")
    excerpt = excerpt.strip() if isinstance(excerpt, str) else ""

    if value is None or value == "":
        return _absent()
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool) or confidence < _MIN_CONFIDENCE:
        return _absent()
    if not excerpt or _normalise(excerpt) not in _normalise(text):
        # Citer de mémoire est ce qu'un modèle fait quand il ne trouve pas.
        return _absent()

    checked = checker(value)
    if checked is None:
        return _absent()
    return ExtractedField(value=checked, confidence=float(confidence), source_excerpt=excerpt)


def _check_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    if not trimmed or len(trimmed) > 300:
        return None
    return trimmed


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _check_date(value: Any) -> str | None:
    if not isinstance(value, str) or not _DATE_RE.match(value):
        return None
    year, month, day = (int(part) for part in value.split("-"))
    try:
        date(year, month, day)
    except ValueError:
        return None
    return value


def _check_daily_rate(value: Any) -> float | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    if value <= 0 or value > 100_000:
        return None
    return round(float(value), 2)


def _check_days(value: Any) -> float | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    if value <= 0 or value > 10_000:
        return None
    return round(float(value), 1)


_SUPERVISED = "supervised"


def _check_supervised(value: Any) -> str | None:
    """X66 / #3547 — une seule valeur connue : le forfait encadré. Toute autre
    chose reste vide (jamais un mode deviné)."""
    return _SUPERVISED if value == _SUPERVISED else None


_CHECKERS: dict[str, Any] = {
    "account_name": _check_text,
    "role_title": _check_text,
    "started_on": _check_date,
    "ends_on": _check_date,
    "daily_rate": _check_daily_rate,
    "days": _check_days,
    "supervised_forfait": _check_supervised,
}


def _validate_fields(raw: dict[str, Any], text: str) -> dict[str, ExtractedField]:
    return {key: _validated(raw, text, key, _CHECKERS[key]) for key in FIELD_KEYS}
