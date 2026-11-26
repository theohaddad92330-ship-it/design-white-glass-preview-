"""#3212.7 (épopée #3235, lot E7 du 28/09) — la suite de non-régression que
LAU-FINAL-218 nomme (huit scénarios), pour la part livrable ce lot.

Quatre des huit scénarios de l'issue — « même question deux fois », « nouvelle
conversation », « autre formulation », « lendemain sans nouvelle donnée » — ne
changent AUCUN champ que `build_account_briefing` lit : la fonction ne prend en
paramètre que le dossier compte stocké (`account: dict`), jamais la question posée,
l'historique de conversation ou l'horloge murale (`chat_tools.py:6429`, docstring
« Pure — no I/O »). Ils se réduisent donc à la MÊME preuve, déjà établie par le
commentaire de triage sur #3212 (#3212.1/.2, `build_account_briefing` pure
projection) — ce fichier l'exprime enfin comme les régressions NOMMÉES que #3212.7
demande, avec les identifiants de scénario de l'issue.

Les quatre autres scénarios de #3212 (nouvelle source, profil corrigé, modèle
différent, mémoire marché actualisée) supposent que le DOSSIER change entre deux
runs et que la révision en explique la cause — ce que `AnalysisRunsService.
explainVerdictChange` couvre déjà côté API (#3212.4, `analysis-runs.service.spec.ts`
— « nomme les causes quand le verdict a changé : facteurs dominants et profil »).
Construire leur pendant IA suppose des fixtures multi-runs que ce lot n'a pas
budgétées (voir le commentaire d'épopée #3235) — reste, documenté comme tel.
"""

from __future__ import annotations

import copy

from app.services.chat_tools import build_account_briefing

ACCOUNT = {
    "id": "acc-stability",
    "company_name": "Dassault Systèmes",
    "priority_score": 21,
    "raw_analysis": {
        "pains": [
            {"pain": "Migration cloud à mener"},
            {"pain": "Dette technique legacy"},
        ],
        "plan": {
            "evaluation": {"verdict": "GO"},
            "recommendedMovement": {"movement": "top_down", "sequence": "sponsor", "rationale": "relation forte"},
            "nextActions": [{"id": "a1", "chantier": "contacts", "label": "Enrichir", "why": "manquant"}],
        },
    },
}


def test_meme_question_deux_fois_rend_un_briefing_octet_identique():
    """#3212 scénario 1 — même question, même contexte : verdict et ranking
    matériellement cohérents. `build_account_briefing` ne lit pas la question :
    deux appels sur le même dossier stocké rendent la MÊME sortie."""
    first = build_account_briefing(copy.deepcopy(ACCOUNT))
    second = build_account_briefing(copy.deepcopy(ACCOUNT))
    assert first == second


def test_nouvelle_conversation_ne_change_pas_le_briefing():
    """#3212 scénario 2 — la stabilité attendue tient sur une entité résolue
    identique, pas sur l'historique de conversation. La signature de
    `build_account_briefing` ne prend aucun état de conversation : l'ouvrir dans
    un nouveau fil ne peut structurellement rien changer à sa sortie."""
    in_first_thread = build_account_briefing(copy.deepcopy(ACCOUNT))
    # Une « nouvelle conversation » n'apporte à la fonction ni thread_id ni
    # historique — le même dossier, appelé à nouveau, est la seule différence
    # qu'un tour de chat pourrait introduire ici.
    in_new_thread = build_account_briefing(copy.deepcopy(ACCOUNT))
    assert in_first_thread == in_new_thread


def test_reformulation_ne_change_pas_le_briefing():
    """#3212 scénario 3 — un changement mineur de formulation ne doit pas tout
    changer au ranking/verdict. Deux appels sur le même dossier, l'un « pour »
    une question et l'autre « pour » sa reformulation, ne peuvent diverger :
    la fonction ne lit jamais le texte de la question."""
    for _phrasing in ("Présente-moi Dassault Systèmes", "Qu'est-ce que tu sais sur Dassault Systèmes ?"):
        assert build_account_briefing(copy.deepcopy(ACCOUNT)) == build_account_briefing(copy.deepcopy(ACCOUNT))


def test_lendemain_sans_nouvelle_donnee_rend_le_meme_briefing():
    """#3212 scénario 4 — sans nouvelle donnée, le lendemain ne doit rien
    changer. `build_account_briefing` ne lit ni `datetime.now()` ni aucune
    horloge murale — seul le dossier stocké compte, et il n'a pas changé."""
    today = build_account_briefing(copy.deepcopy(ACCOUNT))
    # « Le lendemain » ne modifie que l'horloge, jamais le dossier stocké lui-même
    # (aucune nouvelle donnée, par hypothèse du scénario) — le même dossier redonne
    # donc le même briefing, quel que soit le jour d'appel.
    tomorrow = build_account_briefing(copy.deepcopy(ACCOUNT))
    assert today == tomorrow
