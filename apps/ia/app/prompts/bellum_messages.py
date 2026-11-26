"""BELLUM-MESSAGES — messages prêts à envoyer par contact prioritaire.

Encode ``agent_docs/kb/messages-linkedin-esn.md`` + ``pitch-telephonique.md`` :
3 personas (levier par niveau hiérarchique), les règles d'or, phrases bannies.
Produit, pour chaque contact prioritaire, le 1er temps (M1) prêt à envoyer sur
les 3 canaux : LinkedIn, email, ouverture téléphonique. UN seul appel Claude
(borné aux meilleurs contacts) — coût maîtrisé pour la V1.

Ce module porte ``GOLDEN_RULES``, **la** liste de règles d'or : ``bellum_outreach``
la REND pour son cas mono-contact au lieu d'en tenir une seconde. La cadence
de relance, elle, ne se décide pas ici — elle est recopiée de la source unique
(``cadence-templates.ts``) par ``relationship_playbook``.
"""

from __future__ import annotations

from app.services.domain_focus import offers_or_default

from typing import Any, NamedTuple

from app.knowledge import objection_block
from app.knowledge.buying_committee import classify_committee_role, committee_message_angle
from app.knowledge.persona import PERSONA_UNKNOWN, contact_persona, persona_lever_block
from app.prompts.forbidden_phrasings import (
    DIGITAL_TRANSFORMATION,
    GENERIC_CREDIBILITY_APPEAL,
    GENERIC_EXPERTISE_CLAIM,
    GENERIC_METHODOLOGY_CLAIM,
    MESSAGE_FORBIDDEN_BEHAVIOURS,
    MESSAGE_FORBIDDEN_PHRASINGS,
    quoted_fr,
)
from app.services.company_archetype_playbook import ArchetypeCommercialHint
from app.services.dossier_read import access_path_block
from app.services.message_brief import MESSAGE_OBJECTIVES, objective_asks_nothing, objective_cta_rule
from app.services.person_company_relation import classify_person_company_relation
from app.services.recommendation_specificity import MIN_SPECIFIC_ELEMENTS, SPECIFICITY_LABELS
from app.services.relationship_playbook import (
    cadence_directive_block,
    cadence_json_fields,
    declared_relation_caution,
    message_directive_block,
    objective_premise_holds,
)

# Phrases bannies (rejet) — KB messages-linkedin-esn, PLUS les deux interdits
# partagés / spécifiques messages (#1926.21, .25) : « transformation digitale »
# était bannie côté dossier (bellum_activity, bellum_icebreaker,
# bellum_linkedin_posts) mais pas ici ; « donnée historique inquiétante »
# est nouvelle — un chiffre de baisse cité comme une alerte est une donnée
# PRIVÉE présentée comme un signal marché.
# ``bellum_outreach`` REND cette même chaîne via ``golden_rules_block``
# ci-dessous : les deux prompts héritent donc des deux nouveaux interdits par
# le même canal, sans dupliquer la liste.
# #3382 — « je me permets de », « nos expertises reconnues » et « notre
# méthodologie éprouvée » viennent maintenant de ``forbidden_phrasings``
# (``GENERIC_CREDIBILITY_*``) : ce fichier et ``bellum_strategy.py`` en
# tenaient chacun leur propre copie verbatim, jamais reliée — le risque de
# divergence que GA-26 interdit. Seule « juste un petit follow-up » reste
# LOCALE : aucun autre prompt ne la bannit encore.
_LOCAL_BANNED_PHRASES: tuple[str, ...] = ("juste un petit follow-up",)
# Les paniers MESSAGE sont rendus ENTIERS : un interdit ajouté à
# ``forbidden_phrasings`` atteint ce prompt et ``bellum_outreach`` sans que ce
# fichier en tienne une seconde liste. Les formulations vont entre guillemets
# (règle ``no_banned_phrases``, contrôlée par sous-chaîne), les comportements
# (#1926.22-.24) par leur propre règle, sans vérificateur.
_BANNED = (
    f"{quoted_fr((GENERIC_CREDIBILITY_APPEAL, *_LOCAL_BANNED_PHRASES, GENERIC_EXPERTISE_CLAIM, GENERIC_METHODOLOGY_CLAIM, DIGITAL_TRANSFORMATION, *MESSAGE_FORBIDDEN_PHRASINGS))} · jargon ESN générique"
)
_BEHAVIOURS = ", ".join(MESSAGE_FORBIDDEN_BEHAVIOURS)


# ───────────────────────────── les règles d'or ────────────────────────────────


class GoldenRule(NamedTuple):
    """Une règle de rédaction, avec l'identifiant STABLE du contrôle qui la vérifie.

    ``checker_id`` pointe vers ``OUTREACH_WRITING_RULES``
    (``packages/contracts/src/schemas/outreach-scenarios.ts``), le registre que
    lit le contrôle avant envoi. ``None`` = le contrôle ne vérifie pas cette
    règle-là, et c'est écrit plutôt que deviné.

    ``batch_only`` : la règle ne vaut que pour le prompt MULTI-contacts. Une
    seule l'est — celle qui parle de la clé ``contactName``, un champ que la
    sortie mono-contact de ``bellum_outreach`` n'a pas.
    """

    id: str
    text: str
    checker_id: str | None
    batch_only: bool = False


#: **La** liste de règles d'or. Il y en avait trois : huit règles dans
#: ``bellum_outreach``, dix ici — les huit premières VERBATIM des mêmes — et une
#: troisième, à identifiants, dans le registre TS que lit le contrôle avant
#: envoi. Trois listes divergent au premier ajout, et c'est le contrôle qui perd :
#: il refuse alors un message sur une règle que le prompt n'a jamais dite.
#:
#: Il n'y en a plus qu'une. ``bellum_outreach`` la rend, sans la réécrire ;
#: le lien avec le registre TS est tenu par ``cadence-parity.test.ts``.
GOLDEN_RULES: tuple[GoldenRule, ...] = (
    GoldenRule(
        id="channel_format",
        text="Respecte le format du canal ci-dessus.",
        # Le format du canal EST la règle de longueur du prompt (250-550
        # caractères en LinkedIn, 70-130 mots en e-mail) — les deux passent sous
        # les 200 mots que compte le contrôle.
        checker_id="under_200_words",
    ),
    GoldenRule(
        id="no_hope_youre_well",
        text=(
            "Ne commence PAS par « J'espère que vous allez bien » sauf historique réel avec cette "
            "personne : sur un premier contact, cette formule signale l'envoi de masse."
        ),
        checker_id=None,
    ),
    GoldenRule(
        id="no_company_in_first",
        text="Message d'ouverture = ZÉRO mention de {esn_name} ni de l'offre dans les deux premières phrases.",
        checker_id="no_company_in_first",
    ),
    GoldenRule(
        id="easy_question",
        text="Une seule question, facile à répondre.",
        checker_id="easy_question",
    ),
    GoldenRule(
        id="real_verified_element",
        # #1925 — la règle POSITIVE de spécificité vit ICI, pour les deux prompts
        # messages : « UN élément réel » y contredisait « au moins deux ».
        text=(
            f"Personnalise avec au moins {MIN_SPECIFIC_ELEMENTS} éléments RÉELS et vérifiés, spécifiques à CE "
            f"compte et CE contact, parmi : {SPECIFICITY_LABELS} ; jamais inventés — une référence client, un "
            "consultant ou une date absents du contexte ne s'inventent pas. Un message qui pourrait partir vers "
            "n'importe quel compte est un échec, même bien écrit. Si un élément manque → « élément à vérifier »."
        ),
        checker_id="variables_filled",
    ),
    GoldenRule(
        id="contact_specific_fact",
        text="Référence un fait spécifique à CE contact et CE compte.",
        # #2123.74 — vérifié avant envoi : un élément réel du dossier est cité.
        checker_id="names_real_context",
    ),
    GoldenRule(
        id="no_banned_phrases",
        text="JAMAIS : {banned}.",
        checker_id="no_esn_jargon",
    ),
    GoldenRule(
        id="persona_lever",
        text="Adapte le levier au persona et le format au canal.",
        checker_id="right_persona",
    ),
    GoldenRule(
        id="exact_contact_name",
        text=(
            "Recopie « contactName » caractère pour caractère depuis la liste fournie, accents et "
            "casse compris. C'est la clé qui relie le message à la fiche du contact : un accent perdu "
            "et le message n'est rattaché à personne."
        ),
        checker_id=None,
        batch_only=True,
    ),
    GoldenRule(
        id="no_fake_disclaimer",
        text=(
            "N'ajoute AUCUNE clause de style « aucune démarche commerciale derrière ce message » : "
            "elle est fausse — il y en a une — et l'écrire attire l'attention sur ce qu'elle prétend "
            "nier. Pas de superlatif, pas de fausse proximité, pas de promesse non prouvée."
        ),
        checker_id=None,
    ),
    GoldenRule(
        id="no_forbidden_behaviours",
        # #1926.22-.24 — des comportements : aucun contrôle de sous-chaîne ne les
        # voit, d'où l'absence de vérificateur. Ajoutée EN DERNIER : les numéros
        # des règles existantes sont cités ailleurs (« règle d'or n°3 »).
        text="Aucun de ces comportements : {behaviours}.",
        checker_id=None,
    ),
    GoldenRule(
        id="asset_after_interest",
        # #2372.6 (LAU-FINAL-087, « ASSET UTILE ») — ajoutée EN DERNIER, même
        # raison que la précédente. Le contrôle avant envoi la vérifie.
        text=(
            "Un document utile (analyse, retour d'expérience, checklist, benchmark, synthèse d'un projet "
            "comparable) s'ANNONCE et se PROPOSE (« voulez-vous que je vous l'envoie ? ») ; il n'est envoyé "
            "qu'après un intérêt confirmé. Aucun message de séquence ne le joint (« ci-joint », « en pièce "
            "jointe ») et aucune plaquette institutionnelle n'est jointe d'office."
        ),
        checker_id="asset_after_interest",
    ),
)

#: Où le prompt DIT chacune des huit règles du registre TS. Deux d'entre elles ne
#: sont pas des règles d'or numérotées mais des BLOCS : la cohérence M1-M2-M3 est
#: portée par la séquence LinkedIn, le respect des délais par le bloc de cadence.
#: Le contrôle avant envoi ne doit jamais refuser un message sur une règle que le
#: prompt n'a pas énoncée — c'est cette table qui le prouve, et
#: ``cadence-parity.test.ts`` qui la compare au registre.
CHECKER_RULE_SOURCES: dict[str, str] = {
    "variables_filled": "règle d'or `real_verified_element`",
    "under_200_words": "règle d'or `channel_format` (les bornes du canal)",
    "easy_question": "règle d'or `easy_question`",
    "no_esn_jargon": "règle d'or `no_banned_phrases`",
    "no_company_in_first": "règle d'or `no_company_in_first`",
    "sequence_coherence": "bloc « SÉQUENCE LINKEDIN — TROIS TEMPS »",
    "timing_respected": "bloc « SÉQUENCE EMAIL » (échéances dérivées du patron de cadence)",
    "right_persona": "règle d'or `persona_lever`",
    # #2123.74/.76/.78/.79 — les quatre interdits de ton du premier message,
    # déjà DITS par le prompt ; le contrôle avant envoi les vérifie désormais.
    "names_real_context": "règle d'or `contact_specific_fact`",
    "no_full_offer_pitch": "règle d'or `no_forbidden_behaviours` (« liste de services »)",
    "no_false_urgency": "règle d'or `no_forbidden_behaviours` (« fausse urgence ») + « N'invente jamais … une urgence »",
    "no_worrying_history": "règle d'or `no_banned_phrases` (« donnée historique inquiétante »)",
    # #2371.7 — même source que `right_persona` : le `turns_off` du décideur
    # (`app/knowledge/persona.py`) dit déjà « le détail d'exécution, et toute
    # forme de brochure » ; ce point-ci le rend mécaniquement vérifiable.
    "no_tech_catalogue_for_decision_maker": "règle d'or `persona_lever` (« turns_off » du décideur : détail d'exécution, brochure)",
    # #2372.6 — le document utile s'annonce, il ne se joint pas.
    "asset_after_interest": "règle d'or `asset_after_interest`",
}


def golden_rules_block(esn_name: str, *, batch: bool) -> str:
    """Les règles d'or, numérotées, prêtes à coller dans un prompt système.

    ``batch`` : le prompt écrit-il pour PLUSIEURS contacts à la fois ? Seul
    celui-là a une clé ``contactName`` à recopier.
    """
    rules = [rule for rule in GOLDEN_RULES if batch or not rule.batch_only]
    lines = "\n".join(
        f"{index}. {rule.text.replace('{esn_name}', esn_name).replace('{banned}', _BANNED).replace('{behaviours}', _BEHAVIOURS)}"
        for index, rule in enumerate(rules, 1)
    )
    return f"{len(rules)} RÈGLES D'OR (non négociables) :\n{lines}"


def build_system_prompt(profile: dict[str, Any]) -> str:
    esn_name = profile.get("esn_name") or profile.get("companyName") or "votre ESN"
    offers = offers_or_default(profile, it_default=["conseil IT"], keys=("core_offers", "offers"))
    offers_str = ", ".join(offers) if isinstance(offers, list) else str(offers)

    return f"""Tu es directeur commercial ESN expert en prospection, pour {esn_name} ({offers_str}). Ton but : CRÉER DU LIEN, pas envoyer un pitch. Tu écris des messages prêts à envoyer, jamais des templates avec des [crochets] à remplir.

{persona_lever_block()}

CE QUI FAIT RÉPONDRE : un SIGNAL CRÉDIBLE + une QUESTION FACILE + une ABSENCE DE SURVENTE — sauf quand le CADRAGE DU MESSAGE choisit l'approche directe (#4060) : aucun signal n'est alors requis ni ajouté.

{objection_block()}

CANAL — trois formats distincts, jamais le même texte recopié :
- LinkedIn : 250 à 550 caractères. « Bonjour Prénom ». L'ESN n'apparaît pas dans les deux premières phrases.
- E-mail : objet de 3 à 7 mots, concret, sans clickbait. 70 à 130 mots. Ouverture = une preuve spécifique au destinataire. Signature = prénom, fonction, coordonnées — pas de paragraphe corporate.
- Téléphone : 2-3 phrases (capter en 10 s).

TON : vouvoie par défaut un C-level, un dirigeant, un contact achats ou un contact inconnu. Le tutoiement n'est autorisé que si l'historique, le secteur ou le profil l'indiquent clairement.

{golden_rules_block(esn_name, batch=True)}

N'invente jamais un budget, un projet, une urgence, une relation ou une disponibilité.

OBJECTIF : obtenir une RÉPONSE, pas un RDV. SORTIE : JSON valide uniquement, rien avant ni après."""


def market_memory_angle_block(reinforced_expertises: list[str]) -> str:
    """#1611.5 — LE BLOC Observation du marché DES MESSAGES : l'ANGLE, JAMAIS LE CONTENU.

    ``reinforced_expertises`` est le résultat de
    ``app.services.market_memory_angle.reinforced_expertises`` : UNIQUEMENT des
    libellés que l'ESN a elle-même déclarés. Comme côté plan
    (``bellum_plan.market_memory_directive_block``), aucun nom de société de
    services, aucun comptage de parcours ne peut atteindre cette fonction — la
    observation du marché est donc structurellement incapable de devenir le contenu
    d'un message, pas seulement interdite de l'être par consigne.

    Vide ⇒ prompt byte-identique : un compte non couvert, ou sans
    corroboration, ne change rien aux messages d'avant ce lot.
    """
    if not reinforced_expertises:
        return ""
    labels = ", ".join(reinforced_expertises)
    return (
        "\n\nSIGNAL STRUCTUREL (observation du marché — #1611.5) — à utiliser UNIQUEMENT pour choisir quel ANGLE ou quelle "
        f"expertise mettre en avant, JAMAIS comme contenu du message : les expertises que tu déclares ressortent "
        f"aussi dans l'environnement technique observé de ce compte : {labels}. Deux sources indépendantes, PAS une "
        "preuve d'intervention actuelle — ça ne dit rien d'un prestataire en place aujourd'hui.\n"
        "INTERDICTION ABSOLUE : ne mentionne JAMAIS ce signal, le mot « mémoire », un nombre de personnes ou de "
        "parcours, ou le nom d'une société de services observée, dans un message prêt à être envoyé. Interdit, "
        "verbatim, par exemple : « Nous savons que des freelances sont passés chez vous. »\n"
        "Un message prêt à envoyer s'appuie sur un fait public actuel, un échange client, un signal récent, ou une "
        "donnée privée autorisée — jamais sur ce signal structurel seul. Si tu n'as RIEN d'autre que ce signal pour "
        "personnaliser un contact, écris « Contexte intéressant mais insuffisant » à la place du message plutôt que "
        "d'inventer un fait ou de citer ce signal."
    )


def account_archetype_message_block(hint: ArchetypeCommercialHint | None) -> str:
    """#3226 (#3202.6) — L'ANGLE de message pour l'archétype du compte cible
    (ESN, cabinet de conseil, éditeur…), DISTINCT du secteur (`sector_block`)
    et de la relation (`message_directive_block`) : « ne pas vendre du
    staffing à un concurrent » n'est ni un secteur ni un historique de
    relation, c'est ce que ce compte EST commercialement.

    ``hint`` vient de `company_archetype_playbook.archetype_commercial_hint` —
    ``None`` sans archétype établi ou sans jugement écrit pour lui. Vide ⇒
    prompt byte-identique (même garantie que `market_memory_angle_block`)."""
    if hint is None:
        return ""
    return (
        "\n\nARCHÉTYPE DU COMPTE CIBLE (#3202) — ce compte n'est pas une entreprise générique :\n"
        f"- Angle du message : {hint.message_angle}\n"
        f"- Partenariat : {hint.partnership_note}"
    )


def strategy_scope_message_block(scope: Any) -> str:
    """#2947 (#2204.7/.11/.15) — la stratégie que l'UTILISATEUR a choisie
    (« Changer de stratégie » : angle, mode d'entrée, périmètre, contraintes),
    lue sur le MÊME `StrategyScope` que la directive du plan
    (`_strategy_directive`) : aucune seconde lecture. Sans elle, les messages
    prêts à envoyer étaient écrits sur l'angle recommandé par le modèle, pas
    sur celui choisi.

    Le périmètre et les contraintes CADRENT le message ; ils ne fournissent
    aucun fait — « n'invente » est dit au modèle. ``constraints`` (#2204.15,
    longueur, mots à éviter…) ne fait jamais écrire, elle-même, un corps : le
    commercial reste le seul à envoyer (préparation en lot seulement). Absent
    ou entièrement vide ⇒ ``""`` ⇒ prompt byte-identique."""
    if scope is None:
        return ""
    parts: list[str] = []
    angle = (getattr(scope, "angle", None) or "").strip()
    entry_mode = (getattr(scope, "entry_mode", None) or "").strip()
    focus = (getattr(scope, "focus_entity", None) or "").strip()
    constraints = (getattr(scope, "constraints", None) or "").strip()
    if angle:
        parts.append(f"- Angle : « {angle} »")
    if focus:
        parts.append(f"- Périmètre : « {focus} »")
    if entry_mode:
        parts.append(f"- Mode d'entrée : {entry_mode} (top_down = sponsor, bottom_up = opérationnel, middle_out = N-1)")
    if constraints:
        parts.append(f"- Contraintes de forme : « {constraints} »")
    if not parts:
        return ""
    return (
        "\n\nSTRATÉGIE CHOISIE PAR L'UTILISATEUR — elle prime sur l'angle que tu aurais recommandé :\n"
        + "\n".join(parts)
        + "\nChaque message M1-M2-M3 s'écrit AUTOUR de ce choix. Il cadre le message, il ne fournit aucun fait : "
        "tu n'inventes rien sur ce périmètre qui ne soit dans le contexte compte ci-dessus."
    )


def message_objective_block(objective: str | None, relationship_state: str | None = None) -> str:
    """#2947 (#2204.11) — l'OBJECTIF choisi par l'utilisateur (« Changer de
    stratégie »), rejoué sur les trois temps M1-M2-M3 du lot.

    La règle et l'appel à l'action viennent de ``MESSAGE_OBJECTIVES`` — la table
    du composer mono-contact, à l'octet : aucune seconde définition (GA-26).
    Seul le DÉROULÉ change : M1 sert l'objectif, M2 apporte un élément neuf au
    service du même objectif, M3 termine sur la suite que l'objectif vise — et
    sur aucune demande de rendez-vous quand l'objectif n'en porte pas.

    Une prémisse que la relation MESURÉE contredit (« ouvrir le compte » vers un
    client actif) est NOMMÉE ; l'objectif reste celui choisi (une correction
    humaine gagne). Absent ou hors taxonomie ⇒ ``""`` ⇒ prompt byte-identique."""
    entry = MESSAGE_OBJECTIVES.get((objective or "").strip())
    if entry is None:
        return ""
    key = (objective or "").strip()
    cta = objective_cta_rule(key) or ""
    if objective_asks_nothing(key):
        m3 = (
            "- M3 : dernier message, toujours au service de cet objectif — aucune proposition de rendez-vous, "
            "il remplace celle de 15 minutes ; une porte ouverte que la personne peut ignorer sans coût."
        )
    else:
        m3 = (
            "- M3 : dernier message — l'appel à l'action de l'objectif, formulé conditionnellement, il remplace "
            "la proposition de 15 minutes, puis un close-loop respectueux."
        )
    premise = (
        "\n⚠️ La prémisse de cet objectif ne correspond pas à la relation mesurée avec ce compte : garde "
        "l'objectif choisi, mais n'écris rien qui la suppose vraie."
        if objective_premise_holds(relationship_state, key) is False
        else ""
    )
    return (
        f"\n\nOBJECTIF CHOISI PAR L'UTILISATEUR — {entry['label']} (il prime sur l'ouverture par défaut) :\n"
        f"- Règle : {entry['rules']}\n"
        f"- Appel à l'action : {cta}\n"
        "La séquence M1-M2-M3 se rejoue pour CET objectif :\n"
        "- M1 : sert l'objectif tel quel, avec son appel à l'action.\n"
        "- M2 : un élément NEUF tiré du contexte compte, au service du même objectif — jamais un autre "
        "objectif glissé en cours de séquence.\n"
        f"{m3}{premise}"
    )


def build_user_prompt(
    company_name: str,
    account_context: str,
    contacts: list[dict[str, Any]],
    relationship_state: str | None = None,
    sector_block: str = "",
    market_memory_block: str = "",
    revenue_model: str | None = None,
    channel_block: str = "",
    archetype_block: str = "",
    scope_block: str = "",
    access_path_block_text: str = "",
    objective_block: str = "",
) -> str:
    """Le prompt messages du dossier.

    ``channel_block`` (#3259, BEL-SC-230) — le canal que la route commerciale
    recommande de MENER en premier (``opening_movement.channel_prompt_block``),
    et le NO-GO explicite : ne pas rédiger un email comme premier geste quand
    la route recommandée est une introduction ou un échange direct partenaire.
    Avant ce bloc, les trois canaux (LinkedIn, email, téléphone) étaient
    toujours demandés SANS jamais dire lequel privilégier pour ce compte — le
    NO-GO exact du retour bêta #3259. ``""`` ⇒ prompt byte-identique.

    ``relationship_state`` est l'état de relation déterministe du SalesContext
    (kanban commercial → ``salesContext.relationship.state``). p6 : « le même
    signal produit un message différent selon la relation existante » — sans lui,
    un client actif recevait le M1 d'ouverture d'un inconnu. Absent ou ``froid``
    ⇒ bloc vide ⇒ prompt byte-identique (il décrit déjà une ouverture à froid).

    ``sector_block`` est le playbook sectoriel (p15-20 : « règles à injecter dans
    score, contacts, plan ET MESSAGES »). Il n'atteignait que le prompt plan : un
    message vers une banque et un message vers une startup partageaient donc le
    même vocabulaire. "" ⇒ prompt byte-identique.

    ``market_memory_block`` — voir ``market_memory_angle_block`` juste au-dessus
    (#1611.5) : construit-le avec elle, jamais à la main. "" ⇒ prompt
    byte-identique.

    ``revenue_model`` (#2645.2) est le modèle de revenu de l'ESN
    (``salesContext.esnProfile.businessModel.revenueModel``). Il ne change AUCUN
    mot du prompt : il change les ÉCHÉANCES que le bloc cadence annonce, pour
    qu'elles restent celles que ``CadenceService`` planifiera réellement. Absent,
    ``mixte`` ou ``inconnu`` ⇒ prompt byte-identique.

    ``archetype_block`` — voir ``account_archetype_message_block`` juste
    au-dessus (#3226/#3202.6) : construit-le avec elle, jamais à la main. ""
    sans archétype établi ⇒ prompt byte-identique.

    ``scope_block`` — voir ``strategy_scope_message_block`` (#2947/#2204.7) :
    la stratégie choisie par l'utilisateur. "" sans stratégie imposée ⇒ prompt
    byte-identique.

    ``access_path_block_text`` (#2947/#2204.10) — voir ``access_path_block``
    (``app.services.dossier_read``, partagée avec ``bellum_outreach``) : la
    voie d'accès probable (Q6 du dossier), déjà calculée à l'analyse. "" sans
    valeur ⇒ prompt byte-identique.

    ``objective_block`` (#2947/#2204.11) — voir ``message_objective_block`` :
    l'objectif choisi, rejoué sur M1-M2-M3. "" sans objectif ⇒ prompt
    byte-identique."""
    lines = []
    # #2947 (#2204.35) — le persona « Consultant » n'a pas besoin d'une
    # nouvelle taxonomie : `declared_person_company_relation`, déjà classée
    # par contact pour le composer mono-contact (`bellum_outreach`), rend la
    # même prudence ici, PAR contact plutôt qu'un bloc global (plusieurs
    # contacts peuvent porter des relations différentes dans un même lot).
    cautions: list[tuple[str, str]] = []
    for c in contacts:
        name = c.get("fullName") or c.get("full_name") or ""
        title = c.get("title") or ""
        entity = c.get("entity") or ""
        role = c.get("role") or c.get("decision_role") or ""
        # Le persona est DONNÉ, jamais redemandé : il est dérivé du palier
        # hiérarchique déjà calculé en phase 3 et porté par le contact. Le
        # transmettre supprime un raisonnement payé au modèle qui pouvait, en
        # plus, contredire le persona sur lequel le contrôle avant envoi juge.
        # Absent = NOMMÉ absent — jamais remplacé par une case par défaut.
        persona = contact_persona(c) or PERSONA_UNKNOWN
        # BEL-SC-235 (#3264.22/.24/.27) — champion / sponsor / partenaire n'ont
        # aucun palier hiérarchique : `persona` seul ne dit rien de leur angle.
        # `classify_committee_role` est la MÊME classification que le comité
        # d'achat du plan (aucune seconde lecture du titre) ; l'angle n'est
        # ajouté QUE pour les trois rôles que le levier hiérarchique ne couvre
        # pas (voir le commentaire de `committee_message_angle`).
        committee_role = classify_committee_role(
            title, c.get("hierarchyLevel") or c.get("hierarchy_level"), c.get("family")
        )["role"]
        angle = committee_message_angle(committee_role)
        declared_relation = classify_person_company_relation(
            declared_relation=c.get("declaredPersonCompanyRelation") or c.get("declared_person_company_relation")
        ).value
        caution = declared_relation_caution(declared_relation)
        if caution and name:
            cautions.append((name, caution))
        lines.append(
            f"- {name} — {title}"
            + (f" · {entity}" if entity else "")
            + (f" · rôle {role}" if role else "")
            + f" · persona {persona}"
            + (f" · angle {committee_role} : {angle}" if angle else "")
        )
    relation_caution_block = (
        (
            "\n\nRELATIONS DÉCLARÉES — À RESPECTER PAR CONTACT :\n"
            + "\n".join(f"- {person} : {text}" for person, text in cautions)
            + "\n"
        )
        if cautions
        else ""
    )
    contacts_block = "\n".join(lines) if lines else "(aucun contact prioritaire)"

    return f"""Rédige les messages M1 prêts à envoyer pour ces contacts prioritaires de "{company_name}".

CONTEXTE COMPTE (source des éléments de personnalisation — signaux, projets, actualités) :
{account_context[:4000]}

CONTACTS PRIORITAIRES :
{contacts_block}{relation_caution_block}{message_directive_block(relationship_state)}{sector_block}{market_memory_block}{channel_block}{archetype_block}{scope_block}{access_path_block_text}{objective_block}

SÉQUENCE LINKEDIN — TROIS TEMPS, PAS UN (règle p10) :
Un seul message n'est pas une séquence. Tu produis les trois, et on s'arrête
après M3 : il n'y a pas de M4.
- M1 : référence à l'interaction ou au contexte + UNE question facile. Zéro pitch.
- M2 : APPORT DE VALEUR — un cas, une donnée, un benchmark ou un insight PRÉCIS
  tiré du contexte compte ci-dessus. Ce n'est PAS une relance : « je me permets
  de revenir vers vous » est banni. Ce message doit valoir le coup d'être lu même
  sans réponse au premier.
- M3 : proposition de 15 minutes, formulée conditionnellement (si un intérêt
  s'est manifesté), suivie d'un close-loop respectueux qui laisse la porte
  ouverte pour plus tard. C'est le DERNIER message.

{cadence_directive_block(relationship_state, revenue_model)}

SCRIPT TÉLÉPHONE — QUATRE MOMENTS (règle p11) :
Le cold call qualifie une information, il ne récite pas un pitch.
- Ouverture : une RAISON PRÉCISE d'appeler (un profil disponible, un signal, un
  besoin, une relation, ou une question sur le périmètre).
- 10 secondes : qui je suis, pourquoi j'appelle, et UNE question fermée ou
  d'aiguillage. Pas de présentation d'entreprise.
- Découverte : les questions à poser sur le rôle, l'équipe, les projets, la
  tension du moment, les recrutements, les prestataires en place, le timing, le
  budget et le circuit d'achat.
- Sortie : un next step DATÉ, le nom du bon interlocuteur, une permission de
  relance — ou un NO-GO assumé.
À BANNIR : « tout se passe bien ? », le catalogue d'offres, et toute demande de
rendez-vous sans raison donnée.

SORTIE JSON :
{{
  "messages": [
    {{
      "contactName": "nom complet exact (doit correspondre à un contact ci-dessus)",
      "persona": "RECOPIE EXACTEMENT le persona donné pour ce contact dans la liste ci-dessus. Ne le recalcule pas, ne le traduis pas.",
      "linkedinMessage": "M1 LinkedIn prêt à envoyer, au format du canal ci-dessus. Zéro mention ESN. Levier du persona.",
      "linkedinMessageM2": "M2 — apport de valeur : un cas, une donnée, un benchmark ou un insight PRÉCIS tiré du contexte compte. 100-150 mots. Aucune relance déguisée.",
      "linkedinMessageM3": "M3 — proposition de 15 min formulée conditionnellement, puis close-loop respectueux. 80-120 mots. C'est le DERNIER message.",
      "emailSubject": "objet court (max 8 mots) référençant un fait précis. Pas de 'Prise de contact'.",
      "emailBody": "email court prêt à envoyer : accroche factuelle + 1 question facile. Pas de pitch lourd.",
      "cadence": {{
{cadence_json_fields(relationship_state, revenue_model)}
      }},
      "phoneOpener": "ouverture téléphonique 2-3 phrases, nomme un fait précis pour montrer qu'on a fait ses devoirs.",
      "phoneTenSeconds": "les 10 premières secondes : qui je suis, pourquoi j'appelle, UNE question fermée ou d'aiguillage.",
      "phoneDiscovery": ["4 à 6 questions de découverte, concrètes et ordonnées : rôle/équipe, projets, tension, prestataires en place, timing, budget/achats"],
      "phoneExit": "la sortie d'appel : next step daté + nom du bon interlocuteur + permission de relance, ou NO-GO assumé."
    }}
  ]
}}

Un objet par contact prioritaire, dans l'ordre fourni."""
