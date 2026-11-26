"""#3760 (BEL-LAU-1003) — LA COUCHE D'INTENTION : de la requête à la famille de rendu.

Le retour : avant de répondre, Laura doit savoir si la personne attend une
cartographie, une synthèse, une sélection priorisée, un plan d'action, une
analyse de dossier, une liste de contacts, une comparaison ou une aide
rédactionnelle — et ne pas servir la même forme à toutes. La recette prod du
06/10 (« donne-moi une cartographie complète… » rendue en paragraphes) en est
la preuve.

CE QUE C'EST. Un classement de FORME, jamais de fond : il choisit quelle carte
(`REPLY_FORMATS_DIRECTIVE`, #1914) la réponse doit privilégier. Il ne remplace
ni le routeur d'outils (`chat_intent_router`) ni le classement de densité
(`response_density`, GA-26 : deux questions différentes — QUOI faire / QUELLE
forme / COMBIEN de mots).

CINQ SIGNAUX, pas des mots-clés seuls : le texte (avec tolérance aux fautes de
frappe — le message réel de l'issue en contenait), l'écran ouvert, l'objet
ouvert (compte actif ou « Objet ouvert » de l'écran), les filtres actifs et
l'historique utile du fil. Le contexte ne REMPLACE jamais un texte clair : il
tranche un déictique (« résume-moi ça ») ou départage deux familles.

CE QU'ELLE NE FAIT PAS. Aucune probabilité, aucun score affiché : la décision
est `clear`, `ambiguous` ou `conversational`. L'ambiguïté ne produit JAMAIS une
mise en page rigide : `generic_rich_answer` et UNE question de clarification
minimale. Une conversation (bonjour, merci) reste du texte court, sans carte.

Sans signal exploitable (message vide) : directive vide, prompt inchangé au byte.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from difflib import SequenceMatcher
from enum import StrEnum


class LayoutFamily(StrEnum):
    ACCOUNT_MAP = "account_map"
    SYNTHESIS = "synthesis"
    PRIORITIZED_SELECTION = "prioritized_selection"
    ACTION_PLAN = "action_plan"
    ACCOUNT_ANALYSIS = "account_analysis"
    MEETING_BRIEF = "meeting_brief"
    CONTACTS_LIST = "contacts_list"
    COMPARISON = "comparison"
    WRITING_HELP = "writing_help"
    GENERIC_RICH_ANSWER = "generic_rich_answer"
    CONVERSATIONAL = "conversational"


@dataclass(frozen=True)
class LayoutDecision:
    family: LayoutFamily
    clarity: str  # "clear" | "ambiguous" | "conversational" — jamais un pourcentage
    signals: tuple[str, ...] = ()
    runner_up: LayoutFamily | None = None


def _norm(text: str) -> str:
    base = unicodedata.normalize("NFD", (text or "").lower())
    base = "".join(c for c in base if unicodedata.category(c) != "Mn")
    return re.sub(r"[’']", "'", base).strip()


# (regex sur texte normalisé, poids). 3 = marqueur franc, 2 = fort, 1 = indice.
_CUES: dict[LayoutFamily, tuple[tuple[str, int], ...]] = {
    LayoutFamily.ACCOUNT_MAP: (
        (r"cartograph", 3),
        (r"\bcarte (des|du) (comptes|marche|territoire)", 3),
        (r"\b(perimetre|territoire)\b", 1),
        (r"tous les comptes (a|de|du|sur)", 2),
    ),
    LayoutFamily.MEETING_BRIEF: (
        (r"avant (mon|le|ma|mes|notre|un) (rdv|rendez|reunion|call|point|entretien)", 3),
        (r"\b(brief|preparer? (mon|le|ma|un) (rdv|rendez|reunion|call))", 3),
        (r"\b(rdv|rendez-vous|reunion)\b", 1),
    ),
    LayoutFamily.ACCOUNT_ANALYSIS: (
        (r"analys\w* (ce|le|du|de ce) (compte|dossier)", 3),
        (r"\b(dossier|fiche) (de|du|complet)", 2),
        (r"\b(ce|le|ce meme) compte\b", 1),
        (r"ou en est", 2),
    ),
    LayoutFamily.CONTACTS_LIST: (
        (r"qui (dois-je|doit-on|faut-il|puis-je|devrais-je|contacter)", 3),
        (r"\b(interlocuteurs?|decideurs?|organigramme)\b", 3),
        (r"\bcontacts?\b", 1),
        (r"\bcontacter\b", 2),
    ),
    LayoutFamily.ACTION_PLAN: (
        (r"plan d'actions?", 3),
        (r"\bplan (de|pour) (la|ma|cette) (semaine|journee)", 3),
        (r"que dois-je faire|quelles? (sont )?(mes )?actions", 3),
        (r"\b(etapes|feuille de route)\b", 2),
    ),
    LayoutFamily.COMPARISON: (
        (r"\bcompar\w*", 3),
        (r"\b(versus|vs)\b", 3),
        (r"difference entre|lequel (choisir|prendre|est)", 3),
    ),
    LayoutFamily.WRITING_HELP: (
        (r"\b(redige|rediger|ecris|ecrire|reformule|rewrite)\b", 3),
        (r"\b(e-?mail|mail|message|relance|linkedin|accroche|sms)\b", 2),
        (r"que (lui )?dire|comment (l'|lui )?aborder", 2),
    ),
    LayoutFamily.PRIORITIZED_SELECTION: (
        (r"\bpriorit\w*", 2),
        (r"\btop \d+|\b\d+ (premiers? |meilleurs? )?(comptes|prospects|cibles)", 2),
        (r"par ou commencer|quels? comptes? (a )?attaquer|shortlist|classement", 3),
        (r"\bmeilleurs? (comptes|cibles|prospects)", 2),
    ),
    LayoutFamily.SYNTHESIS: ((r"\b(synthese|recap\w*|en bref|tl;?dr)\b", 3),),
}

# Mots-clés tolérants aux fautes (« cartgographie », « comparer »), un seul mot.
_FUZZY: dict[LayoutFamily, tuple[str, ...]] = {
    LayoutFamily.ACCOUNT_MAP: ("cartographie", "cartographier"),
    LayoutFamily.COMPARISON: ("comparaison", "comparer", "compare"),
    LayoutFamily.SYNTHESIS: ("synthese", "recapitulatif"),
    LayoutFamily.ACTION_PLAN: ("planning",),
}

_DEICTIC = re.compile(
    r"\b(ca|ceci|cela|ce compte|cet ecran|cette page|ici|le point|resume\w*|synthese|etat des lieux)\b"
)
_CHITCHAT = re.compile(
    r"^(bonjour|bonsoir|salut|hello|coucou|merci( beaucoup| bien)?|ok|okay|d'accord|super|parfait|cool|top|genial|a bientot|au revoir)\b[\s!.?,]*$"
)
_FOLLOWUP = re.compile(r"^(et|aussi|pareil|idem|meme chose|plus|autre|pour|avec|sinon)\b|meme chose")

# Écran (libellé normalisé) → famille que l'écran ouvert rend probable.
_SCREEN_FAMILY: tuple[tuple[str, LayoutFamily], ...] = (
    (r"agenda|calendrier|rendez-vous", LayoutFamily.MEETING_BRIEF),
    (r"contacts?\b|organigramme", LayoutFamily.CONTACTS_LIST),
    (r"fiche|compte actif|detail du compte", LayoutFamily.ACCOUNT_ANALYSIS),
    (r"pilotage|aujourd|plan|actions", LayoutFamily.ACTION_PLAN),
    (r"comptes|portefeuille|decouvrir|decouverte", LayoutFamily.ACCOUNT_MAP),
)


def _screen_of(page_context: str) -> tuple[str, str, bool]:
    """(écran, objet ouvert, filtres présents), lus dans le bloc rendu par l'API."""
    screen = obj = ""
    filters = False
    for line in (page_context or "").splitlines():
        n = _norm(line.lstrip("- ").strip())
        if n.startswith("ecran :"):
            screen = n.split(":", 1)[1].strip()
        elif n.startswith("objet ouvert :"):
            obj = n.split(":", 1)[1].strip()
        elif n.startswith(("filtre", "filtres")) and ":" in n and n.split(":", 1)[1].strip():
            filters = True
    return screen, obj, filters


def _text_scores(norm: str) -> dict[LayoutFamily, int]:
    scores: dict[LayoutFamily, int] = {}
    for family, cues in _CUES.items():
        best = 0
        total = 0
        for pattern, weight in cues:
            if re.search(pattern, norm):
                total += weight
                best = max(best, weight)
        if total:
            scores[family] = min(total, 4) if best >= 3 else min(total, 2)
    tokens = re.findall(r"[a-z]{6,}", norm)
    for family, words in _FUZZY.items():
        if any(SequenceMatcher(None, t, w).ratio() >= 0.85 for t in tokens for w in words):
            scores[family] = max(scores.get(family, 0), 3)
    return scores


def _rank(scores: Mapping[LayoutFamily, int]) -> list[tuple[LayoutFamily, int]]:
    return sorted(scores.items(), key=lambda kv: -kv[1])


def classify_reply_layout(
    message: str,
    *,
    page_context: str = "",
    active_account: str = "",
    filters: Sequence[str] = (),
    history: Sequence[Mapping[str, object]] = (),
) -> LayoutDecision:
    norm = _norm(message)
    if not norm:
        return LayoutDecision(LayoutFamily.CONVERSATIONAL, "conversational")
    if _CHITCHAT.match(norm):
        return LayoutDecision(LayoutFamily.CONVERSATIONAL, "conversational")

    scores = _text_scores(norm)
    ranked = _rank(scores)
    signals: list[str] = ["texte"] if ranked else []
    screen, obj, screen_filters = _screen_of(page_context)
    has_filters = screen_filters or any((f or "").strip() for f in filters)
    screen_family = next((fam for pat, fam in _SCREEN_FAMILY if screen and re.search(pat, screen)), None)
    if screen_family is None and (obj or active_account):
        screen_family = LayoutFamily.ACCOUNT_ANALYSIS

    if ranked:
        top_family, top = ranked[0]
        second = ranked[1] if len(ranked) > 1 else None
        # Le contexte départage deux familles proches, il ne renverse pas un texte franc.
        if second and top - second[1] < 2 and screen_family in (top_family, second[0]):
            winner = screen_family
            scores[winner] += 1
            signals.append("page")
            ranked = _rank(scores)
            top_family, top = ranked[0]
            second = ranked[1] if len(ranked) > 1 else None
        if screen_family == top_family and "page" not in signals:
            signals.append("page")
        if top_family == LayoutFamily.ACCOUNT_ANALYSIS and (obj or active_account):
            signals.append("objet_ouvert")
        if has_filters and top_family in (LayoutFamily.ACCOUNT_MAP, LayoutFamily.PRIORITIZED_SELECTION):
            signals.append("filtres")
        if second and top - second[1] < 2:
            return LayoutDecision(LayoutFamily.GENERIC_RICH_ANSWER, "ambiguous", tuple(signals), top_family)
        if top >= 2 or (screen_family == top_family):
            return LayoutDecision(top_family, "clear", tuple(signals))
        # indice isolé et rien qui le confirme : on ne fige pas une forme
        return LayoutDecision(LayoutFamily.GENERIC_RICH_ANSWER, "ambiguous", tuple(signals), top_family)

    # Aucun marqueur de texte : un déictique se tranche par l'écran / l'objet ouvert.
    if _DEICTIC.search(norm) and screen_family is not None:
        sig = ["page"] if screen else []
        if obj or active_account:
            sig.append("objet_ouvert")
        fam = screen_family
        if fam == LayoutFamily.ACCOUNT_MAP and (obj or active_account):
            fam = LayoutFamily.ACCOUNT_ANALYSIS
        return LayoutDecision(fam, "clear", tuple(sig))

    # Une relance courte reprend la forme de la dernière demande claire du fil.
    if _FOLLOWUP.search(norm) and len(norm.split()) <= 8:
        users = [str(h.get("content") or "") for h in history if h.get("role") == "user"]
        for previous in reversed(users[-3:]):
            prev_ranked = _rank(_text_scores(_norm(previous)))
            if (
                prev_ranked
                and prev_ranked[0][1] >= 3
                and (len(prev_ranked) == 1 or prev_ranked[0][1] - prev_ranked[1][1] >= 2)
            ):
                return LayoutDecision(prev_ranked[0][0], "clear", ("historique",))

    return LayoutDecision(LayoutFamily.GENERIC_RICH_ANSWER, "ambiguous", tuple(signals))


# famille → consigne : QUELLE carte privilégier (celles de REPLY_FORMATS_DIRECTIVE), pas un second contrat.
_FAMILY_DIRECTIVE: dict[LayoutFamily, str] = {
    LayoutFamily.ACCOUNT_MAP: (
        "une CARTOGRAPHIE de comptes : rends une carte `account_ranking` (les `axes` disent selon quoi la carte "
        "est ordonnée : zone, secteur, taille connus), un `why` par compte, et NOMME la couverture — ce que la "
        "carte ne couvre pas va dans `not_evaluated`, une cartographie partielle le dit en tête. Pas de paragraphes."
    ),
    LayoutFamily.PRIORITIZED_SELECTION: (
        "une SÉLECTION PRIORISÉE : rends une carte `account_ranking` du premier au dernier, avec `axes`, `why_now` "
        "et `action` par compte ; aucune probabilité, aucun score nu."
    ),
    LayoutFamily.ACTION_PLAN: (
        "un PLAN D'ACTION : rends une carte `action_plan` (objectif, étapes datées ou ordonnées) ; Laura prépare, "
        "la personne exécute — rien n'est envoyé."
    ),
    LayoutFamily.ACCOUNT_ANALYSIS: (
        "l'ANALYSE D'UN DOSSIER : rends la fiche du compte ouvert en carte `account_card` (ou `verdict` pour une "
        "décision) — jamais une liste de contacts ni un classement."
    ),
    LayoutFamily.MEETING_BRIEF: (
        "la PRÉPARATION D'UN RENDEZ-VOUS : rends une carte `meeting_brief` (objectif, pitch, participants, "
        "points à aborder, questions, risques, inconnues nommées)."
    ),
    LayoutFamily.CONTACTS_LIST: (
        "une LISTE DE CONTACTS : rends une carte `contact_list` (nom, rôle, raison, source) et `missing` pour ce "
        "qui n'est pas connu — jamais la fiche d'analyse du compte."
    ),
    LayoutFamily.COMPARISON: (
        "une COMPARAISON : rends une carte `comparison` (deux à quatre colonnes) ; une case inconnue vaut null, jamais 0."
    ),
    LayoutFamily.WRITING_HELP: (
        "une AIDE RÉDACTIONNELLE : écris le texte demandé (ou une carte `approach` pour un angle d'approche), "
        "prêt à copier ; Laura ne l'envoie jamais."
    ),
    LayoutFamily.SYNTHESIS: (
        "une SYNTHÈSE : une carte `verdict` courte (conclusion, raisons, limites) plutôt qu'un long texte."
    ),
}

_CLARIFY = (
    "SIGNAL DE FORME DE CE TOUR (calculé sur le message, l'écran ouvert, l'objet ouvert, les filtres et le fil — "
    "jamais deviné) : la forme attendue n'est PAS claire. Ne fige aucune carte rigide : réponds en réponse riche "
    "générique (texte structuré, au plus une carte si une forme s'impose d'elle-même) et, si la demande ne peut "
    "pas être servie sans savoir, pose UNE seule question de clarification minimale — jamais deux."
)


def reply_layout_directive(decision: LayoutDecision) -> str:
    """Le bloc ajouté au prompt de CE tour. `""` = prompt inchangé au byte près
    (conversation, message vide) — une cartographie ne se déclenche pas sur « merci »."""
    if decision.clarity == "conversational":
        return ""
    if decision.clarity == "ambiguous":
        return f"\n\n{_CLARIFY}"
    body = _FAMILY_DIRECTIVE.get(decision.family)
    if not body:
        return ""
    return (
        "\n\nSIGNAL DE FORME DE CE TOUR (calculé sur le message, l'écran ouvert, l'objet ouvert, les filtres et le "
        f"fil — jamais deviné) : la personne attend {body} Si la question est finalement factuelle et courte, "
        "réponds en texte : ce signal oriente la forme, il n'impose jamais une carte vide ni un chiffre inventé."
    )
