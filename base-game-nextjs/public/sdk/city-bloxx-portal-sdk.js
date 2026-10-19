(function (global) {
  "use strict";

  var NAMESPACE = "city-bloxx:portal";
  var VERSION = 1;

  function connect(iframe, options) {
    if (!iframe || typeof iframe !== "object") {
      throw new Error("CityBloxxPortal.connect requires an HTMLIFrameElement");
    }
    var opts = options || {};
    var targetOrigin = (opts.targetOrigin || "*").trim() || "*";
    var listeners = {};
    var pending = {};
    var seq = 0;

    function post(type, payload, requestId) {
      var win = iframe.contentWindow;
      if (!win) return;
      var msg = {
        namespace: NAMESPACE,
        version: VERSION,
        type: type
      };
      if (payload !== undefined) msg.payload = payload;
      if (requestId !== undefined) msg.requestId = requestId;
      win.postMessage(msg, targetOrigin);
    }

    function onMessage(event) {
      if (iframe.contentWindow && event.source && event.source !== iframe.contentWindow) return;
      if (targetOrigin !== "*" && event.origin !== targetOrigin) return;
      var data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.namespace !== NAMESPACE || data.version !== VERSION) return;

      if (data.requestId && pending[data.requestId]) {
        var req = pending[data.requestId];
        clearTimeout(req.timer);
        delete pending[data.requestId];
        req.resolve(data.payload);
      }

      var list = listeners[data.type];
      if (list) {
        for (var i = 0; i < list.length; i++) {
          try {
            list[i](data.payload);
          } catch {}
        }
      }
    }

    global.addEventListener("message", onMessage);

    return {
      iframe: iframe,
      init: function (config) {
        post("init", config || {});
      },
      pause: function () {
        post("pause");
      },
      resume: function () {
        post("resume");
      },
      setMuted: function (muted) {
        post("setAudio", { muted: Boolean(muted) });
      },
      setLocale: function (locale) {
        post("setLocale", { locale: locale === "vi" ? "vi" : "en" });
      },
      navigate: function (screen, replayId) {
        post("navigate", { screen: screen, replayId: replayId });
      },
      setAuth: function (tokens, expiresAt) {
        post("setAuth", { tokens: tokens, expiresAt: expiresAt });
      },
      setGuest: function () {
        post("setAuth", { guest: true });
      },
      checkpoint: function (timeoutMs) {
        var id = "cp-" + (++seq);
        var wait = typeof timeoutMs === "number" ? timeoutMs : 2000;
        return new Promise(function (resolve) {
          var timer = setTimeout(function () {
            delete pending[id];
            resolve(false);
          }, wait);
          pending[id] = {
            timer: timer,
            resolve: function (payload) {
              resolve(Boolean(payload && payload.ok));
            }
          };
          post("checkpoint", undefined, id);
        });
      },
      ping: function (timeoutMs) {
        var id = "ping-" + (++seq);
        var wait = typeof timeoutMs === "number" ? timeoutMs : 2000;
        return new Promise(function (resolve, reject) {
          var timer = setTimeout(function () {
            delete pending[id];
            reject(new Error("Portal ping timeout"));
          }, wait);
          pending[id] = {
            timer: timer,
            resolve: function (payload) {
              resolve(Number((payload && payload.timestamp) || Date.now()));
            }
          };
          post("ping", undefined, id);
        });
      },
      on: function (eventName, callback) {
        if (!listeners[eventName]) listeners[eventName] = [];
        listeners[eventName].push(callback);
        return function () {
          var arr = listeners[eventName];
          if (!arr) return;
          var idx = arr.indexOf(callback);
          if (idx >= 0) arr.splice(idx, 1);
        };
      },
      dispose: function () {
        global.removeEventListener("message", onMessage);
        Object.keys(pending).forEach(function (k) {
          clearTimeout(pending[k].timer);
        });
        pending = {};
        listeners = {};
      }
    };
  }

  function mount(container, options) {
    var opts = options || {};
    var embedUrl = opts.embedUrl || "/embed";
    var url = new URL(embedUrl, global.location ? global.location.href : "http://localhost");
    if (opts.locale) url.searchParams.set("lang", opts.locale);
    if (opts.screen) url.searchParams.set("screen", opts.screen);
    if (opts.muted) url.searchParams.set("muted", "1");
    if (opts.hideLangSwitch) url.searchParams.set("hideLangSwitch", "1");
    if (opts.hideSoundControl) url.searchParams.set("hideSoundControl", "1");
    if (opts.parentOrigin) url.searchParams.set("parentOrigin", opts.parentOrigin);

    var iframe = global.document.createElement("iframe");
    iframe.src = url.toString();
    iframe.title = opts.title || "City Bloxx";
    iframe.allow = "autoplay; fullscreen; gamepad";
    iframe.style.cssText = "width:100%;height:100%;border:0;display:block;overflow:hidden;";
    container.appendChild(iframe);

    var client = connect(iframe, { targetOrigin: opts.targetOrigin || url.origin });
    if (opts.onReady) client.on("ready", opts.onReady);
    if (opts.onScore) client.on("score", opts.onScore);
    return client;
  }

  global.CityBloxxPortal = {
    NAMESPACE: NAMESPACE,
    VERSION: VERSION,
    connect: connect,
    mount: mount
  };
})(typeof window !== "undefined" ? window : globalThis);
