"""Sortie de BELLUM-ORG-DECLARE — un organigramme décrit en toutes lettres,
transformé en lignes exploitables.

#1103 : « soit pouvoir décrire des éléments et ensuite ça intègre ».

Le risque de cette route n'est pas de rendre trop peu, c'est de rendre une
personne que le texte ne nomme pas. Un organigramme est ce sur quoi un
commercial construit son approche : une personne inventée envoie quelqu'un
préparer un message pour un interlocuteur qui n'existe pas. Le schéma est donc
volontairement pauvre — pas de niveau hiérarchique, pas de rôle de décision,
rien qui se DÉDUIRAIT. Ce qui n'est pas écrit reste vide.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class DeclaredPerson(BaseModel):
    """Une personne, telle que le texte la nomme."""

    #: Le nom, RECOPIÉ du texte. C'est cette recopie que la garde côté API
    #: vérifie : une personne dont le nom n'apparaît pas dans le texte source
    #: est retirée, quoi qu'en dise le modèle.
    full_name: str = ""
    #: Fonction telle qu'écrite. Vide si le texte ne la donne pas.
    title: str = ""
    #: Direction / entité telle qu'écrite. Vide si le texte ne la donne pas.
    entity_name: str = ""
    #: Le N+1, uniquement si le texte l'énonce. Jamais déduit d'un ordre
    #: d'apparition ni d'une hiérarchie de titres : « DSI » puis « DG » dans une
    #: phrase ne dit pas qui rapporte à qui.
    manager_name: str = ""


class OrgDeclareOutput(BaseModel):
    """Les personnes que le texte NOMME. Liste vide = réponse acceptable."""

    people: list[DeclaredPerson] = Field(default_factory=list)
