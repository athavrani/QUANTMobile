import { API_CONFIG } from '../config/apiConfig';
import { niftyOptionFeedService } from './niftyOptionFeedService';
import { dhanDirectService } from './dhanDirectService';

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
  originalScheduledStr?: string;
  oobtstCeStrike?: number;
  oobtstPeStrike?: number;
  oobtstCeOpen?: number;
  oobtstPeOpen?: number;
  isLiveMarketData?: boolean;
  dataSource?: 'DHAN_LIVE' | 'BLACK_SCHOLES_FALLBACK';
  lastSyncTime?: number;
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

  // 2. Fetch live multi-strike option chain directly from Dhan HQ with seamless fallback
  async fetchLiveOptionChain(
    ticker: string = 'NIFTY',
    spotLtp: number = 23146.15,
    strikeStep: number = 50,
    forOobtst: boolean = true
  ): Promise<LiveOptionChainSummary> {
    // 1. Sync live option chain from Dhan HQ API if available
    try {
      await niftyOptionFeedService.syncLiveOptionChain(ticker);
    } catch {}

    // 2. Resolve live spot price if passed value is fallback/zero
    let resolvedSpot = spotLtp;
    const lastLiveSpot = niftyOptionFeedService.getLastLiveSpot();
    if (lastLiveSpot && lastLiveSpot > 0 && (!resolvedSpot || resolvedSpot <= 0 || resolvedSpot === 23146.15)) {
      resolvedSpot = lastLiveSpot;
    } else if (!resolvedSpot || resolvedSpot <= 0 || resolvedSpot === 23146.15) {
      try {
        const quote = await dhanDirectService.fetchNiftyIndexQuote();
        if (quote && quote.ltp > 0) {
          resolvedSpot = quote.ltp;
        }
      } catch {}
    }

    // 3. Generate option chain matrix overlaid with live Dhan exchange data
    const localMatrix = niftyOptionFeedService.generateLiveOptionChainMatrix(
      resolvedSpot,
      strikeStep,
      12,
      forOobtst
    );

    // 4. Remote backend fallback if external gateway is configured
    if (process.env.EXPO_PUBLIC_API_URL && !localMatrix.isLiveMarketData) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600);
        const res = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.OPTION_CHAIN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, spotLtp: resolvedSpot, strikeStep }),
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
