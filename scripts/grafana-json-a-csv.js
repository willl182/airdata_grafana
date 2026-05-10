const { loadConfig, runCsv } = require("../src/grafana");

try {
  runCsv(loadConfig());
} catch (error) {
  console.error(error);
  process.exit(1);
}
