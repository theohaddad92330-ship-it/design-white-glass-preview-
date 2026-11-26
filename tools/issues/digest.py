#!/usr/bin/env python3
"""Digest des retours du widget — ce qui décide, sans le bruit, en UN appel.

Pourquoi ce fichier existe. Mesuré le 09/09/2026 sur les 75 issues ouvertes du
canal `beta-feedback` : 497 243 caractères de corps pour 62 487 de texte humain
(12 %). Le reste est généré par le widget — élément pointé (28 %), fil des
actions (16 %), logs console (15 %), contexte (9 %) — et se lisait issue par
issue, 75 appels `gh issue view` pour le même lot. Le 06/09 déjà : 31 corps lus
un par un, 210 k caractères, alors que rien n'y dépendait de rien.

Ce que le digest GARDE, parce que c'est ce qui décide d'un retour :
  - le message humain (ce que la personne a vu et demandé) ;
  - le fichier:ligne pointé — le locator le plus précis du dépôt — et « non
    estampillé » quand il manque, parce que c'est un constat, pas un blanc ;
  - les requêtes en échec HORS bruit 401 (la salve d'ouverture), identiques
    comptées ×N — quatre `412` identiques sont souvent le vrai sujet ;
  - le build (donc le commit) qui tournait, la route, la capture ;
  - la série `N/M` du titre, la clé Linear, les commentaires humains, et si
    l'un d'eux cite déjà un commit ou une PR (« déjà du code ? »).

Ce qu'il JETTE : le markup, la chaîne de composants, les commandes de
localisation, le fil d'actions, les logs, le user agent. Ils restent sur GitHub
pour le diagnostic d'UNE issue ; ils n'ont rien à faire dans le tri de 75.

Groupé par ÉCRAN (volume décroissant, « sans route » en dernier — la même règle
que la vue « Par écran » du back-office), parce qu'un lot se livre par écran.

Usage :
  python3 tools/issues/digest.py                       # les issues ouvertes, en markdown
  python3 tools/issues/digest.py --screen /accounts    # un seul écran
  python3 tools/issues/digest.py --label beta-backoffice --json
  python3 tools/issues/digest.py --tri -o /tmp/tri.md  # une ligne par issue, pour tout trier d'un écran
  python3 tools/issues/digest.py -o /tmp/digest.md

`--limit` par défaut : 1000. Incident du 14/09/2026 : le canal portait 257
issues ouvertes, le digest en rendait 200 (l'ancien défaut, silencieusement)
— 57 issues absentes sans qu'aucune ligne ne le dise. Un plafond atteint
(`len(issues) == --limit`, mesuré juste après `gh issue list`, avant tout
`--screen`) se NOMME désormais : une bannière ⚠️ en tête de sortie (markdown
et json) et sur stderr — et `main()` rend **rc=3** (la sortie est écrite
quand même ; rc=3 dit seulement « le corpus est sans doute plus grand »).

Sans dépendance hors la bibliothèque standard et `gh`.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime

# Les sections du corps que ce fichier sait lire. La garde `test_digest.py`
# vérifie qu'elles sont toujours ÉCRITES par le constructeur côté API.
SECTIONS_LUES = ("Message", "Capture", "Élément pointé", "Requêtes en échec", "Contexte")
SANS_ROUTE = "(sans route)"
BOTS = frozenset({"linear-code"})
LINKBACK = "<!-- linear-linkback -->"
CHAMPS_GH = "number,title,body,labels,createdAt,url,comments"

_SECTION = re.compile(r"^### (.+?)\s*$", re.M)
_LOCATION = re.compile(r"`((?:apps|packages|tools|e2e)/[^`:\s]+?):(\d+)(?::\d+)?`")
_ROUTE = re.compile(r"(/[a-z][a-z0-9_-]*)")
_SERIE = re.compile(r"\b([1-9]\d?)/([1-9]\d?)\b")
_PUCE = re.compile(r"^(?:[-*•]|\d+[.)])\s")
# Ce qui fait d'une ligne une DEMANDE sans qu'elle porte de puce. Les corps
# écrits vite listent en prose : une ligne par élément, aucun tiret.
_OBLIGATION = re.compile(
    r"\b(doi[ts]|doivent|ne jamais|interdi(?:re|t|ts|te|tes)|évite[rz]?|obligatoire|il faut|ne plus)\b",
    re.I,
)
_CITATION = re.compile(r"^[\"\u201c\u00ab\u2018']")
_LINEAR = re.compile(r"linear\.app/[^\s\"'<>]*?/issue/([A-Z][A-Z0-9]+-\d+)")
_CODE_DEJA = re.compile(r"\b[0-9a-f]{7,40}\b|#\d{3,5}\b|\bPR\b|corrig[ée]|en prod", re.I)
_BUILD_COMMIT = re.compile(r"\+git([0-9a-f]{7,40})")


# ---------------------------------------------------------------------------
# Lecture d'un corps
# ---------------------------------------------------------------------------


def sections(body: str | None) -> dict[str, str]:
    """`### Nom` → texte de la section. La première occurrence d'un nom gagne."""
    parts = _SECTION.split(body or "")
    out: dict[str, str] = {}
    for i in range(1, len(parts) - 1, 2):
        out.setdefault(parts[i].strip(), parts[i + 1])
    return out


def message(body: str | None) -> str:
    """Le texte humain, sans la citation `> ` que le widget pose ligne à ligne."""
    lines = []
    for line in sections(body).get("Message", "").strip("\n").splitlines():
        if line.startswith("> "):
            lines.append(line[2:])
        elif line == ">":
            lines.append("")
        else:
            lines.append(line)
    return "\n".join(lines).strip()


def pointed(body: str | None) -> list[tuple[str, int]]:
    """Source puis parents, dans cet ordre, sans doublon. Le markup replié n'est pas lu."""
    section = sections(body).get("Élément pointé", "")
    out: list[tuple[str, int]] = []
    for line in section.splitlines():
        if line.startswith("<details"):
            break
        if not (line.startswith("- Source :") or line.startswith("- Parents :")):
            continue
        for path, num in _LOCATION.findall(line):
            loc = (path, int(num))
            if loc not in out:
                out.append(loc)
    return out[:4]


def non_estampille(body: str | None) -> bool:
    return "non estampillé" in sections(body).get("Élément pointé", "")


def failed_requests(body: str | None) -> tuple[list[str], int]:
    """Les requêtes en échec hors 401, identiques comptées ×N ; et le nombre de 401 jetés."""
    counts: Counter[str] = Counter()
    bruit = 0
    for row in sections(body).get("Requêtes en échec", "").splitlines():
        if not row.startswith("|"):
            continue
        cells = [c.strip() for c in row.strip().strip("|").split("|")]
        if len(cells) < 4 or cells[0] == "Heure" or set(cells[0]) <= {"-"}:
            continue
        _time, method, url, status = cells[:4]
        if status == "401":
            bruit += 1
            continue
        counts[f"{method} {url} → {status}"] += 1
    return [f"{k} (×{n})" if n > 1 else k for k, n in counts.items()], bruit


def context(body: str | None) -> dict[str, str | None]:
    section = sections(body).get("Contexte", "")

    def champ(nom: str) -> str | None:
        m = re.search(rf"^- {re.escape(nom)} : (.+)$", section, re.M)
        return m.group(1).strip() if m else None

    build_raw = champ("Build")
    build = build_raw.split("`")[1] if build_raw and "`" in build_raw else build_raw
    commit = _BUILD_COMMIT.search(build or "")
    return {
        "build": build,
        "commit": commit.group(1) if commit else None,
        "route": champ("Route"),
        "page": champ("Page"),
    }


def capture(body: str | None) -> str | None:
    m = re.search(r"!\[[^\]]*\]\(([^)]+)\)", sections(body).get("Capture", ""))
    return m.group(1) if m else None


# ---------------------------------------------------------------------------
# Lecture du titre, des labels, des commentaires
# ---------------------------------------------------------------------------


def screen_of(title: str) -> str:
    m = _ROUTE.search(title or "")
    return m.group(1) if m else SANS_ROUTE


def series_of(title: str) -> tuple[int, int] | None:
    """`3/9` déclare un dénominateur ; `09/09` est une date (zéro en tête) et ne compte pas."""
    for n, m in _SERIE.findall(title or ""):
        if int(n) <= int(m):
            return int(n), int(m)
    return None


def points(text: str) -> int:
    """Combien de demandes distinctes un corps porte — ligne par ligne.

    ⚠️ Un compteur de puces est AVEUGLE à la moitié du corpus : mesuré le
    12/09/2026, 30 issues ouvertes sur 62 n'en portent aucune, et l'une liste
    douze champs un par ligne sans tiret. Le zéro qu'il rendait ressemblait à
    « rien à découper ».

    Une ligne compte si elle porte une puce, se termine par `;` ou `?`, énonce
    une obligation, ou appartient à une suite de lignes courtes non ponctuées
    (la liste en prose). Une citation d'exemple ne compte pas : elle illustre la
    demande précédente, elle n'en est pas une.
    """
    n = 0
    suite_courte: list[int] = []
    for brute in (text or "").splitlines():
        ligne = brute.strip()
        if not ligne or _CITATION.search(ligne):
            n += len(suite_courte) if len(suite_courte) >= 2 else 0
            suite_courte = []
            continue
        if _PUCE.search(ligne) or ligne.endswith((";", "?")) or _OBLIGATION.search(ligne):
            n += 1
            suite_courte = []
            continue
        if len(ligne) <= 60 and not ligne.endswith((".", "!", ":", "…")):
            suite_courte.append(1)
            continue
        n += len(suite_courte) if len(suite_courte) >= 2 else 0
        suite_courte = []
    return n + (len(suite_courte) if len(suite_courte) >= 2 else 0)


def category(labels: list[dict]) -> str:
    names = {l.get("name", "") for l in labels or []}
    tags = [n.split(":", 1)[1] for n in names if n.startswith("feedback:")]
    if "beta-backoffice" in names:
        tags.append("back-office")
    if "beta-client" in names:
        tags.append("CLIENT")
    return ",".join(tags) or "—"


def human_comments(comments: list[dict]) -> list[dict]:
    return [c for c in comments or [] if (c.get("author") or {}).get("login") not in BOTS and LINKBACK not in (c.get("body") or "")]


def linear_key(comments: list[dict]) -> str | None:
    for c in comments or []:
        m = _LINEAR.search(c.get("body") or "")
        if m:
            return m.group(1)
    return None


def code_already(comments: list[dict]) -> bool:
    return any(_CODE_DEJA.search(c.get("body") or "") for c in human_comments(comments))


# ---------------------------------------------------------------------------
# Une issue → une entrée ; les entrées → des groupes ; les groupes → du texte
# ---------------------------------------------------------------------------


def digest_issue(issue: dict, max_message: int = 1500) -> dict:
    body = issue.get("body") or ""
    msg = message(body)
    rendu = msg if len(msg) <= max_message else msg[:max_message].rstrip() + f" [… {len(msg)} caractères, tronqué]"
    humains = human_comments(issue.get("comments") or [])
    dernier = humains[-1] if humains else None
    failed, bruit = failed_requests(body)
    return {
        "number": issue["number"],
        "title": (issue.get("title") or "")[:100],
        "url": issue.get("url"),
        "created": (issue.get("createdAt") or "")[:10],
        "screen": screen_of(issue.get("title") or ""),
        "category": category(issue.get("labels") or []),
        "series": series_of(issue.get("title") or ""),
        "message": msg,
        "message_rendu": rendu,
        "sans_message": msg == "",
        "points": points(msg),
        "pointed": pointed(body),
        "non_estampille": non_estampille(body),
        "failed": failed,
        "bruit_401": bruit,
        "context": context(body),
        "capture": capture(body),
        "linear": linear_key(issue.get("comments") or []),
        "comments_humains": len(humains),
        "dernier_commentaire": {"date": (dernier.get("createdAt") or "")[:10], "auteur": (dernier.get("author") or {}).get("login")} if dernier else None,
        "code_already": code_already(issue.get("comments") or []),
        "raw_chars": len(body),
        "human_chars": len(msg),
    }


def group_by_screen(entries: list[dict]) -> list[tuple[str, list[dict]]]:
    counts = Counter(e["screen"] for e in entries)
    screens = sorted(counts, key=lambda s: (s == SANS_ROUTE, -counts[s], s))
    return [(s, sorted((e for e in entries if e["screen"] == s), key=lambda e: e["number"])) for s in screens]


def stats(issues: list[dict], entries: list[dict]) -> dict:
    return {
        "n": len(issues),
        "screens": len({e["screen"] for e in entries}),
        "raw_chars": sum(len(i.get("body") or "") for i in issues),
        "human_chars": sum(e["human_chars"] for e in entries),
    }


def _n(x: int) -> str:
    return f"{x:,}".replace(",", " ")


def _entry_lines(e: dict) -> list[str]:
    serie = f" · série {e['series'][0]}/{e['series'][1]}" if e["series"] else ""
    lines = [f"### #{e['number']} [{e['category']}] {e['title']}{serie}"]
    meta = [f"humain {_n(e['human_chars'])} c", f"corps {_n(e['raw_chars'])} c", f"déposé {e['created']}"]
    if e["points"]:
        meta.append(f"points≈{e['points']}")
    if e["linear"]:
        meta.append(e["linear"])
    if e["comments_humains"]:
        d = e["dernier_commentaire"]
        meta.append(f"{e['comments_humains']} commentaire(s) humain(s), dernier le {d['date']} par {d['auteur']}")
    meta.append("déjà du code ? " + ("OUI, à vérifier" if e["code_already"] else "rien de cité"))
    lines.append(" · ".join(meta))
    constat = "élément non estampillé — c'est un constat, le prochain retour ici sera aveugle aussi"
    if e["pointed"]:
        lines.append("pointé : " + " · ".join(f"{p}:{n}" for p, n in e["pointed"]) + (f" · source : {constat} (parents seulement)" if e["non_estampille"] else ""))
    elif e["non_estampille"]:
        lines.append("pointé : " + constat)
    if e["failed"]:
        lines.append("non-401 : " + " · ".join(e["failed"]) + (f" · bruit 401 jeté : {e['bruit_401']}" if e["bruit_401"] else ""))
    ctx = e["context"]
    trace = [f"commit {ctx['commit']}" if ctx.get("commit") else (f"build {ctx['build']}" if ctx.get("build") else None), f"route {ctx['route']}" if ctx.get("route") else None, f"capture {e['capture']}" if e["capture"] else None]
    if any(trace):
        lines.append(" · ".join(t for t in trace if t))
    if e["sans_message"]:
        lines.append("⚠ sans message — le corps n'a pas de section Message : à ouvrir sur GitHub")
    else:
        lines.extend("> " + l for l in e["message_rendu"].splitlines())
    return lines


def tri_line(e: dict) -> str:
    """UNE ligne par issue, pour trier tout le corpus en un seul écran (--tri).

    Séparateur ` · `, champs vides omis — même esprit que `_entry_lines`, en
    tenant sur une ligne : numéro, catégorie (donc CLIENT si `beta-client` est
    posé, `category()` le porte déjà), volume humain, points≈, le pointeur le
    plus précis (basename:ligne, ou « non estampillé »), série, clé Linear,
    « déjà du code ? », date, titre tronqué à 60 caractères.
    """
    champs = [f"#{e['number']}"]
    if e["category"] != "—":
        champs.append(e["category"].replace(",", " · "))
    champs.append(f"humain {_n(e['human_chars'])} c")
    if e["points"]:
        champs.append(f"points≈{e['points']}")
    if e["non_estampille"]:
        champs.append("non estampillé")
    elif e["pointed"]:
        chemin, ligne = e["pointed"][0]
        champs.append(f"pointé {chemin.rsplit('/', 1)[-1]}:{ligne}")
    if e["series"]:
        champs.append(f"série {e['series'][0]}/{e['series'][1]}")
    if e["linear"]:
        champs.append(e["linear"])
    if e["code_already"]:
        champs.append("déjà du code ? OUI")
    champs.append(e["created"])
    titre = e["title"]
    champs.append(titre[:60].rstrip() + "…" if len(titre) > 60 else titre)
    return " · ".join(champs)


def tri_fields(e: dict) -> dict:
    """Les champs d'une ligne --tri, pour --tri --json : jamais `message`/`message_rendu`."""
    return {
        "number": e["number"],
        "category": e["category"],
        "human_chars": e["human_chars"],
        "points": e["points"],
        "non_estampille": e["non_estampille"],
        "pointed": e["pointed"][0] if e["pointed"] else None,
        "series": e["series"],
        "linear": e["linear"],
        "code_already": e["code_already"],
        "created": e["created"],
        "title": e["title"],
    }


def render(groups: list[tuple[str, list[dict]]], st: dict, source: str = "gh issue list", tri: bool = False) -> str:
    corps = []
    for screen, entries in groups:
        corps.append(f"\n## {screen} — {len(entries)} issue(s)\n")
        if tri:
            corps.extend(tri_line(e) for e in entries)
        else:
            for e in entries:
                corps.append("\n".join(_entry_lines(e)))
                corps.append("")
    body = "\n".join(corps)
    ratio = st["raw_chars"] / max(len(body), 1)
    part = f"{100 * st['human_chars'] // st['raw_chars']} %" if st["raw_chars"] else "—"
    head = (
        f"# Digest des retours — {st['n']} issue(s) · {st['screens']} écran(s) · corps {_n(st['raw_chars'])} c → digest {_n(len(body))} c (×{ratio:.1f}) · humain {_n(st['human_chars'])} c ({part})\n"
        f"_Généré le {datetime.now():%Y-%m-%d %H:%M} · `python3 tools/issues/digest.py` · source : `{source}` · les corps bruts restent sur GitHub._\n"
    )
    return head + body


# ---------------------------------------------------------------------------
# gh
# ---------------------------------------------------------------------------


def fetch(repo: str | None, state: str, limit: int, label: str | None) -> tuple[list[dict], str]:
    cmd = ["gh", "issue", "list", "--state", state, "--limit", str(limit), "--json", CHAMPS_GH]
    if repo:
        cmd += ["-R", repo]
    if label:
        cmd += ["--label", label]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(f"gh a rendu rc={r.returncode} :\n{r.stderr}")
        sys.exit(2)
    return json.loads(r.stdout or "[]"), " ".join(cmd)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Digest des retours du widget, groupé par écran, en un appel gh.")
    p.add_argument("--repo", "-R", help="owner/repo (défaut : le dépôt courant)")
    p.add_argument("--state", default="open", choices=["open", "closed", "all"])
    p.add_argument("--limit", type=int, default=1000)
    p.add_argument("--label", help="un label GitHub, ex. beta-backoffice")
    p.add_argument("--screen", help="ne garder qu'un écran, ex. /accounts")
    p.add_argument("--max-message", type=int, default=1500, help="caractères du message humain rendus (défaut 1500)")
    p.add_argument("--tri", action="store_true", help="une ligne par issue, pour trier tout le corpus en un seul écran")
    p.add_argument("--json", action="store_true", help="les entrées en JSON au lieu du markdown")
    p.add_argument("-o", "--output", help="fichier de sortie (défaut : stdout)")
    a = p.parse_args(argv)

    issues, source = fetch(a.repo, a.state, a.limit, a.label)
    # #14/09/2026 : un plafond atteint se NOMME — mesuré ici, avant --screen,
    # sur le corpus brut tel que rendu par `gh issue list`.
    plafond_atteint = len(issues) == a.limit
    banniere = (
        f"⚠️ PLAFOND ATTEINT — {a.limit} issues rendues = --limit {a.limit} : "
        "le corpus est sans doute plus grand, relancer avec --limit <plus grand>"
    )
    entries = [digest_issue(i, a.max_message) for i in issues]
    if a.screen:
        keep = {e["number"] for e in entries if e["screen"] == a.screen}
        issues = [i for i in issues if i["number"] in keep]
        entries = [e for e in entries if e["number"] in keep]
    if not issues:
        sys.stderr.write(f"0 issue pour « {source} » (gh rc=0 : c'est une mesure, pas une panne)\n")
    if plafond_atteint:
        sys.stderr.write(banniere + "\n")

    if a.json:
        data = [tri_fields(e) for e in entries] if a.tri else entries
        payload = {"plafond_atteint": True, "issues": data} if plafond_atteint else data
        out = json.dumps(payload, ensure_ascii=False, indent=1)
    else:
        rendu = render(group_by_screen(entries), stats(issues, entries), source, tri=a.tri)
        out = f"{banniere}\n\n{rendu}" if plafond_atteint else rendu

    if a.output:
        with open(a.output, "w", encoding="utf-8") as f:
            f.write(out + "\n")
        sys.stderr.write(f"{a.output} : {_n(len(out))} caractères pour {len(issues)} issue(s)\n")
    else:
        print(out)
    return 3 if plafond_atteint else 0


if __name__ == "__main__":
    sys.exit(main())
