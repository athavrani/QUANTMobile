const WebSocket = require('ws');
const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJ1c2VyUmVnaW9uIjoiUjEiLCJpc3MiOiJkaGFuIiwicGFydG5lcklkIjoiIiwiZXhwIjoxNzkyMzA3ODY5LCJpYXQiOjE3OTIyMjE0NjksInRva2VuQ29uc3VtZXJUeXBlIjoiU0VMRiIsIndlYmhvb2tVcmwiOiIiLCJkaGFuQ2xpZW50SWQiOiIxMTEzOTQwMTIwIn0.2eFzNCmbHavQN07dCEx5vREthPlStlCo-ysmy50k-8MnK-Aq1SIngR0RZBJzjxfeCPtWdrmOSTF9QDa5TM9aSQ';
const clientId = '1113940120';

const wsUrl = `wss://api-feed.dhan.co?version=2&token=${token}&clientId=${clientId}&authType=2`;
console.log('Connecting to:', wsUrl.substring(0, 50) + '...');

try {
  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('>>> WS CONNECTED SUCCESSFULLY! <<<');
    
    // Subscribe to HDFCBANK (1333) and RELIANCE (2885)
    const subPayload = JSON.stringify({
      RequestCode: 15,
      InstrumentCount: 2,
      InstrumentList: [
        { ExchangeSegment: "NSE_EQ", SecurityId: "1333" },
        { ExchangeSegment: "NSE_EQ", SecurityId: "2885" }
      ]
    });
    console.log('Sending subscription payload:', subPayload);
    ws.send(subPayload);
  });

  ws.on('message', (data, isBinary) => {
    console.log('>>> WS MESSAGE RECEIVED! Byte length:', data.length, 'isBinary:', isBinary);
    console.log('Buffer hex:', Buffer.from(data).toString('hex'));
    if (data.length >= 10 && data[0] === 50) {
      const code = data.readUInt16LE(8);
      console.log('>>> Dhan Server Disconnect Code:', code);
    }
  });

  ws.on('error', (err) => {
    console.error('>>> WS ERROR:', err.message);
  });

  ws.on('close', (code, reason) => {
    console.log('>>> WS CLOSED: Code =', code, 'Reason =', reason ? reason.toString() : 'none');
  });

  setTimeout(() => {
    console.log('Finishing test after 6s');
    ws.close();
    process.exit(0);
  }, 6000);
} catch (e) {
  console.error('Exception:', e.message);
}
