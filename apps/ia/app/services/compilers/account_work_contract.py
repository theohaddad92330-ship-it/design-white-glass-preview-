"""#2300 LAU-FINAL-041 — LE CONTRAT DE TRAVAIL DE COMPTE (« compilateur de
chat »), registre `.claude/notes/registre-2026-09-18-chat-account-work-contract.md`.

Mesuré le 22/09/2026 : `git grep -ln -E 'def compile[A-Za-z_]*\\('` ne rendait
RIEN dans `apps` ni `packages` — aucun compilateur n'existait, malgré les
34 fonctions déjà présentes dans `chat_tools.py`. « Les ingrédients existent
presque tous, le plat n'existe pas. »

Ce module compile en UN objet nommé :
  1. l'OBJECTIF CANONIQUE (dix-sept valeurs, #2300.1-.17) — absent avant ce
     lot comme catalogue unifié. Quatre de ces dix-sept sont déjà couvertes
     par un mécanisme existant ailleurs (`already_covered_by`) : NOMMÉES ici
     pour un catalogue complet, jamais RÉIMPLÉMENTÉES (GA-26) ;
  2. les CHAMPS INTERNES marqués `retenu` au registre (#2300.22, .25, .30,
     .32, .33, .36, .40-.45, .52, .54-.56).

Discipline identique au prior art `apps/ia/app/models/request_intent_contract.py`
(#2257) : un champ que l'appelant ne fournit pas est OMIS du contrat, jamais
mis à `null` ni deviné (doctrine « jamais de donnée fictive », GA-18/GA-19 —
« non mesuré » n'est jamais 0/null).

Pure — aucune I/O, aucune écriture. L'ownership du compte est vérifiée par
l'appelant (`chat_tools.execute_chat_tool`), avant que ce module ne voie
l'`account_id` — comme tous les autres compilateurs de ce fichier.
"""

from __future__ import annotations

import unicodedata
from typing import Any, NamedTuple


class CanonicalGoal(NamedTuple):
    """Un des dix-sept objectifs canoniques de travail sur un compte."""

    id: str
    label_fr: str
    label_en: str
    # Mots/phrases (français, insensibles aux accents et à la casse) dont la
    # PRÉSENCE dans le texte libre suffit à reconnaître cet objectif.
    keywords: tuple[str, ...]
    # Nom du mécanisme qui couvre DÉJÀ cet objectif ailleurs dans le dépôt
    # (déjà là au registre) — `None` quand rien ne le couvre encore
    # (`retenu`). Jamais réimplémenté ici, seulement référencé.
    already_covered_by: str | None = None


# #2300.1-.17 — LE CATALOGUE. Treize sont `retenu` (aucune valeur nommée
# n'existait avant ce lot) ; quatre sont `déjà là` (référencées, pas refaites).
CANONICAL_ACCOUNT_GOALS: tuple[CanonicalGoal, ...] = (
    # 2300.1 — retenu.
    CanonicalGoal(
        id="ouvrir_compte_froid",
        label_fr="Ouvrir un compte froid",
        label_en="Open a cold account",
        keywords=("compte froid", "ouvrir ce compte", "premier contact avec ce compte"),
    ),
    # 2300.2 — retenu.
    CanonicalGoal(
        id="developper_compte_client",
        label_fr="Développer un compte client",
        label_en="Grow an existing client account",
        keywords=("developper ce compte", "developper le compte client", "vendre plus a ce client"),
    ),
    # 2300.3 — retenu.
    CanonicalGoal(
        id="reactiver_relation",
        label_fr="Réactiver une relation",
        label_en="Reactivate a relationship",
        keywords=("reactiver une relation", "relation qui s'est refroidie", "relance a froid", "relation endormie"),
    ),
    # 2300.4 — retenu.
    CanonicalGoal(
        id="qualifier_besoin_projet",
        label_fr="Qualifier un besoin ou un projet",
        label_en="Qualify a need or a project",
        keywords=("qualifier un besoin", "qualifier un projet", "cerner le projet"),
    ),
    # 2300.5 — retenu.
    CanonicalGoal(
        id="trouver_bons_interlocuteurs",
        label_fr="Trouver les bons interlocuteurs",
        label_en="Find the right stakeholders",
        keywords=("trouver les bons interlocuteurs", "qui approcher sur ce compte", "identifier les decideurs"),
    ),
    # 2300.6 — retenu.
    CanonicalGoal(
        id="preparer_referencement",
        label_fr="Préparer un référencement",
        label_en="Prepare a vendor referencing",
        keywords=("preparer un referencement", "devenir reference", "entrer au referencement"),
    ),
    # 2300.7 — déjà là : `GET_ACCOUNT_ACCESS_TOOL` (`get_account_access`,
    # chat_tools.py) et la suggestion d'accueil `findAccessPath`.
    CanonicalGoal(
        id="trouver_filiale_site_accessible",
        label_fr="Trouver une filiale ou un site accessible",
        label_en="Find an accessible subsidiary or site",
        keywords=("filiale accessible", "site accessible", "chemin d'acces sur ce compte"),
        already_covered_by="get_account_access",
    ),
    # 2300.8 — retenu.
    CanonicalGoal(
        id="preparer_rendez_vous",
        label_fr="Préparer un rendez-vous",
        label_en="Prepare a meeting",
        keywords=("preparer un rendez-vous", "preparer un rdv", "brief avant un call"),
    ),
    # 2300.9 — retenu.
    CanonicalGoal(
        id="preparer_revue_compte",
        label_fr="Préparer une revue de compte",
        label_en="Prepare an account review",
        keywords=("revue de compte", "bilan du compte", "point d'etape sur ce compte"),
    ),
    # 2300.10 — retenu.
    CanonicalGoal(
        id="preparer_approche_partenaire",
        label_fr="Préparer une approche partenaire ou rang 2",
        label_en="Prepare a partner or tier-2 approach",
        keywords=("approche partenaire", "rang 2", "passer par un partenaire"),
    ),
    # 2300.11 — déjà là : la suggestion d'accueil `consultantAvailable` et
    # `chatCommands.moments.position_consultant` (apps/web/src/i18n/locales).
    CanonicalGoal(
        id="positionner_consultant",
        label_fr="Positionner un consultant",
        label_en="Position a consultant",
        keywords=("positionner un consultant", "placer un consultant", "proposer un profil"),
        already_covered_by="search_talents",
    ),
    # 2300.12 — retenu.
    CanonicalGoal(
        id="preparer_renouvellement",
        label_fr="Préparer un renouvellement",
        label_en="Prepare a renewal",
        keywords=("preparer un renouvellement", "renouveler la mission", "reconduire le contrat"),
    ),
    # 2300.13 — retenu.
    CanonicalGoal(
        id="identifier_voie_achat",
        label_fr="Identifier une voie d'achat",
        label_en="Identify a buying path",
        keywords=("voie d'achat", "comment ce compte achete", "circuit d'achat"),
    ),
    # 2300.14 — retenu.
    CanonicalGoal(
        id="actualiser_dossier",
        label_fr="Actualiser un dossier",
        label_en="Refresh a dossier",
        keywords=("actualiser ce dossier", "rafraichir le dossier", "dossier perime"),
    ),
    # 2300.15 — retenu (recoupe #2303, comparateur multi-périmètre — non
    # réimplémenté ici, seulement nommé comme objectif).
    CanonicalGoal(
        id="comparer_perimetres",
        label_fr="Comparer plusieurs périmètres",
        label_en="Compare several scopes",
        keywords=("comparer plusieurs comptes", "comparer ces perimetres", "comparer ces comptes"),
    ),
    # 2300.16 — déjà là : `CHAIN_BLOCKERS_TOOL` (`get_chain_blockers`, chat_tools.py).
    CanonicalGoal(
        id="comprendre_blocage_compte",
        label_fr="Comprendre pourquoi le compte n'avance pas",
        label_en="Understand why the account is stuck",
        keywords=("pourquoi ce compte n'avance pas", "pourquoi ca bloque", "le compte est bloque"),
        already_covered_by="get_chain_blockers",
    ),
    # 2300.17 — déjà là : `commercial_status` ('watching'/'archived',
    # packages/contracts/src/schemas/account-board.ts).
    CanonicalGoal(
        id="decider_veille_ou_ecart",
        label_fr="Décider de mettre en veille ou d'écarter",
        label_en="Decide to put on watch or archive",
        keywords=("mettre en veille", "ecarter ce compte", "mettre de cote ce compte"),
        already_covered_by="commercial_status",
    ),
)


def _normalise(text: str) -> str:
    """Minuscule, sans accents — pour une reconnaissance de mot-clé qui ne
    dépend ni de la casse ni des accents."""
    folded = unicodedata.normalize("NFKD", text.lower())
    return "".join(ch for ch in folded if not unicodedata.combining(ch))


def canonical_goals_catalog() -> list[dict[str, str]]:
    """Le catalogue à donner au modèle : id + libellés, JAMAIS le mécanisme
    interne (`already_covered_by`, ni les mots-clés) — un détail d'implémentation
    que Laura n'a aucune raison de lire."""
    return [{"id": g.id, "label_fr": g.label_fr, "label_en": g.label_en} for g in CANONICAL_ACCOUNT_GOALS]


def identify_canonical_goal(raw_goal: str | None) -> CanonicalGoal | None:
    """Rapproche un texte libre d'UN objectif canonique — jamais deviné :
    `None` sans texte, et `None` si aucun mot-clé ne correspond (un but hors
    catalogue reste `objective_raw`, jamais forcé dans un id inventé)."""
    if not raw_goal or not raw_goal.strip():
        return None
    haystack = _normalise(raw_goal)
    for goal in CANONICAL_ACCOUNT_GOALS:
        for keyword in goal.keywords:
            if _normalise(keyword) in haystack:
                return goal
    return None


def _clean_str(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _clean_str_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return [v.strip() for v in values if isinstance(v, str) and v.strip()]


def _clean_assumptions(values: Any) -> list[dict[str, str]]:
    """#2300.36 — chaque hypothèse porte sa PROVENANCE : une paire incomplète
    (l'un des deux champs manquant ou vide) est écartée plutôt que relayée à
    moitié — une hypothèse sans source n'est pas mieux qu'une hypothèse nue."""
    if not isinstance(values, list):
        return []
    cleaned: list[dict[str, str]] = []
    for item in values:
        if not isinstance(item, dict):
            continue
        assumption = _clean_str(item.get("assumption"))
        source = _clean_str(item.get("source"))
        if assumption and source:
            cleaned.append({"assumption": assumption, "source": source})
    return cleaned


def compile_account_work_contract(
    *,
    account_id: str,
    raw_goal: str | None = None,
    offer_or_expertise: str | None = None,
    territory: str | None = None,
    horizon: str | None = None,
    expected_result: str | None = None,
    desired_format: str | None = None,
    implicit_exclusions: list[str] | None = None,
    assumptions: list[dict[str, str]] | None = None,
    primary_result_kind: str | None = None,
    secondary_steps: list[str] | None = None,
) -> dict[str, Any]:
    """Compile le contrat de travail d'UN compte. Pure — aucune I/O.

    Chaque champ non fourni (ou vide après nettoyage) est OMIS du contrat,
    jamais mis à `null` : un appelant qui lit `"territory" not in contract`
    sait que rien n'a été dit, ce qui diffère d'un territoire vide.
    """
    cleaned_goal = _clean_str(raw_goal)
    matched = identify_canonical_goal(cleaned_goal)
    # #2300.56 — LE NO-GO EXPLICITE : un objectif est « identifié » dès que
    # Laura en a nommé UN (catalogué ou non) — jamais quand rien n'a été dit.
    identified = bool(matched or cleaned_goal)

    contract: dict[str, Any] = {
        # #2300.18 / #2300.52 — la clé qui attache ce contrat au COMPTE, donc
        # au MÊME dossier d'analyse : `raw_analysis` vit sur `accounts.id`,
        # aucune nouvelle table n'est nécessaire pour cette attache.
        "account_id": account_id,
        # #2300.54 / #2300.55 — identifiant STABLE (compte + objectif) que
        # Laura peut citer sur un résultat ou une action produits dans le
        # même tour, pour les rattacher à ce contrat sans plomberie nouvelle.
        "contract_id": f"{account_id}:{matched.id if matched else 'sans-objectif'}",
        "identified": identified,
        # #2300.1-.17 — le catalogue voyage TOUJOURS avec le contrat : Laura
        # doit pouvoir choisir dedans, jamais deviner ses dix-sept valeurs.
        "canonical_goals": canonical_goals_catalog(),
    }
    if matched:
        contract["objective"] = {"id": matched.id, "label_fr": matched.label_fr, "label_en": matched.label_en}
    if cleaned_goal:
        contract["objective_raw"] = cleaned_goal
    if not identified:
        # #2300.56 — la garde qui EMPÊCHE un plan générique, portée par le
        # contenu du contrat lui-même : le modèle qui l'ignorerait le ferait
        # contre une consigne explicite, jamais par silence du contrat.
        contract["guidance"] = (
            "Aucun objectif de travail identifié pour ce compte : ne produis PAS de plan générique. "
            "Choisis un objectif dans `canonical_goals`, ou nomme-le dans `raw_goal`, puis rappelle cet outil."
        )

    # #2300.22 / #2300.40 — offre ou expertise mobilisée (déduite ou dite).
    offer = _clean_str(offer_or_expertise)
    if offer:
        contract["offer_or_expertise"] = offer
    # #2300.25 / #2300.41 — territoire visé (déduit ou dit).
    territory_clean = _clean_str(territory)
    if territory_clean:
        contract["territory"] = territory_clean
    # #2300.30 — horizon.
    horizon_clean = _clean_str(horizon)
    if horizon_clean:
        contract["horizon"] = horizon_clean
    # #2300.32 / #2300.42 — résultat attendu (déduit ou dit).
    expected_clean = _clean_str(expected_result)
    if expected_clean:
        contract["expected_result"] = expected_clean
    # #2300.33 — format souhaité.
    format_clean = _clean_str(desired_format)
    if format_clean:
        contract["desired_format"] = format_clean
    # #2300.43 — exclusions IMPLICITES (déduites), distinctes des exclusions
    # explicites déjà portées ailleurs par `ThreadState.excluded` (#2300.31,
    # déjà là — non dupliquées ici).
    exclusions_clean = _clean_str_list(implicit_exclusions)
    if exclusions_clean:
        contract["implicit_exclusions"] = exclusions_clean
    # #2300.36 — provenance des hypothèses.
    assumptions_clean = _clean_assumptions(assumptions)
    if assumptions_clean:
        contract["assumptions_provenance"] = assumptions_clean
    # #2300.44 / #2300.45 — le résultat PRINCIPAL et ses sous-tâches restent
    # deux champs distincts : une sous-tâche ne remplace jamais le résultat
    # principal, elle est nommée À CÔTÉ.
    primary_clean = _clean_str(primary_result_kind)
    if primary_clean:
        contract["primary_result_kind"] = primary_clean
    secondary_clean = _clean_str_list(secondary_steps)
    if secondary_clean:
        contract["secondary_steps"] = secondary_clean

    return contract
