const WebSocket = require('ws');
const { sha512 } = require('js-sha512');

const DHAN_WEB_WS_URL = 'wss://price-feed-web.dhan.co:443';
const DHAN_BROKER_CODE = 'DHN1804';
const DHAN_WEB_SOURCE = 'W';

const clientId = '1113940120';
const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJ1c2VyUmVnaW9uIjoiUjEiLCJpc3MiOiJkaGFuIiwicGFydG5lcklkIjoiIiwiZXhwIjoxNzkyMzA3ODY5LCJpYXQiOjE3OTIyMjE0NjksInRva2VuQ29uc3VtZXJUeXBlIjoiU0VMRiIsIndlYmhvb2tVcmwiOiIiLCJkaGFuQ2xpZW50SWQiOiIxMTEzOTQwMTIwIn0.2eFzNCmbHavQN07dCEx5vREthPlStlCo-ysmy50k-8MnK-Aq1SIngR0RZBJzjxfeCPtWdrmOSTF9QDa5TM9aSQ';
const tabId = '1';

function getDhanJulianEpochSeconds() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const date = String(now.getUTCDate()).padStart(2, '0');
  const utcDateStr = `${year}-${month}-${date}`;
  const todayMs = new Date(utcDateStr).getTime();
  const base1980Ms = new Date('1980-01-01T00:00:00Z').getTime();
  return Math.floor((todayMs - base1980Ms) / 1000);
}

function generateDhanWebSignature(fullClientId) {
  const julianSec = getDhanJulianEpochSeconds();
  const rawString = `${DHAN_BROKER_CODE}-${fullClientId}-${DHAN_WEB_SOURCE}-C-${julianSec}`;
  const hashBytes = sha512.array(rawString);
  let binaryStr = '';
  for (let i = 0; i < hashBytes.length; i++) {
    binaryStr += String.fromCharCode(hashBytes[i]);
  }
  return Buffer.from(binaryStr, 'binary').toString('base64');
}

function writePaddedString(view, offset, length, str) {
  for (let i = 0; i < length; i++) {
    const code = i < str.length ? str.charCodeAt(i) : 0;
    view.setInt8(offset + i, code);
  }
}

function buildAuthPacket(rawClientId, rawToken) {
  const fullClientId = `${rawClientId}${tabId}`;
  const fullToken = `${rawToken}${tabId}`;
  const buffer = new ArrayBuffer(703);
  const view = new DataView(buffer);

  view.setInt8(0, 41);
  view.setUint16(1, 703, true);

  writePaddedString(view, 3, 30, fullClientId);
  writePaddedString(view, 33, 50, fullToken);

  const sig = generateDhanWebSignature(fullClientId);
  writePaddedString(view, 83, 500, sig);

  writePaddedString(view, 583, 50, DHAN_BROKER_CODE);
  writePaddedString(view, 633, 50, fullClientId);
  writePaddedString(view, 683, 10, DHAN_WEB_SOURCE);
  writePaddedString(view, 693, 10, 'C');

  return Buffer.from(buffer);
}

function buildSubscribePacket(rawClientId, rawToken, secId) {
  const fullClientId = `${rawClientId}${tabId}`;
  const fullToken = `${rawToken}${tabId}`;
  const buffer = new ArrayBuffer(129);
  const view = new DataView(buffer);

  view.setInt8(0, 12); // Code 12 = Equity Quote
  view.setUint16(1, 129, true);

  writePaddedString(view, 3, 30, fullClientId);
  writePaddedString(view, 33, 50, fullToken);
  view.setInt8(83, 1); // NSE_EQ
  view.setInt32(84, -1, true);
  view.setInt8(88, 1);
  writePaddedString(view, 89, 20, 'abc');
  writePaddedString(view, 109, 20, secId.toString());

  return Buffer.from(buffer);
}

console.log('Connecting to Dhan Web Streamer:', DHAN_WEB_WS_URL);
const ws = new WebSocket(DHAN_WEB_WS_URL, {
  headers: {
    'Origin': 'https://web.dhan.co',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  }
});

ws.on('open', () => {
  console.log('>>> [1] HTTP 101 WebSocket Upgrade CONNECTED! <<<');
  const authPacket = buildAuthPacket(clientId, token);
  console.log('>>> [2] Sending 703-byte Auth Packet (SHA-512 Signed)...');
  ws.send(authPacket);

  setTimeout(() => {
    console.log('>>> [3] Sending 129-byte Subscription for HDFCBANK (1333) & RELIANCE (2885)...');
    ws.send(buildSubscribePacket(clientId, token, '1333'));
    ws.send(buildSubscribePacket(clientId, token, '2885'));
  }, 500);
});

ws.on('message', (data) => {
  if (data.length === 1) {
    // Heartbeat ack 0x20
    ws.send(Buffer.from([0x20]));
    return;
  }

  let offset = 0;
  while (offset < data.length) {
    const chunk = data.slice(offset);
    if (chunk.length < 11) break;

    const packetLen = chunk[9];
    const packetType = chunk[10];
    if (packetLen < 11) break;
    offset += packetLen;

    // Type 1: LTP Tick
    if (packetType === 1 && chunk.length >= 37) {
      const secId = chunk.readUInt32LE(1);
      const ltp = chunk.readFloatLE(11);
      const vol = chunk.readUInt32LE(17);
      console.log(`⚡ [LIVE TICK Type 1] SecID: ${secId} | LTP: ₹${ltp.toFixed(2)} | Volume: ${vol.toLocaleString('en-IN')}`);
    }
    // Type 3: OHLC
    else if (packetType === 3 && chunk.length >= 27) {
      const secId = chunk.readUInt32LE(1);
      const open = chunk.readFloatLE(11);
      const close = chunk.readFloatLE(15);
      const high = chunk.readFloatLE(19);
      const low = chunk.readFloatLE(23);
      console.log(`📊 [OHLC Type 3] SecID: ${secId} | Open: ₹${open.toFixed(2)} | High: ₹${high.toFixed(2)} | Low: ₹${low.toFixed(2)} | Close: ₹${close.toFixed(2)}`);
    }
    // Type 32: Prev Close
    else if (packetType === 32 && chunk.length >= 19) {
      const secId = chunk.readUInt32LE(1);
      const prevClose = chunk.readFloatLE(11);
      console.log(`📌 [PREV CLOSE Type 32] SecID: ${secId} | PrevClose: ₹${prevClose.toFixed(2)}`);
    }
  }
});

ws.on('error', (err) => {
  console.error('>>> WS ERROR:', err.message);
});

ws.on('close', (code, reason) => {
  console.log('>>> WS CLOSED:', code, reason ? reason.toString() : '');
  process.exit(0);
});

setTimeout(() => {
  console.log('Test complete after 6 seconds.');
  ws.close();
  process.exit(0);
}, 6000);
