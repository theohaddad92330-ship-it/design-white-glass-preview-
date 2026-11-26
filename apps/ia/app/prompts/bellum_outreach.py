"""BELLUM-OUTREACH — un message M1 prêt à envoyer, sur UN canal, à la demande.

Variante mono-contact / mono-canal de ``bellum_messages`` : sert le composer
d'engagement (écran contact › « Contacter »). Reprend les 3 personas et intègre
l'ANGLE libre tapé par le commercial. Un seul appel Claude, borné (le composer
régénère à la demande). JAMAIS d'élément inventé : « élément à vérifier » sinon.

⚠️ Les règles d'or ne sont PAS réécrites ici. Ce module en tenait sa propre
liste de huit, verbatim des huit premières de ``bellum_messages`` — deux listes
qui divergeaient au premier ajout, et c'est le contrôle avant envoi qui perdait.
Il APPELLE désormais ``golden_rules_block`` avec ``batch=False`` : la seule règle
qu'il n'affiche pas est celle qui parle de la clé ``contactName``, un champ que
sa sortie mono-contact n'a pas.
"""

from __future__ import annotations

from typing import Any, Literal

# #1926.4 — le persona est DONNÉ par le cadrage (``message_brief``), plus déduit
# du titre par le modèle : la table des leviers vient de ``persona.py``, comme
# pour ``bellum_messages``. #1925 — la spécificité arrive par ``golden_rules_block``.
from app.knowledge.channel_length import CHANNEL_LENGTH
from app.knowledge.persona import persona_lever_block
from app.prompts.bellum_messages import golden_rules_block
from app.services.domain_focus import offers_or_default, resolve_domain_focus
from app.services.dossier_read import access_path_block
from app.services.message_brief import message_brief_block, message_parameters_block
from app.services.message_signals import render_message_signals
from app.services.offer_domains import get_offer_domain_pack
from app.services.person_company_relation import classify_person_company_relation
from app.services.relationship_playbook import message_directive_block

# #2123.72 — quatrième canal : la tâche de prise de contact (elle ne s'envoie pas).
# #2947/#2204.41 — cinquième canal : le message vocal (contrat #2370 — le contrat
# SQL/enum existait depuis le 26/09, aucun texte n'était encore généré).
# #2947/#2204.40 — sixième canal : le message de recommandation (contrat SQL/enum
# posé lot g13 26/09 — `OUTREACH_MESSAGE_CHANNELS`, jamais de générateur avant ce lot).
# #2370 (épopée #2947) — les huit canaux qui manquaient : chacun sa forme. Laura
# les PRÉPARE, le commercial les envoie (aucun n'entre dans le balayeur d'envoi).
Channel = Literal[
    "email",
    "linkedin",
    "phone",
    "task",
    "recommendation",
    "introduction_request",
    "partner_message",
    "follow_up_email",
    "profile_push",
    "linkedin_connection_note",
]

# Trois canaux, trois formats. Le même texte recopié d'un canal à l'autre est ce
# qui faisait lire un message LinkedIn comme un e-mail tronqué (addendum p50).
_CHANNEL_RULES: dict[str, str] = {
    "linkedin": (
        f"CANAL = LinkedIn (message d'ouverture). {CHANNEL_LENGTH['linkedin']}, lisible sur mobile. "
        "« Bonjour Prénom » pour un premier échange professionnel. Ne commence PAS par "
        "« J'espère que vous allez bien » sauf historique réel : sur un premier contact, cette "
        "formule signale l'envoi de masse. ZÉRO mention de l'ESN ni de l'offre dans les deux "
        "premières phrases — le destinataire doit d'abord comprendre pourquoi tu lui écris À LUI. "
        "Un seul angle, une seule question."
    ),
    # #1926.19 — objet précis, contexte réel, TENSION MÉTIER, question simple.
    "email": (
        "CANAL = e-mail. Objet de 3 à 7 mots, concret, sans clickbait ni nom de société inutile "
        f"(jamais « Prise de contact »). {CHANNEL_LENGTH['email']} : ouverture = une preuve ou un "
        "contexte spécifique au destinataire ; lien = pourquoi cette observation peut concerner "
        "SON périmètre, sous forme d'hypothèse prudente, et la TENSION MÉTIER qu'elle crée pour lui "
        "(un arbitrage, une contrainte d'équipe, un délai — jamais une alerte ni une urgence "
        "inventée) ; puis UNE question courte. Ne propose un "
        "échange que si la réponse le justifie. Signature = prénom, fonction, coordonnées — pas de "
        "paragraphe corporate. Aucune pièce jointe sur un premier contact."
    ),
    # #3697(a) (reste) — trois défauts nommés sur le support d'appel généré :
    # le ton ne suivait le PERSONA (ci-dessus, `persona_lever_block`) qu'à
    # l'écrit, jamais rappelé pour l'ORAL ; rien n'empêchait un « rendez-vous »
    # proposé comme but en soi au lieu de l'OBJECTIF du cadrage ; et la
    # première phrase pouvait être une formule de politesse plutôt que le fait
    # + la question. Les objections, elles, restent HORS de ce canal : elles
    # sont déjà déclarées (panneau Objections, modèles approuvés ordonnés par
    # rôle, #3697.9/lot F16) — ce bloc ne les régénère pas une seconde fois.
    "phone": (
        f"CANAL = ouverture téléphonique. {CHANNEL_LENGTH['phone']} pour capter en 10 s, À DIRE À VOIX HAUTE : "
        "la PREMIÈRE phrase est le fait précis du compte qui montre qu'on a fait ses devoirs — jamais une "
        "formule de politesse ni un « comment allez-vous » en préambule. La phrase suivante est la question "
        "d'ouverture concrète. Pas de monologue commercial, pas de liste, pas de virgule à rallonge : une "
        "phrase orale se dit d'un souffle. RÔLE DU CONTACT : le PERSONA et son levier (ci-dessus) pilotent le "
        "fait choisi et le niveau de langage — à un dirigeant/décideur, enjeu et conséquence, zéro détail "
        "d'exécution ; à un contact technique ou opérationnel, un détail concret observable, pas d'enjeu "
        "stratégique abstrait ; à un contact achats, le process ou la condition, jamais une promesse de "
        "prix. AUCUN rendez-vous proposé par défaut : la question suit l'OBJECTIF du cadrage s'il est fourni, "
        "sinon elle cherche une réponse ou une information, jamais un créneau d'agenda inventé de ta propre "
        "initiative. "
        # #4975.1 — l'ouverture est le bloc 1 ; les objections ont leur bloc séparé (#4976), alimenté par le dossier.
        "OUVERTURE GÉNÉRALE : ne réponds à AUCUNE objection dans ce texte, même si le savoir interne ou le brief "
        "en cite (« Objections : … ») — elles s'affichent dans leur propre bloc."
        # L'offre d'emploi déclencheuse : une seule consigne, dans `message_grounding._phone_offer_block` (#4977).
    ),
    # #2947/#2204.40 — un texte d'APPUI (recommander CE contact), distinct de
    # `get_referral` (l'OBJECTIF « être recommandé PAR lui » — un tout autre
    # message). Format LinkedIn recommendation par défaut : à la 3e personne,
    # jamais adressé au contact lui-même — c'est un texte qu'on POSTE ou qu'on
    # transmet, pas un message qu'on lui envoie.
    "recommendation": (
        "CANAL = message de recommandation : un texte d'appui qui RECOMMANDE ce contact (pas un message "
        f"qui lui est adressé). Écris à la 3e personne, comme une recommandation LinkedIn : {CHANNEL_LENGTH['recommendation']}, "
        "cite UN fait précis et vérifiable (une mission, un résultat, une qualité observée), jamais un "
        "compliment générique interchangeable (« excellent professionnel »). Aucune formule d'adresse "
        "(« Bonjour »), aucune signature : ce texte sera collé tel quel dans un espace de recommandation "
        "ou transmis à un tiers, jamais envoyé directement au contact."
    ),
    # #2123.72 — une TÂCHE que le commercial exécutera lui-même : elle ne s'envoie pas,
    # elle se crée dans ses actions. Donc aucune formule d'adresse, aucune signature.
    "task": (
        "CANAL = tâche de prise de contact. Tu rédiges une TÂCHE pour le commercial, pas un "
        "message : elle ne s'envoie pas, elle s'ajoute à ses actions. Intitulé = UNE phrase "
        "qui commence par un verbe d'action et nomme le contact (ex. « Appeler Claire Martin "
        f"pour qualifier le programme DORA »). Consigne = {CHANNEL_LENGTH['task']} : le canal conseillé "
        "(appel, rendez-vous, message, rencontre), le fait précis du compte qui justifie la "
        "prise de contact, ce qu'il faut obtenir, et la question d'ouverture à poser. Aucune "
        "formule d'adresse, aucune signature, aucune date inventée."
    ),
    # #2370.introduction_request — on écrit à l'INTERMÉDIAIRE (celui qui connaît
    # la cible), jamais à la cible : il doit pouvoir transférer sans réécrire.
    "introduction_request": (
        "CANAL = demande d'introduction : tu écris au contact pour qu'il te PRÉSENTE à une autre personne, "
        f"pas à la personne visée. {CHANNEL_LENGTH['introduction_request']}. Dis pourquoi tu t'adresses à "
        "LUI, qui tu veux rencontrer et pourquoi maintenant (un fait précis du contexte). Écris ensuite un "
        "court paragraphe qu'il pourra transférer tel quel à la personne visée, à la 3e personne. Laisse-lui "
        "une sortie facile (« si ce n'est pas le bon moment, aucun souci »). Aucune pression, aucune relation "
        "inventée."
    ),
    # #2370.partner_message — à un PARTENAIRE (éditeur, intégrateur, cabinet) :
    # le contexte commun avant la demande, jamais un pitch de prospection.
    "partner_message": (
        f"CANAL = message à un partenaire. {CHANNEL_LENGTH['partner_message']}. Le destinataire n'est pas un "
        "prospect : ouvre par le contexte commun (le compte, le programme ou le client partagé tel qu'il "
        "figure dans le contexte), puis ce que chacun peut apporter, puis UNE demande précise (un échange, "
        "une information, une mise en relation). Aucun pitch de l'offre, aucun chiffre d'affaires promis, "
        "aucun accord présenté comme acquis."
    ),
    # #2370.follow_up_email — un SUIVI après un échange réel : il apporte
    # quelque chose de neuf, jamais « Avez-vous vu mon message ? » (#2204.58).
    "follow_up_email": (
        "CANAL = e-mail de suivi, après un échange ou un premier message déjà envoyé. Objet de 3 à 7 mots "
        f"qui reprend le sujet de l'échange. {CHANNEL_LENGTH['follow_up_email']} : rappelle en une phrase "
        "l'échange précédent tel qu'il figure dans le contexte (sans en inventer), apporte UN élément "
        "nouveau (une information, une réponse, une ressource), puis une prochaine étape simple. Jamais "
        "« avez-vous vu mon message », jamais de reproche implicite sur l'absence de réponse."
    ),
    # #2370.profile_push — un consultant DISPONIBLE proposé à un client : le
    # profil sert un besoin du compte, il ne se pousse pas à l'aveugle.
    "profile_push": (
        "CANAL = push de profil consultant : tu proposes un consultant au contact. Objet de 3 à 7 mots qui "
        f"nomme le rôle et le sujet. {CHANNEL_LENGTH['profile_push']} : le besoin ou le sujet du compte "
        "auquel ce profil répond (tel qu'il figure dans le contexte), puis trois atouts concrets du profil "
        "au plus, sa disponibilité si elle est connue, et UNE question (un échange de 20 minutes, un CV "
        "détaillé). Ni nom de famille, ni coordonnée du consultant, ni tarif : rien qui sorte avant l'accord "
        "du client. Aucune compétence ni disponibilité inventée."
    ),
    # #2370.linkedin_connection_note — la note jointe à une invitation : LinkedIn
    # la coupe au-delà de 300 caractères. Elle sert à être ACCEPTÉ, pas à vendre.
    "linkedin_connection_note": (
        f"CANAL = note de connexion LinkedIn, jointe à une invitation. {CHANNEL_LENGTH['linkedin_connection_note']} "
        "— au-delà, LinkedIn coupe la note. Le but est que l'invitation soit ACCEPTÉE, pas de vendre : "
        "« Bonjour Prénom », la raison précise de la connexion (un point commun ou un fait du contexte), "
        "et rien d'autre. Aucune offre, aucune demande de rendez-vous, aucun lien, pas de signature."
    ),
}

#: Garde-fous communs aux trois canaux (p53, p55). Ils ne dépendent ni du canal
#: ni du persona : ce sont les choses qui font perdre la confiance quel que soit
#: le contexte.
_COMMON_GUARDRAILS = (
    "TON : un registre demandé par le commercial dans le CADRAGE DU MESSAGE prime. Sinon, "
    "vouvoie par défaut un C-level, un dirigeant, un contact achats ou un contact inconnu. "
    "Le tutoiement n'est autorisé que si l'historique, le secteur ou le profil l'indiquent clairement.\n"
    "N'invente jamais un budget, un projet, une urgence, une relation ou une disponibilité.\n"
    "NO-GO (#2368.14) : toute affirmation factuelle écrite doit être TRACÉE dans « claims » à une citation "
    "exacte du CONTEXTE fourni. Si tu n'as pas de citation exacte pour une affirmation, NE L'ÉCRIS PAS.\n"
    "Si le CONTEXTE fourni est mince (pas de signal, pas d'actualité datée, pas de fait précis sur ce "
    "compte ou ce contact), n'invente AUCUNE actualité pour meubler le message (#2372.8) : pose plutôt "
    "une question honnête sur sa situation ou son sujet — jamais une affirmation non prouvée.\n"
    "Pour un contact C-level, reste au niveau du cadrage et demande le bon point d'entrée : ne "
    "propose pas une mission détaillée sans sponsor terrain.\n"
    "Pour un contact achats, ne simule pas un accès opérationnel : cherche d'abord le process, le "
    "panel et les conditions."
)

# ⚠️ La consigne de sortie ne redit PAS l'ouverture. Elle disait « commence par
# « J'espère que vous allez bien » » — exactement ce que la règle d'or n°2
# interdit, trois blocs plus haut, avec sa raison (sur un premier contact, cette
# formule signale l'envoi de masse). Deux instructions contradictoires dans un
# même prompt ne sont pas un réglage : l'une des deux est ignorée, et on ne
# choisit pas laquelle. C'est la règle qui reste, parce qu'elle porte un motif.
#
# #1926.28 / .29 — la sortie expose aussi la RAISON du choix et l'ANGLE
# ALTERNATIF. Ces deux clés sont lues par ``OutreachDraftOutput`` et rendues par
# ``/message/generate`` : une clé demandée ici sans champ au modèle de sortie
# serait produite, payée, et avalée par pydantic.
_CHOICE_FIELDS = (
    '  "rationale": "UNE phrase : pourquoi CET angle pour CE contact, en citant les éléments du contexte utilisés",\n'
    "  \"alternativeAngle\": \"UNE phrase : l'autre angle crédible que tu n'as pas retenu et l'élément du contexte "
    "sur lequel il s'appuierait — null si le contexte n'en offre aucun\",\n"
    # #2368.14 — NO-GO : chaque affirmation factuelle (signal, actualité, chiffre,
    # référence) porte sa preuve, une CITATION EXACTE du CONTEXTE ci-dessous. Une
    # preuve introuvable dans le contexte bloque tout le message côté serveur.
    '  "claims": [{"text": "affirmation factuelle écrite dans le message", "proof": "citation EXACTE du '
    'CONTEXTE ci-dessous qui la soutient"}] — une entrée par affirmation factuelle, vide si le message '
    "n'en contient aucune (une question ouverte ou une formule de politesse n'en est pas une)\n"
)
_CHANNEL_OWN_FIELDS: dict[str, str] = {
    "email": '  "subject": "objet court (max 8 mots), fait précis",\n  "body": "email prêt à envoyer",\n',
    "linkedin": '  "body": "message LinkedIn prêt à envoyer, au format du canal ci-dessus",\n',
    "phone": '  "body": "ouverture téléphonique de 2-3 phrases prête à dire",\n',
    "task": '  "subject": "intitulé de la tâche : verbe d\'action + contact (max 12 mots)",\n'
    '  "body": "consigne de la tâche en 2 à 4 phrases, au format du canal ci-dessus",\n',
    "recommendation": '  "body": "texte de recommandation prêt à poster, au format du canal ci-dessus",\n',
    # #2370 — les deux canaux de forme e-mail gardent un objet ; les autres n'en ont pas.
    "introduction_request": '  "body": "demande d\'introduction prête, paragraphe transférable compris, au format du canal '
    'ci-dessus",\n',
    "partner_message": '  "body": "message au partenaire prêt, au format du canal ci-dessus",\n',
    "follow_up_email": '  "subject": "objet court (max 8 mots), le sujet de l\'échange",\n'
    '  "body": "e-mail de suivi prêt, au format du canal ci-dessus",\n',
    "profile_push": '  "subject": "objet court (max 8 mots), le rôle et le sujet",\n'
    '  "body": "e-mail de proposition du profil prêt, au format du canal ci-dessus",\n',
    "linkedin_connection_note": '  "body": "note de connexion de 300 caractères au plus, au format du canal ci-dessus",\n',
}
_CHANNEL_OUTPUT: dict[str, str] = {
    channel: "{\n" + own_fields + _CHOICE_FIELDS + "}" for channel, own_fields in _CHANNEL_OWN_FIELDS.items()
}


#: #2861 (#2437.11) — même catalogue que `contacts.locale`/`workspace.defaultLocale`
#: /`rag_documents.language` (GA-26) : trois langues NOMMÉES, jamais devinées.
_LANGUAGE_NAMES: dict[str, str] = {"fr": "français", "en": "anglais", "de": "allemand"}


def message_language_block(locale: str | None) -> str:
    """#2437.11 — le message choisit sa LANGUE avant génération, sur le SEUL
    niveau déjà transporté jusqu'ici : le destinataire (`contacts.locale`,
    livré #2437.2). `None` ou `"fr"` (le français est déjà le comportement
    d'avant) ⇒ bloc vide, prompt inchangé à l'octet. Une valeur hors
    catalogue (jamais devinée, jamais un pays) ⇒ bloc vide aussi, plutôt
    qu'une langue inventée."""
    if not locale or locale == "fr":
        return ""
    name = _LANGUAGE_NAMES.get(locale)
    if not name:
        return ""
    return (
        f"\n\nLANGUE DU MESSAGE : rédige ENTIÈREMENT en {name} — le destinataire a déclaré "
        f"cette langue. Adapte aussi le registre (formule d'ouverture, signature) à cette "
        "langue, jamais un mélange avec le français."
    )


def contact_full_name(contact: dict[str, Any]) -> str:
    """Le nom du contact tel que le prompt l'écrit — et tel que le validateur de
    spécificité le cherche dans le brouillon (une seule lecture, deux lecteurs).

    `contacts` porte `full_name` (migration Init) — first/last n'ont jamais existé
    en base. Le repli couvre les appelants qui passent un contact déjà découpé."""
    return str(contact.get("full_name") or f"{contact.get('first_name', '')} {contact.get('last_name', '')}".strip())


def last_loss_block(last_loss: dict[str, Any] | None) -> str:
    """#3405.6 — LE MOTIF DE LA DERNIÈRE PERTE, NOMMÉ AU RÉDACTEUR.

    `projects.loss_reason` (la raison d'un projet PERDU sur ce compte) nourrissait
    le matching consultant, jamais le message : le brouillon d'ouverture pouvait
    refaire l'approche qui avait échoué. C'est une CONSIGNE au rédacteur — ne pas
    répéter l'erreur — et jamais une phrase à dire au destinataire : lui rappeler
    qu'on a perdu chez lui serait une maladresse.

    Absent, vide ou blanc ⇒ "" ⇒ prompt inchangé à l'octet, comme les autres
    blocs optionnels de ce fichier. Jamais un motif deviné."""
    reason = str((last_loss or {}).get("reason") or "").strip()
    if not reason:
        return ""
    closed_on = str((last_loss or {}).get("closed_on") or "").strip()
    when = f" (clos le {closed_on})" if closed_on else ""
    return (
        f"\nDERNIÈRE PERTE SUR CE COMPTE{when} — motif déclaré : « {reason} ».\n"
        "Ne répète pas l'approche ou l'argument qui a mené à cette perte. "
        "Ne cite pas ce motif au destinataire : c'est une consigne pour toi, pas une phrase à écrire.\n"
    )


def alternative_hook_block(revision: dict[str, Any] | None) -> str:
    """#3419.3 — « AUTRE ACCROCHE » : réécrire l'ouverture d'un message déjà rédigé.

    Le commercial a un brouillon et veut une autre entrée en matière. C'est une
    consigne au rédacteur : changer le premier paragraphe, sur un élément RÉEL
    différent du dossier, et laisser le reste du message à l'identique. Jamais un
    fait inventé pour varier : sans autre élément sourcé, il le dit au lieu de
    combler. Absent ou d'un autre genre ⇒ "" ⇒ prompt inchangé à l'octet."""
    if not revision or revision.get("kind") != "alternative_hook":
        return ""
    current = str(revision.get("current_body") or "").strip()
    if not current:
        return ""
    previous = [str(hook).strip() for hook in revision.get("previous_hooks") or [] if str(hook).strip()]
    already = (
        "\nOuvertures déjà proposées (ne les ressers pas) :\n" + "\n".join(f"- {hook}" for hook in previous) + "\n"
        if previous
        else ""
    )
    return (
        "\nRÉVISION — AUTRE ACCROCHE. Le commercial a déjà ce message :\n"
        f"« {current} »\n"
        "Réécris UNIQUEMENT l'ouverture (le premier paragraphe) : une accroche différente, "
        "appuyée sur un élément RÉEL différent du dossier que celui déjà utilisé. "
        "Reprends le reste du message à l'identique.\n"
        "N'invente aucun fait pour varier. S'il n'existe aucun autre élément sourcé dans le dossier, "
        "garde l'ouverture actuelle et dis-le dans la raison du choix.\n"
        f"{already}"
    )


def _placed_roles(profile: dict[str, Any]) -> list[str]:
    declared = [str(r).strip() for r in (profile.get("placedRoles") or []) if str(r).strip()]
    if declared:
        return declared
    inferred = profile.get("inferredPlacedRoles") or []
    return [str(e.get("role")).strip() for e in inferred if isinstance(e, dict) and str(e.get("role") or "").strip()]


def seller_pack_block(profile: dict[str, Any] | None) -> str:
    """LUDOVIC-C LC.5 — le PRISME DU PACK pour un vendeur hors IT.

    Recette prod 19/10 (Stelya, pack industriel) : le script d'appel ouvrait sur
    « l'harmonisation des outils et des données » — l'angle IT par défaut, parce que
    ce prompt ne lisait pas le pack. Pour un pack non IT, l'angle et la question
    d'ouverture parlent des MÉTIERS placés et du signal daté. Espace IT ou profil
    sans pack ⇒ ``""`` ⇒ prompt byte-identique.
    """
    profile = profile or {}
    if get_offer_domain_pack(profile.get("offerDomain")) is None:
        return ""
    focus = resolve_domain_focus(profile)
    label = focus.get("label_long") or focus.get("label") or ""
    roles = _placed_roles(profile)
    roles_line = f" Métiers que tu places : {', '.join(roles[:6])}." if roles else ""
    return (
        f"\n\nPRISME DU PACK : tu vends {label}.{roles_line} L'angle et la question d'ouverture parlent de "
        "CES métiers chez le compte (recrutements, charge et tenue des équipes, montée en cadence) — jamais "
        "d'outils informatiques, de système d'information ni d'harmonisation des données. Quand un signal daté "
        "est fourni, cite son intitulé ET sa date dans la première phrase."
    )


def build_system_prompt(profile: dict[str, Any], channel: Channel) -> str:
    esn_name = profile.get("companyName") or profile.get("esn_name") or "votre ESN"
    offers = offers_or_default(profile, it_default=["conseil IT"])
    offers_str = ", ".join(offers) if isinstance(offers, list) else str(offers)
    channel_rules = _CHANNEL_RULES.get(channel, _CHANNEL_RULES["email"])

    return f"""Tu es directeur commercial ESN expert en prospection, pour {esn_name} ({offers_str}). Ton but : CRÉER DU LIEN, pas envoyer un pitch. Tu écris UN message prêt à envoyer (jamais un template avec des [crochets] à remplir).

{persona_lever_block()}

CE QUI FAIT RÉPONDRE : un SIGNAL CRÉDIBLE + une QUESTION FACILE + une ABSENCE DE SURVENTE — sauf quand le CADRAGE DU MESSAGE choisit l'approche directe (#4060) : aucun signal n'est alors requis ni ajouté.

{channel_rules}{seller_pack_block(profile)}

{_COMMON_GUARDRAILS}

{golden_rules_block(esn_name, batch=False)}

OBJECTIF : celui du CADRAGE DU MESSAGE quand il est fourni ; sinon obtenir une RÉPONSE, pas un RDV. SORTIE : JSON valide uniquement, rien avant ni après."""


def build_user_prompt(
    contact: dict[str, Any],
    raw_analysis: dict[str, Any],
    profile: dict[str, Any],
    recent_signals: list | None,
    channel: Channel,
    context: str,
    company_name: str = "",
    relationship_state: str | None = None,
    brief: dict[str, Any] | None = None,
    parameters: dict[str, Any] | None = None,
    locale: str | None = None,
    access_path: str | None = None,
    last_loss: dict[str, Any] | None = None,
    seller_voice: str = "",
    knowledge: str = "",
    revision: dict[str, Any] | None = None,
    grounding_block: str = "",
) -> str:
    """``relationship_state`` : l'état de relation déterministe du SalesContext
    persisté sur le compte (``raw_analysis.salesContext``). Le composer est la
    surface la plus cliquée du produit ; sans lui, le brouillon proposé sur un
    client actif est celui d'une prise de contact à froid. Absent ou ``froid`` ⇒
    bloc vide ⇒ prompt inchangé.

    ``brief`` (#1926.2-.5, .8) : le cadrage dérivé par
    ``app.services.message_brief.derive_message_brief`` — objectif, niveau
    hiérarchique, registre, appel à l'action, fixés AVANT la rédaction. ``None``
    ⇒ bloc vide.

    ``parameters`` (#2123.65-.67) : signal, offre et preuve choisis dans le
    formulaire du composer. ``None`` ou vides ⇒ bloc vide.

    ``locale`` (#2861, #2437.11) : la langue déclarée du destinataire
    (``contacts.locale``). ``None`` ou ``"fr"`` ⇒ bloc vide ⇒ prompt inchangé
    à l'octet — c'est le comportement d'avant ce lot.

    ``access_path`` (#2947/#2204.10) — voir ``access_path_block``
    (``app.services.dossier_read``, partagée avec ``bellum_messages`` côté
    lot). ``None`` ou vide ⇒ bloc vide.

    ``last_loss`` (#3405.6) — voir ``last_loss_block`` : le motif de la dernière perte
    du compte. ``None`` ⇒ bloc vide.

    ``seller_voice`` / ``knowledge`` (#3752) — voir ``message_context`` : la voix déclarée du
    vendeur et les documents de l'espace. ``""`` ⇒ prompt inchangé à l'octet.

    ``grounding_block`` (#4524.2) — voir ``message_grounding.apply_grounding`` : les faits COCHÉS par le commercial
    (ou « angle libre »). ``""`` ⇒ prompt inchangé à l'octet.

    ``revision`` (#3419.3) — voir ``alternative_hook_block`` : réécrire l'ouverture
    d'un message déjà rédigé. ``None`` ⇒ bloc vide.

    #219.8 (#3231) / #2947 (#2204.34) : la relation personne↔entreprise DÉCLARÉE
    (``contacts.declared_person_company_relation``, jamais devinée) pilote la
    prudence du message pour les quatre valeurs où le corps de l'issue #3213 a
    une prise sur le texte (ex-salarié, ex-prestataire, simplement présenté,
    prestataire en mission) — voir ``relationship_playbook._PERSON_RELATION_CAUTION``. Colonne absente
    du dict ``contact`` (tout appelant d'avant ce lot) ou valeur non déclarée
    ⇒ ``classify_person_company_relation`` rend ``unknown_relationship`` ⇒
    aucune ligne ajoutée, prompt inchangé à l'octet."""
    contact_name = contact_full_name(contact)
    contact_title = contact.get("title", "")
    company = company_name or contact.get("entity") or contact.get("organization_name") or ""
    offers = profile.get("offers") or profile.get("core_offers") or []
    offers_str = ", ".join(offers) if isinstance(offers, list) else str(offers)

    # #3695.3 — un signal ancien ou non daté n'est jamais rangé sous « récents ».
    # #4060 (recette prod 14/10, Renault) — « approche directe » choisie : ce bloc
    # s'intitule « source d'ACCROCHE PRIORITAIRE » et contredirait donc tout seul
    # la règle de l'objectif (« aucun signal, aucun article… »). Les signaux
    # restent lus pour les AUTRES objectifs (jumeau de la ligne « SIGNAL CRÉDIBLE »
    # déjà levée côté system prompt, voir `build_system_prompt`).
    objective = (brief or {}).get("objective")
    signals_str = "" if objective == "approche_directe" else render_message_signals(recent_signals)

    # L'angle libre du commercial PILOTE le message quand il est présent ; sinon
    # on part des signaux récents du compte.
    angle_block = (
        f"\nANGLE DEMANDÉ PAR LE COMMERCIAL (à intégrer en priorité) :\n{context}\n"
        if context
        # #4524.2 — un choix du commercial (faits cochés ou angle libre) remplace ce repli : il ne reste pas deux consignes.
        else ("\n" if grounding_block else "\n(Aucun angle imposé — pars du signal le plus actionnable du compte.)\n")
    )

    person_relation = classify_person_company_relation(
        declared_relation=contact.get("declared_person_company_relation")
    ).value

    return (
        f"""Rédige UN message M1 prêt à envoyer pour ce contact.

CONTACT : {contact_name} — {contact_title}"""
        + (f" chez {company}" if company else "")
        + f"""
OFFRES ESN (contexte, NE PAS mentionner en M1 LinkedIn) : {offers_str}
{angle_block}{signals_str}{grounding_block}

ANALYSE COMPTE (extraits — source des éléments de personnalisation) :
{str(raw_analysis)[:3000]}{message_directive_block(relationship_state, person_relation)}{message_brief_block(brief)}{message_parameters_block(parameters)}{message_language_block(locale)}{access_path_block(access_path)}{last_loss_block(last_loss)}{seller_voice}{knowledge}{alternative_hook_block(revision)}

SORTIE JSON ({channel}) :
{_CHANNEL_OUTPUT.get(channel, _CHANNEL_OUTPUT["email"])}"""
    )
