import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { colors } from '../../theme/colors';
import { liveMarketService, LiveOptionChainSummary } from '../../services/liveMarketService';
import * as Haptics from 'expo-haptics';

interface Props {
  visible: boolean;
  ticker?: string;
  spotPrice?: number;
  strikeStep?: number;
  onClose: () => void;
}

export function LiveOptionChainModal({
  visible,
  ticker = 'NIFTY',
  spotPrice = 23146.15,
  strikeStep = 50,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [chain, setChain] = useState<LiveOptionChainSummary | null>(null);

  useEffect(() => {
    if (visible) {
      loadOptionChain();
    }
  }, [visible, ticker, spotPrice]);

  const loadOptionChain = async () => {
    // Instant Black-Scholes calculation without artificial blocking spinner
    const data = await liveMarketService.fetchLiveOptionChain(ticker, spotPrice, strikeStep, true);
    setChain(data);
    setLoading(false);
  };

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

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{ticker} Live Option Chain</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>REAL-TIME</Text>
                </View>
                {chain?.rolledToNextExpiry && (
                  <View style={[styles.badge, styles.expiryRolloverBadge]}>
                    <Text style={styles.expiryRolloverBadgeText}>NEXT EXPIRY (BTST)</Text>
                  </View>
                )}
                {chain?.wasPreponed && (
                  <View style={[styles.badge, styles.holidayPreponedBadge]}>
                    <Text style={styles.holidayPreponedBadgeText}>PREPONED</Text>
                  </View>
                )}
              </View>
              <Text style={styles.sub}>
                Spot: ₹{spotPrice.toFixed(2)} • Expiry: {chain?.expiryDate} {chain?.daysToExpiry ? `(${chain.daysToExpiry}d)` : ''}
              </Text>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Expiry Day Notice Banner */}
          {chain?.rolledToNextExpiry && (
            <View style={styles.expiryNoticeBanner}>
              <Text style={styles.expiryNoticeText}>
                ⚡ <Text style={{ fontWeight: '800' }}>EXPIRY DAY:</Text> Auto-rolled to Next Expiry ({chain.expiryDate}) so 09:20 OOBTST can safely carry overnight (BTST).
              </Text>
            </View>
          )}

          {/* Holiday Preponement Notice Banner */}
          {chain?.wasPreponed && (
            <View style={[styles.expiryNoticeBanner, styles.holidayNoticeBanner]}>
              <Text style={styles.holidayNoticeText}>
                📅 <Text style={{ fontWeight: '800' }}>NSE HOLIDAY PREPONEMENT:</Text> Expiry preponed to {chain.expiryDate} because scheduled Tuesday was {chain.holidayReason || 'Exchange Holiday'}.
              </Text>
            </View>
          )}

          {/* 09:20 OOBTST Strike Tracker Strip */}
          {chain?.oobtstCeStrike && chain?.oobtstPeStrike && (
            <View style={styles.oobtstTrackerStrip}>
              <Text style={styles.oobtstTrackerTitle}>🌙 09:20 OOBTST TARGETS (~₹62.50):</Text>
              <View style={styles.oobtstTrackerItems}>
                <View style={styles.oobtstPillCe}>
                  <Text style={styles.oobtstPillTextCe}>
                    CE: {chain.oobtstCeStrike} (₹{chain.oobtstCeOpen?.toFixed(1) ?? '62.5'})
                  </Text>
                </View>
                <View style={styles.oobtstPillPe}>
                  <Text style={styles.oobtstPillTextPe}>
                    PE: {chain.oobtstPeStrike} (₹{chain.oobtstPeOpen?.toFixed(1) ?? '62.5'})
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* KPI Bar */}
          <View style={styles.kpiBar}>
            <View style={styles.kpiItem}>
              <Text style={styles.kpiLabel}>PCR RATIO</Text>
              <Text style={[styles.kpiVal, { color: (chain?.pcrRatio || 1) >= 1 ? colors.bullish : colors.bearish }]}>
                {chain?.pcrRatio.toFixed(2) || '1.15'}
              </Text>
            </View>
            <View style={styles.kpiItem}>
              <Text style={styles.kpiLabel}>ATM STRIKE</Text>
              <Text style={[styles.kpiVal, { color: colors.cyan }]}>
                {chain?.atmStrike || 23150}
              </Text>
            </View>
            <View style={styles.kpiItem}>
              <Text style={styles.kpiLabel}>TOTAL PUT/CALL OI</Text>
              <Text style={styles.kpiVal}>
                {(chain?.totalPutOi || 0) > 100000 ? `${((chain?.totalPutOi || 0) / 100000).toFixed(1)}L` : '0'} / {((chain?.totalCallOi || 0) / 100000).toFixed(1)}L
              </Text>
            </View>
          </View>

          {/* Table Column Headers */}
          <View style={styles.tableHeader}>
            <Text style={[styles.colHeader, { flex: 1.3, textAlign: 'left' }]}>CALL LTP (OI)</Text>
            <Text style={[styles.colHeader, { flex: 1, textAlign: 'center' }]}>STRIKE</Text>
            <Text style={[styles.colHeader, { flex: 1.3, textAlign: 'right' }]}>PUT LTP (OI)</Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.cyan} />
              <Text style={styles.loadingText}>Streaming live options chain...</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {chain?.strikes.map((s) => {
                const isAtm = s.moneyness === 'ATM';
                const isOobtstCe = !!s.isOobtstCe;
                const isOobtstPe = !!s.isOobtstPe;
                const isOobtstRow = isOobtstCe || isOobtstPe;

                return (
                  <View
                    key={s.strikePrice}
                    style={[
                      styles.row,
                      isAtm && styles.atmRow,
                      isOobtstRow && styles.oobtstRow,
                    ]}
                  >
                    {/* Call Side */}
                    <TouchableOpacity
                      style={[
                        styles.callCell,
                        { flex: 1.3 },
                        isOobtstCe && styles.oobtstCellHighlightCe,
                      ]}
                      onPress={() => handleOpenBroker(s.callSymbol)}
                    >
                      {isOobtstCe && (
                        <View style={styles.oobtstBadgeCe}>
                          <Text style={styles.oobtstBadgeTextCe}>⭐ 09:20 OOBTST CE</Text>
                        </View>
                      )}
                      <Text style={[styles.callPrice, { color: colors.bullish }, isOobtstCe && styles.boldOobtstPrice]}>
                        ₹{s.callLtp.toFixed(2)}
                      </Text>
                      <Text style={styles.oiText}>{(s.callOi / 1000).toFixed(0)}k oi</Text>
                    </TouchableOpacity>

                    {/* Strike Center */}
                    <View style={[styles.strikeCell, { flex: 1 }]}>
                      <Text style={[styles.strikeText, isAtm && styles.atmStrikeText, isOobtstRow && styles.oobtstStrikeText]}>
                        {s.strikePrice}
                      </Text>
                      <Text style={[styles.moneynessText, isAtm && { color: colors.cyan, fontWeight: '700' }]}>
                        {s.moneyness}
                      </Text>
                    </View>

                    {/* Put Side */}
                    <TouchableOpacity
                      style={[
                        styles.putCell,
                        { flex: 1.3 },
                        isOobtstPe && styles.oobtstCellHighlightPe,
                      ]}
                      onPress={() => handleOpenBroker(s.putSymbol)}
                    >
                      {isOobtstPe && (
                        <View style={styles.oobtstBadgePe}>
                          <Text style={styles.oobtstBadgeTextPe}>⭐ 09:20 OOBTST PE</Text>
                        </View>
                      )}
                      <Text style={[styles.putPrice, { color: colors.bearish }, isOobtstPe && styles.boldOobtstPrice]}>
                        ₹{s.putLtp.toFixed(2)}
                      </Text>
                      <Text style={styles.oiText}>{(s.putOi / 1000).toFixed(0)}k oi</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  badge: {
    backgroundColor: colors.cyanGlow,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: colors.cyan,
    fontSize: 9,
    fontWeight: '800',
  },
  expiryRolloverBadge: {
    backgroundColor: colors.warningGlow,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  expiryRolloverBadgeText: {
    color: colors.warning,
    fontSize: 8,
    fontWeight: '800',
  },
  holidayPreponedBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.4)',
  },
  holidayPreponedBadgeText: {
    color: '#fbbf24',
    fontSize: 8,
    fontWeight: '800',
  },
  holidayNoticeBanner: {
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    borderBottomColor: 'rgba(234, 179, 8, 0.35)',
  },
  holidayNoticeText: {
    color: '#fbbf24',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
  },
  sub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '700',
  },
  expiryNoticeBanner: {
    backgroundColor: colors.warningGlow,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 158, 11, 0.25)',
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  expiryNoticeText: {
    color: colors.warning,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
  },
  oobtstTrackerStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  oobtstTrackerTitle: {
    color: colors.purple,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  oobtstTrackerItems: {
    flexDirection: 'row',
    gap: 6,
  },
  oobtstPillCe: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  oobtstPillTextCe: {
    color: colors.bullish,
    fontSize: 9,
    fontWeight: '700',
  },
  oobtstPillPe: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  oobtstPillTextPe: {
    color: colors.bearish,
    fontSize: 9,
    fontWeight: '700',
  },
  kpiBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  kpiItem: {
    flex: 1,
    alignItems: 'center',
  },
  kpiLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  kpiVal: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  colHeader: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 10,
  },
  list: {
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  atmRow: {
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: colors.cyan,
  },
  oobtstRow: {
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
  },
  callCell: {
    alignItems: 'flex-start',
    paddingLeft: 4,
  },
  callPrice: {
    fontSize: 13,
    fontWeight: '700',
  },
  boldOobtstPrice: {
    fontSize: 14,
    fontWeight: '900',
  },
  strikeCell: {
    alignItems: 'center',
  },
  strikeText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  atmStrikeText: {
    color: colors.cyan,
  },
  oobtstStrikeText: {
    color: colors.purple,
    fontWeight: '900',
  },
  moneynessText: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
  },
  putCell: {
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  putPrice: {
    fontSize: 13,
    fontWeight: '700',
  },
  oiText: {
    color: colors.textMuted,
    fontSize: 9,
    marginTop: 1,
  },
  oobtstCellHighlightCe: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 6,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  oobtstCellHighlightPe: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 6,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  oobtstBadgeCe: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginBottom: 2,
  },
  oobtstBadgeTextCe: {
    color: colors.bullish,
    fontSize: 7.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  oobtstBadgePe: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginBottom: 2,
  },
  oobtstBadgeTextPe: {
    color: colors.bearish,
    fontSize: 7.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});
