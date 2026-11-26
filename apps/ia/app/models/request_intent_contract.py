"""#2257.1 — LE CONTRAT DE DEMANDE STRUCTURÉ (LAU-FINAL-002, « compilateur
d'intention »).

Le ticket demande un objet nommé, dix-huit champs, produit UNE FOIS par tour
à partir de ce que le moteur SAIT DÉJÀ — jamais un second appel au modèle. Il
n'existait NULLE PART : l'extraction d'intention restait implicite au
raisonnement du modèle dans `bellum_advisor.py` (mesuré au registre
`.claude/notes/registre-2026-09-17-lau-002-2257.md`).

⚠️ Ce module NOMME les dix-huit champs. Il ne prétend pas les avoir tous
PRODUITS. À la livraison de #2257, deux seulement avaient un producteur
déterministe — `objet_depart` (le compte ACTIF, déjà résolu avant que le
prompt existe) et `ambiguite_deja_demandee` (le drapeau client §9.4, « pas
deux tours de clarification »).

#2321 en ajoute QUATRE, et pas un de plus : `intention_principale`,
`resultat_attendu`, `objets_a_produire` et `action_souhaitee` viennent du
ROUTEUR D'INTENTION (`app/services/compilers/intent_router.py`), qui les lit
sur des marqueurs déclarés plutôt que de les deviner. Les douze restants
restent `None` : aucune extraction fiable du périmètre, du secteur ou du
format n'existe encore — les inventer serait la donnée fictive que la
doctrine interdit.

Miroir TS : `packages/contracts/src/schemas/request-intent-contract.ts`. La
parité des dix-huit noms est tenue par les DEUX listes `..._FIELDS` (celle-ci
et sa jumelle TS), testées côté TS et côté Python — un champ ajouté d'un seul
côté fait échouer le test qui compte.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from pydantic import BaseModel

if TYPE_CHECKING:
    from app.services.discover_request_reading import RequestReading

REQUEST_INTENT_CONTRACT_FIELDS: tuple[str, ...] = (
    "intention_principale",
    "resultat_attendu",
    "objet_depart",
    "objets_a_produire",
    "perimetre_geographique",
    "secteur",
    "expertise",
    "type_compte",
    "exclusions",
    "horizon",
    "urgence",
    "niveau_detail",
    "format_souhaite",
    "action_souhaitee",
    "niveau_autonomie",
    "sensibilite",
    "ambiguite_deja_demandee",
    "besoin_metier_sous_jacent",
)


class RequestIntentContract(BaseModel):
    # #2257.3 — PRODUIT depuis #2321 : l'intention routée par le routeur
    # d'intention (`compilers/intent_router.py`), ou `None` s'il n'a rien routé.
    intention_principale: str | None = None
    # #2257.4 — PRODUIT depuis #2321 : le `expected_result` de la route, une
    # valeur d'un vocabulaire FERMÉ — jamais une phrase libre.
    resultat_attendu: str | None = None
    # #2257.5 — PRODUIT : le compte ACTIF, déjà résolu avant le prompt.
    objet_depart: str | None = None
    # #2257.6 — PRODUIT depuis #2321 : les ÉTAPES du job séquencé de la route.
    objets_a_produire: list[str] | None = None
    # #2257.7 — PRODUIT depuis le reste du 25/09 : le LIEU déjà RÉSOLU (région,
    # département, code postal) par la lecture déterministe de Découvrir
    # (`discover_request_reading.read_request`, #2490/#2496). Une ville
    # CANDIDATE non résolue (pas de réseau ici) reste `None`.
    perimetre_geographique: str | None = None
    # #2257.8 — PRODUIT depuis le reste du 25/09 : le premier secteur
    # d'application reconnu par la même lecture — jamais le marqueur "esn"
    # (un TYPE d'entreprise, pas un secteur).
    secteur: str | None = None
    # #2257.9 — NON PRODUIT.
    expertise: str | None = None
    # #2257.10 — NON PRODUIT.
    type_compte: str | None = None
    # #2257.11 — NON PRODUIT comme champ générique.
    exclusions: list[str] | None = None
    # #2257.12 — PRODUIT depuis le reste du 25/09 : marqueurs déclarés FR/EN
    # (`intent_markers.horizon_from_message`), `None` si aucun marqueur.
    horizon: str | None = None
    # #2257.13 — PRODUIT depuis le reste du 25/09 : idem, `"urgent"` ou `None`
    # — jamais `"normal"` (l'absence n'est jamais une valeur devinée).
    urgence: str | None = None
    # #2257.14 — PRODUIT depuis le reste du 25/09 : idem, `"bref"` / `"detaille"` / `None`.
    niveau_detail: str | None = None
    # #2257.15 — NON PRODUIT comme champ dédié : le format est choisi par le
    # modèle en bout de prompt (`_BLOCK_FORMAT`), jamais nommé par le code AVANT.
    format_souhaite: str | None = None
    # #2257.16 — PRODUIT depuis #2321 : le premier outil que la route ouvre.
    # Vide quand la capacité manque — la route le dit plutôt que d'inventer.
    action_souhaitee: str | None = None
    # #2257.17 — NON PRODUIT comme champ dédié : l'AUTONOMIE du prompt est une
    # consigne STATIQUE, pas une valeur calculée par tour.
    niveau_autonomie: str | None = None
    # #2257.18 — NON PRODUIT comme champ dédié.
    sensibilite: str | None = None
    # #2257.19/.32 — PRODUIT : le drapeau client `clarification_asked` (§9.4).
    ambiguite_deja_demandee: bool = False
    # #2257.20 — NON PRODUIT.
    besoin_metier_sous_jacent: str | None = None


def build_request_intent_contract(
    *,
    active_account_company_name: str | None,
    clarification_already_asked: bool,
    intention_principale: str | None = None,
    resultat_attendu: str | None = None,
    objets_a_produire: list[str] | None = None,
    action_souhaitee: str | None = None,
    perimetre_geographique: str | None = None,
    secteur: str | None = None,
    horizon: str | None = None,
    urgence: str | None = None,
    niveau_detail: str | None = None,
) -> RequestIntentContract:
    """Construit le contrat UNE FOIS par tour, depuis ce que l'appelant a DÉJÀ
    résolu — jamais un nouvel appel au modèle (le ticket l'exige explicitement).

    #2321 — quatre paramètres viennent du ROUTEUR D'INTENTION
    (``app/services/compilers/intent_router.py``). #2257.7/.8/.12/.13/.14
    (reste du 25/09) en ajoutent CINQ de plus : `perimetre_geographique` et
    `secteur` viennent de la lecture déterministe de Découvrir
    (``discover_request_reading.read_request`` via
    :func:`geo_and_sector_from_reading`, #2490/#2496) ; `horizon`, `urgence` et
    `niveau_detail` viennent des marqueurs déclarés
    (``app/services/compilers/intent_markers.py``). Tous restent OPTIONNELS et
    ``None`` par défaut : un appelant qui ne les fournit pas rend le contrat
    d'avant, au champ près. Ce ne sont jamais des valeurs devinées — chacune
    est une entrée d'un vocabulaire fermé, ou rien.
    """
    return RequestIntentContract(
        objet_depart=active_account_company_name,
        ambiguite_deja_demandee=clarification_already_asked,
        intention_principale=intention_principale,
        resultat_attendu=resultat_attendu,
        objets_a_produire=objets_a_produire,
        action_souhaitee=action_souhaitee,
        perimetre_geographique=perimetre_geographique,
        secteur=secteur,
        horizon=horizon,
        urgence=urgence,
        niveau_detail=niveau_detail,
    )


def geo_and_sector_from_reading(reading: RequestReading) -> tuple[str | None, str | None]:
    """#2257.7/.8 — réutilise la lecture déterministe de Découvrir
    (``discover_request_reading.read_request``, #2490/#2496) : le compilateur
    d'intention ne redéfinit PAS un second lecteur de lieu et de secteur
    (GA-26, « un réglage vit à un seul endroit »).

    `perimetre_geographique` ne prend que le lieu déjà RÉSOLU (région,
    département, code postal — ``reading.place_label``) : une ville
    CANDIDATE non résolue (``place_after_preposition``/``place_candidates``,
    qui exigent une résolution réseau que le compilateur n'a pas) resterait une
    donnée devinée si on la prenait ici.

    `secteur` ignore le marqueur ``"esn"`` — un TYPE d'entreprise, pas un
    secteur d'application — et ne garde que le premier secteur reconnu.
    """
    from app.services.discover_request_reading import ESN_ACTIVITY

    secteur = next((activity for activity in reading.activities if activity != ESN_ACTIVITY), None)
    return reading.place_label, secteur


def request_intent_contract_for_log(contract: RequestIntentContract) -> dict[str, Any]:
    """Vue JOURNALISABLE — SANS CONTENU. `objet_depart` porte un nom de compte :
    ce n'est pas le contenu d'un message, mais on le retire quand même du
    journal par prudence — seule sa PRÉSENCE compte pour le diagnostic.

    #3391.5 (retour bêta 30/09) — « quelle méthode a été choisie » est un axe du
    mode diagnostic nommé par l'issue. `intention_principale` vient du routeur
    d'intention (#2321) : un vocabulaire FERMÉ, jamais une phrase libre — rien
    à protéger, contrairement à `objet_depart`. Sa VALEUR sort donc du journal,
    pas seulement sa présence (`has_intention_principale`, gardé pour la
    compatibilité de ce qui le lit déjà).
    """
    return {
        "intention_principale": contract.intention_principale,
        "has_intention_principale": contract.intention_principale is not None,
        "has_resultat_attendu": contract.resultat_attendu is not None,
        "has_objet_depart": contract.objet_depart is not None,
        "has_objets_a_produire": bool(contract.objets_a_produire),
        "has_perimetre_geographique": contract.perimetre_geographique is not None,
        "has_secteur": contract.secteur is not None,
        "has_expertise": contract.expertise is not None,
        "has_type_compte": contract.type_compte is not None,
        "has_exclusions": bool(contract.exclusions),
        "has_horizon": contract.horizon is not None,
        "has_urgence": contract.urgence is not None,
        "has_niveau_detail": contract.niveau_detail is not None,
        "has_format_souhaite": contract.format_souhaite is not None,
        "has_action_souhaitee": contract.action_souhaitee is not None,
        "has_niveau_autonomie": contract.niveau_autonomie is not None,
        "has_sensibilite": contract.sensibilite is not None,
        "ambiguite_deja_demandee": contract.ambiguite_deja_demandee,
        "has_besoin_metier_sous_jacent": contract.besoin_metier_sous_jacent is not None,
    }
