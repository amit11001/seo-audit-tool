/* Progressive enhancement only — every page works with JavaScript disabled,
   which is also how a crawler sees it. */
(function () {
  'use strict';

  var form = document.querySelector('.audit-form');
  if (!form) return;

  var button = form.querySelector('button[type="submit"]');
  var input = form.querySelector('#url');

  form.addEventListener('submit', function () {
    if (!input.value.trim()) return;
    button.disabled = true;
    button.textContent = 'Fetching page…';
  });

  // Re-enable if the browser restores this page from the back/forward cache.
  window.addEventListener('pageshow', function () {
    button.disabled = false;
    button.textContent = 'Run audit';
  });
})();
