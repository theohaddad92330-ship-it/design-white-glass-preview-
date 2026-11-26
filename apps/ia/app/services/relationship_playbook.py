"""Relation au compte → façon d'écrire (Annexe Méthodologie Sales ESN p6/p10/p12).

p6 est une phrase, pas une nuance : « Le même signal produit un message et une
action différents selon la relation existante. » Les ACTIONS branchaient déjà sur
la relation (``action_recommender``), les MESSAGES non. ``bellum_messages``
recevait le compte et les contacts, jamais l'état de relation : un client actif
et un parfait inconnu recevaient le même M1 d'ouverture à froid — règle d'or n°3
(« ZÉRO mention de l'ESN ») comprise, adressée à quelqu'un qui facture déjà cette
ESN. p12 le dit de son côté en listant les entrées de personnalisation de
l'email : « persona, entité, signal, offre, RELATION, style user ».

Ce module est le DERNIER maillon d'un trajet qui existait déjà partout ailleurs :

    accounts.commercial_status (Postgres, kanban)
      → relationStatusForRun()            apps/api/src/modules/analysis/commercial-status.ts
      → commercial_status (requête IA)    apps/ia/app/routers/graph_analyze.py
      → classify_relationship_state()     apps/ia/app/services/sales_context.py
      → salesContext.relationship.state   (research, persisté dans raw_analysis)
      → CE MODULE
      → bellum_messages / bellum_outreach (le texte que Claude reçoit)

Déterministe, sans LLM ni I/O — même famille que ``opening_movement`` et
``team_routines``.

Deux invariants tiennent le module :

* **Le froid ne bouge pas.** ``froid`` rend ``""`` : le prompt messages reste
  byte-identique à ce qu'il était, parce qu'il décrit DÉJÀ une ouverture à
  froid. Aucun compte ne paie la personnalisation d'un autre.
* **Non mesuré n'est pas froid** (#2371.4). Un état absent (pas de
  SalesContext) ou hors contrat ne retombe plus EN SILENCE sur le froid : il
  rend un bloc qui le NOMME non mesuré, et interdit de supposer l'un ou
  l'autre. Sans lui, un état ajouté au contrat sans son playbook (le 10e stade
  « partenaire actif » de #2371.4) aurait reçu une ouverture à froid.
* **Le bloc dit comment écrire, jamais quoi écrire.** Il ne fournit aucun fait
  sur le compte : un fait posé ici serait vrai pour tous les comptes, donc
  inventé pour presque tous.
"""

from __future__ import annotations

from typing import Any

from app.knowledge.message_matrix import MESSAGE_MATRIX

#: p6 « États relationnels du compte », colonne « Action Bellum », rendue côté
#: MESSAGE. Une entrée par état du contrat SAUF ``froid`` — le froid est le
#: comportement par défaut du prompt, pas une variante.
#:
#: #2371 — les consignes ne vivent plus ici : elles sont l'axe « stade » de la
#: matrice du message (``packages/contracts/src/schemas/message-matrix.ts``,
#: miroir ``app.knowledge.message_matrix``). Ce dict en est une VUE, à la forme
#: que lisent les consommateurs historiques (``message_brief``, les tests).
#:
#: ``lifts_rule_3`` : la règle d'or n°3 des prompts messages interdit de nommer
#: l'ESN dans un M1 d'ouverture. Elle est écrite pour un inconnu. Sur un compte
#: où la relation est ÉTABLIE (mission en cours, historique, référent, contrat
#: rang 2), la taire produit un message absurde — on la lève, explicitement, et
#: seulement là.
MESSAGE_PLAYBOOK: dict[str, dict[str, Any]] = {
    state: {
        "label": entry["label"],
        "must": entry["must"],
        "opening": entry["opening"],
        "forbidden": entry["forbidden"],
        "lifts_rule_3": entry["liftsRule3"],
    }
    for state, entry in MESSAGE_MATRIX["stages"].items()
    if entry is not None
}

#: ─────────────────────────── la cadence de relance ──────────────────────────
#:
#: **Copie embarquée d'une table qui vit ailleurs.** La source unique du rythme
#: est ``PATTERNS`` dans ``apps/api/src/modules/contacts/cadence-templates.ts`` :
#: c'est elle qui calcule le ``due_date`` de chaque touche, qui écrit
#: ``action_plan_items.cadence_step`` et que le cron « Rappels de relance » lit.
#: Ici on ne DÉCIDE aucun rythme — on le RECOPIE, pour que le texte que Claude
#: rédige annonce la même date que celle sous laquelle la carte l'affichera.
#:
#: Le défaut que ça corrige : le prompt écrivait « J+3 relance » en dur, pour les
#: neuf états de relation. Sur un compte dormant, la carte affichait ce texte sous
#: une échéance calculée à J+7 ; sur un compte référé, elle demandait une preuve
#: sociale et un close-loop que le patron ne planifie pas.
#:
#: ⚠️ Une valeur recopiée à la main dans deux langages finit toujours par
#: diverger. Ce qui l'empêche est ``tests/test_cadence_parity.py``, qui lit le
#: fichier TS et compare — pas la bonne volonté du prochain qui touchera l'un des
#: deux.
# #4418.1 — série par défaut J+3/J+6/J+9, la relation ne fait que la décaler.
CADENCE_PATTERNS: dict[str, dict[str, int]] = {
    "standard": {"initial": 1, "relance": 3, "preuve_sociale": 6, "close_loop": 9},
    "linkedin_3_touches": {"initial": 1, "relance": 4, "preuve_sociale": 7, "close_loop": 10},
    "referral_short": {"initial": 1, "relance": 4, "preuve_sociale": 7, "close_loop": 10},
    "reactivation": {"initial": 1, "relance": 7, "preuve_sociale": 10, "close_loop": 13},
    "ancien_client_preuve": {"initial": 1, "relance": 4, "preuve_sociale": 7, "close_loop": 10},
    "partenaire_rang2": {"initial": 1, "relance": 6, "preuve_sociale": 9, "close_loop": 12},
    "client_expansion": {"initial": 1, "relance": 5, "preuve_sociale": 8, "close_loop": 11},
    "besoin_ouvert": {"initial": 1, "relance": 2, "preuve_sociale": 5, "close_loop": 8},
    "partenaire_actif": {"initial": 1, "relance": 5, "preuve_sociale": 8, "close_loop": 11},
}

#: Miroir de ``STATE_TO_TEMPLATE`` (même fichier TS). Les neuf états du contrat,
#: ``froid`` compris — contrairement à ``MESSAGE_PLAYBOOK``, où le froid est le
#: défaut silencieux : une cadence, elle, doit toujours être nommée, puisque le
#: prompt demande de toute façon les touches de relance.
STATE_TO_CADENCE_TEMPLATE: dict[str, str] = {
    "froid": "standard",
    "connu": "standard",
    "linkedin": "linkedin_3_touches",
    "dormant": "reactivation",
    "refere": "referral_short",
    "ancien_client": "ancien_client_preuve",
    "rang2": "partenaire_rang2",
    "client_actif": "client_expansion",
    "besoin_ouvert": "besoin_ouvert",
    "partenaire_actif": "partenaire_actif",
}

#: Ce que CHAQUE touche doit apporter. Le texte est celui d'avant : seule
#: l'échéance qui le précède est désormais dérivée au lieu d'être écrite en dur.
_CADENCE_TOUCH_BRIEF: dict[str, str] = {
    "relance": (
        "relance : COURTE, avec une preuve ou une ressource NOUVELLE (pas « je me "
        "permets de revenir vers vous » — c'est banni). Si tu n'as rien de neuf à dire, "
        "ne relance pas."
    ),
    "preuve_sociale": (
        "preuve sociale : un cas similaire, un profil disponible, un benchmark ou un "
        "insight précis tiré du contexte compte. Autre angle que la relance."
    ),
    "close_loop": (
        "close-loop : respectueux, laisse la porte ouverte pour plus tard. C'est la DERNIÈRE touche de la séquence."
    ),
}

#: #2645.2 — ce que devient la DERNIÈRE touche quand le revenu est ponctuel.
#: Sans cette phrase, le modèle rédigerait un close-loop de J+9 sous une
#: échéance à J+34 : le déplacement de date serait invisible dans le texte, donc
#: incompréhensible pour le commercial qui le relit un mois plus tard.
_POST_DELIVERY_BRIEF = (
    "reprise APRÈS livraison : la mission précédente est terminée, un nouveau besoin a pu "
    "naître depuis. Repars de ce qui a été livré, pas du premier email. C'est la DERNIÈRE "
    "touche de la séquence."
)


def _touch_brief(key: str, revenue_model: str | None, is_last: bool) -> str:
    """Le brief d'une touche — celui du catalogue, sauf la dernière d'un revenu
    ponctuel, qui n'est plus un close-loop mais une reprise après livraison."""
    if is_last and (revenue_model or "").strip() == "ponctuel":
        return _POST_DELIVERY_BRIEF
    return _CADENCE_TOUCH_BRIEF[key]


#: La clé JSON par laquelle chaque touche revient du modèle. Elle est LUE par
#: ``applyMessages`` (``contacts.service.ts``) et rattachée à son étape par
#: ``cadence.service.ts`` — la renommer d'un côté seul perdrait le contenu.
_CADENCE_JSON_KEY: dict[str, str] = {
    "relance": "relance",
    "preuve_sociale": "preuveSociale",
    "close_loop": "closeLoop",
}

_CADENCE_JSON_BRIEF: dict[str, str] = {
    "relance": "relance COURTE avec une preuve/ressource NOUVELLE (jamais une répétition de l'email initial). 3-5 lignes. Vide si tu n'as rien de neuf.",
    "preuve_sociale": "cas similaire, profil disponible, benchmark ou insight précis. Autre angle que la relance. 4-6 lignes.",
    "close_loop": "close-loop respectueux qui laisse la porte ouverte pour plus tard. 3-4 lignes. DERNIÈRE touche.",
}


#: #2645.2 — miroir des trois constantes de ``applyRevenueModel``
#: (``cadence-templates.ts``). Même discipline que ``CADENCE_PATTERNS`` : on ne
#: DÉCIDE rien ici, on RECOPIE, et ``test_cadence_parity.py`` lit les deux
#: fichiers pour empêcher la dérive. Un revenu ponctuel resserre les relances
#: (la fenêtre d'achat est courte) et repousse la DERNIÈRE touche après la
#: livraison ; un revenu récurrent étire le suivi.
REVENUE_TIGHTEN_FACTOR = 0.6
REVENUE_STRETCH_FACTOR = 1.5
REVENUE_POST_DELIVERY_DAYS = 28

#: Les deux seuls modèles qui changent quelque chose. ``mixte`` et ``inconnu``
#: ne modulent RIEN — on ne resserre pas la relance de qui n'a rien déclaré.
_REVENUE_FACTORS: dict[str, float] = {
    "ponctuel": REVENUE_TIGHTEN_FACTOR,
    "recurrent": REVENUE_STRETCH_FACTOR,
}


def _apply_revenue_model(
    touches: list[tuple[str, int]], revenue_model: str | None, initial_offset: int
) -> list[tuple[str, int]]:
    """Miroir exact de ``applyRevenueModel`` (TS). Trois invariants : l'ouverture
    ne bouge pas (elle n'est pas dans ``touches``, mais elle donne le plancher),
    les échéances restent strictement croissantes, et un modèle non mesuré ne
    change rien."""
    import math

    factor = _REVENUE_FACTORS.get((revenue_model or "").strip())
    if factor is None:
        return touches
    last_index = len(touches) - 1
    previous = initial_offset
    out: list[tuple[str, int]] = []
    for index, (key, days) in enumerate(touches):
        value = max(math.ceil(days * factor), previous + 1)
        # La dernière touche d'un revenu ponctuel n'est plus un close-loop serré :
        # c'est la reprise APRÈS livraison, quand un nouveau besoin peut naître.
        if factor == REVENUE_TIGHTEN_FACTOR and index == last_index:
            value += REVENUE_POST_DELIVERY_DAYS
        previous = value
        out.append((key, value))
    return out


def cadence_touches_for_state(
    relationship_state: str | None, revenue_model: str | None = None
) -> list[tuple[str, int]]:
    """Les touches de RELANCE (clé, J+n) d'un état, ordonnées par échéance.

    La touche ``initial`` est exclue : c'est le message d'ouverture, celui qui
    déclenche la cadence, pas une relance planifiée — exactement le filtre
    ``!step.is_initial`` de ``CadenceService.scheduleForContact``.

    Un état absent, vide ou hors contrat retombe sur ``standard``, comme
    ``resolveRelationshipEvidence`` retombe sur ``froid`` côté TS. Ce n'est pas un
    rythme deviné : c'est le même défaut, des deux côtés.

    #2645.2 — ``revenue_model`` (``salesContext.esnProfile.businessModel``) module
    ensuite ces échéances. Absent ⇒ rendu byte-identique à avant ce lot.
    """
    template = STATE_TO_CADENCE_TEMPLATE.get((relationship_state or "").strip(), "standard")
    offsets = CADENCE_PATTERNS[template]
    touches = sorted(((key, days) for key, days in offsets.items() if key != "initial"), key=lambda kv: kv[1])
    return _apply_revenue_model(touches, revenue_model, offsets.get("initial", 0))


def cadence_directive_block(relationship_state: str | None, revenue_model: str | None = None) -> str:
    """Le bloc « SÉQUENCE EMAIL » du prompt messages, daté par le patron réel."""
    touches = cadence_touches_for_state(relationship_state, revenue_model)
    lines = "\n".join(
        f"- J+{days} {_touch_brief(key, revenue_model, index == len(touches) - 1)}"
        for index, (key, days) in enumerate(touches)
    )
    return (
        "SÉQUENCE EMAIL — UNE PREUVE NEUVE PAR TOUCHE (règle p12) :\n"
        "Une relance qui répète le premier email n'est pas une séquence, c'est du\n"
        "harcèlement. Chaque touche apporte quelque chose que la précédente n'avait pas.\n"
        "Les échéances ci-dessous ne sont pas décoratives : ce sont celles sous lesquelles\n"
        "Bellum affichera CE texte au commercial. Écris chaque touche pour SA date.\n"
        "- J0 (email initial ci-dessus) : observation / signal / relation + une question.\n"
        f"{lines}"
    )


def cadence_json_fields(relationship_state: str | None, revenue_model: str | None = None) -> str:
    """Les champs ``cadence`` demandés en sortie JSON — ceux du patron, et eux
    seuls. Demander une preuve sociale à un compte référé produirait un texte que
    la carte n'a aucune échéance pour afficher."""
    touches = cadence_touches_for_state(relationship_state, revenue_model)
    return ",\n".join(
        f'        "{_CADENCE_JSON_KEY[key]}": "J+{days} — {_CADENCE_JSON_BRIEF[key]}"' for key, days in touches
    )


_RULE_3_LIFTED = (
    "Règle d'or n°3 LEVÉE pour cet état : nommer l'ESN et la mission/relation existante est "
    "LÉGITIME ici — le contact les connaît déjà. Cela n'autorise PAS un pitch catalogue."
)
_RULE_3_KEPT = (
    "Règle d'or n°3 MAINTENUE : ce contact reste une ouverture — zéro mention de l'ESN, "
    "zéro présentation de l'offre, sans pitch."
)


def relationship_state_from_context(sales_context: Any) -> str:
    """``salesContext.relationship.state`` ou ``""``.

    Tolère tout ce que la prod peut réellement présenter : ``None`` (pas de
    SalesContext), un ``raw_analysis`` d'un dossier antérieur au contrat, ou une
    valeur qui n'est pas un dict."""
    if not isinstance(sales_context, dict):
        return ""
    relationship = sales_context.get("relationship")
    if not isinstance(relationship, dict):
        return ""
    return str(relationship.get("state") or "").strip()


def revenue_model_from_context(sales_context: Any) -> str:
    """#2645.2 — ``salesContext.esnProfile.businessModel.revenueModel`` ou ``""``.

    Même tolérance, et même chemin de lecture, que ``resolveRevenueModel``
    (``cadence-templates.ts``) : un dossier antérieur au contrat, un
    ``raw_analysis`` tronqué ou une valeur qui n'est pas un dict ne conclut rien.
    """
    if not isinstance(sales_context, dict):
        return ""
    esn_profile = sales_context.get("esnProfile")
    if not isinstance(esn_profile, dict):
        return ""
    business_model = esn_profile.get("businessModel")
    if not isinstance(business_model, dict):
        return ""
    return str(business_model.get("revenueModel") or "").strip()


#: #2371.4 — le bloc d'un état NON MESURÉ (absent ou hors contrat). Prudent
#: dans les deux sens : ni l'ouverture à froid (« nous ne nous connaissons
#: pas »), ni une relation supposée. La règle d'or n°3 reste en vigueur — c'est
#: la seule lecture qui ne peut rien affirmer de faux au contact.
_UNMEASURED_BLOCK = (
    "\n\nRELATION AU COMPTE — NON MESURÉE :\n" + MESSAGE_MATRIX["unmeasuredStage"]["directive"] + "\n" + _RULE_3_KEPT
)


def objective_premise_holds(relationship_state: str | None, objective: str | None) -> bool | None:
    """#2371 — stade × objectif : la prémisse ÉCRITE de l'objectif (« premier
    contact sur ce compte », « une relation a existé »…) tient-elle pour ce stade ?

    ``None`` quand la relation n'est pas mesurée (absente ou hors contrat) : on
    ne peut alors rien affirmer, ni dans un sens ni dans l'autre. Un objectif
    sans prémisse de relation (``null`` dans la matrice) vaut pour tout stade."""
    state = (relationship_state or "").strip()
    if state not in MESSAGE_MATRIX["stages"]:
        return None
    premises = MESSAGE_MATRIX["objectivePremises"]
    if objective not in premises:
        return None
    stages = premises[objective]
    return True if stages is None else state in stages


#: #219.8 (LAU-FINAL-219, #3231) — la relation PERSONNE↔ENTREPRISE (voir
#: `person_company_relation.py`) pilote entre autres le MESSAGE : parler à un
#: ex-salarié, à une personne seulement PRÉSENTÉE (jamais confirmée) comme
#: consultante, ou à un prestataire ACTUELLEMENT en mission n'appelle pas la
#: même prudence qu'un salarié actuel déclaré. Ces quatre valeurs sont les
#: seules où le corps de l'issue #3213 (« ne pas transformer un parcours CV en
#: mission actuelle / fournisseur actuel ») a une prise directe sur le TEXTE
#: du message — les neuf autres valeurs de `PersonCompanyRelation` ne
#: changent ni les faits ni l'ouverture, seulement le rôle déjà lu ailleurs
#: (decision_role, PROJECT_CONTACT_ROLES).
_PERSON_RELATION_CAUTION: dict[str, str] = {
    "employee_former": (
        "Cette personne n'est plus salariée de cette entreprise (relation déclarée : ancienne). "
        "N'écris jamais comme si elle y travaillait encore ou pouvait y décider de quoi que ce soit "
        "aujourd'hui — parle de son passage, jamais de son poste actuel."
    ),
    "contractor_historical": (
        "Cette personne a été consultante/prestataire chez cette entreprise, PAS salariée ni en "
        "mission actuellement. N'écris jamais « votre consultant » ou « votre prestataire actuel » — "
        "c'est un passage terminé, pas une relation en cours."
    ),
    "consultant_presented": (
        "Cette personne a seulement été PRÉSENTÉE comme consultante sur ce compte (aucune preuve "
        "déclarée d'une mission réelle) — ne l'affirme jamais comme un fait. Un parcours cité sur un "
        "CV ou une slide n'est ni une mission actuelle, ni une relation accessible."
    ),
    # #2947 (#2204.34, persona « Partenaire ») — un prestataire EN MISSION
    # maintenant n'est ni un salarié, ni un besoin qui attend d'être découvert :
    # le terrain est déjà occupé (même constat que `_COLLISION` côté plan,
    # `person_relation_proof.py`), donc le message ne lui écrit jamais comme à
    # un prospect froid.
    "contractor_current": (
        "Cette personne est actuellement prestataire/consultante EN MISSION chez cette entreprise, pas "
        "salariée. N'écris jamais comme si elle découvrait un besoin à combler : le terrain est déjà "
        "occupé par un fournisseur en place. Parle-lui en partenaire potentiel — mise en relation, "
        "complémentarité — jamais comme à un prospect qu'on convertit."
    ),
}


def declared_relation_caution(person_relation: str | None) -> str | None:
    """#2947 (#2204.35, lot R25) — la MÊME table que ``message_directive_block``
    ci-dessous (``_PERSON_RELATION_CAUTION``), rendue publique pour un second
    appelant : les messages BATCH (``bellum_messages``, plusieurs contacts à la
    fois) n'ont pas un seul ``person_relation`` global comme le composer
    mono-contact — ils en lisent un PAR contact. Aucune seconde table : le
    persona « Consultant » (#2204, PERSONAS) n'a pas besoin d'une taxonomie
    parallèle, cette table suffit déjà. ``None`` ou sans entrée ⇒ ``None``."""
    return _PERSON_RELATION_CAUTION.get((person_relation or "").strip())


def message_directive_block(relationship_state: str | None, person_relation: str | None = None) -> str:
    """Le bloc de prompt qui adapte les MESSAGES à la relation (p6).

    ``""`` pour ``froid`` : le prompt messages est alors byte-identique à celui
    d'avant ce module. #2371.4 — un état absent ou hors contrat n'est plus
    confondu avec le froid : il rend le bloc NON MESURÉE.

    ``person_relation`` (#219.8, #3231) : la relation PERSONNE↔ENTREPRISE
    DÉCLARÉE (une des treize valeurs de `PersonCompanyRelation`, jamais devinée
    — voir `person_company_relation.classify_person_company_relation`).
    ``None`` ou une valeur sans prise sur le texte (dont `unknown_relationship`,
    le défaut sans preuve) ⇒ aucune ligne ajoutée, comportement byte-identique
    à avant ce paramètre."""
    state = (relationship_state or "").strip()
    caution = _PERSON_RELATION_CAUTION.get((person_relation or "").strip())
    caution_block = f"\nRELATION PERSONNE↔ENTREPRISE — À RESPECTER : {caution}\n" if caution else ""
    if state == "froid":
        return f"\n\n{caution_block.strip()}" if caution_block else ""
    entry = MESSAGE_PLAYBOOK.get(state)
    if not entry:
        return _UNMEASURED_BLOCK + caution_block

    return (
        "\n\nRELATION AU COMPTE — ADAPTE LES MESSAGES (déterministe : kanban commercial → état de relation) :\n"
        f"État : {entry['label']}.\n"
        f"Ce que les messages doivent faire : {entry['must']}.\n"
        f"Ouverture : {entry['opening']}.\n"
        f"Interdit ici : {entry['forbidden']}.\n"
        + (_RULE_3_LIFTED if entry["lifts_rule_3"] else _RULE_3_KEPT)
        + "\nCe bloc dit COMMENT écrire. Les FAITS viennent du contexte compte ci-dessus et de nulle part "
        "ailleurs : si l'élément d'historique attendu n'y est pas, écris « élément à vérifier » plutôt que "
        "de l'inventer."
        + caution_block
    )
