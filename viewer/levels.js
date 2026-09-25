    Archify.levels = (function () {
      var data = document.getElementById('archify-levels-data');
      var inert = {
        count: 0,
        active: function () { return null; },
        path: function () { return []; },
        show: function () { return false; },
        up: function () { return false; }
      };
      if (!data) return inert;

      var manifest = null;
      try { manifest = JSON.parse(data.textContent || 'null'); } catch (_) { manifest = null; }
      if (!manifest || !manifest.levels || !manifest.levels.length) return inert;

      var container = Archify.stage.container();
      var shell = document.querySelector('.container');
      var rail = document.getElementById('level-rail');
      var crumbs = document.getElementById('level-crumbs');
      var children = document.getElementById('level-children');
      var guided = document.getElementById('guided-views');
      if (!container || !rail || !crumbs || !children) return inert;

      var byId = Object.create(null);
      manifest.levels.forEach(function (level) { byId[level.id] = level; });
      var root = manifest.root;
      var activeId = null;

      // The manifest declares each child's parent; the viewer needs the
      // inverse to know which node on the visible level opens something.
      var drillTargets = Object.create(null);
      manifest.levels.forEach(function (level) {
        if (!level.drillFrom) return;
        var parent = level.drillFrom.level;
        if (!drillTargets[parent]) drillTargets[parent] = Object.create(null);
        drillTargets[parent][level.drillFrom.node] = level.id;
      });

      function svgFor(id) {
        return container.querySelector('svg[data-level="' + id + '"]');
      }
      function cardsFor(id) {
        return shell ? shell.querySelector('.cards[data-level="' + id + '"]') : null;
      }
      function pathTo(id) {
        var chain = [];
        var guard = 0;
        var cursor = byId[id];
        while (cursor && guard < manifest.levels.length + 1) {
          chain.unshift(cursor.id);
          cursor = cursor.drillFrom ? byId[cursor.drillFrom.level] : null;
          guard += 1;
        }
        return chain;
      }

      function setVisible(element, visible) {
        if (!element) return;
        if (visible) {
          element.removeAttribute('hidden');
          element.removeAttribute('aria-hidden');
          element.setAttribute('data-level-active', 'true');
        } else {
          element.setAttribute('hidden', '');
          element.setAttribute('aria-hidden', 'true');
          element.removeAttribute('data-level-active');
        }
      }

      // Transient reader state belongs to the level it was raised on. Clearing
      // it through each module's own public API avoids reaching into their
      // internals and leaves every owner consistent.
      function clearTransientState() {
        try { if (Archify.focus) { Archify.focus.clearReach(); Archify.focus.clear(); } } catch (_) {}
        try { if (Archify.semanticLens) Archify.semanticLens.clear(); } catch (_) {}
        try { if (Archify.routeProbe) Archify.routeProbe.clear(); } catch (_) {}
        try { if (Archify.finder) Archify.finder.close(); } catch (_) {}
        try { if (Archify.radar) Archify.radar.close(); } catch (_) {}
        try { if (Archify.guidedViews && Archify.guidedViews.isPlaying()) Archify.guidedViews.pause(); } catch (_) {}
        try { if (Archify.guidedViews) Archify.guidedViews.showAll(); } catch (_) {}
      }

      // Which node opens which level is a fixed property of the document, not
      // of what is on screen, so every level is marked once. Marking only the
      // active level would leave stale attributes behind on switch.
      function markDrillable() {
        manifest.levels.forEach(function (level) {
          var svg = svgFor(level.id);
          if (!svg) return;
          var targets = drillTargets[level.id] || Object.create(null);
          Array.prototype.forEach.call(svg.querySelectorAll('[data-node-id]'), function (node) {
            var child = targets[node.getAttribute('data-node-id')];
            // An attribute only: authored geometry is never rewritten.
            if (child) node.setAttribute('data-drill-to', child);
            else node.removeAttribute('data-drill-to');
          });
        });
      }

      function renderRail() {
        var chain = pathTo(activeId);
        crumbs.textContent = '';
        chain.forEach(function (id, index) {
          var item = document.createElement('li');
          var level = byId[id];
          var current = id === activeId;
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'level-crumb';
          button.textContent = level.label;
          button.setAttribute('data-level-target', id);
          if (current) {
            button.setAttribute('aria-current', 'true');
            button.disabled = true;
            if (level.note) button.title = level.note;
          } else {
            button.title = 'Back to ' + level.label;
          }
          if (index > 0) item.setAttribute('data-level-depth', String(index));
          item.appendChild(button);
          crumbs.appendChild(item);
        });

        children.textContent = '';
        var targets = drillTargets[activeId] || Object.create(null);
        Object.keys(targets).forEach(function (nodeId) {
          var childId = targets[nodeId];
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'level-child';
          button.setAttribute('data-level-target', childId);
          button.textContent = byId[childId].label;
          button.title = 'Open ' + byId[childId].label + ' from ' + nodeId;
          children.appendChild(button);
        });
        children.hidden = children.childNodes.length === 0;
        rail.hidden = false;
      }

      function show(id, options) {
        if (!byId[id] || id === activeId) return false;
        var nextSvg = svgFor(id);
        if (!nextSvg) return false;

        clearTransientState();

        manifest.levels.forEach(function (level) {
          setVisible(svgFor(level.id), level.id === id);
          setVisible(cardsFor(level.id), level.id === id);
        });
        activeId = id;
        renderRail();

        // Each level authors its own chapters, so install the ones belonging
        // to the level now on stage. A level without chapters hides the strip
        // rather than leaving the previous level's stops on screen.
        var skipViews = options && options.skipViews;
        if (!skipViews && Archify.guidedViews && typeof Archify.guidedViews.load === 'function') {
          Archify.guidedViews.load((byId[id].views || []).map(function (view) {
            // Hand over a copy: installing filters `focus` against the level
            // on stage, and the manifest entry must stay reusable on return.
            return { id: view.id, label: view.label, note: view.note, focus: (view.focus || []).slice() };
          }));
        } else if (!skipViews && guided) {
          guided.hidden = true;
        }

        document.documentElement.setAttribute('data-active-level', id);
        Archify.stage.notify({ level: id, previous: options && options.previous });

        if (!options || options.updateHash !== false) {
          var hash = id === root ? '' : '#level=' + id;
          if (window.location.hash !== hash) {
            try {
              window.history.replaceState(null, '', hash || window.location.pathname + window.location.search);
            } catch (_) { window.location.hash = hash; }
          }
        }
        return true;
      }

      function up() {
        var level = byId[activeId];
        return level && level.drillFrom ? show(level.drillFrom.level) : false;
      }

      rail.addEventListener('click', function (event) {
        var button = event.target.closest('[data-level-target]');
        if (!button) return;
        event.preventDefault();
        show(button.getAttribute('data-level-target'));
      });

      // Drilling is a deliberate second gesture: a single click already means
      // focus, so taking it would cost the reader an established interaction.
      container.addEventListener('dblclick', function (event) {
        var node = event.target.closest('[data-drill-to]');
        if (!node) return;
        event.preventDefault();
        show(node.getAttribute('data-drill-to'));
      });

      container.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
        var node = event.target.closest && event.target.closest('[data-drill-to]');
        if (!node) return;
        event.preventDefault();
        show(node.getAttribute('data-drill-to'));
      });

      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        if (activeId === root) return;
        // Yield to any owner that treats Escape as dismissal of its own layer.
        if (document.documentElement.hasAttribute('data-focus-active')) return;
        if (up()) event.preventDefault();
      });

      function fromHash() {
        var match = /(?:^|[#&])level=([A-Za-z][A-Za-z0-9_-]*)/.exec(window.location.hash || '');
        return match && byId[match[1]] ? match[1] : null;
      }

      window.addEventListener('hashchange', function () {
        var requested = fromHash() || root;
        if (requested !== activeId) show(requested, { updateHash: false });
      });

      markDrillable();

      // Establish the starting level without rewriting a deep link that
      // already names it.
      var initial = fromHash() || manifest.active || root;
      activeId = null;
      show(initial, { updateHash: initial !== root && !fromHash(), skipViews: initial === root });
      if (activeId !== initial) show(root, { updateHash: false, skipViews: true });

      return {
        count: manifest.levels.length,
        root: root,
        active: function () { return activeId; },
        path: function () { return pathTo(activeId); },
        labelOf: function (id) { return byId[id] ? byId[id].label : null; },
        drillTargets: function (id) {
          var targets = drillTargets[id || activeId] || {};
          return Object.keys(targets).map(function (nodeId) {
            return { node: nodeId, level: targets[nodeId] };
          });
        },
        show: show,
        up: up
      };
    })();
