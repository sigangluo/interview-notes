#!/usr/bin/env python3
"""把笔记 Markdown 合并成静态站点数据。

    python3 tools/scripts/build_site.py

扫描 技术/、产品/、面经与复盘/ 下的 Markdown（跳过 *.private.md），
生成 site/data/notes.json，供 site/ 直接读取。没有构建步骤，改完笔记跑一次即可。
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SECTIONS = ["技术", "产品", "面经与复盘"]
PLACEHOLDER = "（待补充）"
SCOPE_RE = re.compile(r"^> 范围：(.+)$", re.M)


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
            nodes.append({
                "title": title,
                "file": os.path.relpath(path, ROOT),
                "scope": scope.group(1).strip() if scope else "",
                "done": PLACEHOLDER not in text,
                "body": text,
            })
    folders = [n for n in nodes if "children" in n]
    files = [n for n in nodes if "children" not in n]
    readme = [n for n in files if os.path.basename(n["file"]) == "README.md"]
    rest = [n for n in files if n not in readme]
    return folders + readme + rest


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
    notes = count(tree, lambda n: True)
    done = count(tree, lambda n: n["done"])
    data = {"tree": tree, "stats": {"notes": notes, "done": done}}
    out = os.path.join(ROOT, "site", "data", "notes.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"site/data/notes.json：{notes} 篇笔记，{done} 篇已写内容")


if __name__ == "__main__":
    main()
