"""Le cadrage d'UN run, lu côté IA (retour Louis 15/10 — « cadrage analyse »).

L'écran « Cadrer » pose quatre questions (Où ? Quelle partie du groupe ? Quoi ?
Qui ?). L'API transmet chaque réponse dans ``scope_selection``
(``graphScopeSelection``, apps/api) ; ce module est l'APPELANT qui manquait pour
trois d'entre elles :

- **postes à placer** (``business_families`` + ``business_family_terms``,
  termes résolus UNE fois par le contrat ``businessFamilyTerms``) → deviennent
  les ``placedRoles`` du profil LE TEMPS DU RUN : c'est le même contrat que
  les « postes visés » du profil (lot JOBS-CIBLE #4182, ``profile_job_scope`` /
  ``rank_offers_by_placed_roles``), donc les offres sont classées par le même
  code ; puis ``keep_run_role_offers`` retire celles qui n'en recoupent aucun.
  Cas Siemens 15/10 : « Bid Manager », « Technicien GTB » restaient affichés
  pour un commercial qui place des profils cyber ;
- **ce que tu vends**, **entités ciblées / exclues**, **thèmes exclus** →
  ``cadrage_directive``, la consigne préfixée au contexte de recherche.

Sans cadrage, chaque fonction rend son entrée telle quelle : un run sans
cadrage reste byte-identique.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from app.services.domain_job_filters import _matches_terms, _role_match_text, _title_blob


def run_role_terms(scope_selection: Mapping[str, Any] | None) -> tuple[str, ...]:
    """Les termes des postes à placer de CE run, ou ``()``.

    Les termes résolus par l'API (``business_family_terms``) gagnent ; à défaut
    (appel direct, run d'avant), chaque libellé est son propre terme — jamais
    une famille devinée.
    """
    if not scope_selection:
        return ()
    raw = scope_selection.get("business_family_terms") or scope_selection.get("business_families") or []
    if not isinstance(raw, (list, tuple)):
        return ()
    terms = (_role_match_text(str(item)) for item in raw if isinstance(item, str))
    return tuple(dict.fromkeys(t for t in terms if t))


#: CASCADE-PLANCHER-5 — ce que le commercial a SAISI dans le cadrage : un poste, un angle libre, une priorité, une
#: entité visée. Les objectifs sont un menu fermé (``OBJECTIVE_PHRASES``) : un choix de menu n'est pas une demande précise.
_TYPED_KEYS = ("business_family_terms", "business_families", "selected_angles", "included_entities")


def explicit_request(scope_selection: Mapping[str, Any] | None, skills: Sequence[str] = ()) -> bool:
    """L'analyse porte-t-elle une demande PRÉCISE (compétence nommée, besoin saisi, périmètre demandé) ?
    Oui ⇒ la cascade des offres va au bout de ses paliers (régime « un max »), dans la borne d'appels payés.
    #4646 — les ``skills`` cherchés dans Découvrir sont une demande précise : sans eux, comportement inchangé."""
    if skills:
        return True
    if not scope_selection:
        return False
    angle = scope_selection.get("angle")
    return bool(isinstance(angle, str) and angle.strip()) or any(_labels(scope_selection, k) for k in _TYPED_KEYS)


def explicit_terms(scope_selection: Mapping[str, Any] | None, skills: Sequence[str] = ()) -> tuple[str, ...]:
    """Les compétences / métiers nommés par le commercial, dans l'ordre saisi, sans doublon — la matière du palier « termes ».
    #4646 — puis les ``skills`` de la recherche Découvrir : la collecte du compte est rejouée AVEC eux."""
    if not scope_selection and not skills:
        return ()
    scope: Mapping[str, Any] = scope_selection or {}
    names = [*_labels(scope, "business_families"), *_labels(scope, "selected_angles"), *skills]
    return tuple(dict.fromkeys(names))


def profile_with_run_roles(profile: dict | None, scope_selection: Mapping[str, Any] | None) -> dict | None:
    """Le profil dont les ``placedRoles`` sont ceux du run (copie), ou le profil tel quel."""
    terms = run_role_terms(scope_selection)
    if not terms:
        return profile
    return {**(profile or {}), "placedRoles": list(terms)}


def keep_run_role_offers(offers: list, terms: Sequence[str]) -> list:
    """Les offres qui recoupent un poste à placer — les autres SORTENT.

    C'est le filtre que le commercial a demandé en cochant « postes que tu veux
    placer » : une offre d'un autre métier n'est pas une piste pour lui. Sans
    terme ⇒ même objet (aucun filtre). L'ordre reçu (déjà classé) est gardé.
    """
    term_tuple = tuple(terms)
    if not term_tuple or not isinstance(offers, list):
        return offers
    return [o for o in offers if isinstance(o, dict) and _matches_terms(_title_blob(o), term_tuple)]


def _labels(scope_selection: Mapping[str, Any], key: str) -> list[str]:
    raw = scope_selection.get(key)
    if not isinstance(raw, (list, tuple)):
        return []
    return [str(v).strip() for v in raw if isinstance(v, str) and v.strip()]


#: Théo B r1-recherche.N1 — la table FERMÉE des objectifs (clés de ``ANALYSIS_OBJECTIVES``, contrat). Le prompt ne
#: reçoit jamais une chaîne libre venue du client : une clé inconnue est ignorée.
OBJECTIVE_PHRASES: dict[str, str] = {
    "open_account": "ouvrir ce compte",
    "prepare_meeting": "préparer un rendez-vous",
    "find_decision_makers": "trouver les décideurs",
    "understand_group": "comprendre le groupe",
    "verify_signal": "vérifier un signal",
    "prepare_listing": "préparer un référencement",
    "map_partners_competitors": "situer les partenaires et concurrents",
    "other": "un autre objectif (voir le contexte libre)",
}


def _objectives(scope_selection: Mapping[str, Any]) -> list[str]:
    return [OBJECTIVE_PHRASES[k] for k in _labels(scope_selection, "objectives") if k in OBJECTIVE_PHRASES]


def cadrage_directive(scope_selection: Mapping[str, Any] | None) -> str | None:
    """La consigne de collecte tirée du cadrage, ou ``None`` (rien de posé)."""
    if not scope_selection:
        return None
    lines: list[str] = []
    objectives = _objectives(scope_selection)
    if objectives:
        lines.append(
            "OBJECTIFS DU COMMERCIAL : "
            + ", ".join(objectives)
            + ". Le dossier doit servir CES objectifs, dans cet ordre."
        )
    angle = scope_selection.get("angle")
    if isinstance(angle, str) and angle.strip():
        lines.append(
            f"ANGLE DU COMMERCIAL : {angle.strip()[:300]}. C'est l'angle qu'il veut voir ressortir du dossier."
        )
    priorities = _labels(scope_selection, "selected_angles")
    if priorities:
        lines.append(
            "CE QUE LE VENDEUR VEND (priorités) : "
            + ", ".join(priorities)
            + ". Oriente les angles d'attaque et les signaux d'abord sur ces thèmes."
        )
    roles = _labels(scope_selection, "business_families")
    if roles:
        lines.append(
            "POSTES QUE LE VENDEUR VEUT PLACER : "
            + ", ".join(roles)
            + ". Les recrutements et les contacts de ces métiers passent en premier."
        )
    targeted = _labels(scope_selection, "included_entities")
    if targeted:
        lines.append(
            "ENTITÉS CIBLÉES : " + ", ".join(targeted) + ". Concentre la collecte sur elles et leurs décideurs."
        )
    excluded = _labels(scope_selection, "excluded_entities")
    if excluded:
        lines.append("ENTITÉS EXCLUES : " + ", ".join(excluded) + ". Ne les traite pas, ni leurs contacts.")
    themes = _labels(scope_selection, "excluded_angles")
    if themes:
        lines.append("THÈMES EXCLUS : " + ", ".join(themes) + ". Ne propose aucun angle sur ces thèmes.")
    if not lines:
        return None
    return "CADRAGE DU COMMERCIAL :\n" + "\n".join(f"- {line}" for line in lines)
