// ========================================================
// StockAlert · Robot con Gemini (Fast Prompting + Poster)
// ========================================================

// ⚠️ PONÉ TU API KEY REAL DE GEMINI ACÁ:
const GEMINI_API_KEY = "AIzaSyBvLSpX4wOnBmlBROUjG6Q9fOovM-mjvec";

// --- Gemini (ESM) ---
let genAI = null, model = null;

async function setupGemini() {
  if (model) return; // ya inicializado
  const { GoogleGenerativeAI } = await import("https://esm.run/@google/generative-ai");
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
}

async function callGemini(promptText) {
  const res = await model.generateContent(promptText);
  const txt = res.response.text();
  return JSON.parse(txt);
}

// --- Helpers UI / misc ---
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ========================================================
// Datos
// ========================================================
async function fetchProducts() {
  // Reemplazá por tu endpoint si querés traer de tu página:
  const res = await fetch("./products.json");
  if (!res.ok) throw new Error("No pude cargar products.json");
  return res.json();
}

function renderProductsTable(products) {
  const table = $("#productsTable");
  table.innerHTML = `
    <thead><tr>
      <th>ID</th><th>Nombre</th><th>Stock</th><th>RP</th><th>RQ</th><th>Vida(d)</th><th>Avg7d</th>
    </tr></thead>
    <tbody>
      ${products.map(p => `
        <tr>
          <td>${p.product_id}</td><td>${p.name}</td>
          <td>${p.current_stock}</td><td>${p.reorder_point}</td><td>${p.reorder_qty}</td>
          <td>${p.shelf_life_days}</td><td>${p.avg_7d ?? "-"}</td>
        </tr>
      `).join("")}
    </tbody>
  `;
  $("#productsInfo").textContent = `${products.length} productos cargados`;
}

// ========================================================
/** Prompts: baseline / fast-01 / fast-02 */
// ========================================================
function promptBaseline(payload) {
  return `
Eres un analista de inventario. Devuelve recomendaciones por producto en JSON (REORDER/HOLD, qty, reasons, risk_expiry).
Entrada:
${JSON.stringify(payload)}
Salida: JSON.
`.trim();
}

function promptFast01(payload) {
  return `
Rol: Analista de inventario experto. Tarea: Evaluar lote y sugerir reabastecimiento.
Responder SOLO en JSON válido según schema. Si falta info, incluir "missing_fields".
Schema por producto: {
  product_id: string,
  action: "REORDER"|"HOLD",
  qty: number,
  reasons: string[],
  risk_expiry: "LOW"|"MEDIUM"|"HIGH"
}
Entrada:
${JSON.stringify(payload)}
Salida JSON:
{ "results": [<schema_por_producto>], "missing_fields": string[] }
`.trim();
}

function promptFast02(payload) {
  return `
Rol: Analista de inventario. Reglas:
1) Si current_stock < reorder_point → action=REORDER, qty=reorder_qty.
2) Si shelf_life_days <= 20 y avg_7d < 10 → riesgo ALTO → HOLD o qty menor (justificar).
3) No inventes datos; si faltan, lista "missing_fields".

Ejemplo:
Entrada: {"products":[{"product_id":"X","current_stock":10,"reorder_point":30,"reorder_qty":50}]}
Salida:  {"results":[{"product_id":"X","action":"REORDER","qty":50,"reasons":["stock_bajo"],"risk_expiry":"LOW"}]}

Entrada:
${JSON.stringify(payload)}
Salida (JSON estricto con key "results"):
`.trim();
}

function buildPrompt(variant, payload) {
  if (variant === "fast01") return promptFast01(payload);
  if (variant === "fast02") return promptFast02(payload);
  return promptBaseline(payload);
}

// ========================================================
/** Mock LLM (para test sin API) */
// ========================================================
function simpleHeuristic(p) {
  if (p.current_stock < p.reorder_point) {
    let risk = "LOW";
    if (p.shelf_life_days <= 20 && (p.avg_7d ?? 0) < 10) risk = "HIGH";
    if (risk === "HIGH") {
      return { product_id: p.product_id, action: "HOLD", qty: 0, reasons: ["riesgo_vencimiento"], risk_expiry: "HIGH" };
    }
    return { product_id: p.product_id, action: "REORDER", qty: p.reorder_qty, reasons: ["stock_bajo"], risk_expiry: risk };
  }
  return { product_id: p.product_id, action: "HOLD", qty: 0, reasons: ["stock_suficiente"], risk_expiry: "LOW" };
}

async function mockLLM(batch) {
  return { results: batch.products.map(simpleHeuristic) };
}

// ========================================================
/** UI: render de tarjetas y utilidades */
// ========================================================
function renderCards(rows) {
  let grid = document.getElementById("cards");
  if (!grid) {
    // Crear el contenedor si no existe (fallback)
    const section = document.createElement("section");
    section.className = "card";
    const h3 = document.createElement("h3");
    h3.textContent = "Resultados";
    const stats = document.getElementById("stats") || document.createElement("div");
    stats.id = stats.id || "stats";
    stats.className = stats.className || "muted";
    if (!stats.textContent) stats.textContent = "Resultados generados.";

    grid = document.createElement("div");
    grid.id = "cards";
    grid.className = "grid";

    section.appendChild(h3);
    section.appendChild(stats);
    section.appendChild(grid);
    document.body.appendChild(section);
  }

  grid.innerHTML = rows.map(r => {
    const cls = r.action === "REORDER" ? "ok" : (r.risk_expiry === "HIGH" ? "bad" : "warn");
    return `
      <div class="card">
        <div><strong>${r.product_id}</strong> <span class="${cls}">${r.action}</span></div>
        <div>Cantidad: <strong>${r.qty}</strong></div>
        <div>Riesgo vencimiento: ${r.risk_expiry}</div>
        <div>Motivos: <small>${(r.reasons||[]).join(", ")}</small></div>
      </div>
    `;
  }).join("");
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ========================================================
/** Generador de prompt de cartel (texto→imagen) */
// ========================================================
function summarizeResultsForPoster(rows){
  const reorder = rows.filter(r => r.action === "REORDER");
  const highRisk = rows.filter(r => r.risk_expiry === "HIGH");
  const mediumRisk = rows.filter(r => r.risk_expiry === "MEDIUM");
  const lowRisk = rows.filter(r => r.risk_expiry === "LOW");
  const priorityList = rows.slice().sort((a,b)=>{
    const score = (x)=> (x.action==="REORDER"?2:0) + (x.risk_expiry==="HIGH"?2: x.risk_expiry==="MEDIUM"?1:0);
    return score(b)-score(a);
  }).slice(0,5);
  return {
    reorderIds: reorder.map(r=>r.product_id),
    highRiskIds: highRisk.map(r=>r.product_id),
    mediumRiskIds: mediumRisk.map(r=>r.product_id),
    lowRiskCount: lowRisk.length,
    priorityList
  };
}

function buildPosterPrompt(rows){
  if(!rows || rows.length===0){
    return `Poster operativo — "ALERTA DE STOCK"
Estilo minimal, legible, A4 vertical, tipografía sans-serif, íconos simples (reloj/caducidad, caja/stock).
Paleta: Rojo=ALTO, Naranja=MEDIO, Verde=BAJO.
Contenido:
- Título: "ALERTA DE STOCK"
- Subtítulo: "Priorizar productos con riesgo de vencimiento y reposición"
- Leyenda de colores
- Recuadro punteado para SKUs críticos
Recordatorio: "Reordenar si stock < punto de repedido"`;
  }
  const s = summarizeResultsForPoster(rows);
  const topLines = s.priorityList.map(r => `• ${r.product_id}: ${r.action} ${r.qty} (riesgo ${r.risk_expiry})`).join("\n");
  return `Poster operativo — "ALERTA DE STOCK"
Objetivo: resaltar SKUs críticos para reposición y vencimientos.
Estilo: minimal, legible, A4 vertical, fondo claro, tipografía sans-serif, íconos simples.
Paleta: Rojo=ALTO, Naranja=MEDIO, Verde=BAJO.

Contenido textual:
- Título: "ALERTA DE STOCK"
- Subtítulo: "Priorizar productos con riesgo y reposición"
- Bloques:
  • Rojo (ALTO) — SKUs: ${s.highRiskIds.slice(0,8).join(", ") || "ninguno"}.
  • Naranja (MEDIO) — SKUs: ${s.mediumRiskIds.slice(0,8).join(", ") || "ninguno"}.
  • Verde (BAJO) — aprox. ${s.lowRiskCount} SKUs.
- Reposición (REORDER): ${s.reorderIds.slice(0,10).join(", ") || "ninguno"}.
- Lista de prioridad (máx 5):
${topLines || "• (sin elementos)"}
- Recordatorio: "Reordenar si stock < punto de repedido"

Diseño:
- Tres bloques de color (rojo/naranja/verde) y recuadro punteado para SKUs críticos.

Salida:
- Imagen nítida apta impresión A4 vertical.`;
}

async function refinePosterWithGemini(text){
  try{
    await setupGemini(); // usa tu API key fija
    const refinePrompt = `Mejora y compacta este prompt para generar un póster (NightCafe u otro).
Mantén: estilo minimal, A4 vertical, y la semántica Rojo=ALTO, Naranja=MEDIO, Verde=BAJO.
Devuelve SOLO el prompt final, sin explicaciones:
${text}`;
    const res = await model.generateContent(refinePrompt);
    const out = (res.response && res.response.text && res.response.text()) ? res.response.text().trim() : "";
    return out || text;
  }catch{
    return text; // si falla Gemini, devolvemos el base
  }
}

async function onGeneratePosterPrompt(){
  const area = document.getElementById("posterPrompt");
  if (!area) {
    console.warn('No se encontró <textarea id="posterPrompt">. Verificá el HTML.');
    // Evitamos romper la app y mostramos el prompt por consola
    const fallback = buildPosterPrompt(LAST_RESULTS || []);
    console.log("Poster prompt:", fallback);
    const stats = document.getElementById("stats");
    if (stats) stats.textContent = "No se encontró el textarea. Revisá el HTML (id='posterPrompt').";
    return;
  }

  try {
    const base = buildPosterPrompt(LAST_RESULTS || []);
    // Si no querés usar Gemini para refinar, usá directamente: const finalText = base;
    const finalText = await refinePosterWithGemini(base);
    area.value = finalText;

    try {
      await navigator.clipboard.writeText(finalText);
      const stats = document.getElementById("stats");
      if (stats) stats.textContent = "Prompt de cartel generado y copiado al portapapeles.";
    } catch {
      const stats = document.getElementById("stats");
      if (stats) stats.textContent = "Prompt generado. Copialo manualmente del recuadro.";
    }
  } catch (err) {
    console.error(err);
    area.value = "Error generando el prompt. Revisá la consola (F12).";
    const stats = document.getElementById("stats");
    if (stats) stats.textContent = "Error generando el prompt de cartel.";
  }
}

// ========================================================
/** Flujo principal */
// ========================================================
let PRODUCTS = [];
let LAST_RESULTS = [];

// Helper para obtener elementos con mensaje claro si faltan
function el(id, required = true) {
  const node = document.getElementById(id);
  if (!node && required) {
    throw new Error(`Falta el elemento #${id} en index.html`);
  }
  return node;
}

// Reemplazá tu función run() por esta
async function run() {
  // Toma de elementos (con checks)
  const variantEl = el("variant");
  const batchEl   = el("batchSize");
  const mockEl    = el("mockMode");          // checkbox
  const previewEl = el("promptPreview", false); // opcional
  const statsEl   = el("stats", false);         // opcional

  // Lectura segura de valores
  const variant   = variantEl.value || "fast01";
  const batchSize = Math.max(1, parseInt(batchEl.value || "10", 10));
  const mock      = !!(mockEl && mockEl.checked);

  if (statsEl) statsEl.textContent = "Procesando...";
  LAST_RESULTS = [];

  if (!mock) {
    try { await setupGemini(); }
    catch (e) { if (statsEl) statsEl.textContent = "Error al iniciar Gemini: " + e.message; return; }
  }

  const batches = chunk(PRODUCTS, batchSize);
  let totalCalls = 0;
  let totalPromptChars = 0;

  for (const b of batches) {
    const payload = { products: b };
    const prompt = buildPrompt(variant, payload);

    if (previewEl) previewEl.value = prompt;

    totalCalls++;
    totalPromptChars += prompt.length;

    let out;
    try {
      out = mock ? await mockLLM(payload) : await callGemini(prompt);
    } catch (e) {
      if (statsEl) statsEl.textContent = "Error en llamada: " + e.message;
      return;
    }

    if (out && Array.isArray(out.results)) LAST_RESULTS.push(...out.results);
  }

  renderCards(LAST_RESULTS);
  if (statsEl) statsEl.textContent =
    `Listo. Llamadas: ${totalCalls} · Prompt avg: ${Math.round(totalPromptChars/totalCalls)} chars · Items: ${LAST_RESULTS.length}`;
}

async function bootstrap() {
  try {
    PRODUCTS = await fetchProducts();
    renderProductsTable(PRODUCTS);
    $("#stats").textContent = "Listo para ejecutar.";
  } catch (e) {
    $("#productsInfo").textContent = "Error cargando productos: " + e.message;
  }
}

const runBtn = document.getElementById("runBtn");
if (runBtn) runBtn.addEventListener("click", run);

const posterBtn = document.getElementById("genPosterBtn");
if (posterBtn) posterBtn.addEventListener("click", onGeneratePosterPrompt);

bootstrap();

