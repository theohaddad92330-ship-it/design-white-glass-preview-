"""Prompt registry (Théo restitution p.15 — reproductibilité des prompts).

A single catalog of every Claude SYSTEM prompt in the codebase, keyed by a stable
name and grouped by the pipeline phase / feature it powers. Two goals:

1. **Discoverability** — one place to see which prompts exist and what drives each.
2. **Reproducibility / regression safety** — the golden test
   (``tests/test_prompt_golden.py``) renders every registered prompt with a
   canonical input and pins the output against a committed baseline, so any
   edit to a prompt (or its input-injection) surfaces as a reviewable diff
   instead of silently changing model behaviour in prod.

Two kinds of entry:

* ``SYSTEM_PROMPTS`` — the uniform ``build_system_prompt(profile: dict) -> str``
  builders. Rendered with the run's profile at stamp time.
* ``EXTRA_PROMPTS`` — prompts with a *different* signature (advisor/chat, the
  profiler constant, outreach(channel), the no-arg vocabulary builder, the split
  Phase-4 plan builders). Each carries a zero-arg **canonical renderer** that
  produces a deterministic, value-free string — the prompt *skeleton* — so its
  content hash is stable across runs and pins to a golden. We hash the template
  rendered with canonical/empty inputs, NOT real run values: the version tracks
  the prompt itself, not the data injected into it (Théo p.15).
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable

from app.prompts import (
    bellum_activity,
    bellum_advisor,
    bellum_battlecard,
    bellum_chat_title,
    bellum_commercial_brief,
    bellum_compare,
    bellum_contacts,
    bellum_cv,
    bellum_cv_parse,
    bellum_discover,
    bellum_dossier_blocks,
    bellum_esn_prefill,
    bellum_facts,
    bellum_icebreaker,
    bellum_linkedin_posts,
    bellum_meeting_notes,
    bellum_messages,
    bellum_mission_extract,
    bellum_need_compile_text,
    bellum_need_play,
    bellum_mail_reply,
    bellum_offer_attach,
    bellum_onboarding_reformulate,
    bellum_org_declare,
    bellum_organigramme,
    bellum_outreach,
    bellum_plan,
    bellum_profiler,
    bellum_project_synthesis,
    bellum_qualification,
    bellum_rfp,
    bellum_scorer,
    bellum_search_entity_extract,
    bellum_self_consistency,
    bellum_signals,
    bellum_strategy,
    bellum_summary,
    bellum_talent_message,
    bellum_vocabulary_builder,
    bellum_weekly,
)

SystemPromptBuilder = Callable[[dict], str]
CanonicalRenderer = Callable[[], str]


class PromptSpec:
    """One registered system prompt with the uniform ``build(profile)`` signature."""

    __slots__ = ("name", "phase", "build")

    def __init__(self, name: str, phase: str, build: SystemPromptBuilder) -> None:
        self.name = name
        self.phase = phase
        self.build = build


class RenderedPromptSpec:
    """A registered prompt whose builder is NOT ``build_system_prompt(profile)``.

    It carries a zero-arg ``render()`` that produces a deterministic, value-free
    string (the prompt skeleton) used for both versioning and golden pinning.
    """

    __slots__ = ("name", "phase", "render")

    def __init__(self, name: str, phase: str, render: CanonicalRenderer) -> None:
        self.name = name
        self.phase = phase
        self.render = render


# Ordered by pipeline phase then feature. The ``name`` is the stable golden-file
# key — renaming one renames its golden baseline, so keep them stable.
SYSTEM_PROMPTS: tuple[PromptSpec, ...] = (
    # ── Analysis pipeline ────────────────────────────────────────────────
    PromptSpec("facts", "research", bellum_facts.build_system_prompt),
    PromptSpec("signals", "research", bellum_signals.build_system_prompt),
    PromptSpec("strategy", "research", bellum_strategy.build_system_prompt),
    PromptSpec("activity", "research", bellum_activity.build_system_prompt),
    PromptSpec("contacts", "contacts", bellum_contacts.build_system_prompt),
    PromptSpec("organigramme", "organigramme", bellum_organigramme.build_system_prompt),
    PromptSpec("plan", "plan", bellum_plan.build_system_prompt),
    PromptSpec("scorer", "plan", bellum_scorer.build_system_prompt),
    PromptSpec("summary", "plan", bellum_summary.build_system_prompt),
    # ── On-demand / advisory ─────────────────────────────────────────────
    PromptSpec("messages", "messages", bellum_messages.build_system_prompt),
    PromptSpec("icebreaker", "icebreaker", bellum_icebreaker.build_system_prompt),
    PromptSpec("battlecard", "battlecard", bellum_battlecard.build_system_prompt),
    PromptSpec("compare", "compare", bellum_compare.build_system_prompt),
    PromptSpec("discover", "discover", bellum_discover.build_system_prompt),
    PromptSpec("weekly", "weekly", bellum_weekly.build_system_prompt),
)


# ── Canonical, value-free inputs ─────────────────────────────────────────────
# We version the template SKELETON, never the run-specific values injected into
# it (company names, profile fields, dates). A fixed placeholder keeps the hash
# stable while still moving whenever the surrounding template changes.
_CANONICAL_COMPANY = "ACME"
_OUTREACH_CHANNELS: tuple[str, ...] = ("email", "linkedin", "phone")
_PLAN_SUBSECTIONS: tuple[str, ...] = (
    "action_plan",
    "offers",
    "quick_wins",
    "if_no_response",
    "evaluation",
    "competitive_strategy",
)


def _render_advisor() -> str:
    """Chat/advisor system prompt, empty context → the base template (N/A fills)."""
    return bellum_advisor.build_system_prompt({}, {}, "", "")


def _render_offer_attach() -> str:
    """#4437 — le rattachement du texte libre, avec la liste FERMÉE des familles métier (triée : empreinte stable)."""
    from app.services.job_family import job_families

    return bellum_offer_attach.build_system_prompt(sorted(job_families()))


def _render_profiler() -> str:
    """Onboarding profiler system prompt (a constant string)."""
    return bellum_profiler.BELLUM_PROFILER_SYSTEM


def _render_outreach() -> str:
    """One system prompt per channel — the channel switches the rules block, so we
    hash all channels together (any channel-branch edit moves the hash)."""
    return "\n\n".join(
        f"### channel={channel}\n{bellum_outreach.build_system_prompt({}, channel)}" for channel in _OUTREACH_CHANNELS
    )


def _render_plan_action_plan_meta() -> str:
    return bellum_plan.build_action_plan_meta_prompt(company_name=_CANONICAL_COMPANY)


def _render_plan_action_plan_phase() -> str:
    """All five temporal buckets together — each embeds its phase name, so hashing
    them jointly guards every phase template under one registry entry."""
    return "\n\n".join(
        bellum_plan.build_action_plan_phase_prompt(company_name=_CANONICAL_COMPANY, phase_name=phase)
        for phase in bellum_plan.ACTION_PLAN_PHASES
    )


def _render_plan_subsection() -> str:
    """Every Phase-4 subsection prompt (each pins an output schema) under one entry."""
    return "\n\n".join(
        bellum_plan.build_subsection_user_prompt(company_name=_CANONICAL_COMPANY, section=section)
        for section in _PLAN_SUBSECTIONS
    )


def _render_self_consistency() -> str:
    """The A1 re-derivation prompts (plays + contacts, system + user skeletons)
    under one entry. The score re-derivation reuses the ``evaluation`` plan
    subsection verbatim — already pinned by ``plan_subsection``."""
    return "\n\n".join(
        (
            "### plays.system\n" + bellum_self_consistency.build_plays_system_prompt({}),
            "### plays.user\n"
            + bellum_self_consistency.build_plays_user_prompt(
                company_name=_CANONICAL_COMPANY, perimeters=(), angles=()
            ),
            "### contacts.system\n" + bellum_self_consistency.build_contacts_system_prompt({}),
            "### contacts.user\n"
            + bellum_self_consistency.build_contacts_user_prompt(company_name=_CANONICAL_COMPANY, contacts=()),
        )
    )


# Prompts with a non-uniform signature, each versioned via a canonical render.
EXTRA_PROMPTS: tuple[RenderedPromptSpec, ...] = (
    # ── Chat / onboarding ────────────────────────────────────────────────
    RenderedPromptSpec("advisor", "chat", _render_advisor),
    # #1911.1 — le titre d'un fil : un système SANS argument (le fil et la
    # langue partent par le prompt utilisateur), donc le builder est son
    # propre render canonique, comme `cv` ou `org_declare` plus bas.
    RenderedPromptSpec("chat_title", "chat", bellum_chat_title.build_system_prompt),
    # #2810 — extraction d'entité pour /search : même profil que `chat_title`
    # juste au-dessus (système SANS argument, la phrase tapée part par le
    # prompt utilisateur), donc le builder est son propre render canonique.
    RenderedPromptSpec("search_entity_extract", "search", bellum_search_entity_extract.build_system_prompt),
    RenderedPromptSpec("profiler", "profiler", _render_profiler),
    # ── On-demand messaging / vocabulary ─────────────────────────────────
    RenderedPromptSpec("outreach", "messages", _render_outreach),
    # #4347 — le message de Laura à un CONSULTANT du vivier : un système SANS argument (le consultant, le besoin et
    # le ton partent par le prompt utilisateur), donc le builder est son propre render canonique.
    RenderedPromptSpec("talent_message", "messages", bellum_talent_message.build_system_prompt),
    # ── Appel d'offres (addendum final p66-68) ────────────────────────────
    # Deux prompts, deux empreintes : l'analyse et la rédaction n'évoluent pas
    # ensemble, et un garde-fou de rédaction retiré par mégarde doit se voir
    # tomber seul.
    RenderedPromptSpec("rfp_analyse", "rfp", bellum_rfp.build_analysis_system_prompt),
    RenderedPromptSpec("rfp_draft", "rfp", bellum_rfp.build_drafting_system_prompt),
    RenderedPromptSpec("vocabulary", "vocabulary", bellum_vocabulary_builder.build_system_prompt),
    # ── Les sept sans filet (audit du 01/09/2026) ─────────────────────────
    # Ils vivaient hors registre : réécrivables sans qu'un seul test tombe.
    # Tous exposent un ``build_system_prompt()`` SANS ARGUMENT — la donnée de
    # run (une fiche, un CV, des notes, une langue) part par le *user* prompt,
    # jamais par le système. Leur render canonique est donc le builder lui-même,
    # comme ``vocabulary`` et les deux ``rfp_*`` : on n'invente pas une seconde
    # façon de neutraliser une charge utile, celle-ci existe déjà.
    RenderedPromptSpec("cv", "cv", bellum_cv.build_system_prompt),
    RenderedPromptSpec("cv_parse", "cv", bellum_cv_parse.build_system_prompt),
    RenderedPromptSpec("esn_prefill", "onboarding", bellum_esn_prefill.build_system_prompt),
    RenderedPromptSpec("mail_reply", "mail", bellum_mail_reply.build_system_prompt),
    RenderedPromptSpec("onboarding_reformulate", "onboarding", bellum_onboarding_reformulate.build_system_prompt),
    # Chantier « briefs comptes » (01/10/2026) — système SANS argument, le
    # dossier part par le prompt utilisateur : le builder est son render.
    RenderedPromptSpec("commercial_brief", "commercial_brief", bellum_commercial_brief.build_system_prompt),
    # #4078 — les blocs 01/14/15 du dossier : même profil que le brief (système
    # SANS argument, le dossier part par le prompt utilisateur).
    RenderedPromptSpec("dossier_blocks", "dossier_blocks", bellum_dossier_blocks.build_system_prompt),
    RenderedPromptSpec("linkedin_posts", "content", bellum_linkedin_posts.build_system_prompt),
    RenderedPromptSpec("meeting_notes", "notes", bellum_meeting_notes.build_system_prompt),
    RenderedPromptSpec("need_play", "need_play", bellum_need_play.build_system_prompt),
    RenderedPromptSpec("org_declare", "organigramme", bellum_org_declare.build_system_prompt),
    # #2560 — lecture d'un contrat, d'une fiche de poste ou d'un e-mail pour
    # PROPOSER une mission (compte, rôle, dates, TJM, jours). ``build_system_prompt``
    # est sans argument comme les autres de ce bloc ; le nom d'entrée
    # ``mission_extract`` est celui que ``services/mission_extraction.py`` passe
    # déjà à ``call_claude`` (``PROMPT_NAME``) — même nom des deux côtés, pas
    # d'alias de modèle à déclarer pour LUI (voir en revanche
    # ``_ALIAS_DE_MODELE["bellum_mission_extract"]`` côté fichier).
    RenderedPromptSpec("mission_extract", "delivery", bellum_mission_extract.build_system_prompt),
    # #2939 (#2174.3/.5) — lecture d'un brief ou d'un e-mail collé À L'ÉTAPE 1
    # de l'assistant de création de besoin, pour PROPOSER une compilation
    # (chaque champ avec sa citation) au même compilateur que la carte de
    # Laura (#2322). Même profil que `mission_extract` juste au-dessus :
    # `build_system_prompt` prend `source_kind`, jamais un profil ; le nom
    # d'entrée `need_compile_text` est celui que `services/need_compile_text.py`
    # passe déjà à `call_claude` (`PROMPT_NAME`) — pas d'alias de modèle à
    # déclarer pour LUI (voir en revanche
    # `_ALIAS_DE_MODELE["bellum_need_compile_text"]` côté fichier, tests).
    RenderedPromptSpec("need_compile_text", "needs", bellum_need_compile_text.build_system_prompt),
    # #3755 — la grille de qualification propre à l'espace, évaluée critère par
    # critère avec sa preuve. Le nom d'entrée est le module (`bellum_qualification`),
    # celui que `services/qualification_evaluation.py` passe à `call_claude`.
    RenderedPromptSpec("bellum_qualification", "qualification", bellum_qualification.build_system_prompt),
    # #2171.27 — synthèse en 7 questions d'une opportunité. ``build_system_prompt``
    # est sans argument comme les autres de ce bloc.
    RenderedPromptSpec("project_synthesis", "projects", bellum_project_synthesis.build_system_prompt),
    # #4437 — rattache les intitulés d'offres lus à un type de fait, une compétence et une famille (liste fermée) ;
    # le nom d'entrée est le module, celui que `services/free_text_facts.py` passe à `call_claude`.
    RenderedPromptSpec("bellum_offer_attach", "offers", _render_offer_attach),
    # ── Phase-4 plan, split calls (different signatures) ──────────────────
    RenderedPromptSpec("plan_action_plan_meta", "plan", _render_plan_action_plan_meta),
    RenderedPromptSpec("plan_action_plan_phase", "plan", _render_plan_action_plan_phase),
    RenderedPromptSpec("plan_subsection", "plan", _render_plan_subsection),
    # ── Self-consistency A1 (re-dérivation plays + contacts, phase plan) ──
    RenderedPromptSpec("self_consistency", "plan", _render_self_consistency),
)


def get_prompt_spec(name: str) -> PromptSpec | RenderedPromptSpec | None:
    return next(
        (spec for spec in (*SYSTEM_PROMPTS, *EXTRA_PROMPTS) if spec.name == name),
        None,
    )


def registry_names() -> list[str]:
    return [spec.name for spec in SYSTEM_PROMPTS] + [spec.name for spec in EXTRA_PROMPTS]


# ── Per-run reproducibility stamp (Théo p.15) ────────────────────────────────
# A dossier is auditable only if we can say WHICH prompt versions produced it.
# We hash each prompt's render and the router stamps the mapping into
# ``raw_analysis._api_metrics.prompt_versions`` so any run can be replayed /
# compared against the golden set before a merge.
_HASH_LEN = 12


def _content_hash(text: str) -> str:
    """Stable short (12 hex) sha256 of a rendered prompt."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:_HASH_LEN]


def prompt_registry_fingerprint(profile: dict | None = None) -> dict[str, str]:
    """Map every registered prompt name → a short content hash of its render.

    Uniform builders are rendered with the run's ``profile`` (what actually
    reached the model); the non-uniform prompts (advisor/profiler/outreach/
    vocabulary/Phase-4 plan splits) render with their canonical, value-free
    inputs — their hash tracks the template, not per-run data. Deterministic for
    a given ``profile`` (same input → identical hashes).
    """
    rendered_profile = profile or {}
    fingerprint: dict[str, str] = {spec.name: _content_hash(spec.build(rendered_profile)) for spec in SYSTEM_PROMPTS}
    for spec in EXTRA_PROMPTS:
        fingerprint[spec.name] = _content_hash(spec.render())
    return fingerprint


def prompt_registry_canonical_fingerprint() -> dict[str, str]:
    """Fully deterministic, run-profile-independent fingerprint — the *template*
    version of every prompt.

    Uniform builders are rendered with an empty profile so the hash reflects only
    the prompt skeleton; the non-uniform prompts use their canonical render. This
    is what ``prompt_version_for`` / ``prompt_registry_version`` and the committed
    baseline (``tests/golden/prompt_fingerprint.json``) pin.
    """
    fingerprint: dict[str, str] = {spec.name: _content_hash(spec.build({})) for spec in SYSTEM_PROMPTS}
    for spec in EXTRA_PROMPTS:
        fingerprint[spec.name] = _content_hash(spec.render())
    return fingerprint


def prompt_version_for(name: str) -> str | None:
    """Stable template-version hash for a single registered prompt.

    Used to expose a prompt's version outside the analysis run — the chat
    endpoint stamps ``advisor``; the profiler agent stamps ``profiler`` — the
    same way the analysis stamps its full fingerprint.
    """
    return prompt_registry_canonical_fingerprint().get(name)


def prompt_registry_version(profile: dict | None = None) -> str:
    """A single combined hash over the whole prompt set — one version stamp.

    Derived from the canonical (run-profile-independent) fingerprint, so it moves
    iff any registered prompt's template content changes and doubles as a cheap
    "did the prompt set drift?" marker across runs. ``profile`` is accepted for
    backward compatibility but does not affect the stamp (a version identifies the
    template, not the injected data).
    """
    fingerprint = prompt_registry_canonical_fingerprint()
    combined = "\n".join(f"{name}:{digest}" for name, digest in sorted(fingerprint.items()))
    return _content_hash(combined)
