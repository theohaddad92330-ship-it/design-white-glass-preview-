"""#4438 — LAURA AGIT AU LIEU DE DEMANDER, VA AU BOUT, PARLE PEU.

Décision Louis 21/10/2026, née de l'audit des conversations réelles (30 jours,
commentaire sur #4438) : 63 % de réponses ratées, 78,5 % chez les externes.
Trois familles visées ici, côté consigne :

* (a) elle proposait d'élargir au lieu de le faire (26 %) ;
* (b) un zéro ou un résultat maigre rendu tel quel (15 %) ;
* (c) trop long (29 % au-delà de 250 mots, médiane 132 mots depuis le 08/10).

La quatrième (g, la tranche partielle qui propose la suite) se tient dans le
CODE (`chat_turn_plan.RESEARCH_TOOL_ROUNDS`, `continues_alone`), pas ici : une
consigne seule élargit au hasard (#3343).

Ce module tient aussi les deux mesures que la porte qualité IA rejoue
(`evals/promptfoo/asserts.py:laura_acts`) : le plafond de prose et le motif
d'une question d'élargissement. Un réglage, un seul endroit (GA-26) : le prompt
et l'assertion lisent la MÊME constante.
"""

from __future__ import annotations

import re

#: #4438.3 — hors listes, cartes et blocs structurés, la prose d'une réponse
#: tient en 120 mots au plus (décision Louis 21/10).
CHAT_PROSE_MAX_WORDS = 120

BLOCK_LAURA_ACTS = f"""TU AGIS AU LIEU DE DEMANDER (#4438) — chaque réponse apporte un résultat.
ZÉRO OU MAIGRE : tu élargis TOI-MÊME, dans CE tour, sans demander — la zone (ville vers département puis région), la compétence (vers ses voisines), le secteur (vers le secteur voisin), la taille, le signal — et tu rends le résultat, avec UNE ligne qui dit ce que tu as élargi (« Toulouse seule en donnait 4, j'ai élargi à l'Occitanie. »). Jamais « tu veux que j'élargisse ? », jamais « si tu le souhaites », jamais « je peux poursuivre ». Tu ne supprimes jamais une contrainte que la personne a posée comme ferme : tu élargis autour d'elle, et tu le dis.
L'IMPLICITE SE FAIT : chercher, croiser, ouvrir une fiche, préparer un brouillon partent sans confirmation. Restent derrière un geste humain : l'envoi (un message est PRÉPARÉ, jamais envoyé), l'écriture CRM/ERP, une dépense au-delà des plafonds, et ce que l'outil lui-même garde derrière un clic. Une question seulement quand l'ambiguïté CHANGE le résultat (deux entreprises homonymes) — sinon tu retiens le sens le plus probable et tu le dis en une ligne.
RIEN DANS L'ESPACE N'EST UNE FIN (R22) : un outil à zéro ou en échec, tu appelles le palier suivant DANS ce tour (recherche externe, secteur voisin, zone voisine) avant d'écrire, et le palier se nomme en UNE phrase courte. Une réponse ne finit jamais sur « reste à faire » ni « restent à faire ».
TU PARLES PEU : le résultat d'abord, sans préambule ni récapitulatif. Hors listes, cartes et blocs structurés, {CHAT_PROSE_MAX_WORDS} mots de prose au plus. Jamais « je peux continuer » ni « je peux élargir » en fin de réponse : SEULEMENT si un travail est réellement en cours (une analyse lancée ce tour, une reprise en fond), une ligne le dit (« Je poursuis sur le reste. ») — jamais sinon. Jamais « dès que l'outil sera disponible » : un outil qui n'a pas échoué n'est pas indisponible, tu l'appelles."""

# Une question qui propose d'élargir, de continuer, ou qui fait choisir un
# critère avant d'avoir cherché — les formes relevées dans l'audit du 21/10.
_WIDENING_OR_CONTINUING = re.compile(
    r"(?:"
    r"(?:tu veux|veux-tu|souhaites-tu|voulez-vous|tu pr[ée]f[èe]res)\b[^.?!\n]*\?"
    r"|si tu (?:le )?(?:souhaites|veux)\b"
    r"|si vous (?:le )?(?:souhaitez|voulez)\b"
    r"|je peux (?:poursuivre|continuer|[ée]largir|relancer)\b[^.!\n]*(?:\?|si\b)"
    r"|(?:quel|quelle|quels|quelles) (?:signal|crit[èe]re|zone|r[ée]gion|secteur|taille)\b[^.?!\n]*\?"
    r"|\b[ée]largi\w*[^.!\n]*\?"
    r")",
    re.IGNORECASE,
)


def asks_to_widen_or_continue(text: str | None) -> bool:
    """La réponse propose-t-elle d'élargir ou de continuer au lieu de le faire ?"""
    return bool(_WIDENING_OR_CONTINUING.search(text or ""))


# Ce qui n'est PAS de la prose : une ligne de liste (puce ou numéro), une ligne
# de tableau, un titre, et tout ce qui se trouve dans un bloc de code.
_STRUCTURED_LINE = re.compile(r"^\s*(?:[-*•]|\d+[.)]|\||#)")
_FENCE = re.compile(r"^\s*```")


def prose_word_count(text: str | None) -> int:
    """Les mots de PROSE de la réponse — listes, tableaux, titres et blocs exclus."""
    words = 0
    in_fence = False
    for line in (text or "").splitlines():
        if _FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence or _STRUCTURED_LINE.match(line):
            continue
        words += len(line.split())
    return words


# R22-LG (recette prod 22/10, #4438) — la FIN d'une réponse : la phrase-gabarit
# « Et derrière ta question… Je peux le qualifier avec toi » (2 réponses sur 3),
# une question de relance (« tu veux que j'élargisse ? ») ou « reste à faire ».
# Une consigne ne suffit pas (#3393 Y3 l'a prouvé dans l'autre sens) : le retrait
# est fait en sortie, déterministe — seule la dernière phrase, jamais le résultat.
_HIDDEN_QUESTION_TEMPLATE = re.compile(r"[ \t]*(?:Et\s+)?derri[èe]re\s+ta\s+question,[^\n]*", re.IGNORECASE)
_RELAUNCH_SENTENCE = re.compile(
    r"(?:"
    r"^(?:et\s+)?(?:tu veux|veux-tu|souhaites-tu|tu souhaites|tu pr[ée]f[èe]res|pr[ée]f[èe]res-tu|je peux|"
    r"je te (?:propose|pr[ée]pare)|dois-je|on (?:lance|regarde|continue)|est-ce que je)\b[^\n]*\?$"
    r"|\breste(?:nt)?\s+[àa]\s+faire\b"
    r"|\bje peux le qualifier avec toi\b"
    r")",
    re.IGNORECASE,
)
_SENTENCE_END = re.compile(r"(?<=[.?!…])\s+")


def _is_relaunch(sentence: str) -> bool:
    text = sentence.strip().strip("*_").strip()
    return bool(text) and (bool(_RELAUNCH_SENTENCE.search(text)) or asks_to_widen_or_continue(text))


def strip_relaunch_tail(reply: str, *, actions: object = ()) -> str:
    """Retire la phrase-gabarit et la relance qui TERMINENT une réponse.

    Une précision posée en carte (`clarification`, `reply_options`) n'est pas une
    relance : rien n'est touché. Une réponse qui ne serait plus rien est rendue
    telle quelle (la question est alors toute la réponse)."""
    text = reply or ""
    if not text.strip():
        return reply
    for action in actions or ():
        if isinstance(action, dict) and (action.get("clarification") or action.get("reply_options")):
            return reply
    lines = re.sub(r"\n{3,}", "\n\n", _HIDDEN_QUESTION_TEMPLATE.sub("", text)).rstrip().split("\n")
    while lines:
        if not lines[-1].strip():
            lines.pop()
            continue
        sentences = _SENTENCE_END.split(lines[-1].strip())
        if not _is_relaunch(sentences[-1]):
            break
        rest = " ".join(sentences[:-1]).strip()
        if rest:
            lines[-1] = rest
        else:
            lines.pop()
    kept = "\n".join(lines).rstrip()
    if not kept.strip():
        return reply
    return kept if kept != text.rstrip() else reply


# R22-LG (#4429.3 PARTIAL, recette prod 22/10) — le palier d'ÉLARGISSEMENT appliqué par le registre se dit
# en UNE phrase courte. Le registre le rend (`zone_line`, étiquette `widened` par compte) ; le modèle
# l'omettait. La phrase vient de la sortie de l'outil, jamais devinée.
_WIDENING_MARK = re.compile(r"[ée]larg", re.IGNORECASE)
_WIDENED_LABELS_MAX = 3


def widening_line_from_output(output: object) -> str | None:
    """La phrase du palier d'une sortie de recherche, ou ``None`` quand rien n'a été élargi.

    #4433 (c133) — zone ET compétence élargies dans la même recherche : UNE phrase qui dit les deux, jamais la zone
    seule (les voisines élargies ou tentées en vain se nomment aussi)."""
    if not isinstance(output, dict) or output.get("error"):
        return None
    # #4288.1 — le palier SECTORIEL de l'étape « espace » : choisi et nommé par le code, dit tel quel avant la liste.
    sector_line = str(output.get("sector_widening_line") or "").strip()
    if sector_line:
        return sector_line
    zone_line = str(output.get("zone_line") or "").strip()
    # #4434.3 — la compétence élargie à ses voisines : elles se NOMMENT (jamais « élargi par thème » sans voisin).
    steps = [str(s).strip() for s in output.get("widening_steps") or [] if str(s).strip()]
    tried = [str(t).strip() for t in output.get("widening_tried") or [] if str(t).strip()]
    if zone_line:
        if steps:
            return f"{zone_line.rstrip('.')} ; et aux compétences voisines (" + " ; ".join(steps) + ")"
        if tried and not output.get("items"):
            head = zone_line.rstrip(".")
            return f"{head} ; rien non plus sur les compétences voisines tentées (" + ", ".join(tried[:6]) + ")"
        return zone_line
    if steps:
        return "Peu de comptes sur la compétence exacte : j'ai élargi aux compétences voisines (" + " ; ".join(steps) + ")"
    if tried and not output.get("items"):
        return (
            "Aucune offre récente sur la compétence exacte, et rien non plus sur ses voisines que j'ai tentées ("
            + ", ".join(tried[:6])
            + ")"
        )
    items = output.get("items")
    labels = list(
        dict.fromkeys(
            str(item.get("widened")).strip()
            for item in items or ()
            if isinstance(item, dict) and str(item.get("widened") or "").strip()
        )
    )
    if not labels:
        # #4429.3 — rien d'élargi : la zone cherchée (rayon posé, ville seule) se dit quand le code l'a rendue.
        return str(output.get("reach_line") or "").strip() or None
    # #4408 — « N comptes ; élargi à <palier> » : le nombre est celui de la liste RENDUE, le palier est annoncé (Laura
    # agit, elle ne demande jamais s'il faut élargir — décision du 21/10, #4433).
    count = len(items)
    return f"{count} compte{'' if count == 1 else 's'} ; élargi à " + ", ".join(labels[:_WIDENED_LABELS_MAX])


#: #4434.3 — les phrases d'élargissement PAR COMPÉTENCE : « élargi » ne suffit pas, les voisines se nomment.
#: #4433 — la phrase fondue zone + compétence porte ses voisines après ce marqueur.
_FUSED_NEIGHBOURS = "compétences voisines ("
_SKILL_WIDENING_STARTS = ("Peu de comptes sur la compétence exacte", "Aucune offre récente sur la compétence exacte")


def _names_the_neighbours(line: str, prose: str) -> bool:
    """Une phrase de palier par compétence est DITE quand la prose nomme au moins une voisine ; les autres paliers
    (zone, secteur, taille) restent dits dès que la prose parle d'élargissement."""
    if not (line.startswith(_SKILL_WIDENING_STARTS) or _FUSED_NEIGHBOURS in line):
        return True
    inside = line[line.rfind("(") + 1 :].rstrip(") ") if "(" in line else ""
    names = [n.strip().casefold() for n in re.split(r"[;,]", inside) if n.strip()]
    folded = prose.casefold()
    return any(name in folded for name in names)


_REACH_PREFIX = "Zone cherchée"


def _reach_said(line: str, prose: str) -> bool:
    """#4429.3 — la zone cherchée est DITE quand la prose nomme son rayon (« 25 km ») ou la ville seule."""
    km = re.search(r"(\d+)\s*km", line)
    if km:
        return re.search(rf"\b{km.group(1)}\s*km", prose, re.IGNORECASE) is not None
    return re.search(r"\bseule?\b", prose, re.IGNORECASE) is not None


def ensure_widening_line(reply: str, actions: list) -> str:
    """Pose la phrase du palier en tête quand la réponse ne dit aucun élargissement.

    Retire TOUJOURS la clé de travail ``widening_line`` des actions : elle ne voyage jamais vers l'écran."""
    lines = [
        str(action.pop("widening_line"))
        for action in actions or ()
        if isinstance(action, dict) and action.get("widening_line")
    ]
    # #4429.3 — la PROSE seule dit le palier : le mot « élargi » d'une carte de couverture (bloc ```) ne compte pas.
    prose = _FENCED.sub(" ", reply or "")
    if not lines or not prose.strip():
        return reply
    if lines[0].startswith(_REACH_PREFIX):
        return reply if _reach_said(lines[0], prose) else f"{lines[0].rstrip('.')}.\n\n{reply.lstrip()}"
    if _WIDENING_MARK.search(prose) and _names_the_neighbours(lines[0], prose):
        return reply
    return f"{lines[0].rstrip('.')}.\n\n{reply.lstrip()}"


# #4421.1 (recette prod 22/10) — « trouve-moi des missions » pour un consultant : AUCUNE ligne d'annonce. La
# fiche lue (`retained`) existe dans la sortie de l'outil, mais le modèle l'omettait : la ligne est posée par le CODE.
_ANNOUNCE_MARK = re.compile(r"\bretenu", re.IGNORECASE)
_FENCED = re.compile(r"```.*?```", re.DOTALL)


def _fr_date(value: object) -> str | None:
    match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", str(value or "")[:10])
    return f"{match.group(3)}/{match.group(2)}/{match.group(1)}" if match else None


def announce_line_from_output(tool: str, output: object) -> str | None:
    """UNE ligne « J'ai retenu… » d'une sortie `find_accounts_for_talent` : compétences, zone, disponibilité — et,
    quand le volume demandé n'était pas tenu, les paliers tentés. Une valeur absente ne fait aucun segment."""
    if tool != "find_accounts_for_talent" or not isinstance(output, dict) or output.get("status") != "ok":
        return None
    retained = output.get("retained")
    if not isinstance(retained, dict):
        return None
    from app.services.geo_labels import department_name

    parts: list[str] = []
    skills = [str(s).strip() for s in retained.get("skills") or [] if str(s).strip()]
    if skills:
        parts.append(", ".join(skills[:6]))
    zones = [str(z).strip() for z in retained.get("zones") or [] if str(z).strip()]
    if zones:
        labelled = [f"{name} ({z})" if (name := department_name(z)) else z for z in zones[:3]]
        parts.append(", ".join(labelled) + (" …" if len(zones) > 3 else ""))
    since = _fr_date(retained.get("available_from"))
    if since:
        parts.append(f"disponible dès le {since}")
    elif retained.get("availability") == "available":
        parts.append("disponible")
    if not parts:
        return None
    consultant = output.get("consultant")
    name = str(consultant.get("name") or "").strip() if isinstance(consultant, dict) else ""
    line = f"J'ai retenu{f' pour {name}' if name else ''} : " + " · ".join(parts) + "."
    widening = [str(w).strip() for w in output.get("widening") or [] if str(w).strip()]
    if widening:
        line += " J'ai élargi pour tenir le volume : " + " ; ".join(widening) + "."
    return line


def ensure_announce_line(reply: str, actions: list) -> str:
    """Pose la ligne d'annonce en tête quand la prose ne dit pas déjà ce qui a été retenu.

    Retire TOUJOURS la clé de travail ``announce_line`` des actions : elle ne voyage jamais vers l'écran."""
    lines = [
        str(action.pop("announce_line"))
        for action in actions or ()
        if isinstance(action, dict) and action.get("announce_line")
    ]
    if not lines or not (reply or "").strip() or _ANNOUNCE_MARK.search(_FENCED.sub(" ", reply)):
        return reply
    return f"{lines[-1]}\n\n{reply.lstrip()}"


# #4430.9 / #4429 (recette prod 22/10) — sur 5 résultats, 4 citaient une offre SANS sa date. Laura reçoit déjà la date
# de chaque offre (`signals[].date`, `needs[].date`) : le code la pose à côté de toute offre citée par son intitulé.
_DATE_IN_LINE = re.compile(
    r"\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b"
    r"|\b\d{1,2}(?:er)?\s+(?:janv|f[ée]vr|mars|avr|mai|juin|juil|ao[uû]t|sept|oct|nov|d[ée]c)\w*",
    re.IGNORECASE,
)
_OFFER_TITLE_MIN_CHARS = 10
_OFFER_DATES_MAX = 60


def offer_dates_from_output(tool: str, output: object) -> list[tuple[str, str]]:
    """``[(intitulé de l'offre, date ISO)]`` d'une sortie de recherche : les signaux datés de `run_account_search`
    et les besoins de `find_accounts_for_talent`. Une offre sans date n'a rien à poser : elle n'est pas listée."""
    if not isinstance(output, dict) or output.get("error"):
        return []
    found: list[tuple[str, str]] = []

    def _add(title: object, date: object) -> None:
        text = str(title or "").strip()
        text = text.split("—", 1)[1].strip() if "—" in text else text
        iso = str(date or "")[:10]
        if len(text) >= _OFFER_TITLE_MIN_CHARS and re.fullmatch(r"\d{4}-\d{2}-\d{2}", iso):
            found.append((text, iso))

    if tool == "run_account_search":
        for item in output.get("items") or ():
            for signal in item.get("signals") or () if isinstance(item, dict) else ():
                if isinstance(signal, dict):
                    _add(signal.get("label"), signal.get("date"))
    elif tool == "find_accounts_for_talent":
        for account in output.get("accounts") or ():
            for need in account.get("needs") or () if isinstance(account, dict) else ():
                if isinstance(need, dict):
                    _add(need.get("title"), need.get("date"))
    return found[:_OFFER_DATES_MAX]


def ensure_offer_dates(reply: str, actions: list) -> str:
    """Pose « (jj/mm/aaaa) » après chaque offre citée par son intitulé dans la PROSE quand sa ligne ne porte aucune
    date. Retire TOUJOURS la clé de travail ``offer_dates`` des actions. Les cartes (blocs ```) ne sont pas touchées."""
    offers: list[tuple[str, str]] = []
    for action in actions or ():
        if isinstance(action, dict) and action.get("offer_dates"):
            offers.extend(action.pop("offer_dates"))
    if not offers or not (reply or "").strip():
        return reply
    out_lines: list[str] = []
    in_fence = False
    for line in reply.split("\n"):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
        elif not in_fence and not _DATE_IN_LINE.search(line):
            for title, iso in offers:
                match = re.search(re.escape(title), line, flags=re.IGNORECASE)
                if match:
                    line = f"{line[: match.end()]} ({_fr_date(iso)}){line[match.end() :]}"
                    break
        out_lines.append(line)
    return "\n".join(out_lines)


# R22-LG (#4421.2 FAIL, recette prod 22/10) — « trouve-moi des missions » SANS consultant désigné : Laura
# reposait « pour un consultant précis ou… ? ». c124 : elle bascule SEULE vers les missions du MARCHÉ.
# Un consultant désigné (objet de la conversation, page de fiche, nom ou « ce profil » dans la demande) garde
# `find_accounts_for_talent` (`_BLOCK_NEVER_STOPS`) : ce bloc se tait.
_MISSIONS_REQUEST = re.compile(
    r"\b(?:trouv\w*|cherch\w*|recherch\w*|donne[- ]?moi|sors[- ]?moi|list\w*|quel(?:le)?s?|find|show)\b"
    r"[^.?!\n]{0,40}\bmissions?\b",
    re.IGNORECASE,
)
# « missions qui finissent / à renouveler » est le portefeuille (`search_missions`), pas le marché.
_PORTFOLIO_MISSIONS = re.compile(
    r"\b(?:finiss\w*|termin\w*|[ée]ch[ée]ance|renouvel\w*|en cours|ending|renewal)\b", re.I
)
_CONSULTANT_NAMED = re.compile(
    r"\bmissions?\b[^.?!\n]{0,20}\b(?:pour|for)\s+(?:ce|cette|le|la|mon|ma|this|my|[A-ZÀ-Ý][\w'’-]+)"
    r"|\b(?:consultant|consultante|profil|talent|cv|candidat)\b",
    re.IGNORECASE,
)
_CONSULTANT_PAGE = re.compile(r"\b(?:consultant|talent|vivier|cv)\b", re.IGNORECASE)

_BLOCK_MARKET_MISSIONS = """MISSIONS DU MARCHÉ (#4421, c124) — aucun consultant n'est désigné : tu ne demandes PAS pour quel consultant, et tu ne poses aucune question. Tu bascules SEULE vers les missions ouvertes du marché, dans CE tour : `run_account_search` avec `signals: ["hiring"]` (les comptes qui recrutent), l'offre de l'ESN comme lentille et la zone de son profil par défaut. Chaque compte rendu cite son offre DATÉE (intitulé, date) ; sur chacun, la carte porte le geste « Préparer le mail » au recruteur — préparé, jamais envoyé. UNE ligne dit ce que tu as retenu (« Sans consultant précis, voici les missions ouvertes du marché sur ton offre. »)."""


def market_missions_turn_block(message: str | None, *, scope_object: str = "", page_context: str = "") -> str:
    """La consigne du tour « trouve-moi des missions » sans consultant désigné, ou ``""``."""
    text = (message or "").strip()
    if not text or not _MISSIONS_REQUEST.search(text) or _PORTFOLIO_MISSIONS.search(text):
        return ""
    if (scope_object or "").strip() or _CONSULTANT_PAGE.search(page_context or "") or _CONSULTANT_NAMED.search(text):
        return ""
    return "\n\n" + _BLOCK_MARKET_MISSIONS


# #4438.2 (recette prod 23/10) — « liste complète des ESN concurrentes chez Airbus avec leurs contacts » : la
# réponse rendait sa tranche SANS la ligne qui dit ce qui continue en fond. Le tour final l'y invitait par une
# consigne au modèle ; la ligne est désormais posée par le CODE, et seulement quand un travail continue VRAIMENT
# (#4462.6 : jamais « Je poursuis » sans reprise derrière).
CONTINUES_LINE = "Je poursuis sur le reste."
_CONTINUES_MARK = re.compile(r"\bpoursui|\bje continue\b|\ben fond\b|\bcontinue(?:nt)? seule?s?\b", re.IGNORECASE)


def ensure_continues_line(reply: str, continues: bool) -> str:
    """Ajoute « Je poursuis sur le reste. » à une tranche dont la suite part seule, si la prose ne le dit pas.

    Rien ne continue → la réponse est rendue telle quelle (et ne promet pas de suite). La prose seule compte : le
    mot d'une carte de couverture (bloc ```) ne tient pas lieu de ligne."""
    if not continues or not (reply or "").strip():
        return reply
    if _CONTINUES_MARK.search(_FENCED.sub(" ", reply)):
        return reply
    return f"{reply.rstrip()}\n\n{CONTINUES_LINE}"
