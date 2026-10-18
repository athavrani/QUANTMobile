import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { colors } from '../theme/colors';
import { useRadarStore } from '../store/useRadarStore';
import { StockRadarItem } from '../types/mobile';
import { TacticalStrikeModal } from '../components/radar/TacticalStrikeModal';
import { LiveOptionChainModal } from '../components/options/LiveOptionChainModal';
import { dhanDirectService } from '../services/dhanDirectService';
import * as Haptics from 'expo-haptics';

type FilterType = 'ALL' | 'NIFTY50' | 'SENSEX' | 'GREEN' | 'RED' | 'NEAR';

export function RadarScreen() {
  const {
    stocks,
    selectedStock,
    tacticalStrike,
    feedStatus,
    lastTickTime,
    isRefreshing,
    refreshAll,
    selectStock,
    clearSelectedStock,
  } = useRadarStore();

  const [filter, setFilter] = useState<FilterType>('ALL');
  const [search, setSearch] = useState('');
  const [chainStock, setChainStock] = useState<StockRadarItem | null>(null);

  const handleRefresh = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refreshAll(true);
  };

  const handleSelect = (stock: StockRadarItem) => {
    Haptics.selectionAsync();
    selectStock(stock.ticker);
  };

  // Helper to format shares in Indian numbering format (Lakhs & Crores)
  const formatShares = (val: number): string => {
    if (val >= 10000000) return `${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `${(val / 100000).toFixed(2)} L`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    return val.toLocaleString('en-IN');
  };

  const filteredStocks = stocks.filter((stock) => {
    const matchesSearch =
      stock.ticker.toLowerCase().includes(search.toLowerCase()) ||
      stock.name.toLowerCase().includes(search.toLowerCase()) ||
      (stock.sector && stock.sector.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (filter === 'NIFTY50') return stock.indices.includes('NIFTY 50');
    if (filter === 'SENSEX') return stock.indices.includes('SENSEX');
    if (filter === 'GREEN') return stock.circleIndicator === 'GREEN';
    if (filter === 'RED') return stock.circleIndicator === 'RED';
    if (filter === 'NEAR') return stock.circleIndicator === 'AMBER';

    return true;
  });

  const greenCount = stocks.filter((s) => s.circleIndicator === 'GREEN').length;
  const redCount = stocks.filter((s) => s.circleIndicator === 'RED').length;
  const nearCount = stocks.filter((s) => s.circleIndicator === 'AMBER').length;

  const renderStockItem = ({ item }: { item: StockRadarItem }) => {
    const ratioPercent = Math.min(150, Math.round(item.volumeRatio * 100));
    const isBullish = item.percentChange >= 0;

    // Circle color & tone
    let circleIcon = '⚪';
    let circleTone = colors.textMuted;
    let circleLabel = 'SCANNING';

    if (item.circleIndicator === 'GREEN') {
      circleIcon = '🟢';
      circleTone = colors.bullish;
      circleLabel = 'BUY (ACCUMULATION)';
    } else if (item.circleIndicator === 'RED') {
      circleIcon = '🔴';
      circleTone = colors.bearish;
      circleLabel = 'SELL (DISTRIBUTION)';
    } else if (item.circleIndicator === 'AMBER') {
      circleIcon = '🟡';
      circleTone = colors.warning;
      circleLabel = 'NEAR CROSS (80%)';
    }

    return (
      <TouchableOpacity
        style={[
          styles.stockCard,
          item.circleIndicator === 'GREEN' && styles.greenCardBorder,
          item.circleIndicator === 'RED' && styles.redCardBorder,
        ]}
        activeOpacity={0.7}
        onPress={() => handleSelect(item)}
      >
        {/* Top Row: Circle Indicator, Ticker, Names, and LTP */}
        <View style={styles.cardHeader}>
          <View style={styles.leftGroup}>
            <Text style={styles.circleIcon}>{circleIcon}</Text>
            <View>
              <View style={styles.tickerRow}>
                <Text style={styles.ticker}>{item.ticker}</Text>
                <View style={styles.indexPillRow}>
                  {item.indices.map((idx) => (
                    <View key={idx} style={styles.indexPill}>
                      <Text style={styles.indexPillText}>{idx}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <Text style={styles.companyName} numberOfLines={1}>{item.name}</Text>
            </View>
          </View>

          <View style={styles.priceGroup}>
            <Text style={styles.price}>₹{item.spotPrice.toFixed(2)}</Text>
            <Text style={[styles.percent, { color: isBullish ? colors.bullish : colors.bearish }]}>
              {isBullish ? `+${item.percentChange}%` : `${item.percentChange}%`}
            </Text>
          </View>
        </View>

        {/* Middle Volume Metrics Comparison */}
        <View style={styles.volumeDetailsBox}>
          <View style={styles.volMetricCol}>
            <Text style={styles.volMetricLabel}>20D AVG VOLUME</Text>
            <Text style={styles.volMetricVal}>{formatShares(item.avg20DTradedShares)}</Text>
            <Text style={styles.exactSharesSub}>{item.avg20DTradedShares.toLocaleString('en-IN')} shares</Text>
          </View>

          <View style={styles.volDivider} />

          <View style={styles.volMetricCol}>
            <Text style={styles.volMetricLabel}>CURRENT DAY VOLUME</Text>
            <Text style={[styles.volMetricVal, { color: circleTone }]}>
              {formatShares(item.todayTradedShares)}
            </Text>
            <Text style={styles.exactSharesSub}>{item.todayTradedShares.toLocaleString('en-IN')} shares</Text>
          </View>

          <View style={styles.volDivider} />

          <View style={styles.volMetricCol}>
            <Text style={styles.volMetricLabel}>RATIO</Text>
            <Text style={[styles.volMetricVal, { color: circleTone }]}>{ratioPercent}%</Text>
            <Text style={styles.exactSharesSub}>of Benchmark</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(100, ratioPercent)}%`,
                backgroundColor: circleTone,
              },
            ]}
          />
        </View>

        {/* Card Footer Status */}
        <View style={styles.cardFooter}>
          <Text style={[styles.statusText, { color: circleTone }]}>
            {circleIcon} {circleLabel} {item.crossoverTime ? `@ ${item.crossoverTime}` : ''}
          </Text>
          <Text style={styles.tapNote}>Tap for ATM Option Strike ↗</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Feed Status Indicator */}
      <View style={styles.feedStatusBar}>
        <View style={styles.feedStatusLeft}>
          <View
            style={[
              styles.feedStatusDot,
              {
                backgroundColor:
                  feedStatus === 'ONLINE'
                    ? colors.bullish
                    : feedStatus === 'ERROR'
                    ? colors.bearish
                    : colors.warning,
              },
            ]}
          />
          <Text style={styles.feedStatusText}>
            {feedStatus === 'ONLINE'
              ? `🟢 DHAN LIVE STREAM (${lastTickTime || 'Streaming'})`
              : feedStatus === 'ERROR'
              ? '⚠️ DHAN STREAM RECONNECTING (Check Settings)'
              : '⚡ CONNECTING DHAN STREAMER...'}
          </Text>
        </View>
        <Text style={styles.feedCountText}>{filteredStocks.length} STOCKS</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search 60 SENSEX & NIFTY 50 Stocks (e.g. RELIANCE)..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="characters"
        />
      </View>

      {/* Index & Circle Filter Chips */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'ALL' && styles.filterChipActive]}
          onPress={() => setFilter('ALL')}
        >
          <Text style={[styles.filterText, filter === 'ALL' && styles.filterTextActive]}>
            All ({stocks.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'NIFTY50' && styles.filterChipActive]}
          onPress={() => setFilter('NIFTY50')}
        >
          <Text style={[styles.filterText, filter === 'NIFTY50' && styles.filterTextActive]}>
            NIFTY 50
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'SENSEX' && styles.filterChipActive]}
          onPress={() => setFilter('SENSEX')}
        >
          <Text style={[styles.filterText, filter === 'SENSEX' && styles.filterTextActive]}>
            SENSEX
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'GREEN' && styles.filterChipActiveGreen]}
          onPress={() => setFilter('GREEN')}
        >
          <Text style={[styles.filterText, filter === 'GREEN' && styles.filterTextActiveGreen]}>
            🟢 Buy ({greenCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'RED' && styles.filterChipActiveRed]}
          onPress={() => setFilter('RED')}
        >
          <Text style={[styles.filterText, filter === 'RED' && styles.filterTextActiveRed]}>
            🔴 Sell ({redCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'NEAR' && styles.filterChipActiveAmber]}
          onPress={() => setFilter('NEAR')}
        >
          <Text style={[styles.filterText, filter === 'NEAR' && styles.filterTextActiveAmber]}>
            🟡 Near ({nearCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Screener Stock List */}
      <FlatList
        data={filteredStocks}
        keyExtractor={(item) => item.ticker}
        renderItem={renderStockItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.bullish}
            colors={[colors.bullish]}
          />
        }
      />

      {/* Tactical Strike Modal */}
      <TacticalStrikeModal
        visible={!!selectedStock}
        stock={selectedStock}
        tactical={tacticalStrike}
        onClose={clearSelectedStock}
        onViewOptionChain={(s) => setChainStock(s)}
      />

      {/* Full Live Option Chain Matrix Modal */}
      <LiveOptionChainModal
        visible={!!chainStock}
        ticker={chainStock?.ticker || 'NIFTY'}
        spotPrice={chainStock?.spotPrice || 23146.15}
        strikeStep={chainStock?.strikeStep || 50}
        onClose={() => setChainStock(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.obsidian,
  },
  feedStatusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.surfaceSubtle,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  feedStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  feedStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  feedStatusText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  feedCountText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: colors.surface,
  },
  searchInput: {
    backgroundColor: colors.surfaceSubtle,
    color: colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  filterChipActive: {
    backgroundColor: colors.surfaceHover,
    borderColor: colors.textPrimary,
  },
  filterChipActiveGreen: {
    backgroundColor: colors.bullishGlow,
    borderColor: colors.bullish,
  },
  filterChipActiveRed: {
    backgroundColor: colors.bearishGlow,
    borderColor: colors.bearish,
  },
  filterChipActiveAmber: {
    backgroundColor: colors.warningGlow,
    borderColor: colors.warning,
  },
  filterText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  filterTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  filterTextActiveGreen: {
    color: colors.bullish,
    fontWeight: '700',
  },
  filterTextActiveRed: {
    color: colors.bearish,
    fontWeight: '700',
  },
  filterTextActiveAmber: {
    color: colors.warning,
    fontWeight: '700',
  },
  listContent: {
    padding: 12,
  },
  stockCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    marginBottom: 10,
  },
  greenCardBorder: {
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  redCardBorder: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  circleIcon: {
    fontSize: 20,
  },
  tickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ticker: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  indexPillRow: {
    flexDirection: 'row',
    gap: 4,
  },
  indexPill: {
    backgroundColor: colors.surfaceHover,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  indexPillText: {
    color: colors.textSecondary,
    fontSize: 8,
    fontWeight: '700',
  },
  companyName: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
    maxWidth: 180,
  },
  priceGroup: {
    alignItems: 'flex-end',
  },
  price: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  percent: {
    fontSize: 12,
    fontWeight: '700',
  },
  volumeDetailsBox: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginTop: 4,
    marginBottom: 6,
  },
  volMetricCol: {
    flex: 1,
    alignItems: 'center',
  },
  volMetricLabel: {
    color: colors.textMuted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  volMetricVal: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  exactSharesSub: {
    color: colors.textMuted,
    fontSize: 8,
    fontFamily: 'monospace',
    marginTop: 1,
  },
  volDivider: {
    width: 1,
    backgroundColor: colors.divider,
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  tapNote: {
    color: colors.cyan,
    fontSize: 10,
    fontWeight: '600',
  },
});
