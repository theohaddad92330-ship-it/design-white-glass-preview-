"""Tout appel sortant passe par le limiteur PARTAGÉ — pas seulement ses voisins.

PR #631 a mesuré ce que coûte l'oubli d'UN appelant : ``search_companies`` était
la seule fonction de son hôte à ne pas passer par ``throttle``, alors que
``list_companies`` juste à côté le faisait. Résultat : 429 en rafale, chaque 429
dégradé en ``[]``, lu comme « aucun candidat », affiché comme « homonymie non
tranchée ». **79,5 % des entreprises jetées pour une panne d'infrastructure
présentée à l'utilisateur comme un fait de marché.**

Deux formes se généralisent, et ce fichier verrouille les deux :

1. **Le voisin non limité** — même hôte, un appelant dedans, un appelant dehors.
   Personne ne le voit parce que le chemin limité, lui, marche.
2. **La clé fantôme** — ``_DEFAULTS`` documente ``bodacc: 60 rpm``, ``insee:
   30 rpm``, ``france_travail``, ``inpi``… et AUCUN site d'appel ne les utilise.
   Le budget affiché n'était appliqué nulle part : la doc décrivait une limite
   qui n'existait pas.

Le test structurel du bas est le vrai garde-fou : il énumère les clés déclarées
et échoue dès qu'une redevient orpheline, pour qu'un futur provider ne puisse pas
répéter #631 en silence.
"""

from __future__ import annotations

import ast
import pathlib
from unittest.mock import patch

import pytest

APP_DIR = pathlib.Path(__file__).resolve().parents[1] / "app"


class _FakeResponse:
    """Réponse 200 minimale — le corps n'a pas d'importance ici, seul compte le
    fait que la requête soit partie APRÈS être passée par le limiteur."""

    def __init__(self, payload: object) -> None:
        self._payload = payload
        self.status_code = 200
        self.is_success = True
        self.headers: dict[str, str] = {}
        self.text = ""
        self.content = b"{}"

    def json(self) -> object:
        return self._payload

    def raise_for_status(self) -> None:
        return None


class _FakeClient:
    def __init__(self, payload: object) -> None:
        self._payload = payload
        self.calls: list[tuple] = []

    async def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return _FakeResponse(self._payload)

    async def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return _FakeResponse(self._payload)

    async def aclose(self) -> None:
        return None


def _throttle_spy(module):
    """Remplace ``module.throttle`` par un espion qui délègue au vrai limiteur.

    On garde le vrai comportement (le test prouve le passage, pas un mock) et on
    enregistre la clé demandée — c'est elle qui dit si le budget appliqué est
    bien celui que la doc annonce.
    """
    seen: list[str] = []
    real = module.throttle

    def _spy(provider: str):
        seen.append(provider)
        return real(provider)

    return seen, patch.object(module, "throttle", _spy)


# ── 1. Le voisin non limité : même hôte, un appelant dehors ──────────────────


@pytest.mark.asyncio
async def test_fetch_company_uses_the_same_bucket_as_its_siblings() -> None:
    """``recherche-entreprises`` a TROIS appelants. #631 en a limité deux.

    ``fetch_company`` est le troisième et tape exactement le même hôte, sur le
    chemin d'analyse principal (identité + dirigeants). Le laisser dehors, c'est
    garder ouverte la porte par laquelle #631 est entré : la limite mesurée par
    le serveur est par IP, elle ne distingue pas nos fonctions.
    """
    from app.services.data_sources import recherche_entreprises as re_src

    seen, spy = _throttle_spy(re_src)
    client = _FakeClient({"results": [{"siren": "123456789", "nom_complet": "ACME"}]})
    with spy:
        await re_src.fetch_company("ACME", client=client)

    assert "recherche_entreprises" in seen, (
        "fetch_company partage l'hôte de search_companies/list_companies : "
        "il doit partager leur bucket, sinon le budget par IP est faux"
    )
    assert client.calls, "la requête doit tout de même partir"


@pytest.mark.asyncio
async def test_brave_persona_search_uses_the_shared_brave_bucket() -> None:
    """Le fallback contacts tape ``api.search.brave.com`` en direct.

    ``brave_search.py``, ``brave_news.py`` et ``data_gateway.py`` passent tous
    par ``throttle("brave")`` ; ce chemin-ci, non — et il part en éventail de 5
    personas d'un coup (``asyncio.gather``, phase2_contacts.py:150). C'est la
    forme #631 exacte, sur une clé PAYANTE : le dépassement se paie deux fois
    (429 + quota consommé).
    """
    from app.routers import phase2_contacts

    seen, spy = _throttle_spy(phase2_contacts)
    client = _FakeClient({"web": {"results": []}})
    with spy:
        await phase2_contacts._persona_query(client, "ACME", "DSI")

    assert "brave" in seen, "le fallback Brave doit partager le bucket brave"
    assert client.calls, "la requête doit tout de même partir"


# ── 2. Les clés fantômes : documentées, jamais appliquées ────────────────────


@pytest.mark.asyncio
async def test_insee_search_applies_its_documented_cap() -> None:
    """``insee: 30 rpm`` est la VRAIE limite publiée par Sirene, et elle n'était
    appliquée nulle part. INSEE 429 sur dépassement — un 429 ici revenait en
    ``[]``, c'est-à-dire « aucune unité légale de ce nom »."""
    from app.services import insee_sirene

    seen, spy = _throttle_spy(insee_sirene)
    client = _FakeClient({"unitesLegales": []})
    with spy, patch.object(insee_sirene, "insee_api_key", lambda: "k"):
        await insee_sirene.search_unites_legales("ACME", client=client)

    assert "insee" in seen
    assert client.calls


@pytest.mark.asyncio
async def test_insee_naf_batches_are_throttled_per_batch() -> None:
    """``naf_by_sirens`` boucle sur des LOTS. Une boucle non limitée est le pire
    cas : elle envoie N requêtes aussi vite que le réseau l'accepte."""
    from app.services import insee_sirene

    seen, spy = _throttle_spy(insee_sirene)
    client = _FakeClient({"unitesLegales": []})
    sirens = [str(100000000 + i) for i in range(insee_sirene._SIREN_BATCH * 2 + 1)]
    with spy, patch.object(insee_sirene, "insee_api_key", lambda: "k"):
        await insee_sirene.naf_by_sirens(sirens, client=client)

    assert seen.count("insee") == len(client.calls) >= 2, (
        "chaque lot est une requête sortante : chacun doit prendre un jeton"
    )


@pytest.mark.asyncio
async def test_insee_etablissements_are_throttled() -> None:
    from app.services import insee_sirene

    seen, spy = _throttle_spy(insee_sirene)
    client = _FakeClient({"etablissements": []})
    with spy, patch.object(insee_sirene, "insee_api_key", lambda: "k"):
        await insee_sirene.etablissements_by_siren("123456789", client=client)

    assert "insee" in seen
    assert client.calls


@pytest.mark.asyncio
async def test_bodacc_is_throttled() -> None:
    """``bodacc: 60 rpm`` était déclaré et orphelin. Le miroir Opendatasoft est
    public et sans clé : le budget est par IP, donc partagé par TOUS nos runs."""
    from app.services.data_sources import bodacc

    seen, spy = _throttle_spy(bodacc)
    client = _FakeClient({"records": []})
    with spy:
        await bodacc._legal_signals_uncached("123456789", limit=8, client=client)

    assert "bodacc" in seen
    assert client.calls


@pytest.mark.asyncio
async def test_france_travail_token_and_search_are_throttled() -> None:
    """OAuth + recherche tapent le même hôte. Le token est demandé à CHAQUE
    appel et la recherche part en DEUX requêtes parallèles (M18 + large)."""
    from app.services.data_sources import france_travail

    seen, spy = _throttle_spy(france_travail)
    client = _FakeClient({"access_token": "t", "resultats": []})
    with spy:
        await france_travail._token(client, "id", "secret")
        await france_travail._search(client, "tok", {})

    assert seen.count("france_travail") == 2, "le token ET la recherche consomment le quota"


@pytest.mark.asyncio
async def test_inpi_token_and_lookup_are_throttled() -> None:
    from app.services.data_sources import inpi_rne

    seen, spy = _throttle_spy(inpi_rne)
    client = _FakeClient({"token": "t"})
    with spy:
        await inpi_rne._token(client, "u", "p")

    assert "inpi" in seen


# ── 3. Sources publiques sans clé : budget par IP, aucun bucket du tout ──────


@pytest.mark.asyncio
async def test_decp_is_throttled() -> None:
    """DECP (data.economie.gouv.fr) n'avait AUCUNE clé de limiteur. Source
    publique sans authentification : la seule chose qui nous distingue d'un
    abuseur, côté serveur, c'est notre débit."""
    from app.services.data_sources import decp

    seen, spy = _throttle_spy(decp)
    client = _FakeClient({"results": []})
    with spy:
        await decp.awarded_it_contracts("123456789", client=client)

    assert "decp" in seen
    assert client.calls


@pytest.mark.asyncio
async def test_boamp_is_throttled() -> None:
    from app.services.data_sources import public_tenders

    seen, spy = _throttle_spy(public_tenders)
    client = _FakeClient({"results": []})
    with spy:
        await public_tenders.public_tenders("ACME", client=client)

    assert "boamp" in seen
    assert client.calls


@pytest.mark.asyncio
async def test_github_anon_quota_is_throttled() -> None:
    """GitHub anonyme = **60 requêtes/heure**, le plafond le plus bas de toute
    la stack, et ``org_tech_signals`` en dépense 3-4 par entreprise. Sans
    limiteur, ~17 analyses épuisent l'heure entière pour toute l'instance."""
    from app.services.data_sources import github_org

    seen, spy = _throttle_spy(github_org)
    client = _FakeClient({"login": "acme"})
    with spy:
        await github_org._get(client, "https://api.github.com/orgs/acme")

    assert "github" in seen
    assert client.calls


# ── 4. Le garde-fou structurel : plus jamais de clé orpheline ────────────────


def _throttle_keys_used_in_source() -> set[str]:
    """Toutes les clés littérales passées à ``throttle(...)`` dans ``app/``."""
    used: set[str] = set()
    # Les clés indirectes (``throttle(SOURCE_NAME)``) sont résolues via la
    # constante du module, sinon un renommage les rendrait invisibles ici.
    constants: dict[pathlib.Path, dict[str, str]] = {}
    for path in APP_DIR.rglob("*.py"):
        tree = ast.parse(path.read_text())
        consts: dict[str, str] = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant):
                for target in node.targets:
                    if isinstance(target, ast.Name) and isinstance(node.value.value, str):
                        consts[target.id] = node.value.value
        constants[path] = consts

    for path, consts in constants.items():
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)):
                continue
            # #3925.a — ``throttle_per_domain(key, host)`` applique le budget de ``key``.
            if node.func.id not in ("throttle", "throttle_per_domain") or not node.args:
                continue
            arg = node.args[0]
            if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                used.add(arg.value)
            elif isinstance(arg, ast.Name) and arg.id in consts:
                used.add(consts[arg.id])
            elif isinstance(arg, ast.JoinedStr) and arg.values:
                # #3085.1 — ``throttle(f"{BASE}@{user_id}")`` : le budget de BASE, appliqué par portée.
                head = arg.values[0]
                if isinstance(head, ast.FormattedValue) and isinstance(head.value, ast.Name):
                    if head.value.id in consts:
                        used.add(consts[head.value.id])
    return used


def test_every_declared_throttle_key_has_at_least_one_call_site() -> None:
    """Une clé dans ``_DEFAULTS`` est une PROMESSE de débit.

    ``bodacc``, ``insee``, ``france_travail`` et ``inpi`` étaient déclarées avec
    un rpm documenté dans la docstring du limiteur — et zéro site d'appel. La
    doc décrivait une limite qui n'était appliquée nulle part, ce qui est pire
    qu'une limite absente : on la croyait tenue.

    Ce test échoue dès qu'une clé redevient orpheline. Si une clé est
    volontairement retirée du service, il faut la retirer de ``_DEFAULTS`` —
    pas laisser la promesse traîner.
    """
    from app.services.rate_limiter import _DEFAULTS

    used = _throttle_keys_used_in_source()
    orphans = sorted(set(_DEFAULTS) - used)
    assert not orphans, (
        f"clés déclarées mais jamais appliquées : {orphans}. "
        "Un budget documenté et non câblé a coûté 79,5 % des résultats dans #631."
    )


def test_every_throttle_key_used_is_declared() -> None:
    """Le miroir : ``throttle(\"typo\")`` tombe sur le défaut conservateur
    (30 rpm) en silence. Mieux vaut l'attraper ici."""
    from app.services.rate_limiter import _DEFAULTS

    unknown = sorted(_throttle_keys_used_in_source() - set(_DEFAULTS))
    assert not unknown, f"clés utilisées mais non déclarées dans _DEFAULTS : {unknown}"
