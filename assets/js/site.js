// WAGMI site: shared by every page.
(() => {
    'use strict';

    // Keep the footer year current.
    document.querySelectorAll('[data-year]').forEach((el) => {
        el.textContent = new Date().getFullYear();
    });
})();
