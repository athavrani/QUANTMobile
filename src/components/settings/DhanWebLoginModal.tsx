// =====================================================================
// QuantMobile — Dhan Web In-App Login & Instant Token Sync Modal
// Opens official https://web.dhan.co in embedded WebView, lets user login
// via Mobile/Password/OTP/QR, and automatically intercepts the session token
// =====================================================================

import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import CryptoJS from 'crypto-js';
import { colors } from '../../theme/colors';
import { dhanPlainStorage } from '../../services/dhanPlainStorage';
import { dhanDirectService } from '../../services/dhanDirectService';
import { dhanWebStreamer } from '../../services/dhanWebStreamer';
import { useRadarStore } from '../../store/useRadarStore';

interface DhanWebLoginModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (clientId: string, token: string) => void;
}

// AES-128-CBC decryption matching Dhan Web's internal CryptoJS engine
function decryptDhanStorage(cipherTextBase64: string): string {
  if (!cipherTextBase64 || typeof cipherTextBase64 !== 'string') return '';
  try {
    const key = CryptoJS.PBKDF2('DHAN', CryptoJS.enc.Hex.parse('498960e491150a0fc0f21822a147fd62'), {
      keySize: 4,
      iterations: 1000,
    });
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(cipherTextBase64),
    });
    const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
      iv: CryptoJS.enc.Hex.parse('320ef7705d1030f0a1a55b3dcf676cb8'),
    }).toString(CryptoJS.enc.Utf8);
    return decrypted;
  } catch {
    return '';
  }
}

// Universal parser for both raw network JSON and AES-encrypted storage values
function tryExtractCredentials(raw: any): { clientId: string; token: string; name: string } | null {
  if (!raw) return null;
  let data: any = raw;

  if (typeof raw === 'string') {
    // If it's encrypted ciphertext (Base64), decrypt it first
    if (!raw.startsWith('{') && !raw.startsWith('[')) {
      const dec = decryptDhanStorage(raw);
      if (dec) {
        try {
          data = JSON.parse(dec);
        } catch {
          if (dec.startsWith('eyJ')) {
            return { clientId: '1113940120', token: dec, name: 'Dhan Trader' };
          }
        }
      }
    } else {
      try {
        data = JSON.parse(raw);
      } catch {}
    }
  }

  if (data && typeof data === 'object') {
    const payload = data.data && typeof data.data === 'object' ? data.data : data;
    const token = payload.token_id || payload.jwt || payload.token || payload.TxnToken || '';
    const clientId = String(payload.entity_id || payload.login_id || payload.clientId || '1113940120');
    const name = payload.client_name || payload.name || 'Dhan Trader';
    if (token && typeof token === 'string' && (token.startsWith('eyJ') || token.length > 30)) {
      return { clientId, token, name };
    }
  } else if (typeof data === 'string' && data.startsWith('eyJ')) {
    return { clientId: '1113940120', token: data, name: 'Dhan Trader' };
  }

  return null;
}

const DESKTOP_VIEWPORT_INJECTION = `
  (function() {
    // 1. Force desktop viewport & window/screen dimensions so @media (max-width: 600px) NEVER matches
    try {
      Object.defineProperty(window, 'innerWidth', { get: function() { return 1280; }, configurable: true });
      Object.defineProperty(window, 'outerWidth', { get: function() { return 1280; }, configurable: true });
      Object.defineProperty(screen, 'width', { get: function() { return 1280; }, configurable: true });
      Object.defineProperty(screen, 'availWidth', { get: function() { return 1280; }, configurable: true });
      Object.defineProperty(navigator, 'userAgent', {
        get: function() { return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"; },
        configurable: true
      });
      Object.defineProperty(navigator, 'platform', { get: function() { return "Win32"; }, configurable: true });
    } catch(e) {}

    // 2. Kill mobile landing screen completely
    function applyDesktopStyles() {
      try {
        var styleId = 'dhan-mobile-block-killer';
        if (!document.getElementById(styleId)) {
          var s = document.createElement('style');
          s.id = styleId;
          s.innerHTML = [
            'body { overflow-x: auto !important; }',
            '.webmobile, app-mobilelanding { display: none !important; visibility: hidden !important; height: 0 !important; max-height: 0 !important; overflow: hidden !important; pointer-events: none !important; }',
            '.webpage { display: block !important; visibility: visible !important; opacity: 1 !important; height: auto !important; min-height: 100vh !important; }',
            '@media only screen and (max-width: 900px) {',
            '  .webmobile, app-mobilelanding { display: none !important; visibility: hidden !important; height: 0 !important; }',
            '  .webpage { display: block !important; visibility: visible !important; }',
            '}'
          ].join(' ');
          (document.head || document.documentElement).appendChild(s);
        }

        var meta = document.querySelector('meta[name="viewport"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.name = 'viewport';
          (document.head || document.documentElement).appendChild(meta);
        }
        meta.content = 'width=1280, initial-scale=0.5, minimum-scale=0.25, maximum-scale=5.0, user-scalable=yes';
      } catch(e) {}
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyDesktopStyles);
    } else {
      applyDesktopStyles();
    }
    var cssTimer = setInterval(applyDesktopStyles, 500);
    setTimeout(function() { clearInterval(cssTimer); }, 15000);

    // 3. Network Fetch & XHR Interception (catches plain-text OTP login response instantly)
    try {
      if (window.fetch) {
        var origFetch = window.fetch;
        window.fetch = function() {
          return origFetch.apply(this, arguments).then(function(res) {
            try {
              var clone = res.clone();
              clone.text().then(function(txt) {
                if (txt && (txt.indexOf('token_id') !== -1 || txt.indexOf('token') !== -1 || txt.indexOf('jwt') !== -1)) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'DHAN_RAW_NETWORK_RESPONSE',
                    body: txt
                  }));
                }
              }).catch(function(){});
            } catch(e) {}
            return res;
          });
        };
      }
    } catch(e) {}

    try {
      if (window.XMLHttpRequest) {
        var origOpen = XMLHttpRequest.prototype.open;
        var origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function() {
          return origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function() {
          this.addEventListener('load', function() {
            try {
              var txt = this.responseText;
              if (txt && (txt.indexOf('token_id') !== -1 || txt.indexOf('token') !== -1 || txt.indexOf('jwt') !== -1)) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'DHAN_RAW_NETWORK_RESPONSE',
                  body: txt
                }));
              }
            } catch(e) {}
          });
          return origSend.apply(this, arguments);
        };
      }
    } catch(e) {}

    // 4. Hook localStorage.setItem to immediately catch storage writes
    try {
      var origLocalSet = window.localStorage.setItem;
      var hasSentSetItem = false;
      window.localStorage.setItem = function(key, val) {
        origLocalSet.apply(this, arguments);
        if (!hasSentSetItem && (key === 'userdata' || key === 'JWTtoken' || key === 'TxnToken' || key === 'first_auth')) {
          hasSentSetItem = true;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DHAN_ENCRYPTED_STORAGE',
            key: key,
            value: val
          }));
        }
      };
    } catch(e) {}
  })();
  true;
`;

const INJECTED_TOKEN_INTERCEPTOR = `
  (function() {
    var hasSent = false;
    function checkStorage() {
      if (hasSent) return true;
      try {
        var u = window.localStorage.getItem('userdata');
        var j = window.localStorage.getItem('JWTtoken');
        var f = window.localStorage.getItem('first_auth');
        var t = window.localStorage.getItem('TxnToken');
        var s = window.sessionStorage.getItem('userdata');
        if (u || j || f || t || s) {
          hasSent = true;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DHAN_PERIODIC_CHECK',
            payload: {
              userdata: u,
              JWTtoken: j,
              first_auth: f,
              TxnToken: t,
              sessionUserdata: s
            }
          }));
          return true;
        }
      } catch(e) {}
      return false;
    }

    var poll = setInterval(function() {
      if (checkStorage()) {
        clearInterval(poll);
      }
    }, 800);

    checkStorage();
  })();
  true;
`;

export function DhanWebLoginModal({ visible, onClose, onSuccess }: DhanWebLoginModalProps) {
  const [loading, setLoading] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  const capturedRef = useRef(false);
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    if (visible) {
      capturedRef.current = false;
      setIsCapturing(false);
      setLoading(true);
    }
  }, [visible]);

  const handleClose = () => {
    capturedRef.current = false;
    setIsCapturing(false);
    onClose();
  };

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      let creds: { clientId: string; token: string; name: string } | null = null;

      if (data.type === 'DHAN_LOGIN_SUCCESS' && data.payload?.token) {
        creds = {
          clientId: data.payload.clientId || '1113940120',
          token: data.payload.token,
          name: data.payload.name || 'Dhan Trader',
        };
      } else if (data.type === 'DHAN_RAW_NETWORK_RESPONSE' && data.body) {
        creds = tryExtractCredentials(data.body);
      } else if (data.type === 'DHAN_ENCRYPTED_STORAGE' && data.value) {
        creds = tryExtractCredentials(data.value);
      } else if (data.type === 'DHAN_PERIODIC_CHECK' && data.payload) {
        const p = data.payload;
        creds =
          tryExtractCredentials(p.userdata) ||
          tryExtractCredentials(p.first_auth) ||
          tryExtractCredentials(p.JWTtoken) ||
          tryExtractCredentials(p.TxnToken) ||
          tryExtractCredentials(p.sessionUserdata);
      } else if (data.type === 'DHAN_STORAGE_DUMP' && data.payload) {
        const ls = data.payload.localStorage || {};
        const ss = data.payload.sessionStorage || {};

        // 1. Try known keys in localStorage and sessionStorage
        creds =
          tryExtractCredentials(ls.userdata) ||
          tryExtractCredentials(ls.first_auth) ||
          tryExtractCredentials(ls.JWTtoken) ||
          tryExtractCredentials(ls.TxnToken) ||
          tryExtractCredentials(ss.userdata);

        // 2. Try URL query param ?user=...
        if (!creds && data.payload.url && data.payload.url.includes('user=')) {
          try {
            const urlObj = new URL(data.payload.url);
            const userParam = urlObj.searchParams.get('user');
            if (userParam) {
              creds = tryExtractCredentials(decodeURIComponent(userParam));
            }
          } catch {}
        }

        // 3. Scan all other localStorage keys
        if (!creds) {
          for (const key of Object.keys(ls)) {
            creds = tryExtractCredentials(ls[key]);
            if (creds) break;
          }
        }

        // If manual capture still found nothing, alert user
        if (!creds) {
          Alert.alert(
            'Session Checking',
            'No Dhan login credentials found in active browser storage yet.\n\nPlease complete your Mobile number, Password, and OTP verification on the page first, then tap capture.'
          );
          return;
        }
      }

      if (creds && creds.token && !capturedRef.current) {
        capturedRef.current = true;
        setIsCapturing(true);

        const clientId = creds.clientId || '1113940120';
        const token = creds.token;
        const traderName = creds.name || 'Dhan Trader';

        // 1. Immediately save plain-text credentials in storage
        await dhanPlainStorage.save(clientId, token);
        await dhanDirectService.saveCredentials(clientId, token);

        // 2. Notify parent Settings screen
        onSuccess(clientId, token);

        // 3. Dismiss modal IMMEDIATELY so user is smoothly returned to app with zero lag
        setIsCapturing(false);
        onClose();

        // 4. In background, start live Dhan streamer and refresh store silently
        dhanWebStreamer.start();
        useRadarStore.getState().initStreamer();
        useRadarStore.getState().refreshAll(false);

        // 5. Fire success haptics and show clean notification on parent screen
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => {
          Alert.alert(
            '⚡ Dhan Live Stream Connected!',
            `Welcome, ${traderName}!\n\nClient ID: ${clientId}\nToken captured successfully.\n\nLive real-time market streaming is now active on all screens.`
          );
        }, 350);
      }
    } catch {
      // Ignored non-json web messages
    }
  };

  const handleManualForceCapture = () => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            var s = document.createElement('style');
            s.innerHTML = '.webmobile, app-mobilelanding { display: none !important; } .webpage { display: block !important; visibility: visible !important; }';
            (document.head || document.documentElement).appendChild(s);
          } catch(e) {}

          var dump = {
            url: window.location.href,
            localStorage: {},
            sessionStorage: {}
          };
          try {
            for (var i = 0; i < window.localStorage.length; i++) {
              var k = window.localStorage.key(i);
              if (k) dump.localStorage[k] = window.localStorage.getItem(k);
            }
            for (var j = 0; j < window.sessionStorage.length; j++) {
              var sk = window.sessionStorage.key(j);
              if (sk) dump.sessionStorage[sk] = window.sessionStorage.getItem(sk);
            }
          } catch(e) {}

          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DHAN_STORAGE_DUMP',
            payload: dump
          }));
        })();
        true;
      `);
    }
  };

  const handleReload = () => {
    if (webViewRef.current) {
      setLoading(true);
      webViewRef.current.reload();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#0A111C" />

        {/* Top Header Bar */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.lockBadge}>
              <Text style={styles.lockIcon}>🔒</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>Dhan Web Official Portal</Text>
              <Text style={styles.headerSub}>web.dhan.co • Auto-Token Interception</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={handleReload}>
              <Text style={styles.iconBtnText}>↻</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <Text style={styles.closeBtnText}>✕ Close</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Security Trust Notice */}
        <View style={styles.securityBanner}>
          <Text style={styles.securityText}>
            🛡️ <Text style={{ fontWeight: '700' }}>Direct Official Login:</Text> You are logging directly into Dhan's official servers. Your password, OTP, and PIN remain strictly between you and Dhan. QuantMobile only captures the resulting streaming session token.
          </Text>
        </View>

        {/* Embedded Official Dhan Web Terminal */}
        <View style={styles.webViewContainer}>
          <WebView
            ref={webViewRef}
            source={{ uri: 'https://web.dhan.co' }}
            userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            injectedJavaScriptBeforeContentLoaded={DESKTOP_VIEWPORT_INJECTION}
            injectedJavaScript={INJECTED_TOKEN_INTERCEPTOR}
            scalesPageToFit={true}
            setSupportMultipleWindows={false}
            onMessage={handleMessage}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            style={styles.webView}
          />

          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.bullish} />
              <Text style={styles.loadingText}>Connecting to web.dhan.co...</Text>
            </View>
          )}

          {isCapturing && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.cyan} />
              <Text style={styles.loadingText}>Connecting Live Stream & Returning to App...</Text>
            </View>
          )}
        </View>

        {/* Bottom Floating Bar with Dual Action: Quick Close + Force Capture */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.bottomCloseBtn}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <Text style={styles.bottomCloseBtnText}>✕ Close / Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.captureBtn}
            onPress={handleManualForceCapture}
            activeOpacity={0.8}
          >
            <Text style={styles.captureBtnText}>⚡ Finished Login? Tap to Capture</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#070D18',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#0A111C',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lockBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockIcon: {
    fontSize: 14,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  headerSub: {
    color: colors.textMuted,
    fontSize: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  iconBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  closeBtnText: {
    color: colors.bearish,
    fontSize: 12,
    fontWeight: '700',
  },
  securityBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  securityText: {
    color: colors.textSecondary,
    fontSize: 10.5,
    lineHeight: 15,
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#FFFFFF',
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 13, 24, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0A111C',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  bottomCloseBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomCloseBtnText: {
    color: colors.bearish,
    fontSize: 12,
    fontWeight: '700',
  },
  captureBtn: {
    flex: 1,
    backgroundColor: colors.bullish,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
