"""Sortie de BELLUM-MEETING-NOTES — le compte rendu structuré d'un rendez-vous.

Le §5.3 du rapport besoins le demande deux fois : « transforme mes notes vocales
en compte rendu et next steps », « rédige le mail de remerciement après le
rendez-vous ». Le §7.2 en fait une étape du cycle complet du rendez-vous. La
spec Meeting OS (§ « Après ») en tire NEUF sorties, et pose la condition qui les
rend lisibles : **chaque objet extrait porte l'extrait qui le justifie**.

Chaque liste peut être VIDE, et c'est un état valable. Un compte rendu qui
invente trois décisions parce que le schéma en attend trois est pire qu'un compte
rendu court : il fait porter à quelqu'un un engagement qu'il n'a pas pris.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Evidence(BaseModel):
    """D'où vient ce qui est écrit.

    Sans ce champ, les neuf sorties sont indiscernables d'une hallucination bien
    présentée : c'est lui qui distingue « le client a dit ça » de « le modèle le
    pense ».

    Deux formes, et deux seulement. ``transcript`` cite la phrase telle qu'elle a
    été prononcée ; ``notes-derived`` dit que l'entrée était des notes dictées ou
    tapées, donc qu'il n'y a AUCUNE phrase à citer. Recopier la note en la
    présentant comme une citation serait la troisième forme, et elle n'existe
    pas.
    """

    #: #2319.63 — ``user-statement`` : l'objet vient de la DÉCLARATION du
    #: commercial, saisie à part des notes — ce qu'il affirme, pas ce que le
    #: client a dit.
    kind: Literal["transcript", "notes-derived", "user-statement"] = "notes-derived"
    #: La phrase, telle quelle. Vide quand ``kind`` vaut ``notes-derived`` —
    #: c'est le seul cas où elle a le droit de l'être.
    excerpt: str = ""


class NextStep(BaseModel):
    """Une action à faire, telle qu'elle a été DITE en réunion."""

    action: str = ""
    #: Qui s'en charge. Vide quand la réunion ne l'a pas dit — jamais deviné.
    owner: str = ""
    #: Échéance telle qu'elle a été énoncée (« vendredi », « fin de mois »).
    #: Vide plutôt qu'une date fabriquée : « je m'en occupe » n'a pas d'échéance.
    due: str = ""
    evidence: Evidence = Field(default_factory=Evidence)


class Opportunity(BaseModel):
    """Sortie 2 — une opportunité candidate. BROUILLON jusqu'au GO."""

    title: str = ""
    #: Le compte, quand la réunion l'a nommé. Vide sinon.
    account_name: str = ""
    #: #2319.82 — « Projet à qualifier » tant que la preuve est insuffisante.
    qualification: Literal["confirmed", "to_qualify"] = "to_qualify"
    evidence: Evidence = Field(default_factory=Evidence)


class Need(BaseModel):
    """Sortie 3 — un besoin exprimé. Il passe par un GO/NO-GO."""

    title: str = ""
    #: Profil, compétences, volume — tels qu'énoncés. Vide plutôt qu'inventé.
    detail: str = ""
    #: #2319.82 — « Besoin potentiel » tant que le client ne l'a pas exprimé.
    qualification: Literal["expressed", "potential"] = "potential"
    evidence: Evidence = Field(default_factory=Evidence)


class ClientIssue(BaseModel):
    """#2103.10 (épopée #2878) — un PROBLÈME décrit par le client, DISTINCT d'un
    besoin de staffing (``need``). Le client peut décrire une difficulté
    opérationnelle, organisationnelle ou technique sans qu'aucun besoin de
    prestataire externe n'ait été énoncé — les deux sorties coexistent, l'une
    n'implique pas l'autre."""

    title: str = ""
    #: Contexte ou impact du problème, tel qu'énoncé. Vide plutôt qu'inventé.
    detail: str = ""
    evidence: Evidence = Field(default_factory=Evidence)


class MentionedContact(BaseModel):
    """Sortie 4 — une personne CITÉE pendant le rendez-vous.

    Cette liste rapporte qui a été nommé ; elle n'ordonne personne. Le rôle est
    celui qui a été dit, vide sinon.
    """

    full_name: str = ""
    role: str = ""
    evidence: Evidence = Field(default_factory=Evidence)


class CrmStage(BaseModel):
    """Sortie 7 — le stade CRM PROPOSÉ. Rien n'est déplacé sans le GO."""

    proposed_stage: str = ""
    rationale: str = ""
    evidence: Evidence = Field(default_factory=Evidence)


class Reminder(BaseModel):
    """Sortie 8 — la relance, en brouillon planifié.

    ``due_label`` est l'échéance CONVENUE (« dans dix jours », « après leur
    comité »). Vide quand la réunion ne l'a pas dite : on ne fabrique pas un
    « J+10 » pour remplir la carte.
    """

    content: str = ""
    due_label: str = ""
    evidence: Evidence = Field(default_factory=Evidence)


class Learning(BaseModel):
    """Sortie 9 — une objection entendue, ou un engagement pris."""

    kind: Literal["objection", "commitment"] = "objection"
    content: str = ""
    evidence: Evidence = Field(default_factory=Evidence)


class ExtractedItem(BaseModel):
    """#2319.64-.74 — un fait, une demande, un critère ou un engagement, extrait
    SÉPARÉMENT et avec sa source."""

    content: str = ""
    evidence: Evidence = Field(default_factory=Evidence)


class DateItem(BaseModel):
    """#2319.71 — une date citée. ``when`` est l'échéance TELLE QU'ÉNONCÉE."""

    label: str = ""
    when: str = ""
    evidence: Evidence = Field(default_factory=Evidence)


class MeetingNotesOutput(BaseModel):
    """Les neuf sorties, dérivées UNIQUEMENT des notes fournies."""

    # ── Les six champs d'origine, inchangés ──────────────────────────────────
    #: Trois à six phrases. Ce qui s'est dit, pas ce qu'on aurait aimé entendre.
    summary: str = ""
    #: Points tranchés pendant la réunion.
    decisions: list[str] = Field(default_factory=list)
    next_steps: list[NextStep] = Field(default_factory=list)
    #: Questions restées sans réponse — la matière du prochain échange.
    open_questions: list[str] = Field(default_factory=list)
    #: Besoins ou signaux commerciaux entendus, cités tels quels.
    signals: list[str] = Field(default_factory=list)
    #: Brouillon du message de suivi. Vide si les notes ne portent rien à dire.
    follow_up_email: str = ""

    # ── La partie APRÈS ──────────────────────────────────────────────────────
    #: `None` quand rien de tel n'a été entendu. Une opportunité inventée coûte
    #: plus cher qu'une opportunité manquée : elle entre au pipeline.
    opportunity: Opportunity | None = None
    need: Need | None = None
    #: #2103.10 — distinct de `need` : un problème client n'est pas un besoin
    #: de staffing. `None` quand aucune difficulté n'a été décrite.
    client_issue: ClientIssue | None = None
    mentioned_contacts: list[MentionedContact] = Field(default_factory=list)
    crm_stage: CrmStage | None = None
    reminder: Reminder | None = None
    learnings: list[Learning] = Field(default_factory=list)

    # ── #2319.64-.74 — les extractions SÉPARÉES ───────────────────────────────
    # ⚠️ Aucun champ ``budget`` ni ``mission`` (#2319.79 / .81) : un montant
    # n'existe ici que CITÉ, dans ``criteria`` ; une mission ne se crée pas
    # depuis un compte rendu.
    facts: list[ExtractedItem] = Field(default_factory=list)
    requests: list[ExtractedItem] = Field(default_factory=list)
    criteria: list[ExtractedItem] = Field(default_factory=list)
    dates: list[DateItem] = Field(default_factory=list)
    client_commitments: list[ExtractedItem] = Field(default_factory=list)
    user_commitments: list[ExtractedItem] = Field(default_factory=list)

    #: L'extrait qui justifie le compte rendu lui-même, et celui du mail.
    recap_evidence: Evidence | None = None
    follow_up_evidence: Evidence | None = None
