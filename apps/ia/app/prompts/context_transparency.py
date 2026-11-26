"""Transparence du contexte du chatbot (P0 démo).

Construit un objet STRUCTURÉ décrivant, pour chaque réponse du copilote :
  - `active`   : ce qui A réellement été fourni au modèle (profil ESN, compte
                 résolu, nb de contacts, plan, portefeuille, mémoire).
  - `sources`  : les documents de la base de connaissance effectivement injectés
                 dans le prompt (titres) — les « outils/sources utilisés ».
  - `not_consulted` : ce qui n'a PAS été consulté/croisé (CRM, LinkedIn, signaux
                 archivés…), calculé à partir de l'ÉTAT RÉEL des intégrations
                 (résolu côté API, transmis ici) — jamais inventé.

Règle d'or : on ne prétend JAMAIS avoir croisé une source non fournie. Un beta
testeur ne doit pas croire que Bellum a interrogé HubSpot alors qu'il ne l'a pas
fait. La transparence vient des DONNÉES (cet objet), pas d'un texte du modèle.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from app.prompts.bellum_advisor import _pinned_memory_fields
from app.prompts.laura_method_signal import resolve_5p_method_signal, resolve_opening_method_signal

# Aucun nom d'éditeur tiers dans les libellés rendus au commercial (addendum
# final p12 « ne jamais révéler les fournisseurs », décision Louis 02/08 : les
# noms ne subsistent que sur l'écran Réglages › Intégrations, là où
# l'utilisateur AUTORISE lui-même l'accès). Ailleurs on nomme la CAPACITÉ.
_CRM_GENERIC_LABEL = "votre CRM"
#: Même libellé en tête de phrase. `str.capitalize()` ne convient pas : il
#: rabaisserait « CRM » en « Crm ».
_CRM_GENERIC_LABEL_SENTENCE = "Votre CRM"
# #1958.10 — mêmes libellés, en anglais : la langue de l'INTERFACE (#1958.8),
# jamais devinée depuis le texte de l'utilisateur.
_CRM_GENERIC_LABEL_EN = "your CRM"
_CRM_GENERIC_LABEL_SENTENCE_EN = "Your CRM"

# Actions proposables sur un élément NON consulté (restitution V2 §13 : « cliquer
# sur un élément manquant pour le connecter »). Une action n'est émise que si un
# écran RÉEL lui correspond côté web — jamais un lien vers un écran fantôme.
_ACTION_CONNECT_CRM = "connect_crm"
_ACTION_ADD_KNOWLEDGE = "add_knowledge"
_ACTION_ANALYSE_ACCOUNT = "analyse_account"
# #2145.23 (via #2925) — l'écran existe déjà (`/settings/integrations`, la même
# destination que `connect_crm`) : seule la messagerie n'avait pas sa ligne.
_ACTION_CONNECT_EMAIL = "connect_email"

#: La SEULE surface client d'un interrupteur d'arrêt (D169, D243).
#:
#: Pourquoi celle-là et pas les vingt-deux autres : quand ``CHAT_TOOLS_DISABLED``
#: est posé, l'invite système continue de DÉCRIRE ses outils au copilote
#: (``tools_summary``, résolu côté NestJS). Il annonce donc une action, et rien
#: ne part — le produit ne fait pas que perdre une capacité, il en promet une
#: qu'il n'a plus. Les autres interrupteurs coupent un balayage de fond ; celui-ci
#: fait mentir une phrase, dans la seconde, à l'utilisateur qui la lit.
#:
#: Cette ligne est injectée dans l'invite système ET rendue à l'écran, donc elle
#: répare les deux moitiés d'un coup : le modèle cesse de promettre, l'utilisateur
#: cesse de lire « Bellum ne sait pas faire ».
#:
#: ⚠️ « momentanément coupées », jamais « une erreur s'est produite » : un
#: interrupteur posé est une DÉCISION, et les deux phrases appellent des gestes
#: opposés chez qui les lit. ⚠️ Aucun nom de variable, aucun nom d'éditeur.
_COPILOT_TOOLS_CUT = "Mes actions sont momentanément coupées — je peux répondre, pas agir"
# #1958.10 — même phrase en anglais, même décision (D169/D243).
_COPILOT_TOOLS_CUT_EN = "My actions are temporarily paused — I can reply, not act"


def _crm_label(provider: str, language: str = "fr") -> str:
    """Libellé du CRM rendu au commercial — TOUJOURS générique.

    Le paramètre est conservé (les appelants transmettent l'état réel et le
    provider sert au back-office / aux logs) mais il n'atteint plus l'écran :
    « votre CRM » se lit aussi bien quel que soit l'éditeur, et le produit cesse
    d'exposer sa chaîne d'outillage à un prospect qui regarde par-dessus l'épaule.
    """
    _ = provider
    return _CRM_GENERIC_LABEL_EN if language == "en" else _CRM_GENERIC_LABEL


def _crm_label_sentence(provider: str, language: str = "fr") -> str:
    """Même libellé, en tête de phrase."""
    _ = provider
    return _CRM_GENERIC_LABEL_SENTENCE_EN if language == "en" else _CRM_GENERIC_LABEL_SENTENCE


def _as_of(value: object) -> str | None:
    """Date ISO-8601 UTC d'un horodatage réel, ou ``None`` si on ne la connaît pas.

    Sert la fraîcheur par source : un document de 2024 et un signal d'hier ne
    doivent pas s'afficher à l'identique. Règle stricte — une valeur absente,
    vide ou illisible ne produit AUCUNE date : mieux vaut pas de fraîcheur qu'une
    fraîcheur inventée. Un horodatage naïf est lu comme UTC (les colonnes
    Supabase sont stockées en UTC).
    """
    if isinstance(value, datetime):
        dt = value
    else:
        raw = str(value or "").strip()
        if not raw:
            return None
        try:
            # `fromisoformat` ne digère le suffixe « Z » qu'à partir de Python 3.11.
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat()


def _count_lines(text: str) -> int:
    """Non-empty lines — contacts_summary and accounts_summary are one item/line."""
    return len([ln for ln in (text or "").splitlines() if ln.strip()])


#: #1954.21/#1954.31 — borne d'un extrait de source. Assez long pour se lire
#: comme une phrase, jamais assez pour reproduire le document entier dans le
#: panneau de transparence (ce panneau cite, il ne republie pas).
_EXCERPT_MAX_CHARS = 220


def _excerpt(content: str) -> str:
    """Un extrait RÉEL du contenu — jamais un résumé, jamais une invention.

    Les espaces (y compris sauts de ligne) sont réduits à un seul, pour que
    l'extrait se lise comme une phrase plutôt qu'un fragment de mise en page.
    La coupe tombe sur une frontière de mot : mieux vaut un extrait un peu
    plus court qu'un mot tronqué au milieu.
    """
    flat = " ".join(content.split())
    if len(flat) <= _EXCERPT_MAX_CHARS:
        return flat
    cut = flat[:_EXCERPT_MAX_CHARS].rsplit(" ", 1)[0].rstrip()
    return f"{cut}…"


def _sources_from_docs(docs: list[dict] | None) -> list[dict]:
    """Titles of the RAG docs actually injected into the prompt, deduplicated.
    Mirrors ``format_knowledge_context`` (skips empty-content docs) so the sources
    we advertise are exactly the ones the model could read."""
    sources: list[dict] = []
    seen: set[str] = set()
    # #3750.2 — un document découpé arrive en MORCEAUX (onglet, diapositive) :
    # la source reste UNE par document, son libellé nomme les unités lues
    # (« Brand Messaging — 07 · Objections, 08 · Preuves »). Sans unité, le
    # libellé d'avant, le titre seul.
    units_by_title: dict[str, list[str]] = {}
    for d in docs or []:
        if not isinstance(d, dict) or not str(d.get("content") or "").strip():
            continue
        unit = str(d.get("unit_label") or "").strip()
        key = (str(d.get("title") or "").strip() or "Document sans titre").lower()
        if unit and unit not in units_by_title.setdefault(key, []):
            units_by_title[key].append(unit)
    for d in docs or []:
        if not isinstance(d, dict):
            continue
        if not str(d.get("content") or "").strip():
            continue
        title = str(d.get("title") or "").strip() or "Document sans titre"
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        units = units_by_title.get(key) or []
        label = f"{title} — {', '.join(units)}" if units else title
        source: dict = {"kind": "knowledge_doc", "label": label}
        # M5 (tome 7 §38) — l'identifiant voyage avec le libellé pour que
        # l'interface puisse rendre la source CLIQUABLE. Sans lui, « sources
        # utilisées » est une liste de titres qu'on ne peut pas ouvrir, donc
        # une citation qu'on ne peut pas vérifier. Absent quand le document
        # n'en porte pas : on n'invente pas un lien mort.
        doc_id = str(d.get("id") or "").strip()
        if doc_id:
            source["doc_id"] = doc_id
        # `as_of` est OPTIONNEL : la clé n'apparaît que si le document porte une
        # vraie date d'ingestion (`created_at`), sinon aucune fraîcheur n'est
        # affichée pour lui.
        as_of = _as_of(d.get("created_at"))
        if as_of:
            source["as_of"] = as_of
        # #1954.21/#1954.31 — l'EXTRAIT réel du document injecté, pour que
        # « voir la source » montre un passage, pas seulement un titre.
        # Toujours présent ici : `content` est non vide (filtré plus haut).
        source["excerpt"] = _excerpt(str(d.get("content") or ""))
        sources.append(source)
    return sources


def knowledge_sources(docs: list[dict] | None) -> list[dict]:
    """#3889 — la porte PUBLIQUE de `_sources_from_docs` pour un outil de chat qui
    a lu le magasin (`search_document_projects`) : une source de connaissance se
    fabrique à UN seul endroit (GA-21, `test_rag_citation_guard.py`)."""
    return _sources_from_docs(docs)


# Les titres du corpus méthode se terminent par cette mention : indispensable
# dans le PROMPT (le modèle cite le titre entier, donc la provenance), redondante
# à l'écran depuis que la pastille porte elle-même la nature « Méthode Bellum ».
_METHOD_TITLE_SUFFIX = " — méthode Bellum"


def _method_label(title: str) -> str:
    """Libellé d'écran d'une règle méthode : le titre, sans sa mention de
    provenance (portée par la nature de la source, et traduite côté web)."""
    return title.strip().removesuffix(_METHOD_TITLE_SUFFIX).strip()


def merge_sources(sources: list[dict] | None, extra: list[dict] | None) -> list[dict]:
    """Ajoute `extra` aux sources déjà citées, sans doublon et sans rien écraser.

    Sert à faire entrer dans le panneau les sources que le copilote est allé
    chercher LUI-MÊME pendant la réponse (dossier de compte lu par un outil),
    à côté de celles résolues en amont (documents, méthode, CRM). La première
    occurrence d'un couple (kind, label) gagne : une source déjà datée n'est
    jamais remplacée par la même sans date. Les entrées mal formées sont
    ignorées — jamais une source vide affichée à l'écran.
    """
    merged: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for source in [*(sources or []), *(extra or [])]:
        if not isinstance(source, dict):
            continue
        kind = str(source.get("kind") or "").strip()
        label = str(source.get("label") or "").strip()
        if not kind or not label:
            continue
        key = (kind, label.lower())
        if key in seen:
            continue
        seen.add(key)
        merged.append(source)
    return merged


def merge_mail_thread_hints(existing: list[dict] | None, extra: list[dict] | None) -> list[dict]:
    """#2955 (#2394.57, décision Louis 28/09) — fusionne les fils de messagerie
    lus pendant le tour dans l'état de conversation persisté, un `thread_id`
    ne valant qu'UNE entrée : la lecture la PLUS RÉCENTE l'emporte (le même fil
    relu avec un message arrivé entre-temps ne doit pas garder une liste de
    participants périmée). Entrées mal formées ignorées — jamais un fil gardé
    sans identifiant ni sans aucun participant."""
    by_thread_id: dict[str, dict] = {}
    for hint in [*(existing or []), *(extra or [])]:
        if not isinstance(hint, dict):
            continue
        thread_id = str(hint.get("thread_id") or "").strip()
        participants = hint.get("participants")
        if not thread_id or not isinstance(participants, list):
            continue
        cleaned = [str(p).strip() for p in participants if isinstance(p, str) and str(p).strip()]
        if not cleaned:
            continue
        by_thread_id[thread_id] = {"thread_id": thread_id, "participants": cleaned}
    return list(by_thread_id.values())


def _not_consulted_entries(
    *,
    crm_connected: bool,
    crm_provider: str,
    has_account: bool,
    has_portfolio: bool,
    has_sources: bool,
    crm_crossed: bool,
    copilot_tools_enabled: bool = True,
    crm_unavailable: bool = False,
    # #2145.23 (via #2925) — le SEUL signal réel déjà mesuré par l'appelant
    # (`req.connected_families`, `chat.py`), jamais un état inventé pour
    # l'occasion. Même défaut que `crm_connected` ci-dessus (`False`) : ce
    # panneau ne modélise pas un troisième état « inconnu », son appelant
    # calcule toujours une valeur réelle.
    email_connected: bool = False,
    # #1958.10 — la langue de l'INTERFACE (#1958.8), jamais devinée. Absente ⇒
    # "fr" : panneau byte-identique à avant ce paramètre.
    language: str = "fr",
    # #3708.exclusion — familles EXCLUES pour ce fil (« Outils et sources »,
    # `req.excluded_families`, même donnée que `excluded_sources_block`). Un CRM
    # exclu reste `crm_connected=True` (rien n'a été déconnecté) : sans ce
    # signal, ce panneau le confondait avec un CRM simplement « non croisé »
    # (« connecté — non croisé dans cette réponse »), ce qui a amené Laura à
    # suggérer de « rétablir l'accès » pour un choix que la personne vient de
    # faire (recette prod 08/10). `frozenset()` par défaut : panneau
    # byte-identique à avant ce paramètre pour tout appelant qui ne le passe pas.
    excluded_families: frozenset[str] = frozenset(),
    # #4051.6 — la demande cite « mes contacts » ET l'espace n'en porte aucun (ni contact du compte, ni
    # portefeuille) : la base importée est ABSENTE, et la ligne le dit au lieu de répondre comme si elle existait.
    own_base_missing: bool = False,
) -> list[tuple[str, str | None, bool]]:
    """La liste honnête « ce qui n'a PAS été consulté », pilotée par l'état réel,
    chaque ligne accompagnée de l'action qui la RÉSOUT (ou ``None``) et d'un
    troisième champ ``blocks_qualification`` (#4150).

    ``blocks_qualification`` est ``True`` seulement pour une ligne qui porte une
    action réelle (se connecter à un CRM/une messagerie, analyser le compte) ou
    une PANNE (CRM connecté dont la lecture a échoué) — jamais pour une absence
    STRUCTURELLE et permanente (réseaux professionnels, signaux archivés : le
    chat ne les interroge jamais, quel que soit le tour) ni pour un CRM connecté
    simplement non croisé cette fois (rien à faire pour la personne — « on a
    regardé, rien à en dire »), ni pour « aucun document pertinent trouvé »
    (une base de connaissance vide pour CETTE question n'est pas un manque à
    qualifier). C'est ce champ, jamais la longueur de la liste, qui doit
    décider si le bandeau « Qualification complémentaire nécessaire » s'allume
    (recette prod 14/10, #4150) : la liste elle-même reste entière pour le
    panneau « Voir la source », qui ne perd aucune ligne.

    - CRM : reflète l'état réel de ``crm_connections``. Non connecté → dit « non
      connecté ». Connecté sans read-back → « connecté mais NON croisé dans cette
      réponse ». Connecté ET croisé (``crm_crossed`` : le read-back présence a
      réellement interrogé le CRM pour ce compte) → le CRM sort de cette liste,
      il apparaît dans ``sources``. EXCLU pour ce fil (``excluded_families``) →
      ni l'un ni l'autre : un CHOIX réversible, jamais confondu avec « non
      croisé » (qui dirait « on a regardé, rien à en dire ») ni avec une panne.
    - #1915.11 — connecté MAIS la lecture a ÉCHOUÉ (``crm_unavailable`` :
      `resolveCrmPresenceRaw` a attrapé une erreur réseau/fournisseur, jamais
      inventé de présence) : ce n'est PAS la même ligne que « non croisé ». « Non
      croisé » se lit comme « on a regardé, rien à en dire » ; une panne se lit
      « on n'a pas pu vérifier ». Les confondre, c'est « non mesuré rendu 0 » un
      cran plus haut — un beta testeur croirait que Bellum a interrogé le CRM et
      n'y a rien trouvé, alors que la lecture n'a jamais abouti.
    - Messagerie (#2145.23) : même patron que le CRM ci-dessus, mais BINAIRE —
      la boîte n'est jamais « croisée » ni « en panne » dans ce panneau, elle
      est connectée ou non (même lecture que `missing_capabilities`).
    - LinkedIn / signaux archivés : le chat ne les interroge jamais en direct.
    - Compte / base de connaissance : signalés absents quand rien n'a été fourni.

    L'action est portée ici, à l'endroit où la ligne est construite : la faire
    dériver du libellé après coup serait fragile. ``None`` = rien à proposer,
    soit parce qu'il n'y a rien à connecter (CRM déjà connecté), soit parce
    qu'aucun écran ne le permet (LinkedIn, signaux archivés).
    """
    english = language == "en"
    items: list[tuple[str, str | None, bool]] = []
    if "crm" in excluded_families:
        # #3708.exclusion — un CHOIX pour ce fil, jamais une panne ni une
        # déconnexion : ni « non croisé » (laisse croire qu'on a regardé),
        # ni « indisponible » (laisse croire à une panne), ni « non connecté »
        # (laisse croire qu'il faut rétablir l'accès). Aucune action associée :
        # rien à connecter, le choix se change depuis « Outils et sources ».
        # Un choix réversible n'est jamais un manque à qualifier.
        sentence = _crm_label_sentence(crm_provider, language)
        label = (
            f"{sentence} — excluded by you for this conversation"
            if english
            else f"{sentence} — exclu par toi pour ce fil"
        )
        items.append((label, None, False))
    elif crm_connected and crm_crossed:
        pass  # consulted for real — listed under `sources`, not here
    elif crm_connected and crm_unavailable:
        # Connecté, lecture tentée, ÉCHOUÉE — jamais confondu avec « rien trouvé ».
        # #4150.2 — c'est une PANNE : la seule raison pour laquelle un CRM
        # connecté doit allumer le badge.
        sentence = _crm_label_sentence(crm_provider, language)
        label = (
            f"{sentence} connected — unavailable for this reply"
            if english
            else f"{sentence} connecté — indisponible pour cette réponse"
        )
        items.append((label, None, True))
    elif crm_connected:
        # Déjà connecté : rien à connecter, seulement un croisement qui n'a pas eu lieu.
        # #4150.2 — ce n'est PAS un manque : rien à faire pour la personne.
        sentence = _crm_label_sentence(crm_provider, language)
        label = (
            f"{sentence} connected — not cross-checked in this reply"
            if english
            else f"{sentence} connecté — non croisé dans cette réponse"
        )
        items.append((label, None, False))
    else:
        items.append(("No CRM connected" if english else "Aucun CRM connecté", _ACTION_CONNECT_CRM, True))
    if not email_connected:
        items.append(
            ("No mailbox connected" if english else "Aucune messagerie connectée", _ACTION_CONNECT_EMAIL, True)
        )
    # #4150.1 — absences STRUCTURELLES et permanentes : le chat ne les
    # interroge JAMAIS, quel que soit le tour. Elles ne disent rien de CETTE
    # réponse en particulier, donc ne déclenchent jamais le badge — elles
    # restent nommées dans le panneau « Voir la source ».
    items.append(
        ("Professional networks not queried" if english else "Réseaux professionnels non interrogés", None, False)
    )
    items.append(
        (
            "Archived buying signals not included" if english else "Signaux d'achat archivés non inclus",
            None,
            False,
        )
    )
    if own_base_missing:
        items.append(
            (
                "Imported contact base: none in this workspace — import a file or connect a CRM"
                if english
                else "Base de contacts importée : aucune dans cet espace — importez un fichier ou connectez un CRM",
                None,
                False,
            )
        )
    if not has_account and not has_portfolio:
        label = (
            "No account analysed linked to this conversation"
            if english
            else "Aucun compte analysé rattaché à cette conversation"
        )
        items.append((label, _ACTION_ANALYSE_ACCOUNT, True))
    if not has_sources:
        # #4150.3 — absente de la liste d'actions réelles de l'issue (CRM,
        # messagerie, compte) : une base de connaissance qui n'a rien de
        # pertinent pour CETTE question n'est pas un manque à qualifier.
        label = (
            "Knowledge base: no relevant document found"
            if english
            else "Base de connaissance : aucun document pertinent trouvé"
        )
        items.append((label, _ACTION_ADD_KNOWLEDGE, False))
    if not copilot_tools_enabled:
        # Panne temporaire (actions coupées) — même famille que le CRM indisponible.
        items.append((_COPILOT_TOOLS_CUT_EN if english else _COPILOT_TOOLS_CUT, None, True))
    return items


def _count_signals(account_data: dict | None) -> int:
    """Combien de signaux datés du dossier ont RÉELLEMENT été fournis au modèle.

    Le rapport V2 §13 promet la phrase « votre profil, 2 comptes, 3 signaux et
    1 document interne » : sans ce compte, elle n'était pas reproductible. On lit
    les deux formes écrites par le pipeline (`recentSignals` d'aujourd'hui,
    `recent_signals` des dossiers plus anciens) et on ne compte que des entrées
    exploitables — une valeur d'un autre type vaut 0, jamais une estimation.
    """
    raw = (account_data or {}).get("raw_analysis")
    if not isinstance(raw, dict):
        return 0
    for key in ("recentSignals", "recent_signals"):
        signals = raw.get(key)
        if isinstance(signals, list):
            return sum(
                1 for s in signals if isinstance(s, dict) and str(s.get("title") or s.get("label") or "").strip()
            )
    return 0


def build_context_transparency(
    *,
    profile_data: dict,
    account_data: dict,
    contacts_summary: str,
    plan_summary: str,
    knowledge_docs: list[dict] | None,
    accounts_summary: str = "",
    crm_connected: bool = False,
    crm_provider: str = "",
    # #2145.23 (via #2925) — même défaut que `crm_connected` ci-dessus.
    email_connected: bool = False,
    pinned_facts: list | None = None,
    conversation_summary: str = "",
    crm_presence: str = "",
    method_chunks: list[dict] | None = None,
    copilot_tools_enabled: bool = True,
    # #1915.11 — la lecture CRM a été TENTÉE et a ÉCHOUÉ (jamais déduit de
    # `crm_presence` vide, qui vaut aussi bien « rien trouvé » que « pas essayé »
    # que « raté ») : `False` par défaut, byte-identique à avant ce paramètre.
    crm_unavailable: bool = False,
    # #1958.10 — la langue de l'INTERFACE (#1958.8), jamais devinée depuis le
    # texte de l'utilisateur. `None`/absente/inconnue ⇒ français, byte-identique
    # à avant ce paramètre : `ContextDisclosure.tsx` affichait ces libellés bruts,
    # sans t(), donc une interface anglaise lisait quand même « Aucun CRM connecté ».
    language: str | None = None,
    # #3708.exclusion — mêmes familles que `excluded_sources_block`
    # (`req.excluded_families`) : `None`/vide, byte-identique à avant ce paramètre.
    excluded_families: list[str] | None = None,
    # W-G (13/10) — le bloc « FAITS DU COMPTE » réellement envoyé au modèle
    # (`account_facts_context`, lignes `- [date · âge] Nature : libellé`). Vide ⇒
    # AUCUNE clé : on n'affiche pas ce qu'on n'a pas, jamais un bloc vide.
    account_facts_context: str | None = None,
    # #4071.3 (recette R6 14/10) — même discipline : le bloc « CE QUE L'ESPACE A
    # GARDÉ » (recherches enregistrées, listes de cibles, résumés de fils) réellement
    # envoyé au modèle (`workspace_recall_context`, mêmes lignes `- [date · âge] …`).
    # Vide ⇒ aucune clé — jamais un bloc vide, jamais « 0 ».
    workspace_recall_context: str | None = None,
    # #4051.6 — la demande cite « mes contacts » (`source_plan.mentions_own_contacts`).
    own_contacts_requested: bool = False,
) -> dict:
    """Assemble the structured transparency object returned alongside the reply."""
    english = (language or "fr") == "en"
    p = profile_data or {}
    a = account_data or {}
    esn_name = p.get("esn_name") or p.get("companyName") or None
    account_name = a.get("company_name") or None
    contacts_count = _count_lines(contacts_summary)
    portfolio_count = _count_lines(accounts_summary)
    kb_sources = _sources_from_docs(knowledge_docs)
    # #1962.8 — des OBJETS (nature + origine) voyagent désormais : on compte ce
    # que le prompt LIT (`bellum_advisor._format_memory`, même normalisation),
    # jamais la représentation d'un objet, qui n'est jamais vide.
    facts = [f for f in (_pinned_memory_fields(raw) for raw in (pinned_facts or [])) if f is not None]

    # CRM presence read-back : non-empty ⇒ the CRM WAS really queried for this
    # account (server-side, from the CRM's own API) — it becomes a used source.
    # `has_sources` stays knowledge-doc-only (it drives the « aucun document » line).
    crm_crossed = crm_connected and bool((crm_presence or "").strip())
    # Méthode built-in réellement injectée (objections / playbooks / règles métier)
    # : une source à part entière, mais d'un autre `kind` que les documents de
    # l'utilisateur — le commercial doit voir que la réponse s'appuie sur la
    # méthode Bellum, pas sur un document qu'il aurait déposé. Aucune date : la
    # méthode est versionnée dans le produit, pas ingérée à un instant t.
    method_sources = [
        {"kind": "method_rule", "label": _method_label(str(c.get("title") or ""))}
        for c in (method_chunks or [])
        if isinstance(c, dict) and str(c.get("title") or "").strip() and str(c.get("content") or "").strip()
    ]
    # BEL-SC-226 (#3255), section TRANSPARENCE — le signal 5P DISCRET (« 5P
    # incomplet (…) »), sur le même canal que les règles de méthode citées
    # ci-dessus : même `kind`, aucune UI neuve (GA-26). `""` par défaut (compte
    # absent, 5P prêt, forme inconnue) n'ajoute rien.
    five_p_signal = resolve_5p_method_signal(a.get("strategy5p"))
    # #3285 — l'autre moitié : « ouverture de compte fermé » (état de relation
    # posé par l'API), listée AVANT le 5P comme dans l'exemple de la spec.
    opening_signal = resolve_opening_method_signal(a.get("relationship_state"))
    if opening_signal:
        method_sources = [*method_sources, {"kind": "method_rule", "label": opening_signal}]
    if five_p_signal:
        method_sources = [*method_sources, {"kind": "method_rule", "label": five_p_signal}]
    crm_crossed_label = (
        f"{_crm_label_sentence(crm_provider, language or 'fr')} — account presence cross-checked"
        if english
        else f"{_crm_label_sentence(crm_provider, language or 'fr')} — présence du compte croisée"
    )
    crm_source: dict = {
        "kind": "crm",
        "label": crm_crossed_label,
        # Le read-back a eu lieu PENDANT cette réponse : sa fraîcheur est
        # l'instant de la requête (date réelle, pas une estimation).
        "as_of": datetime.now(UTC).isoformat(),
        # #2264.17 — PÉRIMÈTRE : ce read-back décrit CE compte, jamais un
        # secteur ni le portefeuille entier.
        "scope": "ce compte",
        # #2264.18 — CONFIANCE : une lecture live du CRM pendant cette réponse
        # est la preuve la plus forte de ce module (jamais un pourcentage —
        # « aucune probabilité » — un palier nommé).
        "confidence": "high",
        # #2264.22 — VÉRIFICATION SUIVANTE nommée, distincte d'une action
        # suivante générique : le CRM est recroisé à CHAQUE question sur ce
        # compte, jamais mis en cache — c'est un fait sur le mécanisme, pas
        # une promesse inventée.
        "nextVerification": "recroisé à la prochaine question sur ce compte",
    }
    if account_name:
        # #2264.20 — RELATION AVEC L'OBJET : nommée seulement quand elle existe
        # réellement — sans compte actif, rien à relier, on ne devine pas.
        crm_source["relatesTo"] = account_name
    sources = kb_sources + method_sources + ([crm_source] if crm_crossed else [])

    entries = _not_consulted_entries(
        crm_connected=crm_connected,
        crm_provider=crm_provider,
        has_account=bool(account_name),
        has_portfolio=portfolio_count > 0,
        has_sources=bool(kb_sources),
        crm_crossed=crm_crossed,
        copilot_tools_enabled=copilot_tools_enabled,
        # Une lecture qui a réellement croisé le CRM prime toujours sur une
        # panne signalée par l'appelant (état incohérent en pratique, mais
        # « croisé » est la preuve la plus forte des deux).
        crm_unavailable=crm_unavailable and not crm_crossed,
        email_connected=email_connected,
        language=language or "fr",
        excluded_families=frozenset(excluded_families or ()),
        own_base_missing=own_contacts_requested and contacts_count == 0 and portfolio_count == 0,
    )

    # Fraîcheur du compte : ses signaux datent de sa dernière analyse. `updated_at`
    # est déjà la référence de fraîcheur côté API (calcul d'ancienneté du dossier).
    account: dict = {"present": bool(account_name), "name": account_name}
    account_as_of = _as_of(a.get("updated_at")) or _as_of(a.get("created_at"))
    if account_as_of:
        account["as_of"] = account_as_of

    account_facts_count = sum(1 for line in (account_facts_context or "").splitlines() if line.startswith("- ["))
    workspace_recall_count = sum(
        1 for line in (workspace_recall_context or "").splitlines() if line.startswith("- [")
    )
    return {
        "active": {
            "profile": {"present": bool(esn_name), "name": esn_name},
            "account": account,
            "contacts_count": contacts_count,
            # Les signaux du dossier : fournis au modèle depuis toujours, comptés
            # seulement maintenant (cf. `_count_signals`).
            "signals_count": _count_signals(a),
            "plan": {"present": bool((plan_summary or "").strip())},
            "portfolio": {"present": portfolio_count > 0, "count": portfolio_count},
            "memory": {"pinned_facts": len(facts), "has_summary": bool((conversation_summary or "").strip())},
            **({"account_facts": {"present": True, "count": account_facts_count}} if account_facts_count else {}),
            **(
                {"workspace_recall": {"present": True, "count": workspace_recall_count}}
                if workspace_recall_count
                else {}
            ),
        },
        "sources": sources,
        # Liste de chaînes : elle est aussi injectée telle quelle dans le prompt
        # système (garde-fou « SOURCES NON DISPONIBLES »). Entière, y compris les
        # absences structurelles — rien n'est retiré du panneau « Voir la source ».
        "not_consulted": [label for label, _, _ in entries],
        # Sous-ensemble actionnable : les lignes qu'un clic peut résoudre. Clé
        # séparée pour que `not_consulted` reste une simple liste de chaînes
        # (elle part aussi dans le prompt) et qu'un client plus ancien l'ignore.
        "not_consulted_actions": [{"label": label, "action": action} for label, action, _ in entries if action],
        # #4150 — le badge « Qualification complémentaire nécessaire » ne doit
        # s'allumer QUE si une ligne porte une action réelle ou une panne
        # (`blocks_qualification`), jamais sur la seule longueur de
        # `not_consulted` (qui inclut des absences structurelles, toujours
        # présentes). Calculé ici, une fois, pour que web n'ait pas à relire
        # les libellés.
        "qualification_needed": any(blocks for _, _, blocks in entries),
    }


# #3193.2/.3 (épopée #3217) — LE REÇU DE CONNAISSANCE STRUCTURÉ, onze couches.
#
# `dataforge` reste le nom INTERNE (jamais rendu tel quel à l'écran — l'i18n
# web le traduit en « référentiel sectoriel Bellum », même règle que le CRM
# générique en tête de ce fichier). L'ordre est celui du texte de l'issue.
KNOWLEDGE_RECEIPT_LAYERS: tuple[str, ...] = (
    "workspace",
    "crm",
    "messaging",
    "agenda",
    "documents",
    "account_dossier",
    "dataforge",
    "market_memory",
    "current_public_sources",
    "bellum_method",
    "inference",
)

#: #3193.3 — les quatre états d'une couche. `result_count`/`coverage`/
#: `freshness`/`caveat` (posés par `_layer` ci-dessous) ne sont PAS un
#: cinquième état : ce sont des champs optionnels à côté de l'état, jamais
#: devinés quand la couche ne les porte pas réellement.
KnowledgeReceiptState = Literal["consulted", "unavailable", "not_requested", "forbidden_by_mode", "excluded"]


def _layer(
    state: KnowledgeReceiptState,
    *,
    result_count: int | None = None,
    coverage: str | None = None,
    freshness: str | None = None,
    caveat: str | None = None,
) -> dict:
    """Une couche du reçu : son état, plus SEULEMENT les champs qu'elle porte
    réellement — « on n'affiche pas ce qu'on n'a pas », jamais une clé à `None`."""
    layer: dict = {"status": state}
    if result_count is not None:
        layer["result_count"] = result_count
    if coverage is not None:
        layer["coverage"] = coverage
    if freshness is not None:
        layer["freshness"] = freshness
    if caveat is not None:
        layer["caveat"] = caveat
    return layer


_INFERENCE_CAVEAT = "Cette réponse combine ces éléments par raisonnement — vérifie les faits cités avant de t'y fier"
_INFERENCE_CAVEAT_EN = (
    "This reply combines these elements through reasoning — verify the cited facts before relying on it"
)

_CRM_UNAVAILABLE_CAVEAT = "lecture tentée, non aboutie pour cette réponse"
_CRM_UNAVAILABLE_CAVEAT_EN = "read attempted, did not complete for this reply"

#: #3177.5/#3193.10 (recette prod 29 puis 30/09/2026) — le(s) outil(s) de chat
#: qui alimentent RÉELLEMENT chaque couche outillée du reçu (celles qui
#: dépendent d'un appel `search_*`/`list_*`/`run_*` — jamais `bellum_method` ni
#: `inference`, qui n'appellent aucun outil). Sert UNIQUEMENT à distinguer une
#: couche jamais appelée (`not_requested`) d'une couche appelée CE TOUR et
#: tombée en panne (`unavailable`) — un vocabulaire VOLONTAIREMENT DISTINCT de
#: `source_plan.LAYER_TOOL_NAMES` (GA-26 : deux panneaux différents, deux
#: usages différents — celui-ci ne sert jamais à planifier un tour, seulement à
#: relire son issue).
#:
#: Défaut mesuré en recette prod (#3177, La Poste et ses filiales, 29 puis
#: 30/09) : Laura appelait bien `search_market_memory` (`company_id` +
#: `include_subsidiaries`), le pont a échoué au bout du budget déjà élargi à
#: 20 s (lot M01, #3177) — et le reçu affichait quand même « Mémoire marché
#: Bellum — Non demandé », exactement comme si rien n'avait été tenté.
#: `cited_sources` rend `[]` sur toute sortie en erreur (`chat_tools.py`), donc
#: rien ne distinguait plus, ICI, un outil jamais appelé d'un outil appelé et
#: en échec — cette table referme l'écart, elle ne change jamais QUAND un
#: outil est appelé, seulement comment son échec s'affiche.
_TOOL_BACKED_LAYER_TOOL_NAMES: dict[str, frozenset[str]] = {
    "agenda": frozenset({"list_agenda", "find_free_slots", "prepare_day_brief"}),
    # #4281.1 / #4282.9 — les besoins historiques structurés sont la même couche (base commune Bellum).
    "dataforge": frozenset({"search_sector_referential", "search_historical_needs", "technology_radar"}),
    "market_memory": frozenset({"search_market_memory"}),
    "current_public_sources": frozenset({"run_account_search"}),
}

_TOOL_ATTEMPT_UNAVAILABLE_CAVEAT = "outil appelé ce tour, résultat indisponible"
_TOOL_ATTEMPT_UNAVAILABLE_CAVEAT_EN = "tool called this turn, no result available"


def _tool_backed_layer(
    layer: str,
    layer_sources: list[dict],
    *,
    failed_tools: frozenset[str],
    tool_layer_state: KnowledgeReceiptState,
    language: str,
    with_result_count: bool,
) -> dict:
    """Une couche adossée à un outil de chat (#3177.5/#3193.10) : `consulted`
    sur un résultat réel, `unavailable` si l'outil a été APPELÉ ce tour et a
    échoué (jamais confondu avec `not_requested`, qui veut dire qu'on n'a même
    pas essayé), sinon l'état par défaut du tour (`not_requested` ou
    `forbidden_by_mode`, déjà résolu par l'appelant dans `tool_layer_state`)."""
    if layer_sources:
        return _layer("consulted", result_count=len(layer_sources) if with_result_count else None)
    if _TOOL_BACKED_LAYER_TOOL_NAMES[layer] & failed_tools:
        return _layer(
            "unavailable",
            caveat=_TOOL_ATTEMPT_UNAVAILABLE_CAVEAT_EN if language == "en" else _TOOL_ATTEMPT_UNAVAILABLE_CAVEAT,
        )
    return _layer(tool_layer_state)


def build_knowledge_receipt(
    context: dict,
    *,
    crm_connected: bool = False,
    crm_unavailable: bool = False,
    email_connected: bool = False,
    # D169/D243 — le même interrupteur d'arrêt que `_not_consulted_entries` :
    # coupé, aucune couche qui dépend d'un outil n'a pu être consultée, ce qui
    # est une couche PLUS PRÉCISE que « non demandée » (l'outil existait, il a
    # été interdit par le réglage de ce tour, pas simplement pas appelé).
    copilot_tools_enabled: bool = True,
    # #3177.5/#3193.10 — les outils de chat APPELÉS ce tour et RESSORTIS en
    # erreur (`entry["status"] == "error"`, `chat_orchestrator.py`), lus par
    # l'appelant depuis `context["actions"]` — jamais un second calcul ici
    # (GA-26) : cette fonction reste une PURE projection. Vide par défaut,
    # byte-identique à avant ce paramètre pour tout appelant qui ne le passe
    # pas encore.
    failed_tools: frozenset[str] = frozenset(),
    language: str = "fr",
    # #3708 (recette prod 09/10) — un CRM EXCLU pour ce fil sortait ICI en
    # `not_requested` (« Non demandé »), EN MÊME TEMPS que `_not_consulted_entries`
    # le disait « exclu par toi » dans la liste « NON CONSULTÉ » — la même
    # source sous deux formes contradictoires dans le même reçu. Même donnée
    # que `_not_consulted_entries` (`req.excluded_families`) : `frozenset()`
    # par défaut, byte-identique à avant ce paramètre pour tout appelant qui
    # ne le passe pas encore.
    excluded_families: frozenset[str] = frozenset(),
) -> dict:
    """Assemble le reçu de connaissance structuré (onze couches, #3193.2/.3).

    PUR — ne fait qu'une seconde projection du `context` déjà construit par
    `build_context_transparency` (et déjà complété par les sources CITÉES par
    les outils exécutés ce tour, voir `chat.py` : `context["sources"]` après
    `merge_sources`). Aucun second appel, aucune donnée nouvelle : une couche
    n'est `consulted` que si une preuve RÉELLE (une source citée, un fil de
    messagerie lu, un compte résolu) le confirme déjà ailleurs dans `context`
    — sinon elle reste `not_requested`, jamais devinée à `consulted` avec un
    résultat vide.
    """
    english = language == "en"
    active = context.get("active") or {}
    sources = context.get("sources") or []
    mail_threads = context.get("mail_threads") or []

    def _of_kind(kind: str) -> list[dict]:
        return [s for s in sources if isinstance(s, dict) and s.get("kind") == kind]

    tool_layer_state: KnowledgeReceiptState = "not_requested" if copilot_tools_enabled else "forbidden_by_mode"

    receipt: dict[str, dict] = {}

    # workspace — le bundle profil/compte/portefeuille/mémoire déjà résolu
    # pour ce tour (`active`, voir le docstring du module).
    profile = active.get("profile") or {}
    account = active.get("account") or {}
    portfolio = active.get("portfolio") or {}
    memory = active.get("memory") or {}
    workspace_present = bool(
        profile.get("present") or account.get("present") or portfolio.get("present") or memory.get("pinned_facts")
    )
    receipt["workspace"] = _layer(
        "consulted" if workspace_present else "not_requested",
        result_count=active.get("contacts_count") if workspace_present else None,
    )

    # crm — trois états réels déjà mesurés par l'appelant (croisé / connecté
    # mais en panne / non connecté), même patron que `_not_consulted_entries`.
    # EXCLU pour ce fil prime sur tout le reste : un choix réversible, jamais
    # confondu avec « non demandé » — déjà dit ailleurs dans ce même reçu
    # (`_not_consulted_entries`), une seule fois, jamais sous deux formes.
    crm_sources = _of_kind("crm")
    if "crm" in excluded_families:
        receipt["crm"] = _layer("excluded")
    elif crm_sources:
        receipt["crm"] = _layer("consulted", freshness=crm_sources[0].get("as_of"))
    elif not copilot_tools_enabled and crm_connected:
        receipt["crm"] = _layer("forbidden_by_mode")
    elif crm_connected and crm_unavailable:
        receipt["crm"] = _layer(
            "unavailable", caveat=_CRM_UNAVAILABLE_CAVEAT_EN if english else _CRM_UNAVAILABLE_CAVEAT
        )
    else:
        receipt["crm"] = _layer("not_requested")

    # messaging — binaire, même patron que `_not_consulted_entries` : la
    # boîte n'est jamais « en panne » dans ce panneau, connectée ou non.
    if mail_threads:
        receipt["messaging"] = _layer("consulted", result_count=len(mail_threads))
    elif not copilot_tools_enabled and email_connected:
        receipt["messaging"] = _layer("forbidden_by_mode")
    else:
        receipt["messaging"] = _layer("not_requested")

    # agenda — épopée #3217, lot E3 28/09 (suite) : `list_agenda`/
    # `find_free_slots`/`prepare_day_brief` (`chat_tools.py`) lisaient déjà le
    # calendrier connecté sans jamais citer la couche — un connecteur BRANCHÉ,
    # simplement pas encore mappé ici (doctrine SOURCES-28-09 : un connecteur
    # déjà branché d'abord, avant tout fournisseur neuf). `consulted` seulement
    # sur une preuve RÉELLE (`kind: "calendar"`, posée par `cited_sources` sur
    # un résultat non vide) — jamais devinée sur la seule présence de l'outil.
    calendar_sources = _of_kind("calendar")
    receipt["agenda"] = _tool_backed_layer(
        "agenda",
        calendar_sources,
        failed_tools=failed_tools,
        tool_layer_state=tool_layer_state,
        language=language,
        with_result_count=False,
    )

    # documents — la base de connaissance a été RÉELLEMENT relue dès qu'un
    # document en sort ; sans résultat, on ne peut pas distinguer « rien
    # trouvé » de « pas essayé » depuis ce `context` seul, donc on ne prétend
    # PAS avoir consulté (règle #3193 : jamais consulté sur la seule
    # disponibilité).
    doc_sources = _of_kind("knowledge_doc")
    receipt["documents"] = (
        _layer("consulted", result_count=len(doc_sources)) if doc_sources else _layer("not_requested")
    )

    # account_dossier — le dossier RÉELLEMENT résolu pour ce tour (`active.account`,
    # ou un dossier lu par un outil pendant le tour — même `kind`).
    dossier_sources = _of_kind("account_dossier")
    if account.get("present") or dossier_sources:
        freshness = account.get("as_of") or (dossier_sources[0].get("as_of") if dossier_sources else None)
        receipt["account_dossier"] = _layer("consulted", freshness=freshness)
    elif not copilot_tools_enabled:
        receipt["account_dossier"] = _layer("forbidden_by_mode")
    else:
        receipt["account_dossier"] = _layer("not_requested")

    # dataforge — épopée #3217, lot E3 28/09 (suite) : `search_sector_referential`
    # (`chat_tools.py`) relaie désormais `search_dataforge_rag_chunks`, déjà
    # câblé côté `/rag/dataforge/search` mais jamais présenté au chat — même
    # motif que `agenda` ci-dessus. `consulted` seulement sur un repère
    # RÉELLEMENT trouvé (`kind: "dataforge"`), jamais deviné sur la seule
    # disponibilité de l'outil.
    dataforge_sources = _of_kind("dataforge")
    receipt["dataforge"] = _tool_backed_layer(
        "dataforge",
        dataforge_sources,
        failed_tools=failed_tools,
        tool_layer_state=tool_layer_state,
        language=language,
        with_result_count=False,
    )

    # market_memory — consultée seulement si `search_market_memory` a
    # réellement trouvé une correspondance ce tour (`cited_sources`).
    market_sources = _of_kind("market_observation")
    receipt["market_memory"] = _tool_backed_layer(
        "market_memory",
        market_sources,
        failed_tools=failed_tools,
        tool_layer_state=tool_layer_state,
        language=language,
        with_result_count=True,
    )

    # current_public_sources — sources publiques actuelles (BOAMP/France
    # Travail/BODACC via `run_account_search`, ou le web via `web_search`) :
    # consultée seulement sur un signal RÉELLEMENT trouvé et daté.
    signal_sources = _of_kind("market_signal")
    receipt["current_public_sources"] = _tool_backed_layer(
        "current_public_sources",
        signal_sources,
        failed_tools=failed_tools,
        tool_layer_state=tool_layer_state,
        language=language,
        with_result_count=True,
    )

    # bellum_method — sélection déterministe sur la question (aucun appel
    # réseau, aucune clé) : un résultat non vide EST la preuve qu'elle a
    # tourné pour cette question.
    method_sources = _of_kind("method_rule")
    receipt["bellum_method"] = (
        _layer("consulted", result_count=len(method_sources)) if method_sources else _layer("not_requested")
    )

    # inference — le raisonnement du modèle lui-même contribue à CHAQUE
    # réponse (ce n'est pas une source qu'on consulte ou non) : toujours
    # `consulted`, avec la même réserve honnête à chaque fois — jamais un
    # fait de plus affirmé sans son origine.
    receipt["inference"] = _layer("consulted", caveat=_INFERENCE_CAVEAT_EN if english else _INFERENCE_CAVEAT)

    return receipt
