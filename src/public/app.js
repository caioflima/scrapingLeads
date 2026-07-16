const state = {
  sources: [],
  sourceMap: new Map(),
  manualSourceId: null,
  selectedFieldArea: "",
  latestExecutions: [],
  executionPollTimer: null,
  executionsPagination: {
    limit: 20,
    offset: 0
  },
  runPanel: {
    isManualMode: false
  }
};

const elements = {
  healthBadge: document.getElementById("healthBadge"),
  runPanel: document.getElementById("runPanel"),
  fieldAreaSelect: document.getElementById("fieldAreaSelect"),
  sourceSelect: document.getElementById("sourceSelect"),
  runButton: document.getElementById("runButton"),
  toggleManualMode: document.getElementById("toggleManualMode"),
  runToken: document.getElementById("runToken"),
  runStatus: document.getElementById("runStatus"),
  manualUrl: document.getElementById("manualUrl"),
  manualFields: document.getElementById("manualFields"),
  manualConsent: document.getElementById("manualConsent"),
  manualRunButton: document.getElementById("manualRunButton"),
  manualBackToApi: document.getElementById("manualBackToApi"),
  manualStatus: document.getElementById("manualStatus"),
  executionsBody: document.getElementById("executionsBody"),
  prevExecutions: document.getElementById("prevExecutions"),
  nextExecutions: document.getElementById("nextExecutions"),
  executionsPageLabel: document.getElementById("executionsPageLabel"),
  refreshExecutions: document.getElementById("refreshExecutions"),
  metricTotalLeads: document.getElementById("metricTotalLeads"),
  metricRealEmail: document.getElementById("metricRealEmail"),
  metricEmailSub: document.getElementById("metricEmailSub"),
  metricFemaleLeads: document.getElementById("metricFemaleLeads"),
  metricMaleLeads: document.getElementById("metricMaleLeads"),
  metricActiveSources: document.getElementById("metricActiveSources"),
  metricCompleted: document.getElementById("metricCompleted")
};

function formatFieldArea(area) {
  const map = {
    politica: "Politica",
    manual: "Manual",
    economia: "Economia",
    demografia: "Demografia",
    educacao: "Educacao",
    energia: "Energia",
    engenharia: "Engenharia",
    lojas: "Lojas",
    shopping: "Shopping",
    odontologia: "Odontologia",
    veterinaria: "Veterinaria",
    cnpj: "CNPJ",
    saude: "Saude",
    juridico: "Juridico",
    financeiro: "Financeiro",
    inovacao: "Inovacao",
    governo: "Governo",
    transporte: "Transporte",
    rh_trabalho: "RH / Trabalho",
    consumidor: "Consumidor",
    alimentacao: "Alimentacao",
    hotelaria: "Hotelaria",
    esporte: "Esporte",
    imobiliario: "Imobiliario",
    religioso: "Religioso",
    tecnologia: "Tecnologia"
  };

  if (!area) {
    return "Sem area";
  }

  return map[area] || area;
}

function toLocalDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function hasRunningExecutions(rows = state.latestExecutions) {
  return rows.some((row) => row.status === "running");
}

function getRunningExecutions(rows = state.latestExecutions) {
  return rows.filter((row) => row.status === "running");
}

function updateRunStatusFromExecutions() {
  const running = getRunningExecutions();
  if (running.length === 0) {
    return false;
  }

  const labels = running.map((row) => {
    const sourceName = state.sourceMap.get(row.source_id) || `#${row.source_id}`;
    const progress = row.total_scraped > 0 ? ` (${row.total_scraped} coletados)` : "";
    return `${sourceName}${progress}`;
  });

  elements.runStatus.textContent = `Scraping em andamento: ${labels.join(", ")}`;
  elements.runStatus.style.color = "#0f7a6a";
  elements.runButton.disabled = true;
  return true;
}

function stopExecutionPolling() {
  if (state.executionPollTimer) {
    clearInterval(state.executionPollTimer);
    state.executionPollTimer = null;
  }
}

function startExecutionPolling() {
  if (state.executionPollTimer) {
    return;
  }

  state.executionPollTimer = setInterval(async () => {
    try {
      await Promise.all([loadExecutions(), loadSummary()]);

      if (!hasRunningExecutions()) {
        stopExecutionPolling();
        elements.runButton.disabled = false;
        elements.runStatus.textContent = "Scraping finalizado. Atualize a tabela abaixo.";
        elements.runStatus.style.color = "#2e8b57";
        return;
      }

      updateRunStatusFromExecutions();
    } catch (error) {
      elements.runStatus.textContent = `Erro ao acompanhar execucao: ${error.message}`;
      elements.runStatus.style.color = "#a93c3c";
    }
  }, 5000);
}

function setHealth(ok, label) {
  elements.healthBadge.textContent = label;
  elements.healthBadge.style.color = ok ? "#2e8b57" : "#a93c3c";
}

function setRunPanelMode(isManualMode) {
  state.runPanel.isManualMode = Boolean(isManualMode);
  elements.runPanel.classList.toggle("is-manual-mode", state.runPanel.isManualMode);
  elements.toggleManualMode.textContent = state.runPanel.isManualMode ? "Voltar ao Modo Padrao" : "Scraping Manual";

  if (state.runPanel.isManualMode) {
    elements.runStatus.textContent = "";
  } else {
    elements.manualStatus.textContent = "";
  }
}

async function loadHealth() {
  try {
    await requestJson("/health");
    setHealth(true, "API: online");
  } catch (error) {
    setHealth(false, "API: offline");
  }
}

function renderSourceOptions() {
  elements.sourceSelect.textContent = "";

  const API_MANUAL_SOURCE_NAME = "scraping-manual";

  const allOptionRun = document.createElement("option");
  allOptionRun.value = "";
  allOptionRun.textContent = "Todas as fontes ativas";
  elements.sourceSelect.appendChild(allOptionRun);

  const runSources = (state.selectedFieldArea
    ? state.sources.filter((source) => source.field_area === state.selectedFieldArea)
    : state.sources).filter((source) => source.name !== API_MANUAL_SOURCE_NAME && source.is_active);

  for (const source of runSources) {
    const area = source.field_area;
    const label = `${source.name} [${formatFieldArea(area)}]`;

    const optionRun = document.createElement("option");
    optionRun.value = String(source.id);
    optionRun.textContent = label;

    elements.sourceSelect.appendChild(optionRun);
  }
}

function renderFieldAreaOptions() {
  const previousValue = elements.fieldAreaSelect.value;
  elements.fieldAreaSelect.textContent = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "Todos os campos";
  elements.fieldAreaSelect.appendChild(allOption);

  const uniqueAreas = Array.from(
    new Set(state.sources.map((source) => source.field_area).filter(Boolean))
  ).sort();

  for (const area of uniqueAreas) {
    const option = document.createElement("option");
    option.value = area;
    option.textContent = formatFieldArea(area);
    elements.fieldAreaSelect.appendChild(option);
  }

  if (previousValue && uniqueAreas.includes(previousValue)) {
    elements.fieldAreaSelect.value = previousValue;
    state.selectedFieldArea = previousValue;
  } else {
    elements.fieldAreaSelect.value = "";
    state.selectedFieldArea = "";
  }
}

async function loadSources() {
  const payload = await requestJson("/api/sources");
  state.sources = payload.data || [];
  state.sourceMap = new Map(state.sources.map((source) => [source.id, source.name]));
  const manualSource = state.sources.find((source) => source.name === "scraping-manual");
  state.manualSourceId = manualSource ? manualSource.id : null;
  renderFieldAreaOptions();
  renderSourceOptions();
}

function renderExecutions(rows) {
  elements.executionsBody.textContent = "";

  for (const row of rows) {
    const tr = document.createElement("tr");

    const statusCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `badge ${row.status}`;
    badge.textContent = row.status;
    statusCell.appendChild(badge);

    const cells = [
      row.id,
      state.sourceMap.get(row.source_id) || `#${row.source_id}`,
      null,
      row.total_scraped,
      row.total_saved,
      row.duplicates_found,
      row.errors_count,
      toLocalDate(row.finished_at)
    ];

    cells.forEach((value, index) => {
      if (index === 2) {
        tr.appendChild(statusCell);
        return;
      }
      const td = document.createElement("td");
      td.textContent = String(value ?? "-");
      tr.appendChild(td);
    });

    elements.executionsBody.appendChild(tr);
  }
}

async function loadExecutions() {
  const qs = new URLSearchParams({
    limit: String(state.executionsPagination.limit),
    offset: String(state.executionsPagination.offset)
  });

  const payload = await requestJson(`/api/executions?${qs.toString()}`);
  const rows = payload.data || [];
  state.latestExecutions = rows;
  renderExecutions(rows);

  const page = Math.floor(state.executionsPagination.offset / state.executionsPagination.limit) + 1;
  elements.executionsPageLabel.textContent = `Pagina ${page}`;
  elements.prevExecutions.disabled = state.executionsPagination.offset === 0;
  elements.nextExecutions.disabled = rows.length < state.executionsPagination.limit;
}

async function loadSummary() {
  const payload = await requestJson("/api/dashboard/summary");
  const data = payload.data || {};

  elements.metricTotalLeads.textContent = String(data.totalLeads ?? 0);

  const email = data.emailBreakdown || {};
  const total = Number(data.totalLeads ?? 0);
  const real = Number(email.realEmail ?? 0);
  const placeholder = Number(email.placeholder ?? 0);
  const pct = total > 0 ? ((real / total) * 100).toFixed(1) : "0.0";

  elements.metricRealEmail.textContent = String(real);
  elements.metricEmailSub.textContent =
    `Placeholder: ${placeholder.toLocaleString("pt-BR")} · ${pct}% do total` +
    (real > 0
      ? ` · Campanhas: ${Number(email.emailSent ?? 0).toLocaleString("pt-BR")} enviados, ${Number(email.emailPending ?? 0).toLocaleString("pt-BR")} na fila`
      : "");

  elements.metricFemaleLeads.textContent = String(data.femaleLeads ?? 0);
  elements.metricMaleLeads.textContent = String(data.maleLeads ?? 0);
  elements.metricActiveSources.textContent = String(data.activeSources ?? 0);
  elements.metricCompleted.textContent = String(data.statuses?.completed ?? 0);
}

async function runScraping() {
  elements.runButton.disabled = true;
  elements.runStatus.textContent = "Iniciando scraping...";
  elements.runStatus.style.color = "#0f7a6a";

  try {
    const sourceId = elements.sourceSelect.value;
    const fieldArea = elements.fieldAreaSelect.value;
    const token = elements.runToken.value.trim();

    await requestJson("/api/scrape/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-panel-token": token } : {})
      },
      body: JSON.stringify({ 
        sourceId: sourceId || null,
        fieldArea: fieldArea || null
      })
    });

    let statusText = "Scraping iniciado em background para todas as fontes ativas. Pode levar bastante tempo.";
    if (sourceId) {
      statusText = "Scraping iniciado em background para a fonte selecionada.";
    } else if (fieldArea) {
      statusText = `Scraping iniciado em background para o segmento: ${fieldArea}.`;
    }

    elements.runStatus.textContent = statusText;
    elements.runStatus.style.color = "#0f7a6a";

    await loadExecutions();
    updateRunStatusFromExecutions();
    startExecutionPolling();
  } catch (error) {
    if (error.status === 409) {
      elements.runStatus.textContent = error.message || "Ja existe um scraping em andamento.";
      elements.runStatus.style.color = "#b8860b";
      await loadExecutions();
      updateRunStatusFromExecutions();
      startExecutionPolling();
      return;
    }

    elements.runStatus.textContent = `Falha: ${error.message}`;
    elements.runStatus.style.color = "#a93c3c";
    elements.runButton.disabled = false;
  }
}

function getSelectedManualFields() {
  const checkboxes = elements.manualFields.querySelectorAll('input[type="checkbox"]');
  const selected = [];
  for (const checkbox of checkboxes) {
    if (checkbox.checked) {
      selected.push(checkbox.value);
    }
  }
  return selected;
}

async function runManualScraping() {
  elements.manualRunButton.disabled = true;
  elements.manualStatus.textContent = "Executando scraping manual...";
  elements.manualStatus.style.color = "#0f7a6a";

  try {
    const token = elements.runToken.value.trim();
    const url = elements.manualUrl.value.trim();
    const fields = getSelectedManualFields();
    const consent = elements.manualConsent.checked;

    if (!url) {
      throw new Error("Informe uma URL valida.");
    }

    if (fields.length === 0) {
      throw new Error("Selecione pelo menos um campo para extracao.");
    }

    if (!consent) {
      throw new Error("Confirme o consentimento LGPD para salvar em Leads.");
    }

    const payload = await requestJson("/api/scrape/manual", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-panel-token": token } : {})
      },
      body: JSON.stringify({
        url,
        fields,
        consent,
        fetchAll: true
      })
    });

    const resultData = payload.data || {};
    const counts = resultData.counts || {};
    const persisted = resultData.persist?.result?.counters;
    const warnings = resultData.persist?.result?.warnings || [];
    const totalExtracted = Math.max(0, ...Object.values(counts));

    const persistSummary = persisted
      ? `salvos=${persisted.saved}, duplicados=${persisted.duplicates}, erros=${persisted.errors}`
      : "salvos=0, duplicados=0, erros=0";
    const warningSummary = warnings.length > 0 ? ` | avisos: ${warnings.join(" | ")}` : "";

    elements.manualStatus.textContent = `Finalizado (extraidos=${totalExtracted}, ${persistSummary})${warningSummary}`;
    elements.manualStatus.style.color = "#2e8b57";

    await loadSummary();
  } catch (error) {
    elements.manualStatus.textContent = `Falha: ${error.message}`;
    elements.manualStatus.style.color = "#a93c3c";
  } finally {
    elements.manualRunButton.disabled = false;
  }
}

async function initialLoad() {
  try {
    await loadHealth();
    await loadSources();
    await Promise.all([loadSummary(), loadExecutions()]);

    if (hasRunningExecutions()) {
      updateRunStatusFromExecutions();
      startExecutionPolling();
    }
  } catch (error) {
    elements.runStatus.textContent = `Erro inicial: ${error.message}`;
    elements.runStatus.style.color = "#a93c3c";
  }
}

elements.runButton.addEventListener("click", runScraping);
elements.toggleManualMode.addEventListener("click", () => {
  setRunPanelMode(!state.runPanel.isManualMode);
});
elements.manualBackToApi.addEventListener("click", () => {
  setRunPanelMode(false);
});
elements.manualRunButton.addEventListener("click", runManualScraping);
elements.refreshExecutions.addEventListener("click", () => {
  state.executionsPagination.offset = 0;
  loadExecutions();
});
elements.prevExecutions.addEventListener("click", () => {
  state.executionsPagination.offset = Math.max(0, state.executionsPagination.offset - state.executionsPagination.limit);
  loadExecutions();
});
elements.nextExecutions.addEventListener("click", () => {
  state.executionsPagination.offset += state.executionsPagination.limit;
  loadExecutions();
});
elements.fieldAreaSelect.addEventListener("change", () => {
  state.selectedFieldArea = elements.fieldAreaSelect.value;
  renderSourceOptions();
});

setRunPanelMode(false);

setInterval(() => {
  if (!state.executionPollTimer) {
    loadExecutions();
    loadSummary();
  }
}, 20000);

initialLoad();
