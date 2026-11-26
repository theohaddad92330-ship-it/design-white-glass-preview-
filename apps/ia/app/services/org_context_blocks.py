"""Les blocs de contexte du prompt d'organigramme (OrgGraph FINAL).

Sept blocs, et chacun répond à une question que le modèle se posait tout seul —
c'est-à-dire à laquelle il répondait par une supposition présentée comme un fait :

``GRAPH_COVERAGE``
    Combien de personnes existent, combien il en voit. Sans ce bloc, un lot de
    50 personnes sur un compte qui en compte 2 241 se lit comme LE compte, et le
    modèle écrit « l'organisation est structurée autour de trois directions ».

``ENTITY_SCOPE``
    Ce qui est DANS le périmètre et ce qui en est SORTI, avec la raison. Le
    prompt donnait déjà ``ENTITIES`` (ce qui est dedans) ; il ne disait jamais ce
    qui avait été écarté, si bien qu'une filiale volontairement hors sujet
    revenait par la fenêtre à chaque run.

``DIRECTION_SCOPE``
    Quand la vague vise UNE direction. Le modèle doit alors cartographier CELLE-LÀ
    et dire ce qu'il ne voit pas ailleurs, plutôt que d'extrapoler.

``PROJECT_CONTEXT``
    Les besoins ouverts sur ce compte. Une chaîne de décision se construit AUTOUR
    d'un achat en cours ; sans le savoir, le modèle produit un organigramme
    général, juste et inutile.

``EXISTING_GRAPH_SUMMARY``
    Ce que le graphe STOCKÉ sait déjà. C'est le bloc qui rend la fusion par delta
    intelligible au modèle : il travaille sur un lot, mais il sait qu'il complète
    un graphe, il ne le refonde pas.

``WORKSPACE_CORRECTIONS``
    Ce qu'un humain a corrigé à la main, et qui fait foi. **Une correction
    humaine gagne toujours** — encore faut-il que le modèle la CONNAISSE, sans
    quoi il repropose l'erreur à chaque vague et l'utilisateur la recorrige.

``RELATION_EVIDENCE``
    Les preuves déjà connues d'un lien. Le prompt EXIGEAIT une ``evidence`` en
    sortie sans jamais en fournir en entrée : le modèle devait donc l'inventer ou
    se taire.

──────────────────────────────────────────────────────────────────────────────
LA RÈGLE COMMUNE : VIDE ⇒ ``""`` ⇒ PROMPT INCHANGÉ
──────────────────────────────────────────────────────────────────────────────
Comme ``feedback_directives_block`` et ``workspace_learning_block`` : une entrée
vide rend la chaîne vide, et l'appelant écrit « non fourni ». Jamais un bloc
squelette qui apprendrait au modèle à ignorer les blocs.

──────────────────────────────────────────────────────────────────────────────
⚠️ AUCUN CRITÈRE PROTÉGÉ NE FRANCHIT CETTE PORTE
──────────────────────────────────────────────────────────────────────────────
``WORKSPACE_CORRECTIONS`` est le bloc le plus sensible du lot : y faire entrer
des corrections humaines, c'est faire entrer des données de PERSONNES dans le
prompt qui reconstruit la chaîne de décision — c'est-à-dire dans un prompt qui
CLASSE des gens (annexe III de l'EU AI Act ; le droit des données personnelles
suffit de toute façon).

Trois verrous, empilés à dessein, parce qu'un seul se contourne :

1. **Une liste BLANCHE de clés**, pas une liste noire. Un champ inconnu ne
   voyage pas : c'est la seule discipline qui reste vraie le jour où un
   fournisseur ajoute un champ que personne n'a prévu.
2. **Une liste BLANCHE de champs corrigibles** — les dix de
   ``ORG_CORRECTION_FIELDS`` (titre, entité, niveau, rôles, N+1, nom, parent,
   type, vérifié, présence). Aucun n'est un critère protégé, et un ``field``
   hors liste fait tomber la ligne entière.
3. **``strip_protected_criteria`` en sortie**, sur la structure rendue. Ceinture
   et bretelles : si un jour une valeur imbriquée passait les deux premiers
   verrous, elle ne passerait pas celui-là.

Ce qui est délibérément EXCLU, et pourquoi :

* **``reason``** — la raison écrite par la personne. C'est du texte LIBRE, donc
  non borné, donc impossible à prouver exempt de critère protégé (« je l'ai
  rencontrée, elle est enceinte, elle part en congé »). Le couple
  ``field`` + ``correctedValue`` dit déjà CE QU'IL FAUT SAVOIR : quelle
  affirmation fait foi. Le POURQUOI reste dans le ledger, lisible par un humain,
  et ne part pas au modèle.
* **``userId``** — qui a corrigé n'aide pas à cartographier, et c'est une donnée
  personnelle de plus dans un prompt qui n'en a pas besoin.

Les DEUX exceptions nommées de la doctrine sont les seules qui restent :
l'IDENTITÉ (le livrable DÉSIGNE la personne, et la réponse du modèle se recolle
à sa graine par le nom) et la VILLE / le PAYS (plus grossiers qu'un code postal)
— cette dernière n'apparaissant d'ailleurs dans aucun de ces sept blocs.

Garde : ``apps/ia/tests/test_org_context_blocks.py``, qui empoisonne des
corrections avec les sept critères et relit le texte RENDU ; et
``apps/ia/tests/test_protected_criteria_scoring.py``, qui exécute la vraie
phase 3 et relit le texte réellement envoyé au modèle.
"""

from __future__ import annotations

import json
from typing import Any

from app.services.protected_criteria import strip_protected_criteria

#: Les dix champs corrigibles de ``ORG_CORRECTION_FIELDS``
#: (``packages/contracts/src/schemas/org-graph-correction.ts``). Aucun n'est un
#: critère protégé — et c'est vérifiable, parce que la liste est FERMÉE.
#: Un ``field`` absent d'ici fait tomber la correction entière : on ne devine pas
#: ce qu'un champ inconnu contient.
CORRECTABLE_FIELDS: frozenset[str] = frozenset(
    {
        "title",
        "entityId",
        "hierarchyLevel",
        "decisionRoles",
        "reportsTo",
        "name",
        "parentId",
        "type",
        "verified",
        "presence",
    }
)

#: La liste BLANCHE des clés d'une correction qui voyagent jusqu'au modèle.
#: ``reason`` et ``userId`` n'y sont PAS — voir le docstring du module.
_CORRECTION_KEYS: tuple[str, ...] = (
    "personName",
    "field",
    "previousValue",
    "correctedValue",
    "evidenceKind",
    "correctedAt",
)

#: Plafonds. Un bloc qui grossit sans borne finit par pousser le prompt hors du
#: budget d'entrée — le défaut mesuré sur Orange (203k > 200k), déjà payé une fois.
_MAX_CORRECTIONS = 40
_MAX_PROJECTS = 8
_MAX_EVIDENCE = 30
_MAX_NAMES = 60


def _clean(value: Any) -> Any:
    """Le troisième verrou — aucune clé protégée ne sort d'ici, à aucun niveau."""
    return strip_protected_criteria(value)


def _json(value: Any) -> str:
    return json.dumps(_clean(value), ensure_ascii=False)


def graph_coverage_block(
    *,
    discovered: int | None,
    reaching_model: int | None,
    already_classified: int | None = None,
) -> str:
    """Ce que le modèle VOIT, rapporté à ce qui EXISTE.

    ``None`` = non mesuré, et le bloc le DIT (« non mesuré ») plutôt que d'écrire
    ``0`` — « zéro personne découverte » et « on n'a pas su compter » sont deux
    affirmations différentes, et la seconde n'autorise aucune conclusion.

    Rend ``""`` quand rien n'est mesurable : un bloc qui ne dit que des « non
    mesuré » n'apprend rien au modèle et coûte des tokens à chaque appel.
    """
    if discovered is None and reaching_model is None and already_classified is None:
        return ""

    def say(value: int | None) -> str:
        return "non mesure" if value is None else str(value)

    lines = [
        f"- personnes connues sur ce compte : {say(discovered)}",
        f"- personnes soumises a CETTE analyse : {say(reaching_model)}",
    ]
    if already_classified is not None:
        lines.append(f"- personnes deja classees par un passage precedent : {already_classified}")
    lines.append(
        "Regle : ce que tu vois est un ECHANTILLON, pas le compte. N'affirme jamais "
        "l'exhaustivite d'une direction ni l'absence d'un role sur la seule base de "
        "cet echantillon — dis-le dans `uncoveredZones`."
    )
    return "\n".join(lines)


def entity_scope_block(*, in_scope: list[Any] | None, out_of_scope: list[Any] | None) -> str:
    """Ce qui est dans le périmètre, et ce qui en a été SORTI avec sa raison."""
    inside = list(in_scope or [])
    outside = list(out_of_scope or [])
    if not inside and not outside:
        return ""

    parts: list[str] = []
    if inside:
        parts.append(f"- dans le perimetre : {_json(inside)}")
    if outside:
        parts.append(f"- ECARTEES du perimetre (ne pas y rattacher de personne) : {_json(outside)}")
    parts.append(
        "Regle : toute personne rattachee a une entite ecartee est hors sujet — "
        "signale-la dans `rejectedItems` plutot que de la classer."
    )
    return "\n".join(parts)


def direction_scope_block(direction: str | None) -> str:
    """La direction que CETTE vague vise, quand elle en vise une."""
    label = (direction or "").strip()
    if not label:
        return ""
    return (
        f"- direction visee par cette vague : {label}\n"
        "Regle : cartographie CETTE direction en priorite. Ce que tu ne peux pas "
        "etablir AILLEURS n'est pas une absence — ne l'affirme pas."
    )


def project_context_block(projects: list[Any] | None) -> str:
    """Les besoins ouverts — ce autour de quoi la chaîne de décision se joue."""
    rows = [row for row in (projects or []) if row][:_MAX_PROJECTS]
    if not rows:
        return ""
    return (
        f"- besoins ouverts connus sur ce compte : {_json(rows)}\n"
        "Regle : la chaine de decision se construit AUTOUR d'un achat en cours. "
        "Relie les roles a ces besoins quand un element l'etablit ; ne l'invente pas."
    )


def existing_graph_summary_block(summary: dict[str, Any] | None) -> str:
    """Ce que le graphe DÉJÀ STOCKÉ sait — le bloc qui rend un delta lisible.

    Ne porte que des comptes et des NOMS (l'identité, exception nommée) : ni
    titre, ni photo, ni ville, ni rien d'autre sur les personnes.
    """
    data = summary or {}
    people = int(data.get("peopleCount") or 0)
    entities = int(data.get("entityCount") or 0)
    verified = int(data.get("verifiedRelations") or 0)
    names = [str(name) for name in (data.get("knownPeople") or []) if name][:_MAX_NAMES]
    if not (people or entities or verified or names):
        return ""

    lines = [
        f"- le graphe deja stocke porte {people} personne(s), {entities} entite(s), "
        f"{verified} relation(s) verifiee(s)",
    ]
    if names:
        lines.append(f"- deja connues : {_json(names)}")
    lines.append(
        "Regle : tu COMPLETES ce graphe, tu ne le refondes pas. Ne contredis une "
        "relation deja verifiee que si un element FOURNI l'etablit."
    )
    return "\n".join(lines)


def workspace_corrections_block(corrections: list[dict[str, Any]] | None) -> str:
    """Ce qu'un humain a corrigé à la main, et qui FAIT FOI.

    ⚠️ Le bloc le plus sensible du module — lire les trois verrous du docstring
    de tête AVANT d'y ajouter quoi que ce soit. En résumé : liste blanche de
    clés, liste blanche de champs, nettoyage en sortie, et ``reason`` exclue
    parce que c'est du texte libre.
    """
    rows: list[dict[str, Any]] = []
    for entry in corrections or []:
        if not isinstance(entry, dict):
            continue
        # Verrou 2 — un champ hors de la liste fermée fait tomber la ligne.
        if str(entry.get("field") or "") not in CORRECTABLE_FIELDS:
            continue
        # Verrou 1 — liste BLANCHE de clés : rien d'autre ne voyage.
        row = {key: entry[key] for key in _CORRECTION_KEYS if key in entry}
        if row:
            rows.append(row)
        if len(rows) >= _MAX_CORRECTIONS:
            break

    if not rows:
        return ""
    # Verrou 3 — le nettoyage, sur la structure RENDUE.
    return (
        f"- corrections humaines en vigueur : {_json(rows)}\n"
        "Regle : une correction humaine FAIT FOI, quelle que soit sa date et quoi "
        "que disent les autres elements. Ne repropose JAMAIS la valeur corrigee."
    )


def relation_evidence_block(evidence: list[dict[str, Any]] | None) -> str:
    """Les preuves DÉJÀ connues d'un lien — celles qu'on n'a pas à réinventer."""
    rows = [row for row in (evidence or []) if isinstance(row, dict)][:_MAX_EVIDENCE]
    if not rows:
        return ""
    return (
        f"- preuves deja connues de liens : {_json(rows)}\n"
        "Regle : cite ces elements dans `evidence` quand ils etablissent le lien "
        "que tu emets. Une preuve d'IDENTITE ne prouve aucune RELATION."
    )
