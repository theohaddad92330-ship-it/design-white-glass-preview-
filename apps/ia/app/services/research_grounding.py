"""The grounding floor for phase 1: when is a dossier no longer worth building?

Every collector in phase 1 soft-fails to an empty result — that is deliberate
and correct (``source_health`` explains why). But "never fail" taken to its
limit produces the one output the project forbids: with Brave, Firecrawl AND
the registry all dead, Claude is prompted with nothing but a company name, and
whatever it writes is recalled from training data, not read from a source. The
run would then be persisted with a score and signals, indistinguishable from a
genuine dossier. That is worse than an error, because the user cannot tell.

So there are two distinct outcomes, and the pipeline must not collapse them:

* a source is HS  → degrade, ``record_degradation``, carry on;
* nothing is left → fail EXPLICITLY, naming the providers that died.

── Where the line sits, and why ──────────────────────────────────────────────

Only three sources carry substance:

  brave      the web corpus the prompts reason over
  firecrawl  the company's own site content
  pappers    legal identity (SIREN, CA, effectifs, dirigeants)

Everything else phase 1 collects — news, job boards, BOAMP/DECP tenders,
BODACC, GitHub, INPI, the Data Gateway — decorates a dossier but cannot
constitute one. Losing all of them is a thinner dossier, not a false one, so
they are deliberately NOT part of the threshold.

Threshold = all three primary sources down. Not two, and the asymmetry is the
whole point:

* 2 of 3 down is a real, useful, and currently LIVE state. The Pappers key hit
  its credit ceiling and 401s on every call; Brave and Firecrawl are healthy
  and the resulting dossier is grounded in real web evidence. Failing there
  would take the entire product offline over one provider's billing problem —
  precisely the fragility this module exists to prevent.
* 3 of 3 down is unambiguous: zero evidence entered the prompt. There is no
  reading of that state where the output is anything but invented.

The cost of each mistake is asymmetric too. Failing too eagerly costs an
analysis the user can retry. Failing too late costs the user's trust in every
dossier they have ever read, because they now know some of them were fiction.

── Ce que la recette du 26/08 a corrigé (#1107, #1108, #1109) ────────────────

Trois analyses de PREVOIR ont échoué d'affilée sur une société que le registre
libre connaît parfaitement. Le SEUIL était juste — « zéro preuve n'est entrée
dans le prompt » est la bonne question — mais ses trois entrées étaient mesurées
à côté :

* ``has_registry`` ne lisait que le profil Pappers, alors que
  `recherche-entreprises` (libre, sans clé) résout l'identité légale et nourrit
  les prompts. C'est même le chemin qui tourne en permanence pendant que la clé
  Pappers est à sec — celui que ce module cite comme LIVE deux paragraphes plus
  haut. Le site d'appel compte désormais l'ancre de désambiguïsation.
* ``web_hits`` ne comptait que Brave, alors que la Data Gateway (Serper →
  Tavily → Brave) ajoute ses résultats au MÊME bloc de prompt — et était
  récoltée APRÈS ce plancher.
* Firecrawl n'est pas un troisième vote indépendant : il lit les URL que la
  recherche web a rendues. Zéro hit web ⇒ zéro page, mécaniquement. Le compter
  parmi les fournisseurs à aller vérifier envoyait chercher une panne dans une
  clé jamais appelée — d'où ``not_asked``.
"""

from __future__ import annotations

# Ordered — the message and the ``down`` list read the same way every run,
# which keeps logs and tests stable.
PRIMARY_SOURCES: tuple[str, ...] = ("brave", "firecrawl", "pappers")

# #4074.2 (13/10) — ces libellés deviennent `account.error_message` (écran
# réel, `AccountDetailStatusBanners`) : la NATURE de la source, jamais le nom
# du fournisseur (le lot NOMMAGE du 12/10 avait déjà traité "pappers", pas
# "brave"/"firecrawl" — cité HORS LOT dans le commentaire #4074 du 12/10).
_DISPLAY_NAMES: dict[str, str] = {
    "brave": "la recherche web",
    "firecrawl": "le contenu des sites",
    "pappers": "le registre légal",
}


class ResearchGroundingError(RuntimeError):
    """No primary source produced anything — refuse to build a dossier.

    Carries ``user_message`` (French, names the providers) because that string
    becomes the account's ``error_message``. "research failed" tells the user
    nothing; "Pappers, Brave et Firecrawl indisponibles" tells them whether
    this is a key to recharge or an outage to wait out.

    ``not_asked`` (#1109) sépare « ce fournisseur n'a rien rendu » de « ce
    fournisseur n'a même pas été interrogé ». Trois analyses de PREVOIR ont
    échoué le 26/08 en nommant Firecrawl, qui n'avait simplement reçu aucune
    URL à lire : le testeur a conclu « réseau et/ou lien KO » et est allé
    chercher une panne là où il n'y en avait pas. Envoyer quelqu'un vérifier le
    quota d'une clé jamais appelée coûte une demi-journée.
    """

    code = "RESEARCH_NO_GROUNDING"

    def __init__(self, down: list[str], not_asked: list[str] | None = None) -> None:
        self.down = list(down)
        self.not_asked = [s for s in PRIMARY_SOURCES if s in set(not_asked or [])]
        # Ce qu'on demande d'aller VÉRIFIER ne contient que ce qui a réellement
        # été interrogé — le reste est expliqué, pas imputé.
        actionable = [s for s in self.down if s not in set(self.not_asked)]
        names = ", ".join(_DISPLAY_NAMES.get(s, s) for s in self.down)
        message = (
            f"Analyse impossible : aucune source de données n'a répondu ({names}). "
            "Le dossier aurait été vide — il n'a pas été généré plutôt que de "
            "présenter des informations non vérifiées. "
        )
        if "firecrawl" in set(self.not_asked):
            # Firecrawl lit les URL que la recherche web a rendues : zéro
            # résultat web ⇒ aucune URL ⇒ aucune page, mécaniquement. Le dire
            # évite de faire passer une conséquence pour une cause.
            message += (
                "Le contenu des sites n'a pas été interrogé : "
                "aucune URL à lire, faute de résultat de recherche web. "
            )
        if actionable:
            names_actionable = ", ".join(_DISPLAY_NAMES.get(s, s) for s in actionable)
            message += (
                f"Vérifiez les clés d'API / quotas de ces sources ({names_actionable}), "
                "puis relancez."
            )
        else:
            message += "Réessayez dans quelques minutes."
        self.user_message = message
        super().__init__(self.user_message)


def down_primary_sources(
    *, web_hits: int, scraped_pages: int, has_registry: bool
) -> list[str]:
    """Which primary sources produced nothing usable, in ``PRIMARY_SOURCES`` order.

    "Produced nothing" rather than "was unreachable" on purpose: a provider
    that answers 200 with an empty body grounds the dossier exactly as little
    as one that times out.

    ``web_hits`` compte TOUT ce qui est entré dans le bloc web du prompt, pas
    seulement Brave (#1109) : la Data Gateway (Serper → Tavily → Brave) y ajoute
    ses résultats, et ils étaient récoltés APRÈS ce plancher. Un run avec dix
    résultats Serper et zéro résultat Brave mourait en annonçant qu'aucune
    source n'avait répondu.
    """
    down: list[str] = []
    if web_hits <= 0:
        down.append("brave")
    if scraped_pages <= 0:
        down.append("firecrawl")
    if not has_registry:
        down.append("pappers")
    return down


def require_grounding(
    *,
    web_hits: int,
    scraped_pages: int,
    has_registry: bool,
    firecrawl_had_urls: bool = True,
) -> None:
    """Raise ``ResearchGroundingError`` when NO primary source produced anything.

    Deliberately silent on partial loss: those are already recorded through
    ``record_degradation`` and surfaced as warnings on the dossier.

    ``firecrawl_had_urls`` ne change PAS le seuil — rien n'est entré dans le
    prompt, le run doit échouer — seulement ce que le message impute à qui.
    """
    down = down_primary_sources(
        web_hits=web_hits, scraped_pages=scraped_pages, has_registry=has_registry
    )
    if len(down) == len(PRIMARY_SOURCES):
        raise ResearchGroundingError(down, not_asked=[] if firecrawl_had_urls else ["firecrawl"])
