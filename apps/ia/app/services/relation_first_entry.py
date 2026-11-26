"""#2313 — RELATION-FIRST ACCOUNT ENTRY ET INTRODUCTION GOVERNANCE (LAU-FINAL-054).

Permettre à Laura de construire une stratégie à partir d'un seul contact connu
ou d'une ancienne relation, SANS jamais supposer plus que ce qui a été vérifié.

Déterministe, sans LLM ni I/O — même famille que `relationship_playbook` et
`org_graph_assembler` (voir leurs docstrings). La preuve d'autorisation
elle-même (accord obtenu, daté, canalisé) reste journalisée côté serveur
(`IntroductionAuthorizationService`, #2373.9, apps/api) : ce module ne
l'invente jamais, il applique la même DOCTRINE côté IA — celle que
`warmIntroGovernance.ts` applique déjà côté web pour la fiche Contact — au
moment où Laura, en chat, construit une stratégie à partir d'une relation
connue plutôt qu'à partir d'un compte déjà en portefeuille.

Deux domaines proches, jamais confondus :
* `link-kind.ts` / `warmIntroGovernance.ts` (#2373) — CITER un référent sur un
  contact du portefeuille.
* CE module (#2313) — ENTRER un compte à partir d'une relation connue, avant
  même qu'un contact existe en portefeuille, et cadrer la SÉQUENCE terrain qui
  suit.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

# #2313.1 — ENTRÉE : les huit façons dont l'utilisateur peut déclarer connaître
# quelqu'un. Liste FERMÉE et ADDITIVE (même règle que GA-08 / LINK_KINDS,
# #2373.2) : une neuvième entrée s'ajoute en fin de liste, jamais au milieu.
KNOWN_CONTACT_ENTRY_KINDS = (
    "name",
    "email",
    "capture",
    "crm_relation",
    "mail_history",
    "former_colleague",
    "consultant",
    "met_before",
)

# #2313.2 — VÉRIFICATIONS : les dix champs qu'il faut AVANT de recommander quoi
# que ce soit sur la relation. Le nom du champ, pas sa valeur : ce module ne
# sait jamais SI une vérification est vraie, seulement si elle a été FAITE.
VERIFICATION_FIELDS = (
    "identity",
    "current_title",
    "company",
    "entity",
    "last_contact_date",
    "relation_nature",
    "owner",
    "visibility_permission",
    "context",
    "relation_state",
)


def verify_before_recommend(known: dict[str, Any]) -> dict[str, Any]:
    """#2313.2 — l'état de vérification d'une relation connue.

    Ne dit jamais "prêt" tant qu'un des dix champs manque — `missing` NOMME
    chacun d'eux, jamais un compte muet ("3 champs manquants")."""
    missing = [field for field in VERIFICATION_FIELDS if not known.get(field)]
    return {"missing": missing, "ready": not missing}


# #2313.3 — LECTURE COMMERCIALE : ce qu'une personne peut raisonnablement
# faire. Distinct du TYPE de lien (#2373 `LinkKind`, "on connaît quelqu'un") :
# ceci décrit sa CAPACITÉ, jamais son poids d'achat (`orgDecisionRole`,
# org-graph.ts) ni la nature du lien lui-même.
RELATIONAL_CAPABILITIES = ("confirm", "explain", "orient", "introduce", "sponsor", "none")


def relational_capability(*, verified: bool, claimed: str | None) -> str:
    """#2313.3 / #2313.4 — la capacité relationnelle d'UNE personne, jamais
    supposée. Sans vérification (#2313.2 pas encore `ready` sur ce point),
    ou sur une valeur hors liste, la capacité reste `none` — même si
    l'utilisateur en réclame une autre : une capacité non vérifiée est une
    INTENTION, jamais un fait sur lequel Laura peut s'appuyer."""
    if not verified or claimed not in RELATIONAL_CAPABILITIES:
        return "none"
    return claimed


def can_introduce(*, capability: str, referrer_confirmed: bool) -> bool:
    """#2313.4 — NE JAMAIS supposer qu'un contact peut introduire juste parce
    qu'il connaît l'entreprise. Vrai seulement si sa capacité a été classée
    `introduce` (ou `sponsor`, qui l'inclut) ET que la personne l'a
    elle-même CONFIRMÉ — jamais déduit du seul type de lien. Même principe
    que `canCiteReferrer` (#2373, warmIntroGovernance.ts), côté IA plutôt que
    sur la fiche Contact."""
    return capability in ("introduce", "sponsor") and referrer_confirmed


# #2313.5 — SÉQUENCE TERRAIN : six étapes, DANS CET ORDRE. Additive (GA-08) :
# un pas ne s'insère jamais au milieu, il s'ajoute à la fin. `propose_intro`
# reste l'AVANT-DERNIÈRE étape — jamais la première geste de Laura sur une
# relation connue (#2313.6, "la première approche ne demande pas d'emblée...").
RELATION_FIRST_SEQUENCE = (
    "resume_or_open",  # 1. Reprendre ou ouvrir la relation.
    "ask_their_context",  # 2. S'intéresser à son contexte.
    "identify_topic_owner",  # 3. Demander qui porte le sujet.
    "understand_buying",  # 4. Comprendre comment l'équipe achète.
    "propose_introduction",  # 5. Demander si une introduction aurait du sens.
    "obtain_authorization",  # 6. Obtenir l'autorisation avant d'utiliser son nom.
)


def next_relation_first_step(done: Iterable[str]) -> str | None:
    """La prochaine étape À FAIRE — la première du parcours qui n'est pas
    encore cochée, jamais la dernière cochée (même règle que
    `nextWarmIntroStep`, #2373.3, warmIntroGovernance.ts)."""
    done_set = done if isinstance(done, set) else set(done)
    for step in RELATION_FIRST_SEQUENCE:
        if step not in done_set:
            return step
    return None


# #2313.6 — la première approche ne demande pas d'emblée une présentation au
# décideur. Liste fermée de tournures qui, dans un premier message, sautent
# directement à la demande — le reste de la phrase peut varier, ce sont ces
# formulations précises qui trahissent le raccourci.
_DIRECT_INTRO_ASK_PATTERNS = (
    "peux-tu me présenter",
    "peux tu me présenter",
    "tu peux me présenter",
    "peux-tu m'introduire",
    "peux tu m'introduire",
    "peux-tu me mettre en relation avec le décideur",
    "peux-tu me mettre en relation avec la décideuse",
)


def first_touch_message_guard(message: str) -> dict[str, Any]:
    """#2313.6 — un premier message qui demande D'EMBLÉE une présentation au
    décideur n'est pas une conversation naturelle, c'est une intrusion.
    Nomme la formulation fautive plutôt que de rendre un simple `False`."""
    text = (message or "").lower()
    hit = next((pattern for pattern in _DIRECT_INTRO_ASK_PATTERNS if pattern in text), None)
    if hit is None:
        return {"allowed": True, "reason": None}
    return {"allowed": False, "reason": f"demande une présentation dès le premier message : « {hit} »"}


def team_network_permission_gate(
    *, owner_user_id: str | None, requester_user_id: str, owner_permission_granted: bool
) -> dict[str, Any]:
    """#2313.7 — RÉSEAU ÉQUIPE. Si la relation appartient à un COLLÈGUE
    (`owner_user_id` différent du demandeur), Laura ne contacte jamais la
    personne sans la permission EXPLICITE de l'owner : elle PROPOSE de le
    solliciter à la place. Aucune écriture ici (module pur, sans I/O) — la
    permission accordée et la sollicitation restent journalisées côté serveur
    par l'appelant, même doctrine que `IntroductionAuthorizationService`
    (#2373.9) : un refus vaut autant qu'un accord, les deux sont une preuve."""
    owned_by_colleague = bool(owner_user_id) and owner_user_id != requester_user_id
    if not owned_by_colleague:
        return {"allowed": True, "requires_owner_permission": False, "propose_soliciting_owner": False}
    return {
        "allowed": owner_permission_granted,
        "requires_owner_permission": True,
        "propose_soliciting_owner": not owner_permission_granted,
    }


# #2313.10 — tournures qui AFFIRMENT une introduction/recommandation déjà
# obtenue. Un message qui les emploie doit pouvoir le prouver (`can_introduce`)
# — sinon c'est exactement le NO-GO : « Laura formule une approche laissant
# croire à une recommandation ou une introduction qui n'a jamais été
# autorisée ».
_INTRO_CLAIM_PATTERNS = (
    "de la part de",
    "sur recommandation de",
    "m'a recommandé de vous contacter",
    "m'a mis en relation avec vous",
)


def no_go_guard(
    *,
    message: str,
    capability: str,
    referrer_confirmed: bool,
    owner_user_id: str | None,
    requester_user_id: str,
    owner_permission_granted: bool,
) -> dict[str, Any]:
    """#2313.10 — NO-GO : le message généré ne doit JAMAIS laisser croire à
    une recommandation ou une introduction qui n'a jamais été autorisée.

    Combine les trois garde-fous du module et NOMME le premier qui bloque —
    jamais un refus muet."""
    text = (message or "").lower()
    claims_intro = any(pattern in text for pattern in _INTRO_CLAIM_PATTERNS)
    if claims_intro and not can_introduce(capability=capability, referrer_confirmed=referrer_confirmed):
        return {"allowed": False, "reason": "le message affirme une introduction jamais autorisée"}

    network = team_network_permission_gate(
        owner_user_id=owner_user_id,
        requester_user_id=requester_user_id,
        owner_permission_granted=owner_permission_granted,
    )
    if not network["allowed"]:
        return {
            "allowed": False,
            "reason": "la relation appartient à un collègue : permission de l'owner requise avant tout contact",
        }

    first_touch = first_touch_message_guard(message)
    if not first_touch["allowed"]:
        return {"allowed": False, "reason": first_touch["reason"]}

    return {"allowed": True, "reason": None}


# #2313.8 — la SEULE raison d'exclusion du classement de contacts
# (`contact-eligibility.ts::filterEligibleContacts`, `ContactEligibilityReason`
# du contrat) qui parle d'un DÉPART : `lifecycle_state === 'historique'`, un
# ex-employé exclu du classement comme contact ACTUEL du compte. Recopiée en
# littéral, jamais réimportée : ce module Python n'a pas de dépendance vers
# `@bellum/contracts` (frontières §3.2), et une seule chaîne à tenir en phase
# est plus sûre qu'un import cross-langage qui n'existe pas.
DEPARTED_CONTACT_EXCLUSION_REASON = "former_employee"

# #2313.9 — les trois choses qu'une personne PARTIE du compte peut encore
# être, jamais un contact ACTUEL de nouveau (LAU-FINAL-054, "CONTACT PARTI").
# Liste FERMÉE et ADDITIVE (GA-08), même règle que les autres énumérations de
# ce module.
DEPARTED_CONTACT_ROLES = ("explain_former_terrain", "open_new_employer", "network_relation")


def departed_contact_reclassification(*, exclusion_reason: str, capability: str) -> dict[str, Any]:
    """#2313.8 / #2313.9 — CONTACT PARTI : reclasser sans jamais rouvrir.

    Avant cette fonction, l'exclusion posée par #2313.8
    (`contact-eligibility.ts`, raison `former_employee`) ne menait nulle
    part : la personne disparaissait du classement et le produit n'offrait
    aucun chemin pour la retrouver comme relation RÉSEAU — exactement le
    manque nommé par LAU-FINAL-054 (« Une personne partie du compte peut :
    expliquer l'ancien terrain ; ouvrir son nouvel employeur ; rester relation
    réseau. Elle n'est plus recommandée comme contact actuel du compte. »).

    `current_contact` vaut TOUJOURS `False` dès que la raison correspond :
    cette fonction ne LÈVE jamais l'exclusion de #2313.8, elle ne fait
    qu'ouvrir un second chemin, à côté. Une raison d'exclusion qui ne parle
    pas d'un départ (`permission_denied`, `entity_mismatch`,
    `homonym_conflict`) ne s'applique pas : rien à reclasser, `applies` vaut
    `False`.

    Les trois rôles ne sortent QUE si la capacité relationnelle (#2313.3) a
    été VÉRIFIÉE — `none` (rien vérifié) n'en ouvre aucun : partir ne crée pas,
    à lui seul, une capacité que rien n'a confirmée. Même doctrine que
    `can_introduce` : jamais supposé du seul fait qu'elle a connu l'entreprise,
    ici du seul fait qu'elle l'a quittée.
    """
    if exclusion_reason != DEPARTED_CONTACT_EXCLUSION_REASON:
        return {"applies": False, "roles": [], "current_contact": None}
    roles = list(DEPARTED_CONTACT_ROLES) if capability != "none" else []
    return {"applies": True, "roles": roles, "current_contact": False}
