"""#3677.7 — l'IA produit `programNames` comme des OBJETS (nom, entité, budget,
description, objectif, périmètre, horizon), pas des chaînes.

Avant ce lot, `program_names` était `list[str]` côté modèle de sortie : l'écran
(`ItProgramsCard.tsx`) et le contrat (`programNameSchema`,
`packages/contracts/src/schemas/analysis/research.ts`) portaient déjà
`objective` / `scope` / `horizon`, mais la phase 3 ne les produisait jamais —
« reste » nommé lot F06 (#3677, commit 95fc6bf1dd) : « l'EXTRACTION de ces
trois champs en production ».

Le contrat accepte DÉJÀ les deux formes (chaîne OU objet, préprocess dans
`account-analysis.ts`) : une analyse déjà stockée en `list[str]` doit donc
continuer à se lire sans erreur — ce test le verrouille aussi côté IA.
"""

from app.models.outputs.research import ProgramName, ResearchFacts, ResearchOutput


class TestProgramNameCoercion:
    def test_une_chaine_nue_devient_un_programme_nomme_seul(self):
        program = ProgramName.model_validate("Plan stratégique 2029")
        assert program.name == "Plan stratégique 2029"
        assert program.objective == ""
        assert program.scope == ""
        assert program.horizon == ""

    def test_un_objet_complet_traverse_intact(self):
        program = ProgramName.model_validate(
            {
                "name": "Plan stratégique 2029",
                "entity": "Direction des systèmes d'information",
                "budget": "400 M€",
                "description": "Refonte du socle applicatif.",
                "objective": "Unifier les plateformes paiement",
                "scope": "Toutes les filiales européennes",
                "horizon": "2029",
            }
        )
        assert program.objective == "Unifier les plateformes paiement"
        assert program.scope == "Toutes les filiales européennes"
        assert program.horizon == "2029"

    def test_les_champs_absents_restent_vides_jamais_devines(self):
        program = ProgramName.model_validate({"name": "Programme X"})
        assert program.objective == ""
        assert program.scope == ""
        assert program.horizon == ""


class TestResearchFactsProgramNames:
    def test_une_liste_de_chaines_byte_identique_a_l_existant_se_lit_toujours(self):
        """Analyse déjà stockée (avant ce lot) : `programNames` en `list[str]`."""
        facts = ResearchFacts.model_validate({"programNames": ["Programme A", "Programme B"]})
        assert [p.name for p in facts.program_names] == ["Programme A", "Programme B"]
        assert all(p.objective == "" for p in facts.program_names)

    def test_une_liste_d_objets_porte_objectif_perimetre_horizon(self):
        facts = ResearchFacts.model_validate(
            {
                "programNames": [
                    {"name": "Programme A", "objective": "Migrer vers le cloud", "scope": "DSI groupe", "horizon": "2027"}
                ]
            }
        )
        assert facts.program_names[0].objective == "Migrer vers le cloud"
        assert facts.program_names[0].scope == "DSI groupe"
        assert facts.program_names[0].horizon == "2027"

    def test_une_liste_serialisee_en_chaine_json_est_reparee_comme_ses_voisines(self):
        """Même incident Thales (10/08) que `technologyStack` : une liste rendue en chaîne JSON."""
        facts = ResearchFacts.model_validate({"programNames": '["Programme A", "Programme B"]'})
        assert [p.name for p in facts.program_names] == ["Programme A", "Programme B"]

    def test_defaut_vide(self):
        assert ResearchFacts.model_validate({}).program_names == []


class TestResearchOutputProgramNames:
    def test_research_output_porte_la_meme_forme_objet(self):
        output = ResearchOutput.model_validate(
            {"programNames": [{"name": "Programme A", "horizon": "2030"}]}
        )
        assert output.program_names[0].name == "Programme A"
        assert output.program_names[0].horizon == "2030"
