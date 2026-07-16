const state = {
  sources: [],
  sourceMap: new Map(),
  leadsPagination: {
    limit: 20,
    offset: 0
  }
};

const elements = {
  healthBadge: document.getElementById("healthBadge"),
  leadsSourceFilter: document.getElementById("leadsSourceFilter"),
  leadsGenderFilter: document.getElementById("leadsGenderFilter"),
  leadsPageSize: document.getElementById("leadsPageSize"),
  prevLeads: document.getElementById("prevLeads"),
  nextLeads: document.getElementById("nextLeads"),
  leadsPageLabel: document.getElementById("leadsPageLabel"),
  refreshLeads: document.getElementById("refreshLeads"),
  leadsBody: document.getElementById("leadsBody"),
  leadsSegmentFilter: document.getElementById("leadsSegmentFilter"),
  btnNewSegment: document.getElementById("btnNewSegment"),
  segmentModal: document.getElementById("segmentModal"),
  segmentNameInput: document.getElementById("segmentNameInput"),
  segmentTermInput: document.getElementById("segmentTermInput"),
  btnCancelSegment: document.getElementById("btnCancelSegment"),
  btnSaveSegment: document.getElementById("btnSaveSegment"),
  segmentStatus: document.getElementById("segmentStatus")
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

function setHealth(ok, label) {
  elements.healthBadge.textContent = label;
  elements.healthBadge.style.color = ok ? "#2e8b57" : "#a93c3c";
}

async function loadHealth() {
  try {
    await requestJson("/health");
    setHealth(true, "API: online");
  } catch (error) {
    setHealth(false, "API: offline");
  }
}

function renderSegmentOptions() {
  const previousValue = elements.leadsSegmentFilter.value;
  elements.leadsSegmentFilter.innerHTML = '<option value="">Todos os Segmentos</option>';

  const uniqueAreas = Array.from(
    new Set(
      state.sources
        .map((source) => source.field_area)
        .filter(Boolean)
    )
  ).sort();

  for (const area of uniqueAreas) {
    const option = document.createElement("option");
    option.value = area;
    option.textContent = formatFieldArea(area);
    elements.leadsSegmentFilter.appendChild(option);
  }

  if (previousValue && uniqueAreas.includes(previousValue)) {
    elements.leadsSegmentFilter.value = previousValue;
  }
}

function renderSourceOptions() {
  const selectedSegment = elements.leadsSegmentFilter.value;
  elements.leadsSourceFilter.textContent = "";

  const API_MANUAL_SOURCE_NAME = "scraping-manual";

  const allOptionFilter = document.createElement("option");
  allOptionFilter.value = "";
  allOptionFilter.textContent = "Todas as fontes";
  elements.leadsSourceFilter.appendChild(allOptionFilter);

  const filteredSources = state.sources.filter((source) => {
    if (!source.is_active) return false;
    if (!selectedSegment) return true;
    return source.field_area === selectedSegment;
  });

  const orderedFilterSources = [...filteredSources].sort((a, b) => {
    if (a.name === API_MANUAL_SOURCE_NAME && b.name !== API_MANUAL_SOURCE_NAME) {
      return -1;
    }
    if (a.name !== API_MANUAL_SOURCE_NAME && b.name === API_MANUAL_SOURCE_NAME) {
      return 1;
    }
    return a.name.localeCompare(b.name, "pt-BR");
  });

  for (const source of orderedFilterSources) {
    const area = source.field_area;
    const label = `${source.name} [${formatFieldArea(area)}]`;

    const optionFilter = document.createElement("option");
    optionFilter.value = String(source.id);
    optionFilter.textContent = label;

    elements.leadsSourceFilter.appendChild(optionFilter);
  }
}

async function loadSources() {
  const payload = await requestJson("/api/sources");
  state.sources = payload.data || [];
  state.sourceMap = new Map(state.sources.map((source) => [source.id, source.name]));
  renderSegmentOptions();
  renderSourceOptions();
}

function formatTemperature(value) {
  const map = { cold: "Frio", warm: "Morno", hot: "Quente", lost: "Fora" };
  return map[value] || value || "-";
}

function formatFunnel(value) {
  const map = { top: "Topo", middle: "Meio", bottom: "Fundo", lost: "Perdido" };
  return map[value] || value || "-";
}

function renderLeads(rows) {
  elements.leadsBody.textContent = "";

  for (const row of rows) {
    const tr = document.createElement("tr");
    const values = [
      row.id,
      row.name,
      row.email,
      row.phone || "-",
      row.engagement_score ?? 0,
      formatTemperature(row.temperature),
      formatFunnel(row.funnel_stage),
      row.gender || "-",
      state.sourceMap.get(row.source_id) || `#${row.source_id}`,
      toLocalDate(row.created_at)
    ];

    for (const value of values) {
      const td = document.createElement("td");
      td.textContent = String(value ?? "-");
      tr.appendChild(td);
    }

    elements.leadsBody.appendChild(tr);
  }
}

async function loadLeads() {
  const segment = elements.leadsSegmentFilter.value;
  const sourceId = elements.leadsSourceFilter.value;
  const gender = elements.leadsGenderFilter.value;
  const qs = new URLSearchParams({
    limit: String(state.leadsPagination.limit),
    offset: String(state.leadsPagination.offset)
  });
  if (segment) {
    qs.set("field_area", segment);
  }
  if (sourceId) {
    qs.set("source_id", sourceId);
  }
  if (gender) {
    qs.set("gender", gender);
  }

  const payload = await requestJson(`/api/leads?${qs.toString()}`);
  const rows = payload.data || [];
  renderLeads(rows);

  const page = Math.floor(state.leadsPagination.offset / state.leadsPagination.limit) + 1;
  elements.leadsPageLabel.textContent = `Pagina ${page}`;
  elements.prevLeads.disabled = state.leadsPagination.offset === 0;
  elements.nextLeads.disabled = rows.length < state.leadsPagination.limit;
}

async function initialLoad() {
  try {
    elements.leadsPageSize.value = String(state.leadsPagination.limit);
    await loadHealth();
    await loadSources();
    await loadLeads();
  } catch (error) {
    console.error(`Erro inicial: ${error.message}`);
  }
}

elements.refreshLeads.addEventListener("click", () => {
  state.leadsPagination.offset = 0;
  loadLeads();
});
elements.prevLeads.addEventListener("click", () => {
  state.leadsPagination.offset = Math.max(0, state.leadsPagination.offset - state.leadsPagination.limit);
  loadLeads();
});
elements.nextLeads.addEventListener("click", () => {
  state.leadsPagination.offset += state.leadsPagination.limit;
  loadLeads();
});
elements.leadsSegmentFilter.addEventListener("change", () => {
  state.leadsPagination.offset = 0;
  elements.leadsSourceFilter.value = "";
  renderSourceOptions();
  loadLeads();
});
elements.leadsSourceFilter.addEventListener("change", () => {
  state.leadsPagination.offset = 0;
  loadLeads();
});
elements.leadsGenderFilter.addEventListener("change", () => {
  state.leadsPagination.offset = 0;
  loadLeads();
});
elements.leadsPageSize.addEventListener("change", () => {
  const selectedLimit = Number(elements.leadsPageSize.value);
  state.leadsPagination.limit = Number.isInteger(selectedLimit) && selectedLimit > 0 ? selectedLimit : 20;
  state.leadsPagination.offset = 0;
  loadLeads();
});

// Modal actions
elements.btnNewSegment.addEventListener("click", () => {
  elements.segmentModal.style.display = "flex";
  elements.segmentNameInput.value = "";
  elements.segmentTermInput.value = "";
  elements.segmentStatus.textContent = "";
});

elements.btnCancelSegment.addEventListener("click", () => {
  elements.segmentModal.style.display = "none";
});

elements.btnSaveSegment.addEventListener("click", async () => {
  const name = elements.segmentNameInput.value.trim();
  const term = elements.segmentTermInput.value.trim();

  if (!name || !term) {
    elements.segmentStatus.textContent = "Preencha todos os campos.";
    elements.segmentStatus.style.color = "#a93c3c";
    return;
  }

  elements.btnSaveSegment.disabled = true;
  elements.segmentStatus.textContent = "Criando...";
  elements.segmentStatus.style.color = "#0f7a6a";

  try {
    const res = await fetch("/api/sources/segment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, term })
    });
    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.message || "Erro ao criar segmento");
    }

    elements.segmentStatus.textContent = "Sucesso!";
    elements.segmentStatus.style.color = "#2e8b57";
    
    // Reload sources so the new segment shows up in the dropdown
    await loadSources();
    
    setTimeout(() => {
      elements.segmentModal.style.display = "none";
      elements.btnSaveSegment.disabled = false;
    }, 1500);
  } catch (error) {
    elements.segmentStatus.textContent = `Erro: ${error.message}`;
    elements.segmentStatus.style.color = "#a93c3c";
    elements.btnSaveSegment.disabled = false;
  }
});

initialLoad();
