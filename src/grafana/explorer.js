const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const {
  buildDashboardUrl,
  countFrames,
  ensureDir,
  hasGrafanaFrames,
  isLikelyDataRequest,
  loadConfig,
  safePostData,
  toDate,
} = require("./common");

async function runExplore(inputConfig = loadConfig()) {
  const config = { ...inputConfig };
  const outDir = path.join(config.outDir, "discovery");
  ensureDir(outDir);

  const start = toDate(config.startDate, "startDate");
  const end = toDate(config.endDate, "endDate");
  const url = buildDashboardUrl(config.dashboardUrl, start, end, config.timezone);

  const browser = await chromium.launch({ headless: config.headless });
  const contextOptions = {};
  if (config.authStateFile) contextOptions.storageState = config.authStateFile;
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  const records = [];
  let sampleWritten = 0;

  page.on("response", async (response) => {
    const request = response.request();
    const responseUrl = response.url();
    const contentType = response.headers()["content-type"] || "";

    if (!isLikelyDataRequest(request, responseUrl) && !contentType.includes("json")) {
      return;
    }

    const record = {
      method: request.method(),
      url: responseUrl,
      status: response.status(),
      contentType,
      requestHeaders: request.headers(),
      requestPostData: safePostData(request),
      hasFrames: false,
      frameCount: 0,
      rowCount: 0,
      sampleFile: null,
    };

    try {
      if (contentType.includes("json")) {
        const body = await response.json();
        record.hasFrames = hasGrafanaFrames(body);
        const counts = countFrames(body);
        record.frameCount = counts.frames;
        record.rowCount = counts.rows;

        if (record.hasFrames && sampleWritten < 5) {
          sampleWritten += 1;
          record.sampleFile = `sample-response-${sampleWritten}.json`;
          fs.writeFileSync(
            path.join(outDir, record.sampleFile),
            JSON.stringify(body, null, 2)
          );
        }
      }
    } catch (error) {
      record.readError = error.message;
    }

    records.push(record);
    console.log(
      `${record.method} ${record.status} ${record.url} frames=${record.frameCount} rows=${record.rowCount}`
    );
  });

  console.log(`Abriendo: ${url}`);
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: config.navigationTimeoutMs,
  });
  await page.waitForTimeout(config.postLoadWaitMs);
  await waitForQuietPeriod(() => records.length, config.quietPeriodMs);

  const outputFile = path.join(outDir, "requests.json");
  fs.writeFileSync(
    outputFile,
    JSON.stringify(
      {
        dashboardUrl: url,
        startedAt: new Date().toISOString(),
        records,
      },
      null,
      2
    )
  );

  await browser.close();
  console.log(`Listo: ${outputFile}`);
}

async function waitForQuietPeriod(getCount, quietPeriodMs) {
  let lastCount = getCount();
  let lastChangeAt = Date.now();

  while (Date.now() - lastChangeAt < quietPeriodMs) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const currentCount = getCount();
    if (currentCount !== lastCount) {
      lastCount = currentCount;
      lastChangeAt = Date.now();
    }
  }
}

module.exports = {
  runExplore,
  waitForQuietPeriod,
};
