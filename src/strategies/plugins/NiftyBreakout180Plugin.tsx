import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BaseStrategyPlugin, StrategyContext, StrategySignalOutput } from '../types';
import { colors } from '../../theme/colors';

export const NiftyBreakout180Plugin: BaseStrategyPlugin = {
  id: 'NIFTY_BREAKOUT_180',
  name: 'NIFTY 09:30 ₹180 Breakout',
  tagline: 'Directional 15-Min Momentum Option Buying',
  icon: '🚀',
  category: 'MOMENTUM_BREAKOUT',
  executionStyle: 'CANDLE_BREAKOUT',
  operatingWindow: {
    startIST: '09:30:00',
    endIST: '09:45:00',
    isOvernightAllowed: false,
  },

  evaluate: (ctx: StrategyContext): StrategySignalOutput => {
    return {
      status: 'TRIGGERED',
      statusBadgeText: 'IN_TRADE 🚀',
      badgeTone: 'cyan',
      headline: '23150 CE Crossed ₹180 @ 09:32 AM • Opposite Leg Disabled',
      primaryMetricLabel: 'TARGET / SL',
      primaryMetricValue: '₹220.00 / ₹160.00',
      target: '₹220.00 (+20%)',
      stopLoss: '₹160.00 (-11%)',
      invariantNotice: '⛔ Opposite Leg (23100 PE) disabled upon 1st break. Mandatory exit @ 09:45 AM.',
      lastUpdated: ctx.istTime,
      legs: [
        {
          type: 'CE',
          symbol: 'NIFTY 23150 CE',
          strike: 23150,
          refPrice: 181.50,
          currentLtp: 194.20,
          slPrice: 160.00,
          targetPrice: 220.00,
          status: 'ACTIVE',
        },
        {
          type: 'PE',
          symbol: 'NIFTY 23100 PE',
          strike: 23100,
          refPrice: 172.10,
          currentLtp: 145.80,
          status: 'DISABLED',
        },
      ],
    };
  },

  renderCard: ({ state, onOpenBroker }) => {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.icon}>🚀</Text>
            <View>
              <Text style={styles.title}>NIFTY 09:30 ₹180 Breakout</Text>
              <Text style={styles.sub}>High-Speed 15-Min Directional Momentum</Text>
            </View>
          </View>
          <View style={[styles.badge, { backgroundColor: colors.cyanGlow }]}>
            <Text style={[styles.badgeText, { color: colors.cyan }]}>{state.statusBadgeText}</Text>
          </View>
        </View>

        <View style={styles.metricsBox}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>ACTIVE CONTRACT</Text>
            <TouchableOpacity onPress={() => onOpenBroker('NIFTY 23150 CE')}>
              <Text style={[styles.metricVal, { color: colors.cyan }]}>23150 CE ↗</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>TARGET</Text>
            <Text style={[styles.metricVal, { color: colors.bullish }]}>{state.target}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>STOP LOSS</Text>
            <Text style={[styles.metricVal, { color: colors.bearish }]}>{state.stopLoss}</Text>
          </View>
        </View>

        {state.invariantNotice && (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>{state.invariantNotice}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerNote}>Forced Time Exit: 09:45:00 AM IST</Text>
          <Text style={[styles.pnlText, { color: colors.bullish }]}>P&L: +12.7 pts</Text>
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
});
