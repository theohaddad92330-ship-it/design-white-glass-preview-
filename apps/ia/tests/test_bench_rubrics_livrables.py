"""Les barèmes des cinq prompts de LIVRABLE — et la seule question qui compte :
SAVENT-ILS DIRE NON ?

Les cinq barèmes ajoutés ici (``bellum_plan``, ``bellum_compare``,
``bellum_battlecard``, ``bellum_cv``, ``bellum_need_play``) notent des sorties
qui ne sont pas de la *donnée d'analyse* mais un *livrable* — un plan, une
battle card, un CV réécrit. Le risque y est le même qu'ailleurs, et il porte le
même nom : un barème qui note tout à 100 % passe tous les tests et ne sert à
rien.

Chaque barème a donc ici **deux** sorties : une plausible et bien faite, une
plausible et FAUTIVE (une citation absente du CV source, un concurrent que
personne n'a fourni, une allocation qui ne fait pas 100 %, une phase du plan mal
nommée) — et le test exige que la seconde soit sanctionnée **sur l'AXE qui la
concerne**, pas seulement sur le total.

Les autres gardes tenues ici :

* un axe non mesurable **sort du dénominateur** — et on vérifie que le
  dénominateur RÉTRÉCIT, pas seulement que l'axe est absent ;
* une sortie VIDE ne casse jamais et ne vaut jamais zéro : elle est *non
  mesurable*, avec sa raison ;
* les extracteurs d'entrée lisent les **gabarits EXPÉDIÉS** (``build_user_prompt``
  de chaque prompt), jamais une chaîne recopiée à la main ;
* ``bellum_chat`` et ``bellum_cv_parse`` sont REFUSÉS explicitement, avec leur
  raison écrite en code — et aucun préfixe de barème ne capte un autre prompt.

Zéro réseau, zéro dépense.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.eval.bench import corpus as CORPUS
from app.eval.bench import quality as QUALITY
from app.eval.bench import rubrics as RUBRICS
from app.eval.bench.rubrics import battlecard as R_BC
from app.eval.bench.rubrics import compare as R_CMP
from app.eval.bench.rubrics import cv as R_CV
from app.eval.bench.rubrics import need_play as R_NP
from app.eval.bench.rubrics import plan as R_PLAN
from app.eval.bench.rubrics.axes import MIN_MEASURED_AXES, Axis, RubricResult
from app.prompts import bellum_battlecard, bellum_compare, bellum_cv, bellum_need_play

IA_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = IA_ROOT.parents[1]


# ══ matière de référence ═══════════════════════════════════════════════════════

CV_SOURCE = (
    "Marc Antoine Perrin — Ingénieur logiciel, 9 ans d'expérience.\n"
    "2021-2026 · Banque Populaire — migration du socle de paiement vers Kubernetes, "
    "équipe de 6 personnes, 40 000 transactions par jour.\n"
    "2018-2021 · Assurance Mutuelle — refonte de l'API de souscription en Python, "
    "mise en place des tests de charge.\n"
    "Compétences : Python, Kubernetes, PostgreSQL, Terraform.\n"
)

MISSION = {
    "label": "Industrialisation d'une plateforme de paiement",
    "detail": "Reprise du socle de paiement, conteneurisation, observabilité.",
    "offer": "TMA plateforme",
    "sector": "Banque",
    "zone": "Île-de-France",
}


def _cv_user_prompt(cv_text: str = CV_SOURCE) -> str:
    """Le gabarit EXPÉDIÉ, jamais une chaîne recopiée à la main."""
    return bellum_cv.build_user_prompt(
        {"cv_text": cv_text, "full_name": "Marc Antoine Perrin", "title": "Ingénieur logiciel",
         "stack": ["Python", "Kubernetes"], "sectors": ["Banque"], "references": []},
        MISSION,
    )


def _cv_good() -> dict:
    return {
        "headline": "Ingénieur plateforme de paiement",
        "summary": "Neuf ans sur des socles transactionnels, dont cinq en banque.",
        "highlights": [
            {"title": "Migration du socle de paiement",
             "detail": "A porté le socle vers une orchestration conteneurisée.",
             "proof": "migration du socle de paiement vers Kubernetes"},
            {"title": "Refonte d'API de souscription",
             "detail": "A réécrit l'API de souscription et outillé les tests de charge.",
             "proof": "refonte de l'API de souscription en Python"},
        ],
        "keywords": ["Kubernetes", "paiement", "Python"],
        "gaps": ["Le besoin cite l'observabilité ; le CV ne la prouve pas."],
    }


NEED = {"label": "Migration ERP", "kind": "projet", "detail": "Refonte du socle ERP sur 2 BU.",
        "offer": "TMA", "urgency": "haute"}
ACCOUNT = {
    "company_name": "Doctolib", "sector": "Santé numérique",
    "signals": ["Recrutement de quatre ingénieurs plateforme en juin 2026"],
    "context": "Le groupe a annoncé la refonte de son socle de facturation.",
    "vocabulary": ["socle", "facturation"],
}
ESN_PROFILE = {
    "name": "Stelya", "offers": ["TMA plateforme", "Squad data"],
    "references": ["Refonte du socle de facturation chez un assureur régional"],
    "differentiators": ["Équipes intégrées, jamais de régie sèche"],
    "sectors": ["Banque", "Assurance"],
}
NP_CONTACTS = [
    {"full_name": "Claire Dupont", "role": "DSI", "scope": "Groupe"},
    {"full_name": "Marc Leroy", "role": "Directeur financier", "scope": "Groupe"},
]


def _np_user_prompt(contacts: list[dict] | None = None) -> str:
    return bellum_need_play.build_user_prompt(
        NEED, ACCOUNT, ESN_PROFILE, NP_CONTACTS if contacts is None else contacts
    )


def _np_good() -> dict:
    return {
        "angle": "Le socle de facturation est annoncé ; c'est la fenêtre.",
        "targets": [
            {"name": "Claire Dupont", "role": "DSI", "why": "porte le socle"},
            {"name": "", "role": "Directeur des opérations", "why": "subit la facturation"},
        ],
        "message": "Vous avez annoncé la refonte du socle de facturation…",
        "proofs": [
            {"claim": "Nous avons déjà refondu un socle de facturation",
             "proof": "Refonte du socle de facturation chez un assureur régional"},
            {"claim": "Nous travaillons en équipe intégrée",
             "proof": "Équipes intégrées, jamais de régie sèche"},
        ],
        "missing": ["Aucune référence dans la santé numérique."],
        "next_action": "Message LinkedIn à Claire Dupont sous 48 h.",
    }


BC_COMPETITORS = [{"name": "Capgemini", "role": "TMA socle"}, {"name": "Sopra Steria"}]


def _bc_user_prompt(competitors: list | None = BC_COMPETITORS) -> str:
    return bellum_battlecard.build_user_prompt(
        {"sector": "Santé"},
        [{"full_name": "Claire Dupont", "title": "DSI"}],
        {"companyName": "Stelya", "offers": ["TMA"]},
        "Doctolib",
        competitors,
    )


def _bc_good() -> dict:
    return {
        "company_activity": "Opère la prise de rendez-vous médicale en ligne.",
        "budget_it_estimated": "≈ 40 M€, dérivé des effectifs",
        "your_contact": {"name": "Claire Dupont", "title": "DSI", "background": "Ex-plateforme."},
        "what_to_say": ["Le socle annoncé", "La dette de facturation", "La conformité HDS"],
        "what_NOT_to_say": ["Parler prix d'abord", "Citer un concurrent", "Promettre du delivery"],
        "vs_competitors": [
            {"competitor": "Capgemini", "their_strengths": "Déjà en place",
             "their_weaknesses": "Équipes tournantes", "our_counter_angle": "Équipe stable"},
        ],
        "probable_objection": {
            "objection": "Nous avons déjà un prestataire",
            "real_meaning": "Le changement coûte",
            "response": "On complète, on ne remplace pas",
            "mirror_question": "Qu'est-ce qui vous manque aujourd'hui ?",
        },
        "killer_question": "Qui porte le socle de facturation en interne ?",
    }


CMP_ANALYSES = [
    {"company_name": "Doctolib"}, {"company_name": "Alan"}, {"company_name": "Qonto"},
]


def _cmp_user_prompt(analyses: list[dict] | None = None) -> str:
    return bellum_compare.build_user_prompt(
        CMP_ANALYSES if analyses is None else analyses, {"companyName": "Stelya", "offers": ["TMA"]}
    )


def _cmp_good() -> dict:
    return {
        "comparison": [
            {"company": c, "adjusted_score": 8.0, "strengths": ["a", "b"], "risks": ["r"],
             "estimated_cycle": "3-6 mois", "key_contact": "Claire Dupont",
             "recommendation": rec}
            for c, rec in (("Doctolib", "GO"), ("Alan", "PRUDENT"), ("Qonto", "NO-GO"))
        ],
        "priority_order": ["Doctolib", "Alan", "Qonto"],
        "reasoning": "Doctolib porte le signal le plus chaud.",
        "weekly_time_allocation": {"Doctolib": "50%", "Alan": "30%", "Qonto": "20%"},
        "quick_win": "Doctolib — le socle est annoncé cette semaine.",
    }


def _plan_phase(name: str = "IMMEDIAT", n_actions: int = 3) -> dict:
    return {
        "phase": {
            "name": name, "title": "Ouvrir le compte", "objective": "Un RDV DSI sous 15 jours",
            "actions": [
                {"action_id": f"action_immediate_{i + 1}",
                 "action": "Contacter Claire Dupont sur le socle de facturation",
                 "contact": "Claire Dupont", "channel": "linkedin", "deadline": f"J+{3 * (i + 1)}",
                 "expectedOutcome": "Un échange de 20 minutes", "kpi": "taux de réponse"}
                for i in range(n_actions)
            ],
        }
    }


def _plan_offers(n: int = 3, with_numbers: bool = True) -> dict:
    return {
        "offersToPropose": [
            {"title": f"Offre {i}", "pitch": "Reprendre le socle sans arrêter la production.",
             "targetContact": "Claire Dupont", "painAddressed": "dette du socle",
             "estimatedTJM": "650" if with_numbers else "",
             "estimatedTeamSize": "2" if with_numbers else "",
             "estimatedDuration": "6 mois" if with_numbers else "",
             "estimationHypothesis": "compte > 2 000 salariés, périmètre 2 BU" if with_numbers else "",
             "justifyingSignals": ["Recrutement de quatre ingénieurs plateforme"],
             "differentiator": "Équipe stable"}
            for i in range(n)
        ]
    }


def _plan_evaluation(n_risks: int = 3) -> dict:
    return {
        "evaluation": {
            "scoreBreakdown": [
                {"axis": a, "points": 3, "note": "n"}
                for a in ("fit_offre", "timing", "accessibilite", "concurrence", "capacite")
            ],
            "justification": "Fit fort, accès difficile, achats structurés.",
            "risks": [
                {"risk": f"R{i}", "probability": "moyenne", "impact": "important",
                 "mitigation": "cadrer tôt"} for i in range(n_risks)
            ],
        }
    }


def _axis(result: RubricResult, name: str) -> Axis:
    hit = next((a for a in result.axes if a.name == name), None)
    assert hit is not None, f"axe {name!r} absent de {[a.name for a in result.axes]}"
    return hit


def _all_results() -> list[RubricResult]:
    return [
        R_CV.score(_cv_good(), user_prompt=_cv_user_prompt()),
        R_NP.score(_np_good(), user_prompt=_np_user_prompt()),
        R_BC.score(_bc_good(), user_prompt=_bc_user_prompt()),
        R_CMP.score(_cmp_good(), user_prompt=_cmp_user_prompt()),
        R_PLAN.score({**_plan_phase(), **_plan_offers(), **_plan_evaluation()}),
    ]


# ══ 1. le registre lit quelque chose, et il ne capte pas ce qu'il ne note pas ══


def test_the_registry_covers_the_five_deliverable_prompts():
    for prompt in ("bellum_plan", "bellum_compare", "bellum_battlecard",
                   "bellum_cv", "bellum_need_play"):
        assert RUBRICS.rubric_for(prompt) is not None, prompt
    # Les sections du plan sont nommées ``bellum_plan_<section>`` en production
    # (``model_policy._canonical``) : c'est le PRÉFIXE qui résout.
    for section in ("bellum_plan_offers", "bellum_plan_evaluation",
                    "bellum_plan_action_plan_phase_0", "bellum_plan_quick_wins"):
        assert RUBRICS.rubric_for(section) is R_PLAN.score, section


def test_a_prompt_declared_not_rubricable_is_refused_with_its_reason_in_code():
    """« Dire non » se code, pas se raconte. ``bellum_chat`` et ``bellum_cv_parse``
    sont refusés NOMMÉMENT — le second parce que son nom commence par
    ``bellum_cv`` et serait sinon capté par la grille de la RÉÉCRITURE."""
    assert RUBRICS.rubric_for("bellum_chat") is None
    assert RUBRICS.rubric_for("bellum_cv_parse") is None
    for name in ("bellum_chat", "bellum_cv_parse"):
        assert name in RUBRICS.NOT_RUBRICABLE
        assert len(RUBRICS.NOT_RUBRICABLE[name]) > 60, "un refus sans raison écrite n'est pas un refus"


#: Les captures par préfixe ACCEPTÉES, chacune avec sa raison. Toute autre fait
#: rougir le test ci-dessous.
#:
#: ⚠️ ``bellum_contacts_fallback`` est une capture PRÉEXISTANTE — elle date du
#: barème ``bellum_contacts`` (28/08), pas du lot des livrables. Elle est
#: défendable : la sortie a la même forme (``{contacts: [...]}``) et les quatre
#: axes qui comptent (décideurs, comité, rôle, priorité) s'y appliquent tels
#: quels. Elle est IMPARFAITE sur un point, et il est écrit ici plutôt que
#: découvert : le prompt de repli ne fournit AUCUNE liste de contacts en entrée
#: (il les découvre dans des extraits web), donc ``noms_conserves`` et
#: ``contacts_tous_traites`` y sortent « entrée illisible » — ce qui est vrai
#: mais dit la mauvaise raison. La corriger changerait la façon dont un prompt
#: EXISTANT est noté : c'est une décision produit, pas un effet de bord de ce lot.
PREFIX_CAPTURES_ACCEPTED: dict[str, str] = {
    "bellum_contacts_fallback": "même forme de sortie que bellum_contacts ; capture antérieure "
                                "à ce lot, laissée telle quelle pour ne pas renoter un prompt "
                                "existant sans décision",
}


def test_no_rubric_prefix_silently_captures_another_shipped_prompt():
    """La garde de la résolution par préfixe. ``bellum_cv`` capte
    ``bellum_cv_parse`` : si demain un prompt s'appelle ``bellum_compare_light``,
    ce test rougit AVANT qu'il soit noté avec la mauvaise grille."""
    from app.services.model_policy import PROMPT_MODELS

    assert len(PROMPT_MODELS) > 20, "le corpus lu est vide — la garde ne garde rien"
    captured: list[str] = []
    for name in PROMPT_MODELS:
        if (name in RUBRICS.RUBRICS or name in RUBRICS.NOT_RUBRICABLE
                or name in PREFIX_CAPTURES_ACCEPTED):
            continue
        if RUBRICS.rubric_for(name) is not None:
            captured.append(name)
    assert not captured, (
        f"prompt(s) notés par la grille d'un AUTRE prompt : {captured}. "
        "Les déclarer dans RUBRICS, dans NOT_RUBRICABLE, ou — si la capture est "
        "voulue — dans PREFIX_CAPTURES_ACCEPTED avec sa raison."
    )
    # …et la garde sait dire NON : elle VOIT bien les captures qu'on lui a dites
    # d'accepter (sinon elle passerait au vert sur un corpus vide).
    for name in PREFIX_CAPTURES_ACCEPTED:
        assert name in PROMPT_MODELS, f"{name} n'est plus un prompt expédié — retirer la dérogation"
        assert RUBRICS.rubric_for(name) is not None, f"{name} n'est plus capté — retirer la dérogation"


def test_every_axis_names_a_primitive_that_exists_on_disk():
    """« Un axe sans ascendance est un axe inventé. » Les origines citent aussi
    des fichiers TypeScript (les deux gardes d'API qui retirent une citation
    introuvable) : on les vérifie AUSSI, sinon la moitié du corpus n'est pas lue."""
    seen_py = seen_ts = 0
    for result in _all_results():
        assert result.axes, result.prompt
        for axis in result.axes:
            assert axis.origin, f"{result.prompt}/{axis.name}"
            for token in axis.origin.split():
                token = token.rstrip(",;")
                if token.startswith("app/") and ".py" in token:
                    path_part, _, line_part = token.partition(":")
                    path = IA_ROOT / path_part
                    assert path.exists(), f"{result.prompt}/{axis.name} cite {path_part}, absent"
                    seen_py += 1
                    first = line_part.split("-")[0].split(",")[0].strip(" ()")
                    if first.isdigit():
                        n = len(path.read_text(encoding="utf-8").splitlines())
                        assert int(first) <= n, f"{token} dépasse {path_part} ({n} lignes)"
                elif token.startswith("apps/") and ".ts" in token:
                    path_part, _, _ = token.partition(":")
                    assert (REPO_ROOT / path_part).exists(), f"{token} absent du dépôt"
                    seen_ts += 1
    assert seen_py >= 20, "corpus d'ascendances Python trop maigre"
    assert seen_ts >= 4, "les gardes TypeScript ne sont pas lues — l'ascendance est décorative"


def test_every_measured_axis_says_what_it_cannot_see():
    for result in _all_results():
        for axis in result.measured_axes:
            assert axis.blind_to, f"{result.prompt}/{axis.name} ne dit pas ce qu'il ne voit pas"
        assert result.caveat, result.prompt


def test_every_rubric_scores_a_realistic_output_above_fifty():
    for result in _all_results():
        assert len(result.measured_axes) >= MIN_MEASURED_AXES, f"{result.prompt}: {result.reason}"
        assert result.total is not None, result.prompt
        assert result.total > 50, f"{result.prompt} note trop bas une sortie correcte ({result.total})"
        assert len({a.name for a in result.axes}) == len(result.axes), result.prompt


# ══ 2. les extracteurs lisent les GABARITS EXPÉDIÉS ════════════════════════════


def test_the_input_readers_really_read_the_shipped_prompt_templates():
    """Garde de source : quatre extracteurs sont couplés au gabarit des prompts
    de production. On LIT les gabarits, on ne les suppose pas."""
    from app.eval.bench.rubrics.reading import (
        input_battlecard_competitors,
        input_compared_companies,
        input_cv_text,
        input_need_play_material,
        input_need_play_people,
    )

    assert input_cv_text(_cv_user_prompt()).strip() == CV_SOURCE.strip()
    assert input_cv_text("aucun bloc CV SOURCE ici") is None

    material = input_need_play_material(_np_user_prompt())
    assert material is not None and "regie seche" in material  # accents retirés
    assert input_need_play_material("rien") is None
    people = input_need_play_people(_np_user_prompt())
    assert people is not None and {p["nom"] for p in people} == {"Claire Dupont", "Marc Leroy"}
    assert input_need_play_people("rien") is None

    comps = input_battlecard_competitors(_bc_user_prompt())
    assert comps is not None and [c["name"] for c in comps] == ["Capgemini", "Sopra Steria"]
    # ⚠ La liste VIDE est une information : « aucun concurrent identifié » est un
    # contrat (« renvoie vs_competitors: [] »), pas une lecture ratée.
    assert input_battlecard_competitors(_bc_user_prompt([])) == []
    assert input_battlecard_competitors("rien") is None

    assert input_compared_companies(_cmp_user_prompt()) == ["Doctolib", "Alan", "Qonto"]
    assert input_compared_companies("rien") is None


def test_the_plan_rubric_has_not_drifted_from_the_shipped_constants():
    """L'axe ``axes_du_bareme`` rejoue la grille /25 CANONIQUE et l'axe
    ``phases_nommees`` l'énumération des compartiments. Les deux sont IMPORTÉES,
    pas recopiées — mais si le dépôt en retirait une, le barème noterait faux en
    silence. Ce test casse d'abord."""
    from app.prompts.bellum_plan import ACTION_PLAN_PHASES
    from app.services.account_score import SCORE_AXES, SCORE_MAX

    assert len(ACTION_PLAN_PHASES) == 5 and "IMMEDIAT" in ACTION_PLAN_PHASES
    assert {a for a, _, _ in SCORE_AXES} == {
        "fit_offre", "timing", "accessibilite", "concurrence", "capacite"
    }
    assert SCORE_MAX == 25
    # …et le barème lit bien CES constantes, pas une copie.
    assert R_PLAN.ACTION_PLAN_PHASES is ACTION_PLAN_PHASES
    assert set(R_PLAN._CANONICAL_AXES) == {a for a, _, _ in SCORE_AXES}
    # Le corpus lu n'est pas vide : les énumérations fermées du schéma sont là.
    assert len(R_PLAN.CHANNELS) == 6 and len(R_PLAN.APPROACH_ANGLES) == 7


def test_the_deliverable_rubrics_read_no_environment_variable():
    """Un barème qui dépend d'un réglage d'environnement rendrait deux mesures
    incomparables selon la machine. Aucun des cinq n'en lit — et on le VÉRIFIE
    dans la source, pas dans une intention."""
    modules = [R_BC, R_CMP, R_CV, R_NP, R_PLAN]
    sources = "\n".join(Path(m.__file__).read_text(encoding="utf-8") for m in modules)
    assert len(sources) > 20_000, "le corpus lu est vide — la garde ne garde rien"
    for forbidden in ("os.environ", "os.getenv", "getenv("):
        assert forbidden not in sources, f"un barème lit {forbidden}"


# ══ 3. chaque barème SANCTIONNE une sortie fautive ═════════════════════════════


def test_cv_sanctions_a_citation_that_is_not_in_the_source_cv():
    """La faute la plus grave du produit : une expérience ajoutée à un CV réel.
    ``cv-rewrite-guard.ts`` la RETIRE ; ici, elle met l'axe à ZÉRO."""
    bad = _cv_good()
    bad["highlights"] = [
        bad["highlights"][0],
        {"title": "Certification AWS", "detail": "Certifié architecte.",
         "proof": "certification AWS Solutions Architect obtenue en 2024"},
    ]
    r_bad = R_CV.score(bad, user_prompt=_cv_user_prompt())
    r_good = R_CV.score(_cv_good(), user_prompt=_cv_user_prompt())
    # ÉLIMINATOIRE : en part, une invention parmi deux aurait valu 0,5 — le banc
    # aurait dit qu'un modèle qui gonfle un CV est « à moitié bon ».
    assert _axis(r_bad, "preuves_ancrees").ratio == 0.0
    assert _axis(r_good, "preuves_ancrees").ratio == 1.0
    assert _axis(r_bad, "preuves_ancrees").data["eliminatory"] is True
    assert r_bad.total is not None and r_good.total is not None
    assert r_bad.total < r_good.total


def test_cv_separates_an_unverifiable_quote_from_a_fabricated_one():
    """La frontière du dépôt : ce qui FABRIQUE est éliminatoire, ce qui MANQUE
    reste une part. Une citation trop courte est présente dans le CV — elle ne
    prouve simplement pas grand-chose."""
    short = _cv_good()
    short["highlights"] = [{"title": "Python", "detail": "d", "proof": "Python"},
                           short["highlights"][0]]
    r = R_CV.score(short, user_prompt=_cv_user_prompt())
    assert _axis(r, "preuves_ancrees").ratio == 1.0        # rien n'a été inventé
    assert _axis(r, "preuves_discriminantes").ratio == 0.5  # …mais une preuve ne prouve rien
    assert not _axis(r, "preuves_discriminantes").data.get("eliminatory")


def test_cv_on_an_unreadable_input_says_so_instead_of_accusing():
    """Sans le CV source, « inventé » et « cité » ne se distinguent pas. On le
    DIT ; on ne conclut pas que tout est inventé."""
    r = R_CV.score(_cv_good(), user_prompt="pas de bloc CV SOURCE")
    for name in ("preuves_ancrees", "mots_cles_couverts"):
        assert _axis(r, name).ratio is None
        assert "illisible" in _axis(r, name).reason


def test_need_play_sanctions_a_person_nobody_gave_it():
    """Règle 2 de ``need-play-guard.ts`` : un nom absent du dossier est un
    contact fantôme que le commercial chercherait sur LinkedIn."""
    bad = _np_good()
    bad["targets"] = [{"name": "Jean Inexistant", "role": "CTO", "why": "porte le sujet"}]
    r_bad = R_NP.score(bad, user_prompt=_np_user_prompt())
    r_good = R_NP.score(_np_good(), user_prompt=_np_user_prompt())
    assert _axis(r_bad, "personnes_reelles").ratio == 0.0
    assert _axis(r_bad, "personnes_reelles").data["invented"] == ["JEAN INEXISTANT"]
    assert _axis(r_good, "personnes_reelles").ratio == 1.0
    assert r_bad.total < r_good.total


def test_need_play_sanctions_a_proof_that_is_nowhere_in_the_material():
    bad = _np_good()
    bad["proofs"] = [
        _np_good()["proofs"][0],
        {"claim": "Nous sommes certifiés HDS", "proof": "certification HDS obtenue en 2025"},
    ]
    r_bad = R_NP.score(bad, user_prompt=_np_user_prompt())
    assert _axis(r_bad, "preuves_ancrees").ratio == 0.0
    assert R_NP.score(_np_good(), user_prompt=_np_user_prompt()).total > r_bad.total


def test_need_play_names_the_axis_unmeasurable_when_nothing_names_a_person():
    """Un plan qui ne nomme personne n'invente personne : rien à vérifier. C'est
    le motif ``siren_plausible`` — « rien à vérifier » n'est pas « vérifié à zéro »."""
    only_roles = {**_np_good(), "targets": [{"name": "", "role": "DSI", "why": "porte"}]}
    r = R_NP.score(only_roles, user_prompt=_np_user_prompt())
    assert _axis(r, "personnes_reelles").ratio is None
    assert _axis(r, "personnes_reelles").reason
    assert "personnes_reelles" not in r.ratios()


def test_battlecard_sanctions_a_competitor_nobody_provided():
    """« RÈGLE STRICTE : n'invente JAMAIS un concurrent » — la seule règle en
    majuscules du prompt."""
    bad = _bc_good()
    bad["vs_competitors"] = [
        _bc_good()["vs_competitors"][0],
        {"competitor": "Accenture", "their_strengths": "s", "their_weaknesses": "w",
         "our_counter_angle": "c"},
    ]
    r_bad = R_BC.score(bad, user_prompt=_bc_user_prompt())
    r_good = R_BC.score(_bc_good(), user_prompt=_bc_user_prompt())
    assert _axis(r_bad, "concurrents_fournis").ratio == 0.0
    assert "ACCENTURE" in _axis(r_bad, "concurrents_fournis").data["invented"]
    assert _axis(r_good, "concurrents_fournis").ratio == 1.0
    assert r_bad.total < r_good.total


def test_battlecard_an_empty_competitor_block_is_a_contract_not_a_hole():
    """Aucun concurrent fourni ⇒ le contrat est ``vs_competitors: []``. Un modèle
    qui en écrit un quand même a INVENTÉ — et un modèle qui respecte le contrat
    ne doit pas être puni par un axe « contre-angles » sans matière."""
    empty_prompt = _bc_user_prompt([])
    honest = {**_bc_good(), "vs_competitors": []}
    r_honest = R_BC.score(honest, user_prompt=empty_prompt)
    assert _axis(r_honest, "concurrents_fournis").ratio is None  # rien à vérifier
    assert _axis(r_honest, "contre_angles_complets").ratio is None

    invented = {**_bc_good()}
    r_bad = R_BC.score(invented, user_prompt=empty_prompt)
    assert _axis(r_bad, "concurrents_fournis").ratio == 0.0


def test_compare_sanctions_an_allocation_that_does_not_reach_one_hundred():
    """La seule règle ARITHMÉTIQUE d'un prompt du produit : « Le total doit faire
    100% » (bellum_compare.py:35). Elle se vérifie, donc elle se note.

    L'écart se rapporte à la PART MOYENNE d'un compte (100/N), pas à cent : sur
    trois comptes, quinze points manquants valent 0,55 — presque la moitié d'une
    semaine de compte qui n'est allouée à personne. Rapporté à cent, ç'aurait été
    0,85, c'est-à-dire « presque juste » : une garde qui ne sait pas dire non."""
    bad = {**_cmp_good(),
           "weekly_time_allocation": {"Doctolib": "50%", "Alan": "30%", "Qonto": "5%"}}
    r_bad = R_CMP.score(bad, user_prompt=_cmp_user_prompt())
    r_good = R_CMP.score(_cmp_good(), user_prompt=_cmp_user_prompt())
    assert _axis(r_good, "allocation_a_cent").ratio == 1.0
    assert _axis(r_bad, "allocation_a_cent").ratio == round(1 - 15 / (100 / 3), 4)
    assert _axis(r_bad, "allocation_a_cent").data["mean_share_percent"] == 33.33
    assert r_bad.total < r_good.total

    # …et une allocation qui perd un compte ENTIER ne vaut plus rien du tout.
    worse = {**_cmp_good(), "weekly_time_allocation": {"Doctolib": "50%", "Alan": "15%"}}
    assert _axis(R_CMP.score(worse, user_prompt=_cmp_user_prompt()),
                 "allocation_a_cent").ratio == 0.0
    # Un arrondi n'est pas une faute : 99 % reste 1,0.
    rounded = {**_cmp_good(),
               "weekly_time_allocation": {"Doctolib": "50%", "Alan": "30%", "Qonto": "19%"}}
    assert _axis(R_CMP.score(rounded, user_prompt=_cmp_user_prompt()),
                 "allocation_a_cent").ratio == 1.0


def test_compare_sanctions_a_company_that_was_never_compared_and_a_bad_verdict():
    bad = {**_cmp_good()}
    bad["comparison"] = [
        {**_cmp_good()["comparison"][0]},
        {**_cmp_good()["comparison"][1], "company": "Swile", "recommendation": "PEUT-ÊTRE"},
    ]
    r_bad = R_CMP.score(bad, user_prompt=_cmp_user_prompt())
    r_good = R_CMP.score(_cmp_good(), user_prompt=_cmp_user_prompt())
    assert _axis(r_bad, "comptes_fournis").ratio == 0.0
    assert "SWILE" in _axis(r_bad, "comptes_fournis").data["invented"]
    assert _axis(r_bad, "verdicts_dans_lenumeration").ratio == 0.5
    assert _axis(r_good, "verdicts_dans_lenumeration").ratio == 1.0
    assert _axis(r_bad, "tous_les_comptes_traites").ratio < 1.0
    assert r_bad.total < r_good.total


def test_plan_sanctions_a_phase_that_is_not_one_of_the_five_and_a_free_form_deadline():
    """Les cinq compartiments temporels sont une ÉNUMÉRATION FERMÉE
    (``ACTION_PLAN_PHASES``), et une échéance est relative pour être replanifiable
    (règle 4). Les deux se vérifient sans jugement."""
    bad = _plan_phase(name="PLUS TARD")
    bad["phase"]["actions"][0]["deadline"] = "avant l'été"
    bad["phase"]["actions"][1]["channel"] = "pigeon voyageur"
    r_bad = R_PLAN.score(bad)
    r_good = R_PLAN.score(_plan_phase())
    assert _axis(r_bad, "phases_nommees").ratio == 0.0
    assert _axis(r_good, "phases_nommees").ratio == 1.0
    assert _axis(r_bad, "actions_datees").ratio == round(2 / 3, 4)
    assert _axis(r_bad, "actions_avec_canal").ratio == round(2 / 3, 4)
    assert r_bad.total < r_good.total


def test_plan_sanctions_an_evaluation_that_invents_its_own_verdict():
    """« Le total /25 et le verdict sont RECALCULÉS ensuite — ne les mets pas. »
    Le produit recalcule (``account_score.SCORE_AXES``) : un total écrit par le
    modèle est un chiffre qui n'est pas le sien."""
    bad = _plan_evaluation()
    bad["evaluation"]["total"] = 21
    bad["evaluation"]["verdict"] = "GO"
    r_bad, r_good = R_PLAN.score(bad), R_PLAN.score(_plan_evaluation())
    assert _axis(r_good, "verdict_non_invente").ratio == 1.0
    assert _axis(r_bad, "verdict_non_invente").ratio < 1.0
    assert r_bad.total < r_good.total


def test_plan_sanctions_an_evaluation_whose_axes_left_the_canonical_grid():
    bad = _plan_evaluation()
    bad["evaluation"]["scoreBreakdown"] = [
        {"axis": "fit_offre", "points": 4}, {"axis": "sympathie", "points": 9},
    ]
    r = R_PLAN.score(bad)
    assert _axis(r, "axes_du_bareme").ratio == pytest.approx(0.2)  # 1 des 5 axes canoniques
    assert _axis(r, "points_dans_lechelle").ratio == 0.5           # 9 sort de l'échelle /5


def test_plan_sanctions_offers_without_a_single_justifying_signal():
    bad = _plan_offers()
    for offer in bad["offersToPropose"]:
        offer["justifyingSignals"] = []
    r_bad, r_good = R_PLAN.score(bad), R_PLAN.score(_plan_offers())
    assert _axis(r_bad, "offres_sourcees").ratio == 0.0
    assert _axis(r_good, "offres_sourcees").ratio == 1.0
    assert r_bad.total < r_good.total


# ══ 4. « non mesuré » sort du dénominateur — et le dénominateur RÉTRÉCIT ═══════


def test_an_offer_without_a_single_figure_makes_the_hypothesis_axis_unmeasurable():
    """« Rien ne permet d'estimer ? Laisse le champ vide » : une offre sans chiffre
    n'a AUCUNE hypothèse à justifier. La noter zéro mesurerait notre matière, pas
    le modèle. On vérifie que le dénominateur perd bien ce poids."""
    a = R_PLAN.score(_plan_offers(with_numbers=True))
    b = R_PLAN.score(_plan_offers(with_numbers=False))

    assert _axis(a, "estimations_justifiees").measured is True
    assert _axis(b, "estimations_justifiees").measured is False
    assert _axis(b, "estimations_justifiees").reason

    others = {n: v for n, v in a.ratios().items() if n != "estimations_justifiees"}
    assert b.ratios() == others  # aucun autre axe n'a bougé d'un millième

    measured_weight = sum(x.weight for x in b.measured_axes)
    all_weight = sum(x.weight for x in b.axes)
    naive = 100.0 * sum(x.weight * (x.ratio or 0.0) for x in b.measured_axes) / all_weight
    assert measured_weight < all_weight, "le dénominateur n'a pas rétréci"
    assert b.total is not None and b.total > naive


def test_a_battlecard_without_competitors_shrinks_the_denominator_too():
    """Une battle card sans concurrent RESPECTE le contrat. Elle doit donc rester
    notable, et bien notée — deux axes en moins au dénominateur, pas deux zéros."""
    a = R_BC.score(_bc_good(), user_prompt=_bc_user_prompt())
    b = R_BC.score({**_bc_good(), "vs_competitors": []}, user_prompt=_bc_user_prompt([]))
    assert len(b.measured_axes) == len(a.measured_axes) - 2
    assert sum(x.weight for x in b.measured_axes) < sum(x.weight for x in b.axes)
    assert b.total is not None and b.total > 50
    # Le modèle honnête n'est pas puni : à axes égaux, la note ne baisse pas.
    assert b.total == a.total


# ══ 5. une sortie vide ne casse pas, et ne vaut JAMAIS zéro ════════════════════


@pytest.mark.parametrize(
    ("module", "user"),
    [
        (R_CV, _cv_user_prompt()),
        (R_NP, _np_user_prompt()),
        (R_BC, _bc_user_prompt()),
        (R_CMP, _cmp_user_prompt()),
        (R_PLAN, ""),
    ],
)
def test_an_empty_output_is_unmeasurable_or_low_never_a_crash(module, user: str):
    result = module.score({}, user_prompt=user)
    assert result.axes, "un barème sans axe ne dit rien"
    if result.total is None:
        assert result.reason, "pas de total ⇒ la raison est ÉCRITE"
    else:
        assert result.total < 40, f"{result.prompt} note {result.total} une sortie VIDE"
    # …et jamais un ratio de complaisance sur un axe de structure.
    for axis in result.measured_axes:
        assert axis.ratio is not None


@pytest.mark.parametrize("payload", [{"strategy": "s", "justification": "j"}, {}])
def test_the_plan_meta_call_has_no_aggregate_and_says_why(payload: dict):
    """L'appel ``bellum_plan_action_plan_meta`` ne rend que deux champs. Deux
    mesures ne font pas une note : on rend les mesures, on DIT pourquoi il n'y a
    pas de note. C'est la loi ``MIN_MEASURED_AXES``, appliquée honnêtement."""
    result = R_PLAN.score(payload)
    assert result.total is None
    assert "sous 3 axes" in result.reason


# ══ 6. le banc s'en sert vraiment ══════════════════════════════════════════════


def _record(prompt_name: str, output: dict, user: str = "USR") -> CORPUS.CallRecord:
    return CORPUS.CallRecord(
        record_id=CORPUS.compute_record_id(
            prompt_name=prompt_name, system="SYS", user=user, response_model="dict", max_tokens=10
        ),
        corpus="c", case="acme", prompt_name=prompt_name, task="t", system="SYS", user=user,
        response_model="dict", max_tokens=10, max_retries=2, model_requested="m",
        arm="A", model="m", provider="anthropic", output=output, latency_s=1.0, cost_usd=0.01,
    )


def test_the_bench_now_scores_the_deliverable_prompts():
    for prompt_name, output, user in (
        ("bellum_cv", _cv_good(), _cv_user_prompt()),
        ("bellum_need_play", _np_good(), _np_user_prompt()),
        ("bellum_battlecard", _bc_good(), _bc_user_prompt()),
        ("bellum_compare", _cmp_good(), _cmp_user_prompt()),
        ("bellum_plan_offers", _plan_offers(), ""),
        ("bellum_plan_action_plan_phase_0", _plan_phase(), ""),
    ):
        q = QUALITY.score_call(_record(prompt_name, output, user=user))
        assert q.measured is True, f"{prompt_name} : {q.reason}"
        assert q.total is not None and q.total > 50, prompt_name
        assert len(q.axes) >= MIN_MEASURED_AXES, prompt_name
        assert q.caveat, prompt_name


def test_a_chat_record_is_still_named_never_scored():
    q = QUALITY.score_call(_record("bellum_chat", {"text": "Bonjour, voici trois pistes…"}))
    assert q.measured is False and q.total is None
    assert "aucune grille déterministe" in q.reason


def test_the_serialised_result_carries_axes_and_unmeasured_reasons():
    d = R_BC.score({**_bc_good(), "vs_competitors": []},
                   user_prompt=_bc_user_prompt([])).as_dict()
    assert d["prompt"] == "bellum_battlecard"
    assert d["caveat"] and isinstance(d["axes"], list)
    assert any(a["ratio"] is None and a["reason"] for a in d["axes"])
    assert json.dumps(d, ensure_ascii=False)  # sérialisable pour le rapport du banc
