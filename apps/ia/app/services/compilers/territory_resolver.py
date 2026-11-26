"""#2302 (LAU-FINAL-043) — le résolveur de territoire commercial.

⚠️ ARBITRAGE LOUIS 18/09/2026 (doctrine c83, `doctrine-registry.ts`) : « territoire »
et « nœud de graphe d'organisation » sont DEUX AXES SÉPARÉS.

* **Ici** : un NIVEAU DE COMPTE — quel périmètre adresser dans un compte pour une
  approche commerciale (le groupe entier ? une filiale ? une BU ? un site ?).
  Vocabulaire : :data:`TERRITORY_LEVELS`, miroir de `territoryLevelSchema`
  (``packages/contracts/src/schemas/analysis/primitives.ts``).
* **Ailleurs** (#2310, lot frère) : un NŒUD DE GRAPHE D'ORGANISATION —
  ``orgEntityTypeSchema`` (``packages/contracts/src/schemas/org-graph.ts``),
  qui porte notamment ``'programme'`` et ``'site'`` comme des nœuds/overlays du
  graphe. Ces deux valeurs N'APPARAISSENT PAS dans :data:`TERRITORY_LEVELS` —
  un point qui les demanderait comme « niveau de territoire » renvoie vers
  l'AUTRE axe plutôt que d'être dupliqué (GA-26).

Ce module ne RECALCULE aucun classement : il lit les entités déjà annotées par
``app.services.entities`` (``type`` / ``relevance`` / ``relevanceReason`` /
``actionable`` — le même contrat que ``entityNodeSchema``,
``packages/contracts/src/schemas/analysis/research.ts``) et recommande un
périmètre. Le filtrage du bruit (SPV/cédée/homonyme/bruit) N'EST PAS reproduit
ici : une entité déjà marquée non actionnable reste visible dans ``excluded``
avec son motif (#2302.45 — jamais supprimée), elle n'est simplement jamais un
candidat.

Doctrine : jamais de donnée fictive (CLAUDE.md) — un champ absent d'une entité
part dans ``inconnues``, jamais un zéro ni une valeur devinée (GA-18/GA-19).
Une liste vide se dit « rien d'observé », jamais « aucune entreprise » (GA-259).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from app.services.text_norm import normalize_name

# ── L'axe « niveau de territoire » (NIVEAU DE COMPTE) ────────────────────────
#
# Mirror EXACT (mêmes chaînes) de `territoryLevelSchema`
# (packages/contracts/src/schemas/analysis/primitives.ts) — verrouillé par
# `tests/test_territory_resolver.py::TestTerritoryLevels` côté Python et par
# `primitives.test.ts` côté TS. Additif seulement (GA-08) : ces valeurs partent
# dans un résultat de conversation, jamais dans `raw_analysis`, mais la même
# discipline évite qu'un renommage silencieux casse un fil en cours.
TERRITORY_LEVELS: tuple[str, ...] = (
    "groupe",
    "maison_mere",
    "filiale",
    "sous_filiale",
    "bu",
    "direction",
    "entite_juridique",
    "marque",
    "etablissement",
    "region",
    "pays",
)

# ── De la qualification d'entité (`entities.py` / `entityTypeSchema`) vers un
#    niveau de territoire ─────────────────────────────────────────────────────
#
# Ce n'est PAS un second classement : c'est une simple PROJECTION du type déjà
# posé par `classify_entity_type` (ou par le LLM, `EntityExhaustive.type`) sur
# le vocabulaire du territoire. Un type non listé ici (SPV/cedee/homonyme/bruit
# — déjà écartés par `actionable=False` avant d'atteindre cette table — ou un
# type structural inconnu) ne devient jamais un candidat : nommé absent, jamais
# deviné.
#
# ⚠️ 'programme' / 'projet' / 'site' / 'usine' N'ONT VOLONTAIREMENT AUCUNE
# entrée : ce sont des nœuds de l'AUTRE axe (org-graph.ts). `entities.py` ne les
# assigne d'ailleurs jamais comme `type` (voir `_ENTITY_TREE_RANK`, qui les
# range déjà parmi les « types qualificatifs/géo/overlay »).
#
# #2302.2/.11/.12/.13 (épopée #2961, tranché sans Louis) : 'maison_mere' /
# 'etablissement' / 'region' / 'pays' étaient déjà dans TERRITORY_LEVELS mais
# n'avaient AUCUNE entrée ici — 0 candidat ne pouvait jamais y être classé
# (constat de l'audit du 25/09/2026). `classify_entity_type` (entities.py)
# recopie tel quel le `structural_type` que le LLM pose sur une entité
# operating quand ce n'est ni un type non-actionnable ni une IT arm — ces
# quatre chaînes sont donc de VRAIES valeurs de `type` possibles, jamais
# devinées ici.
_ENTITY_TYPE_TO_LEVEL: dict[str, str] = {
    "groupe": "groupe",
    "maison_mere": "maison_mere",
    "filiale": "filiale",
    "filiale_strategique": "filiale",
    "operational": "filiale",
    "bu": "bu",
    "business unit": "bu",
    "direction": "direction",
    "departement": "direction",
    "marque": "marque",
    "etablissement": "etablissement",
    "region": "region",
    "pays": "pays",
}

# Types dont le classement `entities.py` dit déjà « non actionnable » — repris
# ici uniquement pour le motif par défaut si `relevanceReason` manque (jamais
# recalculés).
_NON_ACTIONABLE_RELEVANCE = frozenset({"noise", "out_of_sector"})

# Les champs de sortie qu'on tente de restituer par territoire (#2302.46-58,
# hors `type`/`level` toujours présents). Sert à calculer `inconnues` ET
# `confiance` sur la MÊME base — un champ qui ne serait compté que d'un côté
# ferait mentir l'autre. `taille` (#2302.19) = `estimated_headcount`, déjà
# collecté par entities.py (`entityNodeSchema.estimated_headcount`) mais
# jamais restitué par le résolveur avant.
_OUTPUT_FIELDS = (
    "rattachement",
    "localisation",
    "autonomie_probable",
    "pertinence_offre",
    "contacts_connus",
    "taille",
    "achats",
)

# ── Préférence sectorielle (#2302.29-33) ─────────────────────────────────────
#
# L'ORDRE de préférence des niveaux de territoire pour cinq secteurs cadrés par
# l'issue. Chaque tuple est délibérément DIFFÉRENT des quatre autres — pas
# seulement réordonné — pour tenir #2302.34 (NO-GO : jamais la même structure
# de territoire pour tous les marchés) ; verrouillé par
# `TestPreferenceSectorielle::test_aucune_paire_de_secteurs_ne_partage_la_meme_structure`.
#
# 'etablissement' est le niveau visé par « site »/« usine » dans la formulation
# de l'issue — HONNÊTETÉ : `_ENTITY_TYPE_TO_LEVEL` ne le produit encore JAMAIS
# depuis les données actuelles (aucune entité annotée ne porte ce type), donc
# ce choix ne gagne pas tant qu'aucun candidat ne le porte. Le classement
# retombe alors sur le niveau suivant de la préférence — jamais sur le groupe
# (#2302.64, gardé séparément).
SECTOR_TERRITORY_PREFERENCE: dict[str, tuple[str, ...]] = {
    "it_data_cyber": ("direction", "bu", "filiale", "entite_juridique"),
    "industrie": ("etablissement", "filiale", "bu"),
    "environnement": ("etablissement", "direction", "filiale"),
    "automobile": ("etablissement", "bu", "direction"),
    "pharma": ("etablissement", "entite_juridique", "direction"),
}


def _name_of(entity: Mapping[str, Any]) -> str | None:
    name = entity.get("name")
    return name if isinstance(name, str) and name.strip() else None


def _confidence(unknowns: Sequence[str]) -> str:
    """Confiance grossière (#2302.58) — trois paliers NOMMÉS, jamais un
    pourcentage inventé. `known` compte les champs de :data:`_OUTPUT_FIELDS`
    effectivement restitués."""
    known = len(_OUTPUT_FIELDS) - len(unknowns)
    if known >= 4:
        return "haute"
    if known >= 2:
        return "moyenne"
    return "faible"


def _level_for(entity_type: str, parent_name: str | None, type_by_name: Mapping[str, str]) -> str | None:
    level = _ENTITY_TYPE_TO_LEVEL.get(entity_type) or _ENTITY_TYPE_TO_LEVEL.get(entity_type.lower())
    if level is None:
        return None
    # #2302.4 — une filiale dont le PARENT est lui-même une filiale (pas le
    # groupe racine) est une sous-filiale. Dérivé de la chaîne `parent` déjà
    # posée par `assign_entity_parents` — jamais un second classement du nom.
    if level == "filiale" and parent_name:
        parent_type = type_by_name.get(parent_name)
        parent_level = _ENTITY_TYPE_TO_LEVEL.get(parent_type or "") if parent_type else None
        if parent_level == "filiale":
            return "sous_filiale"
    return level


def _purchasing_by_normalized_name(
    purchasing_by_buyer: Sequence[Mapping[str, Any]] | None,
) -> dict[str, dict[str, Any]]:
    """Indexe `purchasingThread.byBuyer` (marchés DECP attribués, déjà groupés
    par entité acheteuse — `purchasing_thread.py::build_purchasing_thread`) par
    nom normalisé, pour l'apparier aux candidats du résolveur. Aucune ligne
    n'est recalculée : on relit `contractsAwarded` / `lastAwardedDate` /
    `suppliers` tels que le thread achats les a déjà posés."""
    by_name: dict[str, dict[str, Any]] = {}
    for row in purchasing_by_buyer or []:
        if not isinstance(row, Mapping):
            continue
        name = row.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        by_name[normalize_name(name)] = dict(row)
    return by_name


def resolve_commercial_territory(
    entities: Sequence[Mapping[str, Any]] | None,
    *,
    sector: str | None = None,
    purchasing_by_buyer: Sequence[Mapping[str, Any]] | None = None,
    preferred_regions: Sequence[str] | None = None,
    recent_signals: Sequence[Mapping[str, Any]] | None = None,
    reference_accounts: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Recommande un périmètre commercial (« territoire ») à partir des entités
    déjà annotées d'un compte.

    ``purchasing_by_buyer`` = ``raw_analysis.purchasingThread.byBuyer``
    (#2302.22/.26/.53/.55) — les marchés publics DECP déjà attribués, déjà
    groupés par entité acheteuse. Un territoire qui y apparaît restitue ses
    achats (#2302.55) et le recours externe déjà observé, càd les concurrents
    déjà titulaires (#2302.53) — et cette même présence est un signal réel
    (achats + historique de recours externe, #2302.26/.22) qui le fait
    préférer à un territoire sans aucun marché connu.

    ``preferred_regions`` = la géographie visée par l'ESN, déjà déclarée à
    l'onboarding (``ideal_client_territory``, #2302.18) — un territoire dont la
    région y correspond (comparaison normalisée, accent/casse insensible) est
    préféré, à niveau et préférence sectorielle égaux.

    ``recent_signals`` = ``raw_analysis.recent_signals`` (#2302.21, épopée
    #2961, tranché sans Louis) — `recentSignalSchema` n'a AUCUN champ de
    liaison vers une entité (texte libre account-level, même limite déjà
    documentée pour #2687 : apparier sur le texte serait un rapprochement par
    proximité, pire que l'absence). Un signal n'étant JAMAIS collecté à un
    niveau plus fin que le compte, il est restitué uniquement sur le
    territoire RACINE (``groupe``/``maison_mere``) — jamais deviné sur une
    filiale/BU, et jamais utilisé pour départager le classement (aucune règle
    produit ne dit qu'un signal doit peser plus qu'un autre critère).

    ``reference_accounts`` = ``profile_data.reference_accounts`` (#2302.28,
    épopée #2961, tranché sans Louis) — les comptes de référence NOMMÉS que
    l'ESN a déclarés à l'onboarding, désormais collectés en STRUCTURÉ (un nom
    par entrée, colonne `esn_profiles.reference_accounts`) plutôt qu'en texte
    libre (`case_study_results`, dont aucun nom n'était extractible sans
    invention — doctrine « jamais deviné »). Une référence n'est déclarée à
    AUCUNE entité précise du compte visé : apparier un nom de référence à une
    filiale/BU serait le même rapprochement par proximité, écarté pour les
    mêmes raisons que `recent_signals` ci-dessus. Restituée donc, elle aussi,
    uniquement sur le territoire RACINE — un fait réel (ces références
    existent) plutôt qu'un lien inventé (cette référence concerne CE territoire).

    Retourne toujours les six clés ``candidates`` / ``primary`` /
    ``primary_reason`` / ``alternate`` / ``excluded`` / ``unknowns`` — jamais
    une clé manquante que l'appelant devrait deviner.
    """
    signals_count = sum(1 for s in (recent_signals or []) if isinstance(s, Mapping))
    named_reference_accounts = [
        name.strip() for name in (reference_accounts or []) if isinstance(name, str) and name.strip()
    ]
    items = [dict(e) for e in (entities or []) if isinstance(e, Mapping)]

    if not items:
        return {
            "candidates": [],
            "primary": None,
            # GA-259 : ce qu'on SAIT, jamais ce que le marché FAIT.
            "primary_reason": "rien d'observé",
            "alternate": None,
            "excluded": [],
            "unknowns": ["candidat"],
        }

    type_by_name = {
        str(e.get("name")): str(e.get("type") or "").strip() for e in items if isinstance(e.get("name"), str)
    }
    purchasing_by_name = _purchasing_by_normalized_name(purchasing_by_buyer)

    candidates: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []

    for raw in items:
        name = _name_of(raw)
        entity_type = str(raw.get("type") or "").strip()
        relevance = raw.get("relevance")
        actionable = raw.get("actionable")

        # Non actionnable (bruit/SPV/cédée/homonyme/hors secteur) — visible,
        # jamais supprimée (#2302.45), jamais un candidat.
        if actionable is False or relevance in _NON_ACTIONABLE_RELEVANCE:
            excluded.append(
                {
                    "name": name,
                    "type": entity_type or None,
                    "reason": raw.get("relevanceReason") or "non actionnable",
                }
            )
            continue

        autonomy = raw.get("it_autonomy") or raw.get("itAutonomy")

        # #2302.41 — une marque dont l'autonomie IT n'a jamais été observée
        # n'est pas une cible commerciale distincte : elle reste attachée à sa
        # maison mère, motif nommé plutôt que candidate à tort.
        if entity_type.lower() == "marque" and not autonomy:
            excluded.append({"name": name, "type": entity_type, "reason": "marque sans autonomie déclarée"})
            continue

        # #2302.38/.44 — masquage par défaut d'une entité INACTIVE et d'une
        # adresse administrative sans équipe. `is False` explicitement : `None`
        # (non mentionné dans les sources) n'exclut JAMAIS — seule une preuve
        # positive (bellum_facts.py: "ne devine JAMAIS") écarte.
        is_active = raw.get("is_active", raw.get("isActive"))
        if is_active is False:
            excluded.append({"name": name, "type": entity_type or None, "reason": "entité inactive"})
            continue
        has_team = raw.get("has_team", raw.get("hasTeam"))
        if has_team is False:
            excluded.append({"name": name, "type": entity_type or None, "reason": "adresse administrative sans équipe"})
            continue

        parent_name = raw.get("parent") or raw.get("parentId")
        level = _level_for(entity_type, parent_name if isinstance(parent_name, str) else None, type_by_name)
        if level is None:
            # Type hors du vocabulaire territoire (ex. un overlay de l'AUTRE
            # axe qui aurait fuité ici) — jamais deviné, jamais un candidat.
            continue

        candidate: dict[str, Any] = {"name": name, "level": level, "type": entity_type}
        unknowns: list[str] = []

        if parent_name:
            candidate["rattachement"] = parent_name
        else:
            unknowns.append("rattachement")

        region = raw.get("region")
        if region:
            candidate["localisation"] = region
        else:
            unknowns.append("localisation")

        if autonomy:
            candidate["autonomie_probable"] = autonomy
        else:
            unknowns.append("autonomie_probable")

        if relevance:
            candidate["pertinence_offre"] = relevance
        else:
            unknowns.append("pertinence_offre")

        contacts_count = raw.get("contactsCount") if isinstance(raw.get("contactsCount"), int) else None
        if contacts_count is not None:
            candidate["contacts_connus"] = contacts_count
        else:
            unknowns.append("contacts_connus")

        headcount = raw.get("estimated_headcount") or raw.get("estimatedHeadcount")
        if headcount:
            candidate["taille"] = headcount
        else:
            unknowns.append("taille")

        purchasing = purchasing_by_name.get(normalize_name(name)) if name else None
        if purchasing:
            contracts_awarded = purchasing.get("contractsAwarded")
            candidate["achats"] = {
                "contractsAwarded": contracts_awarded if isinstance(contracts_awarded, int) else 0,
                "lastAwardedDate": purchasing.get("lastAwardedDate"),
            }
            suppliers = [s for s in (purchasing.get("suppliers") or []) if isinstance(s, str) and s.strip()]
            if suppliers:
                candidate["recours_externe_observe"] = suppliers
        else:
            unknowns.append("achats")

        # #2302.21 — jamais sur une filiale/BU (aucun lien exact signal→entité,
        # voir docstring de la fonction) : uniquement sur le territoire RACINE,
        # où la portée « compte entier » d'un signal non-lié est exacte, pas
        # devinée. Absent de `_OUTPUT_FIELDS` : ne compte jamais dans
        # `inconnues`/`confiance` des candidats non-racine, pour qui la
        # question ne se pose pas.
        if level in ("groupe", "maison_mere") and signals_count:
            candidate["signaux_recents"] = signals_count

        # #2302.28 — même restriction que #2302.21 juste au-dessus : les
        # références déclarées par l'ESN ne visent aucune entité précise du
        # compte, donc jamais devinées sur une filiale/BU. Absent de
        # `_OUTPUT_FIELDS` pour la même raison que `signaux_recents`.
        if level in ("groupe", "maison_mere") and named_reference_accounts:
            candidate["references_comparables"] = named_reference_accounts

        if unknowns:
            candidate["inconnues"] = unknowns
        candidate["confiance"] = _confidence(unknowns)
        # #2302.59 — la première chose à vérifier avant d'agir sur ce
        # territoire : le rattachement d'abord (sans lui, rien d'autre ne se
        # raccroche à une hiérarchie), puis le premier contact. Les autres
        # champs sont un confort, pas un préalable — jamais un texte générique
        # inventé quand ces deux-là sont déjà connus.
        if "rattachement" in unknowns:
            candidate["premiere_verification"] = "rattachement"
        elif "contacts_connus" in unknowns:
            candidate["premiere_verification"] = "contacts_connus"
        candidates.append(candidate)

    if not candidates:
        return {
            "candidates": [],
            "primary": None,
            "primary_reason": "rien d'observé",
            "alternate": None,
            "excluded": excluded,
            "unknowns": ["candidat"],
        }

    preference = SECTOR_TERRITORY_PREFERENCE.get(sector or "", ())
    normalized_preferred_regions = {
        normalize_name(r) for r in (preferred_regions or []) if isinstance(r, str) and r.strip()
    }

    def _matches_preferred_region(region: Any) -> bool:
        if not normalized_preferred_regions or not isinstance(region, str) or not region.strip():
            return False
        norm_region = normalize_name(region)
        return any(norm_region in pref or pref in norm_region for pref in normalized_preferred_regions)

    def _rank(c: dict[str, Any]) -> tuple[int, int, int, int, int]:
        # #2302.64 — NO-GO explicite de l'issue : le niveau 'groupe' n'est
        # JAMAIS choisi tant qu'un candidat plus précis a été examiné.
        group_penalty = 1 if c["level"] == "groupe" else 0
        try:
            pref_rank = preference.index(c["level"])
        except ValueError:
            pref_rank = len(preference)
        # #2302.22/.26 — un marché DECP déjà attribué à ce territoire est une
        # preuve concrète (achats + recours externe déjà observé), plus forte
        # qu'un simple indice structurel : elle départage avant l'autonomie,
        # toujours seulement À NIVEAU DE PRÉFÉRENCE SECTORIELLE ÉGAL.
        purchasing_penalty = 0 if "achats" in c else 1
        # #2302.18 — la géographie visée par l'ESN (déjà déclarée à
        # l'onboarding) départage elle aussi À NIVEAU ÉGAL seulement.
        region_penalty = 0 if _matches_preferred_region(c.get("localisation")) else 1
        # #2302.20 — l'autonomie locale départage À NIVEAU DE PRÉFÉRENCE ÉGAL
        # seulement : un territoire 'autonome' est plus actionnable localement
        # qu'un territoire 'centralise' — jamais devant la préférence
        # sectorielle elle-même (#2302.34, NO-GO même structure pour tous).
        autonomy_penalty = 0 if c.get("autonomie_probable") == "autonome" else 1
        return (group_penalty, pref_rank, purchasing_penalty, region_penalty, autonomy_penalty)

    ranked = sorted(candidates, key=_rank)
    non_group = [c for c in ranked if c["level"] != "groupe"]

    if non_group:
        primary = non_group[0]
        primary_reason = f"priorité sectorielle ({sector})" if preference else "meilleur périmètre examiné"
        alternate = non_group[1] if len(non_group) > 1 else None
    else:
        # Seul le groupe a été vu comme candidat actionnable : rien n'a
        # démontré l'examen d'une filiale/BU/site. Le NO-GO s'applique.
        primary = None
        primary_reason = "examen des filiales/BU/sites requis avant de recommander le groupe"
        alternate = None

    return {
        "candidates": ranked,
        "primary": primary,
        "primary_reason": primary_reason,
        "alternate": alternate,
        "excluded": excluded,
        "unknowns": [],
    }
