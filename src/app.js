const express = require("express");
const path = require("path");
const helmet = require("helmet");
const pinoHttp = require("pino-http");
const logger = require("./config/logger");
const env = require("./config/env");
const leadsRoutes = require("./routes/leadsRoutes");
const executionRoutes = require("./routes/executionsRoutes");
const sourcesRoutes = require("./routes/sourcesRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const scrapeRoutes = require("./routes/scrapeRoutes");
const emailRoutes = require("./routes/emailRoutes");
const trackingRoutes = require("./routes/trackingRoutes");
const contactsRoutes = require("./routes/contactsRoutes");
const opsRoutes = require("./routes/opsRoutes");

function createApp() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          connectSrc: ["'self'", "https://cdn.jsdelivr.net"]
        },
      },
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "lead-scraper-backend" });
  });

  app.use("/api/leads", leadsRoutes);
  app.use("/api/executions", executionRoutes);
  app.use("/api/sources", sourcesRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/scrape", scrapeRoutes);
  app.use("/api/email", emailRoutes);
  app.use("/api/contacts", contactsRoutes);
  app.use("/api/ops", opsRoutes);
  app.use("/track", trackingRoutes);

  app.get("/panel/engajamento", (req, res) => {
    res.redirect(301, "/panel/engagement");
  });

  app.use("/panel", express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

  app.get("/", (req, res) => {
    res.redirect("/panel/");
  });

  app.use((err, req, res, next) => {
    req.log.error({ err }, "Unhandled error");
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || "Internal server error";
    res.status(statusCode).json({ message });
  });

  return app;
}

const app = createApp();

if (require.main === module) {
  const { initializeScrapeMaintenance } = require("./services/scrapeService");
  initializeScrapeMaintenance().catch((error) => {
    logger.error({ err: error }, "Failed to initialize scrape maintenance");
  });

  app.listen(env.appPort, () => {
    logger.info({ port: env.appPort }, "Server started");
  });
}

module.exports = app;
