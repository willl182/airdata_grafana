const { runJob } = require("../src/grafana");

const jobPath = process.env.JOB || process.argv.slice(2).find((arg) => arg !== "--");

runJob(jobPath).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
