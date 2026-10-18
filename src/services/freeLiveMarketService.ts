// =====================================================================
// QuantMobile — Free Live Market Service for Indian Equities (NSE)
// Zero-subscription fallback engine ported from QuantPulse
// Ensures live exchange prices are always available
// =====================================================================

export interface FreeLiveQuoteRecord {
  ltp: number;
  volume: number;
  volumeM: number;
  open: number;
  high: number;
  low: number;
  close: number;
  changePct: number;
  averagePrice: number;
}

export async function fetchFreeLiveQuotes(
  tickers: string[]
): Promise<Record<string, FreeLiveQuoteRecord>> {
  const quotes: Record<string, FreeLiveQuoteRecord> = {};
  const cleanTickers = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase())));

  const fetchSingleTicker = async (ticker: string): Promise<{ ticker: string; record: FreeLiveQuoteRecord } | null> => {
    const candidates: string[] = [];
    if (ticker === 'NIFTY' || ticker === '^NSEI') candidates.push('^NSEI');
    else if (ticker === 'TMCV' || ticker === 'TATAMOTORS') candidates.push('TMCV.NS', 'TATAMOTORS.NS');
    else if (ticker === 'ETERNAL' || ticker === 'ZOMATO') candidates.push('ETERNAL.NS', 'ZOMATO.NS');
    else if (ticker === 'LTM' || ticker === 'LTIM') candidates.push('LTIM.NS', 'LTM.NS');
    else {
      candidates.push(ticker.includes('.') ? ticker : `${ticker}.NS`);
    }

    for (const yahooSymbol of candidates) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        yahooSymbol
      )}?interval=1d&range=1d`;

      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'application/json',
          },
        });

        if (!res.ok) continue;

        const json = await res.json();
        const meta = json?.chart?.result?.[0]?.meta;
        const quoteIndicator = json?.chart?.result?.[0]?.indicators?.quote?.[0];

        if (!meta) continue;

        const ltp = Number(meta.regularMarketPrice) || 0;
        const prevClose = Number(meta.chartPreviousClose) || ltp;
        const rawVol =
          Number(meta.regularMarketVolume) ||
          (Array.isArray(quoteIndicator?.volume) && quoteIndicator.volume[0]) ||
          0;

        const volumeM = rawVol / 1_000_000;
        const dayHigh = Number(meta.regularMarketDayHigh) || ltp;
        const dayLow = Number(meta.regularMarketDayLow) || ltp;
        const dayOpen =
          (Array.isArray(quoteIndicator?.open) && Number(quoteIndicator.open[0])) || ltp;

        const changePct =
          meta.regularMarketChangePercent !== undefined
            ? +Number(meta.regularMarketChangePercent).toFixed(2)
            : prevClose > 0
            ? +(((ltp - prevClose) / prevClose) * 100).toFixed(2)
            : 0;

        const record: FreeLiveQuoteRecord = {
          ltp: +ltp.toFixed(2),
          volumeM,
          volume: rawVol,
          high: +dayHigh.toFixed(2),
          low: +dayLow.toFixed(2),
          open: +dayOpen.toFixed(2),
          close: +prevClose.toFixed(2),
          changePct,
          averagePrice: +((dayHigh + dayLow + ltp) / 3).toFixed(2),
        };

        return { ticker, record };
      } catch {
        // try next candidate
      }
    }

    return null;
  };

  const CHUNK_SIZE = 10;
  for (let i = 0; i < cleanTickers.length; i += CHUNK_SIZE) {
    const chunk = cleanTickers.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.allSettled(chunk.map((ticker) => fetchSingleTicker(ticker)));
    chunkResults.forEach((r) => {
      if (r.status === 'fulfilled' && r.value) {
        quotes[r.value.ticker] = r.value.record;
        if (r.value.ticker === '^NSEI' || r.value.ticker === 'NIFTY') {
          quotes['^NSEI'] = r.value.record;
          quotes['NIFTY'] = r.value.record;
        }
      }
    });
  }

  return quotes;
}
