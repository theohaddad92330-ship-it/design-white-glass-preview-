"""Self-consistency (chantier A1) — prompts de RE-DÉRIVATION des jugements clés.

Deux prompts indépendants qui re-dérivent, depuis le MÊME dossier, deux des
jugements que le pipeline a déjà posés (passe 1) : le top-3 des plays /
périmètres prioritaires et la qualification des 5 contacts prioritaires. La
passe 2 ne voit JAMAIS les valeurs de la passe 1 : les listes candidates sont
ré-ordonnées ALPHABÉTIQUEMENT (ordre neutre — pas le tri P1/P2 ni la priority
de la passe 1) et les champs de jugement (priority, role, summary, tier…) sont
retirés. C'est une seconde dérivation indépendante, pas une relecture.

La re-dérivation du score /25 n'a pas de prompt dédié : elle ré-échantillonne
telle quelle la section ``evaluation`` de BELLUM-PLAN (même system prompt caché
+ même user prompt = un vrai second échantillon du même jugement).

La comparaison structurelle (accord → confiance haute ; divergence → flag) vit
dans ``app/services/self_consistency.py`` — la passe 2 mesure, elle n'écrase
jamais la valeur retenue (= passe 1).
"""

from __future__ import annotations

import json
from collections.abc import Sequence

# Bornes anti-gonflement : les listes candidates injectées dans les prompts de
# re-dérivation restent courtes (le jugement porte sur le top du dossier, pas
# sur la longue traîne).
_MAX_PERIMETERS = 12
_MAX_ANGLES = 6
_MAX_SIGNALS = 6
_MAX_PAINS = 6
_MAX_CONTACTS = 30
_TEXT_CAP = 300


def _clean_sorted(items: Sequence[object], cap: int) -> list[str]:
    """Non-empty unique strings, ALPHA-sorted (ordre neutre — l'indépendance de
    la passe 2 exige de ne pas transmettre le tri/le rang de la passe 1)."""
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        text = str(item or "").strip()[:_TEXT_CAP]
        if text and text.lower() not in seen:
            seen.add(text.lower())
            out.append(text)
    return sorted(out, key=str.lower)[:cap]


def build_plays_system_prompt(profile_data: dict | None = None) -> str:
    p = profile_data or {}
    esn = str(p.get("companyName") or p.get("esn_name") or "une ESN").strip() or "une ESN"
    return (
        "Tu es BELLUM, stratège commercial pour ESN. On te donne les éléments FACTUELS "
        f"d'un dossier de compte analysé pour {esn} : périmètres/entités candidats, angles "
        "d'attaque, signaux récents et douleurs détectées.\n\n"
        "Ta mission : choisir les 3 plays PRIORITAIRES — pour chacun, le périmètre à attaquer "
        "et l'angle à utiliser. Choisis UNIQUEMENT parmi les périmètres et angles fournis "
        "(recopie leurs libellés à l'identique, n'invente rien). Juge sur la force des signaux, "
        "le fit avec le profil ESN et l'accessibilité — pas sur l'ordre de présentation des listes."
    )


def build_plays_user_prompt(
    *,
    company_name: str,
    perimeters: Sequence[object],
    angles: Sequence[object],
    signals: Sequence[object] = (),
    pains: Sequence[object] = (),
) -> str:
    payload = {
        "perimetresCandidats": _clean_sorted(perimeters, _MAX_PERIMETERS),
        "anglesCandidats": _clean_sorted(angles, _MAX_ANGLES),
        "signauxRecents": _clean_sorted(signals, _MAX_SIGNALS),
        "douleurs": _clean_sorted(pains, _MAX_PAINS),
    }
    return (
        f"Compte cible : {company_name}\n\n"
        f"ÉLÉMENTS DU DOSSIER (listes en ordre alphabétique, sans priorisation) :\n"
        f"{json.dumps(payload, ensure_ascii=False)}\n\n"
        "Choisis les 3 plays prioritaires (moins si moins de 3 périmètres candidats).\n"
        "Réponds UNIQUEMENT en JSON valide, exactement ce schéma (aucun champ additionnel) :\n"
        '{"plays":[{"perimeter":"libellé EXACT d\'un périmètre candidat","angle":"libellé EXACT d\'un angle candidat"}]}'
    )


def build_contacts_system_prompt(profile_data: dict | None = None) -> str:
    p = profile_data or {}
    esn = str(p.get("companyName") or p.get("esn_name") or "une ESN").strip() or "une ESN"
    return (
        "Tu es BELLUM, stratège commercial pour ESN. On te donne la liste des contacts "
        f"identifiés sur un compte cible pour {esn} (nom, poste, entité — SANS priorisation), "
        "plus les angles d'attaque et douleurs du dossier.\n\n"
        "Ta mission : nommer les 5 contacts à contacter EN PRIORITÉ pour ouvrir ce compte, "
        "avec leur rôle décisionnel probable. Choisis UNIQUEMENT parmi les contacts fournis "
        "(recopie leurs noms à l'identique, n'invente personne). Juge sur le pouvoir de décision, "
        "le fit avec les angles et l'accessibilité — pas sur l'ordre de la liste."
    )


def build_contacts_user_prompt(
    *,
    company_name: str,
    contacts: Sequence[dict],
    angles: Sequence[object] = (),
    pains: Sequence[object] = (),
) -> str:
    # Contacts NETTOYÉS : identité factuelle seulement (nom / poste / entité).
    # Les champs de jugement de la passe 1 (priority, role, summary, whyContact…)
    # sont retirés pour que la passe 2 re-dérive au lieu de relire. Tri alpha.
    scrubbed: list[dict[str, str]] = []
    seen: set[str] = set()
    for c in contacts:
        if not isinstance(c, dict):
            continue
        name = str(c.get("fullName") or c.get("full_name") or "").strip()[:_TEXT_CAP]
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        scrubbed.append(
            {
                "name": name,
                "title": str(c.get("title") or c.get("role") or "").strip()[:_TEXT_CAP],
                "entity": str(c.get("entity") or "").strip()[:_TEXT_CAP],
            }
        )
    scrubbed = sorted(scrubbed, key=lambda c: c["name"].lower())[:_MAX_CONTACTS]
    payload = {
        "contacts": scrubbed,
        "anglesCandidats": _clean_sorted(angles, _MAX_ANGLES),
        "douleurs": _clean_sorted(pains, _MAX_PAINS),
    }
    return (
        f"Compte cible : {company_name}\n\n"
        f"CONTACTS IDENTIFIÉS (ordre alphabétique, sans priorisation) :\n"
        f"{json.dumps(payload, ensure_ascii=False)}\n\n"
        "Nomme les 5 contacts prioritaires (moins si moins de 5 contacts fournis).\n"
        "Réponds UNIQUEMENT en JSON valide, exactement ce schéma (aucun champ additionnel) :\n"
        '{"contacts":[{"name":"nom EXACT d\'un contact fourni","role":"rôle décisionnel probable"}]}'
    )
