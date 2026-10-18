import { API_CONFIG } from '../config/apiConfig';
import { niftyOptionFeedService } from './niftyOptionFeedService';

export interface OptionStrikeRow {
  strikePrice: number;
  moneyness: 'ITM' | 'ATM' | 'OTM';
  callSymbol: string;
  callLtp: number;
  callBid?: number;
  callAsk?: number;
  callOi: number;
  callIvPct: number;
  putSymbol: string;
  putLtp: number;
  putBid?: number;
  putAsk?: number;
  putOi: number;
  putIvPct: number;
  isOobtstCe?: boolean;
  isOobtstPe?: boolean;
}

export interface LiveOptionChainSummary {
  underlying: string;
  spotPrice: number;
  atmStrike: number;
  expiryDate: string;
  daysToExpiry: number;
  pcrRatio: number;
  totalCallOi: number;
  totalPutOi: number;
  isExpiryDay?: boolean;
  rolledToNextExpiry?: boolean;
  wasPreponed?: boolean;
  holidayReason?: string;
  oobtstCeStrike?: number;
  oobtstPeStrike?: number;
  oobtstCeOpen?: number;
  oobtstPeOpen?: number;
  strikes: OptionStrikeRow[];
}

export const liveMarketService = {
  // 1. Fetch live quotes for batch of tickers
  async fetchLiveQuotes(tickers?: string[]): Promise<Record<string, any>> {
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.STOCK_QUOTE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.quotes) return json.quotes;
      }
    } catch (err) {
      // Fallback: Query Supabase Cloud live_tick_snapshots directly
      try {
        const sbRes = await fetch(
          `https://cmcgvadapaoapxrxdcau.supabase.co/rest/v1/live_tick_snapshots?select=*`,
          {
            headers: {
              apikey: 'sb_publishable_SVF3AyZbDDIIT5v5QLi0AA_kz_uuXj6',
              Authorization: 'Bearer sb_publishable_SVF3AyZbDDIIT5v5QLi0AA_kz_uuXj6',
            },
          }
        );
        if (sbRes.ok) {
          const rows = await sbRes.json();
          const quotes: Record<string, any> = {};
          for (const r of rows) {
            quotes[r.ticker] = {
              ltp: r.ltp,
              volume: r.volume,
              open: r.open,
              high: r.high,
              low: r.low,
              close: r.close,
              changePct: r.change_pct,
            };
          }
          return quotes;
        }
      } catch {}
    }
    return {};
  },

  // 2. Fetch live multi-strike option chain for Index or Stock with 0ms latency & instant Black-Scholes
  async fetchLiveOptionChain(
    ticker: string = 'NIFTY',
    spotLtp: number = 23146.15,
    strikeStep: number = 50,
    forOobtst: boolean = true
  ): Promise<LiveOptionChainSummary> {
    // 1. Instant institutional Black-Scholes option chain calculation (0ms latency)
    const localMatrix = niftyOptionFeedService.generateLiveOptionChainMatrix(
      spotLtp,
      strikeStep,
      12,
      forOobtst
    );

    // 2. Only attempt remote backend if an external gateway is explicitly configured
    if (process.env.EXPO_PUBLIC_API_URL) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600);
        const res = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.OPTION_CHAIN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, spotLtp, strikeStep }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const json = await res.json();
          if (json.matrix) return json.matrix;
        }
      } catch {}
    }

    return localMatrix as LiveOptionChainSummary;
  },
};
