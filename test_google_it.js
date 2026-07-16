const googleIt = require('google-it');

googleIt({ query: 'Clínica de Psicologia' })
  .then(results => {
    console.log("Google It Results:", results.length);
    console.log(results.slice(0, 2));
  }).catch(e => {
    console.error("Error:", e);
  });