"""Deterministic next-best-action selector (Annexe Méthodologie Sales ESN p28 —
« Bibliothèque de 100 actions » + the MOTEUR rule).

The spec is explicit (p28): the Bible Sales must become a catalogue FILTERED by
scenario — « L'agent choisit 3 à 5 actions selon user profile, relation, score,
données manquantes et horizon. Il ne doit JAMAIS proposer 20 actions non
hiérarchisées. » The plan today emits ~10-20 unranked actions.

This module is the code half: a scenario-indexed catalogue over the 6 chantiers
(Compte / Contacts / Signaux / Messages / Delivery / Expansion) and a selector
that returns the **3 to 5** ranked next actions for a given SalesContext × verdict
× missing-data × horizon. No LLM — compute-side, explainable, each action citing
the rule that selected it. Emitted additively (never rewrites the plan).
"""

from __future__ import annotations

from typing import Any

from app.services.sales_context import sales_structure_from_context
from app.services.team_routines import action_cap_for_structure

CHANTIERS = ("compte", "contacts", "signaux", "messages", "delivery", "expansion")
# #2317.4 (épopée #2923) — « Aujourd'hui » est un horizon NOMMÉ à part, ajouté
# EN TÊTE plutôt qu'en fusionnant ou en renommant les quatre existants (GA-08 :
# un enum ne perd jamais de valeur et n'en insère jamais au milieu). Aucune
# action du catalogue n'y est encore rangée : quelle action précise mérite
# « aujourd'hui » plutôt que « 7j » est un choix de CONTENU, pas un manque
# d'infrastructure — le bucket existe, prêt à être peuplé, et reste
# honnêtement VIDE tant que personne ne l'a tranché (#2317.5 : jamais rempli
# artificiellement pour faire joli).
HORIZONS = ("aujourd'hui", "7j", "30j", "60j", "90j")

# The catalogue: id → (chantier, label). A curated, actionable subset of the p28
# library (the "100 actions" is the aspiration; these are the load-bearing ones
# the selector routes). Labels are the concrete move, not a theme.
ACTION_CATALOG: dict[str, tuple[str, str]] = {
    # Compte — collect / correct the account picture
    "corriger_identite": ("compte", "Corriger l'identité de l'entité cible (bon SIREN / périmètre)"),
    "cartographier_bu": ("compte", "Cartographier les BU / filiales et identifier l'entité la plus accessible"),
    "verifier_panel": ("compte", "Vérifier le panel / référencement fournisseurs en place"),
    "chercher_consultants_passes": ("compte", "Chercher les consultants déjà passés chez ce client (preuve + porte)"),
    "chercher_esn_presentes": ("compte", "Identifier les ESN déjà présentes (concurrence / rang 2)"),
    # Contacts
    "enrichir_p1": ("contacts", "Enrichir les contacts prioritaires (email / LinkedIn / téléphone)"),
    "etendre_persona": ("contacts", "Étendre la recherche aux personas manquants (N-2 accessibles)"),
    "chercher_achats": ("contacts", "Identifier l'interlocuteur achats / le processus de référencement"),
    "demander_intro": ("contacts", "Demander une introduction via un référent / une relation commune"),
    "masquer_bruit": ("contacts", "Écarter le bruit (homonymes, ex-employés, hors périmètre) avec la raison"),
    # Signaux — p28 les nomme un par un ; un « chercher des signaux » générique
    # ne dit pas au commercial QUOI chercher, donc ne se pilote pas.
    "chercher_signaux": ("signaux", "Chercher des signaux frais (recrutements, AO, nominations, M&A)"),
    "signal_jobs": ("signaux", "Lire les offres d'emploi IT publiées (stack, volume, urgence)"),
    "signal_ao": ("signaux", "Suivre les appels d'offres et marchés attribués sur le périmètre"),
    "signal_nominations": ("signaux", "Repérer les nominations récentes (nouveau décideur = fenêtre)"),
    "signal_technos": ("signaux", "Détecter les technos / migrations en cours sur le SI"),
    "signal_ma": ("signaux", "Surveiller les opérations M&A / réorganisations d'entités"),
    "qualifier_achats": ("signaux", "Qualifier le processus d'achat / le titulaire à déloger (DECP)"),
    # Messages
    "envoyer_m1": ("messages", "Envoyer le 1er message (M1) contextualisé aux contacts prioritaires"),
    "relance_courte": ("messages", "Relance courte avec une nouvelle preuve / ressource"),
    "call_script": ("messages", "Passer un appel de qualification (script découverte)"),
    "lead_magnet": ("messages", "Envoyer un lead magnet relié au besoin (benchmark, cas, checklist)"),
    "close_loop": ("messages", "Clore la boucle proprement (close-loop respectueux, revenir plus tard)"),
    # Delivery
    "push_profil": ("delivery", "Pousser 1-2 profils qualifiés sur le besoin ouvert (reco personnalisée)"),
    "brief_consultant": ("delivery", "Briefer le consultant (compte, besoin, interlocuteurs, objections, plan J+30)"),
    "preparer_soutenance": ("delivery", "Préparer la soutenance (questions, projection, exemples, prochaines étapes)"),
    "feedback_soutenance": (
        "delivery",
        "Recueillir le feedback après soutenance (retenu/refusé, raison, apprentissage)",
    ),
    "rex_mission": ("delivery", "Formaliser le REX de mission et le rendre réutilisable comme preuve"),
    # Expansion
    # #2424.11 — la première prudence, nommée : on en parle au manager du
    # compte, on ne diffuse jamais directement une piste d'expansion.
    "foisonner_bu": (
        "expansion",
        "Foisonner sur une BU adjacente / un nouveau besoin chez le client actif — "
        "en parler D'ABORD au manager du compte, jamais en diffusion directe",
    ),
    # #2424.10 — quand le REX est positif, la piste se nomme (équipe adjacente,
    # filiale, besoin complémentaire) plutôt que de rester le réflexe générique
    # « foisonner ». Même prudence qu'au-dessus (#2424.11) : le manager d'abord.
    "expansion_rex_positif": (
        "expansion",
        "Depuis le REX positif : proposer l'expansion vers l'équipe adjacente, la filiale "
        "ou un besoin complémentaire — en parler D'ABORD au manager du compte, jamais en diffusion directe",
    ),
    "consultant_capteur": ("expansion", "Débriefer les consultants en mission (capteurs de besoins)"),
    "renouvellement": ("expansion", "Sécuriser le renouvellement / le REX du contrat en cours"),
    "co_traitance": ("expansion", "Ouvrir une co-traitance avec un partenaire déjà référencé"),
    "passer_rang1": ("expansion", "Préparer le passage rang 2 → rang 1 (référencement direct)"),
}

# Which horizon each action naturally belongs to (p27 plan horizons). An action
# is boosted when it matches the requested horizon, never excluded by it.
_ACTION_HORIZON: dict[str, str] = {
    # 7 jours (p27) — « résoudre identité, historique, 10-30 contacts, achats/panel »
    "corriger_identite": "7j",
    "cartographier_bu": "7j",
    "verifier_panel": "7j",
    "chercher_consultants_passes": "7j",
    "chercher_esn_presentes": "7j",
    "enrichir_p1": "7j",
    "etendre_persona": "7j",
    "chercher_achats": "7j",
    "chercher_signaux": "7j",
    "signal_jobs": "7j",
    "signal_nominations": "7j",
    "signal_technos": "7j",
    "envoyer_m1": "7j",
    "masquer_bruit": "7j",
    # 30 jours — « multi-threading, besoins, push profils, RDV, sponsor »
    "demander_intro": "30j",
    "call_script": "30j",
    "qualifier_achats": "30j",
    "relance_courte": "30j",
    "signal_ao": "30j",
    "signal_ma": "30j",
    "lead_magnet": "30j",
    # 60 jours — « référencement, co-traitance, proposition, contenu/preuve »
    "push_profil": "60j",
    "brief_consultant": "60j",
    "preparer_soutenance": "60j",
    "close_loop": "60j",
    "co_traitance": "60j",
    # 90 jours — « signature, démarrage, suivi, foisonnement et capitalisation »
    "foisonner_bu": "90j",
    "expansion_rex_positif": "90j",
    "consultant_capteur": "90j",
    "renouvellement": "90j",
    "feedback_soutenance": "90j",
    "rex_mission": "90j",
    "passer_rang1": "90j",
}

# ── Réflexes par ARCHÉTYPE de compte (table p5) ──────────────────────────────
# « Ne jamais appliquer une stratégie unique » : le secteur, la taille, les achats
# et la structure interne changent le chemin de vente. Chaque entrée est un
# BOOST (id, priorité, raison citée) ajouté aux actions du scénario relationnel —
# jamais un remplacement, pour que la relation reste le pilote principal (p6).
#
# SÛRETÉ : un archétype `inconnu`/absent n'ajoute AUCUN boost — le plan est alors
# byte-identique à celui d'avant ce câblage (témoins dans test_action_archetype).
_ARCHETYPE_BOOSTS: dict[str, tuple[tuple[str, int, str], ...]] = {
    "startup": (
        ("envoyer_m1", 94, "startup (p5) : accès direct, cycle court — on ouvre, on ne prépare pas six mois"),
        ("enrichir_p1", 92, "startup : viser CTO/VP/Head joignables directement"),
        ("signal_jobs", 74, "startup : les recrutements disent l'urgence et la stack réelle"),
    ),
    "pme_eti": (
        ("call_script", 88, "PME/ETI (p5) : le RSI/DSI est joignable — l'appel qualifie plus vite qu'une séquence"),
        ("push_profil", 76, "PME/ETI : un profil concret et disponible prime sur une offre complexe"),
    ),
    "grand_groupe": (
        ("cartographier_bu", 94, "grand groupe (p5) : entrer par une BU/filiale/programme, jamais par le groupe"),
        ("etendre_persona", 82, "grand groupe : multi-threading indispensable, un seul contact ne porte pas"),
        ("verifier_panel", 78, "grand groupe : le référencement conditionne la voie contractuelle"),
    ),
    "banque_assurance": (
        ("verifier_panel", 92, "banque/assurance (p5) : panel et référencement lourds — les vérifier avant d'investir"),
        ("chercher_esn_presentes", 84, "banque/assurance : nombreuses entités et incumbents à situer"),
        ("cartographier_bu", 80, "banque/assurance : entités multiples, la cible utile est une entité, pas le groupe"),
    ),
    "public": (
        ("qualifier_achats", 96, "secteur public (p5/p19) : le besoin métier ne suffit pas sans voie contractuelle"),
        ("signal_ao", 88, "secteur public : marchés, accords-cadres et calendrier budgétaire pilotent le timing"),
        ("co_traitance", 72, "secteur public : la co-traitance est souvent la seule porte réaliste"),
    ),
    "luxe_retail_media": (
        ("signal_technos", 84, "luxe/retail/média (p5) : e-commerce et data client — l'angle est métier + techno"),
        ("chercher_signaux", 78, "luxe/retail/média : la saisonnalité commande la fenêtre d'approche"),
    ),
    "industrie": (
        ("cartographier_bu", 88, "industrie (p5) : la décision se joue par site, pas au siège"),
        ("signal_technos", 76, "industrie : OT/IT, supply et maintenance sont les portes d'entrée"),
    ),
    "international": (
        ("cartographier_bu", 90, "compte international (p5) : siège vs pays — trancher l'entité qui décide"),
        ("chercher_achats", 78, "compte international : le procurement est local, pas au siège"),
    ),
}

# ── Réflexes par STADE d'ESN (table p3) — DoD n°1 côté actions ───────────────
# « Freelance : rang2 intelligent, peu de grands comptes froids » vs « Grande ESN :
# référencements, grands programmes ». Sur un compte lourd (grand groupe, banque,
# public, international), la porte n'est donc pas la même selon le stade.
_HEAVY_ARCHETYPES = ("grand_groupe", "banque_assurance", "public", "international")


def _stage_boosts(esn_stage: str | None, archetype: str) -> tuple[tuple[str, int, str], ...]:
    """Boosts liés au STADE de l'ESN. Stade inconnu ⇒ aucun boost (le plan reste
    celui d'avant ce câblage)."""
    stage = (esn_stage or "").strip()
    if not stage or archetype not in _HEAVY_ARCHETYPES:
        return ()
    if stage in ("freelance", "petite"):
        return (
            ("demander_intro", 93, "petite ESN sur un compte lourd (p3) : la relation ouvre, pas le froid"),
            ("chercher_esn_presentes", 86, "petite ESN : le rang 2 chez un titulaire est la porte réaliste"),
        )
    if stage == "grande":
        return (
            ("verifier_panel", 91, "grande ESN (p3) : le référencement direct est assumé à ce stade"),
            ("passer_rang1", 70, "grande ESN : viser le rang 1 plutôt que la sous-traitance"),
        )
    return ()


# Selection floor/ceiling — the MOTEUR rule.
MIN_ACTIONS = 3
MAX_ACTIONS = 5

# Offset qui remet l'action de tête du scénario RELATIONNEL en position 1 après
# les boosts d'archétype. Au-dessus de toute priorité de catalogue (≤ 96) et de
# tout bonus d'horizon (+12) : la relation ne peut pas être délogée.
_LEAD_PIN = 1000


def _pick(picks: list[tuple[int, str, str]], action_id: str, priority: int, why: str) -> None:
    if action_id in ACTION_CATALOG:
        picks.append((priority, action_id, why))


def recommend_next_actions(
    *,
    verdict: str | None = None,
    relationship_state: str | None = None,
    account_archetype: str | None = None,
    has_missing_data: bool = False,
    horizon: str = "7j",
    esn_stage: str | None = None,
    sales_structure: str | None = None,
    # #2424.10 — un REX positif sur ce compte affine « foisonner » en une piste
    # NOMMÉE (équipe adjacente / filiale / besoin complémentaire). Faux par
    # défaut : un appelant qui ne le connaît pas encore retombe sur le réflexe
    # générique, inchangé.
    has_positive_rex: bool = False,
    # #3226 (#3202.6) — voir l'étape 3c ci-dessous. `False` par défaut : un
    # appelant qui ne le connaît pas encore retombe sur le comportement
    # d'avant ce câblage, inchangé (même convention que `has_positive_rex`).
    target_is_partnership_candidate: bool = False,
) -> list[dict[str, Any]]:
    """Return the 3-5 ranked next actions for the scenario. Each item:
    ``{id, chantier, label, why}``. Deterministic — the same scenario yields the
    same, hierarchised, capped set (never 20 flat actions).

    ``sales_structure`` (fondateur seul / 2-4 / 5+) lowers the ceiling INSIDE the
    MOTEUR band: a founder who sells alone gets the 3 strongest moves, not 5 he
    will never run. Unknown structure ⇒ the historical cap, unchanged."""
    v = (verdict or "").strip().upper()
    rel = (relationship_state or "").strip()
    horizon = horizon if horizon in HORIZONS else "7j"

    picks: list[tuple[int, str, str]] = []

    # 1) STOP → do not invest; the only move is to record why (or nothing).
    if v == "STOP":
        _pick(picks, "masquer_bruit", 90, "compte STOP : écarter proprement, ne pas y investir de temps")
        _pick(picks, "chercher_signaux", 40, "surveiller un éventuel retournement de signal")

    # 2) EXPLORER or missing data → the action is to COLLECT info, not to conclude.
    elif v == "EXPLORER" or has_missing_data:
        _pick(picks, "corriger_identite", 95, "données manquantes : fiabiliser l'identité avant toute reco")
        _pick(picks, "cartographier_bu", 90, "trouver l'entité accessible avant d'attaquer le groupe")
        _pick(picks, "chercher_signaux", 85, "collecter des signaux frais pour trancher le potentiel")
        _pick(picks, "enrichir_p1", 70, "obtenir des coordonnées pour ouvrir la conversation")
        _pick(picks, "verifier_panel", 60, "comprendre le panel / référencement en place")

    # 3) A relationship-driven scenario on a GO/PRUDENT account.
    else:
        if rel == "client_actif":
            if has_positive_rex:
                _pick(
                    picks,
                    "expansion_rex_positif",
                    97,
                    "REX positif : la piste d'expansion se lit dans le retour de mission, pas dans un réflexe générique",
                )
            else:
                _pick(picks, "foisonner_bu", 95, "client actif : foisonner sur une BU adjacente")
            _pick(picks, "consultant_capteur", 90, "capter les besoins via les consultants en mission")
            _pick(picks, "renouvellement", 80, "sécuriser le renouvellement / le REX")
            _pick(picks, "enrichir_p1", 55, "ouvrir un nouvel interlocuteur sur le compte")
        elif rel == "rang2":
            _pick(picks, "push_profil", 96, "rang 2 : entrer par le delivery (pousser un profil)")
            _pick(picks, "cartographier_bu", 80, "identifier le client final et le manager")
            _pick(picks, "qualifier_achats", 70, "cadrer la voie contractuelle sans brûler le partenaire")
        elif rel == "besoin_ouvert":
            _pick(picks, "push_profil", 95, "besoin ouvert : pousser 1-2 profils qualifiés")
            _pick(picks, "preparer_soutenance", 85, "préparer la soutenance et les objections")
            _pick(picks, "call_script", 70, "qualifier le besoin (BTMMP) par téléphone")
        elif rel == "partenaire_actif":
            # #2371.4 — un partenaire avec des placements en cours : on échange
            # besoins et mises en relation entre pairs, on ne prospecte pas.
            _pick(picks, "demander_intro", 94, "partenaire actif : échanger besoins et mises en relation")
            _pick(picks, "envoyer_m1", 75, "repartir de la collaboration en cours, sans pitch")
        elif rel in ("refere", "ancien_client"):
            _pick(picks, "demander_intro", 95, "relation existante : capitaliser via une intro/aiguillage")
            _pick(picks, "envoyer_m1", 80, "réengager avec un message lié à l'historique")
            _pick(picks, "chercher_signaux", 55, "vérifier ce qui a changé depuis")
        else:  # froid / connu / linkedin / dormant → open the account
            _pick(picks, "enrichir_p1", 90, "obtenir les coordonnées des décideurs accessibles")
            _pick(picks, "envoyer_m1", 85, "ouvrir avec un M1 contextualisé (pas de pitch catalogue)")
            _pick(picks, "chercher_esn_presentes", 65, "repérer la concurrence en place / un angle rang 2")
            _pick(picks, "chercher_signaux", 60, "accrocher le message à un signal frais")
            _pick(picks, "etendre_persona", 50, "élargir aux N-2 accessibles")

    # 3b) Réflexes d'ARCHÉTYPE (p5) et de STADE ESN (p3) — additifs.
    #
    # HIÉRARCHIE ASSUMÉE : la RELATION reste le pilote (p6 « le même signal produit
    # une action différente selon la relation existante »). L'archétype dit COMMENT
    # on entre chez ce type de compte et le stade ce que CETTE ESN peut tenir, mais
    # ni l'un ni l'autre ne peut déloger la première action qu'impose la relation —
    # sinon un client actif en banque se verrait proposer « vérifier le panel »
    # avant « foisonner sur une BU adjacente ». L'action de tête est donc épinglée.
    arch = (account_archetype or "").strip()
    if arch and arch != "inconnu" and picks:
        lead_priority, lead_id, lead_why = picks[0]
        for aid, prio, why in _ARCHETYPE_BOOSTS.get(arch, ()):
            _pick(picks, aid, prio, why)
        for aid, prio, why in _stage_boosts(esn_stage, arch):
            _pick(picks, aid, prio, why)
        # Anti-réflexe p5 : chez une startup « peu de process achat » — le détour
        # par le panel fournisseurs est un réflexe grand-compte déplacé.
        if arch == "startup":
            picks = [entry for entry in picks if entry[1] != "verifier_panel"]
        # Épingle : la dédup garde l'occurrence de plus haute priorité, donc
        # ré-empiler la tête du scénario relationnel la remet en position 1 quel
        # que soit le boost d'archétype. `lead_priority` est conservé pour que la
        # trace reste lisible en debug.
        if any(entry[1] == lead_id for entry in picks):
            picks.append((_LEAD_PIN + lead_priority, lead_id, lead_why))

    # 3c) Réflexe de PARTENARIAT (#3226, #3202.6 — « la possibilité d'un
    # partenariat » parmi les huit dimensions de l'archétype). DISTINCT de
    # `account_archetype` ci-dessus (`sales_context.ACCOUNT_ARCHETYPES`, une
    # taille/secteur) : ceci lit la NATURE commerciale du compte cible
    # (`company_archetype.CompanyArchetype` — ESN, cabinet de conseil,
    # cabinet de recrutement…), résolue par l'appelant (GA-26, jamais ici) et
    # transmise comme un simple booléen. `False` par défaut ⇒ plan
    # byte-identique à avant ce câblage.
    if target_is_partnership_candidate:
        _pick(
            picks,
            "co_traitance",
            75,
            "#3202.6 — l'archétype de ce compte (ESN/cabinet) en fait un partenaire potentiel, "
            "pas une cible à prospecter comme un client final",
        )

    # 4) Horizon boost — bring the actions that fit the requested horizon forward.
    boosted = [(p + (12 if _ACTION_HORIZON.get(aid) == horizon else 0), aid, why) for p, aid, why in picks]

    # 5) Rank, dedupe, cap — the MOTEUR rule (3-5, hierarchised).
    boosted.sort(key=lambda t: -t[0])
    seen: set[str] = set()
    ordered: list[tuple[int, str, str]] = []
    for p, aid, why in boosted:
        if aid not in seen:
            seen.add(aid)
            ordered.append((p, aid, why))

    # Pad to MIN with safe collect-info defaults if a thin scenario produced < 3.
    for aid, why in (
        ("cartographier_bu", "défaut : cartographier pour trouver la porte accessible"),
        ("enrichir_p1", "défaut : enrichir un contact accessible"),
        ("chercher_signaux", "défaut : chercher un signal d'accroche"),
    ):
        if len(ordered) >= MIN_ACTIONS:
            break
        if aid not in seen:
            seen.add(aid)
            ordered.append((0, aid, why))

    # Cap by the ESN's real selling capacity (cluster D §17) — never below the
    # MOTEUR floor of 3, and identical to before when the structure is unknown.
    cap = max(MIN_ACTIONS, action_cap_for_structure(sales_structure, MAX_ACTIONS))
    top = ordered[:cap]
    # Each emitted action states WHEN it belongs (p27 horizons). Additive key:
    # the four historical ones keep their exact values, and the plan screen can
    # group « à faire sous 7 jours » vs « sous 90 jours » without a second table.
    return [
        {
            "id": aid,
            "chantier": ACTION_CATALOG[aid][0],
            "label": ACTION_CATALOG[aid][1],
            "why": why,
            "horizon": horizon_for(aid),
        }
        for _, aid, why in top
    ]


def horizon_for(action_id: str) -> str:
    """The natural horizon of an action (p27 plan horizons 7j/30j/60j/90j). An
    unknown id defaults to `7j` — act now, don't lose it in a far bucket."""
    return _ACTION_HORIZON.get(action_id, "7j")


def group_actions_by_horizon(actions: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Bucket ranked next-actions into the four p27 horizons (7j → 30j → 60j → 90j),
    preserving each action's rank order within its bucket. Addresses the report's
    « horizons mauvais buckets » — the plan should hierarchise the 3-5 actions by
    when they belong, not deverse them flat. Pure: does not mutate the actions and
    never invents an action; every input lands in exactly one bucket."""
    buckets: dict[str, list[dict[str, Any]]] = {h: [] for h in HORIZONS}
    for action in actions:
        horizon = horizon_for(str(action.get("id", "")))
        buckets.setdefault(horizon, []).append(action)
    return buckets


def recommend_actions_from_context(
    sales_context: dict[str, Any] | None,
    *,
    verdict: str | None = None,
    has_missing_data: bool = False,
    horizon: str = "7j",
    # #2424.10 — même défaut lu depuis le SalesContext (`account.hasPositiveRex`,
    # ⚠️ champ pas encore émis par l'analyse : câblage restant, voir le
    # registre) qu'un appelant explicite ; l'un ou l'autre suffit.
    has_positive_rex: bool = False,
    # #3226 (#3202.6) — voir `recommend_next_actions`. Le SalesContext ne porte
    # pas cette notion (elle vit dans `company_archetype.py`, hors contrat
    # SalesContext) : l'appelant le calcule à part et le transmet ici.
    target_is_partnership_candidate: bool = False,
) -> list[dict[str, Any]]:
    """Convenience wrapper reading the emitted SalesContext dict (P0 shape)."""
    sc = sales_context or {}
    return recommend_next_actions(
        verdict=verdict,
        relationship_state=(sc.get("relationship") or {}).get("state"),
        account_archetype=(sc.get("account") or {}).get("archetype"),
        has_missing_data=has_missing_data,
        horizon=horizon,
        esn_stage=(sc.get("esnProfile") or {}).get("stage"),
        # La structure commerciale voyage déjà dans le SalesContext émis
        # (`esnProfile.gtm`) : aucun changement de contrat pour la lire.
        sales_structure=sales_structure_from_context(sc),
        has_positive_rex=bool((sc.get("account") or {}).get("hasPositiveRex")) or has_positive_rex,
        target_is_partnership_candidate=target_is_partnership_candidate,
    )
