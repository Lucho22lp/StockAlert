# StockAlert · Fast Prompting POC

> **Entrega 2 – Generación de Prompts · POC en Jupyter Notebook**  
> Autor: Luciano Puglisi  
> Fecha: 2025-09-09

## Introducción
**Nombre del proyecto:** StockAlert

**Problema:** El control de stock en pymes y empresas es complejo: hay productos con **vencimiento**, **estacionalidad** y **variación de ventas**. Esto genera errores (sobrestock, faltantes, envíos vencidos) y costos innecesarios.

**Relevancia:** Un balance adecuado de stock reduce pérdidas por vencimiento y evita quiebres. Además, mejora el capital de trabajo y la satisfacción del cliente.

## Propuesta de solución
StockAlert utiliza **IA asistida por técnicas de Fast Prompting** para:
- Detectar riesgos de **vencimiento** y **sobrestock**.
- Identificar **ventanas de alta/ baja demanda** por producto.
- Sugerir **pedidos a proveedores** (cuánto y cuándo).
- Responder en **formato estructurado (JSON)** apto para integraciones.

La solución se vincula a IA mediante **prompts optimizados** (compactos, con rol/tarea/criterios/estructura) para reducir tokens, aumentar precisión y **minimizar llamadas a la API** (rentabilidad).

## Prompts (a implementar y probar en la Notebook)
- **Baseline:** descripción amplia sin estructura fija.
- **Fast-01 (BREVITY + SCHEMA):** rol + tarea + contexto mínimo + JSON schema + validación.
- **Fast-02 (FEW-SHOT + CONSTRAINTS):** 2 ejemplos + restricciones claras + salida estricta.
- **Fast-03 (SELF-CHECK):** una sola llamada con autoverificación compacta (sin cadena de pensamiento).

## Viabilidad técnica
- **Tiempo:** Diseñado para implementarse en 1–2 semanas.
- **Costos:** Se minimizan mediante batching, prompts breves y **1 sola llamada por sku-batch**.
- **Datos:** CSV simples (ventas históricas, stock, parámetros). Fácil de extender a una base real.
- **Riesgos/mitigaciones:**
  - Datos incompletos → prompt pide “missing_fields”.
  - Alucinaciones → estructura JSON con campos obligatorios.
  - Costos → consolidar múltiples SKUs por llamada, caché de resultados.

## Objetivos
1. Probar si técnicas de **Fast Prompting** mejoran contra un baseline en:
   - Precisión estructural (validez JSON).
   - Consistencia de sugerencias vs. heurísticas simples.
   - N° de llamadas (proxy de costo).
2. Entregar una **POC reproducible** en Notebook.
3. Dejar listo para **GitHub público**.

## Metodología
- Dataset sintético + funciones heurísticas para “ground truth” aproximada.
- Tres configuraciones de prompt (Baseline, Fast-01, Fast-02/03).
- Métricas:
  - **Validez de formato** (JSON parseable).
  - **Aciertos** de “reordenar o no” vs. heurística.
  - **Costo estimado**: nº de llamadas + tamaño del prompt (proxy).

## Herramientas y tecnologías
- **Jupyter Notebook** (Python 3.10+)
- **Pandas**, **matplotlib**
- **Fast Prompting**: rol/tarea, delimitadores, JSON schema, few-shot, pedida de faltantes, autoverificación minimal.
- **Mock LLM** (offline) y _hook_ para integrar OpenAI u otro proveedor si se desea.

## Implementación
Consultar `notebooks/StockAlert_FastPrompting_POC.ipynb`.  
Incluye:
- Carga de CSV.
- Construcción de prompts (3 variantes).
- Runner con **mock** (offline) y modo **API** (comentado).
- Experimentos y gráficos.
- Conclusiones y próximos pasos.

---

## Cómo ejecutar
1. Clonar este repo.
2. Abrir `notebooks/StockAlert_FastPrompting_POC.ipynb` en Jupyter/VSCode.
3. Ejecutar todas las celdas. Funciona **sin API** (mock).  
4. (Opcional) Integrar API: descomentar la celda “Integración con proveedor LLM” y setear `OPENAI_API_KEY`.

## Costos y optimización (resumen)
- Procesar **varios SKUs en una sola llamada**.
- **Prompts cortos y con JSON schema** → menos tokens de ida y vuelta.
- **Evitar re-llamadas**: cache simple por hash de batch + fecha.
- **Self-check** embebido para reducir rondas extra.

## Licencia
MIT
