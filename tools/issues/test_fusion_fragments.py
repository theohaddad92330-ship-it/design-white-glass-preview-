"""Garde du fusionneur de fragments `changes/<lot>.yml` (lot `ci/5-process`).

Les lots ne touchent plus les fichiers chauds (changelog, couverture démo, doc
démo, registre des chantiers) : ils écrivent un fragment, l'intégrateur
l'applique. Les preuves :

  1. Il APPLIQUE : une entrée de changelog arrive dans les TROIS catalogues,
     en tête, à parité FR/EN ; un bloc arrive sous son ancre.
  2. Il sait dire NON : parité FR/EN rompue, ancre introuvable ou ambiguë,
     identifiant mal formé, chemin hors du dépôt → refus, fichiers intacts.
  3. Il n'invente rien : rejouer un fragment déjà appliqué ne duplique rien.
  4. Il LIT le vrai dépôt : les ancres du changelog existent dans les vrais
     catalogues (si un fichier change de forme, ce test rougit).
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

RACINE = Path(__file__).resolve().parents[2]

_spec = importlib.util.spec_from_file_location(
    "fusion_fragments", Path(__file__).with_name("fusion_fragments.py")
)
assert _spec and _spec.loader
ff = importlib.util.module_from_spec(_spec)
sys.modules["fusion_fragments"] = ff
_spec.loader.exec_module(ff)

ENTRIES = """export const CHANGELOG_IDS: ChangelogEntryRef[] = [
  // ancienne
  { id: '2026-10-01-ancienne', itemCount: 1 },
]
"""

LABELS = """export const changelogFr: ChangelogCatalog = {
  menu: { title: 'Nouveautés' },
  entries: {
    '2026-10-01-ancienne': {
      date: '1 octobre 2026',
      title: 'Ancienne',
      item1: 'Un.',
    },
  },
}
"""

FRAGMENT = """# fragment du lot 630
lot: lot-630
issues: [4886, 4837]
changelog:
  id: 2026-10-31-lot-630
  comment: "Lot 630 (#4886) — deux fiabilités"
  fr:
    date: 31 octobre 2026
    title: L'export dit ce qu'il garde
    items:
      - Premier point, avec « guillemets » et l'apostrophe.
      - "Deuxième point : #4837"
  en:
    date: October 31, 2026
    title: The export says what it keeps
    items:
      - First item.
      - Second item.
inserts:
  - file: agent_docs/chantiers-livres.md
    after: "## Capacités hors PDF"
    text: |
      - **Export** (#4886) — il dit ce qu'il garde.
        Deuxième ligne indentée.
  - file: agent_docs/demo-mode.md
    text: |
      ### Export (#4886)
"""


def depot(tmp_path: Path) -> Path:
    cl = tmp_path / "packages/contracts/src/changelog"
    cl.mkdir(parents=True)
    (cl / "entries.ts").write_text(ENTRIES, encoding="utf-8")
    (cl / "labels.fr.ts").write_text(LABELS, encoding="utf-8")
    (cl / "labels.en.ts").write_text(LABELS.replace("changelogFr", "changelogEn"), encoding="utf-8")
    docs = tmp_path / "agent_docs"
    docs.mkdir()
    (docs / "chantiers-livres.md").write_text("# Registre\n\n## Capacités hors PDF\n\n- vieux\n", encoding="utf-8")
    (docs / "demo-mode.md").write_text("# Démo\n", encoding="utf-8")
    return tmp_path


def test_lit_le_sous_ensemble_yaml_documente():
    f = ff.parse_fragment(FRAGMENT)
    assert f["lot"] == "lot-630"
    assert f["issues"] == [4886, 4837]
    assert f["changelog"]["fr"]["items"][1] == "Deuxième point : #4837"
    assert f["changelog"]["fr"]["title"] == "L'export dit ce qu'il garde"
    assert f["inserts"][0]["text"] == (
        "- **Export** (#4886) — il dit ce qu'il garde.\n  Deuxième ligne indentée.\n"
    )
    assert f["inserts"][1]["file"] == "agent_docs/demo-mode.md"


def test_applique_le_changelog_en_tete_des_trois_catalogues(tmp_path):
    racine = depot(tmp_path)
    touches = ff.appliquer(racine, ff.parse_fragment(FRAGMENT))
    entries = (racine / "packages/contracts/src/changelog/entries.ts").read_text(encoding="utf-8")
    assert entries.index("2026-10-31-lot-630") < entries.index("2026-10-01-ancienne")
    assert "{ id: '2026-10-31-lot-630', itemCount: 2 }," in entries
    assert "  // Lot 630 (#4886) — deux fiabilités\n" in entries
    fr = (racine / "packages/contracts/src/changelog/labels.fr.ts").read_text(encoding="utf-8")
    assert "      title: 'L\\'export dit ce qu\\'il garde',\n" in fr
    assert "      item2: 'Deuxième point : #4837',\n" in fr
    assert fr.index("2026-10-31-lot-630") < fr.index("2026-10-01-ancienne")
    assert fr.count("{") == fr.count("}")
    en = (racine / "packages/contracts/src/changelog/labels.en.ts").read_text(encoding="utf-8")
    assert "item1: 'First item.'" in en
    assert "packages/contracts/src/changelog/entries.ts" in touches


def test_insere_sous_lancre_ou_en_fin(tmp_path):
    racine = depot(tmp_path)
    ff.appliquer(racine, ff.parse_fragment(FRAGMENT))
    reg = (racine / "agent_docs/chantiers-livres.md").read_text(encoding="utf-8")
    assert reg == (
        "# Registre\n\n## Capacités hors PDF\n"
        "- **Export** (#4886) — il dit ce qu'il garde.\n  Deuxième ligne indentée.\n"
        "\n- vieux\n"
    )
    assert (racine / "agent_docs/demo-mode.md").read_text(encoding="utf-8") == "# Démo\n### Export (#4886)\n"


def test_rejouer_ne_duplique_rien(tmp_path):
    racine = depot(tmp_path)
    ff.appliquer(racine, ff.parse_fragment(FRAGMENT))
    avant = {p: p.read_text(encoding="utf-8") for p in racine.rglob("*.*")}
    assert ff.appliquer(racine, ff.parse_fragment(FRAGMENT)) == []
    assert {p: p.read_text(encoding="utf-8") for p in racine.rglob("*.*")} == avant


@pytest.mark.parametrize(
    "remplacer, motif",
    [
        (("      - Second item.\n", ""), "parité"),
        (("id: 2026-10-31-lot-630", "id: Lot 630"), "identifiant"),
        (('after: "## Capacités hors PDF"', 'after: "## Absente"'), "ancre"),
        (("file: agent_docs/demo-mode.md", "file: ../hors.md"), "hors du dépôt"),
    ],
)
def test_sait_dire_non_sans_rien_ecrire(tmp_path, remplacer, motif):
    racine = depot(tmp_path)
    avant = {p: p.read_text(encoding="utf-8") for p in racine.rglob("*.*")}
    with pytest.raises(ff.FragmentInvalide, match=motif):
        ff.appliquer(racine, ff.parse_fragment(FRAGMENT.replace(*remplacer)))
    assert {p: p.read_text(encoding="utf-8") for p in racine.rglob("*.*")} == avant


def test_ancre_ambigue_refusee(tmp_path):
    racine = depot(tmp_path)
    (racine / "agent_docs/chantiers-livres.md").write_text(
        "## Capacités hors PDF\n## Capacités hors PDF\n", encoding="utf-8"
    )
    with pytest.raises(ff.FragmentInvalide, match="ancre"):
        ff.appliquer(racine, ff.parse_fragment(FRAGMENT))


def test_les_fragments_sappliquent_du_plus_ancien_au_plus_recent(tmp_path):
    racine = depot(tmp_path)
    changes = racine / "changes"
    changes.mkdir()
    recent = FRAGMENT.split("inserts:")[0]
    ancien = recent.replace("2026-10-31-lot-630", "2026-10-30-lot-629")
    (changes / "lot-630.yml").write_text(recent, encoding="utf-8")
    (changes / "lot-629.yml").write_text(ancien, encoding="utf-8")
    assert ff.main(["--racine", str(racine)]) == 0
    entries = (racine / "packages/contracts/src/changelog/entries.ts").read_text(encoding="utf-8")
    assert entries.index("2026-10-31-lot-630") < entries.index("2026-10-30-lot-629")
    assert not list(changes.glob("*.yml")), "un fragment appliqué est retiré"


def test_lexemple_du_readme_se_lit_tel_quel():
    readme = (RACINE / "changes/README.md").read_text(encoding="utf-8")
    exemple = readme.split("```yaml\n", 1)[1].split("```", 1)[0]
    f = ff.parse_fragment(exemple)
    assert f["changelog"]["id"] == "2026-10-31-lot-630"
    assert len(f["changelog"]["fr"]["items"]) == len(f["changelog"]["en"]["items"]) == 2
    assert f["changelog"]["fr"]["items"][1].startswith("Deuxième point : ")
    assert [i["file"] for i in f["inserts"]] == [
        "agent_docs/chantiers-livres.md",
        "apps/api/src/modules/demo/demo-coverage.ts",
    ]


def test_un_commentaire_en_fin_de_ligne_nest_pas_une_valeur():
    f = ff.parse_fragment("a: 1 # un\nb: 'x # y' # deux\nc: \"z\" # trois\nd:  # quatre\n  - e\n")
    assert f == {"a": 1, "b": "x # y", "c": "z", "d": ["e"]}


def test_ancres_du_vrai_depot():
    for relatif, ancre in ff.ANCRES_CHANGELOG.items():
        lignes = (RACINE / relatif).read_text(encoding="utf-8").split("\n")
        assert lignes.count(ancre) == 1, f"{relatif} : ancre « {ancre} » introuvable ou ambiguë"
