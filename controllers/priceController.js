const axios = require('axios');

// In-memory cache
const cache = {
    ltc: 0,
    lastFetch: 0
};

const CACHE_TTL = 60 * 1000; // 60 seconds
const FALLBACK_LTC = 85;     // fallback if API fails

exports.getPrices = async (req, res) => {
    try {
        const now = Date.now();

        // Return cached if fresh
        if (now - cache.lastFetch < CACHE_TTL && cache.ltc > 0) {
            return res.json({
                success: true,
                ltc: cache.ltc,
                cached: true
            });
        }

        // Fetch from CoinGecko
        const { data } = await axios.get(
            'https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd',
            { timeout: 10000 }
        );

        const ltcPrice = Number(data?.litecoin?.usd) || FALLBACK_LTC;
        cache.ltc = ltcPrice;
        cache.lastFetch = now;

        res.json({
            success: true,
            ltc: ltcPrice,
            cached: false
        });
    } catch (e) {
        console.log('Price fetch error:', e.message);
        res.json({
            success: true,
            ltc: cache.ltc || FALLBACK_LTC,
            cached: true,
            fallback: true
        });
    }
};
