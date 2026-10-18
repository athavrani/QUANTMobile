import { create } from 'zustand';
import {
  StockRadarItem,
  NiftyOvernightState,
  NiftyBreakout180State,
  TacticalStrikeSuggestion,
  MarketSessionStatus,
  SignalJournalItem,
} from '../types/mobile';
import { apiService } from '../services/apiService';
import { alertLatchService } from '../services/alertLatchService';
import { notificationService } from '../services/notificationService';
import { dhanDirectService } from '../services/dhanDirectService';
import { dhanWebStreamer } from '../services/dhanWebStreamer';
import { DHAN_SECURITY_MAP, DHAN_NIFTY_INDEX_ID, getDhanSecurityId } from '../constants/dhanSecurityMaster';
import { niftyOptionFeedService } from '../services/niftyOptionFeedService';
import { OobtstLiveState } from '../strategies/types';

interface RadarStoreState {
  // Market Global State
  marketStatus: MarketSessionStatus;
  istTime: string;
  isRefreshing: boolean;
  latchServiceInitialized: boolean;
  niftySpot: number;
  feedStatus: 'ONLINE' | 'ERROR' | 'UNCONFIGURED';
  lastTickTime: string | null;

  // Strategy 1: 20D Volume Screener
  stocks: StockRadarItem[];
  selectedStock: StockRadarItem | null;
  tacticalStrike: TacticalStrikeSuggestion | null;

  // Strategy 2: NIFTY 09:20 Overnight (62.5)
  niftyOvernight: NiftyOvernightState | null;
  oobtstState: OobtstLiveState | null;

  // Strategy 3: NIFTY 09:30 ₹180 Breakout
  niftyBreakout180: NiftyBreakout180State | null;

  // Audit Journal
  journal: SignalJournalItem[];
  signalsTodayCount: number;
  netPointsCaptured: number;

  // Streamer Engine
  isStreamerInitialized: boolean;

  // Actions
  initStreamer: () => void;
  refreshAll: (isManual?: boolean) => Promise<void>;
  selectStock: (ticker: string) => void;
  clearSelectedStock: () => void;
  setIstTime: (timeStr: string) => void;
}

export const useRadarStore = create<RadarStoreState>((set, get) => ({
  marketStatus: 'REGULAR_HOURS',
  istTime: '--:--:--',
  isRefreshing: false,
  latchServiceInitialized: false,
  niftySpot: 23146.15,
  feedStatus: 'UNCONFIGURED',
  lastTickTime: null,
  isStreamerInitialized: false,

  stocks: [],
  selectedStock: null,
  tacticalStrike: null,

  niftyOvernight: null,
  oobtstState: null,
  niftyBreakout180: null,

  journal: [
    {
      id: 'sig-01',
      timestamp: '09:20:00 AM',
      strategyId: 'NIFTY_OVERNIGHT',
      strategyName: 'NIFTY 09:20 Strangle (62.5)',
      symbol: 'NIFTY 24900 CE / 24700 PE',
      signalType: 'BUY',
      entryPrice: 125.30,
      outcome: 'OPEN',
      notes: 'Expiry: 22-OCT. CE @ ₹63.50, PE @ ₹61.80. Zero Target.',
    },
    {
      id: 'sig-02',
      timestamp: '09:32:00 AM',
      strategyId: 'NIFTY_BREAKOUT_180',
      strategyName: 'NIFTY 09:30 Breakout (180)',
      symbol: 'NIFTY 24850 CE',
      signalType: 'BUY',
      entryPrice: 181.50,
      stopLoss: 160.00,
      target: 220.00,
      outcome: 'OPEN',
      notes: 'Broke ₹180 @ 09:32. Opposite 24800 PE disabled.',
    },
    {
      id: 'sig-03',
      timestamp: '10:14:20 AM',
      strategyId: '20D_CROSSOVER',
      strategyName: '20D Volume Crossover',
      symbol: 'RELIANCE',
      signalType: 'BUY',
      entryPrice: 2942.50,
      outcome: 'OPEN',
      notes: '🟢 Crossed 100% of 20D Avg (110.3% Vol). Bullish LTP > Open.',
    },
    {
      id: 'sig-04',
      timestamp: '10:25:40 AM',
      strategyId: '20D_CROSSOVER',
      strategyName: '20D Volume Crossover',
      symbol: 'TATASTEEL',
      signalType: 'BUY',
      entryPrice: 162.80,
      outcome: 'OPEN',
      notes: '🟢 Crossed 100% of 20D Avg (107.7% Vol). Bullish LTP > Open.',
    },
    {
      id: 'sig-05',
      timestamp: '10:42:15 AM',
      strategyId: '20D_CROSSOVER',
      strategyName: '20D Volume Crossover',
      symbol: 'ICICIBANK',
      signalType: 'SELL',
      entryPrice: 1248.50,
      outcome: 'OPEN',
      notes: '🔴 Crossed 100% of 20D Avg (106.7% Vol). Bearish LTP < Open (Distribution).',
    },
  ],
  signalsTodayCount: 5,
  netPointsCaptured: +32.40,

  refreshAll: async (isManual = false) => {
    // Only show pull-to-refresh spinner when user manually pulls down the list
    if (isManual) {
      set({ isRefreshing: true });
    }

    // Initialize Monotonic Alert Latch Guarantee if not already done
    if (!get().latchServiceInitialized) {
      await alertLatchService.initialize();
      set({ latchServiceInitialized: true });
    }

    try {
      const [session, stocks, overnight, breakout, niftyIndexQuote] = await Promise.all([
        apiService.fetchMarketSession(),
        apiService.fetchStockRadarList(),
        apiService.fetchNiftyOvernightState(),
        apiService.fetchNiftyBreakout180State(),
        dhanDirectService.fetchNiftyIndexQuote(),
      ]);

      // Point 5.1: Monotonic Alert Latch Check
      // Process crossover triggers and fire notifications ONLY if unlatched for today's session
      for (const stock of stocks) {
        if (stock.circleIndicator === 'GREEN') {
          const isLocked = alertLatchService.isAlertLatched(stock.ticker, 'GREEN');
          if (!isLocked) {
            const acquired = await alertLatchService.acquireAlertLatch(stock.ticker, 'GREEN', {
              spotPrice: stock.spotPrice,
              todayTradedShares: stock.todayTradedShares,
              avg20DTradedShares: stock.avg20DTradedShares,
              volumeRatio: stock.volumeRatio,
              crossoverTime: stock.crossoverTime,
            });
            if (acquired) {
              const tactical = apiService.calculateTacticalStrike(stock);
              notificationService.notify20DCrossover(
                stock.ticker,
                stock.volumeRatio,
                stock.spotPrice,
                tactical.recommendedCeStrike
              );
            }
          }
        } else if (stock.circleIndicator === 'RED') {
          const isLocked = alertLatchService.isAlertLatched(stock.ticker, 'RED');
          if (!isLocked) {
            await alertLatchService.acquireAlertLatch(stock.ticker, 'RED', {
              spotPrice: stock.spotPrice,
              todayTradedShares: stock.todayTradedShares,
              avg20DTradedShares: stock.avg20DTradedShares,
              volumeRatio: stock.volumeRatio,
              crossoverTime: stock.crossoverTime,
            });
            // Bearish distribution notification
          }
        }
      }

      const greenCount = stocks.filter((s) => s.circleIndicator === 'GREEN').length;
      const redCount = stocks.filter((s) => s.circleIndicator === 'RED').length;
      const telemetry = dhanDirectService.getTelemetry();

      const resolvedSpot = niftyIndexQuote && niftyIndexQuote.ltp > 0 ? niftyIndexQuote.ltp : get().niftySpot;
      const liveOobtst = niftyOptionFeedService.evaluateOobtst(resolvedSpot, session.istTime);

      set({
        marketStatus: session.status,
        istTime: session.istTime,
        stocks,
        niftySpot: resolvedSpot,
        niftyOvernight: overnight,
        oobtstState: liveOobtst,
        niftyBreakout180: breakout,
        signalsTodayCount: greenCount + redCount + (overnight ? 1 : 0) + (breakout ? 1 : 0),
        feedStatus: telemetry.status,
        lastTickTime: telemetry.lastTickTime || session.istTime,
        isRefreshing: false,
      });
    } catch {
      set({ isRefreshing: false });
    }
  },

  selectStock: (ticker: string) => {
    const stock = get().stocks.find((s) => s.ticker === ticker);
    if (!stock) return;
    const tactical = apiService.calculateTacticalStrike(stock);
    set({ selectedStock: stock, tacticalStrike: tactical });
  },

  clearSelectedStock: () => {
    set({ selectedStock: null, tacticalStrike: null });
  },

  setIstTime: (timeStr: string) => {
    set({ istTime: timeStr });
  },

  initStreamer: () => {
    if (get().isStreamerInitialized) return;
    set({ isStreamerInitialized: true });

    // 1. Subscribe to all 60 constituent stocks
    Object.values(DHAN_SECURITY_MAP).forEach((meta) => {
      dhanWebStreamer.subscribe(meta.securityId, 'NSE', 'E', 'price');
    });

    // 2. Subscribe to NIFTY 50 Spot Index
    dhanWebStreamer.subscribe(DHAN_NIFTY_INDEX_ID, 'IDX', 'I', 'price');

    // 3. Start Streamer
    dhanWebStreamer.start();

    // 4. Register high-frequency 100ms micro-batch tick listener
    dhanWebStreamer.addTickListener((tickBatch) => {
      let hasChanged = false;
      let newNiftySpot = get().niftySpot;

      // Check if NIFTY spot tick arrived
      const indexTick = tickBatch[DHAN_NIFTY_INDEX_ID] || tickBatch[`${DHAN_NIFTY_INDEX_ID}-I-IDX`];
      if (indexTick && indexTick.ltp > 0 && indexTick.ltp !== newNiftySpot) {
        newNiftySpot = indexTick.ltp;
        hasChanged = true;
      }

      const currentStocks = get().stocks;
      let updatedStocks = currentStocks;

      // Map ticks across constituent stocks if any are loaded
      if (currentStocks.length > 0) {
        updatedStocks = currentStocks.map((stock) => {
          const secId = getDhanSecurityId(stock.ticker);
          const tick = tickBatch[secId] || tickBatch[`${secId}-E-NSE`];
          if (!tick || tick.ltp <= 0) return stock;

          hasChanged = true;
          const spotPrice = tick.ltp;
          const dayOpen = tick.open > 0 ? tick.open : stock.dayOpen;
          const dayHigh = tick.high > 0 ? tick.high : Math.max(spotPrice, stock.dayHigh);
          const dayLow = tick.low > 0 ? tick.low : Math.min(spotPrice, stock.dayLow);
          const todayTradedShares = tick.volume > 0 ? tick.volume : stock.todayTradedShares;
          const avgShares = stock.avg20DTradedShares || 1;
          const ratio = +(todayTradedShares / avgShares).toFixed(3);
          const hasCrossed = todayTradedShares >= avgShares && todayTradedShares > 0;
          const isBullish = spotPrice >= dayOpen;
          const close = tick.close > 0 ? tick.close : stock.dayOpen;
          const pctChange = close > 0 ? +(((spotPrice - close) / close) * 100).toFixed(2) : 0;

          let circleIndicator: 'GREEN' | 'RED' | 'AMBER' | 'GREY' = 'GREY';
          if (hasCrossed) {
            circleIndicator = isBullish ? 'GREEN' : 'RED';
          } else if (ratio >= 0.8) {
            circleIndicator = 'AMBER';
          }

          return {
            ...stock,
            spotPrice,
            dayOpen,
            dayHigh,
            dayLow,
            percentChange: pctChange,
            todayTradedShares,
            avg20DTradedShares: avgShares,
            volumeRatio: ratio,
            hasCrossed20D: hasCrossed,
            crossoverTime: hasCrossed ? (tick.lastUpdated || stock.crossoverTime) : stock.crossoverTime,
            crossoverDirection: (isBullish ? 'BULLISH' : 'BEARISH') as 'BULLISH' | 'BEARISH',
            circleIndicator,
          };
        });
      }

      if (hasChanged) {
        const nowTime = new Date().toLocaleTimeString('en-IN');
        const liveOobtst = niftyOptionFeedService.evaluateOobtst(newNiftySpot, get().istTime || nowTime);
        const liveBreakout = niftyOptionFeedService.evaluateBreakout180(newNiftySpot, get().istTime || nowTime);
        set({
          stocks: updatedStocks,
          niftySpot: newNiftySpot,
          oobtstState: liveOobtst,
          niftyBreakout180: liveBreakout,
          feedStatus: 'ONLINE',
          lastTickTime: nowTime,
        });
      }
    });

    // 5. Register Telemetry Listener
    dhanWebStreamer.addTelemetryListener((telem) => {
      if (telem.status === 'STREAMING') {
        set({
          feedStatus: 'ONLINE',
          lastTickTime: telem.lastTickTime || get().lastTickTime,
        });
      } else if (telem.status === 'ERROR') {
        set({ feedStatus: 'ERROR' });
      }
    });
  },
}));
