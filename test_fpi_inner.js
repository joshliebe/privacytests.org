let tests = {
  "cookie": {
    write: (secret) => {
      let expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);
      document.cookie = `secret=${secret};expires=${expiry.toUTCString()}`;
    },
    read: () => document.cookie.match(/secret=(\S+)/)[1],
   },
  "localStorage": {
    write: (secret) => localStorage.setItem("secret", secret),
    read: () => localStorage.getItem("secret"),
  },
  "sessionStorage": {
    write: (secret) => sessionStorage.setItem("secret", secret),
    read: () => sessionStorage.getItem("secret"),
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
};

let runWriteTests = (secret) => {
  let keys = {};
  for (let test of Object.keys(tests)) {
    console.log(test, tests[test].write.toString());
    let key = tests[test].write(secret);
    if (key !== undefined) {
      keys[test] = key;
    }
  }
  return keys;
};

let runReadTests = async (readParams) => {
  let results = {};
  for (let test of Object.keys(tests)) {
    let param = readParams[test];
    let result;
    try {
      result = await tests[test].read(param);
    } catch (e) {
      result = e.message;
    }
    results[test] = {
      write: tests[test].write.toString(),
      read: tests[test].read.toString(),
      result,
    };
  }
  return results;
};

(async () => {
  console.log("hi");
  let searchParams = new URL(document.URL).searchParams;
  let secret = searchParams.get("secret");
  let write = searchParams.get("write");
  let read = searchParams.get("read");
  console.log(searchParams, secret, write, read);
  let readParams = JSON.parse(searchParams.get("readParams"));
  let results = write ? runWriteTests(secret) : await runReadTests(readParams);
  if (window.location !== parent.location) {
    parent.postMessage(results, "*");
  }
})();
