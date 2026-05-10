const { loadConfig, runExplore } = require("../src/grafana");

runExplore(loadConfig()).catch((error) => {
  console.error(error);
  process.exit(1);
});
