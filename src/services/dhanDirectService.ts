// =====================================================================
// QuantMobile — Direct Mobile-to-Dhan HQ Service (Zero Middleman)
// Direct TLS connection to Dhan HQ APIs (AWS Mumbai)
// Hardware Keystore Encrypted Token Storage via Expo SecureStore
// Multi-Tier Resilient Quote Fetching (/quote -> /ohlc -> /ltp)
// =====================================================================

import * as SecureStore from 'expo-secure-store';
import { Linking } from 'react-native';
import * as Haptics from 'expo-haptics';
import { DHAN_BASE_URL, getDhanSecurityId, DHAN_NIFTY_INDEX_ID } from '../constants/dhanSecurityMaster';
import { fetchFreeLiveQuotes } from './freeLiveMarketService';

const STORAGE_KEY_CLIENT_ID = 'QM_DHAN_CLIENT_ID';
const STORAGE_KEY_ACCESS_TOKEN = 'QM_DHAN_ACCESS_TOKEN';

export interface DhanDirectQuote {
  securityId: string;
  symbol: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  lastUpdated: string;
}

export interface DhanConnectionResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  clientId?: string;
}

export interface DhanFeedTelemetry {
  status: 'ONLINE' | 'ERROR' | 'UNCONFIGURED';
  lastError: string | null;
  lastTickTime: string | null;
  clientId: string | null;
}

class DhanDirectService {
  private cachedClientId: string | null = null;
  private cachedAccessToken: string | null = null;
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;

  private feedTelemetry: DhanFeedTelemetry = {
    status: 'UNCONFIGURED',
    lastError: null,
    lastTickTime: null,
    clientId: null,
  };

  /**
   * Initializes stored credentials from secure hardware storage (Singleton Promise)
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const [clientId, accessToken] = await Promise.all([
          SecureStore.getItemAsync(STORAGE_KEY_CLIENT_ID),
          SecureStore.getItemAsync(STORAGE_KEY_ACCESS_TOKEN),
        ]);
        this.cachedClientId = clientId?.trim() || null;
        this.cachedAccessToken = accessToken?.trim() || null;
        this.feedTelemetry.clientId = this.cachedClientId;
        this.feedTelemetry.status = this.cachedClientId && this.cachedAccessToken ? 'ONLINE' : 'UNCONFIGURED';
        this.isInitialized = true;
      } catch (err: any) {
        this.feedTelemetry.lastError = `Keystore init error: ${err.message}`;
        this.isInitialized = true;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Asynchronously determines whether credentials are saved in Keystore
   */
  public async isConfiguredAsync(): Promise<boolean> {
    await this.initialize();
    return Boolean(this.cachedClientId && this.cachedAccessToken);
  }

  /**
   * Synchronously checks cached credentials (must call initialize first)
   */
  public isConfigured(): boolean {
    return Boolean(this.cachedClientId && this.cachedAccessToken);
  }

  /**
   * Returns current active credentials
   */
  public async getCredentials(): Promise<{ clientId: string | null; accessToken: string | null }> {
    await this.initialize();
    return {
      clientId: this.cachedClientId,
      accessToken: this.cachedAccessToken,
    };
  }

  /**
   * Saves credentials directly to hardware Keystore / Keychain
   */
  public async saveCredentials(clientId: string, accessToken: string): Promise<void> {
    const cleanId = clientId.trim();
    const cleanToken = accessToken.trim();
    await Promise.all([
      SecureStore.setItemAsync(STORAGE_KEY_CLIENT_ID, cleanId),
      SecureStore.setItemAsync(STORAGE_KEY_ACCESS_TOKEN, cleanToken),
    ]);
    this.cachedClientId = cleanId;
    this.cachedAccessToken = cleanToken;
    this.feedTelemetry.clientId = cleanId;
    this.feedTelemetry.status = 'ONLINE';
    this.feedTelemetry.lastError = null;
    this.isInitialized = true;
  }

  /**
   * Clears saved credentials
   */
  public async clearCredentials(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(STORAGE_KEY_CLIENT_ID),
      SecureStore.deleteItemAsync(STORAGE_KEY_ACCESS_TOKEN),
    ]);
    this.cachedClientId = null;
    this.cachedAccessToken = null;
    this.feedTelemetry.clientId = null;
    this.feedTelemetry.status = 'UNCONFIGURED';
    this.feedTelemetry.lastError = null;
  }

  /**
   * Returns live feed telemetry status
   */
  public getTelemetry(): DhanFeedTelemetry {
    return { ...this.feedTelemetry };
  }

  /**
   * Pings Dhan HQ servers directly from the phone and measures round-trip latency
   */
  public async testDirectConnection(
    overrideClientId?: string,
    overrideToken?: string
  ): Promise<DhanConnectionResult> {
    await this.initialize();
    const clientId = overrideClientId?.trim() || this.cachedClientId;
    const token = overrideToken?.trim() || this.cachedAccessToken;

    if (!clientId || !token) {
      return {
        ok: false,
        latencyMs: 0,
        error: 'Dhan Client ID and 24-Hour Access Token are required.',
      };
    }

    const startTime = Date.now();
    try {
      // Direct request to Dhan HQ profile/fundlimit endpoint
      const res = await fetch(`${DHAN_BASE_URL}/fundlimit`, {
        method: 'GET',
        headers: {
          'access-token': token,
          'client-id': clientId,
          'dhanClientId': clientId,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        this.feedTelemetry.status = 'ONLINE';
        this.feedTelemetry.lastError = null;
        return {
          ok: true,
          latencyMs,
          clientId,
        };
      }

      const errText = await res.text();
      let parsedError = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        parsedError = errJson.errorMessage || errJson.message || parsedError;
      } catch {
        parsedError = `${parsedError}: ${errText.slice(0, 80)}`;
      }

      this.feedTelemetry.status = 'ERROR';
      this.feedTelemetry.lastError = parsedError;
      return {
        ok: false,
        latencyMs,
        error: parsedError,
      };
    } catch (netErr: any) {
      const latencyMs = Date.now() - startTime;
      const errMsg = netErr.message || 'Network Timeout';
      this.feedTelemetry.status = 'ERROR';
      this.feedTelemetry.lastError = errMsg;
      return {
        ok: false,
        latencyMs,
        error: `Direct connection failed: ${errMsg}`,
      };
    }
  }

  /**
   * Fetches batch live quotes for multiple tickers directly from Dhan HQ.
   * Multi-Tier Resilient Strategy:
   * 1. Try /marketfeed/quote (Full quote & physical volume)
   * 2. Fallback /marketfeed/ohlc (Open, High, Low, Close, LTP)
   * 3. Fallback /marketfeed/ltp (LTP guarantee)
   */
  public async fetchDirectBatchQuotes(
    tickers: string[]
  ): Promise<Record<string, DhanDirectQuote>> {
    await this.initialize();
    if (!this.cachedClientId || !this.cachedAccessToken || tickers.length === 0) {
      return {};
    }

    // Build mapping: numericSecId -> ticker
    const secIdToTicker = new Map<number, string>();
    tickers.forEach((ticker) => {
      const secIdStr = getDhanSecurityId(ticker);
      const num = parseInt(secIdStr, 10);
      if (!isNaN(num)) {
        secIdToTicker.set(num, ticker.toUpperCase());
      }
    });

    const allSecIds = Array.from(secIdToTicker.keys());
    if (allSecIds.length === 0) return {};

    // Chunk into groups of 30 instruments max (Dhan allows max 50)
    const chunkSize = 30;
    const chunks: number[][] = [];
    for (let i = 0; i < allSecIds.length; i += chunkSize) {
      chunks.push(allSecIds.slice(i, i + chunkSize));
    }

    const quotes: Record<string, DhanDirectQuote> = {};
    const nowTimeStr = new Date().toLocaleTimeString('en-IN');

    await Promise.all(
      chunks.map(async (chunk) => {
        let nseData: Record<string, any> = {};

        // --- TIER 1: Try /marketfeed/quote ---
        try {
          const res = await fetch(`${DHAN_BASE_URL}/marketfeed/quote`, {
            method: 'POST',
            headers: {
              'access-token': this.cachedAccessToken!,
              'client-id': this.cachedClientId!,
              'dhanClientId': this.cachedClientId!,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({
              NSE_EQ: chunk,
            }),
          });

          if (res.ok) {
            const json = await res.json();
            nseData = json?.data?.NSE_EQ || json?.NSE_EQ || {};
          } else if (res.status === 401) {
            this.feedTelemetry.status = 'ERROR';
            this.feedTelemetry.lastError = 'Dhan Token Expired (401). Update in Settings.';
            return;
          }
        } catch {
          // Proceed to Tier 2
        }

        // --- TIER 2: Fallback to /marketfeed/ohlc if /quote failed ---
        if (Object.keys(nseData).length === 0) {
          try {
            const resOhlc = await fetch(`${DHAN_BASE_URL}/marketfeed/ohlc`, {
              method: 'POST',
              headers: {
                'access-token': this.cachedAccessToken!,
                'client-id': this.cachedClientId!,
                'dhanClientId': this.cachedClientId!,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify({
                NSE_EQ: chunk,
              }),
            });

            if (resOhlc.ok) {
              const jsonOhlc = await resOhlc.json();
              nseData = jsonOhlc?.data?.NSE_EQ || jsonOhlc?.NSE_EQ || {};
            }
          } catch {}
        }

        // --- TIER 3: Fallback to /marketfeed/ltp if both failed ---
        if (Object.keys(nseData).length === 0) {
          try {
            const resLtp = await fetch(`${DHAN_BASE_URL}/marketfeed/ltp`, {
              method: 'POST',
              headers: {
                'access-token': this.cachedAccessToken!,
                'client-id': this.cachedClientId!,
                'dhanClientId': this.cachedClientId!,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify({
                NSE_EQ: chunk,
              }),
            });

            if (resLtp.ok) {
              const jsonLtp = await resLtp.json();
              nseData = jsonLtp?.data?.NSE_EQ || jsonLtp?.NSE_EQ || {};
            }
          } catch {}
        }

        // Map parsed nseData items back to tickers
        chunk.forEach((secId) => {
          const sym = secIdToTicker.get(secId);
          const item = nseData[secId] || nseData[String(secId)];
          if (sym && item) {
            const ltp = Number(item.last_price || item.close || 0);
            const open = Number(item.ohlc?.open || item.open || ltp);
            const high = Number(item.ohlc?.high || item.high || ltp);
            const low = Number(item.ohlc?.low || item.low || ltp);
            const close = Number(item.ohlc?.close || item.close || ltp);
            const volume = Number(item.volume || 0);

            quotes[sym] = {
              securityId: String(secId),
              symbol: sym,
              ltp,
              open,
              high,
              low,
              close,
              volume,
              lastUpdated: nowTimeStr,
            };
          }
        });
      })
    );

    if (Object.keys(quotes).length > 0) {
      this.feedTelemetry.status = 'ONLINE';
      this.feedTelemetry.lastError = null;
      this.feedTelemetry.lastTickTime = nowTimeStr;
    }

    return quotes;
  }

  /**
   * Fetches live NIFTY 50 Index quote directly from Dhan HQ (/marketfeed/ohlc)
   */
  public async fetchNiftyIndexQuote(): Promise<{ ltp: number; open: number; high: number; low: number; close: number } | null> {
    await this.initialize();

    // 1. Attempt direct Dhan HQ quote if credentials configured
    if (this.cachedClientId && this.cachedAccessToken) {
      try {
        const res = await fetch(`${DHAN_BASE_URL}/marketfeed/ohlc`, {
          method: 'POST',
          headers: {
            'access-token': this.cachedAccessToken,
            'client-id': this.cachedClientId,
            'dhanClientId': this.cachedClientId,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            IDX_I: [parseInt(DHAN_NIFTY_INDEX_ID, 10)],
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const item = json?.data?.IDX_I?.[DHAN_NIFTY_INDEX_ID] || json?.IDX_I?.[DHAN_NIFTY_INDEX_ID];
          if (item) {
            const ltp = Number(item.last_price || item.close || 0);
            if (ltp > 0) {
              return {
                ltp,
                open: Number(item.ohlc?.open || ltp),
                high: Number(item.ohlc?.high || ltp),
                low: Number(item.ohlc?.low || ltp),
                close: Number(item.ohlc?.close || ltp),
              };
            }
          }
        }
      } catch {}
    }

    // 2. Resilient Fallback: Query live exchange feed (^NSEI)
    try {
      const freeQuotes = await fetchFreeLiveQuotes(['^NSEI']);
      const nsei = freeQuotes['^NSEI'] || freeQuotes['NIFTY'];
      if (nsei && nsei.ltp > 0) {
        return {
          ltp: nsei.ltp,
          open: nsei.open,
          high: nsei.high,
          low: nsei.low,
          close: nsei.close,
        };
      }
    } catch {}

    return null;
  }

  /**
   * Directly launches the Dhan Mobile Application installed on the phone
   * via Android Intent deep linking with graceful web fallback
   */
  public async launchDhanApp(
    symbol: string,
    securityId?: string,
    action: 'BUY' | 'SELL' = 'BUY'
  ): Promise<void> {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const secId = securityId || getDhanSecurityId(symbol);
    const encoded = encodeURIComponent(symbol);

    // Intent candidate 1: Direct Order Window
    const directOrderIntent = `dhan://trade/place?exchange=NSE&segment=NSE_FNO&securityId=${secId}&action=${action}`;
    
    // Intent candidate 2: Direct Scrip Search / Overview
    const searchIntent = `dhan://search?q=${encoded}`;

    try {
      const canOpenOrder = await Linking.canOpenURL(directOrderIntent);
      if (canOpenOrder) {
        await Linking.openURL(directOrderIntent);
        return;
      }

      const canOpenSearch = await Linking.canOpenURL(searchIntent);
      if (canOpenSearch) {
        await Linking.openURL(searchIntent);
        return;
      }

      // Fallback: Dhan Fast Web
      await Linking.openURL(`https://web.dhan.co`);
    } catch {
      await Linking.openURL(`https://web.dhan.co`);
    }
  }
}

export const dhanDirectService = new DhanDirectService();
