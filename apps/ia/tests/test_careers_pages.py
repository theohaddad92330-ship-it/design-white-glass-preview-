"""Pages carrières publiques — offres balisées JSON-LD `JobPosting` (#3925.1).

Aucun réseau : le client HTTP est un faux qui répond selon l'URL (404 pour tout
le reste) et enregistre chaque requête. Le contrat tenu ici est la frontière
c79 « on collecte largement, tant que c'est PROPRE » : robots.txt respecté (un
chemin interdit n'est JAMAIS requêté), user-agent honnête, un 403/429/captcha
arrête le domaine, plafonds durs.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import safe_fetch
from app.services.data_sources import careers_pages
from app.services.data_sources.careers_pages import it_job_signals_careers


def _days(n: int) -> str:
    return (datetime.now(UTC) + timedelta(days=n)).date().isoformat()


def _resp(text: str = "", status: int = 200, headers: dict | None = None) -> httpx.Response:
    return httpx.Response(status, text=text, headers=headers or {}, request=httpx.Request("GET", "https://x"))


def _page(*blocks: object) -> str:
    scripts = "".join(f'<script type="application/ld+json">{json.dumps(b)}</script>' for b in blocks)
    return f"<html><head>{scripts}</head><body>Carrières</body></html>"


def _posting(title: str = "Développeur Python", *, org: str | None = "Acme", **extra: object) -> dict:
    job: dict = {
        "@type": "JobPosting",
        "title": title,
        "datePosted": _days(-10),
        "validThrough": _days(30),
        "jobLocation": {"@type": "Place", "address": {"addressLocality": "Paris", "addressCountry": "FR"}},
        "url": f"https://acme.com/carrieres/{title.lower().replace(' ', '-')}",
    }
    if org is not None:
        job["hiringOrganization"] = {"@type": "Organization", "name": org}
    job.update(extra)
    return job


def _sitemap(*urls: str) -> str:
    body = "".join(f"<url><loc>{u}</loc></url>" for u in urls)
    return f'<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>'


class _Net:
    """Faux client : routes exactes, 404 sinon, journal des URLs requêtées."""

    def __init__(self, routes: dict[str, httpx.Response]) -> None:
        self.routes = routes
        self.calls: list[str] = []
        self.headers_seen: list[dict] = []
        self.client = AsyncMock(spec=httpx.AsyncClient)

        async def _get(url, *_a, **kw):
            self.calls.append(str(url))
            self.headers_seen.append(dict(kw.get("headers") or {}))
            return self.routes.get(str(url), _resp("not found", 404))

        self.client.get = AsyncMock(side_effect=_get)


@pytest.fixture(autouse=True)
def _isolation(monkeypatch):
    careers_pages._ROBOTS_CACHE.clear()
    careers_pages._LAST_HIT.clear()
    sleeps: list[float] = []
    degradations: list[tuple[str, str]] = []

    async def _fake_sleep(s: float) -> None:
        sleeps.append(s)

    monkeypatch.setattr(careers_pages, "_sleep", _fake_sleep)
    # Pas de DNS en test : tout nom résout vers une IP publique (garde SSRF, audit IA M5).
    monkeypatch.setattr(safe_fetch, "_getaddrinfo_ips", AsyncMock(return_value=["93.184.216.34"]))
    monkeypatch.setattr(
        careers_pages, "record_degradation", lambda _cid, *, source, reason, code="": degradations.append((source, reason))
    )
    return sleeps, degradations


@pytest.fixture
def sleeps(_isolation):
    return _isolation[0]


@pytest.fixture
def degradations(_isolation):
    return _isolation[1]


_SITE = "https://acme.com"


def _site(page_body: str, *, robots: httpx.Response | None = None, page_path: str = "/carrieres") -> _Net:
    return _Net(
        {
            f"{_SITE}/robots.txt": robots or _resp("", 404),
            f"{_SITE}/sitemap.xml": _resp(_sitemap(f"{_SITE}{page_path}", f"{_SITE}/produits")),
            f"{_SITE}{page_path}": _resp(page_body),
        }
    )


@pytest.mark.asyncio
async def test_sans_domaine_aucun_reseau() -> None:
    net = _Net({})
    assert await it_job_signals_careers("Acme", None, client=net.client) == []
    assert await it_job_signals_careers("Acme", "  ", client=net.client) == []
    assert net.calls == []


@pytest.mark.asyncio
async def test_json_ld_simple() -> None:
    net = _site(_page(_posting()))
    out = await it_job_signals_careers("Acme", "https://www.acme.com/", client=net.client)
    # « www. » est écarté : le domaine du compte est acme.com
    assert len(out) == 1
    job = out[0]
    assert job["title"] == "Développeur Python"
    assert job["location"] == "Paris"
    assert job["company"] == "Acme"
    assert job["date"] == _days(-10)
    assert job["url"] == f"{_SITE}/carrieres/développeur-python"
    assert job["sourceUrl"] == f"{_SITE}/carrieres"
    assert job["source"] == "careers_page"


@pytest.mark.asyncio
async def test_graph_et_liste() -> None:
    graph = {"@context": "https://schema.org", "@graph": [{"@type": "WebSite"}, _posting("Ingénieur DevOps")]}
    listing = [_posting("Data Engineer"), _posting("Développeur Java")]
    net = _site(_page(graph, listing))
    titles = {j["title"] for j in await it_job_signals_careers("Acme", "acme.com", client=net.client)}
    assert titles == {"Ingénieur DevOps", "Data Engineer", "Développeur Java"}


@pytest.mark.asyncio
async def test_expire_et_trop_ancienne_ecartees() -> None:
    expired = _posting("Développeur PHP", validThrough=_days(-2))
    old = _posting("Développeur Go", datePosted=_days(-400))
    ok = _posting("Développeur Rust")
    net = _site(_page(expired, old, ok))
    out = await it_job_signals_careers("Acme", "acme.com", client=net.client)
    # Lot 762 : l'annonce échue et l'ancienne sont STOCKÉES estampillées ``historical``, jamais jetées.
    by_title = {j["title"]: j for j in out}
    assert set(by_title) == {"Développeur PHP", "Développeur Go", "Développeur Rust"}
    assert by_title["Développeur PHP"].get("historical") is True
    assert by_title["Développeur Go"].get("historical") is True
    assert not by_title["Développeur Rust"].get("historical")


@pytest.mark.asyncio
async def test_autre_employeur_ecarte_absent_garde() -> None:
    other = _posting("Développeur Scala", org="Globex Industries")
    anonymous = _posting("Développeur Kotlin", org=None)
    same = _posting("Développeur Swift", org="Acme France SAS")
    net = _site(_page(other, anonymous, same))
    titles = {j["title"] for j in await it_job_signals_careers("Acme", "acme.com", client=net.client)}
    assert titles == {"Développeur Kotlin", "Développeur Swift"}


@pytest.mark.asyncio
async def test_homonyme_plus_long_ecarte_meme_controle_que_les_offres() -> None:
    # #3915.a — un mot en commun ne suffit plus : « Acme Bakery » n'est pas « Acme ».
    longer = _posting("Développeur Go", org="Acme Bakery")
    group = _posting("Développeur Java", org="Groupe Acme")
    net = _site(_page(longer, group))
    titles = {j["title"] for j in await it_job_signals_careers("Acme", "acme.com", client=net.client)}
    assert titles == {"Développeur Java"}


@pytest.mark.asyncio
async def test_metier_non_it_ecarte_sauf_tous_roles() -> None:
    net = _site(_page(_posting("Responsable des ventes"), _posting("Développeur Python")))
    out = await it_job_signals_careers("Acme", "acme.com", client=net.client)
    assert [j["title"] for j in out] == ["Développeur Python"]
    net2 = _site(_page(_posting("Responsable des ventes")))
    out2 = await it_job_signals_careers("Acme", "acme.com", all_roles=True, client=net2.client)
    assert [j["title"] for j in out2] == ["Responsable des ventes"]


@pytest.mark.asyncio
async def test_robots_interdit_aucune_requete_et_refus_note(degradations) -> None:
    robots = _resp("User-agent: *\nDisallow: /carrieres\n")
    net = _site(_page(_posting()), robots=robots)
    out = await it_job_signals_careers("Acme", "acme.com", client=net.client)
    assert out == []
    assert f"{_SITE}/carrieres" not in net.calls
    assert any("robots" in reason for _src, reason in degradations)
    assert all(src == "careers_pages" for src, _ in degradations)


@pytest.mark.asyncio
async def test_robots_interdit_tout_le_site_ne_requete_que_robots(degradations) -> None:
    net = _site(_page(_posting()), robots=_resp("User-agent: *\nDisallow: /\n"))
    assert await it_job_signals_careers("Acme", "acme.com", client=net.client) == []
    assert net.calls == [f"{_SITE}/robots.txt"]


@pytest.mark.asyncio
async def test_sitemap_declare_dans_robots() -> None:
    robots = _resp(f"User-agent: *\nAllow: /\nSitemap: {_SITE}/plan.xml\n")
    net = _Net(
        {
            f"{_SITE}/robots.txt": robots,
            f"{_SITE}/plan.xml": _resp(_sitemap(f"{_SITE}/nous-rejoindre")),
            f"{_SITE}/nous-rejoindre": _resp(_page(_posting())),
        }
    )
    out = await it_job_signals_careers("Acme", "acme.com", client=net.client)
    assert len(out) == 1


@pytest.mark.asyncio
async def test_403_sur_une_page_arrete_le_domaine(degradations) -> None:
    net = _Net(
        {
            f"{_SITE}/robots.txt": _resp("", 404),
            f"{_SITE}/sitemap.xml": _resp(_sitemap(f"{_SITE}/carrieres", f"{_SITE}/jobs", f"{_SITE}/emploi")),
            f"{_SITE}/carrieres": _resp("Forbidden", 403),
            f"{_SITE}/jobs": _resp(_page(_posting())),
            f"{_SITE}/emploi": _resp(_page(_posting())),
        }
    )
    out = await it_job_signals_careers("Acme", "acme.com", client=net.client)
    assert out == []
    assert net.calls.count(f"{_SITE}/carrieres") == 1  # pas de retry insistant
    assert f"{_SITE}/jobs" not in net.calls and f"{_SITE}/emploi" not in net.calls
    assert degradations


@pytest.mark.asyncio
async def test_429_et_captcha_arretent() -> None:
    net = _Net(
        {
            f"{_SITE}/robots.txt": _resp("", 404),
            f"{_SITE}/sitemap.xml": _resp(_sitemap(f"{_SITE}/carrieres", f"{_SITE}/jobs")),
            f"{_SITE}/carrieres": _resp("<html>Please solve this CAPTCHA to continue</html>"),
            f"{_SITE}/jobs": _resp(_page(_posting())),
        }
    )
    assert await it_job_signals_careers("Acme", "acme.com", client=net.client) == []
    assert f"{_SITE}/jobs" not in net.calls

    careers_pages._ROBOTS_CACHE.clear()
    net2 = _Net({f"{_SITE}/robots.txt": _resp("", 429, {"Retry-After": "60"})})
    assert await it_job_signals_careers("Acme", "acme.com", client=net2.client) == []
    assert net2.calls == [f"{_SITE}/robots.txt"]


@pytest.mark.asyncio
async def test_plafonds_pages_et_sitemaps() -> None:
    pages = [f"{_SITE}/carrieres/p{i}" for i in range(10)]
    routes: dict[str, httpx.Response] = {
        f"{_SITE}/robots.txt": _resp("", 404),
        f"{_SITE}/sitemap.xml": _resp(_sitemap(*pages)),
        f"{_SITE}/sitemap_index.xml": _resp(_sitemap()),
        f"{_SITE}/troisieme.xml": _resp(_sitemap()),
    }
    for p in pages:
        routes[p] = _resp(_page(_posting(f"Développeur {p[-1]}", url=p)))
    robots = f"User-agent: *\nSitemap: {_SITE}/troisieme.xml\n"
    routes[f"{_SITE}/robots.txt"] = _resp(robots)
    net = _Net(routes)
    await it_job_signals_careers("Acme", "acme.com", limit=20, client=net.client)
    fetched_pages = [c for c in net.calls if "/carrieres/p" in c]
    fetched_maps = [c for c in net.calls if c.endswith(".xml")]
    assert len(fetched_pages) == 5
    assert len(fetched_maps) == 2


@pytest.mark.asyncio
async def test_reponse_trop_grosse_ignoree() -> None:
    huge = _resp(_page(_posting()) + "x" * (2 * 1024 * 1024 + 10))
    net = _site("", page_path="/carrieres")
    net.routes[f"{_SITE}/carrieres"] = huge
    assert await it_job_signals_careers("Acme", "acme.com", client=net.client) == []


@pytest.mark.asyncio
async def test_user_agent_honnete_et_cadence(sleeps) -> None:
    net = _site(_page(_posting()))
    await it_job_signals_careers("Acme", "acme.com", client=net.client)
    uas = {h.get("User-Agent", "") for h in net.headers_seen}
    assert len(uas) == 1
    ua = uas.pop()
    assert "bellum" in ua.lower() and "mozilla" not in ua.lower()
    assert all("Cookie" not in h and "Authorization" not in h for h in net.headers_seen)
    # ≥ 1 s entre deux requêtes sur le même hôte
    assert sleeps and max(sleeps) >= 0.9


@pytest.mark.asyncio
async def test_echec_reseau_donne_liste_vide(degradations) -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=httpx.ConnectError("boom"))
    assert await it_job_signals_careers("Acme", "acme.com", client=client) == []


# ── Audit IA M5 : garde SSRF avant toute requête ─────────────────────────────


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "domain",
    ["169.254.169.254", "http://127.0.0.1/carrieres", "10.0.0.5", "[::1]", "::ffff:169.254.169.254", "localhost"],
)
async def test_domaine_ip_ou_interne_aucun_reseau(domain: str) -> None:
    net = _Net({})
    assert await it_job_signals_careers("Acme", domain, client=net.client) == []
    assert net.calls == []


@pytest.mark.asyncio
async def test_nom_resolu_vers_ip_privee_aucune_requete(monkeypatch, degradations) -> None:
    monkeypatch.setattr(safe_fetch, "_getaddrinfo_ips", AsyncMock(return_value=["10.1.2.3"]))
    net = _site(_page(_posting()))
    assert await it_job_signals_careers("Acme", "acme.com", client=net.client) == []
    assert net.calls == []
    assert any("non publique" in reason for _s, reason in degradations)


@pytest.mark.asyncio
async def test_redirection_vers_hote_prive_non_suivie(monkeypatch) -> None:
    answers = {"acme.com": ["93.184.216.34"], "www.acme.com": ["169.254.169.254"]}
    monkeypatch.setattr(safe_fetch, "_getaddrinfo_ips", AsyncMock(side_effect=lambda h: answers[h]))
    net = _Net({f"{_SITE}/robots.txt": _resp("", 404), f"{_SITE}/sitemap.xml": _resp("", 301, {"location": "https://www.acme.com/x"})})
    await it_job_signals_careers("Acme", "acme.com", client=net.client)
    assert all("169.254" not in c and "www.acme.com" not in c for c in net.calls)
