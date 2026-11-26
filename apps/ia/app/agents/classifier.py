"""Classifier agent — Phase 3 of the analysis pipeline.

Thin wrapper around :func:`classify_contacts_and_organigramme` that adapts
the underlying service to the :class:`AgentEnvelope` contract. No business
logic duplication — the per-batch classification + organigramme merge stays
in ``app.services.classification``.

Status policy:

* ``success`` — Classification ran and at least one contact has priority 1 or 2.
* ``partial_success`` — Classification ran but no priority 1/2 contact came
  back; ``meta.warnings`` carries ``CLASSIFIER_NO_PRIORITY_CONTACTS`` so the
  UI can prompt the user to widen the Apollo search or add manual contacts.
* ``recoverable_failure`` — Currently unused; the underlying service raises
  ``ClaudeError`` (terminal) on Claude failures and swallows per-batch
  errors silently. Once the service surfaces typed transient errors, this
  branch maps them via the helper.
* ``terminal_failure`` — Claude raised a typed terminal failure, or an
  unexpected exception escaped.
* ``cancelled`` — Client disconnect propagated via ``asyncio.CancelledError``.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime

# Side-effect import — binds the AgentError.from_* classmethods.
import app.models.agent_error_adapters  # noqa: F401
from app.middleware.correlation_id import get_correlation_id
from app.models.agent_envelope import (
    AgentEnvelope,
    AgentError,
    AgentMeta,
    AgentStatus,
    AgentWarning,
    TokenUsage,
)
from app.models.classified_data import ClassifiedData
from app.models.classify import ClassifyRequest
from app.services.classification import classify_contacts_and_organigramme
from app.services.claude_service import ClaudeError
from app.services.entities import in_scope_entities
from app.services.source_health import get_degradations

logger = logging.getLogger(__name__)


AGENT_NAME = "classifier"
AGENT_VERSION = "1.0.0"


class ClassifierAgent:
    async def run(
        self,
        company_name: str,
        profile_data: dict,
        research_data: dict,
        contacts_data: dict,
        *,
        # Mémoire de corrections du compte (feedback loop A2) — threadée telle
        # quelle vers la ClassifyRequest. "" (défaut) = prompts byte-identiques.
        account_feedback: str = "",
        # #4070.3 — interlocuteurs déjà connus de l'espace. [] = prompts byte-identiques.
        known_contacts: list[dict] | None = None,
    ) -> AgentEnvelope[ClassifiedData]:
        started_at = datetime.now(UTC)
        t0 = time.monotonic()
        correlation_id = get_correlation_id() or ""

        def _meta(
            *, warnings: list[AgentWarning] | None = None, token_usage: TokenUsage | None = None
        ) -> AgentMeta:
            return AgentMeta(
                agent_name=AGENT_NAME,
                agent_version=AGENT_VERSION,
                correlation_id=correlation_id,
                started_at=started_at.isoformat(),
                finished_at=datetime.now(UTC).isoformat(),
                duration_ms=int((time.monotonic() - t0) * 1000),
                warnings=warnings or None,
                token_usage=token_usage,
            )

        # Build the merged ``profile_data`` shape the service expects.
        # ``classify_contacts_and_organigramme`` reads entities / angles /
        # pains and ``companyName`` from a single dict, so we fold the
        # relevant research_data slices into the ESN profile before the call.
        merged_profile = self._build_service_profile(
            company_name, profile_data, research_data
        )
        contacts_list = list(contacts_data.get("contacts", []))
        request = ClassifyRequest(
            account_id="",  # Internal call — HTTP layer fills this when routing
            contacts=contacts_list,
            profile_data=merged_profile,
            # The merge above overwrites ``companyName`` with the TARGET's, so the
            # merged dict can no longer say who is selling. Pass the ESN profile
            # unmerged — the « PROFIL ESN » block and the /100 seller boost read it.
            esn_profile=profile_data,
            account_feedback=account_feedback,
            known_contacts=known_contacts or [],
        )

        try:
            merged = await classify_contacts_and_organigramme(request)
            data = ClassifiedData.model_validate(merged)
            # Surface the real Phase-3 token cost on the envelope meta — the graph
            # node reads usage from meta.token_usage (NOT data._api_metrics), so
            # without this classify reports $0.
            tu_dict = (merged.get("_api_metrics") or {}).get("token_usage")
            token_usage = TokenUsage(**tu_dict) if isinstance(tu_dict, dict) else None

            warnings = _warnings_for(data)
            status = (
                AgentStatus.PARTIAL_SUCCESS if warnings else AgentStatus.SUCCESS
            )
            return AgentEnvelope[ClassifiedData](
                status=status,
                data=data,
                error=None,
                meta=_meta(warnings=warnings, token_usage=token_usage),
            )

        except asyncio.CancelledError:
            return AgentEnvelope[ClassifiedData](
                status=AgentStatus.CANCELLED,
                data=None,
                error=None,
                meta=_meta(),
            )

        except ClaudeError as exc:
            logger.warning("ClassifierAgent: Claude error: %s", exc)
            return AgentEnvelope[ClassifiedData](
                status=AgentStatus.TERMINAL_FAILURE,
                data=None,
                error=AgentError.from_claude_error(
                    exc, context={"correlation_id": correlation_id}
                ),
                meta=_meta(),
            )

        except Exception as exc:  # noqa: BLE001
            logger.error("ClassifierAgent failed: %s", exc, exc_info=True)
            return AgentEnvelope[ClassifiedData](
                status=AgentStatus.TERMINAL_FAILURE,
                data=None,
                error=AgentError.from_unexpected(exc, agent_name=AGENT_NAME),
                meta=_meta(),
            )

    @staticmethod
    def _build_service_profile(
        company_name: str, profile_data: dict, research_data: dict
    ) -> dict:
        """Merge ESN profile + research_data into the shape the service needs.

        The service reads ``entities / angles / pains`` from a single dict;
        in the orchestrator path they live in research_data; in the HTTP
        path the API worker already merges them into ``profile_data``. We
        prefer research_data when both are present (it's the freshest).
        """
        return {
            **profile_data,
            "companyName": (
                company_name
                or profile_data.get("companyName")
                or research_data.get("companyName")
                or "N/A"
            ),
            # Only in-scope entities seed the organigramme: an out-of-scope BU
            # (SGTM, SG Côte d'Ivoire, SPV) must not become a "Contacts par entité"
            # group nor place a contact (Théo: mauvais scope). getsPlay=False → out.
            "entities": in_scope_entities(
                research_data.get("entitiesExhaustive")
                or research_data.get("entities")
                or profile_data.get("entities")
                or []
            ),
            "angles": (
                research_data.get("angles") or profile_data.get("angles") or []
            ),
            "pains": (
                research_data.get("pains") or profile_data.get("pains") or []
            ),
            # Contexte obligatoire du prompt d'organigramme (annexe p24) :
            # RELATIONSHIP_CONTEXT et SIGNALS. Les deux vivent dans la sortie de
            # la phase 1 et s'arrêtaient ici — le prompt raisonnait donc sans
            # savoir si le compte est froid, client ou rang 2, ce qui est
            # précisément ce qui décide de la stratégie d'approche (p26).
            # Absents = clés vides, le prompt affiche « non fourni ».
            "salesContext": (
                research_data.get("salesContext") or profile_data.get("salesContext") or {}
            ),
            "signals": (
                research_data.get("signals") or profile_data.get("signals") or []
            ),
        }


# ── partial_success rule ────────────────────────────────────────────────────


def _warnings_for(data: ClassifiedData) -> list[AgentWarning]:
    """Apply the §3 DoD rule: no priority-1-or-2 contact → partial_success.

    Also surfaces classification batches that failed. A batch that raised returns
    an empty list (``classification._run_contacts_batch``), so up to
    ``CONTACTS_BATCH_SIZE`` contacts could silently vanish while the phase still
    reported success — the user just saw fewer contacts than the previous run,
    with no explanation. One of the visible "analyses pas constantes".
    """
    out: list[AgentWarning] = []

    for entry in get_degradations(get_correlation_id()):
        if entry["source"] != "classify_batch":
            continue
        out.append(
            AgentWarning(
                code="CLASSIFIER_BATCH_FAILED",
                message=(
                    "Une partie des contacts n'a pas pu être classée "
                    f"({entry['reason']}). La liste est incomplète — relancer pour la compléter."
                ),
                context={"source": "classify_batch", "reason": entry["reason"]},
            )
        )

    has_high_priority = any(
        getattr(c, "priority", 0) in (1, 2) for c in data.contacts
    )
    if has_high_priority:
        return out
    out.append(
        AgentWarning(
            code="CLASSIFIER_NO_PRIORITY_CONTACTS",
            message=(
                "Aucun contact de priorité 1 ou 2 identifié. "
                "Élargir la recherche d'interlocuteurs ou ajouter des contacts manuellement."
            ),
            context={"contact_count": len(data.contacts)},
        )
    )
    return out
