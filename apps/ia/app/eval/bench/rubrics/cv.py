"""Barème de ``bellum_cv`` — la réécriture d'un CV pour une mission.

Le prompt le dit lui-même : « C'est le prompt le plus dangereux du produit »
(``app/prompts/bellum_cv.py:9``). On demande à un modèle d'améliorer un CV pour
qu'il colle à un besoin, et la pente naturelle est d'ajouter la compétence qui
manque — une donnée fictive sur une PERSONNE RÉELLE, envoyée à un client, et
découverte en soutenance.

C'est ce qui rend ce prompt **mécaniquement notable**, là où « ce CV est-il
bon ? » ne le serait pas : le prompt impose une PREUVE VÉRIFIABLE.

    « Pour chaque expérience mise en avant, le champ "proof" contient une
      CITATION EXACTE et CONTINUE du CV source (copiée mot pour mot, au moins
      une douzaine de caractères). »        (``app/prompts/bellum_cv.py:55``)

Le CV source est dans le prompt utilisateur. Confronter les deux est de
l'arithmétique de chaînes — pas un jugement.

⚠️ **On note la STRUCTURE et le SOURÇAGE, jamais la qualité du CV.** Aucun axe
ne dit si l'accroche est bonne, si l'ordre des expériences sert la mission, ou
si le vocabulaire est le bon. Un CV parfaitement sourcé et parfaitement plat
marque 100 ici.

===========================  =====================================================
Axe                          Primitive d'origine
===========================  =====================================================
``preuves_ancrees``          ``proofIsGrounded`` / ``sanitizeCvRewrite``
                             (``apps/api/src/modules/consultants/cv-rewrite-guard.ts``)
                             + ``app/routers/cv.py:202`` (le même contrôle, en Python)
``preuves_discriminantes``   ``MIN_PROOF_CHARS`` (idem) — 12 caractères
``highlights_complets``      ``readHighlights`` (titre + détail obligatoires)
``mots_cles_couverts``       le filtre ``keywords`` de ``sanitizeCvRewrite``
``champs_du_contrat``        le bloc FORMAT du prompt (``bellum_cv.py:57-72``)
``sans_donnee_inventee``     ``metrics.fabrication_violations``
===========================  =====================================================
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.eval.metrics import fabrication_violations

from .axes import Axis, RubricResult, eliminatory, measured, share, unmeasurable
from .reading import MIN_PROOF_CHARS, comparable, get, input_cv_text, mappings, present, quote_is_grounded

PROMPT = "bellum_cv"

#: Les champs que le bloc FORMAT énonce ET que ``sanitizeCvRewrite`` relit.
#: ``keywords`` et ``gaps`` n'y sont PAS : un CV qui couvre tout le besoin n'a
#: légitimement aucun manque, et les compter absents punirait l'honnêteté.
CONTRACT_FIELDS: tuple[str, ...] = ("headline", "summary", "highlights")

#: Un mot-clé « couvert » se vérifie sur ses jetons, comme ``terms()`` côté API.
#: Sous trois lettres, un jeton n'est pas discriminant.
_MIN_TERM_CHARS = 3

_CV_GUARD = "apps/api/src/modules/consultants/cv-rewrite-guard.ts"


def _terms(value: Any) -> set[str]:
    return {t for t in comparable(value).replace("/", " ").replace(",", " ").split()
            if len(t) >= _MIN_TERM_CHARS}


def score(output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult:
    axes: list[Axis] = []
    highlights = mappings(get(output, "highlights"))
    keywords = [k for k in (get(output, "keywords") or []) if isinstance(k, str) and k.strip()]
    source = input_cv_text(user_prompt)
    haystack = comparable(source) if source is not None else ""

    # ── 1. les citations sont-elles DANS le CV source ? ───────────────────────
    if source is None:
        axes.append(unmeasurable(
            "preuves_ancrees", 4.0,
            reason="le CV source est illisible dans le prompt d'entrée — sans lui, « cité » et "
                   "« inventé » ne se distinguent pas ; on ne conclut pas que tout est inventé",
            origin=f"{_CV_GUARD} (proofIsGrounded)",
        ))
    elif not highlights:
        axes.append(unmeasurable(
            "preuves_ancrees", 4.0,
            reason="aucune expérience mise en avant — c'est champs_du_contrat qui sanctionne "
                   "l'absence, pas cet axe (qui noterait sinon deux fois la même faute)",
            origin=f"{_CV_GUARD} (proofIsGrounded)",
        ))
    else:
        invented = [
            str(get(h, "title") or "?")
            for h in highlights
            if present(get(h, "proof")) and not quote_is_grounded(get(h, "proof"), haystack)
        ]
        # ÉLIMINATOIRE : une expérience ajoutée à un CV réel n'est pas « une
        # expérience sur deux ». En part, un modèle qui gonfle un profil serait
        # noté « à moitié bon » — soit exactement l'inverse de ce que le produit
        # tranche, et ``sanitizeCvRewrite`` la RETIRE, elle ne la pondère pas.
        axes.append(eliminatory(
            "preuves_ancrees", 4.0, violations=invented,
            origin=f"{_CV_GUARD} (proofIsGrounded, sanitizeCvRewrite) + "
                   "app/routers/cv.py:202,231 (le même contrôle, côté Python)",
            blind_to="une citation EXACTE mais DÉFORMÉE dans le titre ou le détail : « a participé "
                     "à » requalifié en « a piloté » cite toujours le CV. Le prompt l'interdit "
                     "(bellum_cv.py:48) ; rien dans la sortie ne permet de le contredire.",
            detail=(f"{len(highlights)} expérience(s), toutes citées dans le CV source"
                    if not invented else
                    f"{len(invented)}/{len(highlights)} citation(s) introuvable(s) : "
                    + "; ".join(invented[:3])),
            data={"highlights": len(highlights), "invented": invented[:10]},
        ))

    # ── 2. une citation trop courte ne prouve rien — mais n'invente rien ──────
    if highlights:
        ok, total = share(
            highlights, lambda h: len(comparable(get(h, "proof"))) >= MIN_PROOF_CHARS
        )
        axes.append(measured(
            "preuves_discriminantes", 2.0, ok=ok, total=total,
            origin=f"{_CV_GUARD} (MIN_PROOF_CHARS = 12)",
            blind_to="qu'une citation LONGUE soit pertinente : douze caractères d'en-tête de CV "
                     "passent le seuil sans rien prouver de l'expérience décrite.",
            detail=f"{ok}/{total} citation(s) d'au moins {MIN_PROOF_CHARS} caractères",
        ))
        filled, n = share(
            highlights, lambda h: present(get(h, "title")) and present(get(h, "detail"))
        )
        axes.append(measured(
            "highlights_complets", 2.0, ok=filled, total=n,
            origin=f"{_CV_GUARD} (readHighlights : sans titre NI détail, l'expérience est jetée) "
                   "+ app/prompts/bellum_cv.py:60-66",
            blind_to="la longueur et la tenue du détail — « 2 à 3 lignes » n'est pas compté.",
            detail=f"{filled}/{n} expérience(s) avec titre ET détail",
        ))
    else:
        for name, weight in (("preuves_discriminantes", 2.0), ("highlights_complets", 2.0)):
            axes.append(unmeasurable(
                name, weight,
                reason="aucune expérience mise en avant — il n'y a pas de citation à mesurer",
                origin=f"{_CV_GUARD} (readHighlights)",
            ))

    # ── 3. les mots-clés annoncés « couverts » le sont-ils ? ──────────────────
    if source is None or not keywords:
        axes.append(unmeasurable(
            "mots_cles_couverts", 2.0,
            reason=("le CV source est illisible dans le prompt d'entrée — un mot-clé ne peut être "
                    "confronté à rien" if source is None else
                    "aucun mot-clé annoncé — ne rien annoncer n'est pas annoncer à faux"),
            origin=f"{_CV_GUARD} (filtre keywords de sanitizeCvRewrite)",
        ))
    else:
        cv_terms = _terms(source)
        ok, total = share(keywords, lambda k: bool(_terms(k) & cv_terms))
        axes.append(measured(
            "mots_cles_couverts", 2.0, ok=ok, total=total,
            origin=f"{_CV_GUARD} (sanitizeCvRewrite retire un mot-clé absent du CV et de la stack)",
            blind_to="que le mot-clé soit celui du BESOIN. On vérifie qu'il est dans le CV, pas "
                     "qu'il répond à la mission — et le rapprochement se fait par jetons, donc "
                     "« kubernetes » couvre « Kubernetes 1.29 » sans rien savoir des versions.",
            detail=f"{ok}/{total} mot(s)-clé(s) retrouvé(s) dans le CV source",
        ))

    # ── 4. les champs que le bloc FORMAT énonce ───────────────────────────────
    ok, total = share(CONTRACT_FIELDS, lambda f: present(get(output, f)) or bool(mappings(get(output, f))))
    axes.append(measured(
        "champs_du_contrat", 2.0, ok=ok, total=total,
        origin="app/prompts/bellum_cv.py:57-72 (bloc FORMAT — JSON STRICT)",
        blind_to="``keywords`` et ``gaps``, volontairement HORS de cet axe : un CV qui couvre tout "
                 "le besoin n'a légitimement aucun manque, et les compter absents punirait "
                 "l'honnêteté que le prompt réclame (bellum_cv.py:52).",
        detail=f"{ok}/{total} champs du contrat ({', '.join(CONTRACT_FIELDS)})",
    ))

    # ── 5. aucune donnée fabriquée ────────────────────────────────────────────
    violations = fabrication_violations([
        get(output, "headline"), get(output, "summary"), highlights, keywords, get(output, "gaps"),
    ])
    axes.append(eliminatory(
        "sans_donnee_inventee", 2.0, violations=violations,
        origin="app/eval/metrics.py:96,521 (_FABRICATED_MARKERS + fabrication_violations — "
               "porte `passed = not violations`)",
        blind_to="une invention PLAUSIBLE : une certification que le CV ne porte pas ne contient "
                 "aucun marqueur de remplissage. C'est preuves_ancrees qui l'attrape, et lui seul.",
    ))

    return RubricResult(
        prompt=PROMPT, axes=axes,
        caveat="Ce barème mesure le SOURÇAGE et la FORME, jamais la qualité du CV réécrit : ni la "
               "pertinence de l'ordre des expériences, ni la justesse du vocabulaire, ni le fait "
               "que les manques ÉNONCÉS soient les bons. Il répond à « ce CV est-il prouvable ? », "
               "pas à « ce CV est-il bon ? ».",
    )
