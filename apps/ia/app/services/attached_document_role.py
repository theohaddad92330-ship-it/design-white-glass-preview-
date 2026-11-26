"""#AM.57 / #AM.58 (#4059) — ce qu'est un document joint à /chat : un BESOIN entrant ou un CV.

Un besoin collé en texte se compile déjà en proposition (`compile_need`) ; un document joint (PDF, DOCX) doit être lu
de la même façon, au lieu d'être résumé comme un fichier quelconque. Un CV joint est PROPOSÉ à l'import CV existant
(lecture automatique, fiche `needs_review` — rien n'est publié sans validation), puis entre dans la comparaison. Le
rôle se lit sur le CONTENU, par marqueurs : un document que rien ne désigne reste un document ordinaire (aucune note).
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Literal

DocumentRole = Literal["need", "cv"]

_NEED_MARKERS = (
    r"appel d'offres?",
    r"profil recherche",
    r"profils? souhaites?",
    r"competences? requises?",
    r"demarrage",
    r"\btjm\b",
    r"\bregie\b",
    r"\bforfait\b",
    r"duree de la mission",
    r"mission de \d+",
    r"cahier des charges",
    r"\bbesoin\b",
    r"anciennete|\d+ ans d'experience",
)
_CV_MARKERS = (
    r"curriculum",
    r"experiences? professionnelles?",
    r"\bformation\b",
    r"\bdiplomes?\b",
    r"centres? d'interet",
    r"\blangues\b",
    r"competences? cles?",
    r"parcours",
)


def _fold(text: object) -> str:
    plain = "".join(c for c in unicodedata.normalize("NFD", str(text or "")) if unicodedata.category(c) != "Mn")
    return " ".join(plain.lower().replace("’", "'").split())


def _hits(text: str, markers: tuple[str, ...]) -> int:
    return sum(1 for marker in markers if re.search(marker, text))


def document_role(doc: dict[str, Any]) -> DocumentRole | None:
    """``"need"`` / ``"cv"`` quand au moins deux marqueurs du rôle l'emportent sur l'autre ; sinon ``None``."""
    title = _fold(doc.get("title"))
    text = _fold(doc.get("content"))[:6000]
    if not text:
        return None
    need, cv = _hits(text, _NEED_MARKERS), _hits(text, _CV_MARKERS)
    # Le nom de fichier est un indice, jamais une preuve : il départage seulement.
    if re.search(r"(^|[^a-z])cv([^a-z]|$)|curriculum", title):
        cv += 1
    if need >= 2 and need > cv:
        return "need"
    if cv >= 2 and cv > need:
        return "cv"
    return None


def attached_documents_note(docs: list[dict[str, Any]]) -> str:
    """La consigne du tour pour les documents joints qui sont un besoin ou un CV ; ``""`` sinon (prompt inchangé)."""
    needs = [str(d.get("title") or "Document") for d in docs if document_role(d) == "need"]
    cvs = [str(d.get("title") or "Document") for d in docs if document_role(d) == "cv"]
    parts: list[str] = []
    if needs:
        parts.append(
            f"BESOIN ENTRANT JOINT ({', '.join(f'« {name} »' for name in needs)}) — #AM.57 : lis-le comme tu lirais un "
            "besoin collé. Appelle `compile_need` (source.kind = « document », filename = son nom) : une PROPOSITION "
            "relue, jamais un besoin créé. Pour comparer des profils, passe les critères du document à `run_matching` "
            "via `draft_need` : le besoin n'est pas créé dans le pipe, « Créer le besoin » reste un geste séparé."
        )
    if cvs:
        parts.append(
            f"CV JOINT ({', '.join(f'« {name} »' for name in cvs)}) — #AM.58 : ce CV n'est PAS encore dans le vivier. "
            "Propose-le à l'import CV existant (carte `/consultants?importCv=true` : lecture automatique, fiche en "
            "`needs_review` à valider) — la carte porte un bouton « Ajouter un CV » qui ouvre le dépôt sans quitter "
            "la conversation ; ne le présente jamais comme déjà importé ni classé. Quand l'import est fait, le fil "
            "reçoit un message de la personne qui nomme la fiche : relance alors `run_matching` sur le MÊME besoin "
            "du fil (ou le même `draft_need`) : dis ce que ce CV change, sans oublier les profils déjà examinés."
        )
        # #4421.2 / #4421.10 (mesure prod 24/10) — « trouve moi une mission à Lille pour ce profil » + CV : Laura
        # répondait « pas encore importé, aucune mission ne peut être qualifiée ». Le CV se LIT, tout de suite.
        parts.append(
            "CV JOINT ET MISSIONS (#4421) — « trouve-moi des missions / des comptes pour ce profil » avec ce CV : "
            "l'import au vivier n'est jamais un préalable. Lis le CV TOI-MÊME et appelle tout de suite "
            "`find_accounts_for_talent` SANS `consultant`, avec `skills` = ses compétences telles qu'une offre les "
            "écrit (des termes courts : « Copilot », « IA générative », « Java » — jamais une phrase) et `zones` : "
            "la zone DITE dans le message prime sur celles du CV et de la fiche (« à Lille » → Lille) ; sans zone "
            "dite, celle du CV. Plusieurs villes dans le CV ne sont pas une contradiction à trancher : tu retiens "
            "la zone dite, sinon la première, et tu le dis dans la ligne d'annonce. Aucune question avant le "
            "résultat ; « Ajouter un CV » reste proposé APRÈS le résultat, comme un geste à part."
        )
    return "\n\n" + "\n\n".join(parts) if parts else ""
