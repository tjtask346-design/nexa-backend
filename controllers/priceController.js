const axios = require('axios');

// In-memory cache
const cache = {
    ltc: 0,
    lastFetch: 0
};

const CACHE_TTL = 60 * 1000; // 60 seconds
const FALLBACK_LTC = 85;     // last resort

/* ═══════════════════════════════════════════════════════════
   Fetch LTC price from multiple sources with fallback chain
   Priority: Binance → Coinbase → CoinGecko → Cache → Fallback
   ═══════════════════════════════════════════════════════════ */

async function fetchFromBinance() {
    const { data } = await axios.get(
        'https://api.binance.com/api/v3/ticker/price?symbol=LTCUSDT',
        { timeout: 5000 }
    );
    const price = parseFloat(data?.price);
    if (!price || price <= 0) throw new Error('Invalid Binance response');
    return price;
}

async function fetchFromCoinbase() {
    const { data } = await axios.get(
        'https://api.coinbase.com/v2/prices/LTC-USD/spot',
        { timeout: 5000 }
    );
    const price = parseFloat(data?.data?.amount);
    if (!price || price <= 0) throw new Error('Invalid Coinbase response');
    return price;
}

async function fetchFromCoinGecko() {
    const { data } = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd',
        { timeout: 5000 }
    );
    const price = parseFloat(data?.litecoin?.usd);
    if (!price || price <= 0) throw new Error('Invalid CoinGecko response');
    return price;
}

exports.getPrices = async (req, res) => {
    try {
        const now = Date.now();

        // Return fresh cache
        if (now - cache.lastFetch < CACHE_TTL && cache.ltc > 0) {
            return res.json({
                success: true,
                ltc: cache.ltc,
                cached: true,
                source: 'cache'
            });
        }

        // Try each source
        const sources = [
            { name: 'binance', fn: fetchFromBinance },
            { name: 'coinbase', fn: fetchFromCoinbase },
            { name: 'coingecko', fn: fetchFromCoinGecko }
        ];

        let price = null;
        let usedSource = null;

        for (const source of sources) {
            try {
                price = await source.fn();
                usedSource = source.name;
                console.log(`✅ LTC price from ${source.name}: $${price}`);
                break;
            } catch (e) {
                console.log(`❌ ${source.name} failed: ${e.message}`);
            }
        }

        // Fallback to old cache if all sources fail
        if (!price || price <= 0) {
            if (cache.ltc > 0) {
                return res.json({
                    success: true,
                    ltc: cache.ltc,
                    cached: true,
                    source: 'stale-cache'
                });
            }
            // Last resort
            return res.json({
                success: true,
                ltc: FALLBACK_LTC,
                fallback: true,
                source: 'fallback'
            });
        }

        // Update cache
        cache.ltc = price;
        cache.lastFetch = now;

        res.json({
            success: true,
            ltc: price,
            cached: false,
            source: usedSource
        });
    } catch (e) {
        console.log('Price controller error:', e.message);
        res.json({
            success: true,
            ltc: cache.ltc || FALLBACK_LTC,
            fallback: true
        });
    }
};
