"""#3226 — LE PLAYBOOK COMMERCIAL DE L'ARCHÉTYPE (#3202.6, suite de LAU-FINAL-208).

`company_archetype.py` NOMME et ÉTABLIT l'archétype d'un compte (vocabulaire +
confiance sur preuve) mais ne dit rien de son usage commercial — le même
défaut que documentait `esn_stage.py` avant `stage_calibration_block` :
« un module juste, calculé, testé, que personne n'appelle ».

§ UTILISATION COMMERCIALE du ticket #3202 nomme HUIT dimensions que l'archétype
influence : les interlocuteurs, le cycle, le budget probable, le niveau de
formalisation achats, LE MESSAGE, la capacité de delivery, la décision directe
ou collective, LA POSSIBILITÉ D'UN PARTENARIAT. Ce module couvre les DEUX
dernières — la première tranche livrable suggérée par l'épopée #3226
(« commencer par UNE dimension… plutôt que les huit à la fois »), étendue au
partenariat parce que le même verdict (ESN/cabinet de conseil/cabinet de
recrutement face à un autre acteur du marché) répond aux deux à la fois :
NE PAS vendre à un concurrent comme à un client final, et le dire dans le
message ET dans la recommandation d'action (`action_recommender.py`).

Interlocuteurs et cycle : voir `archetype_buyer_hint` (règle de primauté). Les dimensions restantes (budget, formalisation
achats, capacité de delivery) restent HORS de ce lot : elles
recoupent en partie l'axe déjà existant `sales_context.classify_account_
archetype` (9 catégories de taille/secteur, qui calibre déjà le cycle et les
portes d'entrée dans `bellum_strategy.py`) — les brancher sans clarifier la
frontière entre les deux notions d'« archétype » risquerait un double calibrage
contradictoire (GA-26 : un réglage vit à un seul endroit). Voir l'épopée #3226
pour le détail.

Chaque entrée est un JUGEMENT COMMERCIAL écrit une fois, comme `STAGE_PLAYBOOK`
(`esn_stage.py`) — pas une donnée observée : elle ne s'affiche jamais comme un
fait sur LA société, seulement comme une consigne de rédaction/qualification.
"""

from __future__ import annotations

from typing import NamedTuple

from app.services.company_archetype import (
    ArchetypeConfidence,
    ArchetypeVerdict,
    CompanyArchetype,
    confidence_at_least,
)


class ArchetypeCommercialHint(NamedTuple):
    #: Ce que le message doit privilégier/éviter pour CET archétype.
    message_angle: str
    #: Ce compte est-il une cible de vente directe, un partenaire potentiel,
    #: ou les deux — et pourquoi. Jamais un booléen : la nuance est le point.
    partnership_note: str


#: Un archétype absent de cette table n'a, à ce jour, aucun jugement
#: commercial écrit distinct — le nommer ici sans contenu inventerait une
#: nuance qui n'existe pas. `archetype_commercial_hint` rend alors `None`,
#: jamais un texte générique de remplissage.
_ARCHETYPE_COMMERCIAL_HINTS: dict[CompanyArchetype, ArchetypeCommercialHint] = {
    CompanyArchetype.STARTUP: ArchetypeCommercialHint(
        message_angle="vitesse et scalabilité : time-to-market, pas de catalogue de process.",
        partnership_note="cible commerciale directe — pas un partenaire de delivery.",
    ),
    CompanyArchetype.SCALE_UP: ArchetypeCommercialHint(
        message_angle="l'enjeu de structuration RAPIDE des équipes qui suit la croissance, jamais un pitch générique.",
        partnership_note="cible directe ; un partenariat de co-développement reste possible si son cœur de métier est tech.",
    ),
    CompanyArchetype.ENTREPRISE_INNOVANTE_MATURE: ArchetypeCommercialHint(
        message_angle="R&D et différenciation technique — éviter tout discours volume/staffing générique.",
        partnership_note="cible directe.",
    ),
    CompanyArchetype.TPE_PME_TRADITIONNELLE: ArchetypeCommercialHint(
        message_angle="proximité et ROI concret et chiffré — bannir le vocabulaire « transformation digitale ».",
        partnership_note="cible directe, très rarement un partenaire.",
    ),
    CompanyArchetype.ETI: ArchetypeCommercialHint(
        message_angle="structuration et industrialisation ; le message vise un plan de compte multi-contacts, pas un contact unique.",
        partnership_note="cible directe ; sous-traitance croisée possible si elle porte elle-même un pôle IT/ESN interne.",
    ),
    CompanyArchetype.GRAND_GROUPE: ArchetypeCommercialHint(
        message_angle="couverture BU et appel d'offres — jamais une approche mono-contact généraliste.",
        partnership_note="cible directe ET partenaire de co-traitance possible sur les grands programmes.",
    ),
    CompanyArchetype.FILIALE_AUTONOME: ArchetypeCommercialHint(
        message_angle="périmètre et décision LOCALE — ne jamais présumer un achat groupe qu'elle ne porte pas.",
        partnership_note="cible directe, décision propre à l'entité.",
    ),
    CompanyArchetype.FILIALE_INTEGREE: ArchetypeCommercialHint(
        message_angle="nommer le rattachement au groupe et anticiper un circuit d'achat centralisé, pas local.",
        partnership_note="cible indirecte le plus souvent — le budget réel est probablement porté au niveau groupe.",
    ),
    CompanyArchetype.SPIN_OFF: ArchetypeCommercialHint(
        message_angle="la filiation (ex-maison mère) est une preuve de crédibilité à citer, jamais une dépendance à sous-entendre.",
        partnership_note="cible directe, décision souvent plus agile qu'une filiale intégrée.",
    ),
    CompanyArchetype.EDITEUR_LOGICIEL: ArchetypeCommercialHint(
        message_angle="produit et roadmap — un éditeur a déjà sa DSI, « transformation digitale » n'a aucun sens pour lui.",
        partnership_note="partenaire technique/intégration possible, en plus d'être une cible de renfort d'équipe.",
    ),
    CompanyArchetype.SAAS: ArchetypeCommercialHint(
        message_angle="même angle produit qu'un éditeur logiciel, avec un cycle souvent plus court et plus self-service.",
        partnership_note="partenaire d'intégration ou de co-vente possible, en plus d'être une cible.",
    ),
    CompanyArchetype.AGENCE: ArchetypeCommercialHint(
        message_angle="exécution et créa, pas de conseil stratégique — le persona type est opérationnel, pas C-level.",
        partnership_note="partenaire de sous-traitance technique fréquent : l'agence n'a en général pas de dev interne.",
    ),
    CompanyArchetype.ESN: ArchetypeCommercialHint(
        message_angle="NE JAMAIS vendre du staffing comme à un client final — nommer explicitement le partenariat (rang 2, débordement, sous-traitance).",
        partnership_note="partenaire prioritaire (rang 2, sous-traitance croisée) ; rarement un client de prestation.",
    ),
    CompanyArchetype.CABINET_CONSEIL: ArchetypeCommercialHint(
        message_angle="complémentarité métier/tech — jamais un angle de concurrence sur le conseil lui-même.",
        partnership_note="partenaire d'apport d'affaires fréquent (un cabinet de conseil référence des ESN pour l'exécution).",
    ),
    CompanyArchetype.CABINET_RECRUTEMENT: ArchetypeCommercialHint(
        message_angle="distinguer clairement le sourcing (son métier) du staffing/régie (le nôtre) — jamais les confondre dans le même message.",
        partnership_note="partenaire de sourcing possible ; pas un client de prestation.",
    ),
    CompanyArchetype.INDUSTRIEL: ArchetypeCommercialHint(
        message_angle="ancrer sur la maintenance/l'informatique industrielle ; cycle long, comité d'achat formel à anticiper.",
        partnership_note="cible directe, décision quasi systématiquement collective.",
    ),
    CompanyArchetype.ORGANISME_PUBLIC: ArchetypeCommercialHint(
        message_angle="cadre marché public (appel d'offres) à citer explicitement — jamais un ton commercial agressif direct.",
        partnership_note="cible directe via appel d'offres uniquement ; jamais un partenariat informel.",
    ),
    CompanyArchetype.ASSOCIATION: ArchetypeCommercialHint(
        message_angle="budget contraint à nommer explicitement, ton sobre — tout signe de sur-vente s'y voit particulièrement.",
        partnership_note="cible directe, très rarement un partenaire.",
    ),
    CompanyArchetype.ETABLISSEMENT_FINANCIER: ArchetypeCommercialHint(
        message_angle="sécurité et conformité en avant ; cycle long, comité d'achat formel à anticiper.",
        partnership_note="cible directe, décision collective ; jamais un partenariat de delivery direct.",
    ),
    CompanyArchetype.MARKETPLACE: ArchetypeCommercialHint(
        message_angle="scalabilité technique et time-to-market, comme une startup/SaaS, avec un enjeu opérationnel additionnel (logistique/paiement).",
        partnership_note="cible directe.",
    ),
    CompanyArchetype.PURE_PLAYER_NUMERIQUE: ArchetypeCommercialHint(
        message_angle="proximité technique et culture produit — éviter le jargon ESN classique.",
        partnership_note="cible directe ; un partenariat de co-développement reste possible.",
    ),
}


#: Les archétypes dont `partnership_note` ci-dessus recommande un partenariat
#: comme voie FRÉQUENTE (pas seulement « possible » en plus d'être une cible) —
#: le sous-ensemble que `is_partnership_candidate_archetype` rend `True`, pour
#: un appelant (`action_recommender.py`) qui n'a besoin que d'un booléen,
#: jamais du texte complet.
_PARTNERSHIP_CANDIDATE_ARCHETYPES = frozenset(
    {
        CompanyArchetype.ESN,
        CompanyArchetype.CABINET_CONSEIL,
        CompanyArchetype.CABINET_RECRUTEMENT,
        CompanyArchetype.AGENCE,
    }
)


def is_partnership_candidate_archetype(verdict: ArchetypeVerdict | None) -> bool:
    """#3226 (#3202.6) — ce compte est-il, par son archétype, un partenaire
    potentiel plutôt qu'une simple cible ? Même seuil de confiance que
    `archetype_commercial_hint` (≥ POSSIBLE) — jamais affirmé sur un verdict
    trop faible ou absent."""
    if verdict is None or not confidence_at_least(verdict.confidence, ArchetypeConfidence.POSSIBLE):
        return False
    return verdict.archetype in _PARTNERSHIP_CANDIDATE_ARCHETYPES


def archetype_commercial_hint(verdict: ArchetypeVerdict | None) -> ArchetypeCommercialHint | None:
    """``None`` sans verdict, sur un verdict `NOT_ESTABLISHED`, ou sous
    `POSSIBLE` — jamais un angle affirmé sur un archétype qu'on n'a pas établi
    (doctrine : un axe non évaluable est nommé, jamais deviné). ``None`` aussi
    pour un archétype établi mais sans jugement commercial écrit ci-dessus."""
    if verdict is None or not confidence_at_least(verdict.confidence, ArchetypeConfidence.POSSIBLE):
        return None
    return _ARCHETYPE_COMMERCIAL_HINTS.get(verdict.archetype)


class ArchetypeBuyerHint(NamedTuple):
    #: Qui viser chez ce type de compte.
    interlocutors: str
    #: Ce que le cycle d'achat de ce type de compte impose au séquencement.
    cycle: str
    #: #3202.6 — décision directe ou collective. Vide quand aucune phrase source
    #: n'existe : la ligne ne s'écrit alors pas (jamais une nuance inventée).
    decision: str = ""
    #: #3202.6 — niveau de formalisation des achats. Même règle : vide sans source.
    procurement_formality: str = ""


#: #3226 (#3202.6, dimensions INTERLOCUTEURS + CYCLE) — RECOUPÉ des jugements
#: déjà écrits ci-dessus (`message_angle`/`partnership_note`), jamais une
#: nuance neuve : un archétype sans phrase source n'a pas d'entrée ici.
_ARCHETYPE_BUYER_HINTS: dict[CompanyArchetype, ArchetypeBuyerHint] = {
    CompanyArchetype.INDUSTRIEL: ArchetypeBuyerHint(
        "décision collective : viser la maintenance / l'informatique industrielle, sans présumer un décideur unique.",
        "cycle long, comité d'achat formel à anticiper.",
        "collective — pas de décideur unique présumé.",
        "formelle : comité d'achat à anticiper.",
    ),
    CompanyArchetype.ETABLISSEMENT_FINANCIER: ArchetypeBuyerHint(
        "décision collective : viser la sécurité / conformité en plus du métier demandeur.",
        "cycle long, comité d'achat formel à anticiper.",
        "collective — sécurité / conformité en plus du métier demandeur.",
        "formelle : comité d'achat à anticiper.",
    ),
    CompanyArchetype.ORGANISME_PUBLIC: ArchetypeBuyerHint(
        "passer par le service achats / marchés : pas d'approche commerciale directe auprès du métier.",
        "cadre marché public : le calendrier suit l'appel d'offres, jamais un relance agressive.",
        "via le service achats / marchés, pas une approche directe auprès du métier.",
        "formelle : cadre marché public, calendrier de l'appel d'offres.",
    ),
    CompanyArchetype.AGENCE: ArchetypeBuyerHint(
        "persona opérationnel (production, technique), pas C-level.",
        "décision de l'agence seule — pas de comité formel déclaré.",
        "directe : l'agence décide seule.",
        "aucun comité formel déclaré.",
    ),
    CompanyArchetype.GRAND_GROUPE: ArchetypeBuyerHint(
        "couverture par BU : plusieurs contacts, jamais une approche mono-contact généraliste.",
        "passe par l'appel d'offres — prévoir le séquencement en conséquence.",
        "collective : par BU, plusieurs contacts.",
        "formelle : passe par l'appel d'offres.",
    ),
    CompanyArchetype.ETI: ArchetypeBuyerHint(
        "plan de compte multi-contacts, pas un contact unique.",
        "structuration en cours : pas de délai déclaré plus précis.",
        "multi-contacts, pas un contact unique.",
    ),
    CompanyArchetype.FILIALE_INTEGREE: ArchetypeBuyerHint(
        "viser aussi le niveau groupe : le budget réel y est probablement porté.",
        "circuit d'achat centralisé, pas local.",
        "portée au niveau groupe.",
        "centralisée : circuit d'achat du groupe.",
    ),
    CompanyArchetype.FILIALE_AUTONOME: ArchetypeBuyerHint(
        "viser l'entité elle-même : sa décision est locale, jamais présumée groupe.",
        "décision propre à l'entité.",
        "locale à l'entité, jamais présumée groupe.",
    ),
    CompanyArchetype.SAAS: ArchetypeBuyerHint(
        "équipe produit / technique.",
        "cycle souvent plus court et plus self-service.",
        "portée par l'équipe produit / technique.",
        "plutôt self-service.",
    ),
}


def archetype_buyer_hint(
    verdict: ArchetypeVerdict | None, size_sector_archetype: str | None
) -> ArchetypeBuyerHint | None:
    """#3226 (#3202.6) — INTERLOCUTEURS + CYCLE selon la NATURE commerciale.

    RÈGLE DE PRIMAUTÉ (la décision d'architecture que les lots E9/S02/M07/E16/I01
    attendaient ; tranché sans Louis) : `sales_context.ACCOUNT_ARCHETYPES`
    (taille/secteur) calibre DÉJÀ le cycle et les portes d'entrée
    (`action_recommender.py`). Quand il a un verdict (≠ vide, ≠ `inconnu`), il
    GAGNE et cette nature se TAIT sur ces deux dimensions — jamais deux réponses
    à « qui dois-je voir ». Elle ne parle que lorsque le compte n'est pas classé
    en taille/secteur. Message, partenariat et décision restent, eux, des axes
    orthogonaux (aucun équivalent existant)."""
    if (size_sector_archetype or "").strip() not in ("", "inconnu"):
        return None
    if verdict is None or not confidence_at_least(verdict.confidence, ArchetypeConfidence.POSSIBLE):
        return None
    return _ARCHETYPE_BUYER_HINTS.get(verdict.archetype)


def archetype_buyer_block(hint: ArchetypeBuyerHint | None, company_name: str) -> str:
    """Bloc de prompt PLAN ; ``""`` sans jugement : jamais une ligne devinée."""
    if hint is None:
        return ""
    return (
        f"\n\n===== INTERLOCUTEURS ET CYCLE — NATURE DE {company_name} (#3202.6) =====\n"
        f"Interlocuteurs : {hint.interlocutors}\n"
        f"Cycle : {hint.cycle}\n"
        + (f"Décision : {hint.decision}\n" if hint.decision else "")
        + (f"Formalisation achats : {hint.procurement_formality}\n" if hint.procurement_formality else "")
        + "Consigne de qualification issue de la nature du compte, pas un fait observé sur lui."
    )


__all__ = [
    "ArchetypeBuyerHint",
    "ArchetypeCommercialHint",
    "archetype_buyer_block",
    "archetype_buyer_hint",
    "archetype_commercial_hint",
    "is_partnership_candidate_archetype",
]
