"""#3857.2 — la TABLE de synonymes / abréviations métier de la recherche de méthode.

Louis (10/10/2026) : « BI », « BA », « DSI », « RSSI »… doivent retrouver le même
contenu que leur forme longue, et inversement. Un seul endroit (cette table,
versionnée avec le code), appliquée à la RECHERCHE : la requête ET les chunks
sont étiquetés avec l'identifiant de leur groupe, au moment où `method_knowledge`
tokenise — aucun ré-index vectoriel, aucune table à migrer.

Règles d'ajout : termes pliés (minuscules, sans accent), un terme ne figure que
dans UN groupe (gardé par le test), et une abréviation courte est cherchée en
MOT ENTIER (jamais « bi » dans « bibliothèque »).
"""

from __future__ import annotations

import re

#: Chaque groupe = des formes équivalentes (abréviation et formes longues).
SYNONYM_GROUPS: tuple[tuple[str, ...], ...] = (
    ("bi", "business intelligence", "decisionnel", "informatique decisionnelle"),
    ("ba", "business analyst", "analyste metier", "analyste fonctionnel"),
    ("dsi", "directeur des systemes d'information", "directeur informatique", "direction des systemes d'information"),
    ("rssi", "responsable securite des systemes d'information", "responsable de la securite des systemes d'information", "ciso"),
    ("dpo", "delegue a la protection des donnees", "data protection officer"),
    ("pmo", "project management office", "bureau de gestion de projets"),
    ("cto", "directeur technique", "chief technology officer"),
    ("daf", "directeur administratif et financier"),
    ("drh", "directeur des ressources humaines"),
    ("tma", "tierce maintenance applicative"),
    ("moa", "amoa", "maitrise d'ouvrage", "assistance a maitrise d'ouvrage"),
    ("moe", "maitrise d'oeuvre"),
    ("esn", "ssii", "societe de services numeriques", "societe de services informatiques"),
    ("ao", "appel d'offres", "appel d'offre"),
    ("po", "product owner"),
    ("erp", "progiciel de gestion integre"),
)

_PHRASE_TO_GROUP: dict[str, str] = {term: f"syn:{group[0]}" for group in SYNONYM_GROUPS for term in group}

_TERM_RE = re.compile(
    r"(?<![a-z0-9])(?:"
    + "|".join(re.escape(t) for t in sorted(_PHRASE_TO_GROUP, key=len, reverse=True))
    + r")(?![a-z0-9])"
)


def synonym_tags(folded_text: str) -> set[str]:
    """Les étiquettes de groupe présentes dans un texte DÉJÀ plié (sans accent, minuscule)."""
    text = folded_text.replace("’", "'")
    return {_PHRASE_TO_GROUP[m.group(0)] for m in _TERM_RE.finditer(text)}
