"""#3921 — ouvertures d'établissement, détectées entre deux relevés Sirene.

`insee_sirene.etablissements_by_siren` rend l'état COURANT d'un SIREN ; rien
ne compare deux relevés dans le temps pour en tirer un événement daté. Cette
fonction est la primitive pure qui fait ce diff — elle ne fait aucun appel
réseau, et c'est à l'appelant (#3921.a : `POST /public-registry/sirene`, appelé chaque
matin par le job `registry` de la veille API) de lui
fournir le relevé d'hier et celui d'aujourd'hui.

⚠️ Sans relevé antérieur, rien n'est comparable : `previous` vide rend `[]`,
jamais la liste courante entière prise pour des ouvertures du jour.
"""

from __future__ import annotations

from app.services.insee_sirene import InseeEtablissement


def new_establishments(
    previous: list[InseeEtablissement],
    current: list[InseeEtablissement],
) -> list[dict]:
    """Les établissements ACTIFS de ``current`` absents de ``previous`` (par SIRET).

    La date du signal est celle que Sirene porte sur la période
    (``period_start_date``) — jamais la date de CE calcul : un établissement
    ouvert depuis six mois mais jamais encore relevé n'est pas « ouvert
    aujourd'hui ». Sans cette date, le fait ne peut pas être daté : on ne
    rend rien plutôt que d'inventer un jour.
    """
    if not previous:
        return []
    known_sirets = {e.siret for e in previous}
    out: list[dict] = []
    for etab in current:
        if etab.siret in known_sirets or not etab.is_active or not etab.period_start_date:
            continue
        out.append(
            {
                "type": "nouvel établissement",
                "siret": etab.siret,
                "date": etab.period_start_date,
                "label": f"Nouvel établissement — {etab.city}" if etab.city else "Nouvel établissement",
                # Sirene ne publie aucun lien par établissement — rien à inventer ;
                # #3922 veut que ce soit DIT, pas une absence muette.
                "url": None,
            }
        )
    return out
