"""OrgGraph assembler — Phase 2/3 emission (Annexe Organigramme, pseudo-code p16).

Ties the deterministic Phase 2 engine together into ONE validated graph matching
the @bellum/contracts OrgGraph shape: it takes the pipeline's classified contacts
+ entities (+ the buying committee, uncovered zones and approach order the
classifier already produces) and assembles

    entities[] · people[] · hierarchyEdges[] · influenceEdges[] ·
    buyingCommittee[] · uncoveredZones[] · recommendedPath[] · rejectedItems[]

resolving every relation through :mod:`org_resolver` (grounding + confidence,
p9/p10/p14) and validating the result through :mod:`org_graph_validate` before it
is emitted. It bridges the four gaps between the pipeline shapes and the contract:
(a) hierarchy tier names → L0-L5 ; (b) cartography entity types → the contract
ontology ; (c) name-string parent refs → synthesised ids ; (d) entities/people
have no id in the pipeline → we synthesise stable ones ; (e) the classifier names
a person's N+1 by TITLE (« DSI ») where the graph indexes people by full name ;
(f) the only provenance the pipeline carries is a provider tag (apollo/pappers/…)
where the contract wants `OrgSource` records.

Depuis la refonte du prompt (BELLUM ACCOUNT MAPPING, annexe p23-p28), il prend
aussi la matière que RIEN ne pouvait dériver d'un champ : les relations TYPÉES
(`sponsors`, `owns_budget`, `procures_for`) et la carte d'influence métier.
Il ne la croit pas sur parole. Un nom que le graphe ne connaît pas est ignoré,
une relation sans preuve citée est jetée, et la provenance `llm` traverse le
resolver en grounding C : plafond 49, rangée en INFLUENCE. Aucune affirmation
d'un modèle ne peut devenir une ligne hiérarchique vérifiée.

**Une preuve d'IDENTITÉ ne prouve jamais une RELATION** (paquet OrgGraph FINAL,
§6). Une source ne prouve que ce qu'elle a réellement observé : le registre a vu
que cette personne existe, la page équipe a vu que l'organisation la présente
comme <fonction>, le fournisseur a vu son profil. Aucun des trois n'a vu à qui
elle rapporte. Le champ `reportingTo` du prompt contacts est explicitement une
supposition (« à qui cette personne rapporte PROBABLEMENT ») : il portait
pourtant la provenance d'identité de la personne et entrait dans
`hierarchyEdges` — 60 de confiance en grounding B via Apollo, 70 en grounding A
via Pappers. Il suit désormais le même chemin que `llm_relations`. La règle
était comprise pour une source et pas appliquée à l'autre, faute d'être écrite
ici : c'est le motif « la garde protège la forme qu'elle a vue, pas la règle ».
Tenue par ``tests/test_org_reporting_provenance.py``.

Ce correctif-là tenait une FORME — le champ `reportingTo`. La règle, elle, ne
tenait que par deux expressions écrites à la main plus bas et par les commentaires
qui les entourent : le chemin qui SCORE un lien (`EdgeSource` →
`factors_from_sources` → `compute_confidence` → `route_for`) n'avait aucune notion
de claim, si bien qu'un nouveau champ, un nouveau producteur ou une nouvelle
relation typée réutilisant `identity_evidence` rouvrait le P0 sans faire rougir
quoi que ce soit. Le vocabulaire manquant existait pourtant — `orgClaimSchema`,
que ce fichier ÉCRIVAIT sur chaque `OrgSource` et que personne ne LISAIT (côté
API, le chemin des corrections humaines le lit, lui : `ORG_CORRECTION_CLAIM_BY_FIELD`).

Depuis, la règle est un MÉCANISME : tout candidat passe par `_honour_claims`
avant le resolver, et une preuve n'étaye que la relation que son claim couvre
(`_CLAIMS_BACKING`). Une preuve d'identité situe une personne — elle, et son
employeur ; elle n'a jamais rien observé d'un lien entre DEUX personnes. Une
preuve dont on ignore ce qu'elle prouve n'étaye rien non plus : le défaut par
défaut est le refus. Et le lien n'est pas effacé, il est DÉGRADÉ à ce qu'il est.
Gardes **GA-98** / **GA-99** — ``tests/test_org_claim_gate.py``.

Pure, no I/O, no LLM. Emitted ADDITIVELY as `raw_analysis.org.orgGraph` — the
existing organigramme output is untouched, so nothing that reads it today breaks.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime
from typing import Any

from app.services.contact_identity import normalize_person_name
from app.services.decision_role import classify_decision_role
from app.services.entity_resolution import ORG_ENTITY_TYPE_TO_KIND
from app.services.entity_type import ENTITY_TYPE_PERSON, is_holding_name
from app.services.governance_guard import demote_governance_first_touch
from app.services.hierarchy_level import classify_hierarchy_level
from app.services.org_graph_colouring import measure_role_colouring
from app.services.org_graph_validate import validate_org_graph
from app.services.org_resolver import (
    EdgeSource,
    grounding_for,
    resolve_edges,
    resolve_influence_edge,
    resolve_relational_edge,
)
from app.services.scope_filter import filter_recommended_path

# Fenêtre de fraîcheur p14 (« Date < 12 mois → +10 »). Une preuve datée au-delà
# perd le bonus : elle reste une preuve, elle n'est simplement plus fraîche.
_FRESHNESS_DAYS = 365

# ── Mapping (a): pipeline hierarchy tier → contract L0-L5 (p7) ────────────────
_LEVEL_TO_CONTRACT: dict[str, str] = {
    "governance": "L0",
    "c_level": "L1",
    "direction": "L2",
    "management": "L3",
    "expert": "L4",
    "operationnel": "L4",
    # L5 = axe ACHATS/contrôle (p7), orthogonal à la ligne managériale. Un tier
    # achats/procurement/juridique/sécurité y atterrit — sans ce mapping il
    # tombait dans le vide et la personne perdait son niveau.
    "achats": "L5",
    "procurement": "L5",
    "controle": "L5",
    "vendor": "L5",
    "juridique": "L5",
    "securite": "L5",
}
# Les niveaux du contrat (`orgHierarchyLevelSchema`). L5 (achats/contrôle) n'a pas
# de tier pipeline correspondant : seul le prompt peut le situer.
_CONTRACT_LEVELS = frozenset({"L0", "L1", "L2", "L3", "L4", "L5"})

# ── Mapping (b): cartography entity type / org-chart level → contract ontology ─
_ENTITY_TYPE_TO_CONTRACT: dict[str, str] = {
    "groupe": "groupe",
    "filiale": "filiale",
    "filiale_strategique": "filiale",
    "marque": "filiale",
    "operational": "filiale",
    "bu": "bu",
    "business unit": "bu",
    "direction": "bu",
    "departement": "departement",
    "equipe": "departement",
    "programme": "programme",
    "site": "site",
    "spv": "spv",
    # #2636.1 — une unité IA/Data nommée comme telle retombait sur le générique
    # `bu` : invisible comme branche propre dans l'organigramme affiché.
    "factory": "factory",
    "ai factory": "factory",
    "digital factory": "factory",
    "data office": "data_office",
    "data_office": "data_office",
    "lab": "lab",
    "innovation lab": "lab",
}
# Cartography types that are NOISE — excluded from the active graph, memorised.
_ENTITY_TYPE_NOISE = {"homonyme", "bruit", "cedee", "spv"}

# #2284.6 / #2284.7 — la taxonomie d'entité (``entity_resolution.ENTITY_KINDS``)
# posée sur le NŒUD quand elle AFFINE le type de contrat : « marque » tombe sur
# ``filiale``, « direction » sur ``bu`` — sans ce kind, l'information se perdait.
# GA-26 : jamais un kind qui répète la projection du type (parité et refus :
# ``packages/contracts/src/schemas/org-node-entity-kind.test.ts``).
_ENTITY_TYPE_TO_REFINED_KIND: dict[str, str] = {
    "marque": "brand",
    "direction": "business_direction",
}
# #2284.14 — ce qu'EST un écarté : un homonyme n'est pas un « spv ».
_NOISE_TYPE_TO_KIND: dict[str, str] = {
    "homonyme": "homonym",
    "cedee": "inactive_company",
    "spv": "legal_vehicle",
}
_NOISE_REASON: dict[str, str] = {
    "homonyme": "entité écartée (homonyme : même nom, autre entreprise)",
    "cedee": "entité écartée (cédée, sortie du groupe)",
    "spv": "entité écartée (véhicule juridique)",
    "bruit": "entité écartée (hors cible)",
}

# #2636.1 — valeurs reconnues de `it_autonomy` (Phase 1, `EntityExhaustive`) ;
# miroir de `orgItAutonomySchema` (`packages/contracts/.../org-graph.ts`).
_IT_AUTONOMY_VALUES = {"autonome", "partage", "centralise"}


def _it_autonomy(raw: dict[str, Any]) -> str | None:
    """Le modèle d'organisation IA/Data d'une entité, collecté par Phase 1 mais
    jamais lu jusqu'ici — la valeur voyageait et disparaissait avant le graphe
    affiché. `None` = non collecté, jamais deviné."""
    value = str(_get(raw, "itAutonomy", "it_autonomy") or "").strip().lower()
    return value if value in _IT_AUTONOMY_VALUES else None


# ── Mapping: classified decision role → contract orgDecisionRole (p8) ──────────
_ROLE_TO_CONTRACT: dict[str, str] = {
    "economic": "economic_buyer",
    "economic_buyer": "economic_buyer",
    "technical": "technical_buyer",
    "technical_buyer": "technical_buyer",
    "user": "user_buyer",
    "user_buyer": "user_buyer",
    "champion": "champion",
    "influencer": "influencer",
    "blocker": "blocker",
    "procurement": "procurement",
    "purchasing": "procurement",
    "sponsor": "economic_buyer",
    "operational": "user_buyer",
}

# ── Contact provider `source` → resolver grounding kind (p10) ──────────────────
_SOURCE_TO_KIND: dict[str, str] = {
    "pappers": "registry",  # A — legal registry
    "apollo": "linkedin",  # B — provider record
    "manual": "crm",  # B — a human entered it
    "brave_search": "press",  # B — web mention
    "ia_reconstruction": "llm",  # C — hypothesis
}

_CONTRACT_STANCE = {
    "advocate": "supporter",
    "opponent": "detractor",
    "neutral": "neutral",
    "supporter": "supporter",
    "detractor": "detractor",
    "unknown": "unknown",
}

# ── Relation typée → sujet métier lisible (annexe p9) ─────────────────────────
# Une relation proposée par le LLM n'a AUCUNE preuve documentaire : le resolver
# la range en influence (grounding C, plafond 49). Elle garde alors sa nature —
# un sponsoring de programme n'est pas un rattachement d'équipe — au lieu de
# retomber sur un `topic` technique illisible.
_RELATION_TOPIC: dict[str, str] = {
    "reports_to": "rattachement hiérarchique",
    "member_of": "rattachement d'entité",
    "sponsors": "sponsoring de programme",
    "owns_budget": "autorité budgétaire",
    "procures_for": "processus achats",
    "works_with": "collaboration",  # #2121.34 — Personne <-> Personne, hors hiérarchie
}

# #2310.13/.15/.19/.20/.21 (épopée #2919) — les cinq natures d'edge RELATIONNEL,
# distinctes des relations hiérarchiques ci-dessus même quand elles partagent un
# mot : `works_with` existe des DEUX côtés (personne<->personne dans
# `_RELATION_TOPIC` ci-dessus, #2121.34 ; workspace/entité ici, #2310.13) —
# `@bellum/contracts` `org-graph.ts` documente la même distinction et les range
# dans deux tableaux différents. Reçues via un paramètre SÉPARÉ
# (`llm_relational_edges`), jamais mélangées à `llm_relations` : aucune valeur
# ne peut alimenter le mauvais tableau par erreur d'aiguillage.
_RELATIONAL_EDGE_TYPES = frozenset({"works_with", "owns_project", "blocks", "introduced_by", "related_workspace"})


# ── Ce qu'une preuve doit avoir OBSERVÉ pour étayer une relation (§6 du FINAL) ─
# GA-98. La frontière du contrat est `identity` ≠ `relation` : « une preuve
# d'identité ne peut jamais être réutilisée comme preuve de relation ».
#
# `member_of` accepte `identity`, et c'est la seule exception — elle est
# NOMMÉE, pas tolérée : l'enregistrement d'un fournisseur ou d'un registre dit
# « Marie Martin, Responsable Data CHEZ TF1 ». Il a donc réellement observé
# l'employeur en même temps que la personne. Ce qu'il n'a jamais observé, c'est
# un lien entre DEUX PERSONNES — et c'est exactement là que porte le P0. Retirer
# `identity` d'ici ferait disparaître la structure VRAIE de l'organigramme
# (chaque personne perdrait son rattachement) pour se protéger d'un défaut qui
# n'est pas là.
_CLAIMS_BACKING: dict[str, frozenset[str]] = {
    "member_of": frozenset({"identity", "membership"}),
    "reports_to": frozenset({"relation"}),
    "sponsors": frozenset({"relation"}),
    "owns_budget": frozenset({"relation"}),
    "procures_for": frozenset({"relation"}),
    # #2121.34 — même frontière : une identité n'a jamais observé une
    # COLLABORATION entre deux personnes.
    "works_with": frozenset({"relation"}),
}

# Ce que le graphe DIT d'un lien dégradé. « On ne falsifie pas la structure » :
# un lien non prouvé ne devient pas un lien vérifié, mais il ne s'efface pas non
# plus en silence — il redevient ce qu'il est, une inférence à vérifier, et il
# le dit à qui la lit.
_DEGRADED_REASONING = (
    "Aucune des preuves citées n'a observé ce lien : elles établissent qui sont "
    "ces personnes, pas la relation entre elles. Le lien est conservé comme une "
    "inférence à vérifier, jamais comme une ligne de l'organigramme."
)


def _honour_claims(candidates: list[dict[str, Any]], claim_by_source_id: dict[str, str]) -> list[dict[str, Any]]:
    """Une preuve ne compte que pour ce qu'elle a OBSERVÉ (GA-98 / GA-99).

    Passe TOUT candidat, quel que soit le champ ou le producteur d'où il vient —
    c'est la seule façon de garder la RÈGLE plutôt que la forme qu'on a vue. Pour
    chaque relation, `_CLAIMS_BACKING` dit quels claims l'étayent ; une preuve
    hors claim est retirée de CE candidat (elle reste intacte sur son nœud, où
    elle prouve ce qu'elle prouve).

    Trois issues, et une seule règle : ne jamais laisser une preuve dire plus que
    ce qu'elle a vu.

    1. **Toutes les preuves sont dans le claim** → le candidat passe tel quel.
       C'est le cas de tout le graphe aujourd'hui : le correctif du 29/08 a déjà
       mis `reportingTo` du bon côté. Cette porte est un CLIQUET, elle ne change
       rien à la sortie d'aujourd'hui — elle empêche demain.
    2. **Certaines sont hors claim** → on ne garde que les autres. Un lien
       réellement prouvé n'est pas puni pour une preuve parasite.
    3. **Aucune n'est dans le claim** → la relation n'a AUCUNE preuve qui l'ait
       observée. Elle ne disparaît pas (elle porte une information) : elle est
       dégradée en inférence — une preuve `llm`, donc grounding C, donc rangée en
       influence et plafonnée à 49 par le resolver — et le `explicit_title` tombe
       (le poids p14 récompense un lien NOMMÉ par un titre ; « Responsable Data »
       ne nomme pas son N+1).

    ⚠️ Une source ABSENTE du registre est traitée comme hors claim (GA-99). C'est
    le défaut sûr, et il est délibéré : on ne peut pas comparer un claim qui
    n'existe pas, et « une source sans claim est une source dont on ne sait pas
    ce qu'elle établit ». Le bénéfice du doute ici, c'est une ligne
    d'organigramme tracée sur rien.

    Mute `claim_by_source_id` pour y déclarer la preuve d'inférence qu'elle pose :
    la porte ne doit pas produire ce qu'elle refuse.
    """
    for cand in candidates:
        backing = _CLAIMS_BACKING.get(str(cand.get("relation") or ""))
        if backing is None:
            continue
        sources: list[EdgeSource] = list(cand.get("sources") or [])
        on_claim = [s for s in sources if claim_by_source_id.get(s.id) in backing]
        if len(on_claim) == len(sources):
            continue
        if on_claim:
            cand["sources"] = on_claim
            continue
        sid = f"s-{cand.get('fromId') or ''}-{cand.get('relation')}-inference"
        claim_by_source_id[sid] = "relation"
        cand["sources"] = [EdgeSource(id=sid, kind="llm")]
        cand["explicit_title"] = False
        cand["reasoning"] = str(cand.get("reasoning") or "").strip() or _DEGRADED_REASONING
    return candidates


def _slug(value: str, fallback: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return s or fallback


def _norm(value: Any) -> str:
    """Clé de comparaison d'un libellé (nom complet, titre). Même normalisation
    que le reste du fichier — minuscules + bords rognés — plus l'écrasement des
    espaces internes, pour que « Directeur   Data » et « directeur data » soient
    la même clé. Purement lexical : aucune reformulation, aucun synonyme."""
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _get(d: dict[str, Any], *keys: str) -> Any:
    """First present (non-None) value among camel/snake aliases."""
    for k in keys:
        v = d.get(k)
        if v is not None:
            return v
    return None


def _raw_entity_type(raw: dict[str, Any]) -> str:
    """The upstream type as written: `type` (cartography) then `level` (org-chart)."""
    return str(_get(raw, "type", "level") or "").strip().lower()


def _entity_type(raw: dict[str, Any]) -> tuple[str, bool]:
    """(contract type, is_noise). Reads `type` (cartography) then `level` (org-chart)."""
    t = _raw_entity_type(raw)
    if t in _ENTITY_TYPE_NOISE:
        return _ENTITY_TYPE_TO_CONTRACT.get(t, "spv"), True
    return _ENTITY_TYPE_TO_CONTRACT.get(t, "bu"), False


def _entity_confidence(raw: dict[str, Any]) -> int:
    """Registry-backed (SIREN confirmed) → high; a bare name → medium."""
    if _get(raw, "sirenStatus") == "confirmed" or _get(raw, "siren"):
        return 85
    return 60


def _kind_for_source(source: Any) -> str:
    return _SOURCE_TO_KIND.get(str(source or "").strip().lower(), "other")


def _node_confidence(source: Any) -> int:
    kind = _kind_for_source(source)
    if kind == "registry":
        return 85
    if kind in ("linkedin", "crm", "press"):
        return 70
    return 50  # llm / other


def _source_record(
    *, sid: str, kind: str, claim: str, ref: str | None = None, day: str | None = None
) -> dict[str, Any]:
    """Un enregistrement `OrgSource` du contrat.

    `claim` — CE QUE CETTE PREUVE PROUVE, et rien d'autre (`orgClaimSchema`, §6 du
    FINAL). Le vocabulaire existait dans le contrat depuis le paquet OrgGraph et
    **aucun producteur ne l'écrivait** : une source sans claim est une source dont
    on ne sait pas ce qu'elle établit, et c'est exactement ce flou qui a permis au
    P0 de vivre — la provenance d'identité d'un contact étayait une ligne de
    reporting. Il est donc OBLIGATOIRE ici : on ne peut pas garder ce qui n'a pas
    de nom.

    `ref` (URL / citation / identifiant registre) et `day` (date de collecte, ISO)
    ne sont posés que s'ils sont RÉELLEMENT connus : la plupart des provenances du
    pipeline ne sont pas datées, et une date inventée fausserait le facteur de
    fraîcheur p14. Une date absente n'est JAMAIS remplacée par la date du jour —
    l'écran nomme l'absence (« date inconnue ») au lieu de la combler.
    """
    record: dict[str, Any] = {
        "id": sid,
        "kind": kind,
        "grounding": grounding_for(kind),
        "claim": claim,
    }
    if ref:
        record["ref"] = ref
    if day:
        record["date"] = day
    return record


def _is_fresh(day: str | None) -> bool:
    """La preuve a-t-elle moins de 12 mois (p14) ? Date absente ou illisible ⇒
    False : on n'accorde pas un bonus de fraîcheur qu'on ne peut pas prouver."""
    try:
        collected = date.fromisoformat(str(day or "")[:10])
    except ValueError:
        return False
    return 0 <= (datetime.now(UTC).date() - collected).days <= _FRESHNESS_DAYS


def _official_index(directory: list[dict[str, Any]] | None) -> dict[str, dict[str, Any]]:
    """Index « nom normalisé → entrée d'annuaire officiel ».

    Une entrée n'est retenue que si elle porte les trois choses qui font la valeur
    de la preuve : un nom, l'URL EXACTE de la page qui le publie, et la date à
    laquelle on l'y a lu. Sans URL ni date, la source ne serait ni citable ni
    datable — on l'ignore plutôt que de la compter. Première occurrence gagnante.
    """
    index: dict[str, dict[str, Any]] = {}
    for entry in directory or []:
        if not isinstance(entry, dict):
            continue
        key = normalize_person_name(_get(entry, "fullName", "full_name"))
        url = str(_get(entry, "url") or "").strip()
        day = str(_get(entry, "collectedAt", "collected_at") or "").strip()
        if key and url and day:
            index.setdefault(key, {"url": url, "date": day})
    return index


def _person_sources(pid: str, contact: dict[str, Any]) -> list[dict[str, Any]]:
    """Provenance d'une personne — UNE preuve par fournisseur d'origine.

    Le champ `source` du contact (apollo / pappers / ia_reconstruction / manual…)
    est la seule provenance que le pipeline connaisse : on la traduit en source
    citable au lieu de la jeter. Provenance absente ⇒ liste vide (on n'affirme
    pas une preuve qu'on n'a pas).

    La LinkedIn URL du contact sert de `ref` UNIQUEMENT quand le fournisseur est
    lui-même de nature LinkedIn : elle documente alors l'enregistrement, sans
    jamais compter comme une SECONDE source convergente (p14 +10) — le champ
    peut être produit par le LLM, il ne doit pas pouvoir promouvoir un lien en
    « vérifié ».
    """
    provider = str(_get(contact, "source") or "").strip()
    if not provider:
        return []
    kind = _kind_for_source(provider)
    ref = None
    if kind == "linkedin":
        ref = str(_get(contact, "linkedinUrl", "linkedin_url") or "").strip() or None
    # `identity` et rien d'autre : le fournisseur a observé que cette personne
    # EXISTE et qui elle est. Il n'a vu ni son rattachement, ni son N+1, ni son
    # pouvoir d'achat — c'est la frontière que le §6 du FINAL rend nommable.
    return [_source_record(sid=f"s-{pid}-{kind}", kind=kind, claim="identity", ref=ref)]


def _entity_sources(eid: str, raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Provenance d'une entité. Rattachée au registre (SIREN confirmé) ⇒ une source
    `registry` citant l'identifiant légal. Sinon liste vide : une BU interne n'a
    pas de preuve documentaire dans le pipeline, on ne lui en fabrique pas."""
    siren = str(_get(raw, "siren") or "").strip()
    if siren or _get(raw, "sirenStatus") == "confirmed":
        return [_source_record(sid=f"s-{eid}-registry", kind="registry", claim="identity", ref=siren or None)]
    return []


def _identity_status(contact: dict[str, Any]) -> str:
    if _get(contact, "email") or _get(contact, "phone"):
        return "enriched"
    if _get(contact, "role") and _get(contact, "hierarchyLevel", "hierarchy_level"):
        return "classified"
    return "verified_identity"


def _decision_roles(contact: dict[str, Any]) -> tuple[list[str], bool | None]:
    """Le rôle de décision d'un nœud, et s'il est DÉDUIT.

    ─────────────────────────────────────────────────────────────────────────
    « Une preuve d'IDENTITÉ ne prouve jamais une RELATION » — ni un RÔLE
    ─────────────────────────────────────────────────────────────────────────
    Ce chemin reprenait le champ ``role`` du contact tel quel. Or ce champ vient
    du prompt contacts, dont le schéma (``bellum_contacts.py:108``) n'offre au
    modèle QUE des rôles colorants — « economic | technical | user | champion |
    procurement | influencer | blocker » — et aucune valeur « inconnu ». Le
    modèle répondait donc toujours quelque chose, et **100 % des nœuds
    ressortaient coloriés d'un pouvoir d'achat que personne n'avait observé**.
    Mesuré sur les graphes de référence avant correction : 0 % de gris, pour un
    plancher de 60 % (`T5.md:798-802`, `:1040`, `:1323`).

    C'est la faute du P0 `reports_to`, posée sur l'autre axe : le titre prouve le
    TITRE, pas le pouvoir de signer. L'assembleur ne colorie donc plus que
    lorsqu'une règle NOMMÉE le justifie, dans cet ordre :

      1. **Le bloqueur traverse.** Ce n'est pas une couleur de POUVOIR, c'est un
         avertissement — et « masquer un blocker hiérarchiquement réel falsifie
         l'organigramme » (décision 5). Le retirer laisserait le commercial sans
         explication du blocage. Il reste donc, et il se dit DÉDUIT.
      2. **Une saisie humaine gagne toujours**, quelle que soit sa date : un rôle
         entré par quelqu'un de l'équipe (``source: manual``) n'est pas déduit.
      3. **La règle déterministe du titre** (``classify_decision_role``), la même
         que le comité d'achat — une dérivation vit à un seul endroit. Elle est
         relisible ligne à ligne, donc opposable : le rôle est DÉDUIT, et le nœud
         le porte.
      4. **Sinon `unknown`**, NOMMÉ plutôt que laissé vide : « ce qui n'a pas pu
         être évalué est NOMMÉ ».

    Rend ``(rôles, déduit)``. ``déduit`` vaut ``None`` quand il n'y a rien à
    qualifier (rôle inconnu) — un ``False`` s'y lirait « rôle confirmé ».

    ⚠️ ``industrial=False`` : l'assembleur ne connaît pas le profil du vendeur.
    C'est le même défaut sûr que ``contact_ranking`` — pour une ESN IT, un
    directeur d'usine n'est pas un décideur, et l'activer par défaut changerait
    le classement de tous les comptes existants.
    """
    declared = _ROLE_TO_CONTRACT.get(str(_get(contact, "role") or "").strip().lower())
    if declared == "blocker":
        return ["blocker"], True
    if declared and _kind_for_source(_get(contact, "source")) == "crm":
        return [declared], False
    by_rule = _ROLE_TO_CONTRACT.get(classify_decision_role(_get(contact, "title")) or "")
    if by_rule:
        return [by_rule], True
    return ["unknown"], None


# Accessibilité d'un siège (0-100) — à quel point le commercial peut l'atteindre,
# indépendamment de la CONFIANCE qu'on a en l'identité. L'ontologie p7 le dit :
# l'opérationnel (L3/L4) est la porte d'entrée, la gouvernance (L0/L1) la moins
# accessible à froid, les achats (L5) un canal à part. Dérivé DÉTERMINISTE du
# niveau et du statut d'identité déjà portés par le nœud — aucune donnée nouvelle,
# rien d'inventé. Utilisé par le tri du chemin (org-graph-path `accessScore`),
# qui retombait sinon sur la confiance faute de ce signal.
_ACCESS_BY_LEVEL: dict[str, int] = {
    "L4": 90,  # expert/opérationnel — le plus joignable
    "L3": 85,  # management — joignable
    "L5": 70,  # achats — canal parallèle
    "L2": 65,  # direction
    "L1": 45,  # exécutif
    "L0": 25,  # gouvernance — rarement une porte d'entrée
}
_ACCESS_DEFAULT = 55  # niveau inconnu : ni facile, ni fermé.
_ACCESS_STATUS_BONUS: dict[str, int] = {"actionable": 10, "enriched": 5}


def _access_score(node: dict[str, Any]) -> int:
    """Accessibilité 0-100 d'une personne, du niveau + statut d'identité."""
    base = _ACCESS_BY_LEVEL.get(str(node.get("hierarchyLevel") or ""), _ACCESS_DEFAULT)
    bonus = _ACCESS_STATUS_BONUS.get(str(node.get("identityStatus") or ""), 0)
    return max(0, min(100, base + bonus))


def _person_key(contact: dict[str, Any]) -> str:
    """Clé d'identité d'un contact — la MÊME que partout dans le pipeline
    (accents, casse et ponctuation neutralisés). Vide quand il n'y a pas de nom."""
    return normalize_person_name(str(_get(contact, "fullName", "full_name") or "").strip())


def _merge_same_person(contacts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """#4177.3 — une personne rattachée à deux entités du groupe n'est qu'UN nœud.

    Même clé d'identité que le reste du pipeline (`normalize_person_name` : accents, casse et espaces
    neutralisés — « Jean Dupond » n'est pas « Jean Dupont »). Le contact à la source la plus solide
    l'emporte, à égalité le premier ; il garde la place du premier. Un contact sans nom, ou écarté
    (« bruit », dont le rejet est mémorisé), n'est jamais fusionné."""
    winner_at: dict[str, int] = {}
    merged: list[dict[str, Any]] = []
    for contact in contacts:
        key = _person_key(contact)
        if not key or str(_get(contact, "bucket") or "").strip().lower() == "bruit":
            merged.append(contact)
            continue
        slot = winner_at.get(key)
        if slot is None:
            winner_at[key] = len(merged)
            merged.append(contact)
        elif _node_confidence(_get(contact, "source")) > _node_confidence(_get(merged[slot], "source")):
            merged[slot] = contact
    return merged


def _assemble_coverage(
    *,
    discovered_contacts: list[dict[str, Any]],
    enriched_contacts: list[dict[str, Any]],
    enrichment_batch_size: int | None,
    # #2543.5 — ce que la SOURCE (Apollo) a annoncé et son état, quand
    # l'appelant les mesure. Ce bloc comptait jusqu'ici APRÈS la requête, sur
    # les seules listes en main : un échec de source (RATE_LIMITED, DOWN…) et
    # un compte réellement vide rendaient le même `coverage`. Absent (défaut)
    # = non mesuré, jamais inventé — le bloc reste byte-identique à avant.
    source_status: str | None = None,
    source_total_entries: int | None = None,
    # #2543.5b — le repli web tel que phase2_contacts.py l'a mesuré :
    # {"attempted": bool, "foundCount": int|None, "failure": str|None}. Absent
    # (défaut) = non mesuré cette requête-ci, graphe byte-identique à avant.
    fallback: dict[str, Any] | None = None,
    # #2543.5g — la passe d'élargissement automatique telle que
    # phase2_contacts.py l'a mesurée : {"attempted": bool, "initialStock": int,
    # "added": int|None, "failure": str|None}. Absent (défaut) = non tentée
    # cette requête-ci, graphe byte-identique à avant.
    widened: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Ce que ce run a MESURÉ du corpus de contacts du compte (FINAL §3).

    Pourquoi ce bloc existe : ``CONTACTS_ENRICH_MAX`` coupait la liste avant le
    prompt organigramme ET avant l'assemblage, si bien que le graphe d'un compte
    à 2 241 contacts en portait 50 — et que rien ne disait que les 2 191 autres
    existaient. Le plafond reste (une vague coûte des crédits) ; ce qu'il ne fait
    plus, c'est décider de ce que le compte CONTIENT.

    L'univers compté est l'UNION des noms des deux listes, pas le corpus seul :
    un modèle qui nomme quelqu'un que la découverte n'avait pas vu vient de le
    découvrir. Sans cette union, ``llmEnriched`` pourrait dépasser ``discovered``
    et le contrat refuserait le graphe entier — le compte perdrait son
    organigramme pour une arithmétique.

    ⚠️ Ce qui n'est PAS compté, et pourquoi : ``attachedToEntity``. Une graine de
    découverte porte ``fullName`` / ``title`` / ``source``, jamais d'entité — le
    rattachement est produit par la classification. Compter sur le corpus rendrait
    le nombre d'ENRICHIS présenté comme un nombre de RATTACHÉS. La question à se
    poser : si cette valeur est absente, « 0 » est-il VRAI ? Non. Elle reste donc
    absente, et le contrat la nomme comme un trou.

    Coût : ZÉRO. Aucun appel réseau, aucun crédit, aucun jeton — on compte des
    lignes qu'on a déjà en main et on relit des titres avec le classifieur
    déterministe qui sert déjà au pré-tri.
    """
    # Titre par personne, la découverte d'abord (c'est la source de vérité du
    # corpus), l'enrichissement en repli pour les noms qu'elle n'avait pas.
    title_by_key: dict[str, str] = {}
    for contact in [*enriched_contacts, *discovered_contacts]:
        key = _person_key(contact)
        if not key:
            continue
        title_by_key[key] = str(_get(contact, "title") or "").strip()

    enriched_keys = {key for key in (_person_key(c) for c in enriched_contacts) if key}

    coverage: dict[str, Any] = {
        "discovered": len(title_by_key),
        # Situé par le TITRE seul, sans un appel au modèle : la moitié gratuite
        # de la couverture. `unknown` = le titre ne situe personne, ce qui est
        # une mesure, pas une absence.
        "deterministicClassified": sum(
            1 for title in title_by_key.values() if classify_hierarchy_level(title) != "unknown"
        ),
        "llmEnriched": len(enriched_keys),
    }
    if enrichment_batch_size is not None:
        coverage["enrichmentBatchSize"] = enrichment_batch_size
    # #2543.5 — nommés seulement s'ils sont mesurés : un échec de source ne
    # devient jamais un zéro, un total non annoncé ne devient jamais un compte.
    if source_status is not None:
        coverage["sourceStatus"] = source_status
    if source_total_entries is not None:
        coverage["sourceTotalEntries"] = source_total_entries
    # #2543.5b — même convention : absent tant que le repli n'a jamais été
    # évalué pour cette recherche.
    if fallback is not None:
        coverage["fallback"] = fallback
    # #2543.5g — même convention : absent tant que la passe d'élargissement
    # n'a jamais tourné pour cette recherche.
    if widened is not None:
        coverage["widened"] = widened
    return coverage


def assemble_org_graph(
    *,
    contacts: list[dict[str, Any]] | None = None,
    entities: list[dict[str, Any]] | None = None,
    uncovered_zones: list[dict[str, Any]] | None = None,
    approach_order: list[dict[str, Any]] | None = None,
    committee: dict[str, Any] | None = None,
    graph_version: int = 1,
    prompt_hash: str | None = None,
    # Matière du prompt refondu BELLUM ACCOUNT MAPPING (annexe p23-p28) :
    # relations TYPÉES (`hierarchyRelations`) et carte d'influence métier
    # (`influenceMap`). Absentes/vides (défaut) = graphe byte-identique au
    # graphe purement déterministe — la refonte n'enlève aucune ligne.
    # Cadrage saisi avant le lancement (recette finale §18/§34). Absent ⇒ le
    # chemin est rendu tel quel, comme avant : sans cadrage, on ne restreint rien.
    scope_selection: dict[str, Any] | None = None,
    llm_relations: list[dict[str, Any]] | None = None,
    llm_influences: list[dict[str, Any]] | None = None,
    # #2310.13/.15/.19/.20/.21 (épopée #2919) — edges RELATIONNELS proposés par
    # BELLUM ACCOUNT MAPPING : projet, blocage, mise en relation, relation
    # workspace/partenaire. UN paramètre séparé de `llm_relations` (jamais la
    # même liste : voir `_RELATIONAL_EDGE_TYPES` ci-dessus). Chaque entrée attend
    # `type` (une des cinq natures), `from`/`to`, `evidence`, `author` (#2310.28
    # — QUI l'affirme ; sans lui l'edge n'est pas émis, aucun auteur inventé) et
    # `reasoning` optionnel. Absent/vide (défaut) = pas de clé `relationalEdges`
    # dans la sortie, graphe byte-identique à avant la feature.
    llm_relational_edges: list[dict[str, Any]] | None = None,
    # Ardoise des éléments déjà écartés (annexe p10 « rejeté + mémorisé », p30),
    # persistée côté API sur le compte et rejouée à chaque run. Un contact
    # signalé parti — ou une entité jugée hors périmètre — ne doit JAMAIS
    # revenir dans le graphe d'un run suivant. Vide/absent (défaut) = assemblage
    # byte-identique à avant la feature.
    rejected_items: list[dict[str, Any]] | None = None,
    # État de la relation au compte (SalesContext `relationship.state`). Pilote le
    # garde-fou DoD « board jamais en 1re approche sans relation/sponsor ». Absent
    # = froid, donc garde-fou actif — le défaut sûr EST la règle.
    relationship_state: str | None = None,
    # SECONDE source de rattachement (audit §1.1) : les dirigeants NOMMÉS sur la
    # page équipe/gouvernance du site du compte, extraits des pages déjà scrapées
    # (`official_directory.collect_official_directory`). Chaque entrée porte sa
    # provenance réelle — `{fullName, title, url, collectedAt}`. Vide/absent
    # (défaut) = assemblage byte-identique à avant la feature.
    official_directory: list[dict[str, Any]] | None = None,
    # TOUS les contacts découverts sur le compte — pas seulement ceux que la
    # vague a enrichis (FINAL §3). `contacts` ci-dessus reste la vague : ce qui
    # a coûté des crédits. Ce paramètre-ci ne coûte rien, il sert à COMPTER.
    #
    # `None` (défaut) = le corpus n'a pas été mesuré : aucun bloc `coverage`,
    # graphe byte-identique à avant la feature. `[]` = mesuré et vide, ce qui
    # n'est pas la même chose — la distinction est exactement « non mesuré n'est
    # pas mesuré à zéro », et elle vit ici.
    discovered_contacts: list[dict[str, Any]] | None = None,
    # Taille de la vague d'enrichissement (`CONTACTS_ENRICH_MAX`), pour que le
    # bandeau puisse annoncer « encore N, par vagues de 50 » AVANT le clic.
    enrichment_batch_size: int | None = None,
    # #2543.5 — l'état de la recherche Apollo (``ApolloSearchStatus.value``,
    # ex. "rate_limited", "down") et la population qu'elle a ANNONCÉE, quand
    # l'appelant les mesure. Absents (défaut) = non mesuré, graphe
    # byte-identique à avant — même convention que ``discovered_contacts``.
    apollo_source_status: str | None = None,
    apollo_total_entries: int | None = None,
    # #2543.5b — le repli web mesuré par phase2_contacts.py, même convention.
    apollo_fallback: dict[str, Any] | None = None,
    # #2543.5g — la passe d'élargissement mesurée par phase2_contacts.py,
    # même convention.
    apollo_widened: dict[str, Any] | None = None,
    # D405 (@bellum/contracts `org-graph.ts`) — la date du RUN qui DÉRIVE ce
    # graphe, posée sur chaque influenceEdge produite ici. PAS une date
    # d'observation : une influence est une inférence, jamais un fait observé à
    # un instant.
    #
    # ⚠️ Cet assembleur reste PUR (ligne 60 : « Pure, no I/O, no LLM ») — de
    # nombreux tests appellent `assemble_org_graph` deux fois avec des entrées
    # équivalentes et comparent le graphe entier (`test_the_gate_is_output_
    # neutral_on_todays_graph`, `test_an_account_without_a_team_page_is_byte_
    # identical`…). Un `datetime.now()` posé ICI par défaut ferait diverger ces
    # deux graphes d'un run à l'autre pour une raison qui n'a rien à voir avec
    # ce qu'ils testent. La VRAIE horloge du run vit donc un cran plus haut,
    # chez l'appelant qui sait réellement QUAND le run a lieu
    # (`org_graph_build.build_org_graph_payload`) : absent ici, `derivedAt`
    # n'apparaît simplement pas sur les influenceEdges — jamais une date
    # devinée à la place.
    derived_at: str | None = None,
) -> dict[str, Any]:
    """Assemble a validated OrgGraph dict from the pipeline's classified outputs.

    Best-effort by construction: any edge that fails a contract invariant is
    dropped (never emitted invalid), and the returned graph always parses under
    the zod contract. Reads present-only fields; invents nothing."""
    contacts = _merge_same_person(contacts or [])
    entities = entities or []
    # Une SEULE date pour tout le run (GA-26), fournie par l'appelant — voir le
    # docblock du paramètre `derived_at` juste au-dessus.
    run_derived_at = derived_at

    # Mémoire des rejets : id → raison. Les ids sont synthétisés de façon
    # DÉTERMINISTE depuis le nom (``_slug``), c'est ce qui permet à un rejet posé
    # sur un run de retrouver la même personne dans le suivant, où le graphe est
    # réassemblé de zéro.
    memorised_rejects: dict[str, str] = {}
    for item in rejected_items or []:
        source_id = str(_get(item, "sourceId", "source_id") or "").strip()
        if source_id:
            memorised_rejects.setdefault(source_id, str(_get(item, "reason") or "écarté précédemment"))

    # ── Entities: synthesise ids, map type, resolve name→id parents ────────────
    entity_nodes: list[dict[str, Any]] = []
    rejected: list[dict[str, str]] = []
    name_to_entity_id: dict[str, str] = {}
    # Même index, clé normalisée (`_norm`) — c'est celle qu'utilisent les noms
    # renvoyés par le LLM, qui peuvent porter des espaces parasites.
    entity_norm_to_id: dict[str, str] = {}
    used_ids: set[str] = set()

    def _fresh_id(prefix: str, seed: str) -> str:
        base = f"{prefix}-{_slug(seed, prefix)}"
        candidate, n = base, 2
        while candidate in used_ids:
            candidate, n = f"{base}-{n}", n + 1
        used_ids.add(candidate)
        return candidate

    for raw in entities:
        name = str(_get(raw, "name", "entity") or "").strip()
        if not name:
            continue
        ctype, is_noise = _entity_type(raw)
        eid = _fresh_id("e", name)
        if eid in memorised_rejects:
            rejected.append({"sourceId": eid, "reason": memorised_rejects[eid]})
            continue
        # Une PERSONNE typée en amont (§24) n'entre pas dans le graphe des
        # entités : elle est ÉCARTÉE ET MÉMORISÉE, donc elle ne ressuscite pas
        # au prochain run. La cartographie de ROCHE portait « Wafaa Mamilli —
        # Chief Digital Technology Officer » parmi ses entités le 29/08/2026.
        if str(_get(raw, "entityType") or "").strip() == ENTITY_TYPE_PERSON:
            rejected.append({"sourceId": eid, "reason": f"personne, pas une organisation : {name}"})
            continue
        if is_noise:
            # #2284.14 — la raison et le kind disent ce qu'est l'écarté.
            raw_type = _raw_entity_type(raw)
            item: dict[str, str] = {
                "sourceId": eid,
                "reason": _NOISE_REASON.get(raw_type, f"entité écartée (type {ctype})"),
            }
            noise_kind = _NOISE_TYPE_TO_KIND.get(raw_type)
            if noise_kind is None and raw_type == "bruit" and is_holding_name(name):
                noise_kind = "holding"
            if noise_kind is not None:
                item["entityKind"] = noise_kind
            rejected.append(item)
            continue
        name_to_entity_id.setdefault(name.lower(), eid)
        entity_norm_to_id.setdefault(_norm(name), eid)
        node: dict[str, Any] = {
            "id": eid,
            "name": name,
            "type": ctype,
            "parentId": None,  # resolved below once every name→id is known
            "status": "operating",
            "sources": _entity_sources(eid, raw),
            "confidence": _entity_confidence(raw),
            "_parentName": _get(raw, "parentId"),  # transient
        }
        ia_model = _it_autonomy(raw)
        if ia_model is not None:
            node["itAutonomy"] = ia_model
        # #2284.6 / #2284.7 — le kind seulement s'il dit plus que le type (GA-26).
        refined = _ENTITY_TYPE_TO_REFINED_KIND.get(_raw_entity_type(raw))
        if refined is not None and refined != ORG_ENTITY_TYPE_TO_KIND.get(ctype):
            node["entityKind"] = refined
        entity_nodes.append(node)

    # Resolve name-string parent refs → synthesised ids (drop unresolved / cycles).
    entity_ids = {e["id"] for e in entity_nodes}
    for e in entity_nodes:
        parent_name = e.pop("_parentName", None)
        if isinstance(parent_name, str):
            pid = name_to_entity_id.get(parent_name.lower())
            if pid and pid != e["id"] and pid in entity_ids:
                e["parentId"] = pid

    # ── People: synthesise ids, attach to entity, map level/role ───────────────
    people_nodes: list[dict[str, Any]] = []
    person_node_by_id: dict[str, dict[str, Any]] = {}
    name_to_person_id: dict[str, str] = {}
    # Index TITRE normalisé → personne. Le prompt contacts demande « à qui cette
    # personne rapporte (titre du N+1) » : sans cet index, `reportingTo` ne
    # pouvait matcher aucun nom complet et AUCUN lien de reporting ne se
    # résolvait. Un titre porté par deux personnes est ambigu : il est retiré de
    # l'index (``ambiguous_titles``) — aucun lien vaut mieux qu'un lien arbitraire.
    title_to_person_id: dict[str, str] = {}
    ambiguous_titles: set[str] = set()
    person_source: dict[str, Any] = {}
    person_source_ids: dict[str, list[str]] = {}
    person_entity: dict[str, str | None] = {}
    # Preuve « site officiel » par personne (grounding A), tenue à part des ids
    # fournisseur : sa NATURE diffère, et c'est exactement ce que la formule p14
    # récompense (+30 officiel qui s'ajoute aux +20 fournisseur).
    person_official: dict[str, EdgeSource] = {}
    official_by_name = _official_index(official_directory)

    # Noms écartés PAR CE RUN (bruit, ou rejet mémorisé d'un run précédent) —
    # #2512 : une graine de `discovered_contacts` portant le MÊME nom ne doit
    # pas ressusciter un contact que la vague vient d'écarter.
    rejected_names: set[str] = set()
    for c in contacts:
        full_name = str(_get(c, "fullName", "full_name") or "").strip()
        if not full_name:
            continue
        bucket = str(_get(c, "bucket") or "").strip().lower()
        pid = _fresh_id("p", full_name)
        if pid in memorised_rejects:
            rejected.append({"sourceId": pid, "reason": memorised_rejects[pid]})
            rejected_names.add(_norm(full_name))
            continue
        if bucket == "bruit":
            rejected.append({"sourceId": pid, "reason": "contact écarté (bruit / hors périmètre)"})
            rejected_names.add(_norm(full_name))
            continue
        entity_name = str(_get(c, "entity") or "").strip().lower()
        entity_id = name_to_entity_id.get(entity_name) if entity_name else None
        level = str(_get(c, "hierarchyLevel", "hierarchy_level") or "").strip().lower()
        source = _get(c, "source")
        name_to_person_id.setdefault(_norm(full_name), pid)
        person_source[pid] = source
        person_entity[pid] = entity_id
        sources = _person_sources(pid, c)
        person_source_ids[pid] = [s["id"] for s in sources]
        confidence = _node_confidence(source)
        # La personne est-elle NOMMÉE sur la page équipe/dirigeants du compte ?
        # Le rapprochement se fait sur la même clé d'identité que le reste du
        # pipeline (accents/casse/ponctuation neutralisés) — jamais sur un
        # « à peu près » : « Jean Dupond » n'est pas « Jean Dupont ».
        official = official_by_name.get(normalize_person_name(full_name))
        if official:
            sid = f"s-{pid}-official"
            sources = [
                *sources,
                # `membership` : la page équipe/gouvernance a observé que
                # L'ORGANISATION PRÉSENTE cette personne comme <fonction>. Elle
                # n'a pas observé à qui elle rapporte — déduire un N+1 de la mise
                # en page d'une page équipe serait la donnée inventée qu'on
                # s'interdit. Et elle porte une DATE réelle (`collectedAt`) : c'est
                # la seule preuve du graphe dont la fraîcheur soit démontrable.
                _source_record(
                    sid=sid,
                    kind="official_site",
                    claim="membership",
                    ref=official["url"],
                    day=official["date"],
                ),
            ]
            person_official[pid] = EdgeSource(id=sid, kind="official_site", fresh=_is_fresh(official["date"]))
            # Publiée par l'organisation elle-même : au moins aussi solide qu'une
            # identité de registre (85), quelle que soit la provenance d'origine.
            confidence = max(confidence, 85)
        decision_roles, role_inferred = _decision_roles(c)
        node: dict[str, Any] = {
            "id": pid,
            "fullName": full_name,
            "entityId": entity_id,
            "decisionRoles": decision_roles,
            "identityStatus": _identity_status(c),
            "sources": sources,
            "confidence": confidence,
        }
        # Le badge « déduit » (T5 §27.3). Absent quand il n'y a rien à qualifier :
        # un `false` sur un nœud gris se lirait « rôle confirmé ».
        if role_inferred is not None:
            node["roleInferred"] = role_inferred
        title = _get(c, "title")
        if title:
            node["title"] = str(title)
            norm_title = _norm(title)
            if norm_title:
                held_by = title_to_person_id.setdefault(norm_title, pid)
                if held_by != pid:
                    ambiguous_titles.add(norm_title)
        if level in _LEVEL_TO_CONTRACT:
            node["hierarchyLevel"] = _LEVEL_TO_CONTRACT[level]
        family = _get(c, "family")
        if family:
            node["family"] = str(family)
        people_nodes.append(node)
        person_node_by_id[pid] = node

    def _resolve_manager(raw_value: Any) -> str | None:
        """Le N+1 désigné par `reportingTo` → id de personne, ou None.

        Le prompt demande un TITRE (« DSI », « Directeur Data »), les runs réels
        renvoient parfois un nom : on essaie les deux, le nom complet d'abord (le
        plus précis). Un titre AMBIGU — porté par plusieurs personnes du graphe —
        ne résout rien : un lien inventé est pire qu'un lien absent."""
        key = _norm(raw_value)
        if not key:
            return None
        by_name = name_to_person_id.get(key)
        if by_name:
            return by_name
        if key in ambiguous_titles:
            return None
        return title_to_person_id.get(key)

    def _same_org(a: str, b: str) -> bool:
        """Deux PERSONNES rattachées à la même entité. Deux entités ne « partagent »
        pas une organisation — sans ce garde, `None == None` offrait le bonus de
        corroboration à un lien entité→entité, ou à deux personnes dont on ignore
        justement le rattachement."""
        left, right = person_entity.get(a), person_entity.get(b)
        return bool(left) and left == right

    # CE QUE CHAQUE PREUVE PROUVE, indexé par son identifiant (GA-98/GA-99).
    # DÉRIVÉ des enregistrements réellement émis sur les nœuds — pas recopié :
    # une seconde liste écrite à la main divergerait de ce que porte le graphe,
    # et la porte garderait alors une réalité qui n'est plus la sienne.
    claim_by_source_id: dict[str, str] = {
        str(source["id"]): str(source.get("claim") or "")
        for node in [*entity_nodes, *people_nodes]
        for source in node["sources"]
    }

    # ── Edge candidates → resolver (grounding + confidence) ────────────────────
    candidates: list[dict[str, Any]] = []
    # Un même lien peut être dit DEUX fois : par le champ `reportingTo` d'un
    # contact et par une entrée de `hierarchyRelations`. Depuis qu'ils suivent le
    # même chemin, ils atterriraient côte à côte sur l'écran — première
    # occurrence gagnante.
    seen_relations: set[tuple[str, str, str]] = set()
    for c in contacts:
        full_name = str(_get(c, "fullName", "full_name") or "").strip()
        pid = name_to_person_id.get(_norm(full_name))
        if not pid:
            continue
        source = person_source.get(pid)
        kind = _kind_for_source(source)
        # La provenance d'IDENTITÉ de la personne (Apollo, Pappers, le CRM…) : ce
        # que le fournisseur a réellement observé, c'est que cette personne EXISTE
        # et qui elle est. Elle ne porte donc QUE le lien qu'elle a vu — le
        # rattachement à son entité. Une source ne prouve jamais plus que ce
        # qu'elle a observé : c'est pourquoi cette liste ne sort pas d'ici pour
        # aller étayer une ligne de reporting (voir `reports_to` plus bas).
        # On référence l'enregistrement `OrgSource` réellement émis sur le nœud, de
        # sorte que `sourceIds` se résolve.
        #
        # ⚠️ `fresh=False`, et c'est la SECONDE moitié du P0 (audit du 22/07,
        # archive 05 §O2). La fraîcheur était affirmée EN DUR — `fresh=True` —
        # sur une provenance qui ne porte aucune date. Or `org_resolver` fait
        # `fresh_date=any(s.fresh …)` et `org_confidence` accorde `W_FRESH_DATE
        # = 10` : **chaque rattachement gagnait +10 points pour une fraîcheur
        # qu'il ne pouvait pas prouver**, sur une échelle où `VERIFIED_MIN = 90`.
        # Aucun contact du pipeline ne porte de date de collecte (`EnrichedContact`
        # n'en a pas de champ), et « une date absente n'est jamais remplacée par
        # la date du jour ». Le bonus disparaît donc jusqu'à ce qu'une vraie date
        # existe — la seule preuve datée du graphe reste la page officielle, qui
        # porte son `collectedAt` et garde, elle, son `_is_fresh`.
        identity_evidence = [EdgeSource(id=sid, kind=kind, fresh=False) for sid in person_source_ids.get(pid) or []]
        # La page officielle prouve l'APPARTENANCE (« l'organisation présente cette
        # personne comme <fonction> »), pas la ligne de reporting : elle rejoint donc
        # les preuves du `member_of` et de lui seul. Déduire un N+1 de la mise en page
        # d'une page équipe serait précisément la donnée inventée qu'on s'interdit.
        official = person_official.get(pid)
        member_evidence = [*identity_evidence, official] if official else identity_evidence
        # member_of: person → their entity (probable — provider says so).
        #
        # ⚠️ Un lien de rattachement porte SA PROPRE preuve, ou il n'existe pas.
        # Le repli d'avant fabriquait `EdgeSource(id=f"s-{pid}-ent", …, fresh=True)`
        # pour un contact SANS provenance : un identifiant de source qu'AUCUN nœud
        # ne portait — donc irrésolvable à l'écran (`orgSourceResolver` le jetait) —
        # et une fraîcheur affirmée par-dessus. Le trait s'affichait « probable, 50 »
        # en citant une preuve qui n'existait nulle part. « Aucun trait : relation
        # non prouvée. Le silence est un état correct » (FINAL §6) : la personne
        # garde son `entityId` (la structure est vraie), le graphe ne dessine
        # simplement pas une ligne qu'il ne peut pas sourcer.
        ent = person_entity.get(pid)
        if ent and member_evidence:
            candidates.append(
                {
                    "fromId": pid,
                    "toId": ent,
                    "relation": "member_of",
                    "topic": _RELATION_TOPIC["member_of"],
                    # `member_evidence` = la provenance du contact PLUS, le cas
                    # échéant, la page dirigeants du site officiel. C'est cette
                    # convergence de deux natures de source qui fait monter la
                    # confiance du rattachement.
                    "sources": member_evidence,
                    "explicit_title": bool(_get(c, "title")),
                    "same_org_id": True,
                }
            )
        # reports_to: person → their manager, resolved by name OR by title.
        #
        # ⚠ `reportingTo` est une SUPPOSITION DU MODÈLE : le prompt contacts
        # demande « à qui cette personne rapporte PROBABLEMENT (titre du N+1) »
        # (`bellum_contacts.py`). Sa provenance est donc `llm`, et elle seule —
        # PAS la provenance d'identité de la personne. Le fournisseur (Apollo,
        # Pappers…) a prouvé que Marie Martin EXISTE et qui elle est ; il n'a
        # jamais observé à qui elle rapporte. Lui prêter cette preuve faisait
        # entrer un « probablement » dans `hierarchyEdges` avec la caution d'un
        # registre légal — mesuré : 60 de confiance en grounding B (apollo), 70
        # en grounding A (pappers). Une preuve d'identité ne prouve jamais une
        # relation : une source ne prouve que ce qu'elle a réellement observé.
        #
        # Le lien n'est pas perdu pour autant : en grounding C, le resolver le
        # range en INFLUENCE (plafond 49) — exactement le chemin des relations
        # typées de `llm_relations`, vingt lignes plus bas. Une vraie ligne
        # hiérarchique reste possible : elle demande une source qui a vu le
        # rattachement (organigramme publié, page officielle), ce que va chercher
        # « Vérifier ce lien » (`/org/verify-relation`).
        #
        # `explicit_title` n'est pas passé non plus : le poids p14 récompense un
        # lien NOMMÉ par un titre, or « Responsable Data » ne nomme pas son N+1.
        mgr_id = _resolve_manager(_get(c, "reportingTo", "reporting_to"))
        if mgr_id and mgr_id != pid and (pid, mgr_id, "reports_to") not in seen_relations:
            seen_relations.add((pid, mgr_id, "reports_to"))
            # Elle déclare `relation` : le modèle AFFIRME un lien. C'est une
            # affirmation, pas une observation — c'est le grounding (C) qui la
            # plafonne, pas le claim. Les deux contrôles sont indépendants, et
            # c'est voulu : le claim dit CE QUE la preuve porte, le grounding dit
            # CE QU'ELLE VAUT.
            claim_by_source_id[f"s-{pid}-reporting-llm"] = "relation"
            candidates.append(
                {
                    "fromId": pid,
                    "toId": mgr_id,
                    "relation": "reports_to",
                    "topic": _RELATION_TOPIC["reports_to"],
                    "sources": [EdgeSource(id=f"s-{pid}-reporting-llm", kind="llm")],
                    "reasoning": (
                        "N+1 supposé par le modèle à partir du poste "
                        "(champ « reportingTo », formulé « probablement ») — "
                        "aucune source n'a observé ce rattachement."
                    ),
                    "same_org_id": _same_org(pid, mgr_id),
                }
            )

    # ── Relations TYPÉES proposées par BELLUM ACCOUNT MAPPING (annexe p23-p28) ──
    # Le modèle nomme des liens que le pipeline ne peut PAS dériver d'un champ :
    # sponsoring de programme, autorité budgétaire, périmètre achats. On les prend
    # — mais jamais pour argent comptant :
    #   · un nom qui ne correspond à AUCUN nœud du graphe est ignoré (règle n°1 :
    #     le modèle ne peut pas introduire une personne ou une entité) ;
    #   · une relation sans `evidence` citée est ignorée (garde-fou p27 « si
    #     manager/reporting inconnu, n'ajoute pas de lien ») ;
    #   · la provenance est `llm` → grounding C → le resolver la range en
    #     INFLUENCE, plafonnée à 49. Aucune affirmation du modèle ne peut donc
    #     devenir une ligne hiérarchique vérifiée.
    def _resolve_node(raw_value: Any) -> str | None:
        """Nom → id de nœud. Personne d'abord (plus précis), puis entité."""
        key = _norm(raw_value)
        if not key:
            return None
        return name_to_person_id.get(key) or entity_norm_to_id.get(key)

    for idx, rel in enumerate(llm_relations or []):
        relation = str(_get(rel, "type", "relation") or "").strip().lower()
        if relation not in _RELATION_TOPIC:
            continue
        evidence = str(_get(rel, "evidence") or "").strip()
        if not evidence:
            continue
        from_id = _resolve_node(_get(rel, "from", "from_name", "fromName"))
        to_id = _resolve_node(_get(rel, "to", "to_name", "toName"))
        if not from_id or not to_id or from_id == to_id:
            continue
        if (from_id, to_id, relation) in seen_relations:
            continue
        seen_relations.add((from_id, to_id, relation))
        # Même nature que `reportingTo` ci-dessus : le modèle AFFIRME la relation.
        claim_by_source_id[f"s-llm-rel-{idx}"] = "relation"
        reasoning = str(_get(rel, "reasoning") or "").strip() or evidence
        candidates.append(
            {
                "fromId": from_id,
                "toId": to_id,
                "relation": relation,
                "sources": [EdgeSource(id=f"s-llm-rel-{idx}", kind="llm")],
                "topic": _RELATION_TOPIC[relation],
                "reasoning": reasoning,
                "same_org_id": _same_org(from_id, to_id),
            }
        )

    # ── Edges RELATIONNELS (épopée #2919, #2310.13/.15/.19/.20/.21, .27, .28) ──
    # Même règle n°1 que `llm_relations` ci-dessus : un nom que le graphe ne
    # connaît pas, une relation sans evidence citée, ou un auteur absent ne
    # produit RIEN — jamais un lien ni un auteur inventés.
    relational_edges_out: list[dict[str, Any]] = []
    seen_relational: set[tuple[str, str, str]] = set()
    for idx, edge in enumerate(llm_relational_edges or []):
        edge_type = str(_get(edge, "type", "relation") or "").strip().lower()
        if edge_type not in _RELATIONAL_EDGE_TYPES:
            continue
        evidence = str(_get(edge, "evidence") or "").strip()
        if not evidence:
            continue
        author = str(_get(edge, "author") or "").strip()
        if not author:
            continue
        from_id = _resolve_node(_get(edge, "from", "from_name", "fromName"))
        to_id = _resolve_node(_get(edge, "to", "to_name", "toName"))
        if not from_id or not to_id or from_id == to_id:
            continue
        if (from_id, to_id, edge_type) in seen_relational:
            continue
        seen_relational.add((from_id, to_id, edge_type))
        resolved_relational = resolve_relational_edge(
            from_id=from_id,
            to_id=to_id,
            edge_type=edge_type,
            author=author,
            sources=[EdgeSource(id=f"s-llm-rel-edge-{idx}", kind="llm")],
        )
        if resolved_relational:
            relational_edges_out.append(resolved_relational)

    # LA PORTE (GA-98 / GA-99) — posée ICI, sur le flux ENTIER de candidats, et
    # pas dans chacun des producteurs. Un contrôle recopié dans chaque producteur
    # est un contrôle que le producteur suivant oubliera : c'est très exactement
    # ce qui a fait vivre le P0, où `llm_relations` respectait la règle et
    # `reportingTo` la contournait sans que rien ne le remarque.
    candidates = _honour_claims(candidates, claim_by_source_id)

    resolved = resolve_edges(candidates, derived_at=run_derived_at)

    # ── Carte d'influence métier (annexe p13/p27) ──────────────────────────────
    # La seule sortie que rien ne produisait : qui pèse sur QUEL sujet, avec
    # quelle posture. Hypothétique par construction, donc obligatoirement portée
    # par un raisonnement — sans raisonnement, `resolve_influence_edge` renvoie
    # None et le lien n'existe pas. La confiance du modèle ne peut qu'ABAISSER le
    # score déterministe : une preuve absente ne se rattrape pas par une
    # auto-évaluation généreuse.
    seen_influence: set[tuple[str, str, str]] = {(e["fromId"], e["toId"], e["topic"]) for e in resolved.influence}
    for idx, inf in enumerate(llm_influences or []):
        topic = str(_get(inf, "topic") or "").strip()
        reasoning = str(_get(inf, "reasoning") or "").strip()
        if not topic or not reasoning:
            continue
        from_id = _resolve_node(_get(inf, "from", "from_name", "fromName"))
        to_id = _resolve_node(_get(inf, "to", "to_name", "toName"))
        if not from_id or not to_id or from_id == to_id:
            continue
        if (from_id, to_id, topic) in seen_influence:
            continue
        edge = resolve_influence_edge(
            from_id=from_id,
            to_id=to_id,
            topic=topic,
            reasoning=reasoning,
            sources=[EdgeSource(id=f"s-llm-inf-{idx}", kind="llm")],
            stance=_CONTRACT_STANCE.get(str(_get(inf, "stance") or "").strip().lower(), "unknown"),
            same_org_id=_same_org(from_id, to_id),
            derived_at=run_derived_at,
        )
        if edge is None:
            continue
        claimed = _get(inf, "confidence")
        if isinstance(claimed, (int, float)) and not isinstance(claimed, bool) and 0 <= claimed <= 100:
            edge["confidence"] = min(edge["confidence"], int(claimed))
        seen_influence.add((from_id, to_id, topic))
        resolved.influence.append(edge)

    # ── Buying committee → contract shape ──────────────────────────────────────
    committee_out: list[dict[str, Any]] = []
    for m in (committee or {}).get("members", []) if isinstance(committee, dict) else []:
        cname = _norm(_get(m, "fullName", "full_name"))
        pid = name_to_person_id.get(cname)
        if not pid:
            continue
        role = _ROLE_TO_CONTRACT.get(str(_get(m, "committeeRole", "role") or "").strip().lower(), "unknown")
        seat: dict[str, Any] = {"personId": pid, "role": role, "entityId": person_entity.get(pid)}
        reason = _get(m, "roleLabel", "reason")
        if reason:
            seat["reason"] = str(reason)
        seat_node = person_node_by_id.get(pid)
        if seat_node is not None:
            seat["accessScore"] = _access_score(seat_node)
        committee_out.append(seat)

    # ── Uncovered zones → contract shape ───────────────────────────────────────
    zones_out: list[dict[str, Any]] = []
    for z in uncovered_zones or []:
        reason = str(_get(z, "zone", "reason") or "").strip()
        if not reason:
            continue
        zone: dict[str, Any] = {"reason": reason, "importance": _get(z, "importance") or "importante"}
        # Annexe p19/p30 : « chaque zone porte entityId, family, level ». Sans ces
        # axes la case n'est pas relançable. On ne renseigne que ce que le modèle
        # a réellement situé — une entité inconnue du graphe reste `None`.
        zone_entity = entity_norm_to_id.get(_norm(_get(z, "entity", "entityId", "entity_id")))
        if zone_entity:
            zone["entityId"] = zone_entity
        family = str(_get(z, "family") or "").strip()
        if family:
            zone["family"] = family
        level = str(_get(z, "level", "hierarchyLevel", "hierarchy_level") or "").strip()
        level = _LEVEL_TO_CONTRACT.get(level.lower(), level.upper())
        if level in _CONTRACT_LEVELS:
            zone["hierarchyLevel"] = level
        title = _get(z, "suggestedTitle", "suggested_title")
        if title:
            zone["suggestedTitles"] = [str(title)]
        query = _get(z, "suggestedSearch", "suggested_search")
        if query:
            zone["suggestedQueries"] = [str(query)]
        zones_out.append(zone)

    # ── Recommended path → contract shape (only resolvable, non-rejected) ───────
    # Ni un bloqueur (décision 5 du FINAL, recopiée dans
    # `focalOrgData.ts:194-199`) : « masquer complètement un blocker
    # hiérarchiquement réel falsifie l'organigramme ; on l'exclut du chemin,
    # pas de la structure ». Le web tenait déjà la règle au rendu
    # (`decisionBadgeOf`) ; le générateur ne la tenait pas — le
    # `recommendedPath` STOCKÉ dans `raw_analysis.org.orgGraph` pouvait donc
    # contenir un bloqueur pour tout lecteur qui ne passe pas par l'écran
    # (export, outil du copilote, MCP, routine). `decisionRoles` est déjà
    # porté par `people_nodes` (voir `_decision_roles` ci-dessus) — on le LIT
    # ici plutôt que de le redériver, sinon deux dérivations divergeraient.
    # ⚠️ `unknown` n'est PAS un bloqueur : c'est « rien n'a pu être établi »,
    # pas un rôle qui bloque (`focalOrgData.ts:98-102`).
    rejected_ids = {r["sourceId"] for r in rejected}
    path_out: list[dict[str, Any]] = []
    step_no = 0
    for s in approach_order or []:
        cname = _norm(_get(s, "contact"))
        pid = name_to_person_id.get(cname)
        if not pid or pid in rejected_ids:
            continue
        if "blocker" in (person_node_by_id.get(pid, {}).get("decisionRoles") or []):
            continue
        step_no += 1
        step: dict[str, Any] = {
            "step": step_no,
            "personId": pid,
            "objective": str(_get(s, "why_first", "expected_outcome", "objective") or "ouvrir la conversation"),
        }
        unlocks = _get(s, "unlocks")
        if unlocks:
            step["unlocks"] = str(unlocks)
        # p26 : « pour chaque étape : … canal … et fallback ». Deux champs du
        # contrat qui n'avaient aucun producteur avant le prompt refondu.
        channel = _get(s, "channel")
        if channel:
            step["channel"] = str(channel)
        fallback = _get(s, "fallback")
        if fallback:
            step["fallback"] = str(fallback)
        # #2963 (LAU-FINAL-053, épopée Recommended Path Builder, #2312.2/.4/.5/
        # .6/.8/.9/.12) — `why_first`/`expected_outcome` étaient DÉJÀ produits
        # par le prompt (bellum_organigramme.py) mais fondus dans `objective`
        # par le repli de clé ci-dessus : surfacés ici À PART, sans rien
        # retirer à `objective`. Les quatre autres sont neufs côté prompt —
        # projetés tels quels s'ils arrivent, absents sinon (jamais devinés).
        why_now = _get(s, "why_first")
        if why_now:
            step["whyNow"] = str(why_now)
        expected_result = _get(s, "expected_outcome")
        if expected_result:
            step["expectedResult"] = str(expected_result)
        question_to_ask = _get(s, "question_to_ask")
        if question_to_ask:
            step["questionToAsk"] = str(question_to_ask)
        info_to_obtain = _get(s, "info_to_obtain")
        if info_to_obtain:
            step["infoToObtain"] = str(info_to_obtain)
        evidence_to_use = _get(s, "evidence_to_use")
        if evidence_to_use:
            step["evidenceToUse"] = str(evidence_to_use)
        gating_condition = _get(s, "gating_condition")
        if gating_condition:
            step["gatingCondition"] = str(gating_condition)
        risk = _get(s, "risk")
        if risk:
            step["risk"] = str(risk)
        path_out.append(step)

    # DoD (annexe organigramme p32 / méthodo p31) : sur un compte froid, une place
    # de gouvernance (L0) ne passe jamais devant un interlocuteur opérationnel.
    # Réordonne seulement — n'invente ni ne supprime aucun contact.
    path_out = demote_governance_first_touch(path_out, people_nodes, relationship_state=relationship_state)

    # #2312.10 — la personne suivante n'est jamais un second champ LLM : une
    # fois la séquence FINALE connue (après la démotion gouvernance
    # ci-dessus), c'est simplement le `personId` de l'étape suivante. La
    # dernière étape n'a pas de suivante — jamais une clé absente devinée.
    for i in range(len(path_out) - 1):
        path_out[i]["nextPersonId"] = path_out[i + 1]["personId"]

    # La mémoire est CUMULATIVE : un élément écarté une fois le reste, même s'il
    # n'est pas réapparu dans ce run (sinon le prochain run le réintroduirait,
    # l'ardoise ayant été réécrite à partir du seul graphe courant). Dédoublonné
    # par ``sourceId``, première occurrence gagnante.
    seen_rejects: set[str] = set()
    all_rejected: list[dict[str, str]] = []
    for item in [*rejected, *({"sourceId": rid, "reason": reason} for rid, reason in memorised_rejects.items())]:
        if item["sourceId"] in seen_rejects:
            continue
        seen_rejects.add(item["sourceId"])
        all_rejected.append(item)
    rejected = all_rejected

    # Le cadrage restreint le chemin recommandé — c'est le §34 : une ESN
    # française se voyait proposer un C-level en Chine et une directrice
    # Amériques dans ses quatre premières actions, alors qu'elle avait déclaré
    # la France et une approche bottom-up.
    kept_path, dropped_path = filter_recommended_path(path_out, scope_selection)

    # ── Les DÉCOUVERTS non enrichis entrent dans le graphe (#2512) ──────────────
    #
    # Louis, en recette : « par défaut, mettre aussi les gens NON ENRICHIS dans
    # l'organigramme ; aujourd'hui certains paraissent vides et avec peu de
    # profondeur ». MESURÉ : `graph.people` ne portait QUE la vague — voir
    # `_assemble_coverage` plus haut, qui compte déjà `discovered_contacts` sans
    # jamais les faire ENTRER dans le graphe. Un contact découvert mais jamais
    # enrichi n'avait donc AUCUN nœud, quelle que soit sa profondeur réelle.
    #
    # CE QUE ÇA AJOUTE, ET CE QUE ÇA N'INVENTE PAS
    # ─────────────────────────────────────────────────────────────────────────
    # Une graine ne porte que `fullName` / `title` / `source` (jamais d'entité,
    # jamais de rôle — voir `_assemble_coverage` ci-dessus) : le nœud n'a donc
    # ni `entityId` ni arête. Le niveau hiérarchique est DÉDUIT du seul intitulé
    # par le MÊME classifieur déterministe que `deterministicClassified`
    # (`classify_hierarchy_level`, 0 crédit, 0 appel réseau, aucun critère
    # protégé — un titre n'en est pas un). Un intitulé absent ou illisible
    # (`classify_hierarchy_level` → "unknown") laisse `hierarchyLevel` ABSENT :
    # jamais un niveau deviné pour combler un trou.
    #
    # `identityStatus: "seed"` — le statut du contrat qui dit exactement ceci
    # (« non affiché ou stock brut », `orgIdentityStatusSchema`) et que le
    # plancher de gris traite déjà comme « le compte n'a pas payé pour cette
    # personne » (`org_graph_colouring.ENRICHED_STATUSES`). `decisionRoles:
    # ["unknown"]` plutôt qu'une déduction par le titre : c'est le comportement
    # JUSTE du plancher de gris (T5 §27.2), pas un défaut — une graine n'a pas
    # de rôle de décision affirmé.
    #
    # Placé ICI, APRÈS la résolution des arêtes (`resolve_edges`, les relations
    # typées, la carte d'influence, le comité, les zones et le chemin) : ce
    # correctif ajoute des NŒUDS, il ne change RIEN à la résolution de
    # `reportingTo` / `llm_relations` / `llm_influences` d'aujourd'hui — une
    # graine n'y devient pas un manager ou un sujet d'influence résolvable.
    #
    # `discovered_contacts=None` (défaut) → boucle non exécutée, graphe
    # byte-identique à avant le correctif (même convention que `coverage`
    # au-dessus).
    for seed in discovered_contacts or []:
        seed_name = str(_get(seed, "fullName", "full_name") or "").strip()
        seed_key = _norm(seed_name)
        if not seed_key or seed_key in name_to_person_id or seed_key in rejected_names:
            continue  # déjà un nœud (vague, ou déjà résolu ci-dessus), ou écarté ce run
        pid = _fresh_id("p", seed_name)
        if pid in memorised_rejects:
            rejected.append({"sourceId": pid, "reason": memorised_rejects[pid]})
            continue
        name_to_person_id[seed_key] = pid
        # #4749 — MESURÉ : 1 673 personnes, 0 `entityId`. La résolution n'était JAMAIS tentée pour une graine.
        # Elle l'est maintenant, sur le SEUL nom d'entité exact que la graine porte (même clé que la vague
        # ci-dessus). Aucune entité dans la graine, ou un nom qui ne correspond à aucune entité ⇒ `None` :
        # un rattachement inconnu, JAMAIS deviné (ni par le nom de la personne, ni par le secteur, ni par un
        # intitulé approchant).
        seed_entity_name = str(_get(seed, "entity") or "").strip().lower()
        seed_entity_id = name_to_entity_id.get(seed_entity_name) if seed_entity_name else None
        seed_node: dict[str, Any] = {
            "id": pid,
            "fullName": seed_name,
            "entityId": seed_entity_id,
            "decisionRoles": ["unknown"],
            "identityStatus": "seed",
            "sources": _person_sources(pid, seed),
            "confidence": _node_confidence(_get(seed, "source")),
        }
        seed_title = _get(seed, "title")
        if seed_title:
            seed_node["title"] = str(seed_title)
            seed_tier = classify_hierarchy_level(str(seed_title))
            seed_level = _LEVEL_TO_CONTRACT.get(seed_tier)
            if seed_level:
                seed_node["hierarchyLevel"] = seed_level
        people_nodes.append(seed_node)
        person_node_by_id[pid] = seed_node

    graph: dict[str, Any] = {
        "graphVersion": graph_version,
        "entities": entity_nodes,
        "people": people_nodes,
        "hierarchyEdges": resolved.hierarchy,
        "influenceEdges": resolved.influence,
        "buyingCommittee": committee_out,
        "uncoveredZones": zones_out,
        "recommendedPath": kept_path,
        "rejectedItems": rejected,
    }
    # Ce que le cadrage a écarté, AVEC son motif (§22, « ce que Bellum écarte »).
    # Un contact retiré sans raison se lit comme une donnée manquante ; retiré
    # avec sa raison, il devient une décision que le commercial peut contredire.
    #
    # La clé n'apparaît QUE s'il y a quelque chose à déclarer : un run sans
    # cadrage garde un graphe byte-identique, et le contrat de fil partagé entre
    # les trois services reste vrai sans avoir à être renégocié.
    if relational_edges_out:
        graph["relationalEdges"] = relational_edges_out
    if dropped_path:
        graph["excludedFromPath"] = dropped_path
    if prompt_hash:
        graph["promptHash"] = prompt_hash
    # La couverture : ce que le COMPTE contient, à côté de ce que la VAGUE a
    # enrichi. Absente quand l'appelant n'a pas mesuré le corpus — jamais
    # remplacée par des zéros.
    if discovered_contacts is not None:
        graph["coverage"] = _assemble_coverage(
            discovered_contacts=discovered_contacts,
            enriched_contacts=contacts,
            enrichment_batch_size=enrichment_batch_size,
            # #2543.5 — voir le commentaire sur les paramètres ci-dessus.
            source_status=apollo_source_status,
            source_total_entries=apollo_total_entries,
            fallback=apollo_fallback,
            widened=apollo_widened,
        )

    # Le PLANCHER DE GRIS (T5 §27.2) — mesuré ICI, où le graphe est assemblé,
    # parce que la règle accuse le GÉNÉRATEUR (« si le générateur colore plus, il
    # invente ») et qu'un écran ne peut pas réparer un générateur. La mesure
    # voyage avec le graphe : le lecteur la LIT au lieu de la refaire, et deux
    # dérivations d'une même question ne peuvent plus diverger.
    #
    # ABSENTE quand aucune personne n'est non enrichie — il n'y a alors rien à
    # mesurer, ce qui n'est pas « 0 % de gris ».
    #
    # Garde **GA-187** — ``tests/test_org_grey_floor.py``.
    colouring = measure_role_colouring(people_nodes)
    if colouring is not None:
        graph["colouring"] = colouring

    # ── Emit-side guard: never ship an invalid graph. Drop offending edges. ────
    violations = validate_org_graph(graph)
    if violations:
        graph = _repair(graph, violations)
    return graph


def _repair(graph: dict[str, Any], violations: list[str]) -> dict[str, Any]:
    """Best-effort: strip the edges/steps flagged by the validator so the emitted
    graph is always contract-valid. Which array an index refers to is read from
    the violation message (they are prefixed `hierarchyEdges[i]` etc.)."""
    to_drop: dict[str, set[int]] = {}
    for v in violations:
        m = re.match(r"(hierarchyEdges|influenceEdges|recommendedPath|buyingCommittee)\[(\d+)\]", v)
        if m:
            to_drop.setdefault(m.group(1), set()).add(int(m.group(2)))
    for key, idxs in to_drop.items():
        graph[key] = [item for i, item in enumerate(graph.get(key, [])) if i not in idxs]
    return graph
