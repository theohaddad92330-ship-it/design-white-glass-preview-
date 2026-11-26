"""#2259.4 / #2259.6 / #2259.11 / #2259.13 / #2259.30-.35 — IDENTITÉ ET ENTOURAGE DE LA PERSONNE.

Bloc NEUF, PAS un ajout dans ``bellum_advisor.py`` (édité par un autre lot,
LAU-CORE1, au moment où ce module est écrit) : injecté par concaténation
depuis ``chat.py``, via ``append_before_language_reminder`` déjà exporté par
``bellum_advisor.py`` — le même mécanisme que ``scope_object_block`` et
``current_time_block`` juste à côté.

Cinq faits, chacun lu côté API dans le profil ou l'espace EXISTANTS, jamais
deviné (LAU-FINAL-004, #2259) :
 - le nom de famille (``profiles.last_name``) ;
 - la fonction dans l'espace (le rôle RBAC — ``sales``/``sales_ops``/
   ``tech_admin``/... —, le seul signal RÉEL de « fonction commerciale »,
   #2259.13 : il n'existe pas de champ « fonction » distinct du rôle) ;
 - la qualité de propriétaire du COMPTE Bellum (``role == 'owner'``, #2259.4) —
   jamais promue en « dirigeant de l'ESN » (#2259.5) : ce titre n'a pas
   d'équivalent dans le schéma, l'inventer serait deviner ;
 - un collègue de l'espace CITÉ dans le message (#2259.6), résolu par le même
   rapprochement nom-dans-message que les contacts (``contactsNamedIn`` côté
   API) — jamais confondu avec un contact externe ;
 - la ou les BU que la personne PORTE (#2259.30 / #2259.32 / #2259.33 /
   #2259.34 / #2259.35, DÉCISION Louis 17/09 après-midi) : territoire,
   spécialités, capacité et objectif du trimestre (« non renseigné » tant que
   les colonnes du lot CP2 n'existent pas sur cette base), et le nombre de
   comptes / consultants / références rattachés — un COMPTE, jamais une
   liste. C'est un CONTEXTE pour prioriser et formuler, jamais un FILTRE :
   rien de ce qui est hors BU ne disparaît ailleurs dans le produit.

⚠️ Chaque ligne n'apparaît QUE si la donnée existe : absent = pas de ligne,
jamais une valeur inventée ni un « inconnu » bruyant sur un tour qui n'a besoin
d'aucune de ces lignes — même contrat que le bloc ``first_name`` voisin. Vide
des cinq champs ⇒ chaîne vide ⇒ prompt byte-identique.
"""

from __future__ import annotations

_HEADER = "IDENTITÉ ET ENTOURAGE CONNUS (jamais inventé, seulement ce que l'espace porte) :\n"

# Rôles RBAC (`@bellum/contracts` `WorkspaceRole`) rendus en clair pour le
# modèle. Une valeur non listée ici (rôle futur) s'affiche TELLE QUELLE plutôt
# que de disparaître — jamais un rôle réel rendu invisible par une liste
# incomplète.
_ROLE_LABELS = {
    "owner": "propriétaire du compte",
    "admin": "administrateur",
    "sales_ops": "sales ops",
    "sales": "commercial",
    "tech_admin": "administrateur technique",
    "member": "membre",
    "viewer": "lecteur",
}


def _bu_field(value: object) -> str:
    """Un champ déclaré, ou ``"non renseigné"`` — jamais ``0``, jamais deviné."""
    text = str(value).strip() if isinstance(value, str) else ""
    return text if text else "non renseigné"


def _bu_specialties(values: object) -> str:
    if not isinstance(values, list):
        return "non renseigné"
    cleaned = [v.strip() for v in values if isinstance(v, str) and v.strip()]
    return ", ".join(cleaned) if cleaned else "non renseigné"


def _bu_count(value: object) -> str:
    """Un compte RÉEL (ex. comptes rattachés) s'affiche tel quel, ``0`` compris
    — une BU peut réellement n'avoir aucun compte, c'est une mesure, pas une
    absence. ``None`` = aucun rattachement mesurable dans le schéma actuel
    (#2259.33 / #2259.34 : consultants et références n'ont aucune colonne de
    BU) — jamais confondu avec ``0``."""
    return str(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else "non renseigné"


def _bu_team_size(value: object) -> str:
    """#3384.1 — l'effectif DÉCLARÉ de l'équipe commerciale de la BU, ou ``""``.

    Un entier ≥ 0 : la colonne est nullable, donc 0 est une déclaration et ``None``
    une absence. Absent ⇒ aucune ligne (jamais « non renseigné » : on n'affiche
    pas ce qu'on n'a pas)."""
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return ""
    return f" ; effectif de l'équipe commerciale : {value}"


def identity_context_block(
    last_name: str = "",
    workspace_role: str = "",
    is_account_owner: bool = False,
    mentioned_colleague: str = "",
    # #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — DÉCISION Louis
    # 17/09 après-midi : la ou les BU que la personne PORTE (`perimetersOf`),
    # avec ce que l'espace en sait. C'est un CONTEXTE pour prioriser et
    # formuler — il ne filtre RIEN de ce que Laura voit ailleurs. Propriétaire
    # sans BU (`perimetersOf` rend `[]`) : `None`/`[]` ⇒ rien n'est dit.
    business_units: list[dict] | None = None,
) -> str:
    """Le bloc à ajouter au prompt système, ou ``""`` quand rien n'est connu."""
    lines: list[str] = []

    last_name = (last_name or "").strip()
    if last_name:
        lines.append(f"- Nom de famille : {last_name}")

    workspace_role = (workspace_role or "").strip()
    if workspace_role:
        role_label = _ROLE_LABELS.get(workspace_role, workspace_role)
        lines.append(f"- Fonction dans l'espace : {role_label}")

    if is_account_owner:
        # #2259.4 — nommé pour ce qu'il EST (propriétaire du compte Bellum),
        # jamais pour ce qu'on suppose (dirigeant de l'ESN, #2259.5).
        lines.append(
            "- C'est la personne propriétaire de ce compte Bellum "
            "(rôle d'espace « owner ») — cela ne dit pas qu'elle dirige l'ESN."
        )

    mentioned_colleague = (mentioned_colleague or "").strip()
    if mentioned_colleague:
        lines.append(f"- Elle vient de citer {mentioned_colleague}, un COLLÈGUE de son espace (pas un contact externe).")

    # #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35
    valid_units = [bu for bu in (business_units or []) if isinstance(bu, dict) and str(bu.get("name") or "").strip()]
    if valid_units:
        lines.append(
            "- Son périmètre de travail (BU) — sers-t'en pour PRIORISER et FORMULER tes réponses, "
            "jamais pour cacher un compte, un consultant ou une référence hors de ce périmètre :"
        )
        for bu in valid_units:
            name = str(bu.get("name")).strip()
            lines.append(
                f"  · {name} — territoire : {_bu_field(bu.get('territory'))} ; "
                f"spécialités : {_bu_specialties(bu.get('specialties'))} ; "
                f"capacité : {_bu_field(bu.get('capacity'))} ; "
                f"objectif du trimestre : {_bu_field(bu.get('quarter_objective'))} ; "
                f"comptes rattachés : {_bu_count(bu.get('account_count'))} ; "
                f"consultants rattachés : {_bu_count(bu.get('consultant_count'))} ; "
                f"références rattachées : {_bu_count(bu.get('reference_count'))}"
                # #3384.1 — la couche BU (équipe commerciale + vivier), valeurs déclarées seulement.
                f"{_bu_team_size(bu.get('team_size'))}."
            )

    if not lines:
        return ""
    return "\n\n" + _HEADER + "\n".join(lines)
