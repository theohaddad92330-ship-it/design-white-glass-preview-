"""Les quatre prompts RESTÉS sur Sonnet — leurs barèmes, et leur banc.

``bellum_rfp_analyse``, ``bellum_rfp_draft``, ``bellum_scorer`` et
``bellum_linkedin_posts`` n'avaient jamais été mesurés. Ce fichier garde les deux
moitiés livrées le 29/08/2026 : quatre barèmes déterministes
(``app/eval/bench/rubrics/``) et le module qui leur fabrique un corpus
(``app/eval/bench/prompts_restants.py``).

La seule question qui compte pour un barème : **sait-il dire NON ?** Un barème
qui note tout à 100 % passe tous les tests et ne sert à rien. Chacun a donc ici
deux sorties — une plausible et bien faite, une plausible et FAUTIVE — et le test
exige que la seconde soit sanctionnée sur l'AXE qui la concerne, jamais seulement
sur le total.

Les autres gardes tenues ici :

* les **vocabulaires recopiés** (poids, natures, rôles, verdicts, statuts) sont
  confrontés au contrat partagé LU SUR LE DISQUE — un ``z.enum`` qui gagne une
  valeur fait rougir ce fichier avant que le barème note faux en silence ;
* chaque axe **cite son ascendance**, et cette ascendance est un fichier qui
  existe — Python ET TypeScript —, à une ligne qui existe ;
* un axe non mesurable **sort du dénominateur** : les autres axes ne bougent pas
  d'un millième quand on retire ce qui le nourrit ;
* les **entrées construites par le banc sont relisibles par leur propre barème**,
  vérifié sur les gabarits EXPÉDIÉS et non sur des chaînes recopiées ;
* le banc **ne fabrique jamais** une matière absente : il la NOMME ;
* **deux cas du même prompt ne s'écrasent pas** — ``bellum_rfp_draft`` en a deux,
  et c'est le second (l'exigence non couverte) qui porte la faute qui coûte un
  client ;
* le bras Luna **porte son effort** dans son nom.

Zéro réseau, zéro dépense : tout part d'objets fabriqués ici.
"""

from __future__ import annotations

import inspect
import json
import re
from pathlib import Path

import pytest

from app.eval.bench import prompts_restants as PR
from app.eval.bench import rubrics as RUBRICS
from app.eval.bench.corpus import ARM_RECORDED, RESPONSE_MODEL_DICT, STATUS_ERROR, STATUS_OK, CallRecord
from app.eval.bench.rubrics import linkedin_posts as R_POSTS
from app.eval.bench.rubrics import reading as READING
from app.eval.bench.rubrics import rfp_analyse as R_ANALYSE
from app.eval.bench.rubrics import rfp_draft as R_DRAFT
from app.eval.bench.rubrics import scorer as R_SCORER
from app.eval.bench.rubrics.axes import MIN_MEASURED_AXES, Axis, RubricResult
from app.models.outputs.linkedin_posts import LinkedInPostsOutput
from app.models.outputs.scorer import ScoringOutput

IA_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = IA_ROOT.parents[1]
CONTRACT = REPO_ROOT / "packages" / "contracts" / "src" / "schemas" / "rfp.ts"


def _axis(result: RubricResult, name: str) -> Axis:
    hit = next((a for a in result.axes if a.name == name), None)
    assert hit is not None, f"axe {name!r} absent de {[a.name for a in result.axes]}"
    return hit


# ══ le corpus de laboratoire ══════════════════════════════════════════════════


def _record(prompt_name: str, output: dict | None, *, arm: str = ARM_RECORDED,
            status: str = STATUS_OK) -> CallRecord:
    return CallRecord(
        record_id=f"id-{prompt_name}-{arm}-{len(json.dumps(output or {}))}",
        corpus="golden", case="doctolib", prompt_name=prompt_name, task=prompt_name,
        system="système", user="utilisateur", response_model=RESPONSE_MODEL_DICT,
        max_tokens=12000, max_retries=2, model_requested="claude-sonnet-5",
        arm=arm, model="claude-sonnet-5", status=status, output=output,
    )


FACTS = {
    "business_description": "Plateforme de prise de rendez-vous médicaux en ligne.",
    "sector": "Éditeur de logiciels de santé",
    "concrete_activity": "340 000 professionnels de santé, 47 millions de comptes patients.",
    "it_implications_for_esn": "Montée en charge continue et lancements produits rapprochés.",
}
SIGNALS = {
    "recent_signals": [
        {"signal": "Lancement de trois solutions d'apprentissage automatique", "date": "mai 2026"},
        {"signal": "Ouverture d'un site à Nantes", "date": "février 2026"},
    ],
    "qualified_hypotheses": [{"hypothesis": "Industrialise son déploiement de modèles"}],
}
STRATEGY_RICH = {
    "it_challenges": [{"title": "Industrialisation des modèles", "severity": "high"}],
    "angles": [{"title": "Exploitation", "strategy": "Entrer par l'équipe plateforme"}],
}
#: La capture VIDE que le chemin ``instructor`` a réellement produite (273
#: caractères, tous les tableaux présents et vides). Elle passe pour une sortie
#: valide, et c'est bien le problème.
STRATEGY_EMPTY = {"it_challenges": [], "angles": [], "pains": []}


def _corpus() -> list[CallRecord]:
    return [
        _record("bellum_facts", FACTS),
        # L'ordre compte : la VIDE est écrite EN PREMIER, comme dans le magasin.
        _record("bellum_strategy", STRATEGY_EMPTY),
        _record("bellum_strategy", STRATEGY_RICH),
        _record("bellum_signals", SIGNALS),
    ]


def _plan(rows: list[CallRecord] | None = None) -> PR.Plan:
    return PR.build_plan(PR.build_material(_corpus() if rows is None else rows))


def _cases(rows: list[CallRecord] | None = None) -> dict[str, PR.Case]:
    return {c.key: c for c in _plan(rows).cases}


def _case(prompt_name: str, case: str) -> PR.Case:
    return _cases()[f"{prompt_name} · {case}"]


# ══ 1. le registre lit quelque chose, et ne note rien avec la grille d'un autre ══


def test_les_quatre_prompts_restes_sur_sonnet_ont_desormais_un_bareme():
    """Le point de départ du lot : quatre prompts du chemin payant que le banc ne
    savait pas noter. On vérifie la COUVERTURE, pas un compte de barèmes — compter
    ferait rougir ce test au prochain ajout légitime."""
    from app.services.model_policy import PROMPT_MODELS

    attendus = {
        "bellum_rfp_analyse": R_ANALYSE.score,
        "bellum_rfp_draft": R_DRAFT.score,
        "bellum_scorer": R_SCORER.score,
        "bellum_linkedin_posts": R_POSTS.score,
    }
    for name, fn in attendus.items():
        # …et ils sont bien EXPÉDIÉS : une grille pour un prompt qui n'existe plus
        # ne garde rien (le corpus lu n'est pas vide).
        assert name in PROMPT_MODELS, f"{name} n'est plus un prompt du dépôt"
        assert RUBRICS.rubric_for(name) is fn, name


def _ts_enum(source: str, name: str) -> list[str]:
    """Les valeurs d'un ``z.enum`` du contrat partagé, lues dans le fichier."""
    marker = f"export const {name} = z.enum("
    start = source.find(marker)
    if start < 0:
        return []
    end = source.find("])", start)
    if end < 0:
        return []
    body = source[start + len(marker):end]
    # Les commentaires (docblocks de chaque valeur) portent des apostrophes
    # (« l'exigence ») qui se liraient comme des valeurs : on les retire d'abord.
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    body = re.sub(r"//[^\n]*", "", body)
    return re.findall(r"'([^']+)'", body)


def test_les_vocabulaires_recopies_ne_divergent_pas_du_contrat_partage():
    """LA garde de ces deux barèmes.

    ``rfp_analyse`` et ``rfp_draft`` recopient quatre énumérations de
    ``packages/contracts/src/schemas/rfp.ts``. Une valeur ajoutée là-bas et pas
    ici ferait compter « hors vocabulaire » une sortie parfaitement conforme — et
    le banc dirait qu'un modèle a régressé alors que c'est le contrat qui a
    bougé. On LIT le fichier, on ne le suppose pas.
    """
    assert CONTRACT.exists(), CONTRACT
    source = CONTRACT.read_text(encoding="utf-8")

    lus = {
        "rfpRequirementWeightSchema": _ts_enum(source, "rfpRequirementWeightSchema"),
        "rfpRequirementKindSchema": _ts_enum(source, "rfpRequirementKindSchema"),
        "rfpOwnerRoleSchema": _ts_enum(source, "rfpOwnerRoleSchema"),
        "bidVerdictSchema": _ts_enum(source, "bidVerdictSchema"),
        "rfpAnswerStatusSchema": _ts_enum(source, "rfpAnswerStatusSchema"),
    }
    for name, values in lus.items():
        assert values, f"{name} n'a pas été relu dans {CONTRACT} — la garde ne lit rien"

    assert set(R_ANALYSE.WEIGHTS) == set(lus["rfpRequirementWeightSchema"])
    assert set(R_ANALYSE.KINDS) == set(lus["rfpRequirementKindSchema"])
    assert set(R_ANALYSE.OWNER_ROLES) == set(lus["rfpOwnerRoleSchema"])
    assert set(R_DRAFT.OWNER_ROLES) == set(lus["rfpOwnerRoleSchema"])
    assert set(R_ANALYSE.VERDICTS) == set(lus["bidVerdictSchema"])

    # Les statuts, eux, sont un SOUS-ENSEMBLE volontaire : `reused` et `validated`
    # sont posés par l'espace après coup, jamais par le modèle. Un barème qui les
    # accepterait laisserait passer un `validated` auto-décerné — précisément le
    # feu vert que `computeRfpCompliance` accorde.
    statuts = set(lus["rfpAnswerStatusSchema"])
    assert set(R_DRAFT.STATUSES) < statuts
    # #2957 (#2181.19/.20/.22/.23) — les quatre statuts ajoutés au contrat sont,
    # comme `validated`, posés par un HUMAIN à l'écran (sélecteur de statut),
    # jamais rendus par le modèle de rédaction.
    assert statuts - set(R_DRAFT.STATUSES) == {
        "reused",
        "validated",
        "to_complete",
        "to_validate",
        "blocked",
        "not_applicable",
    }


_PATH_TOKEN = re.compile(
    r"((?:app|apps|packages)/[\w./-]+?\.(?:py|ts))(?::(\d[\d,\-]*))?"
)


def test_chaque_axe_cite_une_primitive_qui_existe_sur_le_disque():
    """« Un axe sans ascendance est un axe inventé. » On vérifie que chaque
    ``origin`` désigne un FICHIER QUI EXISTE, à une LIGNE QUI EXISTE — côté Python
    comme côté TypeScript, parce que la moitié des règles de ces quatre prompts
    vit dans le contrat partagé."""
    vus = 0
    for result in _all_results():
        assert result.axes, result.prompt
        for axis in result.axes:
            assert axis.origin, f"{result.prompt}/{axis.name}"
            for path_part, lines in _PATH_TOKEN.findall(axis.origin):
                base = IA_ROOT if path_part.startswith("app/") else REPO_ROOT
                path = base / path_part
                assert path.exists(), (
                    f"{result.prompt}/{axis.name} cite {path_part}, absent du disque"
                )
                vus += 1
                n_lines = len(path.read_text(encoding="utf-8").splitlines())
                for chunk in lines.split(","):
                    first = chunk.split("-")[0].strip()
                    if first.isdigit():
                        assert int(first) <= n_lines, (
                            f"{path_part}:{first} dépasse le fichier ({n_lines} lignes)"
                        )
    assert vus >= 25, f"le corpus d'ascendances lu est trop maigre pour prouver quoi que ce soit ({vus})"


def test_chaque_axe_mesure_dit_ce_qu_il_ne_voit_pas():
    """La colonne la plus utile dans six mois. Un axe mesuré qui ne dit pas ce
    qu'il ignore laisse croire qu'il voit tout."""
    for result in _all_results():
        assert len(result.measured_axes) >= MIN_MEASURED_AXES, result.prompt
        assert result.total is not None, result.prompt
        assert result.total > 50, f"{result.prompt} note trop bas une sortie correcte ({result.total})"
        assert len({a.name for a in result.axes}) == len(result.axes), result.prompt
        for axis in result.measured_axes:
            assert axis.blind_to, f"{result.prompt}/{axis.name} ne dit pas ce qu'il ne voit pas"
        assert result.caveat, result.prompt


# ══ 2. les sorties de référence ═══════════════════════════════════════════════


def _analyse_good() -> dict:
    """Une analyse plausible et bien faite — chaque exigence est DANS le document."""
    return {
        "title": "Consultation — tierce maintenance applicative et socle de données",
        "issuer": "Donneur d'ordre fictif (démonstration)",
        "dueAt": "2026-09-30",
        "lots": ["Lot 1 — renfort d'exploitation (démo)", "Lot 2 — socle de données (démo)"],
        "requirements": [
            {"section": "Cadre administratif", "weight": "mandatory", "kind": "security",
             "ownerRole": "security", "risk": "Aucune attestation au dossier.",
             "text": "Certification ISO 27001 en cours de validité"},
            {"section": "Références", "weight": "mandatory", "kind": "other",
             "ownerRole": "sales", "risk": None,
             "text": "Deux références de moins de trois ans dans le secteur"},
            {"section": "Moyens humains", "weight": "mandatory", "kind": "team",
             "ownerRole": "hr", "risk": None,
             "text": "Équipe de 4 ETP dont un architecte, mobilisée sur trois ans"},
            {"section": "Cadre contractuel", "weight": "ambiguous", "kind": "contractual",
             "ownerRole": "legal", "risk": "Ni plafond de pénalités ni format de réversibilité.",
             "text": "Pénalités de retard et réversibilité en fin de marché"},
        ],
        "decision": {
            "verdict": "conditional",
            "rationale": "Deux exigences bloquantes ne peuvent pas être couvertes en l'état. "
                         "Le lot 1 reste accessible si la certification est portée par un tiers.",
            "fit": 45,
            "capacity": 60,
            "conditions": ["Porter la certification via un partenaire"],
            "questions": ["La certification doit-elle être détenue en propre ?"],
            "redFlags": ["Certification obligatoire non couverte"],
        },
    }


def _draft_drafted_good() -> dict:
    return {
        "status": "drafted",
        "answer": "Nous présentons deux références de moins de trois ans sur des socles "
                  "d'exploitation comparables.",
        "source": "Socle Kubernetes multi-région pour un opérateur d'énergie.",
        "ownerRole": None,
        "missing": None,
        "contradictions": [],
    }


def _draft_to_produce_good() -> dict:
    return {
        "status": "to_produce",
        "answer": None,
        "source": None,
        "ownerRole": "security",
        "missing": "L'attestation ISO 27001 en cours de validité, ou l'équivalence d'un partenaire.",
        "contradictions": [],
    }


def _scorer_good() -> dict:
    return {
        "global_score": 8.5,
        "criteria": {
            "offer_fit": {"score": 9, "reason": "Le besoin d'exploitation recoupe l'offre socle."},
            "size_compatibility": {"score": 7, "reason": "Compte accessible pour une PME."},
            "geographic_fit": {"score": 8, "reason": "Siège en Île-de-France."},
            "cycle_compatibility": {"score": 8, "reason": "Cycle court sur un renfort."},
            "competition_level": {"score": 7, "reason": "Deux ESN en place, aucune sur ce sujet."},
        },
        "recommendation": "GO",
        "one_line": "Compte prioritaire : besoin d'exploitation ouvert et sujet non couvert.",
        "next_review_date": "Dans 30 jours si pas de signal",
        "score_delta": "+1.2 vs score brut initial",
        "score_delta_reason": "L'offre socle recoupe le besoin détecté.",
    }


def _posts_good() -> dict:
    return {
        "ideas": [
            {"angle": "Ce que j'ai appris en reprenant l'exploitation d'une plateforme.",
             "why_now": "Le sujet revient chez plusieurs comptes ce trimestre.",
             "opening_line": "Reprendre une exploitation, c'est d'abord reprendre une astreinte.",
             "grounded_on": "Socle Kubernetes multi-région pour un opérateur d'énergie."},
            # ⚠️ Un ancrage tiré des SIGNAUX, pas des « differentiators » du profil :
            # ceux-là ne sont PAS injectés dans ce prompt (seuls les offres, les
            # références, les signaux et l'objectif le sont). La première version de
            # cette sortie de référence citait un différenciateur et tombait à 2/3 —
            # le barème avait raison, la fixture avait tort.
            {"angle": "Pourquoi l'industrialisation des modèles bute sur l'exploitation.",
             "why_now": "Le sujet est ouvert chez plusieurs comptes ce trimestre.",
             "opening_line": "Mettre un modèle en production, c'est le début du travail.",
             "grounded_on": "Lancement de trois solutions d'apprentissage automatique"},
            {"angle": "Exploitation et observabilité : le sujet dont personne ne parle.",
             "why_now": "Le marché parle de conception, pas d'exploitation.",
             "opening_line": "L'observabilité n'est pas un tableau de bord.",
             "grounded_on": "Exploitation de plateforme et observabilité"},
        ]
    }


def _all_results() -> list[RubricResult]:
    return [
        R_ANALYSE.score(_analyse_good(),
                        user_prompt=_case("bellum_rfp_analyse", "consultation-demo").user),
        R_DRAFT.score(_draft_drafted_good(),
                      user_prompt=_case("bellum_rfp_draft", "exigence-couverte").user),
        R_SCORER.score(_scorer_good(), user_prompt=_case("bellum_scorer", "doctolib").user),
        R_POSTS.score(_posts_good(), user_prompt=_case("bellum_linkedin_posts", "doctolib").user),
    ]


# ══ 3. chaque barème SANCTIONNE une sortie fautive ════════════════════════════


def test_analyse_sanctionne_une_exigence_qui_n_est_pas_dans_le_document():
    """La faute qui compte sur ce prompt : une exigence que le cahier des charges
    ne porte pas. Elle deviendrait une ligne de la grille, donc un engagement."""
    user = _case("bellum_rfp_analyse", "consultation-demo").user
    bad = _analyse_good()
    bad["requirements"] = [
        *bad["requirements"][:2],
        {"section": "Sécurité", "text": "Hébergement de données de santé certifié HDS",
         "weight": "mandatory", "kind": "security", "ownerRole": "security", "risk": None},
    ]
    r_bad, r_good = R_ANALYSE.score(bad, user_prompt=user), R_ANALYSE.score(_analyse_good(), user_prompt=user)
    assert _axis(r_good, "exigences_citees").ratio == 1.0
    assert _axis(r_bad, "exigences_citees").ratio == pytest.approx(2 / 3, abs=1e-4)
    assert r_bad.total is not None and r_good.total is not None
    assert r_bad.total < r_good.total


def test_analyse_sanctionne_un_vocabulaire_hors_contrat():
    user = _case("bellum_rfp_analyse", "consultation-demo").user
    bad = _analyse_good()
    bad["requirements"] = [
        {**bad["requirements"][0], "weight": "critical", "kind": "juridique", "ownerRole": "Marc Leroy"},
        bad["requirements"][1],
    ]
    r = R_ANALYSE.score(bad, user_prompt=user)
    assert _axis(r, "poids_du_vocabulaire").ratio == 0.5
    assert _axis(r, "natures_et_roles_du_vocabulaire").ratio == 0.5  # 2 champs bons sur 4
    assert _axis(R_ANALYSE.score(_analyse_good(), user_prompt=user), "poids_du_vocabulaire").ratio == 1.0


def test_analyse_sanctionne_un_oui_qui_est_un_oui_si():
    """« Un “oui si” n'est pas un “oui” » — la règle est écrite dans le prompt ET
    dans le contrat. Un `bid` assorti de conditions est un engagement pris sur
    des choses qui ne sont pas encore vraies."""
    user = _case("bellum_rfp_analyse", "consultation-demo").user
    bad = _analyse_good()
    bad["decision"] = {**bad["decision"], "verdict": "bid"}
    r_bad, r_good = R_ANALYSE.score(bad, user_prompt=user), R_ANALYSE.score(_analyse_good(), user_prompt=user)
    assert _axis(r_bad, "un_oui_si_n_est_pas_un_oui").ratio == 0.0
    assert _axis(r_good, "un_oui_si_n_est_pas_un_oui").ratio == 1.0
    assert r_bad.total < r_good.total


def test_analyse_sanctionne_un_fit_hors_bornes_mais_pas_un_fit_absent():
    """La distinction que ce prompt EXIGE : `null` est une réponse juste (« pas
    une valeur médiane rassurante »), 150 n'en est pas une."""
    user = _case("bellum_rfp_analyse", "consultation-demo").user
    hors = _analyse_good()
    hors["decision"] = {**hors["decision"], "fit": 150, "capacity": "élevée"}
    absent = _analyse_good()
    absent["decision"] = {**absent["decision"], "fit": None, "capacity": None}
    assert _axis(R_ANALYSE.score(hors, user_prompt=user), "bornes_de_la_decision").ratio == 0.0
    assert _axis(R_ANALYSE.score(absent, user_prompt=user), "bornes_de_la_decision").ratio == 1.0


def test_analyse_ne_note_la_regle_du_document_coupe_que_sur_un_document_coupe():
    """Une règle CONDITIONNELLE ne se note pas hors de sa condition. Sur un
    document entier, l'axe est NON MESURÉ avec sa raison — jamais zéro."""
    entier = _case("bellum_rfp_analyse", "consultation-demo").user
    coupe = PR.bellum_rfp.build_analysis_user_prompt(
        "X" * 70_000, profile_data=PR.ESN_PROFILE, account_name="Donneur d'ordre fictif"
    )
    assert READING.rfp_document_is_truncated(coupe) is True
    assert READING.rfp_document_is_truncated(entier) is False

    sur_entier = _axis(R_ANALYSE.score(_analyse_good(), user_prompt=entier),
                       "exigence_coupee_reste_ambigue")
    assert sur_entier.ratio is None and "n'est PAS tronqué" in sur_entier.reason

    tout_tranche = {**_analyse_good(), "requirements": [
        {**r, "weight": "mandatory"} for r in _analyse_good()["requirements"]
    ]}
    assert _axis(R_ANALYSE.score(tout_tranche, user_prompt=coupe),
                 "exigence_coupee_reste_ambigue").ratio == 0.0
    assert _axis(R_ANALYSE.score(_analyse_good(), user_prompt=coupe),
                 "exigence_coupee_reste_ambigue").ratio == 1.0


def test_draft_sanctionne_une_source_qu_on_ne_lui_a_pas_donnee():
    """La faute qui coûte un client : une preuve fabriquée dans un document qui
    deviendra contractuel. ÉLIMINATOIRE — en part, un modèle qui invente une
    certification serait noté « presque bon »."""
    user = _case("bellum_rfp_draft", "exigence-non-couverte").user
    bad = {**_draft_drafted_good(),
           "source": "Certificat ISO 27001 délivré en 2025 par un organisme accrédité",
           "answer": "Nous disposons de la certification ISO 27001 en cours de validité."}
    r_bad = R_DRAFT.score(bad, user_prompt=user)
    r_good = R_DRAFT.score(_draft_drafted_good(), user_prompt=user)
    assert _axis(r_bad, "source_reellement_fournie").ratio == 0.0
    assert _axis(r_bad, "source_reellement_fournie").data["eliminatory"] is True
    assert _axis(r_good, "source_reellement_fournie").ratio == 1.0
    assert r_bad.total < r_good.total


def test_draft_sanctionne_une_reponse_redigee_sans_source():
    """C'est le compte que le dépôt appelle `unprovenCommitments` et qui BLOQUE
    l'export (rfp.ts). On le rebranche sur la sortie d'un prompt."""
    user = _case("bellum_rfp_draft", "exigence-couverte").user
    bad = {**_draft_drafted_good(), "source": None}
    r = R_DRAFT.score(bad, user_prompt=user)
    assert _axis(r, "redige_seulement_avec_source").ratio == 0.0
    # …et l'axe éliminatoire ne DOUBLE pas la peine : sans source citée, il n'y a
    # rien à confronter au catalogue, et il le DIT.
    assert _axis(r, "source_reellement_fournie").ratio is None
    assert "aucune source citée" in _axis(r, "source_reellement_fournie").reason


def test_draft_sanctionne_un_texte_ecrit_sous_a_produire():
    """Le modèle déclare lui-même qu'aucune source ne couvre l'exigence, et rédige
    quand même. C'est l'engagement inventé, avec l'aveu à côté."""
    user = _case("bellum_rfp_draft", "exigence-non-couverte").user
    bad = {**_draft_to_produce_good(),
           "answer": "Nos équipes sont certifiées et mobilisables sous 48 heures."}
    r_bad = R_DRAFT.score(bad, user_prompt=user)
    r_good = R_DRAFT.score(_draft_to_produce_good(), user_prompt=user)
    assert _axis(r_bad, "aucun_texte_sous_a_produire").ratio == 0.0
    assert _axis(r_good, "aucun_texte_sous_a_produire").ratio == 1.0
    assert r_bad.total < r_good.total


def test_draft_sanctionne_un_manque_sans_proprietaire_et_un_statut_invente():
    user = _case("bellum_rfp_draft", "exigence-non-couverte").user
    bad = {**_draft_to_produce_good(), "status": "to_produce", "ownerRole": "Camille Roussel",
           "missing": ""}
    r = R_DRAFT.score(bad, user_prompt=user)
    assert _axis(r, "manque_attribue").ratio == 0.0
    assert _axis(r, "formes_du_contrat").ratio == pytest.approx(2 / 3, abs=1e-4)

    invente = {**_draft_to_produce_good(), "status": "validated"}
    assert _axis(R_DRAFT.score(invente, user_prompt=user), "statut_ferme").ratio == 0.0
    assert _axis(R_DRAFT.score(_draft_to_produce_good(), user_prompt=user),
                 "statut_ferme").ratio == 1.0


def test_scorer_sanctionne_un_verdict_plus_optimiste_que_sa_bande():
    """LA faute que ce barème existe pour voir. Le routeur RÉÉCRIT la
    recommandation (app/routers/scorer.py) précisément parce que ce point
    d'entrée émettait un verdict divergent : ici on mesure l'écart avant la
    réécriture."""
    user = _case("bellum_scorer", "doctolib").user
    bad = {**_scorer_good(), "global_score": 4.0}          # bande STOP, dit GO
    prudent = {**_scorer_good(), "global_score": 8.5, "recommendation": "PRUDENT"}
    r_bad, r_good = R_SCORER.score(bad, user_prompt=user), R_SCORER.score(_scorer_good(), user_prompt=user)
    r_prudent = R_SCORER.score(prudent, user_prompt=user)

    assert _axis(r_bad, "verdict_jamais_plus_optimiste").ratio == 0.0
    assert _axis(r_bad, "verdict_jamais_plus_optimiste").data["band"] == "STOP"
    assert _axis(r_good, "verdict_jamais_plus_optimiste").ratio == 1.0
    # …et l'écart dans l'AUTRE sens passe : le prompt ajoute trois conditions à GO
    # que la bande seule ne connaît pas. Sanctionner la prudence punirait un
    # modèle qui obéit.
    assert _axis(r_prudent, "verdict_jamais_plus_optimiste").ratio == 1.0
    assert r_bad.total < r_good.total


def test_scorer_sanctionne_un_score_nu_et_un_vocabulaire_hors_grille():
    user = _case("bellum_scorer", "doctolib").user
    nu = {**_scorer_good(), "criteria": {}, "recommendation": "NO-GO"}
    r_nu, r_good = R_SCORER.score(nu, user_prompt=user), R_SCORER.score(_scorer_good(), user_prompt=user)
    assert _axis(r_nu, "criteres_du_contrat").ratio == 0.0
    assert _axis(r_nu, "verdict_du_vocabulaire").ratio == 0.0
    assert _axis(r_good, "verdict_du_vocabulaire").ratio == 1.0
    # « un axe sans raison n'est pas un axe » : sans critère, l'axe des raisons
    # est NON MESURÉ avec sa raison — pas noté zéro.
    assert _axis(r_nu, "criteres_argumentes").ratio is None
    assert _axis(r_nu, "criteres_argumentes").reason
    assert r_nu.total < r_good.total


def test_scorer_sanctionne_un_critere_sans_raison_et_un_score_hors_bande():
    user = _case("bellum_scorer", "doctolib").user
    bad = {**_scorer_good(), "criteria": {
        "offer_fit": {"score": 9, "reason": ""},
        "size_compatibility": {"score": 42, "reason": "Explication"},
        "geographic_fit": {"score": 8, "reason": "Siège en Île-de-France."},
    }}
    r = R_SCORER.score(bad, user_prompt=user)
    assert _axis(r, "criteres_argumentes").ratio == pytest.approx(2 / 3, abs=1e-4)
    assert _axis(r, "scores_dans_la_bande").ratio == 0.75  # 3 bons sur 4 (3 critères + le global)
    assert _axis(r, "criteres_du_contrat").ratio == 0.6


def test_posts_sanctionne_un_sujet_qui_ne_vient_pas_du_contexte():
    """« Tu n'inventes AUCUN fait. » Le contexte est fermé : un ancrage qu'on n'y
    retrouve pas est un fait ajouté."""
    user = _case("bellum_linkedin_posts", "doctolib").user
    bad = _posts_good()
    bad["ideas"] = [
        *bad["ideas"][:2],
        {**bad["ideas"][2], "grounded_on": "Notre client BNP Paribas nous a confié 12 consultants"},
    ]
    r_bad, r_good = R_POSTS.score(bad, user_prompt=user), R_POSTS.score(_posts_good(), user_prompt=user)
    assert _axis(r_good, "sujets_ancres").ratio == 1.0
    assert _axis(r_bad, "sujets_ancres").ratio == pytest.approx(2 / 3, abs=1e-4)
    assert r_bad.total < r_good.total


def test_posts_sanctionne_un_sujet_que_le_routeur_jetterait_et_un_volume_hors_borne():
    user = _case("bellum_linkedin_posts", "doctolib").user
    bad = {"ideas": [{**_posts_good()["ideas"][0], "grounded_on": ""} for _ in range(6)]}
    r = R_POSTS.score(bad, user_prompt=user)
    assert _axis(r, "ancrages_presents").ratio == 0.0
    assert _axis(r, "volume_dans_la_borne").ratio == 0.0
    assert _axis(R_POSTS.score(_posts_good(), user_prompt=user), "volume_dans_la_borne").ratio == 1.0


def test_posts_sanctionne_une_ouverture_qui_est_deja_le_post():
    """« Tu n'écris PAS le post. » Trois phrases dans `opening_line`, c'est le
    début du post — et ce qui est publié sous le nom d'un commercial doit être
    écrit par lui."""
    user = _case("bellum_linkedin_posts", "doctolib").user
    bad = _posts_good()
    bad["ideas"][0]["opening_line"] = (
        "Reprendre une exploitation, c'est reprendre une astreinte. On l'oublie souvent. "
        "Voici trois choses que j'ai apprises."
    )
    r_bad, r_good = R_POSTS.score(bad, user_prompt=user), R_POSTS.score(_posts_good(), user_prompt=user)
    assert _axis(r_good, "ouverture_en_une_phrase").ratio == 1.0
    assert _axis(r_bad, "ouverture_en_une_phrase").ratio == pytest.approx(2 / 3, abs=1e-4)
    # …et une ouverture qui se termine simplement par un point reste UNE phrase.
    assert R_POSTS._sentence_count("Une seule phrase.") == 1
    assert R_POSTS._sentence_count("Trois points de suspension… et la suite.") == 1


def test_un_contexte_vide_rend_tout_ancrage_inventé_et_ce_n_est_pas_une_erreur_de_lecture():
    """Trois états, pas deux. « AUCUN CONTEXTE FOURNI. » est un CONTRAT : il n'y a
    rien à citer, donc tout `grounded_on` non vide est inventé. Un gabarit
    illisible, lui, rend l'axe NON MESURABLE."""
    vide = PR.bellum_linkedin_posts.build_user_prompt()
    assert READING.input_post_context(vide) == ""
    assert READING.input_post_context("un texte sans la consigne de fermeture") is None

    r_vide = R_POSTS.score(_posts_good(), user_prompt=vide)
    assert _axis(r_vide, "sujets_ancres").ratio == 0.0

    r_illisible = R_POSTS.score(_posts_good(), user_prompt="rien du tout")
    assert _axis(r_illisible, "sujets_ancres").ratio is None
    assert "illisible" in _axis(r_illisible, "sujets_ancres").reason


# ══ 4. « non mesuré » sort du dénominateur ════════════════════════════════════


def test_un_axe_non_mesurable_laisse_tous_les_autres_intacts():
    """La preuve demandée : on retire la matière qui nourrit UN axe, et le score
    des autres ne bouge pas d'un millième. Sans cette règle, le barème mesurerait
    la complétude de nos entrées au lieu de mesurer le modèle."""
    avec = _case("bellum_rfp_draft", "exigence-couverte").user
    sans = "EXIGENCE À TRAITER :\n{}\n\nrien d'autre\n"

    a = R_DRAFT.score(_draft_drafted_good(), user_prompt=avec)
    b = R_DRAFT.score(_draft_drafted_good(), user_prompt=sans)

    assert _axis(a, "source_reellement_fournie").measured is True
    assert _axis(b, "source_reellement_fournie").measured is False
    assert "illisible" in _axis(b, "source_reellement_fournie").reason
    autres = {n: v for n, v in a.ratios().items() if n != "source_reellement_fournie"}
    assert b.ratios() == autres

    # …et le dénominateur a bien PERDU ce poids au lieu d'y garder un zéro.
    poids_mesure = sum(x.weight for x in b.measured_axes)
    poids_total = sum(x.weight for x in b.axes)
    naif = 100.0 * sum(x.weight * (x.ratio or 0.0) for x in b.measured_axes) / poids_total
    assert poids_mesure < poids_total
    assert b.total is not None and b.total > naif


def test_une_sortie_vide_n_a_pas_de_note_du_tout_et_le_dit():
    """« Sous trois axes, il n'y a pas de score. » Une sortie vide ne vaut pas 0 :
    elle vaut « pas notable », avec la liste de ce qui n'a pas pu l'être."""
    r = R_ANALYSE.score({}, user_prompt=_case("bellum_rfp_analyse", "consultation-demo").user)
    assert r.total is None
    assert "sous 3 axes" in r.reason
    assert r.unmeasured_reasons()


# ══ 5. les entrées du banc sont relisibles par leur propre barème ═════════════


@pytest.mark.parametrize(
    ("key", "extracteur"),
    [
        ("bellum_rfp_analyse · consultation-demo", READING.input_rfp_document),
        ("bellum_rfp_draft · exigence-couverte", READING.input_rfp_requirement),
        ("bellum_rfp_draft · exigence-couverte", READING.input_rfp_sources),
        ("bellum_rfp_draft · exigence-non-couverte", READING.input_rfp_sources),
        ("bellum_linkedin_posts · doctolib", READING.input_post_context),
    ],
)
def test_chaque_entree_est_relisible_par_son_propre_bareme(key, extracteur):
    """LA garde de ce module.

    Les extracteurs de ``reading.py`` sont couplés au gabarit des prompts. Si un
    gabarit bouge — un titre de bloc renommé, une ligne déplacée —, l'extracteur
    rend ``None``, l'axe devient « non mesurable avec sa raison », et le banc
    continue de tourner en ne mesurant plus rien d'important. Le silence serait
    poli et faux.
    """
    lu = extracteur(_cases()[key].user)
    assert lu is not None, f"{extracteur.__name__} ne sait plus lire l'entrée de {key}"
    assert lu, f"{extracteur.__name__} rend un vide sur l'entrée de {key}"


def test_les_extracteurs_lisent_les_gabarits_EXPEDIES_pas_des_chaines_recopiees():
    """Garde de source : on lit le corps des ``build_user_prompt`` du dépôt, on ne
    suppose pas ce qu'ils écrivent."""
    src_rfp = inspect.getsource(PR.bellum_rfp.build_analysis_user_prompt)
    src_draft = inspect.getsource(PR.bellum_rfp.build_drafting_user_prompt)
    src_posts = inspect.getsource(PR.bellum_linkedin_posts.build_user_prompt)
    assert len(src_rfp) > 400 and len(src_draft) > 400 and len(src_posts) > 400

    assert "APPEL D'OFFRES :" in src_rfp
    assert "JSON attendu :" in src_rfp
    assert "EXIGENCE À TRAITER :" in src_draft
    assert "SOURCES APPROUVÉES DISPONIBLES :" in src_draft
    assert READING._POST_CONTEXT_END in src_posts
    assert READING._POST_NO_CONTEXT in src_posts
    # Le drapeau de troncature est écrit par l'AUTRE moitié du module.
    assert READING.RFP_TRUNCATION_MARKER in inspect.getsource(PR.bellum_rfp)


def test_une_entree_absente_rend_None_jamais_une_liste_vide():
    """``None`` (illisible) et ``[]`` (aucune source fournie) disent deux choses
    opposées : l'un rend l'axe non mesurable, l'autre le rend fautif."""
    assert READING.input_rfp_document("rien") is None
    assert READING.input_rfp_requirement("rien") is None
    assert READING.input_rfp_sources("rien") is None
    aucune = PR.bellum_rfp.build_drafting_user_prompt(PR.REQUIREMENT_COVERED, approved_sources=[])
    assert READING.input_rfp_sources(aucune) == []


# ══ 6. le module de mesure ════════════════════════════════════════════════════


def test_les_plafonds_declares_sont_ceux_des_routeurs():
    """L'identité d'une entrée inclut ``max_tokens`` : s'il n'est pas celui du
    routeur, un rejeu ultérieur enverrait autre chose que la production. On LIT
    les routeurs."""
    from app.routers import content as ROUTER_CONTENT
    from app.routers import rfp as ROUTER_RFP
    from app.routers import scorer as ROUTER_SCORER

    caps = {c.key: c.production_max_tokens for c in _plan().cases}
    assert caps == {
        "bellum_rfp_analyse · consultation-demo": 8000,
        "bellum_rfp_draft · exigence-couverte": 2000,
        "bellum_rfp_draft · exigence-non-couverte": 2000,
        "bellum_scorer · doctolib": 2000,
        "bellum_linkedin_posts · doctolib": 1500,
    }
    assert "max_tokens=8000" in inspect.getsource(ROUTER_RFP.analyse_rfp)
    assert "max_tokens=2000" in inspect.getsource(ROUTER_RFP.draft_rfp_answer)
    assert "max_tokens=2000" in inspect.getsource(ROUTER_SCORER.recalculate_score)
    assert "max_tokens=1500" in inspect.getsource(ROUTER_CONTENT.post_ideas)


def test_le_plafond_du_banc_domine_tous_les_plafonds_de_production():
    """Sinon une troncature du banc se lirait « ce modèle rend une sortie
    incomplète », alors que c'est un réglage — la distinction que
    ``STATUS_TRUNCATED`` existe pour tenir."""
    assert max(c.production_max_tokens for c in _plan().cases) < PR.BENCH_MAX_TOKENS


def test_le_contrat_de_sortie_est_celui_du_routeur_et_l_enveloppe_suit():
    """Deux formes, parce que la production en a deux. Envoyer l'enveloppe
    ``{"data": …}`` à un prompt qui part sur un modèle Pydantic mesurerait un
    contrat que la production n'utilise pas."""
    cases = _cases()
    for key in ("bellum_rfp_analyse · consultation-demo", "bellum_rfp_draft · exigence-couverte"):
        c = cases[key]
        assert c.is_envelope and c.response_model_name == RESPONSE_MODEL_DICT
        assert c.tool_schema["required"] == ["data"]
        assert c.system_sent.endswith(PR.claude_service.DICT_ENVELOPE_INSTRUCTION)

    scorer = cases["bellum_scorer · doctolib"]
    assert scorer.response_model is ScoringOutput
    assert scorer.response_model_name == "app.models.outputs.scorer:ScoringOutput"
    assert "global_score" in scorer.tool_schema["properties"]
    assert scorer.system_sent == scorer.system  # PAS d'instruction d'enveloppe

    posts = cases["bellum_linkedin_posts · doctolib"]
    assert posts.response_model is LinkedInPostsOutput
    assert "ideas" in posts.tool_schema["properties"]


def test_le_contrat_stocke_est_re_resolvable_par_le_corpus():
    """Le magasin porte ``module:Classe`` ; un rejeu ultérieur doit pouvoir le
    ré-importer — sous la liste blanche de ``corpus.resolve_response_model``, qui
    refuse d'importer ce qu'une DONNÉE nomme hors périmètre."""
    from app.eval.bench.corpus import resolve_response_model

    for c in _plan().cases:
        assert resolve_response_model(c.response_model_name) is c.response_model


def test_deux_cas_du_meme_prompt_ne_s_ecrasent_pas():
    """``bellum_rfp_draft`` a DEUX cas — et c'est le second (l'exigence NON
    couverte) qui porte la faute qui coûte un client. Les ranger sous le nom du
    prompt en perdrait un : mesuré, puis écrasé."""
    cases = _plan().cases
    drafts = [c for c in cases if c.prompt_name == "bellum_rfp_draft"]
    assert len(drafts) == 2
    assert len({c.key for c in cases}) == len(cases)
    assert len({c.record_id for c in cases}) == len(cases)


def test_la_matiere_prend_la_capture_la_plus_fournie_pas_la_premiere():
    """TÉMOIN d'un défaut réel : une capture vide écrite AVANT une capture pleine.

    Prendre la première donnerait un dossier sans défis ni angles, et
    ``bellum_scorer`` travaillerait sur du vide sans que le banc s'en aperçoive.
    """
    material = PR.build_material(_corpus())
    assert material.raw_analysis["it_challenges"], "la capture VIDE a été retenue comme matière"
    assert material.raw_analysis["angles"]
    assert material.has_analysis is True


def test_la_matiere_ignore_les_lignes_de_rejeu_et_les_echecs():
    rows = _corpus() + [
        _record("bellum_facts", {"business_description": "REJEU " * 50}, arm="un-autre-bras"),
        _record("bellum_facts", {"business_description": "ÉCHEC " * 50}, status=STATUS_ERROR),
    ]
    material = PR.build_material(rows)
    assert "REJEU" not in material.raw_analysis["business_description"]
    assert "ÉCHEC" not in material.raw_analysis["business_description"]


def test_sans_corpus_le_scorer_est_SAUTE_avec_sa_raison_jamais_fabrique():
    """``evals-out/`` est gitignoré : sur une machine qui n'a pas payé de capture,
    il n'existe pas. Le banc ne fabrique pas un dossier pour combler le trou — il
    saute le cas et écrit pourquoi."""
    plan = PR.build_plan(PR.build_material([]))
    noms = {c.prompt_name for c in plan.cases}
    assert "bellum_scorer" not in noms
    assert any("bellum_scorer" in k for k in plan.skipped)
    raison = next(v for k, v in plan.skipped.items() if "bellum_scorer" in k)
    assert "raw_analysis" in raison and len(raison) > 80
    # Les trois autres restent mesurables : leur matière est celle du jeu de
    # démonstration, pas celle du corpus.
    assert noms == {"bellum_rfp_analyse", "bellum_rfp_draft", "bellum_linkedin_posts"}
    # …et le bloc « signaux » manquant est NOMMÉ, pas subi en silence.
    assert any("SIGNAUX" in k for k in plan.skipped)


def test_avec_corpus_le_scorer_EST_construit():
    """Contre-épreuve de la garde précédente : si le cas n'était jamais construit,
    « il est sauté » ne prouverait rien."""
    plan = _plan()
    assert "bellum_scorer" in {c.prompt_name for c in plan.cases}
    assert not any("bellum_scorer" in k for k in plan.skipped)
    scorer = _case("bellum_scorer", "doctolib")
    assert "Doctolib" in scorer.user
    assert FACTS["business_description"] in scorer.user


def test_l_appel_d_offres_du_banc_vient_du_jeu_de_demonstration_du_depot():
    """Le dépôt ne porte AUCUN appel d'offres réel, et en fabriquer un ferait
    entrer une donnée inventée dans un corpus de mesure. Celui-ci est recopié de
    l'analyse scriptée de la salle de démonstration — déjà là, déjà assumée
    fictive. On le VÉRIFIE sur le fichier."""
    scripts = REPO_ROOT / "apps" / "api" / "src" / "modules" / "demo" / "demo-scripts.ts"
    assert scripts.exists(), scripts
    source = scripts.read_text(encoding="utf-8")
    exigences = [
        "Certification ISO 27001 en cours de validité",
        "Deux références de moins de trois ans dans le secteur",
        "Équipe de 4 ETP dont un architecte, mobilisée sur trois ans",
        "Stack React / Node.js / PostgreSQL pour la conception et le développement",
        "Pénalités de retard et réversibilité en fin de marché",
    ]
    for exigence in exigences:
        assert exigence in source, f"{exigence!r} n'est plus dans le jeu de démonstration"
        assert exigence in PR.RFP_DOCUMENT, f"{exigence!r} a disparu du document du banc"
    # …et le donneur d'ordre se dit FICTIF, en toutes lettres.
    assert "fictif" in PR.RFP_DOCUMENT.lower()


def test_aucune_source_approuvee_ne_couvre_la_certification():
    """Ce qui rend le second cas de rédaction mesurable : sur cette exigence, la
    seule réponse juste est ``to_produce``. Si une source venait à mentionner la
    certification, le cas ne mesurerait plus rien — et personne ne le verrait."""
    blob = json.dumps(PR.APPROVED_SOURCES, ensure_ascii=False).lower()
    assert PR.APPROVED_SOURCES, "le catalogue lu est vide — la garde ne garde rien"
    for mot in ("27001", "certification", "iso"):
        assert mot not in blob, f"une source approuvée parle de {mot!r} : le cas n'oppose plus rien"
    assert "27001" in PR.REQUIREMENT_UNCOVERED["text"]


# ══ 7. l'enveloppe, et la lecture d'une sortie ════════════════════════════════


def test_une_reponse_hors_enveloppe_est_un_defaut_pas_un_objet_vide():
    c = _case("bellum_rfp_draft", "exigence-couverte")
    assert c.read({"data": {"status": "drafted"}})[0] == {"status": "drafted"}
    for hors_forme in (None, [], "texte", {"data": "pas un objet"}):
        payload, pourquoi = c.read(hors_forme)
        assert payload is None
        assert pourquoi, "un refus de lecture sans raison écrite"


def test_une_reponse_sans_enveloppe_reste_lisible():
    """Un modèle qui répond directement l'objet demandé n'est pas fautif :
    l'instruction d'enveloppe est une commodité, pas le contrat métier."""
    c = _case("bellum_rfp_draft", "exigence-couverte")
    assert c.read({"status": "drafted"})[0] == {"status": "drafted"}


def test_une_enveloppe_SERIALISEE_est_lue_comme_en_production():
    """La production accepte un ``data`` arrivé en CHAÎNE JSON depuis le
    10/08/2026 (``coerce_serialized_object``, posé après l'avoir vu sur un run
    réel). Un banc plus sévère que la production compte des fautes qui n'en sont
    pas — et il les compte du seul côté qui a la manie."""
    c = _case("bellum_rfp_analyse", "consultation-demo")
    payload, pourquoi = c.read({"data": '{"title": "Consultation", "lots": []}'})
    assert payload == {"title": "Consultation", "lots": []}
    assert pourquoi == ""
    # …et la tolérance s'arrête où commencerait la devinette.
    refuse, pourquoi = c.read({"data": "un texte libre, pas du JSON"})
    assert refuse is None and "str" in pourquoi


def test_une_sortie_qui_ne_valide_pas_le_modele_est_un_schema_error():
    """Côté Pydantic, la porte est le modèle lui-même. Un refus est une MESURE
    (la 4ᵉ colonne du banc), pas un incident."""
    c = _case("bellum_scorer", "doctolib")
    # ⚠️ Cette fixture portait `criteria: {}` — le SCORE NU que le banc a vu
    # arriver trois fois sur trois côté Sonnet, et que `ScoringOutput` refuse
    # depuis le 29/08/2026. Un cas « valide » doit donc porter ses axes : sinon
    # le test prouvait que la porte laissait passer ce qu'elle doit arrêter.
    ok, pourquoi = c.read(
        {
            "global_score": 8.5,
            "recommendation": "GO",
            "criteria": {
                "offer_fit": {"score": 9.0, "reason": "Les offres couvrent le besoin cité."},
                "size_compatibility": {"score": 7.0, "reason": "ETI, taille cible."},
                "geographic_fit": {"score": 8.0, "reason": "Même région que les références."},
            },
        }
    )
    assert ok is not None and pourquoi == ""
    assert ok["global_score"] == 8.5
    refuse, pourquoi = c.read({"global_score": "beaucoup"})
    assert refuse is None and "ScoringOutput" in pourquoi


def test_la_sortie_stockee_est_celle_que_l_enregistreur_ecrit():
    """Le barème doit noter ce que le MAGASIN porte : ``model_dump(mode="json")``,
    sans alias — la même forme que ``recorder._serialisable``."""
    c = _case("bellum_linkedin_posts", "doctolib")
    lu, _ = c.read({"ideas": [{"angle": "a", "why_now": "b", "opening_line": "c",
                               "grounded_on": "d"}]})
    assert lu == LinkedInPostsOutput.model_validate(
        {"ideas": [{"angle": "a", "why_now": "b", "opening_line": "c", "grounded_on": "d"}]}
    ).model_dump(mode="json")


# ══ 8. le magasin, et le bras qui porte son effort ════════════════════════════


def test_la_ligne_ecrite_porte_l_entree_ET_l_observation():
    c = _case("bellum_rfp_analyse", "consultation-demo")
    draw = PR.Draw(model=PR.SONNET_MODEL, status=STATUS_OK, latency_s=1.5, input_tokens=100,
                   output_tokens=200, cost_usd=0.01, output={"title": "x"})
    entree = PR._record(c, draw, arm=PR.ARM_SONNET, store_entry=True)
    mesure = PR._record(c, draw, arm=PR.ARM_SONNET, store_entry=False)
    assert entree.arm == ARM_RECORDED, "sans ligne `recorded`, le corpus n'existe pas"
    assert mesure.arm == PR.ARM_SONNET
    # Les deux portent la MÊME entrée : c'est ce qui les rend appariables.
    assert entree.record_id == mesure.record_id == c.record_id
    assert entree.system == c.system and entree.user == c.user
    assert entree.response_model == RESPONSE_MODEL_DICT
    assert entree.max_tokens == 8000  # le plafond de PRODUCTION, pas celui du banc


def test_le_bras_luna_porte_TOUJOURS_son_effort_le_bras_sonnet_jamais():
    """Sans ce suffixe, une campagne ``--effort none`` et une campagne ``medium``
    s'écriraient sous le même bras et la moyenne mélangerait deux modèles de
    fait — le défaut déjà payé sur le bras ``recorded``."""
    for effort in PR.EFFORTS:
        assert PR.arm_label(PR.ARM_LUNA, effort) == f"{PR.ARM_LUNA}-{effort}"
        assert PR.arm_label(PR.ARM_SONNET, effort) == PR.ARM_SONNET
    assert PR.PRODUCTION_EFFORT in PR.EFFORTS
    assert len(PR.EFFORTS) >= 3  # le corpus lu n'est pas vide


async def _measure_luna(cases, store, *, effort):
    return await PR.measure(cases, store, draws=1, timeout=1.0, arms=[PR.ARM_LUNA],
                            effort=effort, write_entry=False)


async def test_l_effort_demande_parvient_au_tirage_et_nomme_le_bras(monkeypatch, tmp_path):
    vus: list[str] = []

    async def _faux_openai(case, model, *, timeout, effort=PR.DEFAULT_EFFORT):
        vus.append(effort)
        return PR.Draw(model=model, status=STATUS_OK, latency_s=0.01, output={"ideas": []})

    monkeypatch.setattr(PR, "draw_openai", _faux_openai)
    cas = [_case("bellum_linkedin_posts", "doctolib")]
    res = await _measure_luna(cas, tmp_path / "s.jsonl", effort="none")

    assert vus == ["none"], "l'effort demandé n'est pas parvenu au tirage"
    assert list(res[cas[0].key]) == [f"{PR.ARM_LUNA}-none"]

    res = await _measure_luna(cas, tmp_path / "s.jsonl", effort="high")
    assert vus == ["none", "high"]
    assert list(res[cas[0].key]) == [f"{PR.ARM_LUNA}-high"]


async def test_les_tirages_sont_ecrits_au_fil_de_l_eau(monkeypatch, tmp_path):
    """Un ``Ctrl-C`` au milieu d'une campagne ne doit pas faire re-payer ce qui a
    déjà abouti : chaque tirage est ajouté et flushé avant le suivant."""
    vues: list[int] = []
    store = tmp_path / "s.jsonl"

    async def _faux_openai(case, model, *, timeout, effort=PR.DEFAULT_EFFORT):
        vues.append(len(store.read_text(encoding="utf-8").splitlines()) if store.exists() else 0)
        return PR.Draw(model=model, status=STATUS_OK, latency_s=0.01, output={"ideas": []})

    monkeypatch.setattr(PR, "draw_openai", _faux_openai)
    await PR.measure([_case("bellum_linkedin_posts", "doctolib")], store, draws=3, timeout=1.0,
                     arms=[PR.ARM_LUNA], effort="none", write_entry=False)
    assert vues == [0, 1, 2], f"les tirages ne sont pas écrits au fil de l'eau ({vues})"
    assert len(store.read_text(encoding="utf-8").splitlines()) == 3


# ══ 9. la CLI ne dépense rien sans qu'on le lui dise ══════════════════════════


def _refuse_tout_appel(monkeypatch) -> None:
    async def _interdit(*_a, **_k):  # pragma: no cover - il ne doit jamais être atteint
        raise AssertionError("un appel PAYANT est parti sans --yes-run-live")

    monkeypatch.setattr(PR, "draw_anthropic", _interdit)
    monkeypatch.setattr(PR, "draw_openai", _interdit)


def test_le_dry_run_construit_tout_et_n_ecrit_rien(monkeypatch, tmp_path, capsys):
    _refuse_tout_appel(monkeypatch)
    store = tmp_path / "absent.jsonl"
    assert PR.main(["--store", str(store), "--dry-run"]) == 0
    assert not store.exists(), "le --dry-run a écrit dans le magasin"
    sortie = capsys.readouterr().out
    assert "bellum_rfp_analyse" in sortie
    # Sans corpus, le module DIT ce qu'il ne peut pas faire.
    assert "SAUTÉ" in sortie and "bellum_scorer" in sortie


def test_sans_yes_run_live_la_cli_refuse_et_ne_depense_rien(monkeypatch, tmp_path):
    _refuse_tout_appel(monkeypatch)
    store = tmp_path / "absent.jsonl"
    assert PR.main(["--store", str(store)]) == 1
    assert not store.exists()


def test_un_filtre_qui_ne_laisse_aucun_cas_refuse_plutot_que_de_mesurer_le_vide(monkeypatch, tmp_path):
    _refuse_tout_appel(monkeypatch)
    assert PR.main(["--store", str(tmp_path / "absent.jsonl"), "--prompt", "bellum_inexistant",
                    "--dry-run"]) == 2


# ── Le profil ESN vit à UN seul endroit (GA-26) ───────────────────────────────
#
# La première version de ce module RECOPIAIT `ESN_PROFILE` depuis `livrables.py`
# — avec une clé de plus (`geoZone`), donc déjà divergent le jour de sa
# naissance. Deux copies d'une entrée de banc, c'est deux campagnes qui ne
# mesurent plus la même chose sans que rien ne le dise.


def test_le_profil_ESN_n_a_qu_UNE_definition_litterale():
    """Un `ESN_PROFILE = {…}` en dur dans les deux modules = deux entrées.

    On compte les définitions LITTÉRALES (un `ast.Dict` sans dépliage `**`) :
    celle de `prompts_restants` doit être une COMPOSITION, pas une copie.
    """
    import ast
    from pathlib import Path

    literaux = []
    for nom in ("livrables.py", "prompts_restants.py"):
        chemin = Path(__file__).parent.parent / "app" / "eval" / "bench" / nom
        arbre = ast.parse(chemin.read_text(encoding="utf-8"))
        for noeud in ast.walk(arbre):
            if (
                isinstance(noeud, ast.AnnAssign)
                and getattr(noeud.target, "id", "") == "ESN_PROFILE"
                and isinstance(noeud.value, ast.Dict)
                and not any(cle is None for cle in noeud.value.keys)  # pas de `**base`
            ):
                literaux.append(nom)

    assert literaux == ["livrables.py"], (
        f"définitions littérales de ESN_PROFILE : {literaux} — il n'en faut qu'une, "
        "dans `livrables.py`, sur laquelle une campagne est déjà enregistrée"
    )


def test_la_seule_cle_ajoutee_est_geoZone_et_la_base_est_INTACTE():
    """Étendre est permis ; MODIFIER une clé de la base ne l'est pas.

    Changer une valeur héritée changerait l'entrée d'une campagne déjà mesurée,
    donc la comparaison qu'elle porte — en silence.
    """
    from app.eval.bench.livrables import ESN_PROFILE as base

    modifiees = [k for k in base if PR.ESN_PROFILE[k] != base[k]]
    assert not modifiees, f"clés de la base MODIFIÉES : {modifiees}"
    assert set(PR.ESN_PROFILE) - set(base) == {"geoZone"}
