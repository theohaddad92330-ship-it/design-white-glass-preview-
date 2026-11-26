"""Garde de doctrine — le texte rendu verbatim doit TUTOYER (R15N-9... R16-1).

Mesuré en production le 15/09/2026, deux fois de part et d'autre d'une
régénération de contexte (pas un transitoire) : l'écran `/welcome` tutoie 29
fois (« ton », « ta », « tes », « tu ») dans son texte écrit à la main, pendant
que les trois encarts rendus verbatim depuis `WelcomeSummary` (Recherches,
Messages, Scoring) VOUVOIENT — « vos cibles », « vous parlez », « votre
couverture ». Cause : `ProfileContext.model_json_schema()` (ce qu'Instructor
envoie RÉELLEMENT au modèle — voir `test_profile_context_prompt_doctrine.py`
pour la même méthode) ne portait AUCUNE consigne de tutoiement sur ces champs,
et le worked example de `profile_recap` employait lui-même le vouvoiement
(« Vous êtes une ESN… Vous travaillez… votre équipe commerciale »).

R16-1 (mesuré en production le 16/09/2026, `.claude/notes/defaut-R16-1-
tutoiement-de-la-sortie.md`) : cette garde restait VERTE alors que le texte
PRODUIT vouvoyait quand même, huit fois — parce qu'elle ne lisait que les
CINQ champs de `WelcomeSummary`, alors que le produit en rend **21** verbatim
(`packages/contracts/src/schemas/profile-context-rendered-fields.json`, le
corpus UNIQUE — GA-26 — que relit aussi `stored-context-doctrine.spec.ts` côté
API). La consigne seule reste insuffisante par construction (une consigne de
prompt n'est pas un contrat) : `test_profile_context_verbatim_validator.py`
porte le `field_validator` qui REFUSE la valeur PRODUITE, pas seulement la
consigne.

⚠️ **Les 21 ne se valent pas.** Le corpus porte un `audience` par champ :
`"user"` (l'app parle À l'utilisateur BellumAI — la doctrine « Laura tutoie »
s'applique, 13 champs) contre `"external"` (le champ décrit ce que le
COMMERCIAL doit écrire ou montrer À SON PROSPECT — `messagingStyle.avoid`,
`.valuePropositionAngle`, `.differentiationPoints`, les libellés de secteurs/
noms — où le vouvoiement du PROSPECT est l'usage B2B français normal, pas un
défaut). Forcer le tutoiement sur `avoid` casserait une donnée légitime : ce
champ est un `list[str]` de formulations À BANNIR, et son propre worked
example (`profile_context.py`) liste « à vos côtés » comme entrée valide — un
« vous » CITÉ comme donnée, pas commandé par l'app. Seul le sous-ensemble
`audience == "user"` est vérifié ici ; le témoin ci-dessous le PROUVE.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.models.profile_context import ProfileContext
from app.models.tutoiement_doctrine import VOUVOIEMENT, commanding_segments


def _monorepo_root() -> Path:
    """`packages/contracts/src/schemas/` marche l'arbre depuis ce fichier — les
    tests tournent dans un checkout monorepo complet (CI + local), jamais dans
    le conteneur `apps/ia` déployé seul (voir `app/contracts/shared_schemas.py`
    pour la même distinction)."""

    marker = Path("packages/contracts/src/schemas/profile-context-rendered-fields.json")
    for parent in Path(__file__).resolve().parents:
        if (parent / marker).is_file():
            return parent
    raise FileNotFoundError(f"{marker} introuvable en remontant depuis {__file__} — checkout monorepo incomplet ?")


def _rendered_text_fields() -> list[dict[str, str]]:
    """Le corpus UNIQUE (GA-26) des 21 champs de texte rendus verbatim — la
    même source que lit `stored-context-doctrine.spec.ts` côté API."""

    path = _monorepo_root() / "packages/contracts/src/schemas/profile-context-rendered-fields.json"
    return json.loads(path.read_text())


def _field_description(defs: dict[str, object], model: str, field: str) -> str:
    model_def = defs.get(model, {})
    properties = model_def.get("properties", {}) if isinstance(model_def, dict) else {}
    entry = properties.get(field, {}) if isinstance(properties, dict) else {}
    return (entry.get("description") or "") if isinstance(entry, dict) else ""


def _descriptions(*, audience: str | None = None) -> list[tuple[str, str]]:
    """(nom du champ, description) — lu dans le schéma JSON envoyé au modèle,
    pas dans le code Python voisin (même précaution que la garde sœur).
    `audience=None` rend les 21 ; `audience="user"` filtre le sous-ensemble où
    la doctrine de tutoiement s'applique (voir le docstring du module)."""

    schema = ProfileContext.model_json_schema()
    defs = schema.get("$defs", {})
    entries = _rendered_text_fields() if audience is None else [e for e in _rendered_text_fields() if e["audience"] == audience]
    return [(entry["model"] + "." + entry["field"], _field_description(defs, entry["model"], entry["field"])) for entry in entries]


# ---------------------------------------------------------------------------
# Preuve n°2 : la garde LIT quelque chose.
# ---------------------------------------------------------------------------


def test_le_corpus_nest_pas_vide():
    # #2088.34 — 21 + `ProfileContradiction.statement`/`.reasoning` = 23.
    descriptions = _descriptions()
    assert len(descriptions) == 23, descriptions
    assert all(text for _, text in descriptions), descriptions


def test_le_sous_corpus_user_nest_pas_vide():
    # #2088.34 — 13 + les deux champs de `ProfileContradiction` (audience: user) = 15.
    descriptions = _descriptions(audience="user")
    assert len(descriptions) == 15, descriptions


# ---------------------------------------------------------------------------
# Le refus : chaque champ commande le tutoiement, aucun ne commande le vouvoiement.
# ---------------------------------------------------------------------------


def test_chaque_champ_user_commande_le_tutoiement():
    """Chaque champ de texte où l'app parle À L'UTILISATEUR exige explicitement
    le tutoiement — les 13 `audience: "user"`, pas seulement les 5 de
    `WelcomeSummary` (R16-1)."""

    manquants = [name for name, text in _descriptions(audience="user") if "tutoiement" not in text.lower()]
    assert manquants == [], manquants


def test_aucun_champ_user_ne_commande_le_vouvoiement():
    """La garde qui aurait attrapé R15N-11 : aucune consigne d'un champ
    `audience: "user"` ne doit EMPLOYER vous/votre/vos comme modèle de phrase —
    ni dans l'instruction, ni dans un exemple travaillé (le piège mesuré :
    l'exemple de `profile_recap`)."""

    offenders = [
        (name, segment)
        for name, text in _descriptions(audience="user")
        for segment in commanding_segments(text, VOUVOIEMENT)
    ]
    assert offenders == [], offenders


def test_temoin_un_champ_external_peut_commander_le_vouvoiement():
    """Elle n'attrape pas ce qu'elle ne vise pas : `messagingStyle.avoid`
    (`audience: "external"`) liste des formulations À BANNIR dans un message au
    PROSPECT, et son propre worked example contient « à vos côtés » — un
    vouvoiement CITÉ comme donnée, pas commandé par l'app. Le forcer au
    tutoiement casserait une liste légitime ; le sous-corpus `user` l'exclut."""

    avoid_description = next(text for name, text in _descriptions() if name == "MessagingStyle.avoid")
    assert commanding_segments(avoid_description, VOUVOIEMENT) != []
    assert "MessagingStyle.avoid" not in [name for name, _ in _descriptions(audience="user")]


# ---------------------------------------------------------------------------
# Preuve n°3 : la garde n'attrape pas ce qu'elle ne vise pas.
# ---------------------------------------------------------------------------


def test_temoin_les_cas_legitimes_voisins_passent():
    # a) L'interdit lui-même, nommé pour le refuser — pas commandé.
    interdit = "Tutoiement obligatoire (tu/ta/tes/ton). Jamais vous, votre ou vos."
    assert commanding_segments(interdit, VOUVOIEMENT) == []

    # b) Le tutoiement pur, sans le mot « vous » nulle part.
    correct = "1 phrase qui explique ce que tu vas retrouver, avec tes propres mots."
    assert commanding_segments(correct, VOUVOIEMENT) == []


def test_la_garde_sait_dire_non():
    """Preuve n°1, gardée en dur : le refus rougit sur le texte fautif réel."""

    # Le texte mesuré en production le 15/09 sur /welcome (encart Recherches).
    assert commanding_segments(
        "Les signaux que vos cibles cherchent des ressources comme les vôtres.", VOUVOIEMENT
    )
    # Le worked example de profile_recap avant correction (profile_context.py).
    assert commanding_segments(
        "Vous êtes une ESN \"Data & Cloud\" de 30 consultants. Vous travaillez avec des CDI et "
        "votre équipe commerciale est de 3 personnes.",
        VOUVOIEMENT,
    )
    # #2062 R16-1 — mesuré le 16/09/2026, en dehors de WelcomeSummary cette
    # fois (bellumPhrases.weeklySummaryIntro) : la preuve que le corpus étendu
    # aux 21 champs attrape aussi ce que le corpus à 5 laissait passer.
    assert commanding_segments(
        "Cette semaine, on a creusé les stakeholders clés chez vos cibles.", VOUVOIEMENT
    )
