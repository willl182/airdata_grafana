const { loadConfig, runDownload } = require("../src/grafana");

runDownload(loadConfig()).catch((error) => {
  console.error(error);
  process.exit(1);
});
