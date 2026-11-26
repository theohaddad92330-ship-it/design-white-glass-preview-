"""Un libellé d'AFFICHAGE écrit hors du catalogue i18n est français pour
toujours (`agent_docs` du 05/09) : le service IA parle FRANÇAIS dans sa charge
utile, et l'écran le rend verbatim — en anglais, l'utilisateur lit « Relation
— L'entrée n'est pas froide ».

Ce test tient la partie IA du correctif : chaque facteur RENDU À UN ÉCRAN
(`scoreFactors[]` et `addressability.factors[]`) porte, EN PLUS de son `label`
français — inchangé, retiré de rien — un `label_key` stable (+ ses
`label_params` le cas échéant), pour que le web puisse choisir la traduction
plutôt que de recopier le français.

STRICTEMENT ADDITIF : c'est ce qui rend la fenêtre de déploiement Vercel/
Railway (qui ne déploient jamais ensemble) inoffensive. `label` reste identique
à l'octet près ; `label_key`/`label_params` s'ajoutent.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from app.services.discover_scoring import addressability_for_company, score_candidate

TODAY = date(2026, 8, 22)

PROFILE: dict[str, Any] = {
    "sectors": ["assurance"],
    "geoZone": "Lyon",
    "targetCompanyTypes": ["PME (50-500 salariés)"],
}
FILTERS: dict[str, Any] = {
    "nafCode": "62.02A",
    "department": "69",
    "headcountMin": 50,
    "headcountMax": 500,
}
COMPANY: dict[str, Any] = {
    "name": "Acme",
    "siren": "123456789",
    "nafCode": "62.02A",
    "sector": "Assurance dommages",
    "city": "Lyon",
    "department": "69",
    "headcountRange": "100 à 199 salariés",
    "creationDate": "2015-01-01",
}
SIGNALS: list[dict[str, Any]] = [
    {"type": "hiring", "label": "3 postes data", "date": "2026-07-01"},
    {"type": "tech", "label": "Kubernetes détecté", "date": "2026-07-01"},
]


def test_every_score_factor_carries_a_label_key_alongside_its_untouched_french_label() -> None:
    """`scoreFactors[]` — rendu par `CandidateScore.tsx` (Découvrir).

    Chaque facteur doit porter les DEUX : `label` (inchangé, c'est la garantie
    additive) ET `label_key` (nouveau, c'est le correctif). Un facteur qui
    n'a que l'un des deux est soit une régression (label parti), soit un oubli
    de traduction (label_key manquant).
    """
    result = score_candidate(COMPANY, profile=PROFILE, filters=FILTERS, signals=SIGNALS, now=TODAY)
    assert result["factors"], "le jeu de test ne produit aucun facteur — rien à prouver"

    missing_key = [f["label"] for f in result["factors"] if not f.get("label_key")]
    assert missing_key == [], f"facteurs sans label_key : {missing_key}"

    for factor in result["factors"]:
        assert factor["label"], factor  # additif : le français n'a pas bougé
        assert isinstance(factor["label_key"], str) and factor["label_key"], factor
        # label_params est un dict (vide ou peuplé), jamais absent une fois
        # label_key posé — sinon le web ne sait pas s'il doit en attendre un.
        assert isinstance(factor.get("label_params"), dict), factor


def test_addressability_axis_factors_also_carry_a_label_key() -> None:
    """`addressability.factors[]` — rendu par `TabAccess.tsx` ET
    `CandidateScore.tsx`. Même règle que les facteurs de score : un axe
    « lock »/« proportion »/« relation » a plusieurs libellés possibles selon
    le chemin qui l'a produit — le code `axis` seul ne suffit pas à choisir la
    bonne phrase, d'où `label_key`.
    """
    result = addressability_for_company(
        COMPANY,
        {"size": "10-30"},
        [{"type": "tender", "label": "AO refonte SI", "date": "2026-06-01"}],
        None,
        crm_presence="3 contact(s) déjà dans ton CRM chez ce groupe",
    )
    assert result["factors"], "le jeu de test ne produit aucun axe mesuré — rien à prouver"
    for factor in result["factors"]:
        assert factor["label"], factor
        assert isinstance(factor.get("label_key"), str) and factor["label_key"], factor
        assert isinstance(factor.get("label_params"), dict), factor


def test_the_lock_axis_barrier_estimate_branch_also_carries_a_label_key() -> None:
    """La troisième branche de `_lock_axis` — aucune trace de marché public,
    la barrière ESTIMÉE prend le relais (`_lock_axis_from_barrier`). Elle
    compose son libellé à partir du libellé de la barrière
    (`access_scoring._class_of`) : c'est la ligne 796 de l'inventaire.
    """
    from app.services.access_scoring import access_barrier
    from app.services.discover_scoring import _lock_axis

    barrier = access_barrier(
        statut="scaleup",
        headcount=100,
        listed=None,
        public_procurement=None,
        etablissements=1,
        creation_date="2019-01-01",
        now=TODAY,
    )
    axis = _lock_axis([], barrier)
    assert axis is not None
    assert axis["label"], axis  # additif : toujours "Ouvert probable — estimation de registre"
    assert isinstance(axis.get("label_key"), str) and axis["label_key"], axis
