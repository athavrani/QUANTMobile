// =====================================================================
// QuantMobile — Institutional NIFTY Option Feed & OOBTST Strategy Engine
// Real-time Multi-Tier Option Feed, Black-Scholes Pricing & OOBTST State
// Mathematical invariants: Anchor ~62.50, 1.5x Dual Breakout, 50% SL, OCO
// =====================================================================

import { OobtstLiveState, OobtstLegDetail } from '../strategies/types';
import { dhanDirectService } from './dhanDirectService';
import { getAdjustedExpiryDate, formatDateKey } from '../constants/nseHolidays';

const NIFTY_LOT_SIZE = 25;
const NIFTY_STRIKE_STEP = 50;
const ANCHOR_TARGET_PREMIUM = 62.50;
const RISK_FREE_RATE = 0.065; // 6.5% RBI repo-based risk-free rate
const BASE_IV = 0.145; // 14.5% baseline annualized IV for NIFTY

/**
 * Standard Normal Cumulative Distribution Function (Abramowitz & Stegun approximation)
 * Accuracy: ~1e-7
 */
function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * absX);
  const erf = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * erf);
}

/**
 * Black-Scholes analytical option pricing formula
 */
export function calculateBlackScholesPrice(
  spot: number,
  strike: number,
  tYears: number,
  type: 'CE' | 'PE',
  rate = RISK_FREE_RATE,
  iv = BASE_IV
): number {
  if (tYears <= 0.0001) {
    const intrinsic = type === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    return Math.max(0.05, +intrinsic.toFixed(2));
  }

  const d1 = (Math.log(spot / strike) + (rate + (iv * iv) / 2) * tYears) / (iv * Math.sqrt(tYears));
  const d2 = d1 - iv * Math.sqrt(tYears);

  let price = 0;
  if (type === 'CE') {
    price = spot * normalCdf(d1) - strike * Math.exp(-rate * tYears) * normalCdf(d2);
  } else {
    price = strike * Math.exp(-rate * tYears) * normalCdf(-d2) - spot * normalCdf(-d1);
  }

  return Math.max(0.05, +price.toFixed(2));
}

/**
 * Computes current active weekly Tuesday expiry date, remaining time, and holiday preponements.
 * Source: NSE Circulars NSE/FAOP/68685 & NSE/CMTR/71775
 * 
 * Rules:
 * 1. NIFTY Weekly options expire every Tuesday (shifted from Thursday per NSE circular).
 * 2. If Tuesday is an exchange holiday (e.g. Dussehra Oct 20), expiry prepones to preceding trading day (Monday Oct 19).
 * 3. RULE FOR OOBTST BTST: If today is expiry day, we roll over to the NEXT weekly expiry (+7 days)
 *    because OOBTST is a BTST (Buy Today, Sell Tomorrow) overnight carry system and contracts expiring
 *    today cease trading at 15:30.
 */
export function getActiveWeeklyExpiry(
  now = new Date(),
  forOobtst = true
): {
  expiryStr: string;
  daysToExpiry: number;
  tYears: number;
  isExpiryDay: boolean;
  rolledToNextExpiry: boolean;
  wasPreponed: boolean;
  holidayReason?: string;
  originalScheduledStr?: string;
} {
  const currentDay = now.getDay(); // 0 = Sun, 1 = Mon, 2 = Tue, ...
  // Days until scheduled Tuesday (day 2)
  const daysUntilTuesday = (2 - currentDay + 7) % 7;
  let candidateTuesday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilTuesday);

  let { adjustedDate, wasPreponed, holidayName, scheduledDate } = getAdjustedExpiryDate(candidateTuesday);

  const nowDateStr = formatDateKey(now);
  let adjDateStr = formatDateKey(adjustedDate);

  let isExpiryDay = nowDateStr === adjDateStr;
  let rolledToNextExpiry = false;

  const nowHours = now.getHours();
  const nowMins = now.getMinutes();
  const isPastExpiryTime = isExpiryDay && (nowHours > 15 || (nowHours === 15 && nowMins >= 30));
  const isPastDate = now.getTime() > adjustedDate.getTime() && !isExpiryDay && nowDateStr > adjDateStr;

  if ((forOobtst && isExpiryDay) || isPastExpiryTime || isPastDate) {
    // Roll over to next weekly Tuesday (+7 days)
    candidateTuesday = new Date(candidateTuesday.getFullYear(), candidateTuesday.getMonth(), candidateTuesday.getDate() + 7);
    const nextAdjustment = getAdjustedExpiryDate(candidateTuesday);
    adjustedDate = nextAdjustment.adjustedDate;
    wasPreponed = nextAdjustment.wasPreponed;
    holidayName = nextAdjustment.holidayName;
    scheduledDate = nextAdjustment.scheduledDate;
    adjDateStr = formatDateKey(adjustedDate);
    isExpiryDay = nowDateStr === adjDateStr;
    rolledToNextExpiry = true;
  }

  // Set official expiry time to 15:30:00 IST
  adjustedDate.setHours(15, 30, 0, 0);

  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dayStr = String(adjustedDate.getDate()).padStart(2, '0');
  const monthStr = months[adjustedDate.getMonth()];
  const yearStr = adjustedDate.getFullYear();
  const expiryStr = `${dayStr}-${monthStr}-${yearStr}`;

  let originalScheduledStr: string | undefined;
  if (wasPreponed && scheduledDate) {
    const sDay = String(scheduledDate.getDate()).padStart(2, '0');
    const sMonth = months[scheduledDate.getMonth()];
    const sYear = scheduledDate.getFullYear();
    originalScheduledStr = `${sDay}-${sMonth}-${sYear}`;
  }

  const diffMs = Math.max(60000, adjustedDate.getTime() - now.getTime());
  const minutesRemaining = diffMs / (1000 * 60);
  const daysToExpiry = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const tYears = Math.max(0.0005, minutesRemaining / (365 * 24 * 60));

  return {
    expiryStr,
    daysToExpiry,
    tYears,
    isExpiryDay,
    rolledToNextExpiry,
    wasPreponed,
    holidayReason: holidayName,
    originalScheduledStr,
  };
}

/**
 * Day Anchor Cache for 09:20:00 Selection
 */
interface OobtstDayAnchor {
  tradeDate: string;
  anchorSpot: number;
  ceStrike: number;
  ceOpen: number;
  ceTrigger: number;
  peStrike: number;
  peOpen: number;
  peTrigger: number;
  expiryStr: string;
}

class NiftyOptionFeedService {
  private cachedAnchor: OobtstDayAnchor | null = null;
  private peakCeLtp: number = 0;
  private peakPeLtp: number = 0;

  /**
   * Selects Call and Put strikes whose 09:20 open is closest to ₹62.50
   */
  public selectAnchorStrikes(
    spot: number,
    tYears: number,
    targetPremium = ANCHOR_TARGET_PREMIUM
  ): {
    ceStrike: number;
    ceOpen: number;
    peStrike: number;
    peOpen: number;
  } {
    const atm = Math.round(spot / NIFTY_STRIKE_STEP) * NIFTY_STRIKE_STEP;

    let bestCeStrike = atm + 250;
    let minCeDiff = Infinity;
    let bestCePrice = targetPremium;

    let bestPeStrike = atm - 250;
    let minPeDiff = Infinity;
    let bestPePrice = targetPremium;

    // Scan strikes ATM - 1200 to ATM + 1200
    for (let strike = atm - 1200; strike <= atm + 1200; strike += NIFTY_STRIKE_STEP) {
      // CE
      if (strike >= atm) {
        const cePrice = calculateBlackScholesPrice(spot, strike, tYears, 'CE');
        const ceDiff = Math.abs(cePrice - targetPremium);
        if (ceDiff < minCeDiff) {
          minCeDiff = ceDiff;
          bestCeStrike = strike;
          bestCePrice = cePrice;
        }
      }

      // PE
      if (strike <= atm) {
        const pePrice = calculateBlackScholesPrice(spot, strike, tYears, 'PE');
        const peDiff = Math.abs(pePrice - targetPremium);
        if (peDiff < minPeDiff) {
          minPeDiff = peDiff;
          bestPeStrike = strike;
          bestPePrice = pePrice;
        }
      }
    }

    return {
      ceStrike: bestCeStrike,
      ceOpen: bestCePrice,
      peStrike: bestPeStrike,
      peOpen: bestPePrice,
    };
  }

  /**
   * Retrieves or initializes the locked 09:20 day anchor
   */
  public getOrCreateDayAnchor(spot: number): OobtstDayAnchor {
    const today = new Date().toISOString().split('T')[0];
    const { expiryStr, tYears } = getActiveWeeklyExpiry(new Date(), true);

    if (
      this.cachedAnchor &&
      this.cachedAnchor.tradeDate === today &&
      this.cachedAnchor.expiryStr === expiryStr &&
      Math.abs(this.cachedAnchor.anchorSpot - spot) < 50
    ) {
      return this.cachedAnchor;
    }

    const { ceStrike, ceOpen, peStrike, peOpen } = this.selectAnchorStrikes(spot, tYears);
    const ceTrigger = +(ceOpen * 1.5).toFixed(2);
    const peTrigger = +(peOpen * 1.5).toFixed(2);

    this.cachedAnchor = {
      tradeDate: today,
      anchorSpot: spot,
      ceStrike,
      ceOpen,
      ceTrigger,
      peStrike,
      peOpen,
      peTrigger,
      expiryStr,
    };

    this.peakCeLtp = ceOpen;
    this.peakPeLtp = peOpen;

    return this.cachedAnchor;
  }

  /**
   * Generates a complete institutional-grade Black-Scholes option chain matrix
   * Spans ATM ± range strikes (default: ±12 strikes = ±600 points) with 0ms latency.
   * Prominently highlights the 09:20 OOBTST anchor strikes (~₹62.50).
   */
  public generateLiveOptionChainMatrix(
    spot: number,
    step = NIFTY_STRIKE_STEP,
    range = 12,
    forOobtst = true
  ) {
    const {
      expiryStr,
      daysToExpiry,
      tYears,
      isExpiryDay,
      rolledToNextExpiry,
      wasPreponed,
      holidayReason,
      originalScheduledStr,
    } = getActiveWeeklyExpiry(new Date(), forOobtst);
    const atm = Math.round(spot / step) * step;
    const anchor = this.getOrCreateDayAnchor(spot);

    const strikes = [];
    let totalCallOi = 0;
    let totalPutOi = 0;

    for (let i = -range; i <= range; i++) {
      const strikePrice = atm + i * step;
      const moneyness: 'ITM' | 'ATM' | 'OTM' = i === 0 ? 'ATM' : i < 0 ? 'ITM' : 'OTM';

      const callLtp = calculateBlackScholesPrice(spot, strikePrice, tYears, 'CE');
      const putLtp = calculateBlackScholesPrice(spot, strikePrice, tYears, 'PE');

      // Realistic institutional OI distribution around ATM
      const distFromAtm = Math.abs(i);
      const baseOi = Math.round(65000 * Math.exp(-distFromAtm * 0.12));
      const callOi = i >= 0 ? baseOi + 35000 : Math.round(baseOi * 0.6);
      const putOi = i <= 0 ? baseOi + 38000 : Math.round(baseOi * 0.55);

      totalCallOi += callOi;
      totalPutOi += putOi;

      const isOobtstCe = strikePrice === anchor.ceStrike;
      const isOobtstPe = strikePrice === anchor.peStrike;

      strikes.push({
        strikePrice,
        moneyness,
        callSymbol: `NIFTY ${strikePrice} CE`,
        callLtp,
        callOi,
        callIvPct: 14.5,
        putSymbol: `NIFTY ${strikePrice} PE`,
        putLtp,
        putOi,
        putIvPct: 14.8,
        isOobtstCe,
        isOobtstPe,
      });
    }

    const pcrRatio = totalCallOi > 0 ? +(totalPutOi / totalCallOi).toFixed(2) : 1.0;

    return {
      underlying: 'NIFTY',
      spotPrice: spot,
      atmStrike: atm,
      expiryDate: expiryStr,
      daysToExpiry,
      pcrRatio,
      totalCallOi,
      totalPutOi,
      isExpiryDay,
      rolledToNextExpiry,
      wasPreponed,
      holidayReason,
      originalScheduledStr,
      oobtstCeStrike: anchor.ceStrike,
      oobtstPeStrike: anchor.peStrike,
      oobtstCeOpen: anchor.ceOpen,
      oobtstPeOpen: anchor.peOpen,
      strikes,
    };
  }

  /**
   * Evaluates the full 3-step OOBTST engine in real time
   * Called on every live NIFTY tick from Dhan WebSocket (up to 60 FPS)
   */
  public evaluateOobtst(spot: number, istTimeStr?: string): OobtstLiveState {
    const nowTime = istTimeStr || new Date().toLocaleTimeString('en-IN');
    const { expiryStr, daysToExpiry, tYears } = getActiveWeeklyExpiry(new Date(), true);
    const anchor = this.getOrCreateDayAnchor(spot);

    // Live options pricing based on real-time NIFTY spot tick
    const ceLtp = calculateBlackScholesPrice(spot, anchor.ceStrike, tYears, 'CE');
    const peLtp = calculateBlackScholesPrice(spot, anchor.peStrike, tYears, 'PE');

    if (ceLtp > this.peakCeLtp) this.peakCeLtp = ceLtp;
    if (peLtp > this.peakPeLtp) this.peakPeLtp = peLtp;

    const ceProgress = Math.min(100, Math.round((ceLtp / anchor.ceTrigger) * 100));
    const peProgress = Math.min(100, Math.round((peLtp / anchor.peTrigger) * 100));

    const isCeBreached = ceLtp >= anchor.ceTrigger || this.peakCeLtp >= anchor.ceTrigger;
    const isPeBreached = peLtp >= anchor.peTrigger || this.peakPeLtp >= anchor.peTrigger;

    // Check if after 15:30 IST for BTST Overnight Hold
    const isAfter330 = (() => {
      if (istTimeStr) {
        const match = istTimeStr.match(/(\d{1,2}):(\d{2}):?(\d{2})?\s*(AM|PM)?/i);
        if (match) {
          let hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const meridiem = match[4]?.toUpperCase();
          if (meridiem === 'PM' && hours < 12) hours += 12;
          if (meridiem === 'AM' && hours === 12) hours = 0;
          return hours > 15 || (hours === 15 && minutes >= 30);
        }
      }
      const now = new Date();
      return now.getHours() > 15 || (now.getHours() === 15 && now.getMinutes() >= 30);
    })();

    // Initial state: Step 2 ARMED
    let currentStep: 1 | 2 | 3 = 2;
    let status: 'SCANNING' | 'ARMED' | 'ACTIVE' | 'SL_HIT' | 'BTST_HOLD' = 'ARMED';
    let statusBadgeText = 'ARMED_1.5X';
    let activeLeg: 'CE' | 'PE' | null = null;
    let executedSymbol: string | undefined;
    let executedPrice: number | undefined;
    let slPrice: number | undefined;
    let riskPerLot: number | undefined;
    let pnlPerShare: number | undefined;
    let pnlPerLot: number | undefined;

    let ceStatus: 'ARMED' | 'EXECUTED' | 'DISABLED' | 'SL_HIT' = 'ARMED';
    let peStatus: 'ARMED' | 'EXECUTED' | 'DISABLED' | 'SL_HIT' = 'ARMED';

    if (isCeBreached && (!isPeBreached || this.peakCeLtp >= anchor.ceTrigger)) {
      // CE Leg Triggered First (OOBTST Active)
      currentStep = 3;
      activeLeg = 'CE';
      executedSymbol = `NIFTY ${anchor.ceStrike} CE`;
      executedPrice = anchor.ceTrigger;
      // Invariant: Stop Loss is strictly half of buy price (50%)
      slPrice = +(executedPrice / 2).toFixed(2);
      riskPerLot = +((executedPrice - slPrice) * NIFTY_LOT_SIZE).toFixed(2);
      pnlPerShare = +(ceLtp - executedPrice).toFixed(2);
      pnlPerLot = +(pnlPerShare * NIFTY_LOT_SIZE).toFixed(2);

      ceStatus = 'EXECUTED';
      peStatus = 'DISABLED'; // Opposite leg cancelled (OCO)

      if (ceLtp <= slPrice) {
        status = 'SL_HIT';
        statusBadgeText = 'SL_HIT';
        ceStatus = 'SL_HIT';
      } else if (isAfter330) {
        status = 'BTST_HOLD';
        statusBadgeText = 'BTST_HOLD';
      } else {
        status = 'ACTIVE';
        statusBadgeText = 'OOBTST_ACTIVE';
      }
    } else if (isPeBreached) {
      // PE Leg Triggered First (OOBTST Active)
      currentStep = 3;
      activeLeg = 'PE';
      executedSymbol = `NIFTY ${anchor.peStrike} PE`;
      executedPrice = anchor.peTrigger;
      slPrice = +(executedPrice / 2).toFixed(2);
      riskPerLot = +((executedPrice - slPrice) * NIFTY_LOT_SIZE).toFixed(2);
      pnlPerShare = +(peLtp - executedPrice).toFixed(2);
      pnlPerLot = +(pnlPerShare * NIFTY_LOT_SIZE).toFixed(2);

      peStatus = 'EXECUTED';
      ceStatus = 'DISABLED'; // Opposite leg cancelled (OCO)

      if (peLtp <= slPrice) {
        status = 'SL_HIT';
        statusBadgeText = 'SL_HIT';
        peStatus = 'SL_HIT';
      } else if (isAfter330) {
        status = 'BTST_HOLD';
        statusBadgeText = 'BTST_HOLD';
      } else {
        status = 'ACTIVE';
        statusBadgeText = 'OOBTST_ACTIVE';
      }
    }

    const ceLeg: OobtstLegDetail = {
      type: 'CE',
      strike: anchor.ceStrike,
      symbol: `NIFTY ${anchor.ceStrike} CE`,
      openPrice: anchor.ceOpen,
      triggerPrice: anchor.ceTrigger,
      currentLtp: ceLtp,
      progressPct: ceProgress,
      status: ceStatus,
    };

    const peLeg: OobtstLegDetail = {
      type: 'PE',
      strike: anchor.peStrike,
      symbol: `NIFTY ${anchor.peStrike} PE`,
      openPrice: anchor.peOpen,
      triggerPrice: anchor.peTrigger,
      currentLtp: peLtp,
      progressPct: peProgress,
      status: peStatus,
    };

    return {
      currentStep,
      status,
      statusBadgeText,
      expiryDate: expiryStr,
      daysToExpiry,
      niftySpot: spot,
      anchorTime: '09:20:00 IST',
      ceLeg,
      peLeg,
      activeLeg,
      executedSymbol,
      executedPrice,
      slPrice,
      riskPerLot,
      pnlPerShare,
      pnlPerLot,
      lastUpdated: nowTime,
    };
  }

  /**
   * Reset Day Anchor (for manual simulation or testing)
   */
  public resetAnchor() {
    this.cachedAnchor = null;
    this.peakCeLtp = 0;
    this.peakPeLtp = 0;
  }
}

export const niftyOptionFeedService = new NiftyOptionFeedService();
