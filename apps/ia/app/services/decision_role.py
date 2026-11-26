"""Deterministic title → decision-role classification (IT decider).

The LLM assigns a free decision role (sponsor / champion / operational / …) but
is inconsistent at flagging the IT decision-maker an ESN actually sells to. The
dashboard's "≥1 décideur IT" gate checks for the ``technical`` role — which the
LLM never reliably emits — so the badge was always ✗.

This pure classifier reads the job title and deterministically marks the IT
decision-makers (DSI, CTO, RSSI, CIO/CDO, Directeur Informatique / Technique /
Digital, Head of IT / Engineering…) as ``technical``. It's applied on top of the
LLM role so the IT decider always surfaces, regardless of the model's wording —
the deck's TECHNICAL decision role.

Intentionally scoped to the IT decider only (the deck's critical, currently-
missing role). Economic / user / champion stay as the LLM classifies them; a
full deck-taxonomy migration is tracked separately.
"""

from __future__ import annotations

import re

from app.services.hierarchy_level import classify_hierarchy_level

# Title fragments that mark an IT decision-maker. Specific on purpose so finance
# ("Directeur Financier" → economic) and sales ("Directeur Commercial" → user)
# titles do NOT match. "Directeur … Digital/Numérique" IS included — the deck
# explicitly targets the Directeur Digital alongside the DSI/CTO.
_IT_DECIDER_PATTERNS: tuple[str, ...] = (
    r"\b(DSIN?|DOSI)\b",
    r"\bRSSI\b",
    r"\bCTO\b",
    r"\bCIO\b",
    r"\bCDO\b",
    r"\bCISO\b",
    # « Chief AI Officer » / « CAIO » manquaient : l'alternation s'arrêtait au
    # vocabulaire IT de 2020. Mesuré le 03/09/2026 sur le retour de Julien
    # Laszlo — « Chief AI Officer » marquait 5 au pré-tri, « CAIO » marquait 1,
    # là où un « Directeur Digital » marquait 17.
    r"chief\s+(information|technology|digital|data|analytics|ai|artificial\s+intelligence|information\s+security)\s+officer",
    r"\b(CAIO|CDAO)\b",
    # Data / analytics / IA directions are IT deciders too (250-titles doc). NB:
    # a bare "Architecte …" is a prescriber, not a decider — only "Head of
    # Architecture" (a head) is included, so the ≥1-IT-decider gate stays honest.
    r"directeur[\w\sà-ÿ'’.&-]*\b(informatiques?|techniques?|technologies?|digital|num[ée]riques?|data|analytics|[ée]tudes|intelligence\s+artificielle|IA)\b",
    r"directeur[\w\sà-ÿ'’.&-]*\bsyst[èe]mes?\s+(d|num[ée]rique)",  # Directeur des Systèmes d'Information
    r"directrice[\w\sà-ÿ'’.&-]*\b(informatiques?|techniques?|technologies?|digital|num[ée]riques?|data|analytics|[ée]tudes|intelligence\s+artificielle|IA)\b",
    r"directrice[\w\sà-ÿ'’.&-]*\bsyst[èe]mes?\s+(d|num[ée]rique)",
    # Les formes ANGLAISES « Director of … » et « VP … » n'existaient pas du
    # tout, et « head of » ne couvrait ni machine learning, ni GenAI, ni MLOps,
    # ni computer vision. C'est ce trou de FORME — pas un biais hiérarchique —
    # qui faisait tomber 24 intitulés IA/data sur 28 sous le seuil du pré-tri :
    # « Head of AI » marquait déjà 17, « Head of Machine Learning » marquait 4.
    r"\b(head|director|vp|vice\s+president)\s+of\s+"
    r"(it|engineering|architecture|infrastructure|platform|cloud|technology|security"
    r"|ai|artificial\s+intelligence|machine\s+learning|ml|genai|mlops|computer\s+vision"
    r"|analytics|data(\s+science)?)\b",
    # « VP Data & AI », « VP Analytics » — sans le « of ». Volontairement borné
    # aux fonctions techniques : un « VP Sales » n'est pas un décideur IT.
    r"\bvp\s+(ai|data|analytics|technology|engineering|it|platform|infrastructure|security|machine\s+learning)\b",
    r"vp\s+engineering",
    r"responsable[\w\sà-ÿ'’.&-]*\b(informatique|infrastructure|s[éy]curit[ée]\s+(des\s+)?syst|syst[èe]mes?\s+d)",
    r"responsable[\w\sà-ÿ'’.&-]*\bIT\b",  # Responsable IT / IT Operations
    # #4324.1 — intitulés de terrain (retour client 21/10 : le DSI de chaque compte suivi). « Directeur IT »,
    # « Director, IT », « Information Systems Director », « Head of Information Systems », « Directeur
    # Cybersécurité », « Chief Digital & Information Officer » ne tombaient dans aucun motif ci-dessus.
    r"\b(directeur|directrice|director|head|vp|vice\s+president)\b[\w\sà-ÿ,'’.&/-]*\b(IT|IS|information\s+systems?|information\s+technology|information\s+security|cyber\w*)\b",
    r"\binformation\s+(systems?|technology|security)\s+(director|officer|head)\b",
    r"\bchief\b[\w\s,&-]*\b(information|technology|digital)\b[\w\s,&-]*\bofficer\b",
    r"responsable[\w\sà-ÿ'’.&-]*\bcyber\w*\b",
    # « Responsable Data Science » / « Responsable Intelligence Artificielle ».
    # Borné aux SPÉCIALITÉS, jamais au mot « data » seul : « Responsable Data
    # Supply Chain » (vu sur le run KNDS) n'est pas un décideur IT, et le
    # drapeau « ✓ décideur IT présent » du dossier doit rester honnête.
    r"responsable[\w\sà-ÿ'’.&-]*\b(data\s+science|intelligence\s+artificielle|IA|analytics|machine\s+learning)\b",
)

_IT_DECIDER_RE = re.compile("|".join(_IT_DECIDER_PATTERNS), re.IGNORECASE)

# #4324.1 — « Chef de projet DSI », « Chargé de mission DSI », « Assistante de direction DSI » portent le sigle
# d'une direction sans en être le décideur : la FONCTION y est sous la direction, jamais à sa tête. « Directeur
# Achats IT » relève des achats (la même exclusion que l'API, `isTechnicalDeciderTitle`).
_NOT_IT_DECIDER_RE = re.compile(
    r"chef\s+de\s+projet|charg[ée]e?\s+de\s+mission|assistan|gestionnaire|technicien|\bachats?\b",
    re.IGNORECASE,
)

# The deck's IT decision role. Lowercase so the dashboard's
# ``decisionRole.toUpperCase() === 'TECHNICAL'`` gate matches.
TECHNICAL_ROLE = "technical"


def is_it_decider(title: str | None) -> bool:
    """True when the job title marks an IT decision-maker (DSI/CTO/RSSI/…)."""
    text = (title or "").strip()
    return bool(_IT_DECIDER_RE.search(text)) and not _NOT_IT_DECIDER_RE.search(text)


# Interns / apprentices / trainees — never decision-makers and not sellable-to.
# Flagged as noise (bucket "bruit"), never hard-dropped, per the mapping doc's
# rule: "en cas de doute, conserver avec flag plutôt qu'exclure". Deterministic
# and title-based. Scoped to the unambiguous trainee signal — the company-mismatch
# and non-IT-function exclusions in the doc are separate, fuzzier concerns.
# ``\bintern(ship)?\b`` deliberately does NOT match the French "interne"
# (=internal, e.g. "Auditeur interne") nor "international".
_OUT_OF_SCOPE_RE = re.compile(
    "|".join(
        (
            r"\bstagiaire\b",
            r"\balternan(t|te)\b",
            r"\bapprenti(e|ssage)?\b",
            r"\bintern(ship)?\b",
            r"work[-\s]?study",
            r"\btrainee\b",
        )
    ),
    re.IGNORECASE,
)


def is_out_of_scope(title: str | None) -> bool:
    """True when the title marks an intern / apprentice / trainee — flag as noise,
    never treat as a decision-maker (even "Stagiaire DSI")."""
    return bool(_OUT_OF_SCOPE_RE.search((title or "").strip()))


def is_governance(title: str | None) -> bool:
    """True when the title is an L0 governance mandate (board / administrateur /
    conseil), per the hierarchy classifier. Legal governance, not an operational
    buying role — a distant sponsor, rarely the door (annexe organigramme p7/p12)."""
    return classify_hierarchy_level(title) == "governance"


def technical_role_for(title: str | None) -> str | None:
    """Return ``"technical"`` for an IT-decider title, else ``None`` (keep the
    LLM-assigned role)."""
    return TECHNICAL_ROLE if is_it_decider(title) else None


# ── Full deck taxonomy: ECONOMIC / USER / CHAMPION (TECHNICAL above) ─────────
# Deterministic title → deck role. Checked after technical (most specific IT),
# then economic (budget), user (business line), champion (top exec). A title
# that matches none keeps the LLM role (→ effectively "à-vérifier").
_ECONOMIC_RE = re.compile(
    "|".join(
        (
            r"\bCFO\b",
            r"\bDAF\b",
            r"chief\s+financial\s+officer",
            r"chief\s+procurement\s+officer",
            r"directeur[\w\sà-ÿ'’.&-]*financ",  # Directeur Financier / Admin. et Financier
            r"directrice[\w\sà-ÿ'’.&-]*financ",
            r"directeur[\w\sà-ÿ'’.&-]*comptab",  # Directeur Comptable
            r"directrice[\w\sà-ÿ'’.&-]*comptab",
            # Directeur/Directrice Achats = a director with budget authority → economic
            # (a distinct role from the manager-level procurement gate below).
            r"directeur[\w\sà-ÿ'’.&-]*\bachats?\b",
            r"directrice[\w\sà-ÿ'’.&-]*\bachats?\b",
            r"contr[ôo]l[eu]+r?\s+de\s+gestion",  # Contrôleur / Contrôle de gestion
            r"financial\s+controller",
            r"credit\s+manager",
            r"\btr[ée]sor",  # Trésorier ET Responsable Trésorerie
            r"head\s+of\s+finance",
        )
    ),
    re.IGNORECASE,
)
# Procurement / vendor management — the achats GATEKEEPER an ESN must handle
# (deck §7.7 "qui appartient aux achats"). A distinct role from economic (budget
# authority): these run the sourcing/referencing process, they don't own the need.
_PROCUREMENT_RE = re.compile(
    "|".join(
        (
            r"chief\s+procurement\s+officer",
            r"\bCPO\b",
            r"responsable[\w\sà-ÿ'’.&-]*\bachats?\b",  # Responsable Achats (prestations)
            r"\bit\s+procurement\b",
            r"procurement\s+manager",
            r"vendor\s+manager",
            r"supplier\s+manager",
            r"category\s+manager\s+it",
            r"head\s+of\s+(procurement|purchasing)",
            # « Acheteur » ne tombait sous AUCUNE règle et sortait donc `None`
            # (« à vérifier ») — trouvé en écrivant les motifs industriels, où un
            # « Acheteur Industriel » devait précisément rester un acheteur.
            r"\bacheteur(s|se)?\b",
        )
    ),
    re.IGNORECASE,
)
_USER_RE = re.compile(
    "|".join(
        (
            r"direct(?:eur|rice)[\w\sà-ÿ'’.&-]*commercial",
            r"direct(?:eur|rice)[\w\sà-ÿ'’.&-]*marketing",
            r"direct(?:eur|rice)[\w\sà-ÿ'’.&-]*ventes?",
            r"direct(?:eur|rice)[\w\sà-ÿ'’.&-]*op[ée]rations?",
            r"direct(?:eur|rice)[\w\sà-ÿ'’.&-]*production",
            r"direct(?:eur|rice)[\w\sà-ÿ'’.&-]*industriel",
            r"direct(?:eur|rice)[\w\sà-ÿ'’.&-]*\busine",  # Directeur d'usine
            r"direct(?:eur|rice)\s+(?:de\s+|d')?site\b",  # Directeur de site
            r"direct(?:eur|rice)[\w\sà-ÿ'’.&-]*(supply\s+chain|logistique)",
            r"direct(?:eur|rice)[\w\sà-ÿ'’.&-]*e-?commerce",
            r"direct(?:eur|rice)[\w\sà-ÿ'’.&-]*m[ée]tier",
            r"direct(?:eur|rice)[\w\sà-ÿ'’.&-]*business",
            r"responsable[\w\sà-ÿ'’.&-]*m[ée]tier",
            r"business\s+unit\s+manager",
            r"plant\s+manager",
            r"\bCMO\b",
            r"chief\s+marketing\s+officer",
            r"head\s+of\s+(sales|marketing|operations|business)",
        )
    ),
    re.IGNORECASE,
)
_CHAMPION_RE = re.compile(
    "|".join(
        (
            r"\bCEO\b",
            r"\bCOO\b",
            r"\bP-?DG\b",
            r"\bDGA?\b",
            r"chief\s+executive",
            r"chief\s+(strategy|transformation|operating)\s+officer",
            r"managing\s+director",
            r"country\s+manager",
            r"pr[ée]sident",
            r"directeur\s+g[ée]n[ée]ral",
            r"directrice\s+g[ée]n[ée]rale",
            r"directeur[\w\sà-ÿ'’.&-]*transformation",  # Directeur de la Transformation
            r"directrice[\w\sà-ÿ'’.&-]*transformation",
            r"direct(?:eur|rice)\s+(pays|r[ée]gional)",
            r"secr[ée]taire\s+g[ée]n[ée]ral",
            r"\bg[ée]rant",
        )
    ),
    re.IGNORECASE,
)


# ── Décideurs techniques INDUSTRIELS (addendum Stelya §10) ──────────────────
#
# Le classifieur ne connaissait que le décideur IT. Pour une société de conseil
# en ingénierie industrielle, la chaîne de décision est autre : direction
# technique, bureau d'études, méthodes, industrialisation, qualité, maintenance,
# automatisme, R&D, production. Rangés `user` par les règles historiques, ils
# passaient derrière un acheteur — l'inverse exact de ce que le retour bêta
# demande (« Achats et RH sont des gatekeepers secondaires sauf preuve
# contraire »).
#
# ⚠️ Ces motifs ne s'appliquent QUE pour un vendeur industriel (`industrial=True`).
# Pour une ESN IT, un directeur d'usine n'est pas un décideur — sa DSI l'est —
# et les activer par défaut aurait changé le classement de tous les clients
# existants.
#
# ⚠️ Ils sont volontairement ANCRÉS sur la fonction et non sur l'adjectif
# « industriel » : « Directeur des Achats Industriels » doit rester un acheteur.
# C'est pourquoi `\bindustriel` n'apparaît qu'accolé à « directeur/directrice »
# et que la règle achats est évaluée AVANT (voir `classify_decision_role`).
_INDUSTRIAL_DECIDER_PATTERNS: tuple[str, ...] = (
    # Direction technique et industrielle
    r"directeur[\w\sà-ÿ'’.&-]*\btechniques?\b",
    r"directrice[\w\sà-ÿ'’.&-]*\btechniques?\b",
    r"direct(eur|rice)[\w\sà-ÿ'’.&-]*industriel",
    r"direct(eur|rice)[\w\sà-ÿ'’.&-]*\busine\b",
    r"direct(eur|rice)[\w\sà-ÿ'’.&-]*production",
    r"\bplant\s+manager\b",
    r"\bsite\s+manager\b",
    r"\bchief\s+engineer\b",
    r"\bVP\s+engineering\b",
    # Bureau d'études et conception
    r"bureau\s+d['’]?\s*[ée]tudes?",
    r"\bBE\b",
    r"design\s+office",
    r"responsable[\w\sà-ÿ'’.&-]*conception",
    r"\bhead\s+of\s+design\b",
    # Méthodes, industrialisation, production
    r"\bm[ée]thodes?\b",
    r"industrialisation",
    r"manufacturing\s+engineering",
    r"\bNPI\b",
    r"process\s+engineer",
    # Qualité et validation
    r"respons(able|ible)[\w\sà-ÿ'’.&-]*qualit[ée]",
    r"direct(eur|rice)[\w\sà-ÿ'’.&-]*qualit[ée]",
    r"supplier\s+quality",
    r"quality\s+manager",
    r"\bIVVQ\b",
    # Maintenance, fiabilité, actifs
    r"\bmaintenance\b",
    r"fiabilit[ée]",
    r"\bMRO\b",
    r"asset\s+manager",
    r"reliability\s+manager",
    # Automatisme et contrôle-commande
    r"automatisme",
    r"contr[ôo]le[-\s]commande",
    r"automation\s+manager",
    # R&D et innovation produit
    r"direct(eur|rice)[\w\sà-ÿ'’.&-]*R\s*&\s*D",
    r"\bR\s*&\s*D\s+manager\b",
    # HSE et sécurité industrielle
    r"\bHSE\b",
    r"\bEHS\b",
    r"s[ée]curit[ée]\s+industrielle",
    # Adaptation sectorielle Automobile — programme/safety (#2311.21, épopée
    # #2791). Mesuré avant d'écrire : le pack industriel générique ci-dessus ne
    # couvrait ni la direction de programme (porte les arbitrages fournisseurs
    # d'un programme véhicule) ni la sécurité produit/fonctionnelle (porte les
    # exigences ISO 26262 opposables au fournisseur) — ces titres tombaient
    # `to_qualify`. Ancré sur RESPONSABLE/MANAGER/DIRECTEUR : un « Ingénieur
    # Sécurité Fonctionnelle » qui applique la norme reste `user_buyer`, seul
    # celui qui porte l'arbitrage devient décideur.
    r"direct(eur|rice)[\w\sà-ÿ'’.&-]*programme",
    r"responsable[\w\sà-ÿ'’.&-]*programme",
    r"\bprogram\s+director\b",
    r"\bsafety\s+manager\b",
    r"responsable[\w\sà-ÿ'’.&-]*s[ée]curit[ée]\s+produit",
    r"\bproduct\s+safety\s+manager\b",
    r"\bfunctional\s+safety\s+manager\b",
    # Adaptation sectorielle Pharma — validation/procédés (#2311.22, épopée
    # #2791). Mesuré avant d'écrire : « Ingénieur Validation »/« Ingénieur
    # Procédés » tombaient déjà `user` (fonction opérationnelle, correct et
    # inchangé ici), mais les rôles réglementaires qui PORTENT l'arbitrage
    # pharma — Personne Qualifiée (QP, seule habilitée à libérer un lot en UE),
    # pharmacovigilance, affaires réglementaires, assurance qualité — tombaient
    # `to_qualify`.
    r"\bqualified\s+person\b",
    r"personne\s+qualifi[ée]e",
    r"responsable[\w\sà-ÿ'’.&-]*pharmacovigilance",
    r"responsable[\w\sà-ÿ'’.&-]*affaires\s+r[ée]glementaires",
    r"\bregulatory\s+affairs\s+manager\b",
    r"\bhead\s+of\s+quality\s+assurance\b",
    r"\bQA\s+manager\b",
)

_INDUSTRIAL_DECIDER_RE = re.compile("|".join(_INDUSTRIAL_DECIDER_PATTERNS), re.IGNORECASE)


def is_industrial_decider(title: str | None) -> bool:
    """True quand le titre marque un décideur TECHNIQUE industriel.

    Factuel et sans effet par lui-même : c'est `classify_decision_role` qui
    décide d'en tenir compte, et seulement pour un vendeur industriel.
    """
    return bool(_INDUSTRIAL_DECIDER_RE.search((title or "").strip()))


def classify_decision_role(title: str | None, *, industrial: bool = False) -> str | None:
    """Map a job title to the deck decision role
    (``technical`` | ``economic`` | ``procurement`` | ``user`` | ``champion``) or
    ``None`` when no rule fires (the LLM role is then kept). Technical wins first
    (an IT title is the priority signal); procurement before economic so a "Vendor
    Manager" reads as the achats gate, not a budget owner; economic before champion
    so a "DGA Finances" reads as budget, not just a top exec."""
    t = (title or "").strip()
    if not t:
        return None
    # An intern/apprentice is never a forced decider — guard BEFORE is_it_decider
    # so "Stagiaire DSI" doesn't wrongly satisfy the ≥1-IT-decision-maker gate.
    if is_out_of_scope(t):
        return None
    # Board / administrateur = L0 gouvernance (annexe organigramme p12): legal
    # governance, NOT an operational buying role. Never force it into economic /
    # champion by default — so a "Président du conseil d'administration" is no longer
    # mislabelled a champion, and legal mandataires stay out of the buying committee.
    if is_governance(t):
        return None
    if is_it_decider(t):
        return TECHNICAL_ROLE
    # Les achats restent des achats, MÊME pour un vendeur industriel : « Directeur
    # des Achats Industriels » porte le mot « industriel » sans être un porteur
    # technique, et le promouvoir enverrait le premier message à la mauvaise
    # personne — la faute que le retour bêta demande précisément d'éviter.
    if _PROCUREMENT_RE.search(t):
        return "procurement"
    if _ECONOMIC_RE.search(t):
        return "economic"
    # La chaîne technique d'un industriel, UNIQUEMENT pour un vendeur industriel.
    #
    # APRÈS achats ET budget, et c'est le test qui l'a imposé : « Directeur des
    # Achats Industriels » porte le mot « industriel » sans être un porteur
    # technique. Placée plus haut, la règle le promouvait décideur technique —
    # exactement la faute que le retour bêta demande d'éviter (envoyer le premier
    # message à l'acheteur en croyant parler au métier).
    if industrial and is_industrial_decider(t):
        return TECHNICAL_ROLE
    if _USER_RE.search(t):
        return "user"
    if _CHAMPION_RE.search(t):
        return "champion"
    return None
