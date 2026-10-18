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

  const currentStep = data?.currentStep || 1;
  const status = data?.status || 'WAITING_0925';
  const isActive = status === 'IN_TRADE' || status === 'TARGET_HIT' || status === 'SL_HIT' || status === 'TIME_EXIT';
  const isTargetHit = status === 'TARGET_HIT';
  const isSlHit = status === 'SL_HIT';

  const activeContractStr = data?.activeContract === 'CE'
    ? `${data?.ceCandidate?.strike || 23150} CE`
    : data?.activeContract === 'PE'
    ? `${data?.peCandidate?.strike || 23100} PE`
    : 'NONE';

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.icon}>🚀</Text>
          <View>
            <Text style={styles.title}>NIFTY 09:25 ₹180 Breakout</Text>
            <Text style={styles.window}>3-Step Execution • Window: 09:25 – 09:45 IST</Text>
          </View>
        </View>

        <View style={[styles.badge, { backgroundColor: isActive ? colors.cyanGlow : colors.surface }]}>
          <Text style={[styles.badgeText, { color: isActive ? colors.cyan : colors.textMuted }]}>
            STEP {currentStep}/3
          </Text>
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
          {/* CE Candidate */}
          <View style={[styles.contractBox, data?.activeContract === 'CE' && styles.contractBoxActive]}>
            <View style={styles.contractHeader}>
              <Text style={styles.contractType}>CALL (CE)</Text>
              <Text style={styles.rulePill}>Open &lt; 180 ✅</Text>
            </View>
            <Text style={styles.contractStrike}>{data?.ceCandidate?.strike || 23150} CE</Text>
            <Text style={styles.contractPrice}>09:25 Open: ₹{data?.ceCandidate?.price0925.toFixed(2) || '176.40'}</Text>
            <Text style={[styles.contractLtp, { color: (data?.ceCandidate?.currentLtp || 0) >= 180 ? colors.bullish : colors.textPrimary }]}>
              Live LTP: ₹{data?.ceCandidate?.currentLtp.toFixed(2) || '176.40'}
            </Text>
          </View>

          {/* PE Candidate */}
          <View style={[styles.contractBox, data?.activeContract === 'PE' && styles.contractBoxActive, data?.peCandidate?.isDisabled && styles.contractBoxDisabled]}>
            <View style={styles.contractHeader}>
              <Text style={[styles.contractType, { color: colors.bearish }]}>PUT (PE)</Text>
              <Text style={styles.rulePill}>Open &lt; 180 ✅</Text>
            </View>
            <Text style={[styles.contractStrike, data?.peCandidate?.isDisabled && styles.strikeThrough]}>
              {data?.peCandidate?.strike || 23100} PE
            </Text>
            <Text style={styles.contractPrice}>09:25 Open: ₹{data?.peCandidate?.price0925.toFixed(2) || '172.10'}</Text>
            <Text style={[styles.contractLtp, { color: (data?.peCandidate?.currentLtp || 0) >= 180 ? colors.bullish : colors.textPrimary }]}>
              Live LTP: ₹{data?.peCandidate?.currentLtp.toFixed(2) || '172.10'}
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
          <Text style={[styles.stepStatusTag, { color: isActive ? colors.cyan : colors.warning }]}>
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
              <TouchableOpacity onPress={() => handleOpenBroker(`NIFTY ${activeContractStr}`)}>
                <Text style={styles.activeLegSymbol}>NIFTY {activeContractStr} ↗</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.slTargetGrid}>
              <View style={styles.slTargetItem}>
                <Text style={styles.slTargetLabel}>TARGET (1:2)</Text>
                <Text style={[styles.slTargetVal, { color: colors.bullish }]}>₹220.00 (+40 pts)</Text>
              </View>
              <View style={styles.slTargetDivider} />
              <View style={styles.slTargetItem}>
                <Text style={styles.slTargetLabel}>STOP LOSS</Text>
                <Text style={[styles.slTargetVal, { color: colors.bearish }]}>₹160.00 (-20 pts)</Text>
              </View>
            </View>

            <View style={styles.oppositeCanceledNotice}>
              <Text style={styles.oppositeCanceledText}>
                ⛔ Opposite leg ({data?.activeContract === 'CE' ? `${data?.peCandidate?.strike} PE` : `${data?.ceCandidate?.strike} CE`}) is CANCELED / DISABLED for the day.
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
            <Text style={styles.outcomeSub}>Contract reached ₹220.00 Target. 1:2 Reward fully booked!</Text>
          </View>
        ) : isSlHit ? (
          <View style={[styles.outcomeBanner, { backgroundColor: colors.bearishGlow, borderColor: colors.bearish }]}>
            <Text style={[styles.outcomeTitle, { color: colors.bearish }]}>🛑 STOP LOSS HIT (-20 pts)</Text>
            <Text style={styles.outcomeSub}>Contract breached ₹160.00 SL. Position squared off.</Text>
          </View>
        ) : isActive ? (
          <View style={[styles.outcomeBanner, { backgroundColor: 'rgba(6, 182, 212, 0.1)', borderColor: colors.cyan }]}>
            <View style={styles.inTradeRow}>
              <Text style={[styles.outcomeTitle, { color: colors.cyan }]}>⚡ IN TRADE — Running...</Text>
              <Text style={[styles.livePnlText, { color: colors.bullish }]}>
                P&amp;L: {data?.pnlPoints !== undefined && data.pnlPoints >= 0 ? '+' : ''}{data?.pnlPoints || '12.70'} pts
              </Text>
            </View>
            <Text style={styles.outcomeSub}>
              Current LTP: ₹{data?.currentPrice?.toFixed(2) || '194.20'} | Target: ₹220.00 | SL: ₹160.00
            </Text>
          </View>
        ) : (
          <View style={styles.pendingOutcomeBox}>
            <Text style={styles.pendingOutcomeText}>⏳ Awaiting Activation in Step 2</Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Mandatory Exit: <Text style={styles.highlight}>09:45:00 AM IST</Text> (Never held past 09:45)
        </Text>
      </View>
    </View>
  );
}

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
  titleGroup: {
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
  window: {
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
  footerText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  highlight: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
