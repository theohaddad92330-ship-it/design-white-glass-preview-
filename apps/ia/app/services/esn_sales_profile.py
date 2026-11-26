"""Le profil commercial de l'ESN — trois valeurs, déduites (tome 3, partie C).

« Un score universel est un score faux. » Le même compte ne vaut pas la même
chose pour une ESN de deux personnes qui cherche du cash sous soixante jours et
pour une ESN de cent qui cherche de la profondeur. Le tome décrit huit profils ;
la décision D87 en retient **trois**, et la raison tient en une ligne : huit
profils × huit axes font soixante-quatre valeurs à calibrer sans une seule
donnée d'usage, c'est-à-dire soixante-quatre inventions.

Les trois couvrent les trois extrêmes du tome — l'accessibilité pure, le fit
pur, la profondeur pure — et les cinq autres s'interpolent entre eux le jour où
des utilisateurs réels permettront de les valider.

⚠️ Ce module NE repondère PAS le barème de Découvrir (décision T3-C) : les huit
axes du tome ne sont pas les huit blocs du barème, et rebaser invaliderait tous
les scores déjà calculés. Le profil pilote ce qu'on MONTRE d'abord — le tri, et
les défauts d'écran.
"""

from __future__ import annotations

import re
from typing import Any

#: Les trois profils retenus (D87), du plus contraint au plus installé.
ESN_SALES_PROFILES: tuple[str, ...] = ("createur", "specialiste", "etablie")

#: Au-delà, une ESN a des références, des process et le temps d'attendre un
#: référencement : c'est le profil « établie » du tome (80-150 consultants).
ETABLIE_MIN_CONSULTANTS = 50
#: En deçà, l'ESN n'a pas la trésorerie de se tromper de compte : tout se joue
#: sur l'accessibilité (le profil « créateur », 0-3 consultants du tome). Le
#: seuil reprend EXACTEMENT celui du tri par taille qui existait avant, pour
#: qu'aucune ESN déjà servie ne change d'écran d'accueil du jour au lendemain.
CREATEUR_MAX_CONSULTANTS = 4
#: Un spécialiste nomme deux expertises, pas huit. Au-delà, c'est un généraliste.
SPECIALISTE_MAX_EXPERTISES = 2


def _lower_bound(value: Any) -> int | None:
    """« 10-30 » → 10 · « 500+ » → 500 · illisible → ``None``.

    Borne BASSE, comme le tri de Découvrir et pour la même raison : sur-estimer
    la capacité d'une ESN à ouvrir un grand compte est l'erreur qui coûte huit
    mois. Le stade `esn_stage` prend la borne haute, lui, parce qu'il sert à
    autoriser un geste — les deux conventions protègent chacune son risque.
    """
    match = re.search(r"\d+", str(value or ""))
    return int(match.group()) if match else None


def classify_esn_sales_profile(profile: Any) -> str | None:
    """Le profil commercial déduit, ou ``None`` quand rien ne permet de trancher.

    ``None`` est une réponse : un profil deviné trierait l'écran d'accueil d'un
    utilisateur sur une hypothèse, et il ne saurait pas pourquoi.

    L'ordre des tests compte. Une ESN de six personnes avec UNE expertise rare
    est un spécialiste, pas un créateur : c'est son expertise qui ouvre les
    portes, pas l'accessibilité du compte.
    """
    data = profile if isinstance(profile, dict) else {}
    size = data.get("size") or data.get("consultant_size") or data.get("consultantSize")
    offers = data.get("offers") or data.get("expertise_areas") or data.get("expertiseAreas") or []
    named = [str(o).strip() for o in offers if str(o or "").strip()] if isinstance(offers, (list, tuple)) else []
    low = _lower_bound(size)

    if low is not None and low >= ETABLIE_MIN_CONSULTANTS:
        return "etablie"
    # Une expertise NOMMÉE et peu nombreuse : le fit prime sur la porte.
    if 0 < len(named) <= SPECIALISTE_MAX_EXPERTISES:
        return "specialiste"
    if low is not None and low <= CREATEUR_MAX_CONSULTANTS:
        return "createur"
    # Entre les deux, sans expertise resserrée, rien ne distingue le profil : on
    # laisse le tri par taille répondre plutôt que de ranger l'ESN de force.
    return None


#: Ce que chaque profil regarde EN PREMIER. C'est la seule conséquence de la
#: déduction aujourd'hui, et elle est réelle : un créateur qui ouvre Découvrir
#: trié par intérêt voit d'abord les comptes qu'il ne peut pas ouvrir.
PROFILE_DEFAULT_SORT: dict[str, str] = {
    "createur": "addressability",
    "specialiste": "interest",
    "etablie": "interest",
}
