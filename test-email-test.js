const { sendTestEmail } = require('./src/services/emailService.js');
async function run() {
  try {
    await sendTestEmail({
      toEmail: "social@limaenterprise.com.br",
      subject: "test",
      template: "test"
    });
    console.log("Success");
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
