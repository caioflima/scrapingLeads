jest.mock("../../src/database/knex", () => {
  const chain = { select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), first: jest.fn(), whereIn: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), update: jest.fn() };
  const db = jest.fn(() => chain);
  return db;
});

const {
  computeScore,
  deriveTemperature,
  deriveFunnelStage,
  deriveNextAction,
  buildEngagementFromSignals
} = require("../../src/services/leadScoringService");

describe("leadScoringService", () => {
  it("scores cold lead at zero", () => {
    const signals = {
      isActive: true,
      emailUnsubscribed: false,
      contacted: false,
      emailsSent: 0,
      opensBySend: {},
      clickTypes: [],
      totalOpens: 0,
      totalClicks: 0,
      hasWhatsappClick: false,
      hasScheduleClick: false,
      deepCold: false,
      lastEngagementAt: null
    };
    expect(computeScore(signals)).toBe(0);
    expect(deriveTemperature(0, false)).toBe("cold");
  });

  it("scores whatsapp click as warm or hot", () => {
    const signals = {
      isActive: true,
      emailUnsubscribed: false,
      contacted: false,
      emailsSent: 1,
      opensBySend: { 1: 1 },
      clickTypes: ["whatsapp"],
      totalOpens: 1,
      totalClicks: 1,
      hasWhatsappClick: true,
      hasScheduleClick: false,
      deepCold: false,
      lastEngagementAt: null
    };
    const score = computeScore(signals);
    expect(score).toBe(4);
    expect(deriveTemperature(score, false)).toBe("warm");
  });

  it("scores schedule click as hot", () => {
    const signals = {
      isActive: true,
      emailUnsubscribed: false,
      contacted: false,
      emailsSent: 1,
      opensBySend: { 1: 1 },
      clickTypes: ["schedule"],
      totalOpens: 1,
      totalClicks: 1,
      hasWhatsappClick: false,
      hasScheduleClick: true,
      deepCold: false,
      lastEngagementAt: null
    };
    const score = computeScore(signals);
    expect(score).toBeGreaterThanOrEqual(5);
    expect(deriveTemperature(score, false)).toBe("hot");
  });

  it("marks unsubscribed as lost", () => {
    const engagement = buildEngagementFromSignals({
      isActive: true,
      emailUnsubscribed: true,
      contacted: false,
      emailsSent: 1,
      opensBySend: {},
      clickTypes: [],
      totalOpens: 0,
      totalClicks: 0,
      hasWhatsappClick: false,
      hasScheduleClick: false,
      deepCold: false,
      lastEngagementAt: null
    });
    expect(engagement.engagement_score).toBe(-100);
    expect(engagement.temperature).toBe("lost");
    expect(engagement.funnel_stage).toBe("lost");
  });

  it("suggests urgent whatsapp for hot bottom funnel", () => {
    const action = deriveNextAction({
      isActive: true,
      temperature: "hot",
      funnelStage: "bottom",
      emailUnsubscribed: false,
      emailsSent: 2,
      opens: 2,
      clicks: 1,
      contacted: false,
      deepCold: false
    });
    expect(action).toMatch(/WhatsApp urgente/i);
  });
});
