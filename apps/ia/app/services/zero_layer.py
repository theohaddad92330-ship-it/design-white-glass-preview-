"""Couche zéro — historique CRM & prospection inversée (Annexe Méthodologie
Sales ESN p7-p9, Théo 2026-07-21 ; trou D16 de ``agent_docs/methodo-sales-esn-plan.md``).

La règle de l'annexe (p8) : « Bellum doit toujours chercher ce qui EXISTE avant
de proposer du froid ». Le plan recommandait pourtant une approche froide sur un
compte où l'ESN a déjà un historique — parce que la présence CRM ne quittait
jamais le chatbot, et parce que ``reverseProspects`` (les ex-collaborateurs de la
cible, canal d'acquisition n°3 p7) était calculé puis jeté.

Ce module rend le BLOC de prompt correspondant. Même contrat que
``account_feedback.feedback_directives_block`` :

* aucune donnée (pas de CRM connecté, aucun match, aucun ex-collaborateur) →
  ``""`` : le prompt appelant reste **byte-identique** à avant la feature ;
* donnée présente → un bloc ADDITIF qui CITE les faits tels quels (jamais
  réinterprétés, JAMAIS inventés) et impose la discipline « historique d'abord ».

Le texte CRM est déjà rendu et borné côté API (``formatCrmPresence``) ; on
re-cape ici par défense en profondeur (un appelant non-API pourrait envoyer
n'importe quoi dans un prompt Claude).
"""

from __future__ import annotations

from typing import Any

from app.services.person_company_relation import classify_person_company_relation

# Cap dur sur le résumé CRM injecté — il est cité dans un prompt Claude.
_CRM_MAX_CHARS = 2000
# Nombre d'ex-collaborateurs cités. Au-delà ce n'est plus un angle, c'est une liste.
_REVERSE_MAX = 8


def _text(value: Any) -> str:
    """Chaîne nettoyée, ou ``""`` — jamais un ``None`` interpolé dans un prompt."""
    return str(value).strip() if isinstance(value, str) else ""


def has_crm_history(crm_presence: str | None) -> bool:
    """Ce compte est-il DÉJÀ connu du CRM de l'ESN ?

    L'API ne renseigne ``crm_presence`` qu'en cas de match RÉEL (au moins un
    contact ou un deal ouvert chez ce groupe) : « CRM consulté, rien trouvé » y
    arrive comme chaîne vide. Sa présence vaut donc le booléen — c'est ce qui
    autorise ``classify_relationship_state`` à sortir un compte du « froid ».
    Aucun CRM connecté (cas par défaut) → ``False``, relation inchangée.

    ⚠️ Asymétrie DÉLIBÉRÉE avec ``internal_history`` : les traces internes (Drive,
    notes, e-mails, ATS) ne passent PAS par ici et ne sortent donc jamais un
    compte du « froid ». Un match CRM est une relation enregistrée ; un document
    nommé « ACME » peut être une note de prospection écrite hier — c'est-à-dire
    exactement un compte froid. Faire basculer l'état de relation là-dessus
    ferait sauter l'approche froide sur des comptes qui n'ont jamais répondu.
    Les traces enrichissent le PROMPT (« va demander en interne ») sans toucher
    au SalesContext.
    """
    return bool(_text(crm_presence))


def summarize_reverse_prospects(contacts: list[Any] | None, limit: int = _REVERSE_MAX) -> list[dict[str, Any]]:
    """Forme compacte et persistable des ex-collaborateurs de la cible.

    Entrée = la sortie de ``reverse_prospecting.find_reverse_prospects`` (des
    seeds phase 2 complets, ``apolloDetails`` inclus). On n'en garde que
    l'identité utile au commercial : qui, quel poste, où il est AUJOURD'HUI
    (c'est là qu'on l'appelle), et le lien LinkedIn pour le joindre.

    Rien n'est inventé : un champ absent chez Apollo reste absent. Une entrée
    sans nom est ignorée (elle ne serait pas actionnable).
    """
    out: list[dict[str, Any]] = []
    for contact in contacts or []:
        if not isinstance(contact, dict):
            continue
        full_name = _text(contact.get("fullName") or contact.get("full_name"))
        if not full_name:
            continue
        details = contact.get("apolloDetails") or contact.get("apollo_details") or {}
        details = details if isinstance(details, dict) else {}
        row: dict[str, Any] = {"fullName": full_name}
        title = _text(contact.get("title")) or _text(details.get("headline"))
        if title:
            row["title"] = title
        # ``currentCompany`` d'abord : la fonction est ainsi IDEMPOTENTE sur sa
        # propre sortie — un « changer de stratégie » repasse la liste déjà
        # résumée (relue depuis le dossier) sans en perdre l'employeur actuel.
        current = (
            _text(contact.get("currentCompany")) or _text(contact.get("entity")) or _text(details.get("organization"))
        )
        if current:
            row["currentCompany"] = current
        linkedin = _text(contact.get("linkedinUrl") or contact.get("linkedin_url"))
        if linkedin:
            row["linkedinUrl"] = linkedin
        out.append(row)
        if len(out) >= max(0, limit):
            break
    return out


def _crm_section(crm_presence: str | None) -> str:
    text = _text(crm_presence)[:_CRM_MAX_CHARS]
    if not text:
        return ""
    return (
        "HISTORIQUE CRM (relevé RÉEL dans le CRM connecté de l'ESN, cité tel quel) :\n"
        + text
        + "\nCe compte n'est donc PAS un compte froid : quelqu'un le connaît déjà. "
        "Avant toute prise de contact à froid, réponds aux questions de la couche zéro — "
        "qui connaît le compte ? sur quel besoin ? quel décideur ? quelle issue ? — puis "
        "privilégie les actions de réactivation : relancer l'interlocuteur connu, demander "
        "une intro interne, réutiliser une preuve déjà envoyée, mettre à jour la fiche "
        "contact, exclure les doublons. Une séquence 100 % froide sur ce compte est une erreur."
    )


def _reverse_section(reverse_prospects: list[dict[str, Any]]) -> str:
    if not reverse_prospects:
        return ""
    lines = []
    for row in reverse_prospects:
        bits = [row["fullName"]]
        if row.get("title"):
            bits.append(str(row["title"]))
        if row.get("currentCompany"):
            bits.append(f"aujourd'hui chez {row['currentCompany']}")
        lines.append("- " + " — ".join(bits))
    # #219.5/#219.9 (LAU-FINAL-219) — Apollo ne porte QUE title/organization/
    # current, jamais la nature du lien (salarié, consultant, freelance…) :
    # `classify_person_company_relation()` sans preuve déclarée rend
    # `unknown_relationship`, et c'est CETTE inconnue qu'on cite au modèle —
    # le NO-GO exact de l'issue est « vos consultants chez SG » affirmé sur un
    # simple passage détecté.
    unknown_relation = classify_person_company_relation().value
    return (
        "PROSPECTION INVERSÉE — ex-collaborateurs de la cible (détectés sur leur "
        "historique de poste de l'annuaire professionnel, passage PASSÉ chez la cible) :\n"
        + "\n".join(lines)
        + "\nCe sont des relais CHAUDS : ils connaissent la gouvernance, les BU, les technos "
        "et les pièges du groupe. Exploite-les comme porte d'entrée (qui connaissent-ils "
        "encore ? quelle BU ? pourquoi sont-ils partis ?) plutôt que de repartir d'un "
        "cold call. Ne leur invente ni un rôle ni une disponibilité. "
        f"Leur relation exacte avec la cible reste `{unknown_relation}` — l'annuaire ne dit pas s'ils y "
        "étaient salariés, consultants ou freelances : dis « ex-collaborateur » ou « a été rattaché "
        "à » ; ne les qualifie ni de vos consultants, ni de vos anciens salariés, tant que rien ne le "
        "confirme."
    )


def _internal_section(internal_history: str | None) -> str:
    """Traces des outils internes HORS CRM (p8 : ATS, Drive, e-mails, notes, CV
    envoyés).

    Le texte est déjà mis en forme et borné côté API (``ZeroLayerService``) ; on
    re-cape ici par défense en profondeur, comme pour le CRM.

    La consigne est délibérément plus prudente que celle du CRM : une trace
    interne établit qu'on a TOUCHÉ le compte, pas qu'on a une relation. Un
    document nommé « ACME » peut être une proposition perdue il y a trois ans.
    On demande donc de s'en servir pour aller CHERCHER l'information auprès des
    collègues — jamais d'en déduire une relation qui n'est pas prouvée.
    """
    text = _text(internal_history)[:_CRM_MAX_CHARS]
    if not text:
        return ""
    return (
        "TRACES INTERNES (relevé RÉEL dans les outils de l'ESN — ATS, documents, "
        "notes, e-mails ; cité tel quel) :\n"
        + text
        + "\nQuelqu'un dans l'entreprise a donc DÉJÀ touché ce compte. Avant de proposer "
        "une approche froide, pose la question en interne : qui a produit ce document, "
        "qui a eu cet échange, qu'en est-il sorti ? Ces traces disent qu'un contact a "
        "existé — elles ne disent NI qu'une relation est en cours, NI qu'elle s'est bien "
        "passée. N'en déduis aucun historique commercial qui ne serait pas écrit "
        "ci-dessus, et n'invente ni interlocuteur ni issue."
    )


def zero_layer_block(
    crm_presence: str | None = None,
    reverse_prospects: list[dict[str, Any]] | None = None,
    internal_history: str | None = None,
) -> str:
    """Bloc « couche zéro » pour un prompt système, ou ``""`` sans aucune donnée.

    Les trois sections sont indépendantes : un compte peut avoir un historique CRM
    sans ex-collaborateur, une trace Drive sans CRM connecté, etc. Sans aucune des
    trois (cas par défaut — aucune intégration connectée, pool de contacts sans
    passé chez la cible), le retour est vide et le prompt appelant est
    byte-identique.
    """
    sections = [
        s
        for s in (
            _crm_section(crm_presence),
            _internal_section(internal_history),
            _reverse_section(reverse_prospects or []),
        )
        if s
    ]
    if not sections:
        return ""
    return (
        "\n\n===== COUCHE ZÉRO — HISTORIQUE & RELAIS EXISTANTS (à exploiter AVANT toute approche froide) =====\n"
        + "\n\n".join(sections)
    )
