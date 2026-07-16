const express = require("express");
const { listSources, createSources } = require("../repositories/sourceRepository");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const rawFieldArea = req.query.field_area ? String(req.query.field_area).toLowerCase() : null;
    const fieldArea = rawFieldArea; // Allow dynamic field areas

    const sources = await listSources({ fieldArea });
    res.json({ data: sources });
  } catch (error) {
    next(error);
  }
});

router.post("/segment", async (req, res, next) => {
  try {
    const segmentName = String(req.body.name || "").toLowerCase().trim();
    const searchTerm = String(req.body.term || "").trim();

    if (!segmentName || !searchTerm) {
      return res.status(400).json({ message: "O nome do segmento e o termo de pesquisa são obrigatórios." });
    }

    const capitals = [
      { id: "sp", name: "São Paulo" },
      { id: "rj", name: "Rio de Janeiro" },
      { id: "bh", name: "Belo Horizonte" },
      { id: "cwb", name: "Curitiba" },
      { id: "poa", name: "Porto Alegre" },
      { id: "ssa", name: "Salvador" },
      { id: "bsb", name: "Brasília" },
      { id: "for", name: "Fortaleza" },
      { id: "rec", name: "Recife" },
      { id: "gyn", name: "Goiânia" },
      { id: "mao", name: "Manaus" },
      { id: "bel", name: "Belém" },
      { id: "vix", name: "Vitória" },
      { id: "fln", name: "Florianópolis" },
      { id: "nat", name: "Natal" },
      { id: "slz", name: "São Luís" }
    ];

    const sources = [];

    // Gmaps sources
    for (const capital of capitals) {
      const termUrl = encodeURIComponent(searchTerm);
      const cityUrl = encodeURIComponent(capital.name);

      sources.push({
        name: `gmaps-${segmentName}-${capital.id}`,
        base_url: `https://www.google.com/maps/search/${termUrl}+em+${cityUrl}`,
        rate_limit_per_hour: 50,
        field_area: segmentName,
        notes: `Scraping de ${segmentName} via Google Maps em ${capital.name}`,
        is_active: true
      });
    }

    // WebSearch source
    const webSearchTerm = encodeURIComponent(searchTerm);
    sources.push({
      name: `websearch-${segmentName}`,
      base_url: `https://html.duckduckgo.com/html/?q=${webSearchTerm}`,
      rate_limit_per_hour: 60,
      field_area: segmentName,
      notes: `Scraping Web Amplo para o termo: ${searchTerm}`,
      is_active: true
    });

    await createSources(sources);

    res.status(201).json({ message: "Segmento e fontes criados com sucesso.", data: { segmentName, sourcesCount: sources.length } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
