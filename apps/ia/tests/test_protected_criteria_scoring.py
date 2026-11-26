"""Conformité — un critère protégé n'entre dans aucun classement de PERSONNES.

LA SOURCE, citée
----------------
PDF 9 §6.2, « Epic Conformité — la garde avant le moteur », verbatim :

    « CONTEXTE : le tri, le classement et l'évaluation de candidats relèvent de
      l'Annexe III de l'EU AI Act. […]
      PR1 · Test statique qui parcourt les sources […] et ÉCHOUE si l'une lit un
      champ parmi : birth_date, gender, photo_url, nationality, full_name,
      marital_status, address (au-delà du code postal). »

CE QUE CETTE GARDE AJOUTE À CELLE QUI EXISTAIT DÉJÀ
---------------------------------------------------
`apps/api/src/architecture/protected-criteria.spec.ts` (GA-06) tient le côté
TypeScript : elle lit les sources des moteurs de sélection de l'API. Elle ne
pouvait pas voir deux choses, et ce sont précisément celles-ci :

1. **Le service IA**, écrit en Python, qui calcule lui aussi des rangs de
   personnes (pré-tri d'enrichissement, score de contact /100).
2. **Le texte réellement envoyé au modèle.** Un champ n'a pas besoin d'être
   multiplié par un poids pour peser dans un classement : il suffit qu'il soit
   dans le prompt qui note. Aucune ligne de code ne « lit » alors le champ — et
   une garde qui ne relit que du code passe au vert.

CE QU'ELLE A TROUVÉ EN NAISSANT (défaut réel, corrigé dans le même lot)
----------------------------------------------------------------------
La graine de la phase 2 porte `photoUrl` (`phase2_contacts.py`,
`_apollo_hit_to_seed`) et cette graine partait TELLE QUELLE, sérialisée en JSON,
dans `bellum_contacts` — le prompt qui attribue à chaque personne une `priority`
de 1 à 5, un `role` et un `influenceLevel` — puis dans `bellum_organigramme`,
qui reconstruit la chaîne de décision. Le modèle recevait la photo de la
personne qu'on lui demandait de classer.

PÉRIMÈTRE — étroit à dessein, et NOMMÉ
--------------------------------------
Deux corpus, deux questions différentes :

* `_RANKING_SOURCES` — les fichiers Python qui CALCULENT un rang de personne.
  Ils sont tenus au plus strict : `full_name` et `address` s'ajoutent aux
  critères protégés, parce qu'un barème n'a pas besoin de savoir QUI il note.
* `_SCORING_PROMPTS` — les prompts qui attribuent un rang, une priorité ou un
  rôle à une PERSONNE, et la charge utile qui leur est remise.

Ce qui n'est PAS dans le périmètre, et pourquoi — une garde qui interdit trop
est désarmée en une semaine, donc les exclusions sont écrites, pas devinées :

* Afficher une photo sur une fiche de contact reste légitime : `phase2_contacts`
  continue de la collecter et de la faire persister. C'est l'usage CLASSANT qui
  est interdit, pas l'existence du champ.
* `fullName` reste dans la charge utile des prompts : le livrable NOMME la
  personne et la réponse du modèle se recolle à sa graine par le nom. Voir
  `app/services/protected_criteria.py`, qui porte la raison au long.
* `city` / `country` restent : la source interdit l'adresse « au-delà du code
  postal », et un site de travail est plus grossier qu'un code postal.
* Le parsing de CV a déjà SA garde — `test_cv_parse.py`
  (`test_the_prompt_forbids_protected_criteria_and_invented_levels`) —, on ne la
  recopie pas ici.
* `bellum_scorer` note une ENTREPRISE, pas une personne : hors sujet.
* `bellum_plan` CONSOMME la priorité, il ne l'attribue pas — et sa charge utile
  est une projection explicite (`fullName` / `title` / `entity` / `role` /
  `priority`, `analysis-ondemand.service.ts`) ou la sortie typée `EnrichedContact`
  du chemin pipeline, qui ne porte aucun critère protégé. Vérifié, pas supposé :
  c'est pourquoi il n'est pas dans `_SCORING_PROMPTS`. Le jour où sa charge
  redeviendrait la graine brute, il faudra l'y ajouter.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest

from app.models.classify import ClassifyRequest
from app.models.contacts import ApolloSearchHit
from app.models.outputs.contacts import (
    ContactsOutput,
    DecisionChain,
    EnrichedContact,
    OrganigrammeOutput,
)
from app.routers.phase2_contacts import _apollo_hit_to_seed
from app.services.classification import classify_contacts_and_organigramme
from app.services.protected_criteria import (
    PROTECTED_CRITERIA,
    strip_protected_criteria,
)

_APP = Path(__file__).resolve().parents[1] / "app"

# Les fichiers qui CALCULENT un rang de personne, par opposition à ceux qui
# l'affichent ou qui traduisent une portée de recherche.
#
# `contact_segments.py` est volontairement absent : il traduit un couple
# (famille, niveau) en filtres Apollo pour rejouer une recherche, il ne note
# personne. `access_scoring.py` aussi : sa barrière d'achat porte sur une
# ENTREPRISE.
_RANKING_SOURCES: tuple[str, ...] = (
    "services/contact_ranking.py",
    "services/contact_priority_score.py",
    "services/decision_role.py",
    "services/hierarchy_level.py",
)

# Le noyau de classement est tenu plus strictement que la charge utile d'un
# prompt : un barème déterministe n'a besoin ni de l'identité ni de l'adresse.
_RANKING_SOURCE_CRITERIA: frozenset[str] = PROTECTED_CRITERIA | {"full_name", "fullName"}

# Les prompts qui attribuent un rang / une priorité / un rôle à une PERSONNE.
# La clé est le ``prompt_name`` que `classification.py` passe à `call_claude`,
# c'est-à-dire ce que la production envoie réellement.
_SCORING_PROMPTS: tuple[str, ...] = (
    "bellum_contacts_batch_1_of_1",
    "bellum_organigramme",
)


def _found_in(text: str, criteria: frozenset[str]) -> list[str]:
    """Les critères présents dans ``text``, triés — le message d'échec les NOMME."""
    return sorted(criterion for criterion in criteria if criterion in text)


# ── Corpus 1 : le code qui calcule un rang ──────────────────────────────────


@pytest.mark.parametrize("relative", _RANKING_SOURCES)
def test_le_noyau_de_classement_ne_lit_aucun_critere_protege(relative: str) -> None:
    """Si ce test tombe : ce champ ne doit pas peser dans un classement de
    personnes. Le retirer du calcul — ou, si l'usage est purement d'affichage,
    sortir le fichier de `_RANKING_SOURCES` en DISANT pourquoi."""
    source = (_APP / relative).read_text(encoding="utf8")
    assert _found_in(source, _RANKING_SOURCE_CRITERIA) == []


def test_les_sources_surveillees_existent_et_ne_sont_pas_vides() -> None:
    """Une garde qui ne lit rien passe au vert pour toujours.

    On vérifie que le corpus EXISTE (une entrée périmée ne garde plus rien) et
    qu'il porte bien du calcul — pas un fichier vidé de sa substance.
    """
    assert _RANKING_SOURCES, "le corpus surveillé est vide"
    for relative in _RANKING_SOURCES:
        path = _APP / relative
        assert path.is_file(), f"{relative} n'existe plus : mettre la liste à jour"
        source = path.read_text(encoding="utf8")
        assert "def " in source, f"{relative} ne porte plus aucune fonction"
        assert len(source) > 500, f"{relative} est trop court pour calculer un rang"


def test_le_detecteur_sait_dire_non() -> None:
    """La garde doit prouver qu'elle refuse — sinon elle ne garde rien.

    On lui soumet un extrait volontairement fautif : un barème qui pondérerait
    l'âge. Elle doit le NOMMER.
    """
    fautif = "score += 3 if contact['birth_date'] < 1980 else 0"
    assert _found_in(fautif, _RANKING_SOURCE_CRITERIA) == ["birth_date"]
    # Et elle ne doit pas crier sur du code sain.
    assert _found_in("score += _ROLE_WEIGHT.get(role, 0)", _RANKING_SOURCE_CRITERIA) == []


# ── Corpus 2 : ce que le modèle reçoit réellement ───────────────────────────


def _poisoned_seed() -> dict[str, Any]:
    """Une graine de phase 2 construite par le VRAI chemin de production, à
    laquelle on ajoute tous les critères protégés qu'un fournisseur pourrait un
    jour renvoyer. Bâtir la graine à la main testerait le test, pas le code."""
    seed = _apollo_hit_to_seed(
        ApolloSearchHit(
            id="apollo-1",
            first_name="Claire",
            last_name="Perrin",
            title="Directrice des Systèmes d'Information",
            organization_name="ACME",
            linkedin_url="https://www.linkedin.com/in/claire-perrin",
            photo_url="https://cdn.apollo.io/photos/claire.jpg",
            city="Paris",
            country="France",
            has_email=True,
        )
    )
    seed["birthDate"] = "1979-04-02"
    seed["gender"] = "female"
    seed["nationality"] = "française"
    seed["maritalStatus"] = "mariée"
    seed["address"] = "12 rue des Lilas, 75011 Paris"
    seed["apolloDetails"]["photoUrl"] = "https://cdn.apollo.io/photos/claire.jpg"
    return seed


def _classified() -> EnrichedContact:
    return EnrichedContact(
        full_name="Claire Perrin",
        title="Directrice des Systèmes d'Information",
        entity="ACME",
        role="technical",
        priority=5,
        summary="Porte le SI",
        why_contact="Décide sur l'infrastructure",
    )


def _fake_claude(captured: dict[str, str]):
    """Capture le prompt UTILISATEUR de chaque appel, et répond le minimum valide."""

    async def side_effect(system: str, user: str, **kwargs: Any):
        name = str(kwargs.get("prompt_name") or "")
        captured[name] = user
        usage = {"input_tokens": 1, "output_tokens": 1}
        if name.startswith("bellum_contacts"):
            return ContactsOutput(contacts=[_classified()]), usage
        return (
            OrganigrammeOutput(
                organigramme=[],
                decision_chain=DecisionChain(),
                uncovered_zones=[],
                approach_order=[],
            ),
            usage,
        )

    return side_effect


#: Une correction humaine EMPOISONNEE - telle qu un jour quelqu un pourrait la
#: joindre au bloc `WORKSPACE_CORRECTIONS` du prompt d organigramme. Elle voyage
#: par le VRAI chemin (`ClassifyRequest.workspace_corrections`), pas par une
#: chaine ecrite a la main : batir le bloc soi-meme testerait le test.
_POISONED_CORRECTION: dict[str, Any] = {
    "personName": "Claire Perrin",
    "field": "title",
    "previousValue": "DSI",
    "correctedValue": "Directrice des Systemes d Information",
    "evidenceKind": "official_site",
    "correctedAt": "2026-08-20T10:00:00.000Z",
    "reason": "rencontree en clientele, elle habite 12 rue des Lilas",
    "photoUrl": "https://cdn.apollo.io/photos/claire.jpg",
    "birthDate": "1979-04-02",
    "gender": "female",
    "nationality": "francaise",
    "maritalStatus": "mariee",
    "address": "12 rue des Lilas, 75011 Paris",
}


async def _capture_scoring_prompts(seed: dict[str, Any]) -> dict[str, str]:
    req = ClassifyRequest(
        account_id="a1",
        contacts=[seed],
        profile_data={"companyName": "ACME", "entities": [], "angles": [], "pains": []},
        # Les sept blocs de contexte de l organigramme (31/08/2026). Le plus
        # sensible est celui-ci : il fait entrer des donnees de PERSONNES dans un
        # prompt qui classe des gens. On le remplit d une correction empoisonnee
        # pour que l assertion ci-dessous porte sur le texte REELLEMENT envoye.
        workspace_corrections=[_POISONED_CORRECTION],
    )
    captured: dict[str, str] = {}
    with patch("app.services.classification.call_claude", side_effect=_fake_claude(captured)):
        await classify_contacts_and_organigramme(req)
    return captured


@pytest.mark.asyncio
async def test_aucun_prompt_de_notation_ne_recoit_un_critere_protege() -> None:
    """Le corps du test : ce que la PRODUCTION envoie au modèle.

    Si ce test tombe : un critère protégé vient d'entrer dans le prompt qui
    classe des personnes. Le retirer de la charge utile — jamais retirer le
    prompt de la liste.
    """
    captured = await _capture_scoring_prompts(_poisoned_seed())

    # Anti-vacuité : la garde doit avoir VU les deux prompts. Sans cela, un
    # renommage de `prompt_name` la rendrait verte en ne lisant plus rien.
    assert set(_SCORING_PROMPTS) <= set(captured), (
        f"prompts non capturés : {sorted(set(_SCORING_PROMPTS) - set(captured))}"
    )

    for name in _SCORING_PROMPTS:
        prompt = captured[name]
        assert prompt.strip(), f"{name} : prompt vide, la garde ne lirait rien"
        assert _found_in(prompt, PROTECTED_CRITERIA) == [], (
            f"{name} reçoit un critère protégé : "
            f"{_found_in(prompt, PROTECTED_CRITERIA)}"
        )
        # Le contact doit tout de même être là — un prompt vidé de sa substance
        # passerait le test ci-dessus sans rien prouver.
        assert "Claire Perrin" in prompt
        assert "Directrice des Systèmes d'Information" in prompt

    # Le bloc de corrections a bien VOYAGE jusqu au prompt d organigramme -
    # sans quoi les assertions ci-dessus passeraient au vert sur un bloc absent.
    organigramme = captured["bellum_organigramme"]
    assert "WORKSPACE_CORRECTIONS:" in organigramme
    assert "Directrice des Systemes d Information" in organigramme
    # Et la raison ecrite par l humain, texte LIBRE donc non bornable, est
    # restee au ledger.
    assert "rue des Lilas" not in organigramme
    assert "rencontree en clientele" not in organigramme


@pytest.mark.asyncio
async def test_la_graine_garde_sa_photo_pour_la_fiche() -> None:
    """L'interdit porte sur le CLASSEMENT, pas sur l'existence du champ.

    La graine de la phase 2 est persistée pour la fiche du contact : la
    nettoyer en amont ferait disparaître l'avatar de l'écran. Le nettoyage doit
    donc rendre des COPIES et ne jamais muter l'entrée.
    """
    seed = _poisoned_seed()
    await _capture_scoring_prompts(seed)
    assert seed["photoUrl"] == "https://cdn.apollo.io/photos/claire.jpg"
    assert seed["apolloDetails"]["photoUrl"] == "https://cdn.apollo.io/photos/claire.jpg"


def test_le_nettoyage_est_pur_et_recursif() -> None:
    """Le contrat du nettoyeur, pris isolément."""
    payload = {
        "fullName": "Claire Perrin",
        "photoUrl": "https://exemple/photo.jpg",
        "city": "Paris",
        "country": "France",
        "apolloDetails": {"seniority": "director", "photoUrl": "https://exemple/p.jpg"},
        "history": [{"title": "DSI", "birthDate": "1979-04-02"}],
    }
    cleaned = strip_protected_criteria(payload)

    # Ce qui reste : l'identité, le poste, la zone de travail.
    assert cleaned == {
        "fullName": "Claire Perrin",
        "city": "Paris",
        "country": "France",
        "apolloDetails": {"seniority": "director"},
        "history": [{"title": "DSI"}],
    }
    # L'entrée n'a pas bougé.
    assert payload["photoUrl"] == "https://exemple/photo.jpg"
    assert payload["apolloDetails"]["photoUrl"] == "https://exemple/p.jpg"
    # Et la sérialisation qui part au modèle est propre.
    assert _found_in(json.dumps(cleaned, ensure_ascii=False), PROTECTED_CRITERIA) == []


def test_la_liste_des_criteres_couvre_la_source() -> None:
    """Les sept champs NOMMÉS par le PDF 9 §6.2 sont tous tenus.

    `full_name` et `address` ne sont pas au même endroit que les autres : voir
    le périmètre en tête de fichier. Le test les cherche là où ils sont tenus.
    """
    for champ in ("birth_date", "gender", "photo_url", "nationality", "marital_status", "address"):
        assert champ in PROTECTED_CRITERIA, f"{champ} (PDF 9 §6.2) n'est plus tenu"
    assert "full_name" in _RANKING_SOURCE_CRITERIA
