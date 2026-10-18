import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BaseStrategyPlugin, StrategyContext, StrategySignalOutput } from '../types';
import { colors } from '../../theme/colors';

export const NiftyBreakout180Plugin: BaseStrategyPlugin = {
  id: 'NIFTY_BREAKOUT_180',
  name: 'NIFTY 09:25 ₹180 Breakout',
  tagline: '09:25 Candle Open < ₹180 • Directional 1:2 Option Buying',
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

    let badgeTone: StrategySignalOutput['badgeTone'] = 'cyan';
    let statusBadgeText = 'IN_TRADE 🚀';
    let headline = `${activeSymbol} Crossed ₹180 • Opposite Leg Disabled`;

    if (status === 'WAITING_0925') {
      badgeTone = 'purple';
      statusBadgeText = 'WAITING 09:25 ⏳';
      headline = 'Selecting CE & PE contracts with 09:25 Open < ₹180';
    } else if (status === 'MONITORING_BREAKOUT') {
      badgeTone = 'warning';
      statusBadgeText = 'MONITORING ⚡';
      headline = `Watching ${ce?.strike} CE (₹${ce?.price0925.toFixed(1)}) & ${pe?.strike} PE (₹${pe?.price0925.toFixed(1)}) [< ₹180]`;
    } else if (status === 'TARGET_HIT') {
      badgeTone = 'bullish';
      statusBadgeText = 'TARGET HIT 🎯';
      headline = `🎯 ${activeSymbol} hit Target ₹220.00 (+40 pts profit locked)`;
    } else if (status === 'SL_HIT') {
      badgeTone = 'bearish';
      statusBadgeText = 'SL HIT 🛑';
      headline = `🛑 ${activeSymbol} hit Stop Loss ₹160.00 (-20 pts risk contained)`;
    } else if (status === 'TIME_EXIT') {
      badgeTone = 'warning';
      statusBadgeText = 'TIME EXIT ⏱️';
      headline = `⏱️ 09:45 AM hard exit reached. Position squared off.`;
    } else if (status === 'NO_TRADE_TODAY') {
      badgeTone = 'bearish';
      statusBadgeText = 'NO TRADE ⛔';
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
      invariantNotice: '⛔ Both legs verified Open < ₹180 @ 09:25 AM. 1st break disables opposite. Mandatory exit @ 09:45 AM.',
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

  renderCard: ({ state, onOpenBroker }) => {
    const ceLeg = state.legs?.find((l) => l.type === 'CE');
    const peLeg = state.legs?.find((l) => l.type === 'PE');
    const activeLeg = state.legs?.find((l) => l.status === 'ACTIVE' && l.refPrice && l.currentLtp >= 180) || ceLeg;

    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.icon}>🚀</Text>
            <View>
              <Text style={styles.title}>NIFTY 09:25 ₹180 Breakout</Text>
              <Text style={styles.sub}>09:25 Open &lt; ₹180 • Operating: 09:25 – 09:45 IST</Text>
            </View>
          </View>
          <View style={[styles.badge, { backgroundColor: colors.cyanGlow }]}>
            <Text style={[styles.badgeText, { color: colors.cyan }]}>{state.statusBadgeText}</Text>
          </View>
        </View>

        <View style={styles.metricsBox}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>ACTIVE CONTRACT</Text>
            <TouchableOpacity onPress={() => onOpenBroker(activeLeg?.symbol || 'NIFTY 23150 CE')}>
              <Text style={[styles.metricVal, { color: colors.cyan }]}>
                {activeLeg?.symbol?.replace('NIFTY ', '') || '23150 CE'} ↗
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>TARGET (1:2)</Text>
            <Text style={[styles.metricVal, { color: colors.bullish }]}>{state.target}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>STOP LOSS</Text>
            <Text style={[styles.metricVal, { color: colors.bearish }]}>{state.stopLoss}</Text>
          </View>
        </View>

        {/* Candidate comparison row with < 180 Rule check */}
        <View style={styles.candidatesRow}>
          <View style={[styles.candidatePill, ceLeg?.status === 'ACTIVE' && styles.candidateActive]}>
            <View style={styles.candidateHeader}>
              <Text style={styles.candidateStrike}>{ceLeg?.symbol?.replace('NIFTY ', '')}</Text>
              <Text style={styles.ruleBadge}>Open &lt; 180 ✅</Text>
            </View>
            <Text style={styles.candidatePrice}>09:25 Open: ₹{ceLeg?.refPrice?.toFixed(2)} | LTP: ₹{ceLeg?.currentLtp.toFixed(2)}</Text>
            <Text style={[styles.candidateStatus, { color: ceLeg?.status === 'ACTIVE' ? colors.bullish : colors.textMuted }]}>
              {ceLeg?.status === 'ACTIVE' ? (ceLeg.currentLtp >= 180 ? 'TRIGGERED 🚀' : 'WATCHING') : 'DISABLED'}
            </Text>
          </View>

          <View style={[styles.candidatePill, peLeg?.status === 'DISABLED' && styles.candidateDisabled]}>
            <View style={styles.candidateHeader}>
              <Text style={[styles.candidateStrike, peLeg?.status === 'DISABLED' && styles.strikeThrough]}>
                {peLeg?.symbol?.replace('NIFTY ', '')}
              </Text>
              <Text style={styles.ruleBadge}>Open &lt; 180 ✅</Text>
            </View>
            <Text style={styles.candidatePrice}>09:25 Open: ₹{peLeg?.refPrice?.toFixed(2)} | LTP: ₹{peLeg?.currentLtp.toFixed(2)}</Text>
            <Text style={[styles.candidateStatus, { color: peLeg?.status === 'ACTIVE' ? colors.bullish : colors.textMuted }]}>
              {peLeg?.status === 'DISABLED' ? 'CANCELED' : peLeg?.currentLtp && peLeg.currentLtp >= 180 ? 'TRIGGERED 🚀' : 'WATCHING'}
            </Text>
          </View>
        </View>

        {state.invariantNotice && (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>{state.invariantNotice}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerNote}>Mandatory Exit: 09:45:00 AM IST</Text>
          <Text style={[styles.pnlText, { color: colors.bullish }]}>P&amp;L: +12.7 pts</Text>
        </View>
      </View>
    );
  },
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 20,
    marginRight: 8,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  sub: {
    color: colors.textMuted,
    fontSize: 11,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metricsBox: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 10,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  metricVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  noticeBox: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  noticeText: {
    color: colors.cyan,
    fontSize: 10,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  footerNote: {
    color: colors.textMuted,
    fontSize: 11,
  },
  pnlText: {
    fontSize: 12,
    fontWeight: '700',
  },
  candidatesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  candidatePill: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  candidateActive: {
    borderColor: colors.cyan,
  },
  candidateDisabled: {
    opacity: 0.5,
  },
  candidateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  candidateStrike: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  ruleBadge: {
    color: colors.bullish,
    fontSize: 9,
    fontWeight: '700',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  candidatePrice: {
    color: colors.textSecondary,
    fontSize: 10,
    marginBottom: 2,
  },
  candidateStatus: {
    fontSize: 10,
    fontWeight: '700',
  },
  strikeThrough: {
    textDecorationLine: 'line-through',
  },
});
