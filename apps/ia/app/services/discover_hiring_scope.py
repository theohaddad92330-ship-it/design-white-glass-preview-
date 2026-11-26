"""#3901.p — une offre HORS des métiers de l'ESN ne compte plus dans Découvrir (Louis, 16/10/2026).

⚠️ RENVERSEMENT ASSUMÉ ET DATÉ de « hors domaine = rang, jamais effacé » (#3901.w / #4088.7) POUR
DÉCOUVRIR : l'offre hors métier sort de la carte, du rang et de « Ce qui a pesé ». Les métiers de l'ESN =
métiers DÉCLARÉS ; à défaut, métiers DÉDUITS (lot du 11/10) ; ni l'un ni l'autre ⇒ l'offre n'est pas un
signal fort (l'écran le dit). Un poste que nulle ESN ne place (facteur, livreur, caissier…) sort quel que
soit le profil. ``recruitsForClients`` (14/10) garde toute autre ouverture.

Jumeau de ``hiringScopeVerdict`` (packages/contracts/src/schemas/discover-hiring-scope.ts) : MÊME jeu de
cas, ``fixtures/discover-hiring-scope.json``. S'applique à la LECTURE : les faits en cache n'ont pas à être rejoués.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

from app.services.discover_scoring import sector_matches_profile_targets, target_sectors_of
from app.services.domain_job_filters import fold, inferred_role_terms
from app.services.esn_candidate_ranking import naf_family_label, naf_label_for_code
from app.services.hierarchy_level import is_executive_recruitment_title
from app.services.naf_sections import naf_division_of

_NON_PLACED = tuple(
    re.compile(p)
    for p in (
        r"\b(facteur|factrice|facteurs|factrices)\b",
        r"\b(livreur|livreuse|coursier|coursiere)\b",
        r"\b(caissier|caissiere|hote(sse)? de caisse)\b",
        # #4403.1 — hôte / hôtesse de vente, d'accueil (repli : « hote sse de vente »).
        r"\bhote(?: ?sse| ?e)?s? (?:de |d )?(?:vente|accueil)\b",
        r"\b(agent|agente|employe|employee) (d |de |du )?(entretien|proprete|nettoyage|restauration|libre service|rayon)\b",
        r"\b(femme|homme) de menage\b",
        # #4398.1 — formes inclusives repliées (« conseiller ere vente »).
        r"\bconseill(er|ere)s?( ere| e)? (de )?(clientele|relation client|relation clientele|accueil|vente)\b",
        r"\bconseill(er|ere)s?( ere| e)? en (service )?(relation client|relation clientele|agence)\b",
        r"\bconseill(er|ere)s?( ere| e)? clientele\b",
        r"\btechnicien(ne)?s?( ne| e)? (d |de |du )?atelier\b",
        r"\b(chauffeur|cariste|manutentionnaire|magasinier|preparateur de commandes?|agent de securite|agente? ssiap)\b",
        r"\b(serveur|serveuse|cuisinier|cuisiniere|boulanger|boulangere|aide soignant(e)?|auxiliaire de vie)\b",
        r"\b(ouvrier|ouvriere|operateur de production|agent de fabrication|agent de production|agent de conditionnement)\b",
        # SIMON-FIX S.14 (recette 20/10, espace ESN IT) — santé, soin, tri de colis : « Infirmier », « Kiné »,
        # « Agent de tri » sortaient 10 sur 10 pour un placeur en CDI (qui garde toute ouverture hors de cette liste).
        r"\b(infirmier|infirmiere|infirmiers|infirmieres|kinesitherapeute|kinesitherapeutes|kine|osteopathe|orthophoniste|ergotherapeute|psychomotricien|psychomotricienne|podologue|dieteticien|dieteticienne)\b",
        r"\b(medecin|medecins|pharmacien|pharmacienne|sage femme|chirurgien|chirurgienne|dentiste|ambulancier|ambulanciere|brancardier|brancardiere|puericultrice|auxiliaire de puericulture)\b",
        r"\b(aide|aides) (a domicile|medico psychologique)\b",
        r"\b(manipulateur|manipulatrice) (en )?(radio|radiologie|electroradiologie)\b",
        r"\b(educateur|educatrice) (specialise|specialisee|de jeunes enfants)\b",
        r"\b(assistant|assistante) maternel(le)?\b",
        r"\bagent(e)? de service hospitalier\b",
        r"\b(preparateur|preparatrice) en pharmacie\b",
        r"\b(agent|agente|trieur|trieuse) (de )?(tri|quai)\b",
        # SIMON-FIX S.14 (recette Simon 20/10) — chantier / bâtiment ; le repli sépare « œ » (« man uvre »).
        r"\bman ?(oe ?)?uvres?\b",
        r"\b(plombier|plombiere|macon|maconne|couvreur|couvreuse|carreleur|carreleuse|plaquiste|charpentier|charpentiere|ferrailleur|coffreur|grutier|zingueur|peintre en batiment|agent de chantier)\b",
    )
)

# #3901.p (recette 16/10) — supports que seul un profil qui les nomme garde, même pour un placeur en CDI.
_SUPPORT = tuple(
    re.compile(p)
    for p in (
        r"\b(acheteur|acheteuse)\b",
        r"\bassistant(e)? (de gestion|d agence|de direction|administratif|administrative|commercial|commerciale)\b",
        r"^(formation|logistique|transport|vente|accueil)$",
        # #3901.7 (recette 18/10) — « Technicien d'usinage fraisage », « comptable expérimenté », « Pilote de
        # Flux », « Chargé de Développement Commercial » restaient sur la carte d'un placeur en CDI : métiers
        # d'atelier, de comptabilité, de logistique et de vente, gardés SEULEMENT si le profil les nomme.
        r"\b(technicien|technicienne|operateur|operatrice) (d |de |du )?(usinage|fraisage|tournage|decoupe|maintenance industrielle)\b",
        r"\b(usinage|fraisage|tourneur|fraiseur|soudeur|soudeuse|chaudronnier|chaudronniere)\b",
        r"\b(comptable|comptables|aide comptable)\b",
        r"\bpilote (de )?flux\b",
        r"\bcharge(e)? (de )?developpement (commercial|commerciale|clientele|des ventes)\b",
        # V4-CORRECTIFS-C 4284.1 — formation métier et RSE/climat : gardés SEULEMENT si le profil les nomme.
        r"\b(formateur|formatrice|formateurs|formatrices)\b",
        r"\b(climate|carbon|carbone|esg|rse|developpement durable|sustainability|environnement)\b",
    )
)


def _folded(value: object) -> str:
    """Même repli que ``foldForRoleMatch`` (contracts)."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9#+.]+", " ", fold(value))).strip()


# L1 (#4284.1, #4396, #4398, #4403 — recette 21/10) : la LISTE BLANCHE par familles de métiers (jumeau de
# ``TRADE_FAMILIES`` côté contracts). Une offre d'une famille que le profil ne couvre pas est hors métier ;
# une offre d'une famille couverte est dans le métier (industrie → industrie). La liste noire reste le filet.
_TRADE_FAMILIES = {
    "numerique": tuple(
        re.compile(p)
        for p in (
            r"\b(developpeur|developpeuse|devops|sre|data|donnees|bi|cloud|cyber|cybersecurite|soc|pentest|rssi)\b",
            r"\b(informatique|numerique|logiciel|software|fullstack|full stack|frontend|backend|java|python|javascript|react|angular|php|net|kubernetes|aws|azure|linux)\b",
            r"\b(sap|erp|salesforce|servicenow|oracle|scrum|product owner|pmo|amoa|test|tests|testeur|qa|helpdesk|service desk|telecom|telecoms|reseau|reseaux|systemes?|exploitation|architecte si|it)\b",
        )
    ),
    "industrie": tuple(
        re.compile(p)
        for p in (
            r"\b(industrie|industriel|industrielle|electrotechnicien|electrotechnique|electricien|automaticien|automatisme|automatismes|mecanique|mecanicien|mecatronique|hse|process|usine|ferroviaire|train|trains|chantier|bureau d etudes|cao|dao|genie civil|genie electrique|instrumentation|chaudronnerie|soudeur|maintenance)\b",
        )
    ),
}


def _trade_families(text: str) -> set[str]:
    folded = _folded(text)
    return {family for family, patterns in _TRADE_FAMILIES.items() if any(p.search(folded) for p in patterns)}


def _family_fit(label: str, texts: list[str]) -> bool | None:
    """True = famille couverte par le profil · False = hors du profil · None = indéterminée."""
    mine: set[str] = set()
    for text in texts:
        mine |= _trade_families(text)
    offer = _trade_families(label)
    if not mine or not offer:
        return None
    return bool(offer & mine)


def is_non_placed_position(label: str) -> bool:
    folded = _folded(label)
    return any(p.search(folded) for p in _NON_PLACED)


def _declared(profile: dict) -> list[str]:
    raw = profile.get("placedRoles") or profile.get("placed_roles") or []
    return [str(r).strip() for r in raw if str(r or "").strip()] if isinstance(raw, list) else []


def hiring_scope_verdict(label: str, profile: dict | None) -> dict[str, Any]:
    """``{"keep": True}`` ou ``{"keep": False, "reason": non_placed | off_trade | no_roles}``."""
    if is_non_placed_position(label):
        return {"keep": False, "reason": "non_placed"}
    # #4733 — un poste de direction (COO, CFO, DAF…) n'est pas un métier d'ESN, c'est une PORTE D'ENTRÉE : il ne sort
    # jamais du filtre métier, quel que soit le profil (jumeau : `hiringScopeVerdict`, contrats).
    if is_executive_recruitment_title(label):
        return {"keep": True}
    if not isinstance(profile, dict):
        return {"keep": True}
    folded = _folded(label)
    declared = _declared(profile)
    if profile.get("recruitsForClients") is True:
        # #4398.1 — « du métier » se juge contre le profil de l'ESPACE : une famille que le profil ne couvre pas
        # (électricien chez une ESN IT) sort même pour un placeur en CDI ; famille indéterminée = on garde.
        if _family_fit(label, declared or list(inferred_role_terms(profile))) is False:
            return {"keep": False, "reason": "off_trade"}
        if not any(p.search(folded) for p in _SUPPORT):
            return {"keep": True}
        named = any(_folded(role) in folded for role in declared) or any(
            re.search(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])", folded) for t in inferred_role_terms(profile)
        )
        return {"keep": True} if named else {"keep": False, "reason": "off_trade"}
    terms = () if declared else inferred_role_terms(profile)
    if not declared and not terms:
        return {"keep": False, "reason": "no_roles"}
    if declared:
        direct = any(_folded(role) in folded for role in declared)
    else:
        direct = any(re.search(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])", folded) for t in terms)
    fit = _family_fit(label, declared or list(terms))
    # Un recoupement par un terme large ne vaut pas si l'offre est d'une famille que le profil ne couvre pas ;
    # une offre d'une famille couverte est dans le métier même sans recoupement littéral.
    if direct:
        return {"keep": False, "reason": "off_trade"} if fit is False else {"keep": True}
    return {"keep": True} if fit is True else {"keep": False, "reason": "off_trade"}


# #4284.1 (recette 23/10) — les métiers que nul secteur d'ESN ne place : vente, commerce de détail, restauration,
# logistique. Un placeur en CDI (``recruitsForClients``) gardait « toute autre ouverture » : ils sortent quand même
# dès que le profil dit son secteur (familles ci-dessus) et que l'offre n'en cite aucune — jamais un filtre IT fixe.
_OFF_SECTOR = tuple(
    re.compile(p)
    for p in (
        r"\b(vendeur|vendeuse|vente|commerce|commercial terrain|responsable de rayon|chef de rayon|employe commercial)\b",
        r"\b(restauration|restaurant|cuisine|chef de partie|commis|barman|barista|pizzaiolo|traiteur)\b",
        r"\b(logistique|entrepot|equipier|livraison|expedition|transport)\b",
    )
)
# Les ouvertures commerciales d'une ESN (vendre du conseil) ne sont pas le commerce de détail.
_ESN_SALES = re.compile(r"\b(ingenieur|ingenieure) (d affaires|commercial|commerciale)\b|\b(business developer|account manager)\b")
_VIDEO_HOSTS = ("youtube.com", "youtu.be", "vimeo.com", "dailymotion.com")


def is_not_an_offer(signal: dict) -> bool:
    """Une entrée sans intitulé d'offre, ou qui pointe une vidéo, n'est pas une offre."""
    label = _folded(signal.get("label"))
    if label in ("", "recrutement"):
        return True
    url = str(signal.get("url") or "").lower()
    return any(host in url for host in _VIDEO_HOSTS)


def is_off_sector_position(label: str, profile: dict | None) -> bool:
    """Vente / restauration / logistique, pour un profil dont le secteur est lu (familles) et que l'offre ne couvre pas."""
    if not isinstance(profile, dict):
        return False
    folded = _folded(label)
    if _ESN_SALES.search(folded) or not any(p.search(folded) for p in _OFF_SECTOR):
        return False
    mine = _declared(profile) or list(inferred_role_terms(profile))
    # sans secteur lisible dans le profil, rien n'est deviné ; une offre d'une famille couverte reste
    return any(_trade_families(t) for t in mine) and _family_fit(label, mine) is not True


# PERTINENCE-PARTOUT (Louis, 25/10/2026) — la MÊME règle à Découvrir, à l'analyse de compte, aux signaux de Laura
# et à la page /signals. Mesuré en prod : « Ssiap », « agent de sécurité » listés avec 0 « hors métier » ; « chef de
# chantier », « techniciens CVC/CFO » sur la fiche d'une ESN informatique. Un placeur en CDI gardait « toute autre
# ouverture » : désormais un poste TECHNIQUE hors informatique sort aussi, même pour lui.
_NON_PLACED_EXTRA = tuple(
    re.compile(p)
    for p in (
        r"\bssiap\b",
        r"\bsecurite incendie\b",
        r"\bagents? de (surete|gardiennage|prevention)\b",
    )
)
_NON_IT_TRADES = tuple(
    re.compile(p)
    for p in (
        r"\b(chef|cheffe) de chantiers?\b",
        r"\bconducteurs? de travaux\b",
        r"\b(cvc|cfo|cfa|hvac|frigoriste|frigoristes|climatisation|ventilation|plomberie|chauffagiste|chauffagistes)\b",
        r"\b(electricien|electricienne|electriciens|soudeur|soudeuse|chaudronnier|chaudronniere|mecanicien|mecanicienne)\b",
        r"\btechniciens? (de |d )?(maintenance|chauffage|froid|batiment)\b",
    )
)


def sells_it(profile: dict | None) -> bool:
    """Le profil vend de l'INFORMATIQUE : un domaine d'offre sans filtre propre (``esn_it`` ou pack non curé), à défaut
    des métiers déclarés / déduits de la famille numérique. Un pack industriel déclaré ne vend pas d'IT."""
    if not isinstance(profile, dict):
        return False
    from app.services.domain_job_filters import job_filter_for, profile_job_scope

    scope = profile_job_scope(profile)
    if scope is not None and scope.packs:
        return any(job_filter_for(pack) is None for pack in scope.packs)
    return any("numerique" in _trade_families(t) for t in (_declared(profile) or list(inferred_role_terms(profile))))


def is_it_label(label: str) -> bool:
    from app.services.data_sources.france_travail import is_it_offer

    return is_it_offer({"intitule": label})


def _extra_reject_reason(label: str, profile: dict | None) -> str | None:
    folded = _folded(label)
    if any(p.search(folded) for p in _NON_PLACED_EXTRA):
        return "nonPlaced"
    if (
        isinstance(profile, dict)
        and profile.get("recruitsForClients") is True
        and sells_it(profile)
        and any(p.search(folded) for p in _NON_IT_TRADES)
        and not is_it_label(label)
    ):
        return "outsideTrade"
    return None


_VERDICT_REASONS = {"non_placed": "nonPlaced", "off_trade": "outsideTrade", "no_roles": "noRoles"}


def hiring_reject_reason(label: str, profile: dict | None) -> str | None:
    """LE verdict d'une offre : ``None`` = dans le métier ; sinon le motif (``nonPlaced`` · ``outsideTrade`` ·
    ``offSector`` · ``noRoles`` — ni métier déclaré ni déduit : l'offre n'est pas un signal fort)."""
    verdict = hiring_scope_verdict(label, profile)
    if not verdict["keep"]:
        return _VERDICT_REASONS[verdict["reason"]]
    extra = _extra_reject_reason(label, profile)
    if extra is not None:
        return extra
    return "offSector" if is_off_sector_position(label, profile) else None


def drop_off_scope_hiring(signals: Iterable[Any], profile: dict | None) -> list[dict]:
    """Les signaux sans les recrutements hors métier ; tout autre signal passe, dans son ordre."""
    return [
        s
        for s in signals
        if isinstance(s, dict)
        and (
            s.get("type") != "hiring"
            or (not is_not_an_offer(s) and hiring_reject_reason(str(s.get("label") or ""), profile) is None)
        )
    ]


# ── L3 (#4284.26, recette 21/10) : le COMPTE hors métier, depuis son secteur ─────────────────────────────
# ⚠️ Un compte n'est « hors de ton métier » que si son activité n'est pas un terrain d'ESN : commerce de détail,
# restauration, agriculture, enseignement, arts, associations / autres services, ménages. Un secteur CIBLE déclaré
# au profil gagne toujours ; sans métier déclaré ni déduit, ou pour une ESN qui place chez ses clients, on ne
# marque rien ; un code NAF illisible n'est jamais deviné. UN prédicat, lu par le registre (`discover.py`) ET
# par les signaux (`discover_signals.py`).
_OFF_TRADE_DIVISIONS: tuple[tuple[int, int], ...] = ((1, 3), (47, 47), (55, 56), (85, 85), (90, 96), (97, 98))


def account_out_of_trade(naf_code: str | None, profile: dict | None) -> bool:
    if not isinstance(profile, dict) or profile.get("recruitsForClients") is True:
        return False
    if not _declared(profile) and not inferred_role_terms(profile):
        return False
    division = naf_division_of(naf_code)
    if division is None or not any(low <= division <= high for low, high in _OFF_TRADE_DIVISIONS):
        return False
    activity = naf_label_for_code(naf_code) or naf_family_label(naf_code) or ""
    return sector_matches_profile_targets(activity, target_sectors_of(profile)) is None
