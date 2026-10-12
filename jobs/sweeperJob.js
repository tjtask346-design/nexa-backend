// jobs/sweeperJob.js
const sweeperService = require('../services/sweeperService');

let timer = null;
const INTERVAL_MS = (parseInt(process.env.SWEEPER_INTERVAL_MIN) || 30) * 60 * 1000;

async function runOnce() {
  try {
    const res = await sweeperService.sweepAll();
    if (res.skipped) return;
    console.log(
      `🔄 Sweeper: LTC=${res.ltcSwept}/${res.ltcAmount.toFixed(6)} | ` +
      `USDT=${res.usdtSwept}/${res.usdtAmount.toFixed(2)} | ` +
      `errors=${res.errors.length}`
    );
    res.errors.slice(0, 5).forEach(e =>
      console.error('  ↳', e.chain, e.error)
    );
  } catch (e) {
    console.error('Sweeper error:', e.message);
  }
}

function start() {
  if (timer) return;
  if (process.env.SWEEPER_ENABLED !== 'true') {
    console.log('⏸️ Sweeper disabled (SWEEPER_ENABLED != true)');
    return;
  }
  console.log(`🔄 Sweeper job started — every ${INTERVAL_MS / 60000} min`);
  setTimeout(runOnce, 90 * 1000);
  timer = setInterval(runOnce, INTERVAL_MS);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, runOnce };
