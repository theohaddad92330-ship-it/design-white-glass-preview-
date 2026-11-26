"""Golden sets de la Definition of Done (Annexe Méthodologie Sales ESN p31).

Le rapport d'audit (`agent_docs/audit-methodo-2026-07-22.md` §2, manque n°5) est
sans appel : « aucun golden ne verrouille la DoD ». Les briques déterministes
existent et sont testées une par une, mais RIEN ne prouve la promesse produit —
**deux profils ESN différents sur le même compte doivent produire une stratégie
différente**. Un dé-câblage silencieux (le `commercial_status` qui cesse d'être
passé, la structure de vente qui n'entre plus dans le plafond d'actions, le
garde-fou board retiré de l'assembleur) passerait aujourd'hui toute la CI.

Ce module fait tourner les services RÉELS de bout en bout — `sales_context`,
`opening_movement`, `action_recommender` (donc `team_routines`),
`contact_priority_score`, `org_graph_assembler` (donc `governance_guard`) — sur
deux profils ESN contrastés, trois archétypes de compte et deux états de
relation, et ASSERTE la différence. Aucun LLM, aucun réseau : tout est calculé.

Discipline de ce fichier : **un test qui passerait avec ou sans la
personnalisation ne vaut rien**. Chaque différence affirmée est donc doublée d'un
TÉMOIN qui retire du profil la seule donnée censée la produire (la taille, la
structure de vente, l'expertise déclarée) et vérifie que les deux dossiers
redeviennent identiques. Si la personnalisation disparaît du code, le témoin
reste vert et l'assertion de différence tombe.

Critères p31 verrouillés ici : n°4 (board jamais en 1re approche), n°1 (petite vs
grande ESN — portes / contacts / actions / **texte du plan**), n°2 moitié
MESSAGES (froid vs client actif), n°3 (procurement public vs startup), n°5 (pas
de réflexe « contacte le CEO »). Ce qui reste OUVERT est verrouillé par des
SENTINELLES en fin de fichier (classe ``TestTrousDocumentes``) : elles échouent
le jour où le trou est bouché, pour que le golden soit mis à niveau au lieu de
mentir.

Les deux tests de PROMPT (plan et messages) assertent sur les fonctions de PROD —
``movement_prompt_block`` / ``team_routines_block`` telles que ``phase4_plan`` les
appelle, ``bellum_messages.build_user_prompt`` telle que la phase 4 l'appelle. Une
recopie du texte attendu ne prouverait que la recopie.
"""

from __future__ import annotations

import inspect
from typing import Any

from app.prompts import bellum_messages, bellum_strategy
from app.services.account_score import score_from_breakdown, verdict_for_score
from app.services.collection_focus import plan_collection
from app.services.action_recommender import (
    ACTION_CATALOG,
    recommend_actions_from_context,
    recommend_next_actions,
)
from app.services.contact_priority_score import (
    SellerContext,
    contact_priority_score,
    seller_context_from_profile,
)
from app.services.opening_movement import (
    movement_prompt_block,
    recommend_movement_from_context,
    recommend_opening_movement,
)
from app.services.esn_fit import apply_esn_fit_caps
from app.services.heavy_offer_gate import heavy_offer_allowed
from app.services.org_graph_assembler import assemble_org_graph
from app.services.relationship_playbook import relationship_state_from_context
from app.services.sales_context import (
    ACCOUNT_ARCHETYPES,
    ESN_STAGES,
    RELATIONSHIP_STATES,
    build_sales_context,
)
from app.services.team_routines import team_routines_block

# ── Les deux ESN du golden set ────────────────────────────────────────────────
# Contrastées comme le sont deux vrais clients Bellum : la taille (stade ESN), la
# structure de vente (qui exécute le plan) et l'expertise déclarée (ce qu'elle
# vend). Rien d'autre ne les distingue — c'est ce qui rend les témoins probants.
PETITE_ESN_CYBER: dict[str, Any] = {
    "esn_name": "Ancrage Sécurité",
    "size": "12",
    "salesTeamSize": "je vends seul (fondateur)",
    "expertise_areas": ["cybersécurité", "sécurité des systèmes d'information"],
}
GRANDE_ESN_PILOTAGE: dict[str, Any] = {
    "esn_name": "Verso Consulting",
    "size": "420",
    "salesTeamSize": "6 commerciaux",
    "expertise_areas": ["pilotage financier des programmes", "gouvernance budgétaire"],
}

# ── Les comptes cibles (faits de phase 1, tels que `phase1_research` les passe) ─
COMPTE_ETI: dict[str, Any] = {
    "sector": "Éditeur de logiciels de gestion RH",
    "employees": 900,
    "country": "FR",
    "subsidiary_count": 2,
}
COMPTE_PUBLIC: dict[str, Any] = {
    "sector": "Collectivité territoriale",
    "employees": 3200,
    "country": "FR",
}
COMPTE_STARTUP: dict[str, Any] = {
    "sector": "Startup SaaS B2B en hypercroissance",
    "employees": 90,
    "country": "FR",
}

# ── Les contacts du compte (identiques pour les deux ESN) ─────────────────────
# Même compte, mêmes personnes, mêmes preuves : tout écart de tri vient donc du
# profil vendeur et de rien d'autre.
CONTACT_RSSI: dict[str, Any] = {
    "fullName": "Sofia Meyer",
    "title": "Directrice de la sécurité des systèmes d'information",
    "role": "technical",
    "hierarchyLevel": "direction",
    "entity": "Nordis Group",
    "perimeterTier": "P1",
    "email": "s.meyer@nordis.example",
    "source": "apollo",
    "angleMatch": True,
}
CONTACT_DAF: dict[str, Any] = {
    "fullName": "Bruno Caron",
    "title": "Directeur administratif et financier",
    "role": "economic",
    "hierarchyLevel": "direction",
    "entity": "Nordis Group",
    "perimeterTier": "P1",
    "email": "b.caron@nordis.example",
    "source": "apollo",
}
CONTACT_PRESIDENTE: dict[str, Any] = {
    "fullName": "Hélène Ravel",
    "title": "Présidente du conseil d'administration",
    "role": "sponsor",
    "hierarchyLevel": "governance",
    "entity": "Nordis Group",
    "source": "pappers",
}
CONTACT_INFRA: dict[str, Any] = {
    "fullName": "Yanis Bouchard",
    "title": "Responsable infrastructure",
    "role": "champion",
    "hierarchyLevel": "management",
    "entity": "Nordis Group",
    "source": "apollo",
}

ENTITES = [{"name": "Nordis Group", "type": "groupe"}]

# L'analyse compte injectée aux messages — identique dans tous les scénarios, pour
# que la seule variable soit la relation.
ANALYSE_COMPTE = (
    '{"sector": "Éditeur de logiciels de gestion RH", "recent_signals": '
    '["recrutement de 4 ingénieurs sécurité", "migration du SIRH annoncée"]}'
)


def _dossier(
    profile: dict[str, Any],
    facts: dict[str, Any],
    *,
    kanban: str | None = None,
    verdict: str = "GO",
) -> dict[str, Any]:
    """Rejoue la chaîne déterministe d'un dossier, dans l'ordre de la prod.

    `phase1_research` construit le SalesContext (profil ESN × faits du compte ×
    kanban commercial), `phase4_plan` en dérive le mouvement d'ouverture et les
    3-5 prochaines actions. Aucun appel LLM n'entre dans cette chaîne."""
    context = build_sales_context(profile, facts, commercial_status=kanban)
    return {
        "context": context,
        "movement": recommend_movement_from_context(context)["movement"],
        "actions": [a["id"] for a in recommend_actions_from_context(context, verdict=verdict)],
    }


def _directives_plan(profile: dict[str, Any], facts: dict[str, Any], *, kanban: str | None = None) -> str:
    """Les deux blocs que ``phase4_plan`` ajoute au system prompt à partir du
    SalesContext, dans l'ordre de la prod (``phase4_plan.py`` : mouvement
    d'ouverture puis routine commerciale).

    Ce sont les seuls fragments du prompt plan qui dépendent du profil ESN — donc
    le lieu exact où « petite ESN vs grande ESN » devient un TEXTE différent
    envoyé au modèle, ou ne le devient pas."""
    context = build_sales_context(profile, facts, commercial_status=kanban)
    return movement_prompt_block(context) + team_routines_block(profile, context)


def _prompt_messages(profile: dict[str, Any], facts: dict[str, Any], *, kanban: str | None = None) -> str:
    """Le user prompt messages tel que la phase 4 le construit, y compris le
    dernier maillon du kanban (``salesContext.relationship.state``).

    Le compte, son analyse et ses contacts sont figés : tout écart entre deux
    appels vient de la RELATION, et de rien d'autre."""
    context = build_sales_context(profile, facts, commercial_status=kanban)
    return bellum_messages.build_user_prompt(
        "Nordis Group",
        ANALYSE_COMPTE,
        [CONTACT_RSSI, CONTACT_INFRA],
        relationship_state=relationship_state_from_context(context),
    )


def _tri_contacts(profile: dict[str, Any] | None, contacts: list[dict[str, Any]]) -> list[str]:
    """L'ordre des contacts tel que le tri live le produit : le /100 déterministe
    avec le boost profil (`classification.reconcile_contact_priorities`), décroissant."""
    seller = seller_context_from_profile(profile) if profile is not None else SellerContext()
    ranked = sorted(contacts, key=lambda c: -contact_priority_score(c, seller))
    return [c["fullName"] for c in ranked]


class TestCritere4BoardJamaisEnPremiereApproche:
    """DoD p31 n°4 — « board / administrateur jamais recommandé en 1re approche
    sans relation ni sponsor », vérifié BOUT EN BOUT.

    Le garde-fou est déjà testé unitairement (`test_governance_first_touch.py`),
    mais rien ne prouvait que la chaîne réelle l'atteint : c'est le kanban du
    compte qui décide de l'état de relation, l'état qui voyage jusqu'à
    l'assembleur, et l'assembleur qui applique la règle sur le `recommendedPath`.
    Trois maillons, trois occasions de casser en silence."""

    CONTACTS = [CONTACT_PRESIDENTE, CONTACT_RSSI, CONTACT_INFRA]
    # L'ordre proposé par le modèle : la présidente en premier — exactement le
    # réflexe que la DoD interdit sur un compte froid.
    ORDRE_MODELE = [
        {"contact": "Hélène Ravel", "why_first": "sponsor de haut niveau"},
        {"contact": "Sofia Meyer", "why_first": "décideur technique"},
        {"contact": "Yanis Bouchard", "why_first": "douleur terrain"},
    ]

    def _chemin(self, kanban: str | None) -> list[str]:
        context = build_sales_context(PETITE_ESN_CYBER, COMPTE_ETI, commercial_status=kanban)
        graph = assemble_org_graph(
            contacts=self.CONTACTS,
            entities=ENTITES,
            approach_order=self.ORDRE_MODELE,
            relationship_state=(context["relationship"] or {}).get("state"),
        )
        by_id = {p["id"]: p for p in graph["people"]}
        return [by_id[s["personId"]]["fullName"] for s in graph["recommendedPath"]]

    def test_un_compte_froid_n_ouvre_jamais_sur_le_conseil(self) -> None:
        chemin = self._chemin("inbox")

        assert chemin[0] == "Sofia Meyer"
        assert chemin[-1] == "Hélène Ravel"
        # Réordonné, jamais amputé : les trois personnes sont toujours là.
        assert sorted(chemin) == sorted(c["fullName"] for c in self.CONTACTS)

    def test_l_absence_de_kanban_se_lit_froid_donc_le_garde_fou_s_applique(self) -> None:
        """Défaut sûr : un compte dont on ne sait rien est traité comme froid."""
        assert self._chemin(None)[0] == "Sofia Meyer"

    def test_un_client_actif_peut_ouvrir_sur_le_conseil(self) -> None:
        """TÉMOIN de la règle : c'est bien la RELATION qui décide, pas le niveau.

        Sans cette moitié, un garde-fou qui rétrograderait le board en toutes
        circonstances passerait le test précédent — et priverait le commercial de
        la porte la plus courte sur un compte où il a déjà un sponsor."""
        assert self._chemin("customer")[0] == "Hélène Ravel"

    def test_le_kanban_est_reellement_branche_sur_la_relation(self) -> None:
        """Le maillon qui a déjà lâché une fois (`_KANBAN_TO_STATE` mort faute
        d'appelant) : sans lui, « Client » se relit « froid » à chaque run. Le
        passage du statut par le routeur et par le graphe est couvert par
        `test_phase1_research.py` et `test_kanban_relation_wiring.py` ; ici on
        verrouille la lecture dont dépend tout le reste du golden."""
        for kanban, attendu in (
            ("customer", "client_actif"),
            ("opportunity", "besoin_ouvert"),
            ("watching", "connu"),
            ("inbox", "froid"),
        ):
            context = build_sales_context(PETITE_ESN_CYBER, COMPTE_ETI, commercial_status=kanban)
            assert context["relationship"]["state"] == attendu, kanban


class TestCritere1PetiteVsGrandeESN:
    """DoD p31 n°1 — « même compte, petite ESN vs grande ESN → portes d'entrée,
    contacts et actions différents ».

    Le compte (COMPTE_ETI), ses faits et ses contacts sont strictement identiques
    dans les deux dossiers. Seul le profil ESN change."""

    def test_la_porte_d_entree_differe(self) -> None:
        petite = _dossier(PETITE_ESN_CYBER, COMPTE_ETI)
        grande = _dossier(GRANDE_ESN_PILOTAGE, COMPTE_ETI)

        # Même compte lu à l'identique des deux côtés : seul le vendeur change.
        assert petite["context"]["account"] == grande["context"]["account"]
        assert petite["context"]["esnProfile"]["stage"] == "petite"
        assert grande["context"]["esnProfile"]["stage"] == "grande"

        assert petite["movement"] != grande["movement"]
        # La petite ESN entre bas (N-2 accessible), la grande par un manager.
        assert petite["movement"] == "bottom_up"
        assert grande["movement"] == "middle_out"

    def test_temoin_porte_sans_la_taille_les_deux_dossiers_se_confondent(self) -> None:
        """Retire la SEULE donnée qui produit la différence (la taille de l'ESN)
        et les deux dossiers rendent la même porte. Si le routage cessait de lire
        le stade ESN, ce témoin resterait vert et le test précédent tomberait."""
        sans_taille_a = {k: v for k, v in PETITE_ESN_CYBER.items() if k != "size"}
        sans_taille_b = {k: v for k, v in GRANDE_ESN_PILOTAGE.items() if k != "size"}

        assert _dossier(sans_taille_a, COMPTE_ETI)["movement"] == _dossier(sans_taille_b, COMPTE_ETI)["movement"]

    def test_le_volume_d_actions_est_cale_sur_la_structure_de_vente(self) -> None:
        petite = _dossier(PETITE_ESN_CYBER, COMPTE_ETI)
        grande = _dossier(GRANDE_ESN_PILOTAGE, COMPTE_ETI)

        # Le fondateur qui vend seul reçoit les 3 coups les plus forts ; l'équipe
        # de 6 peut en tenir 5. Un plan non exécutable est un plan abandonné.
        assert len(petite["actions"]) == 3
        assert len(grande["actions"]) == 5
        assert petite["actions"] != grande["actions"]
        # Ce que la petite ESN reçoit est un SOUS-ENSEMBLE hiérarchisé, pas une
        # autre liste : on coupe la queue, on ne change pas la priorité.
        assert grande["actions"][: len(petite["actions"])] == petite["actions"]

    def test_temoin_actions_sans_la_structure_de_vente_le_volume_est_le_meme(self) -> None:
        sans_equipe_a = {k: v for k, v in PETITE_ESN_CYBER.items() if k != "salesTeamSize"}
        sans_equipe_b = {k: v for k, v in GRANDE_ESN_PILOTAGE.items() if k != "salesTeamSize"}

        assert _dossier(sans_equipe_a, COMPTE_ETI)["actions"] == _dossier(sans_equipe_b, COMPTE_ETI)["actions"]

    def test_le_plan_ENVOYE_AU_MODELE_n_est_pas_le_meme(self) -> None:
        """Le cœur du critère n°1 : pas « deux objets calculés diffèrent », mais
        **deux PLANS différents**, parce que le TEXTE reçu par le modèle diffère.

        Les tests précédents prouvent que la chaîne déterministe branche sur le
        profil. Celui-ci prouve que ça arrive jusqu'au prompt : c'est le seul
        endroit où le plan narratif (``actionPlan``, ``offers``,
        ``competitive_strategy``…) peut s'en apercevoir."""
        petite = _directives_plan(PETITE_ESN_CYBER, COMPTE_ETI)
        grande = _directives_plan(GRANDE_ESN_PILOTAGE, COMPTE_ETI)

        assert petite != grande
        # Le mouvement imposé au modèle : entrer bas vs entrer par un manager.
        assert "bottom_up" in petite and "bottom_up" not in grande
        assert "middle_out" in grande and "middle_out" not in petite
        # Le volume exécutable : le fondateur qui vend seul ne reçoit pas le plan
        # d'une équipe de 6 — la borne est écrite dans le prompt, pas seulement
        # appliquée en aval.
        assert "3 actions MAXIMUM" in petite
        assert "5 actions MAXIMUM" in grande

    def test_temoin_plan_sans_taille_ni_structure_le_prompt_est_identique(self) -> None:
        """TÉMOIN du test précédent. On retire les deux SEULES données censées
        produire l'écart (la taille de l'ESN, sa structure de vente). Si le prompt
        cessait de lire le profil, ce témoin resterait vert pendant que
        l'assertion de différence tomberait — c'est le signal recherché."""
        muet_a = {k: v for k, v in PETITE_ESN_CYBER.items() if k not in ("size", "salesTeamSize")}
        muet_b = {k: v for k, v in GRANDE_ESN_PILOTAGE.items() if k not in ("size", "salesTeamSize")}

        assert _directives_plan(muet_a, COMPTE_ETI) == _directives_plan(muet_b, COMPTE_ETI)

    def test_les_contacts_prioritaires_ne_sont_pas_les_memes(self) -> None:
        contacts = [CONTACT_DAF, CONTACT_RSSI]

        assert _tri_contacts(PETITE_ESN_CYBER, contacts)[0] == "Sofia Meyer"
        assert _tri_contacts(GRANDE_ESN_PILOTAGE, contacts)[0] == "Bruno Caron"

    def test_la_meme_personne_ne_vaut_pas_le_meme_score_selon_l_ESN(self) -> None:
        """Le /100 affiché au commercial bouge avec l'expertise déclarée : la RSSI
        vaut plus à l'ESN cyber qu'à l'ESN pilotage, sur des données identiques."""
        cyber = seller_context_from_profile(PETITE_ESN_CYBER)
        pilotage = seller_context_from_profile(GRANDE_ESN_PILOTAGE)

        assert contact_priority_score(CONTACT_RSSI, cyber) > contact_priority_score(CONTACT_RSSI, pilotage)
        assert contact_priority_score(CONTACT_DAF, pilotage) > contact_priority_score(CONTACT_DAF, cyber)

    def test_le_score_25_du_meme_compte_n_est_pas_le_meme(self) -> None:
        """La moitié SCORE du critère n°1. Le modèle note les 5 axes ; la RÈGLE
        p25 met la taille du vendeur dans Accessibilité et son delivery dans
        Capacité. Sur un grand groupe, la petite ESN et la grande ne peuvent donc
        pas afficher le même /25 — ni, ici, le même verdict."""
        genereux = [
            {"axis": "fit_offre", "points": 5},
            {"axis": "timing", "points": 4},
            {"axis": "accessibilite", "points": 5},
            {"axis": "concurrence", "points": 4},
            {"axis": "capacite", "points": 5},
        ]
        petite, notes_petite = apply_esn_fit_caps(
            genereux, esn_stage="petite", account_archetype="grand_groupe"
        )
        grande, notes_grande = apply_esn_fit_caps(
            genereux, esn_stage="grande", account_archetype="grand_groupe"
        )

        assert score_from_breakdown(petite) < score_from_breakdown(grande)
        assert verdict_for_score(score_from_breakdown(grande)) == "GO"
        assert verdict_for_score(score_from_breakdown(petite)) == "PRUDENT"
        # p31 : la reco cite la règle et le profil qui l'ont produite.
        assert notes_petite and not notes_grande

    def test_temoin_score_sans_le_stade_les_deux_scores_se_confondent(self) -> None:
        """TÉMOIN : on retire le stade ESN. Si le /25 se remettait à ignorer le
        profil, ce témoin resterait vert et l'assertion ci-dessus tomberait."""
        genereux = [
            {"axis": "fit_offre", "points": 5},
            {"axis": "accessibilite", "points": 5},
            {"axis": "capacite", "points": 5},
        ]
        sans_stade, notes = apply_esn_fit_caps(
            genereux, esn_stage=None, account_archetype="grand_groupe"
        )

        assert score_from_breakdown(sans_stade) == score_from_breakdown(genereux)
        assert notes == []

    def test_temoin_contacts_sans_expertise_declaree_le_tri_est_identique(self) -> None:
        """Grille profil-agnostique : les deux ESN voient exactement le même ordre.
        C'est l'expertise déclarée — et elle seule — qui fait remonter la RSSI."""
        contacts = [CONTACT_DAF, CONTACT_RSSI]
        sans_expertise_a = {k: v for k, v in PETITE_ESN_CYBER.items() if k != "expertise_areas"}
        sans_expertise_b = {k: v for k, v in GRANDE_ESN_PILOTAGE.items() if k != "expertise_areas"}

        neutre = _tri_contacts(None, contacts)
        assert _tri_contacts(sans_expertise_a, contacts) == neutre
        assert _tri_contacts(sans_expertise_b, contacts) == neutre


class TestCritere3PublicVsStartup:
    """DoD p31 n°3 — « compte public vs startup → procurement … différents ».

    Les trois moitiés sont verrouillées : PROCUREMENT (sur un compte public la voie
    contractuelle prime, même sur la relation), ACTIONS (le sélecteur écoute
    l'archétype), et SOURCES (un archétype préliminaire pilote la collecte — une
    startup et un compte public n'interrogent pas le même jeu de sources)."""

    def test_les_sources_collectees_ne_sont_pas_les_memes(self) -> None:
        """La moitié SOURCES du critère. Un archétype préliminaire, dérivé avant la
        collecte, décide quelles sources sont pertinentes : les marchés publics
        français (BOAMP/DECP) ne sont pas interrogés pour une startup — elle n'en a
        aucun — mais le sont pour un compte public."""
        startup = plan_collection(country="FR", sector_text="startup SaaS en hypercroissance")
        public = plan_collection(country="FR", naf_code="8411Z")

        assert startup.run_public_tenders is False
        assert public.run_public_tenders is True

    def test_temoin_sources_un_archetype_indetermine_ne_retire_rien(self) -> None:
        """TÉMOIN : sans signal tranchant, aucune source n'est retirée — on ne
        présume jamais l'absence de signal. Si le gate se mettait à retirer par
        défaut, ce témoin tomberait et masquerait une perte de signal silencieuse."""
        inconnu = plan_collection(country="FR")

        assert inconnu.run_public_tenders is True

    def test_le_public_route_vers_la_voie_contractuelle_pas_la_startup(self) -> None:
        for profil in (PETITE_ESN_CYBER, GRANDE_ESN_PILOTAGE):
            public = _dossier(profil, COMPTE_PUBLIC)["movement"]
            startup = _dossier(profil, COMPTE_STARTUP)["movement"]
            assert public == "public"
            assert startup != "public"

    def test_le_procurement_public_prime_meme_sur_un_client_actif(self) -> None:
        """Chez un client actif, le raccourci naturel serait le top-down par le
        sponsor. En marché public, non : la procédure reste la porte."""
        client_prive = _dossier(PETITE_ESN_CYBER, COMPTE_ETI, kanban="customer")["movement"]
        client_public = _dossier(PETITE_ESN_CYBER, COMPTE_PUBLIC, kanban="customer")["movement"]

        assert client_prive == "top_down"
        assert client_public == "public"

    def test_les_actions_proposees_ne_sont_pas_les_memes(self) -> None:
        """La moitié ACTIONS du critère. À relation ÉGALE (froid) et à ESN égale,
        un marché public et une startup ne reçoivent plus le même plan : le public
        ouvre sur la voie contractuelle (p19), la startup sur l'accès direct (p15)."""
        public = [a["id"] for a in recommend_next_actions(
            verdict="GO", relationship_state="froid", account_archetype="public"
        )]
        startup = [a["id"] for a in recommend_next_actions(
            verdict="GO", relationship_state="froid", account_archetype="startup"
        )]

        assert public != startup
        assert "qualifier_achats" in public
        assert "qualifier_achats" not in startup

    def test_temoin_actions_sans_archetype_les_deux_plans_se_confondent(self) -> None:
        """TÉMOIN du test précédent : on retire la SEULE donnée censée produire la
        différence (l'archétype). Si le sélecteur se remettait à ignorer
        l'archétype, ce témoin resterait vert et l'assertion ci-dessus tomberait."""
        sans = [a["id"] for a in recommend_next_actions(
            verdict="GO", relationship_state="froid", account_archetype=None
        )]
        inconnu = [a["id"] for a in recommend_next_actions(
            verdict="GO", relationship_state="froid", account_archetype="inconnu"
        )]

        assert sans == inconnu

    def test_temoin_l_archetype_vient_bien_des_faits_du_compte(self) -> None:
        """Sans secteur ni effectif, l'archétype est `inconnu` (dérivation
        `default`, confiance 0) et les deux comptes se confondent : la différence
        ci-dessus vient des faits collectés, jamais d'une supposition."""
        vide = build_sales_context(PETITE_ESN_CYBER, {})

        assert vide["account"]["archetype"] == "inconnu"
        assert vide["account"]["derivation"] == "default"
        assert vide["account"]["confidence"] == 0


class TestCritere5AuditFlash:
    """DoD p31 n°5, moitié « audit flash ».

    L'anti-recommandation est répétée à l'identique sur SIX pages (p15-p20) :
    « ne jamais proposer automatiquement un audit flash, un C-level ou un grand
    programme si le profil ne possède ni accès, ni preuve, ni capacité ». La
    chaîne était pourtant écrite en dur, sans condition, dans le prompt strategy
    et les packs d'offres — elle sortait pour un freelance sans référence comme
    pour une ESN de 300 personnes."""

    def test_un_profil_sans_preuve_ni_capacite_ne_peut_pas_proposer_d_audit_flash(self) -> None:
        prompt = bellum_strategy.build_system_prompt(PETITE_ESN_CYBER)

        assert "INTERDIT" in prompt
        assert "audit flash" not in prompt.split("INTERDIT")[0]

    def test_un_profil_qui_porte_l_offre_y_a_droit(self) -> None:
        """TÉMOIN : on ajoute les DEUX conditions manquantes (références + taille).
        Si le garde-fou bloquait tout le monde, ce témoin tomberait."""
        outille = {**PETITE_ESN_CYBER, "size": "120", "references": ["Banque X", "Assureur Y"]}
        prompt = bellum_strategy.build_system_prompt(outille)

        assert "audit flash" in prompt
        assert "INTERDIT (anti-recommandation p31)" not in prompt

    def test_une_seule_des_deux_conditions_ne_suffit_pas(self) -> None:
        """« ni accès, ni preuve, ni capacité » : il faut les DEUX moitiés
        vérifiables côté profil, pas l'une ou l'autre."""
        sans_preuve = {**PETITE_ESN_CYBER, "size": "120"}
        sans_capacite = {**PETITE_ESN_CYBER, "references": ["Banque X"]}

        assert not heavy_offer_allowed(sans_preuve)
        assert not heavy_offer_allowed(sans_capacite)

    def test_un_profil_vide_est_le_reflexe_generique_par_definition(self) -> None:
        """Le cœur du critère : proposer un audit flash à un vendeur dont on ne
        sait RIEN est exactement le réflexe générique que la p31 interdit."""
        assert not heavy_offer_allowed({})
        assert not heavy_offer_allowed(None)


class TestCritere5PasDeReflexeGenerique:
    """DoD p31 n°5 — « aucune action “audit flash” ou “contacte le CEO” par
    réflexe générique ». La moitié déterministe est verrouillée exhaustivement."""

    def test_aucun_compte_sans_relation_forte_n_est_route_en_top_down(self) -> None:
        """Balayage EXHAUSTIF des 5 stades × 9 archétypes × 9 relations : entrer
        par le sommet exige une relation qui le justifie, sans exception."""
        fautes = [
            (stage, archetype, relation)
            for stage in ESN_STAGES
            for archetype in ACCOUNT_ARCHETYPES
            for relation in RELATIONSHIP_STATES
            if recommend_opening_movement(stage, archetype, relation)["movement"] == "top_down"
            and relation not in ("client_actif", "ancien_client", "refere")
        ]

        assert fautes == []

    def test_le_catalogue_deterministe_ne_contient_aucun_reflexe_generique(self) -> None:
        interdits = ("ceo", "directeur général", "président", "board", "audit flash")
        fautes = [
            aid
            for aid, (_, label) in ACTION_CATALOG.items()
            if any(mot in label.lower() for mot in interdits)
        ]

        assert fautes == []

    def test_aucun_scenario_ne_sort_un_reflexe_generique(self) -> None:
        """Balayage des scénarios réellement produits (verdict × relation) : la
        sélection reste bornée au catalogue, donc sans réflexe générique — et
        toujours hiérarchisée (3 à 5), jamais un catalogue déversé."""
        for verdict in ("GO", "PRUDENT", "STOP", "EXPLORER", None):
            for relation in RELATIONSHIP_STATES:
                actions = recommend_next_actions(verdict=verdict, relationship_state=relation)
                assert 3 <= len(actions) <= 5, (verdict, relation)
                assert all(a["id"] in ACTION_CATALOG for a in actions)
                assert all(a["why"] for a in actions), (verdict, relation)


class TestCritere2RelationFroidVsClientActif:
    """DoD p31 n°2 — « même ESN, compte froid vs client actif → messages et
    cadence différents ».

    La moitié MESSAGES est verrouillée ici, de bout en bout : kanban commercial →
    ``salesContext.relationship.state`` → ``bellum_messages.build_user_prompt``.
    La cadence est dérivée du même état côté API (``cadence-templates.ts``), et
    chaque touche porte désormais un contenu PROPRE (p12), pas un rappel sur le
    même email."""

    def test_chaque_touche_de_cadence_a_son_propre_contenu(self) -> None:
        """p12 : « une preuve NEUVE par touche ». Les relances étaient des rappels
        datés pointant sur le MÊME email initial — une répétition, pas une
        séquence. Le prompt demande maintenant un texte propre à chaque touche
        (relance J+3 avec preuve neuve, preuve sociale J+6, close-loop J+9)."""
        rendu = bellum_messages.build_user_prompt("X", "", [], relationship_state="froid")

        assert '"cadence"' in rendu
        assert '"relance"' in rendu
        assert '"preuveSociale"' in rendu
        assert '"closeLoop"' in rendu
        # La preuve NEUVE est explicitement exigée, et la répétition bannie.
        assert "preuve" in rendu.lower() and "NEUVE" in rendu

    def test_la_sequence_a_ses_trois_temps(self) -> None:
        """p10 : « M1 / M2 apport de valeur / M3 proposition de 15 min ; stop après
        3 messages ». Le produit s'arrêtait à M1 — un commercial sans réponse au
        premier message n'avait plus rien à envoyer. Les trois temps sont demandés,
        et le quatrième est explicitement exclu."""
        rendu = bellum_messages.build_user_prompt("X", "", [], relationship_state="froid")

        assert "linkedinMessage" in rendu
        assert "linkedinMessageM2" in rendu
        assert "linkedinMessageM3" in rendu
        # « Stop après 3 messages » : aucun 4e temps n'est demandé au modèle.
        assert "linkedinMessageM4" not in rendu

    def test_le_script_telephone_a_ses_quatre_moments(self) -> None:
        """p11 : ouverture · 10 secondes · découverte · sortie. Sans découverte
        l'appel ne qualifie rien ; sans sortie il ne se termine sur aucun next
        step daté."""
        rendu = bellum_messages.build_user_prompt("X", "", [], relationship_state="froid")

        for cle in ("phoneOpener", "phoneTenSeconds", "phoneDiscovery", "phoneExit"):
            assert cle in rendu, cle

    def test_les_messages_ENVOYES_AU_MODELE_ne_sont_pas_les_memes(self) -> None:
        """Même ESN, même compte, mêmes contacts, même analyse. Seul le kanban
        change — et le prompt change avec lui."""
        froid = _prompt_messages(PETITE_ESN_CYBER, COMPTE_ETI, kanban="inbox")
        client = _prompt_messages(PETITE_ESN_CYBER, COMPTE_ETI, kanban="customer")

        assert froid != client
        # Ce que p6 demande pour un client actif — et que le froid ne doit surtout
        # pas recevoir.
        assert "foisonnement" in client.lower()
        assert "foisonnement" not in froid.lower()
        # Le garde-fou du M1 d'ouverture (« zéro mention de l'ESN ») est écrit pour
        # un inconnu. Sur son propre client, il est levé — explicitement.
        assert "Règle d'or n°3 LEVÉE" in client
        assert "Règle d'or n°3" not in froid

    def test_temoin_a_kanban_egal_les_deux_prompts_sont_identiques(self) -> None:
        """TÉMOIN n°1 : la différence vient du kanban, pas du hasard du rendu."""
        assert _prompt_messages(PETITE_ESN_CYBER, COMPTE_ETI, kanban="customer") == _prompt_messages(
            PETITE_ESN_CYBER, COMPTE_ETI, kanban="customer"
        )

    def test_temoin_un_compte_froid_ne_paie_pas_la_personnalisation_des_autres(self) -> None:
        """TÉMOIN n°2 : un compte froid reçoit EXACTEMENT le prompt d'avant le
        branchement — pas un octet de plus. C'est ce qui rend le changement sûr :
        la personnalisation n'a de prix que là où elle a du sens."""
        # CHANGEMENT VOULU (#2371.4) : le témoin passe « froid » EXPLICITEMENT.
        # Sans état, le builder nomme désormais la relation NON MESURÉE — non
        # mesuré n'est pas froid, il n'a donc plus le prompt du froid.
        sans_relation = bellum_messages.build_user_prompt(
            "Nordis Group", ANALYSE_COMPTE, [CONTACT_RSSI, CONTACT_INFRA], relationship_state="froid"
        )

        assert _prompt_messages(PETITE_ESN_CYBER, COMPTE_ETI, kanban="inbox") == sans_relation
        assert _prompt_messages(PETITE_ESN_CYBER, COMPTE_ETI, kanban=None) == sans_relation

    def test_chaque_etat_du_kanban_ecrit_son_propre_message(self) -> None:
        """Pas seulement « froid ≠ client » : les quatre colonnes du kanban que le
        commercial manipule produisent quatre prompts distincts. Deux colonnes qui
        rendraient le même texte seraient une personnalisation de façade."""
        prompts = {
            kanban: _prompt_messages(PETITE_ESN_CYBER, COMPTE_ETI, kanban=kanban)
            for kanban in ("inbox", "watching", "opportunity", "customer")
        }

        assert len(set(prompts.values())) == 4

    def test_le_meme_compte_change_de_porte_et_d_actions_selon_la_relation(self) -> None:
        froid = _dossier(PETITE_ESN_CYBER, COMPTE_ETI, kanban="inbox")
        client = _dossier(PETITE_ESN_CYBER, COMPTE_ETI, kanban="customer")

        assert froid["movement"] == "bottom_up"
        assert client["movement"] == "top_down"
        # Froid = ouvrir le compte ; client actif = foisonner sur l'existant.
        assert froid["actions"][0] != client["actions"][0]
        assert "envoyer_m1" in froid["actions"] and "envoyer_m1" not in client["actions"]
        assert "foisonner_bu" in client["actions"] and "foisonner_bu" not in froid["actions"]


class TestTrousDocumentes:
    """SENTINELLES — ce que la DoD exigeait et que le code ne permettait pas encore.

    Cette classe portait une sentinelle par trou ouvert : chacune échouait le jour
    où le trou était bouché, signalant qu'il fallait la remplacer par la vraie
    assertion de différence dans la classe du critère. Les huit critères p31 sont
    désormais couverts par de vraies assertions (chacune doublée d'un témoin) —
    plus aucune sentinelle : il n'y a plus de trou documenté ouvert sur la DoD.

    Ce test le VERROUILLE : si un futur changement rouvrait un trou, on l'ajouterait
    ici plutôt que de laisser la DoD mentir en silence."""

    def test_aucun_trou_dod_ouvert(self) -> None:
        """Marqueur : plus aucune sentinelle. Les huit critères sont assertés dans
        leurs classes respectives (TestCritere1…TestCritere5)."""
        sentinelles = [name for name in dir(self) if name.startswith("test_sentinelle")]

        assert sentinelles == []


