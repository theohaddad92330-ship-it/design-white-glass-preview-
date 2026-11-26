"""#3213 (LAU-FINAL-219, §RELATION PERSONNE ↔ ENTREPRISE) — le vocabulaire de
LA NATURE d'un lien entre une personne et une entreprise, et la garde qui va
avec.

## Ce que ce module N'EST PAS

Ce n'est pas un classifieur qui devine « salarié » ou « consultant » depuis un
``employmentHistory`` Apollo. Apollo (comme SalesQL) ne porte QUE
``title`` / ``organization`` / ``current`` — jamais la nature contractuelle du
lien. #219.5/#219.9 de l'issue le disent explicitement : « Cette personne a
travaillé chez Société Générale » ne permet pas de savoir si elle y était
salariée, consultante, en mission via une ESN tierce, ou simplement présentée
comme telle sur une slide commerciale. Rapprocher `employee_current` d'un
``current: true`` serait inventer une donnée que la source ne porte pas — ce
que la doctrine interdit (« Jamais de donnée fictive »).

``classify_person_company_relation`` reflète donc cette limite au lieu de la
cacher : SANS signal déclaré explicitement (une correction humaine, une donnée
CRM qui le dit), la relation reste `unknown_relationship` — c'est la garde
elle-même, pas un défaut provisoire à lever plus tard. Le vocabulaire existe
pour que le jour où une source apporte la vraie preuve (déclaration du
commercial, champ CRM dédié), elle ait un nom où atterrir — au lieu d'inventer
sur les données actuelles.

Appelant réel : `zero_layer._reverse_section` (prospection inversée), qui
cite désormais explicitement cette inconnue dans le bloc de prompt plutôt que
de laisser le modèle en tirer un rôle ou une mission — c'est le NO-GO exact de
#219.9 (« Laura dit "vos consultants chez SG" ») que ce bloc empêche.
"""

from __future__ import annotations

from enum import StrEnum


class PersonCompanyRelation(StrEnum):
    """Les treize valeurs de #219.2, telles que l'issue les nomme."""

    EMPLOYEE_CURRENT = "employee_current"
    EMPLOYEE_FORMER = "employee_former"
    CONTRACTOR_CURRENT = "contractor_current"
    CONTRACTOR_HISTORICAL = "contractor_historical"
    FREELANCER = "freelancer"
    MANAGER = "manager"
    BUYER = "buyer"
    TECHNICAL_REVIEWER = "technical_reviewer"
    SPONSOR = "sponsor"
    USER = "user"
    RECRUITER = "recruiter"
    CONSULTANT_PRESENTED = "consultant_presented"
    #: Le défaut — et le seul résultat honnête sans preuve déclarée.
    UNKNOWN_RELATIONSHIP = "unknown_relationship"


PERSON_COMPANY_RELATION_VALUES: tuple[str, ...] = tuple(member.value for member in PersonCompanyRelation)

_BY_VALUE: dict[str, PersonCompanyRelation] = {member.value: member for member in PersonCompanyRelation}


def classify_person_company_relation(*, declared_relation: str | None = None) -> PersonCompanyRelation:
    """La relation, si — et SEULEMENT si — une preuve déclarée la nomme.

    `declared_relation` est une valeur DÉJÀ affirmée par un humain ou une
    source qui fait autorité (correction du commercial, champ CRM dédié) —
    jamais un intitulé de poste ou un `employmentHistory` brut, qui ne
    permettent de conclure sur rien de cette liste. Une valeur qui ne
    correspond à aucun des treize noms retombe sur `unknown_relationship`
    plutôt que d'être rapprochée par ressemblance : deviner « manager » parce
    que le texte contient « responsable » inventerait une preuve.
    """
    if declared_relation is not None:
        candidate = declared_relation.strip().lower()
        if candidate in _BY_VALUE:
            return _BY_VALUE[candidate]
    return PersonCompanyRelation.UNKNOWN_RELATIONSHIP
