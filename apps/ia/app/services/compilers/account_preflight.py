"""#2301 (LAU-FINAL-042) — le compilateur de la PRÉLECTURE DE COMPTE.

Constat du chantier « les compilateurs de /chat » (décision Louis, 18/09/2026,
reconfirmée le 22/09 sur `origin/main`) : **les ingrédients existent presque
tous, le plat n'existe pas.** Les 17 SOURCES listées au registre
(`.claude/notes/registre-2026-09-18-chat-account-preflight.md`) sont déjà des
données lisibles ailleurs dans le produit (la fiche compte, les entités
Postgres) — mais aucune commande `/chat` ne les ASSEMBLE en une prélecture
conversationnelle avant de proposer une action.

Ce module est volontairement un fichier NEUF, séparé de `chat_tools.py` : huit
lots-compilateurs tournent en parallèle sur ce même fichier de 6500+ lignes, et
la LOGIQUE de compilation vit ici pour ne laisser dans `chat_tools.py` qu'un
AJOUT PUR (l'import, l'entrée dans `CHAT_TOOLS`, la branche d'exécution).

Pure — aucune I/O ici. L'orchestrateur (`chat_tools.execute_chat_tool`) fait
les lectures (compte possédé, contacts via le pont NestJS) et passe leur
résultat déjà obtenu à `compile_account_preflight`, exactement comme
`build_account_briefing` le fait pour la fiche de compte.

Doctrine tenue, section par section (voir le registre pour le détail) :

* Un timeout n'est pas un échec : ce compilateur ne retente rien lui-même —
  il projette ce qu'on lui a donné, `unknown` arrête, il ne relance jamais.
* Sans source branchée = no-op strict : une section sans pont /chat se NOMME
  `known: False` avec sa raison, jamais un repli deviné (#2301.17/.21/.22).
* Une liste réellement vide reste `known: True` — ce n'est jamais un signe
  d'erreur (GA-18/GA-19) : « non mesuré » n'est pas « rien à mesurer ».
* Le même objet (contact, signal, observation) ne compte jamais deux fois
  (#2301.29).
* Aucun CTA ne pointe vers une action que le clic ne pourrait pas honorer
  (#2301.34-38) — chacun vise un outil `/chat` RÉEL et déjà exécutable.
* La préférence va à « répondre avec l'existant » quand ça suffit (#2301.39),
  et jamais de CTA « lancer l'analyse complète » sans que les sections déjà
  connues voyagent dans LE MÊME résultat (#2301.40, NO-GO).
"""

from __future__ import annotations

from collections.abc import Callable, Hashable, Mapping
from typing import Any

# Même borne que `_LIST_TOOL_CAP` de `chat_tools.py` (GA-295) — dupliquée ici,
# volontairement, pour que ce compilateur reste un fichier autonome : un
# import vers `chat_tools` créerait un cycle (`chat_tools` importe CE module
# pour enregistrer son outil).
_LIST_CAP = 20


ACCOUNT_PREFLIGHT_TOOL: dict[str, Any] = {
    "name": "get_account_preflight",
    # #3278.2 (recette prod 08/10) — `not_evaluable_criteria` (commercial_route)
    # traverse la façade depuis le lot R10 (07/10) mais rien ne disait à Laura
    # de la LISTER : elle évoquait les rôles du comité d'achat à la place.
    "description": (
        "Assemble une PRÉLECTURE d'UN compte déjà connu de l'utilisateur : ce qu'on sait déjà "
        "(identité, relation commerciale, contacts, signaux, observations structurelles, sièges du "
        "comité d'achat propres au SECTEUR — nommés même sans contact qui les remplit encore —, le "
        "comité d'achat en langage naturel avec, pour une structure réduite, le contact par lequel "
        "commencer, la présence déjà connue de ce compte dans le CRM branché (jamais un "
        "référencement fournisseur ni une éligibilité à un dispositif d'achat — des informations "
        "distinctes, non mesurées ici), les consultants déjà positionnés sur ce "
        "compte par le passé, et la capacité commerciale DÉJÀ déclarée du commercial qui ouvre ce "
        "compte — plafond de dossiers suivis, heures disponibles par semaine) ET ce qu'on ne sait "
        "PAS encore, nommé explicitement — jamais deviné. Si "
        "`data_conflicts` porte une contradiction OUVERTE (deux sources automatiques qui ne "
        "disent pas la même chose sur un champ), DIS-le avant tout le reste : c'est ce que le "
        "produit ne sait pas trancher, pas une donnée comme les autres — une fiche vide dessus "
        "laisserait croire à tort qu'elle est fiable. Donne la date de revérification (`nextCheck`) "
        "quand elle est là. À utiliser AVANT de "
        "proposer une analyse complète : elle prend du temps, et ne doit jamais "
        "être proposée sans d'abord montrer la matière déjà connue. Quand `commercial_route.known` "
        "est vrai, annonce la route recommandée puis, si `not_evaluable_criteria` est présent, "
        "liste CHACUN de ses critères par son `label`, avec sa raison — une LISTE explicite, "
        "jamais une prose qui les évoque sans les nommer tous. Chaque `label` se cite VERBATIM, "
        "mot pour mot tel qu'il est écrit dans `not_evaluable_criteria` — jamais paraphrasé, jamais "
        "inventé, et jamais un terme lu ailleurs dans cette fiche (le « référencement CRM » "
        "ci-dessus, par exemple, n'est PAS un critère de route). Exemple de forme attendue, pour une "
        "route dont les critères sans source seraient périmètre de la mission, objectifs du compte, "
        "rôles disponibles côté client, processus d'achat, partenaires déjà identifiés, historique de "
        "la relation et fenêtre de temps : « Critères sans source pour cette route : périmètre de la "
        "mission, objectifs du compte, rôles disponibles côté client, processus d'achat, partenaires "
        "déjà identifiés, historique de la relation, fenêtre de temps. » — les `label` RÉELS de CE "
        "compte peuvent différer ; la FORME (une liste, verbatim, séparée) ne change pas. Ne confonds "
        "JAMAIS cette liste avec les rôles non pourvus du comité d'achat (`buying_committee`) : deux "
        "listes séparées, pour deux questions différentes (« qui manque autour de la table » contre "
        "« quels critères de cette route restent sans source »). Si `accumulated_criteria` est présent, "
        "cite chaque `value` telle quelle (« preuves mobilisables », « historique des canaux » : ce que "
        "l'espace a déjà accumulé, des messages PRÉPARÉS et non envoyés) — jamais un chiffre de plus. "
        # #3278.a (recette R39) — la route sans preuve de canal ni mention d'absence.
        "Si `accumulated_absent` est présent, dis chacune de ses `sentence` en UNE phrase, telle quelle "
        "(« aucun historique de canal sur ce compte ») — jamais un canal ni une réponse inventés. "
        # #3248 (recette NB 10/10) — la liste « ce qui manque » ne nommait ni l'opt-out ni le plafond.
        "À la question « qu'est-ce qui manque AVANT D'OUVRIR ce compte ? », ta liste porte TOUJOURS, "
        "en plus des consultants déjà positionnés (ou leur absence), DEUX lignes nommées, jamais omises "
        "faute de donnée : (1) l'opt-out — vérifié automatiquement avant toute préparation de message "
        "(jamais coché d'avance, il se vérifie par contact) ; (2) le plafond de dossiers suivis — "
        "`team_scope.max_tracked_accounts` face à `tracked_accounts_count`, ou « plafond non déclaré » "
        "(Réglages › Charge commerciale) quand il est absent. "
        "Rends d'abord la matière "
        "connue, puis le CTA recommandé (`recommended_cta`) parmi les propositions "
        "(`suggested_ctas`) — chacune vise un outil /chat réellement exécutable, jamais une "
        "action fantôme. Lecture seule, scopée à l'utilisateur : un compte étranger reste "
        "introuvable, comme pour get_account_briefing."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "account_id": {
                "type": "string",
                "description": "L'identifiant (UUID) du compte à prélire.",
            },
            "objective": {
                "type": "string",
                "enum": ["comprendre", "ouvrir", "vendre"],
                "description": (
                    "L'objectif commercial de CE tour, si la personne l'a exprimé (« aide-moi à "
                    "comprendre ce compte » / « comment j'ouvre une conversation là-bas » / « je "
                    "veux closer ce compte »). Change SEULEMENT l'ordre de priorité du comité "
                    "d'achat dans la réponse — jamais son contenu. Omets ce champ quand l'objectif "
                    "n'est pas clair : l'ordre reste alors celui par défaut."
                ),
            },
        },
        "required": ["account_id"],
    },
}


def _dedupe(items: list[dict[str, Any]], key: Callable[[dict[str, Any]], Hashable]) -> list[dict[str, Any]]:
    """#2301.29 — un même objet n'entre jamais deux fois dans une prélecture.

    Ordre stable (premier vu gagne) — jamais une estimation, un décompte
    exact, comme `chat_tools._capped`."""
    seen: set[Hashable] = set()
    out: list[dict[str, Any]] = []
    for item in items:
        k = key(item)
        if k in seen:
            continue
        seen.add(k)
        out.append(item)
    return out


def _dedupe_strings(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out


def _signal_key(signal: Mapping[str, Any]) -> Hashable:
    sid = signal.get("id")
    if sid:
        return ("id", str(sid))
    return ("sig", str(signal.get("signal") or ""), str(signal.get("date") or ""), str(signal.get("source") or ""))


def _signal_content_key(signal: Mapping[str, Any]) -> Hashable:
    """#2547 — par CONTENU d'abord (deux sources numérotent chacune « s1 ») ;
    l'identifiant seulement pour un signal sans texte."""
    text = str(signal.get("signal") or "").strip()
    if text:
        return ("sig", text, str(signal.get("date") or ""), str(signal.get("source") or ""))
    return _signal_key(signal)


def _observation_key(observation: Mapping[str, Any]) -> Hashable:
    return (str(observation.get("title") or ""), str(observation.get("description") or ""))


def _contact_key(contact: Mapping[str, Any]) -> Hashable:
    return str(contact.get("contact_id") or contact.get("id") or contact.get("full_name") or id(contact))


# #2285.2 (épopée #2786) — les TROIS champs `accounts` que la façade
# canonique (`AccountIntelligenceContextService.contextFor`, la MÊME que la
# fiche compte) résout déjà : une correction humaine ou DataForge y gagnent
# l'arbitrage quand la colonne brute est vide
# (`resolveAccountIntelligenceField`, `@bellum/contracts`). Les autres champs
# de `_identity_section` (employés, CA, SIREN, code NAF, groupe) n'ont pas
# d'équivalent sur la façade — ils restent lus sur la ligne brute, comme avant.
_IDENTITY_CANONICAL_FIELDS = {
    "company_name": "companyName",
    "sector": "sector",
    "headquarters": "headquarters",
}


def _canonical_identity_field(intelligence_context: Mapping[str, Any] | None, canonical_field: str) -> str | None:
    """Lit UN champ déjà résolu par la façade canonique — jamais une seconde
    lecture du compte brut. `None` dès que la façade est absente (pont éteint,
    service indisponible côté API) ou que son état n'est pas `known` : la
    prélecture retombe alors sur `account.get(field)`, EXACTEMENT le
    comportement d'avant ce correctif — jamais une vérité inventée."""
    if not isinstance(intelligence_context, Mapping):
        return None
    resolved = intelligence_context.get(canonical_field)
    if not isinstance(resolved, Mapping) or resolved.get("state") != "known":
        return None
    value = resolved.get("value")
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


def _identity_section(
    account: Mapping[str, Any],
    *,
    crm_connected: bool,
    intelligence_context: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """#2301.18 — identité et périmètres connus (sources #2301.1-.4).

    Chaque clé n'apparaît QUE si le compte la porte réellement — un champ
    absent est OMIS, jamais mis à "" ou 0 (règle CLAUDE.md : jamais de donnée
    fictive ; GA-18/GA-19 : non mesuré n'est jamais 0).

    #2285.2 — `company_name`/`sector`/`headquarters` préfèrent désormais la
    façade canonique (voir `_canonical_identity_field`) : Laura ne relit plus
    la ligne `accounts` brute en seul juge de ces trois champs, exactement
    comme la fiche compte (GA-26 : un calcul, jamais deux)."""
    identity: dict[str, Any] = {"known": True}
    for field in ("company_name", "sector", "employees", "revenue", "headquarters", "siren", "naf_code"):
        canonical_field = _IDENTITY_CANONICAL_FIELDS.get(field)
        canonical_value = canonical_field and _canonical_identity_field(intelligence_context, canonical_field)
        value = canonical_value or account.get(field)
        if value:
            identity[field] = value
    group_role = account.get("group_role")
    if group_role:
        identity["group_role"] = group_role
    group_head_siren = account.get("group_head_siren")
    if group_head_siren:
        identity["group_head_siren"] = group_head_siren
    subsidiaries_raw = account.get("subsidiaries")
    if isinstance(subsidiaries_raw, list):
        subsidiaries = _dedupe_strings([s for s in subsidiaries_raw if isinstance(s, str) and s.strip()])
        if subsidiaries:
            # GA-317/GA-318 — une liste plafonnée le DIT, même quand la borne
            # ne mord jamais en pratique (peu de comptes ont >20 filiales).
            identity["subsidiaries"] = subsidiaries[:_LIST_CAP]
            identity["subsidiaries_truncated"] = len(subsidiaries) > _LIST_CAP
    # #2301.3 — la source « données du workspace » : le scoping existe déjà
    # (RLS + workspace_id), on ne le recalcule pas, on le RELÈVE.
    identity["workspace_scoped"] = bool(account.get("workspace_id"))
    # #2301.4 — présence CRM seulement (jamais le nom du fournisseur : « on
    # nomme ce que l'espace a BRANCHÉ, jamais ce qui NOUS sert »).
    identity["crm_known"] = bool(crm_connected)
    return identity


def _workspace_relationship_section(account: Mapping[str, Any]) -> dict[str, Any]:
    """#2301.19 — relation actuelle avec le workspace (`commercial_status`)."""
    commercial_status = account.get("commercial_status")
    if not commercial_status:
        return {
            "known": False,
            "reason": "`commercial_status` absent de ce dossier — la relation actuelle n'est pas lisible.",
        }
    section: dict[str, Any] = {"known": True, "commercial_status": commercial_status}
    priority_gate = account.get("priority_gate")
    if priority_gate:
        section["priority_gate"] = priority_gate
    status = account.get("status")
    if status:
        section["status"] = status
    return section


_CONTACTS_UNAVAILABLE_REASON = "Je n'ai pas accès aux contacts de ce compte depuis ici."
_CONTACTS_ERROR_REASON = "Les contacts de ce compte n'ont pas répondu ou n'ont pas été trouvés."
_COVERAGE_ABSENT_REASON = (
    "Aucun pont /chat ne relie la couverture de ce compte pour l'instant "
    "(coverage.service.ts existe côté écran, pas encore assemblé ici)."
)
_NEEDS_ABSENT_REASON = (
    "Aucun pont /chat ne relie les besoins, projets ou missions confirmés de ce compte pour l'instant."
)
_TEAM_SCOPE_ABSENT_REASON = (
    "La capacité commerciale déclarée (Réglages › Charge commerciale) n'a pas répondu — le "
    "modèle d'équipe minimal (plafond de dossiers suivis, heures disponibles) n'est pas lisible "
    "depuis ici."
)
_BUYING_COMMITTEE_ABSENT_REASON = (
    "Le comité d'achat se déduit des contacts déjà connus de ce compte — sans eux, aucun rôle n'est classable."
)
_COMMERCIAL_ROUTE_ABSENT_REASON = (
    "Aucune analyse n'a encore produit de contexte commercial (stade ESN × archétype du compte × "
    "état de relation) pour ce compte."
)
_DATA_CONFLICTS_ABSENT_REASON = (
    "Aucune façade canonique de compte disponible depuis ici (pont /chat éteint ou service "
    "indisponible côté API) — les contradictions de champ ne sont pas lisibles."
)
_PAST_CONSULTANTS_UNAVAILABLE_REASON = (
    "L'historique de staffing de ce compte n'a pas répondu — les anciens consultants positionnés "
    "ici ne sont pas mesurables pour l'instant."
)


def _consultant_key(consultant: Mapping[str, Any]) -> Hashable:
    return str(consultant.get("consultant_id") or id(consultant))


def _contacts_and_coverage_section(contacts: Mapping[str, Any] | None, *, contacts_available: bool) -> dict[str, Any]:
    """#2301.21 — contacts (réel, réutilise le pont de `get_account_contacts`)
    et couverture (absente : aucun pont /chat ne relie `coverage.service.ts`)."""
    if not contacts_available:
        contacts_section: dict[str, Any] = {"known": False, "reason": _CONTACTS_UNAVAILABLE_REASON}
    elif not isinstance(contacts, Mapping) or contacts.get("error"):
        contacts_section = {"known": False, "reason": _CONTACTS_ERROR_REASON}
    else:
        raw = contacts.get("contacts")
        raw_list = [c for c in raw if isinstance(c, Mapping)] if isinstance(raw, list) else []
        deduped = _dedupe([dict(c) for c in raw_list], _contact_key)
        contacts_section = {
            "known": True,
            "contacts": deduped,
            "total": contacts.get("total"),
            "truncated": bool(contacts.get("truncated")),
        }
    return {
        "contacts": contacts_section,
        "coverage": {"known": False, "reason": _COVERAGE_ABSENT_REASON},
    }


def _confirmed_needs_section() -> dict[str, Any]:
    """#2301.22 — besoins/projets/missions confirmés : aucun pont /chat ne les
    assemble par compte aujourd'hui. Nommé absent plutôt qu'une liste vide qui
    se lirait « aucun besoin », ce qui serait un mensonge par omission."""
    return {"known": False, "reason": _NEEDS_ABSENT_REASON}


def _current_signals_section(account: Mapping[str, Any]) -> dict[str, Any]:
    """#2301.23 — signaux actuels (réel : colonne `accounts.recent_signals`).

    Une liste vide ici est un FAIT connu (aucun signal recensé), jamais une
    inconnue — même contrat que `get_account_timeline`."""
    # #2547 (recette prod 07/10, ARQUUS) — la fiche fusionne les signaux du
    # DOSSIER (`raw_analysis.recentSignals`) et la colonne (`watchData.ts`) ;
    # Laura ne lisait que la colonne et ne citait rien. Même fusion que
    # l'écran : dossier d'abord, colonne ensuite ; dédoublonnage par CONTENU
    # entre les deux sources (deux listes numérotent chacune « s1 »).
    analysis = account.get("raw_analysis") if isinstance(account.get("raw_analysis"), Mapping) else {}
    from_analysis = analysis.get("recentSignals") or analysis.get("recent_signals")
    raw_list: list[Mapping[str, Any]] = []
    for source in (from_analysis, account.get("recent_signals")):
        if isinstance(source, list):
            raw_list.extend(s for s in source if isinstance(s, Mapping))
    deduped = _dedupe([dict(s) for s in raw_list], _signal_content_key)
    capped, truncated = deduped[:_LIST_CAP], len(deduped) > _LIST_CAP
    return {"known": True, "signals": capped, "truncated": truncated}


def _structural_observations_section(account: Mapping[str, Any]) -> dict[str, Any]:
    """#2301.24 — observations structurelles (réel : colonne `it_challenges`)."""
    raw = account.get("it_challenges")
    raw_list = [o for o in raw if isinstance(o, Mapping)] if isinstance(raw, list) else []
    deduped = _dedupe([dict(o) for o in raw_list], _observation_key)
    capped, truncated = deduped[:_LIST_CAP], len(deduped) > _LIST_CAP
    return {"known": True, "observations": capped, "truncated": truncated}


def _sector_buying_roles_section(account: Mapping[str, Any]) -> dict[str, Any]:
    """#2791 — recette écran 27/09 (ROCHE, pharma) : les sièges du comité
    d'achat propres au SECTEUR du compte, nommés même sans contact qui les
    remplit encore — jamais un contact deviné (`sector_committee_seats` ne
    classe personne, elle nomme le siège qu'un secteur CONNU impose). Une
    liste vide ici est un FAIT (secteur sans pack sectoriel connu), jamais
    une inconnue (GA-18/GA-19)."""
    from app.knowledge.buying_committee import sector_committee_seats

    sector = account.get("sector")
    seats = sector_committee_seats(sector if isinstance(sector, str) else None)
    section: dict[str, Any] = {"known": True, "named_seats": list(seats)}
    if seats:
        section["sector"] = sector
    return section


def _priority_focus(committee: Mapping[str, Any], profile_data: Mapping[str, Any] | None) -> dict[str, Any] | None:
    """#2311.27 — personnalisation par contexte ESN : quand le vendeur est une
    structure freelance/petite (« 1 porte à la fois », `esn_stage.py`), NOMME
    le membre par lequel commencer plutôt que de laisser deviner lequel des
    six premiers noms du narratif prioriser. Doctrine c76 (« le rôle change
    l'ORDRE, jamais le CONTENU ») : ceci s'AJOUTE, ne retire aucun membre de
    `narrative`/`members`. `size` non déclaré ⇒ aucun focus (jamais une
    taille devinée)."""
    from app.knowledge.buying_committee import QUADRANT_CHAMPIONS, QUADRANT_TO_SATISFY
    from app.services.esn_stage import classify_esn_stage, size_int

    size_value = (profile_data or {}).get("size")
    if size_int(size_value) is None:
        return None
    stage = classify_esn_stage(size_value)
    if stage not in ("freelance", "petite"):
        return None
    members = [m for m in (committee.get("members") or []) if isinstance(m, Mapping)]
    for quadrant in (QUADRANT_CHAMPIONS, QUADRANT_TO_SATISFY):
        for m in members:
            if m.get("quadrant") == quadrant:
                return {
                    "fullName": m.get("fullName") or None,
                    "title": m.get("title") or None,
                    "roleLabel": m.get("roleLabel"),
                    "reason": "Structure réduite : commence par ce seul contact avant les autres.",
                }
    return None


def _commercial_route_section(
    account: Mapping[str, Any],
    contacts: Mapping[str, Any] | None,
    account_access: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """#3278.2 — la route commerciale recommandée, et les critères de
    sélection SANS source NOMMÉS plutôt que silencieux (doctrine « non
    mesuré n'est jamais 0 ») — réseau existant, panel, consultants
    disponibles, preuves, budget, signal actuel : chacun porte sa raison
    (``no_source`` ou ``not_collected``), jamais un poids deviné.

    Relit le SalesContext déjà persisté par l'analyse (``account.raw_analysis``)
    — aucun second calcul (GA-26), les mêmes fonctions pures que le plan
    (``with_route_signals``/``route_recommendation_from_context``/
    ``strategy_criteria_from_context``, ``opening_movement.py``). Les
    contacts, quand connus, rendent ``sponsor``/``middle_out`` atteignables —
    MÊMES contacts que la section comité, jamais une seconde lecture.

    #3278.2 — ``account_access.purchasing_panel`` (le panel/référencement
    DÉCLARÉ, pont d'accès) rend le critère « processus d'achat » évaluable sous
    un libellé qui NOMME sa restriction ; absent ou muet, il reste non évaluable."""
    analysis = account.get("raw_analysis") if isinstance(account.get("raw_analysis"), Mapping) else {}
    sales_context = analysis.get("salesContext") or analysis.get("sales_context")
    if not isinstance(sales_context, Mapping):
        return {"known": False, "reason": _COMMERCIAL_ROUTE_ABSENT_REASON}
    from app.services.opening_movement import (
        ACCUMULATED_ABSENCE_SENTENCES,
        route_recommendation_from_context,
        strategy_criteria_from_context,
        with_route_signals,
    )

    raw = contacts.get("contacts") if isinstance(contacts, Mapping) else None
    contact_list = [c for c in raw if isinstance(c, Mapping)] if isinstance(raw, list) else []
    context_with_signals = with_route_signals(dict(sales_context), contact_list)
    # #3278.1 (lot M11) — les signaux « veille seule » / « depuis un talent »
    # lus côté API (pont d'accès, `route_signals`) : seul un `True` compte,
    # une clé absente ne nomme jamais la route.
    bridged = account_access.get("route_signals") if isinstance(account_access, Mapping) else None
    extra = {
        key: True
        for key in ("watch_only", "talent_from_account", "event_community", "inbound_content")
        if isinstance(bridged, Mapping) and bridged.get(key) is True
    }
    if extra:
        context_with_signals = {
            **(context_with_signals or {}),
            "routeSignals": {**((context_with_signals or {}).get("routeSignals") or {}), **extra},
        }
    route = route_recommendation_from_context(context_with_signals)
    panel = account_access.get("purchasing_panel") if isinstance(account_access, Mapping) else None
    # #3278.2 (lot M11) — les six critères DÉCLARÉS sur la fiche (pont d'accès).
    declared = account_access.get("declared_route_criteria") if isinstance(account_access, Mapping) else None
    # #3278.3 (#3259.3) — preuves et historique des canaux, lus sur ce que l'espace a accumulé.
    accumulated = account_access.get("accumulated_route_criteria") if isinstance(account_access, Mapping) else None
    criteria = strategy_criteria_from_context(
        sales_context,
        panel if isinstance(panel, str) else None,
        declared if isinstance(declared, Mapping) else None,
        accumulated if isinstance(accumulated, Mapping) else None,
    )
    purchasing = next((c for c in criteria if c["key"] == "purchasing" and c["evaluable"]), None)
    not_evaluable = [{"label": c["label"], "reason": c["reason"]} for c in criteria if not c["evaluable"]]
    section: dict[str, Any] = {
        "known": True,
        "route": route["route"],
        "label": route["label"],
        "rationale": route["rationale"],
        "first_door": route["first_door"],
        "first_channel": route["first_channel"],
    }
    if not_evaluable:
        section["not_evaluable_criteria"] = not_evaluable
    if purchasing:
        # #3278.2 — le libellé porte la restriction (« panel/référencement
        # connu ») ; la valeur est la réponse DÉCLARÉE, relayée telle quelle.
        section["evaluated_purchasing"] = {"label": purchasing["label"], "panel": purchasing["value"]}
    # #3278.2 (lot M11) — ce que le commercial a DÉCLARÉ, cité tel quel par Laura.
    declared_out = [
        {"label": c["label"], "value": c["value"]} for c in criteria if c["evaluable"] and c.get("source") == "declared"
    ]
    if declared_out:
        section["declared_criteria"] = declared_out
    accumulated_out = [
        {"label": c["label"], "value": c["value"]}
        for c in criteria
        if c["evaluable"] and c.get("source") == "accumulated"
    ]
    if accumulated_out:
        section["accumulated_criteria"] = accumulated_out
    # #3278.a — le pont a répondu (même vide) et un fait accumulé manque : Laura le DIT en une phrase.
    # Pont muet (clé absente) : rien de dit — jamais « aucun historique » sur une lecture qui n'a pas eu lieu.
    if isinstance(accumulated, Mapping):
        accumulated_absent = [
            {"label": c["label"], "sentence": ACCUMULATED_ABSENCE_SENTENCES[c["key"]]}
            for c in criteria
            if c["key"] in ACCUMULATED_ABSENCE_SENTENCES and not c["evaluable"]
        ]
        if accumulated_absent:
            section["accumulated_absent"] = accumulated_absent
    # #3278.1 (décision Louis 11/10/2026) — les deux faits déclarés qui portent les routes
    # « événement ou communauté » et « inbound / contenu », cités tels quels. Seul un texte
    # non vide ET le signal correspondant comptent : jamais un fait sans route, ni l'inverse.
    facts = account_access.get("route_facts") if isinstance(account_access, Mapping) else None
    declared_facts = [
        {"label": label, "value": str(facts[fact]).strip()}
        for fact, signal, label in (
            ("event", "event_community", "Événement ou communauté"),
            ("inbound", "inbound_content", "Contenu entrant"),
        )
        if isinstance(facts, Mapping) and extra.get(signal) and str(facts.get(fact) or "").strip()
    ]
    if declared_facts:
        section["declared_route_facts"] = declared_facts
    return section


def _buying_committee_section(
    contacts: Mapping[str, Any] | None,
    *,
    contacts_available: bool,
    industrial: bool = False,
    profile_data: Mapping[str, Any] | None = None,
    objective: str | None = None,
) -> dict[str, Any]:
    """#2311.26 — le comité d'achat (rôles + matrice Pouvoir/Intérêt), en
    langage naturel. `assemble_buying_committee`/`committee_prompt_block`
    existaient déjà pour le PLAN async (`phase4_plan.py`) — jamais appelés
    depuis une commande `/chat` (0 résultat `committee_prompt_block` dans
    `chat_tools.py` avant ce lot). Réutilise les DEUX fonctions pures et déjà
    testées (GA-26), jamais un second moteur de classification.

    Dépend des MÊMES contacts que `contacts_and_coverage` — jamais un second
    appel bellum_api (GA-26)."""
    if not contacts_available or not isinstance(contacts, Mapping) or contacts.get("error"):
        return {"known": False, "reason": _BUYING_COMMITTEE_ABSENT_REASON}
    from app.knowledge.buying_committee import (
        approach_order,
        assemble_buying_committee,
        committee_prompt_block,
        evaluate_multithreading,
    )

    raw = contacts.get("contacts")
    raw_list = [c for c in raw if isinstance(c, Mapping)] if isinstance(raw, list) else []
    committee = assemble_buying_committee(raw_list, industrial=industrial)
    section: dict[str, Any] = {"known": True, "summary": committee["summary"]}
    if committee.get("missingRoles"):
        section["missing_roles"] = committee["missingRoles"]
    narrative = committee_prompt_block(committee, objective)
    if narrative:
        section["narrative"] = narrative
    focus = _priority_focus(committee, profile_data)
    if focus:
        section["priority_focus"] = focus
    # #3263 (BEL-SC-234) — fils couverts/manquants + dépendance excessive à une
    # personne, sur le MÊME comité déjà assemblé ci-dessus (jamais un second
    # calcul, GA-26). Clés traduites en snake_case, comme le reste de cette
    # section (`missing_roles`, `priority_focus`) — `evaluate_multithreading`
    # rend du camelCase pour ses autres appelants (`org_graph_build.py`).
    multithreading = evaluate_multithreading(committee)
    section["multithreading"] = {
        "covered_threads": multithreading["coveredThreads"],
        "missing_threads": multithreading["missingThreads"],
        "overreliance": multithreading["overreliance"],
    }
    # #3263.27 (épopée #3282) — l'ordre dans lequel approcher les membres
    # NOMMÉS, sur le MÊME comité déjà assemblé (jamais un second calcul).
    # Absent quand personne n'est nommé — jamais une séquence inventée.
    order = approach_order(committee, objective)
    if order:
        section["approach_order"] = [
            {"full_name": m["fullName"], "committee_role": m["committeeRole"], "quadrant": m["quadrant"]} for m in order
        ]
    return section


_CRM_NOT_CONNECTED_REASON = (
    "Aucun CRM branché sur cet espace — la présence de ce compte dans le CRM n'est pas mesurable."
)
_CRM_BRIDGE_SILENT_REASON = (
    "Le CRM branché n'a pas répondu — la présence de ce compte dans le CRM n'est pas mesurable pour l'instant."
)
# #3708 (recette prod 09/10) — un CRM EXCLU pour ce fil n'est ni « non
# branché » (c'est branché, juste écarté par un choix réversible de ce fil) ni
# silencieux : une raison dédiée, jamais la même phrase que pour une
# intégration absente (même doctrine que `excluded_sources_block`).
# #3973 — LA phrase d'une source décochée pour ce fil (« Outils et sources ») :
# le CRM ici, la messagerie et l'agenda du brief du jour (`get_daily_briefing`).
EXCLUDED_FOR_THREAD_NOTE = "Exclu par toi pour ce fil — non lu, bien que branché."
_CRM_EXCLUDED_REASON = EXCLUDED_FOR_THREAD_NOTE


def _crm_match_section(
    *, crm_connected: bool, crm_presence: Mapping[str, Any] | None, crm_excluded: bool = False
) -> dict[str, Any]:
    """#3182.1/.2 (LAU-FINAL-188, retour bêta 28/09/2026) — le prérequis
    « présence CRM » d'une ouverture de compte : est-ce que le CRM branché
    connaît déjà ce compte (un RAPPROCHEMENT de compte) ? Laura le retrouve
    elle-même plutôt que de le demander (#3182.1 — « ne pas demander ce que
    Bellum peut retrouver seul »).

    #3892.3 (ADD-SANOFI-06, retour bêta Sanofi 08/10/2026) — RENOMMÉ depuis
    `_crm_referencement_section`/`crm_referencement` : le mot « référencement »
    désigne PARTOUT ailleurs dans ce dépôt le référencement FOURNISSEUR
    (`action_recommender.py`, `opening_movement.py` — « être un fournisseur
    approuvé/éligible à un appel d'offres »), une information que ce compilateur
    ne mesure PAS. Cette section ne dit qu'une chose : ce compte a-t-il une
    fiche dans le CRM branché — ni référencement fournisseur, ni éligibilité à
    un dispositif d'achat, ni relation commerciale active, qui restent TROIS
    informations distinctes et non mesurées ici.

    Sans clé = no-op strict : un espace sans CRM branché n'appelle jamais le
    pont (l'appelant ne le tente que si `crm_connected`), nommé absent ici.
    `crm_presence` vient de `bellum_api.crm_presence`, DÉJÀ vendor-neutre
    (`connected: bool`, jamais `provider`) — relayé tel quel, jamais un second
    calcul (GA-26), jamais le nom du fournisseur (doctrine CLAUDE.md).

    `crm_excluded` (#3708, recette prod 09/10) — la personne a DÉCOCHÉ le CRM
    pour ce fil (« Outils et sources »). Vérifié AVANT `crm_connected` : une
    réponse citait encore « dernière activité CRM… 31/08 » lue depuis cette
    préléture, malgré l'exclusion — le reçu de transparence le disait exclu,
    mais le CONTEXTE, lui, portait encore la donnée. L'appelant
    (`get_account_preflight`) ne doit même plus APPELER `bellum_api.
    crm_presence` dans ce cas (« ne les lis par aucun autre chemin » —
    `excluded_sources_block`) ; cette garde est la DERNIÈRE ligne si jamais il
    le faisait quand même."""
    if crm_excluded:
        return {"known": False, "reason": _CRM_EXCLUDED_REASON}
    if not crm_connected:
        return {"known": False, "reason": _CRM_NOT_CONNECTED_REASON}
    if not isinstance(crm_presence, Mapping) or crm_presence.get("error"):
        return {"known": False, "reason": _CRM_BRIDGE_SILENT_REASON}
    section: dict[str, Any] = {"known": True, "connected": bool(crm_presence.get("connected"))}
    if "matched" in crm_presence:
        section["matched"] = bool(crm_presence.get("matched"))
    contacts_count = crm_presence.get("contacts_count")
    if isinstance(contacts_count, int) and not isinstance(contacts_count, bool):
        section["contacts_count"] = contacts_count
    open_deals = crm_presence.get("open_deals")
    if isinstance(open_deals, list):
        section["open_deals_count"] = len(open_deals)
    last_activity_at = crm_presence.get("last_activity_at")
    if isinstance(last_activity_at, str) and last_activity_at.strip():
        section["last_activity_at"] = last_activity_at
    return section


def _data_conflicts_section(intelligence_context: Mapping[str, Any] | None) -> dict[str, Any]:
    """#190.1/#190.8 (épopée #3219) — les contradictions de champ OUVERTES.

    `FieldConflictService.openConflicts` existait déjà (PDF 6 §5.3), branché
    sur `GET /accounts/:id/conflicts` mais jamais sur une réponse `/chat` : une
    contradiction `unresolved` disparaissait à la fin du tour où elle aurait
    été vue. La façade canonique (`intelligence_context`, #2285.2) la rejoue
    désormais depuis `record_field_audit` (append-only) à CHAQUE lecture —
    jamais une seconde table — donc une contradiction ouverte reste visible
    d'une conversation à l'autre : ce n'est plus calculé pour une seule réponse
    et oublié.

    `[]` est un FAIT connu (aucune contradiction ouverte aujourd'hui), jamais
    une inconnue (GA-18/GA-19) — seule l'ABSENCE de la façade elle-même (pont
    éteint, service indisponible) rend cette section inconnue."""
    if not isinstance(intelligence_context, Mapping):
        return {"known": False, "reason": _DATA_CONFLICTS_ABSENT_REASON}
    raw = intelligence_context.get("conflicts")
    raw_list = [c for c in raw if isinstance(c, Mapping)] if isinstance(raw, list) else []
    return {"known": True, "conflicts": raw_list}


def _past_consultants_section(staffing_history: Mapping[str, Any] | None) -> dict[str, Any]:
    """#3182.2 (épopée #3248, retour bêta 28/09/2026) — le prérequis « anciens
    consultants » d'une ouverture de compte : qui du vivier a déjà été
    positionné ICI. « aucun outil ne relie l'historique de staffing d'un
    compte à ses consultants passés » — `search_talents` balaie le vivier
    ENTIER, jamais filtré par compte.

    `staffing_history` vient de `bellum_api.account_staffing_history`, DÉJÀ
    appelé par l'orchestrateur — `None` = pont éteint, compte étranger, ou
    réseau en échec, jamais une liste vide devinée (GA-18/GA-19). Une liste
    RÉELLEMENT vide (le pont a répondu, personne n'a jamais été positionné
    ici) reste `known: True` — ce n'est jamais un signe d'erreur."""
    if not isinstance(staffing_history, Mapping) or staffing_history.get("error"):
        return {"known": False, "reason": _PAST_CONSULTANTS_UNAVAILABLE_REASON}
    raw = staffing_history.get("consultants")
    raw_list = [c for c in raw if isinstance(c, Mapping) and c.get("consultant_id")] if isinstance(raw, list) else []
    deduped = _dedupe([dict(c) for c in raw_list], _consultant_key)
    capped, truncated = deduped[:_LIST_CAP], len(deduped) > _LIST_CAP
    return {"known": True, "consultants": capped, "truncated": truncated}


def _team_scope_section(commercial_load: Mapping[str, Any] | None) -> dict[str, Any]:
    """#3182.2 (épopée #3248, reste « disponibilité de l'équipe commerciale ») —
    LE MODÈLE D'ÉQUIPE MINIMAL : ce produit n'a toujours PAS de modèle
    d'équipe/permission MULTI-UTILISATEUR (RLS mono-utilisateur) — #2301.17
    tient. Ce que cette section nomme, c'est la charge DÉJÀ déclarée par
    l'espace (Réglages › Charge commerciale, `commercial_load`, résultat DÉJÀ
    appelé de `bellum_api.commercial_load_capacity`), croisée avec le compte
    RÉEL de dossiers suivis par le commercial qui s'apprête à ouvrir ce
    compte — jamais une liste de « collègues » inventée.

    `None`/`error` = pont éteint ou réseau en échec, nommé plutôt que deviné.
    """
    if not isinstance(commercial_load, Mapping) or commercial_load.get("error"):
        return {"known": False, "reason": _TEAM_SCOPE_ABSENT_REASON}
    tracked_count = commercial_load.get("trackedAccountsCount")
    if not isinstance(tracked_count, int):
        return {"known": False, "reason": _TEAM_SCOPE_ABSENT_REASON}

    max_tracked = commercial_load.get("maxTrackedAccounts")
    max_tracked = max_tracked if isinstance(max_tracked, int) else None
    weekly_hours = commercial_load.get("weeklyAvailableHours")
    weekly_hours = weekly_hours if isinstance(weekly_hours, int) else None
    consultant = commercial_load.get("consultant")
    consultant = consultant if isinstance(consultant, Mapping) else None
    at_capacity = max_tracked is not None and tracked_count >= max_tracked

    section: dict[str, Any] = {
        "known": True,
        "consultant": consultant,
        "max_tracked_accounts": max_tracked,
        "tracked_accounts_count": tracked_count,
        "weekly_available_hours": weekly_hours,
        "at_capacity": at_capacity,
    }
    if at_capacity:
        name = consultant.get("name") if consultant else None
        who = f"Le consultant {name}" if name else "Le commercial déclaré sur cet espace"
        section["missing_prerequisite"] = (
            f"{who} a atteint son plafond déclaré de {max_tracked} dossiers suivis "
            f"({tracked_count} actuellement) — libérer un dossier avant d'ouvrir celui-ci."
        )
    return section


def _collect_unknowns(known_sections: Mapping[str, Any]) -> list[dict[str, str]]:
    """#2301.27 — section 10, « les inconnues qui changent la décision ».

    Ne nomme QUE ce qui n'est effectivement pas connu — une liste vide connue
    (signaux, observations) n'y entre jamais (GA-18/GA-19)."""
    unknowns: list[dict[str, str]] = []
    workspace_relationship = known_sections.get("workspace_relationship") or {}
    if not workspace_relationship.get("known"):
        unknowns.append({"section": "workspace_relationship", "reason": workspace_relationship.get("reason", "")})
    contacts_and_coverage = known_sections.get("contacts_and_coverage") or {}
    contacts = contacts_and_coverage.get("contacts") or {}
    if not contacts.get("known"):
        unknowns.append({"section": "contacts", "reason": contacts.get("reason", "")})
    coverage = contacts_and_coverage.get("coverage") or {}
    if not coverage.get("known"):
        unknowns.append({"section": "coverage", "reason": coverage.get("reason", "")})
    confirmed_needs = known_sections.get("confirmed_needs") or {}
    if not confirmed_needs.get("known"):
        unknowns.append({"section": "confirmed_needs", "reason": confirmed_needs.get("reason", "")})
    buying_committee = known_sections.get("buying_committee") or {}
    if not buying_committee.get("known"):
        unknowns.append({"section": "buying_committee", "reason": buying_committee.get("reason", "")})
    crm_match = known_sections.get("crm_match") or {}
    if not crm_match.get("known"):
        unknowns.append({"section": "crm_match", "reason": crm_match.get("reason", "")})
    past_consultants = known_sections.get("past_consultants") or {}
    if not past_consultants.get("known"):
        unknowns.append({"section": "past_consultants", "reason": past_consultants.get("reason", "")})
    team_scope = known_sections.get("team_scope") or {}
    if not team_scope.get("known"):
        unknowns.append({"section": "team_scope", "reason": team_scope.get("reason", "")})
    data_conflicts = known_sections.get("data_conflicts") or {}
    if not data_conflicts.get("known"):
        unknowns.append({"section": "data_conflicts", "reason": data_conflicts.get("reason", "")})
    commercial_route = known_sections.get("commercial_route") or {}
    if not commercial_route.get("known"):
        unknowns.append({"section": "commercial_route", "reason": commercial_route.get("reason", "")})
    return unknowns


def _build_ctas(known_sections: Mapping[str, Any], *, subsidiaries_present: bool) -> list[dict[str, Any]]:
    """#2301.34-38 — les CTA proposés, chacun vers un outil /chat RÉEL.

    #2301.40 (NO-GO) — garde structurelle : `launch_full_analysis` n'est émis
    QUE si des `known_sections` accompagnent l'appel. Un appelant qui passerait
    un mapping vide (le bug qu'on redoute) ne reçoit PAS ce CTA tout seul —
    c'est le test qui sait dire NON (`test_the_cta_builder_itself_refuses_...`).
    """
    ctas: list[dict[str, Any]] = [
        {"id": "respond_with_existing", "label": "Répondre avec l'existant", "next_tool": None},
        {
            "id": "refresh_contacts_only",
            "label": "Actualiser uniquement les contacts",
            "next_tool": "get_account_contacts",
        },
        {
            "id": "verify_recent_signals",
            "label": "Vérifier les signaux récents",
            "next_tool": "get_account_preflight",
        },
    ]
    if subsidiaries_present:
        # #2301.37 — recoupe le comparateur multi-périmètre (#2303, traité
        # séparément) : on pointe vers l'outil qui existe déjà, on ne
        # réimplémente rien ici.
        ctas.append({"id": "compare_filiales", "label": "Comparer les filiales", "next_tool": "compare_accounts"})
    if known_sections:
        ctas.append(
            {
                "id": "launch_full_analysis",
                "label": "Lancer l'analyse complète",
                "next_tool": "start_account_analysis",
            }
        )
    return ctas


def _recommended_cta(known_sections: Mapping[str, Any], *, has_prior_analysis: bool) -> str:
    """#2301.39 — préférence : répondre avec l'existant quand ça suffit.

    Échelle dégressive, dans l'ordre où les CTA sont listés ci-dessus :
    1. dossier déjà analysé + contacts connus → répondre avec l'existant ;
    2. dossier déjà analysé mais contacts inconnus → les actualiser d'abord ;
    3. dossier non analysé mais un signal/une observation existe → vérifier
       les signaux avant de proposer le geste le plus coûteux ;
    4. rien de tout ça → lancer l'analyse complète (dernier recours, jamais
       le premier réflexe — #2301.40)."""
    contacts_and_coverage = known_sections.get("contacts_and_coverage") or {}
    contacts_known = bool((contacts_and_coverage.get("contacts") or {}).get("known"))
    if has_prior_analysis and contacts_known:
        return "respond_with_existing"
    if has_prior_analysis and not contacts_known:
        return "refresh_contacts_only"
    signals = (known_sections.get("current_signals") or {}).get("signals") or []
    observations = (known_sections.get("structural_observations") or {}).get("observations") or []
    if signals or observations:
        return "verify_recent_signals"
    return "launch_full_analysis"


def compile_account_preflight(
    account: Mapping[str, Any],
    *,
    contacts: Mapping[str, Any] | None = None,
    contacts_available: bool = False,
    crm_connected: bool = False,
    intelligence_context: Mapping[str, Any] | None = None,
    industrial: bool = False,
    profile_data: Mapping[str, Any] | None = None,
    objective: str | None = None,
    crm_presence: Mapping[str, Any] | None = None,
    staffing_history: Mapping[str, Any] | None = None,
    commercial_load: Mapping[str, Any] | None = None,
    crm_excluded: bool = False,
    account_access: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Assemble la prélecture d'UN compte déjà possédé.

    Pure — aucune I/O. L'appelant (`chat_tools.execute_chat_tool`) a déjà fait
    les lectures nécessaires (compte possédé, contacts et façade canonique via
    le pont NestJS) et en passe le résultat ici, exactement comme pour
    `build_account_briefing`. `intelligence_context` — #2285.2 — est la MÊME
    façade que lit la fiche compte (`AccountIntelligenceContextService`,
    `None` quand le pont est éteint ou la façade indisponible côté API).
    `industrial` — même défaut sûr que `org_graph_build.py` : appelant qui ne
    connaît pas le profil du vendeur, comité byte-identique pour une ESN IT.
    `profile_data` — #2311.27 — le profil ESN déjà résolu pour CE tour de chat
    (`chat-context.service.ts`), jamais une seconde lecture : `None` (défaut)
    laisse `priority_focus` absent, jamais une taille devinée.
    `objective` — #2311.23 — comprendre/ouvrir/vendre, quand le modèle l'a
    reconnu dans le tour : réordonne SEULEMENT le narratif (doctrine c76).
    `crm_presence` — #3182.1 (LAU-FINAL-188) — est le résultat DÉJÀ appelé de
    `bellum_api.crm_presence`, `None` quand l'appelant ne l'a pas tenté (CRM
    non branché) ou que le pont n'a pas répondu.
    `staffing_history` — #3182.2 (épopée #3248) — est le résultat DÉJÀ appelé
    de `bellum_api.account_staffing_history`, `None` quand le pont n'a pas
    répondu.
    `commercial_load` — #3182.2 (épopée #3248, reste « disponibilité de
    l'équipe commerciale ») — est le résultat DÉJÀ appelé de
    `bellum_api.commercial_load_capacity`, `None` quand le pont n'a pas
    répondu.
    `crm_excluded` — #3708 (recette prod 09/10) — le CRM est DÉCOCHÉ pour ce
    fil (« Outils et sources ») : `crm_match` le dit, quels que soient
    `crm_connected`/`crm_presence` (l'appelant ne doit déjà plus les avoir
    appelés). `False` (défaut) : comportement byte-identique à avant ce lot.
    `account_access` — #3278.2 — le résultat DÉJÀ appelé de
    `bellum_api.account_access`, dont seul `purchasing_panel` est relu ici ;
    `None` quand le pont n'a pas répondu (le critère reste non évaluable).
    """
    identity = _identity_section(account, crm_connected=crm_connected, intelligence_context=intelligence_context)
    workspace_relationship = _workspace_relationship_section(account)
    contacts_and_coverage = _contacts_and_coverage_section(contacts, contacts_available=contacts_available)
    confirmed_needs = _confirmed_needs_section()
    current_signals = _current_signals_section(account)
    structural_observations = _structural_observations_section(account)
    team_scope = _team_scope_section(commercial_load)
    sector_buying_roles = _sector_buying_roles_section(account)
    buying_committee = _buying_committee_section(
        contacts,
        contacts_available=contacts_available,
        industrial=industrial,
        profile_data=profile_data,
        objective=objective,
    )
    crm_match = _crm_match_section(crm_connected=crm_connected, crm_presence=crm_presence, crm_excluded=crm_excluded)
    data_conflicts = _data_conflicts_section(intelligence_context)
    past_consultants = _past_consultants_section(staffing_history)
    commercial_route = _commercial_route_section(account, contacts, account_access)

    known_sections: dict[str, Any] = {
        "identity": identity,
        "workspace_relationship": workspace_relationship,
        "contacts_and_coverage": contacts_and_coverage,
        "confirmed_needs": confirmed_needs,
        "current_signals": current_signals,
        "structural_observations": structural_observations,
        "team_scope": team_scope,
        "sector_buying_roles": sector_buying_roles,
        "buying_committee": buying_committee,
        "crm_match": crm_match,
        "data_conflicts": data_conflicts,
        "past_consultants": past_consultants,
        "commercial_route": commercial_route,
    }

    has_prior_analysis = account.get("priority_score") is not None or bool(account.get("raw_analysis"))
    subsidiaries_present = bool(identity.get("subsidiaries"))

    result: dict[str, Any] = {
        "account_id": account.get("id"),
        "known_sections": known_sections,
        "unknowns": _collect_unknowns(known_sections),
        "suggested_ctas": _build_ctas(known_sections, subsidiaries_present=subsidiaries_present),
        "recommended_cta": _recommended_cta(known_sections, has_prior_analysis=has_prior_analysis),
    }
    company_name = account.get("company_name")
    if company_name:
        result["company_name"] = company_name
    return result
