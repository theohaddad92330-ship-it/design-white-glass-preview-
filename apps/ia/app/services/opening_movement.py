"""Deterministic opening-movement routing (Annexe Méthodologie Sales ESN p13,
TABLE C — « Stratégies d'ouverture, choisir le bon mouvement »).

The spec is explicit: top-down / bottom-up / middle-out / sandwich are OPTIONS,
not slogans — the movement must be CHOSEN from the account archetype × the
relationship × the ESN stage, and the plan today only exposes 3 of the 7
movements, picked softly by the LLM. This module computes the recommended
movement deterministically from the SalesContext triple (P0), so score/plan can
branch on a real rule. No LLM — compute-side, explainable.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from datetime import date
from typing import Any

# The 7 movements + their canonical sequence (p13). `sequence` is injected into
# the plan prompt so the model follows the movement instead of guessing.
OPENING_MOVEMENTS: dict[str, str] = {
    "bottom_up": "N-2 → N-1 → sponsor / achats",
    "middle_out": "manager → users / pairs → budget",
    "top_down": "sponsor → délégation → opérationnels",
    "sandwich": "terrain + budget en parallèle, achats ensuite",
    "rang2": "delivery → manager client → sponsor direct sans brûler le partenaire",
    "prospection_inversee": "besoin → manager → qualification → push / soutenance",
    "public": "veille → partenaire / titulaire → métier → procédure",
    # #2312.19 (épopée #2963) — RÉACTIVATION : réouvrir une relation EXISTANTE
    # mais éteinte, distincte d'un premier contact (jamais fondue dans
    # top_down/_STRONG_TIE, qui suppose une relation encore vivante).
    "reactivation": "sponsor historique → reconfirmer le besoin actuel → relancer la séquence",
    # #2312.18 — FILIALE/SITE : entrer par un périmètre plus accessible que le
    # groupe entier. Vocabulaire exposé ; sélection automatique HORS LOT ici
    # (aucun signal réel de « périmètre accessible » dans le triplet
    # SalesContext esn_stage×archetype×relationship — nécessiterait de croiser
    # avec le résolveur de territoire, #2961, un second module).
    "filiale_site": "filiale/site accessible → référent local → remonter vers le groupe",
    # #2312.20 — RÉFÉRENCEMENT : comprendre le circuit avant de prospecter.
    # Même limite que ci-dessus : vocabulaire exposé, sélection auto hors lot.
    "referencement": "veille référencement fournisseur → comprendre le circuit → qualifier avant de prospecter",
}

# The 13 named commercial routes + 2 by mission signal (#2273.9-.21, épopée #2959 — LAU-FINAL-015).
# A ROUTE is HOW the account is entered (relation existante / réactivation /
# filiale / partenaire / appel d'offres...); a MOUVEMENT (above) is the hierarchy
# tactic ONCE a route is chosen — the two are additive, never competing
# recommendations. Four names are shared verbatim with OPENING_MOVEMENTS
# (bottom_up, middle_out, rang_2, prospection_inversee) because the epic names
# them as routes too: for those, the movement IS the route.
COMMERCIAL_ROUTES: dict[str, str] = {
    "relation_existante": "une relation déjà active porte l'entrée",
    "reactivation": "un ancien client redevient une entrée chaude",
    "direct_accessible": "un décideur est joignable sans détour",
    "filiale_site": "l'entrée passe par une filiale ou un site, pas le siège",
    "bottom_up": "entrer bas (N-2 accessible / douleur terrain), remonter",
    "middle_out": "entrer par un manager accessible (N-1), remonter vers le budget",
    "sponsor": "un sponsor interne porte l'entrée",
    "rang_2": "entrer par le delivery, atteindre le client final sans brûler le partenaire",
    "partenaire": "l'entrée passe par un partenaire déjà en place",
    "prospection_inversee": "partir d'un besoin/profil concret, remonter vers la qualification",
    "appel_offres": "la voie contractuelle (marché / accord-cadre / titulaire) prime",
    "expansion_client": "élargir un compte déjà client, pas le re-séduire",
    "recommandation": "le compte est référé, l'entrée est déjà recommandée",
    # #3278.1 (#3259.2) — deux routes portées par les MISSIONS du compte
    # (`missions`, lues côté API) : jamais une route devinée sans mission.
    "consultant_present": "un consultant de l'ESN est déjà en mission chez le client",
    "ancien_consultant": "un ancien consultant de l'ESN a déjà travaillé chez le client",
    # #3278.1 (#3259.2) — portée par un signal d'achat DÉCLARÉ sur le compte
    # (`accounts.declared_signals`, #2634.1) : jamais une route devinée sans signal.
    "signal_entrant": "un signal d'achat déclaré sur le compte porte l'entrée",
    # #3278.1 (lot M11 09/10) — deux des quatre routes restantes, chacune portée
    # par un fait lu côté API (pont `accounts/access`, `route_signals`) : jamais
    # nommées sans lui. Événement/communauté et inbound/contenu n'ont AUCUN objet
    # source dans le dépôt : elles ne figurent pas ici (route devinée sinon).
    "veille_seule": "le compte est mis en veille : surveiller sans prospecter jusqu'à sa condition de réveil",
    "depuis_talent": "un talent du vivier a déjà travaillé chez ce client : partir de son profil (reverse prospecting)",
    # #3278.1 (décision Louis 11/10/2026) — les deux dernières routes, avec leurs objets sources :
    # deux faits DÉCLARÉS sur la fiche du compte (`accounts.declared_route_event` /
    # `declared_route_inbound`, « Compléter la fiche »), relayés par le pont `accounts/access`.
    # Jamais nommées sans eux : une route devinée serait une donnée inventée.
    "evenement_communaute": "un contact a été noué lors d'un événement ou dans une communauté : repartir de ce moment",
    "inbound_contenu": "le compte est venu à nous par un contenu (téléchargement, inscription, réponse) : répondre à sa demande",
}

# Relationship states that carry a strong enough tie to enter high (top-down).
_STRONG_TIE = {"client_actif", "ancien_client", "refere"}
# Cold-ish states — no warm lever yet. 'dormant' n'y est PLUS (#2312.19) : une
# relation dormante a déjà existé, ce n'est pas un premier contact froid.
_COLD_ISH = {"froid", "connu", "linkedin"}
_SMALL_STAGES = {"freelance", "petite"}
_BIG_COMPLEX_ARCHETYPES = {"grand_groupe", "banque_assurance"}

# #2500 (démo, GÊNANT, mesuré en prod le 17/09/2026) — le plan d'action
# affichait « (grand_groupe) » : `rationale` interpole des phrases lues par le
# commercial (via `movement_prompt_block`, injectée dans le prompt système que
# le modèle peut reciter verbatim), et l'identifiant SQL n'y a jamais sa place.
# Libellés des archétypes (`ACCOUNT_ARCHETYPES`, sales_context.py) — un seul
# dictionnaire ici, gardé par un test qui itère sur toutes les combinaisons.
_ARCHETYPE_LABELS: dict[str, str] = {
    "startup": "startup",
    "pme_eti": "PME/ETI",
    "grand_groupe": "grand groupe",
    "banque_assurance": "banque/assurance",
    "public": "secteur public",
    "luxe_retail_media": "luxe/retail/média",
    "industrie": "industrie",
    "international": "compte international",
}


def _archetype_label(archetype: str) -> str:
    return _ARCHETYPE_LABELS.get(archetype, "ce type de compte")


# Même défaut, même correctif : `relationship_state` (RELATIONSHIP_STATES,
# sales_context.py) fuyait aussi tel quel dans la branche « relation forte ».
_RELATIONSHIP_LABELS: dict[str, str] = {
    "froid": "froide",
    "connu": "connue",
    "linkedin": "LinkedIn",
    "dormant": "dormante",
    "refere": "référée",
    "ancien_client": "ancien client",
    "rang2": "rang 2",
    "client_actif": "client actif",
    "besoin_ouvert": "besoin ouvert",
    "partenaire_actif": "partenaire actif",  # #2371.4
}


def _relationship_label(relationship: str) -> str:
    return _RELATIONSHIP_LABELS.get(relationship, "cette relation")


def recommend_opening_movement(
    esn_stage: str | None,
    account_archetype: str | None,
    relationship_state: str | None,
) -> dict[str, str]:
    """Return ``{movement, sequence, rationale}`` for the SalesContext triple,
    following TABLE C. Priority order matters (specific relationship/archetype
    before the size-based fallback)."""
    stage = (esn_stage or "").strip()
    archetype = (account_archetype or "").strip()
    relationship = (relationship_state or "").strip()

    def out(movement: str, why: str) -> dict[str, str]:
        return {"movement": movement, "sequence": OPENING_MOVEMENTS[movement], "rationale": why}

    # 1) Already a subcontractor on the account → respect the titulaire.
    if relationship == "rang2":
        return out(
            "rang2", "relation rang 2 : passer par le delivery, atteindre le client final sans brûler le partenaire"
        )
    # 2) Public sector → the contractual route IS the movement.
    if archetype == "public":
        return out(
            "public",
            "archétype secteur public : la voie contractuelle (marché / accord-cadre / titulaire) prime sur le besoin métier",
        )
    # 3) An open, qualified need → push a concrete profile/need (reverse prospecting).
    if relationship == "besoin_ouvert":
        return out(
            "prospection_inversee",
            "besoin ouvert : partir du besoin/profil concret, remonter manager → qualification → push",
        )
    # 3bis) #2312.19 — a relation that EXISTED but went quiet → reopen it,
    # never a cold first contact and never the strong-tie top-down (the tie
    # isn't live any more, it must be reconfirmed first).
    if relationship == "dormant":
        return out(
            "reactivation",
            "relation dormante : réouvrir avec le sponsor historique, reconfirmer le besoin avant de relancer",
        )
    # 4) A strong existing tie → leverage the sponsor top-down.
    if relationship in _STRONG_TIE:
        return out(
            "top_down",
            f"relation forte ({_relationship_label(relationship)}) : entrer par le sponsor et faire ruisseler",
        )
    # 5) Big complex account, still cold → attack terrain and budget in parallel.
    if archetype in _BIG_COMPLEX_ARCHETYPES and relationship in _COLD_ISH:
        return out(
            "sandwich",
            f"grand compte complexe ({_archetype_label(archetype)}) en approche froide : "
            "terrain + budget en parallèle, achats ensuite",
        )
    # 6) Small ESN, cold → start low on an accessible N-2.
    if stage in _SMALL_STAGES and relationship in _COLD_ISH:
        return out(
            "bottom_up",
            f"petite ESN ({stage}) en approche froide : entrer bas (N-2 accessible / douleur terrain), remonter",
        )
    # 7) Default: an accessible manager is the entry point.
    return out(
        "middle_out",
        "cas par défaut : entrer par un manager accessible (N-1 décideur / prescripteur), remonter vers le budget",
    )


# #2312.21 (épopée #2963, décision Louis 28/09) — LES DIX CRITÈRES NOMMÉS par
# le corps de l'issue, et lesquels PÈSENT réellement dans le choix ci-dessus.
#
# Cinq audits indépendants (24-27/09, derniers commentaires #2963) ont
# reconfirmé au code, à chaque fois, que la seule source autoritaire (Annexe
# Méthodologie Sales ESN, TABLE C p13, dont `recommend_opening_movement` est
# la traduction déterministe) ne croise que TROIS axes. Inventer une règle de
# pondération pour les sept autres serait deviner l'arbitrage lui-même —
# doctrine « un contrat d'API non vérifiable ne se devine pas ».
#
# Ce que la décision de Louis tranche, ce n'est PAS ce blocage (il tient
# toujours : la sélection ci-dessus ne change pas d'une ligne) mais la FORME
# de la transparence : au lieu d'un silence renouvelé à chaque lot, les DIX
# critères sont désormais NOMMÉS — les trois sourcés avec un poids ÉGAL entre
# eux, les sept autres NON ÉVALUABLES et EXCLUS du dénominateur (GA-18/GA-19
# appliqué au sélecteur de stratégie, jamais un zéro pour un critère non
# mesuré).
STRATEGY_SELECTION_CRITERIA: dict[str, str] = {
    "esn_stage": "taille de l'ESN",
    "account_archetype": "taille du compte",
    "relationship_state": "relation",
    "scope": "périmètre de la mission",
    "objectives": "objectifs du compte",
    "available_roles": "rôles disponibles côté client",
    "purchasing": "processus d'achat",
    "partners": "partenaires déjà identifiés",
    "history": "historique de la relation",
    "timing": "fenêtre de temps",
    # #3278.2b (Louis 15/10) — déclaratifs : le commercial les saisit ; vide = « non renseigné ».
    "budget": "budget",
    "availability": "disponibilité",
    "network": "réseau existant",
    # #3278.3 (#3259.3, lot V5-E6) — lus sur ce que l'espace a déjà ACCUMULÉ (pont d'accès,
    # `accumulated_route_criteria`), jamais saisis ; absents = `no_source`, jamais « 0 ».
    "proofs": "preuves mobilisables",
    "channel_history": "historique des canaux",
}

# Les trois seuls croisés par TABLE C — l'ORDRE suit celui de `recommend_
# opening_movement` (esn_stage, account_archetype, relationship_state).
_SOURCED_STRATEGY_CRITERIA = ("esn_stage", "account_archetype", "relationship_state")

# #3278.2 — le panel/référencement DÉCLARÉ (`account_access.purchasing_panel`)
# est le seul sous-aspect connu du « processus d'achat » : le critère devient
# évaluable SOUS UN LIBELLÉ QUI NOMME CETTE RESTRICTION, jamais « processus
# d'achat » nu (« on n'affiche pas ce qu'on n'a pas »).
PURCHASING_PANEL_VALUES = ("panel_ferme", "panel_ouvert", "refus_referencement")
PURCHASING_PANEL_LABEL = "processus d'achat — panel/référencement connu"

# #3278.2 (lot M11 09/10) — les six critères sans source structurée, chacun
# DÉCLARABLE à la main sur la fiche du compte (une colonne `declared_route_*`,
# relue par le pont d'accès). Déclaré ⇒ évaluable avec le texte du commercial ;
# vide ⇒ reste nommé `no_source`, jamais une valeur devinée.
DECLARABLE_STRATEGY_CRITERIA = (
    "scope",
    "objectives",
    "available_roles",
    "partners",
    "history",
    "timing",
    # #3278.2b (Louis 15/10) — budget, disponibilité, réseau existant : déclaratifs.
    "budget",
    "availability",
    "network",
)

ACCUMULATED_STRATEGY_CRITERIA = ("proofs", "channel_history")

# #3278.a — l'absence d'un fait accumulé se DIT (une phrase), elle ne s'invente pas et ne se tait pas.
ACCUMULATED_ABSENCE_SENTENCES = {
    "proofs": "aucune référence client publiable dans le secteur de ce compte",
    "channel_history": "aucun historique de canal sur ce compte",
}


def strategy_selection_criteria(
    esn_stage: str | None,
    account_archetype: str | None,
    relationship_state: str | None,
    purchasing_panel: str | None = None,
    declared_criteria: Mapping[str, Any] | None = None,
    accumulated_criteria: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Les quinze critères, dans l'ordre de {@link STRATEGY_SELECTION_CRITERIA},
    chacun `evaluable` ou non, jamais un poids deviné.

    Un critère SOURCÉ mais absent sur CE compte précis (`esn_stage` non encore
    renseigné, par exemple) porte `reason: "not_collected"` — distinct des sept
    critères qui n'ont structurellement AUCUNE règle source
    (`reason: "no_source"`) : la première est une donnée qui viendra, la
    seconde est un arbitrage qui n'existe nulle part à traduire.
    """
    values = {
        "esn_stage": esn_stage,
        "account_archetype": account_archetype,
        "relationship_state": relationship_state,
    }
    evaluated_keys = [key for key in _SOURCED_STRATEGY_CRITERIA if (values[key] or "").strip()]
    panel = (purchasing_panel or "").strip()
    panel = panel if panel in PURCHASING_PANEL_VALUES else ""
    if panel:
        evaluated_keys.append("purchasing")
    declared: dict[str, str] = {}
    for key in DECLARABLE_STRATEGY_CRITERIA:
        raw = (declared_criteria or {}).get(key)
        text = raw.strip() if isinstance(raw, str) else ""
        if text:
            declared[key] = text
            evaluated_keys.append(key)
    accumulated: dict[str, str] = {}
    for key in ACCUMULATED_STRATEGY_CRITERIA:
        raw = (accumulated_criteria or {}).get(key)
        text = raw.strip() if isinstance(raw, str) else ""
        if text:
            accumulated[key] = text
            evaluated_keys.append(key)
    # Poids ÉGAL entre les critères sourcés RÉELLEMENT évalués sur ce compte —
    # jamais un poids fixe qui présumerait les trois toujours présents. Jamais
    # arrondi ici : arrondir est une décision d'AFFICHAGE (`measurability.ts`),
    # pas une décision de calcul.
    weight = 1 / len(evaluated_keys) if evaluated_keys else None
    criteria: list[dict[str, Any]] = []
    for key, label in STRATEGY_SELECTION_CRITERIA.items():
        if key in _SOURCED_STRATEGY_CRITERIA:
            value = (values[key] or "").strip()
            if value:
                criteria.append({"key": key, "label": label, "evaluable": True, "value": value, "weight": weight})
                continue
            criteria.append({"key": key, "label": label, "evaluable": False, "reason": "not_collected"})
            continue
        if key == "purchasing" and panel:
            criteria.append(
                {
                    "key": key,
                    "label": PURCHASING_PANEL_LABEL,
                    "evaluable": True,
                    "value": panel,
                    "weight": weight,
                }
            )
            continue
        if key in declared:
            criteria.append(
                {
                    "key": key,
                    "label": label,
                    "evaluable": True,
                    "value": declared[key],
                    "weight": weight,
                    "source": "declared",
                }
            )
            continue
        if key in accumulated:
            criteria.append(
                {
                    "key": key,
                    "label": label,
                    "evaluable": True,
                    "value": accumulated[key],
                    "weight": weight,
                    "source": "accumulated",
                }
            )
            continue
        criteria.append({"key": key, "label": label, "evaluable": False, "reason": "no_source"})
    return criteria


def route_signals_from_contacts(contacts: Iterable[Mapping[str, Any]] | None) -> dict[str, bool]:
    """#2273.9-.21 — les deux SIGNAUX qui rendent `sponsor` et `middle_out`
    atteignables, lus sur les contacts NOMMÉS du dossier (jamais un paramètre
    deviné).

    - ``sponsor_known`` : un contact nommé porte le rôle décisionnel « sponsor »
      (``contact_priority_score._ROLE_POWER``).
    - ``manager_reachable`` : un contact nommé de niveau ``management`` a un
      canal JOIGNABLE (e-mail ou profil LinkedIn) — « entrer par un manager
      accessible », l'accessibilité étant la seule chose qu'on ne suppose pas.

    Rien d'autre n'est lu : pas de signal « partenaire » ni « relation active »
    ici, leur source (``account_partners`` côté API, historique d'interaction)
    ne voyage pas jusqu'à la phase plan — voir le docstring de
    ``recommend_commercial_route``."""
    sponsor_known = False
    manager_reachable = False
    for contact in contacts or []:
        if not (contact.get("fullName") or contact.get("full_name")):
            continue
        role = str(contact.get("role") or contact.get("decisionRole") or contact.get("decision_role") or "")
        if role.strip().lower() == "sponsor":
            sponsor_known = True
        level = str(contact.get("hierarchyLevel") or contact.get("hierarchy_level") or "").strip().lower()
        reachable = any(contact.get(k) for k in ("email", "linkedinUrl", "linkedin_url", "linkedin"))
        if level == "management" and reachable:
            manager_reachable = True
    return {"sponsor_known": sponsor_known, "manager_reachable": manager_reachable}


def route_signals_from_sales_context(sales_context: Mapping[str, Any] | None) -> dict[str, bool]:
    """#2273.9-.21 — les deux signaux que le SalesContext PORTE déjà, rendant
    `relation_existante` et `partenaire` atteignables. Un signal absent n'est
    PAS une clé à `False` : le dict est vide quand rien n'est déclaré.

    - ``relation_active`` : une dernière interaction est DÉCLARÉE sur le compte
      (``relationship.lastInteractionAt``, KnownAccountContext) — un historique
      d'interaction réel, jamais déduit d'un état « connu » seul.
    - ``partner_declared`` : l'espace a déclaré au moins un partenaire en place
      sur ce compte (``declaredPartners``, issu de ``account_partners``).
    - ``consultant_present`` / ``former_consultant`` (#3278.1) : le compte porte
      une mission EN COURS / seulement TERMINÉE (``consultantHistory`` =
      ``present`` / ``former``, lue sur ``missions`` côté API).
    - ``declared_signal`` (#3278.1) : un signal d'achat DÉCLARÉ (saisie ou
      import, #2634.1) existe sur le compte (``declaredSignalPresent``, lue
      sur ``accounts.declared_signals`` côté API) — jamais une détection
      automatique du pipeline."""
    sc = sales_context or {}
    signals: dict[str, bool] = {}
    relationship = sc.get("relationship") or {}
    if str(relationship.get("lastInteractionAt") or "").strip():
        signals["relation_active"] = True
    partners = sc.get("declaredPartners") or []
    if any(str(name or "").strip() for name in partners):
        signals["partner_declared"] = True
    history = sc.get("consultantHistory")
    if history == "present":
        signals["consultant_present"] = True
    elif history == "former":
        signals["former_consultant"] = True
    # #3278.1 — route « signal entrant » : un signal d'achat DÉCLARÉ (saisie ou
    # import, #2634.1) existe sur ce compte, jamais une détection automatique.
    if sc.get("declaredSignalPresent"):
        signals["declared_signal"] = True
    # #3278.1 — veille / talent / événement / inbound, lus côté API et persistés
    # avec le SalesContext (`declaredRouteSignals`) : le plan asynchrone les lit
    # comme `/chat` lit le pont. Seul un `True` compte.
    declared = sc.get("declaredRouteSignals")
    if isinstance(declared, Mapping):
        for key in ("watch_only", "talent_from_account", "event_community", "inbound_content"):
            if declared.get(key) is True:
                signals[key] = True
    return signals


def with_route_signals(
    sales_context: dict[str, Any] | None, contacts: Iterable[Mapping[str, Any]] | None
) -> dict[str, Any] | None:
    """Le SalesContext accompagné des signaux de route : ceux lus sur les
    contacts du dossier (:func:`route_signals_from_contacts`) et ceux qu'il porte
    lui-même (:func:`route_signals_from_sales_context`).

    Rend l'entrée INCHANGÉE (même objet) tant qu'aucun signal n'est vrai ou qu'il
    n'y a pas de SalesContext : un dossier sans signal produit un prompt
    byte-identique à avant."""
    if not sales_context:
        return sales_context
    signals = {**route_signals_from_contacts(contacts), **route_signals_from_sales_context(sales_context)}
    if not any(signals.values()):
        return sales_context
    return {**sales_context, "routeSignals": signals}


def recommend_commercial_route(
    esn_stage: str | None,
    account_archetype: str | None,
    relationship_state: str | None,
    signals: Mapping[str, bool] | None = None,
) -> dict[str, str]:
    """Return ``{route, label, rationale}`` — WHICH of the 13 named commercial
    routes (#2273.9-.21) opens this account, from the same SalesContext triple
    ``recommend_opening_movement`` reads.

    ``signals`` (#2273.9-.21, décision Louis 30/09 : une donnée absente se
    BRANCHE) — ``sponsor_known`` / ``manager_reachable``, lus sur les contacts
    nommés du dossier (:func:`route_signals_from_contacts`) — rendent
    ``sponsor`` et ``middle_out`` atteignables. Absents ⇒ comportement
    byte-identique à avant.

    ``relation_existante`` and ``partenaire`` are reached by two further
    signals (:func:`route_signals_from_sales_context`) : ``relation_active`` (an
    interaction declared on the account) and ``partner_declared`` (a partner in
    place, ``account_partners``). Without them neither is ever named (the
    ``connu``/``linkedin`` states stay cold-ish — doctrine : jamais de donnée
    fictive)."""
    stage = (esn_stage or "").strip()
    archetype = (account_archetype or "").strip()
    relationship = (relationship_state or "").strip()
    sponsor_known = bool((signals or {}).get("sponsor_known"))
    manager_reachable = bool((signals or {}).get("manager_reachable"))
    relation_active = bool((signals or {}).get("relation_active"))
    partner_declared = bool((signals or {}).get("partner_declared"))
    consultant_present = bool((signals or {}).get("consultant_present"))
    former_consultant = bool((signals or {}).get("former_consultant"))
    declared_signal = bool((signals or {}).get("declared_signal"))
    watch_only = bool((signals or {}).get("watch_only"))
    talent_from_account = bool((signals or {}).get("talent_from_account"))
    event_community = bool((signals or {}).get("event_community"))
    inbound_content = bool((signals or {}).get("inbound_content"))

    def out(route: str, why: str) -> dict[str, str]:
        return {"route": route, "label": COMMERCIAL_ROUTES[route], "rationale": why}

    # #3278.1 (lot M11) — le niveau d'effort « veille » est une DÉCISION posée
    # sur le compte (`accounts.sprint = 'watch'`, avec sa condition de réveil) :
    # aucune route de prospection ne la contredit, quelle que soit la relation.
    if watch_only:
        return out(
            "veille_seule",
            "le compte est au niveau d'effort veille : surveiller ses signaux, aucune prospection "
            "avant que sa condition de réveil ne soit remplie",
        )
    # Same priority order as recommend_opening_movement — one SalesContext
    # triple, two additive recommendations read off it.
    if relationship == "rang2":
        return out(
            "rang_2", "déjà sous-traitant : passer par le delivery, atteindre le client final sans brûler le partenaire"
        )
    if archetype == "public":
        return out(
            "appel_offres", "archétype secteur public : la voie contractuelle (marché / accord-cadre / titulaire) prime"
        )
    if relationship == "besoin_ouvert":
        return out(
            "prospection_inversee", "besoin ouvert : partir du besoin/profil concret, remonter vers la qualification"
        )
    # #3431 (30/09/2026, recette RÉFUTÉ sur #3431) — RÉACTIVATION, PAS OUBLIÉE
    # ICI NON PLUS. `recommend_opening_movement` (même fichier, mêmes
    # signaux) distingue déjà `dormant` du froid depuis #2312.19 : une
    # relation dormante a déjà existé, ce n'est pas un premier contact.
    # `recommend_commercial_route` ne la citait NULLE PART — sans cette
    # branche, `dormant` ne correspond à aucun des cas ci-dessus (il n'est PAS
    # dans `_COLD_ISH`, #2312.19) et retombait sur le défaut générique
    # (« direct_accessible », aucune mention de la relation) : exactement le
    # symptôme de la recette, une connexion dormante jamais nommée comme
    # telle dans la route lue par Laura.
    if relationship == "dormant":
        return out(
            "reactivation",
            "relation dormante : réouvrir la relation existante, pas un premier contact froid",
        )
    if relationship == "client_actif":
        return out("expansion_client", "déjà client actif : élargir le compte, pas le re-séduire")
    if relationship == "ancien_client":
        return out("reactivation", "ancien client : réactiver la relation plutôt que prospecter à froid")
    if relationship == "refere":
        return out("recommandation", "compte référé : l'entrée est déjà recommandée")
    # #3278.1 — une mission du compte est un fait signé : elle prime sur une
    # simple interaction déclarée. En cours avant terminée.
    if consultant_present and relationship in _COLD_ISH | {"dormant"}:
        return out(
            "consultant_present",
            "un consultant de l'ESN est déjà en mission chez ce client : entrer par lui, il connaît les besoins",
        )
    if former_consultant and relationship in _COLD_ISH | {"dormant"}:
        return out(
            "ancien_consultant",
            "une mission passée est terminée chez ce client : rouvrir par ce consultant plutôt qu'un premier contact froid",
        )
    # #2273 — une interaction DÉCLARÉE ou un partenaire en place sont des
    # liens réels : ils priment sur le sponsor et sur toute route déduite de la
    # seule taille, mais jamais sur une route de relation plus précise ci-dessus.
    if relation_active and relationship in _COLD_ISH:
        return out(
            "relation_existante",
            "une interaction récente est déclarée sur le compte : s'appuyer sur cette relation plutôt qu'un premier contact froid",
        )
    if partner_declared and relationship in _COLD_ISH:
        return out(
            "partenaire", "un partenaire est déjà en place sur le compte : entrer par lui plutôt que par un détour"
        )
    # #3278.1 — un signal d'achat DÉCLARÉ (saisie ou import, jamais une
    # détection automatique) est un fait concret à citer : il prime sur un
    # sponsor ou une taille de compte, mais jamais sur une relation ou un
    # partenariat déjà réels (ci-dessus).
    if declared_signal and relationship in _COLD_ISH:
        return out(
            "signal_entrant",
            "un signal d'achat a été déclaré sur ce compte : s'appuyer sur ce fait concret plutôt qu'un contact générique",
        )
    # #3278.1 (décision Louis 11/10/2026) — un contact venu à nous par un contenu (inbound) ou noué
    # dans un événement / une communauté : des faits DÉCLARÉS sur la fiche, plus chauds qu'un talent
    # passé mais moins qu'une mission, une relation, un partenaire ou un signal d'achat (ci-dessus).
    # L'inbound (le compte a fait le premier pas) passe avant l'événement.
    if inbound_content and relationship in _COLD_ISH:
        return out(
            "inbound_contenu",
            "ce compte est venu à nous par un contenu : répondre à sa demande, au moment où il l'a faite, "
            "plutôt qu'un premier contact générique",
        )
    if event_community and relationship in _COLD_ISH:
        return out(
            "evenement_communaute",
            "un contact a été noué lors d'un événement ou dans une communauté : repartir de ce moment "
            "plutôt qu'un premier contact générique",
        )
    # #3278.1 (lot M11) — reverse prospecting : un talent du vivier a travaillé
    # chez ce client (expérience de CV, client nommé non masqué). Un lien réel
    # mais plus faible qu'une mission signée, une interaction, un partenaire ou
    # un signal déclarés (ci-dessus) ; il prime sur un sponsor ou une taille.
    if talent_from_account and relationship in _COLD_ISH:
        return out(
            "depuis_talent",
            "un talent du vivier a déjà travaillé chez ce client : partir de son profil et de ce qu'il "
            "connaît du compte plutôt qu'un premier contact générique",
        )
    # #2273 — un sponsor NOMMÉ dans le dossier est la porte, avant toute route
    # déduite de la seule taille (les routes de relation ci-dessus gardent la
    # priorité : un client actif s'élargit, il ne se re-séduit pas).
    if sponsor_known and relationship in _COLD_ISH | {"dormant"}:
        return out("sponsor", "un sponsor est déjà nommé dans le dossier : entrer par lui plutôt que par un détour")
    if archetype in _BIG_COMPLEX_ARCHETYPES and relationship in _COLD_ISH:
        return out(
            "filiale_site",
            f"grand compte complexe ({_archetype_label(archetype)}) en approche froide : "
            "entrer par une filiale ou un site, pas le siège",
        )
    if stage in _SMALL_STAGES and relationship in _COLD_ISH:
        return out(
            "bottom_up",
            f"petite ESN ({stage}) en approche froide : entrer bas (N-2 accessible / douleur terrain), remonter",
        )
    if manager_reachable and relationship in _COLD_ISH | {"dormant"}:
        return out(
            "middle_out",
            "un manager joignable est nommé dans le dossier : entrer par lui (N-1), remonter vers le budget",
        )
    # #3431 — le cas par défaut ne nommait JAMAIS la température de la
    # relation, même quand elle EST connue et froide (`_COLD_ISH`) : Laura
    # pouvait lire « cas par défaut : un décideur accessible... » pour un
    # compte réellement froid sans qu'aucun mot ne le distingue d'un compte
    # où la relation n'est simplement pas mesurée. Nommé seulement quand
    # `relationship in _COLD_ISH` (froid/connu/LinkedIn) — jamais sur une
    # relation non mesurée (doctrine « non mesuré n'est jamais 0 »).
    if relationship in _COLD_ISH:
        return out(
            "direct_accessible",
            f"relation {_relationship_label(relationship)} : contextualiser plutôt qu'un message générique — "
            "un décideur accessible porte l'entrée, sans détour connu",
        )
    return out("direct_accessible", "cas par défaut : un décideur accessible porte l'entrée, sans détour connu")


# #2273.22-.29 (épopée #2959) — la RECOMMANDATION DE ROUTE à 8 attributs :
# route (`recommend_commercial_route` ci-dessus) + les 7 autres, chacun un
# savoir MÉTHODOLOGIQUE par route (même nature que `OPENING_MOVEMENTS` et
# `COMMERCIAL_ROUTES` au-dessus — un texte de méthode, jamais une donnée de
# compte) — pas un second calcul par compte, aucune collecte neuve.
#
# Seules les routes RÉELLEMENT atteignables par `recommend_commercial_route`
# ont une entrée ici (`sponsor`/`middle_out`/`relation_existante`/`partenaire`
# le sont par SIGNAL) :
# une entrée pour une route que la fonction ne rend jamais serait un attribut
# mort, invérifiable.
_ROUTE_ATTRIBUTES: dict[str, dict[str, str | None]] = {
    "rang_2": {
        "first_door": "le delivery en place (l'interlocuteur qui exécute déjà sur le compte)",
        "info_to_obtain": "qui est le client final derrière le partenaire titulaire",
        "proof": "un accès confirmé au client final, avec l'accord tacite du partenaire",
        "next_contact": "le manager client final, présenté PAR le delivery",
        "passage_condition": "le partenaire ne se sent pas contourné",
        "fallback_plan": "rester fournisseur de rang 2, viser le prochain renouvellement du marché",
        "discouraged_route": "direct_accessible",
        "first_channel": "échange direct",
        "secondary_channel": "règles écrites, cadrées avec le partenaire",
        "channel_rationale": "route partenaire : échange direct et règles écrites, jamais un canal choisi parce qu'il est disponible",
    },
    "appel_offres": {
        "first_door": "le service achats ou la cellule marchés publics",
        "info_to_obtain": "le calendrier de la procédure et les titulaires actuels",
        "proof": "une réponse à consultation déposée, ou un accord-cadre référencé",
        "next_contact": "le référent métier nommé dans le cahier des charges",
        "passage_condition": "l'ESN est référencée ou éligible à répondre",
        "fallback_plan": "se positionner en sous-traitant d'un titulaire déjà référencé",
        "discouraged_route": "bottom_up",
        # Aucune des cinq règles CANAL de la spec (#3259) ne nomme la voie
        # contractuelle — tranché sans Louis, par analogie au registre formel/
        # écrit de la route partenaire (même nature : un canal cadré, pas un
        # contact informel).
        "first_channel": "réponse formelle à la procédure (dossier écrit)",
        "secondary_channel": "échange direct avec le service achats",
        "channel_rationale": "voie contractuelle : même registre formel/écrit que la route partenaire, jamais un email informel",
    },
    "prospection_inversee": {
        "first_door": "le manager qui porte le besoin exprimé",
        "info_to_obtain": "le périmètre exact et l'urgence réelle du besoin",
        "proof": "une qualification confirmée du besoin par le manager lui-même",
        "next_contact": "le budget ou le sponsor qui validera la mission",
        "passage_condition": "le besoin est confirmé, pas seulement affiché",
        "fallback_plan": "nurturer le contact jusqu'au prochain signal d'ouverture",
        "discouraged_route": "appel_offres",
        "first_channel": "appel court",
        "secondary_channel": None,
        "channel_rationale": "information recherchée : un appel court qualifie plus vite qu'un message écrit",
    },
    "expansion_client": {
        "first_door": "le sponsor déjà en poste sur la mission active",
        "info_to_obtain": "les besoins adjacents non couverts par le périmètre actuel",
        "proof": "une satisfaction confirmée sur la mission en cours",
        "next_contact": "le manager du périmètre adjacent visé",
        "passage_condition": "la mission actuelle est saine, sans risque ouvert",
        "fallback_plan": "sécuriser le renouvellement avant toute extension",
        "discouraged_route": "direct_accessible",
        "first_channel": "appel",
        "secondary_channel": "email personnel",
        "channel_rationale": "relation chaude : le sponsor en place justifie un canal direct, pas une prise de contact froide",
    },
    "reactivation": {
        "first_door": "le sponsor historique de la relation éteinte",
        "info_to_obtain": "pourquoi la relation s'est arrêtée, et si la raison tient encore",
        "proof": "une réponse positive du sponsor historique à la reprise de contact",
        "next_contact": "le remplaçant du sponsor s'il a quitté le poste",
        "passage_condition": "le motif d'arrêt d'origine n'est plus d'actualité",
        "fallback_plan": "repartir en direct_accessible si le sponsor historique est introuvable",
        "discouraged_route": "direct_accessible",
        "first_channel": "appel",
        "secondary_channel": "email personnel",
        "channel_rationale": "relation chaude (réactivation) : le sponsor historique justifie un canal direct plutôt qu'un message générique",
    },
    "recommandation": {
        "first_door": "la personne qui a référé le compte",
        "info_to_obtain": "ce que le référent a déjà annoncé au compte à propos de l'ESN",
        "proof": "une introduction confirmée par le référent, pas seulement promise",
        "next_contact": "le contact désigné par le référent, jamais un autre à froid",
        "passage_condition": "le référent a effectivement introduit, pas seulement mentionné",
        "fallback_plan": "repartir en direct_accessible si l'introduction n'aboutit pas sous 15 jours",
        "discouraged_route": "bottom_up",
        "first_channel": "introduction",
        "secondary_channel": "email personnel",
        "channel_rationale": "relation chaude : l'entrée est déjà recommandée, l'introduction prime sur un contact non introduit",
    },
    "filiale_site": {
        "first_door": "le référent local de la filiale ou du site accessible",
        "info_to_obtain": "le niveau d'autonomie décisionnelle réel de ce site",
        "proof": "un besoin confirmé et propre au site, pas hérité du groupe",
        "next_contact": "le sponsor groupe, présenté par le référent local",
        "passage_condition": "le site a un budget ou une autonomie d'achat propre",
        "fallback_plan": "rester au niveau du site si le groupe ne s'ouvre pas",
        "discouraged_route": "top_down",
        "first_channel": "LinkedIn",
        "secondary_channel": "email ciblé",
        "channel_rationale": "contact froid mais contexte public : pas de relation connue, LinkedIn ou un email ciblé ouvrent sans détour",
    },
    "bottom_up": {
        "first_door": "un N-2 accessible qui vit la douleur terrain",
        "info_to_obtain": "qui décide réellement du budget au-dessus de ce N-2",
        "proof": "une douleur terrain confirmée et un premier accord de principe",
        "next_contact": "le N-1 direct de l'interlocuteur terrain",
        "passage_condition": "la douleur terrain est confirmée, pas supposée",
        "fallback_plan": "rester au niveau terrain et nurturer jusqu'à un signal budget",
        "discouraged_route": "top_down",
        "first_channel": "LinkedIn",
        "secondary_channel": "email ciblé",
        "channel_rationale": "contact froid mais contexte public : même registre que filiale_site, l'entrée reste un premier contact non introduit",
    },
    "sponsor": {
        "first_door": "le sponsor déjà nommé dans le dossier",
        "info_to_obtain": "ce que ce sponsor porte réellement comme besoin et jusqu'où va son pouvoir de décision",
        "proof": "un échange confirmé avec le sponsor, pas seulement son nom dans un organigramme",
        "next_contact": "le décideur budget que le sponsor désigne",
        "passage_condition": "le sponsor confirme un besoin et accepte de présenter l'ESN",
        "fallback_plan": "repartir en direct_accessible si le sponsor ne répond pas ou a changé de poste",
        "discouraged_route": "bottom_up",
        "first_channel": "LinkedIn",
        "secondary_channel": "email personnel",
        "channel_rationale": "un sponsor nommé justifie un message personnel adressé à lui, pas une prise de contact générique",
    },
    "middle_out": {
        "first_door": "le manager joignable nommé dans le dossier (N-1)",
        "info_to_obtain": "qui, au-dessus de ce manager, arbitre le budget, et ce que ses équipes vivent au quotidien",
        "proof": "un besoin opérationnel confirmé par le manager lui-même",
        "next_contact": "le décideur budget, présenté par le manager",
        "passage_condition": "le manager confirme le besoin et accepte d'en parler à son niveau supérieur",
        "fallback_plan": "repartir en direct_accessible si le manager ne fait pas remonter le sujet",
        "discouraged_route": "top_down",
        "first_channel": "LinkedIn",
        "secondary_channel": "email ciblé",
        "channel_rationale": "un manager joignable est nommé : un message direct ouvre sans détour, l'entrée reste un premier contact non introduit",
    },
    "relation_existante": {
        "first_door": "l'interlocuteur de la dernière interaction déclarée sur le compte",
        "info_to_obtain": "où en est cette relation et ce qui a été promis au dernier échange",
        "proof": "une reprise d'échange confirmée avec cet interlocuteur, pas seulement une date au dossier",
        "next_contact": "le décideur que cet interlocuteur désigne",
        "passage_condition": "la relation est encore vivante : l'interlocuteur répond",
        "fallback_plan": "repartir en direct_accessible si l'interlocuteur ne répond plus",
        "discouraged_route": "bottom_up",
        "first_channel": "appel",
        "secondary_channel": "email personnel",
        "channel_rationale": "relation déjà active : un canal direct reprend le fil, pas une prise de contact générique",
    },
    "partenaire": {
        "first_door": "le partenaire déjà en place sur le compte",
        "info_to_obtain": "ce que le partenaire accepte de dire de l'organisation et jusqu'où il peut introduire",
        "proof": "une introduction confirmée par le partenaire, pas seulement promise",
        "next_contact": "le contact que le partenaire désigne dans le compte",
        "passage_condition": "le partenaire ne se sent pas contourné",
        "fallback_plan": "repartir en direct_accessible si le partenaire ne fait pas l'introduction",
        "discouraged_route": "direct_accessible",
        "first_channel": "échange direct",
        "secondary_channel": "règles écrites, cadrées avec le partenaire",
        "channel_rationale": "route partenaire : échange direct et règles écrites, jamais un canal choisi parce qu'il est disponible",
    },
    "consultant_present": {
        "first_door": "le consultant de l'ESN actuellement en mission chez le client",
        "info_to_obtain": "les besoins à venir que ce consultant entend sur place, et qui décide",
        "proof": "une présentation confirmée par le consultant à un décideur du compte",
        "next_contact": "le responsable de mission côté client, puis le décideur qu'il désigne",
        "passage_condition": "le consultant accepte de faire le lien sans mettre sa mission en risque",
        "fallback_plan": "repartir en direct_accessible si le consultant ne souhaite pas introduire",
        "discouraged_route": "direct_accessible",
        "first_channel": "introduction",
        "secondary_channel": "échange direct",
        "channel_rationale": "un consultant est déjà sur place : l'introduction par lui ouvre mieux qu'un message à froid",
    },
    "ancien_consultant": {
        "first_door": "l'ancien consultant de l'ESN qui a travaillé chez le client",
        "info_to_obtain": "comment la mission s'est terminée et qui l'a appréciée côté client",
        "proof": "un échange repris avec l'ancien interlocuteur de mission, pas seulement une mission au dossier",
        "next_contact": "le responsable de mission d'alors, puis le décideur actuel",
        "passage_condition": "la mission s'est bien terminée et l'interlocuteur est encore en poste",
        "fallback_plan": "repartir en direct_accessible si l'interlocuteur d'alors a quitté le compte",
        "discouraged_route": "bottom_up",
        "first_channel": "appel",
        "secondary_channel": "email personnel",
        "channel_rationale": "une mission passée donne une légitimité : un appel reprend le fil, pas un message générique",
    },
    "signal_entrant": {
        "first_door": "l'interlocuteur le plus proche du signal déclaré (titre, entité ou contexte du signal)",
        "info_to_obtain": "ce que le signal déclaré change réellement pour ce compte, et qui le porte côté client",
        "proof": "une réponse qui confirme le lien avec le signal cité, pas seulement une ouverture générique",
        "next_contact": "le décideur que ce premier interlocuteur désigne",
        "passage_condition": "l'interlocuteur confirme que le signal cité est pertinent pour lui",
        "fallback_plan": "repartir en direct_accessible si le signal ne trouve aucun écho",
        "discouraged_route": "bottom_up",
        "first_channel": "email ciblé",
        "secondary_channel": "LinkedIn",
        "channel_rationale": "un fait concret et daté justifie un message qui le cite, pas une prise de contact générique",
    },
    "veille_seule": {
        "first_door": "aucune porte à ouvrir maintenant : le compte reste en veille",
        "info_to_obtain": "le signal qui remplirait la condition de réveil posée sur ce compte",
        "proof": "un signal daté qui remplit la condition de réveil, pas une simple impression",
        "next_contact": "le contact le plus proche du signal, une fois la condition remplie",
        "passage_condition": "la condition de réveil posée sur le compte est remplie",
        "fallback_plan": "rester en veille et réexaminer à la date de revue du niveau d'effort",
        "discouraged_route": "direct_accessible",
        "first_channel": "veille des signaux (aucun envoi)",
        "secondary_channel": None,
        "channel_rationale": "compte en veille : on surveille, on n'écrit pas tant que la condition de réveil n'est pas remplie",
    },
    "inbound_contenu": {
        "first_door": "la personne du compte qui a consulté, téléchargé ou répondu à notre contenu",
        "info_to_obtain": "ce qui l'a amenée à notre contenu et le besoin qu'elle y cherchait",
        "proof": "une demande ou une action datée de sa part, pas une simple impression d'intérêt",
        "next_contact": "son manager ou le décideur du sujet qu'elle cherchait",
        "passage_condition": "elle accepte un échange sur le sujet de ce contenu",
        "fallback_plan": "repartir en direct_accessible si la personne ne répond pas sous quelques jours",
        "discouraged_route": "appel_offres",
        "first_channel": "email ciblé",
        "secondary_channel": "LinkedIn",
        "channel_rationale": "le compte a fait le premier pas : une réponse rapide qui cite sa demande vaut mieux qu'un message générique",
    },
    "evenement_communaute": {
        "first_door": "la personne rencontrée lors de l'événement ou dans la communauté",
        "info_to_obtain": "ce qui a été dit sur place et le sujet qui l'intéressait",
        "proof": "un échange daté lors de l'événement ou dans la communauté, pas un souvenir approximatif",
        "next_contact": "son collègue ou son manager sur le sujet évoqué",
        "passage_condition": "elle se souvient de l'échange et accepte une suite",
        "fallback_plan": "repartir en direct_accessible si l'échange date trop pour être cité",
        "discouraged_route": "appel_offres",
        "first_channel": "email ciblé",
        "secondary_channel": "LinkedIn",
        "channel_rationale": "un échange en personne justifie un message qui le rappelle, pas une prise de contact à froid",
    },
    "depuis_talent": {
        "first_door": "le talent du vivier qui a travaillé chez ce client",
        "info_to_obtain": "ce que ce talent sait du compte : équipes, besoins, interlocuteurs d'alors",
        "proof": "un interlocuteur du compte qui reconnaît le talent ou son périmètre d'alors",
        "next_contact": "le manager du périmètre où le talent a travaillé",
        "passage_condition": "le talent accepte que son profil soit présenté à ce client",
        "fallback_plan": "repartir en direct_accessible si le périmètre d'alors n'existe plus",
        "discouraged_route": "appel_offres",
        "first_channel": "email ciblé",
        "secondary_channel": "LinkedIn",
        "channel_rationale": "un profil concret qui connaît le compte justifie un message qui le présente, pas une prise de contact générique",
    },
    "direct_accessible": {
        "first_door": "le décideur identifié, sans détour connu",
        "info_to_obtain": "s'il existe un doorway plus chaud (sponsor, filiale, partenaire) avant d'insister à froid",
        "proof": "une réponse obtenue du décideur, même négative mais réelle",
        "next_contact": "la personne désignée par le décideur s'il délègue",
        "passage_condition": "le décideur répond ou délègue explicitement",
        "fallback_plan": "chercher un doorway plus chaud (filiale, référence) avant de réinsister à froid",
        "discouraged_route": "top_down",
        "first_channel": "LinkedIn",
        "secondary_channel": "email ciblé",
        "channel_rationale": "contact froid mais contexte public : cas par défaut, aucun détour connu",
    },
}

# #3259 (BEL-SC-230) — SORTIE : `fallback_route` (une AUTRE route nommée) et
# `stop_condition`, réservés aux routes dont le texte de méthode ci-dessus
# nomme EXPLICITEMENT l'un ou l'autre (une clause « si X » ou un « repartir en
# <route> ») — jamais devinés pour les six autres routes atteignables
# (doctrine « un contrat d'API non vérifiable ne se devine pas », même
# discipline que `STRATEGY_SELECTION_CRITERIA`, `reason: "no_source"`).
_ROUTE_FALLBACK_AND_STOP: dict[str, dict[str, str]] = {
    "reactivation": {
        "fallback_route": "direct_accessible",
        "stop_condition": "le sponsor historique reste introuvable",
    },
    "recommandation": {
        "fallback_route": "direct_accessible",
        "stop_condition": "l'introduction n'aboutit pas sous 15 jours",
    },
    "filiale_site": {
        # "rester au niveau du site" ne nomme pas d'AUTRE route (on reste sur
        # filiale_site) : pas de fallback_route, mais le déclencheur d'arrêt
        # est bien nommé dans le texte.
        "stop_condition": "le groupe ne s'ouvre pas au-delà du site",
    },
}


def route_recommendation(
    esn_stage: str | None,
    account_archetype: str | None,
    relationship_state: str | None,
    signals: Mapping[str, bool] | None = None,
) -> dict[str, str]:
    """Return les 8 attributs (#2273.22-.29) : route/label/rationale
    (`recommend_commercial_route`) + première porte/info à obtenir/preuve/
    contact suivant/condition de passage/plan de repli/route déconseillée."""
    base = recommend_commercial_route(esn_stage, account_archetype, relationship_state, signals)
    return {**base, **_ROUTE_ATTRIBUTES[base["route"]]}


_PLAN_ROUTE_KEYS = (
    "route",
    "label",
    "rationale",
    "first_door",
    "info_to_obtain",
    "proof",
    "next_contact",
    "passage_condition",
    "fallback_plan",
    "discouraged_route",
)


_FRESH_ROUTE_FLAGS = ("watch_only", "talent_from_account", "event_community", "inbound_content")


def with_fresh_route_inputs(
    sales_context: dict[str, Any] | None,
    *,
    declared_partners: Iterable[str] | None = None,
    consultant_history: str | None = None,
    declared_signal_present: bool = False,
    declared_route_signals: Mapping[str, bool] | None = None,
) -> dict[str, Any] | None:
    """#3278 (recette prod 14/10) — le plan relit le SalesContext PERSISTÉ à la
    recherche ; un signal posé depuis (veille, talent, événement, inbound,
    signal d'achat déclaré, mission, partenaire) n'y figure pas. L'API les relit
    à chaque appel du plan : ils s'ajoutent ici au contexte, sous les MÊMES clés
    que `build_sales_context`. Rien de frais → même objet (byte-identique) ;
    jamais un `False` écrit : une clé absente ne dit rien."""
    if not sales_context:
        return sales_context
    fresh: dict[str, Any] = {}
    partners = [str(name).strip() for name in declared_partners or [] if str(name or "").strip()]
    if partners:
        fresh["declaredPartners"] = partners
    if consultant_history in ("present", "former"):
        fresh["consultantHistory"] = consultant_history
    if declared_signal_present:
        fresh["declaredSignalPresent"] = True
    flags = {key: True for key in _FRESH_ROUTE_FLAGS if (declared_route_signals or {}).get(key) is True}
    if flags:
        persisted = sales_context.get("declaredRouteSignals")
        fresh["declaredRouteSignals"] = {**(persisted if isinstance(persisted, Mapping) else {}), **flags}
    return {**sales_context, **fresh} if fresh else sales_context


def recommended_route_for_plan(
    sales_context: dict[str, Any] | None,
    contacts: Iterable[Mapping[str, Any]] | None,
    *,
    accumulated_criteria: Mapping[str, Any] | None = None,
    account_data: Mapping[str, Any] | None = None,
    today: date | None = None,
) -> dict[str, str] | None:
    """#2959 — la route calculée, telle qu'elle voyage dans le PLAN rendu
    (`recommendedRoute`, comme `recommendedMovement`). `None` sans SalesContext :
    rien n'est deviné, la clé est absente du plan. Les clés CANAL restent hors du
    plan (elles servent le bloc de prompt, pas la fiche).

    #3278.r42 — la route CITE ce qui la fonde : `proof_cited` (preuves accumulées par l'espace, avec
    leur source et le jour du relevé), `channel_history` (canaux déjà utilisés) et `motivating_signal`
    (le signal daté que le plan suit, source et jour). Un fait absent n'a pas de clé : jamais « 0 »,
    jamais une preuve inventée. `proof` reste le CRITÈRE du moteur (ce qui validerait la route)."""
    if not sales_context:
        return None
    route = route_recommendation_from_context(with_route_signals(sales_context, contacts))
    payload = {key: str(route[key]) for key in _PLAN_ROUTE_KEYS if route.get(key)}
    reading_day = (today or date.today()).isoformat()
    accumulated = accumulated_criteria if isinstance(accumulated_criteria, Mapping) else {}
    proofs = accumulated.get("proofs")
    if isinstance(proofs, str) and proofs.strip():
        payload["proof_cited"] = f"{proofs.strip()} — source : références client de l'espace, relevé au {reading_day}"
    history = accumulated.get("channel_history")
    if isinstance(history, str) and history.strip():
        payload["channel_history"] = history.strip()
    followed = followed_signal_for_plan(account_data or {}, today)
    if followed:
        payload["motivating_signal"] = " · ".join(
            part for part in (followed["signal"], followed.get("source"), followed["date"]) if part
        )
    return payload


_DAY_PREFIX = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:$|[T\s])")
_FRENCH_DAY = re.compile(r"^(\d{1,2})(?:er)?\s+([a-zéûè]+)\s+(\d{4})(?!\d)", re.IGNORECASE)
_FRENCH_MONTHS = "janvier février mars avril mai juin juillet août septembre octobre novembre décembre".split()


def _signal_day(raw: object) -> str | None:
    """Le jour ISO d'une date de signal : `2026-10-12…` ou « 12 octobre 2026 » (l'analyse écrit souvent la
    date en toutes lettres). Un mois ou une année seuls, « non datée » : `None`, jamais complété."""
    text = str(raw or "").strip()
    iso = _DAY_PREFIX.match(text)
    if iso:
        return iso.group(1)
    french = _FRENCH_DAY.match(text)
    if not french or french.group(2).lower() not in _FRENCH_MONTHS:
        return None
    month = _FRENCH_MONTHS.index(french.group(2).lower()) + 1
    return f"{french.group(3)}-{month:02d}-{int(french.group(1)):02d}"


def followed_signal_for_plan(account_data: Mapping[str, Any], today: date | None = None) -> dict[str, str] | None:
    """#3278.b — le signal que le plan SUIT : le plus récent signal du compte daté AU JOUR (une année ou un
    mois seuls ne datent pas), jamais dans le futur. Aucun signal éligible → `None` : rien n'est inventé."""
    reference = today or date.today()
    best: tuple[str, str, Mapping[str, Any]] | None = None
    for item in account_data.get("recentSignals") or account_data.get("recent_signals") or []:
        if not isinstance(item, Mapping):
            continue
        text = str(item.get("signal") or "").strip()
        day = _signal_day(item.get("date"))
        if not text or not day:
            continue
        try:
            when = date.fromisoformat(day)
        except ValueError:
            continue
        if when > reference:
            continue
        if best is None or day > best[0]:
            best = (day, text, item)
    if best is None:
        return None
    day, text, item = best
    source = str(item.get("source") or "").strip()
    return {"signal": text, "date": day, **({"source": source} if source else {})}


def attach_plan_followed_signal(
    merged: dict[str, Any], account_data: Mapping[str, Any], today: date | None = None
) -> None:
    """#3278.b — pose `followedSignal` sur le plan rendu ; sans signal daté, la clé est absente."""
    followed = followed_signal_for_plan(account_data, today)
    if followed:
        merged["followedSignal"] = followed


def route_recommendation_from_context(sales_context: dict[str, Any] | None) -> dict[str, str]:
    """Convenience wrapper reading the emitted SalesContext dict (P0 shape) —
    même patron que `recommend_route_from_context`."""
    sc = sales_context or {}
    esn = sc.get("esnProfile") or {}
    account = sc.get("account") or {}
    relationship = sc.get("relationship") or {}
    return route_recommendation(
        esn.get("stage"),
        account.get("archetype"),
        relationship.get("state"),
        sc.get("routeSignals"),
    )


def recommend_movement_from_context(sales_context: dict[str, Any] | None) -> dict[str, str]:
    """Convenience wrapper reading the emitted SalesContext dict (P0 shape)."""
    sc = sales_context or {}
    esn = sc.get("esnProfile") or {}
    account = sc.get("account") or {}
    relationship = sc.get("relationship") or {}
    return recommend_opening_movement(
        esn.get("stage"),
        account.get("archetype"),
        relationship.get("state"),
    )


def recommend_route_from_context(sales_context: dict[str, Any] | None) -> dict[str, str]:
    """Convenience wrapper reading the emitted SalesContext dict (P0 shape)."""
    sc = sales_context or {}
    esn = sc.get("esnProfile") or {}
    account = sc.get("account") or {}
    relationship = sc.get("relationship") or {}
    return recommend_commercial_route(
        esn.get("stage"),
        account.get("archetype"),
        relationship.get("state"),
        sc.get("routeSignals"),
    )


def strategy_criteria_from_context(
    sales_context: dict[str, Any] | None,
    purchasing_panel: str | None = None,
    declared_criteria: Mapping[str, Any] | None = None,
    accumulated_criteria: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """#2312.21 — même wrapper que ses deux voisins ci-dessus, pour {@link
    strategy_selection_criteria}."""
    sc = sales_context or {}
    esn = sc.get("esnProfile") or {}
    account = sc.get("account") or {}
    relationship = sc.get("relationship") or {}
    return strategy_selection_criteria(
        esn.get("stage"),
        account.get("archetype"),
        relationship.get("state"),
        purchasing_panel,
        declared_criteria,
        accumulated_criteria,
    )


def commercial_route_brief(
    esn_stage: str | None,
    account_archetype: str | None,
    relationship_state: str | None,
) -> dict[str, Any]:
    """#3259 (BEL-SC-230) — la recommandation de route à la forme SORTIE exacte
    de la spec : recommended_route / reason / prerequisites / first_person_or_role
    / first_channel / secondary_channel / first_objective / fallback_route /
    stop_condition / evidence_needed.

    Reshape de {@link route_recommendation} — source unique de la route et de
    ses attributs, jamais un second calcul. `fallback_route` et
    `stop_condition` restent `None` hors des trois routes où le texte de
    méthode les nomme explicitement (voir `_ROUTE_FALLBACK_AND_STOP`)."""
    base = route_recommendation(esn_stage, account_archetype, relationship_state)
    extra = _ROUTE_FALLBACK_AND_STOP.get(base["route"], {})
    return {
        "recommended_route": base["route"],
        "reason": base["rationale"],
        "prerequisites": [base["passage_condition"]],
        "first_person_or_role": base["first_door"],
        "first_channel": base["first_channel"],
        "secondary_channel": base["secondary_channel"],
        "first_objective": base["info_to_obtain"],
        "fallback_route": extra.get("fallback_route"),
        "stop_condition": extra.get("stop_condition"),
        "evidence_needed": base["proof"],
    }


def commercial_route_brief_from_context(sales_context: dict[str, Any] | None) -> dict[str, Any]:
    """Convenience wrapper reading the emitted SalesContext dict (P0 shape) —
    même patron que ses voisins de ce module."""
    sc = sales_context or {}
    esn = sc.get("esnProfile") or {}
    account = sc.get("account") or {}
    relationship = sc.get("relationship") or {}
    return commercial_route_brief(
        esn.get("stage"),
        account.get("archetype"),
        relationship.get("state"),
    )


def movement_prompt_block(
    sales_context: dict[str, Any] | None,
    channel_performance: list[dict[str, Any]] | None = None,
    accumulated_criteria: Mapping[str, Any] | None = None,
) -> str:
    """Le bloc de prompt (plan) qui impose le mouvement d'ouverture.

    Extrait tel quel de ``phase4_plan`` : c'est le fragment de prompt par lequel
    le stade ESN et l'état de relation atteignent réellement le modèle. Le sortir
    du routeur permet aux goldens de la DoD (p31) d'asserter la DIFFÉRENCE sur la
    chaîne de PROD, pas sur une recopie du texte. ``""`` sans SalesContext →
    prompt inchangé (dossier antérieur au contrat)."""
    if not sales_context:
        return ""
    movement = recommend_movement_from_context(sales_context)
    # #2273.22-.29 — la route ENRICHIE à 8 attributs plutôt que 3 : même appel
    # (`route_recommendation_from_context` réutilise `recommend_commercial_route`,
    # pas un second calcul), le bloc de prompt en tire davantage.
    route = route_recommendation_from_context(sales_context)
    # #2312.21 (épopée #2963, décision Louis 28/09) — les critères NON
    # évaluables se NOMMENT au modèle, pour qu'il ne leur invente pas un poids
    # que le choix ci-dessus n'a jamais eu — jamais listés quand il n'y en a
    # aucun (SalesContext antérieur à ce champ, par exemple).
    criteria_all = strategy_criteria_from_context(sales_context, None, None, accumulated_criteria)
    not_evaluable = [c["label"] for c in criteria_all if not c["evaluable"]]
    # #3278.a — ce que l'espace a ACCUMULÉ (preuves, canaux déjà utilisés) atteint le plan ; absent = DIT.
    accumulated_line = ""
    if isinstance(accumulated_criteria, Mapping):
        parts = [
            f"{c['label']} : {c['value']}" for c in criteria_all if c["evaluable"] and c.get("source") == "accumulated"
        ]
        parts += [
            f"{c['label']} : {ACCUMULATED_ABSENCE_SENTENCES[c['key']]}"
            for c in criteria_all
            if c["key"] in ACCUMULATED_ABSENCE_SENTENCES and not c["evaluable"]
        ]
        accumulated_line = (
            "\nCe que l'espace a déjà accumulé sur ce compte (cite-le dans le plan ; ce qui est dit absent "
            "reste absent, n'invente ni canal ni réponse) : " + " ; ".join(parts) + ".\n"
        )
    criteria_line = (
        f"\nCritères NON évaluables pour ce compte (aucune règle source ne permet de les peser — "
        f"ne leur invente aucun poids) : {', '.join(not_evaluable)}.\n"
        if not_evaluable
        else ""
    )
    return (
        "\n\n===== MOUVEMENT D'OUVERTURE RECOMMANDÉ (déterministe — profil ESN × archétype × relation) =====\n"
        f"Mouvement : {movement['movement']} — {movement['rationale']}.\n"
        f"Séquence : {movement['sequence']}.\n"
        "Utilise CE mouvement pour l'`approachAngle` des sous-comptes et l'ordre d'attaque — "
        "PAS un réflexe générique (ni board/CEO en 1re approche froide pour une petite ESN).\n"
        f"{criteria_line}"
        f"{accumulated_line}"
        "\n===== ROUTE COMMERCIALE RECOMMANDÉE (déterministe — #2959) =====\n"
        f"Route : {route['route']} — {route['rationale']} ({route['label']}).\n"
        f"Première porte : {route['first_door']}.\n"
        f"Info à obtenir avant d'avancer : {route['info_to_obtain']}.\n"
        f"Preuve qui valide la route : {route['proof']}.\n"
        f"Contact suivant : {route['next_contact']}.\n"
        f"Condition de passage à l'étape suivante : {route['passage_condition']}.\n"
        f"Plan de repli si ça bloque : {route['fallback_plan']}.\n"
        f"Route déconseillée dans ce contexte : {route['discouraged_route']}."
        f"{_channel_prompt_section(route, channel_performance)}"
    )


def channel_prompt_block(
    sales_context: dict[str, Any] | None,
    channel_performance: list[dict[str, Any]] | None = None,
) -> str:
    """#3259 (BEL-SC-230) — bloc CANAL autonome, pour les prompts qui n'injectent
    pas tout {@link movement_prompt_block} (ex. `bellum_messages`, qui a son
    propre système de blocs additifs). Même contrat : `""` sans SalesContext →
    prompt inchangé."""
    if not sales_context:
        return ""
    route = route_recommendation_from_context(sales_context)
    return _channel_prompt_section(route, channel_performance)


# #3278.3 (#3259.7) — canaux dont le workspace MESURE la réponse (clé de
# l'activité → libellé des presets de méthode). Un preset qui n'y figure pas
# (introduction, échange direct, procédure formelle) n'est PAS mesurable : il
# ne cède jamais à un taux qui ne parle pas de lui.
_MEASURABLE_CHANNELS: dict[str, str] = {"call": "appel", "email": "email", "linkedin": "LinkedIn"}
# Écart minimal (en points de taux de réponse) pour qu'un canal mesuré fasse
# céder le preset : en dessous, l'écart se lit comme du bruit.
_MEASURED_MARGIN_POINTS = 10


def _measurable_key(preset_channel: str | None) -> str | None:
    text = (preset_channel or "").lower()
    for key, label in (("linkedin", "linkedin"), ("call", "appel"), ("email", "email")):
        if label in text:
            return key
    return None


def _sufficient_rows(performance: list[dict[str, Any]] | None) -> dict[str, dict[str, Any]]:
    return {
        row["channel"]: row
        for row in performance or []
        if row.get("channel") in _MEASURABLE_CHANNELS and row.get("sufficient") and row.get("replyRate") is not None
    }


def measured_channel_choice(
    preset_channel: str | None, channel_performance: list[dict[str, Any]] | None
) -> dict[str, Any] | None:
    """#3278.3 — le canal MESURÉ qui remplace le preset, ou ``None`` (le preset reste).

    Cède seulement si le preset ET le meilleur autre canal ont un échantillon
    suffisant (drapeau ``sufficient`` calculé côté API — aucun seuil ici) et
    que l'autre bat le preset d'au moins ``_MEASURED_MARGIN_POINTS`` points."""
    rows = _sufficient_rows(channel_performance)
    preset_key = _measurable_key(preset_channel)
    if preset_key is None or preset_key not in rows:
        return None
    best = max(
        (row for key, row in rows.items() if key != preset_key),
        key=lambda row: row["replyRate"],
        default=None,
    )
    if best is None or best["replyRate"] - rows[preset_key]["replyRate"] < _MEASURED_MARGIN_POINTS:
        return None
    return {
        "channel": _MEASURABLE_CHANNELS[best["channel"]],
        "reply_rate": best["replyRate"],
        "preset_reply_rate": rows[preset_key]["replyRate"],
    }


def _measured_lines(route: dict[str, str], performance: list[dict[str, Any]] | None) -> tuple[str, str | None]:
    """Les faits mesurés (une ligne par canal) et le canal de remplacement éventuel."""
    known = [row for row in performance or [] if row.get("channel") in _MEASURABLE_CHANNELS]
    if not known:
        return "", None
    parts = []
    for row in sorted(known, key=lambda r: str(r["channel"])):
        label = _MEASURABLE_CHANNELS[row["channel"]]
        if row.get("sufficient") and row.get("replyRate") is not None:
            parts.append(f"{label} {row.get('replied', 0)}/{row.get('sent', 0)} ({row['replyRate']} %)")
        else:
            parts.append(f"{label} non mesuré (échantillon insuffisant)")
    choice = measured_channel_choice(route.get("first_channel"), performance)
    text = "Résultats MESURÉS de ce workspace (réponse du contact sous 14 jours) : " + ", ".join(parts) + ".\n"
    if choice:
        text += (
            f"Le preset de méthode « {route['first_channel']} » cède devant le mesuré : "
            f"{choice['channel']} obtient {choice['reply_rate']} % contre {choice['preset_reply_rate']} %.\n"
        )
    return text, choice["channel"] if choice else None


def _channel_prompt_section(route: dict[str, str], channel_performance: list[dict[str, Any]] | None = None) -> str:
    """#3259 (BEL-SC-230) — section CANAL, additive à la suite de la route dans
    {@link movement_prompt_block}. Porte les RÈGLES de la spec (un canal se
    choisit selon la route, jamais parce qu'il est disponible techniquement ;
    les presets de méthode cèdent devant des résultats mesurés — #3278.3, voir
    {@link measured_channel_choice}) et le NO-GO explicite (« Laura génère
    immédiatement un email alors que la meilleure route est une introduction ou
    un partenaire »)."""
    measured_text, replacement = _measured_lines(route, channel_performance)
    first_channel = replacement or route["first_channel"]
    secondary_channel = route.get("secondary_channel")
    if replacement and secondary_channel and replacement.lower() in secondary_channel.lower():
        secondary_channel = None
    secondary = f" (canal secondaire coordonné : {secondary_channel})" if secondary_channel else ""
    return (
        "\n\n===== CANAL RECOMMANDÉ (déterministe — #3259, route commerciale) =====\n"
        f"Canal à privilégier : {first_channel}{secondary}.\n"
        f"{route['channel_rationale']}.\n"
        f"{measured_text}"
        "Ne choisis PAS un canal parce qu'il est disponible techniquement, et n'impose ni "
        "LinkedIn ni email par défaut : ce sont des presets de méthode, pas des lois — les "
        "résultats mesurés du workspace peuvent les remplacer. Au plus deux canaux coordonnés, "
        "jamais huit à la fois.\n"
        "NO-GO : si le canal recommandé est une introduction ou un échange direct partenaire, "
        "ne rédige PAS un email comme premier geste — nomme d'abord ce qu'il faut obtenir avant "
        "d'écrire."
    )
