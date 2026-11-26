"""#2265.1 — LA TYPOLOGIE DES ACTEURS, au moins 24 types nommés (LAU-FINAL-009).

## CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS

Le chapitre demande une typologie unifiée « ESN, cabinet recrutement,
marketplace, MSP/VMS… » — la liste EXACTE du document source (un « cahier de
conception », pas un défaut reproduit) n'est pas dans le dépôt. Même situation
que `PROOF_CHANNELS`/`PROOF_CONTENT_TYPES` (#2424.4/.6) : **tranché sans Louis
(doctrine §3c)**, les 28 valeurs ci-dessous sont les plus citées du domaine
ESN/staffing/conseil — à corriger si Louis en tient une liste différente.

Le module sépare volontairement deux choses, comme `copilote_scenario_
metadata.py` sépare les champs ÉCRITS À LA MAIN des champs DÉRIVÉS :

* `ActorType` NOMME la typologie complète — un vocabulaire, pas une preuve ;
* `classify_actor_type()` ne rend qu'un type que deux signaux RÉELS et déjà
  éprouvés ailleurs permettent d'établir (`esn_naf.py` : le NAF ESN/ambigu ;
  `intermediation.py` : le cabinet de recrutement et la plateforme de mise en
  relation). **Aucune fonction ici ne calcule** un GROUPE ou une FILIALE (#2265.11). Le
  PARTENAIRE (#2265.5, `is_declared_partner`, fait déclaré dans l'espace) et la
  SOURCE DE DONNÉES (#2265.7, nom d'un fournisseur connu) sont classés depuis
  le 30/09 sur ces deux preuves — les autres ont cherché un signal et n'en ont
  trouvé aucun dans le dépôt (registre `registre-2026-09-17-lau-
  009-2265.md`) — les nommer ici ne les invente pas, ça évite de les fabriquer
  le jour où quelqu'un aura besoin de la case. Un acteur sans preuve reste
  `NON_CLASSE`, jamais rangé au hasard (doctrine : jamais de donnée fictive).

## L'ORDRE DES PREUVES

0. La source de données (nom) puis le partenaire déclaré (fait de l'espace).
1. Le cabinet de recrutement ou la plateforme (`intermediation.intermediary_
   kind`) — la preuve la plus spécifique, NAF 78.10Z/78.30Z ou nom connu.
2. L'entreprise de travail temporaire (NAF 78.20Z) — nommément EXCLUE de
   l'intermédiation par `intermediation.py` : elle place ses propres salariés,
   c'est un besoin réel, pas une annonce pour un tiers. Un type à PART, jamais
   confondu avec le cabinet de recrutement qui, lui, ne recrute jamais pour
   lui-même.
3. Le NAF ambigu (`esn_naf.is_ambiguous_naf`) — 70.22Z/62.09Z couvrent autant
   d'ESN que de cabinets de conseil qui n'en sont pas : ni l'un ni l'autre
   n'est deviné, la ligne dit son doute.
4. Le NAF ESN (`esn_naf.is_esn_naf_code`) — `ESN_CONCURRENTE` si l'appelant
   passe `is_known_esn_competitor=True` (résolu par lui via le référentiel de
   477 noms, `esn_name_match.py` — jamais recalculé ici, GA-26), sinon `ESN`.
5. Le NAF non-ESN résolu → `CLIENT_FINAL`.
6. Rien de résolu → `NON_CLASSE`.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from app.services.esn_naf import is_ambiguous_naf, is_esn_naf_code
from app.services.intermediation import (
    intermediary_kind,
    is_temp_agency,
    looks_like_broker,
    looks_like_data_source,
    looks_like_msp,
    looks_like_vms,
)


class ActorType(StrEnum):
    """Vocabulaire complet — nommer un type ici n'affirme jamais qu'un acteur
    en relève : seul `classify_actor_type` engage un jugement, sur preuve."""

    # ── Nature commerciale (#2265.3) ─────────────────────────────────────────
    CLIENT_FINAL = "client final"
    ESN = "ESN"
    ESN_CONCURRENTE = "ESN concurrente (référentiel connu)"
    CABINET_RECRUTEMENT = "cabinet de recrutement"
    PLATEFORME_INTERMEDIATION = "plateforme de mise en relation"
    ENTREPRISE_INTERIM = "entreprise de travail temporaire"
    MSP = "prestataire d'infogérance (MSP)"
    VMS = "plateforme de gestion de fournisseurs (VMS)"
    INTEGRATEUR_MATERIEL = "intégrateur matériel"
    EDITEUR_LOGICIEL = "éditeur de logiciel"
    DISTRIBUTEUR_IT = "distributeur IT"
    CABINET_CONSEIL_NON_TECHNIQUE = "cabinet de conseil non technique"
    FREELANCE_INDEPENDANT = "freelance indépendant"
    SOUS_TRAITANT_ESN = "sous-traitant d'une ESN"
    # #2265.5/.7 — classés sur preuve depuis le 30/09 : le partenaire DÉCLARÉ
    # par l'espace, la source de données par son nom (voir docstring).
    PARTENAIRE = "partenaire"
    SOURCE_DE_DONNEES = "source de données, jamais un prospect"
    INVESTISSEUR = "investisseur"
    COURTIER_OU_APPORTEUR_AFFAIRES = "courtier ou apporteur d'affaires"
    # ── Nature organisationnelle (#2265.10/.11) ──────────────────────────────
    GROUPE = "société mère (groupe)"
    FILIALE = "filiale"
    ENTITE_FRANCAISE_DE_GROUPE_ETRANGER = "entité française d'un groupe étranger"
    SITE = "site ou établissement"
    UNITE_D_ACTIVITE = "unité d'activité (BU)"
    # ── Secteur public / non marchand ────────────────────────────────────────
    ADMINISTRATION_PUBLIQUE = "administration publique"
    ETABLISSEMENT_DE_SANTE = "établissement de santé"
    COLLECTIVITE_TERRITORIALE = "collectivité territoriale"
    ASSOCIATION_OU_ONG = "association ou ONG"
    ORGANISME_DE_FORMATION = "organisme de formation"
    # ── État de la résolution ─────────────────────────────────────────────────
    AMBIGU_CONSEIL_OU_ESN = "ambigu — cabinet de conseil ou ESN, NAF partagé"
    NON_CLASSE = "non classé, faute de signal"


def _is_travail_temporaire(naf: object) -> bool:
    """NAF 78.20Z — nommément EXCLU de l'intermédiation par `intermediation.py` :
    une entreprise d'intérim place ses PROPRES salariés en mission, ce qui est
    un besoin réel de main-d'œuvre, pas une annonce pour le compte d'un tiers.
    """
    digits = "".join(ch for ch in str(naf or "") if ch.isalnum()).upper()
    return digits == "7820Z"


def classify_actor_type(
    *,
    naf: object = None,
    name: object = None,
    is_known_esn_competitor: bool = False,
    is_declared_partner: bool = False,
) -> ActorType:
    """Le type d'acteur, sur PREUVE seulement. Voir l'ordre des preuves en tête
    de module. `is_known_esn_competitor` est un signal DÉJÀ résolu par
    l'appelant (référentiel de 477 noms, `esn_name_match.py`) — jamais
    recalculé ici (GA-26, une dérivation vit à un seul endroit)."""
    # #2265.7 — un fournisseur de données n'est JAMAIS un prospect : preuve par
    # le nom, avant toute lecture du NAF (il peut en porter un d'ESN).
    if looks_like_data_source(name):
        return ActorType.SOURCE_DE_DONNEES
    # #2265.5 — un partenaire DÉCLARÉ par l'espace (`account_partners`,
    # relation `partner`) : un fait saisi ou confirmé par l'équipe, résolu par
    # l'appelant — jamais recalculé ici (GA-26). Il prime sur le NAF, qui dirait
    # seulement « ESN », et reste derrière la source de données.
    if is_declared_partner:
        return ActorType.PARTENAIRE
    kind = intermediary_kind(name=name, naf=naf)
    if kind == "cabinet_recrutement":
        return ActorType.CABINET_RECRUTEMENT
    if kind == "plateforme":
        return ActorType.PLATEFORME_INTERMEDIATION
    # #4814 — VMS / MSP / apporteur d'affaires : le NOM, seule preuve existante. Avant l'ambigu (NAF partagé).
    if looks_like_vms(name):
        return ActorType.VMS
    if looks_like_msp(name):
        return ActorType.MSP
    if looks_like_broker(name):
        return ActorType.COURTIER_OU_APPORTEUR_AFFAIRES
    if _is_travail_temporaire(naf) or is_temp_agency(name=name):
        return ActorType.ENTREPRISE_INTERIM
    if is_ambiguous_naf(naf):
        return ActorType.AMBIGU_CONSEIL_OU_ESN
    esn = is_esn_naf_code(naf)
    if esn is True:
        return ActorType.ESN_CONCURRENTE if is_known_esn_competitor else ActorType.ESN
    if esn is False:
        return ActorType.CLIENT_FINAL
    return ActorType.NON_CLASSE


#: #4746 — ce que « clients finaux uniquement » retire : tout acteur dont la NATURE prouvée n'est pas
#: celle d'un client final. L'ambigu (`AMBIGU_CONSEIL_OU_ESN`) et le non classé restent : « non établi »
#: n'est jamais « ESN » (GA-18/19), et les retirer ferait disparaître de vraies cibles.
_NOT_AN_END_CLIENT: frozenset[ActorType] = frozenset(
    {
        ActorType.ESN,
        ActorType.ESN_CONCURRENTE,
        ActorType.CABINET_RECRUTEMENT,
        ActorType.PLATEFORME_INTERMEDIATION,
        ActorType.FREELANCE_INDEPENDANT,
        ActorType.SOUS_TRAITANT_ESN,
        ActorType.PARTENAIRE,
        # #4814 — arbitrage Louis 31/10 : intérim, VMS, MSP, apporteurs d'affaires = intermédiaires.
        ActorType.ENTREPRISE_INTERIM,
        ActorType.VMS,
        ActorType.MSP,
        ActorType.COURTIER_OU_APPORTEUR_AFFAIRES,
    }
)


#: #4814 — les natures que l'écran nomme « Intermédiaire, pas client final » (`isIntermediary`) : les deux
#: historiques (#2265.14) ET les quatre de l'arbitrage Louis 31/10. Un seul endroit (GA-26) pour le drapeau.
INTERMEDIARY_ACTOR_TYPES: frozenset[ActorType] = frozenset(
    {
        ActorType.CABINET_RECRUTEMENT,
        ActorType.PLATEFORME_INTERMEDIATION,
        ActorType.ENTREPRISE_INTERIM,
        ActorType.VMS,
        ActorType.MSP,
        ActorType.COURTIER_OU_APPORTEUR_AFFAIRES,
    }
)


def matches_end_client(actor_type: ActorType, *, is_known_esn: bool) -> bool:
    """Le candidat reste-t-il dans une lecture « clients finaux » ?

    `esn_naf.matches_entity_type` ne lit que le NAF résolu et garde tout NAF inconnu : une offre ne
    rend jamais de NAF, donc une ESN du référentiel dont l'employeur n'a pas été résolu (ou une
    plateforme de freelance, sans NAF unique) passait pour un client final. Le NOM d'une ESN connue
    (`is_known_esn`, résolu par l'appelant — GA-26) l'emporte sur un NAF non résolu. Seule cette lecture
    retire : `esn` et `all` restent celles du NAF, la route de rang 2 est une capacité voulue (#4285.3).
    """
    return not (is_known_esn or actor_type in _NOT_AN_END_CLIENT)


#: #4746.2 (lot P) — la nature NOMMÉE d'un acteur qui n'est pas un client final, pour les pastilles de l'onglet
#: « Autres acteurs » : ESN · cabinets · intérim · partenaires · sites d'annonces. Un seul endroit (GA-26).
OtherActorKind = Literal["esn", "recruiter", "interim", "partner", "adsite"]

_OTHER_ACTOR_KINDS: dict[ActorType, OtherActorKind] = {
    ActorType.ESN: "esn",
    ActorType.ESN_CONCURRENTE: "esn",
    ActorType.SOUS_TRAITANT_ESN: "esn",
    ActorType.CABINET_RECRUTEMENT: "recruiter",
    ActorType.VMS: "recruiter",
    ActorType.MSP: "recruiter",
    ActorType.COURTIER_OU_APPORTEUR_AFFAIRES: "recruiter",
    ActorType.ENTREPRISE_INTERIM: "interim",
    ActorType.PARTENAIRE: "partner",
    ActorType.PLATEFORME_INTERMEDIATION: "adsite",
}


def other_actor_kind(actor_type: ActorType, *, is_known_esn: bool) -> OtherActorKind | None:
    """La pastille d'« Autres acteurs » de cet acteur, ou ``None`` pour un client final / un acteur non prouvé.

    Une ESN du référentiel (nom connu, ``is_known_esn``) l'emporte sur un NAF ambigu ou non résolu — même règle que
    ``matches_end_client`` — mais jamais sur un intermédiaire déjà prouvé (un site d'annonces reste un site).
    Le NAF ambigu seul et le non classé ne sont PAS rangés ici : « non établi » n'est jamais « ESN » (GA-18/19)."""
    kind = _OTHER_ACTOR_KINDS.get(actor_type)
    if kind is not None:
        return kind
    if is_known_esn and actor_type in (ActorType.AMBIGU_CONSEIL_OU_ESN, ActorType.NON_CLASSE, ActorType.CLIENT_FINAL):
        return "esn"
    return None


def actor_fields(
    *,
    naf: object,
    name: object,
    is_declared_partner: bool = False,
    siren: object = None,
    esn_offer_count: int = 0,
) -> dict[str, object]:
    """#4746.2 / lot Q point 1 — LES champs d'acteur d'un candidat, calculés UNE fois (GA-26) pour les DEUX
    chemins de Découvrir : `/discover/signals` (objet `DiscoverCandidate`) et `/discover/registry` (dict).
    L'onglet « Autres acteurs » se décide côté web sur `actorKind` / `isEsnPeer` / `isIntermediary` : sans eux
    sur le chemin registre, une ESN ou une agence d'intérim restait dans « Comptes ». Aucun appel réseau.

    Lot T point 1 (Louis 02/11) — une ESN que le NAF ne dit pas (71.12B, holding, immobilier…) est reconnue par le
    référentiel élargi (``siren`` / nom) OU par ses propres offres (``esn_offer_count`` ≥ seuil, NAF ambigu) :
    `esnRecognition` porte la preuve (``referential`` / ``offers``), jamais un nom de source. Sans l'une ni l'autre,
    rien ne change. Un intermédiaire déjà prouvé (cabinet de recrutement, intérim…) n'est jamais réécrit en ESN."""
    from app.services.company_archetype import is_known_esn_name
    from app.services.esn_recognition import recognize_esn

    known_esn = is_known_esn_name(name)
    actor_type = classify_actor_type(
        naf=naf, name=name, is_known_esn_competitor=known_esn, is_declared_partner=is_declared_partner
    )
    recognition = None
    if actor_type in (ActorType.CLIENT_FINAL, ActorType.AMBIGU_CONSEIL_OU_ESN, ActorType.NON_CLASSE):
        recognition = recognize_esn(naf=naf, siren=siren, name=name, esn_offer_count=esn_offer_count)
        if recognition is not None:
            actor_type = ActorType.ESN_CONCURRENTE if recognition == "referential" else ActorType.ESN
    return {
        "actorType": actor_type.value,
        "isEsnPeer": actor_type in (ActorType.ESN, ActorType.ESN_CONCURRENTE),
        "isDeclaredPartner": actor_type == ActorType.PARTENAIRE,
        "actorKind": other_actor_kind(actor_type, is_known_esn=known_esn),
        "isIntermediary": actor_type in INTERMEDIARY_ACTOR_TYPES,
        "esnRecognition": recognition,
    }
