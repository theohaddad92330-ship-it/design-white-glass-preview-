"""Relation → façon d'écrire (Annexe Méthodologie Sales ESN p6).

Le module sous test est le DERNIER maillon du trajet du kanban commercial. Les
maillons amont sont déjà couverts (`test_kanban_relation_wiring.py` pour le
transport, `test_sales_context.py` pour la lecture) ; ici on verrouille ce que le
modèle reçoit vraiment.

Deux propriétés portent tout le fichier :

1. **Le froid ne bouge pas.** Un compte sans relation produit un bloc vide, donc
   un prompt messages byte-identique à celui d'avant ce module — le prompt décrit
   déjà une ouverture à froid. Personne ne paie la personnalisation d'un autre.
2. **Une relation réelle écrit autre chose.** Et pas « autre chose » au hasard :
   le texte reprend la consigne p6 de CET état, jamais celle du voisin.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.models.plan import PlanRequest
from app.services.relationship_playbook import (
    MESSAGE_PLAYBOOK,
    declared_relation_caution,
    message_directive_block,
    relationship_state_from_context,
)
from app.services.sales_context import RELATIONSHIP_STATES, build_sales_context


class TestLeFroidResteLeDefaut:
    """Le bloc n'existe que quand il a quelque chose à dire."""

    def test_le_froid_ne_produit_aucun_bloc(self) -> None:
        assert message_directive_block("froid") == ""

    # #2371.4 — « non mesuré » n'est pas « froid » (doctrine GA-18/GA-19). Un
    # état absent ou hors contrat retombait EN SILENCE sur le froid : un
    # partenaire actif ajouté au contrat sans playbook aurait reçu une
    # ouverture à froid. Il est désormais NOMMÉ comme non mesuré.
    @pytest.mark.parametrize("state", ["", None, "inconnu-du-contrat", "stade_hors_contrat"])
    def test_un_etat_inconnu_est_nomme_non_mesure_jamais_froid(self, state: str | None) -> None:
        bloc = message_directive_block(state)

        assert bloc != ""
        assert "non mesurée" in bloc.lower()
        # Ni une ouverture à froid supposée, ni une relation supposée.
        assert "n'affirme ni un premier contact" in bloc.lower()
        # Prudence : la règle d'or n°3 reste en vigueur, réaffirmée.
        assert "règle d'or n°3 maintenue" in bloc.lower()
        # Aucune valeur brute recopiée dans le prompt.
        assert "inconnu-du-contrat" not in bloc

    def test_un_compte_jamais_trie_ne_produit_aucun_bloc(self) -> None:
        """Bout en bout : kanban `inbox` → relation froide → prompt inchangé."""
        context = build_sales_context({"size": "12"}, {"sector": "banque"}, commercial_status="inbox")

        assert message_directive_block(relationship_state_from_context(context)) == ""

    def test_un_sales_context_absent_ne_leve_pas(self) -> None:
        """Dossier analysé avant l'existence du SalesContext (raw_analysis ancien)."""
        assert relationship_state_from_context(None) == ""
        assert relationship_state_from_context({}) == ""
        assert relationship_state_from_context({"relationship": None}) == ""
        assert relationship_state_from_context("pas un dict") == ""


class TestChaqueEtatEcritSaPropreConsigne:
    """p6 : « le même signal produit un message différent selon la relation »."""

    def test_le_kanban_client_produit_la_consigne_de_foisonnement(self) -> None:
        context = build_sales_context({"size": "12"}, {"sector": "banque"}, commercial_status="customer")
        bloc = message_directive_block(relationship_state_from_context(context))

        assert bloc != ""
        # La consigne p6 de l'état « client actif », mot pour mot dans le prompt.
        assert "foisonnement" in bloc.lower()
        # …et surtout PAS celle d'un autre état.
        assert "référent" not in bloc.lower()

    def test_le_kanban_opportunite_produit_la_consigne_de_besoin_ouvert(self) -> None:
        context = build_sales_context({"size": "12"}, {"sector": "banque"}, commercial_status="opportunity")
        bloc = message_directive_block(relationship_state_from_context(context))

        assert "besoin" in bloc.lower()
        assert "foisonnement" not in bloc.lower()

    def test_deux_etats_ne_donnent_jamais_le_meme_bloc(self) -> None:
        """Un playbook où deux lignes se copient ne personnalise rien."""
        blocs = [message_directive_block(s) for s in MESSAGE_PLAYBOOK]

        assert len(set(blocs)) == len(blocs)

    def test_tout_etat_du_contrat_est_traite(self) -> None:
        """Aucun état du contrat ne doit tomber dans un trou silencieux : soit il
        est au playbook, soit c'est le froid (défaut assumé, bloc vide)."""
        non_traites = [s for s in RELATIONSHIP_STATES if s != "froid" and s not in MESSAGE_PLAYBOOK]

        assert non_traites == []


class TestLesGardeFousDuMessage:
    """La règle d'or n°3 (« zéro mention de l'ESN en M1 ») est écrite pour un
    inconnu. La lever sans le dire produirait un pitch catalogue ; ne jamais la
    lever produirait un message absurde envoyé à son propre client."""

    ETATS_OU_LA_RELATION_EST_ETABLIE = ("dormant", "refere", "ancien_client", "rang2", "client_actif", "besoin_ouvert")
    ETATS_ENCORE_FROIDS = ("connu", "linkedin")

    @pytest.mark.parametrize("state", ETATS_OU_LA_RELATION_EST_ETABLIE)
    def test_une_relation_etablie_leve_explicitement_la_regle_3(self, state: str) -> None:
        bloc = message_directive_block(state).lower()

        assert "règle d'or n°3 levée" in bloc
        # Lever la règle n'ouvre pas la porte au pitch catalogue.
        assert "pitch catalogue" in bloc

    @pytest.mark.parametrize("state", ETATS_ENCORE_FROIDS)
    def test_un_contact_encore_froid_garde_la_regle_3(self, state: str) -> None:
        """Le garde-fou est RÉAFFIRMÉ, pas simplement omis : un bloc muet sur la
        règle n°3 laisserait le modèle libre de l'oublier."""
        bloc = message_directive_block(state).lower()

        assert "règle d'or n°3 maintenue" in bloc
        assert "règle d'or n°3 levée" not in bloc
        assert "zéro mention de l'esn" in bloc

    def test_aucun_bloc_n_invente_de_donnee(self) -> None:
        """Le bloc dit COMMENT écrire ; il ne fournit aucun fait sur le compte.
        Un fait glissé ici serait une donnée inventée pour tous les comptes."""
        for state in MESSAGE_PLAYBOOK:
            bloc = message_directive_block(state)
            assert "{" not in bloc and "}" not in bloc, state


async def _prompt_messages_de_la_phase_4(monkeypatch, account_data: dict) -> str:
    """Exécute ``phase4_plan._plan`` avec ``call_claude`` mocké et rend le USER
    prompt réellement envoyé à ``bellum_messages``."""
    from app.routers import phase4_plan

    captured: list[str] = []

    async def fake_call_claude(system, user, **kwargs):
        if str(kwargs.get("prompt_name", "")) == "bellum_messages":
            captured.append(user)
            return {"messages": []}, None
        return {}, None

    monkeypatch.setattr(phase4_plan, "call_claude", fake_call_claude)
    monkeypatch.setattr(phase4_plan.rag_service, "retrieve_knowledge_context", AsyncMock(return_value=""))
    monkeypatch.setattr(phase4_plan.rag_knowledge, "retrieve_reranked_context", AsyncMock(return_value=""))
    monkeypatch.setattr(phase4_plan, "measure_self_consistency", AsyncMock(return_value=(None, [])))

    await phase4_plan._plan(
        PlanRequest(
            account_id="acc-1",
            account_data=account_data,
            contacts=[{"fullName": "Jean Dupont", "title": "DSI"}],
            profile_data={"companyName": "MonESN", "offers": ["Cloud"]},
        )
    )
    assert captured, "aucun appel bellum_messages capturé"
    return captured[0]


class TestLeDernierMaillonEstReellementBranche:
    """Le défaut que ce dépôt a DÉJÀ commis : une table écrite, testée, et aucun
    appelant. Les tests ci-dessus appellent le module en direct — ils resteraient
    tous verts si ``phase4_plan`` cessait de passer la relation. Ceux-ci observent
    le prompt tel qu'il part vers Claude."""

    ANALYSE = {"sector": "Transport", "angles": [{"angle": "Modernisation SI"}]}

    @pytest.mark.asyncio
    async def test_la_relation_du_salesContext_atteint_le_prompt_messages(self, monkeypatch) -> None:
        context = build_sales_context({"size": "12"}, {"sector": "banque"}, commercial_status="customer")
        prompt = await _prompt_messages_de_la_phase_4(monkeypatch, {**self.ANALYSE, "salesContext": context})

        assert "RELATION AU COMPTE" in prompt
        assert "foisonnement" in prompt.lower()

    @pytest.mark.asyncio
    async def test_sans_salesContext_le_prompt_messages_nomme_la_relation_non_mesuree(self, monkeypatch) -> None:
        """Dossier antérieur au contrat SalesContext. CHANGEMENT VOULU (#2371.4) :
        ce test verrouillait « rien n'est ajouté », donc une relation inconnue
        écrite comme un compte froid. Non mesuré n'est pas froid : le prompt le
        NOMME, et n'ajoute aucune consigne d'un état réel."""
        prompt = await _prompt_messages_de_la_phase_4(monkeypatch, dict(self.ANALYSE))

        assert "RELATION AU COMPTE — NON MESURÉE" in prompt
        assert "foisonnement" not in prompt.lower()


class TestLaRelationPersonneEntrepriseIndiqueLaPrudence:
    """#219.8 (LAU-FINAL-219, #3231) — la relation personne↔entreprise DÉCLARÉE
    (jamais devinée) ajoute une ligne de prudence pour les trois valeurs où le
    corps de l'issue #3213 a une prise sur le TEXTE du message ; les autres
    valeurs (dont `unknown_relationship`, le défaut sans preuve) ne changent
    rien — comportement byte-identique à avant ce paramètre."""

    @pytest.mark.parametrize(
        "relation",
        ["employee_current", "unknown_relationship", None, "", "un-intitule-hors-vocabulaire"],
    )
    def test_une_relation_sans_prise_sur_le_texte_n_ajoute_rien(self, relation: str | None) -> None:
        assert message_directive_block("froid", relation) == ""
        assert message_directive_block(None, relation) == message_directive_block(None, None)

    def test_ex_salarie_avertit_de_ne_pas_ecrire_au_present(self) -> None:
        bloc = message_directive_block("froid", "employee_former")
        assert "n'est plus salariée" in bloc

    def test_ex_prestataire_avertit_de_ne_pas_dire_consultant_actuel(self) -> None:
        bloc = message_directive_block("froid", "contractor_historical")
        assert "salariée ni en mission actuellement" in bloc

    def test_presente_seulement_avertit_de_ne_pas_affirmer_une_mission(self) -> None:
        bloc = message_directive_block("froid", "consultant_presented")
        assert "ne l'affirme jamais comme un fait" in bloc

    def test_la_ligne_de_prudence_se_cumule_avec_un_etat_de_relation_reel(self) -> None:
        bloc = message_directive_block("client_actif", "employee_former")
        assert "RELATION AU COMPTE" in bloc  # le bloc d'état existant, inchangé
        assert "n'est plus salariée" in bloc  # + la ligne de prudence, cumulée


class TestDeclaredRelationCautionSecondAppelant:
    """#2947 (#2204.35, lot R25) — la MÊME table, rendue publique pour les
    messages BATCH (`bellum_messages`, plusieurs contacts), qui n'ont pas un
    seul `person_relation` global comme le composer mono-contact."""

    def test_sans_valeur_ou_hors_vocabulaire_rien(self) -> None:
        assert declared_relation_caution(None) is None
        assert declared_relation_caution("") is None
        assert declared_relation_caution("employee_current") is None

    def test_consultant_presente_rend_la_meme_prudence_que_le_bloc_mono_contact(self) -> None:
        caution = declared_relation_caution("consultant_presented")
        assert caution is not None
        assert "ne l'affirme jamais comme un fait" in caution


class TestPersonaPartenaire:
    """#2947 (#2204.34) — persona « Partenaire » : un prestataire ACTUELLEMENT en
    mission (`contractor_current`) n'est ni un salarié, ni un besoin à découvrir —
    le terrain est déjà occupé. Même table que les trois autres personas de
    relation (#2204.31/.35/.36), aucune taxonomie parallèle (GA-26)."""

    def test_prestataire_en_mission_avertit_que_le_terrain_est_occupe(self) -> None:
        bloc = message_directive_block("froid", "contractor_current")
        assert "EN MISSION" in bloc
        assert "terrain est déjà occupé" in bloc

    def test_meme_prudence_rendue_publique_pour_les_messages_batch(self) -> None:
        caution = declared_relation_caution("contractor_current")
        assert caution is not None
        assert "terrain est déjà occupé" in caution
