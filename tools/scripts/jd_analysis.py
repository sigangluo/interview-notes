#!/usr/bin/env python3
"""用社招 JD 统计每个目录项被提到的比例，生成 README 里的图。

    python3 tools/scripts/jd_analysis.py [数据目录]      # 默认 ../求职/data

数据目录的格式是 <公司>/技术.csv、<公司>/产品.csv，来自 cn-tech-jobs 看板
（https://sigangluo.github.io/cn-tech-jobs/ 页面底部可下载各公司 CSV）。
输出 tools/docs/images/*.png，并在终端打印每个目录项的比例（≥ 40% 的在 README 里标 ★）。

比例的算法：每家公司单独算「JD（职位描述 + 任职要求）命中关键词的职位占比」，再对公司取平均，
只统计该岗位样本数 ≥ MIN_JOBS 的公司，避免职位最多的公司主导结果。
关键词命中只说明 JD 写了，不说明面试考不考：计算机基础这类默认要会的内容往往不写进 JD。
依赖：matplotlib。
"""
import collections
import csv
import glob
import os
import re
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

TOOLS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(TOOLS)
OUT = os.path.join(TOOLS, "docs", "images")
MIN_JOBS = 8
STAR = 40

AI = r"AI|大模型|LLM|Agent|智能体|AIGC"
NOT_AI_DEV = r"算法|研究|推理|芯片|训练|Infra|数据|测试|硬件|安全|架构建模|优化|编译|GPU|存储"

# 岗位分组：按职位名称筛选
GROUPS = {
    "全栈": ("技术", lambda t, x: "全栈" in t),
    "前端": ("技术", lambda t, x: "前端" in t and "全栈" not in t),
    "Java 后端": ("技术", lambda t, x: re.search(r"后端|服务端|Java|server", t, re.I)
                 and re.search(r"Java(?!Script)", x) and not re.search(AI, t, re.I)),
    "AI 应用开发": ("技术", lambda t, x: re.search(AI, t, re.I) and not re.search(NOT_AI_DEV, t, re.I)),
    "产品（全部）": ("产品", lambda t, x: True),
    "AI 产品": ("产品", lambda t, x: re.search(AI, t, re.I)),
}
FULLSTACK = ("全栈", "前端", "Java 后端")

# (图, 子目录, 目录项, 统计用的岗位分组, 关键词)
ITEMS = [
    ("fullstack", "共通", "数据结构与算法", FULLSTACK, r"数据结构|算法基础|算法功底|扎实的算法|LeetCode"),
    ("fullstack", "共通", "计算机网络", FULLSTACK, r"网络协议|TCP|HTTP|计算机网络"),
    ("fullstack", "共通", "操作系统", FULLSTACK, r"操作系统"),
    ("fullstack", "共通", "数据库基础", FULLSTACK, r"数据库|SQL"),
    ("fullstack", "共通", "API设计与通信", FULLSTACK, r"API|RESTful|GraphQL|gRPC|WebSocket|接口设计"),
    ("fullstack", "共通", "认证与安全", FULLSTACK, r"安全|鉴权|认证|权限|OAuth|JWT"),
    ("fullstack", "共通", "工程实践", FULLSTACK, r"设计模式|单元测试|单测|代码规范|Code Review|代码质量|Git\b"),
    ("fullstack", "共通", "AI辅助开发", FULLSTACK, r"Cursor|Copilot|Claude Code|AI ?Coding|AI ?编程|AI ?辅助|Vibe Coding"),
    ("fullstack", "共通", "系统设计", FULLSTACK, r"系统设计|架构设计|系统架构|架构能力"),
    ("fullstack", "共通", "部署与运维", FULLSTACK, r"Docker|Kubernetes|K8s|容器|云原生|CI/CD|DevOps|Linux|Nginx|部署"),
    ("fullstack", "前端", "JavaScript与TypeScript", ("前端",), r"JavaScript|TypeScript|\bJS\b|\bTS\b|ES6"),
    ("fullstack", "前端", "HTML与CSS", ("前端",), r"HTML|CSS"),
    ("fullstack", "前端", "浏览器原理", ("前端",), r"浏览器"),
    ("fullstack", "前端", "框架原理", ("前端",), r"React|Vue|Angular"),
    ("fullstack", "前端", "状态、路由与数据请求", ("前端",), r"Redux|Zustand|MobX|状态管理|路由|React Query|TanStack"),
    ("fullstack", "前端", "Node.js与全栈框架", ("前端",), r"Node|SSR|Next\.?js|Nuxt|BFF|服务端渲染"),
    ("fullstack", "前端", "工程化", ("前端",), r"工程化|[Ww]ebpack|Vite|构建|打包|Monorepo"),
    ("fullstack", "前端", "性能优化", ("前端",), r"性能"),
    ("fullstack", "前端", "跨端", ("前端",), r"小程序|跨端|跨平台|Flutter|React Native|\bRN\b|uni-app|Taro|Electron|Hybrid"),
    ("fullstack", "后端", "Java基础与集合", ("Java 后端",), r"Java基础|集合|HashMap|面向对象|OOP"),
    ("fullstack", "后端", "Java并发", ("Java 后端",), r"多线程|并发|线程池|JUC"),
    ("fullstack", "后端", "JVM", ("Java 后端",), r"JVM|\bGC\b|垃圾回收"),
    ("fullstack", "后端", "Spring生态", ("Java 后端",), r"Spring|MyBatis|ORM"),
    ("fullstack", "后端", "数据库进阶", ("Java 后端",), r"MySQL|索引|分库分表|SQL ?优化"),
    ("fullstack", "后端", "缓存", ("Java 后端",), r"Redis|缓存|Memcache"),
    ("fullstack", "后端", "消息队列", ("Java 后端",), r"Kafka|RocketMQ|RabbitMQ|消息队列|\bMQ\b"),
    ("fullstack", "后端", "搜索", ("Java 后端",), r"Elasticsearch|\bES\b|搜索引擎|Solr"),
    ("fullstack", "后端", "分布式与微服务", ("Java 后端",), r"分布式|微服务|RPC|Dubbo|Spring ?Cloud|一致性|注册中心"),
    ("fullstack", "后端", "高并发与高可用", ("Java 后端",), r"高并发|高可用|高性能|限流|熔断|降级|容灾|稳定性"),
    ("fullstack", "后端", "性能调优与问题排查", ("Java 后端",), r"调优|性能优化|排查|定位问题|问题定位|线上问题"),

    ("ai-dev", "LLM原理", "Transformer与注意力", ("AI 应用开发",), r"Transformer|注意力|Attention"),
    ("ai-dev", "LLM原理", "训练与对齐", ("AI 应用开发",), r"微调|SFT|LoRA|Fine-?tun|RLHF|DPO|强化学习|后训练|对齐"),
    ("ai-dev", "LLM原理", "推理原理", ("AI 应用开发",), r"KV ?Cache|量化|推理加速|推理优化"),
    ("ai-dev", "LLM原理", "多模态", ("AI 应用开发",), r"多模态|图像|视频|语音|视觉"),
    ("ai-dev", "模型接入与部署", "API调用", ("AI 应用开发",), r"模型 ?API|LLM ?API|模型接口|OpenAI|流式|结构化输出|Function ?Call"),
    ("ai-dev", "模型接入与部署", "模型网关与路由", ("AI 应用开发",), r"网关|模型路由|模型选型|多模型"),
    ("ai-dev", "模型接入与部署", "私有化部署", ("AI 应用开发",), r"vLLM|SGLang|Ollama|私有化|本地部署|模型部署|推理部署|推理服务"),
    ("ai-dev", "Prompt与上下文工程", "Prompt设计", ("AI 应用开发",), r"Prompt|提示词|Few-?shot|思维链|CoT"),
    ("ai-dev", "Prompt与上下文工程", "上下文工程", ("AI 应用开发",), r"上下文工程|Context Engineering|上下文管理|上下文构建|上下文窗口|长上下文"),
    ("ai-dev", "Prompt与上下文工程", "上下文压缩与缓存", ("AI 应用开发",), r"上下文压缩|Token ?压缩|Prompt ?Cach|上下文缓存"),
    ("ai-dev", "Prompt与上下文工程", "Prompt迭代与管理", ("AI 应用开发",), r"(Prompt|提示词) ?(调优|优化|迭代|管理)|DSPy|自动优化"),
    ("ai-dev", "RAG", "数据接入与解析", ("AI 应用开发",), r"文档解析|数据解析|OCR|抓取|爬虫|ETL"),
    ("ai-dev", "RAG", "切分与向量化", ("AI 应用开发",), r"切分|分块|Chunk|[Ee]mbedding|向量化"),
    ("ai-dev", "RAG", "向量数据库", ("AI 应用开发",), r"向量数据库|向量库|向量检索|Milvus|pgvector|FAISS|Faiss"),
    ("ai-dev", "RAG", "检索与重排", ("AI 应用开发",), r"RAG|检索增强|召回|Rerank|重排|混合检索"),
    ("ai-dev", "RAG", "Text-to-SQL", ("AI 应用开发",), r"Text-?to-?SQL|Text2SQL|NL2SQL|ChatBI"),
    ("ai-dev", "Agent", "核心范式", ("AI 应用开发",), r"ReAct|规划|Planning|CoT|思维链|反思"),
    ("ai-dev", "Agent", "工作流编排", ("AI 应用开发",), r"工作流|Workflow|编排"),
    ("ai-dev", "Agent", "工具调用与MCP", ("AI 应用开发",), r"Function ?Call|工具调用|Tool ?(Use|Call)|MCP"),
    ("ai-dev", "Agent", "记忆", ("AI 应用开发",), r"记忆|Memory"),
    ("ai-dev", "Agent", "多Agent", ("AI 应用开发",), r"多 ?Agent|多智能体|Multi-?Agent|A2A"),
    ("ai-dev", "Agent", "编码Agent", ("AI 应用开发",), r"AI ?Coding|代码生成|Coding Agent|Claude Code|Cursor"),
    ("ai-dev", "Agent", "Skills与方法论", ("AI 应用开发",), r"Skill|AGENTS\.md|规范驱动|Spec"),
    ("ai-dev", "Agent", "运行环境", ("AI 应用开发",), r"沙箱|Sandbox|浏览器自动化|GUI|Computer Use|Browser"),
    ("ai-dev", "开发框架与平台", "代码框架", ("AI 应用开发",), r"LangChain|LangGraph|LlamaIndex|AutoGen|CrewAI|Spring AI|LangChain4j|Agent ?框架"),
    ("ai-dev", "开发框架与平台", "低代码平台", ("AI 应用开发",), r"Dify|Coze|扣子|FastGPT|n8n|低代码"),
    ("ai-dev", "评测与可观测", "评测体系", ("AI 应用开发",), r"评测|评估|Eval|[Bb]enchmark"),
    ("ai-dev", "评测与可观测", "Badcase分析与迭代", ("AI 应用开发",), r"[Bb]ad ?case|数据飞轮|效果优化|效果迭代"),
    ("ai-dev", "评测与可观测", "链路追踪与监控", ("AI 应用开发",), r"可观测|Trace|链路追踪|监控|Langfuse"),
    ("ai-dev", "工程落地", "性能与成本", ("AI 应用开发",), r"成本|延迟|吞吐|Token"),
    ("ai-dev", "工程落地", "安全与合规", ("AI 应用开发",), r"安全|合规|注入|越狱|隐私|审核"),
    ("ai-dev", "工程落地", "场景案例", ("AI 应用开发",), r"业务场景|应用场景|场景落地|落地场景|落地经验|落地案例"),

    ("product", "AI产品", "技术理解", ("AI 产品",), r"技术理解|技术背景|理解.{0,6}(原理|技术)|计算机|模型能力|能力边界|技术边界"),
    ("product", "AI产品", "场景挖掘与需求判断", ("AI 产品",), r"场景|需求洞察|需求挖掘|痛点"),
    ("product", "AI产品", "体验与交互设计", ("AI 产品",), r"体验|交互"),
    ("product", "AI产品", "Prompt与原型搭建", ("AI 产品",), r"Prompt|提示词|[Dd]emo|原型|Dify|Coze|Cursor"),
    ("product", "AI产品", "效果评测与迭代", ("AI 产品",), r"评测|评估|Eval|[Bb]ad ?case|数据飞轮|效果优化"),
    ("product", "AI产品", "与算法团队协作", ("AI 产品",), r"算法|训练|数据集|标注|语料"),
    ("product", "AI产品", "商业化与成本", ("AI 产品",), r"商业化|变现|付费|ROI|成本|定价"),
    ("product", "AI产品", "安全与合规", ("AI 产品",), r"安全|合规|伦理|隐私"),
    ("product", "产品基本功", "需求分析与用户研究", ("AI 产品",), r"需求分析|用户研究|用户调研|用户洞察|用户需求"),
    ("product", "产品基本功", "产品设计与PRD", ("AI 产品",), r"PRD|产品方案|方案设计|产品设计"),
    ("product", "产品基本功", "产品规划与策略", ("AI 产品",), r"规划|策略|路线图|0到1|0-1|从0"),
    ("product", "产品基本功", "项目推进与跨团队协作", ("AI 产品",), r"跨团队|跨部门|协同|沟通|推动|项目管理"),
    ("product", "数据能力", "指标体系", ("AI 产品",), r"指标"),
    ("product", "数据能力", "数据分析方法", ("AI 产品",), r"数据分析|数据驱动|数据洞察"),
    ("product", "数据能力", "AB实验", ("AI 产品",), r"A/B|AB ?实验|AB ?测试|实验"),
    ("product", "数据能力", "SQL", ("AI 产品",), r"SQL"),
    ("product", "AI行业与竞品", "AI行业与竞品", ("AI 产品",), r"行业|竞品|市场"),
]

FIGS = {
    "fullstack": "全栈开发：各目录项在 JD 里的出现比例",
    "ai-dev": "AI 应用开发：各目录项在 JD 里的出现比例",
    "product": "产品：各目录项在 AI 产品岗 JD 里的出现比例",
}

PALETTE = ["#2563eb", "#ea580c", "#059669", "#9333ea", "#dc2626", "#0891b2", "#ca8a04", "#db2777"]
GRAY = "#6b7280"


def load(data_dir):
    jobs = collections.defaultdict(list)
    for kind in ("技术", "产品"):
        for path in sorted(glob.glob(os.path.join(data_dir, "*", kind + ".csv"))):
            company = os.path.basename(os.path.dirname(path))
            with open(path, encoding="utf-8-sig") as f:
                for r in csv.DictReader(f):
                    jobs[kind].append((company, r["职位名称"], r["职位描述"] + "\n" + r["任职要求"]))
    if not jobs:
        sys.exit(f"没有在 {data_dir} 找到 <公司>/技术.csv 或 <公司>/产品.csv")
    groups = {}
    for name, (kind, match) in GROUPS.items():
        groups[name] = [(c, x) for c, t, x in jobs[kind] if match(t, x)]
    return groups


def share(rows, pattern):
    by_company = collections.defaultdict(list)
    for company, text in rows:
        by_company[company].append(text)
    kept = [texts for texts in by_company.values() if len(texts) >= MIN_JOBS] or list(by_company.values())
    rx = re.compile(pattern, re.I)
    return 100 * sum(sum(1 for t in texts if rx.search(t)) / len(texts) for texts in kept) / len(kept)


def sample_note(groups, names):
    parts = []
    for n in names:
        rows = groups[n]
        companies = sum(1 for v in collections.Counter(c for c, _ in rows).values() if v >= MIN_JOBS)
        parts.append(f"{n} {len(rows)} 个职位 / {companies} 家公司")
    return "；".join(parts)


def setup():
    plt.rcParams["font.sans-serif"] = ["PingFang SC", "PingFang HK", "Hiragino Sans GB", "Arial Unicode MS", "Noto Sans CJK SC"]
    plt.rcParams["axes.unicode_minus"] = False


def style(ax):
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.tick_params(axis="y", length=0)
    ax.xaxis.grid(True, color="#e5e7eb", linewidth=0.8)
    ax.set_axisbelow(True)


def plot_overview(groups):
    names = list(GROUPS)
    metrics = [("提到 AI / 大模型", AI), ("提到 Agent / 智能体", r"Agent|智能体"),
               ("提到 AI 编程工具", r"Cursor|Copilot|Claude Code|AI ?Coding|AI ?编程|AI ?辅助|Vibe Coding")]
    values = [[share(groups[n], p) for n in names] for _, p in metrics]
    fig, ax = plt.subplots(figsize=(10, 4.8), dpi=150)
    width = 0.26
    for i, ((label, _), vals) in enumerate(zip(metrics, values)):
        xs = [j + (i - 1) * width for j in range(len(names))]
        bars = ax.bar(xs, vals, width, label=label, color=PALETTE[i])
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v + 1.2, f"{v:.0f}", ha="center", fontsize=8, color="#374151")
    ax.set_xticks(range(len(names)))
    ax.set_xticklabels(names)
    ax.set_ylim(0, 108)
    ax.set_ylabel("JD 出现比例（%）")
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.yaxis.grid(True, color="#e5e7eb", linewidth=0.8)
    ax.set_axisbelow(True)
    ax.legend(frameon=False, loc="upper center", ncol=3, bbox_to_anchor=(0.5, 1.1))
    ax.set_title("各类岗位 JD 对 AI 的要求", pad=34, fontsize=13, loc="left")
    fig.text(0.01, 0.01, sample_note(groups, names), fontsize=7, color=GRAY)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(os.path.join(OUT, "overview.png"))
    plt.close(fig)
    return {label: dict(zip(names, vals)) for (label, _), vals in zip(metrics, values)}


def plot_items(groups, fig_key, results):
    items = [(sub, item, val) for (f, sub, item, _, _), val in results if f == fig_key]
    subs = list(dict.fromkeys(s for s, _, _ in items))
    color = {s: PALETTE[i % len(PALETTE)] for i, s in enumerate(subs)}
    fig, ax = plt.subplots(figsize=(10, 0.32 * len(items) + 1.6), dpi=150)
    ys = list(range(len(items)))[::-1]
    ax.barh(ys, [v for _, _, v in items], color=[color[s] for s, _, _ in items], height=0.7)
    for y, (_, _, v) in zip(ys, items):
        ax.text(v + 0.8, y, f"{v:.0f}" + (" ★" if v >= STAR else ""), va="center", fontsize=8, color="#374151")
    ax.set_yticks(ys)
    ax.set_yticklabels([f"{item}" if sub == item else f"{sub} / {item}" for sub, item, _ in items], fontsize=9)
    ax.axvline(STAR, color=GRAY, linestyle="--", linewidth=0.9)
    ax.text(STAR + 0.5, -1.0, f"★ 高频线 {STAR}%", fontsize=8, color=GRAY, va="center")
    ax.set_ylim(-1.5, len(items) - 0.4)
    ax.set_xlim(0, 105)
    ax.set_xlabel("JD 出现比例（%）")
    style(ax)
    ax.set_title(FIGS[fig_key], fontsize=13, loc="left")
    used = list(dict.fromkeys(g for f, _, _, gs, _ in ITEMS if f == fig_key for g in gs))
    fig.text(0.01, 0.005, "样本：" + sample_note(groups, used), fontsize=7, color=GRAY)
    fig.tight_layout(rect=(0, 0.02, 1, 1))
    fig.savefig(os.path.join(OUT, fig_key + ".png"))
    plt.close(fig)


def main():
    data_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "求职", "data")
    os.makedirs(OUT, exist_ok=True)
    setup()
    groups = load(data_dir)
    overview = plot_overview(groups)
    results = []
    for item in ITEMS:
        rows = [r for g in item[3] for r in groups[g]]
        results.append((item, share(rows, item[4])))
    for key in FIGS:
        plot_items(groups, key, results)

    print("## 总览")
    for label, vals in overview.items():
        print(f"- {label}：" + "，".join(f"{k} {v:.0f}%" for k, v in vals.items()))
    for key, title in FIGS.items():
        print(f"\n## {title}")
        for (f, sub, item, _, _), v in results:
            if f == key:
                print(f"- {sub}/{item}: {v:.0f}%" + (" ★" if v >= STAR else ""))
    print(f"\n图已写入 {os.path.relpath(OUT, ROOT)}/")


if __name__ == "__main__":
    main()
