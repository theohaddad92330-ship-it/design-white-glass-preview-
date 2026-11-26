"""#2469 — une PHRASE FRANÇAISE n'entre pas dans une charge utile d'affichage.

Retour bêta #2469, déposé depuis `/discover` : « URGENT à corriger ». Ce qu'un
client lisait à l'écran, mot pour mot, sous le bandeau « Résultats partiels » :

    « l'identification des entreprises — 1 entreprise(s) non vérifiée(s) : le
      registre n'a pas répondu (indisponible ou quota atteint) — écartée(s),
      aucun SIREN inventé. »

Trois défauts dans une seule ligne, et un seul coupable : la phrase était écrite
EN DUR, EN FRANÇAIS, ici, dans le service IA. Donc (a) elle n'était pas
traduisible — un espace en anglais lisait du français ; (b) elle portait des
« (s) » de secours au lieu de vrais pluriels, que seul le catalogue i18n sait
faire ; (c) elle doublonnait avec le texte du bloc qui la contenait.

La règle que cette garde tient, et qui existait DÉJÀ un cran plus bas
(``DegradeReason``, *« Stable identifiers — the UI maps them to a localized
sentence, so they must never become free text »*) : **le service IA émet un
identifiant machine et ses chiffres ; le texte visible vit dans
``apps/web/src/i18n/locales/{fr,en}/discover.json``.**

Ce qu'elle NE fait PAS, et c'est délibéré :

* elle ne lit ni les commentaires, ni les docstrings, ni les prompts, ni les
  journaux — le français y est chez lui. Elle travaille sur l'ARBRE SYNTAXIQUE
  et ne regarde qu'un seul endroit : l'argument ``reason`` des appels qui
  construisent une entrée destinée à l'écran ;
* elle ne touche pas au chemin ``except`` du routeur, qui renvoie le message
  d'exception BRUT (``str(exc)``). Ce n'est pas un littéral, donc elle ne le
  voit pas — et c'est voulu : traduire une cause qu'on ignore reviendrait à
  affirmer ce qu'on n'a pas mesuré (cf. `DegradedBanner.tsx`).
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"

#: Les appels qui CONSTRUISENT une entrée rendue à l'écran. ``SignalSourceUnavailable``
#: en fait partie : le routeur `/discover/signals` convertit son ``reason`` en
#: entrée ``degraded`` telle quelle (docstring de `signal_errors.py`).
DISPLAY_PAYLOAD_CALLS = frozenset({"DegradedSource", "SignalSourceUnavailable", "degraded_entry"})

#: Une clé machine : minuscules, chiffres, tirets bas. Pas d'espace, donc pas de
#: phrase ; pas d'accent, donc pas de langue.
MACHINE_REASON = re.compile(r"^[a-z][a-z0-9_]*$")


@dataclass(frozen=True)
class ReasonSite:
    """Un argument ``reason`` d'un constructeur d'affichage, et ce qu'on en dit."""

    path: str
    line: int
    callee: str
    snippet: str
    #: Le texte est écrit là, en clair (constante ou f-string). Une valeur
    #: calculée (``DegradeReason.NETWORK_ERROR``, ``str(exc)``) ne l'est pas.
    literal: bool
    violation: bool


def _callee_name(node: ast.Call) -> str | None:
    func = node.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def _reason_expr(node: ast.Call, callee: str) -> ast.expr | None:
    for keyword in node.keywords:
        if keyword.arg == "reason":
            return keyword.value
    # ``SignalSourceUnavailable(source, reason)`` — la seule forme positionnelle
    # du corpus ; un modèle pydantic n'en accepte pas.
    if callee == "SignalSourceUnavailable" and len(node.args) >= 2:
        return node.args[1]
    return None


def reason_sites(source: str, path: str) -> list[ReasonSite]:
    """Tous les arguments ``reason`` des constructeurs d'affichage du fichier.

    Un site est relevé même quand sa valeur est CALCULÉE — c'est ce qui permet à
    la garde de prouver qu'elle lit encore ce qu'elle surveille. Sans ça elle
    devient borgne le jour où elle réussit : plus un seul littéral dans le
    dépôt, donc plus rien de lu, donc verte pour rien. Seuls les littéraux
    peuvent être rouges ; une valeur calculée est hors de ce qu'on peut décider,
    et la garde ne devine pas.
    """
    sites: list[ReasonSite] = []
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Call):
            continue
        callee = _callee_name(node)
        if callee not in DISPLAY_PAYLOAD_CALLS:
            continue
        expr = _reason_expr(node, callee)
        if expr is None:
            continue
        if isinstance(expr, ast.Constant) and isinstance(expr.value, str):
            snippet, literal = expr.value, True
            violation = not MACHINE_REASON.match(snippet)
        elif isinstance(expr, ast.JoinedStr):
            # Une f-string tisse du texte autour d'une valeur : c'est une phrase
            # par construction, jamais une clé.
            snippet, literal, violation = ast.unparse(expr), True, True
        else:
            snippet, literal, violation = ast.unparse(expr), False, False
        sites.append(
            ReasonSite(
                path=path,
                line=expr.lineno,
                callee=callee,
                snippet=snippet if len(snippet) <= 70 else snippet[:67] + "…",
                literal=literal,
                violation=violation,
            )
        )
    return sites


def violation_message(site: ReasonSite) -> str:
    return (
        f"{site.path}:{site.line} — {site.callee}(reason=…) porte une PHRASE, pas une clé machine : "
        f"« {site.snippet} ». Le service IA émet un identifiant stable et ses chiffres ; "
        "le texte visible vit dans apps/web/src/i18n/locales/{fr,en}/discover.json (#2469)."
    )


def corpus() -> list[Path]:
    """Les fichiers qui construisent une entrée ``degraded`` rendue à l'écran."""
    files = [
        APP / "routers" / "discover_signals.py",
        APP / "services" / "company_filters.py",
    ]
    for candidate in sorted((APP / "services" / "data_sources").glob("*.py")):
        if "SignalSourceUnavailable" in candidate.read_text(encoding="utf-8"):
            files.append(candidate)
    return files


def _sites_of_corpus() -> list[ReasonSite]:
    sites: list[ReasonSite] = []
    for path in corpus():
        rel = str(path.relative_to(APP.parent))
        sites.extend(reason_sites(path.read_text(encoding="utf-8"), rel))
    return sites


def test_no_french_sentence_in_a_display_payload() -> None:
    """LE test : ce que l'IA met dans ``degraded[].reason`` est une clé, pas une phrase."""
    offenders = [violation_message(s) for s in _sites_of_corpus() if s.violation]
    assert offenders == [], "\n".join(offenders)


def test_the_guard_actually_reads_something() -> None:
    """Une garde sur zéro fichier est verte pour rien.

    On vérifie les deux bouts de la chaîne : les fichiers EXISTENT (le corpus
    n'est pas une liste de chemins morts) et la lecture RAMÈNE des sites — donc
    le motif cherché est bien celui que le code écrit.
    """
    files = corpus()
    assert len(files) >= 5, f"corpus trop maigre : {[f.name for f in files]}"
    assert all(f.exists() for f in files), [str(f) for f in files if not f.exists()]

    sites = _sites_of_corpus()
    assert len(sites) >= 10, f"{len(sites)} site(s) lu(s) — la garde ne trouve plus ce qu'elle surveille"
    assert {s.callee for s in sites} >= {"DegradedSource", "SignalSourceUnavailable"}
    # Le fichier du retour #2469 contribue — s'il cessait d'émettre, la garde
    # resterait verte en ne surveillant plus rien.
    assert [s for s in sites if s.path.endswith("routers/discover_signals.py")]
    # Le dépôt n'a plus AUCUN littéral ici, et c'est l'état visé : chaque raison
    # est une constante nommée. La capacité à juger un littéral est donc
    # exercée par les deux témoins synthétiques ci-dessous, pas par le corpus.
    assert [s for s in sites if s.literal] == []


def test_the_guard_says_no() -> None:
    """Elle sait dire NON : on lui remet la phrase exacte du retour #2469."""
    guilty = '''
from app.routers.discover_signals import DegradedSource

def build(dropped):
    return DegradedSource(
        source="siren-resolution",
        reason=(
            f"{dropped['unreachable']} entreprise(s) non vérifiée(s) : le registre "
            "n'a pas répondu (indisponible ou quota atteint) — écartée(s), aucun SIREN inventé."
        ),
        count=dropped["unreachable"],
        kind="unreachable",
    )
'''
    offenders = [s for s in reason_sites(guilty, "temoin.py") if s.violation]
    assert len(offenders) == 1
    message = violation_message(offenders[0])
    assert "porte une PHRASE, pas une clé machine" in message
    assert "discover.json (#2469)" in message


def test_the_guard_ignores_what_it_does_not_target() -> None:
    """Témoin : le français légitime reste VERT.

    Un commentaire, une docstring, un prompt, un message de journal et une
    exception brute sont du français qui ne va pas à l'écran sous cette forme —
    ou qui y va en assumant qu'on ignore la cause. Une garde qui les attraperait
    serait abandonnée en trois jours.
    """
    innocent = '''
"""Ce module parle français, et c'est très bien ainsi."""

PROMPT = "Tu es Laura. Rédige un angle d'attaque en français, sans inventer de chiffre."

def collect(exc, dropped):
    # Une source injoignable est DITE, jamais masquée.
    logger.warning("source injoignable (%s)", exc)
    raise SignalSourceUnavailable(SOURCE_NAME, DegradeReason.NETWORK_ERROR)

def passthrough(result):
    return DegradedSource(source=result.source, reason=str(result))

def keyed():
    return degraded_entry("pappers", reason="unsupported_filters")

def keyed_too():
    return DegradedSource(source="siren-resolution", reason="siren_ambiguous", count=2)
'''
    sites = reason_sites(innocent, "temoin.py")
    assert [s for s in sites if s.violation] == []
    # …et elle a bien REGARDÉ ce témoin : quatre sites lus, zéro rouge.
    assert len(sites) == 4
    assert sorted(s.snippet for s in sites if s.literal) == ["siren_ambiguous", "unsupported_filters"]
