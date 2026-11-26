"""#4400.1 (retour bêta ESN, 21/10/2026) — la recherche texte SOUPLE, miroir de ``flexible-search.ts``.

« archi cyber » ne trouvait rien alors qu'« architecte cybersécurité » trouvait. La recherche est désormais :
préfixe (« archi » → « architecte »), insensible à la casse, aux accents et au pluriel, étendue par un petit
lexique d'abréviations du conseil IT, et en ET (TOUS les termes matchent, chacun par préfixe ou par expansion).

Une abréviation courte (≤ 3 lettres) ne se prend JAMAIS en préfixe (« po » ≠ « poste », « sap » ≠ « sapeur »).
Un terme inconnu reste lui-même : jamais un synonyme deviné.

UNE source : ``packages/contracts/src/fixtures/flexible-search.json`` (lexique ET cas), relue par les deux
langages dans leurs tests. Ce lexique doit rester égal à celui du fichier (``test_flexible_search_4400.py``).
"""

from __future__ import annotations

import re
import unicodedata

#: Terme tapé → ce qu'il désigne dans une offre ou un intitulé (accents conservés pour l'affichage).
SEARCH_LEXICON: dict[str, list[str]] = {
    "dev": ["développeur", "développement", "developer", "programmeur"],
    "archi": ["architecte", "architecture", "architect"],
    "admin": ["administrateur", "administration"],
    "sysadmin": ["administrateur systèmes", "administrateur système", "sysadmin", "sysops"],
    "po": ["product owner", "propriétaire produit"],
    "pm": ["project manager", "product manager", "chef de projet"],
    "cdp": ["chef de projet", "responsable de projet"],
    "rssi": ["responsable sécurité des systèmes d'information", "responsable sécurité", "ciso", "rssi"],
    "dsi": ["directeur des systèmes d'information", "directeur systèmes d'information", "cio", "dsi"],
    "infra": ["infrastructure"],
    "réseau": ["réseau", "network"],
    "rézo": ["réseau", "network"],
    "ops": ["operations", "exploitation", "devops", "sysops"],
    "devops": ["devops", "sre", "ops", "intégration continue"],
    "data": ["data", "donnée"],
    "bi": ["business intelligence", "décisionnel"],
    "qa": ["qualité", "testeur", "test", "recette", "quality assurance"],
    "fullstack": ["full stack", "fullstack"],
    "front": ["front", "frontend", "front end"],
    "back": ["back", "backend", "back end"],
    "sap": ["sap", "abap", "s4hana"],
    "moa": ["maîtrise d'ouvrage", "assistance maîtrise d'ouvrage", "moa", "amoa"],
    "amoa": ["assistance maîtrise d'ouvrage", "maîtrise d'ouvrage", "amoa", "moa"],
    "moe": ["maîtrise d'œuvre", "moe"],
    "pmo": ["pmo", "project management office", "bureau des projets"],
    "scrum": ["scrum", "scrum master", "agile"],
    "cyber": ["cybersécurité", "cybersecurity", "sécurité informatique", "ssi", "sécurité", "security"],
    "sécu": ["sécurité", "cybersécurité", "sécurité informatique", "ssi"],
    "ssi": ["ssi", "sécurité des systèmes d'information", "sécurité informatique", "cybersécurité"],
}

_TOKEN = re.compile(r"[a-z0-9+#]+(?:[./][a-z0-9+#]+)*")


def _fold(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return re.sub(r"[’ʼ`']", " ", text)


def _singular(token: str) -> str:
    return token[:-1] if len(token) > 3 and token[-1] in "sx" else token


def _tokens(value: object) -> list[str]:
    return [_singular(t) for t in _TOKEN.findall(_fold(value))]


_BY_TOKEN: dict[str, list[str]] = {" ".join(_tokens(key)): expansions for key, expansions in SEARCH_LEXICON.items()}


def search_tokens(query: object) -> list[str]:
    return _tokens(query)


def lexicon_expands(token: str) -> bool:
    """#4469 — le mot a des expansions déclarées (abréviation du lexique) : sa lecture reste souple."""
    return token in _BY_TOKEN


def _prefix_allowed(token: str) -> bool:
    return len(token) >= 4 or (len(token) == 3 and token not in _BY_TOKEN)


def _matches_word(candidate: str, word: str) -> bool:
    return word.startswith(candidate) if _prefix_allowed(candidate) else word == candidate


def _contains_phrase(phrase: list[str], words: list[str]) -> bool:
    if not phrase:
        return False
    return any(
        all(_matches_word(c, words[start + offset]) for offset, c in enumerate(phrase))
        for start in range(len(words) - len(phrase) + 1)
    )


def matches_flexible_query(query: object, haystack: object) -> bool:
    """Tous les termes de ``query`` matchent ``haystack`` (ET), chacun par préfixe ou par expansion."""
    wanted = _tokens(query)
    if not wanted:
        return False
    words = _tokens(haystack)
    return all(
        _contains_phrase([token], words)
        or any(_contains_phrase(_tokens(expansion), words) for expansion in _BY_TOKEN.get(token, []))
        for token in wanted
    )


def explain_flexible_query(query: object) -> dict[str, list[str]]:
    """Ce que la recherche a essayé EN PLUS de ce qui était tapé — pour le dire dans l'état vide."""
    wanted = _tokens(query)
    expanded: list[str] = []
    for token in wanted:
        for expansion in _BY_TOKEN.get(token, []):
            if " ".join(_tokens(expansion)) != token and expansion not in expanded:
                expanded.append(expansion)
    return {"tokens": wanted, "expanded": expanded}


def upstream_query(query: object) -> str:
    """#4400.1 — la forme à poser à une source d'offres qui cherche des MOTS entiers (« archi cyber » n'est le mot
    d'aucune offre) : chaque abréviation du lexique prend sa première expansion, les autres termes restent tels
    quels. Aucune abréviation connue → la saisie, inchangée (aucun appel de plus)."""
    words = str(query or "").split()
    if not any(_tokens(w) and " ".join(_tokens(w)) in _BY_TOKEN for w in words):
        return " ".join(words)
    return " ".join(
        (_BY_TOKEN[" ".join(_tokens(w))][0] if _tokens(w) and " ".join(_tokens(w)) in _BY_TOKEN else w) for w in words
    )


def or_terms(query: object) -> list[str]:
    """#4400.1 — le palier OU d'une saisie de plusieurs mots : chaque mot pris seul, sous sa forme étendue.
    Une saisie d'un seul mot n'a pas de palier OU (rien à relâcher)."""
    words = str(query or "").split()
    if len(words) < 2:
        return []
    terms: list[str] = []
    for word in words:
        key = " ".join(_tokens(word))
        shown = _BY_TOKEN[key][0] if key in _BY_TOKEN else word
        if len(key) >= 3 and shown not in terms:
            terms.append(shown)
    return terms if len(terms) > 1 else []
