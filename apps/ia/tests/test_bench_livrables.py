"""Le banc des quatre prompts de LIVRABLE — ce qu'il assemble, et ce qu'il refuse.

``app/eval/bench/livrables.py`` existe parce que ``run.py record`` ne peut pas
atteindre ``bellum_cv``, ``bellum_need_play``, ``bellum_battlecard`` et
``bellum_compare`` : le graphe d'analyse ne les appelle pas. Il construit donc
leurs entrées à la main, depuis le corpus déjà enregistré.

Ce qui est gardé ici, et pourquoi chacun a coûté quelque chose une fois :

* **la matière n'est pas la PREMIÈRE capture, c'est la plus FOURNIE.** Le magasin
  contient une capture ``recorded`` de ``bellum_strategy`` de 273 caractères dont
  tous les tableaux sont vides — la sortie vide du chemin ``instructor``. La
  prendre pour matière ferait travailler les quatre prompts sur un dossier sans
  angles, et le banc mesurerait la pauvreté de sa propre entrée ;
* **les quatre entrées sont RELISIBLES par leur propre barème.** C'est la garde
  qui compte : les extracteurs de ``rubrics/reading.py`` sont couplés au gabarit
  des prompts, et un gabarit qui bouge les rendrait ``None`` — l'axe le plus
  important de chaque barème deviendrait « non mesurable » sans que personne le
  voie. On le vérifie sur les prompts CONSTRUITS, pas sur une chaîne recopiée ;
* **une entrée manquante se NOMME.** ``build_material`` ne fabrique jamais un
  dossier de remplacement : il liste ce qui manque ;
* **le plafond du banc est au-dessus de tous les plafonds de production**, sans
  quoi une troncature se lirait comme un défaut de modèle ;
* **une réponse hors enveloppe est un ``schema_error``, jamais un objet vide.**

Zéro réseau, zéro dépense : tout part de ``CallRecord`` fabriqués ici.
"""

from __future__ import annotations

import json

import pytest

from app.eval.bench import livrables as LIV
from app.eval.bench.corpus import ARM_RECORDED, STATUS_ERROR, STATUS_OK, CallRecord
from app.eval.bench.rubrics import reading as READING
from app.eval.bench.rubrics import rubric_for
from app.services import claude_service

# ══ un corpus de laboratoire, de la forme exacte du magasin ═══════════════════


def _record(prompt_name: str, output: dict | None, *, arm: str = ARM_RECORDED, status: str = STATUS_OK) -> CallRecord:
    return CallRecord(
        record_id=f"id-{prompt_name}-{arm}-{len(json.dumps(output or {}))}",
        corpus="golden",
        case="doctolib",
        prompt_name=prompt_name,
        task=prompt_name,
        system="système",
        user="utilisateur",
        response_model="dict",
        max_tokens=12000,
        max_retries=2,
        model_requested="claude-sonnet-5",
        arm=arm,
        model="claude-sonnet-5",
        status=status,
        output=output,
    )


#: Une analyse de laboratoire, mais de la FORME que l'enregistreur écrit
#: (``snake_case``, pas d'alias) — c'est ce que ``build_material`` relit.
FACTS = {
    "business_description": "Plateforme de prise de rendez-vous médicaux en ligne.",
    "sector": "Éditeur de logiciels de santé",
    "priority_score": 5,
    "concrete_activity": "340 000 professionnels de santé, 47 millions de comptes patients.",
    "it_implications_for_esn": "Montée en charge continue et lancements produits rapprochés.",
    "program_names": ["Doctolib Connect", "Doctolib Siilo"],
}
SIGNALS = {
    "recent_signals": [{"signal": "Lancement de trois solutions d'IA", "date": "mai 2025"}],
    "qualified_hypotheses": [
        {
            "hypothesis": "Doctolib industrialise son déploiement d'IA en production",
            "esn_angle": "Accompagnement MLOps : infrastructure, pipeline, observabilité des modèles.",
            "confidence": "confirmee",
        }
    ],
    "competitors": [{"name": "Workday", "scope": "SIRH"}],
}
STRATEGY_RICH = {
    "it_challenges": [{"title": "Industrialisation des modèles", "severity": "high"}],
    "angles": [{"title": "MLOps", "strategy": "Entrer par l'équipe plateforme"}],
}
#: La capture VIDE que le chemin ``instructor`` a réellement produite. Tous les
#: tableaux existent, tous sont vides : elle passe pour une sortie valide.
STRATEGY_EMPTY = {"it_challenges": [], "angles": [], "pains": [], "axes_ecartes": []}

CONTACTS_BATCH = {
    "contacts": [
        {"full_name": "Sébastien Louyot", "title": "Directeur des systèmes d'information",
         "entity": "Direction technique", "role": "decideur"},
        {"full_name": "Bastien Marchand", "title": "Chief of Staff to the CTO",
         "entity": "Technologie et produit", "role": "champion"},
    ]
}


def _corpus() -> list[CallRecord]:
    return [
        _record("bellum_facts", FACTS),
        # L'ordre compte : la VIDE est écrite EN PREMIER, comme dans le magasin.
        _record("bellum_strategy", STRATEGY_EMPTY),
        _record("bellum_strategy", STRATEGY_RICH),
        _record("bellum_signals", SIGNALS),
        _record("bellum_contacts_batch_1_of_2", CONTACTS_BATCH),
        _record("bellum_contacts_batch_2_of_2", CONTACTS_BATCH),
    ]


# ══ la matière ════════════════════════════════════════════════════════════════


def test_la_matiere_prend_la_capture_la_plus_fournie_pas_la_premiere():
    """TÉMOIN du défaut réel : une capture vide écrite avant une capture pleine.

    Prendre la première donnerait un dossier sans défis ni angles, et les quatre
    prompts travailleraient sur du vide sans que le banc s'en aperçoive.
    """
    material = LIV.build_material(_corpus())
    assert material.raw_analysis["it_challenges"], "la capture VIDE a été retenue comme matière"
    assert material.raw_analysis["angles"]


def test_la_matiere_ignore_les_lignes_de_rejeu_et_les_echecs():
    """Seule une ligne de CAPTURE fait matière : un rejeu porte la même entrée, et
    un appel en échec n'a pas de sortie à relire."""
    rows = _corpus() + [
        _record("bellum_facts", {"business_description": "REJEU " * 200}, arm="un-autre-bras"),
        _record("bellum_facts", {"business_description": "ÉCHEC " * 200}, status=STATUS_ERROR),
    ]
    material = LIV.build_material(rows)
    assert "REJEU" not in material.raw_analysis["business_description"]
    assert "ÉCHEC" not in material.raw_analysis["business_description"]


def test_une_matiere_absente_se_NOMME_elle_ne_se_fabrique_pas():
    """Un corpus sans analyse ne produit pas un dossier de remplacement : il
    produit une liste de manques. « Non mesuré » n'est jamais « 0 »."""
    material = LIV.build_material([])
    assert material.missing, "un corpus vide passait sans que rien ne le dise"
    assert any("bellum_facts" in m for m in material.missing)
    assert any("contact" in m for m in material.missing)
    assert material.contacts == []


def test_les_contacts_de_tous_les_lots_sont_repris():
    material = LIV.build_material(_corpus())
    assert len(material.contacts) == 4, "un lot de contacts a été perdu"


# ══ les quatre entrées ════════════════════════════════════════════════════════


def _cases() -> dict[str, LIV.Case]:
    return {c.prompt_name: c for c in LIV.build_cases(LIV.build_material(_corpus()))}


def test_les_quatre_prompts_sont_construits_et_ont_un_bareme():
    cases = _cases()
    assert set(cases) == {"bellum_cv", "bellum_need_play", "bellum_battlecard", "bellum_compare"}
    for name in cases:
        assert rubric_for(name) is not None, f"{name} n'a pas de barème — le banc noterait dans le vide"


@pytest.mark.parametrize(
    ("prompt_name", "extractor"),
    [
        ("bellum_cv", READING.input_cv_text),
        ("bellum_need_play", READING.input_need_play_material),
        ("bellum_need_play", READING.input_need_play_people),
        ("bellum_battlecard", READING.input_battlecard_competitors),
        ("bellum_compare", READING.input_compared_companies),
    ],
)
def test_chaque_entree_est_relisible_par_son_propre_barème(prompt_name, extractor):
    """LA garde de ce module.

    Les extracteurs de ``reading.py`` sont couplés au gabarit des prompts. Si un
    gabarit bouge — un titre de bloc renommé, une ligne déplacée —, l'extracteur
    rend ``None``, l'axe devient « non mesurable avec sa raison », et le banc
    continue de tourner en ne mesurant plus rien d'important. Le silence serait
    poli et faux.
    """
    read = extractor(_cases()[prompt_name].user)
    assert read is not None, f"{extractor.__name__} ne sait plus lire l'entrée de {prompt_name}"
    assert read, f"{extractor.__name__} rend un vide sur l'entrée de {prompt_name}"


def test_les_personnes_du_need_play_portent_une_FONCTION_pas_un_role_de_decision():
    """``role`` désigne deux choses selon le prompt : le rôle de DÉCISION chez
    ``bellum_contacts`` (« champion »), la FONCTION chez ``bellum_need_play``
    (« DSI »). Recopier l'un dans l'autre donnerait des cibles dont la fonction
    serait « champion » — et le modèle n'aurait plus rien pour choisir qui viser."""
    people = READING.input_need_play_people(_cases()["bellum_need_play"].user) or []
    fonctions = {str(p.get("fonction") or "") for p in people}
    assert "champion" not in fonctions
    assert "Directeur des systèmes d'information" in fonctions


def test_le_bloc_concurrence_de_la_battlecard_porte_ceux_de_l_analyse():
    fournis = READING.input_battlecard_competitors(_cases()["bellum_battlecard"].user)
    assert fournis is not None
    assert {c.get("name") for c in fournis} == {"Workday"}


def test_les_plafonds_declares_sont_ceux_des_routeurs():
    """L'identité d'une entrée inclut ``max_tokens`` : s'il n'est pas celui du
    routeur, un rejeu ultérieur enverrait autre chose que la production."""
    caps = {name: c.production_max_tokens for name, c in _cases().items()}
    assert caps == {
        "bellum_cv": 3000,          # app/routers/cv.py:56
        "bellum_need_play": 2500,   # app/routers/need_play.py:55
        "bellum_battlecard": 3000,  # app/routers/battlecard.py:70
        "bellum_compare": 3000,     # app/routers/compare.py:78
    }


def test_le_plafond_du_banc_domine_tous_les_plafonds_de_production():
    """Sinon une troncature du banc se lirait « ce modèle rend une sortie
    incomplète », alors que c'est un réglage — la distinction que
    ``STATUS_TRUNCATED`` existe pour tenir."""
    assert max(c.production_max_tokens for c in _cases().values()) < LIV.BENCH_MAX_TOKENS


def test_les_entrees_ont_des_identites_distinctes():
    ids = [c.record_id for c in _cases().values()]
    assert len(set(ids)) == len(ids)


# ══ l'enveloppe ═══════════════════════════════════════════════════════════════


def test_le_schema_est_l_enveloppe_de_production():
    """Le chemin ``response_model=dict`` emballe la réponse dans ``data``
    (``claude_service._call_dict``). Le banc envoie le MÊME schéma aux deux
    fournisseurs — sans quoi il comparerait deux contrats."""
    assert LIV._TOOL_SCHEMA["required"] == ["data"]
    assert "data" in claude_service.DICT_ENVELOPE_INSTRUCTION


def test_une_reponse_hors_enveloppe_est_un_defaut_pas_un_objet_vide():
    """Une sortie qu'on n'a pas su lire ne vaut pas « 0 » : elle vaut « non
    lue », et l'appelant la classe ``schema_error``."""
    assert LIV._unwrap({"data": {"headline": "x"}})[0] == {"headline": "x"}
    for hors_forme in (None, [], "texte", {"data": "pas un objet"}):
        payload, why = LIV._unwrap(hors_forme)
        assert payload is None
        assert why, "un refus de lecture sans raison écrite"


def test_une_reponse_sans_enveloppe_reste_lisible():
    """Un modèle qui répond directement l'objet demandé n'est pas fautif : c'est
    l'instruction d'enveloppe qui est une commodité, pas le contrat métier."""
    assert LIV._unwrap({"headline": "x"})[0] == {"headline": "x"}


def test_une_enveloppe_SERIALISEE_est_lue_comme_en_production():
    """TÉMOIN d'un défaut réel, et il était dans le LECTEUR, pas dans le modèle.

    Première campagne du banc (29/08/2026) : deux tirages Sonnet sur douze
    comptés ``schema_error`` parce que ``data`` était arrivé en CHAÎNE JSON. La
    production accepte cette forme depuis le 10/08/2026 (le validateur
    ``coerce_serialized_object`` de ``_call_dict``, posé après l'avoir vue sur
    un run RATP). Un banc plus sévère que la production compte des fautes qui
    n'en sont pas — et il les compte du seul côté qui a cette manie, donc il
    fausse la comparaison dans un sens précis.
    """
    serialise = {"data": '{"company_activity": "Plateforme de santé", "killer_question": "?"}'}
    payload, why = LIV._unwrap(serialise)
    assert payload == {"company_activity": "Plateforme de santé", "killer_question": "?"}
    assert why == ""


def test_la_tolerance_s_arrete_ou_commencerait_la_devinette():
    """Une chaîne qui n'est PAS un objet JSON reste un défaut : la primitive du
    dépôt rend la valeur telle quelle, et le banc la refuse avec sa raison."""
    payload, why = LIV._unwrap({"data": "un texte libre, pas du JSON"})
    assert payload is None
    assert "str" in why, "la raison doit NOMMER ce qu'on a reçu"


# ══ le magasin ════════════════════════════════════════════════════════════════


def test_la_ligne_ecrite_porte_l_entree_ET_l_observation():
    case = _cases()["bellum_cv"]
    draw = LIV.Draw(model="claude-sonnet-5", status=STATUS_OK, latency_s=1.5,
                    input_tokens=100, output_tokens=200, cost_usd=0.01, output={"headline": "x"})
    entree = LIV._record(case, draw, arm=LIV.ARM_SONNET, store_entry=True)
    mesure = LIV._record(case, draw, arm=LIV.ARM_LUNA, store_entry=False)
    assert entree.arm == ARM_RECORDED, "sans ligne `recorded`, le corpus n'existe pas"
    assert mesure.arm == LIV.ARM_LUNA
    # Les deux portent la MÊME entrée : c'est ce qui les rend appariables.
    assert entree.record_id == mesure.record_id == case.record_id
    assert entree.system == case.system and entree.user == case.user


# ── L'effort de raisonnement est une CONDITION de mesure, pas un détail ───────
#
# La première campagne a mesuré Luna en `medium` et conclu « parité avec Sonnet
# sur trois prompts sur quatre ». La PRODUCTION vaut `none` :
# `llm_gateway._openai_tools_reasoning_kwargs` joint `reasoning_effort='none'`
# dès qu'il y a des outils. Les deux campagnes ne mesurent donc pas la même
# chose, et les écrire sous le même bras ferait une moyenne de deux modèles de
# fait — le défaut déjà payé sur le bras `recorded`, qui mêlait une capture
# vide aux bonnes.


@pytest.mark.asyncio
async def test_un_effort_non_standard_donne_son_PROPRE_bras(monkeypatch, tmp_path):
    vus: list[str] = []

    async def _faux_openai(case, model, *, timeout, effort="medium"):
        vus.append(effort)
        return LIV.Draw(model=model, status=STATUS_OK, latency_s=0.01, output={"x": 1})

    monkeypatch.setattr(LIV, "draw_openai", _faux_openai)
    cas = LIV.build_cases(LIV.build_material(_corpus()))[:1]
    res = await measure_luna(cas, tmp_path / "s.jsonl", effort="none")

    assert vus == ["none"], "l'effort demandé n'est pas parvenu au tirage"
    assert list(res[cas[0].prompt_name]) == [f"{LIV.ARM_LUNA}-none"], (
        "le bras doit porter l'effort, sinon deux campagnes se mélangent"
    )


@pytest.mark.asyncio
async def test_l_effort_de_la_campagne_d_origine_garde_son_nom_de_bras(monkeypatch, tmp_path):
    async def _faux_openai(case, model, *, timeout, effort="medium"):
        return LIV.Draw(model=model, status=STATUS_OK, latency_s=0.01, output={"x": 1})

    monkeypatch.setattr(LIV, "draw_openai", _faux_openai)
    cas = LIV.build_cases(LIV.build_material(_corpus()))[:1]
    res = await measure_luna(cas, tmp_path / "s.jsonl", effort="medium")

    assert list(res[cas[0].prompt_name]) == [LIV.ARM_LUNA], (
        "renommer le bras `medium` rendrait ILLISIBLE la campagne déjà enregistrée"
    )


async def measure_luna(cases, store, *, effort):
    return await LIV.measure(
        cases, store, draws=1, timeout=1.0, arms=[LIV.ARM_LUNA], effort=effort, write_entry=False
    )
