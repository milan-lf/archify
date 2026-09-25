    Archify.readerLayout = (function () {
      var html = document.documentElement;
      var body = document.body;
      var shell = document.querySelector('.container');
      var diagram = document.querySelector('.diagram-container');
      var svg = Archify.stage.svg();
      var header = shell && shell.querySelector('.header');
      var guided = shell && shell.querySelector('.guided-views');
      // A levels document adds a breadcrumb rail above the diagram. It is
      // fixed chrome like the header, so it must enter the height budget or
      // the adaptive width oscillates and never settles.
      var levelRail = shell && shell.querySelector('.level-rail');
      var cards = shell && shell.querySelector('.cards:not([hidden])');
      var viewBox = svg && svg.viewBox && svg.viewBox.baseVal;
      var ratio = viewBox && viewBox.height > 0 ? viewBox.width / viewBox.height : 0;
      var frame = 0;
      var settleFrame = 0;
      var lastWidth = 0;
      var WIDE_RATIO = 1.55;
      var MIN_DESKTOP_WIDTH = 1024;
      var MIN_READER_WIDTH = 960;
      var MAX_READER_WIDTH = 1920;
      var SAFE_BOTTOM_GAP = 12;

      function reflectShape() {
        if (!diagram) return;
        if (ratio >= WIDE_RATIO) {
          diagram.setAttribute('data-wide-diagram', 'true');
          html.setAttribute('data-diagram-shape', 'wide');
        } else {
          diagram.removeAttribute('data-wide-diagram');
          html.removeAttribute('data-diagram-shape');
        }
      }
      reflectShape();

      // Levels can differ in aspect ratio and in whether they carry cards, and
      // both feed the adaptive width, so the measurement inputs are rebuilt
      // whenever the stage changes rather than kept from the level that loaded.
      Archify.stage.onChange(function () {
        svg = Archify.stage.svg();
        cards = shell && shell.querySelector('.cards:not([hidden])');
        viewBox = svg && svg.viewBox && svg.viewBox.baseVal;
        ratio = viewBox && viewBox.height > 0 ? viewBox.width / viewBox.height : 0;
        lastWidth = 0;
        reflectShape();
        schedule();
      });

      function number(value) {
        var parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      function visible(element) {
        return Boolean(element && !element.hidden && window.getComputedStyle(element).display !== 'none');
      }
      function outerHeight(element) {
        if (!visible(element)) return 0;
        var style = window.getComputedStyle(element);
        return element.getBoundingClientRect().height + number(style.marginTop) + number(style.marginBottom);
      }
      function eligible() {
        return Boolean(
          shell && diagram && svg && ratio >= WIDE_RATIO &&
          window.innerWidth >= MIN_DESKTOP_WIDTH &&
          html.getAttribute('data-embed') !== 'true' &&
          html.getAttribute('data-present') !== 'true' &&
          (!window.matchMedia || !window.matchMedia('print').matches)
        );
      }
      function clear() {
        html.style.removeProperty('--archify-reader-width');
        html.removeAttribute('data-reader-layout');
        html.removeAttribute('data-reader-overflow');
        lastWidth = 0;
      }
      function chromeMetrics() {
        var bodyStyle = window.getComputedStyle(body);
        var diagramStyle = window.getComputedStyle(diagram);
        return {
          bodyX: number(bodyStyle.paddingLeft) + number(bodyStyle.paddingRight),
          bodyY: number(bodyStyle.paddingTop) + number(bodyStyle.paddingBottom),
          diagramX: number(diagramStyle.paddingLeft) + number(diagramStyle.paddingRight) +
            number(diagramStyle.borderLeftWidth) + number(diagramStyle.borderRightWidth),
          diagramY: number(diagramStyle.paddingTop) + number(diagramStyle.paddingBottom) +
            number(diagramStyle.borderTopWidth) + number(diagramStyle.borderBottomWidth)
        };
      }
      function applyWidth(width) {
        var rounded = Math.round(width);
        if (Math.abs(rounded - lastWidth) < 1) return false;
        lastWidth = rounded;
        html.style.setProperty('--archify-reader-width', rounded + 'px');
        html.setAttribute('data-reader-layout', 'adaptive');
        return true;
      }
      function settleOverflow(minWidth) {
        if (settleFrame) cancelAnimationFrame(settleFrame);
        settleFrame = requestAnimationFrame(function () {
          settleFrame = 0;
          if (!eligible() || !lastWidth) return;
          var overflow = Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight
          ) - window.innerHeight;
          if (overflow > 1 && lastWidth > minWidth) {
            applyWidth(Math.max(minWidth, lastWidth - overflow * ratio - 4));
            html.setAttribute('data-reader-overflow', 'reduced');
          } else if (overflow > 1) {
            html.setAttribute('data-reader-overflow', 'authored');
          } else {
            html.removeAttribute('data-reader-overflow');
          }
        });
      }
      function measure() {
        frame = 0;
        if (!eligible()) {
          clear();
          return null;
        }
        var chrome = chromeMetrics();
        var viewportCap = Math.max(0, window.innerWidth - chrome.bodyX);
        var minWidth = Math.min(MIN_READER_WIDTH, viewportCap);
        var maxWidth = Math.min(MAX_READER_WIDTH, viewportCap);
        var fixedHeight = chrome.bodyY + chrome.diagramY + SAFE_BOTTOM_GAP +
          outerHeight(header) + outerHeight(levelRail) + outerHeight(guided) + outerHeight(cards);
        var availableSvgHeight = Math.max(1, window.innerHeight - fixedHeight);
        var desiredWidth = availableSvgHeight * ratio + chrome.diagramX;
        var width = Math.max(minWidth, Math.min(maxWidth, desiredWidth));
        applyWidth(width);
        settleOverflow(minWidth);
        return {
          ratio: ratio,
          width: Math.round(width),
          availableSvgHeight: Math.round(availableSvgHeight),
          fixedHeight: Math.round(fixedHeight)
        };
      }
      function schedule() {
        if (frame) return;
        frame = requestAnimationFrame(measure);
      }
      function stableSnapshot() {
        var shellRect = shell ? shell.getBoundingClientRect() : { width: 0, height: 0 };
        var diagramRect = diagram ? diagram.getBoundingClientRect() : { width: 0, height: 0 };
        return [
          lastWidth,
          html.getAttribute('data-reader-layout') || '',
          html.getAttribute('data-reader-overflow') || '',
          Math.ceil(document.documentElement.scrollWidth),
          Math.ceil(document.documentElement.scrollHeight),
          Math.ceil(document.body.scrollWidth),
          Math.ceil(document.body.scrollHeight),
          Math.round(shellRect.width * 100) / 100,
          Math.round(shellRect.height * 100) / 100,
          Math.round(diagramRect.width * 100) / 100,
          Math.round(diagramRect.height * 100) / 100
        ].join('|');
      }
      function whenStable() {
        return Archify.waitForStableLayout({
          schedule: schedule,
          pending: function () { return Boolean(frame || settleFrame); },
          snapshot: stableSnapshot,
          timeoutMessage: 'Adaptive reader layout did not reach stable dimensions.'
        });
      }

      window.addEventListener('resize', schedule, { passive: true });
      window.addEventListener('load', schedule, { once: true });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule).catch(function () {});
      if (typeof ResizeObserver === 'function') {
        var resizeObserver = new ResizeObserver(schedule);
        [header, levelRail, guided, cards].forEach(function (element) { if (element) resizeObserver.observe(element); });
      }
      if (typeof MutationObserver === 'function') {
        var contentObserver = new MutationObserver(schedule);
        if (guided) contentObserver.observe(guided, { attributes: true, childList: true, subtree: true });
        if (levelRail) contentObserver.observe(levelRail, { attributes: true, childList: true, subtree: true });
        if (cards) contentObserver.observe(cards, { attributes: true, childList: true, subtree: true });
        contentObserver.observe(html, { attributes: true, attributeFilter: ['data-embed', 'data-present'] });
      }
      schedule();

      return {
        measure: measure,
        schedule: schedule,
        whenStable: whenStable,
        active: function () { return html.getAttribute('data-reader-layout') === 'adaptive'; },
        receipt: function () { return { ratio: ratio, width: lastWidth }; }
      };
    })();
