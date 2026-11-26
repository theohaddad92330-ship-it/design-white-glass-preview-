"""Une sortie stratégique qui ne DIT rien doit être REFUSÉE par le schéma.

Le défaut, mesuré le 28/08/2026 sur trois tirages directs par modèle du vrai
prompt ``bellum_strategy`` : Sonnet a rendu un objet ENTIÈREMENT vide 2 fois sur
3 (notes 0,00 · 0,00 · 64,25 sur la grille du dépôt), chaque échec facturé
~0,11 $. Luna : 96 · 100 · 100.

La cause racine n'est pas le modèle, c'est le schéma. Chaque champ de
``ResearchStrategy`` avait un défaut vide, donc une réponse que Pydantic ne
mappait sur AUCUN champ validait sans lever : l'échec était SILENCIEUX. La
production porte déjà un rattrapage (``_strategy_is_empty`` → relance →
``STRATEGY_EMPTY_RETRY``) — un pansement sur un taux d'échec d'environ 66 %, et
chaque relance est un second appel payant AVEUGLE.

Ce que ces tests verrouillent :

1. une sortie entièrement vide est REFUSÉE ;
2. une sortie riche passe ;
3. une sortie MAIGRE mais légitime passe — une petite entreprise avec peu de
   signaux doit toujours produire un dossier ;
4. une sortie « presque vide » (sections présentes, items qui ne nomment rien)
   est refusée aussi — c'est la moitié du défaut qu'un simple `min_length=1`
   raterait ;
5. le refus NOMME les sections vides, pour que la relance soit ciblée et non
   aveugle ;
6. il n'existe qu'UNE définition de « vide » (GA-26) — celle que le routeur
   utilisait déjà.
"""

from __future__ import annotations

import pytest
from instructor.exceptions import InstructorRetryException
from pydantic import ValidationError

from app.models.outputs.research import (
    STRATEGY_SECTIONS,
    ResearchOutput,
    ResearchStrategy,
    strategy_refusal_sections,
    strategy_sections_that_say_nothing,
)

# ── Fixtures de sortie ────────────────────────────────────────────────────────

#: Ce que le prompt demande vraiment (MIN 4 défis, MIN 4 douleurs, EXACTEMENT 3
#: angles, 2-4 axes écartés, MIN 4 questions, MIN 3 objections).
FULL_STRATEGY: dict = {
    "itChallenges": [
        {"title": f"Défi {i}", "description": "Contexte + pourquoi maintenant."} for i in range(4)
    ],
    "pains": [{"pain": f"Douleur {i}", "businessImpact": "Retard time-to-market"} for i in range(4)],
    "angles": [
        {
            "title": "Usine DevOps",
            "strategy": "PROMESSE + PREUVE + ACTION",
            "entryContactPersona": "Directeur Études BU Logistique",
        },
        {"title": "Socle data", "strategy": "…"},
        {"title": "Reprise de TMA", "strategy": "…"},
    ],
    "axesEcartes": [
        {"angle": "SAP S/4HANA", "raison": "hors de ton offre", "commentReactiver": "profil ESN SAP"},
        {"angle": "Cybersécurité / SOC", "raison": "hors practice", "commentReactiver": "si tu ouvres une practice"},
    ],
    "commentOuvrirCompte": "Entrer par la DSI groupe, puis multi-threader sur la BU Logistique.",
    "rdvScript": {"opening": "Suite à votre nomination…", "closing": "On cale 30 minutes ?"},
    "powerQuestions": [f"Question {i} ? — [pourquoi]" for i in range(4)],
    "objections": [{"objection": f"Objection {i}", "response": "VALIDER → REBONDIR"} for i in range(3)],
}

#: Un compte MAIGRE mais légitime : une PME de douze personnes dont les sources
#: publiques ne portent ni défi IT nommable, ni objection prévisible, ni axe
#: écarté. Une seule porte d'entrée décrite, une douleur, un angle. C'est un
#: dossier PAUVRE, pas un dossier CASSÉ — il doit passer.
THIN_BUT_LEGITIMATE: dict = {
    "pains": [{"pain": "Facturation encore sous tableur"}],
    "angles": [{"title": "Reprise de la facturation", "strategy": "Audit 3 semaines puis lotissement."}],
    "commentOuvrirCompte": "Passer par le gérant — il n'y a pas de DSI.",
}


class TestUneSortieVideEstRefusee:
    def test_une_sortie_entierement_par_defaut_est_refusee(self):
        """LE défaut. Aujourd'hui ceci VALIDAIT et le dossier partait « completed »."""
        with pytest.raises(ValidationError):
            ResearchStrategy.model_validate({})

    def test_une_reponse_mappee_sur_aucun_champ_est_refusee(self):
        # Ce que le modèle rend réellement quand il rate le contrat : des clés
        # qui n'existent pas. ``extra`` est ignoré, donc TOUT tombe par défaut.
        with pytest.raises(ValidationError):
            ResearchStrategy.model_validate({"strategie": "…", "plays": ["…"]})

    def test_le_refus_nomme_les_sections_vides(self):
        """Le point de tout l'exercice : une relance CIBLÉE, pas une de plus à l'aveugle."""
        with pytest.raises(ValidationError) as caught:
            ResearchStrategy.model_validate({})
        errors = caught.value.errors()
        assert len(errors) == 1
        assert errors[0]["type"] == "strategy_says_nothing"
        # Exploitable par le CODE : le contexte porte les noms Python, ceux que
        # le routeur journalise et que `STRATEGY_SECTIONS` déclare.
        assert set(errors[0]["ctx"]["sections"]) == set(STRATEGY_SECTIONS)
        # Lisible par le MODÈLE : le message part dans le reask d'instructor, il
        # doit donc nommer les clés telles que le modèle les a écrites — les
        # quatre où l'alias de fil diffère du nom Python sont celles qui peuvent
        # se tromper, elles sont écrites en toutes lettres ici exprès.
        message = errors[0]["msg"]
        for wire_key in ("itChallenges", "axesEcartes", "commentOuvrirCompte", "powerQuestions"):
            assert wire_key in message
        for shared_key in ("pains", "angles", "objections"):
            assert shared_key in message

    def test_le_refus_ne_nomme_que_ce_qui_est_vide(self):
        with pytest.raises(ValidationError) as caught:
            ResearchStrategy.model_validate({"rdvScript": {"opening": "Bonjour"}})
        named = caught.value.errors()[0]["ctx"]["sections"]
        # ``rdvScript`` n'est pas une section comptée — il reste absent des noms.
        assert "rdv_script" not in named
        assert set(named) == set(STRATEGY_SECTIONS)


class TestUneSortiePresqueVideEstRefusee:
    """Les sections sont là, elles ne NOMMENT rien. Un `min_length=1` par champ
    laisserait passer exactement ça."""

    def test_des_items_qui_ne_nomment_rien_ne_remplissent_pas_une_section(self):
        with pytest.raises(ValidationError):
            ResearchStrategy.model_validate(
                {
                    "itChallenges": [{"title": "", "description": "  "}],
                    "pains": [{"pain": "   "}],
                    "angles": [{"title": "", "strategy": ""}],
                    "powerQuestions": ["", "   "],
                    "objections": [{"objection": ""}],
                    "commentOuvrirCompte": "   ",
                }
            )

    def test_un_seul_item_qui_nomme_quelque_chose_suffit(self):
        strategy = ResearchStrategy.model_validate(
            {"pains": [{"pain": "   "}, {"pain": "Dette technique sur le legacy paie"}]}
        )
        assert len(strategy.pains) == 2  # on ne JETTE rien — on ne COMPTE pas le vide


class TestUneSortieRicheEtUneSortieMaigrePassent:
    def test_une_sortie_complete_passe(self):
        strategy = ResearchStrategy.model_validate(FULL_STRATEGY)
        assert len(strategy.angles) == 3
        assert len(strategy.pains) == 4
        assert strategy_sections_that_say_nothing(strategy) == ()

    def test_un_compte_maigre_mais_legitime_passe(self):
        """Le garde-fou de la sévérité : si mes minima refusent CE dossier, ils
        sont trop stricts. Une PME sans défi IT nommable, sans objection
        prévisible et sans axe écarté doit produire son dossier."""
        strategy = ResearchStrategy.model_validate(THIN_BUT_LEGITIMATE)
        assert strategy.it_challenges == []
        assert strategy.objections == []
        assert strategy.axes_ecartes == []
        # …et le dossier fusionné se construit sans rien perdre.
        merged = ResearchOutput(**strategy.model_dump(by_alias=True)).model_dump(by_alias=True)
        assert merged["angles"][0]["title"] == "Reprise de la facturation"

    @pytest.mark.parametrize(
        "payload",
        [
            pytest.param({"itChallenges": [{"title": "NIS2", "description": "…"}]}, id="defis_seuls"),
            pytest.param({"pains": [{"pain": "Dette technique"}]}, id="douleurs_seules"),
            pytest.param({"angles": [{"title": "Renfort build"}]}, id="angles_seuls"),
            pytest.param(
                {"axesEcartes": [{"angle": "SAP", "raison": "hors offre"}]}, id="axes_ecartes_seuls"
            ),
            pytest.param({"commentOuvrirCompte": "Entrer par la DSI groupe."}, id="porte_d_entree_seule"),
            pytest.param({"powerQuestions": ["Comment gérez-vous le legacy ?"]}, id="questions_seules"),
            pytest.param({"objections": [{"objection": "Nous avons déjà des partenaires"}]}, id="objections_seules"),
        ],
    )
    def test_chaque_section_seule_suffit_a_faire_un_dossier(self, payload: dict):
        """AUCUNE section ne porte de minimum PROPRE — sur un compte maigre,
        chacune peut légitimement être seule. Le minimum est COLLECTIF."""
        assert ResearchStrategy.model_validate(payload) is not None


class TestLeScriptDeRdvNeCompteToujoursPas:
    def test_un_script_de_rdv_seul_ne_fait_pas_un_dossier(self):
        """``rdvScript`` a un OBJET pour défaut, plein de chaînes vides : le
        compter ferait passer le cas cassé pour normal."""
        with pytest.raises(ValidationError):
            ResearchStrategy.model_validate(
                {"rdvScript": {"opening": "o", "storyFrames": ["s1"], "bridges": ["b1"]}}
            )


class TestUneSeuleDefinitionDuVide:
    """GA-26 — un réglage vit à un seul endroit."""

    def test_le_routeur_lit_la_meme_source_que_le_schema(self):
        from app.routers import phase1_research

        assert phase1_research._STRATEGY_SECTIONS is STRATEGY_SECTIONS

    def test_la_liste_des_sections_n_est_pas_vide_et_designe_de_vrais_champs(self):
        """Une garde doit prouver qu'elle LIT quelque chose."""
        assert len(STRATEGY_SECTIONS) >= 5
        for section in STRATEGY_SECTIONS:
            assert section in ResearchStrategy.model_fields, section

    def test_l_avertissement_du_dossier_livre_lit_la_meme_definition(self):
        from app.routers.phase1_research import _strategy_warning

        # Un angle qui ne nomme rien n'est pas un angle : le dossier livré doit
        # porter l'avertissement, comme le schéma aurait refusé la réponse.
        warnings = _strategy_warning({"sector": "Portails", "angles": [{"title": "  "}]})
        assert len(warnings) == 1
        assert warnings[0].code == "STRATEGY_SECTIONS_EMPTY"


def _refusal_error() -> ValidationError:
    """Le vrai refus, tel que Pydantic le lève sur une sortie vide."""
    with pytest.raises(ValidationError) as caught:
        ResearchStrategy.model_validate({})
    return caught.value


class TestLeRefusSeRelitDepuisLExceptionQuiLeTransporte:
    """Sans ça, « le refus nomme le champ » resterait une intention : le routeur
    ne voit pas la `ValidationError`, il voit l'enveloppe d'`instructor`."""

    def test_les_sections_se_relisent_a_travers_l_enveloppe_d_instructor(self):
        wrapped = InstructorRetryException(
            _refusal_error(), last_completion=None, n_attempts=2, total_usage=0
        )
        assert set(strategy_refusal_sections(wrapped)) == set(STRATEGY_SECTIONS)

    def test_les_sections_se_relisent_a_travers_une_cause_chainee(self):
        try:
            raise RuntimeError("échec de la phase") from _refusal_error()
        except RuntimeError as exc:
            assert set(strategy_refusal_sections(exc)) == set(STRATEGY_SECTIONS)

    def test_une_autre_erreur_de_validation_ne_passe_pas_pour_un_refus(self):
        """Le point qui rend la garde utile : elle sait dire NON. Un contrat
        cassé autrement (un champ de mauvais type) doit rester un échec, pas
        devenir un dossier dégradé silencieux."""
        with pytest.raises(ValidationError) as caught:
            ResearchStrategy.model_validate({"angles": [{"title": "A"}], "powerQuestions": 42})
        assert strategy_refusal_sections(caught.value) == ()

    def test_une_exception_sans_rapport_ne_nomme_rien(self):
        assert strategy_refusal_sections(TimeoutError("Anthropic n'a pas répondu")) == ()


class TestLaSortieDegradeeSanctionnee:
    """Le dossier PART quand même quand la stratégie a échoué (faits, signaux,
    contacts et plan ont abouti). Il faut donc UNE façon nommée de fabriquer la
    stratégie vide — et une seule."""

    def test_empty_contourne_la_validation_et_reste_reconnue_vide(self):
        strategy = ResearchStrategy.empty()
        assert isinstance(strategy, ResearchStrategy)
        assert set(strategy_sections_that_say_nothing(strategy)) == set(STRATEGY_SECTIONS)
        # Elle doit se sérialiser comme n'importe quelle autre — le dossier la traverse.
        dumped = strategy.model_dump(by_alias=True)
        assert dumped["angles"] == []
        assert dumped["commentOuvrirCompte"] == ""
