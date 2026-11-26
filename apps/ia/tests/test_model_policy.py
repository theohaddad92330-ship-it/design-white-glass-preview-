"""Politique de modèle — aucun appel Claude ne part sur un modèle implicite.

Règle (Louis, 24/07/2026) : **tout appelant fixe son modèle**. Le défaut
silencieux de ``call_claude`` (Sonnet) faisait tourner 10 routeurs entiers —
activity, battlecard, chat, compare, cv, icebreaker, message, scorer, summary,
weekly — sur le modèle le plus cher sans que personne ne l'ait décidé : c'était
un défaut hérité, pas un choix. Un routeur qui ne dit rien coûte 3× le prix d'un
routeur qui a réfléchi.

Deux garde-fous ici :

1. ``test_every_prompt_is_registered`` — chaque ``prompt_name`` appelé dans
   ``app/`` doit avoir une entrée dans ``PROMPT_MODELS``. Ajouter un prompt sans
   choisir son modèle casse la CI.
2. ``test_no_call_site_relies_on_the_implicit_default`` — chaque site d'appel
   passe un ``model=``. On ne peut pas contourner la table en oubliant le kwarg.
"""

from __future__ import annotations

import io
import re
import tokenize
from pathlib import Path

import pytest

from app.services.claude_service import CLAUDE_HAIKU_MODEL, CLAUDE_MODEL
from app.services.model_policy import PROMPT_MODELS, _canonical, model_for

_APP = Path(__file__).resolve().parent.parent / "app"


#: Les portes d'entrée du modèle, TOUTES.
#:
#: ⚠️ La version précédente cherchait ``\bcall_claude(?:_sync)?\s*\(`` : le
#: ``\s*\(`` exige une parenthèse juste après le nom, si bien que
#: ``call_claude_with_citations(`` ne matchait PAS. La garde était donc borgne
#: exactement là où deux appels de production — ``grounding_citations`` et
#: ``grounding_v2`` — partaient sur le défaut Sonnet sans entrée au registre et
#: sans qu'aucun ``model=`` ne soit écrit. Une garde qui protège « aucun appel
#: sur un modèle implicite » et qui ne voit pas un tiers des portes ne protège
#: rien : c'est le motif « garde borgne » du dépôt.
_ENTRY_POINTS: tuple[str, ...] = (
    "call_claude",
    "call_claude_sync",
    "call_claude_with_citations",
)


def _sans_commentaires(src: str) -> str:
    """Le source avec les COMMENTAIRES blanchis, positions préservées.

    ⚠️ Pourquoi c'est nécessaire, mesuré le 01/09/2026 : ce scanner lit du TEXTE
    BRUT, donc il prenait la prose pour du code. ``model_policy.py`` explique
    dans un commentaire que l'ancienne garde cherchait ``call_claude(`` et
    ``call_claude_sync(`` — et ces deux mentions, citées entre doubles accents
    graves, matchaient le motif. Le compteur de parenthèses partait alors de ce
    faux site d'appel et courait sur des centaines de caractères de commentaire
    jusqu'à trouver une parenthèse fermante, avalant au passage tout
    ``prompt_name="…"`` écrit plus bas. Résultat : un nom de prompt fantôme
    (« … ») déclaré manquant dans PROMPT_MODELS, et une CI rouge que rien dans
    le code de prod ne justifiait.

    Le dépôt connaît déjà ce motif — « des listes découpées sans retirer les
    commentaires » est l'une des six gardes borgnes nommées dans CLAUDE.md.

    On blanchit les commentaires en conservant la LONGUEUR de chaque ligne :
    les offsets restent valides, et rien d'autre du fichier n'est altéré. Les
    chaînes, elles, sont gardées intactes — c'est dans une chaîne que vit le
    ``prompt_name="bellum_x"`` qu'on cherche.
    """
    lignes = src.splitlines(keepends=True)
    try:
        jetons = list(tokenize.generate_tokens(io.StringIO(src).readline))
    except (tokenize.TokenError, IndentationError, SyntaxError):
        # Un fichier illisible ne doit pas rendre la garde muette : on le scanne
        # tel quel plutôt que de le sauter en silence.
        return src

    for jeton in jetons:
        if jeton.type != tokenize.COMMENT:
            continue
        no_ligne, debut = jeton.start[0] - 1, jeton.start[1]
        fin = jeton.end[1]
        ligne = lignes[no_ligne]
        lignes[no_ligne] = ligne[:debut] + " " * (fin - debut) + ligne[fin:]
    return "".join(lignes)


def _call_blocks() -> list[tuple[Path, str]]:
    """Chaque appel à une porte d'entrée du modèle dans le code de prod, avec le
    texte complet de ses arguments."""
    # Alternance triée du plus long au plus court : sans ça ``call_claude``
    # matcherait le début de ``call_claude_with_citations`` et le ``\s*\(``
    # ferait rater le site — le défaut qu'on répare.
    names = "|".join(sorted(_ENTRY_POINTS, key=len, reverse=True))
    pattern = re.compile(rf"(?<!def )\b(?:{names})\s*\(")
    blocks: list[tuple[Path, str]] = []
    for path in sorted(_APP.rglob("*.py")):
        src = _sans_commentaires(path.read_text(encoding="utf-8"))
        # ``def call_claude(...)`` est la définition, pas un appel.
        for m in pattern.finditer(src):
            depth, i = 0, m.end() - 1
            while i < len(src):
                if src[i] == "(":
                    depth += 1
                elif src[i] == ")":
                    depth -= 1
                    if depth == 0:
                        break
                i += 1
            blocks.append((path, src[m.start() : i + 1]))
    return blocks


def _declared_prompt_names() -> set[str]:
    names: set[str] = set()
    for _path, block in _call_blocks():
        m = re.search(r"prompt_name\s*=\s*f?[\"']([^\"'{]+)", block)
        if m:
            # Les noms indexés (``bellum_contacts_batch_{i}_of_{n}``) sont
            # tronqués au ``{`` : on les ramène à leur prompt canonique.
            names.add(_canonical(m.group(1).rstrip("_")))
    return names


class TestRegistry:
    def test_the_scan_finds_the_call_sites(self) -> None:
        """Si ce test tombe, c'est le scanner qui est cassé — pas le code."""
        assert len(_call_blocks()) >= 20

    def test_le_scanner_voit_CHAQUE_porte_dentree(self) -> None:
        """La garde prouve qu'elle LIT — porte par porte, pas en gros.

        ``test_the_scan_finds_the_call_sites`` comptait 20 blocs et passait au
        vert alors que ``call_claude_with_citations`` n'était vu nulle part :
        les 20 autres suffisaient à faire le compte. Un total ne dit pas ce
        qu'il contient. On vérifie donc que CHAQUE nom de porte est
        effectivement retrouvé dans le corpus scanné.
        """
        blocks = _call_blocks()
        for name in _ENTRY_POINTS:
            assert any(
                re.match(rf"{re.escape(name)}\s*\(", block) for _path, block in blocks
            ), f"aucun site d'appel trouvé pour {name!r} — le scanner ne lit pas cette porte"

    def test_un_commentaire_nest_pas_un_site_dappel(self) -> None:
        """La prose qui CITE une porte d'entrée ne doit pas être lue comme du code.

        Régression du 01/09/2026 : un commentaire de ``model_policy.py`` citant
        ``call_claude(`` ouvrait un faux bloc dont le compteur de parenthèses
        courait jusqu'au premier ``prompt_name="…"`` rencontré plus bas,
        fabriquant un nom de prompt qui n'existe nulle part.
        """
        src = (
            "# on cherchait call_claude( et call_claude_sync(, deux motifs\n"
            "# qui citent la porte sans l'appeler ; prompt_name=\"fantome\"\n"
            "x = 1\n"
        )
        assert "call_claude" not in _sans_commentaires(src), (
            "les commentaires ne sont pas blanchis — le scanner relit la prose comme du code"
        )

    def test_le_blanchiment_preserve_le_code(self) -> None:
        """Blanchir les commentaires ne doit rien retirer d'autre.

        Le contre-test du précédent : une garde qui blanchirait tout passerait
        le test ci-dessus en ne voyant plus AUCUN site d'appel.
        """
        src = 'r = call_claude(system, user, prompt_name="bellum_reel")  # un appel\n'
        propre = _sans_commentaires(src)
        assert 'call_claude(system, user, prompt_name="bellum_reel")' in propre
        assert "un appel" not in propre
        assert len(propre) == len(src), "les offsets doivent être préservés"

    def test_every_prompt_is_registered(self) -> None:
        missing = sorted(n for n in _declared_prompt_names() if n not in PROMPT_MODELS)
        assert not missing, (
            "prompts appelés sans entrée dans PROMPT_MODELS :\n  "
            + "\n  ".join(missing)
            + "\n\nChoisir explicitement Sonnet (raisonnement) ou Haiku (extraction)."
        )

    def test_no_call_site_relies_on_the_implicit_default(self) -> None:
        offenders = []
        for path, block in _call_blocks():
            if "prompt_name" not in block:
                continue
            # ``model=`` direct, ou splat conditionnel ``**({"model": …})``
            if re.search(r"(?<!response_)\bmodel\s*=", block) or '"model"' in block:
                continue
            offenders.append(f"{path.name}: {block[:70]!r}")
        assert not offenders, (
            "sites d'appel sans modèle explicite (ils tomberaient sur le défaut Sonnet) :\n  "
            + "\n  ".join(offenders)
        )

    def test_registry_only_names_real_models(self) -> None:
        assert set(PROMPT_MODELS.values()) <= {CLAUDE_MODEL, CLAUDE_HAIKU_MODEL}


class TestModelFor:
    def test_returns_the_registered_model(self) -> None:
        assert model_for("bellum_facts") == CLAUDE_MODEL
        assert model_for("bellum_signals") == CLAUDE_HAIKU_MODEL

    def test_env_override_wins(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("MODEL_BELLUM_ICEBREAKER", CLAUDE_MODEL)
        assert model_for("bellum_icebreaker") == CLAUDE_MODEL

    def test_blank_override_is_ignored(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Une variable posée à vide sur Railway ne doit pas router vers ``""``."""
        monkeypatch.setenv("MODEL_BELLUM_ICEBREAKER", "   ")
        assert model_for("bellum_icebreaker") == PROMPT_MODELS["bellum_icebreaker"]

    def test_legacy_env_names_still_honoured(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Les variables déjà documentées dans CLAUDE.md et posées sur Railway
        continuent de fonctionner — on ne casse pas une prod qui les utilise."""
        monkeypatch.setenv("VOCABULARY_MODEL", CLAUDE_MODEL)
        assert model_for("bellum_vocabulary_builder") == CLAUDE_MODEL
        monkeypatch.setenv("STRATEGY_MODEL", CLAUDE_HAIKU_MODEL)
        assert model_for("bellum_strategy") == CLAUDE_HAIKU_MODEL

    def test_unknown_prompt_falls_back_to_reasoning(self) -> None:
        """Un prompt non enregistré ne doit pas faire tomber la prod : on prend
        le modèle le plus capable (la CI, elle, refuse le trou)."""
        assert model_for("prompt_qui_nexiste_pas") == CLAUDE_MODEL

    def test_batched_prompt_names_resolve_by_prefix(self) -> None:
        """Les batches contacts sont nommés ``bellum_contacts_batch_1_of_5``."""
        assert model_for("bellum_contacts_batch_3_of_5") == CLAUDE_HAIKU_MODEL
