"""Barème de ``bellum_linkedin_posts`` — des SUJETS, ancrés dans du réel.

Deux bornes portent tout le prompt (``app/prompts/bellum_linkedin_posts.py:3-11``)
et ce sont les deux seules choses qu'on peut mesurer sans avoir un avis :

1. **on propose des sujets, pas des posts.** Ce qui est publié sous le nom d'un
   commercial doit être écrit par lui — d'où ``opening_line`` : « une seule
   phrase d'ouverture, pour l'aider à démarrer » (``bellum_linkedin_posts.py:23``) ;
2. **chaque sujet s'appuie sur quelque chose de FOURNI**, « cité tel quel »
   (``bellum_linkedin_posts.py:24``). Le contexte autorisé n'existe qu'à un
   endroit — le prompt utilisateur — et ``reading.input_post_context`` le relit.

Le dépôt ne fait déjà pas confiance au prompt sur ce point : le routeur RETIRE
tout sujet dont ``grounded_on`` ou ``angle`` est vide, et le commentaire le dit
en toutes lettres — « Le prompt l'interdit ; ce filtre ne fait pas confiance au
prompt » (``app/routers/content.py:47-49``). L'axe ``ancrages_presents``
rebranche ce filtre sur la sortie d'un prompt.

Pourquoi ``sujets_ancres`` est une PART et non une porte
--------------------------------------------------------
``rubrics/cv.py`` met à ZÉRO un CV dont une citation est introuvable, parce que
``sanitizeCvRewrite`` la RETIRE en production : on note la porte qui existe. Ici
la porte de production ne regarde que la PRÉSENCE de ``grounded_on``, jamais son
appartenance au contexte. Zéroer sur un ancrage introuvable inventerait une
règle que le produit n'applique pas — et « une garde protège une règle, elle ne
l'invente pas ».

⚠️ **On note l'ANCRAGE et la FORME, jamais l'intérêt du sujet.** Aucun axe ne dit
si l'angle vaut la peine d'être publié, si le ton est le bon, ou si le sujet fera
lire quelqu'un. Cinq sujets parfaitement ancrés et parfaitement ennuyeux marquent
100 ici.

==========================  ====================================================
Axe                         Primitive d'origine
==========================  ====================================================
``sujets_ancres``           ``bellum_linkedin_posts.py:24,30-34`` + le contexte injecté
``ancrages_presents``       ``app/routers/content.py:47-49`` (le filtre du routeur)
``champs_du_contrat``       ``PostIdea`` (``app/models/outputs/linkedin_posts.py:14-24``)
``volume_dans_la_borne``    ``bellum_linkedin_posts.py:20`` (« Trois à cinq SUJETS »)
``ouverture_en_une_phrase`` ``bellum_linkedin_posts.py:23,27-29``
``sans_donnee_inventee``    ``metrics.fabrication_violations``
==========================  ====================================================
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from app.eval.metrics import fabrication_violations

from .axes import Axis, RubricResult, eliminatory, measured, share, unmeasurable
from .reading import get, input_post_context, mappings, present, quote_is_grounded

PROMPT = "bellum_linkedin_posts"

_PROMPT_FILE = "app/prompts/bellum_linkedin_posts.py"
_MODEL_FILE = "app/models/outputs/linkedin_posts.py"
_ROUTER_FILE = "app/routers/content.py"

#: Les quatre champs de ``PostIdea`` (``app/models/outputs/linkedin_posts.py:14-24``),
#: qui sont aussi les quatre points du bloc « CE QUE TU PRODUIS ».
CONTRACT_FIELDS: tuple[str, ...] = ("angle", "why_now", "opening_line", "grounded_on")

#: « Trois à cinq SUJETS » (``bellum_linkedin_posts.py:20``). Seule la borne HAUTE
#: est inconditionnelle : la borne basse est explicitement levée quand le contexte
#: est mince — « Si le contexte est mince, propose moins de sujets »
#: (``bellum_linkedin_posts.py:31-32``). Noter la borne basse sanctionnerait
#: l'honnêteté que le prompt réclame.
MAX_IDEAS = 5

#: Une phrase se termine par un point, un point d'exclamation ou d'interrogation
#: suivi d'autre chose. Les points de suspension et une abréviation courante ne
#: comptent pas — la borne est volontairement lâche : elle attrape « le modèle a
#: écrit le post », pas une virgule de trop.
_SENTENCE_BREAK = re.compile(r"[.!?](?:\s|\Z)")
_NOT_A_BREAK = ("...", "…")


def _sentence_count(text: Any) -> int:
    """Combien de phrases dans cette ouverture ? Zéro pour un texte vide."""
    raw = str(text or "").strip()
    if not raw:
        return 0
    for marker in _NOT_A_BREAK:
        raw = raw.replace(marker, " ")
    breaks = [m for m in _SENTENCE_BREAK.finditer(raw)]
    # Un texte sans ponctuation finale reste UNE phrase ; un texte qui se termine
    # par un point aussi. C'est une coupure SUIVIE de texte qui en fait deux.
    inner = sum(1 for m in breaks if raw[m.end():].strip())
    return inner + 1


def score(output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult:
    axes: list[Axis] = []
    ideas = mappings(get(output, "ideas"))
    context = input_post_context(user_prompt)

    # ── 1. chaque sujet s'appuie-t-il sur du FOURNI ? ─────────────────────────
    if context is None:
        axes.append(unmeasurable(
            "sujets_ancres", 4.0,
            reason="le contexte autorisé est illisible dans le prompt d'entrée — sans lui, "
                   "« cité » et « inventé » ne se distinguent pas ; on ne conclut pas que tout "
                   "est inventé",
            origin=f"{_PROMPT_FILE}:24 (« l'élément du contexte […] cité tel quel »)",
        ))
    elif not ideas:
        axes.append(unmeasurable(
            "sujets_ancres", 4.0,
            reason="aucun sujet proposé — il n'y a aucun ancrage à confronter au contexte. C'est "
                   "volume_dans_la_borne qui note l'absence, pas cet axe",
            origin=f"{_PROMPT_FILE}:24",
        ))
    else:
        ok, total = share(ideas, lambda i: quote_is_grounded(get(i, "grounded_on"), context))
        axes.append(measured(
            "sujets_ancres", 4.0, ok=ok, total=total,
            origin=f"{_PROMPT_FILE}:24,30-34 (« Tu n'inventes AUCUN fait » ; « Un sujet sans "
                   f"ancrage n'est pas proposé ») + {_ROUTER_FILE}:47-49",
            blind_to="que l'ancrage SOUTIENNE l'angle. On vérifie que la citation vient du "
                     "contexte, pas qu'elle justifie le sujet — un modèle qui cite la même "
                     "phrase sous cinq angles différents passe cet axe. Et un contexte VIDE "
                     "(« AUCUN CONTEXTE FOURNI. ») rend tout ancrage introuvable : c'est alors "
                     "le contrat, pas une erreur de lecture.",
            detail=f"{ok}/{total} sujet(s) dont l'ancrage se retrouve dans le contexte fourni",
            data={"ideas": total, "grounded": ok, "context_chars": len(context)},
        ))

    # ── 2. le filtre que le routeur applique DÉJÀ ─────────────────────────────
    if not ideas:
        axes.append(unmeasurable(
            "ancrages_presents", 2.0,
            reason="aucun sujet proposé — il n'y a rien que le filtre du routeur puisse retirer",
            origin=f"{_ROUTER_FILE}:47-49",
        ))
    else:
        kept, n = share(
            ideas, lambda i: present(get(i, "grounded_on")) and present(get(i, "angle"))
        )
        axes.append(measured(
            "ancrages_presents", 2.0, ok=kept, total=n,
            origin=f"{_ROUTER_FILE}:47-49 (le routeur RETIRE un sujet sans `grounded_on` ni "
                   f"`angle` — « ce filtre ne fait pas confiance au prompt ») + {_PROMPT_FILE}:33-34",
            blind_to="ce que le filtre retire ENSUITE. Un sujet jeté par le routeur n'atteint "
                     "jamais l'écran : cet axe compte ce que le modèle a produit, pas ce que "
                     "l'utilisateur voit.",
            detail=f"{kept}/{n} sujet(s) survivant au filtre du routeur",
        ))

    # ── 3. les quatre champs de PostIdea ──────────────────────────────────────
    if not ideas:
        axes.append(unmeasurable(
            "champs_du_contrat", 1.5,
            reason="aucun sujet proposé — il n'y a aucun champ à compter",
            origin=f"{_MODEL_FILE}:14-24 (PostIdea)",
        ))
    else:
        checks = [present(get(i, f)) for i in ideas for f in CONTRACT_FIELDS]
        axes.append(measured(
            "champs_du_contrat", 1.5, ok=sum(1 for c in checks if c), total=len(checks),
            origin=f"{_MODEL_FILE}:14-24 (PostIdea) + {_PROMPT_FILE}:19-24 (bloc « CE QUE TU "
                   "PRODUIS »)",
            blind_to="que `why_now` dise vraiment pourquoi MAINTENANT. Le champ est compté "
                     "rempli, jamais lu.",
            detail=f"{sum(1 for c in checks if c)}/{len(checks)} champs remplis sur "
                   f"{len(ideas)} sujet(s) × {len(CONTRACT_FIELDS)}",
        ))

    # ── 4. la borne HAUTE, la seule qui soit inconditionnelle ─────────────────
    axes.append(measured(
        "volume_dans_la_borne", 1.0, ok=1 if 1 <= len(ideas) <= MAX_IDEAS else 0, total=1,
        origin=f"{_PROMPT_FILE}:20 (« Trois à cinq SUJETS ») + {_PROMPT_FILE}:31-32 (la borne "
               "BASSE est levée quand le contexte est mince)",
        blind_to="la borne basse. Trois sujets sur un contexte riche et trois sur un contexte "
                 "mince se notent pareil ici — parce que le prompt DEMANDE d'en rendre moins "
                 "quand la matière manque, et qu'un barème qui punirait cela pousserait le "
                 "modèle exactement là où le prompt refuse d'aller.",
        detail=f"{len(ideas)} sujet(s) (borne haute : {MAX_IDEAS})",
        data={"ideas": len(ideas)},
    ))

    # ── 5. une ouverture, pas un post ─────────────────────────────────────────
    openings = [i for i in ideas if present(get(i, "opening_line"))]
    if not openings:
        axes.append(unmeasurable(
            "ouverture_en_une_phrase", 1.0,
            reason="aucune phrase d'ouverture rendue — il n'y a rien à compter. Leur absence est "
                   "déjà notée par champs_du_contrat",
            origin=f"{_PROMPT_FILE}:23",
        ))
    else:
        ok, total = share(openings, lambda i: _sentence_count(get(i, "opening_line")) <= 1)
        axes.append(measured(
            "ouverture_en_une_phrase", 1.0, ok=ok, total=total,
            origin=f"{_PROMPT_FILE}:23 (« une seule phrase d'ouverture ») + {_PROMPT_FILE}:27-29 "
                   "(« Tu n'écris PAS le post »)",
            blind_to="la LONGUEUR. Une phrase de quatre-vingts mots passe cet axe ; un paragraphe "
                     "de trois phrases courtes ne passe pas. La borne compte les phrases parce "
                     "que c'est ce que le prompt écrit — elle attrape « le modèle a rédigé le "
                     "post », pas « le modèle a été bavard ».",
            detail=f"{ok}/{total} ouverture(s) tenant en une phrase",
        ))

    # ── 6. aucune donnée fabriquée ────────────────────────────────────────────
    axes.append(eliminatory(
        "sans_donnee_inventee", 1.5, violations=fabrication_violations([ideas]),
        origin="app/eval/metrics.py:96,521 (_FABRICATED_MARKERS + fabrication_violations — "
               "porte `passed = not violations`)",
        blind_to="un chiffre ou un client NOMMÉ que le contexte ne porte pas — « nous avons divisé "
                 "le délai par quatre » ne contient aucun marqueur de remplissage. C'est "
                 "sujets_ancres qui l'attrape, et seulement à travers `grounded_on`.",
    ))

    return RubricResult(
        prompt=PROMPT, axes=axes,
        caveat="Ce barème mesure l'ANCRAGE et la FORME, jamais l'intérêt du sujet : ni que l'angle "
               "vaille la peine d'être publié, ni que le ton soit le bon, ni que les interdits de "
               "style du prompt (« transformation digitale », « nos experts certifiés », la "
               "question rhétorique) aient été tenus — les nommer en liste noire ferait de trois "
               "exemples une règle. Il répond à « ces sujets sortent-ils du contexte fourni ? », "
               "pas à « ces sujets sont-ils bons ? ».",
    )
