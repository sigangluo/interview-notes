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

  function markCurrent() {
    var file = location.hash.indexOf("#/") === 0 ? decodeURI(location.hash.slice(2)) : "";
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

  function rewrite(href, fromFile) {
    if (/^[a-z]+:/i.test(href) || href.charAt(0) === "#") return href;
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

  // ---- 关联图：当前笔记在中心，连到它提及的和提及它的笔记 ----

  function related(note) {
    var out = note.links.filter(function (f) { return byFile[f]; });
    var back = Object.keys(byFile).filter(function (f) { return byFile[f].links.indexOf(note.file) >= 0 && out.indexOf(f) < 0; });
    return out.concat(back);
  }

  function graphHtml(note) {
    var rel = related(note);
    if (!rel.length) return "";
    var w = 640, h = 150 + Math.max(0, rel.length - 2) * 36, cx = w / 2, cy = h / 2;
    var nodes = rel.map(function (f, i) {
      var angle = -Math.PI / 2 + (2 * Math.PI * i) / rel.length;
      var rx = Math.min(250, w / 2 - 70), ry = h / 2 - 30;
      return { f: f, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle), back: note.links.indexOf(f) < 0 };
    });
    var lines = nodes.map(function (nd) {
      return '<line x1="' + cx + '" y1="' + cy + '" x2="' + nd.x + '" y2="' + nd.y + '"/>';
    }).join("");
    var circles = nodes.map(function (nd) {
      var title = byFile[nd.f].title;
      var labelW = Math.max(44, title.length * 13);
      return '<a href="#/' + encodeURI(nd.f) + '">'
        + '<rect x="' + (nd.x - labelW / 2) + '" y="' + (nd.y - 14) + '" width="' + labelW + '" height="40" fill="transparent"/>'
        + '<circle cx="' + nd.x + '" cy="' + nd.y + '" r="6"/>'
        + '<text x="' + nd.x + '" y="' + (nd.y + 20) + '" text-anchor="middle">' + esc(title) + '</text></a>';
    }).join("");
    return '<div class="graph"><h2>关联</h2><svg viewBox="0 0 ' + w + ' ' + h + '">'
      + lines + circles
      + '<circle class="self" cx="' + cx + '" cy="' + cy + '" r="7"/>'
      + '<text class="self" x="' + cx + '" y="' + (cy - 16) + '" text-anchor="middle">' + esc(note.title) + '</text>'
      + '</svg></div>';
  }

  function noteHtml(note) {
    var crumbs = note.crumbs.map(function (c, i) {
      return i === note.crumbs.length - 1 ? esc(c) : esc(c);
    });
    crumbs.unshift('<a href="#/">全部</a>');
    return '<nav class="crumbs">' + crumbs.join(" / ") + '</nav>'
      + '<article class="article">' + renderMarkdown(note) + '</article>'
      + graphHtml(note)
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

  function render() {
    var main = document.getElementById("main");
    var query = document.getElementById("search").value.trim();
    var file = location.hash.indexOf("#/") === 0 ? decodeURI(location.hash.slice(2)) : "";
    if (query && !file) main.innerHTML = searchHtml(query);
    else if (byFile[file]) main.innerHTML = noteHtml(byFile[file]);
    else main.innerHTML = homeHtml();
    markCurrent();
    if (file) window.scrollTo(0, 0);
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
  window.addEventListener("hashchange", function () {
    document.getElementById("search").value = "";
    renderToc();
    render();
  });

  fetch("data/notes.json").then(function (r) { return r.json(); }).then(start).catch(function () {
    document.getElementById("main").innerHTML = '<p class="loading">数据加载失败。请先运行 <code>python3 tools/scripts/build_site.py</code> 生成 site/data/notes.json，再用本地服务器打开（不能直接双击 html）。</p>';
  });
})();
