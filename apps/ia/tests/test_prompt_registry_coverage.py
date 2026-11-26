"""Aucun prompt de ``app/prompts/`` ne vit sans filet.

Le défaut que ce fichier existe pour interdire, mesuré le 01/09/2026 : sur les
**28** modules ``app/prompts/bellum_*.py``, **21** avaient un golden et une
empreinte. Sept n'avaient rien — ``bellum_cv``, ``bellum_cv_parse``,
``bellum_esn_prefill``, ``bellum_linkedin_posts``, ``bellum_meeting_notes``,
``bellum_need_play``, ``bellum_org_declare``. N'importe qui pouvait les réécrire
sans qu'un seul test tombe.

Pourquoi les gardes existantes ne le voyaient pas : ``test_prompt_golden.py`` et
``test_prompt_fingerprint.py`` partent de ``registry_names()``. Elles vérifient
que **tout ce qui est enregistré** est épinglé — impeccable, mais un prompt
jamais enregistré n'est jamais regardé. Elles gardent le registre, pas le
disque. La garde manquante est celle qui part du **système de fichiers** et
exige que chaque module y entre : c'est ce fichier.

Deux exigences, une par famille de trou :

1. ``TestGoldenCoverage`` — chaque module de prompt est référencé par
   ``registry.py``, et chacune des entrées qu'il porte a son golden ``.txt`` ET
   sa ligne d'empreinte.
2. ``TestModelCoverage`` — chaque module a une clé dans ``PROMPT_MODELS``, ou
   figure dans ``_ALIAS_DE_MODELE`` avec la RAISON écrite de son alias. Une
   liste d'exceptions sans raison se remplit toute seule.

Et la garde prouve qu'elle LIT : ``TestLeCorpus`` échoue si le balayage rend une
liste vide, courte, ou amputée d'un module nommé. Un chemin faux rendrait 0
module et ferait passer tout le reste au vert en ne regardant rien.
"""

from __future__ import annotations

import ast
import json
from pathlib import Path

import pytest

from app.prompts.registry import registry_names
from app.services.model_policy import PROMPT_MODELS

_IA = Path(__file__).resolve().parent.parent
_PROMPTS_DIR = _IA / "app" / "prompts"
_REGISTRY_PATH = _PROMPTS_DIR / "registry.py"
_GOLDEN_DIR = _IA / "tests" / "golden" / "system"
_FINGERPRINT_PATH = _IA / "tests" / "golden" / "prompt_fingerprint.json"

#: Le corpus mesuré au 01/09/2026. Un plancher, pas un plafond : ajouter un
#: prompt est normal, en perdre sept d'un coup veut dire que le balayage lit le
#: mauvais dossier.
_MODULES_ATTENDUS_AU_MINIMUM = 28

#: Quelques modules NOMMÉS que le balayage doit retrouver. Un compte total ne
#: dit pas ce qu'il contient (motif « garde borgne » du dépôt : 20 blocs
#: suffisaient à faire le compte pendant qu'une porte entière était invisible).
_MODULES_TEMOINS = frozenset(
    {
        "bellum_facts",  # pipeline d'analyse, couvert depuis l'origine
        "bellum_cv",  # l'un des sept trous du 01/09/2026
        "bellum_org_declare",  # le septième, que l'audit avait manqué
        "bellum_profiler",  # le trou de PROMPT_MODELS
    }
)

#: Les modules dont le nom de FICHIER n'est pas la clé de ``PROMPT_MODELS``,
#: avec la raison de chacun. Un alias légitime se déclare ici ; sans raison
#: écrite, cette liste devient le trou qu'elle prétend documenter.
#:
#: ⚠️ Ce ne sont PAS des dispenses de golden : les trois modules ci-dessous ont
#: bien leur(s) entrée(s) au registre et leur(s) golden(s). L'alias ne porte que
#: sur le NOM sous lequel le modèle est choisi.
_ALIAS_DE_MODELE: dict[str, tuple[tuple[str, ...], str]] = {
    "bellum_advisor": (
        ("bellum_chat",),
        "Le module porte le prompt SYSTÈME du copilote, mais l'appel est nommé "
        "« bellum_chat » (routers/chat.py:288 et services/chat_orchestrator.py:121). "
        "C'est ce nom-là qui choisit le modèle, et il a son entrée. Lui donner une "
        "seconde clé littérale créerait deux réglages pour un seul appel — "
        "exactement le « un réglage vit à un seul endroit » que le dépôt garde.",
    ),
    "bellum_rfp": (
        ("bellum_rfp_analyse", "bellum_rfp_draft"),
        "Un fichier, deux prompts, deux décisions de modèle : lire un cahier des "
        "charges et rédiger un engagement contractuel n'évoluent pas ensemble. "
        "routers/rfp.py:110 et :140 les appellent séparément.",
    ),
    "bellum_self_consistency": (
        ("self_consistency_plays", "self_consistency_contacts"),
        "Les re-dérivations A1 sont facturées par mesure, pas par fichier : les "
        "plays arbitrent (Sonnet) là où les contacts remplissent un schéma "
        "(Haiku). Une clé par fichier écraserait ce partage.",
    ),
    "bellum_talent_message": (
        ("bellum_outreach",),
        "Le module porte le prompt SYSTÈME du message à un consultant (#4347), mais "
        "routers/talent_message.py nomme l'appel « bellum_outreach » (`_PROMPT_NAME`) : "
        "un message préparé pour un humain, qu'il s'adresse à un contact ou à un "
        "consultant, est le même arbitrage de modèle — et le réglage "
        "`MODEL_BELLUM_OUTREACH` reste à UN seul endroit.",
    ),
    "bellum_mission_extract": (
        ("mission_extract",),
        "Le module porte le prompt système de l'extraction de mission (#2560), "
        "mais services/mission_extraction.py:55 nomme l'appel « mission_extract » "
        "(sans le préfixe bellum_) — c'est ce nom-là que PROMPT_MODELS porte déjà "
        "et que MODEL_MISSION_EXTRACT surchargerait. Une seconde clé littérale "
        "« bellum_mission_extract » créerait deux réglages pour un seul appel.",
    ),
    "bellum_need_compile_text": (
        ("need_compile_text",),
        "Le module porte le prompt système de la compilation d'un besoin depuis "
        "un texte collé (#2939, #2174.3/.5), mais services/need_compile_text.py "
        "nomme l'appel « need_compile_text » (sans le préfixe bellum_) — même "
        "raison que bellum_mission_extract juste au-dessus : c'est ce nom-là que "
        "PROMPT_MODELS porte déjà, une seconde clé littérale "
        "« bellum_need_compile_text » créerait deux réglages pour un seul appel.",
    ),
}


# ── le balayage ──────────────────────────────────────────────────────────────


def _modules_de_prompt() -> list[str]:
    """Tous les modules de prompt présents SUR LE DISQUE.

    C'est le point de départ qui manquait : les gardes existantes partent du
    registre, donc ne peuvent pas voir ce qui n'y est pas.
    """
    return sorted(p.stem for p in _PROMPTS_DIR.glob("bellum_*.py"))


def _modules_references(expr: ast.expr, fonctions: dict[str, ast.FunctionDef]) -> set[str]:
    """Les modules ``bellum_*`` qu'une expression de registre finit par appeler.

    Deux formes dans ``registry.py`` : la référence directe
    (``bellum_facts.build_system_prompt``) et le renderer local
    (``_render_advisor``), qu'il faut suivre jusqu'à son corps.
    """
    if isinstance(expr, ast.Name) and expr.id in fonctions:
        return _modules_dans(fonctions[expr.id], fonctions)
    return _modules_dans(expr, fonctions)


def _modules_dans(noeud: ast.AST, fonctions: dict[str, ast.FunctionDef]) -> set[str]:
    trouves: set[str] = set()
    for sous in ast.walk(noeud):
        if isinstance(sous, ast.Name) and sous.id.startswith("bellum_"):
            trouves.add(sous.id)
    return trouves


def _entrees_par_module() -> dict[str, set[str]]:
    """module de prompt → les noms d'entrées de registre qu'il porte.

    Lecture AST de ``registry.py`` plutôt que du texte : une chaîne
    ``"bellum_cv"`` dans un commentaire ne doit pas passer pour une couverture.
    """
    arbre = ast.parse(_REGISTRY_PATH.read_text(encoding="utf-8"))
    fonctions = {n.name: n for n in ast.walk(arbre) if isinstance(n, ast.FunctionDef)}

    par_module: dict[str, set[str]] = {}
    for noeud in ast.walk(arbre):
        if not isinstance(noeud, ast.Call) or not isinstance(noeud.func, ast.Name):
            continue
        if noeud.func.id not in {"PromptSpec", "RenderedPromptSpec"}:
            continue
        if len(noeud.args) < 3 or not isinstance(noeud.args[0], ast.Constant):
            continue
        nom = noeud.args[0].value
        for module in _modules_references(noeud.args[2], fonctions):
            par_module.setdefault(module, set()).add(nom)
    return par_module


# ── la garde prouve qu'elle lit ──────────────────────────────────────────────


class TestLeCorpus:
    """Si ces tests tombent, c'est le balayage qui est cassé — pas les prompts."""

    def test_le_dossier_des_prompts_existe(self) -> None:
        assert _PROMPTS_DIR.is_dir(), f"chemin mort : {_PROMPTS_DIR}"

    def test_le_balayage_trouve_les_modules(self) -> None:
        modules = _modules_de_prompt()
        assert len(modules) >= _MODULES_ATTENDUS_AU_MINIMUM, (
            f"{len(modules)} module(s) de prompt trouvé(s), au moins "
            f"{_MODULES_ATTENDUS_AU_MINIMUM} attendus. Un chemin faux rend une liste "
            f"vide, et une liste vide fait passer TOUS les autres tests de ce fichier "
            f"au vert en ne regardant rien."
        )

    def test_le_balayage_trouve_les_modules_temoins(self) -> None:
        """Un total ne dit pas ce qu'il contient."""
        manquants = _MODULES_TEMOINS - set(_modules_de_prompt())
        assert not manquants, f"modules témoins introuvables : {sorted(manquants)}"

    def test_la_lecture_du_registre_rend_des_entrees(self) -> None:
        par_module = _entrees_par_module()
        assert len(par_module) >= 21, (
            f"seulement {len(par_module)} module(s) attribué(s) à une entrée de "
            f"registre — l'analyse AST de registry.py ne lit plus rien."
        )

    def test_le_dossier_des_goldens_nest_pas_vide(self) -> None:
        goldens = list(_GOLDEN_DIR.glob("*.txt"))
        assert len(goldens) >= 25, f"{len(goldens)} golden(s) — corpus suspect"

    def test_les_registres_de_modele_ne_sont_pas_vides(self) -> None:
        assert len(PROMPT_MODELS) >= 30
        assert len(registry_names()) >= 25


# ── 1. golden + empreinte, par FICHIER ───────────────────────────────────────


class TestGoldenCoverage:
    def test_chaque_module_est_enregistre(self) -> None:
        """Le trou du 01/09/2026 : sept modules sur le disque, zéro au registre."""
        par_module = _entrees_par_module()
        orphelins = [m for m in _modules_de_prompt() if not par_module.get(m)]
        assert not orphelins, (
            "prompts sans aucune entrée dans registry.py — donc sans golden, sans "
            "empreinte, et réécrivables sans qu'un test tombe :\n  "
            + "\n  ".join(orphelins)
            + "\n\nAjouter un PromptSpec / RenderedPromptSpec dans app/prompts/registry.py, "
            "puis `UPDATE_PROMPT_GOLDEN=1 pytest tests/test_prompt_golden.py "
            "tests/test_prompt_fingerprint.py`."
        )

    def test_chaque_module_a_un_golden_sur_le_disque(self) -> None:
        manquants: list[str] = []
        for module, noms in sorted(_entrees_par_module().items()):
            for nom in sorted(noms):
                if not (_GOLDEN_DIR / f"{nom}.txt").exists():
                    manquants.append(f"{module} → golden/system/{nom}.txt")
        assert not manquants, "goldens manquants :\n  " + "\n  ".join(manquants)

    def test_chaque_module_a_une_empreinte(self) -> None:
        empreintes = json.loads(_FINGERPRINT_PATH.read_text(encoding="utf-8"))
        manquants: list[str] = []
        for module, noms in sorted(_entrees_par_module().items()):
            for nom in sorted(noms):
                if nom not in empreintes:
                    manquants.append(f"{module} → {nom}")
        assert not manquants, (
            "prompts absents de tests/golden/prompt_fingerprint.json :\n  "
            + "\n  ".join(manquants)
        )

    def test_les_entrees_attribuees_existent_bien_au_registre(self) -> None:
        """L'attribution AST doit tomber sur les mêmes noms que le registre vivant."""
        attribues = {nom for noms in _entrees_par_module().values() for nom in noms}
        inconnus = attribues - set(registry_names())
        assert not inconnus, f"noms lus dans le source mais absents du registre : {sorted(inconnus)}"


# ── 2. une décision de modèle, par FICHIER ───────────────────────────────────


class TestModelCoverage:
    def test_chaque_module_a_une_decision_de_modele(self) -> None:
        sans_decision = [
            m
            for m in _modules_de_prompt()
            if m not in PROMPT_MODELS and m not in _ALIAS_DE_MODELE
        ]
        assert not sans_decision, (
            "prompts sans entrée dans PROMPT_MODELS et sans alias déclaré :\n  "
            + "\n  ".join(sans_decision)
            + "\n\nSoit choisir explicitement REASONING (arbitrage) ou EXTRACTION "
            "(remplissage de schéma) dans app/services/model_policy.py, soit — si "
            "l'appel porte un AUTRE nom — le déclarer dans _ALIAS_DE_MODELE avec sa raison."
        )

    @pytest.mark.parametrize("module", sorted(_ALIAS_DE_MODELE))
    def test_chaque_alias_pointe_vers_une_cle_reelle(self, module: str) -> None:
        """Un alias qui désigne une clé inexistante est un trou déguisé en exception."""
        cibles, _raison = _ALIAS_DE_MODELE[module]
        assert cibles, f"{module} : alias déclaré sans cible"
        for cible in cibles:
            assert cible in PROMPT_MODELS, (
                f"{module} est déclaré comme alias de {cible!r}, qui n'existe pas "
                f"dans PROMPT_MODELS."
            )

    @pytest.mark.parametrize("module", sorted(_ALIAS_DE_MODELE))
    def test_chaque_alias_porte_sa_raison(self, module: str) -> None:
        """Une liste d'exceptions sans raison écrite se remplit toute seule."""
        _cibles, raison = _ALIAS_DE_MODELE[module]
        assert len(raison.strip()) >= 80, (
            f"{module} : la raison de l'alias est trop courte pour en être une. "
            f"Écrire POURQUOI l'appel porte un autre nom."
        )

    def test_un_alias_ne_dispense_pas_du_golden(self) -> None:
        """Les trois alias sont des alias de MODÈLE, pas de couverture."""
        par_module = _entrees_par_module()
        for module in _ALIAS_DE_MODELE:
            assert par_module.get(module), (
                f"{module} est déclaré comme alias de modèle mais n'a aucune entrée "
                f"de registre — l'alias ne dispense que du nom, jamais du golden."
            )

    def test_les_modeles_du_registre_sont_reels(self) -> None:
        from app.services.claude_service import CLAUDE_HAIKU_MODEL, CLAUDE_MODEL

        assert set(PROMPT_MODELS.values()) <= {CLAUDE_MODEL, CLAUDE_HAIKU_MODEL}
