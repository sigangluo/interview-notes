// 面试复习笔记站点。只读 site/data/notes.json（由 tools/scripts/build_site.py 生成），
// 不请求其他外部数据；Markdown 渲染用页面引入的 marked。
(function () {
  "use strict";

  var REPO = "https://github.com/sigangluo/interview-notes";
  var tree = [], byFile = {};

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---- 数据：把目录树摊平成「文件 → 笔记」和「文件 → 面包屑」两张表 ----

  function index(nodes, crumbs) {
    nodes.forEach(function (n) {
      var path = crumbs.concat(n.title);
      if (n.children) { index(n.children, path); return; }
      n.crumbs = path;
      byFile[n.file] = n;
    });
  }

  function count(nodes, pred) {
    var total = 0;
    nodes.forEach(function (n) { total += n.children ? count(n.children, pred) : (pred(n) ? 1 : 0); });
    return total;
  }

  // ---- 主题 ----

  function toggleTheme() {
    var next = document.documentElement.dataset.theme === "dark" ? "light"
      : document.documentElement.dataset.theme === "light" ? "dark"
      : (matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("notes-theme", next); } catch (e) {}
  }

  // ---- 目录 ----

  function tocHtml(nodes) {
    var query = document.getElementById("search").value.trim().toLowerCase();
    return nodes.map(function (n) {
      if (n.children) {
        var body = tocHtml(n.children);
        if (query && body.indexOf('class="item hit') < 0) return "";
        var collapsed = query ? "" : " collapsed";
        return '<div class="toc-sec' + collapsed + '"><button class="toc-h" type="button"><span class="caret">▼</span>'
          + esc(n.title) + '</button><div class="toc-body">' + body + '</div></div>';
      }
      var hit = !query || (n.title + n.scope + n.body).toLowerCase().indexOf(query) >= 0;
      if (!hit) return "";
      return '<a class="item' + (hit && query ? ' hit' : '') + '" href="#/' + encodeURI(n.file) + '">'
        + esc(n.title) + (n.done ? '<span class="done">●</span>' : '') + '</a>';
    }).join("");
  }

  function renderToc() {
    var toc = document.getElementById("toc");
    var done = count(tree, function (n) { return n.done; });
    var total = count(tree, function () { return true; });
    toc.innerHTML = '<div class="progress">' + done + ' / ' + total + ' 篇已写'
      + '<div class="bar"><span style="width:' + (total ? done / total * 100 : 0) + '%"></span></div></div>'
      + tocHtml(tree);
    markCurrent();
  }

  // 路由：#/笔记路径.md 或 #/笔记路径.md#标题锚点
  function route() {
    var h = location.hash.indexOf("#/") === 0 ? decodeURI(location.hash.slice(2)) : "";
    var i = h.indexOf("#");
    return i < 0 ? { file: h, anchor: "" } : { file: h.slice(0, i), anchor: h.slice(i + 1) };
  }

  function markCurrent() {
    var file = route().file;
    Array.prototype.forEach.call(document.querySelectorAll(".toc a.item"), function (a) {
      var on = decodeURI(a.getAttribute("href").slice(2)) === file;
      a.classList.toggle("current", on);
      if (on) a.closest(".toc-sec") && a.closestAll && null;
      if (on) {
        var sec = a.parentElement;
        while (sec && sec.classList && sec.id !== "toc") {
          if (sec.classList.contains("toc-sec")) sec.classList.remove("collapsed");
          sec = sec.parentElement;
        }
      }
    });
  }

  function closeNav() {
    document.body.classList.remove("nav-open");
    document.getElementById("backdrop").hidden = true;
    document.getElementById("navBtn").setAttribute("aria-expanded", "false");
  }

  // ---- Markdown 渲染：链接改写成站内路由，图片和相对路径按源文件位置解析 ----

  // 标题锚点和 GitHub 的规则一致（build_site.py 里的 slugify 同步维护），同一个链接在站点和 GitHub 上都能跳
  function slugify(text, used) {
    var base = text.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    var slug = base, n = 1;
    while (used[slug]) slug = base + "-" + n++;
    used[slug] = true;
    return slug;
  }

  function rewrite(href, fromFile) {
    if (/^[a-z]+:/i.test(href)) return href;
    if (href.charAt(0) === "#") return href.charAt(1) === "/" ? href : "#/" + encodeURI(fromFile) + encodeURI(href);
    var hash = href.indexOf("#") >= 0 ? href.slice(href.indexOf("#")) : "";
    var rel = href.slice(0, href.length - hash.length);
    var parts = fromFile.split("/").slice(0, -1);
    rel.split("/").forEach(function (p) {
      if (p === "..") parts.pop();
      else if (p && p !== ".") parts.push(p);
    });
    var target = parts.join("/");
    if (/\.md$/.test(target) && byFile[target]) return "#/" + encodeURI(target) + hash;
    return REPO + "/blob/main/" + encodeURI(target) + hash;
  }

  function renderMarkdown(note) {
    var html = marked.parse(note.body, { gfm: true });
    var wrap = document.createElement("div");
    wrap.innerHTML = html;
    var used = {};
    Array.prototype.forEach.call(wrap.querySelectorAll("h1, h2, h3, h4, h5, h6"), function (h) {
      h.id = slugify(h.textContent, used);
    });
    Array.prototype.forEach.call(wrap.querySelectorAll("a[href]"), function (a) {
      var href = rewrite(decodeURI(a.getAttribute("href")), note.file);
      a.setAttribute("href", href);
      if (href.charAt(0) !== "#") { a.target = "_blank"; a.rel = "noopener"; }
    });
    Array.prototype.forEach.call(wrap.querySelectorAll("img[src]"), function (img) {
      var src = img.getAttribute("src");
      if (!/^[a-z]+:/i.test(src)) img.setAttribute("src", rewrite(src, note.file));
    });
    return wrap.innerHTML;
  }

  // ---- 页面 ----

  function firstFile(node) {
    return node.file || firstFile(node.children[0]);
  }

  function homeHtml() {
    var done = count(tree, function (n) { return n.done; });
    var total = count(tree, function () { return true; });
    var sections = tree.map(function (sec) {
      var items = (sec.children || []).map(function (c) {
        var n = c.children ? count([c], function () { return true; }) : 0;
        return '<li><a href="#/' + encodeURI(firstFile(c)) + '">' + esc(c.title) + '</a>'
          + (n ? "（" + n + " 篇）" : "") + '</li>';
      }).join("");
      return "<h2>" + esc(sec.title) + "</h2><ul class=\"sec-list\">" + items + "</ul>";
    }).join("");
    return '<article class="home"><h1>面试复习笔记</h1>'
      + '<p class="lead">面向 AI 产品、全栈开发、AI 应用开发三类岗位。<span class="done">●</span> 表示已经写了内容。</p>'
      + '<div class="stats"><div class="stat"><b>' + total + '</b><span>篇笔记</span></div>'
      + '<div class="stat"><b>' + done + '</b><span>篇已写内容</span></div></div>'
      + sections + '<p class="src">目录设计的依据见 <a href="' + REPO + '#readme">README</a>。</p></article>';
  }

  // ---- 参考文献式引用：这篇引用了谁、谁引用了这篇 ----

  function refList(files) {
    return "<ol>" + files.map(function (f) {
      var n = byFile[f];
      return n ? '<li><a href="#/' + encodeURI(f) + '">' + esc(n.title) + '</a></li>' : "";
    }).join("") + "</ol>";
  }

  function refsHtml(note) {
    var html = "";
    if (note.links.length) html += "<h2>引用</h2>" + refList(note.links);
    if (note.backlinks.length) html += "<h2>被引用</h2>" + refList(note.backlinks);
    return html ? '<div class="refs">' + html + '</div>' : "";
  }

  // ---- 关联总览：canvas 力导向图，做法参考 Harness-RSI 的论文关系图 ----

  function graphHtml() {
    return '<article class="graph"><h1>关联</h1>'
      + '<p class="lead">笔记之间的引用关系，箭头从一篇指向它引用的笔记。拖动空白处平移，滚轮或双指缩放，拖节点调整位置；点击节点查看笔记（电脑上悬停也行）。</p>'
      + '<div class="graph-wrap"><canvas id="graphCanvas"></canvas>'
      + '<aside class="graph-side" id="graphSide"><p class="muted">悬停或点击一个节点</p></aside></div></article>';
  }

  function setupGraph() {
    var canvas = document.getElementById("graphCanvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    var W = 0, H = 0;

    var degree = {};
    Object.keys(byFile).forEach(function (f) {
      degree[f] = byFile[f].links.length + byFile[f].backlinks.length;
    });
    var files = Object.keys(byFile).filter(function (f) { return degree[f] > 0; });
    var maxDeg = files.reduce(function (m, f) { return Math.max(m, degree[f]); }, 1);

    var groups = [], groupOf = {};
    files.forEach(function (f) {
      var g = f.split("/").slice(0, 2).join("/");
      if (groups.indexOf(g) < 0) groups.push(g);
      groupOf[f] = groups.indexOf(g);
    });

    function radius(f) { return 5 + Math.sqrt(degree[f] / maxDeg) * 7; }

    var nodes = files.map(function (f) {
      return { f: f, title: byFile[f].title, g: groupOf[f], x: 0, y: 0, vx: 0, vy: 0, r: radius(f) };
    });
    var nodeByFile = {};
    nodes.forEach(function (n) { nodeByFile[n.f] = n; });
    var links = [];
    files.forEach(function (f) {
      byFile[f].links.forEach(function (t) { if (nodeByFile[t]) links.push({ s: nodeByFile[f], t: nodeByFile[t] }); });
    });

    function rand(seed) { var x = Math.sin(seed) * 10000; return x - Math.floor(x); }

    // 窄屏上画布放不下整张图：在不小于 WW x WH 的虚拟画布里布局，再缩放到刚好装进屏幕
    var WW = 0, WH = 0;

    function layout() {
      WW = Math.max(W, 640); WH = Math.max(H, 520);
      var cols = Math.ceil(Math.sqrt(groups.length));
      var rows = Math.ceil(groups.length / cols);
      var cw = WW / cols, rh = WH / rows;
      nodes.forEach(function (n, i) {
        var col = n.g % cols, row = Math.floor(n.g / cols);
        n.x = cw * (col + 0.5) + (rand(i * 13.37) - 0.5) * cw * 0.6;
        n.y = rh * (row + 0.5) + (rand(i * 7.77) - 0.5) * rh * 0.6;
        n.vx = 0; n.vy = 0;
        n.home = { x: cw * (col + 0.5), y: rh * (row + 0.5) };
      });
      for (var it = 0; it < 300; it++) {
        for (var a = 0; a < nodes.length; a++) {
          var na = nodes[a], fx = 0, fy = 0;
          for (var b = 0; b < nodes.length; b++) {
            if (a === b) continue;
            var nb = nodes[b];
            var dx = na.x - nb.x, dy = na.y - nb.y;
            var d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2);
            var rep = (na.g === nb.g ? 900 : 140) / d2;
            fx += dx / d * rep; fy += dy / d * rep;
          }
          fx += (na.home.x - na.x) * 0.02;
          fy += (na.home.y - na.y) * 0.02;
          na.vx = (na.vx + fx) * 0.7; na.vy = (na.vy + fy) * 0.7;
        }
        links.forEach(function (l) {
          var dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          var f = (dist - 110) * 0.004;
          l.s.vx += dx / dist * f; l.s.vy += dy / dist * f;
          l.t.vx -= dx / dist * f; l.t.vy -= dy / dist * f;
        });
        nodes.forEach(function (n) {
          n.x = Math.max(n.r + 8, Math.min(WW - n.r - 8, n.x + n.vx));
          n.y = Math.max(n.r + 8, Math.min(WH - n.r - 8, n.y + n.vy));
        });
      }
    }

    function color() {
      var s = getComputedStyle(document.documentElement);
      return { ink: s.getPropertyValue("--ink").trim(), ink2: s.getPropertyValue("--ink-2").trim(),
        accent: s.getPropertyValue("--accent").trim(), edge: s.getPropertyValue("--border").trim(),
        surface: s.getPropertyValue("--surface").trim() };
    }

    var view = { x: 0, y: 0, scale: 1 };
    var hovered = null, pinned = null, dragging = null, panning = null;

    function screen(n) { return { x: n.x * view.scale + view.x, y: n.y * view.scale + view.y }; }
    function world(px, py) { return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale }; }
    function hit(px, py, slop) {
      for (var i = nodes.length - 1; i >= 0; i--) {
        var pt = screen(nodes[i]);
        var dx = px - pt.x, dy = py - pt.y;
        if (dx * dx + dy * dy <= Math.pow(nodes[i].r * view.scale + (slop || 4), 2)) return nodes[i];
      }
      return null;
    }
    function neighbors(n) {
      var set = {};
      links.forEach(function (l) {
        if (l.s === n) set[l.t.f] = l.t;
        if (l.t === n) set[l.s.f] = l.s;
      });
      return set;
    }

    function arrow(x, y, ux, uy, size, c) {
      var wing = size * 0.62;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - ux * size - uy * wing, y - uy * size + ux * wing);
      ctx.lineTo(x - ux * size + uy * wing, y - uy * size - ux * wing);
      ctx.closePath();
      ctx.fillStyle = c; ctx.fill();
    }

    function draw() {
      var c = color();
      ctx.clearRect(0, 0, W, H);
      var active = pinned || hovered;
      var near = active ? neighbors(active) : null;
      links.forEach(function (l) {
        var s = screen(l.s), e = screen(l.t);
        var on = active && (l.s === active || l.t === active);
        var dx = e.x - s.x, dy = e.y - s.y, dist = Math.hypot(dx, dy) || 1;
        var ux = dx / dist, uy = dy / dist;
        ctx.beginPath();
        ctx.moveTo(s.x + ux * (l.s.r * view.scale + 2), s.y + uy * (l.s.r * view.scale + 2));
        ctx.lineTo(e.x - ux * (l.t.r * view.scale + 5), e.y - uy * (l.t.r * view.scale + 5));
        ctx.lineWidth = on ? 1.6 : 1;
        ctx.strokeStyle = on ? c.accent : c.edge;
        ctx.globalAlpha = active ? (on ? 0.95 : 0.08) : 0.9;
        ctx.stroke();
        arrow(e.x - ux * (l.t.r * view.scale + 5), e.y - uy * (l.t.r * view.scale + 5), ux, uy, on ? 7 : 5, on ? c.accent : c.edge);
      });
      ctx.globalAlpha = 1;
      nodes.forEach(function (n) {
        var pt = screen(n);
        var dim = active && n !== active && !near[n.f];
        ctx.globalAlpha = dim ? 0.25 : 1;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, n.r * view.scale, 0, Math.PI * 2);
        ctx.fillStyle = c.accent; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = c.surface; ctx.stroke();
        if (n === active) {
          ctx.beginPath(); ctx.arc(pt.x, pt.y, n.r * view.scale + 3.5, 0, Math.PI * 2);
          ctx.lineWidth = 1.5; ctx.strokeStyle = c.ink; ctx.stroke();
        }
      });
      ctx.globalAlpha = 1;
      ctx.font = "12px -apple-system, 'PingFang SC', sans-serif";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round"; ctx.lineWidth = 3; ctx.strokeStyle = c.surface;
      nodes.forEach(function (n) {
        var dim = active && n !== active && !near[n.f];
        var focus = active && (n === active || near[n.f]);
        // 缩小后标签会挤在一起，只留和当前节点相关的、以及连接多的
        if (!focus && view.scale < 0.7 && degree[n.f] < maxDeg * 0.5) return;
        var pt = screen(n);
        ctx.globalAlpha = dim ? 0.3 : 1;
        ctx.fillStyle = c.ink;
        ctx.textAlign = "left";
        ctx.strokeText(n.title, pt.x + n.r * view.scale + 6, pt.y);
        ctx.fillText(n.title, pt.x + n.r * view.scale + 6, pt.y);
      });
      ctx.globalAlpha = 1;
    }

    function narrow() { return window.matchMedia("(max-width: 760px)").matches; }

    function showSide(n) {
      var side = document.getElementById("graphSide");
      if (!side) return;
      if (!n) { side.innerHTML = '<p class="muted">' + (narrow() ? "点击一个节点" : "悬停或点击一个节点") + '</p>'; return; }
      var note = byFile[n.f];
      if (narrow()) {
        // 手机上整篇笔记放在画布下面要滚很远才看得到，只给标题、引用关系和入口
        side.innerHTML = '<div class="graph-card"><h2>' + esc(note.title) + '</h2>'
          + (note.scope ? '<p class="scope">' + esc(note.scope.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')) + '</p>' : '')
          + refsHtml(note)
          + '<a class="btn open" href="#/' + encodeURI(n.f) + '">打开笔记</a></div>';
        return;
      }
      side.innerHTML = '<article class="article">' + renderMarkdown(note) + '</article>'
        + '<p class="src"><a href="#/' + encodeURI(n.f) + '">打开完整页面</a></p>';
      window.NoteFigures.init(side);
    }

    // 缩放并居中到刚好装下所有节点和它们右侧的标签
    function fit() {
      var PAD = 20, LABEL = 90;
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      nodes.forEach(function (n) {
        x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r);
        x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r);
      });
      var bw = Math.max(x1 - x0, 1), bh = Math.max(y1 - y0, 1);
      var k = Math.min(1.5, (W - 2 * PAD - LABEL) / bw, (H - 2 * PAD) / bh);
      k = Math.max(0.3, k);
      view.scale = k;
      view.x = PAD + (W - 2 * PAD - LABEL - bw * k) / 2 - x0 * k;
      view.y = (H - bh * k) / 2 - y0 * k;
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      var widthChanged = Math.round(rect.width) !== Math.round(W);
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 手机滚动时地址栏收放会触发 resize（只有高度变），这时不能重排，否则位置和缩放被重置
      if (widthChanged) { layout(); fit(); }
      draw();
    }

    // 鼠标、触摸、笔统一用 Pointer Events；一根手指拖动，两根手指缩放
    var pts = {}, gesture = null, TAP = 6;

    function localPoint(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function pinchState() {
      var ids = Object.keys(pts), a = pts[ids[0]], b = pts[ids[1]];
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    canvas.addEventListener("pointerdown", function (e) {
      canvas.setPointerCapture(e.pointerId);
      pts[e.pointerId] = localPoint(e);
      if (Object.keys(pts).length === 2) {
        var p = pinchState();
        gesture = { kind: "pinch", d: p.d, scale: view.scale, anchor: world(p.x, p.y) };
        return;
      }
      if (Object.keys(pts).length > 2) return;
      var pt = pts[e.pointerId];
      var n = hit(pt.x, pt.y, e.pointerType === "mouse" ? 4 : 12);
      gesture = { kind: n ? "node" : "pan", n: n, sx: pt.x, sy: pt.y, moved: false };
      if (n) { var w = world(pt.x, pt.y); n.offX = w.x - n.x; n.offY = w.y - n.y; }
      else { gesture.ox = pt.x - view.x; gesture.oy = pt.y - view.y; }
    });

    canvas.addEventListener("pointermove", function (e) {
      var pt = localPoint(e);
      if (!pts[e.pointerId]) {
        // 没按下：只有鼠标有悬停
        if (e.pointerType !== "mouse") return;
        var h = hit(pt.x, pt.y);
        if (h !== hovered) { hovered = h; canvas.style.cursor = h ? "pointer" : "grab"; showSide(pinned || hovered); draw(); }
        return;
      }
      pts[e.pointerId] = pt;
      if (!gesture) return;
      if (gesture.kind === "pinch") {
        if (Object.keys(pts).length < 2) return;
        var p = pinchState();
        var next = Math.min(3, Math.max(0.3, gesture.scale * p.d / gesture.d));
        view.scale = next;
        view.x = p.x - gesture.anchor.x * next;
        view.y = p.y - gesture.anchor.y * next;
        draw(); return;
      }
      if (!gesture.moved && Math.hypot(pt.x - gesture.sx, pt.y - gesture.sy) < TAP) return;
      gesture.moved = true;
      if (gesture.kind === "node") {
        var w = world(pt.x, pt.y);
        gesture.n.x = w.x - gesture.n.offX; gesture.n.y = w.y - gesture.n.offY;
      } else {
        view.x = pt.x - gesture.ox; view.y = pt.y - gesture.oy;
      }
      draw();
    });

    function release(e) {
      if (!pts[e.pointerId]) return;
      delete pts[e.pointerId];
      var g = gesture;
      if (Object.keys(pts).length > 0) {
        // 缩放抬起一根手指后不要接着当作平移，等全部抬起
        gesture = { kind: "none" };
        return;
      }
      gesture = null;
      if (!g || g.kind === "pinch" || g.kind === "none") { draw(); return; }
      if (g.kind === "node") { pinned = g.n; showSide(pinned); }
      else if (!g.moved && e.type === "pointerup") { pinned = null; showSide(hovered); }
      draw();
    }
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);

    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var pt = localPoint(e);
      var next = Math.min(3, Math.max(0.3, view.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
      view.x = pt.x - (pt.x - view.x) * (next / view.scale);
      view.y = pt.y - (pt.y - view.y) * (next / view.scale);
      view.scale = next;
      draw();
    }, { passive: false });

    resize();
    window.addEventListener("resize", resize);
  }

  function noteHtml(note) {
    var crumbs = note.crumbs.map(function (c, i) {
      return i === note.crumbs.length - 1 ? esc(c) : esc(c);
    });
    crumbs.unshift('<a href="#/">全部</a>');
    return '<nav class="crumbs">' + crumbs.join(" / ") + '</nav>'
      + '<article class="article">' + renderMarkdown(note) + refsHtml(note) + '</article>'
      + '<p class="src">源文件：<a href="' + REPO + '/blob/main/' + encodeURI(note.file) + '">' + esc(note.file) + '</a></p>';
  }

  function searchHtml(query) {
    var q = query.toLowerCase();
    var hits = [];
    Object.keys(byFile).forEach(function (f) {
      var n = byFile[f];
      var text = (n.title + "\n" + n.body).toLowerCase();
      var at = text.indexOf(q);
      if (at < 0) return;
      var body = n.body.replace(/^# .+\n+/, "");
      var pos = body.toLowerCase().indexOf(q);
      var snippet = "";
      if (pos >= 0) {
        var start = Math.max(0, pos - 40);
        snippet = (start ? "…" : "") + body.slice(start, pos + q.length + 60).replace(/\s+/g, " ") + "…";
        snippet = esc(snippet).replace(esc(body.substr(pos, q.length)), "<mark>" + esc(body.substr(pos, q.length)) + "</mark>");
      }
      hits.push({ n: n, snippet: snippet });
    });
    var list = hits.map(function (h) {
      return '<div class="search-result"><h2><a href="#/' + encodeURI(h.n.file) + '">' + esc(h.n.title) + '</a></h2>'
        + '<p>' + h.snippet + '</p></div>';
    }).join("");
    return '<p class="search-head">“' + esc(query) + '” 的 ' + hits.length + ' 条结果</p>' + list;
  }

  // 只有锚点变了（同一篇里跳转）时不重新渲染，只滚动，交互图的状态得以保留
  var shown = null;

  function render() {
    var main = document.getElementById("main");
    var query = document.getElementById("search").value.trim();
    var r = route(), file = r.file;
    var key = query && !file ? "?" + query : file;
    if (key !== shown) {
      if (file === "graph") { main.innerHTML = graphHtml(); setupGraph(); }
      else if (query && !file) main.innerHTML = searchHtml(query);
      else if (byFile[file]) main.innerHTML = noteHtml(byFile[file]);
      else main.innerHTML = homeHtml();
      window.NoteFigures.init(main);
      shown = key;
      markCurrent();
      if (file && !r.anchor) window.scrollTo(0, 0);
    }
    var target = r.anchor && document.getElementById(r.anchor);
    if (target) target.scrollIntoView();
  }

  // ---- 启动 ----

  function start(data) {
    tree = data.tree;
    index(tree, []);
    renderToc();
    render();
  }

  document.getElementById("themeBtn").addEventListener("click", toggleTheme);
  document.getElementById("search").addEventListener("input", function () {
    if (location.hash) history.pushState(null, "", location.pathname);
    renderToc();
    render();
  });
  document.getElementById("toc").addEventListener("click", function (e) {
    var head = e.target.closest(".toc-h");
    if (head) { head.parentElement.classList.toggle("collapsed"); return; }
    if (e.target.closest("a.item")) closeNav();
  });
  document.getElementById("navBtn").addEventListener("click", function () {
    var open = document.body.classList.toggle("nav-open");
    document.getElementById("backdrop").hidden = !open;
    this.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.getElementById("backdrop").addEventListener("click", closeNav);
  // 交互图脚本生成的 #锚点 链接没经过 rewrite，在这里补成站内路由
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute("href").charAt(1) === "/") return;
    e.preventDefault();
    location.hash = "#/" + encodeURI(route().file) + encodeURI(a.getAttribute("href"));
  });
  window.addEventListener("hashchange", function () {
    document.getElementById("search").value = "";
    renderToc();
    render();
  });

  fetch("data/notes.json?v=" + Date.now()).then(function (r) { return r.json(); }).then(start).catch(function () {
    document.getElementById("main").innerHTML = '<p class="loading">数据加载失败。请先运行 <code>python3 tools/scripts/build_site.py</code> 生成 site/data/notes.json，再用本地服务器打开（不能直接双击 html）。</p>';
  });
})();
