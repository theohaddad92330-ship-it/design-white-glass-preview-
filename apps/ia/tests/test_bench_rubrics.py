"""Les barèmes par prompt du banc — et la seule question qui compte : SAVENT-ILS
DIRE NON ?

Un barème qui note tout à 100 % passe tous les tests et ne sert à rien. Chaque
barème a donc ici **deux** sorties : une plausible et bien faite, une plausible
et FAUTIVE (un décideur manquant, un signal sans source, un SIREN qui échoue à
Luhn, une personne inventée) — et le test exige que la seconde soit sanctionnée,
sur l'AXE qui la concerne, pas seulement sur le total.

Les autres gardes tenues ici :

* un axe non mesurable **sort du dénominateur** — les autres axes ne bougent pas
  d'un millième quand on retire le champ qui le nourrit ;
* sous trois axes mesurés, **il n'y a pas d'agrégat** ;
* chaque axe **cite son ascendance**, et cette ascendance est un fichier qui
  existe, à une ligne qui existe ;
* la note du juge **ne peut faire bouger aucun axe déterministe** ;
* le corpus lu **n'est pas vide** (une garde qui ne lit rien ne garde rien).

Zéro réseau, zéro dépense.
"""

from __future__ import annotations

import inspect
import json
from pathlib import Path

import pytest

from app.eval.bench import compare as CMP
from app.eval.bench import corpus as CORPUS
from app.eval.bench import judge as JUDGE
from app.eval.bench import quality as QUALITY
from app.eval.bench import rubrics as RUBRICS
from app.eval.bench.rubrics import contacts as R_CONTACTS
from app.eval.bench.rubrics import facts as R_FACTS
from app.eval.bench.rubrics import organigramme as R_ORG
from app.eval.bench.rubrics import signals as R_SIGNALS
from app.eval.bench.rubrics import strategy as R_STRATEGY
from app.eval.bench.rubrics.axes import MIN_MEASURED_AXES, Axis, RubricResult, measured, unmeasurable
from app.eval.strategy.rubric import score_strategy
from app.eval.strategy.variants import ModelSpec

IA_ROOT = Path(__file__).resolve().parents[1]


# ── sorties de référence ──────────────────────────────────────────────────────


def _facts_good() -> dict:
    return {
        "business_description": "Éditeur de logiciels de santé, modèle SaaS, croissance à deux chiffres.",
        "sector": "Édition de logiciels de santé",
        "employees": "2 800",
        "revenue": "410 M€",
        "headquarters": "54 quai Charles de Gaulle, 69006 Lyon",
        "concrete_activity": "Opère 80 000 prises de rendez-vous par jour.",
        "it_implications_for_esn": "Besoins de scalabilité et de conformité HDS.",
        "entities_exhaustive": [
            {"name": f"BU {i}", "type": "BU", "parent": "Groupe", "it_autonomy": "autonome"}
            for i in range(4)
        ],
        "sites_france": [{"city": "Lyon", "type": "siege"}, {"city": "Nantes", "type": "R&D"}],
        "program_names": ["Programme Horizon", "Programme Socle"],
        "technology_stack": [
            {"name": f"Techno {i}", "usage": "u", "maturity": "mature"} for i in range(5)
        ],
    }


def _signals_good() -> dict:
    return {
        "recent_signals": [
            {"signal": f"Signal {i}", "source": "Les Échos", "source_ref": "[P1]",
             "date": "2026-06-01", "type": "projet"}
            for i in range(4)
        ],
        "budget_signals": [
            {"signal": "Enveloppe cloud", "source": "Rapport annuel", "timeframe": "2026"},
        ],
        "people_mentioned": [
            {"name": "Claire Dupont", "title": "DSI", "source": "Site officiel", "source_ref": "[O2]"},
        ],
        "qualified_hypotheses": [
            {"hypothesis": "Industrialise ses modèles", "based_on_signals": ["a", "b", "c"]},
        ],
        "competitors": [{"name": "Capgemini"}],
    }


def _contacts_good() -> dict:
    return {
        "contacts": [
            {"full_name": "Claire Dupont", "title": "Directrice des Systèmes d'Information",
             "role": "technical", "priority": 1, "influence_level": "decision-maker",
             "family": "IT / Infrastructure", "hierarchy_level": "direction"},
            {"full_name": "Marc Leroy", "title": "Directeur Financier", "role": "economic",
             "priority": 2, "influence_level": "decision-maker", "family": "Finance",
             "hierarchy_level": "direction"},
            {"full_name": "Sophie Martin", "title": "Responsable des Achats", "role": "procurement",
             "priority": 3, "influence_level": "executor", "family": "Achat / Procurement",
             "hierarchy_level": "management"},
        ]
    }


def _contacts_user_prompt(names: tuple[str, ...] = ("Claire Dupont", "Marc Leroy", "Sophie Martin")) -> str:
    payload = json.dumps([{"fullName": n, "title": "T"} for n in names], ensure_ascii=False)
    return (
        'Enrichis les contacts de "Doctolib".\n\n'
        f"===== CONTACTS BRUTS =====\n{payload}\n\n"
        "===== ENTITES DE L'ENTREPRISE =====\n[]\n"
    )


def _org_good() -> dict:
    return {
        "org_chart": [
            {"entity": "Groupe", "level": "groupe", "contacts": ["Claire Dupont", "Marc Leroy"]},
        ],
        "decision_chain": {
            "description": "Décision portée par la DSI, arbitrée en COMEX.",
            "steps": [{"step": "Cadrage", "actors": ["Claire Dupont"], "duration": "4 semaines"}],
            "estimated_cycle_length": "6 mois",
            "budget_authority": "Marc Leroy",
        },
        "uncovered_zones": [
            {"zone": "Cyber", "entity": "Groupe", "family": "Cybersécurité", "level": "L2",
             "importance": "critique"},
        ],
        "stakeholder_map": [{"full_name": "Claire Dupont", "stance": "advocate"}],
        "approach_order": [
            {"step": 1, "contact": "Claire Dupont", "role": "DSI", "why_first": "porte le sujet",
             "channel": "linkedin", "expected_outcome": "obtenir un cadrage",
             "unlocks": "accès COMEX", "fallback": "passer par Marc Leroy"},
        ],
        "hierarchy_relations": [
            {"from_name": "Claire Dupont", "to_name": "Groupe", "type": "member_of",
             "evidence": "organigramme public", "reasoning": "rattachement cité"},
        ],
        "influence_map": [
            {"from_name": "Marc Leroy", "to_name": "Claire Dupont", "topic": "budget cloud",
             "stance": "neutral", "confidence": 40, "reasoning": "arbitre l'enveloppe"},
        ],
    }


def _org_user_prompt(names: tuple[str, ...] = ("Claire Dupont", "Marc Leroy")) -> str:
    payload = json.dumps([{"fullName": n, "title": "T"} for n in names], ensure_ascii=False)
    return (
        'Cartographie le compte "Doctolib".\n\nACCOUNT: Doctolib\n'
        "ENTITIES: []\n"
        f"CONTACTS: {payload}\n"
        "SIGNALS: non fourni\n"
    )


def _strategy_good(n_angles: int = 3) -> dict:
    return {
        "angles": [
            {"title": f"Angle {i}", "strategy": "Atelier de cadrage sous 15 jours, preuve chiffrée.",
             "entryContactPersona": "DSI", "specificOffer": "TMA 3 consultants sur 12 mois",
             "estimatedDealSize": "450 k€", "prerequisites": "Accès aux specs"}
            for i in range(n_angles)
        ],
        "rdvScript": {
            "opening": "Vous avez annoncé la refonte du socle en mars ; c'est ce qui m'amène.",
            "positioning": "Nous renforçons les équipes plateforme sur la durée.",
            "exploration": [f"Question {i} ?" for i in range(5)],
            "proposal": "Un atelier de cadrage de 2 jours.",
            "closing": "Un créneau de 30 min mardi prochain ?",
            "bridges": ["Puisque vous parlez du socle…", "Vous évoquiez la dette…"],
            "storyFrames": ["Cas d'un assureur", "Cas d'un retailer"],
        },
        "itChallenges": [
            {"title": f"Défi {i}", "description": "d", "severity": "high",
             "esnOfferMatch": "TMA", "timeframe": "6 mois"} for i in range(4)
        ],
        "pains": [
            {"pain": f"Douleur {i}", "urgency": "haute", "businessImpact": "retard produit",
             "esnOffer": "squad data"} for i in range(4)
        ],
        "powerQuestions": [f"Question ouverte {i} ? — pour faire verbaliser" for i in range(4)],
        "objections": [
            {"objection": f"O{i}", "realConcern": "peur du dérapage", "response": "valider puis rebondir",
             "mirrorQuestion": "Qu'est-ce qui vous ferait dire oui ?"} for i in range(3)
        ],
        "axesEcartes": [
            {"angle": f"Axe {i}", "raison": "hors profil", "commentReactiver": "sous profil SAP"}
            for i in range(2)
        ],
        "commentOuvrirCompte": "Entrer par la DSI groupe sur le sujet socle.",
    }


def _record(prompt_name: str, output: dict, user: str = "USR") -> CORPUS.CallRecord:
    return CORPUS.CallRecord(
        record_id=CORPUS.compute_record_id(
            prompt_name=prompt_name, system="SYS", user=user, response_model="dict", max_tokens=10
        ),
        corpus="c", case="acme", prompt_name=prompt_name, task="t", system="SYS", user=user,
        response_model="dict", max_tokens=10, max_retries=2, model_requested="m",
        arm="A", model="m", provider="anthropic", output=output, latency_s=1.0, cost_usd=0.01,
    )


def _axis(result: RubricResult, name: str) -> Axis:
    hit = next((a for a in result.axes if a.name == name), None)
    assert hit is not None, f"axe {name!r} absent de {[a.name for a in result.axes]}"
    return hit


# ══ 1. le corpus lu n'est pas vide ═════════════════════════════════════════════


def test_the_registry_is_not_empty_and_covers_the_paying_path():
    """Une garde qui ne LIT rien ne garde rien : on vérifie que le registre
    couvre bien les cinq prompts du chemin payant, pas qu'il existe.

    ⚠️ Ce test ne compte plus les barèmes : cinq prompts de LIVRABLE ont été
    ajoutés le 29/08 (``rubrics/plan.py`` & co., couverts par
    ``tests/test_bench_rubrics_livrables.py``). Compter aurait fait rougir ce
    test à chaque ajout légitime, ce qui est le contraire d'une garde — on
    vérifie la COUVERTURE du chemin payant, qui est ce qu'il protégeait."""
    for prompt in ("bellum_facts", "bellum_signals", "bellum_strategy",
                   "bellum_contacts", "bellum_organigramme"):
        assert RUBRICS.rubric_for(prompt) is not None, prompt
    # Le nom réel d'un lot de contacts est versionné — c'est le PRÉFIXE qui résout.
    assert RUBRICS.rubric_for("bellum_contacts_batch_2_of_5") is R_CONTACTS.score
    # Un prompt sans grille reste sans grille — et il est NOMMÉ, pas oublié.
    #
    # ⚠️ ``bellum_scorer`` figurait ici jusqu'au 29/08 ; il a désormais un barème
    # (``rubrics/scorer.py``, couvert par ``tests/test_bench_prompts_restants.py``).
    # ``bellum_chat`` reste le refus EXPLICITE du registre : du texte libre au
    # bout d'une boucle d'outils, dont le chemin de production ne passe même pas
    # par la passerelle qu'enregistre le banc.
    assert RUBRICS.rubric_for("bellum_chat") is None
    assert RUBRICS.rubric_for("bellum_scorer") is not None


def test_every_axis_of_every_rubric_names_the_primitive_it_descends_from():
    """« Un axe sans ascendance est un axe inventé. » On vérifie que chaque
    ``origin`` désigne un FICHIER QUI EXISTE, à une LIGNE QUI EXISTE."""
    seen_files = 0
    for result in _all_results():
        assert result.axes, result.prompt
        for axis in result.axes:
            assert axis.origin, f"{result.prompt}/{axis.name}"
            for token in axis.origin.split():
                if not token.startswith("app/") or ".py" not in token:
                    continue
                path_part, _, line_part = token.partition(":")
                path = IA_ROOT / path_part.rstrip(",")
                assert path.exists(), f"{result.prompt}/{axis.name} cite {path_part}, absent du disque"
                seen_files += 1
                first_line = line_part.split("-")[0].split(",")[0].strip(" ()")
                if first_line.isdigit():
                    n_lines = len(path.read_text(encoding="utf-8").splitlines())
                    assert int(first_line) <= n_lines, f"{token} dépasse {path_part} ({n_lines} lignes)"
    assert seen_files >= 20, "le corpus d'ascendances lu est trop maigre pour prouver quoi que ce soit"


def _all_results() -> list[RubricResult]:
    return [
        R_FACTS.score(_facts_good()),
        R_SIGNALS.score(_signals_good()),
        R_CONTACTS.score(_contacts_good(), user_prompt=_contacts_user_prompt()),
        R_ORG.score(_org_good(), user_prompt=_org_user_prompt()),
        R_STRATEGY.score(_strategy_good()),
    ]


def test_every_rubric_produces_at_least_three_axes_on_a_realistic_output():
    for result in _all_results():
        assert len(result.measured_axes) >= MIN_MEASURED_AXES, result.prompt
        assert result.total is not None, result.prompt
        assert result.total > 50, f"{result.prompt} note trop bas une sortie correcte ({result.total})"
        assert len({a.name for a in result.axes}) == len(result.axes), result.prompt


def test_every_axis_says_what_it_cannot_see():
    """La colonne la plus utile du tableau : ce que l'axe ne SAIT PAS voir. Un axe
    mesuré qui ne le dit pas laisserait croire qu'il voit tout."""
    for result in _all_results():
        for axis in result.measured_axes:
            assert axis.blind_to, f"{result.prompt}/{axis.name} ne dit pas ce qu'il ne voit pas"
        assert result.caveat, result.prompt


# ══ 2. chaque barème SANCTIONNE une sortie fautive ═════════════════════════════


def test_facts_sanctions_a_siren_that_fails_luhn():
    """Une sortie plausible dont un SIREN est fabriqué : l'axe siren_plausible
    tombe à 0 et le total baisse. Le contrôle est celui de la production."""
    good = _facts_good()
    bad = {**good, "subsidiaries": [{"name": "Filiale A", "siren": "123456789"}]}
    ok = {**good, "subsidiaries": [{"name": "Filiale A", "siren": "552081317"}]}  # Renault, valide

    r_bad, r_ok = R_FACTS.score(bad), R_FACTS.score(ok)
    assert _axis(r_bad, "siren_plausible").ratio == 0.0
    assert _axis(r_ok, "siren_plausible").ratio == 1.0
    assert r_bad.total is not None and r_ok.total is not None
    assert r_bad.total < r_ok.total


def test_facts_sanctions_fabricated_content_and_a_thin_schema():
    bad = {
        "sector": "Édition", "employees": "", "revenue": "", "headquarters": "",
        "business_description": "Société Acme Corp, contact john doe.",
        "entities_exhaustive": [{"name": "BU 1"}],
        "sites_france": [], "program_names": [], "technology_stack": [],
    }
    r_bad, r_good = R_FACTS.score(bad), R_FACTS.score(_facts_good())
    assert _axis(r_bad, "sans_donnee_inventee").ratio < 1.0
    assert _axis(r_bad, "faits_durs").ratio < _axis(r_good, "faits_durs").ratio
    assert _axis(r_bad, "minima_du_schema").ratio < 0.3
    assert _axis(r_bad, "entites_situees").ratio == 0.0
    assert r_bad.total is not None and r_good.total is not None
    assert r_bad.total < r_good.total / 2


def test_signals_sanctions_a_signal_without_a_source():
    """Le cas que Louis nomme : « un signal sans source ». Le prompt EXIGE la
    source ; « Non source » est honnête mais n'en est pas une."""
    bad = {**_signals_good(), "recent_signals": [
        {"signal": "Refonte du SI", "source": "Non source", "date": "2026-06-01"},
        {"signal": "Nomination", "source": "", "date": "2026-05-01"},
        {"signal": "Appel d'offres", "source": "Les Échos", "date": "2026-04-01"},
    ]}
    r_bad, r_good = R_SIGNALS.score(bad), R_SIGNALS.score(_signals_good())
    assert _axis(r_bad, "signaux_sources").ratio == 0.5  # 2 sourcés sur 4 (dont le budgetSignal)
    assert _axis(r_good, "signaux_sources").ratio == 1.0
    assert r_bad.total < r_good.total


def test_signals_sanctions_a_signal_without_a_date_and_a_lonely_hypothesis():
    bad = {**_signals_good(),
           "recent_signals": [{"signal": "Refonte", "source": "Les Échos", "date": "Non datee"}],
           "qualified_hypotheses": [{"hypothesis": "H", "based_on_signals": ["un seul"]}]}
    r_bad, r_good = R_SIGNALS.score(bad), R_SIGNALS.score(_signals_good())
    assert _axis(r_bad, "signaux_dates").ratio == 0.5  # le budgetSignal garde son timeframe
    assert _axis(r_good, "signaux_dates").ratio == 1.0
    assert _axis(r_bad, "hypotheses_convergentes").ratio == 0.0
    assert r_bad.total < r_good.total


def test_contacts_sanctions_a_batch_without_a_single_decision_maker():
    """« Un décideur manquant » : trois contacts réels, aucun qui décide."""
    bad = {"contacts": [
        {"full_name": "Alex Roux", "title": "Assistant administratif", "role": "user",
         "priority": 4, "influence_level": "executor", "family": "Autre"},
        {"full_name": "Lea Simon", "title": "Chargée de communication", "role": "user",
         "priority": 5, "influence_level": "executor", "family": "Autre"},
    ]}
    user = _contacts_user_prompt(("Alex Roux", "Lea Simon"))
    r_bad = R_CONTACTS.score(bad, user_prompt=user)
    r_good = R_CONTACTS.score(_contacts_good(), user_prompt=_contacts_user_prompt())
    assert _axis(r_bad, "decideurs_identifies").ratio == pytest.approx(0.4)
    assert _axis(r_good, "decideurs_identifies").ratio > 0.9
    assert _axis(r_bad, "comite_couvert").ratio < _axis(r_good, "comite_couvert").ratio
    assert r_bad.total < r_good.total


def test_contacts_sanctions_an_invented_name_and_a_dropped_one():
    """Le modèle rend une personne qu'on ne lui a pas donnée, et en oublie une."""
    bad = {"contacts": [
        {"full_name": "Claire Dupont", "title": "DSI", "role": "technical", "priority": 1,
         "influence_level": "decision-maker"},
        {"full_name": "Jean Inexistant", "title": "CTO", "role": "technical", "priority": 2,
         "influence_level": "decision-maker"},
    ]}
    r = R_CONTACTS.score(bad, user_prompt=_contacts_user_prompt())
    # ÉLIMINATOIRE : un seul nom fabriqué met l'axe à zéro. En part il aurait valu
    # 0,5, et un modèle qui invente aurait été « à moitié bon ».
    assert _axis(r, "noms_conserves").ratio == 0.0
    assert _axis(r, "noms_conserves").data["invented"] == ["JEAN INEXISTANT"]
    assert _axis(r, "contacts_tous_traites").ratio == 0.3333  # 1 des 3 fournis rendu
    good = R_CONTACTS.score(_contacts_good(), user_prompt=_contacts_user_prompt())
    assert _axis(good, "noms_conserves").ratio == 1.0
    assert r.total < good.total


def test_contacts_sanctions_an_unusable_role():
    bad = {"contacts": [
        {"full_name": f"P{i} N{i}", "title": "Directeur des Achats indirects", "role": "",
         "priority": 0, "influence_level": ""} for i in range(3)
    ]}
    r = R_CONTACTS.score(bad, user_prompt=_contacts_user_prompt(tuple(f"P{i} N{i}" for i in range(3))))
    assert _axis(r, "role_lisible").ratio == 0.0
    assert _axis(r, "priorite_posee").ratio == 0.0


def test_organigramme_sanctions_an_invented_person():
    """« Une personne inventée » : le graphe nomme quelqu'un qui n'a jamais été
    fourni. C'est la faute que ``judge._check_coherence`` classe CRITIQUE."""
    bad = _org_good()
    bad["org_chart"] = [{"entity": "Groupe", "level": "groupe",
                         "contacts": ["Claire Dupont", "Fantôme Inventé"]}]
    r_bad = R_ORG.score(bad, user_prompt=_org_user_prompt())
    r_good = R_ORG.score(_org_good(), user_prompt=_org_user_prompt())
    assert _axis(r_good, "personnes_reelles").ratio == 1.0
    # ⚠️ ZÉRO, pas 0,857. En part, un fantôme parmi sept mentions coûtait TROIS
    # points sur cent : le banc aurait dit qu'un modèle qui fabrique un contact
    # est « presque aussi bon » qu'un modèle honnête.
    assert _axis(r_bad, "personnes_reelles").ratio == 0.0
    assert "FANTOME INVENTE" in _axis(r_bad, "personnes_reelles").data["invented"]
    assert _axis(r_bad, "personnes_reelles").data["mentions"] == 7  # la part aurait dilué
    assert r_bad.total < r_good.total


def test_organigramme_sanctions_a_relation_the_assembler_would_throw_away():
    """Une relation sans preuve, ou d'un type inconnu, n'existe pas dans le
    produit : ``org_graph_assembler.py:596-618`` la jette. Le barème le voit."""
    bad = _org_good()
    bad["hierarchy_relations"] = [
        {"from_name": "Claire Dupont", "to_name": "Groupe", "type": "member_of", "evidence": ""},
        {"from_name": "Claire Dupont", "to_name": "Marc Leroy", "type": "travaille_avec",
         "evidence": "vu sur le site"},
        {"from_name": "Claire Dupont", "to_name": "Groupe", "type": "member_of",
         "evidence": "organigramme public"},
    ]
    bad["influence_map"] = [
        {"from_name": "Marc Leroy", "to_name": "Claire Dupont", "topic": "budget", "reasoning": ""},
    ]
    r_bad = R_ORG.score(bad, user_prompt=_org_user_prompt())
    r_good = R_ORG.score(_org_good(), user_prompt=_org_user_prompt())
    assert _axis(r_bad, "relations_retenues").ratio == 0.3333  # 1 des 3 survit
    assert _axis(r_good, "relations_retenues").ratio == 1.0
    assert _axis(r_bad, "influences_retenues").ratio == 0.0
    assert r_bad.total < r_good.total


def test_organigramme_sanctions_a_zone_that_is_a_sentence_not_a_gap():
    bad = _org_good()
    bad["uncovered_zones"] = [
        {"zone": "Il manque un contact cyber"},
        {"zone": "Achats", "entity": "Groupe", "family": "Achat", "level": "niveau 2"},
    ]
    bad["approach_order"] = [{"step": 1, "contact": "Claire Dupont", "role": "DSI"}]
    r_bad = R_ORG.score(bad, user_prompt=_org_user_prompt())
    assert _axis(r_bad, "zones_relancables").ratio == 0.0
    assert _axis(r_bad, "chemin_actionnable").ratio == 0.0


def test_strategy_still_sanctions_a_single_angle_exactly_as_before():
    """Le barème historique n'est pas touché — et il sait toujours dire non."""
    r_bad, r_good = R_STRATEGY.score(_strategy_good(1)), R_STRATEGY.score(_strategy_good(3))
    assert r_bad.total < r_good.total
    assert _axis(r_bad, "angles").ratio < _axis(r_good, "angles").ratio


# ══ 2bis. une violation de DOCTRINE est éliminatoire, une incomplétude ne l'est pas ══


def test_a_doctrine_violation_is_eliminatory_never_diluted_by_volume():
    """Le piège que ce lot devait éviter. Un modèle qui fabrique UNE personne au
    milieu de VINGT vraies ne doit pas marquer 0,95 : il doit marquer ZÉRO sur
    l'axe. Sinon le banc récompense le volume et pardonne la fabrication."""
    many = [f"Vrai{i} Nom{i}" for i in range(20)]
    output = {"org_chart": [{"entity": "Groupe", "level": "groupe",
                             "contacts": [*many, "Fantôme Inventé"]}]}
    r = R_ORG.score(output, user_prompt=_org_user_prompt(tuple(many)))
    axis = _axis(r, "personnes_reelles")
    assert axis.ratio == 0.0, "une personne fabriquée s'est diluée dans le volume"
    assert axis.data["mentions"] == 21 and axis.data["resolved"] == 20
    assert axis.data["eliminatory"] is True
    # …et sans le fantôme, l'axe est plein : la porte ne punit pas le volume.
    clean = {"org_chart": [{"entity": "Groupe", "level": "groupe", "contacts": many}]}
    assert _axis(R_ORG.score(clean, user_prompt=_org_user_prompt(tuple(many))),
                 "personnes_reelles").ratio == 1.0


def test_every_doctrine_axis_is_eliminatory_and_no_other_one_is():
    """La frontière, tenue explicitement : ce qui FABRIQUE est éliminatoire, ce
    qui MANQUE reste une part. Confondre les deux ferait d'un signal non daté une
    faute aussi grave qu'un contact inventé."""
    doctrine = {"personnes_reelles", "noms_conserves", "sans_donnee_inventee", "siren_plausible"}
    seen: set[str] = set()
    for result in _all_results():
        for axis in result.measured_axes:
            is_elim = bool(axis.data.get("eliminatory"))
            assert is_elim == (axis.name in doctrine), f"{result.prompt}/{axis.name}"
            if is_elim:
                seen.add(axis.name)
    # Le corpus lu n'est pas vide : trois des quatre axes de doctrine sont
    # mesurés sur les sorties de référence (siren_plausible ne l'est que si le
    # modèle produit un SIREN, ce que bellum_facts ne demande pas).
    assert seen == doctrine - {"siren_plausible"}, seen


def test_an_incompleteness_stays_a_share_and_is_NOT_eliminatory():
    """Contre-épreuve : une relation que l'assembleur jette n'invente RIEN, elle
    manque. Elle reste une part — et le KPI expédié le dit lui-même
    (`KPI_MAX_NON_SOURCED_RATIO` tolère 5 %, donc c'est un seuil sur un ratio)."""
    bad = _org_good()
    bad["hierarchy_relations"] = [
        {"from_name": "Claire Dupont", "to_name": "Groupe", "type": "member_of", "evidence": ""},
        {"from_name": "Claire Dupont", "to_name": "Groupe", "type": "member_of",
         "evidence": "organigramme public"},
    ]
    axis = _axis(R_ORG.score(bad, user_prompt=_org_user_prompt()), "relations_retenues")
    assert axis.ratio == 0.5, "une incomplétude a été traitée comme une fabrication"
    assert not axis.data.get("eliminatory")

    from app.services.grounding_citations import KPI_MAX_NON_SOURCED_RATIO

    assert 0 < KPI_MAX_NON_SOURCED_RATIO < 1  # un RATIO toléré, pas une porte


# ══ 3. le barème de bellum_strategy est INCHANGÉ ═══════════════════════════════


@pytest.mark.parametrize("n", [0, 1, 2, 3])
def test_the_strategy_total_is_numerically_identical_to_the_published_rubric(n: int):
    payload = _strategy_good(n)
    assert R_STRATEGY.score(payload).total == pytest.approx(score_strategy(payload).total)


# ══ 4. « non mesuré » sort du dénominateur ═════════════════════════════════════


def test_an_unmeasurable_axis_leaves_every_other_axis_untouched():
    """La preuve demandée : on retire le champ qui nourrit UN axe, et le score
    des autres ne bouge pas d'un millième. Sans cette règle, le barème mesurerait
    la complétude de nos sorties au lieu de mesurer le modèle."""
    with_zones = _org_good()
    without_zones = {k: v for k, v in with_zones.items() if k != "uncovered_zones"}

    a = R_ORG.score(with_zones, user_prompt=_org_user_prompt())
    b = R_ORG.score(without_zones, user_prompt=_org_user_prompt())

    assert _axis(a, "zones_relancables").measured is True
    assert _axis(b, "zones_relancables").measured is False
    assert _axis(b, "zones_relancables").reason
    others = {n: v for n, v in a.ratios().items() if n != "zones_relancables"}
    assert b.ratios() == others  # aucun autre axe n'a bougé

    # …et le dénominateur a bien PERDU ce poids au lieu d'y garder un zéro. La
    # preuve : la note qu'on aurait obtenue en laissant l'axe non mesuré peser
    # zéro au dénominateur est STRICTEMENT plus basse.
    measured_weight = sum(x.weight for x in b.measured_axes)
    all_weight = sum(x.weight for x in b.axes)
    naive = 100.0 * sum(x.weight * (x.ratio or 0.0) for x in b.measured_axes) / all_weight
    assert measured_weight < all_weight
    assert b.total is not None and b.total > naive


def test_an_unmeasurable_axis_is_never_scored_zero():
    a = R_FACTS.score(_facts_good())
    siren = _axis(a, "siren_plausible")
    assert siren.ratio is None and siren.reason
    assert "siren_plausible" not in a.ratios()
    assert "siren_plausible" in a.unmeasured_reasons()


def test_under_three_measured_axes_there_is_no_aggregate_at_all():
    """« Sous trois axes, il n'y a pas de score. » Deux mesures ne font pas une
    note : on rend les deux mesures, et on DIT pourquoi il n'y a pas de note."""
    two = RubricResult(prompt="p", axes=[
        measured("a", 1.0, ok=1, total=1, origin="app/eval/metrics.py:1", blind_to="x"),
        measured("b", 1.0, ok=1, total=1, origin="app/eval/metrics.py:1", blind_to="x"),
        unmeasurable("c", 1.0, reason="rien à noter", origin="app/eval/metrics.py:1"),
    ])
    assert two.total is None
    assert "sous 3 axes" in two.reason
    assert two.ratios() == {"a": 1.0, "b": 1.0}

    three = RubricResult(prompt="p", axes=[*two.axes[:2], measured(
        "d", 1.0, ok=1, total=2, origin="app/eval/metrics.py:1", blind_to="x")])
    assert three.total == pytest.approx(83.33, abs=0.01)
    assert three.reason == ""


def test_an_axis_refuses_to_exist_without_a_reason_or_an_origin():
    """La garde de la garde : on ne PEUT pas écrire un axe muet."""
    with pytest.raises(ValueError, match="non mesuré sans raison"):
        Axis(name="x", weight=1.0, ratio=None, origin="app/eval/metrics.py:1")
    with pytest.raises(ValueError, match="sans ascendance"):
        Axis(name="x", weight=1.0, ratio=1.0, origin="")
    with pytest.raises(ValueError, match="dénominateur nul"):
        measured("x", 1.0, ok=0, total=0, origin="app/eval/metrics.py:1")


def test_an_unreadable_input_prompt_makes_the_name_axes_unmeasurable_not_zero():
    """L'entrée est illisible ⇒ « inventé » et « fourni » ne se distinguent pas.
    On le DIT ; on ne conclut pas que tout est inventé."""
    r = R_CONTACTS.score(_contacts_good(), user_prompt="pas de bloc CONTACTS BRUTS ici")
    for name in ("noms_conserves", "contacts_tous_traites"):
        assert _axis(r, name).ratio is None
        assert "illisible" in _axis(r, name).reason
    o = R_ORG.score(_org_good(), user_prompt="ni CONTACTS ni rien")
    assert _axis(o, "personnes_reelles").ratio is None


# ══ 5. la garde SAIT DIRE NON sur le code qu'elle protège ══════════════════════


def test_the_relation_whitelist_has_not_drifted_from_the_assembler():
    """L'axe ``relations_retenues`` rejoue trois lignes de l'assembleur. Si le
    dépôt élargit ``_RELATION_TOPIC`` sans toucher ``HIERARCHY_RELATIONS``, le
    barème noterait faux en silence — ce test casse d'abord."""
    from app.services.org_graph_assembler import _RELATION_TOPIC
    from app.services.org_resolver import HIERARCHY_RELATIONS

    assert set(_RELATION_TOPIC) == set(HIERARCHY_RELATIONS)
    assert len(HIERARCHY_RELATIONS) >= 5  # le corpus lu n'est pas vide


def test_the_reading_helpers_really_read_the_shipped_prompt_templates():
    """Garde de source : les deux extracteurs d'entrée sont couplés au gabarit
    des prompts EXPÉDIÉS. On lit les gabarits, on ne les suppose pas."""
    from app.eval.bench.rubrics.reading import input_contacts
    from app.prompts import bellum_contacts, bellum_organigramme

    src_c = inspect.getsource(bellum_contacts.build_user_prompt)
    src_o = inspect.getsource(bellum_organigramme.build_user_prompt)
    assert len(src_c) > 500 and len(src_o) > 500
    assert "===== CONTACTS BRUTS =====" in src_c
    assert "CONTACTS: {contacts}" in src_o

    payload = json.dumps([{"fullName": "Claire Dupont"}])
    assert input_contacts(bellum_contacts.build_user_prompt(
        "Doctolib", payload, "[]", "", "")) == [{"fullName": "Claire Dupont"}]
    assert input_contacts(bellum_organigramme.build_user_prompt(
        "Doctolib", payload, "[]", "", "")) == [{"fullName": "Claire Dupont"}]
    # …et une entrée qui n'est pas là rend None, jamais [].
    assert input_contacts("rien du tout") is None


# ══ 6. le banc : la colonne qualité tombe enfin sur les prompts qui comptent ════


def test_the_bench_now_scores_the_prompts_that_matter():
    rows = [
        _record("bellum_organigramme", _org_good(), user=_org_user_prompt()),
        _record("bellum_contacts_batch_1_of_2", _contacts_good(), user=_contacts_user_prompt()),
        _record("bellum_signals", _signals_good()),
        _record("bellum_facts", _facts_good()),
    ]
    col = CMP.compare_arms(rows, ["A"]).columns[0]
    assert col.quality_scored == 4
    assert col.quality_mean is not None and col.quality_mean > 50
    assert set(col.quality_by_prompt) == {
        "bellum_organigramme", "bellum_contacts_batch_1_of_2", "bellum_signals", "bellum_facts",
    }
    assert "personnes_reelles" in col.quality_axes
    assert "decideurs_identifies" in col.quality_axes
    assert "siren_plausible" in col.quality_axes_unmeasured


def test_the_bench_says_a_model_is_WORSE_on_the_organigramme_not_just_cheaper():
    """Le point de départ du lot : « meilleur ou moins bien », pas seulement
    « moins cher ». Deux bras, la même entrée, deux organigrammes."""
    user = _org_user_prompt()
    rid = CORPUS.compute_record_id(prompt_name="bellum_organigramme", system="SYS", user=user,
                                   response_model="dict", max_tokens=10)
    faulty = _org_good()
    faulty["org_chart"] = [{"entity": "Groupe", "level": "groupe",
                            "contacts": ["Claire Dupont", "Fantôme Inventé"]}]
    faulty["hierarchy_relations"] = [
        {"from_name": "Claire Dupont", "to_name": "Groupe", "type": "member_of", "evidence": ""}]

    rows = []
    for arm, output, cost in (("A", _org_good(), 0.20), ("B", faulty, 0.02)):
        rec = _record("bellum_organigramme", output, user=user)
        rec.arm, rec.record_id, rec.cost_usd = arm, rid, cost
        rows.append(rec)

    c = CMP.compare_arms(rows, ["A", "B"])
    a, b = c.columns
    assert b.cost_usd_total < a.cost_usd_total                     # B est 10× moins cher…
    assert b.quality_by_prompt["bellum_organigramme"] < a.quality_by_prompt["bellum_organigramme"]
    assert b.quality_axes["personnes_reelles"] < a.quality_axes["personnes_reelles"]
    assert b.quality_axes["relations_retenues"] == 0.0             # …et il invente


def test_a_failed_call_is_still_unmeasured_never_a_zero():
    rec = _record("bellum_organigramme", _org_good())
    rec.status = CORPUS.STATUS_SCHEMA_ERROR
    q = QUALITY.score_call(rec)
    assert q.measured is False and q.total is None and "échec" in q.reason


def test_a_prompt_without_a_rubric_is_still_named_not_zero():
    """⚠️ L'exemple était ``bellum_plan`` jusqu'au 29/08 ; il a désormais un
    barème. ``bellum_chat`` est le refus EXPLICITE du registre
    (``rubrics.NOT_RUBRICABLE``) : du texte libre au bout d'une boucle d'outils,
    dont le chemin de production ne passe même pas par la passerelle enregistrée."""
    q = QUALITY.score_call(_record("bellum_chat", {"text": "Voici trois pistes…"}))
    assert q.measured is False and q.total is None
    assert "aucune grille déterministe" in q.reason


def test_the_quality_score_is_never_naked():
    q = QUALITY.score_call(_record("bellum_facts", _facts_good()))
    assert q.measured is True and q.total is not None
    assert len(q.axes) >= MIN_MEASURED_AXES
    assert q.unmeasured_axes  # le SIREN, NOMMÉ
    assert q.caveat and q.prompt == "bellum_facts"


# ══ 7. le juge ne peut faire bouger AUCUN axe ══════════════════════════════════


def test_no_judge_score_can_move_a_single_deterministic_axis():
    """La doctrine de ``rubric.py`` étendue aux axes : deux jeux de notes de juge
    opposés doivent rendre un déterministe byte-identique, axes compris."""
    user = _org_user_prompt()
    rid = CORPUS.compute_record_id(prompt_name="bellum_organigramme", system="SYS", user=user,
                                   response_model="dict", max_tokens=10)
    rows = []
    for arm in ("A", "B"):
        rec = _record("bellum_organigramme", _org_good(), user=user)
        rec.arm, rec.record_id = arm, rid
        rows.append(rec)

    judge = ModelSpec.parse("claude-sonnet-5")
    flattering = [JUDGE.JudgeScore(rid, r.arm, judge.label, 10.0 if r.arm == "B" else 0.0, "", True)
                  for r in rows]
    damning = [JUDGE.JudgeScore(rid, r.arm, judge.label, 0.0 if r.arm == "B" else 10.0, "", True)
               for r in rows]

    a = CMP.compare_arms(rows, ["A", "B"], judge=judge, judge_scores=flattering)
    b = CMP.compare_arms(rows, ["A", "B"], judge=judge, judge_scores=damning)

    assert a.deterministic_dict() == b.deterministic_dict()
    assert json.dumps(a.deterministic_dict(), sort_keys=True) == json.dumps(
        b.deterministic_dict(), sort_keys=True)
    for col_a, col_b in zip(a.columns, b.columns, strict=True):
        assert col_a.quality_axes == col_b.quality_axes
        assert col_a.quality_by_prompt == col_b.quality_by_prompt
    assert a.columns[1].judge_mean != b.columns[1].judge_mean  # le juge, lui, a bien bougé
