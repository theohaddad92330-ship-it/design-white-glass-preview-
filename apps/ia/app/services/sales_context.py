"""Deterministic SalesContext classifiers (Annexe Méthodologie Sales ESN, Théo
2026-07-21 ; plan agent_docs/methodo-sales-esn-plan.md).

The annexe's thesis: stop proposing the same strategy to every ESN and every
account. Strategy must key on a deterministic triple —
(ESN profile+stage) × (account archetype) × (relationship state) — that later
phases branch on for score / contacts / actions / plan / messages (impl-map p29
« déterministe → code »).

This is the code half that emits the SalesContext object. The TYPED contract is
`packages/contracts/src/schemas/sales-context.ts` (zod = source of truth) — every
value here is the exact wire mirror of that enum set, and every emitted `account`
/ `relationship` axis honours the contract's certainty invariant (p31 « jamais
inventer ») : `user_*` ⇒ confidence 100 ; `inferred` ⇒ confidence ≤ 99 AND ≥ 1
piece of evidence ; `default` ⇒ confidence 0. No LLM — same compute-side pattern
as `account_score` / `esn_profiler`.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

# `ESN_STAGES` / `classify_esn_stage` viennent du SOCLE `esn_stage` (une seule
# échelle p3 pour tout le produit) et sont ré-exportés ici : ce module reste le
# point d'entrée du contexte de vente pour ses consommateurs historiques.
from app.services.esn_stage import ESN_STAGES, classify_esn_stage, size_int

_size_int = size_int

SALES_CONTEXT_VERSION = 1

# ── Wire-value mirrors of the zod enums (never translate; parity test locks them)
ACCOUNT_ARCHETYPES = (
    "startup",
    "pme_eti",
    "grand_groupe",
    "banque_assurance",
    "public",
    "luxe_retail_media",
    "industrie",
    "international",
    "inconnu",
)
RELATIONSHIP_STATES = (
    "froid",
    "connu",
    "linkedin",
    "dormant",
    "refere",
    "ancien_client",
    "rang2",
    "client_actif",
    "besoin_ouvert",
    # #2371.4 (#2887) — ESN partenaire avec des placements EN COURS.
    "partenaire_actif",
)
# #4289.12 — le libellé de chaque stade, copie embarquée de `CASE_RELATION_LABELS` (contrat `case-dimensions.ts`,
# parité tenue par `test_4289_12_stade_relation_un_moteur.py`) : « même stade de relation (client actif) » se dit
# avec les MÊMES mots dans les cas similaires (apps/api) et dans les alternatives (apps/ia).
RELATION_STAGE_LABELS: dict[str, str] = {
    "froid": "compte froid",
    "connu": "compte connu",
    "linkedin": "connexion acceptée sur le réseau professionnel",
    "dormant": "relation dormante",
    "refere": "compte référé",
    "ancien_client": "ancien client",
    "rang2": "en rang 2",
    "client_actif": "client actif",
    "besoin_ouvert": "besoin ouvert",
    "partenaire_actif": "partenaire actif",
}
DERIVATIONS = ("user_declared", "user_override", "inferred", "default")


# ── Axe 1 — ESN stage (p3) ───────────────────────────────────────────────────
# `classify_esn_stage` vit dans `app.services.esn_stage` (socle, importé plus
# haut) : c'est LA seule échelle du produit, aux coupures de la table p3.


# ── ESN profile sub-objects (p4) — promote the dead columns ──────────────────
def _gtm_model(sales_team_size: Any) -> tuple[str, int | None]:
    """(gtm.model, salesTeamSize) from the questionnaire's sales-team field.
    « seul/fondateur/indépendant » → founder_led (1) ; a sized team → team."""
    text = str(sales_team_size or "").lower()
    if not text:
        return "inconnu", None
    if any(n in text for n in ("seul", "fondateur", "indépendant", "independant")):
        return "founder_led", 1
    if "pas d'équipe" in text or "pas d'equipe" in text:
        return "inconnu", None
    nums = [int(n) for n in re.findall(r"\d+", text)]
    if nums:
        return "team", max(nums)
    return "inconnu", None


# Sales structures — the COMMERCIAL structure, not the consultant headcount. The
# plan has always sized itself on `size` (nb de consultants) ; a founder who sells
# alone and a 5-person sales team cannot execute the same weekly volume, whatever
# the delivery headcount says. Wire values are internal (prompt/compute side only,
# not part of the SalesContext contract).
SALES_STRUCTURES = ("founder_solo", "founder_alternant", "duo_trio", "equipe", "account_team", "inconnu")

# p23 nomme cinq lignes, dont deux qui ne se déduisent pas d'un effectif :
# « fondateur + alternant » (deux rôles asymétriques, pas une équipe de 2) et
# « account team » (sales + recruteur + delivery + consultant capteur). On les
# reconnaît donc au VOCABULAIRE de la réponse, jamais à un seuil inventé.
_ALTERNANT_NEEDLES = ("alternant", "alternance", "apprenti", "stagiaire")
_ACCOUNT_TEAM_NEEDLES = ("account team", "équipe compte", "equipe compte", "équipe de compte")


def classify_sales_structure(sales_team_size: Any) -> str:
    """Questionnaire's sales-team field → commercial structure band (p23).

    `founder_solo` (le fondateur vend seul) / `founder_alternant` (fondateur +
    alternant) / `duo_trio` (2-4) / `equipe` (5+) / `account_team` (équipe
    pluridisciplinaire déclarée). Unknown or unparseable → `inconnu`, which every
    consumer treats as "change nothing" — never a guessed band."""
    text = str(sales_team_size or "").lower()
    if any(n in text for n in _ACCOUNT_TEAM_NEEDLES):
        return "account_team"

    model, size = _gtm_model(sales_team_size)
    if any(n in text for n in _ALTERNANT_NEEDLES) and (model == "founder_led" or (size or 0) <= 2):
        # « fondateur + alternant » : deux personnes, deux rôles ASYMÉTRIQUES.
        # Les traiter en duo symétrique assignerait du closing à l'alternant.
        return "founder_alternant"
    if model == "founder_led" or size == 1:
        return "founder_solo"
    if model == "team" and size is not None:
        return "duo_trio" if size <= 4 else "equipe"
    return "inconnu"


def sales_structure_from_context(sales_context: dict[str, Any] | None) -> str:
    """Same band, read back from an EMITTED SalesContext (`esnProfile.gtm`), so a
    consumer downstream of `build_sales_context` doesn't need the raw profile.

    `gtm.structure` porte la routine p23 retenue ; `model`/`salesTeamSize` ne
    peuvent pas la reconstituer (« fondateur + alternant » et « account team » ne
    se déduisent pas d'un effectif). Les dossiers antérieurs à ce champ retombent
    sur la déduction historique — jamais d'erreur, juste moins de finesse."""
    gtm = ((sales_context or {}).get("esnProfile") or {}).get("gtm") or {}
    structure = gtm.get("structure")
    if isinstance(structure, str) and structure in SALES_STRUCTURES and structure != "inconnu":
        return structure
    if gtm.get("model") == "founder_led":
        return "founder_solo"
    size = gtm.get("salesTeamSize")
    if gtm.get("model") == "team" and isinstance(size, int):
        return "founder_solo" if size <= 1 else ("duo_trio" if size <= 4 else "equipe")
    return "inconnu"


# Modèle de staffing (le CONTRAT : régie/forfait/centre de service) → valeur
# de contrat (esnStaffingModelSchema). #3244/#3186 — ces needles cherchaient
# ce vocabulaire dans `staffingModel`/`staffing_model` (`positionnement.ts`),
# qui porte en réalité un axe DIFFÉRENT et orthogonal : le modèle d'EMPLOI
# (CDI/freelance, cinq libellés, aucun ne contient « régie »/« forfait »/
# « centre de service »/« mixte ») — déjà lu correctement pour CET axe par
# `_employment_model` plus bas. Résultat en production : `_staffing_model`
# rendait toujours `inconnu`, needles morts, jamais un vrai contrat classé.
#
# Le vocabulaire régie/forfait/centre de service EXISTE bien dans le
# questionnaire — sur `service_types` (multi-sélection, `offre-secteurs.ts`) :
# « Régie », « Forfait », « Centre de services », « Assistance technique » en
# sont des OPTIONS littérales, exactement les mots que ces needles visaient.
_STAFFING_NEEDLES: tuple[tuple[str, str], ...] = (
    ("régie", "regie"),
    ("regie", "regie"),
    ("assistance", "regie"),
    ("forfait", "forfait"),
    ("projet", "forfait"),
    ("centre de service", "centre_de_service"),
    ("centre_de_service", "centre_de_service"),
    ("managed", "centre_de_service"),
)


def _staffing_modes(profile_data: dict[str, Any]) -> list[str]:
    """Les modes contractuels DISTINCTS déclarés dans `service_types`, dans l'ordre
    de déclaration (#3186.10 — Laura les NOMME, elle ne dit pas seulement « mixte »)."""
    types = _string_list(profile_data.get("service_types") or profile_data.get("serviceTypes"))
    modes: list[str] = []
    for entry in types:
        text = entry.lower()
        for needle, value in _STAFFING_NEEDLES:
            if needle in text:
                if value not in modes:
                    modes.append(value)
                break
    return modes


def _staffing_model(profile_data: dict[str, Any]) -> str:
    """rang1 de `service_types` n'a qu'UN axe par entrée déclarée : plusieurs
    entrées qui classent des valeurs DIFFÉRENTES (ex. « Régie » + « Forfait »)
    déclarent un modèle MIXTE, jamais tranché au hasard vers l'une des deux —
    même discipline que `_rank_position` (rang1 ET rang2 déclarés ⇒ mixte)."""
    modes = _staffing_modes(profile_data)
    if not modes:
        return "inconnu"
    if len(modes) > 1:
        return "mixte"
    return modes[0]


# #2645.2 — modèle de revenu déclaré → valeur de contrat (esnRevenueModelSchema).
# ⚠️ L'ORDRE EST LE COMPORTEMENT : « Un mix de récurrent et de one-shot »
# (libellé verbatim de `sante-activite.ts`) contient les trois mots. Le mix se
# reconnaît donc EN PREMIER ; sinon tout mix partirait en `ponctuel`, et
# `cadence-templates.ts` resserrerait la relance de quelqu'un qui n'a rien
# demandé. Aucun libellé hors catalogue ne conclut : on retombe sur `inconnu`.
_REVENUE_NEEDLES: tuple[tuple[str, str], ...] = (
    ("mix", "mixte"),
    ("mixte", "mixte"),
    ("one-shot", "ponctuel"),
    ("one shot", "ponctuel"),
    ("ponctuel", "ponctuel"),
    ("projet unique", "ponctuel"),
    ("récurrent", "recurrent"),
    ("recurrent", "recurrent"),
)


def revenue_model_from_profile(profile_data: dict[str, Any]) -> str:
    """#2645.2 — d'où vient le chiffre d'affaires : d'un contrat qui se
    reconduit (`recurrent`), d'une mission qui se termine (`ponctuel`), ou des
    deux (`mixte`). Dérivé de `revenue_recurrence`, DÉCLARÉ au questionnaire
    (`sante-activite.ts`) — jamais deviné à partir du staffing ni du TJM.
    Non déclaré ⇒ `inconnu`, et les deux consommateurs (angle, cadence) ne
    changent alors RIEN à ce qu'ils faisaient avant ce lot."""
    text = str(profile_data.get("revenueRecurrence") or profile_data.get("revenue_recurrence") or "").lower()
    for needle, value in _REVENUE_NEEDLES:
        if needle in text:
            return value
    return "inconnu"


#: #2645.2 — ce que le modèle de revenu change dans l'ANGLE d'attaque proposé,
#: sur le PATRON de `stage_calibration_block` (`esn_stage.py`) : un bloc de
#: prompt dérivé d'un fait déclaré, jamais une bande inventée.
#:
#: Le sens métier, tel que Louis l'a tranché le 20/09/2026 : une mission
#: PONCTUELLE se vend sur un besoin daté et un livrable, une mission RÉCURRENTE
#: sur une capacité installée dans la durée. Un modèle MIXTE ne se tranche pas à
#: la place du commercial — on demande les deux angles, nommés.
_REVENUE_ANGLE_BRIEF: dict[str, str] = {
    "ponctuel": (
        "Modele de revenu de l'ESN : essentiellement PONCTUEL (mission, projet qui se termine) — declare au "
        "questionnaire.\n"
        "- Ouvre sur un besoin DATE : un projet a lancer, une echeance reglementaire, un pic de charge. "
        "Jamais sur une capacite a installer dans la duree.\n"
        "- La promesse porte sur un RESULTAT livrable et sa date, pas sur une presence longue.\n"
        "- Prevois la suite DES l'angle : ce qui justifiera de revenir apres la livraison (un nouveau besoin "
        "nait d'une livraison, pas d'une relance)."
    ),
    "recurrent": (
        "Modele de revenu de l'ESN : essentiellement RECURRENT (regie longue, forfait reconduit) — declare au "
        "questionnaire.\n"
        "- Ouvre sur une capacite a INSTALLER dans la duree : une equipe a tenir, un run a absorber, une "
        "competence a securiser.\n"
        "- La promesse porte sur la continuite et la tenue du niveau de service, pas sur un livrable date.\n"
        "- Vise le budget qui se reconduit, pas l'enveloppe d'un projet."
    ),
    "mixte": (
        "Modele de revenu de l'ESN : MIXTE (recurrent ET ponctuel declares) — declare au questionnaire.\n"
        "- Ne tranche pas a sa place : propose au moins un angle DATE (projet) et un angle INSTALLE (duree), "
        "et dis explicitement lequel sert quoi."
    ),
}


def revenue_model_block(profile_data: dict[str, Any] | None) -> str:
    """Le bloc « MODELE DE REVENU » du prompt strategy (#2645.2).

    `""` quand rien n'est déclaré — le prompt est alors byte-identique à celui
    d'avant ce lot. On ne calibre pas un angle sur un modèle de revenu qu'on n'a
    pas (GA-18/GA-19 : une valeur non mesurée ne se comporte pas comme une
    valeur mesurée)."""
    brief = _REVENUE_ANGLE_BRIEF.get(revenue_model_from_profile(profile_data or {}))
    if not brief:
        return ""
    return f"\n\n===== MODELE DE REVENU DE L'ESN =====\n{brief}"


def _tjm_band(profile_data: dict[str, Any]) -> str:
    """Bande TJM à partir du TJM moyen déclaré (bas < 450, moyen 450-650, haut >
    650 €). Non renseigné ⇒ `inconnu` — jamais une valeur inventée."""
    import re as _re

    raw = str(profile_data.get("avgTJM") or profile_data.get("avg_tjm") or "")
    nums = [int(n) for n in _re.findall(r"\d+", raw)]
    if not nums:
        return "inconnu"
    tjm = max(nums)
    if tjm < 450:
        return "bas"
    if tjm <= 650:
        return "moyen"
    return "haut"


def _bench_band(profile_data: dict[str, Any]) -> str:
    """Bande d'intercontrats déclarée (`available_consultants_band`), normalisée
    en bas/moyen/haut. Absent ⇒ `inconnu`."""
    text = str(
        profile_data.get("availableConsultantsBand") or profile_data.get("available_consultants_band") or ""
    ).lower()
    if not text:
        return "inconnu"
    if any(n in text for n in ("aucun", "0", "plein", "full", "faible", "bas", "low")):
        return "bas"
    if any(n in text for n in ("beaucoup", "élevé", "eleve", "haut", "high", "fort")):
        return "haut"
    if any(n in text for n in ("moyen", "medium", "quelques")):
        return "moyen"
    return "inconnu"


def _string_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, (list, tuple)):
        return [str(v).strip() for v in value if str(v).strip()]
    return []


# #2645.1 — les types d'offre qui vendent EN DIRECT au client final (rang1),
# par opposition à « Sous-traitance rang 2 ». « Sous-traitance » SEULE (sans
# « rang 2 ») n'entre dans AUCUN des deux ensembles : ce n'est pas la demande
# de l'issue, et deviner un rang à partir d'elle inventerait une position que
# le questionnaire n'a pas affirmée.
_DIRECT_SERVICE_TYPES = frozenset(
    {"Régie", "Forfait", "Conseil", "Audit", "Centre de services", "Produit ou formation"}
)


def _rank_position(profile_data: dict[str, Any]) -> str:
    """rang1 (prime) / rang2 (sous-traitant) / mixte / inconnu — dérivé de
    `service_types` (`offre-prestations.ts`), le seul signal que le
    questionnaire capte aujourd'hui sur cet axe. Rang2 seul si « Sous-traitance
    rang 2 » est déclaré sans aucun type de vente directe ; mixte si les deux
    coexistent ; inconnu sinon — jamais un rang1 devine par défaut."""
    types = _string_list(profile_data.get("service_types") or profile_data.get("serviceTypes"))
    if "Sous-traitance rang 2" not in types:
        return "inconnu"
    return "mixte" if any(t in _DIRECT_SERVICE_TYPES for t in types) else "rang2"


#: #3244 (reste de #3186.10) — `businessModel.rankPosition` (#2645.1) etait
#: CALCULE par `_esn_profile_context` mais n'avait AUCUN appelant en aval
#: (« capture != consomme », le defaut n°1 de ce depot) : aucune strategie ne
#: refusait une route qu'une ESN rang2 ne peut pas tenir, alors que c'est
#: l'exemple meme cite par l'epopee (« une ESN rang 2 ne peut pas pretendre a
#: un acces direct au client final »). Meme sequence que le mouvement
#: d'ouverture rang2 (`opening_movement.OPENING_MOVEMENTS["rang2"]`), pour que
#: les deux axes (le mouvement PAR COMPTE, la position STRUCTURELLE de l'ESN)
#: se disent la meme chose.
_RANK_POSITION_ANGLE_BRIEF: dict[str, str] = {
    "rang2": (
        "Position de l'ESN dans la chaine de sous-traitance : RANG 2 (sous-traitante, jamais en direct "
        "avec le client final) - declare au questionnaire.\n"
        "- Ne recommande JAMAIS un acces direct au sponsor ou au client final : le titulaire (rang 1) est "
        "l'interlocuteur contractuel. L'entree passe par le delivery puis le manager cote client, sans "
        "jamais court-circuiter le partenaire.\n"
        "- La preuve mobilisable est celle du DELIVERY (une mission deja tenue pour ce rang 1 ou un rang 1 "
        "similaire), jamais une reference client final que l'ESN n'a pas signee elle-meme."
    ),
    "mixte": (
        "Position de l'ESN dans la chaine de sous-traitance : MIXTE (vente directe ET sous-traitance rang 2 "
        "declarees) - declare au questionnaire.\n"
        "- Ne tranche pas a sa place : verifie ce que le compte confirme comme acces avant de proposer un "
        "sponsor final, et replie sur la route rang2 (delivery -> manager client) quand rien ne confirme un "
        "acces direct."
    ),
}


def rank_position_block(profile_data: dict[str, Any] | None) -> str:
    """Le bloc « POSITION DANS LA CHAINE » du prompt strategy (#3244, reste de
    #3186.10). `""` quand rien n'est declare ou que l'ESN vend en direct
    (rang1) — le prompt reste alors byte-identique (GA-18/GA-19)."""
    brief = _RANK_POSITION_ANGLE_BRIEF.get(_rank_position(profile_data or {}))
    if not brief:
        return ""
    return f"\n\n===== POSITION DANS LA CHAINE DE SOUS-TRAITANCE =====\n{brief}"


#: #3244 (reste de #3186.10) — meme defaut : `profile_data["staffingModes"]`
#: (mappe depuis `staffing_modes`, `esnAnswersToProfileData`) etait CAPTURE
#: mais jamais LU par la strategie — seul le profiler onboarding (narratif)
#: le lisait. « Nearshore » est le seul des quatre tags du catalogue
#: (`staffing-modes.ts` : Recrutement apres besoin / Sous-traitance / Nearshore
#: / Partenaires) qui nomme sans ambiguite un mode d'emploi au sens de
#: l'epopee — les trois autres decrivent un CIRCUIT commercial (comment le
#: besoin arrive), pas un LIEU de delivery, et deviner un mode a partir d'eux
#: romprait « jamais de donnee fictive ».
def _is_nearshore(profile_data: dict[str, Any]) -> bool:
    modes = _string_list(profile_data.get("staffingModes") or profile_data.get("staffing_modes"))
    return "Nearshore" in modes


_NEARSHORE_COST_BRIEF = (
    "Mode de delivery declare : NEARSHORE (tout ou partie de l'equipe delivre depuis un pays voisin, cout "
    "reduit) - declare au questionnaire.\n"
    "- Adresse le cout EXPLICITEMENT dans l'angle : c'est l'argument que ce mode rend disponible, jamais un "
    "non-dit qu'un acheteur decouvre plus tard.\n"
    "- Ne laisse jamais deviner la localisation : nomme-la si elle est connue, sinon dis « delivery nearshore »"
    " sans lieu invente."
)


def nearshore_cost_block(profile_data: dict[str, Any] | None) -> str:
    """Le bloc « MODE DE DELIVERY » du prompt strategy (#3244, reste de
    #3186.10). `""` quand le nearshore n'est pas declare — byte-identique
    (GA-18/GA-19)."""
    if not _is_nearshore(profile_data or {}):
        return ""
    return f"\n\n===== MODE DE DELIVERY =====\n{_NEARSHORE_COST_BRIEF}"


#: #3244 (reste de #3186.10) — les 2 dernieres des 4 valeurs de l'axe (CDI /
#: freelance, apres rang2 et nearshore livres plus haut). Le bilan du 28/09
#: classait ce point hors lot en pensant qu'il fallait un TROISIEME champ
#: d'onboarding : faux — `staffing_model` (choix unique, `positionnement.ts`)
#: porte DEJA le spectre CDI<->freelance en clair (les 5 libelles du
#: catalogue), une collecte QUI EXISTE, jamais lue pour ce sens. Elle est
#: seulement lue ailleurs (`_staffing_model` ci-dessus) pour un axe DIFFERENT
#: et orthogonal (le CONTRAT regie/forfait) — deux questions distinctes qui
#: partagent une seule reponse texte, chacune y cherchant son propre signal.
#: Correspondance EXACTE au catalogue (`positionnement.ts`), jamais une
#: sous-chaine devinee : un libelle hors catalogue reste `inconnu`.
_EMPLOYMENT_MODEL_BY_LABEL: dict[str, str] = {
    "uniquement des cdi internes": "cdi",
    "principalement cdi + quelques freelances ponctuels": "cdi",
    "mix équilibré cdi / freelances": "mixte",
    "mix equilibre cdi / freelances": "mixte",
    "principalement freelances / sous-traitants": "freelance",
    "uniquement freelances (pas de cdi)": "freelance",
}


def _employment_model(profile_data: dict[str, Any]) -> str:
    text = str(profile_data.get("staffingModel") or profile_data.get("staffing_model") or "").strip().lower()
    return _EMPLOYMENT_MODEL_BY_LABEL.get(text, "inconnu")


_EMPLOYMENT_MODEL_ANGLE_BRIEF: dict[str, str] = {
    "cdi": (
        "Modele d'emploi declare : CDI (salaries propres, pas de reseau freelance) - declare au "
        "questionnaire.\n"
        "- Met en avant la STABILITE de l'equipe dans la duree (continuite, montee en competence sur le "
        "compte) plutot qu'une disponibilite immediate large.\n"
        "- Ne promets jamais une mobilisation a tres court terme sur un profil pointu sans l'avoir "
        "verifiee : le vivier est interne, pas un reseau ouvert."
    ),
    "freelance": (
        "Modele d'emploi declare : FREELANCE (reseau d'independants, pas de CDI) - declare au "
        "questionnaire.\n"
        "- Met en avant la RAPIDITE de mobilisation et la largeur du vivier de competences pointues.\n"
        "- Anticipe l'objection de continuite (turnover, dependance a une personne) dans l'angle plutot "
        "que de la laisser decouvrir plus tard."
    ),
    "mixte": (
        "Modele d'emploi declare : MIXTE (CDI ET freelances) - declare au questionnaire.\n"
        "- Ne tranche pas a sa place : cite la stabilite du noyau CDI et la flexibilite du reseau "
        "freelance selon ce que le compte demande, sans favoriser l'un par defaut."
    ),
}


def employment_model_block(profile_data: dict[str, Any] | None) -> str:
    """Le bloc « MODELE D'EMPLOI » du prompt strategy (#3244, reste de
    #3186.10). `""` quand rien n'est declare — byte-identique (GA-18/GA-19)."""
    brief = _EMPLOYMENT_MODEL_ANGLE_BRIEF.get(_employment_model(profile_data or {}))
    if not brief:
        return ""
    return f"\n\n===== MODELE D'EMPLOI =====\n{brief}"


#: #3186.10 — le mode contractuel déclaré, tel que Laura le lit dans /chat.
_CONTRACT_MODEL_LABEL: dict[str, str] = {
    "regie": "régie",
    "forfait": "forfait",
    "centre_de_service": "centre de services",
    "mixte": "mixte (plusieurs modes déclarés)",
}


def contract_model_line(profile_data: dict[str, Any] | None) -> str:
    """La ligne « Mode contractuel déclaré » du bloc PROFIL de /chat (#3186.10,
    recette prod 30/09). `_staffing_model` (réparé, `service_types`) n'était lu
    que par le pipeline d'analyse : la conversation ne le voyait jamais.
    Rien déclaré ⇒ la ligne NOMME l'absence (#3186, 02/10) ; l'axe
    CDI/freelance (`staffingModel`) reste un autre axe, rendu ailleurs."""
    modes = _staffing_modes(profile_data or {})
    if not modes:
        # Recette prod 02/10 (#3186) : sans mode déclaré, Laura affirmait
        # « principalement en régie » — rien ne le sourçait, rien ne lui disait
        # que l'absence était l'état connu. On NOMME l'absence (on n'affiche pas
        # ce qu'on n'a pas) ; l'axe CDI/freelance n'est jamais un mode.
        return (
            "\n- Mode contractuel : NON DÉCLARÉ au profil — n'affirme jamais « en régie » ni « au forfait »,"
            " ni que l'ESN est « principalement » en régie ou en freelances ; dis que le mode n'est pas"
            " déclaré, PUIS propose de le renseigner en appelant `propose_guided_action` (route"
            " `/settings/profile`, label « Renseigner le mode contractuel », highlight « Offre & expertise ›"
            " Prestations : déclarer Régie, Forfait ou Centre de services ») — la proposition est une carte,"
            " tu n'écris rien au profil"
        )
    if len(modes) == 1:
        label = _CONTRACT_MODEL_LABEL[modes[0]]
    else:
        label = "mixte (" + ", ".join(_CONTRACT_MODEL_LABEL[mode] for mode in modes) + ")"
    # Recette prod 02/10 : « Comment présenter notre modèle de staffing ? » répondait
    # freelance seulement. Le modèle de staffing d'une ESN, c'est D'ABORD ces modes
    # de contrat ; l'axe CDI/freelance (emploi) vient après, jamais seul.
    return (
        f"\n- Mode contractuel déclaré : {label}"
        " — « notre modèle de staffing » désigne d'abord ce(s) mode(s) : les nommer"
        " tous avant de parler de CDI ou de freelance"
    )


_STAFFING_MODEL_QUESTION_MARKERS: tuple[str, ...] = (
    "modele de staffing",
    "mode contractuel",
    "modele contractuel",
    "regie ou forfait",
    "regie ou au forfait",
    "forfait ou regie",
    "staffing model",
)

#: #3186 (recette prod 04/10) — la carte vers Réglages › Profil, UNE définition :
#: le prompt (`contract_model_line`) la décrit, le routeur la pose.
MISSING_CONTRACT_MODE_PROPOSAL: dict[str, Any] = {
    "action": "open_screen",
    "cost_credits": 0,
    "route": "/settings/profile",
    "label": "Renseigner le mode contractuel",
    "highlight": "Offre & expertise › Prestations : déclarer Régie, Forfait ou Centre de services",
}


def _asks_about_staffing_model(message: str) -> bool:
    text = unicodedata.normalize("NFKD", message or "").encode("ascii", "ignore").decode().lower()
    return any(marker in text for marker in _STAFFING_MODEL_QUESTION_MARKERS)


def missing_contract_mode_proposal(profile_data: dict[str, Any] | None, message: str) -> dict[str, Any] | None:
    """#3186 — la carte « Renseigner le mode contractuel », posée PAR LE SERVEUR
    quand la question porte sur le modèle de staffing et qu'aucun mode Régie /
    Forfait n'est déclaré. Recette prod 04/10 : la ligne du prompt seule
    n'obtenait ni la carte ni l'aveu. Mode déclaré ou autre question : ``None``."""
    if _staffing_modes(profile_data or {}) or not _asks_about_staffing_model(message):
        return None
    return dict(MISSING_CONTRACT_MODE_PROPOSAL)


def contract_mode_turn_block(profile_data: dict[str, Any] | None, message: str) -> str:
    """#3186 — la consigne du TOUR : Laura dit que le mode n'est pas déclaré, ne
    le suppose pas (« présente-le en régie »), et annonce la carte posée par le
    serveur. Vide si un mode est déclaré ou si la question est autre."""
    if missing_contract_mode_proposal(profile_data, message) is None:
        return ""
    return (
        "\n\nMODE CONTRACTUEL NON DÉCLARÉ (consigne de ce tour) : ta réponse COMMENCE par dire que le mode "
        "(Régie, Forfait, Centre de services) n'est pas déclaré au profil. Tu ne le supposes JAMAIS — aucun "
        "« présente-le en régie » ni « au forfait ». Tu peux donner une façon de présenter un modèle de "
        "staffing en restant conditionnelle (« si tu es en régie… / si tu es au forfait… »). Une carte « "
        f"{MISSING_CONTRACT_MODE_PROPOSAL['label']} » vers Réglages › Profil est jointe à ta réponse : "
        "invite à la déclarer, sans écrire au profil."
    )


def _esn_profile_context(profile_data: dict[str, Any]) -> dict[str, Any]:
    """L'axe esnProfile. Les sous-objets (`businessModel`, `capacity`,
    `references`, `tools`) sont désormais REMPLIS à partir de ce que le
    questionnaire a capté (p4 « dimensions du user profile ») — modèle de
    staffing, bande TJM, intercontrats, références sectorielles/clients, outils.
    Toute dimension non déclarée reste `inconnu`/`[]` : jamais inventée. `stage`
    reste la clé de branchement."""
    raw_team = profile_data.get("salesTeamSize") or profile_data.get("sales_team_size")
    gtm_model, team_size = _gtm_model(raw_team)
    channels = _string_list(profile_data.get("outreachChannels") or profile_data.get("outreach_channels"))
    gtm: dict[str, Any] = {
        "model": gtm_model,
        "channels": channels,
        # La routine p23 retenue, portée explicitement : « fondateur + alternant »
        # et « account team » ne se déduisent pas d'un effectif.
        "structure": classify_sales_structure(raw_team),
    }
    if team_size is not None:
        gtm["salesTeamSize"] = team_size

    tools = _string_list(profile_data.get("tools")) or channels
    return {
        "stage": classify_esn_stage(profile_data.get("size")),
        "businessModel": {
            "rankPosition": _rank_position(profile_data),  # #2645.1 — dérivé de `service_types`
            # #2645.2 — le modèle de revenu change l'ANGLE proposé (bellum_strategy)
            # ET la CADENCE de relance (cadence-templates.ts / relationship_playbook).
            "revenueModel": revenue_model_from_profile(profile_data),
            "staffingModel": _staffing_model(profile_data),
            "marginBand": "inconnu",  # marge : non déclarée
            "tjmBand": _tjm_band(profile_data),
        },
        "capacity": {
            "benchAvailable": _bench_band(profile_data),
            "deliveryCapacity": "inconnu",
            "seniorityBand": "inconnu",
        },
        "gtm": gtm,
        "references": {
            "sectors": _string_list(profile_data.get("sectors")),
            "clients": _string_list(profile_data.get("references")),
            "cases": _string_list(profile_data.get("cases")),
        },
        "tools": tools,
    }


# ── Axe 2 — Account archetype (p5) ───────────────────────────────────────────
_SECTOR_KEY_TO_ARCHETYPE: dict[str, str] = {
    "banque": "banque_assurance",
    "assurance": "banque_assurance",
    "public": "public",
    "industrie": "industrie",
    "energie": "industrie",
    "transport": "industrie",
    "retail": "luxe_retail_media",
    "telecom": "luxe_retail_media",
}

# Divisions NAF → archétype (p5). Le code officiel est un signal PLUS FORT qu'un
# libellé de secteur en texte libre : « Groupe X » ne dit rien, la division 64
# dit « activités des services financiers ». On le lit donc AVANT les mots-clés.
# Seules les divisions qui tranchent un archétype de la p5 sont listées ; une
# division absente ne conclut rien (on retombe sur les signaux textuels).
_NAF_DIVISION_TO_ARCHETYPE: dict[str, str] = {
    # 64-66 : services financiers, assurance, auxiliaires — « banque / assurance »
    "64": "banque_assurance",
    "65": "banque_assurance",
    "66": "banque_assurance",
    # 84 : administration publique — « secteur public »
    "84": "public",
    # 05-39 : industries extractives, manufacturières, énergie, eau/déchets
    **{f"{d:02d}": "industrie" for d in range(5, 40)},
    # 49-53 : transports et entreposage — sites, supply, OT/IT
    **{f"{d:02d}": "industrie" for d in range(49, 54)},
    # 45-47 : commerce — « retail »
    "45": "luxe_retail_media",
    "46": "luxe_retail_media",
    "47": "luxe_retail_media",
    # 58-60 : édition, cinéma/audiovisuel, diffusion — « média »
    "58": "luxe_retail_media",
    "59": "luxe_retail_media",
    "60": "luxe_retail_media",
}


def _naf_division(naf_code: str | None) -> str | None:
    """Les deux premiers chiffres d'un code NAF/APE (« 6201Z » → « 62 »)."""
    digits = re.sub(r"\D", "", str(naf_code or ""))
    return digits[:2] if len(digits) >= 2 else None


_STARTUP_NEEDLES = ("startup", "scale-up", "scaleup", "scale up", "jeune pousse", "licorne", "start-up")
_GRAND_GROUPE_NEEDLES = ("cac40", "cac 40", "sbf120", "sbf 120", "grand groupe", "multinationale")
_MEDIA_NEEDLES = ("média", "media", "audiovisuel", "presse", "streaming", "publicité", "publicite", "adtech")
_LUXE_NEEDLES = ("luxe", "haute couture", "maroquinerie", "joaillerie", "cosmétique de luxe")
_FR_COUNTRIES = ("fr", "france", "")


#: #2625.1 — catégorie INSEE officielle (PME/ETI/GE, qui croise effectif, CA
#: et bilan) déjà calculée par Découvrir (`recherche_entreprises.py`
#: `sizeClass` / `categorie_entreprise`) mais jamais réemployée ici : un raw
#: `employees < 5000` répondait « pme_eti » même quand le CA/bilan classait
#: DÉJÀ l'entreprise « GE » à l'INSEE — jamais déclarée trop grosse, sans
#: aucune explication visible.
_SIZE_CLASS_TO_ARCHETYPE = {"ge": "grand_groupe", "eti": "pme_eti", "pme": "pme_eti"}


def classify_account_archetype(
    sector_text: str | None,
    employees: Any = None,
    country: str | None = None,
    subsidiary_count: int | None = None,
    naf_code: str | None = None,
    size_class: str | None = None,
) -> tuple[str, str, int, list[str]]:
    """Return `(archetype, derivation, confidence, evidence)` honouring the
    contract invariant: a real classification is `inferred` (confidence ≤ 99, ≥ 1
    evidence) ; only the `inconnu` fallback is `default` (confidence 0)."""
    from app.knowledge import match_sector

    text = (sector_text or "").lower()
    size = _size_int(employees)
    country_norm = (country or "").strip().lower()

    # 0) Le code NAF officiel du registre, quand il existe, prime sur tout signal
    # textuel : c'est une donnée déclarée à l'INSEE, pas un libellé marketing.
    # Confiance 90 (supérieure au 85 du mot-clé secteur), sans jamais atteindre
    # 100 qui reste réservé à une assertion de l'utilisateur (invariant du contrat).
    naf_archetype = _NAF_DIVISION_TO_ARCHETYPE.get(_naf_division(naf_code) or "")
    if naf_archetype:
        return naf_archetype, "inferred", 90, [f"code NAF officiel: {naf_code}"]

    # 1) Sector-regulated / sector-defining archetypes win.
    sector_key = match_sector(sector_text)
    if sector_key in _SECTOR_KEY_TO_ARCHETYPE:
        return _SECTOR_KEY_TO_ARCHETYPE[sector_key], "inferred", 85, [f"secteur: {sector_key}"]
    if any(n in text for n in _MEDIA_NEEDLES) or any(n in text for n in _LUXE_NEEDLES):
        return "luxe_retail_media", "inferred", 80, ["libellé secteur: luxe/média"]

    # 2) Explicit structure / geo wording.
    if any(n in text for n in _GRAND_GROUPE_NEEDLES):
        return "grand_groupe", "inferred", 80, ["libellé: grand groupe / CAC40"]
    if any(n in text for n in _STARTUP_NEEDLES):
        return "startup", "inferred", 80, ["libellé: startup / scale-up"]

    # 3) Geography — a clearly foreign HQ, no stronger sector signal.
    if country_norm and country_norm not in _FR_COUNTRIES:
        return "international", "inferred", 70, [f"siège hors FR: {country_norm}"]

    # 3 bis) #2625.1 — catégorie INSEE officielle de Découvrir (croise
    # effectif/CA/bilan), plus fiable que le seul effectif brut du step 4 mais
    # moins qu'un signal explicite (NAF, secteur, libellé) déjà tranché plus haut.
    size_class_archetype = _SIZE_CLASS_TO_ARCHETYPE.get((size_class or "").strip().lower())
    if size_class_archetype:
        return (
            size_class_archetype,
            "inferred",
            75,
            [f"catégorie officielle (Découvrir): {(size_class or '').strip().upper()}"],
        )

    # 4) Size / structure fallback.
    if subsidiary_count is not None and subsidiary_count >= 5:
        return "grand_groupe", "inferred", 65, [f"{subsidiary_count} filiales"]
    if size is not None and size >= 5000:
        return "grand_groupe", "inferred", 65, [f"effectif ~{size}"]
    if size is not None:
        return "pme_eti", "inferred", 60, [f"effectif ~{size}"]

    return "inconnu", "default", 0, []


# ── Axe 3 — Relationship state (p6) ──────────────────────────────────────────
_KNOWN_STATUS_TO_STATE = {
    "active": "client_actif",
    "former": "ancien_client",
    "engaged-prospect": "besoin_ouvert",
}
_KANBAN_TO_STATE = {
    "customer": "client_actif",
    "opportunity": "besoin_ouvert",
    "watching": "connu",
    "archived": "dormant",
    "inbox": "froid",
}


# #3278.1 — les quatre signaux de route que l'API lit (`routeSignalsOf`).
_API_ROUTE_SIGNALS = ("watch_only", "talent_from_account", "event_community", "inbound_content")


def _true_route_signals(signals: dict[str, bool] | None) -> dict[str, bool]:
    """Seuls les `True` des quatre signaux connus : une clé absente ne dit rien,
    un `False` ne se lit jamais « vérifié », une clé inconnue est ignorée."""
    return {key: True for key in _API_ROUTE_SIGNALS if (signals or {}).get(key) is True}


def classify_relationship_state(
    commercial_status: str | None = None,
    known_status: str | None = None,
    preset: str | None = None,
    signal_type: str | None = None,
    has_crm_presence: bool = False,
    last_interaction: str | None = None,
    partner_placements_active: int | None = None,
) -> tuple[str, str, int, list[str], str | None]:
    """Return `(state, derivation, confidence, evidence, lastInteractionAt)`.
    A user-declared preset/context is certain (100) ; a kanban/CRM inference is
    `inferred` (≤ 99 + evidence) ; a bare cold account is `default` (0)."""
    last = last_interaction or None

    # 1) Incumbent context (user picked it) → rang 2.
    if preset == "incumbent":
        return "rang2", "user_declared", 100, ["contexte: incumbent (déclaré)"], last

    # 2) Explicit declared relationship (KnownAccountContext).
    if known_status in _KNOWN_STATUS_TO_STATE:
        return _KNOWN_STATUS_TO_STATE[known_status], "user_declared", 100, [f"statut déclaré: {known_status}"], last

    # 3) A tender signal context is an open need.
    if preset == "signal" and signal_type == "tender":
        return "besoin_ouvert", "user_declared", 100, ["contexte: appel d'offres (déclaré)"], last

    # 3 bis) #2371.4 (#2887) — 10e stade « partenaire actif » : la relation
    # PARTENAIRE de même SIREN porte des placements EN COURS (lu côté API sur
    # `partner_relations`, même espace). Un fait déclaré sur la relation, donc
    # au-dessus du kanban (pré-classification) ; une déclaration humaine
    # ci-dessus gagne toujours. Absent / 0 → classification d'avant, à l'octet.
    if partner_placements_active and partner_placements_active > 0:
        return (
            "partenaire_actif",
            "inferred",
            85,
            [f"relation partenaire : {partner_placements_active} placement(s) en cours"],
            last,
        )

    # 4) The commercial kanban (system pre-classification → inferred).
    if commercial_status in _KANBAN_TO_STATE:
        state = _KANBAN_TO_STATE[commercial_status]
        if state == "froid":
            if has_crm_presence:
                return "connu", "inferred", 65, ["présence CRM sur le compte"], last
            return "froid", "default", 0, [], last
        return state, "inferred", 70, [f"kanban: {commercial_status}"], last

    # 5) CRM presence alone lifts a stranger to "connu".
    if has_crm_presence:
        return "connu", "inferred", 65, ["présence CRM sur le compte"], last

    # 6) Default: cold.
    return "froid", "default", 0, [], last


# ── Assembly ─────────────────────────────────────────────────────────────────
def build_sales_context(
    profile_data: dict[str, Any] | None,
    account_facts: dict[str, Any] | None = None,
    *,
    commercial_status: str | None = None,
    known_status: str | None = None,
    context_preset: str | None = None,
    signal_type: str | None = None,
    has_crm_presence: bool = False,
    last_interaction: str | None = None,
    declared_partners: list[str] | None = None,
    consultant_history: str | None = None,
    declared_signal_present: bool = False,
    partner_placements_active: int | None = None,
    declared_route_signals: dict[str, bool] | None = None,
) -> dict[str, Any]:
    """Assemble the SalesContext dict, wire-compatible with the zod
    `salesContextSchema` (invariants included). Pure: no LLM, no I/O beyond the
    sector keyword match."""
    profile = profile_data or {}
    facts = account_facts or {}

    archetype, arch_deriv, arch_conf, arch_ev = classify_account_archetype(
        facts.get("sector") or facts.get("businessDescription"),
        employees=facts.get("employees"),
        country=facts.get("country") or facts.get("registry_country"),
        subsidiary_count=facts.get("subsidiary_count"),
        naf_code=facts.get("nafCode") or facts.get("naf_code") or facts.get("naf"),
    )

    rel_state, rel_deriv, rel_conf, rel_ev, rel_last = classify_relationship_state(
        commercial_status=commercial_status,
        known_status=known_status,
        preset=context_preset,
        signal_type=signal_type,
        has_crm_presence=has_crm_presence,
        last_interaction=last_interaction,
        partner_placements_active=partner_placements_active,
    )

    relationship: dict[str, Any] = {
        "state": rel_state,
        "derivation": rel_deriv,
        "confidence": rel_conf,
        "evidence": rel_ev,
    }
    if rel_last:
        relationship["lastInteractionAt"] = rel_last

    return {
        "salesContextVersion": SALES_CONTEXT_VERSION,
        "esnProfile": _esn_profile_context(profile),
        "account": {
            "archetype": archetype,
            "derivation": arch_deriv,
            "confidence": arch_conf,
            "evidence": arch_ev,
        },
        "relationship": relationship,
        # #2273.9-.21 — partenaires DÉCLARÉS en place sur le compte
        # (`account_partners`, résolus côté API). Clé OMISE sans partenaire :
        # SalesContext byte-identique ; lue par `route_signals_from_sales_context`.
        **({"declaredPartners": partners} if (partners := _string_list(declared_partners)) else {}),
        # #3278.1 — missions du compte (`missions`, côté API) : « present » /
        # « former ». Clé OMISE sans mission : SalesContext byte-identique ;
        # lue par `route_signals_from_sales_context`.
        **({"consultantHistory": consultant_history} if consultant_history in ("present", "former") else {}),
        # #3278.1 — route « signal entrant » : un signal d'achat DÉCLARÉ (saisie
        # ou import, #2634.1, côté API) existe sur ce compte. Clé OMISE sans
        # signal déclaré : SalesContext byte-identique ; lue par
        # `route_signals_from_sales_context`.
        **({"declaredSignalPresent": True} if declared_signal_present else {}),
        # #3278.1 — veille seule / depuis un talent / événement / inbound, lus côté
        # API : seuls les `True` des quatre clés connues. Clé OMISE sans signal :
        # SalesContext byte-identique ; lue par `route_signals_from_sales_context`.
        **({"declaredRouteSignals": route_flags} if (route_flags := _true_route_signals(declared_route_signals)) else {}),
    }
