"""Barème de ``bellum_contacts_batch_*`` — rôle, priorité, résumé par contact.

Ce barème ne juge pas la prose : il vérifie que la sortie est **exploitable par
le produit tel qu'il est écrit**. Chaque axe rejoue une décision que le pipeline
prend déjà sur cette même sortie, un cran plus loin.

⚠️ La sortie enregistrée est celle du modèle **AVANT** l'écrasement déterministe
de ``classification.py:169-172`` (l'enregistreur enveloppe la passerelle, donc il
voit la réponse brute). C'est ce qui rend l'axe ``role_lisible`` mesurable : on
voit ce que le modèle a réellement classé, pas ce que la règle a corrigé pour lui.

===========================  =====================================================
Axe                          Primitive d'origine
===========================  =====================================================
``decideurs_identifies``     ``metrics.contacts_quality`` (``app/eval/metrics.py:319``)
                             → ``decision_role.classify_decision_role`` / ``is_it_decider``
``comite_couvert``           ``metrics.buying_committee`` (``app/eval/metrics.py:394``)
                             → ``knowledge.buying_committee.assemble_buying_committee``
``noms_conserves``           ``judge._check_coherence`` (``app/graph/judge.py:178``)
                             + règle 1/1bis du prompt
``contacts_tous_traites``    ``app/prompts/bellum_contacts.py:102``
``role_lisible``             ``compute_contact_bucket`` (``app/models/outputs/contacts.py:25``)
``priorite_posee``           sentinelle ``priority=0`` (``app/models/outputs/contacts.py:76``)
``tetes_conservees``         ``contact_themes.is_target_head`` (#4923.14) — une tête de
                             famille fournie en entrée ne doit pas disparaître
``sans_donnee_inventee``     ``metrics.fabrication_violations`` + e-mails RFC-2606
===========================  =====================================================
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.eval.metrics import buying_committee, contacts_quality, fabrication_violations
from app.models.outputs.contacts import compute_contact_bucket
from app.services.contact_themes import THEME_PRESETS, is_target_head
from app.services.decision_role import is_out_of_scope

from .axes import Axis, RubricResult, axis_value, eliminatory, measured, unmeasurable
from .reading import contact_names, get, mappings, norm_name, present
from .reading import input_contacts as read_input_contacts

PROMPT = "bellum_contacts"

#: Les deux seaux de ``CONTACT_BUCKETS`` qui signent une classification que le
#: produit ne sait PAS exploiter. ``bruit`` n'en fait pas partie : il est décidé
#: par le TITRE fourni en entrée (stagiaire, titre vide), pas par le modèle —
#: l'en accuser ferait noter la collecte au lieu du modèle.
_UNUSABLE_BUCKETS = ("a_verifier",)


def _emails(contacts: list[dict[str, Any]]) -> list[str]:
    return [str(get(c, "email") or "") for c in contacts if present(get(c, "email"))]


def score(output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult:
    axes: list[Axis] = []
    contacts = mappings(get(output, "contacts"))

    # ── 1. au moins un vrai décideur, avec le classifieur expédié ─────────────
    if contacts:
        verdict = contacts_quality({"contacts": contacts})
        axes.append(axis_value(
            "decideurs_identifies", 3.0, ratio=verdict.score,
            origin="app/eval/metrics.py:319 (contacts_quality) → "
                   "app/services/decision_role.py:283 (classify_decision_role) / :57 (is_it_decider)",
            blind_to="qu'un décideur identifié soit ACCESSIBLE, ou encore en poste. Le classifieur "
                     "lit un titre, il ne lit pas un annuaire.",
            detail=verdict.detail, data=dict(verdict.data),
        ))
        committee = buying_committee({"contacts": contacts})
        axes.append(axis_value(
            "comite_couvert", 2.0, ratio=committee.score,
            origin="app/eval/metrics.py:394 (buying_committee) → "
                   "app/knowledge/buying_committee.py:397 (assemble_buying_committee)",
            blind_to="qu'un LOT ne soit qu'un lot : bellum_contacts tourne par paquets de 50, et un "
                     "paquet peut légitimement ne porter aucun acheteur. L'axe se lit d'un bras à "
                     "l'autre sur les MÊMES lots, jamais dans l'absolu.",
            detail=committee.detail, data=dict(committee.data),
        ))
        # ── 5. le rôle rendu est-il lisible par le produit ? ──────────────────
        classifiable = [c for c in contacts if present(get(c, "title")) and not is_out_of_scope(str(get(c, "title")))]
        if classifiable:
            usable = sum(
                1 for c in classifiable
                if compute_contact_bucket(
                    title=str(get(c, "title") or ""),
                    role=str(get(c, "role") or ""),
                    influence_level=str(get(c, "influenceLevel", "influence_level") or ""),
                ) not in _UNUSABLE_BUCKETS
            )
            axes.append(measured(
                "role_lisible", 2.0, ok=usable, total=len(classifiable),
                origin="app/models/outputs/contacts.py:25-54 (compute_contact_bucket) — le seau que "
                       "le front lit ; « a_verifier » = aucune classification exploitable",
                blind_to="qu'un rôle lisible soit JUSTE. Un DSI classé « economic » est lisible et faux.",
                detail=f"{usable}/{len(classifiable)} contact(s) au titre exploitable rangés hors "
                       "« à vérifier »",
            ))
        else:
            axes.append(unmeasurable(
                "role_lisible", 2.0,
                reason="aucun contact ne porte un titre exploitable (titres vides ou hors périmètre) — "
                       "le seau vient alors du TITRE fourni, pas du modèle",
                origin="app/models/outputs/contacts.py:25-54",
            ))
        # ── 6. la priorité est-elle posée ? ───────────────────────────────────
        prioritised = sum(1 for c in contacts if isinstance(get(c, "priority"), int) and get(c, "priority") >= 1)
        axes.append(measured(
            "priorite_posee", 1.0, ok=prioritised, total=len(contacts),
            origin="app/models/outputs/contacts.py:76 (priority=0 = sentinelle « non classé », NULL en base)",
            blind_to="l'ORDRE : on compte les priorités posées, on ne juge pas laquelle est la bonne.",
            detail=f"{prioritised}/{len(contacts)} contact(s) avec une priorité 1-5",
        ))
    else:
        for name, weight, origin in (
            ("decideurs_identifies", 3.0, "app/eval/metrics.py:319"),
            ("comite_couvert", 2.0, "app/eval/metrics.py:394"),
            ("role_lisible", 2.0, "app/models/outputs/contacts.py:25-54"),
            ("priorite_posee", 1.0, "app/models/outputs/contacts.py:76"),
        ):
            axes.append(unmeasurable(
                name, weight,
                reason="la sortie ne contient aucun contact — c'est l'axe contacts_tous_traites, "
                       "qui connaît l'ENTRÉE, qui sait dire si c'est une faute",
                origin=origin,
            ))

    # ── 3 & 4. les noms : aucun inventé, aucun perdu ──────────────────────────
    given = read_input_contacts(user_prompt)
    if given is None:
        for name, weight in (("noms_conserves", 3.0), ("contacts_tous_traites", 2.0)):
            axes.append(unmeasurable(
                name, weight,
                reason="la liste de contacts FOURNIE est illisible dans le prompt d'entrée — sans "
                       "elle, « inventé » et « fourni » ne se distinguent pas",
                origin="app/graph/judge.py:178-202 (_check_coherence) + app/prompts/bellum_contacts.py:34",
            ))
    else:
        given_names = contact_names(given)
        out_names = [norm_name(get(c, "fullName", "full_name")) for c in contacts]
        out_named = [n for n in out_names if n]
        if out_named and given_names:
            kept = sum(1 for n in out_named if n in given_names)
            invented = sorted({n for n in out_named if n not in given_names})
            # ÉLIMINATOIRE : « JAMAIS inventer un nom » (règle 1 du prompt) est une
            # porte, pas une pente. Un contact fabriqué parmi cinquante notés en
            # part coûterait 2 % — un modèle qui fabrique passerait pour bon.
            axes.append(eliminatory(
                "noms_conserves", 3.0, violations=invented,
                origin="app/graph/judge.py:195-202 (_check_coherence : « le plan cible un contact "
                       "absent de la liste enrichie » = CRITICAL, donc binaire) + "
                       "app/prompts/bellum_contacts.py:34-35 (« JAMAIS inventer un nom »)",
                blind_to="une faute d'orthographe VOLONTAIRE du modèle sur un nom fourni : la "
                         "comparaison retire les accents et la casse, donc « Sebastien » passe pour "
                         "« Sébastien » — alors que le prompt exige le caractère pour caractère.",
                detail=(f"{kept}/{len(out_named)} nom(s) rendu(s) présent(s) dans la liste fournie"
                        + (f" — INVENTÉ(S) : {', '.join(invented[:3])}" if invented else "")),
                data={"invented": invented[:5], "returned": len(out_named)},
            ))
        else:
            axes.append(unmeasurable(
                "noms_conserves", 3.0,
                reason="aucun nom exploitable des deux côtés — rien à rapprocher",
                origin="app/graph/judge.py:178-202",
            ))
        if given_names:
            treated = sum(1 for n in given_names if n in set(out_named))
            axes.append(measured(
                "contacts_tous_traites", 2.0, ok=treated, total=len(given_names),
                origin="app/prompts/bellum_contacts.py:102 (« Enrichir CHAQUE contact fourni »)",
                blind_to="la PROFONDEUR du traitement : un contact rendu avec un summary vide compte "
                         "comme traité.",
                detail=f"{treated}/{len(given_names)} contact(s) fourni(s) rendu(s)",
            ))
        else:
            axes.append(unmeasurable(
                "contacts_tous_traites", 2.0,
                reason="la liste fournie ne porte aucun nom exploitable",
                origin="app/prompts/bellum_contacts.py:102",
            ))

    # ── 6 bis. les TÊTES fournies ne se perdent pas (#4923.14) ────────────────
    # Un Head of Data / Directeur Achats / DSI présent dans l'entrée est ce que le
    # commercial attend : le modèle qui l'écarte ou le rend sans le nommer fait
    # perdre exactement le rôle du retour Julien Laszlo (30/10/2026).
    if given is not None:
        all_families = list(THEME_PRESETS)
        head_names = {
            norm_name(get(c, "fullName", "full_name", "name"))
            for c in given
            if isinstance(c, Mapping) and is_target_head(str(get(c, "title") or ""), all_families)
        } - {""}
        out_set = {n for n in (norm_name(get(c, "fullName", "full_name")) for c in contacts) if n}
        if head_names:
            kept_heads = len(head_names & out_set)
            axes.append(measured(
                "tetes_conservees", 2.0, ok=kept_heads, total=len(head_names),
                origin="app/services/contact_themes.py (is_target_head) — #4923.14",
                blind_to="qu'une tête rendue soit bien classée (rôle, priorité) : on compte sa présence.",
                detail=f"{kept_heads}/{len(head_names)} tête(s) de famille fournie(s) rendue(s)",
            ))
        else:
            axes.append(unmeasurable(
                "tetes_conservees", 2.0,
                reason="aucune tête de famille dans la liste fournie — rien à conserver",
                origin="app/services/contact_themes.py (is_target_head)",
            ))

    # ── 7. aucune donnée fabriquée ────────────────────────────────────────────
    violations = fabrication_violations([contacts], _emails(contacts))
    # ÉLIMINATOIRE — un e-mail RFC-2606 ne peut appartenir à personne de réel.
    axes.append(eliminatory(
        "sans_donnee_inventee", 3.0, violations=violations,
        origin="app/eval/metrics.py:_FABRICATED_MARKERS / _RESERVED_EMAIL_DOMAINS + "
               "fabrication_violations (porte `passed = not violations`)",
        blind_to="un nom inventé mais crédible — c'est noms_conserves qui l'attrape, et seulement "
                 "quand l'entrée est lisible.",
    ))

    return RubricResult(
        prompt=PROMPT, axes=axes,
        caveat="Rien ici ne note le summary ni le whyContact, que le prompt veut « SPECIFIQUES » : "
               "aucune primitive du dépôt ne sait mesurer la spécificité d'un paragraphe. C'est "
               "exactement le trou que la colonne CONSULTATIVE du juge occupe — sans jamais entrer "
               "dans ce total.",
    )
