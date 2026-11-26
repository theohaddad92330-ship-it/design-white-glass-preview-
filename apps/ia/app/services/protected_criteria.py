"""Les critères protégés ne franchissent pas la porte d'un classement de PERSONNES.

Le tri, le classement et l'évaluation de personnes relèvent de l'annexe III de
l'EU AI Act, et le droit des données personnelles s'y applique de toute façon,
sans condition de date. La règle qui en découle tient en une phrase : **l'âge, le
genre, l'origine, la nationalité, la photo, la situation familiale et l'adresse
d'une personne ne pèsent jamais dans son rang.**

Côté API (TypeScript), `apps/api/src/architecture/protected-criteria.spec.ts`
(GA-06) l'interdit dans les moteurs de sélection. Ce module est l'autre moitié :
le service IA ne calcule pas seulement des rangs en Python, il **parle à un
modèle** — et un champ n'a pas besoin d'être multiplié par un poids pour peser
dans un classement, il suffit qu'il soit dans le prompt qui note. C'est le point
qu'une garde sur le seul code de calcul ne peut pas voir.

CE QUI EST INTERDIT DANS UNE CHARGE UTILE DE NOTATION — `PROTECTED_CRITERIA`
La liste est FERMÉE et écrite dans les deux graphies qui traversent réellement le
dépôt (colonne SQL en `snake_case`, champ de fil en `camelCase`).

CE QUI N'EST PAS INTERDIT, ET POURQUOI — la garde qui interdit trop est ignorée
en une semaine, donc les exceptions sont NOMMÉES ici plutôt que découvertes :

* **`fullName` reste.** Le livrable NOMME la personne : le prompt enrichit un
  contact identifié, et la réponse du modèle se recolle à sa graine par le nom
  (`_reattach_apollo_keys`). L'interdit de `full_name` vaut pour un noyau qui
  calcule un rang SANS avoir besoin de savoir qui est là — c'est exactement ce
  que fait le pendant TypeScript, où `MatchCandidate` ne porte pas d'identité.
  Prétendre l'interdire ici serait une garde qu'on désarmerait au premier run.
* **`city` / `country` restent.** La source (PDF 9 §6.2) interdit l'adresse
  « au-delà du code postal » : une zone de mobilité est un critère légitime, le
  domicile de quelqu'un ne l'est pas. `city` / `country` désignent le site de
  travail, une granularité plus grossière que le code postal. `address` reste
  interdite.

Le module est PUR : aucune base, aucun réseau, aucune mutation de l'entrée. Il
rend des copies, parce que la graine de la phase 2 continue, elle, de porter la
photo — l'afficher sur une fiche est légitime, s'en servir pour ordonner des gens
ne l'est pas. Séparer les deux est tout l'objet de ce fichier.
"""

from __future__ import annotations

import re

from typing import Any

#: Les critères protégés, dans les graphies qui traversent réellement le code.
#: Fermée à dessein : une garde ne devine pas, elle nomme. `birth_date`,
#: `gender`, `marital_status`, `ethnicity` et `religion` n'existent nulle part
#: dans le dépôt — ils sont ici en verrou, posés AVANT que le cas ne se présente,
#: parce qu'après ça s'appelle un incident.
PROTECTED_CRITERIA: frozenset[str] = frozenset(
    {
        "birth_date",
        "birthDate",
        "date_of_birth",
        "dateOfBirth",
        "gender",
        "nationality",
        "nationalite",
        "photo_url",
        "photoUrl",
        "marital_status",
        "maritalStatus",
        "ethnicity",
        "religion",
        # L'adresse postale — pas la ville ni le pays, voir le docstring.
        "address",
    }
)


def strip_protected_criteria(value: Any) -> Any:
    """Rendre une COPIE de ``value`` sans aucune clé de :data:`PROTECTED_CRITERIA`.

    Récursif : une charge utile de contact porte des sous-objets (``apolloDetails``
    et son ``employmentHistory``, qui recopient du brut fournisseur). Un interdit
    qui ne descend que d'un niveau laisse passer le niveau suivant.

    L'entrée n'est JAMAIS mutée — la graine de la phase 2 garde sa photo pour la
    fiche du contact ; c'est le seul chemin de notation qui la perd.
    """
    if isinstance(value, dict):
        return {
            key: strip_protected_criteria(item)
            for key, item in value.items()
            if key not in PROTECTED_CRITERIA
        }
    if isinstance(value, list):
        return [strip_protected_criteria(item) for item in value]
    return value

#: Les mots d'une SAISIE LIBRE qui nomment un critère protégé (âge, genre, origine, photo,
#: adresse, religion). Le vocabulaire vit ICI, et nulle part ailleurs : un fichier qui CALCULE
#: un rang de personne ne doit pas même le nommer (garde `test_protected_criteria_scoring`).
_NAMED_IN_FREE_TEXT = re.compile(
    r"\b(\d+\s*ans?|age|ages|femmes?|hommes?|genre|sexe|origine|nationalite|ethnie|photo|adresse|domicile|religion)\b"
)


def names_a_protected_criterion(folded: str) -> bool:
    """`True` si une saisie libre DÉJÀ repliée (sans accents, en minuscules) nomme un critère protégé.

    Appelée par les chemins qui lisent une saisie d'utilisateur — un intitulé de poste cherché, par
    exemple : la saisie est alors écartée, jamais appliquée, et ne devient donc pas filtrable.
    L'appelant replie son texte lui-même ; cette fonction ne décide que du vocabulaire.
    """
    return bool(_NAMED_IN_FREE_TEXT.search(folded or ""))
