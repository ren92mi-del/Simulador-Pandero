import unittest

from pandero_knowledge import ESCENARIOS, GUIA_CONOCIMIENTO, RUBRICA, elegir_escenario, escenario_por_id, instrucciones_escenario


class PanderoKnowledgeTests(unittest.TestCase):
    def test_scenario_ids_are_unique(self):
        ids = [item["id"] for item in ESCENARIOS]
        self.assertEqual(len(ids), len(set(ids)))

    def test_scenarios_have_required_fields(self):
        for item in ESCENARIOS:
            self.assertTrue(item["id"])
            self.assertTrue(item["categoria"])
            self.assertTrue(item["nombre"])
            self.assertTrue(item["objetivo"])

    def test_rubric_totals_twenty(self):
        self.assertEqual(sum(item["maximo"] for item in RUBRICA), 20)

    def test_manual_scenario_lookup(self):
        item = escenario_por_id("pandero_casa")
        self.assertIsNotNone(item)
        self.assertIn("Casa", item["nombre"])

    def test_auto_scenario_uses_consult_reason(self):
        item = elegir_escenario("Quiero saber cómo hacer un remate")
        self.assertEqual(item["id"], "asambleas")

    def test_knowledge_guide_covers_major_topics(self):
        for term in ("remate", "financiamiento", "devolución", "siniestro", "Pandero Casa", "débito automático"):
            self.assertIn(term.lower(), GUIA_CONOCIMIENTO.lower())

    def test_scenario_prompt_has_objective_and_manual_guide(self):
        prompt = instrucciones_escenario(escenario_por_id("estado_cuenta"))
        self.assertIn("Objetivo de la consulta", prompt)
        self.assertIn("Guía temática", prompt)


if __name__ == "__main__":
    unittest.main()
