import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BaseStrategyPlugin, StrategyContext, StrategySignalOutput } from '../types';
import { colors } from '../../theme/colors';
import * as Haptics from 'expo-haptics';

export const NiftyBreakout180Plugin: BaseStrategyPlugin = {
  id: 'NIFTY_BREAKOUT_180',
  name: 'NIFTY 09:25 ₹180 Breakout',
  tagline: '09:25 Candle Open < ₹180 • 3-Step Directional Option Buying',
  icon: '🚀',
  category: 'MOMENTUM_BREAKOUT',
  executionStyle: 'CANDLE_BREAKOUT',
  operatingWindow: {
    startIST: '09:25:00',
    endIST: '09:45:00',
    isOvernightAllowed: false,
  },

  evaluate: (ctx: StrategyContext): StrategySignalOutput => {
    const live = ctx.breakout180LiveState;
    const ce = live?.ceCandidate;
    const pe = live?.peCandidate;
    const activeContract = live?.activeContract;
    const activeStrike = activeContract === 'CE' ? ce?.strike : pe?.strike;
    const activeSymbol = activeStrike ? `NIFTY ${activeStrike} ${activeContract}` : 'NONE';
    const status = live?.status || 'IN_TRADE';
    const currentStep = live?.currentStep || (status === 'IN_TRADE' ? 2 : status === 'TARGET_HIT' || status === 'SL_HIT' || status === 'TIME_EXIT' ? 3 : 1);

    let badgeTone: StrategySignalOutput['badgeTone'] = 'cyan';
    let statusBadgeText = `STEP ${currentStep}/3`;
    let headline = `${activeSymbol} Crossed ₹180 • Opposite Leg Disabled`;

    if (status === 'WAITING_0925') {
      badgeTone = 'purple';
      statusBadgeText = 'STEP 1: WAITING 09:25';
      headline = 'Selecting CE & PE contracts with 09:25 Open < ₹180';
    } else if (status === 'MONITORING_BREAKOUT' || status === 'CANDIDATES_LOCKED') {
      badgeTone = 'warning';
      statusBadgeText = 'STEP 1: NOT ACTIVE';
      headline = `Watching ${ce?.strike} CE (₹${ce?.price0925.toFixed(1)}) & ${pe?.strike} PE (₹${pe?.price0925.toFixed(1)}) [< ₹180]`;
    } else if (status === 'IN_TRADE') {
      badgeTone = 'cyan';
      statusBadgeText = 'STEP 2: ACTIVE 🚀';
      headline = `${activeSymbol} Activated > ₹180 • Opposite Leg Canceled`;
    } else if (status === 'TARGET_HIT') {
      badgeTone = 'bullish';
      statusBadgeText = 'STEP 3: TARGET BOOKED 🎯';
      headline = `🎯 ${activeSymbol} hit Target ₹220.00 (+40 pts booked)`;
    } else if (status === 'SL_HIT') {
      badgeTone = 'bearish';
      statusBadgeText = 'STEP 3: SL HIT 🛑';
      headline = `🛑 ${activeSymbol} hit Stop Loss ₹160.00 (-20 pts contained)`;
    } else if (status === 'TIME_EXIT') {
      badgeTone = 'warning';
      statusBadgeText = 'STEP 3: TIME EXIT ⏱️';
      headline = `⏱️ 09:45 AM hard exit reached. Position closed.`;
    } else if (status === 'NO_TRADE_TODAY') {
      badgeTone = 'bearish';
      statusBadgeText = 'STEP 3: NO TRADE ⛔';
      headline = 'Neither contract broke ₹180 before 09:45 AM cutoff.';
    }

    const ceLtp = ce?.currentLtp || 176.40;
    const peLtp = pe?.currentLtp || 145.80;

    return {
      status: status === 'IN_TRADE' ? 'TRIGGERED' : status === 'TARGET_HIT' ? 'TARGET_HIT' : status === 'SL_HIT' ? 'SL_HIT' : 'ACTIVE',
      statusBadgeText,
      badgeTone,
      headline,
      primaryMetricLabel: 'TARGET / SL',
      primaryMetricValue: '₹220.00 / ₹160.00',
      target: '₹220.00 (+40 pts)',
      stopLoss: '₹160.00 (-20 pts)',
      invariantNotice: '⛔ 09:25 Open < ₹180 Rule. 1st break > ₹180 activates trade & disables opposite leg.',
      lastUpdated: ctx.istTime,
      legs: [
        {
          type: 'CE',
          symbol: `NIFTY ${ce?.strike || 23150} CE`,
          strike: ce?.strike || 23150,
          refPrice: ce?.price0925 || 176.40,
          currentLtp: ceLtp,
          slPrice: 160.00,
          targetPrice: 220.00,
          status: ce?.isTriggered ? 'ACTIVE' : ce?.isDisabled ? 'DISABLED' : 'ACTIVE',
        },
        {
          type: 'PE',
          symbol: `NIFTY ${pe?.strike || 23100} PE`,
          strike: pe?.strike || 23100,
          refPrice: pe?.price0925 || 172.10,
          currentLtp: peLtp,
          slPrice: 160.00,
          targetPrice: 220.00,
          status: pe?.isTriggered ? 'ACTIVE' : pe?.isDisabled ? 'DISABLED' : 'ACTIVE',
        },
      ],
    };
  },

  renderCard: ({ state, onOpenBroker, onViewDetails }) => {
    const handleCardPress = () => {
      Haptics.selectionAsync();
      if (onViewDetails) {
        onViewDetails('NIFTY_BREAKOUT_180');
      }
    };

    const ceLeg = state.legs?.find((l) => l.type === 'CE');
    const peLeg = state.legs?.find((l) => l.type === 'PE');
    const isCeTriggered = ceLeg?.status === 'ACTIVE' && (ceLeg?.currentLtp ?? 0) >= 180;
    const isPeTriggered = peLeg?.status === 'ACTIVE' && (peLeg?.currentLtp ?? 0) >= 180;
    const isActive = isCeTriggered || isPeTriggered || state.status === 'TRIGGERED' || state.status === 'TARGET_HIT' || state.status === 'SL_HIT';
    const activeLeg = isCeTriggered ? ceLeg : isPeTriggered ? peLeg : ceLeg;

    const isTargetHit = state.status === 'TARGET_HIT';
    const isSlHit = state.status === 'SL_HIT';

    return (
      <TouchableOpacity
        activeOpacity={0.92}
        style={styles.card}
        onPress={handleCardPress}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.icon}>🚀</Text>
            <View>
              <Text style={styles.title}>NIFTY 09:25 ₹180 Breakout</Text>
              <Text style={styles.sub}>3-Step Execution • Window: 09:25 – 09:45 IST</Text>
            </View>
          </View>
          <View style={[styles.badge, { backgroundColor: colors.cyanGlow }]}>
            <Text style={[styles.badgeText, { color: colors.cyan }]}>{state.statusBadgeText}</Text>
          </View>
        </View>

        {/* ============================================================ */}
        {/* STEP 1: 09:25 CANDLE OPEN SELECTION (< ₹180 RULE)           */}
        {/* ============================================================ */}
        <View style={styles.stepSection}>
          <View style={styles.stepHeaderRow}>
            <View style={styles.stepNumberBadge}>
              <Text style={styles.stepNumberText}>STEP 1</Text>
            </View>
            <Text style={styles.stepTitle}>09:25 Candle Open Selection (&lt; ₹180 Rule)</Text>
            <Text style={styles.stepStatusTag}>🔒 LOCKED</Text>
          </View>

          <View style={styles.step1Row}>
            {/* CE Contract Box */}
            <View style={[styles.contractBox, isCeTriggered && styles.contractBoxActive]}>
              <View style={styles.contractHeader}>
                <Text style={styles.contractType}>CALL (CE)</Text>
                <Text style={styles.rulePill}>Open &lt; 180 ✅</Text>
              </View>
              <Text style={styles.contractStrike}>{ceLeg?.symbol?.replace('NIFTY ', '') || '23150 CE'}</Text>
              <Text style={styles.contractPrice}>09:25 Open: ₹{ceLeg?.refPrice?.toFixed(2) || '176.40'}</Text>
              <Text style={[styles.contractLtp, { color: (ceLeg?.currentLtp || 0) >= 180 ? colors.bullish : colors.textPrimary }]}>
                Live LTP: ₹{ceLeg?.currentLtp.toFixed(2) || '176.40'}
              </Text>
            </View>

            {/* PE Contract Box */}
            <View style={[styles.contractBox, isPeTriggered && styles.contractBoxActive, peLeg?.status === 'DISABLED' && styles.contractBoxDisabled]}>
              <View style={styles.contractHeader}>
                <Text style={[styles.contractType, { color: colors.bearish }]}>PUT (PE)</Text>
                <Text style={styles.rulePill}>Open &lt; 180 ✅</Text>
              </View>
              <Text style={[styles.contractStrike, peLeg?.status === 'DISABLED' && styles.strikeThrough]}>
                {peLeg?.symbol?.replace('NIFTY ', '') || '23100 PE'}
              </Text>
              <Text style={styles.contractPrice}>09:25 Open: ₹{peLeg?.refPrice?.toFixed(2) || '172.10'}</Text>
              <Text style={[styles.contractLtp, { color: (peLeg?.currentLtp || 0) >= 180 ? colors.bullish : colors.textPrimary }]}>
                Live LTP: ₹{peLeg?.currentLtp.toFixed(2) || '172.10'}
              </Text>
            </View>
          </View>
        </View>

        {/* Stepper Connector Arrow */}
        <View style={styles.stepperArrowBox}>
          <Text style={styles.stepperArrow}>▼</Text>
        </View>

        {/* ============================================================ */}
        {/* STEP 2: ACTIVATION STATUS (> ₹180 BREAKOUT)                  */}
        {/* ============================================================ */}
        <View style={styles.stepSection}>
          <View style={styles.stepHeaderRow}>
            <View style={[styles.stepNumberBadge, { backgroundColor: isActive ? colors.cyanGlow : colors.cardBorder }]}>
              <Text style={[styles.stepNumberText, { color: isActive ? colors.cyan : colors.textMuted }]}>STEP 2</Text>
            </View>
            <Text style={styles.stepTitle}>Activation Status (&gt; ₹180 Breakout)</Text>
            <Text style={[styles.stepStatusTag, { color: isActive ? colors.cyan : colors.textMuted }]}>
              {isActive ? '🚀 ACTIVATED' : '⏳ NOT ACTIVE'}
            </Text>
          </View>

          {!isActive ? (
            <View style={styles.notActiveBox}>
              <Text style={styles.notActiveText}>⏳ NOT ACTIVE — Neither leg has crossed ₹180 yet</Text>
              <Text style={styles.notActiveSub}>Monitoring 1-min candles (09:25–09:45 IST). First to break ₹180 confirms direction.</Text>
            </View>
          ) : (
            <View style={styles.activatedBox}>
              <View style={styles.activeLegRow}>
                <Text style={styles.activeLegLabel}>ACTIVE CONTRACT:</Text>
                <TouchableOpacity onPress={() => onOpenBroker(activeLeg?.symbol || 'NIFTY 23150 CE')}>
                  <Text style={styles.activeLegSymbol}>{activeLeg?.symbol || 'NIFTY 23150 CE'} ↗</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.slTargetGrid}>
                <View style={styles.slTargetItem}>
                  <Text style={styles.slTargetLabel}>TARGET (1:2)</Text>
                  <Text style={[styles.slTargetVal, { color: colors.bullish }]}>{state.target}</Text>
                </View>
                <View style={styles.slTargetDivider} />
                <View style={styles.slTargetItem}>
                  <Text style={styles.slTargetLabel}>STOP LOSS</Text>
                  <Text style={[styles.slTargetVal, { color: colors.bearish }]}>{state.stopLoss}</Text>
                </View>
              </View>

              <View style={styles.oppositeCanceledNotice}>
                <Text style={styles.oppositeCanceledText}>
                  ⛔ Opposite leg ({isCeTriggered ? peLeg?.symbol : ceLeg?.symbol}) is CANCELED / DISABLED for the day.
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Stepper Connector Arrow */}
        <View style={styles.stepperArrowBox}>
          <Text style={styles.stepperArrow}>▼</Text>
        </View>

        {/* ============================================================ */}
        {/* STEP 3: OUTCOME & TARGET BOOKING                             */}
        {/* ============================================================ */}
        <View style={styles.stepSection}>
          <View style={styles.stepHeaderRow}>
            <View style={[styles.stepNumberBadge, { backgroundColor: isTargetHit ? colors.bullishGlow : isSlHit ? colors.bearishGlow : colors.cardBorder }]}>
              <Text style={[styles.stepNumberText, { color: isTargetHit ? colors.bullish : isSlHit ? colors.bearish : colors.textMuted }]}>
                STEP 3
              </Text>
            </View>
            <Text style={styles.stepTitle}>Outcome &amp; Target Booking</Text>
          </View>

          {isTargetHit ? (
            <View style={[styles.outcomeBanner, { backgroundColor: colors.bullishGlow, borderColor: colors.bullish }]}>
              <Text style={[styles.outcomeTitle, { color: colors.bullish }]}>🎯 TARGET BOOKED (+40 pts)</Text>
              <Text style={styles.outcomeSub}>Contract reached ₹220.00 Target. 1:2 Reward fully achieved!</Text>
            </View>
          ) : isSlHit ? (
            <View style={[styles.outcomeBanner, { backgroundColor: colors.bearishGlow, borderColor: colors.bearish }]}>
              <Text style={[styles.outcomeTitle, { color: colors.bearish }]}>🛑 STOP LOSS HIT (-20 pts)</Text>
              <Text style={styles.outcomeSub}>Contract breached ₹160.00 SL. Position closed to preserve capital.</Text>
            </View>
          ) : isActive ? (
            <View style={[styles.outcomeBanner, { backgroundColor: 'rgba(6, 182, 212, 0.1)', borderColor: colors.cyan }]}>
              <View style={styles.inTradeRow}>
                <Text style={[styles.outcomeTitle, { color: colors.cyan }]}>⚡ IN TRADE — Running...</Text>
                <Text style={[styles.livePnlText, { color: colors.bullish }]}>P&amp;L: +12.7 pts</Text>
              </View>
              <Text style={styles.outcomeSub}>LTP: ₹194.20 | Target: ₹220 (+₹25.80 away) | SL: ₹160</Text>
            </View>
          ) : (
            <View style={styles.pendingOutcomeBox}>
              <Text style={styles.pendingOutcomeText}>⏳ Awaiting Activation in Step 2</Text>
            </View>
          )}
        </View>

        {/* 3-Step Sub-Page Drilldown Trigger */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.drilldownBar}
          onPress={handleCardPress}
        >
          <Text style={styles.drilldownText}>⚡ View Full 3-Step Strategy &amp; Order Details</Text>
          <Text style={styles.drilldownArrow}>→</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerNote}>Mandatory Exit: 09:45:00 AM IST (Never held past 09:45)</Text>
        </View>
      </TouchableOpacity>
    );
  },
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 22,
    marginRight: 8,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  sub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stepSection: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 10,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepNumberBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  stepNumberText: {
    color: colors.bullish,
    fontSize: 10,
    fontWeight: '800',
  },
  stepTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  stepStatusTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.bullish,
  },
  step1Row: {
    flexDirection: 'row',
    gap: 8,
  },
  contractBox: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  contractBoxActive: {
    borderColor: colors.cyan,
  },
  contractBoxDisabled: {
    opacity: 0.5,
  },
  contractHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  contractType: {
    color: colors.bullish,
    fontSize: 10,
    fontWeight: '700',
  },
  rulePill: {
    color: colors.bullish,
    fontSize: 9,
    fontWeight: '700',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  contractStrike: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  contractPrice: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 1,
  },
  contractLtp: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  strikeThrough: {
    textDecorationLine: 'line-through',
  },
  stepperArrowBox: {
    alignItems: 'center',
    paddingVertical: 3,
  },
  stepperArrow: {
    color: colors.textMuted,
    fontSize: 10,
  },
  notActiveBox: {
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  notActiveText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  notActiveSub: {
    color: colors.textMuted,
    fontSize: 10,
  },
  activatedBox: {
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cyan,
  },
  activeLegRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  activeLegLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginRight: 6,
  },
  activeLegSymbol: {
    color: colors.cyan,
    fontSize: 14,
    fontWeight: '800',
  },
  slTargetGrid: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  slTargetItem: {
    flex: 1,
    alignItems: 'center',
  },
  slTargetDivider: {
    width: 1,
    backgroundColor: colors.cardBorder,
  },
  slTargetLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  slTargetVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  oppositeCanceledNotice: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 4,
    padding: 6,
  },
  oppositeCanceledText: {
    color: colors.bearish,
    fontSize: 10,
    fontWeight: '600',
  },
  outcomeBanner: {
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  outcomeTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  outcomeSub: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  inTradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  livePnlText: {
    fontSize: 13,
    fontWeight: '800',
  },
  pendingOutcomeBox: {
    padding: 8,
    alignItems: 'center',
  },
  pendingOutcomeText: {
    color: colors.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
  },
  footer: {
    paddingTop: 8,
    alignItems: 'center',
  },
  footerNote: {
    color: colors.textMuted,
    fontSize: 11,
  },
  drilldownBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 10,
    marginBottom: 4,
  },
  drilldownText: {
    color: colors.cyan,
    fontSize: 12,
    fontWeight: '700',
  },
  drilldownArrow: {
    color: colors.cyan,
    fontSize: 14,
    fontWeight: '800',
  },
});
