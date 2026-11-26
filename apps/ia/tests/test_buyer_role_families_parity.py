"""Parité du registre des familles de rôles acheteurs — TS (source) ↔ Python.

``packages/contracts/src/schemas/buyer-role-families.ts`` est le seul endroit où
les onze familles vivent. Deux corpus Python doivent lui rester alignés :

* ``app/services/contact_segments.py`` (``_FAMILY_PRESETS``) — le service IA n'a
  pas le paquet ``contracts`` à l'exécution (racine Railway = ``apps/ia``), il en
  porte donc une copie ; son propre commentaire dit « MIROIR de FAMILY_DEFS ».
* ``app/prompts/bellum_contacts.py`` — les libellés que le prompt de
  classification DEMANDE au modèle d'écrire. Ce sont eux que l'API persiste
  ensuite tels quels sur ``contacts.family``.

⚠️ **C'est ce second alignement qui manquait, et il a coûté cher.** Mesuré le
29/08/2026 : neuf des dix libellés de famille du prompt ne tombaient sur AUCUN alias de la
matrice de couverture, parce qu'elle compare par égalité EXACTE et que ses alias
ne portaient que des mots isolés (« data », « bi », « analytics » — jamais
« Data / BI / Analytics »). Le champ que le modèle avait rempli était jeté.

Leçon « garde borgne » appliquée : chaque test PROUVE qu'il lit un corpus non
vide (11 familles TS, 11 presets Python, 10 libellés de famille au prompt) AVANT
de comparer. Il tourne en CI (monorepo présent) et se saute proprement dans une
image de déploiement (fichier TS absent).
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import pytest

from app.prompts.bellum_contacts import CONTACT_FAMILY_LABELS
from app.services.contact_segments import _FAMILY_PRESETS, _key

_TS_REL = Path("packages/contracts/src/schemas/buyer-role-families.ts")

#: Le libellé du prompt qui n'est PAS une famille — le mot que le modèle écrit
#: quand il ne sait pas. Il doit rester non résolu : le rattacher à une famille
#: ferait entrer un contact non classé dans une case de la matrice.
_NON_FAMILY_LABEL = "Autre"


def _monorepo_file(rel: Path) -> Path | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / rel
        if candidate.is_file():
            return candidate
    return None


def _strip_line_comments(source: str) -> str:
    """Retire les commentaires AVANT extraction.

    Leçon GA-08 : un libellé cité dans un commentaire (« Data / BI / Analytics »
    l'est trois fois dans l'en-tête du registre) se lit exactement comme un
    alias, et la garde compare alors du bruit à du bruit.
    """
    without_block = re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)
    return re.sub(r"//.*$", "", without_block, flags=re.MULTILINE)


def _norm(raw: str) -> str:
    """La normalisation du registre (`normalizeBuyerRoleFamilyToken`), en Python.
    Identique à `_key` de `contact_segments` — vérifiée par un test ci-dessous
    plutôt que supposée."""
    text = unicodedata.normalize("NFKD", raw or "")
    stripped = "".join(c for c in text if not unicodedata.combining(c))
    return "".join(c for c in stripped.lower() if c.isalnum())


def _ts_registry() -> dict[str, set[str]]:
    """clé de famille → tokens normalisés (la clé + ses alias), lus dans le TS."""
    source_path = _monorepo_file(_TS_REL)
    if source_path is None:
        pytest.skip("monorepo absent (image de déploiement) — la parité se vérifie en CI")
    source = _strip_line_comments(source_path.read_text(encoding="utf-8"))
    # Chaque entrée : `key: 'xxx',` … `aliases: [ … ],`
    pattern = re.compile(
        r"key:\s*'([a-z]+)',.*?aliases:\s*\[(.*?)\]",
        re.DOTALL,
    )
    registry: dict[str, set[str]] = {}
    for match in pattern.finditer(source):
        key = match.group(1)
        aliases = re.findall(r"'((?:[^'\\]|\\')*)'", match.group(2))
        tokens = {_norm(key)} | {_norm(alias.replace("\\'", "'")) for alias in aliases}
        registry[key] = {token for token in tokens if token}
    return registry


def _resolve(registry: dict[str, set[str]], label: str) -> str | None:
    token = _norm(label)
    if not token:
        return None
    for key, tokens in registry.items():
        if token in tokens:
            return key
    return None


def test_le_registre_ts_est_lisible_et_non_vide() -> None:
    """La garde prouve d'abord qu'elle LIT : onze familles, plus de cinquante
    tokens. Un fichier mal parsé rendrait zéro et tous les tests suivants
    seraient verts pour rien."""
    registry = _ts_registry()
    assert len(registry) == 11, f"extraction TS : {len(registry)} familles au lieu de 11"
    total_tokens = sum(len(tokens) for tokens in registry.values())
    assert total_tokens > 50, f"extraction TS : {total_tokens} tokens, corpus suspect"


def test_les_presets_python_ont_les_memes_cles_que_le_registre() -> None:
    """``_FAMILY_PRESETS`` se dit « MIROIR de FAMILY_DEFS » : on le vérifie au
    lieu de le croire. Une famille ajoutée d'un seul côté est une zone que
    l'écran affiche et que le re-run ciblé ne sait pas chercher."""
    registry = _ts_registry()
    assert len(_FAMILY_PRESETS) == 11, f"presets Python : {len(_FAMILY_PRESETS)} au lieu de 11"
    python_keys = [preset["key"] for preset in _FAMILY_PRESETS]
    assert python_keys == list(registry), "l'ORDRE compte : il départage un libellé ambigu"


def test_les_alias_python_sont_inclus_dans_le_registre() -> None:
    """Le Python peut en connaître MOINS (il n'a pas besoin des libellés composés,
    son ``_find_families`` découpe les séparateurs) — jamais un alias que le
    registre ignore, sinon les deux côtés placent le même contact ailleurs."""
    registry = _ts_registry()
    orphans: list[tuple[str, str]] = []
    checked = 0
    for preset in _FAMILY_PRESETS:
        for alias in preset["aliases"]:
            checked += 1
            if _resolve(registry, alias) != preset["key"]:
                orphans.append((preset["key"], alias))
    assert checked > 50, f"corpus d'alias Python trop maigre ({checked})"
    assert orphans == [], f"alias Python absents (ou mal placés) au registre : {orphans}"


def test_la_normalisation_est_la_meme_des_deux_cotes() -> None:
    """Deux normalisations qui divergent sur une apostrophe rapprochent deux
    choses différentes, ou rien du tout."""
    samples = ["C-Level", "Cybersécurité", "  DSI  ", "Data / BI / Analytics", "Ressources Humaines", "IA / ML"]
    assert len(samples) == 6
    for sample in samples:
        assert _key(sample) == _norm(sample), f"normalisation divergente sur {sample!r}"


def test_chaque_libelle_demande_au_modele_tombe_sur_une_famille() -> None:
    """LE défaut que le registre corrige.

    Avant lui, un seul des dix (« Cybersecurite ») était reconnu ; les neuf
    autres repartaient au repli par mots-clés de titre.
    """
    registry = _ts_registry()
    labels = [label for label in CONTACT_FAMILY_LABELS if label != _NON_FAMILY_LABEL]
    assert len(labels) == 10, f"prompt : {len(labels)} libellés de famille au lieu de 10"
    unresolved = [label for label in labels if _resolve(registry, label) is None]
    assert unresolved == [], f"libellés du prompt sans famille au registre : {unresolved}"


def test_la_seule_famille_sans_libelle_de_prompt_est_nommee() -> None:
    """Le prompt demande DIX familles, le produit en connaît ONZE.

    Celle qui manque est ``infra`` : le prompt la replie dans « IT /
    Infrastructure ». Conséquence mesurable — le modèle n'écrit JAMAIS
    ``Infra`` ; cette famille ne peut venir que du repli par titre de la matrice
    ou du classifieur d'import. Elle s'affiche pourtant à l'écran comme les dix
    autres, avec ses zones blanches.

    Ce test ne CORRIGE rien : il empêche l'écart d'être découvert une troisième
    fois. Le trancher (ajouter le libellé au prompt, ou fusionner ``infra`` dans
    ``it``) est une modification du prompt ET de la taxonomie — parqué en D176.
    """
    registry = _ts_registry()
    prompt_families = {_resolve(registry, label) for label in CONTACT_FAMILY_LABELS if label != _NON_FAMILY_LABEL}
    assert None not in prompt_families
    missing = set(registry) - prompt_families
    assert missing == {"infra"}, f"l'écart prompt ↔ registre a changé : {sorted(missing)}"


def test_autre_ne_devient_jamais_une_famille() -> None:
    """« Autre » est le mot du modèle quand il ne sait pas. Une case cochée par
    ce mot ferait lire « couvert » sur une zone blanche."""
    registry = _ts_registry()
    assert _NON_FAMILY_LABEL in CONTACT_FAMILY_LABELS
    assert _resolve(registry, _NON_FAMILY_LABEL) is None
