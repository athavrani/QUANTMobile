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
import { formatDateKeyIST } from '../constants/nseHolidays';

interface RadarStoreState {
  // Market Global State
  sessionDate: string;
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
  sessionDate: formatDateKeyIST(),
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

  journal: [],
  signalsTodayCount: 0,
  netPointsCaptured: 0,

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

    // Day rollover detection: if sessionDate !== today, reset daily caches & journal
    const todayIST = formatDateKeyIST();
    if (get().sessionDate !== todayIST) {
      niftyOptionFeedService.resetAnchor();
      niftyOptionFeedService.resetBreakout180();
      set({
        sessionDate: todayIST,
        journal: [],
        signalsTodayCount: 0,
        netPointsCaptured: 0,
        stocks: get().stocks.map((s) => ({
          ...s,
          todayTradedShares: 0,
          volumeRatio: 0,
          hasCrossed20D: false,
          crossoverTime: undefined,
          crossoverDirection: 'BULLISH',
          circleIndicator: 'GREY',
        })),
      });
    }

    try {
      const [session, stocks, overnight, breakout, niftyIndexQuote] = await Promise.all([
        apiService.fetchMarketSession(),
        apiService.fetchStockRadarList(),
        apiService.fetchNiftyOvernightState(),
        apiService.fetchNiftyBreakout180State(),
        dhanDirectService.fetchNiftyIndexQuote(),
        niftyOptionFeedService.syncLiveOptionChain(),
      ]);

      // Point 5.1: Monotonic Alert Latch Check & Journal Audit Recording
      // Process crossover triggers and fire notifications ONLY if unlatched for today's session
      const newJournalEntries: SignalJournalItem[] = [];

      for (const stock of stocks) {
        if (stock.hasCrossed20D && stock.todayTradedShares > 0) {
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
                newJournalEntries.push({
                  id: `sig-${stock.ticker}-${Date.now()}`,
                  timestamp: session.istTime || new Date().toLocaleTimeString('en-IN'),
                  strategyId: '20D_CROSSOVER',
                  strategyName: '20D Volume Crossover',
                  symbol: stock.ticker,
                  signalType: 'BUY',
                  entryPrice: stock.spotPrice,
                  outcome: 'OPEN',
                  notes: `🟢 Crossed 100% of 20D Avg (${(stock.volumeRatio * 100).toFixed(1)}% Vol). Bullish LTP > Open. Tactical: ${tactical.recommendedCeStrike} CE.`,
                });
              }
            }
          } else if (stock.circleIndicator === 'RED') {
            const isLocked = alertLatchService.isAlertLatched(stock.ticker, 'RED');
            if (!isLocked) {
              const acquired = await alertLatchService.acquireAlertLatch(stock.ticker, 'RED', {
                spotPrice: stock.spotPrice,
                todayTradedShares: stock.todayTradedShares,
                avg20DTradedShares: stock.avg20DTradedShares,
                volumeRatio: stock.volumeRatio,
                crossoverTime: stock.crossoverTime,
              });
              if (acquired) {
                newJournalEntries.push({
                  id: `sig-${stock.ticker}-${Date.now()}`,
                  timestamp: session.istTime || new Date().toLocaleTimeString('en-IN'),
                  strategyId: '20D_CROSSOVER',
                  strategyName: '20D Volume Crossover',
                  symbol: stock.ticker,
                  signalType: 'SELL',
                  entryPrice: stock.spotPrice,
                  outcome: 'OPEN',
                  notes: `🔴 Crossed 100% of 20D Avg (${(stock.volumeRatio * 100).toFixed(1)}% Vol). Bearish LTP < Open (Distribution).`,
                });
              }
            }
          }
        }
      }

      // Check for NIFTY Breakout 180 trigger journal logging
      if (breakout && breakout.status === 'IN_TRADE' && breakout.activeContract && breakout.ceCandidate && breakout.peCandidate) {
        const symbol = breakout.activeContract === 'CE' ? `${breakout.ceCandidate.strike} CE` : `${breakout.peCandidate.strike} PE`;
        const lockKey = `BREAKOUT_180_${symbol}`;
        if (!alertLatchService.isAlertLatched(lockKey, 'GREEN')) {
          await alertLatchService.acquireAlertLatch(lockKey, 'GREEN', {
            spotPrice: breakout.currentPrice || 180,
            todayTradedShares: 0,
            avg20DTradedShares: 0,
            volumeRatio: 1,
            crossoverTime: breakout.entryTime || session.istTime,
          });
          newJournalEntries.push({
            id: `sig-breakout-${Date.now()}`,
            timestamp: breakout.entryTime || session.istTime,
            strategyId: 'NIFTY_BREAKOUT_180',
            strategyName: 'NIFTY 09:25 ₹180 Breakout',
            symbol: `NIFTY ${symbol}`,
            signalType: 'BUY',
            entryPrice: breakout.entryPrice || 180,
            stopLoss: breakout.fixedStopLoss,
            target: breakout.fixedTarget,
            outcome: 'OPEN',
            notes: `🚀 09:25 Candle Open < ₹180 Breakout Triggered @ ₹${(breakout.entryPrice || 180).toFixed(2)}. Target: ₹220, SL: ₹160.`,
          });
        }
      }

      const greenCount = stocks.filter((s) => s.hasCrossed20D && s.todayTradedShares > 0 && s.circleIndicator === 'GREEN').length;
      const redCount = stocks.filter((s) => s.hasCrossed20D && s.todayTradedShares > 0 && s.circleIndicator === 'RED').length;
      const telemetry = dhanDirectService.getTelemetry();

      const resolvedSpot = niftyIndexQuote && niftyIndexQuote.ltp > 0 ? niftyIndexQuote.ltp : get().niftySpot;
      const liveOobtst = niftyOptionFeedService.evaluateOobtst(resolvedSpot, session.istTime);

      const isOvernightActive = overnight && (overnight.status === 'ACTIVE_HOLD' || overnight.status === 'OVERNIGHT_HOLD');
      const isBreakoutActive = breakout && breakout.status === 'IN_TRADE';
      const signalsTodayCount = greenCount + redCount + (isOvernightActive ? 1 : 0) + (isBreakoutActive ? 1 : 0);

      set((prev) => ({
        marketStatus: session.status,
        istTime: session.istTime,
        stocks,
        niftySpot: resolvedSpot,
        niftyOvernight: overnight,
        oobtstState: liveOobtst,
        niftyBreakout180: breakout,
        signalsTodayCount,
        feedStatus: telemetry.status,
        lastTickTime: telemetry.lastTickTime || session.istTime,
        journal: newJournalEntries.length > 0 ? [...newJournalEntries, ...prev.journal] : prev.journal,
        isRefreshing: false,
      }));
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
      let spotChanged = false;
      let newNiftySpot = get().niftySpot;

      // Check if NIFTY spot tick arrived
      const indexTick = tickBatch[DHAN_NIFTY_INDEX_ID] || tickBatch[`${DHAN_NIFTY_INDEX_ID}-I-IDX`];
      if (indexTick && indexTick.ltp > 0 && indexTick.ltp !== newNiftySpot) {
        newNiftySpot = indexTick.ltp;
        spotChanged = true;
        hasChanged = true;
      }

      const currentStocks = get().stocks;
      let updatedStocks = currentStocks;

      // Map ticks across constituent stocks if any are loaded
      if (currentStocks.length > 0) {
        let stockTickFound = false;
        const nextStocks = currentStocks.map((stock) => {
          const secId = getDhanSecurityId(stock.ticker);
          const tick = tickBatch[secId] || tickBatch[`${secId}-E-NSE`];
          if (!tick || tick.ltp <= 0) return stock;

          stockTickFound = true;
          hasChanged = true;
          const spotPrice = tick.ltp;
          const dayOpen = tick.open > 0 ? tick.open : stock.dayOpen;
          const dayHigh = tick.high > 0 ? tick.high : Math.max(spotPrice, stock.dayHigh);
          const dayLow = tick.low > 0 ? tick.low : Math.min(spotPrice, stock.dayLow);
          const todayTradedShares = tick.volume > 0 ? tick.volume : stock.todayTradedShares;
          const avgShares = stock.avg20DTradedShares || 1;
          const ratio = +(todayTradedShares / avgShares).toFixed(3);
          const hasCrossed = todayTradedShares >= avgShares && todayTradedShares > 0;

          // Determine accurate baseline for percentage change calculation
          // Priority: stock.prevClose > dayOpen > spotPrice
          const prevClose = (stock.prevClose && stock.prevClose > 0)
            ? stock.prevClose
            : (dayOpen > 0 ? dayOpen : spotPrice);

          // Use tick.changePercent if provided by streamer, else compute dynamically from live spotPrice against prevClose
          const pctChange = tick.changePercent !== undefined && tick.changePercent !== 0
            ? tick.changePercent
            : (prevClose > 0 ? +(((spotPrice - prevClose) / prevClose) * 100).toFixed(2) : 0);

          const isBullish = pctChange >= 0 || spotPrice >= dayOpen;

          let circleIndicator: 'GREEN' | 'RED' | 'AMBER' | 'GREY' = 'GREY';
          if (hasCrossed) {
            circleIndicator = isBullish ? 'GREEN' : 'RED';
          } else if (ratio >= 0.8) {
            circleIndicator = 'AMBER';
          }

          return {
            ...stock,
            spotPrice,
            prevClose,
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

        if (stockTickFound) {
          updatedStocks = nextStocks;
        }
      }

      if (hasChanged) {
        const nowTime = new Date().toLocaleTimeString('en-IN');
        const stateUpdates: Partial<RadarStoreState> = {
          feedStatus: 'ONLINE',
          lastTickTime: nowTime,
        };

        if (updatedStocks !== currentStocks) {
          stateUpdates.stocks = updatedStocks;
        }

        if (spotChanged) {
          stateUpdates.niftySpot = newNiftySpot;
          stateUpdates.oobtstState = niftyOptionFeedService.evaluateOobtst(newNiftySpot, get().istTime || nowTime);
          stateUpdates.niftyBreakout180 = niftyOptionFeedService.evaluateBreakout180(newNiftySpot, get().istTime || nowTime);
        }

        set(stateUpdates);
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
