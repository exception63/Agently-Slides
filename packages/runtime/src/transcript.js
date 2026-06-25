/* Slidesmith transcript runtime.
   Standalone: a readable script document (TOC anchors work natively).
   Embedded in presenter (iframe): also reacts to postMessage from the parent
   to scroll + whole-block highlight the current slide, toggle keyword cueing,
   and answer "what slide am I looking at" queries. Cross-window messaging uses
   postMessage only (works across file:// opaque origins). No dependencies. */
(function () {
  'use strict';
  var MSG = 'sm';
  var embedded = false;
  try { embedded = window.parent && window.parent !== window; } catch (e) { embedded = true; }
  if (embedded) document.body.classList.add('embedded');

  var slides = [].slice.call(document.querySelectorAll('.smt-slide'));
  var current = null;

  function byId(id) {
    if (!id) return null;
    // ids may contain chars not valid in CSS selectors; use getElementById
    return document.getElementById(id);
  }

  function clearHighlight() {
    if (current) { current.classList.remove('smt-current'); current = null; }
  }

  function highlight(el) {
    if (!el) return;
    if (current === el) return;
    clearHighlight();
    el.classList.add('smt-current');
    current = el;
  }

  function scrollToAnchor(anchor, smooth) {
    var el = byId(anchor);
    if (!el) return;
    highlight(el);
    try { el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }); }
    catch (e) { el.scrollIntoView(); }
  }

  // which slide article currently sits at the top of the viewport
  function currentAnchor() {
    var best = null;
    var bestTop = -Infinity;
    for (var i = 0; i < slides.length; i++) {
      var top = slides[i].getBoundingClientRect().top;
      if (top <= 120 && top > bestTop) { bestTop = top; best = slides[i]; }
    }
    if (!best && slides.length) best = slides[0];
    return best ? best.id : '';
  }

  function send(msg) {
    if (!embedded) return;
    try { window.parent.postMessage(msg, '*'); } catch (e) {}
  }

  // --- receive from presenter parent ---
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === MSG + ':scroll') { scrollToAnchor(d.anchor, true); }
    else if (d.type === MSG + ':cue') { document.body.classList.toggle('cue-on', !!d.on); }
    else if (d.type === MSG + ':query') { send({ type: MSG + ':anchor', anchor: currentAnchor() }); }
  });

  // --- TOC clicks: let native hash scroll happen, but tell the presenter ---
  var toc = document.querySelector('.smt-toc');
  if (toc) {
    toc.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var anchor = a.getAttribute('href').slice(1);
      if (embedded) send({ type: MSG + ':toc', anchor: anchor });
    });
  }

  // --- forward navigation keys to the presenter when embedded ---
  if (embedded) {
    document.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'ArrowUp' || k === 'ArrowDown' ||
          k === 'PageUp' || k === 'PageDown' || k === ' ') {
        send({ type: MSG + ':key', key: k });
        e.preventDefault();
      }
    });
    // announce readiness so the presenter can push the initial state
    send({ type: MSG + ':ready' });
  }

  // initial hash (standalone deep-link)
  if (location.hash.length > 1) scrollToAnchor(location.hash.slice(1), false);
})();
