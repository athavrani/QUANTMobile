async function main() {
  const txt = await (await fetch('https://web.dhan.co/main.c9906c02750195e9.js')).text();
  const idx = txt.indexOf('httpPost(Et,Q={}){');
  console.log(txt.substring(idx - 600, idx + 100));
}

main().catch(console.error);
