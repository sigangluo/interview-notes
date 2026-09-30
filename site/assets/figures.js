// 笔记里的交互图。笔记 Markdown 中直接写带 class 和 data-* 的 HTML，渲染后由这里挂上交互；
// 没有这个脚本时（比如在 GitHub 上看源文件），同样的内容按普通列表和表格显示。
(function () {
  function each(root, sel, fn) { Array.prototype.forEach.call(root.querySelectorAll(sel), fn); }

  function button(text, cls) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = cls || "fig-btn";
    b.textContent = text;
    return b;
  }

  // 分步演示：.fig-steps 下 .fig-list > li 是各个步骤，li 的 data-on 列出这一步要高亮的 [data-node]，
  // data-label 是步骤按钮上的短名
  function steps(fig) {
    var list = fig.querySelector(".fig-list");
    var items = list ? list.children : [];
    if (!items.length) return;
    var nodes = fig.querySelectorAll("[data-node]");
    var prev = button("‹ 上一步"), next = button("下一步 ›");
    var dots = document.createElement("div");
    dots.className = "fig-dots";
    Array.prototype.forEach.call(items, function (li, i) {
      var d = button((i + 1) + " " + (li.getAttribute("data-label") || ""), "fig-dot");
      d.addEventListener("click", function () { go(i); });
      dots.appendChild(d);
    });
    var bar = document.createElement("div");
    bar.className = "fig-bar";
    bar.appendChild(prev); bar.appendChild(dots); bar.appendChild(next);
    list.parentNode.insertBefore(bar, list);

    var cur = 0;
    function go(i) {
      cur = Math.max(0, Math.min(items.length - 1, i));
      var on = (items[cur].getAttribute("data-on") || "").split(/\s+/);
      Array.prototype.forEach.call(nodes, function (n) {
        n.classList.toggle("on", on.indexOf(n.getAttribute("data-node")) >= 0);
      });
      Array.prototype.forEach.call(items, function (li, j) { li.classList.toggle("cur", j === cur); });
      Array.prototype.forEach.call(dots.children, function (d, j) { d.classList.toggle("cur", j === cur); });
      prev.disabled = cur === 0;
      next.disabled = cur === items.length - 1;
    }
    prev.addEventListener("click", function () { go(cur - 1); });
    next.addEventListener("click", function () { go(cur + 1); });
    fig.classList.add("js");
    go(0);
  }

  // 联动高亮：点击一个带 data-key 的元素，所有 data-key 相同的元素一起高亮，再点一次取消。
  // 只响应点击，不用悬停。.fig-note[data-key] 只在对应的 key 被选中时显示，.fig-hint 在没有选中时显示
  function highlight(fig) {
    var keyed = fig.querySelectorAll("[data-key]");
    var selected = fig.getAttribute("data-default") || null;
    function show(k) {
      Array.prototype.forEach.call(keyed, function (el) {
        el.classList.toggle("on", !!k && el.getAttribute("data-key") === k);
      });
      fig.classList.toggle("has-on", !!k);
    }
    Array.prototype.forEach.call(keyed, function (el) {
      if (el.classList.contains("fig-note")) return;
      var k = el.getAttribute("data-key");
      el.addEventListener("click", function () { selected = selected === k ? null : k; show(selected); });
    });
    fig.classList.add("js");
    show(selected);
  }

  // RTT 耗时计算器：比较不同协议从发起连接到收完响应要多久。
  // 简化模型：往返次数 × RTT + 响应大小 ÷ 带宽，不含 DNS、服务器处理时间和 TCP 慢启动
  var PROTOCOLS = [
    { name: "HTTP（明文）", hs: [["TCP 握手", 1, "tcp"]] },
    { name: "HTTPS + TLS 1.2", hs: [["TCP 握手", 1, "tcp"], ["TLS 1.2 握手", 2, "tls"]] },
    { name: "HTTPS + TLS 1.3", hs: [["TCP 握手", 1, "tcp"], ["TLS 1.3 握手", 1, "tls"]] },
    { name: "HTTP/3 首次连接", hs: [["QUIC 握手（含 TLS 1.3）", 1, "quic"]] },
    { name: "HTTP/3 0-RTT 恢复", hs: [] },
    { name: "复用已有连接", hs: [] }
  ];

  function rtt(fig) {
    fig.innerHTML =
      '<div class="rtt-ctl">'
      + '<label>RTT <input type="range" min="5" max="300" step="5" value="50" data-in="rtt"> <b data-out="rtt"></b></label>'
      + '<label>响应大小 <select data-in="size"><option value="10">10 KB（接口响应）</option>'
      + '<option value="100" selected>100 KB（网页 HTML）</option><option value="1000">1 MB（大图）</option>'
      + '<option value="10000">10 MB（大文件）</option></select></label>'
      + '<label>带宽 <select data-in="bw"><option value="10">10 Mbps</option>'
      + '<option value="100" selected>100 Mbps</option><option value="1000">1000 Mbps</option></select></label>'
      + '</div>'
      + '<p class="rtt-hint">RTT 参考：同城机房 1～5 ms，国内跨省 20～50 ms，中国到美国西海岸 150 ms 以上</p>'
      + '<div class="rtt-rows"></div>'
      + '<div class="rtt-legend"><span class="k-tcp">TCP 握手</span><span class="k-tls">TLS 握手</span>'
      + '<span class="k-quic">QUIC 握手</span><span class="k-req">请求到首字节（1 RTT）</span><span class="k-xfer">传输剩余数据</span></div>'
      + '<p class="rtt-note">简化模型：不含 DNS 查询、服务器处理时间和 TCP 慢启动（见 <a href="#37-拥塞控制">3.7</a>），真实情况下往返次数的影响更大。</p>';
    var input = function (k) { return fig.querySelector('[data-in="' + k + '"]'); };
    var rows = fig.querySelector(".rtt-rows");

    function update() {
      var r = +input("rtt").value, size = +input("size").value, bw = +input("bw").value;
      fig.querySelector('[data-out="rtt"]').textContent = r + " ms";
      var xfer = size * 8 / bw;
      var data = PROTOCOLS.map(function (p) {
        var segs = p.hs.map(function (h) { return { label: h[0], ms: h[1] * r, cls: h[2], n: h[1] }; });
        segs.push({ label: "请求到首字节", ms: r, cls: "req", n: 1 });
        segs.push({ label: "传输", ms: xfer, cls: "xfer" });
        var total = segs.reduce(function (s, x) { return s + x.ms; }, 0);
        var trips = segs.reduce(function (s, x) { return s + (x.n || 0); }, 0);
        return { p: p, segs: segs, total: total, trips: trips };
      });
      var max = Math.max.apply(null, data.map(function (d) { return d.total; }));
      rows.innerHTML = data.map(function (d) {
        var bar = d.segs.map(function (s) {
          return '<span class="s-' + s.cls + '" style="width:' + (s.ms / max * 100) + '%"></span>';
        }).join("");
        return '<div class="rtt-row"><span class="rtt-name">' + d.p.name + '</span>'
          + '<span class="rtt-bar">' + bar + '</span>'
          + '<span class="rtt-total">' + Math.round(d.total) + ' ms<small>' + d.trips + ' 个 RTT</small></span></div>';
      }).join("");
    }
    ["rtt", "size", "bw"].forEach(function (k) { input(k).addEventListener("input", update); });
    fig.classList.add("js");
    update();
  }

  window.NoteFigures = {
    init: function (root) {
      each(root, ".fig-steps:not(.js)", steps);
      each(root, ".fig-hl:not(.js)", highlight);
      each(root, ".fig-rtt:not(.js)", rtt);
    }
  };
})();
