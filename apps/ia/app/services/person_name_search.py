"""#4386 — chercher une PERSONNE par nom : une cascade de sources, pas un essai.

Symptôme prod (Louis, 20/10/2026) : « Theo Haddad » + « Bellum » → « Aucun
homonyme trouvé », alors que Théo Haddad est le CEO de Bellum AI. Cause prouvée :
``search_people_by_name`` (#2727) n'interrogeait qu'UNE source, UNE fois, avec un
nom seulement ``strip()`` — aucune normalisation, aucun repli.

La cascade, arrêtée dès qu'un résultat est SOLIDE (nom et entreprise
correspondent, et une deuxième source ou un profil public le confirme) :

(a) normalisation — sans accents ni casse pour l'appariement, la forme accentuée
    probable envoyée AUSSI, prénom/nom dans n'importe quel ordre, entreprise
    nettoyée de ses suffixes (« Bellum » ↔ « Bellum AI » ↔ « BellumAI ») ;
(b) base de contacts (tier de recherche gratuit) — 3 essais au plus : nom +
    entreprise, forme accentuée + variante d'entreprise, nom seul filtré ensuite
    LOCALEMENT sur l'entreprise ;
(c) registre légal gratuit — les dirigeants de l'entreprise résolue, rapprochés
    du nom : trouve un dirigeant français absent de la base ;
(d) recherche web — 2 requêtes au plus (profil public d'abord, puis requête
    libre), moteur 1 puis moteur 2 en repli sur PANNE.

Chaque source sans clé est un no-op strict (zéro appel, aucune erreur) ; une
source en panne est NOTÉE (``down``) et la cascade continue. Aucun reveal payant
ici : e-mail et téléphone restent le geste séparé, après le choix d'un résultat.
Les familles de sources se nomment (``contact_base``, ``legal_registry``,
``web``) — jamais un fournisseur.
"""

from __future__ import annotations

import logging
import os
import re
import unicodedata
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel

from app.models.contacts import PersonNameSearchHit, PersonNameSourceQueried
from app.services import cost_ledger, provider_cache
from app.services.apollo import ApolloSearchStatus, search_people_by_name
from app.services.contact_identity import normalize_linkedin_url, normalize_person_name
from app.services.data_gateway import brave_search_single
from app.services.data_sources.recherche_entreprises import fetch_company
from app.services.data_sources.serper import serper_search
from app.services.source_health import watch_fetch_errors

logger = logging.getLogger(__name__)

CONTACT_BASE = "contact_base"
LEGAL_REGISTRY = "legal_registry"
WEB = "web"
_FAMILY_ORDER = (CONTACT_BASE, LEGAL_REGISTRY, WEB)

MATCH_NAME_AND_COMPANY = "name_and_company"
MATCH_PARTIAL_NAME_AND_COMPANY = "partial_name_and_company"
MATCH_NAME_ONLY = "name_only"
MATCH_PARTIAL_NAME = "partial_name"
_MATCH_RANK = {
    MATCH_NAME_AND_COMPANY: 0,
    MATCH_PARTIAL_NAME_AND_COMPANY: 1,
    MATCH_NAME_ONLY: 2,
    MATCH_PARTIAL_NAME: 3,
}

BASE_MAX_ATTEMPTS = 3
REGISTRY_MAX_LOOKUPS = 2
#: #4386 — décision tranchée : 2 requêtes web FACTURÉES au plus par recherche,
#: repli du moteur 2 compris.
WEB_MAX_REQUESTS = 2
MAX_HITS = 20

# Recette 21/10 B.0 (#4386) — le correctif « BellumAI » → « Bellum » était masqué par le cache
# (réponse en 16 ms avec l ancien résultat). TOUTE évolution de la cascade change ce suffixe :
# un résultat écrit sous l ancienne version n est alors jamais relu.
_CACHE_NAMESPACE = "people:name_search:v2"

# Fermé et écrit à la main, comme `company_name_variants` : une règle
# « intelligente » rapprocherait n'importe quelle société de n'importe quelle autre.
_ORG_SUFFIXES = frozenset(
    {
        "ai",
        "sas",
        "sasu",
        "sa",
        "sarl",
        "eurl",
        "se",
        "snc",
        "sci",
        "scop",
        "gie",
        "group",
        "groupe",
        "france",
        "com",
        "fr",
        "io",
        "net",
        "inc",
        "ltd",
        "llc",
        "gmbh",
    }
)
_ORG_PREFIXES = frozenset({"groupe", "group", "societe"})
#: En dessous, un préfixe commun ne prouve rien (« AI » n'est pas « AI Partners »).
_ORG_PREFIX_MIN_LEN = 4
_GLUED_SUFFIX = re.compile(rf"^(\w{{{_ORG_PREFIX_MIN_LEN - 1},}}[a-z])(?:AI|IO)$")

#: La forme accentuée PROBABLE de prénoms français courants, envoyée en plus de
#: la forme tapée — jamais à sa place.
_ACCENTED_FIRST_NAMES = {
    normalize_person_name(n): n
    for n in (
        "Théo",
        "Mathéo",
        "Léo",
        "Léon",
        "Léa",
        "Chloé",
        "Zoé",
        "Noémie",
        "Hélène",
        "Héloïse",
        "Jérôme",
        "Jérémy",
        "Jérémie",
        "Céline",
        "Cécile",
        "Frédéric",
        "Frédérique",
        "Stéphane",
        "Stéphanie",
        "Sébastien",
        "Séverine",
        "Rémi",
        "Rémy",
        "Clément",
        "Clémence",
        "Gaëlle",
        "Gaël",
        "Benoît",
        "Timothée",
        "André",
        "René",
        "Agnès",
        "Valérie",
        "Émilie",
        "Élodie",
        "Élise",
        "Aurélie",
        "Mélanie",
        "Thérèse",
        "Grégory",
        "Grégoire",
        "Raphaël",
        "Michaël",
        "Joël",
        "Noël",
        "Anaïs",
        "Inès",
        "Maëlle",
        "Loïc",
        "Éric",
        "Édouard",
        "Étienne",
        "Hervé",
        "Bérénice",
        "Amélie",
        "Gérard",
        "Hélèna",
        "Régis",
        "Ségolène",
        "Valérian",
    )
}

_PARTICLES = frozenset({"de", "du", "des", "d"})


# ── Normalisation ──────────────────────────────────────────────────────────


def _tokens(value: str | None) -> list[str]:
    return normalize_person_name(value or "").split()


def _fold(value: str) -> str:
    text = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()


def _org_tokens(org: str | None) -> list[str]:
    tokens = _tokens(org)
    while len(tokens) > 1 and tokens[0] in _ORG_PREFIXES:
        tokens = tokens[1:]
    while len(tokens) > 1 and tokens[-1] in _ORG_SUFFIXES:
        tokens = tokens[:-1]
    return tokens


def _org_core(org: str | None) -> str:
    return "".join(_org_tokens(org))


def companies_correspond(a: str | None, b: str | None) -> bool:
    """#4386 — la marque et la raison sociale désignent-elles la même société ?

    Cœurs nettoyés (suffixes juridiques, pays, « AI », domaine) puis comparés
    collés : égaux, ou l'un PRÉFIXE de l'autre au-delà de 4 lettres —
    « Bellum » ↔ « BELLUM AI » ↔ « BellumAI », « Capgemini » ↔ « CAPGEMINI
    TECHNOLOGY SERVICES ». Jamais « Bellum » ↔ « Bel Air »."""
    ca, cb = _org_core(a), _org_core(b)
    if not ca or not cb:
        return False
    if ca == cb:
        return True
    short, long_ = sorted((ca, cb), key=len)
    return len(short) >= _ORG_PREFIX_MIN_LEN and long_.startswith(short)


def _clean_org_display(org: str) -> str:
    """« Bedrock SAS » → « Bedrock », « bellum.com » → « bellum » (casse gardée)."""
    words = [w for w in re.split(r"[\s.]+", org) if w]
    while len(words) > 1 and _fold(words[0]) in _ORG_PREFIXES:
        words = words[1:]
    while len(words) > 1 and _fold(words[-1]).strip(",") in _ORG_SUFFIXES:
        words = words[:-1]
    # Recette 21/10 (#4386) — « BellumAI » : la marque COLLÉE à son suffixe, que le registre ne
    # connaît pas. On ne coupe que sur une frontière de casse (minuscule puis « AI »/« IO »), jamais
    # « Thai » ni « BELLUMAI », et seulement si la marque garde au moins _ORG_PREFIX_MIN_LEN lettres.
    if len(words) == 1 and (glued := _GLUED_SUFFIX.match(words[0])):
        words = [glued.group(1)]
    return " ".join(words)


def _accented_form(name: str) -> str:
    out = []
    for word in name.split():
        folded = normalize_person_name(word)
        accented = _ACCENTED_FIRST_NAMES.get(folded)
        out.append(accented if accented and _fold(word) == word.lower() else word)
    return " ".join(out)


def _title_case_surname(raw: str) -> str:
    words = []
    for word in raw.split():
        if word.lower() in _PARTICLES:
            words.append(word.lower())
            continue
        words.append("-".join(p[:1].upper() + p[1:].lower() for p in word.split("-")))
    return " ".join(words)


def _split_registry_name(name: str) -> tuple[str, str]:
    """« Theo HADDAD » → (« Theo », « Haddad ») : le registre publie le NOM en
    capitales après les prénoms. Sans capitales distinctes, le dernier mot."""
    words = name.split()
    if len(words) < 2:
        return name, ""
    split = len(words)
    while split > 0 and words[split - 1].isupper():
        split -= 1
    if split == 0 or split == len(words):
        split = len(words) - 1
    first = " ".join(words[:split])
    last = " ".join(words[split:])
    return first, _title_case_surname(last) if last.isupper() else last


# ── Appariement des noms ───────────────────────────────────────────────────

_OBFUSCATED = re.compile(r"^(.*?)\*+(.*)$")


def _remove_tokens(pool: list[str], remove: list[str]) -> list[str] | None:
    rest = list(pool)
    for token in remove:
        if token not in rest:
            return None
        rest.remove(token)
    return rest


def _masked_consistent(full_last: str, masked: str) -> bool:
    m = _OBFUSCATED.match(_fold(masked).replace(" ", ""))
    if not m:
        return False
    prefix, suffix = m.group(1), m.group(2)
    return len(full_last) >= len(prefix) + len(suffix) and full_last.startswith(prefix) and full_last.endswith(suffix)


def _name_score(query: list[str], first: str, last: str, masked: str) -> int:
    """2 : le nom correspond (ordre, accents, casse, tirets ignorés ; des prénoms
    supplémentaires publiés tolérés). 1 : il correspond à ce qui est VISIBLE d'un
    nom masqué. 0 : une autre personne."""
    if last:
        full = _tokens(f"{first} {last}")
        if sorted(full) == sorted(query):
            return 2
        if len(query) >= 2 and _remove_tokens(full, query) is not None:
            return 2
        return 0
    if masked:
        rest = _remove_tokens(query, _tokens(first))
        if rest and _masked_consistent("".join(rest), masked):
            return 1
    return 0


# ── Candidats ──────────────────────────────────────────────────────────────

#: Quelle famille fait foi, champ par champ, quand plusieurs rendent la même personne.
_FIELD_PRIORITY: dict[str, tuple[str, ...]] = {
    "first_name": (WEB, CONTACT_BASE, LEGAL_REGISTRY),
    "last_name": (WEB, LEGAL_REGISTRY, CONTACT_BASE),
    "title": (CONTACT_BASE, WEB, LEGAL_REGISTRY),
    "organization_name": (CONTACT_BASE, LEGAL_REGISTRY, WEB),
    "linkedin_url": (CONTACT_BASE, WEB),
}


@dataclass
class _Candidate:
    parts: dict[str, dict[str, Any]] = field(default_factory=dict)

    def get(self, name: str) -> str:
        order = _FIELD_PRIORITY.get(name, (CONTACT_BASE,))
        for family in order:
            value = self.parts.get(family, {}).get(name)
            if value:
                return str(value)
        return ""

    @property
    def masked(self) -> str:
        return str(self.parts.get(CONTACT_BASE, {}).get("last_name_obfuscated") or "")

    @property
    def sources(self) -> list[str]:
        return [f for f in _FAMILY_ORDER if f in self.parts]

    def absorb(self, other: _Candidate) -> None:
        for family, part in other.parts.items():
            self.parts.setdefault(family, part)


def _names_compatible(a: _Candidate, b: _Candidate) -> bool:
    a_last, b_last = a.get("last_name"), b.get("last_name")
    if a_last and b_last:
        ta, tb = _tokens(f"{a.get('first_name')} {a_last}"), _tokens(f"{b.get('first_name')} {b_last}")
        return sorted(ta) == sorted(tb) or _remove_tokens(ta, tb) is not None or _remove_tokens(tb, ta) is not None
    if a_last or b_last:
        full, masked = (a, b) if a_last else (b, a)
        return (
            _name_score(
                _tokens(f"{full.get('first_name')} {full.get('last_name')}"),
                masked.get("first_name"),
                "",
                masked.masked,
            )
            == 1
        )
    return _tokens(a.get("first_name")) == _tokens(b.get("first_name")) and _fold(a.masked) == _fold(b.masked)


def _same_person(a: _Candidate, b: _Candidate) -> bool:
    """#4386 — dédoublonnage : le profil public normalisé fait foi ; sinon le nom
    (sans accents) ET l'entreprise (nettoyée) doivent correspondre tous les deux."""
    la, lb = normalize_linkedin_url(a.get("linkedin_url")), normalize_linkedin_url(b.get("linkedin_url"))
    if la and lb:
        return la == lb
    if not companies_correspond(a.get("organization_name"), b.get("organization_name")):
        return False
    return _names_compatible(a, b)


# ── État de la cascade ─────────────────────────────────────────────────────


@dataclass
class _Query:
    display_name: str
    tokens: list[str]
    accented_name: str
    org: str
    org_clean: str

    @classmethod
    def build(cls, full_name: str, organization_name: str | None) -> _Query:
        display = " ".join((full_name or "").split())
        org = " ".join((organization_name or "").split())
        return cls(
            display_name=display,
            tokens=_tokens(display),
            accented_name=_accented_form(display),
            org=org,
            org_clean=_clean_org_display(org) if org else "",
        )

    @property
    def cache_key(self) -> str:
        return f"{' '.join(sorted(self.tokens))}|{_org_core(self.org)}"


@dataclass
class _FamilyState:
    queried: bool = False
    answered: bool = False
    down: bool = False


@dataclass
class _Cascade:
    query: _Query
    candidates: list[_Candidate] = field(default_factory=list)
    families: dict[str, _FamilyState] = field(default_factory=lambda: {f: _FamilyState() for f in _FAMILY_ORDER})

    def name_score(self, cand: _Candidate) -> int:
        return _name_score(self.query.tokens, cand.get("first_name"), cand.get("last_name"), cand.masked)

    def company_ok(self, cand: _Candidate) -> bool:
        return bool(self.query.org) and companies_correspond(self.query.org, cand.get("organization_name"))

    def match(self, cand: _Candidate) -> str:
        exact = self.name_score(cand) == 2
        if self.company_ok(cand):
            return MATCH_NAME_AND_COMPANY if exact else MATCH_PARTIAL_NAME_AND_COMPANY
        return MATCH_NAME_ONLY if exact else MATCH_PARTIAL_NAME

    def add(self, family: str, part: dict[str, Any]) -> bool:
        cand = _Candidate(parts={family: part})
        if self.name_score(cand) == 0:
            return False
        for existing in self.candidates:
            if _same_person(existing, cand):
                existing.absorb(cand)
                return True
        self.candidates.append(cand)
        return True

    def solid(self) -> bool:
        """Assez pour s'arrêter : avec une entreprise, nom ET entreprise
        correspondent et une 2e source ou un profil public le confirme ; sans
        entreprise, au moins un nom qui correspond en entier."""
        for cand in self.candidates:
            if self.query.org:
                if self.match(cand) == MATCH_NAME_AND_COMPANY and (cand.get("linkedin_url") or len(cand.sources) >= 2):
                    return True
            elif self.name_score(cand) == 2:
                return True
        return False

    def base_settled(self) -> bool:
        if self.query.org:
            return any(self.company_ok(c) for c in self.candidates)
        return any(self.name_score(c) == 2 for c in self.candidates)

    def count(self, family: str) -> int:
        return sum(1 for c in self.candidates if family in c.parts)


# ── (b) base de contacts ───────────────────────────────────────────────────


def _base_attempts(q: _Query) -> list[tuple[str, str | None]]:
    attempts: list[tuple[str, str | None]] = []
    if q.org:
        attempts.append((q.display_name, q.org))
        if q.accented_name != q.display_name or q.org_clean != q.org:
            attempts.append((q.accented_name, q.org_clean or q.org))
        attempts.append((q.display_name, None))
    else:
        attempts.append((q.display_name, None))
        attempts.append((q.accented_name, None))
    unique: list[tuple[str, str | None]] = []
    for attempt in attempts:
        if attempt not in unique:
            unique.append(attempt)
    return unique[:BASE_MAX_ATTEMPTS]


async def _from_contact_base(state: _Cascade) -> None:
    family = state.families[CONTACT_BASE]
    for name, org in _base_attempts(state.query):
        try:
            hits, status = await search_people_by_name(full_name=name, organization_name=org)
        except Exception as exc:  # noqa: BLE001 — une source ne casse jamais la cascade
            logger.warning("person name search: contact base errored: %s", exc)
            family.queried, family.down = True, True
            return
        if status == ApolloSearchStatus.UNCONFIGURED:
            return  # sans clé : no-op strict, la famille n'est pas « interrogée »
        family.queried = True
        if status not in (ApolloSearchStatus.OK, ApolloSearchStatus.EMPTY):
            family.down = True
            return
        family.answered = True
        for hit in hits:
            state.add(CONTACT_BASE, hit.model_dump())
        if state.base_settled():
            return


# ── (c) registre légal ─────────────────────────────────────────────────────


async def _from_registry(state: _Cascade) -> None:
    q = state.query
    family = state.families[LEGAL_REGISTRY]
    lookups = [q.org]
    lookups.append(q.org_clean if q.org_clean and q.org_clean != q.org else f"{q.org_clean or q.org} {q.display_name}")
    for lookup in lookups[:REGISTRY_MAX_LOOKUPS]:
        family.queried = True
        with watch_fetch_errors() as errors:
            try:
                company = await fetch_company(lookup)
            except Exception as exc:  # noqa: BLE001 — une source ne casse jamais la cascade
                errors.append(str(exc))
                company = None
        if errors:
            family.down = True
            continue
        family.answered = True
        if not isinstance(company, dict):
            continue
        company_name = str(company.get("name") or "")
        if not companies_correspond(q.org, company_name):
            continue
        found = False
        for dirigeant in company.get("dirigeants") or []:
            if not isinstance(dirigeant, dict):
                continue
            first, last = _split_registry_name(str(dirigeant.get("name") or ""))
            part = {
                "first_name": first,
                "last_name": last,
                "title": str(dirigeant.get("role") or ""),
                "organization_name": company_name,
            }
            found = state.add(LEGAL_REGISTRY, part) or found
        if found:
            return


# ── (d) recherche web ──────────────────────────────────────────────────────

_LINKEDIN_PROFILE = re.compile(r"linkedin\.com/in/", re.IGNORECASE)
_LINKEDIN_SUFFIX = re.compile(r"\s*[|\-–—]\s*LinkedIn\s*$", re.IGNORECASE)
_TITLE_SEPARATOR = re.compile(r"\s+[-–—|]\s+")
_AT_COMPANY = re.compile(r"\s+(?:chez|at|@)\s+(.+)$", re.IGNORECASE)
_EXPERIENCE = re.compile(r"(?:Expérience|Experience)\s*:\s*([^·|\n]+)", re.IGNORECASE)

WebSearch = Callable[..., Awaitable[list[dict]]]


def _parse_profile(row: dict, org_query: str) -> dict[str, Any] | None:
    url = str(row.get("url") or "")
    if not _LINKEDIN_PROFILE.search(url):
        return None
    title = _LINKEDIN_SUFFIX.sub("", str(row.get("title") or "")).strip()
    parts = [p.strip() for p in _TITLE_SEPARATOR.split(title) if p.strip()]
    if not parts:
        return None
    words = parts[0].split()
    if len(words) < 2:
        return None
    job, company = "", ""
    rest = parts[1:]
    if len(rest) >= 2:
        job, company = rest[0], rest[1]
    elif rest:
        if org_query and companies_correspond(org_query, rest[0]):
            company = rest[0]
        else:
            job = rest[0]
    if job and not company and (m := _AT_COMPANY.search(job)):
        job, company = job[: m.start()].strip(), m.group(1).strip()
    if not company and (m := _EXPERIENCE.search(str(row.get("description") or ""))):
        company = m.group(1).strip()
    return {
        "first_name": words[0],
        "last_name": " ".join(words[1:]),
        "title": job,
        "organization_name": company,
        "linkedin_url": url.split("?")[0].split("#")[0],
    }


def _web_engines() -> list[tuple[str, WebSearch]]:
    engines: list[tuple[str, WebSearch]] = []
    if os.environ.get("BRAVE_API_KEY", "").strip():
        engines.append(("brave", brave_search_single))
    if os.environ.get("SERPER_API_KEY", "").strip():
        engines.append(("serper", serper_search))
    return engines


async def _from_web(state: _Cascade) -> None:
    engines = _web_engines()
    if not engines:
        return  # sans clé : no-op strict
    q = state.query
    family = state.families[WEB]
    family.queried = True
    # #4386 — la marque nettoyée (« BellumAI » → « Bellum ») d'abord : c'est elle qu'un profil affiche.
    queries = [
        f"site:linkedin.com/in {q.display_name} {q.org_clean or q.org}".strip(),
        f"{q.display_name} {q.org}".strip(),
    ]
    budget = WEB_MAX_REQUESTS
    for query in queries:
        if state.solid() or budget == 0:
            return
        for provider, search in engines:
            if budget == 0:
                return
            budget -= 1
            with watch_fetch_errors() as errors:
                try:
                    rows = await search(query, limit=10)
                except Exception as exc:  # noqa: BLE001 — repli sur le moteur suivant
                    errors.append(str(exc))
                    rows = []
            # Une requête partie = une requête facturée, même vide (même règle que data_gateway).
            cost_ledger.record(provider, "search", units=1)
            if errors:
                family.down = True
                continue  # moteur en panne → moteur suivant, MÊME requête
            family.answered = True
            for row in rows or []:
                if isinstance(row, dict) and (profile := _parse_profile(row, q.org)):
                    state.add(WEB, profile)
            break


# ── Résultat ───────────────────────────────────────────────────────────────


class PersonNameSearchOutcome(BaseModel):
    hits: list[PersonNameSearchHit] = []
    status: str = "empty"
    sources_queried: list[PersonNameSourceQueried] = []


def _hit_id(cand: _Candidate) -> str:
    base_id = str(cand.parts.get(CONTACT_BASE, {}).get("id") or "")
    if base_id:
        return base_id
    if linkedin := normalize_linkedin_url(cand.get("linkedin_url")):
        return f"web:{linkedin}"
    name = normalize_person_name(f"{cand.get('first_name')} {cand.get('last_name')}")
    return f"{cand.sources[0]}:{name}|{_org_core(cand.get('organization_name'))}"


def _to_hit(state: _Cascade, cand: _Candidate) -> PersonNameSearchHit:
    data: dict[str, Any] = dict(cand.parts.get(CONTACT_BASE, {}))
    for name in _FIELD_PRIORITY:
        data[name] = cand.get(name)
    data["id"] = _hit_id(cand)
    data["sources"] = cand.sources
    data["match"] = state.match(cand)
    return PersonNameSearchHit(**data)


def _outcome(state: _Cascade) -> PersonNameSearchOutcome:
    ranked = sorted(
        state.candidates,
        key=lambda c: (_MATCH_RANK[state.match(c)], -len(c.sources), not c.get("linkedin_url")),
    )[:MAX_HITS]
    hits = [_to_hit(state, c) for c in ranked]
    queried: list[PersonNameSourceQueried] = []
    for family in _FAMILY_ORDER:
        fs = state.families[family]
        if not fs.queried:
            continue
        count = sum(1 for h in hits if family in h.sources)
        outcome = "found" if count else ("empty" if fs.answered else "down")
        queried.append(PersonNameSourceQueried(family=family, outcome=outcome, count=count))
    if hits:
        status = "ok"
    elif any(s.outcome != "down" for s in queried):
        status = "empty"
    elif queried:
        status = "down"
    else:
        status = "unconfigured"
    return PersonNameSearchOutcome(hits=hits, status=status, sources_queried=queried)


async def search_person_by_name(*, full_name: str, organization_name: str | None = None) -> PersonNameSearchOutcome:
    """#4386 — la cascade complète. Ne lève jamais : chaque source dégrade seule."""
    q = _Query.build(full_name, organization_name)
    if not q.tokens:
        return PersonNameSearchOutcome()

    try:
        cached = await provider_cache.get_json(_CACHE_NAMESPACE, q.cache_key)
    except Exception:  # noqa: BLE001 — le cache est une optimisation, jamais une dépendance
        cached = None
    if isinstance(cached, dict):
        return PersonNameSearchOutcome.model_validate(cached)

    state = _Cascade(query=q)
    await _from_contact_base(state)
    if not state.solid() and q.org:
        await _from_registry(state)
    if not state.solid():
        await _from_web(state)
    outcome = _outcome(state)

    # #4386 — journal : la requête NORMALISÉE (un nom et une entreprise, jamais un
    # e-mail ni un téléphone), les familles interrogées et le compte par famille.
    logger.info(
        "person name search: name=%r org=%r sources=%s hits=%d",
        " ".join(q.tokens),
        " ".join(_org_tokens(q.org)),
        " ".join(f"{s.family}={s.outcome}:{s.count}" for s in outcome.sources_queried) or "none",
        len(outcome.hits),
    )

    if outcome.hits and not any(fs.down for fs in state.families.values()):
        try:
            await provider_cache.set_json(
                _CACHE_NAMESPACE, q.cache_key, outcome.model_dump(), provider_cache.TTL_PERSON_NAME_SEARCH
            )
        except Exception:  # noqa: BLE001
            logger.debug("person name search: cache write skipped")
    return outcome
