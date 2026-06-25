// Injected into the live-preview deck (same-origin http) so the editor app can
// inline-edit text. Makes block text contenteditable, maps DOM edits back to
// block ids, and forwards selection to the parent. postMessage only.
export const previewBridge = `
(function () {
  'use strict';
  if (window.parent === window) return;           // only when embedded in the editor
  var P = window.parent;
  function post(m) { try { P.postMessage(m, '*'); } catch (e) {} }

  // serialize edited rich text back to inline markdown (**bold** / *em*)
  function toMd(el) {
    var h = el.innerHTML
      .replace(/<strong[^>]*>/gi, '**').replace(/<\\/strong>/gi, '**')
      .replace(/<b[^>]*>/gi, '**').replace(/<\\/b>/gi, '**')
      .replace(/<em[^>]*>/gi, '*').replace(/<\\/em>/gi, '*')
      .replace(/<i[^>]*>/gi, '*').replace(/<\\/i>/gi, '*')
      .replace(/<br\\s*\\/?>/gi, '\\n')
      .replace(/<[^>]+>/g, '');
    var t = document.createElement('textarea'); t.innerHTML = h;
    return t.value.replace(/\\u00a0/g, ' ').replace(/\\n{2,}/g, '\\n').trim();
  }

  function editable(el, onCommit, onSelect) {
    el.setAttribute('contenteditable', 'true');
    el.classList.add('sm-editable');
    el.addEventListener('focus', onSelect);
    el.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    el.addEventListener('keydown', function (e) { e.stopPropagation(); }); // don't let the deck nav steal keys
    el.addEventListener('blur', onCommit);
  }

  function wire(blk) {
    var bid = blk.getAttribute('data-bid');
    var type = (blk.className.match(/blk\\s+(\\w+)/) || [])[1] || '';
    var sel = function () { post({ type: 'sm-select', bid: bid, btype: type }); };
    blk.addEventListener('click', sel);   // clicking any block selects it (for the panel)

    if (blk.matches('h1,h2,h3') || blk.classList.contains('p')) {
      editable(blk, function () { post({ type: 'sm-edit', bid: bid, field: 'text', value: toMd(blk) }); }, sel);
    } else if (blk.classList.contains('list')) {
      var lis = blk.querySelectorAll('li');
      lis.forEach(function (li) {
        editable(li, function () {
          var items = [].map.call(blk.querySelectorAll('li'), function (x) { return toMd(x); }).filter(function (s) { return s.length; });
          post({ type: 'sm-edit', bid: bid, field: 'items', value: items });
        }, sel);
      });
    } else if (blk.classList.contains('quote')) {
      var p = blk.querySelector('p');
      if (p) editable(p, function () { post({ type: 'sm-edit', bid: bid, field: 'text', value: toMd(p) }); }, sel);
      var cite = blk.querySelector('cite');
      if (cite) editable(cite, function () { post({ type: 'sm-edit', bid: bid, field: 'cite', value: toMd(cite) }); }, sel);
    } else if (blk.classList.contains('fig')) {
      var cap = blk.querySelector('figcaption');
      if (cap) editable(cap, function () { post({ type: 'sm-edit', bid: bid, field: 'alt', value: toMd(cap) }); }, sel);
    }
  }

  function init() {
    var blocks = document.querySelectorAll('.sm-deck [data-bid]');
    blocks.forEach(wire);
    var st = document.createElement('style');
    st.textContent = '.sm-editable{outline:1px dashed rgba(120,120,120,.45);outline-offset:3px;cursor:text;border-radius:2px}'
      + '.sm-editable:hover{outline-color:rgba(181,64,42,.7)}'
      + '.sm-editable:focus{outline:2px solid #B5402A;background:rgba(181,64,42,.06)}'
      // hide the deck's own chrome inside the editor canvas (the editor drives nav)
      + '.sm-topbar,.sm-sidebar,.sm-nav{display:none!important}'
      + '.sm-stage{top:0!important;left:0!important;padding:18px!important}';
    document.head.appendChild(st);
    // recompute slide scale now the stage fills the iframe
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    post({ type: 'sm-ready' });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;
