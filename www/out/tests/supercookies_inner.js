import * as IdbKeyVal from 'https://cdn.jsdelivr.net/npm/idb-keyval@3/dist/idb-keyval.mjs';

console.log("hi");


let testURI = (path, type, key) =>
    `https://arthuredelstein.net/browser-privacy-live/${path}?type=${type}&key=${key}`;

let tests = {
  "cookie": {
    write: (secret) => {
      let expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);
      document.cookie = `secret=${secret};expires=${expiry.toUTCString()}`;
    },
    read: () => document.cookie ? document.cookie.match(/secret=(\S+)/)[1] : null,
   },
  "localStorage": {
    write: (secret) => localStorage.setItem("secret", secret),
    read: () => localStorage.getItem("secret"),
  },
  "indexedDB": {
    write: (secret) => IdbKeyVal.set("secret", secret),
    read: () => IdbKeyVal.get("secret")
  },
  "SharedWorker": {
    write: (secret) => {
      let worker = new SharedWorker("supercookies_sharedworker.js");
      worker.port.start();
      worker.port.postMessage(secret);
    },
    read: () =>
      new Promise((resolve, reject) => {
        let worker = new SharedWorker("supercookies_sharedworker.js");
        worker.port.start();
        worker.port.postMessage("request");
        worker.port.onmessage = (e) => resolve(e.data);
        setTimeout(() => reject("no SharedWorker message received"), 1000);
      })
  },
  "blob": {
    write: (secret) => URL.createObjectURL(new Blob([secret])),
    read: async (url) => {
      if (url) {
        let response = await fetch(url);
        return response.text();
      }
    },
  },
  "BroadcastChannel": {
    write: (secret) => {
      let bc = new BroadcastChannel("secrets");
      bc.onmessage = (event) => {
        if (event.data === "request") {
          bc.postMessage(secret);
        }
      }
    },
    read: () =>
      new Promise((resolve, reject) => {
        let bc = new BroadcastChannel("secrets");
        bc.onmessage = (event) => {
          if (event.data !== "request") {
            resolve(event.data);
          }
        };
        bc.postMessage("request");
        setTimeout(() => reject({message: "no BroadcastChannel message"}), 3000);
      })
  },
  "fetch_caching": {
    write: async () => {
      let response = await fetch("https://worldtimeapi.org/api/timezone/etc/utc",
                                 {cache: "reload"});
      let json = await response.json();
      return {"secret": json["utc_datetime"]};
    },
    read: async () => {
      let response = await fetch("https://worldtimeapi.org/api/timezone/etc/utc",
                                 {cache: "force-cache"});
      let json = await response.json();
      return json["utc_datetime"];
    }
  },
  "XMLHttpRequest": {
    write: () => new Promise((resolve, reject) => {
      let xhr = new XMLHttpRequest();
      xhr.addEventListener("load", () => resolve(
        {"secret": xhr.getResponseHeader("date")}));
      xhr.open("GET", "https://arthuredelstein.net");
      xhr.setRequestHeader("Cache-Control", "no-cache");
      xhr.send();
      setTimeout(() => reject({message: "XHR: no response"}), 3000);
    }),
    read: () => new Promise((resolve, reject) => {
      let xhr = new XMLHttpRequest();
      xhr.addEventListener("load", () => resolve(
        xhr.getResponseHeader("date")));
      xhr.open("GET", "https://arthuredelstein.net");
      xhr.setRequestHeader("Cache-Control", "max-age");
      xhr.send();
      setTimeout(() => reject({message: "XHR: no response"}), 3000);
    })
  },
  "iframe": {
    write: (key) => new Promise((resolve, reject) => {
      let iframe = document.createElement("iframe");
      document.body.appendChild(iframe);
      iframe.addEventListener("load", () => resolve(key), {once: true});
      iframe.src = testURI("resource", "page", key);
    }),
    read: async (key) => {
      let iframe = document.createElement("iframe");
      document.body.appendChild(iframe);
      let iframeLoadPromise = new Promise((resolve, reject) => {
        iframe.addEventListener("load", resolve, {once: true});
      });
      let address = testURI("resource", "page", key);
      iframe.src = address;
      await iframeLoadPromise;
      let response = await fetch(
        testURI("count", "page", key), {"cache": "force-cache"});
      return (await response.text()).trim();
    }
  },
  "image": {
    write: (key) => new Promise((resolve, reject) => {
      let img = document.createElement("img");
      document.body.appendChild(img);
      img.addEventListener("load", () => resolve(key), {once: true});
      img.src = testURI("resource", "image", key);
    }),
    read: async (key) => {
      let img = document.createElement("img");
      document.body.appendChild(img);
      let imgLoadPromise = new Promise((resolve, reject) => {
        img.addEventListener("load", resolve, {once: true});
      });
      let address = testURI("resource", "image", key);
      img.src = address;
      await imgLoadPromise;
      let response = await fetch(
        testURI("count", "image", key), {"cache": "force-cache"});
      return (await response.text()).trim();
    }
  }
};

let runTests = async (mode, params) => {
  let results = {};
  for (let test of Object.keys(tests)) {
    let result;
    try {
      let input = params[test] || params["default"];
      console.log("input", input);
      result = await tests[test][mode](input);
    } catch (e) {
      result = "Error: " + e.message;
    }
    results[test] = {
      write: tests[test].write.toString(),
      read: tests[test].read.toString(),
      result,
    };
  }
  return results;
};

let queryParams = (urlString) => {
  let searchParams = new URL(urlString).searchParams;
  return Object.fromEntries(searchParams.entries());
};

(async () => {
  let params = queryParams(document.URL);
  let results = await runTests(params["mode"], params);
  console.log("results", results);
  if (window.location !== parent.location) {
    parent.postMessage(results, "*");
  }
})();
console.log("hello from supercookies_inner.js");