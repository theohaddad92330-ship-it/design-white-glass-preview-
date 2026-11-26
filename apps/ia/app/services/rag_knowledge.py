"""RAG-knowledge v2 — the knowledge flywheel (populate + reranked retrieval).

ADDITIVE + always-on. Each entrypoint degrades cleanly on its own inputs (no
user_id / no query / empty store → clean no-op), so the phases keep working with
or without knowledge to draw on:

1. **Populate** — on analysis completion, a finished run is distilled into a few
   tight, retrievable docs (validated account facts, sector insights, winning
   angles) and *upserted* into the user's ``rag_documents`` store. Best-effort:
   it NEVER fails the run, and it respects the existing FT/vector modes (the
   upsert reuses ``rag_service``'s embedding path).

2. **Retrieve + rerank** — for the current company/sector, pull the top-K docs
   from the user's store, **rerank** them (cross-encoder if a local model is
   configured → LLM-lite via the gateway → deterministic recency+overlap), and
   return a compact block to ADD to the research/plan prompt context.

Distillation is DETERMINISTIC and NO-FAKE: only fields actually present in the
run are used; a missing field is skipped, never invented.
"""

from __future__ import annotations

import logging
import math
import os
import re
from datetime import UTC, datetime
from typing import Any

from app.services import kill_switch, rag_service

logger = logging.getLogger(__name__)

# Categories used to key distilled knowledge for retrieval.
#
# ⚠️ Les trois premières sont historiques et restent EN TÊTE (tome 7 §38, M4) :
# l'ordre est lu par un humain dans l'écran Connaissances, et permuter deux
# lignes ferait croire à un changement de priorité qui n'a pas eu lieu.
#
# ⚠️ Ce catalogue ne CONTRAINT pas la colonne : `category` porte déjà du texte
# libre en production (« Notion » pour une page ingérée, « sales », « Autre »
# pour un dépôt manuel). Il dit ce que le produit sait produire lui-même, pas
# la liste de ce qu'il accepte. Miroir de `packages/contracts/src/schemas/rag.ts`.
CATEGORY_ACCOUNT = "account_fact"
CATEGORY_SECTOR = "sector_insight"
CATEGORY_ANGLE = "winning_angle"
# Les six qu'exigent les chantiers des tomes 1 à 5.
CATEGORY_ACCESS = "access_fact"
CATEGORY_PARTNER = "partner_fact"
CATEGORY_TERRITORY = "territory_insight"
CATEGORY_OBJECTION = "objection_answer"
CATEGORY_PROOF = "client_proof"
CATEGORY_ESN_PROFILE = "esn_profile_fact"

RAG_CATEGORIES: tuple[str, ...] = (
    CATEGORY_ACCOUNT,
    CATEGORY_SECTOR,
    CATEGORY_ANGLE,
    CATEGORY_ACCESS,
    CATEGORY_PARTNER,
    CATEGORY_TERRITORY,
    CATEGORY_OBJECTION,
    CATEGORY_PROOF,
    CATEGORY_ESN_PROFILE,
)

# ─────────────────────────────────────────────────────────────────────────────
# LES CATÉGORIES DÉCLARÉES QUE RIEN NE PRODUIT — nommées, avec leur raison
# ─────────────────────────────────────────────────────────────────────────────
# Six des neuf catégories ci-dessus n'avaient AUCUN producteur : déclarées par
# les chantiers des tomes 1 à 5, jamais écrites, jamais lues. Une constante qui
# ne désigne rien finit par désigner ce que quelqu'un devine.
#
# `objection_answer` en a un depuis un lot précédent : le dossier PORTE déjà les
# objections anticipées, avec leur vraie signification et la réponse retenue —
# les jeter était le gâchis le plus net des six.
#
# `access_fact` en avait un aussi, et cette liste se contredisait elle-même : le
# bloc 4 de `_distill_docs` (plus bas dans ce fichier) l'écrit depuis M4, à
# partir de `commentOuvrirCompte` — la porte d'entrée que le §38 nomme mot pour
# mot « ce qu'on sait de l'accès à un compte ». La raison qui vivait ici
# n'était donc plus vraie : elle décrivait une source qui n'alimentait plus la
# catégorie. La garde ne l'a pas vue parce que son fixture ne portait aucun cas
# d'accès — `_produced_categories()` ne produisait jamais `access_fact`, donc
# `test_aucune_raison_ne_survit_a_son_producteur` ne pouvait jamais la trouver
# à la fois produite ET listée sans producteur.
#
# Les quatre qui restent sont ici, chacune avec ce qu'elle TIENDRAIT et pourquoi
# rien ne l'écrit aujourd'hui. Même discipline que `demo-coverage.ts` : produite,
# ou vide à dessein AVEC SA RAISON — jamais le troisième état, « déclarée, jamais
# produite, personne ne sait pourquoi ».
#
# ⚠️ On ne déplace JAMAIS une catégorie ici pour faire passer le test
# `test_rag_category_producers.py`. La raison doit dire d'où viendrait la donnée.
CATEGORIES_WITHOUT_PRODUCER: dict[str, str] = {
    CATEGORY_PARTNER: (
        "Tiendrait ce qu'on sait d'un PARTENAIRE de l'ESN — un sous-traitant, un éditeur, un co-traitant "
        "sur un lot. Le dossier d'analyse regarde le COMPTE PROSPECTÉ, pas l'écosystème de l'ESN qui "
        "prospecte : il porte les ESN concurrentes présentes chez la cible, ce qui est l'exact opposé. "
        "Recycler `competitors` en `partner_fact` inscrirait un concurrent comme partenaire, et un plan "
        "d'action irait s'appuyer dessus."
    ),
    CATEGORY_TERRITORY: (
        "Tiendrait un fait de MARCHÉ à l'échelle d'un territoire (un département, un bassin d'emploi) — "
        "densité d'ESN, tension sur un profil, dynamique de recrutement. Un dossier ne parle que d'UN "
        "compte : en tirer une conclusion territoriale serait généraliser depuis un point. La source "
        "juste existe déjà ailleurs, et elle est PARTAGÉE entre espaces (`territory_snapshots`), alors "
        "que ce magasin est scopé à un espace — deux portées qu'on ne mélange pas."
    ),
    CATEGORY_PROOF: (
        "Tiendrait une PREUVE client de l'ESN : une référence nommée, un cas chiffré, un livrable "
        "réutilisable. Elle n'appartient pas à un dossier de prospection — elle appartient à l'ESN, et "
        "elle arrive déjà dans le même magasin par l'autre porte, en origine `uploaded` (l'ESN dépose ses "
        "cas clients). Lui fabriquer un producteur `distilled` créerait un second chemin d'indexation "
        "pour la même donnée, ce que M6 a justement supprimé."
    ),
    CATEGORY_ESN_PROFILE: (
        "Tiendrait un fait sur l'ESN elle-même — ses offres, ses domaines, ses paliers. Cette donnée vit "
        "en base (`esn_profiles`), saisie par l'ESN et modifiable à tout moment : la distiller ici en "
        "figerait une copie datée qui contredirait la fiche le jour de la première modification. Une "
        "correction humaine gagne toujours ; en faire un document de connaissance la ferait perdre."
    ),
}

# Les deux origines d'un même magasin (M6). `distilled` = produit par une
# analyse ; `uploaded` = déposé par l'ESN. La distinction sert à DEUX choses et
# à rien d'autre : la purge ne touche jamais un document déposé par un humain,
# et l'écran peut dire d'où vient ce qu'il montre. Elle ne crée AUCUN second
# chemin d'indexation — c'était tout l'intérêt de M6.
ORIGIN_DISTILLED = "distilled"
ORIGIN_UPLOADED = "uploaded"

# Keep each distilled doc tight — it is a retrieval snippet, not an archive.
_MAX_DOC_CHARS = 2000


def is_enabled() -> bool:
    """The RAG-knowledge flywheel is always-on. Kept as a seam so tests can
    monkeypatch it to ``False`` to assert the clean no-op path; the real
    off-switch is having no user_id / no query / an empty store."""
    return True


# ── Distillation ──────────────────────────────────────────────────────────────


def _clean(text: Any) -> str:
    """Collapse whitespace to a single-line string (``""`` for None/empty)."""
    return " ".join(str(text or "").split())


def _string_list(value: Any, *, item_key: str | None = None) -> list[str]:
    """Pull a list of non-empty strings from a list of dicts/strings.

    ``item_key`` names the dict field to read; falls back to ``title``/``name``.
    """
    out: list[str] = []
    for item in value or []:
        if isinstance(item, dict):
            raw = item.get(item_key) if item_key else (item.get("title") or item.get("name"))
            s = _clean(raw)
        else:
            s = _clean(item)
        if s:
            out.append(s)
    return out


def _access_bits(research: dict[str, Any]) -> list[str]:
    """Ce que l'analyse dit de l'ENTRÉE chez ce compte, en morceaux propres.

    `comment_ouvrir_compte` arrive sous DEUX formes dans la nature — le contrat
    partagé l'écrit en union (`packages/contracts/src/schemas/analysis/strategy.ts`) :
    une narration libre, ou un objet `strategy` + `entry_points`. N'en lire
    qu'une laisserait la catégorie vide chez la moitié des comptes.

    Rend `[]` quand il n'y a rien à dire — une forme absente, vide ou
    inattendue. On n'écrit pas une fiche d'accès qui ne dirait rien : elle
    remonterait dans les recherches et occuperait le budget d'un document qui,
    lui, aurait quelque chose à apprendre.
    """
    raw = research.get("commentOuvrirCompte")
    if raw is None:
        raw = research.get("comment_ouvrir_compte")

    if isinstance(raw, str):
        narrative = _clean(raw)
        return [narrative] if narrative else []
    if isinstance(raw, dict):
        bits: list[str] = []
        strategy = _clean(raw.get("strategy"))
        if strategy:
            bits.append(strategy)
        entries = _string_list(raw.get("entry_points"))[:3]
        if entries:
            bits.append("Points d'entrée : " + ", ".join(entries))
        return bits
    # Ni chaîne ni objet : une forme qu'on ne sait pas lire ne se devine pas.
    return []


def _distill_docs(company_name: str, research: dict[str, Any], plan: dict[str, Any]) -> list[dict[str, str]]:
    """Turn a completed analysis into a few tight, retrievable knowledge docs.

    DETERMINISTIC + NO FAKE — every doc is built only from fields actually present
    in ``research``/``plan``. Each doc = ``{"title", "content", "category"}``.
    """
    research = research or {}
    plan = plan or {}
    company = _clean(company_name) or _clean(research.get("companyName")) or "Compte"
    sector = _clean(research.get("sector"))
    docs: list[dict[str, str]] = []

    # 1) Account fact sheet — the validated firmographics (source-of-truth fields).
    fact_bits: list[str] = []
    for label, key in (
        ("Secteur", "sector"),
        ("Activité", "businessDescription"),
        ("Effectif", "employees"),
        ("CA", "revenue"),
        ("Siège", "headquarters"),
    ):
        val = _clean(research.get(key))
        if val:
            fact_bits.append(f"{label} : {val}")
    if fact_bits:
        docs.append(
            {
                "title": f"{company} — fiche compte",
                "content": f"{company}. " + " · ".join(fact_bits),
                "category": CATEGORY_ACCOUNT,
            }
        )

    # 2) Sector insight — the pains / IT challenges tied to this sector.
    insight_bits = _string_list(research.get("pains"), item_key="pain")[:5] + _string_list(
        research.get("itChallenges")
    )[:5]
    if insight_bits and sector:
        docs.append(
            {
                "title": f"{sector} — enjeux & douleurs IT",
                "content": f"Secteur {sector} (observé chez {company}). Enjeux : " + " ; ".join(insight_bits),
                "category": CATEGORY_SECTOR,
            }
        )

    # 3) Winning angles — the strategy angles that scored for this account.
    for angle in (research.get("angles") or [])[:3]:
        if not isinstance(angle, dict):
            continue
        title = _clean(angle.get("title"))
        if not title:
            continue
        rationale = _clean(angle.get("rationale") or angle.get("pain"))
        body = f"Angle gagnant ({sector or 'tous secteurs'}) : {title}."
        if rationale:
            body += f" {rationale}"
        docs.append(
            {
                "title": f"{company} — angle : {title}"[:120],
                "content": body,
                "category": CATEGORY_ANGLE,
            }
        )

    # 4) Access fact (M4) — ce qu'on sait de l'ENTRÉE chez ce compte.
    #
    # Le §38 nomme `access_fact` « ce qu'on sait de l'accès à un compte ». C'est
    # mot pour mot `commentOuvrirCompte`, que l'analyse produit déjà, que
    # l'écran affiche déjà, et que ce distillateur jetait : la catégorie était
    # déclarée des deux côtés du fil et **aucun chemin ne l'écrivait**.
    #
    # Elle est séparée de l'angle gagnant à dessein : un angle dit POURQUOI on
    # est légitime, un fait d'accès dit PAR OÙ on entre. Les confondre rend la
    # question « par où passer chez ce compte ? » impossible à poser au magasin.
    access = _access_bits(research)
    if access:
        docs.append(
            {
                "title": f"{company} — par où entrer",
                "content": f"Accès à {company} ({sector or 'secteur n/c'}) : " + " · ".join(access),
                "category": CATEGORY_ACCESS,
            }
        )

    # 5) Plan strategy headline — the account strategy that was retained.
    strategy = _clean((plan.get("actionPlan") or {}).get("strategy"))
    if strategy:
        docs.append(
            {
                "title": f"{company} — stratégie de conquête",
                "content": f"{company} ({sector or 'secteur n/c'}) : {strategy}",
                "category": CATEGORY_ANGLE,
            }
        )

    # 5) Objections anticipées — l'objection, ce qu'elle veut VRAIMENT dire, et la
    #    réponse retenue pour ce compte.
    #
    #    C'est la seule des six catégories orphelines dont la donnée était déjà
    #    là : le dossier porte `objections` depuis toujours, avec ses quatre
    #    champs travaillés, et la distillation les jetait. Une objection est
    #    précisément ce qu'on veut retrouver au dossier SUIVANT — elle se répète
    #    d'un compte à l'autre dans un même secteur, et c'est ce qui fait qu'un
    #    commercial ne la redécouvre pas au téléphone.
    #
    #    Sans intitulé, on ne produit RIEN : un document « objection : » vide
    #    remonterait dans les recherches sans rien apprendre à personne.
    for objection in (research.get("objections") or [])[:5]:
        if not isinstance(objection, dict):
            continue
        label = _clean(objection.get("objection"))
        if not label:
            continue
        # `Objection` ne porte pas d'alias aujourd'hui — ses clés restent en
        # snake_case même sous `model_dump(by_alias=True)`. On lit les deux
        # formes pour qu'un alias posé demain ne rende pas ce bloc muet en
        # silence : c'est le défaut « colonne lue jamais écrite », à l'envers.
        concern = _clean(objection.get("real_concern") or objection.get("realConcern"))
        answer = _clean(objection.get("response"))
        mirror = _clean(objection.get("mirror_question") or objection.get("mirrorQuestion"))
        body = f"Objection rencontrée chez {company} ({sector or 'secteur n/c'}) : « {label} »."
        if concern:
            body += f" Ce qu'elle veut vraiment dire : {concern}."
        if answer:
            body += f" Réponse retenue : {answer}"
        if mirror:
            body += f" Question miroir : {mirror}"
        docs.append(
            {
                "title": f"{company} — objection : {label}"[:120],
                "content": body,
                "category": CATEGORY_OBJECTION,
            }
        )

    # Tighten + drop trivially-short docs.
    out: list[dict[str, str]] = []
    for d in docs:
        content = _clean(d["content"])[:_MAX_DOC_CHARS]
        if len(content) < 12:
            continue
        out.append({**d, "content": content})
    return out


async def populate_from_analysis(
    company_name: str,
    *,
    research: dict[str, Any] | None,
    plan: dict[str, Any] | None,
    user_id: str,
    workspace_id: str | None = None,
) -> int:
    """Distil a completed analysis into knowledge docs and upsert them into the
    WORKSPACE's RAG store — the flywheel that feeds future retrievals, for the
    whole team rather than for whoever happened to launch the run.

    Best-effort: a no-op when there is no user / nothing to distil, and any
    failure (distillation OR a per-doc upsert) is swallowed — populating the
    knowledge base must NEVER fail the analysis run. Returns the number of docs
    written (0 when there is nothing to write)."""
    if not is_enabled() or not user_id or not _clean(company_name):
        return 0
    try:
        docs = _distill_docs(company_name, research or {}, plan or {})
    except Exception as exc:  # noqa: BLE001 — distillation must never break the run
        logger.warning("RAG-knowledge distillation failed for %r: %s", company_name, exc)
        return 0

    written = 0
    for d in docs:
        try:
            await rag_service.upsert(
                d["title"], d["content"], d["category"], user_id, workspace_id=workspace_id
            )
            written += 1
        except Exception as exc:  # noqa: BLE001 — per-doc best-effort, keep going
            logger.warning("RAG-knowledge upsert skipped (%s): %s", d.get("title"), exc)
    if written:
        logger.info("RAG-knowledge populated %d docs from %r (user=%s)", written, company_name, user_id)
    return written


# ── Retrieval + rerank ────────────────────────────────────────────────────────


def _candidate_k() -> int:
    """How many docs to pull BEFORE reranking (wider than what we inject)."""
    return max(1, int(os.environ.get("RAG_KNOWLEDGE_CANDIDATES", "12")))


def _inject_k() -> int:
    """How many reranked docs survive into the prompt.

    #3750.3 — LE budget du bloc (`rag_service.context_max_chunks`, 6 morceaux
    par défaut, `RAG_KNOWLEDGE_TOP_K` pour le régler) : un seul endroit, jamais
    un défaut recopié ici qui contredirait celui du formateur."""
    return rag_service.context_max_chunks()


async def retrieve_reranked_context(
    query_text: str,
    user_id: str,
    *,
    sector: str | None = None,
    workspace_id: str | None = None,
    account_id: str | None = None,
) -> str:
    """Retrieve the WORKSPACE's most relevant knowledge docs for this account/sector,
    rerank them, and return a compact prompt-injection block for the top few.

    Fully degradable (``""`` with no user / empty query / empty store, or on any
    error — a retrieval failure must never break a phase). Respects the configured
    FT/vector backend via ``rag_service.query``."""
    if not is_enabled() or not user_id or not _clean(query_text):
        return ""
    try:
        # #2779 — le compte de la requête : seul il rend visibles ses documents `account`.
        docs = await rag_service.query(query_text, user_id, _candidate_k(), workspace_id, account_id=account_id)
    except Exception as exc:  # noqa: BLE001 — retrieval must never break the caller
        logger.warning("RAG-knowledge retrieval skipped: %s", exc)
        return ""
    if not docs:
        return ""
    try:
        ranked = await rerank(query_text, docs, sector=sector)
    except Exception as exc:  # noqa: BLE001 — rerank is best-effort; keep retrieval order
        logger.warning("RAG-knowledge rerank failed, using retrieval order: %s", exc)
        ranked = docs

    block, _sources, _docs = await _inject(ranked, feature="analysis")
    return block


# ── #3887 (lot V13, recette prod 08/10) — nommer un compte EN TEXTE LIBRE ───
#
# En chat « espace entier » (aucun fil ancré), `req.account_id` reste `null`
# tout le tour : rien ne rapprochait jamais une question qui NOMME un compte
# (« qu'est-ce qu'on sait déjà de Sanofi ») d'un `account_id`, alors que
# `search_market_memory` a ce mécanisme depuis #3225 (`company_name` →
# compte, `chat_tools.py:_accounts_named_like` + `need_compiler.resolve_account`).
# C'est ce qui expliquait l'écart mesuré en recette : nommer l'intention
# interne (« mémoire interne data forge ») faisait choisir au modèle un autre
# chemin qui, lui, retrouvait de la matière — une question ordinaire sur le
# même compte n'en retrouvait AUCUNE.
#
# Repose sur les MÊMES résolveurs que `search_market_memory`, jamais un second
# calcul (GA-26). Candidats : les suites de mots capitalisés du message
# (« Sanofi », « La Poste »), la plus longue d'abord ; une suite plus longue
# que le nom réel (« La Poste Mobile ») retombe sur ses préfixes. Ambigu ou
# introuvable ⇒ ``None`` — on ne DEVINE jamais un rattachement de compte sur
# un nom ambigu (doctrine, #3887.4).
_NAME_RUN_MAX = 3
_NAME_RUN_WORDS_MAX = 4
_LEADING_TRAILING_PUNCT = "«»“”‘’\"'.,;:!?()"


def _capitalized_runs(message: str) -> list[list[str]]:
    """Les suites de mots capitalisés du message, dans l'ordre d'apparition —
    les candidats-noms d'une entreprise nommée en texte libre. Bornées
    (`_NAME_RUN_MAX` suites, `_NAME_RUN_WORDS_MAX` mots chacune) : un message
    qui ENCHAÎNE les mots capitalisés ne doit pas multiplier les allers-retours
    base de données."""
    runs: list[list[str]] = []
    current: list[str] = []
    for raw_word in message.split():
        word = raw_word.strip(_LEADING_TRAILING_PUNCT)
        if word and word[0].isupper() and len(current) < _NAME_RUN_WORDS_MAX:
            current.append(word)
            continue
        if current:
            runs.append(current)
            if len(runs) >= _NAME_RUN_MAX:
                return runs
        current = []
    if current:
        runs.append(current)
    return runs


async def resolve_message_account_id(message: str, user_id: str) -> str | None:
    """Le compte du portefeuille NOMMÉ dans ce message en texte libre, ou
    ``None`` — jamais deviné sur un nom ambigu, jamais une exception (une
    panne de rapprochement doit rendre le chat NON ANCRÉ d'avant, pas le
    casser)."""
    if not _clean(message) or not user_id:
        return None
    from app.services.chat_tools import _accounts_named_like
    from app.services.compilers.need_compiler import resolve_account

    for run in _capitalized_runs(message):
        for length in range(len(run), 0, -1):
            phrase = " ".join(run[:length])
            try:
                named = await _accounts_named_like(phrase, user_id)
            except Exception as exc:  # noqa: BLE001 — rapprocher est un bonus, jamais un bloqueur
                logger.warning("Rapprochement de compte par nom (message libre) indisponible: %s", exc)
                continue
            if not named:
                continue
            resolution = resolve_account(phrase, named)
            if resolution["account_id"]:
                return str(resolution["account_id"])
    return None


async def retrieve_reranked_citations(
    query_text: str,
    user_id: str,
    *,
    sector: str | None = None,
    workspace_id: str | None = None,
    feature: str = "chat",
    account_id: str | None = None,
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    """Le bloc d'injection, ses sources ET les documents injectés (tome 7 §38, M5).

    Même chemin que {@link retrieve_reranked_context} — une seule récupération,
    un seul reclassement. Ce qui change est que l'appelant reçoit de quoi CITER :
    une réponse construite sur des documents doit pouvoir les nommer, et
    l'interface les rendre cliquables.

    ⚠️ Le troisième élément est les DOCUMENTS eux-mêmes, dans l'ordre où ils ont
    été injectés. Les sources ne portent ni le contenu ni la similarité, et
    l'objet de transparence du copilote a besoin des deux : le lui reconstruire
    depuis les sources lui ferait annoncer « aucun document » alors que le RAG en
    a trouvé — le mensonge exact que cet objet existe pour empêcher.
    """
    if not is_enabled() or not user_id or not _clean(query_text):
        return "", [], []
    try:
        # #2779 — le compte de la requête : seul il rend visibles ses documents `account`.
        docs = await rag_service.query(query_text, user_id, _candidate_k(), workspace_id, account_id=account_id)
    except Exception as exc:  # noqa: BLE001 — retrieval must never break the caller
        logger.warning("RAG-knowledge retrieval skipped: %s", exc)
        return "", [], []
    if not docs:
        return "", [], []
    try:
        ranked = await rerank(query_text, docs, sector=sector)
    except Exception as exc:  # noqa: BLE001 — rerank is best-effort
        logger.warning("RAG-knowledge rerank failed, using retrieval order: %s", exc)
        ranked = docs
    return await _inject(ranked, feature=feature)


async def _inject(
    ranked: list[dict[str, Any]], *, feature: str
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    """Le bloc, ses sources, et la trace d'usage — en un seul endroit.

    Stamp a descending synthetic ``similarity`` so the formatter's internal sort
    PRESERVES the rerank order (it sorts by ``similarity`` desc).

    La trace (M2) est posée ICI et nulle part ailleurs : c'est le seul point du
    code où l'on sait qu'un document a **atteint le prompt**. La poser à la
    récupération compterait tout ce que la recherche remonte, et la purge de M3
    n'effacerait alors plus jamais rien.

    #3881 bis (V13, recette prod 08/10) — ÉCARTÉ AVANT la coupe au budget
    (``_inject_k()``), pas après : un document nommé d'après un codename interne
    ne doit jamais consommer l'une des quelques places injectées, ni être
    compté pour choisir quels autres documents passent. `ingestion_guard`
    ferme l'INGESTION de ce nom ; ceci ferme la SORTIE pour ce qui était déjà
    en base avant ce correctif — une purge manuelle reste à faire, mais le
    client ne voit plus la citation en l'attendant.
    """
    from app.services.ingestion_guard import is_internal_codename

    ranked = [d for d in ranked if not is_internal_codename(str(d.get("title") or ""))]
    top = ranked[: _inject_k()]
    n = len(top)
    ordered = [{**d, "similarity": float(n - i)} for i, d in enumerate(top) if isinstance(d, dict)]
    block, sources = rag_service.format_knowledge_context_with_sources(ordered)
    if sources:
        await rag_service.mark_documents_used([s["docId"] for s in sources], feature)
    return block, sources, ordered


async def rerank(query_text: str, docs: list[dict[str, Any]], *, sector: str | None = None) -> list[dict[str, Any]]:
    """Reorder retrieved docs by relevance. Cascade (mission spec):

    1. **cross-encoder** — if a local model is configured (``RAG_RERANK_CROSS_ENCODER``
       names it AND ``sentence-transformers`` is installed);
    2. else **LLM-lite** — a cheap Haiku pass (always-on, routed through the gateway);
    3. else **deterministic** — score = recency + query/sector token overlap.

    Every optional path degrades to the deterministic score on error/absence, and
    the deterministic path needs NO key — so ``rerank`` always returns a sensible
    order and no-ops cleanly without any model/key configured."""
    docs = [d for d in (docs or []) if isinstance(d, dict)]
    if len(docs) <= 1:
        return docs
    ce = _cross_encoder_rerank(query_text, docs)
    if ce is not None:
        return apply_recency_decay(ce)
    if _llm_rerank_enabled():
        llm = await _llm_rerank(query_text, docs)
        if llm is not None:
            return apply_recency_decay(llm)
    # Le chemin déterministe pèse DÉJÀ la fraîcheur (0,3) : la repeser ici la
    # compterait deux fois.
    return _deterministic_rerank(query_text, docs, sector)


#: Le poids de la fraîcheur appliqué APRÈS un classement par pertinence.
#:
#: Volontairement faible : la pertinence reste le critère, la fraîcheur départage.
#: À 0,25, un document d'il y a deux ans passe derrière un document d'hier de
#: pertinence comparable, mais ne passe jamais devant un document nettement plus
#: pertinent.
RECENCY_TIEBREAK_WEIGHT = 0.25

#: L'écart de pertinence entre deux rangs voisins. Calibré pour que la
#: fraîcheur puisse renverser des VOISINS et jamais des documents éloignés.
RANK_DECAY = 0.3


def apply_recency_decay(docs: list[dict[str, Any]], weight: float = RECENCY_TIEBREAK_WEIGHT) -> list[dict[str, Any]]:
    """Repondère un classement de pertinence par la FRAÎCHEUR.

    Le manque n°1 de l'audit du tome 7 : « aucun decay — un angle gagnant de
    2024 remonte à égalité avec celui d'hier ». Les deux chemins de reclassement
    qui coûtent quelque chose (le cross-encoder et le modèle) ne regardent que
    le texte ; seul le repli déterministe, celui qui ne coûte rien, regardait la
    date. Le résultat était que **payer un reclassement faisait perdre la
    fraîcheur**.

    Le rang d'origine est conservé comme signal principal : on ne réordonne pas,
    on départage. Un document sans date lisible garde sa place — l'absence de
    date n'est pas une preuve d'ancienneté.
    """
    if len(docs) <= 1:
        return docs
    ranked = list(enumerate(docs))

    def key(item: tuple[int, dict[str, Any]]) -> float:
        index, doc = item
        # La pertinence décroît par RANG et non sur la longueur de la liste :
        # normaliser par la taille rendrait l'écart entre deux voisins dépendant
        # du nombre de résultats, si bien que le même couple de documents se
        # départagerait différemment selon qu'on en a rendu deux ou vingt.
        relevance = 1.0 / (1.0 + RANK_DECAY * index)
        return relevance + weight * _recency_score(doc.get("created_at"))

    return [doc for _index, doc in sorted(ranked, key=key, reverse=True)]


_TOKEN_RE = re.compile(r"[a-zà-ÿ0-9]{3,}", re.IGNORECASE)


def _tokens(text: str) -> set[str]:
    return {t.lower() for t in _TOKEN_RE.findall(text or "")}


def _recency_score(created_at: Any) -> float:
    """0..1, newer = higher (exponential decay, ~90-day scale). Unknown/malformed
    date → 0.5 (neutral — a doc isn't penalised for a missing timestamp)."""
    if not created_at:
        return 0.5
    try:
        dt = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        age_days = max(0.0, (datetime.now(UTC) - dt).total_seconds() / 86400.0)
    except (ValueError, TypeError):
        return 0.5
    return math.exp(-age_days / 90.0)


def _deterministic_rerank(query_text: str, docs: list[dict[str, Any]], sector: str | None) -> list[dict[str, Any]]:
    """Reclassement sans clé : recouvrement de mots entre la requête et le
    document. Stable (le tri de Python l'est), donc les ex æquo gardent l'ordre
    de récupération.

    ─────────────────────────────────────────────────────────────────────────
    LA FRAÎCHEUR EST ICI, ET C'EST LA FORMULE DU §38
    ─────────────────────────────────────────────────────────────────────────
    Cette fonction a pesé `0,7 × recouvrement + 0,3 × fraîcheur`, puis plus rien
    du tout. Le retrait était motivé ainsi : « depuis que M1 pondère la
    fraîcheur dans le score de récupération, elle s'applique trois fois — au
    score, ici, puis dans le départage `apply_recency_decay` ». Deux des trois
    ne se produisaient PAS sur ce chemin :

    - `apply_score_decay` ne pondère qu'un document portant une `similarity`,
      et **seul le vecteur en produit**. Sans `EMBEDDING_API_KEY`, la
      récupération est plein texte : elle ne rend aucune `similarity`, donc le
      decay du §38 y est un no-op strict ;
    - `apply_recency_decay` n'est appliqué qu'aux sorties du cross-encoder et
      du modèle (voir {@link rerank}), jamais à celle-ci.

    Résultat mesuré sur le chemin par défaut — pas de clé d'embedding, pas de
    cross-encoder, reclassement déterministe — : la fraîcheur était comptée
    **zéro fois**, et le symptôme que le §38 nomme revenait mot pour mot, « un
    angle gagnant de 2024 remonte à égalité avec celui d'hier ».

    Ce qui est rétabli n'est donc pas l'ancien terme ad hoc à 0,3, mais la
    formule que le §38 écrit — `score × (1 − min(0,5 ; âge/730))` — appliquée au
    seul score que cet étage produise, le recouvrement lexical. Elle vit à un
    seul endroit ({@link rag_service.decayed_score_of}) et se comporte ici comme
    ailleurs : un document de deux ans vaut la moitié d'un document d'aujourd'hui
    À PERTINENCE ÉGALE, il ne disparaît pas et il ne passe jamais devant un
    document nettement plus pertinent. Un document sans date lisible n'est pas
    pénalisé — l'absence de date n'est pas une preuve d'ancienneté.

    Le jeu de 50 requêtes de référence chiffre l'étage (`tests/test_rag_eval.py`,
    qui imprime les nombres à chaque exécution).
    """
    q = _tokens(query_text) | _tokens(sector or "")

    def score(d: dict[str, Any]) -> float:
        doc_tokens = _tokens(f"{d.get('title', '')} {d.get('content', '')}")
        overlap = len(q & doc_tokens) / (len(q) or 1)
        return rag_service.decayed_score_of(overlap, d.get("created_at"))

    return sorted(docs, key=score, reverse=True)


# Cross-encoder models are expensive to load — cache per model name.
_CE_CACHE: dict[str, Any] = {}


def _cross_encoder_rerank(query_text: str, docs: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    """Local cross-encoder rerank when ``RAG_RERANK_CROSS_ENCODER`` names a model
    AND ``sentence-transformers`` is installed. Returns ``None`` when unavailable
    (→ caller falls through) so the feature no-ops cleanly without the optional dep."""
    model_name = os.environ.get("RAG_RERANK_CROSS_ENCODER", "").strip()
    if not model_name:
        return None
    try:
        from sentence_transformers import CrossEncoder  # type: ignore
    except Exception:  # noqa: BLE001 — optional dep absent → fall through to LLM/deterministic
        return None
    try:
        model = _CE_CACHE.get(model_name)
        if model is None:
            model = CrossEncoder(model_name)
            _CE_CACHE[model_name] = model
        pairs = [(query_text, f"{d.get('title', '')} {d.get('content', '')}") for d in docs]
        scores = model.predict(pairs)
        return [d for _, d in sorted(zip(scores, docs, strict=False), key=lambda x: x[0], reverse=True)]
    except Exception as exc:  # noqa: BLE001 — any failure → fall through
        logger.warning("Cross-encoder rerank failed, falling through: %s", exc)
        return None


def _llm_rerank_enabled() -> bool:
    """The LLM-lite rerank pass is ON by default (subordinate to the always-on
    flywheel, and only reached when there are 2+ retrieved docs and no local
    cross-encoder) — until an operator sets ``RAG_LLM_RERANK_DISABLED`` (GA-304).

    ⚠️ Sans la variable, ce chemin reste BYTE-IDENTIQUE à avant qu'elle existe :
    ``kill_switch.disabled()`` rend ``False`` sur une variable absente, donc
    cette fonction continue de rendre ``True`` — la doctrine du dépôt pour
    toute option (« sans clé = no-op strict »). Le DÉFAUT n'a pas changé : le
    reclassement LLM reste actif tant que personne ne l'éteint — un choix de
    QUALITÉ ne se bascule pas sur un raisonnement de coût seul (« un
    changement de modèle est un changement de qualité, il passe par le jeu de
    référence figé »). Poser ``RAG_LLM_RERANK_DISABLED=true`` fait rejoindre à
    la cascade le repli déterministe GRATUIT (``_deterministic_rerank``) : une
    décision d'exploitation, réservée à un opérateur.

    Kept as a seam so tests can also monkeypatch this function directly to
    ``False`` to exercise the key-free deterministic path in isolation. Any
    failure inside ``_llm_rerank`` still degrades to the deterministic score.
    """
    return not kill_switch.disabled(kill_switch.RAG_LLM_RERANK_ENV_VAR)


async def _llm_rerank(query_text: str, docs: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    """LLM-lite rerank: ask a cheap model to order the candidates by relevance,
    returning indices. Routed through ``call_claude`` (which always dispatches
    via the LLM gateway). Returns ``None`` on any failure → caller falls back
    to the deterministic score. Never fabricates: only KNOWN indices are honoured,
    and any doc the model dropped is appended in its original order (no data loss)."""
    from app.services.claude_service import CLAUDE_HAIKU_MODEL, call_claude

    listing = "\n".join(
        f"[{i}] {_clean(d.get('title'))} — {_clean(d.get('content'))[:200]}" for i, d in enumerate(docs)
    )
    system = (
        "Tu classes des documents de connaissance par pertinence pour une requête commerciale ESN. "
        "Réponds UNIQUEMENT en JSON."
    )
    user = (
        f"Requête : {query_text}\n\nDocuments :\n{listing}\n\n"
        'Renvoie les indices du PLUS au MOINS pertinent : {"order":[<int>, ...]}. '
        "N'invente aucun indice."
    )
    try:
        out, _usage = await call_claude(
            system,
            user,
            response_model=dict,
            max_tokens=200,
            model=CLAUDE_HAIKU_MODEL,
            prompt_name="rag_knowledge_rerank",
        )
    except Exception as exc:  # noqa: BLE001 — LLM rerank is best-effort
        logger.warning("LLM rerank failed, falling back: %s", exc)
        return None

    order = out.get("order") if isinstance(out, dict) else None
    if not isinstance(order, list):
        return None
    seen: set[int] = set()
    ranked: list[dict[str, Any]] = []
    for idx in order:
        if isinstance(idx, int) and 0 <= idx < len(docs) and idx not in seen:
            seen.add(idx)
            ranked.append(docs[idx])
    for i, d in enumerate(docs):
        if i not in seen:
            ranked.append(d)
    return ranked


# ── Savoir métier interne (Drive Bellum) — injection À LA REQUÊTE (#3586) ────
#
# Le Drive interne vit dans le corpus PARTAGÉ `dataforge_rag_chunks`
# (`type_chunk = DRIVE_INTERNE`), commun à tous les espaces : son bloc ne dépend
# NI de `user_id` NI de `is_enabled()` (le RAG des documents de l'utilisateur).
# Il est rendu à part, sous son propre titre — jamais sous « documents de
# l'utilisateur », jamais présenté comme donnée du compte prospecté — et ne passe
# ni par le reclassement ni par `mark_documents_used` (schéma différent).
# Vide ⇒ chaîne vide ⇒ prompt byte-identique.

DRIVE_CHUNK_TYPE = "DRIVE_INTERNE"
DRIVE_BLOCK_HEADER = "===== SAVOIR MÉTIER BELLUM (interne — méthode et savoir-faire de l'équipe, PAS une donnée du compte prospecté) ====="
_DRIVE_TOP_K = 6
_DRIVE_BLOCK_MAX_CHARS = 5400  # ~1 500 tokens
_DRIVE_SNIPPET_MAX_CHARS = 900
_DRIVE_CACHE_TTL_S = 120.0
_DRIVE_CACHE_MAX = 64
# (requête, compte) → (horodatage, bloc) : un seul embedding par passage même si
# plusieurs points d'un même tour (analyse, repli, Découvrir) l'appellent.
_drive_cache: dict[tuple[str, str], tuple[float, str]] = {}


def clear_drive_cache() -> None:
    """Vide la mémoïsation (fixtures de test, rattrapage d'un correctif)."""
    _drive_cache.clear()


def format_drive_block(chunks: list[dict[str, Any]]) -> str:
    """Rend les chunks Drive en un bloc borné, chacun portant son fichier source."""
    from app.prompts.fencing import fence

    lines: list[str] = []
    budget = _DRIVE_BLOCK_MAX_CHARS
    seen: set[str] = set()
    for c in chunks:
        if not isinstance(c, dict):
            continue
        text = " ".join(str(c.get("texte") or "").split())
        if not text:
            continue
        title = " ".join(str(c.get("titre") or "").split()) or "Drive interne"
        key = f"{title.lower()}|{text[:120].lower()}"
        if key in seen:
            continue
        seen.add(key)
        if len(text) > _DRIVE_SNIPPET_MAX_CHARS:
            text = text[:_DRIVE_SNIPPET_MAX_CHARS].rsplit(" ", 1)[0].rstrip() + "…"
        line = f"- [Source : {title}] {text}"
        if len(line) > budget:
            break  # tronqué proprement : on ne coupe jamais une ligne en deux
        lines.append(line)
        budget -= len(line) + 1
    if not lines:
        return ""
    return f"{DRIVE_BLOCK_HEADER}\n{fence('internal_knowledge', chr(10).join(lines))}"


def _drop_identical_texts(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """#3586 — deux fichiers Drive identiques (copie, export) donnent des chunks au texte identique : on ne
    déduplique PAS les fichiers (chacun reste indexé), on n'injecte qu'une fois le même texte, sous son
    premier (meilleur) classement."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for c in chunks:
        text = " ".join(str(c.get("texte") or "").split()).lower()
        if text and text in seen:
            continue
        seen.add(text)
        out.append(c)
    return out


async def retrieve_drive_context(query_text: str, *, account_id: str | None = None) -> str:
    """Le bloc « Savoir métier Bellum (interne) » pertinent pour CETTE requête.

    ``""`` sans clé d'embedding, requête vide, corpus sans Drive ou panne : jamais
    une erreur (un échec de récupération ne casse jamais une phase)."""
    import time

    query = _clean(query_text)
    if not query:
        return ""
    key = (query, account_id or "")
    now = time.monotonic()
    hit = _drive_cache.get(key)
    if hit is not None and now - hit[0] < _DRIVE_CACHE_TTL_S:
        return hit[1]
    try:
        from app.services.dataforge_rag_chunks import search_dataforge_rag_chunks

        # #3586 W3 — le filtre de type est CÔTÉ SQL : plus de sur-récupération.
        rows = await search_dataforge_rag_chunks(
            query, account_id=account_id, top_k=_DRIVE_TOP_K, type_chunk=DRIVE_CHUNK_TYPE
        )
        block = format_drive_block(_drop_identical_texts([r for r in rows if isinstance(r, dict)]))
    except Exception as exc:  # noqa: BLE001 — jamais bloquant
        logger.warning("Savoir Drive interne ignoré: %s", exc)
        return ""
    if len(_drive_cache) >= _DRIVE_CACHE_MAX:
        _drive_cache.pop(next(iter(_drive_cache)))
    _drive_cache[key] = (now, block)
    return block


def append_drive_block(context: str, drive_block: str) -> str:
    """Ajoute le bloc Drive à un contexte ; ``drive_block`` vide ⇒ contexte inchangé."""
    if not drive_block:
        return context
    return f"{context}\n\n{drive_block}" if (context or "").strip() else drive_block
