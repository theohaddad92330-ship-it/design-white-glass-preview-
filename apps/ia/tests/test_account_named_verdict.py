"""#2304.12-.16 (épopée #2932, LAU-FINAL-045) — les CINQ catégories métier du
verdict de compte : AGIR MAINTENANT / QUALIFIER / RÉSERVE / METTRE EN VEILLE /
ÉCARTER POUR CET OBJECTIF. Le vocabulaire interne (GO/PRUDENT/STOP/EXPLORER,
`account_score.py`) reste — c'est la RÈGLE déterministe du score, testée par
ailleurs (`test_account_score.py`) — mais aucun des cinq libellés métier
n'existait, sur aucun champ.

`named_verdict` est une PROJECTION déterministe, jamais un second jugement du
modèle (même principe que `verdict_for_score` lui-même) :
 - GO → AGIR MAINTENANT (le fit et le timing sont là)
 - EXPLORER → QUALIFIER (potentiel réel, données manquantes : l'action est de
   COLLECTER l'info, pas de conclure — c'est déjà le sens d'EXPLORER)
 - PRUDENT → RÉSERVE (potentiel réel, mais des freins réels le tempèrent)
 - STOP se sépare en DEUX, sur le seul fait qui les distingue déjà ailleurs
   dans le dépôt (`dossier_read.no_go`, doctrine « un no-go est toujours
   temporaire ») :
   · un no-go AVEC déclencheur plausible → METTRE EN VEILLE (le compte
     rouvrira sur ce déclencheur — jamais enterré) ;
   · un STOP SANS déclencheur identifiable → ÉCARTER POUR CET OBJECTIF (le
     qualificatif « pour CET objectif » porte déjà la réversibilité —
     doctrine « on archive, on ne supprime pas » : un objectif différent peut
     rouvrir le compte, ce n'est jamais une fin en soi).
"""

from __future__ import annotations

from app.services.account_score import NAMED_VERDICTS, named_verdict


def test_les_cinq_libelles_sont_exactement_ceux_de_l_epopee():
    assert set(NAMED_VERDICTS) == {
        "AGIR MAINTENANT",
        "QUALIFIER",
        "RÉSERVE",
        "METTRE EN VEILLE",
        "ÉCARTER POUR CET OBJECTIF",
    }


def test_go_devient_agir_maintenant():
    assert named_verdict("GO") == "AGIR MAINTENANT"


def test_explorer_devient_qualifier():
    assert named_verdict("EXPLORER") == "QUALIFIER"


def test_prudent_devient_reserve():
    assert named_verdict("PRUDENT") == "RÉSERVE"


def test_stop_avec_declencheur_devient_mettre_en_veille():
    assert named_verdict("STOP", has_no_go_trigger=True) == "METTRE EN VEILLE"


def test_stop_sans_declencheur_devient_ecarter_pour_cet_objectif():
    assert named_verdict("STOP", has_no_go_trigger=False) == "ÉCARTER POUR CET OBJECTIF"


def test_stop_sans_argument_est_ecarte_par_defaut_jamais_mis_en_veille_par_accident():
    assert named_verdict("STOP") == "ÉCARTER POUR CET OBJECTIF"


def test_un_verdict_hors_vocabulaire_se_range_prudemment_en_qualifier_jamais_en_agir_maintenant():
    assert named_verdict("VERDICT_INCONNU") == "QUALIFIER"
