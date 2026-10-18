import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { colors } from '../../theme/colors';
import { NiftyBreakout180State } from '../../types/mobile';
import * as Haptics from 'expo-haptics';

interface Props {
  data: NiftyBreakout180State | null;
}

export function NiftyBreakout180Card({ data }: Props) {
  const handleOpenBroker = (symbol: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const kiteUrl = `kite://search?q=${encodeURIComponent(symbol)}`;
    Linking.canOpenURL(kiteUrl).then((supported) => {
      if (supported) {
        Linking.openURL(kiteUrl);
      } else {
        Linking.openURL(`https://kite.zerodha.com`);
      }
    });
  };

  const activeContractStr = data?.activeContract === 'CE'
    ? `${data?.ceCandidate?.strike} CE`
    : `${data?.peCandidate?.strike} PE`;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.icon}>🚀</Text>
          <View>
            <Text style={styles.title}>NIFTY 09:30 ₹180 Breakout</Text>
            <Text style={styles.window}>Operating Window: 09:30 – 09:45 IST</Text>
          </View>
        </View>

        <View style={[styles.badge, { backgroundColor: colors.cyanGlow }]}>
          <Text style={[styles.badgeText, { color: colors.cyan }]}>
            {data?.status || 'IN_TRADE'}
          </Text>
        </View>
      </View>

      {/* Target & Stop-Loss Metrics */}
      <View style={styles.metricsBox}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>ACTIVE CONTRACT</Text>
          <TouchableOpacity onPress={() => handleOpenBroker(`NIFTY ${activeContractStr}`)}>
            <Text style={[styles.metricValue, { color: colors.cyan }]}>
              {activeContractStr} ↗
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>TARGET</Text>
          <Text style={[styles.metricValue, { color: colors.bullish }]}>₹220.00 (+20%)</Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>STOP LOSS</Text>
          <Text style={[styles.metricValue, { color: colors.bearish }]}>₹160.00 (-11%)</Text>
        </View>
      </View>

      {/* Opposite Leg Disabled Rule Invariant */}
      <View style={styles.oppositeBanner}>
        <Text style={styles.oppositeText}>
          ⛔ Opposite Leg ({data?.peCandidate?.strike || 23100} PE) disabled upon 1st break. 1 trade/day limit.
        </Text>
      </View>

      {/* Candidate comparison row */}
      <View style={styles.candidatesRow}>
        {/* CE Candidate */}
        <View style={[styles.candidatePill, data?.activeContract === 'CE' && styles.candidatePillActive]}>
          <Text style={styles.candidateStrike}>{data?.ceCandidate?.strike || 23150} CE</Text>
          <Text style={styles.candidatePrice}>09:25: ₹{data?.ceCandidate?.price0925.toFixed(2) || '176.40'}</Text>
          <Text style={[styles.candidateStatus, { color: colors.bullish }]}>
            {data?.ceCandidate?.isTriggered ? 'TRIGGERED 🚀' : 'WATCHING'}
          </Text>
        </View>

        {/* PE Candidate */}
        <View style={[styles.candidatePill, data?.peCandidate?.isDisabled && styles.candidatePillDisabled]}>
          <Text style={[styles.candidateStrike, data?.peCandidate?.isDisabled && styles.disabledText]}>
            {data?.peCandidate?.strike || 24800} PE
          </Text>
          <Text style={[styles.candidatePrice, data?.peCandidate?.isDisabled && styles.disabledText]}>
            09:25: ₹{data?.peCandidate?.price0925.toFixed(2) || '172.10'}
          </Text>
          <Text style={[styles.candidateStatus, { color: colors.textMuted }]}>
            {data?.peCandidate?.isDisabled ? 'CANCELED' : 'WATCHING'}
          </Text>
        </View>
      </View>

      {/* Footer Exit Timer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Mandatory Exit: <Text style={styles.highlight}>09:45:00 AM IST</Text> (Never held past 09:45)
        </Text>
        <Text style={[styles.netPoints, { color: colors.cyan }]}>
          P&L: +{data?.pnlPoints || '12.70'} pts
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  titleGroup: {
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
  window: {
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
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  oppositeBanner: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 10,
  },
  oppositeText: {
    color: colors.cyan,
    fontSize: 10,
    fontWeight: '600',
  },
  candidatesRow: {
    flexDirection: 'row',
    gap: 10,
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
  candidatePillActive: {
    borderColor: colors.cyan,
  },
  candidatePillDisabled: {
    opacity: 0.5,
  },
  candidateStrike: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  candidatePrice: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  candidateStatus: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  disabledText: {
    textDecorationLine: 'line-through',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  highlight: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  netPoints: {
    fontSize: 12,
    fontWeight: '700',
  },
});
