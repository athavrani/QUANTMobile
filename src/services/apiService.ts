import { API_CONFIG } from '../config/apiConfig';
import {
  StockRadarItem,
  NiftyOvernightState,
  NiftyBreakout180State,
  TacticalStrikeSuggestion,
  SignalJournalItem,
  MarketSessionStatus,
} from '../types/mobile';
import { SENSEX_NIFTY_MASTER_CATALOG } from '../constants/stockUniverse';
import { dhanDirectService } from './dhanDirectService';
import { fetchFreeLiveQuotes } from './freeLiveMarketService';
import { niftyOptionFeedService, getActiveWeeklyExpiry } from './niftyOptionFeedService';
import { isTradingDay } from '../constants/nseHolidays';

export function isMarketSessionBeforeOpen(): boolean {
  const now = new Date();
  const istHours = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
  const istMinutes = (now.getUTCMinutes() + 30) % 60;
  const totalMinutes = istHours * 60 + istMinutes;
  // Continuous trading session is 09:15 - 15:30 IST (555 to 930 mins).
  // Before 09:15 AM on any day, trading has not started, volume is strictly 0.
  return totalMinutes < 555;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_CONFIG.BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Server returned status: ${res.status}`);
    }

    return await res.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export const apiService = {
  // 1. Market Session & Status
  async fetchMarketSession(): Promise<{ status: MarketSessionStatus; istTime: string; isTradingDay: boolean }> {
    try {
      const data = await request<any>(API_CONFIG.ENDPOINTS.MARKET_SESSION);
      return data;
    } catch {
      const now = new Date();
      const istHours = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
      const istMinutes = (now.getUTCMinutes() + 30) % 60;
      const istTimeStr = `${String(istHours).padStart(2, '0')}:${String(istMinutes).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;
      
      const totalMinutes = istHours * 60 + istMinutes;
      let status: MarketSessionStatus = 'CLOSED';
      if (totalMinutes >= 540 && totalMinutes < 555) status = 'PRE_MARKET';
      else if (totalMinutes >= 555 && totalMinutes < 556) status = 'STABILIZING';
      else if (totalMinutes >= 556 && totalMinutes < 930) status = 'REGULAR_HOURS';
      else if (totalMinutes >= 930 && totalMinutes < 935) status = 'POST_MARKET';

      return { status, istTime: istTimeStr, isTradingDay: true };
    }
  },

  // 2. Strategy 1: 20D Volume Crossover Screener (All SENSEX & NIFTY 50 Stocks)
  async fetchStockRadarList(): Promise<StockRadarItem[]> {
    const isBeforeOpen = isMarketSessionBeforeOpen() || !isTradingDay(new Date());

    // Priority 1: Direct Mobile-to-Dhan HQ Live Market Feed
    await dhanDirectService.initialize();
    if (dhanDirectService.isConfigured()) {
      try {
        const allTickers = SENSEX_NIFTY_MASTER_CATALOG.map((s) => s.ticker);
        const liveQuotes = await dhanDirectService.fetchDirectBatchQuotes(allTickers);

        if (Object.keys(liveQuotes).length > 0) {
          return SENSEX_NIFTY_MASTER_CATALOG.map((m) => {
            const q = liveQuotes[m.ticker];
            const spotPrice = q && q.ltp > 0 ? q.ltp : m.approxLtp;
            const dayOpen = q && q.open > 0 ? q.open : spotPrice;
            const dayHigh = q && q.high > 0 ? q.high : spotPrice;
            const dayLow = q && q.low > 0 ? q.low : spotPrice;
            const todayShares = isBeforeOpen ? 0 : (q ? q.volume : 0);
            const avgShares = m.avg20DTradedShares || 1;
            const ratio = todayShares > 0 ? +(todayShares / avgShares).toFixed(3) : 0;
            const hasCrossed = todayShares >= avgShares && todayShares > 0;
            const isBullish = spotPrice >= dayOpen;
            const close = q && q.close > 0 ? q.close : dayOpen;
            const pctChange = close > 0 ? +(((spotPrice - close) / close) * 100).toFixed(2) : 0;

            let circleIndicator: 'GREEN' | 'RED' | 'AMBER' | 'GREY' = 'GREY';
            if (hasCrossed) {
              circleIndicator = isBullish ? 'GREEN' : 'RED';
            } else if (ratio >= 0.8) {
              circleIndicator = 'AMBER';
            }

            return {
              ticker: m.ticker,
              name: m.name,
              exchange: 'NSE',
              sector: m.sector,
              indices: m.indices,
              spotPrice,
              dayOpen,
              dayHigh,
              dayLow,
              percentChange: pctChange,
              todayTradedShares: todayShares,
              avg20DTradedShares: avgShares,
              volumeRatio: ratio,
              hasCrossed20D: hasCrossed,
              crossoverTime: hasCrossed ? (q?.lastUpdated || '10:14 AM') : undefined,
              crossoverDirection: isBullish ? 'BULLISH' : 'BEARISH',
              circleIndicator,
              strikeStep: m.strikeStep,
              lotSize: m.lotSize,
            };
          });
        }
      } catch (dhanErr: any) {
        console.warn('[ApiService] Direct Dhan fetch error, falling back:', dhanErr.message);
      }
    }

    // Priority 2: Backend Gateway / Central Feed
    try {
      const data = await request<any>(API_CONFIG.ENDPOINTS.CENTRAL_FEED_TICK);
      if (data && Array.isArray(data.stocks) && data.stocks.length > 0) {
        return data.stocks.map((s: any) => formatRadarItem(s));
      }
    } catch {}

    // Priority 3: Zero-Subscription Live Market Engine (NSE Real-Time)
    try {
      const allTickers = SENSEX_NIFTY_MASTER_CATALOG.map((s) => s.ticker);
      const freeQuotes = await fetchFreeLiveQuotes(allTickers);
      if (Object.keys(freeQuotes).length > 0) {
        return SENSEX_NIFTY_MASTER_CATALOG.map((m) => {
          const q = freeQuotes[m.ticker];
          const spotPrice = q && q.ltp > 0 ? q.ltp : m.approxLtp;
          const dayOpen = q && q.open > 0 ? q.open : spotPrice;
          const dayHigh = q && q.high > 0 ? q.high : spotPrice;
          const dayLow = q && q.low > 0 ? q.low : spotPrice;
          const todayShares = isBeforeOpen ? 0 : (q ? q.volume : 0);
          const avgShares = m.avg20DTradedShares || 1;
          const ratio = todayShares > 0 ? +(todayShares / avgShares).toFixed(3) : 0;
          const hasCrossed = todayShares >= avgShares && todayShares > 0;
          const isBullish = spotPrice >= dayOpen;
          const close = q && q.close > 0 ? q.close : dayOpen;
          const pctChange = close > 0 ? +(((spotPrice - close) / close) * 100).toFixed(2) : 0;

          let circleIndicator: 'GREEN' | 'RED' | 'AMBER' | 'GREY' = 'GREY';
          if (hasCrossed) {
            circleIndicator = isBullish ? 'GREEN' : 'RED';
          } else if (ratio >= 0.8) {
            circleIndicator = 'AMBER';
          }

          return {
            ticker: m.ticker,
            name: m.name,
            exchange: 'NSE',
            sector: m.sector,
            indices: m.indices,
            spotPrice,
            dayOpen,
            dayHigh,
            dayLow,
            percentChange: pctChange,
            todayTradedShares: todayShares,
            avg20DTradedShares: avgShares,
            volumeRatio: ratio,
            hasCrossed20D: hasCrossed,
            crossoverTime: hasCrossed ? '10:14 AM' : undefined,
            crossoverDirection: isBullish ? 'BULLISH' : 'BEARISH',
            circleIndicator,
            strikeStep: m.strikeStep,
            lotSize: m.lotSize,
          };
        });
      }
    } catch {}

    // Priority 4: Fallback Standalone Catalog Simulator
    return generateCatalogRadarStocks();
  },

  // 3. Strategy 2: NIFTY 09:20 Overnight (62.5)
  async fetchNiftyOvernightState(): Promise<NiftyOvernightState> {
    await dhanDirectService.initialize();
    let spot = 0;

    try {
      const indexQuote = await dhanDirectService.fetchNiftyIndexQuote();
      if (indexQuote && indexQuote.ltp > 0) {
        spot = indexQuote.ltp;
      }
    } catch {}

    if (spot === 0) {
      try {
        const freeQuotes = await fetchFreeLiveQuotes(['NIFTY']);
        if (freeQuotes && freeQuotes['NIFTY']?.ltp > 0) {
          spot = freeQuotes['NIFTY'].ltp;
        }
      } catch {}
    }

    if (spot === 0) {
      spot = 24350.0; // fallback to approximate prevailing Nifty index level if feed is offline
    }

    // Sync live option chain from Dhan HQ API (/v2/optionchain)
    try {
      await niftyOptionFeedService.syncLiveOptionChain();
    } catch {}

    try {
      const data = await request<any>(API_CONFIG.ENDPOINTS.NIFTY_OVERNIGHT);
      if (data && data.state) return data.state;
    } catch {}

    let istTimeStr: string | undefined;
    try {
      const session = await this.fetchMarketSession();
      istTimeStr = session.istTime;
    } catch {}

    const oobtst = niftyOptionFeedService.evaluateOobtst(spot, istTimeStr);

    return {
      strategyId: 'NIFTY_0920_PREMIUM_625_OVERNIGHT',
      tradeDate: new Date().toISOString().split('T')[0],
      selectedExpiry: oobtst.expiryDate,
      isExpiryOverridden: false,
      status: oobtst.status === 'BTST_HOLD' ? 'OVERNIGHT_HOLD' : oobtst.status === 'ACTIVE' ? 'ACTIVE_HOLD' : 'SCANNING',
      ceLeg: {
        type: 'CE',
        strike: oobtst.ceLeg.strike,
        expiry: oobtst.expiryDate,
        referencePrice: oobtst.ceLeg.openPrice,
        currentPrice: oobtst.ceLeg.currentLtp,
        stopLoss: +(oobtst.ceLeg.openPrice * 0.75).toFixed(2),
        status: oobtst.ceLeg.status === 'SL_HIT' ? 'SL_HIT' : 'ACTIVE',
      },
      peLeg: {
        type: 'PE',
        strike: oobtst.peLeg.strike,
        expiry: oobtst.expiryDate,
        referencePrice: oobtst.peLeg.openPrice,
        currentPrice: oobtst.peLeg.currentLtp,
        stopLoss: +(oobtst.peLeg.openPrice * 0.75).toFixed(2),
        status: oobtst.peLeg.status === 'SL_HIT' ? 'SL_HIT' : 'ACTIVE',
      },
      netPointsPnl: +(oobtst.pnlPerShare ?? 0),
      lastUpdated: oobtst.lastUpdated,
    };
  },

  // 4. Strategy 3: NIFTY 09:25 ₹180 Breakout
  async fetchNiftyBreakout180State(): Promise<NiftyBreakout180State> {
    try {
      const data = await request<any>(API_CONFIG.ENDPOINTS.NIFTY_BREAKOUT_180);
      if (data && data.state) return data.state;
    } catch {}

    let spot = 23146.15;
    try {
      const indexQuote = await dhanDirectService.fetchNiftyIndexQuote();
      if (indexQuote && indexQuote.ltp > 0) {
        spot = indexQuote.ltp;
      }
    } catch {}

    return niftyOptionFeedService.evaluateBreakout180(spot);
  },

  // 5. Tactical Strike Calculation for Strategy 1
  calculateTacticalStrike(stock: StockRadarItem): TacticalStrikeSuggestion {
    const step = stock.strikeStep || 50;
    const atmStrike = Math.round(stock.spotPrice / step) * step;
    const estCePrem = +(stock.spotPrice * 0.015).toFixed(2);
    const estPePrem = +(stock.spotPrice * 0.015).toFixed(2);

    return {
      underlying: stock.ticker,
      spotLtp: stock.spotPrice,
      recommendedCeStrike: atmStrike,
      recommendedPeStrike: atmStrike,
      estimatedCePremium: estCePrem,
      estimatedPePremium: estPePrem,
      ceStopLoss: +(estCePrem * 0.80).toFixed(2),     // -20%
      ceTarget1: +(estCePrem * 1.40).toFixed(2),      // +40%
      cePiTarget1: +(estCePrem * 1.031416).toFixed(2),// +3.14%
      cePiTarget2: +(estCePrem * 1.062832).toFixed(2),// +6.28%
      peStopLoss: +(estPePrem * 0.80).toFixed(2),
      peTarget1: +(estPePrem * 1.40).toFixed(2),
    };
  },
};

function formatRadarItem(raw: any): StockRadarItem {
  const isBeforeOpen = isMarketSessionBeforeOpen() || !isTradingDay(new Date());
  const todayShares = isBeforeOpen ? 0 : Number(raw.todayTradedShares || raw.today_traded_shares || 0);
  const avgShares = Number(raw.avg20DTradedShares || raw.avg_20d_traded_shares || 1);
  const ratio = todayShares > 0 ? +(todayShares / avgShares).toFixed(3) : 0;
  const hasCrossed = todayShares >= avgShares && todayShares > 0;
  const isBullish = (raw.spotPrice || raw.ltp) >= (raw.dayOpen || raw.open);

  let circleIndicator: 'GREEN' | 'RED' | 'AMBER' | 'GREY' = 'GREY';
  if (hasCrossed) {
    circleIndicator = isBullish ? 'GREEN' : 'RED';
  } else if (ratio >= 0.80) {
    circleIndicator = 'AMBER';
  }

  return {
    ticker: raw.ticker,
    name: raw.name || raw.ticker,
    exchange: raw.exchange || 'NSE',
    sector: raw.sector || 'Large Cap',
    indices: raw.indices || ['NIFTY 50'],
    spotPrice: Number(raw.spotPrice || raw.ltp || 0),
    dayOpen: Number(raw.dayOpen || raw.open || 0),
    dayHigh: Number(raw.dayHigh || raw.high || 0),
    dayLow: Number(raw.dayLow || raw.low || 0),
    percentChange: Number(raw.percentChange || raw.change_pct || 0),
    todayTradedShares: todayShares,
    avg20DTradedShares: avgShares,
    volumeRatio: ratio,
    hasCrossed20D: hasCrossed,
    crossoverTime: hasCrossed ? raw.crossoverTime : undefined,
    crossoverDirection: isBullish ? 'BULLISH' : 'BEARISH',
    circleIndicator,
    strikeStep: raw.strikeStep || 20,
    lotSize: raw.lotSize || 250,
  };
}

function generateCatalogRadarStocks(): StockRadarItem[] {
  const isBeforeOpen = isMarketSessionBeforeOpen() || !isTradingDay(new Date());

  // Simulates realistic market sessions across all SENSEX & NIFTY 50 constituents
  return SENSEX_NIFTY_MASTER_CATALOG.map((m) => {
    // If today is a new day and session has not opened yet, volume is strictly 0
    if (isBeforeOpen) {
      return {
        ticker: m.ticker,
        name: m.name,
        exchange: 'NSE',
        sector: m.sector,
        indices: m.indices,
        spotPrice: m.approxLtp,
        dayOpen: m.approxLtp,
        dayHigh: m.approxLtp,
        dayLow: m.approxLtp,
        percentChange: 0,
        todayTradedShares: 0,
        avg20DTradedShares: m.avg20DTradedShares,
        volumeRatio: 0,
        hasCrossed20D: false,
        crossoverTime: undefined,
        crossoverDirection: 'BULLISH',
        circleIndicator: 'GREY',
        strikeStep: m.strikeStep,
        lotSize: m.lotSize,
      };
    }

    let volumeRatio = 0.55;
    let percentChange = 0.45;
    let crossoverTime: string | undefined = undefined;

    // Specific deterministic breakout examples during live hours
    if (m.ticker === 'RELIANCE') {
      volumeRatio = 1.103;
      percentChange = +1.25;
      crossoverTime = '10:14:20 AM';
    } else if (m.ticker === 'TATASTEEL') {
      volumeRatio = 1.077;
      percentChange = +1.95;
      crossoverTime = '10:25:40 AM';
    } else if (m.ticker === 'BHARTIARTL') {
      volumeRatio = 1.035;
      percentChange = +2.10;
      crossoverTime = '10:48:10 AM';
    } else if (m.ticker === 'ICICIBANK') {
      volumeRatio = 1.067;
      percentChange = -0.65; // Bearish Distribution
      crossoverTime = '10:42:15 AM';
    } else if (m.ticker === 'HDFCBANK') {
      volumeRatio = 0.860;
      percentChange = +0.45;
    } else if (m.ticker === 'INFY') {
      volumeRatio = 0.852;
      percentChange = +1.10;
    } else if (m.ticker === 'AXISBANK') {
      volumeRatio = 0.814;
      percentChange = +0.30;
    } else if (m.ticker === 'SBIN') {
      volumeRatio = 0.750;
      percentChange = +0.85;
    } else if (m.ticker === 'TATAMOTORS') {
      volumeRatio = 0.746;
      percentChange = +0.72;
    } else if (m.ticker === 'TCS') {
      volumeRatio = 0.680;
      percentChange = -0.20;
    } else if (m.ticker === 'ITC') {
      volumeRatio = 0.640;
      percentChange = +0.15;
    } else if (m.ticker === 'LT') {
      volumeRatio = 0.610;
      percentChange = +0.90;
    } else {
      // Deterministic spread between 0.40 and 0.78
      const hash = m.ticker.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      volumeRatio = +((0.40 + (hash % 38) / 100)).toFixed(3);
      percentChange = +(((hash % 30) - 12) / 10).toFixed(2);
    }

    const todayTradedShares = Math.round(m.avg20DTradedShares * volumeRatio);
    const hasCrossed20D = volumeRatio >= 1.0;
    const isBullish = percentChange >= 0;

    let circleIndicator: 'GREEN' | 'RED' | 'AMBER' | 'GREY' = 'GREY';
    if (hasCrossed20D) {
      circleIndicator = isBullish ? 'GREEN' : 'RED';
    } else if (volumeRatio >= 0.80) {
      circleIndicator = 'AMBER';
    }

    const dayOpen = +(m.approxLtp / (1 + percentChange / 100)).toFixed(2);
    const dayHigh = +(Math.max(m.approxLtp, dayOpen) * 1.008).toFixed(2);
    const dayLow = +(Math.min(m.approxLtp, dayOpen) * 0.994).toFixed(2);

    return {
      ticker: m.ticker,
      name: m.name,
      exchange: 'NSE',
      sector: m.sector,
      indices: m.indices,
      spotPrice: m.approxLtp,
      dayOpen,
      dayHigh,
      dayLow,
      percentChange,
      todayTradedShares,
      avg20DTradedShares: m.avg20DTradedShares,
      volumeRatio,
      hasCrossed20D,
      crossoverTime,
      crossoverDirection: isBullish ? 'BULLISH' : 'BEARISH',
      circleIndicator,
      strikeStep: m.strikeStep,
      lotSize: m.lotSize,
    };
  });
}
