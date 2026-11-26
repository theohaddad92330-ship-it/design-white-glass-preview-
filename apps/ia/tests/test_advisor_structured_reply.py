"""Réponses STRUCTURÉES du Copilote (restitution V2 §14, maquette p.15).

L'écran sait déjà encadrer « Objectif / Angle d'accroche / Cas d'usage » en carte
(`apps/web/src/features/chat/view/StructuredReply.tsx`) — mais seulement quand le
modèle produit spontanément ces intitulés. Résultat : la carte n'apparaissait
presque jamais et le rendu restait « du markdown à plat » (le constat de l'audit).

La consigne vit donc désormais dans le prompt. Ce que ces tests verrouillent :

  1. les trois intitulés sont demandés, dans la forme EXACTE que le parseur web
     reconnaît (`**Objectif :**`) — un intitulé nommé autrement ne déclencherait
     aucune carte ;
  2. la consigne est bornée aux réponses de type plan/recommandation : une
     réponse conversationnelle courte ne doit pas être déguisée en plan ;
  3. la règle « jamais de donnée inventée » survit à la mise en forme : une
     section sans preuve se dit vide, elle ne se remplit pas.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt

# Les intitulés reconnus par `RECOGNIZED_TITLES` côté web. Si le prompt en
# demandait d'autres, la carte structurée ne s'afficherait jamais.
_WEB_RECOGNIZED_HEADINGS = ("**Objectif :**", "**Angle d'accroche :**", "**Cas d'usage")

# #1924.1 — les intitulés du gabarit CONSEIL (décision Louis 16/09/2026). Ils
# sont TENUS PAR LE MÊME PARSEUR : `RECOGNIZED_TITLES` a dû apprendre les quatre
# le même jour, sinon un conseil serait sorti en markdown à plat — exactement le
# défaut que ce fichier documente pour les plans.
_WEB_RECOGNIZED_ADVICE_HEADINGS = (
    "**Verdict :**",
    "**Pourquoi :**",
    "**Ce qui manque :**",
    "**Prochaine action :**",
)

# #3763.5 (reste du lot J19) — les intitulés du gabarit EXPLICATIF. « Résumé »
# et « Réserves » sont NEUFS côté `RECOGNIZED_TITLES` ; « Pourquoi » est déjà
# tenu par `_WEB_RECOGNIZED_ADVICE_HEADINGS` ci-dessus (même intitulé, même
# nature, réutilisé — GA-26).
_WEB_RECOGNIZED_EXPLANATORY_HEADINGS = ("**Résumé :**", "**Réserves :**")


def _prompt() -> str:
    return build_system_prompt({}, {}, "", "")


def test_prompt_demands_the_three_named_sections():
    prompt = _prompt()
    for heading in _WEB_RECOGNIZED_HEADINGS:
        assert heading in prompt, f"intitulé absent du prompt : {heading}"


def test_prompt_demands_the_four_advice_sections():
    """#1924.1 — la MÊME exigence, pour l'autre gabarit : un intitulé que le
    parseur web ne connaît pas ne déclenche aucune carte."""
    prompt = _prompt()
    for heading in _WEB_RECOGNIZED_ADVICE_HEADINGS:
        assert heading in prompt, f"intitulé absent du prompt : {heading}"


def test_prompt_scopes_the_format_to_plans_and_recommendations():
    """Sans cette borne, le copilote répondrait « Objectif / Angle / Cas d'usage »
    à « quel est le score de ce compte ? »."""
    prompt = _prompt()
    assert "PLAN" in prompt and "RECOMMANDATION" in prompt


def test_prompt_exempts_short_conversational_answers():
    prompt = _prompt()
    assert "conversationnelle" in prompt


def test_prompt_demands_the_explanatory_headings():
    """#3763.5 — même exigence, pour le gabarit EXPLICATIF (une analyse qu'aucune
    carte ni les deux autres gabarits ne couvrent) : un intitulé que le parseur
    web ne connaît pas ne déclencherait aucune section."""
    prompt = _prompt()
    for heading in _WEB_RECOGNIZED_EXPLANATORY_HEADINGS:
        assert heading in prompt, f"intitulé absent du prompt : {heading}"
    # « Pourquoi » est réutilisé, pas redemandé une seconde fois sous un autre nom.
    assert "**Pourquoi :**" in prompt


def test_prompt_scopes_the_explanatory_format_to_what_no_other_gabarit_covers():
    """Sans cette borne, Laura déguiserait un « bonjour » ou une question
    factuelle en Résumé / Pourquoi / Réserves."""
    prompt = _prompt()
    section = prompt.split("**Résumé :**", 1)[0][-800:]
    assert "EXPLICATIVE" in section
    assert "conversationnelle" in prompt.split("**Résumé :**", 1)[1][:600]


def test_explanatory_caveats_are_named_never_omitted():
    """La doctrine « non mesuré n'est jamais 0 » tenue pour « Réserves » :
    Laura ne doit pas se taire comme si tout avait été vérifié."""
    prompt = _prompt()
    section = prompt.split("**Réserves :**", 1)[1][:300]
    assert "nomme" in section.lower() or "jamais omis" in section.lower()


def test_structured_format_never_licenses_invented_evidence():
    """La section « Cas d'usage » est celle qui pousse le plus à inventer une
    référence client. Le prompt doit dire de l'avouer."""
    prompt = _prompt()
    section = prompt.split("**Cas d'usage", 1)[1]
    assert "invente" in section or "inventer" in section


def test_the_directive_is_present_even_without_any_context():
    """Le bloc de forme n'est pas conditionné à un compte / un profil : un fil
    « général » doit structurer ses plans comme un fil scopé."""
    assert "**Objectif :**" in build_system_prompt({}, {}, "", "", "")
