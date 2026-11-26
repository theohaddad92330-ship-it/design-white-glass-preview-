"""Deterministic Quality Judge (V1-vendable §9.8 / §10.12).

The last gate over the assembled dossier. It refuses generic / unsourced / thin
output and produces a verdict a salesperson (and the front) can trust:

    ok           — rien à signaler
    a_corriger   — défauts corrigeables (générique, message trop long, tag manquant)
    hallucination— un fait affiché SANS source (le défaut le plus grave)
    trop_faible  — le dossier manque des livrables cœur (pas exploitable)

Deterministic on purpose (rules over the output, no extra Claude call — cost
stays down): cross-references the firmo facts against sources.tags, lists the
hypotheses to verify, and flags generic markers / over-long messages / missing
deliverables. Same compute pattern as account_score / truth_status.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence
from typing import Any

from app.services.recommendation_specificity import (
    MIN_SPECIFIC_ELEMENTS,
    STATUS_GENERIC,
    assess_specificity,
    registry_from_inputs,
)

# Facts that MUST be sourced (Pappers / INSEE / registre) — if present but not
# tagged PUBLIC nor cited, that's the hallucination signal.
_SOURCED_FACT_FIELDS = ("siren", "revenue", "employees", "headquarters", "sector")

# ── S4 factualité : garde-fous dirigeant / RH / budget ──────────────────────
# A current-leadership title. If a person is presented with one of these but is
# absent from the Pappers registry (representants = current snapshot), the claim
# is possibly stale (Matteo: Oudéa parti en 2023, traité comme DG actuel).
_LEADERSHIP_TITLE_RE = re.compile(
    r"\bP-?DG\b|\bCEO\b|\bDG\b|chairman|directeur\s+g[ée]n[ée]ral|directrice\s+g[ée]n[ée]rale|pr[ée]sident",
    re.IGNORECASE,
)
# "ancien DG", "ex-président", "parti en 2023" → already honestly labelled former.
_FORMER_MARKER_RE = re.compile(
    r"\b(ancien|ancienne|ex[- ]|former|jusqu['’]en|jusqu['’]au|parti|quitt[ée]|d[ée]part)\b",
    re.IGNORECASE,
)
# A precise HR figure (≥ 2 digits) used as a hook — "900 postes IT" — when the
# source may only say "des suppressions de postes". Must be sourced or degraded.
_JOBS_FIGURE_RE = re.compile(
    r"\b\d{2,}(?:[ .]\d{3})*\s*"
    r"(?:postes?|emplois?|recrutements?|suppressions?|licenciements?|embauches?|"
    r"collaborateurs?|salari[ée]s?|ETP|effectifs?)\b",
    re.IGNORECASE,
)
# A precise budget figure, but only when a budget-context word sits next to it —
# so the ESN's own deal sizing ("150-250K EUR", "3 consultants") is NOT flagged.
_BUDGET_FIGURE_RE = re.compile(
    r"(?:budget|investissement|enveloppe|d[ée]pense)[^.\n]{0,40}?\d[\d .,]*\s*"
    r"(?:M€|Md€|k€|millions?|milliards?)",
    re.IGNORECASE,
)
# A precise growth / market-share % used as a hook — contextual so a legit
# confidence "95/100" or a random % isn't caught, only "croissance de 30%".
_GROWTH_PCT_RE = re.compile(
    r"(?:croissance|hausse|augmentation|progression|baisse|recul|part\s+de\s+march[ée]|marge|chiffre\s+d['’]affaires|CA)"
    r"[^.\n]{0,30}?\d{1,3}(?:[.,]\d+)?\s*%",
    re.IGNORECASE,
)
# A funding / M&A event with a money figure used as a hook (à sourcer).
_FUNDING_RE = re.compile(
    r"(?:lev[ée]e|financement|rachat|acquisition|fusion|introduction\s+en\s+bourse|IPO)"
    r"[^.\n]{0,40}?(?:€|EUR|\$|M€|Md€|millions?|milliards?)",
    re.IGNORECASE,
)

# Generic / banned phrases that mark a lazy, non-personalised message (deck rule).
_GENERIC_MARKERS = (
    "je me permets",
    "n'hésitez pas",
    "n’hésitez pas",
    "nos expertises reconnues",
    "acteur majeur",
    "leader de son secteur",
    "[",  # an un-filled template bracket
    # Anti-générique (01_METHOD_CORE) — a reco that could apply to ANY company.
    "approche multicanale",
    "surveiller l'actualité",
    "surveiller l’actualité",
    "solution sur mesure",
    "accompagner dans votre transformation",
    "notre méthodologie éprouvée",
)

# An email body past this is "trop long" for a first cold touch (deck: court).
_EMAIL_BODY_MAX = 900

# Core deliverables a usable dossier must carry; fewer than this = trop faible.
_MIN_CORE_DELIVERABLES = 3

# Multi-threading minimum (méthode plan de compte : 6 contacts min, 12 idéal).
_MIN_CONTACTS = 6


def _present(v: Any) -> bool:
    return bool(v) and str(v).strip().lower() not in ("", "non identifié", "non précisé", "n/a", "inconnu")


def _tag(tags: Mapping[str, str], field: str) -> str:
    # tags may be keyed camel or snake; try both.
    return str(tags.get(field) or tags.get(_camel(field)) or "").upper()


def _camel(snake: str) -> str:
    head, *rest = snake.split("_")
    return head + "".join(w.capitalize() for w in rest)


def _iter_texts(plan: Mapping[str, Any]) -> list[str]:
    """All free-text a salesperson READS in the dossier — messages, angles AND the
    headline cockpit surfaces (executiveSummary, nextBestAction, the §5 plays,
    quick wins). The Quality Judge must gate these too: a forbidden-as-fact hook
    (stale dirigeant, exact budget) that lands in a play card or the exec summary
    shown at the TOP of the cockpit used to bypass §8 entirely (red-team)."""
    out: list[str] = []
    for m in plan.get("contactMessages") or plan.get("contact_messages") or []:
        if isinstance(m, Mapping):
            for k in ("linkedinMessage", "emailBody", "phoneOpener", "linkedin_message", "email_body"):
                if _present(m.get(k)):
                    out.append(str(m[k]))
    for a in plan.get("angles") or []:
        if isinstance(a, Mapping):
            for k in ("title", "strategy"):
                if _present(a.get(k)):
                    out.append(str(a[k]))
    # Headline surfaces added by the V1-vendable cockpit.
    for line in plan.get("executiveSummary") or plan.get("executive_summary") or []:
        if _present(line):
            out.append(str(line))
    nba = plan.get("nextBestAction") or plan.get("next_best_action") or {}
    if isinstance(nba, Mapping) and _present(nba.get("action")):
        out.append(str(nba["action"]))
    for p in plan.get("plays") or []:
        if isinstance(p, Mapping):
            for k in ("painSignal", "esnOffer", "angle", "firstAction", "risk"):
                if _present(p.get(k)):
                    out.append(str(p[k]))
    for q in plan.get("quick_wins") or plan.get("quickWins") or []:
        if isinstance(q, Mapping) and _present(q.get("action")):
            out.append(str(q["action"]))
    return out


def _norm(text: str) -> str:
    """Accent-stripped uppercase, for robust name matching (OUDÉA == OUDEA)."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).upper()


def _name_tokens(name: str) -> set[str]:
    """Significant name tokens (≥ 3 chars) — drops particles like DE / LA / DU."""
    return {t for t in re.split(r"[^A-Z]+", _norm(name)) if len(t) >= 3}


def _current_exec_surnames(research: Mapping[str, Any]) -> set[str]:
    """Name tokens of the CURRENT registered leaders (Pappers ``representants``
    / ``c_level`` — a live snapshot). Empty when no registry is available, in
    which case the recency check is skipped rather than guessing."""
    tokens: set[str] = set()
    for key in ("executives", "c_level", "cLevel"):
        for e in research.get(key) or []:
            if isinstance(e, Mapping):
                for field in ("last_name", "lastName", "nom", "name", "full_name", "fullName"):
                    v = e.get(field)
                    if _present(v):
                        tokens |= _name_tokens(str(v))
            elif _present(e):
                tokens |= _name_tokens(str(e))
    return tokens


def _hook_texts(research: Mapping[str, Any], plan: Mapping[str, Any]) -> list[str]:
    """The 'accroche' surface where an over-precise figure does damage: messages,
    angles, the RDV opening and the account-opening blurb."""
    texts = _iter_texts(plan)
    for a in research.get("angles") or []:
        if isinstance(a, Mapping):
            for k in ("title", "strategy"):
                if _present(a.get(k)):
                    texts.append(str(a[k]))
    # Pains often carry the over-precise HR/budget hook ("suppression de 900 postes").
    for p in research.get("pains") or []:
        if isinstance(p, Mapping) and _present(p.get("pain")):
            texts.append(str(p["pain"]))
        elif _present(p):
            texts.append(str(p))
    rdv = research.get("rdvScript") or research.get("rdv_script") or {}
    if isinstance(rdv, Mapping) and _present(rdv.get("opening")):
        texts.append(str(rdv["opening"]))
    if _present(research.get("commentOuvrirCompte")):
        texts.append(str(research["commentOuvrirCompte"]))
    return texts


def _stale_executive_claims(research: Mapping[str, Any]) -> list[str]:
    """People presented with a current-leadership title but absent from the live
    registry — possibly former (Oudéa). Skipped entirely when no registry."""
    surnames = _current_exec_surnames(research)
    if not surnames:
        return []
    claims: list[str] = []
    for p in research.get("peopleMentioned") or research.get("people_mentioned") or []:
        if not isinstance(p, Mapping):
            continue
        name = str(p.get("name") or "")
        title = str(p.get("title") or p.get("role") or "")
        if not (_present(name) and _LEADERSHIP_TITLE_RE.search(title)):
            continue
        if _FORMER_MARKER_RE.search(title) or _FORMER_MARKER_RE.search(str(p.get("context") or "")):
            continue
        if not (_name_tokens(name) & surnames):
            claims.append(f"{name} ({title.strip()})")
    return claims


def mark_former_leaders(research: dict[str, Any]) -> int:
    """Date obsolete leadership IN PLACE (Théo restitution p.7): a person shown with
    a current-leadership title but absent from the live registry (representants /
    c_level) is possibly former — Frédéric Oudéa, parti de SG en 2023, ne doit pas
    être présenté comme DG actuel. Tags ``former: true`` + "(ancien — à vérifier)"
    on the title so the front shows a dated role instead of a silent current one.

    Skipped when no registry is available (can't tell) and never re-touches an
    already-former / registry-present person. Returns the number marked. Runs in
    Phase 1 so the persisted ``peopleMentioned`` (and everything downstream) is dated."""
    surnames = _current_exec_surnames(research)
    if not surnames:
        return 0
    people = research.get("peopleMentioned") or research.get("people_mentioned")
    if not isinstance(people, list):
        return 0
    marked = 0
    for p in people:
        if not isinstance(p, dict):
            continue
        name = str(p.get("name") or "")
        title = str(p.get("title") or p.get("role") or "")
        if not (_present(name) and _LEADERSHIP_TITLE_RE.search(title)):
            continue
        if p.get("former") or _FORMER_MARKER_RE.search(title) or _FORMER_MARKER_RE.search(str(p.get("context") or "")):
            continue
        if _name_tokens(name) & surnames:
            continue  # present in the current registry → genuinely current
        p["former"] = True
        p["title"] = f"{title.strip()} (ancien — à vérifier)" if title.strip() else "(ancien — à vérifier)"
        marked += 1
    return marked


def _overspecific_figures(research: Mapping[str, Any], plan: Mapping[str, Any]) -> list[str]:
    """Precise HR / budget figures used as hooks — to source or degrade."""
    found: list[str] = []
    for t in _hook_texts(research, plan):
        for rx in (_JOBS_FIGURE_RE, _BUDGET_FIGURE_RE, _GROWTH_PCT_RE, _FUNDING_RE):
            found += (m.group(0).strip() for m in rx.finditer(t))
    # De-dupe preserving order.
    return list(dict.fromkeys(found))


# _norm returns UPPERCASE accent-stripped, so placeholders are matched uppercase.
_PLACEHOLDER_CONTACTS = frozenset({"", "A IDENTIFIER", "A QUALIFIER", "A DEFINIR", "A PRECISER"})


def _hallucinated_action_contacts(contacts: Sequence[Any], plan: Mapping[str, Any]) -> list[str]:
    """Action / quick-win / offer contacts that don't match any enriched contact —
    a plan addressing a person who doesn't exist (§8). Empty when there are no
    contacts to check against (no false flag), placeholders ("à identifier") allowed."""
    known: set[str] = set()
    for c in contacts:
        if isinstance(c, Mapping):
            nm = _norm(str(c.get("fullName") or c.get("full_name") or ""))
            if nm:
                known.add(nm)
    if not known:
        return []
    candidates: list[Any] = []
    action_plan = plan.get("actionPlan") or plan.get("action_plan") or {}
    for ph in (action_plan.get("phases") if isinstance(action_plan, Mapping) else []) or []:
        if isinstance(ph, Mapping):
            candidates += ph.get("actions") or []
    candidates += plan.get("quick_wins") or plan.get("quickWins") or []
    offers = plan.get("offersToPropose") or plan.get("offers_to_propose") or []
    bad: list[str] = []
    for item in candidates:
        if isinstance(item, Mapping):
            _flag_unknown_contact(item.get("contact"), known, bad)
    for o in offers:
        if isinstance(o, Mapping):
            _flag_unknown_contact(o.get("targetContact") or o.get("target_contact"), known, bad)
    return list(dict.fromkeys(bad))


def _flag_unknown_contact(name: object, known: set[str], bad: list[str]) -> None:
    raw = str(name or "").strip()
    key = _norm(raw)
    if key and key not in _PLACEHOLDER_CONTACTS and key not in known:
        bad.append(raw)


def judge_quality(
    *,
    research: Mapping[str, Any],
    contacts: Sequence[Any],
    plan: Mapping[str, Any],
) -> dict[str, Any]:
    """Return {verdict, issues, factsMissingSource, hypothesesToVerify, confidence}."""
    issues: list[dict[str, str]] = []
    tags = ((research.get("sources") or {}).get("tags")) or {}
    citations = ((research.get("sources") or {}).get("citations")) or {}

    # 1. Facts presented without a source → hallucination risk.
    facts_missing_source: list[str] = []
    for field in _SOURCED_FACT_FIELDS:
        if _present(research.get(field)) and _tag(tags, field) != "PUBLIC" and field not in citations:
            facts_missing_source.append(field)
    if facts_missing_source:
        issues.append(
            {
                "type": "fait_sans_source",
                "severity": "critique",
                "detail": f"Fait(s) affiché(s) sans source : {', '.join(facts_missing_source)}",
            }
        )

    # 2. Hypotheses the user must validate before acting.
    hypotheses_to_verify: list[str] = []
    for h in research.get("qualified_hypotheses") or research.get("qualifiedHypotheses") or []:
        label = h.get("hypothesis") or h.get("label") if isinstance(h, Mapping) else h
        if _present(label):
            hypotheses_to_verify.append(str(label))
    # NB: we deliberately do NOT append the raw field NAMES tagged HYPOTHÈSE
    # (businessDescription, pains…) — they're meaningless to a salesperson and
    # leaked into the "à vérifier" list. The readable hypotheses above suffice.

    # 3. Generic / lazy free-text.
    texts = _iter_texts(plan)
    lowered = " \n ".join(texts).lower()
    hits = [m for m in _GENERIC_MARKERS if m in lowered]
    if hits:
        issues.append(
            {"type": "generique", "severity": "moyen", "detail": f"Formulation générique détectée : {', '.join(hits)}"}
        )

    # 3b. #1925 — the headline recommendation could be sent to ANY account: fewer
    #     than 2 specific elements while the dossier offered enough to cite.
    #     `non_evaluable` (nothing to cite) is not the recommendation's fault.
    nba = plan.get("nextBestAction") or plan.get("next_best_action")
    specificity = nba.get("specificity") if isinstance(nba, Mapping) else None
    if isinstance(specificity, Mapping) and specificity.get("status") == STATUS_GENERIC:
        issues.append(
            {
                "type": "recommandation_interchangeable",
                "severity": "moyen",
                "detail": (
                    f"Prochaine action interchangeable : {specificity['count']} élément(s) spécifique(s) "
                    f"cité(s), minimum {specificity['minimum']}"
                ),
            }
        )

    # 3c. LOT C-5b — LA RÈGLE POSITIVE, APPLIQUÉE PAR LE JUGE LUI-MÊME.
    #
    #     Jusqu'ici le juge ne faisait que RELIRE un verdict calculé ailleurs
    #     (3b), pour UNE surface. Côté juge la règle restait donc négative : une
    #     liste de formulations bannies (`_GENERIC_MARKERS`). Un angle d'attaque
    #     — la recommandation que le commercial lit en premier — pouvait être
    #     parfaitement interchangeable sans contenir un seul mot banni.
    #
    #     Le juge ne reçoit pas le profil ESN : il construit son registre avec ce
    #     qu'il a (recherche + contacts enrichis), soit trois familles au plus
    #     — entité précise, contact précis, signal daté. C'est assez pour le
    #     seuil de deux ; quand le dossier n'en offre pas deux,
    #     `assess_specificity` rend `non_evaluable` et le juge SE TAIT.
    #     « Non mesuré » n'est pas « générique » : on ne condamne pas une
    #     recommandation sur des données que le dossier n'a jamais eues.
    #
    #     Le seuil et les onze éléments ne sont pas recopiés ici : ils vivent
    #     dans `recommendation_specificity` et nulle part ailleurs (GA-26).
    registry = registry_from_inputs(profile=None, research=research, contacts=contacts)
    interchangeable = [
        angle
        for angle in research.get("angles") or []
        if isinstance(angle, Mapping)
        and assess_specificity([angle.get("title"), angle.get("strategy")], registry)["status"] == STATUS_GENERIC
    ]
    if interchangeable:
        issues.append(
            {
                "type": "recommandation_interchangeable",
                "severity": "moyen",
                "detail": (
                    f"{len(interchangeable)} angle(s) interchangeable(s) : moins de "
                    f"{MIN_SPECIFIC_ELEMENTS} éléments spécifiques cités alors que le dossier en offrait"
                ),
            }
        )

    # 4. Over-long first-touch messages.
    overlong = [len(t) for t in texts if len(t) > _EMAIL_BODY_MAX]
    if overlong:
        issues.append(
            {"type": "message_trop_long", "severity": "moyen", "detail": f"{len(overlong)} message(s) trop long(s) pour une 1re prise de contact"}
        )

    # 5. Core deliverables present?
    action_plan = plan.get("actionPlan") or plan.get("action_plan") or {}
    phases = action_plan.get("phases") if isinstance(action_plan, Mapping) else None
    core = {
        "contacts": bool(contacts),
        "angles": bool(research.get("angles")),
        "action_plan": bool(phases),
        "messages": bool(plan.get("contactMessages") or plan.get("contact_messages")),
    }
    missing_core = [k for k, ok in core.items() if not ok]
    if missing_core:
        issues.append(
            {"type": "livrables_manquants", "severity": "critique", "detail": f"Livrables cœur absents : {', '.join(missing_core)}"}
        )

    # 5b. Multi-threading (méthode plan de compte : 6 contacts min, spanning several
    # roles — "zéro dépendance à un seul champion").
    named = [c for c in contacts if isinstance(c, Mapping) and (c.get("fullName") or c.get("full_name"))]
    roles = {str(c.get("decision_role") or c.get("role") or "").strip().lower() for c in named}
    roles.discard("")
    if 0 < len(named) < _MIN_CONTACTS:
        issues.append(
            {
                "type": "contacts_insuffisants",
                "severity": "moyen",
                "detail": f"{len(named)} contact(s) utile(s) (<{_MIN_CONTACTS}) — multi-threading trop faible",
            }
        )
    elif len(named) >= _MIN_CONTACTS and len(roles) <= 1:
        issues.append(
            {
                "type": "multi_thread_faible",
                "severity": "moyen",
                "detail": "Tous les contacts sur un seul rôle décisionnel — dépendance à un seul angle (viser delivery + décision + politique + achats)",
            }
        )

    # 6. Dirigeant obsolète — accroche gouvernance absente du registre actuel.
    stale_executive_claims = _stale_executive_claims(research)
    if stale_executive_claims:
        issues.append(
            {
                "type": "dirigeant_obsolete",
                "severity": "critique",
                "detail": f"Dirigeant présenté comme actuel mais absent du registre (possiblement ancien) : {', '.join(stale_executive_claims)}",
            }
        )

    # 7. Chiffre RH / budget trop précis utilisé comme accroche (à sourcer/dégrader).
    overspecific_figures = _overspecific_figures(research, plan)
    if overspecific_figures:
        issues.append(
            {
                "type": "chiffre_trop_precis",
                "severity": "moyen",
                "detail": f"Chiffre RH/budget précis en accroche (à sourcer ou dégrader) : {', '.join(overspecific_figures[:5])}",
            }
        )

    # 8. Plan actions addressing a contact that doesn't exist (§8 — no fictional
    #    person). Grounds action/quick-win/offer contacts against the real list.
    hallucinated_contacts = _hallucinated_action_contacts(contacts, plan)
    if hallucinated_contacts:
        issues.append(
            {
                "type": "contact_inexistant",
                "severity": "critique",
                "detail": f"Action(s) adressée(s) à un contact absent de la liste enrichie : {', '.join(hallucinated_contacts[:5])}",
            }
        )

    # 9. Plays / offres incohérents (retour Thales) — le juge de cohérence a laissé
    #    un maillon manquant (offre / contact non déterminé) dans la chaîne.
    incoherent_plays = [
        str(p.get("perimeter") or "?")
        for p in (plan.get("plays") or [])
        if isinstance(p, Mapping) and isinstance(p.get("coherence"), Mapping)
        and p["coherence"].get("status") == "incoherent"
    ]
    if incoherent_plays:
        issues.append(
            {
                "type": "play_incoherent",
                "severity": "moyen",
                "detail": f"Offre(s) à la chaîne incomplète (contact ou offre non déterminé) : {', '.join(incoherent_plays[:5])}",
            }
        )

    confidence = (research.get("confidence") or {}).get("score")

    # Verdict — most severe first.
    if facts_missing_source:
        verdict = "hallucination"
    elif len(core) - len(missing_core) < _MIN_CORE_DELIVERABLES:
        verdict = "trop_faible"
    elif issues:
        verdict = "a_corriger"
    else:
        verdict = "ok"

    return {
        "verdict": verdict,
        "issues": issues,
        "factsMissingSource": facts_missing_source,
        "hypothesesToVerify": hypotheses_to_verify,
        "staleExecutiveClaims": stale_executive_claims,
        "overspecificFigures": overspecific_figures,
        "hallucinatedContacts": hallucinated_contacts,
        "confidence": confidence,
    }
