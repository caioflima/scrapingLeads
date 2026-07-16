const { runEmailCampaign } = require('./src/services/emailService.js');
async function run() {
  try {
    await runEmailCampaign({
      subject: "test",
      template: "test"
    });
    console.log("Success");
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
