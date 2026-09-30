#!/usr/bin/env python3
"""把笔记 Markdown 合并成静态站点数据。

    python3 tools/scripts/build_site.py

扫描 技术/、产品/、面经与复盘/ 下的 Markdown（跳过 *.private.md），
生成 site/data/notes.json，供 site/ 直接读取。没有构建步骤，改完笔记跑一次即可。
"""
import json
import os
import re
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SECTIONS = ["技术", "产品", "面经与复盘"]
PLACEHOLDER = "（待补充）"
SCOPE_RE = re.compile(r"^> 范围：(.+)$", re.M)
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+\.md)\)")
HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*$", re.M)
FENCE_RE = re.compile(r"^```.*?^```", re.M | re.S)
# 带锚点的链接：Markdown 的 ](路径#锚点) 和 HTML 的 href="路径#锚点"，路径为空表示本篇
ANCHOR_LINK_RE = re.compile(r"\]\(([^)\s]*#[^)\s]+)\)|href=\"([^\"]*#[^\"]+)\"")


def walk(directory):
    """目录树：文件夹按名字排序，README 排在同级文件最前，其余文件随后。"""
    nodes = []
    for name in sorted(os.listdir(directory)):
        if name.startswith(".") or name.endswith(".private.md"):
            continue
        path = os.path.join(directory, name)
        if os.path.isdir(path):
            children = walk(path)
            if children:
                nodes.append({"title": name, "children": children})
        elif name.endswith(".md"):
            with open(path, encoding="utf-8") as f:
                text = f.read()
            title = re.match(r"^# (.+)", text).group(1).strip()
            scope = SCOPE_RE.search(text)
            file = os.path.relpath(path, ROOT)
            nodes.append({
                "title": title,
                "file": file,
                "scope": scope.group(1).strip() if scope else "",
                "done": PLACEHOLDER not in text,
                "links": links_of(text, file),
                "body": text,
            })
    folders = [n for n in nodes if "children" in n]
    files = [n for n in nodes if "children" not in n]
    readme = [n for n in files if os.path.basename(n["file"]) == "README.md"]
    rest = [n for n in files if n not in readme]
    return folders + readme + rest


def links_of(text, file):
    """笔记正文里指向其他笔记的相对链接，解析成仓库内的文件路径。"""
    base = os.path.dirname(file)
    found = []
    for href in LINK_RE.findall(text):
        href = href.split("#")[0]
        if re.match(r"^[a-z]+:", href):
            continue
        target = os.path.normpath(os.path.join(base, href))
        if target != file and os.path.exists(os.path.join(ROOT, target)):
            found.append(target)
    return sorted(set(found))


def slugify(text):
    """标题锚点，和 GitHub、site/assets/app.js 的规则一致：转小写，去掉标点，空白换成连字符。"""
    return re.sub(r"\s", "-", re.sub(r"[^\w\s-]", "", text.strip().lower()))


def anchors_of(text):
    """一篇笔记里所有标题的锚点，重名的依次加 -1、-2。"""
    found, seen = set(), {}
    for heading in HEADING_RE.findall(FENCE_RE.sub("", text)):
        slug = slugify(heading)
        n = seen.get(slug, 0)
        seen[slug] = n + 1
        found.add(slug if n == 0 else f"{slug}-{n}")
    return found


def broken_anchors(notes):
    """指向不存在的标题的链接。notes 是 {文件路径: 正文}。"""
    anchors = {file: anchors_of(text) for file, text in notes.items()}
    problems = []
    for file, text in notes.items():
        for m in ANCHOR_LINK_RE.finditer(text):
            href = unquote(m.group(1) or m.group(2))
            if re.match(r"^[a-z]+:", href):
                continue
            path, anchor = href.split("#", 1)
            target = os.path.normpath(os.path.join(os.path.dirname(file), path)) if path else file
            if target in anchors and anchor not in anchors[target]:
                problems.append(f"{file}：{href}")
    return problems


def count(nodes, key):
    total = 0
    for node in nodes:
        if "children" in node:
            total += count(node["children"], key)
        elif key(node):
            total += 1
    return total


def main():
    tree = []
    for section in SECTIONS:
        children = walk(os.path.join(ROOT, section))
        if children:
            tree.append({"title": section, "children": children})
    # 反向引用：谁的正文链接了这篇
    incoming = {}

    def collect(nodes):
        for node in nodes:
            if "children" in node:
                collect(node["children"])
            else:
                for target in node["links"]:
                    incoming.setdefault(target, []).append(node["file"])

    collect(tree)

    bodies = {}

    def gather(nodes):
        for node in nodes:
            if "children" in node:
                gather(node["children"])
            else:
                bodies[node["file"]] = node["body"]

    gather(tree)

    def attach(nodes):
        for node in nodes:
            if "children" in node:
                attach(node["children"])
            else:
                node["backlinks"] = sorted(incoming.get(node["file"], []))

    attach(tree)
    notes = count(tree, lambda n: True)
    done = count(tree, lambda n: n["done"])
    data = {"tree": tree, "stats": {"notes": notes, "done": done}}
    out = os.path.join(ROOT, "site", "data", "notes.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"site/data/notes.json：{notes} 篇笔记，{done} 篇已写内容")
    problems = broken_anchors(bodies)
    if problems:
        print(f"\n{len(problems)} 个链接指向不存在的标题（标题改过名，或链接写错了）：")
        for p in problems:
            print("  " + p)


if __name__ == "__main__":
    main()
