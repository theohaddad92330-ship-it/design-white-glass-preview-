"""L'archétype du compte doit CHANGER les actions (p5 + DoD p31 n°3).

Le trou fermé ici : `recommend_next_actions` acceptait `account_archetype` et ne
le lisait jamais. À relation égale, un marché public et une startup recevaient le
plan identique — c'était la sentinelle `test_sentinelle_l_archetype_n_atteint_pas
_le_selecteur_d_actions` du golden set de la DoD.

Chaque assertion de différence est doublée d'un TÉMOIN : on retire l'archétype et
on vérifie que les deux scénarios se confondent à nouveau. Un test qui passerait
sans la personnalisation ne vaut rien.
"""

from __future__ import annotations

from app.services.action_recommender import ACTION_CATALOG, CHANTIERS, recommend_next_actions


def _ids(**kwargs: object) -> list[str]:
    return [a["id"] for a in recommend_next_actions(**kwargs)]  # type: ignore[arg-type]


class TestLArchetypeChangeLePlan:
    def test_public_et_startup_ne_recoivent_plus_le_meme_plan(self) -> None:
        """Le cœur du critère n°3 : « compte public vs startup → procurement,
        sources et temporalité différents »."""
        public = _ids(verdict="GO", relationship_state="froid", account_archetype="public")
        startup = _ids(verdict="GO", relationship_state="froid", account_archetype="startup")

        assert public != startup

    def test_temoin_sans_archetype_les_deux_plans_se_confondent(self) -> None:
        """TÉMOIN : on retire la SEULE donnée censée produire la différence."""
        a = _ids(verdict="GO", relationship_state="froid", account_archetype=None)
        b = _ids(verdict="GO", relationship_state="froid", account_archetype="inconnu")

        assert a == b

    def test_le_public_ouvre_sur_la_voie_contractuelle(self) -> None:
        """p5 secteur public : « marchés, accords-cadres, centrales achat,
        calendrier budgétaire ». Le besoin métier ne suffit pas sans voie
        contractuelle (p19)."""
        actions = _ids(verdict="GO", relationship_state="froid", account_archetype="public")

        assert "qualifier_achats" in actions

    def test_la_startup_ouvre_direct_sans_passer_par_le_panel(self) -> None:
        """p5 startup : « accès direct, urgence et delivery ; cycle court ». Un
        détour par le panel fournisseurs est un réflexe grand-compte déplacé."""
        actions = _ids(verdict="GO", relationship_state="froid", account_archetype="startup")

        assert "envoyer_m1" in actions
        assert "verifier_panel" not in actions

    def test_le_grand_groupe_impose_la_cartographie_avant_l_attaque(self) -> None:
        """p5 grand groupe : « BU / filiale / programme, multi-threading »."""
        actions = _ids(verdict="GO", relationship_state="froid", account_archetype="grand_groupe")

        assert "cartographier_bu" in actions

    def test_la_banque_verifie_le_referencement_et_les_sources(self) -> None:
        """p5 banque/assurance : « panel, nombreuses entités ; sources et rôles
        très vérifiés »."""
        actions = _ids(
            verdict="GO", relationship_state="froid", account_archetype="banque_assurance"
        )

        assert "verifier_panel" in actions


class TestLeStadeEsnChangeLaPorte:
    """DoD n°1 côté ACTIONS : sur le MÊME compte, une petite ESN et une grande ne
    prennent pas la même porte (p3 : le freelance fait « rang2 intelligent, peu de
    grands comptes froids » ; la grande ESN assume le référencement)."""

    def test_une_petite_esn_sur_un_grand_groupe_passe_par_la_relation(self) -> None:
        actions = _ids(
            verdict="GO",
            relationship_state="froid",
            account_archetype="grand_groupe",
            esn_stage="freelance",
        )

        assert "demander_intro" in actions or "chercher_esn_presentes" in actions

    def test_une_grande_esn_sur_le_meme_compte_ne_prend_pas_la_meme_porte(self) -> None:
        petite = _ids(
            verdict="GO",
            relationship_state="froid",
            account_archetype="grand_groupe",
            esn_stage="freelance",
        )
        grande = _ids(
            verdict="GO",
            relationship_state="froid",
            account_archetype="grand_groupe",
            esn_stage="grande",
        )

        assert petite != grande

    def test_temoin_sans_stade_les_deux_plans_se_confondent(self) -> None:
        a = _ids(verdict="GO", relationship_state="froid", account_archetype="grand_groupe")
        b = _ids(
            verdict="GO",
            relationship_state="froid",
            account_archetype="grand_groupe",
            esn_stage=None,
        )

        assert a == b


class TestLeMoteurTientToujours:
    """p28 MOTEUR : 3 à 5 actions hiérarchisées, jamais 20 en vrac. Les boosts
    d'archétype ne doivent pas faire déborder la borne."""

    def test_aucun_scenario_ne_depasse_cinq_actions(self) -> None:
        for archetype in (
            "startup",
            "pme_eti",
            "grand_groupe",
            "banque_assurance",
            "public",
            "luxe_retail_media",
            "industrie",
            "international",
            "inconnu",
        ):
            for rel in ("froid", "client_actif", "rang2", "besoin_ouvert", "refere"):
                for verdict in ("GO", "PRUDENT", "EXPLORER", "STOP"):
                    actions = recommend_next_actions(
                        verdict=verdict, relationship_state=rel, account_archetype=archetype
                    )
                    assert 3 <= len(actions) <= 5, (archetype, rel, verdict)

    def test_chaque_action_est_cataloguee_et_cite_sa_raison(self) -> None:
        for archetype in ("public", "startup", "grand_groupe", "banque_assurance"):
            for action in recommend_next_actions(
                verdict="GO", relationship_state="froid", account_archetype=archetype
            ):
                assert action["id"] in ACTION_CATALOG
                assert action["chantier"] in CHANTIERS
                assert action["why"].strip()


class TestCatalogueP28:
    """p28 liste 30 exemples d'actions répartis sur 6 chantiers. Le catalogue doit
    les porter — sinon le « filtre par scénario » filtre un stock incomplet."""

    def test_les_six_chantiers_sont_tous_peuples(self) -> None:
        peuples = {chantier for chantier, _ in ACTION_CATALOG.values()}
        assert peuples == set(CHANTIERS)

    def test_les_exemples_nommes_par_la_p28_existent(self) -> None:
        """Les 30 libellés cités en exemple p28, un id par exemple."""
        attendus = {
            # Compte
            "corriger_identite",
            "cartographier_bu",
            "verifier_panel",
            "chercher_consultants_passes",
            "chercher_esn_presentes",
            # Contacts
            "etendre_persona",
            "enrichir_p1",
            "chercher_achats",
            "demander_intro",
            "masquer_bruit",
            # Signaux
            "signal_jobs",
            "signal_ao",
            "signal_nominations",
            "signal_technos",
            "signal_ma",
            # Messages
            "envoyer_m1",
            "relance_courte",
            "call_script",
            "lead_magnet",
            "close_loop",
            # Delivery
            "push_profil",
            "brief_consultant",
            "preparer_soutenance",
            "feedback_soutenance",
            "rex_mission",
            # Expansion
            "consultant_capteur",
            "renouvellement",
            "foisonner_bu",
            "co_traitance",
            "passer_rang1",
        }

        assert attendus <= set(ACTION_CATALOG)
