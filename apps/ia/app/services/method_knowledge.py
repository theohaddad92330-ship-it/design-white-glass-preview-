"""Built-in sales method exposed as CITABLE chunks (Annexe méthodo p29, cluster E
« RAG → chunks cités » ; plan agent_docs/methodo-sales-esn-plan.md, Phase 5).

The problem this closes: `app/knowledge/` already holds the whole ESN method —
the objection library, the sector playbooks, the canonical business-rule registry
— but that knowledge lives as PIPELINE CONFIG. It is injected into the analysis
prompts and never into the copilote's retrieval path, so the chatbot advises
without being able to name the rule that justifies its advice ("pourquoi ce
score ?", "que répondre à ‘on a déjà nos partenaires’ ?").

This module turns that same config into retrieval chunks shaped EXACTLY like a
RAG document (`title` / `content` / `category` / `similarity`), so they flow
through the existing formatting + transparency plumbing untouched and get CITED
by title, next to the user's own documents.

Design constraints:

* **Deterministic, no I/O, no LLM, no key** — pure keyword overlap over an
  in-process corpus built from the same JSON/registry the pipeline already reads.
  Nothing is written to `rag_documents`: the method is versioned in git, not
  duplicated per workspace (no migration, no drift, no per-tenant copy to purge).
* **Nothing invented** — every chunk is a verbatim rendering of a curated entry;
  a business rule always carries its own `source` reference.
* **Silent by default** — an empty/irrelevant query returns `[]`, so the caller's
  prompt is byte-identical to what it was before this module existed.
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from typing import Any

from app.services.method_synonyms import synonym_tags

CATEGORY_METHOD = "methode_bellum"

# Retrieval knobs. Deliberately tight: the method is a CITATION, not the answer —
# it must not crowd out the user's own documents in the chat context budget.
_TOP_K = 3
# Minimum overlap score for a chunk to be considered relevant at all. A single
# weak content hit (score 1) is noise; a title hit (3) or two content hits (2)
# means the user really is asking about that rule.
_MIN_SCORE = 2
_MAX_CHARS = 1500
_SNIPPET_CHARS = 380

_TOKEN_RE = re.compile(r"[a-z0-9]{4,}")

# Mots vides FR/EN : sans ce filtre, « comment » ou « client » ferait matcher la
# moitié du corpus et le bloc méthode deviendrait du bruit permanent.
_STOPWORDS = frozenset({
    "alors", "aussi", "autre", "avant", "avec", "avoir", "bien", "cela", "cette",
    "chez", "comme", "comment", "dans", "depuis", "deux", "dire", "donc", "dont",
    "elle", "elles", "encore", "entre", "etre", "faire", "fait", "faut", "leur",
    "leurs", "mais", "meme", "moins", "notre", "nous", "plus", "pour", "pourquoi",
    "quand", "quel", "quelle", "quelles", "quels", "sans", "sont", "sous", "suis",
    "tous", "tout", "toute", "toutes", "tres", "vers", "votre", "vous",
    "about", "after", "also", "because", "been", "before", "being", "does",
    "doing", "from", "have", "here", "into", "just", "like", "more", "most",
    "much", "need", "only", "over", "some", "than", "that", "their", "them",
    "then", "there", "these", "they", "this", "those", "what", "when", "where",
    "which", "while", "will", "with", "would", "your",
})


def _fold(text: Any) -> str:
    """Lowercase + strip accents so « décision » et « decision » matchent."""
    raw = str(text or "").lower()
    return "".join(c for c in unicodedata.normalize("NFKD", raw) if not unicodedata.combining(c))


def _tokens(text: Any) -> set[str]:
    folded = _fold(text)
    # #3857.2 — les synonymes/abréviations métier (BI, BA, DSI, RSSI…) ajoutent l'étiquette de leur
    # groupe, côté requête ET côté chunk : « business intelligence » retrouve « BI » et l'inverse.
    return {t for t in _TOKEN_RE.findall(folded) if t not in _STOPWORDS} | synonym_tags(folded)


def _chunk(
    title: str,
    content: str,
    *,
    sector_key: str | None = None,
    rule_id: str | None = None,
    unit_id: str | None = None,
    channels: tuple[str, ...] = (),
    reserve: str = "",
) -> dict[str, Any]:
    """Un chunk = un doc RAG synthétique + ses tokens pré-calculés (le corpus est
    mis en cache, on ne re-tokenise pas à chaque message).

    #3857 (BEL-LAU-1008-006) — ``reserve`` : la fin de ``content`` qui ne doit
    JAMAIS disparaître d'une troncature d'affichage (exceptions, condition
    d'arrêt, source) — « un extrait coupé avant sa réserve ne doit pas
    devenir une règle absolue ». Vide par défaut : un chunk sans réserve
    déclarée se tronque comme avant ce lot, au byte près."""
    normalized = " ".join(str(content).split())
    return {
        "title": title,
        "content": normalized,
        "category": CATEGORY_METHOD,
        "sector_key": sector_key,
        # #3289 (#3264.41) — l'identifiant de la règle de discipline, pour qu'un
        # espace qui l'a contredite puisse l'écarter. Jamais rendu.
        "_rule_id": rule_id,
        # #3274.1 — l'unité du classement KEEP/MERGE/SUPERSEDED/REMOVE. Jamais rendu.
        "_unit_id": unit_id,
        # #3382.a — les canaux auxquels la règle est bornée (`()` = tous). Jamais rendu.
        "_channels": channels,
        # #3857 — même normalisation que ``content`` : une réserve DOIT rester
        # une sous-chaîne exacte de ``content`` pour que la troncature la
        # retrouve. Jamais rendue telle quelle (lue par ``format_method_context``).
        "_reserve": " ".join(str(reserve).split()),
        "_title_tokens": _tokens(title),
        "_content_tokens": _tokens(content),
    }


# ── Corpus ────────────────────────────────────────────────────────────────────


def _with_guard(body: str, rule_id: str, source: str) -> tuple[str, str]:
    from app.knowledge import method_corpus_governance

    """#3285.6 — insère exceptions / arrêt / override de la règle AVANT la source.
    Sans garde déclarée, la chaîne est byte-identique à ``f"{body} {source}"``.

    #3857 — rend AUSSI la réserve (exceptions/arrêt/override + source) à
    passer à ``_chunk(..., reserve=...)`` : c'est elle qu'une troncature
    d'affichage ne doit jamais couper, jamais le corps."""
    reserve = " ".join([*method_corpus_governance.guard_sentences(rule_id), source])
    return " ".join([body, reserve]), reserve


@lru_cache(maxsize=1)
def _corpus() -> tuple[dict[str, Any], ...]:
    """Build the citable method corpus once, from the SAME sources the pipeline
    prompts already consume (never a second, divergent copy of the method)."""
    from app.knowledge import method_corpus_governance, objection_library, sector_playbooks
    from app.knowledge.business_rules import all_rules
    from app.knowledge.method_packs import CITATION_LABEL_BY_DOMAIN, METHOD_PACK_RULES
    from app.knowledge.method_account_rules import METHOD_ACCOUNT_RULES
    from app.knowledge.method_rules import METHOD_REFUSALS, METHOD_RULES, METHOD_SOURCE

    chunks: list[dict[str, Any]] = []

    # 1) Objections — the script a commercial actually needs mid-conversation.
    for entry in objection_library():
        objection = str(entry.get("objection") or "").strip()
        if not objection:
            continue
        objection_unit = method_corpus_governance.objection_unit_id(entry)
        if not method_corpus_governance.is_unit_served(objection_unit):
            continue
        parts = []
        if entry.get("real_meaning"):
            parts.append(f"Ce que ça veut vraiment dire : {entry['real_meaning']}")
        if entry.get("response"):
            parts.append(f"Réponse : {entry['response']}")
        if entry.get("mirror_question"):
            parts.append(f"Question miroir : {entry['mirror_question']}")
        variations = entry.get("variations_by_persona") or {}
        if isinstance(variations, dict):
            parts.extend(f"Variante {persona} : {text}" for persona, text in variations.items() if text)
        if parts:
            # ⚠️ Le CÔTÉ est dans le titre du fragment. Les treize objections de
            # prospection inversée (côté consultant) parlent d'un tout autre
            # interlocuteur : « pas d'intermédiation » ou « mon TJM est trop
            # élevé » venant d'un consultant n'appelle pas la même réponse que la
            # même phrase venant d'un client. Sans la mention, la recherche du
            # copilote rendait les deux indistinctement, et une réponse destinée à
            # un acheteur servie à un consultant le braque — ce que l'objectif du
            # document interdit en toutes lettres.
            side = "consultant" if str(entry.get("side") or "client") == "consultant" else "client"
            audience = "prospection inversée, côté consultant" if side == "consultant" else "prospection client"
            chunks.append(
                _chunk(f"Objection « {objection} » — {audience}", " ".join(parts), unit_id=objection_unit)
            )

    # 2) Sector playbooks — decision chain / entry strategy / dos & donts.
    for key, playbook in sector_playbooks().items():
        if not method_corpus_governance.is_unit_served(f"sector:{key}"):
            continue
        parts = []
        for label, field in (
            ("Chaîne de décision type", "typical_decision_chain"),
            ("Stratégie d'entrée", "entry_strategy"),
            ("Angle de pitch", "pitch_angle"),
            ("Cycles budgétaires", "budget_cycles"),
        ):
            if playbook.get(field):
                parts.append(f"{label} : {playbook[field]}")
        dos_donts = playbook.get("dos_and_donts") or {}
        if dos_donts.get("do"):
            parts.append("À faire : " + " ; ".join(dos_donts["do"][:3]))
        if dos_donts.get("dont"):
            parts.append("À éviter : " + " ; ".join(dos_donts["dont"][:3]))
        if parts:
            chunks.append(
                _chunk(f"Playbook secteur {key} — méthode Bellum", " ".join(parts), sector_key=key, unit_id=f"sector:{key}")
            )

    # 3) Business rules — the canonical scoring/qualification rules, each with the
    #    Drive/annexe reference that makes the answer auditable.
    # ⚠️ Le titre porte ``rule.label`` (le NOM), jamais ``rule.id`` (la clé de
    # tableau). Ce titre part à DEUX endroits que l'utilisateur lit : le contexte
    # injecté au modèle — d'où « Selon la règle méthode Bellum
    # « contact_fit_score_100 » » vu sur une capture — et le panneau « sources »
    # du chat, via ``context_transparency._method_label``. Un identifiant interne
    # n'a rien à faire dans une phrase lue par un commercial. L'identifiant reste
    # DANS la règle (``get_rule``, empreinte de run, tests) ; il ne s'affiche pas.
    # Gardé par ``tests/test_citable_titles_carry_no_internal_id.py``.
    for rule in all_rules():
        if not method_corpus_governance.is_unit_served(f"business_rule:{rule.id}"):
            continue
        # #3857 — réserve = source + statut : ce qui permet à l'équipe de
        # vérifier quelle version de la règle a été mobilisée (critère de
        # BEL-LAU-1008-006) ne doit pas disparaître d'une troncature.
        business_rule_reserve = f"Source : {rule.source}. Statut : {rule.status.value}."
        chunks.append(
            _chunk(
                f"Règle métier « {rule.label} » — méthode Bellum",
                f"{rule.description} {business_rule_reserve}",
                unit_id=f"business_rule:{rule.id}",
                reserve=business_rule_reserve,
            )
        )

    # 4) Règles de DISCIPLINE commerciale — les dix gardées et les sept interdits.
    #    Complémentaires de la source 3, jamais redondantes : le registre de
    #    règles métier dit COMMENT on note un compte, celles-ci disent COMMENT on
    #    le travaille. Elles étaient distillées, écrites et testées côté contrats
    #    depuis des mois, sans aucun appelant — le copilote ne les avait jamais
    #    vues. Ajoutées EN DERNIER à dessein : à score égal, `_score` départage
    #    par l'ordre du corpus, donc les trois sources d'origine gardent la main.
    # ⚠️ Les INTERDITS passent avant les règles gardées, et ce n'est pas cosmétique.
    # Mesuré sur « combien de contacts je dois viser sur ce compte ? » — la
    # question même que le premier interdit existe pour attraper : quatre chunks
    # étaient à égalité de score, et le départage par ordre de corpus sortait
    # l'interdit du top 3. Le copilote voyait deux règles de couverture et jamais
    # « la méthode REFUSE les nombres fixes de contacts ». Ne pas citer un interdit
    # coûte plus cher que de le citer pour rien.
    # #3274.3 — la gouvernance de METHOD_CORPUS_V1 (`governance.enabled`)
    # tranche ICI, avant même la construction du chunk : une règle désactivée
    # ne doit pas devenir injectable pour de mauvaises raisons de score, elle
    # ne doit simplement jamais exister dans le corpus retrouvable.
    for refusal in METHOD_REFUSALS:
        if not method_corpus_governance.is_rule_active(
            refusal.id
        ) or not method_corpus_governance.is_unit_served(f"discipline:{refusal.id}"):
            continue
        # Le cadrage « REFUSE » est dans le CONTENU, pas seulement dans le titre :
        # un interdit cité nu se lirait comme une consigne à appliquer.
        refusal_content, refusal_reserve = _with_guard(
            f"Ce que la méthode Bellum REFUSE : {refusal.statement}",
            refusal.id,
            f"Source : {METHOD_SOURCE}.",
        )
        chunks.append(
            _chunk(
                f"Interdit de méthode « {refusal.statement} » — méthode Bellum",
                refusal_content,
                rule_id=refusal.id,
                unit_id=f"discipline:{refusal.id}",
                channels=method_corpus_governance.rule_channels(refusal.id),
                reserve=refusal_reserve,
            )
        )
    for rule in METHOD_RULES:
        if not method_corpus_governance.is_rule_active(
            rule.id
        ) or not method_corpus_governance.is_unit_served(f"discipline:{rule.id}"):
            continue
        rule_content, rule_reserve = _with_guard(rule.statement, rule.id, f"Source : {METHOD_SOURCE}.")
        chunks.append(
            _chunk(
                f"Règle de méthode « {rule.statement} » — méthode Bellum",
                rule_content,
                rule_id=rule.id,
                unit_id=f"discipline:{rule.id}",
                channels=method_corpus_governance.rule_channels(rule.id),
                reserve=rule_reserve,
            )
        )

    # 4 bis) #3262.22/.29 — les deux règles de compte de BEL-SC-233 : la cadence
    #    de revue (réglable) et le NO-GO « logo prestigieux » (invariant).
    for account_rule in METHOD_ACCOUNT_RULES:
        if not method_corpus_governance.is_rule_active(account_rule.id):
            continue
        account_content, account_reserve = _with_guard(
            account_rule.recommendation, account_rule.id, f"Source : {METHOD_SOURCE}."
        )
        chunks.append(
            _chunk(
                f"Règle de méthode « {account_rule.title} » — méthode Bellum",
                account_content,
                rule_id=account_rule.id,
                channels=method_corpus_governance.rule_channels(account_rule.id),
                reserve=account_reserve,
            )
        )

    # 4 ter) #3382.a — les sept règles SalesConnect bornées à un canal (LinkedIn,
    #    téléphone), de la photo `method_channel_rules.json`. Elles ne sortent que
    #    si le tour déclare ce canal (`retrieve_method_chunks_with_rules`) : sans
    #    canal déclaré, le retrieval est byte-identique.
    for channel_rule in method_corpus_governance.channel_rules():
        channel_content, channel_reserve = _with_guard(
            channel_rule["recommendation"],
            channel_rule["rule_id"],
            f"Source : {channel_rule['source_document']}.",
        )
        chunks.append(
            _chunk(
                f"Règle de méthode « {channel_rule['title']} » — méthode Bellum",
                channel_content,
                rule_id=channel_rule["rule_id"],
                channels=method_corpus_governance.rule_channels(channel_rule["rule_id"]),
                reserve=channel_reserve,
            )
        )

    # 5) Packs méthode nommés (#3221, #206.3 — LAU-FINAL-206, #3200). Seize
    #    moments du cycle commercial ; ceux qui sont sourcés (service existant
    #    ou énoncé verbatim du ticket) entrent ici, un par un — jamais le
    #    corpus des packs en bloc. Le titre suit le format CITATION du ticket
    #    (« Méthode Bellum : compte fermé sans accès »), jamais un rule_id ni
    #    un domain brut.
    for pack_rule in METHOD_PACK_RULES:
        if not method_corpus_governance.is_unit_served(f"pack:{pack_rule.rule_id}"):
            continue
        parts = [pack_rule.recommendation]
        if pack_rule.counter_example:
            parts.append(f"À éviter : {pack_rule.counter_example}")
        # #3857 (BEL-LAU-1008-006) — réserve = condition d'arrêt (quand elle
        # existe) + source : exactement ce qu'une troncature d'affichage ne
        # doit jamais couper, « une exception qui survit à la sélection des
        # extraits ». ``counter_example`` reste dans le CORPS : il illustre la
        # règle, il n'en est pas la réserve.
        reserve_parts = []
        if pack_rule.stop_condition:
            reserve_parts.append(f"S'arrête si : {pack_rule.stop_condition}")
        reserve_parts.append(f"Source : {pack_rule.source}.")
        pack_reserve = " ".join(reserve_parts)
        parts.append(pack_reserve)
        chunks.append(
            _chunk(
                f"Méthode Bellum : {CITATION_LABEL_BY_DOMAIN[pack_rule.domain]}",
                " ".join(parts),
                unit_id=f"pack:{pack_rule.rule_id}",
                reserve=pack_reserve,
            )
        )

    return tuple(chunks)


# ── Retrieval ─────────────────────────────────────────────────────────────────


def _score(chunk: dict[str, Any], query_tokens: set[str]) -> int:
    """Overlap score — a title hit weighs 3, a content hit 1. Explainable and
    stable (same question ⇒ same citations, run after run)."""
    title_hits = len(query_tokens & chunk["_title_tokens"])
    content_hits = len((query_tokens & chunk["_content_tokens"]) - chunk["_title_tokens"])
    return 3 * title_hits + content_hits


def method_query_text(
    message: str, *, current_job: str | None = None, current_step: str | None = None
) -> str:
    """#3857 (BEL-LAU-1008-006) — sélectionne la méthode sur LE TRAVAIL EN
    COURS, pas seulement le dernier message.

    Avant ce lot, le chat appelait ``retrieve_method_chunks_with_rules``
    avec ``req.message`` seul. Un « GO » de relance n'a aucun token ≥4
    lettres (``_TOKEN_RE``) : la méthode retrouvée au tour précédent
    disparaissait silencieusement, et un « GO » après une ouverture de
    compte perdait la méthode d'ouverture.

    ``current_job``/``current_step`` viennent de ``chat_thread_state.py`` —
    déjà tenus à CHAQUE tour (jamais une nouvelle lecture, GA-26) — et
    s'ajoutent À LA SUITE du message, jamais à sa place : un message qui
    porte déjà sa propre méthode garde la main (ses tokens arrivent d'abord,
    et un hit de TITRE pèse plus qu'un hit de contenu, ``_score``). Sans
    travail en cours déclaré, résultat byte-identique à ``message`` seul."""
    return " ".join(part for part in (message, current_job, current_step) if part)


def retrieve_method_chunks_with_rules(
    query_text: str,
    *,
    sector: str | None = None,
    top_k: int = _TOP_K,
    excluded_rule_ids: frozenset[str] = frozenset(),
    channel: str | None = None,
) -> tuple[list[dict[str, Any]], frozenset[str]]:
    """Comme {@link retrieve_method_chunks}, plus les identifiants des règles de
    discipline retrouvées, et l'exclusion de celles qu'un espace a CONTREDITES
    (#3289, #3264.41). `excluded_rule_ids` vide ⇒ résultat byte-identique.

    #3382.a — `channel` (le canal du tour, `detect_turn_channel`) : une règle
    bornée à d'autres canaux n'est pas retrouvée — même sémantique que
    `selectApplicableMethodRules` (contrats) : une règle bornée à un canal ne
    sort pas quand le tour n'en déclare aucun. Aucune règle servie aujourd'hui
    n'est bornée : sans canal déclaré, le retour est byte-identique."""
    query_tokens = _tokens(query_text)
    if not query_tokens:
        return [], frozenset()

    from app.knowledge import match_sector

    eligible_sector = match_sector(sector) or match_sector(query_text)

    scored: list[tuple[int, int, dict[str, Any]]] = []
    for index, chunk in enumerate(_corpus()):
        if chunk["sector_key"] and chunk["sector_key"] != eligible_sector:
            continue
        if chunk["_rule_id"] and chunk["_rule_id"] in excluded_rule_ids:
            continue
        # #3382.a — le filtre par canal (premier appelant de production).
        channels = chunk.get("_channels") or ()
        if channels and (channel is None or channel not in channels):
            continue
        score = _score(chunk, query_tokens)
        if score >= _MIN_SCORE:
            # `index` = deterministic tie-break (corpus order), so equal scores
            # never shuffle between runs.
            scored.append((-score, index, chunk))

    scored.sort(key=lambda item: (item[0], item[1]))
    top = scored[: max(0, top_k)]
    # A descending synthetic `similarity` makes `format_knowledge_context`'s
    # internal sort PRESERVE this order, and drops the internal token sets.
    chunks = [
        {
            "title": chunk["title"],
            "content": chunk["content"],
            "category": chunk["category"],
            "similarity": float(len(top) - rank),
            # #3857 — la réserve survit jusqu'à `format_method_context`, seul
            # endroit qui en a besoin (la troncature d'affichage). Jamais
            # rendue : `rag_service.format_knowledge_context` ignore les clés
            # qu'il ne connaît pas. `.get` : un corpus synthétique de test
            # construit à la main (hors `_chunk`) n'a pas forcément la clé.
            "_reserve": chunk.get("_reserve") or "",
        }
        for rank, (_score_neg, _index, chunk) in enumerate(top)
    ]
    rule_ids = frozenset(chunk["_rule_id"] for _s, _i, chunk in top if chunk["_rule_id"])
    return chunks, rule_ids


_CHANNEL_MARKERS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("phone", ("appel", "telephon", "cold call", "phone", "call")),
    ("email", ("e-mail", "email", "mail", "courriel")),
    ("linkedin", ("linkedin",)),
    ("meeting", ("rendez-vous", "rdv", "reunion", "meeting")),
)


def detect_turn_channel(message: str | None) -> str | None:
    """#3382.a — le canal DÉCLARÉ par la demande (`phone`, `email`, `linkedin`,
    `meeting`), ou `None`. Mots explicites seulement ; deux canaux nommés ⇒
    `None` : on ne devine pas lequel gouverne."""
    folded = _fold(message)
    found = [
        channel
        for channel, markers in _CHANNEL_MARKERS
        if any(re.search(rf"(?<![a-z0-9]){re.escape(marker)}", folded) for marker in markers)
    ]
    return found[0] if len(found) == 1 else None


def retrieve_method_chunks(
    query_text: str, *, sector: str | None = None, top_k: int = _TOP_K
) -> list[dict[str, Any]]:
    """The method chunks this question is actually about, best first.

    Returns `[]` for an empty query or when nothing clears `_MIN_SCORE` — the
    default path stays byte-identical. A sector playbook is only eligible when
    the account's sector (or the question itself) names that sector, so a chat
    about a bank never drags in the eight other playbooks.
    """
    return retrieve_method_chunks_with_rules(query_text, sector=sector, top_k=top_k)[0]


def _fit_with_reserve(content: str, reserve: str, *, limit: int) -> str:
    """Tronque le CORPS, jamais la RÉSERVE (#3857, BEL-LAU-1008-006) : « un
    extrait coupé avant sa réserve ne doit pas devenir une règle absolue. »

    ``rag_service.format_knowledge_context`` tronque à l'octet (``content[:n]``),
    sans savoir qu'une partie de ce texte est une exception, une condition
    d'arrêt ou une source à préserver. Ce module le sait : il protège la
    réserve AVANT que le texte ne quitte ses mains. Sans réserve déclarée, ou
    si le contenu tient déjà dans ``limit``, byte-identique à avant ce lot."""
    if not reserve or len(content) <= limit or reserve not in content:
        return content
    body = content[: content.rindex(reserve)].rstrip()
    budget = limit - len(reserve) - 1  # +1 pour l'espace entre le corps et la réserve
    if budget <= 0:
        # La réserve seule dépasse déjà le budget : elle reste entière, le
        # corps disparaît plutôt qu'elle — jamais l'inverse.
        return reserve
    if len(body) <= budget:
        return f"{body} {reserve}"
    return f"{body[:budget].rstrip()}… {reserve}"


def format_method_context(chunks: list[dict[str, Any]] | None) -> str:
    """Compact prompt block for the retrieved method chunks (`""` when none).
    Reuses the RAG formatter so a method citation reads exactly like a document
    citation in the prompt."""
    if not chunks:
        return ""
    from app.services import rag_service

    protected = [
        {**chunk, "content": _fit_with_reserve(chunk["content"], chunk.get("_reserve") or "", limit=_SNIPPET_CHARS)}
        for chunk in chunks
    ]
    return rag_service.format_knowledge_context(
        protected, max_chars=_MAX_CHARS, snippet_chars=_SNIPPET_CHARS
    )
