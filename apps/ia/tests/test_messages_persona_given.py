"""Le persona est DONNÉ au modèle, il n'est plus re-déduit par lui.

Le défaut : le palier hiérarchique était calculé déterministement en phase 3,
porté par chaque contact jusqu'ici (``hierarchyLevel``, ``computed_field``
toujours émis)… et jeté par ``build_user_prompt``, qui ne transmettait que le
titre. Le prompt système demandait alors « déduis son PERSONA depuis son titre ».

On payait donc un raisonnement de modèle pour recalculer ce qu'on savait déjà —
et on obtenait DEUX vérités : le contrôle avant envoi juge sur le persona
calculé, le message était écrit sur le persona deviné. Rien ne garantissait
qu'ils coïncident.
"""

from __future__ import annotations

from app.knowledge.persona import PERSONA_PROFILES, PERSONA_UNKNOWN
from app.prompts import bellum_messages

PROFILE = {"esn_name": "TestESN", "core_offers": ["Data & IA"]}


def _user_prompt(contacts):
    return bellum_messages.build_user_prompt("ACME", "contexte compte", contacts)


def test_le_prompt_systeme_ne_demande_plus_de_deduire_le_persona():
    system = bellum_messages.build_system_prompt(PROFILE)
    assert "déduis son PERSONA" not in system
    assert "t’est DONNÉ" in system
    assert "Ne le recalcule pas" in system


def test_le_prompt_systeme_porte_les_leviers_de_la_source_unique():
    # Les leviers vivaient en double : une table TS que personne n'injectait, et
    # une version écrite à la main dans le prompt. Ils sont maintenant construits
    # depuis la table — et la parité TS↔Python la tient alignée.
    system = bellum_messages.build_system_prompt(PROFILE)
    for profile in PERSONA_PROFILES.values():
        assert profile["lever"] in system
        assert profile["turns_off"] in system


def test_chaque_contact_arrive_avec_son_persona_calcule():
    prompt = _user_prompt(
        [
            {"fullName": "Claire Dubois", "title": "DSI", "hierarchyLevel": "c_level"},
            {"fullName": "Marc Petit", "title": "Engineering Manager", "hierarchyLevel": "management"},
            {"fullName": "Léa Roy", "title": "Tech Lead", "hierarchyLevel": "expert"},
        ]
    )
    assert "Claire Dubois — DSI · persona decideur" in prompt
    assert "Marc Petit — Engineering Manager · persona manager" in prompt
    assert "Léa Roy — Tech Lead · persona expert" in prompt


def test_un_persona_indeterminable_est_NOMMÉ_jamais_remplace_par_une_case_par_defaut():
    # « Non mesuré » n'est pas « opérationnel ». Un contact dont le poste ne dit
    # rien ne doit pas recevoir le levier d'un opérationnel par défaut.
    prompt = _user_prompt([{"fullName": "Inconnu", "title": "", "hierarchyLevel": "unknown"}])
    assert f"persona {PERSONA_UNKNOWN}" in prompt
    assert "persona decideur" not in prompt
    assert "persona operationnel" not in prompt


def test_le_champ_de_sortie_demande_une_RECOPIE_pas_un_calcul():
    prompt = _user_prompt([{"fullName": "Claire Dubois", "title": "DSI", "hierarchyLevel": "c_level"}])
    assert "RECOPIE EXACTEMENT le persona donné" in prompt
    # L'ancienne énumération accentuée — que nul consommateur TS n'aurait
    # reconnue — ne doit plus être demandée au modèle.
    assert '"décideur | manager | opérationnel"' not in prompt


def test_le_reste_de_la_ligne_contact_est_inchange():
    # #2887 — « DSI » (sans titre plus précis) classe désormais en `direction`
    # (palier réel `direction`), plus fin que l'ancien `decideur` qui collapsait
    # governance/c_level/direction ensemble.
    prompt = _user_prompt([{"fullName": "Claire Dubois", "title": "DSI", "entity": "Groupe", "role": "economic"}])
    assert "- Claire Dubois — DSI · Groupe · rôle economic · persona direction" in prompt


def test_sans_contact_le_bloc_reste_celui_davant():
    assert "(aucun contact prioritaire)" in _user_prompt([])
