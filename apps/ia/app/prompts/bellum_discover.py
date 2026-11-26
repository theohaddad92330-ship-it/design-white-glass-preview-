"""BELLUM-DISCOVER — le prompt de l'ANGLE COMMERCIAL, et rien d'autre.

Contrat : ``agent_docs/discover-v2-contract.md``.

    « Le registre produit la liste. Le LLM ne produit que l'angle commercial. »

En v1 ce prompt demandait au modèle d'*identifier les entreprises*, de leur
donner un *score de priorité* et de citer *5 décideurs à contacter* — trois
inventions rendues dans une UI d'apparence factuelle. Les entreprises arrivent
désormais **déjà résolues du registre (SIREN vérifié)** et le score est
**calculé** par :mod:`app.services.discover_scoring`. Il ne reste au modèle
qu'un travail qu'il fait bien et qu'aucune source ne peut produire : formuler
l'angle d'attaque, et nommer les FONCTIONS à viser.

Injection du profil — correctif : l'ancien prompt lisait ``personas``,
``avgTJM`` et ``references``, trois champs que le mapper ne renseigne JAMAIS
(cf. le commentaire de ``AnalysisProfileData`` dans
``packages/contracts/src/schemas/analysis.ts`` : « Keys the prompts also read
but that have NO source in EsnAnswers […] are intentionally absent »). Ils
produisaient un mur de « N/A » vendu comme de la personnalisation. Ils sont
supprimés au profit des champs d'ICP réellement stockés et jusqu'ici ignorés :
``positioning``, ``targetCompanyTypes``, ``mainChallenge``, ``offerDomain``,
``staffingModel``. Un champ absent n'est plus rendu en « N/A » : sa ligne
disparaît, exactement comme ``esnAnswersToProfileData`` rend ``{}`` pour un
questionnaire vide (« a deliberate profile-neutral run rather than a wall of
N/A »).
"""

from __future__ import annotations

import json
from typing import Any

from app.services.offer_domains import get_offer_domain_pack

# Les champs du profil ESN réellement alimentés par `esnAnswersToProfileData`,
# dans l'ordre où ils servent au vendeur. Une ligne dont la valeur est absente
# n'est PAS rendue (pas de « N/A » décoratif).
_PROFILE_FIELDS: tuple[tuple[str, str], ...] = (
    ("companyName", "Nom"),
    ("positioning", "Positionnement"),
    ("size", "Taille (consultants)"),
    ("offers", "Offres"),
    ("sectors", "Secteurs visés"),
    ("targetCompanyTypes", "Types d'entreprises visés"),
    ("geoZone", "Zone géographique"),
    ("staffingModel", "Modèle de staffing"),
    ("mainChallenge", "Défi commercial principal"),
)


def _render_value(value: Any) -> str:
    """Valeur affichable, ou chaîne vide — jamais le littéral « None ».

    Le garde ``value is None`` n'est pas cosmétique : sans lui, un champ absent
    du profil (le cas NOMINAL, cf. `esnAnswersToProfileData` qui rend ``{}``
    pour un questionnaire vide) rendrait « - Nom : None » dans le prompt, et le
    modèle lirait « None » comme le positionnement de l'ESN.
    """
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return ", ".join(str(item).strip() for item in value if str(item).strip())
    return str(value).strip()


def _profile_block(profile_data: dict) -> str:
    lines = []
    for key, label in _PROFILE_FIELDS:
        rendered = _render_value(profile_data.get(key))
        if rendered:
            lines.append(f"- {label} : {rendered}")
    # Le domaine d'offre passe par le REGISTRE de packs, pas par la valeur brute :
    # `get_offer_domain_pack` ne rend un pack que pour un domaine ENREGISTRÉ et
    # NON DÉFAUT. C'est ce qui préserve la garantie de byte-identité du défaut
    # (absent / « esn_it » / valeur inconnue rendent le prompt historique, cf.
    # tests/test_offer_domains.py) — imprimer le token brut la casserait.
    pack = get_offer_domain_pack(profile_data.get("offerDomain"))
    if pack is not None:
        lines.append(f"- Domaine d'offre : {pack.label_fr}")
    if not lines:
        # Profil non renseigné : on le DIT, plutôt que de simuler un ciblage.
        return "PROFIL ESN : non renseigné — reste générique, n'invente aucun positionnement."
    return "PROFIL ESN (le vendeur, pour qui tu écris l'angle) :\n" + "\n".join(lines)


def build_system_prompt(profile_data: dict) -> str:
    """Build the BELLUM-DISCOVER system prompt — angle commercial uniquement."""
    return f"""Tu es BELLUM-DISCOVER, l'analyste commercial d'une ESN.

Les entreprises te sont FOURNIES. Elles viennent du registre officiel, leur
SIREN est vérifié. Tu n'en cherches pas, tu n'en ajoutes pas, tu n'en retires pas.

{_profile_block(profile_data)}

TA SEULE MISSION, pour CHAQUE entreprise fournie :
1. `angle` — en 1 à 2 phrases, pourquoi CETTE ESN a une carte à jouer chez CETTE
   entreprise, et par quoi entrer. Uniquement à partir des faits fournis
   (activité, taille, implantation, ancienneté, signaux datés) et du profil ESN.
2. `suggestedRoles` — 2 à 4 FONCTIONS à viser (intitulé + direction de
   rattachement), déduites de l'activité et de la taille de l'entreprise.

INTERDITS — ils définissent le reste du système :
- N'AJOUTE, ne renomme, ne fusionne, ne dédoublonne AUCUNE entreprise. Réponds
  pour les SIREN fournis, tous, et seulement eux.
- NE PRODUIS AUCUN SCORE ni priorité : le score est calculé ailleurs, de façon
  déterministe et justifiée. Tout score que tu émettrais serait jeté.
- N'INVENTE AUCUNE PERSONNE : `suggestedRoles` liste des fonctions à cibler, pas
  des individus. Jamais de nom, de prénom, d'email ni de téléphone.
- N'INVENTE AUCUN FAIT : ni chiffre d'affaires, ni effectif, ni signal, ni
  actualité qui ne serait pas dans les données fournies.
- Si les faits fournis ne suffisent pas à justifier un angle honnête, renvoie
  `"angle": null`. Un angle vide vaut mieux qu'un angle inventé.

ACCESSIBILITÉ AVANT NOTORIÉTÉ : ne privilégie pas un grand nom simplement parce
qu'il est connu. Une PME, une filiale ou une direction régionale joignable vaut
mieux qu'un groupe où personne n'est atteignable. Quand l'entreprise est grande,
dis par QUELLE entité ou quelle direction entrer, pas « la DSI groupe ».

QUALIFICATION DÉJÀ FAITE : chaque entreprise porte un champ `qualification`
calculé en amont, de façon déterministe.
- `recommended` : entité opérationnelle valide, tu peux proposer un angle normal.
- `to_verify` : un doute a été relevé (`reason`). Ton angle doit COMMENCER par
  lever ce doute — la première action est une vérification, pas une approche.
- `excluded` : ne produis aucun angle, renvoie `"angle": null`. Argumenter une
  approche sur une ligne écartée annulerait la qualification.

Réponds UNIQUEMENT en JSON valide, sans texte autour."""


#: #2544.2 — les clés d'un candidat qui ne partent JAMAIS vers un modèle. Une
#: seule aujourd'hui, et elle est nommée plutôt que devinée par un filtre malin :
#: la prochaine devra être ajoutée ici, à la vue de tous.
_KEYS_NEVER_SENT_TO_THE_MODEL = ("people",)


def _without_people(company: dict) -> dict:
    return {key: value for key, value in company.items() if key not in _KEYS_NEVER_SENT_TO_THE_MODEL}


def build_angle_user_prompt(companies: list[dict], query: dict | None = None, internal_knowledge: str = "") -> str:
    """User prompt : les entreprises DÉJÀ RÉSOLUES + les critères appliqués.

    ``companies`` porte les seuls champs registre (plus les signaux datés déjà
    collectés) — aucun score n'est transmis, pour que le modèle ne soit pas tenté
    de le commenter ou de le reproduire.

    ⚠️ #2544.2 — LES PERSONNES N'ENTRENT PAS DANS CETTE CHARGE UTILE. Depuis que
    le registre nomme des mandataires sur chaque candidat (`people`), la
    sérialisation telle quelle les enverrait au modèle. La doctrine l'interdit
    des deux côtés : aucun critère protégé ne pèse dans le rang d'une personne
    « ni dans le code qui calcule, ni dans le PROMPT qui note » (c58), et ce
    prompt-ci demande explicitement de n'inventer AUCUNE personne. Le modèle
    écrit un angle sur une ENTREPRISE ; il n'a pas à connaître ses dirigeants.
    """
    criteria = json.dumps(query or {}, ensure_ascii=False)
    payload = json.dumps([_without_people(company) for company in companies], ensure_ascii=False)
    # #3586 — savoir métier interne (bloc dédié) ; vide ⇒ prompt byte-identique.
    internal_block = f"\n\n{internal_knowledge}" if (internal_knowledge or "").strip() else ""
    return f"""CRITÈRES DE RECHERCHE APPLIQUÉS : {criteria}

ENTREPRISES RÉSOLUES DU REGISTRE ({len(companies)}) : {payload}{internal_block}

JSON attendu — un objet par SIREN fourni, dans le même ordre :
{{"angles":[{{"siren":"<le SIREN fourni, à l'identique>","angle":"<1-2 phrases ou null>",
  "suggestedRoles":[{{"title":"<fonction>","department":"<direction>"}}]}}]}}"""


# ── Legacy — `POST /discover/search` ────────────────────────────────────────
# Conservé le temps de la bascule d'écran (le contrat garde la route en place),
# mais ce n'est plus la source de vérité : c'est CE prompt qui laissait le modèle
# inventer noms d'entreprises, score /10 et « contacts clés ». À supprimer avec
# la route dès que le front consomme `/discover/registry`. Volontairement figé —
# ne plus l'enrichir.


def build_legacy_system_prompt(profile_data: dict) -> str:
    """DÉPRÉCIÉ — prompt v1 de `/discover/search`. Voir la note ci-dessus."""
    p = profile_data
    return f"""Tu es BELLUM. Mission : identifier les entreprises les plus pertinentes pour cette ESN.
PROFIL ESN :
- Nom : {p.get('companyName', 'N/A')}, Taille : {p.get('size', 'N/A')} consultants
- Offres : {', '.join(p.get('offers', []))}
- Secteurs : {', '.join(p.get('sectors', []))}
- Zone géo : {p.get('geoZone', 'N/A')}

À partir des résultats de recherche, identifie les 10 entreprises les plus pertinentes.
Pour chacune : nom, secteur, pourquoi c'est pertinent pour ce profil ESN,
5 décideurs potentiels à contacter, score de priorité.
Réponds UNIQUEMENT en JSON valide."""


def build_user_prompt(criteria: str, brave_results: str) -> str:
    """DÉPRÉCIÉ — user prompt v1 de `/discover/search`. Voir la note ci-dessus."""
    return f"""Critères : {criteria}
RÉSULTATS WEB : {brave_results}
JSON : {{ "companies":[{{"name","sector","why","priorityScore",
  "potentialContacts":[{{"title","department","why"}}],
  "suggestedAngle"}}] }}"""
