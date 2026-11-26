"""Moteur de décision « ce compte vaut-il un mouvement maintenant ? » (#3179,
LAU-FINAL-185, retour bêta 28/09/2026, issue #3179).

Le retour décrit Laura transformant SYSTÉMATIQUEMENT toute entreprise demandée
en cible à prospecter, sans jamais dire qu'un compte est techniquement
cohérent mais commercialement mauvais MAINTENANT. Ce module rend le verdict —
il ne décide PAS seul de l'action : c'est `execute_chat_tool` (le nouvel outil
`get_account_suitability_verdict`) qui l'expose à la conversation, et Laura
qui le dit.

Déterministe — aucun appel modèle, même doctrine que `account_score_axes.py`
(« une note demandée à un modèle change d'un run à l'autre sur le même
dossier »). Réutilise `account_score_axes.compute_axes` pour les CINQ axes
qu'un calcul existe déjà pour mesurer (GA-26, « un calcul vit à un seul
endroit ») plutôt que de les recalculer sous un autre nom : `fit` →
adéquation offre/besoin, `signal` → signal actuel, `accessibility` →
accessibilité, `capacity` → taille et capacité de l'ESN, `data_quality` →
qualité de la donnée.

Le retour nomme QUATORZE axes. Les neuf restants (références et preuves
mobilisables, différenciation, relations internes, partenaires, barrières
achats, saturation concurrentielle, cycle commercial probable, économie
potentielle, coût d'opportunité) n'ont AUCUNE source de données dédiée dans
le produit aujourd'hui — les inventer produirait une note qui a l'air
mesurée et ne l'est pas. `UNEVALUATED_AXES` les nomme, avec leur raison
(doctrine « on nomme ce qui n'a pas pu être évalué », jamais deviné).
Deux de ces neuf se MESURENT depuis, quand leur source existe : « partenaires »
(`account_partners`, #185.2) et « références et preuves mobilisables »
(`referenceSectors` contre `accounts.sector`, #3476) — sans source, ils restent
nommés, avec la raison de l'absence.

Règles du retour, tenues structurellement (chacune a son test) :
- une inconnue ne vaut jamais zéro → `NOT_EVALUABLE` dès que trois axes ou
  plus sur cinq sont plafonnés par la donnée, jamais une note basse déguisée.
- aucun pourcentage de chance de signature → aucun champ numérique de
  probabilité dans la sortie (doctrine, six fois refusée).
- aucune décision fondée uniquement sur la taille du groupe → `capacity` est
  le seul axe qui porte une notion de taille déclarée ; un `capacity` faible
  seul (fit et accessibilité corrects) ne peut PAS produire `NO_GO_NOW`.
- Market Memory seule ne crée pas de timing → `signal` fort seul (fit et
  accessibilité faibles ou inconnus) ne peut PAS produire `GO_NOW`.
- une technologie absente ne produit pas automatiquement un NO_GO → `fit`
  mesure un recoupement texte, jamais une liste de technologies ; un `fit`
  plafonné par un profil incomplet (`limitedByData`) n'entre jamais dans les
  facteurs bloquants.
- le verdict doit être explicable axe par axe → `dominant_reasons` et
  `blocking_factors` citent chacun le nom de l'axe et sa preuve.
- le verdict est toujours relatif au profil et au moment → calculé à partir
  de `analysis` et `profile` passés par l'appelant, jamais mis en cache par
  compte seul ; `recheck_condition` nomme ce qui ferait changer le verdict.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from app.services.account_score_axes import compute_axes
from app.services.entities import _no_go_hit, derive_no_go_keywords

#: L'outil `/chat`, défini ICI (pas dans `chat_tools.py`) pour la même raison
#: que `ACCOUNT_PREFLIGHT_TOOL` dans `compilers/account_preflight.py` : huit
#: lots-compilateurs tournent en parallèle sur ce fichier de 6500+ lignes, la
#: logique vit à côté du calcul qu'elle expose, `chat_tools.py` ne reçoit
#: qu'un AJOUT PUR (import, entrée dans `CHAT_TOOLS`, branche d'exécution).
GET_ACCOUNT_SUITABILITY_VERDICT_TOOL: dict[str, Any] = {
    "name": "get_account_suitability_verdict",
    "description": (
        "Rend le VERDICT D'APTITUDE COMMERCIALE d'UN compte déjà connu, pour CE profil ESN, "
        "MAINTENANT — jamais une note de potentiel générique. À utiliser avant de proposer de "
        "prospecter un compte, en particulier un compte demandé nommément par l'utilisateur "
        "(un compte techniquement cohérent peut être commercialement mauvais aujourd'hui). Un des "
        "six verdicts canoniques : `GO_NOW` (mouvement immédiat), `GO_VIA_PARTNER` (une voie "
        "partenaire est plus rationnelle qu'une entrée directe), `GO_AFTER_PROOF` (une référence, "
        "une preuve ou un contact manque avant d'avancer), `WATCH` (compatible, aucun mouvement "
        "actuel ne justifie l'effort), `NO_GO_NOW` (coût commercial supérieur à la valeur "
        "attendue à court terme), `NOT_EVALUABLE` (trop de données manquent pour juger). Jamais "
        "de pourcentage de chance de signature — le verdict s'explique par les AXES mesurés "
        "(`dominant_reasons` / `blocking_factors`), et nomme ce qui n'a PAS pu être évalué "
        "(`unknowns`) plutôt que de le deviner. Ne fonde JAMAIS un `NO_GO_NOW` sur la seule "
        "taille du groupe, et ne fonde JAMAIS un `GO_NOW` sur un seul signal marché sans "
        "adéquation ni accessibilité réelles. Rends le résultat en carte `verdict` : "
        "`conclusion` = le verdict et son libellé (`verdict_label`), `reasons` = "
        "`dominant_reasons`/`blocking_factors` (l'axe et sa preuve), `limits` = `unknowns` "
        "(ce qui n'a pas pu être évalué), `next_action` = `proof_needed`/`best_route` quand "
        "présents."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "account_id": {
                "type": "string",
                "description": "L'identifiant (UUID) du compte à évaluer.",
            }
        },
        "required": ["account_id"],
    },
}

#: Les six verdicts canoniques (issue #3179, section VERDICTS CANONIQUES).
VERDICTS: tuple[str, ...] = (
    "GO_NOW",
    "GO_VIA_PARTNER",
    "GO_AFTER_PROOF",
    "WATCH",
    "NO_GO_NOW",
    "NOT_EVALUABLE",
)

#: Nom lisible du verdict, pour un affichage qui ne recopie pas la constante
#: technique — même contrat que les autres registres de verdicts du dépôt.
VERDICT_LABELS_FR: dict[str, str] = {
    "GO_NOW": "mérite un mouvement immédiat",
    "GO_VIA_PARTNER": "plus rationnel via une voie partenaire",
    "GO_AFTER_PROOF": "nécessite d'abord une référence ou une preuve",
    "WATCH": "compatible, sans mouvement actuel qui justifie l'effort",
    "NO_GO_NOW": "coût commercial supérieur à la valeur attendue à court terme",
    "NOT_EVALUABLE": "données indispensables manquantes",
}

#: #3223 (lot R17, épopée #3223) — « grand compte », au MÊME seuil que
#: `analysisScopeGuardrailFor` (`packages/contracts/src/schemas/analysis-scope-
#: guardrail.ts`, `GE_HEADCOUNT_FLOOR`) : 5000 salariés et plus. Ce module est
#: Python et ne peut pas importer ce fichier TS — le seuil est RECOPIÉ,
#: jamais réinventé (GA-26 appliqué au-delà d'un même langage).
_LARGE_ACCOUNT_HEADCOUNT_FLOOR = 5000


#: Le MINIMUM de la tranche publiée (« 5 000 à 9 999 salariés » → 5000), même
#: lecture que `headcountFloorReachesGe` côté TS. Illisible → pas un grand compte.
def _is_large_account(employees: str | None) -> bool:
    match = re.search(r"\d[\d\s  ]*", employees or "")
    if not match:
        return False
    floor = int(re.sub(r"\D", "", match.group(0)) or 0)
    return floor >= _LARGE_ACCOUNT_HEADCOUNT_FLOOR


#: Les cinq axes MESURÉS, et le libellé du retour #3179 auquel chacun
#: correspond — un mappage, jamais un second calcul (GA-26).
_MEASURED_AXIS_LABELS: dict[str, str] = {
    "fit": "adéquation offre / besoin",
    "signal": "signal actuel",
    "accessibility": "accessibilité",
    "capacity": "taille et capacité de l'ESN",
    "data_quality": "qualité de la donnée",
}

#: Les neuf axes NOMMÉS par le retour #3179 qu'aucune source du produit ne
#: mesure aujourd'hui — chacun avec sa raison, jamais une valeur devinée.
UNEVALUATED_AXES: dict[str, str] = {
    "références et preuves mobilisables": "aucun secteur de référence déclaré dans le profil (onboarding › Secteurs).",
    "différenciation": "aucune mesure de différenciation concurrentielle n'existe dans le produit.",
    "relations internes": (
        "aucun modèle de relation interne (sponsor, contact déjà en poste côté client) n'est lu "
        "par ce moteur."
    ),
    "partenaires": "aucune donnée de partenaire PAR COMPTE n'est branchée ici (le marché des partenaires, pas ce compte).",
    "barrières achats": "aucune donnée d'achats ou de barrière n'est collectée par compte.",
    "saturation concurrentielle": "capturée aujourd'hui à l'intérieur de l'axe capacité, pas mesurée séparément.",
    "cycle commercial probable": "aucune durée de cycle n'est mesurée par compte.",
    "économie potentielle": "aucune taille de deal ni budget n'est mesurée par compte.",
    "coût d'opportunité": "nécessite une comparaison de portefeuille que ce moteur ne fait pas seul.",
}

#: Sous ce total de trois axes sur cinq plafonnés par la donnée, le verdict
#: devient `NOT_EVALUABLE` — même seuil que `account_score.py` pour un score
#: qui « ne dit rien » (règle CLAUDE.md « une inconnue ne vaut jamais zéro »).
_NOT_EVALUABLE_THRESHOLD = 3
_MID = 3  # moitié de AXIS_MAX (5) arrondie — seuil « axe correct » partagé.


def _axis_reason(axis: Mapping[str, Any]) -> dict[str, str]:
    return {
        "axis": _MEASURED_AXIS_LABELS[str(axis["axis"])],
        "evidence": str(axis.get("evidence") or ""),
    }


_REFERENCES_AXIS = "références et preuves mobilisables"


def _sector_reference(
    profile: Mapping[str, Any] | None, sector: str | None
) -> tuple[dict[str, str] | None, str | None]:
    """#3476 (#3242 / #185.2) — l'axe « références et preuves mobilisables », lu de
    `referenceSectors` : les secteurs où l'ESN DÉCLARE une référence réelle
    (onboarding › Secteurs, #2041.2, `esnAnswersToProfileData`), saisis depuis le
    lot 26 et que rien ne lisait. Rapprochés du secteur DÉCLARÉ du compte
    (`accounts.sector`) par EXACTEMENT la règle mot-clé des secteurs exclus
    (`derive_no_go_keywords` / `_no_go_hit`, GA-26) : jeton entier ou son pluriel,
    jamais un préfixe lâche (« banque » ne recoupe pas « Banquettes »).

    Rend `(mesure, None)` quand un secteur déclaré recoupe le compte, sinon
    `(None, raison)` — l'axe reste NOMMÉ non évalué : une déclaration absente
    n'est pas une absence de référence, jamais un zéro."""
    raw = (profile or {}).get("referenceSectors")
    declared = [str(x).strip() for x in raw if str(x).strip()] if isinstance(raw, list) else []
    account_sector = str(sector or "").strip()
    if not declared:
        return None, UNEVALUATED_AXES[_REFERENCES_AXIS]
    if not account_sector:
        return None, (
            f"le secteur de ce compte est inconnu : les secteurs de référence déclarés ({', '.join(declared)}) "
            "ne peuvent pas lui être rapprochés."
        )
    for label in declared:
        if _no_go_hit(account_sector, derive_no_go_keywords([label])) is not None:
            return {"declared_sector": label, "account_sector": account_sector}, None
    return None, (
        f"aucune référence déclarée dans le secteur de ce compte ({account_sector}) — "
        "l'absence de déclaration n'est pas une absence de référence."
    )


_PARTNERS_AXIS = "partenaires"
_PARTNERS_NONE_DECLARED = "aucun partenaire déclaré sur ce compte — absence de ligne, pas preuve d'absence de partenaire."


def _declared_partners(partners: Sequence[Mapping[str, Any]] | None) -> list[dict[str, str]]:
    """Les partenaires DÉCLARÉS ou détectés (`relationship = partner`, non écartés)
    d'un compte, lus d'`account_partners` par l'appelant. Jamais un concurrent."""
    kept: list[dict[str, str]] = []
    for row in partners or ():
        name = str(row.get("name") or "").strip()
        if not name or row.get("relationship") != "partner" or row.get("dismissed_at"):
            continue
        kept.append({"name": name, "rank": str(row.get("rank") or "unknown"), "source": str(row.get("source") or "declared")})
    return kept


def with_workspace_contacts(analysis: Mapping[str, Any], reading: Mapping[str, Any] | None) -> dict[str, Any]:
    """#3866 (recette R26) — l'axe « accessibilité » lit `analysis["contacts"]`. Une analyse sans contact
    alors que l'ESPACE en connaît sur ce compte disait « aucun interlocuteur identifié » : on complète avec
    la lecture des contacts de l'espace (même pont que l'onglet Contacts). Les contacts de l'analyse
    gagnent s'ils existent ; entrée jamais modifiée ; pont muet = analyse inchangée."""
    merged = dict(analysis)
    if merged.get("contacts"):
        return merged
    rows = [c for c in ((reading or {}).get("contacts") or []) if isinstance(c, Mapping)]
    if rows:
        merged["contacts"] = [{**c, "linkedin_url": c.get("linkedin_url") or c.get("linkedin")} for c in rows]
    return merged


def compute_account_suitability(
    analysis: Mapping[str, Any] | None,
    profile: Mapping[str, Any] | None = None,
    *,
    company: str | None = None,
    partners: Sequence[Mapping[str, Any]] | None = None,
    # #3223 (lot R17) — l'effectif déclaré du compte (`accounts.employees`,
    # texte libre type « 5 000 à 9 999 salariés »), lu par l'appelant comme
    # `company`/`partners` : jamais une seconde lecture ici.
    employees: str | None = None,
    # #3476 (#3242 / #185.2) — le secteur DÉCLARÉ du compte (`accounts.sector`),
    # lu par l'appelant : l'axe « références » le rapproche de `referenceSectors`.
    sector: str | None = None,
) -> dict[str, Any]:
    """Le verdict d'aptitude commerciale d'UN compte, pour CE profil, à CE
    moment (`analysis`/`profile` déjà lus par l'appelant — pure, aucune I/O).

    Sortie : `verdict`, `dominant_reasons`, `blocking_factors`, `unknowns`,
    et selon le verdict `proof_needed` / `best_route` / `opportunity_cost` /
    `recheck_condition` — chaque champ absent plutôt que vide ou inventé
    (doctrine « on n'affiche pas ce qu'on n'a pas »).

    #3223 (lot R17, épopée #3223) — `large_account_without_access: True`
    quand le verdict est `GO_AFTER_PROOF` (accessibilité mesurée insuffisante,
    `access <= 1` ci-dessous) ET que `employees` atteint le seuil grand
    compte : jamais un second calcul de l'accessibilité, jamais deviné sans
    `GO_AFTER_PROOF`. Absent sinon (pas `False`).
    """
    axes_result = compute_axes(analysis, profile)
    axes = {str(a["axis"]): a for a in axes_result["axes"]}
    limited: set[str] = set(axes_result["limitedByData"])

    unknowns: list[dict[str, str]] = [
        {"axis": _MEASURED_AXIS_LABELS[axis_key], "reason": "plafonné par ce qu'on ne sait pas encore, pas par le compte."}
        for axis_key in axes
        if axis_key in limited
    ]
    # #185.2 — l'axe « partenaires » se MESURE quand l'appelant a lu `account_partners`
    # ET qu'une ligne partenaire existe ; `partners=None` (pont éteint) garde la sortie
    # d'origine, `[]` nomme l'absence sans la transformer en mesure.
    declared = _declared_partners(partners)
    sector_reference, references_reason = _sector_reference(profile, sector)
    for axis_name, reason in UNEVALUATED_AXES.items():
        if axis_name == _PARTNERS_AXIS and declared:
            continue
        if axis_name == _PARTNERS_AXIS and partners is not None:
            reason = _PARTNERS_NONE_DECLARED
        if axis_name == _REFERENCES_AXIS:
            if sector_reference is not None:
                continue
            reason = references_reason or reason
        unknowns.append({"axis": axis_name, "reason": reason})

    if len(limited) >= _NOT_EVALUABLE_THRESHOLD:
        return {
            "verdict": "NOT_EVALUABLE",
            "verdict_label": VERDICT_LABELS_FR["NOT_EVALUABLE"],
            "dominant_reasons": [],
            "blocking_factors": [],
            "unknowns": unknowns,
            "proof_needed": [
                "Compléter le profil ESN et les contacts de ce compte avant de pouvoir juger son aptitude."
            ],
            **({"partners_on_account": declared} if declared else {}),
            **({"sector_reference": sector_reference} if sector_reference else {}),
        }

    fit, signal, access, capacity, dataq = (
        int(axes["fit"]["points"]),
        int(axes["signal"]["points"]),
        int(axes["accessibility"]["points"]),
        int(axes["capacity"]["points"]),
        int(axes["data_quality"]["points"]),
    )

    # Bornes réelles de `account_score_axes` (jamais 0/1 par construction) :
    # `fit` limité par un profil vide vaut exactement 2 (jamais moins) — donc
    # `fit == 1` est TOUJOURS un vrai constat (offres connues, aucune ne
    # recoupe le besoin), jamais un manque de donnée. `capacity` ne descend
    # jamais sous 2 et n'est JAMAIS plafonnée par la donnée (son docstring :
    # « jugeable même quand on ne sait rien du compte ») — un `capacity` faible
    # est donc toujours un vrai constat de taille/concurrence, jamais un
    # manque d'info, ce qui est exactement pourquoi il ne peut À LUI SEUL
    # jamais produire NO_GO_NOW (règle « pas de NO_GO sur la seule taille »).
    dominant_reasons: list[dict[str, str]] = []
    blocking_factors: list[dict[str, str]] = []
    result: dict[str, Any] = {}

    strong_fit_and_access = fit >= _MID and access >= _MID

    if strong_fit_and_access and signal >= _MID and capacity >= _MID:
        # Signal fort seul ne suffit jamais (« Market Memory seule ne crée pas
        # de timing ») : GO_NOW exige aussi fit et accessibilité solides.
        verdict = "GO_NOW"
        dominant_reasons = [_axis_reason(axes[k]) for k in ("fit", "accessibility", "signal")]
    elif strong_fit_and_access and capacity <= 2:
        # Taille/capacité faible seule (fit et accessibilité corrects) ne
        # produit JAMAIS de NO_GO — elle oriente vers un partenaire.
        verdict = "GO_VIA_PARTNER"
        dominant_reasons = [_axis_reason(axes[k]) for k in ("fit", "accessibility")]
        named = ", ".join(p["name"] for p in declared)
        who_route = f"Par {named}, déjà en place sur ce compte" if declared else "Un partenaire déjà en place sur ce type de compte"
        result["best_route"] = f"{who_route} plutôt qu'une entrée directe — {axes['capacity']['evidence']}"
    elif fit == 1 and access <= 1:
        # Ni le besoin ni l'accès : un vrai NO_GO, explicable par DEUX axes
        # réellement mesurés (jamais la taille du groupe, absente d'ici).
        verdict = "NO_GO_NOW"
        blocking_factors = [_axis_reason(axes["fit"]), _axis_reason(axes["accessibility"])]
    elif access <= 1:
        # Aucun contact connu (ou aucun joignable) : « une inconnue ne vaut
        # jamais zéro » — on cherche la preuve plutôt que de conclure NO_GO,
        # tant que le besoin (fit) reste cohérent.
        if fit >= _MID:
            verdict = "GO_AFTER_PROOF"
            dominant_reasons = [_axis_reason(axes["fit"])]
            result["proof_needed"] = ["Un interlocuteur joignable sur ce compte — aucun aujourd'hui."]
            # #3223 (lot R17) — même accessibilité mesurée (`access <= 1`) sur
            # un GRAND compte : la raison nommée pour la dashboard/alerte de
            # raisonnement, jamais un second calcul de l'accessibilité.
            if _is_large_account(employees):
                result["large_account_without_access"] = True
        else:
            verdict = "WATCH"
            dominant_reasons = [_axis_reason(axes["accessibility"])]
    elif signal == 0 and "signal" not in limited:
        verdict = "WATCH"
        dominant_reasons = [_axis_reason(axes["signal"])]
    else:
        verdict = "WATCH"
        dominant_reasons = [_axis_reason(axes[k]) for k in ("fit", "accessibility") if axes[k]["points"] >= _MID]

    who = f" pour {company}" if company else ""
    result.update(
        {
            "verdict": verdict,
            "verdict_label": VERDICT_LABELS_FR[verdict],
            "dominant_reasons": dominant_reasons,
            "blocking_factors": blocking_factors,
            "unknowns": unknowns,
        }
    )
    if declared:
        result["partners_on_account"] = declared
    if sector_reference:
        result["sector_reference"] = sector_reference
    if verdict not in ("GO_NOW",):
        result["recheck_condition"] = (
            f"À revérifier{who} si un signal daté de moins de 12 mois apparaît, si un interlocuteur "
            "devient joignable, ou si le profil ESN se complète — jamais sur le seul écoulement du temps."
        )
    if "opportunity_cost" not in result and verdict in ("WATCH", "NO_GO_NOW", "GO_AFTER_PROOF"):
        result["opportunity_cost"] = (
            "Le temps investi ici n'ira pas ailleurs dans ton portefeuille — demande "
            "`get_accounts_to_act` pour comparer ce compte aux autres avant de trancher."
        )
    return result
