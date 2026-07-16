const request = require("supertest");
const axios = require("axios");

jest.mock("axios");

jest.mock("../../src/database/knex", () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn().mockResolvedValue([1]),
    update: jest.fn().mockResolvedValue(1)
  };

  const db = jest.fn(() => chain);
  db.transaction = jest.fn(async (handler) => handler(jest.fn()));
  db.__chain = chain;
  db.fn = { now: jest.fn() };

  return db;
});

jest.mock("../../src/repositories/leadRepository", () => ({
  findLeadByEmailAndSource: jest.fn(),
  findLeadByFullIdentity: jest.fn(),
  insertLead: jest.fn()
}));

const db = require("../../src/database/knex");
const { findLeadByEmailAndSource, findLeadByFullIdentity, insertLead } = require("../../src/repositories/leadRepository");
const app = require("../../src/app");

describe("POST /api/scrape/manual", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.__chain.first.mockResolvedValue({ id: 2, is_active: 1 });
  });

  it("returns paginated preview when many results are extracted", async () => {
    const manyEmails = Array.from({ length: 35 }, (_, idx) => `pessoa${idx + 1}@dominio.com`).join(" ");
    axios.get.mockResolvedValue({
      data: `<html><body><h1>Empresa Exemplo</h1>${manyEmails}</body></html>`
    });

    const response = await request(app)
      .post("/api/scrape/manual")
      .send({
        url: "https://example.com",
        fields: ["nome", "email"],
        consent: true,
        page: 2,
        pageSize: 10,
        fetchAll: false
      });

    expect(response.status).toBe(200);
    expect(response.body.data.counts.email).toBe(35);
    expect(response.body.data.extracted.email).toHaveLength(10);
    expect(response.body.data.pagination.page).toBe(2);
    expect(response.body.data.pagination.totalPages).toBe(4);
  });

  it("persists leads when persist=true with valid LGPD consent", async () => {
    axios.get.mockResolvedValue({
      data: "<html><body><h1>Lead Teste</h1>ana@dominio.com (11) 98888-0000 bia@dominio.com</body></html>"
    });

    findLeadByFullIdentity.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 99 });
    insertLead.mockResolvedValue({ id: 10 });

    const response = await request(app)
      .post("/api/scrape/manual")
      .send({
        url: "https://example.com",
        fields: ["nome", "email", "telefone"],
        persist: true,
        consent: true,
        sourceId: 2
      });

    expect(response.status).toBe(200);
    expect(response.body.data.persist.enabled).toBe(true);
    expect(response.body.data.persist.result.counters.saved).toBe(1);
    expect(response.body.data.persist.result.counters.duplicates).toBe(1);
    expect(db).toHaveBeenCalledWith("lead_sources");
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects persistence without LGPD consent", async () => {
    const response = await request(app)
      .post("/api/scrape/manual")
      .send({
        url: "https://example.com",
        fields: ["nome", "email"],
        persist: true,
        consent: false,
        sourceId: 2
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/LGPD consent/i);
    expect(axios.get).not.toHaveBeenCalled();
  });
});
