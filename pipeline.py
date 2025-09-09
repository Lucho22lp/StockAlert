from __future__ import annotations
import json, hashlib
from dataclasses import dataclass
from typing import List, Dict, Any

@dataclass
class PromptVariant:
    name: str
    template: str

def hash_batch(records: List[Dict[str, Any]]) -> str:
    digest = hashlib.sha256(json.dumps(records, sort_keys=True).encode()).hexdigest()
    return digest[:12]

def build_payload(products: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "context": {
            "business": "retail_grocery",
            "currency": "ARS",
        },
        "products": products
    }

def baseline_template() -> PromptVariant:
    t = (
        "Eres un analista de inventario. Recibirás una lista de productos con stock actual, "
        "ventas históricas, costo y parámetros. Devuelve sugerencias de pedido por producto "
        "según demanda y riesgo de vencimiento."
        "\nEntrada:\n{payload}\n"
        "Salida: recomendaciones por producto."
    )
    return PromptVariant("baseline", t)

def fast01_template() -> PromptVariant:
    t = (
        "Rol: Analista de inventario experto. Tarea: Evaluar lote de SKUs y sugerir reabastecimiento."
        "\nInstrucciones clave: Responder SOLO en JSON válido conforme al schema. "
        "Si falta información, devolver 'missing_fields' con los campos."
        "\nSchema (por producto): {{"
        "\n  product_id: str,"
        "\n  action: 'REORDER'|'HOLD',"
        "\n  qty: int,"
        "\n  reasons: [str],"
        "\n  risk_expiry: 'LOW'|'MEDIUM'|'HIGH'"
        "\n}}"
        "\nEntrada:\n{payload}\n"
        "Salida JSON: {{ results: [schema_por_producto], missing_fields?: [str] }}"
    )
    return PromptVariant("fast-01", t)

def fast02_template() -> PromptVariant:
    t = (
        "Rol: Analista de inventario. Tarea: Sugerir reabastecimiento por lote."
        "\nReglas resumidas: "
        "1) Si stock < reorder_point → REORDER con qty=reorder_qty. "
        "2) Si vencimiento probable alto → HOLD o qty inferior, justificar. "
        "3) No inventes datos; si faltan, listar en 'missing_fields'."
        "\nSalida estricta: JSON con key 'results'."
        "\nEjemplo:"
        "\nEntrada: {{ products: [{{product_id:'X', current_stock:10, reorder_point:30, reorder_qty:50}}] }}"
        "\nSalida: {{ results: [{{product_id:'X', action:'REORDER', qty:50, reasons:['stock_bajo'], risk_expiry:'LOW'}}] }}"
        "\nEntrada:\n{payload}\n"
        "Salida:"
    )
    return PromptVariant("fast-02", t)
