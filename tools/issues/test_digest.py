"""Garde du digest des retours — elle doit prouver DEUX choses (CLAUDE.md).

Le corpus du widget de signalement est à **88 % du contexte généré** : mesuré le
09/09/2026 sur 75 issues ouvertes, 497 243 caractères de corps pour 62 487 de
texte humain. Les lire un par un coûte 75 appels et sept fois le contexte utile.
Le digest ne garde que ce qui décide : le message, le fichier:ligne pointé, les
requêtes en échec hors bruit 401, le build, l'écran.

  1. **Elle LIT vraiment.** `test_lit_les_noms_de_section_du_constructeur` ouvre
     le VRAI constructeur du corps (`feedback.service.ts`) et exige que chaque
     section que le digest sait lire y soit écrite. Un renommage côté API rend
     le digest aveugle — et ce test rouge.
  2. **Elle sait dire NON.** Un corps sans `### Message` ne rend pas un message
     vide qui passe pour « rien à dire » : il est NOMMÉ « sans message ». Un
     élément non estampillé est un constat, pas un blanc.
"""

from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

ICI = Path(__file__).resolve().parent
RACINE = ICI.parent.parent
CONSTRUCTEUR = RACINE / "apps/api/src/modules/feedback/feedback.service.ts"

_spec = importlib.util.spec_from_file_location("digest", ICI / "digest.py")
assert _spec and _spec.loader
digest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(digest)


# ---------------------------------------------------------------------------
# Un corps de widget, dans la forme EXACTE du constructeur (`buildIssueBody`)
# ---------------------------------------------------------------------------

REQUETES_PAR_DEFAUT = [
    ("10:04:01.120", "GET", "https://api.example.test/auth/me", "401", "12 ms", ""),
    ("10:04:01.121", "GET", "https://api.example.test/credits", "401", "9 ms", ""),
    ("10:04:05.300", "POST", "https://api.example.test/reports/pipeline", "412", "230 ms", "c0ffee"),
    ("10:04:06.300", "POST", "https://api.example.test/reports/pipeline", "412", "231 ms", "c0ffef"),
]


def corps(
    message: str = "pourquoi j'ai deux fois capgemini ?\ndeuxième ligne du message",
    source: str | None = "apps/web/src/components/page/CustomerPageContent.tsx:104:7",
    requetes: list[tuple[str, ...]] | None = None,
    avec_contexte: bool = True,
    capture: bool = True,
) -> str:
    lignes = ["**Catégorie** : bug", "", "### Message", *[f"> {l}" for l in message.split("\n")]]
    if capture:
        lignes += ["", "### Capture", "![capture](https://github.com/user-attachments/assets/abc.png)"]
    lignes += [
        "",
        "### Élément pointé",
        f"- Source : `{source}`" if source else "- Source : _inconnue (élément non estampillé)_",
        "- Parents : `apps/web/src/components/page/CustomerPageContent.tsx:75:5` ← `packages/ui/src/atoms/container.tsx:22:10`",
        "- Composants : CustomerPageContent2 ← MainContainer2",
        "- Sélecteur : `div > main`",
        "- Élément : `<div>`",
        "- Classes : `flex min-h-0`",
        "- Position : 1580×797 @ (249, 83)",
        "- Viewport : 1837×872 @1.6x",
        "",
        "<details><summary>Markup</summary>",
        "",
        "```html",
        '<div data-bellum-src="apps/web/src/jamais-lu.tsx:1:1">…</div>',
        "```",
        "",
        "</details>",
        "",
        "### Localiser le code",
        "```sh",
        "rg -n 'CustomerPageContent' apps/web/src",
        "```",
    ]
    if requetes is None:
        requetes = REQUETES_PAR_DEFAUT
    if requetes:
        lignes += [
            "",
            "### Requêtes en échec",
            "| Heure | Méthode | URL | Statut | Durée | Corrélation |",
            "| --- | --- | --- | --- | --- | --- |",
            *[f"| {' | '.join(r)} |" for r in requetes],
        ]
    lignes += ["", "### Fil des dernières actions", "- 10:03:58 — navigation : /accounts", "- 10:04:03 — clic : Ouvrir"]
    lignes += ["", "### Contexte", "- Utilisateur : demo@example.test (`0000`)", "- Page : https://app.example.test/accounts", "- Compte : —"]
    if avec_contexte:
        lignes += [
            "- Build : `26.09.03-ts1788417609+git4fd470b991` (production)",
            "- Route : /accounts",
            "- Thème : light · Langue : fr · Fuseau : Europe/Paris",
            "- Fenêtre : 1837×872 @1.6x · Réseau : en ligne",
        ]
    lignes += [
        "- User agent : Mozilla/5.0",
        "",
        "### Erreurs récentes",
        "```",
        "TypeError: x is undefined",
        "```",
        "",
        "### Logs console",
        "```",
        "[warn] quelque chose",
        "```",
        "",
        "> ⚠️ **Réutilisation : privée à cet espace.** …",
        "",
        "_Ouvert automatiquement depuis le rapport de bug in-app._",
    ]
    return "\n".join(lignes)


def issue(number: int = 1818, title: str = "[beta:bug] /accounts/6c8f4edc-329e — pourquoi j'ai deux fois capgemini", body: str | None = None, labels=("beta-feedback", "feedback:bug"), comments=()):
    return {
        "number": number,
        "title": title,
        "body": corps() if body is None else body,
        "labels": [{"name": n} for n in labels],
        "createdAt": "2026-09-09T17:00:00Z",
        "url": f"https://github.com/example/repo/issues/{number}",
        "comments": list(comments),
    }


# ---------------------------------------------------------------------------
# 1. Elle LIT vraiment
# ---------------------------------------------------------------------------


def test_lit_les_noms_de_section_du_constructeur():
    src = CONSTRUCTEUR.read_text(encoding="utf-8")
    assert digest.SECTIONS_LUES, "le digest doit déclarer les sections qu'il lit"
    for nom in digest.SECTIONS_LUES:
        assert f"'### {nom}'" in src or f"'{nom}'" in src, f"la section « {nom} » n'est plus écrite par {CONSTRUCTEUR.name}"


def test_message_humain_sans_la_citation():
    assert digest.message(corps()) == "pourquoi j'ai deux fois capgemini ?\ndeuxième ligne du message"


def test_element_pointe_source_puis_parents_jamais_le_markup():
    pointes = digest.pointed(corps())
    assert pointes[0] == ("apps/web/src/components/page/CustomerPageContent.tsx", 104)
    assert ("apps/web/src/components/page/CustomerPageContent.tsx", 75) in pointes
    assert ("packages/ui/src/atoms/container.tsx", 22) in pointes
    assert all("jamais-lu" not in p for p, _ in pointes), "le markup replié ne doit pas être lu comme un pointeur"


def test_requetes_401_sont_du_bruit_et_les_identiques_se_comptent():
    lignes, bruit = digest.failed_requests(corps())
    assert lignes == ["POST https://api.example.test/reports/pipeline → 412 (×2)"]
    assert bruit == 2
    assert not any("Heure" in l for l in lignes), "la ligne d'en-tête n'est pas une requête"


def test_contexte_build_et_route():
    ctx = digest.context(corps())
    assert ctx["build"] == "26.09.03-ts1788417609+git4fd470b991"
    assert ctx["commit"] == "4fd470b991"
    assert ctx["route"] == "/accounts"


@pytest.mark.parametrize(
    "titre, ecran",
    [
        ("[beta:bug] /accounts/6c8f4edc-329e-4ebc — deux fois capgemini", "/accounts"),
        ("[beta:metier] /settings/import — pouvoir importer", "/settings"),
        ("[beta:metier] /pilotage/marche — la mémoire marché", "/pilotage"),
        ("[beta:autre] juste une phrase sans route", "(sans route)"),
    ],
)
def test_ecran_depuis_le_titre(titre, ecran):
    assert digest.screen_of(titre) == ecran


@pytest.mark.parametrize(
    "titre, serie",
    [
        ("[beta:metier] /projects — REFONTE — 3/9 — KANBAN", (3, 9)),
        ("[beta:metier] /dashboard — retours du 09/09", None),
        ("[beta:bug] /chat — rien", None),
    ],
)
def test_une_serie_declare_son_denominateur_mais_une_date_non(titre, serie):
    assert digest.series_of(titre) == serie


def test_points_estimes_depuis_les_listes():
    assert digest.points("- a\n- b\n1. c\nphrase libre") == 3
    assert digest.points("une seule phrase") == 0


def test_points_compte_les_demandes_ecrites_SANS_puce():
    """Mesuré le 12/09/2026 : 30 issues ouvertes sur 62 ne portent AUCUNE puce
    Markdown, et l'une d'elles liste douze champs, un par ligne, sans tiret. Un
    compteur qui ne cherche que `^[-*•]` y rend 0 — et un zéro ressemble à
    « rien à découper », ce qui saute le découpage entier (skill issues §3 bis).
    """
    liste_en_prose = (
        "Chaque page doit transmettre un contexte structuré :\n\n"
        "Nom de la page\n"
        "Utilité métier\n"
        "Objet actif\n"
        "Filtres actifs\n"
    )
    assert digest.points(liste_en_prose) >= 5

    liste_a_point_virgule = "Laura doit dire :\n\nce qui manque ;\npourquoi cela compte ;\ncomment le vérifier.\n"
    assert digest.points(liste_a_point_virgule) >= 3

    obligations = "Le header doit montrer la portée.\nNe jamais supprimer le fil sans avertissement.\nInterdire une seconde mémoire.\n"
    assert digest.points(obligations) == 3


def test_points_dit_NON_a_ce_qui_nest_pas_une_demande():
    """Sans ce contrôle, tout texte devient une demande et le registre gonfle :
    un compte faux est pire qu'un compte absent — on le croit."""
    # un exemple rédigé illustre la demande précédente, il n'en est pas une
    assert digest.points('Exemple :\n\n"Cette page suit tes opportunités."\n"Trois dossiers sont sans action."') == 0
    # de la prose ordinaire, ponctuée, n'est pas une liste
    assert digest.points("Le tableau de bord affiche les relances. Il est lent le matin.") == 0
    assert digest.points("") == 0


def test_le_bot_linear_nest_pas_un_humain_mais_sa_cle_se_garde():
    linkback = {
        "author": {"login": "linear-code"},
        "createdAt": "2026-09-09T17:29:06Z",
        "body": '<!-- linear-linkback -->\n<p><a href="https://linear.app/x/issue/ENG-616/slug">ENG-616</a></p>',
    }
    assert digest.human_comments([linkback]) == []
    assert digest.linear_key([linkback]) == "ENG-616"
    assert digest.code_already([linkback]) is False


def test_un_commentaire_qui_cite_un_commit_ou_une_pr_dit_deja_du_code():
    humain = {"author": {"login": "louis"}, "createdAt": "2026-09-09T18:00:00Z", "body": "Corrigé : la liste ne double plus — en prod (a1b2c3d4e)."}
    curieux = {"author": {"login": "louis"}, "createdAt": "2026-09-09T18:00:00Z", "body": "je regarde demain"}
    assert digest.code_already([humain]) is True
    assert digest.code_already([curieux]) is False
    assert len(digest.human_comments([humain, curieux])) == 2


def test_groupes_par_volume_decroissant_et_sans_route_en_dernier():
    entrees = [
        digest.digest_issue(issue(1, "[beta:bug] un mot")),
        digest.digest_issue(issue(2, "[beta:bug] /chat — x")),
        digest.digest_issue(issue(3, "[beta:bug] /accounts — a")),
        digest.digest_issue(issue(4, "[beta:bug] autre mot")),
        digest.digest_issue(issue(5, "[beta:bug] /accounts — b")),
        digest.digest_issue(issue(6, "[beta:bug] /accounts/xyz — c")),
    ]
    groupes = digest.group_by_screen(entrees)
    assert [g for g, _ in groupes] == ["/accounts", "/chat", "(sans route)"]
    assert [e["number"] for e in groupes[0][1]] == [3, 5, 6]


def test_le_digest_est_plus_court_et_garde_le_texte_humain():
    issues = [issue(n, f"[beta:bug] /accounts — retour {n}", corps(message=f"message humain numéro {n}")) for n in range(1, 4)]
    entrees = [digest.digest_issue(i) for i in issues]
    stats = digest.stats(issues, entrees)
    rendu = digest.render(digest.group_by_screen(entrees), stats)
    assert len(rendu) < stats["raw_chars"] / 3, "un digest qui ne divise pas par trois ne digère rien"
    for n in range(1, 4):
        assert f"message humain numéro {n}" in rendu
    assert "×" in rendu.splitlines()[0], "l'en-tête porte le ratio mesuré"


def test_un_message_long_est_borne_avec_son_compte():
    long_message = "x" * 3000
    entree = digest.digest_issue(issue(body=corps(message=long_message)), max_message=100)
    assert len(entree["message_rendu"]) <= 140
    assert "[… 3000 caractères" in entree["message_rendu"]


# ---------------------------------------------------------------------------
# 2. Elle sait dire NON
# ---------------------------------------------------------------------------


def test_dit_non_un_corps_sans_message_est_nomme():
    entree = digest.digest_issue(issue(body="### Contexte\n- Route : /x"))
    assert entree["message"] == ""
    assert entree["sans_message"] is True
    rendu = digest.render(digest.group_by_screen([entree]), digest.stats([issue(body="### Contexte")], [entree]))
    assert "sans message" in rendu


def test_dit_non_un_element_non_estampille_est_un_constat():
    entree = digest.digest_issue(issue(body=corps(source=None)))
    assert entree["pointed"][0] != ("apps/web/src/components/page/CustomerPageContent.tsx", 104)
    assert entree["non_estampille"] is True
    rendu = digest.render(digest.group_by_screen([entree]), digest.stats([issue()], [entree]))
    assert "non estampillé" in rendu


def test_la_ligne_de_commande_repond():
    r = subprocess.run([sys.executable, str(ICI / "digest.py"), "--help"], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert "--screen" in r.stdout and "--json" in r.stdout


# ---------------------------------------------------------------------------
# 3. --tri : une ligne par issue, pour trier tout le corpus en un seul écran
# ---------------------------------------------------------------------------

_LIGNE_ISSUE = re.compile(r"^#\d+ ")


def test_tri_rend_une_ligne_par_issue(monkeypatch, capsys):
    issues = [
        issue(n, f"[beta:metier] /accounts — retour numéro {n} " + "x" * 80, labels=("beta-feedback", "feedback:metier"))
        for n in range(1, 4)
    ]
    monkeypatch.setattr(digest, "fetch", lambda repo, state, limit, label: (issues, "gh issue list"))
    rc = digest.main(["--tri"])
    assert rc == 0
    lignes = [l for l in capsys.readouterr().out.splitlines() if _LIGNE_ISSUE.match(l)]
    assert len(lignes) == 3
    for l in lignes:
        assert re.match(r"^#\d+ · metier · humain \d", l)
        assert "points≈" in l
        titre = l.rsplit(" · ", 1)[-1]
        assert len(titre) <= 61, "titre tronqué à 60 caractères (+ l'ellipse)"


def test_tri_marque_le_client_et_le_code_deja_cite(monkeypatch, capsys):
    cite = {"author": {"login": "louis"}, "createdAt": "2026-09-09T18:00:00Z", "body": "corrigé — en prod (a1b2c3d4e)."}
    issues = [
        issue(1, "[beta:metier] /accounts — avec label client", labels=("beta-feedback", "feedback:metier", "beta-client"), comments=(cite,)),
        issue(2, "[beta:metier] /accounts — sans label ni commentaire"),
    ]
    monkeypatch.setattr(digest, "fetch", lambda repo, state, limit, label: (issues, "gh issue list"))
    digest.main(["--tri"])
    lignes = {int(l[1:].split(" ", 1)[0]): l for l in capsys.readouterr().out.splitlines() if _LIGNE_ISSUE.match(l)}
    assert "CLIENT" in lignes[1] and "déjà du code ? OUI" in lignes[1]
    assert "CLIENT" not in lignes[2] and "déjà du code ?" not in lignes[2]


def test_tri_json_ne_porte_pas_le_corps(monkeypatch, capsys):
    issues = [issue(1), issue(2)]
    monkeypatch.setattr(digest, "fetch", lambda repo, state, limit, label: (issues, "gh issue list"))
    digest.main(["--tri", "--json"])
    out = capsys.readouterr().out
    assert "message_rendu" not in out and '"body"' not in out and '"message":' not in out
    data = json.loads(out)
    assert len(data) == 2
    assert data[0]["number"] == 1


# ---------------------------------------------------------------------------
# 4. Un plafond atteint se NOMME
# ---------------------------------------------------------------------------


def test_plafond_atteint_est_nomme(monkeypatch, capsys):
    deux = [issue(1), issue(2)]
    monkeypatch.setattr(digest, "fetch", lambda repo, state, limit, label: (deux, "gh issue list"))
    rc = digest.main(["--limit", "2"])
    sortie = capsys.readouterr()
    assert rc == 3
    assert sortie.out.startswith("⚠️ PLAFOND ATTEINT")
    assert "PLAFOND ATTEINT" in sortie.err

    une = [issue(1)]
    monkeypatch.setattr(digest, "fetch", lambda repo, state, limit, label: (une, "gh issue list"))
    rc = digest.main(["--limit", "2"])
    sortie = capsys.readouterr()
    assert rc == 0
    assert "PLAFOND ATTEINT" not in sortie.out
    assert "PLAFOND ATTEINT" not in sortie.err
