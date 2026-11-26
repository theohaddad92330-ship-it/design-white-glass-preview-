"""Garde : **un identifiant technique interne ne s'affiche jamais à l'écran.**

## Le défaut qu'elle ferme

Vu sur une capture d'écran du copilote : « Selon la règle méthode Bellum
« contact_fit_score_100 » ». ``contact_fit_score_100`` est la clé de tableau du
registre ``app/knowledge/business_rules.py`` — elle sert à retrouver la règle
(``get_rule``), à la tracer dans l'empreinte d'un run, à la citer dans un test.
Elle n'a jamais été un NOM.

Le grep littéral ne le voyait pas : l'identifiant n'apparaît en toutes lettres
que dans deux fichiers, tous deux internes. Il fuyait par INTERPOLATION —
``app/services/method_knowledge.py`` construisait le titre du fragment citable
avec ``f"Règle métier « {rule.id} » — méthode Bellum"``. Ce titre part à DEUX
endroits que l'utilisateur lit :

1. dans le contexte injecté au modèle (le copilote recopie donc l'identifiant
   dans sa réponse) ;
2. dans le panneau « sources » du chat, via ``_method_label``
   (``app/prompts/context_transparency.py``), qui se contente de retirer le
   suffixe de provenance.

## Ce que la garde vérifie

L'INVARIANT, pas la ligne : *aucun titre du corpus citable ne porte de jeton
qui ressemble à un identifiant de code*. Elle ne connaît ni
``contact_fit_score_100`` ni le nombre de règles — elle relit le corpus réel et
le passe au détecteur. Une onzième règle ajoutée demain avec un ``label``
oublié tombe donc toute seule.

Deux preuves obligatoires, conformément à la règle du dépôt (« une garde doit
prouver qu'elle LIT et qu'elle sait dire NON ») :

* ``test_the_guard_reads_a_real_non_empty_corpus`` — le corpus n'est pas vide,
  et les quatre familles de fragments y sont ;
* ``test_the_detector_says_no`` — le détecteur est passé sur le titre fautif
  d'origine et sur des identifiants voisins, et il DOIT les refuser. Sans ce
  test, un détecteur qui ne matche jamais rien rendrait la garde verte pour
  toujours.
"""

from __future__ import annotations

import re

from app.services.method_knowledge import _corpus

# Un identifiant de code, tel qu'on en écrit dans ce dépôt : minuscules,
# chiffres, et AU MOINS un souligné qui recolle deux mots
# (``contact_fit_score_100``, ``no_go_sectors``, ``raw_analysis``).
#
# Le souligné est ce qui fait la différence : « TJM », « P1 » ou « /100 »
# s'écrivent aussi en jargon mais restent lisibles par un commercial ; un mot
# recollé par des soulignés est une clé de tableau, jamais une phrase.
_INTERNAL_ID = re.compile(r"\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b")


def internal_ids_in(text: str) -> list[str]:
    """Les jetons de `text` qui ont la forme d'un identifiant interne."""
    return _INTERNAL_ID.findall(text or "")


def test_the_guard_reads_a_real_non_empty_corpus() -> None:
    """Preuve que la garde LIT : le corpus existe, il est peuplé, et les quatre
    familles de fragments citables y sont réellement représentées."""
    titles = [str(chunk["title"]) for chunk in _corpus()]
    assert len(titles) > 20, f"corpus suspect ({len(titles)} fragments) — la garde ne lirait presque rien"
    for expected in ("Objection «", "Playbook secteur ", "Règle métier «", "Règle de méthode «"):
        assert any(title.startswith(expected) for title in titles), (
            f"aucun fragment « {expected}… » dans le corpus — la garde ne couvre plus cette famille"
        )


def test_the_detector_says_no() -> None:
    """Preuve que la garde sait dire NON : le titre EXACT qui a fui à l'écran,
    et ses voisins, doivent être refusés par le détecteur.

    Et son pendant : une vraie phrase française ne déclenche rien, sinon la
    garde crierait sur tout et finirait désactivée."""
    assert internal_ids_in("Règle métier « contact_fit_score_100 » — méthode Bellum") == ["contact_fit_score_100"]
    assert internal_ids_in("Règle métier « no_go_sectors » — méthode Bellum") == ["no_go_sectors"]
    assert internal_ids_in("Règle métier « account_verdict_quality_cap »") == ["account_verdict_quality_cap"]
    # Une formulation lisible ne matche pas — y compris avec du jargon métier
    # légitime (score sur 100, tier P1, TJM) et des mots accentués.
    assert internal_ids_in("Priorisation des contacts sur 100 points — méthode Bellum") == []
    assert internal_ids_in("Score de compte sur 25 : GO / PRUDENT / STOP, et un tier P1") == []


def test_no_citable_title_carries_an_internal_identifier() -> None:
    """L'invariant. Un titre du corpus citable est lu par un commercial (panneau
    « sources ») ET par le modèle (contexte injecté) : il porte le NOM de la
    règle, jamais sa clé de tableau."""
    offenders = {
        str(chunk["title"]): found
        for chunk in _corpus()
        if (found := internal_ids_in(str(chunk["title"])))
    }
    assert not offenders, (
        "Des titres du corpus citable portent un identifiant interne — il s'affichera "
        "dans le panneau « sources » du chat et le copilote le recopiera dans sa "
        f"réponse : {offenders}. Une règle a un NOM lisible ; son identifiant reste dedans."
    )
