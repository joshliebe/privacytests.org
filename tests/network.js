/*jshint: esnext true */


const fetchJSON = async (...fetchArgs) => {
  let response = await fetch(...fetchArgs);
  return response.json();
};

const testTor = async () => {
  let wtfJSON = await fetchJSON("https://wtfismyip.com/json");
  console.log(wtfJSON);
  let onionooJSON = await fetchJSON(`https://onionoo.torproject.org/details?limit=1&search=${wtfJSON["YourFuckingIPAddress"]}`);
  console.log(onionooJSON);
  let resultJSON = {};
  resultJSON["IsTorExit"] = (onionooJSON.relays.length > 0);
  resultJSON["passed"] = resultJSON["IsTorExit"];
  return resultJSON;
};

const testDoH = async () => {
  let cloudflareDoH;
  try {
    let cloudflareDoHResponse = await fetchJSON("https://is-doh.help.every1dns.net/resolvertest");
    cloudflareDoH = cloudflareDoHResponse === 1;
  } catch (e) {
    console.log(e);
    cloudflareDoH = false;
  }
  let nextDoH;
  try {
    // TODO: Get this working correctly.
    let nextDoHResponse = await fetchJSON("https://test.nextdns.io/");
    nextDoH = nextDoHResponse["status"] === "unconfigured";
  } catch (e) {
    nextDoH = false;
  }
  let passed = cloudflareDoH || nextDoH;
  return { cloudflareDoH, nextDoH, passed };
};

const testGPC = async () => {
  // Ask the server what headers it sees.
  const requestHeaders = await fetchJSON("https://arthuredelstein.net/browser-privacy-live/headers");
  const passed = requestHeaders["sec-gpc"] === "1";
  return { "sec-gpc": requestHeaders["sec-gpc"], passed };
};

const insecurePassiveSubresource = async () => {
  const image = document.createElement("img");
  image.src = "http://insecure.arthuredelstein.net";
  let resultPromise = new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", reject, { once: true });
  });
  let status;
  try {
    let result = await resultPromise;
    if (image.src.startsWith("https:")) {
      // Was upgraded to a secure connection.
      status = "upgraded"; 
    } else {
      status = "insecure";
    }
  } catch (e) {
    // some sort of blocking happened
    status = "blocked";
  }
  let passed = (status === "upgraded" || status === "blocked");
  return { status, passed };
};

let runTests = async () => {
  let resultsJSON = {
    "Tor enabled": await testTor(),
    "DoH enabled": await testDoH(),
    "GPC enabled": await testGPC(),
    "Insecure passive subresources": await insecurePassiveSubresource()
  };
  console.log(resultsJSON);
  document.body.setAttribute("data-test-results", JSON.stringify(resultsJSON));
};

runTests();
