"""Garde de `portee.py` — les trois preuves qu'une garde doit apporter.

Une garde protège une règle, elle ne l'invente pas. Elle doit prouver :
  1. qu'elle sait dire NON — un diff de fondation force le balayage complet ;
  2. qu'elle LIT quelque chose — son corpus (routes, graphe d'imports) n'est
     pas vide, sinon elle serait verte sur du vide ;
  3. qu'elle n'attrape pas ce qu'elle ne vise pas — un diff de feature reste
     étroit, et les voisins légitimes (changelog, fichier de test) ne
     déclenchent rien.

Mesuré le 13/09/2026 : sans la troisième, 75 fichiers sur 75 déclenchaient le
balayage complet — la règle ne changeait rien, et une porte qui s'ouvre toujours
n'est pas une porte.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

import portee  # noqa: E402

# Le premier vrai diff mesuré après #1996 (chore/recette-portee-du-diff) —
# rendait FONDATION (59 routes) sur un diff qui ne pouvait casser aucun écran
# existant. Fixé dans le dépôt : ce SHA ne bouge pas.
PLAGE_REELLE = "e1c714c69^1..e1c714c69"


def _plage_atteignable(plage: str) -> bool:
    """⚠️ La CI checkout en clone SUPERFICIEL : `e1c714c69^1` n'y existe pas et
    `git diff` sort en 128. Un test qui épingle un SHA réel est donc vert en
    local et rouge en CI — payé le 14/09/2026, deux tests rouges sur une PR
    dont le code était juste.

    Les trois groupes ci-dessous gardent leur valeur (ils épinglent l'incident
    RÉEL), mais ils ne peuvent pas être la seule preuve : chacun a un jumeau
    monté sur un dépôt-fixture (`tmp_path`), qui tourne PARTOUT. Ce sont eux
    qui gardent le comportement ; ceux-ci gardent la mémoire du cas."""
    try:
        subprocess.run(
            ["/usr/bin/git", "rev-parse", "--verify", "--quiet", plage.split("..")[0]],
            cwd=portee.RACINE, capture_output=True, check=True,
        )
        return True
    except subprocess.CalledProcessError:
        return False


historique_requis = pytest.mark.skipif(
    not _plage_atteignable(PLAGE_REELLE),
    reason=(
        "clone superficiel : l'historique de e1c714c69^1 est absent. "
        "Les jumeaux sur depot-fixture couvrent le meme comportement."
    ),
)


def _fondation(chemins: list[str]) -> list[tuple[str, str]]:
    """Rejoue le tri de `main()` sans toucher à git. Passe par la MÊME fonction
    que `evaluer()` (`portee.chemin_exclu_de_fondation`) — pas une copie de la
    liste, pour que ce test ne diverge jamais du code qu'il garde."""

    return [
        (c, r)
        for c in chemins
        if not portee.chemin_exclu_de_fondation(c)
        for motif, r in portee.FONDATIONS
        if re.search(motif, c)
    ]


# ── 2. elle LIT quelque chose ───────────────────────────────────────────────


def test_le_corpus_de_routes_nest_pas_vide():
    """Sans routes, tous les verdicts seraient verts sur du vide."""
    routes = portee.routes_de_la_nav()
    assert len(routes) >= 40, f"seulement {len(routes)} routes lues dans le code"
    # Refonte Théo (a1) : `/dashboard` retiré et redirigé — « Ma journée » vit sur `/briefing`.
    assert "/chat" in routes and "/briefing" in routes


def test_le_graphe_dimports_nest_pas_vide():
    inverse = portee.graphe_inverse()
    assert len(inverse) >= 200, f"graphe d'imports à {len(inverse)} nœuds — trop petit"
    # et il RELIE vraiment : un écran de feature doit atteindre un fichier de route
    chat = portee.WEB_SRC / "features/chat/view/Chat.tsx"
    if chat.is_file():
        assert inverse.get(chat), "Chat.tsx n'est importé par personne — graphe cassé"


def test_une_route_se_traduit_en_url():
    assert portee.route_vers_url(portee.ROUTES / "accounts/partners.tsx") == "/accounts/partners"
    assert portee.route_vers_url(portee.ROUTES / "accounts/index.tsx") == "/accounts"
    assert portee.route_vers_url(portee.ROUTES / "__root.tsx") is None


# ── 1. elle sait dire NON ───────────────────────────────────────────────────


@pytest.mark.parametrize(
    "chemin",
    [
        "packages/ui/src/Button.tsx",
        "apps/web/src/index.css",
        "apps/web/src/components/navigation/sections.ts",
        "apps/web/src/hooks/useIsMobile.ts",
        "apps/web/src/lib/api/query-keys.ts",
        "apps/web/src/routes/__root.tsx",
    ],
)
def test_une_fondation_force_le_balayage_complet(chemin):
    assert _fondation([chemin]), f"{chemin} devrait être une FONDATION et ne l'est pas"


# ── 3. elle n'attrape pas ce qu'elle ne vise pas ────────────────────────────


@pytest.mark.parametrize(
    "chemin",
    [
        # le changelog conflicte à CHAQUE vague : le compter ferait balayer 58
        # routes à tous les lots, donc jamais.
        "packages/contracts/src/changelog/entries.ts",
        "packages/contracts/src/changelog/labels.fr.ts",
        # un fichier de test ne s'exécute pas en production
        "packages/contracts/src/schemas/action-router.test.ts",
        "apps/web/src/features/chat/view/Chat.test.tsx",
        # un espace de noms i18n qui n'est pas `common`
        "apps/web/src/i18n/locales/fr/actions.json",
        # une feature isolée
        "apps/web/src/features/chat/view/Chat.tsx",
        "apps/api/src/modules/ia-proxy/chat-messages.service.ts",
    ],
)
def test_un_voisin_legitime_ne_declenche_rien(chemin):
    assert not _fondation([chemin]), f"{chemin} déclenche un balayage complet à tort"


def test_un_contrat_ADDITIF_nest_pas_une_fondation_de_forme():
    """La distinction qui porte la règle : ajouter ≠ changer la forme.

    Un champ NEUF ne peut pas rendre `undefined` un champ que quelqu'un lit
    déjà ; un champ MODIFIÉ, si — et ça casse durablement les onglets ouverts.
    `FONDATIONS_DE_FORME` n'est donc consulté que si le diff RETIRE des lignes.
    """
    contrat = "packages/contracts/src/schemas/action-router.ts"
    assert not _fondation([contrat]), (
        "un contrat ne doit compter comme fondation que via FONDATIONS_DE_FORME, "
        "et seulement quand le diff retire des lignes"
    )
    assert any(
        re.search(m, contrat) for m, _ in portee.FONDATIONS_DE_FORME
    ), "le contrat doit bien être une fondation DE FORME"


def test_common_json_est_fondation_de_forme_pas_fondation_dure():
    """#13/09/2026 — ajouter une clé à l'espace commun ne peut casser
    personne ; en retirer ou en renommer une, si. `common.json` migre donc de
    `FONDATIONS` (dur, toujours) vers `FONDATIONS_DE_FORME` (seulement si la
    surface a rétréci)."""
    chemin = "apps/web/src/i18n/locales/fr/common.json"
    assert not _fondation([chemin]), f"{chemin} ne doit plus être une fondation DURE"
    assert any(
        re.search(m, chemin) for m, _ in portee.FONDATIONS_DE_FORME
    ), "common.json doit être une fondation DE FORME"


# ── Les trois faux positifs mesurés le 13/09/2026, sur le premier vrai diff ─
#
# `python3 tools/recette/portee.py 'e1c714c69^1..e1c714c69'` rendait FONDATION
# (59 routes) sur un diff qui ne pouvait casser aucun écran existant :
#   - `apps/web/src/lib/data-source-label.ts` est un fichier AJOUTÉ (`A`) ;
#   - `apps/web/src/i18n/locales/{fr,en}/common.json` : 20 ajouts / 0 retrait
#     chacun (`git diff --numstat`) ;
#   - `packages/contracts/src/schemas/{tool-naming,storage,doctrine-registry}.ts` :
#     zéro symbole exporté disparu — les retraits sont des entrées de tableau
#     de DONNÉES déplacées et de la prose réécrite dans une chaîne.


@historique_requis
def test_fichier_ajoute_sous_lib_nest_pas_une_fondation():
    """`data-source-label.ts` est un fichier AJOUTÉ (statut `A` mesuré par
    `git diff --name-status`) : aucun lecteur d'avant ne peut recevoir
    `undefined` de sa part. C'est le faux positif qui faisait basculer ce diff
    en FONDATION (59 routes) alors qu'il ne pouvait casser aucun écran
    existant."""
    statuts = dict(
        (chemin, statut) for statut, chemin in portee.fichiers_changes_avec_statut(PLAGE_REELLE)
    )
    assert statuts.get("apps/web/src/lib/data-source-label.ts") == "A"


@historique_requis
@pytest.mark.parametrize(
    "fichier",
    [
        "apps/web/src/i18n/locales/fr/common.json",
        "apps/web/src/i18n/locales/en/common.json",
        "packages/contracts/src/schemas/tool-naming.ts",
        "packages/contracts/src/schemas/storage.ts",
        "packages/contracts/src/schemas/doctrine-registry.ts",
    ],
)
def test_fondation_de_forme_reelle_est_purement_additive(fichier):
    """Les 5 fichiers `FONDATIONS_DE_FORME` du diff réel du 13/09/2026 n'ont
    RIEN perdu de leur surface. `common.json` : 20 ajouts / 0 retrait chacun
    (mesuré par `git diff --numstat`). Les 3 contrats : zéro symbole exporté
    disparu — `tool-naming.ts` ajoute juste `ordinaryWord: true` à deux entrées
    de données, `doctrine-registry.ts` réécrit une phrase en trois chaînes
    concaténées, `storage.ts` étend un type et ajoute des constantes."""
    assert not portee.surface_a_disparu(PLAGE_REELLE, fichier), (
        f"{fichier} : la surface a rétréci alors que ce diff n'a fait qu'ajouter"
    )


@historique_requis
def test_le_diff_reel_du_13_09_est_cible_pas_fondation():
    """LE test de non-régression : sans les trois corrections ci-dessus, ce
    diff rendait FONDATION à tort — 59 routes à balayer sur un diff qui ne
    pouvait casser aucun écran existant. Payé une fois le 13/09/2026, gardé
    ici."""
    resultat = portee.evaluer(PLAGE_REELLE)
    assert resultat is not None
    assert resultat["regime"] == "CIBLÉ", (
        f"régime {resultat['regime']} — {resultat.get('pourquoi')}"
    )


# ── Elle sait dire NON — sans ces deux-là la correction rend le script ──────
# aveugle, ce qui est pire que le faux positif qu'elle corrige.


def _depot_git_vide(repo: Path):
    """Un dépôt git minimal, isolé, pour fabriquer un AVANT/APRÈS contrôlé."""
    env = os.environ.copy()
    env.update(
        GIT_AUTHOR_NAME="portee-test",
        GIT_AUTHOR_EMAIL="portee-test@example.com",
        GIT_COMMITTER_NAME="portee-test",
        GIT_COMMITTER_EMAIL="portee-test@example.com",
    )

    def executer(*args: str) -> str:
        return subprocess.run(
            ["/usr/bin/git", *args], cwd=repo, env=env, capture_output=True, text=True, check=True
        ).stdout

    executer("init", "-q")
    return executer


def test_champ_qui_disparait_dun_type_exporte_force_fondation(tmp_path, monkeypatch):
    """Elle sait dire NON (1/2) : un champ RETIRÉ d'un `type` EXPORTÉ d'un
    contrat doit rester une FONDATION — casse durablement un onglet déjà
    ouvert qui le lisait."""
    repo = tmp_path / "repo"
    repo.mkdir()
    executer = _depot_git_vide(repo)
    fichier = repo / "packages/contracts/src/schemas/fake.ts"
    fichier.parent.mkdir(parents=True)
    fichier.write_text("export type FakeEntry = {\n  id: string\n  label: string\n}\n")
    executer("add", "-A")
    executer("commit", "-q", "-m", "base")
    base = executer("rev-parse", "HEAD").strip()

    fichier.write_text("export type FakeEntry = {\n  id: string\n}\n")
    executer("add", "-A")
    executer("commit", "-q", "-m", "retire label")
    tete = executer("rev-parse", "HEAD").strip()

    monkeypatch.setattr(portee, "RACINE", repo)
    resultat = portee.evaluer(f"{base}..{tete}")
    assert resultat is not None
    assert resultat["regime"] == "FONDATION"
    assert any(
        p["fichier"] == "packages/contracts/src/schemas/fake.ts" for p in resultat["pourquoi"]
    )


def test_fichier_lib_modifie_pas_ajoute_force_fondation(tmp_path, monkeypatch):
    """Elle sait dire NON (2/2) : la correction (a) exclut les fichiers
    AJOUTÉS, pas les fichiers MODIFIÉS — un `lib/` modifié doit rester une
    FONDATION."""
    repo = tmp_path / "repo"
    repo.mkdir()
    executer = _depot_git_vide(repo)
    fichier = repo / "apps/web/src/lib/example.ts"
    fichier.parent.mkdir(parents=True)
    fichier.write_text("export const X = 1\n")
    executer("add", "-A")
    executer("commit", "-q", "-m", "base")
    base = executer("rev-parse", "HEAD").strip()

    fichier.write_text("export const X = 2\n")
    executer("add", "-A")
    executer("commit", "-q", "-m", "modifie")
    tete = executer("rev-parse", "HEAD").strip()

    monkeypatch.setattr(portee, "RACINE", repo)
    resultat = portee.evaluer(f"{base}..{tete}")
    assert resultat is not None
    assert resultat["regime"] == "FONDATION"
    assert any(
        p["fichier"] == "apps/web/src/lib/example.ts" for p in resultat["pourquoi"]
    )


def test_fichier_lib_AJOUTE_ne_declenche_rien(tmp_path, monkeypatch):
    """Le jumeau portable de l'incident du 14/09/2026 : `data-source-label.ts`
    était un fichier NEUF compté comme fondation. Un fichier ajouté n'a aucun
    lecteur d'avant — il ne peut rendre `undefined` à personne.

    Celui-ci tourne partout, y compris sur un clone superficiel, là où le test
    qui épingle le SHA réel est sauté."""
    repo = tmp_path / "repo"
    repo.mkdir()
    executer = _depot_git_vide(repo)
    socle = repo / "apps/web/src/routes/index.tsx"
    socle.parent.mkdir(parents=True)
    socle.write_text("export const Route = 1\n")
    executer("add", "-A")
    executer("commit", "-q", "-m", "base")
    base = executer("rev-parse", "HEAD").strip()

    neuf = repo / "apps/web/src/lib/data-source-label.ts"
    neuf.parent.mkdir(parents=True)
    neuf.write_text("export const label = 1\n")
    executer("add", "-A")
    executer("commit", "-q", "-m", "ajoute")
    tete = executer("rev-parse", "HEAD").strip()

    # ⚠️ `portee.git()` lance `git` avec `cwd=portee.RACINE` : le monkeypatch va
    # AVANT toute lecture, sinon la commande tourne dans le vrai dépôt avec des
    # SHA de fixture et sort en 128.
    monkeypatch.setattr(portee, "RACINE", repo)

    statuts = dict(
        (chemin, statut)
        for statut, chemin in portee.fichiers_changes_avec_statut(f"{base}..{tete}")
    )
    assert statuts.get("apps/web/src/lib/data-source-label.ts") == "A"

    resultat = portee.evaluer(f"{base}..{tete}")
    assert resultat is not None
    assert resultat["regime"] == "CIBLÉ", (
        f"un fichier AJOUTÉ sous lib/ a déclenché {resultat['regime']} — "
        f"{resultat.get('pourquoi')}"
    )


# ── #14/09/2026 — LA MÊME exclusion pour les DEUX usages ────────────────────
#
# Mesuré : `packages/contracts/src/changelog/entries.ts` est exclu du
# classement FONDATION (`PAS_UNE_FONDATION`) mais n'était PAS exclu de la
# construction des graines du graphe d'imports (`seeds` dans `evaluer()`) —
# les deux usages lisaient la même RAISON sans lire la même LISTE. Un fichier
# qui ne peut pas casser d'écran par le classement ne doit pas non plus en
# TIRER un en remontant depuis lui.


def _fixture_changelog(repo: Path):
    """`dashboard` (route) → `ChangelogMenu.tsx` (composant, PAS exclu) →
    `packages/contracts/src/changelog/entries.ts` (donnée, EXCLUE). L'import du
    composant vers la donnée est écrit en RELATIF pour rendre l'arête
    résoluble dans ce test isolé — en vrai le composant passe par
    `@bellum/contracts` (alias de paquet, jamais résolu par `resoudre()`),
    mais rien n'empêche structurellement qu'un import relatif la rende
    résoluble un jour ; l'exclusion doit tenir dans les deux cas."""
    nav = repo / "apps/web/src/components/navigation/sections.ts"
    nav.parent.mkdir(parents=True)
    nav.write_text("export const sections = [{ to: '/dashboard' }]\n")

    route = repo / "apps/web/src/routes/dashboard.tsx"
    route.parent.mkdir(parents=True)
    route.write_text("import { ChangelogMenu } from '../ChangelogMenu'\nexport const Route = ChangelogMenu\n")

    menu = repo / "apps/web/src/ChangelogMenu.tsx"
    menu.write_text(
        "import { CHANGELOG_IDS } from '../../../packages/contracts/src/changelog/entries'\n"
        "export const ChangelogMenu = CHANGELOG_IDS\n"
    )

    donnee = repo / "packages/contracts/src/changelog/entries.ts"
    donnee.parent.mkdir(parents=True)
    donnee.write_text("export const CHANGELOG_IDS = [{ id: 'a' }]\n")
    return route, menu, donnee


def test_donnee_du_changelog_ne_tire_aucun_ecran_par_le_graphe(tmp_path, monkeypatch):
    """Elle sait dire NON : changer UNIQUEMENT la donnée exclue ne doit tirer
    AUCUN écran, même si un composant largement monté l'importe."""
    repo = tmp_path / "repo"
    repo.mkdir()
    executer = _depot_git_vide(repo)
    _route, _menu, donnee = _fixture_changelog(repo)
    executer("add", "-A")
    executer("commit", "-q", "-m", "base")
    base = executer("rev-parse", "HEAD").strip()

    donnee.write_text("export const CHANGELOG_IDS = [{ id: 'a' }, { id: 'b' }]\n")
    executer("add", "-A")
    executer("commit", "-q", "-m", "donnee changelog")
    tete = executer("rev-parse", "HEAD").strip()

    monkeypatch.setattr(portee, "RACINE", repo)
    monkeypatch.setattr(portee, "WEB_SRC", repo / "apps/web/src")
    monkeypatch.setattr(portee, "ROUTES", repo / "apps/web/src/routes")

    resultat = portee.evaluer(f"{base}..{tete}")
    assert resultat is not None
    assert resultat["regime"] == "CIBLÉ"
    assert resultat["routes"] == [], (
        f"la donnée EXCLUE du changelog a quand même tiré {resultat['routes']} "
        "— l'exclusion FONDATION doit aussi s'appliquer au graphe d'imports"
    )


def test_rendu_du_changelog_menu_tire_toujours_son_ecran(tmp_path, monkeypatch):
    """Le témoin : elle n'attrape pas le cas légitime voisin. `ChangelogMenu.tsx`
    n'est PAS dans `PAS_UNE_FONDATION` — un changement de son RENDU doit
    continuer à tirer `/dashboard`. Preuve, au passage, que le corpus de
    routes de ce test n'est pas structurellement vide : un `0 route` dans le
    test précédent est bien un effet de l'exclusion, pas un graphe cassé."""
    repo = tmp_path / "repo"
    repo.mkdir()
    executer = _depot_git_vide(repo)
    _route, menu, _donnee = _fixture_changelog(repo)
    executer("add", "-A")
    executer("commit", "-q", "-m", "base")
    base = executer("rev-parse", "HEAD").strip()

    menu.write_text(menu.read_text() + "// rendu modifie\n")
    executer("add", "-A")
    executer("commit", "-q", "-m", "rendu du menu")
    tete = executer("rev-parse", "HEAD").strip()

    monkeypatch.setattr(portee, "RACINE", repo)
    monkeypatch.setattr(portee, "WEB_SRC", repo / "apps/web/src")
    monkeypatch.setattr(portee, "ROUTES", repo / "apps/web/src/routes")

    resultat = portee.evaluer(f"{base}..{tete}")
    assert resultat is not None
    assert resultat["regime"] == "CIBLÉ"
    assert len(resultat["routes"]) > 0, "0 route — le graphe de ce test est cassé, pas juste l'exclusion"
    assert resultat["routes"] == ["/dashboard"], (
        "témoin cassé : un changement du RENDU de ChangelogMenu.tsx doit "
        f"toujours tirer /dashboard — reçu {resultat['routes']}"
    )


# ── #14/09/2026 (suite) — le MÊME défaut un cran plus haut : un namespace i18n
# emprunté en SECONDAIRE par un composant de coque tirait quand même tout ce
# qu'il monte. Mesuré sur le vrai diff : `ChangelogMenu.tsx` déclare
# `useTranslation(['changelog', 'onboarding'])` — `onboarding` en SECONDAIRE,
# pour un seul bouton emprunté (« Revoir la visite guidée ») — et toucher
# `onboarding.json` le faisait remonter jusqu'à 59 routes. Un fichier qui lit
# un namespace pour SON PROPRE contenu le déclare TOUJOURS en PREMIER
# (`useTranslation('ns')` ou `useTranslation(['ns', ...])`) dans tout le corpus
# `onboarding` du dépôt — c'est la distinction que `i18n_vers_seeds()` ne
# faisait pas.


def _fixture_i18n_shell(repo: Path) -> Path:
    """`ShellMenu.tsx` emprunte `onboarding` en SECONDAIRE (comme le vrai
    `ChangelogMenu.tsx`) pour un bouton d'une autre feature ; `OnboardingScreen.tsx`
    le lit en PRIMAIRE, pour son propre contenu. Deux routes DISTINCTES les
    montent : `/dashboard` ne doit RIEN tirer d'un changement `onboarding.json`,
    `/onboarding` doit continuer à être tiré."""
    nav = repo / "apps/web/src/components/navigation/sections.ts"
    nav.parent.mkdir(parents=True)
    nav.write_text("export const sections = [{ to: '/dashboard' }, { to: '/onboarding' }]\n")

    dashboard = repo / "apps/web/src/routes/dashboard.tsx"
    dashboard.parent.mkdir(parents=True)
    dashboard.write_text("import { ShellMenu } from '../ShellMenu'\nexport const Route = ShellMenu\n")

    shell = repo / "apps/web/src/ShellMenu.tsx"
    shell.write_text(
        "import { useTranslation } from 'react-i18next'\n"
        "export function ShellMenu() {\n"
        "  const { t } = useTranslation(['shell', 'onboarding'])\n"
        "  return t('onboarding:tour.menuButton')\n"
        "}\n"
    )

    onboarding_route = repo / "apps/web/src/routes/onboarding.tsx"
    onboarding_route.write_text(
        "import { OnboardingScreen } from '../features/onboarding/OnboardingScreen'\n"
        "export const Route = OnboardingScreen\n"
    )

    screen = repo / "apps/web/src/features/onboarding/OnboardingScreen.tsx"
    screen.parent.mkdir(parents=True)
    screen.write_text(
        "import { useTranslation } from 'react-i18next'\n"
        "export function OnboardingScreen() {\n"
        "  const { t } = useTranslation('onboarding')\n"
        "  return t('title')\n"
        "}\n"
    )

    locale = repo / "apps/web/src/i18n/locales/fr/onboarding.json"
    locale.parent.mkdir(parents=True)
    locale.write_text("{}\n")
    return locale


def test_namespace_secondaire_ne_tire_rien_par_un_composant_de_coque(tmp_path, monkeypatch):
    """Elle sait dire NON : `ShellMenu.tsx` emprunte `onboarding` en SECONDAIRE
    (comme le vrai `ChangelogMenu.tsx`) — changer la traduction ne doit PAS
    tirer l'écran qu'il monte."""
    repo = tmp_path / "repo"
    repo.mkdir()
    executer = _depot_git_vide(repo)
    locale = _fixture_i18n_shell(repo)
    executer("add", "-A")
    executer("commit", "-q", "-m", "base")
    base = executer("rev-parse", "HEAD").strip()

    locale.write_text('{"title": "Bienvenue"}\n')
    executer("add", "-A")
    executer("commit", "-q", "-m", "traduction onboarding")
    tete = executer("rev-parse", "HEAD").strip()

    monkeypatch.setattr(portee, "RACINE", repo)
    monkeypatch.setattr(portee, "WEB_SRC", repo / "apps/web/src")
    monkeypatch.setattr(portee, "ROUTES", repo / "apps/web/src/routes")

    resultat = portee.evaluer(f"{base}..{tete}")
    assert resultat is not None
    assert resultat["regime"] == "CIBLÉ"
    assert "/dashboard" not in resultat["routes"], (
        f"ShellMenu.tsx (namespace SECONDAIRE) a quand même tiré /dashboard — {resultat['routes']}"
    )


def test_namespace_primaire_tire_toujours_son_ecran(tmp_path, monkeypatch):
    """Le témoin, et la preuve que le corpus n'est pas vide : `OnboardingScreen.tsx`
    lit `onboarding` en PRIMAIRE, pour son PROPRE contenu. Changer la
    traduction doit continuer à tirer `/onboarding`."""
    repo = tmp_path / "repo"
    repo.mkdir()
    executer = _depot_git_vide(repo)
    locale = _fixture_i18n_shell(repo)
    executer("add", "-A")
    executer("commit", "-q", "-m", "base")
    base = executer("rev-parse", "HEAD").strip()

    locale.write_text('{"title": "Bienvenue"}\n')
    executer("add", "-A")
    executer("commit", "-q", "-m", "traduction onboarding")
    tete = executer("rev-parse", "HEAD").strip()

    monkeypatch.setattr(portee, "RACINE", repo)
    monkeypatch.setattr(portee, "WEB_SRC", repo / "apps/web/src")
    monkeypatch.setattr(portee, "ROUTES", repo / "apps/web/src/routes")

    resultat = portee.evaluer(f"{base}..{tete}")
    assert resultat is not None
    assert resultat["regime"] == "CIBLÉ"
    assert len(resultat["routes"]) > 0, "0 route — le graphe de ce test est cassé, pas juste l'exclusion"
    assert resultat["routes"] == ["/onboarding"], (
        "témoin cassé : OnboardingScreen.tsx (namespace PRIMAIRE) doit tirer "
        f"/onboarding — reçu {resultat['routes']}"
    )
