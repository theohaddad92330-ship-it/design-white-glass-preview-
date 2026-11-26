"""Recette golden (#2130) — prouver qu'une recommandation n'est pas du vent.

Trois pièces, et une commande qui échoue :

- **Quinze comptes golden** (#2130.1-15), un par archétype, sous ``accounts/``.
  Règle du cadrage, non négociable (#2130.1-7 reformulés) : un compte est SOIT un
  nom FICTIF assumé — marqué « (fictif) » dans son nom, sans identifiant de
  registre, ses sources sur le domaine réservé ``.invalid`` —, SOIT une entreprise
  réelle dont chaque fait affirmé porte une URL, une date et une TRACE relue dans
  ce dépôt. Jamais un fait inventé sous un nom réel : :func:`corpus_violations`
  le refuse.
- **Treize vérifications par compte** (#2130.16-28). Chacune est ``attendu``
  (le dossier doit porter ces éléments), ``vide_attendu`` (le dossier doit rester
  vide — compte vide, données hors droits : un champ rempli là est une donnée
  inventée) ou ``non_mesure`` (ce golden ne sait pas la vérifier, et le dit).
  « Non mesuré » n'est jamais « réussi » : le verdict se lit sur les vérifications
  MESURÉES, et sous :data:`MIN_MEASURED` il n'y a pas de verdict.
- **Une grille à neuf labels** (#2130.29-37). Cinq sont posés par la machine
  (:data:`MACHINE_LABELS`) ; « utile et correct », « plausible », « trompeur » et
  « indécidable » sont des jugements HUMAINS que la machine ne prétend pas rendre.

La recommandation GÉNÉRIQUE fait échouer le run (#2130.38) : une phrase qui
pourrait s'appliquer telle quelle à un autre compte — aucun fait propre au compte
(le nom du compte ou d'une personne glissé dans un gabarit n'en est pas un), ou la
même phrase / la même raison, nom masqué, que sur un autre compte du corpus.

Déterministe, hors ligne, sans modèle : un juge qui n'est pas reproductible ne
peut pas être la chose qui décide qu'un run passe.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from app.eval.metrics import _FRESHNESS_PASS_WEIGHT
from app.services.confidence import _real_date_freshness

_HERE = Path(__file__).resolve().parent
ACCOUNTS_DIR = _HERE / "accounts"
CAS_DIR = _HERE / "cas"
# apps/ia — la racine contre laquelle se relit la trace d'un fait réel.
_IA_ROOT = _HERE.parents[2]

# ── #2130.29-37 — la grille à neuf labels ────────────────────────────────────
#
# L'orthographe des cinq labels partagés est CELLE de la mémoire marché
# (packages/contracts/src/schemas/market-memory-ground-truth.ts:46-51) : le retour
# citait `correct_and_useful`, que ce contrat refuse explicitement
# (market-memory-ground-truth.test.ts:99-102). Deux orthographes du même jugement
# dans un même dépôt finissent en deux colonnes qu'aucune requête ne réconcilie.
LABELS: tuple[str, ...] = (
    "useful_and_correct",
    "plausible",
    "generic",
    "misleading",
    "wrong_entity",
    "wrong_person",
    "outdated",
    "unsupported",
    "unknown",
)
# Un label de cette liste fait échouer le run. `plausible` et `unknown` ne le font
# pas — ils ne comptent pas non plus comme « utile et correct ».
BLOCKING_LABELS: frozenset[str] = frozenset(
    {"generic", "misleading", "wrong_entity", "wrong_person", "outdated", "unsupported"}
)
# Ce que la machine sait poser seule, dans l'ordre de préséance.
MACHINE_LABELS: tuple[str, ...] = ("wrong_entity", "wrong_person", "unsupported", "outdated", "generic")

# ── #2130.16-28 — treize vérifications ───────────────────────────────────────
VERIFICATIONS: tuple[str, ...] = (
    "identite",
    "perimetre",
    "decideurs",
    "contacts_a_ne_pas_recommander",
    "equipes_cles",
    "signaux",
    "projets",
    "partenaires",
    "acces",
    "recommandations",
    "gaps",
    "sources",
    "action_suivante",
)
STATUSES: tuple[str, ...] = ("attendu", "vide_attendu", "non_mesure")
# « Sous 3 axes, il n'y a pas de score » (doctrine) : même plancher ici.
MIN_MEASURED = 3

# ── #2130.1-15 — quinze archétypes ───────────────────────────────────────────
ARCHETYPES: dict[str, str] = {
    "grande_distribution": "#2130.1",
    "defense": "#2130.2",
    "groupe_tech_defense": "#2130.3",
    "transport_public": "#2130.4",
    "banque": "#2130.5",
    "cosmetique": "#2130.6",
    "aeronautique": "#2130.7",
    "pme": "#2130.8",
    "compte_vide": "#2130.9",
    "multi_filiales": "#2130.10",
    "sans_memoire_marche": "#2130.11",
    "donnees_contradictoires": "#2130.12",
    "connu_du_crm": "#2130.13",
    "missions_passees": "#2130.14",
    "permissions_limitees": "#2130.15",
}
NATURES: tuple[str, ...] = ("fictif", "reel_source")
FICTIF_SUFFIX = " (fictif)"

# Sections qui AFFIRMENT quelque chose de l'entreprise — par opposition à ce que
# nous en disons (recommandations, gaps, sources, action suivante).
_FACTUAL_SECTIONS: tuple[str, ...] = VERIFICATIONS[:9]
# Sections où se cherche un fait propre au compte. Les personnes n'y sont pas : un
# nom de décideur glissé dans un gabarit n'en fait pas une phrase spécifique.
_ANCHOR_SECTIONS: tuple[str, ...] = (
    "identite",
    "perimetre",
    "equipes_cles",
    "signaux",
    "projets",
    "partenaires",
    "acces",
)
_REFERENCE_KEYS = frozenset({"id", "source", "evidence", "url", "date", "via", "scope"})
# Un terme présent dans les faits d'au moins ce nombre d'AUTRES comptes ne
# distingue plus celui-ci.
_COMMON_ACROSS_ACCOUNTS = 2
# Sous cette longueur, deux raisons identiques peuvent l'être par hasard.
_MIN_REASON_CHARS = 20

_YEAR_RE = re.compile(r"(19|20)\d\d")
_ISO_MONTH_RE = re.compile(r"\d{4}-\d{2}(-\d{2})?")
_ISO_DAY_RE = re.compile(r"\d{4}-\d{2}-\d{2}")

_STOPWORD_TEXT = """
    afin ailleurs ainsi alors apres aucun aucune aussi autre autres avant avec avoir bien cela celle celles
    ceci ceux cette chaque chez comme contre dans deja depuis doit doivent donc dont elle elles encore entre
    etre faire fait grace jamais jusqu leur leurs lors lorsque mais meme memes moins nos notamment notre nous
    part parce peut peuvent plus plutot pour puis quand quel quelle quelles quels rien sans selon sera seront
    sont sous surtout toujours tous tout toute toutes tres vers votre vous
    """
_STOPWORDS = frozenset(_STOPWORD_TEXT.split())
# Le vocabulaire qui remplit une phrase commerciale sans rien dire du compte.
_GENERIC_VOCABULARY_TEXT = """
    accompagnement accompagner accelerer acceleration accroitre agile agilite ambition ambitions amelioration
    ameliorer approche besoin besoins budget budgets categorie client clients cloud collaborateurs competences
    compte comptes conseil couts croissance cyber cybersecurite data dedie dediee dedies demarche developpement
    developper digital digitale digitalisation donnees dynamique efficacite enjeu enjeux entreprise entreprises
    equipe equipes expert experts expertise expertises filiale filiales gagner gouvernance groupe groupes
    information informations informatique informatiques innovation innovations legale levier leviers marche
    marches mission missions modernisation moderniser nouveau nouveaux nouvelle nouvelles numerique offre offres
    optimisation optimiser outil outils partenaire partenaires partenariat performance performances permettra
    permettre pilotage potentiel priorite priorites processus programme programmes projet projets proposer
    proposez proposition qualite regie renfort renforcer renforcement ressources route salaries secteur securite
    service services siege societe solution solutions strategie strategique sujet sujets systeme systemes taille
    talents technique techniques technologie technologies transformation unite valeur valoriser vision
    """
_GENERIC_VOCABULARY = frozenset(_GENERIC_VOCABULARY_TEXT.split())


# ── le corpus ────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class GoldenAccount:
    slug: str
    company: str
    archetype: str
    issue: str
    nature: str
    as_of: date
    expected: dict[str, Any]
    dossier: dict[str, Any]
    facts: tuple[dict[str, Any], ...]
    cas: tuple[dict[str, Any], ...]
    raw: dict[str, Any]

    @property
    def company_core(self) -> str:
        """Le nom sans sa marque de fiction — celui qu'écrit un dossier."""
        return self.company.removesuffix(FICTIF_SUFFIX).strip()


def load_account(slug: str, *, raw: Mapping[str, Any] | None = None) -> GoldenAccount:
    if raw is None:
        path = ACCOUNTS_DIR / f"{slug}.json"
        if not path.exists():
            raise FileNotFoundError(f"Aucun compte golden {slug!r} dans {ACCOUNTS_DIR}")
        raw = json.loads(path.read_text(encoding="utf-8"))
    data = dict(raw)
    return GoldenAccount(
        slug=str(data.get("slug") or slug),
        company=str(data.get("company") or ""),
        archetype=str(data.get("archetype") or ""),
        issue=str(data.get("issue") or ""),
        nature=str(data.get("nature") or ""),
        as_of=date.fromisoformat(str(data.get("as_of"))),
        expected=dict(data.get("expected") or {}),
        dossier=dict(data.get("dossier") or {}),
        facts=tuple(f for f in data.get("facts") or [] if isinstance(f, Mapping)),
        cas=tuple(c for c in data.get("cas") or [] if isinstance(c, Mapping)),
        raw=data,
    )


def list_accounts() -> list[GoldenAccount]:
    return [load_account(p.stem) for p in sorted(ACCOUNTS_DIR.glob("*.json"))]


def load_dossier(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


# ── normalisation ────────────────────────────────────────────────────────────


def _norm(text: Any) -> str:
    s = unicodedata.normalize("NFKD", str(text or ""))
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _has_phrase(haystack_norm: str, needle: Any) -> bool:
    n = _norm(needle)
    return bool(n) and f" {n} " in f" {haystack_norm} "


def _flatten(value: Any, skip: frozenset[str] = frozenset()) -> str:
    parts: list[str] = []

    def walk(v: Any) -> None:
        if isinstance(v, Mapping):
            for k, x in v.items():
                if k not in skip:
                    walk(x)
        elif isinstance(v, list | tuple):
            for x in v:
                walk(x)
        elif v is not None and not isinstance(v, bool):
            parts.append(str(v))

    walk(value)
    return " | ".join(parts)


def _is_empty(value: Any) -> bool:
    return not _flatten(value).strip()


def _mappings(value: Any) -> list[Mapping[str, Any]]:
    return [v for v in value or [] if isinstance(v, Mapping)] if isinstance(value, list | tuple) else []


def _is_distinctive(token: str, company_tokens: set[str]) -> bool:
    if any(ch.isdigit() for ch in token):
        return len(token) >= 3 and not _YEAR_RE.fullmatch(token)
    return (
        len(token) >= 4
        and token not in _STOPWORDS
        and token not in _GENERIC_VOCABULARY
        and token not in company_tokens
    )


def _company_tokens(account: GoldenAccount) -> set[str]:
    return set(_norm(account.company_core).split())


def _anchor_terms(dossier: Mapping[str, Any], company_tokens: set[str]) -> set[str]:
    hay = _flatten({k: dossier.get(k) for k in _ANCHOR_SECTIONS}, skip=_REFERENCE_KEYS)
    return {t for t in _norm(hay).split() if _is_distinctive(t, company_tokens)}


def _mask(text: Any, company_core: str) -> str:
    n, core = _norm(text), _norm(company_core)
    return f" {n} ".replace(f" {core} ", " compte ").strip() if core else n


# ── la machine : cinq labels qu'elle sait poser ──────────────────────────────


def _names_another_account(
    text: str, account: GoldenAccount, dossier: Mapping[str, Any], others: Sequence[GoldenAccount]
) -> bool:
    hay = f" {_norm(text)} "
    own = _norm(account.company_core)
    partners = [_norm(_flatten(p)) for p in dossier.get("partenaires") or []]
    for other in others:
        core = _norm(other.company_core)
        if not core or core == own or core in own:
            continue
        # Un partenaire NOMMÉ au dossier se cite légitimement.
        if f" {core} " in hay and not any(core in p for p in partners):
            return True
    return False


def _targets_wrong_person(reco: Mapping[str, Any], dossier: Mapping[str, Any]) -> bool:
    target = _norm(reco.get("target"))
    if not target:
        return False
    excluded = {_norm(c.get("name")) for c in _mappings(dossier.get("contacts_a_ne_pas_recommander"))}
    if target in excluded:
        return True
    deciders = {_norm(d.get("name")) for d in _mappings(dossier.get("decideurs"))}
    # Sans décideurs au dossier, la cible n'est pas vérifiable : non mesuré, pas faux.
    return bool(deciders) and target not in deciders


def _evidence_index(dossier: Mapping[str, Any]) -> dict[str, Mapping[str, Any]]:
    return {
        str(item.get("id")): item
        for section in ("signaux", "projets", "sources")
        for item in _mappings(dossier.get(section))
        if item.get("id")
    }


def _resolve_evidence(reco: Mapping[str, Any], dossier: Mapping[str, Any]) -> list[Mapping[str, Any]] | None:
    ids = [str(e) for e in reco.get("evidence") or []]
    index = _evidence_index(dossier)
    if not ids or any(e not in index for e in ids):
        return None
    return [index[e] for e in ids]


def _is_outdated(items: Iterable[Mapping[str, Any]], as_of: date) -> bool:
    dated = [{"date": it.get("date")} for it in items if it.get("date")]
    if not dated:
        return False
    # Même échelle et même seuil que le banc d'éval : < 18 mois
    # (confidence._FRESHNESS_BY_AGE, metrics._FRESHNESS_PASS_WEIGHT).
    weight = _real_date_freshness({"recentSignals": dated}, today=as_of)
    return weight is not None and weight < _FRESHNESS_PASS_WEIGHT


def _is_generic(
    reco: Mapping[str, Any], account: GoldenAccount, dossier: Mapping[str, Any], others: Sequence[GoldenAccount]
) -> bool:
    """#2130.38 — une phrase qui pourrait s'appliquer telle quelle ailleurs."""
    company_tokens = _company_tokens(account)
    own = _anchor_terms(dossier, company_tokens)
    common = {
        t
        for t, n in Counter(term for o in others for term in _anchor_terms(o.dossier, _company_tokens(o))).items()
        if n >= _COMMON_ACROSS_ACCOUNTS
    }
    said = f"{reco.get('text') or ''} {reco.get('why') or ''}"
    terms = {t for t in _norm(said).split() if _is_distinctive(t, company_tokens)}
    if not (terms & own) - common:
        return True

    text = _mask(reco.get("text"), account.company_core)
    why = _mask(reco.get("why"), account.company_core)
    for other in others:
        for theirs in _mappings(other.dossier.get("recommandations")):
            if text and text == _mask(theirs.get("text"), other.company_core):
                return True
            if len(why) >= _MIN_REASON_CHARS and why == _mask(theirs.get("why"), other.company_core):
                return True
    return False


def machine_label(
    reco: Mapping[str, Any],
    account: GoldenAccount,
    dossier: Mapping[str, Any],
    corpus: Sequence[GoldenAccount] | None = None,
) -> str | None:
    """Le label que la machine sait poser, ou ``None`` — jamais « utile et
    correct » : l'absence de défaut détectable n'est pas une qualité prouvée."""
    others = [o for o in (corpus if corpus is not None else list_accounts()) if o.slug != account.slug]
    said = f"{reco.get('text') or ''} {reco.get('why') or ''}"
    if _names_another_account(said, account, dossier, others):
        return "wrong_entity"
    if _targets_wrong_person(reco, dossier):
        return "wrong_person"
    items = _resolve_evidence(reco, dossier)
    if items is None:
        return "unsupported"
    if _is_outdated(items, account.as_of):
        return "outdated"
    if _is_generic(reco, account, dossier, others):
        return "generic"
    return None


# ── le run ───────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class CheckResult:
    key: str
    status: str
    verdict: str  # "reussi" | "echoue" | "non_mesure"
    detail: str


@dataclass(frozen=True)
class RecoVerdict:
    id: str
    label: str | None


@dataclass(frozen=True)
class AccountReport:
    slug: str
    checks: tuple[CheckResult, ...]
    recommendations: tuple[RecoVerdict, ...]

    @property
    def measured(self) -> int:
        return sum(1 for c in self.checks if c.verdict != "non_mesure")

    @property
    def reussies(self) -> int:
        return sum(1 for c in self.checks if c.verdict == "reussi")

    @property
    def passed(self) -> bool:
        return self.measured >= MIN_MEASURED and all(c.verdict != "echoue" for c in self.checks)

    @property
    def summary(self) -> str:
        line = f"{self.slug} : {self.reussies}/{self.measured} vérifications mesurées réussies"
        not_measured = [c.key for c in self.checks if c.verdict == "non_mesure"]
        if not_measured:
            line += f" — non mesurées : {', '.join(not_measured)}"
        if self.measured < MIN_MEASURED:
            line += f" — sous {MIN_MEASURED} vérifications mesurées, pas de verdict"
        return line


def _section_problems(
    key: str, section: Any, dossier: Mapping[str, Any], recos: Sequence[RecoVerdict]
) -> list[str]:
    problems: list[str] = []
    if key == "recommandations":
        refused = [f"{r.id}={r.label}" for r in recos if r.label in BLOCKING_LABELS]
        if refused:
            problems.append("recommandation(s) refusée(s) : " + ", ".join(refused))
    elif key == "action_suivante" and isinstance(section, Mapping):
        if _targets_wrong_person(section, dossier):
            problems.append("cible une personne hors des décideurs ou à ne pas recommander")
        if section.get("evidence") and _resolve_evidence(section, dossier) is None:
            problems.append("preuve introuvable au dossier")
    elif key == "sources":
        for src in _mappings(section):
            url, when = str(src.get("url") or ""), str(src.get("date") or "")
            if not url.startswith("https://") or not _ISO_MONTH_RE.fullmatch(when):
                problems.append(f"source {src.get('id')!r} sans URL https ou sans date")
    elif key == "signaux":
        undated = [str(s.get("id")) for s in _mappings(section) if not s.get("date")]
        if undated:
            problems.append("signal non daté : " + ", ".join(undated))
    return problems


def run_account(
    account: GoldenAccount, dossier: Mapping[str, Any], corpus: Sequence[GoldenAccount] | None = None
) -> AccountReport:
    corpus = list(corpus) if corpus is not None else list_accounts()
    recos = tuple(
        RecoVerdict(id=str(r.get("id") or i), label=machine_label(r, account, dossier, corpus))
        for i, r in enumerate(_mappings(dossier.get("recommandations")))
    )
    checks: list[CheckResult] = []
    for key in VERIFICATIONS:
        spec = account.expected.get(key) or {}
        status = str(spec.get("status") or "")
        section = dossier.get(key)
        if status == "non_mesure":
            checks.append(CheckResult(key, status, "non_mesure", str(spec.get("raison") or "")))
            continue
        if status == "vide_attendu":
            ok = _is_empty(section)
            detail = "vide, comme attendu" if ok else f"rempli alors qu'il doit rester vide : {spec.get('raison')}"
            checks.append(CheckResult(key, status, "reussi" if ok else "echoue", detail))
            continue
        if status != "attendu":
            checks.append(CheckResult(key, status, "echoue", f"statut inconnu {status!r}"))
            continue
        if _is_empty(section):
            checks.append(CheckResult(key, status, "echoue", "absent du dossier"))
            continue
        hay = _norm(_flatten(section))
        problems = [f"manque « {n} »" for n in spec.get("contient") or [] if not _has_phrase(hay, n)]
        problems += _section_problems(key, section, dossier, recos)
        checks.append(
            CheckResult(key, status, "echoue" if problems else "reussi", " ; ".join(problems) or "conforme")
        )
    return AccountReport(slug=account.slug, checks=tuple(checks), recommendations=recos)


# ── la règle du cadrage : jamais un fait inventé sous un nom réel ────────────


def _resolve_trace(trace: str) -> Any:
    path_part, _, pointer = trace.partition("#")
    target = (_IA_ROOT / path_part).resolve()
    if _IA_ROOT not in target.parents or not target.is_file() or not pointer:
        raise LookupError(trace)
    node: Any = json.loads(target.read_text(encoding="utf-8"))
    for part in pointer.split("."):
        node = node[part]
    return node


def _fact_violations(account: GoldenAccount) -> list[str]:
    violations: list[str] = []
    if FICTIF_SUFFIX.strip() in account.company:
        violations.append("compte réel marqué comme fictif")
    if not account.facts:
        violations.append("compte réel sans aucun fait sourcé")
    values: list[str] = []
    urls: set[str] = set()
    for fact in account.facts:
        key, url, when = fact.get("key"), str(fact.get("url") or ""), str(fact.get("date") or "")
        host = urlparse(url).hostname or ""
        if not url.startswith("https://") or not host or host.endswith(".invalid"):
            violations.append(f"fait {key!r} sans URL https réelle")
        if not _ISO_DAY_RE.fullmatch(when):
            violations.append(f"fait {key!r} sans date AAAA-MM-JJ")
        try:
            traced = _resolve_trace(str(fact.get("trace") or ""))
        except (LookupError, OSError, KeyError, TypeError, ValueError):
            violations.append(f"fait {key!r} : trace illisible {fact.get('trace')!r}")
        else:
            if str(traced) != str(fact.get("value")):
                violations.append(f"fait {key!r} : valeur différente de sa trace {fact.get('trace')!r}")
        values.append(_norm(fact.get("value")))
        urls.add(url)

    numbers = {t for v in values for t in v.split() if any(ch.isdigit() for ch in t)}
    for key in _FACTUAL_SECTIONS:
        spec = account.expected.get(key) or {}
        if spec.get("status") == "attendu":
            for needle in spec.get("contient") or []:
                if not any(_has_phrase(v, needle) for v in values):
                    violations.append(f"{key} : « {needle} » n'est porté par aucun fait sourcé")
        flat = _norm(_flatten(account.dossier.get(key), skip=_REFERENCE_KEYS))
        for token in flat.split():
            if any(ch.isdigit() for ch in token) and token not in numbers:
                violations.append(f"{key} : nombre « {token} » porté par aucun fait sourcé")
    for src in _mappings(account.dossier.get("sources")):
        if str(src.get("url") or "") not in urls:
            violations.append(f"source {src.get('id')!r} ne correspond à aucun fait sourcé")
    return violations


def _fiction_violations(account: GoldenAccount) -> list[str]:
    violations: list[str] = []
    if not account.company.endswith(FICTIF_SUFFIX):
        violations.append("compte fictif dont le nom ne porte pas la marque « (fictif) »")
    if not str(account.raw.get("_fiction") or "").strip():
        violations.append("compte fictif sans note `_fiction`")
    identite = account.dossier.get("identite")
    if isinstance(identite, Mapping) and identite.get("siren"):
        violations.append("compte fictif avec un siren : un identifiant de registre désigne une entreprise réelle")
    if account.facts:
        violations.append("compte fictif avec des faits présentés comme sourcés")
    for src in _mappings(account.dossier.get("sources")):
        host = urlparse(str(src.get("url") or "")).hostname or ""
        if not host.endswith(".invalid"):
            violations.append(f"source fictive {src.get('id')!r} hors du domaine réservé .invalid")
    return violations


def corpus_violations(account: GoldenAccount) -> list[str]:
    """Tout ce qui empêche un compte d'entrer au corpus — vide quand il est sain."""
    violations: list[str] = []
    if ARCHETYPES.get(account.archetype) != account.issue:
        violations.append(f"archétype {account.archetype!r} / issue {account.issue!r} hors de la table")
    if tuple(account.expected) != VERIFICATIONS:
        violations.append("les treize vérifications ne sont pas déclarées dans l'ordre")
    measured = 0
    for key, spec in account.expected.items():
        status = spec.get("status") if isinstance(spec, Mapping) else None
        if status not in STATUSES:
            violations.append(f"{key} : statut {status!r} inconnu")
            continue
        if status != "non_mesure":
            measured += 1
        if status != "attendu" and not str(spec.get("raison") or "").strip():
            violations.append(f"{key} : {status} sans raison écrite")
        if status == "attendu" and not [n for n in spec.get("contient") or [] if str(n).strip()]:
            violations.append(f"{key} : attendu sans rien à vérifier")
        if status == "non_mesure" and not _is_empty(account.dossier.get(key)):
            violations.append(f"{key} : non mesuré, mais rempli dans le dossier de référence")
    if measured < MIN_MEASURED:
        violations.append(f"{measured} vérification(s) mesurée(s), sous le plancher de {MIN_MEASURED}")
    for case in account.cas:
        if case.get("label") not in LABELS or not str(case.get("id") or "").strip():
            violations.append(f"cas étiqueté {case.get('id')!r} : label {case.get('label')!r} hors grille")
    if account.nature == "fictif":
        violations += _fiction_violations(account)
    elif account.nature == "reel_source":
        violations += _fact_violations(account)
    else:
        violations.append(f"nature {account.nature!r} inconnue")
    return violations
