#!/usr/bin/env python3
"""Generate the Tech-Docs search index from the Markdown repository."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Iterable

IGNORED_NAMES = {".git", ".format_backup", ".temp_writing", "修复前备份", "模板规范"}
SPECIAL_CATEGORY_ORDER = {
    "模板规范": 0,
    "Tech-Docs": 1,
    "日常记录": 2,
    "历史记录": 3,
}


class GenerationError(RuntimeError):
    """Raised when the index cannot be generated safely."""


@dataclass(frozen=True)
class Metadata:
    title: str = ""
    date: str = ""
    updated: str = ""
    author: str = "吉良吉影"
    category: str = ""
    tags: tuple[str, ...] = ()
    source: str = ""
    status: str = ""
    priority: str = "中"


@dataclass(frozen=True)
class ScanContext:
    repo_path: Path
    output_file: Path
    tags_output: Path
    search_output: Path
    webhook_mode: bool


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Tech-Docs JSON generator")
    parser.add_argument("--webhook", action="store_true", help="run in webhook mode")
    return parser.parse_args()


def resolve_context(arguments: argparse.Namespace) -> ScanContext:
    script_root = Path(__file__).resolve().parent
    repo_path = Path(os.environ.get("TECH_DOCS_REPO", script_root / "Tech-Docs")).resolve()
    output_file = Path(os.environ.get("TECH_DOCS_INDEX", script_root / "index.json")).resolve()

    return ScanContext(
        repo_path=repo_path,
        output_file=output_file,
        tags_output=script_root / "tags.json",
        search_output=script_root / "search_index.json",
        webhook_mode=arguments.webhook,
    )


def read_markdown(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as error:
        raise GenerationError(f"文件不是 UTF-8 编码，已跳过: {path}") from error


def extract_metadata_from_content(content: str) -> Metadata:
    title = ""
    for line in content.splitlines():
        if line.startswith("# "):
            title = line[2:].strip()
            break

    metadata_lines: list[str] = []
    in_metadata = False

    for line in content.splitlines():
        stripped = line.strip()
        if stripped == "## 元数据":
            in_metadata = True
            continue

        if not in_metadata:
            continue

        if stripped == "---":
            break
        if line.startswith("## ") and stripped != "## 元数据":
            break
        metadata_lines.append(stripped)

    fields: dict[str, str] = {}
    prefixes = {
        "- **创建时间：**": "date",
        "- **最后更新：**": "updated",
        "- **作者：**": "author",
        "- **分类：**": "category",
        "- **标签：**": "tags",
        "- **来源：**": "source",
        "- **状态：**": "status",
        "- **优先级：**": "priority",
    }

    for line in metadata_lines:
        for prefix, key in prefixes.items():
            if not line.startswith(prefix):
                continue
            fields[key] = line.replace(prefix, "", 1).strip()
            break

    tag_text = fields.get("tags", "")
    tags = tuple(tag.strip() for tag in tag_text.replace("，", ",").split(",") if tag.strip())

    return Metadata(
        title=title,
        date=fields.get("date", ""),
        updated=fields.get("updated", ""),
        author=fields.get("author", "") or "吉良吉影",
        category=fields.get("category", ""),
        tags=tags,
        source=fields.get("source", ""),
        status=fields.get("status", ""),
        priority=fields.get("priority", "") or "中",
    )


def generate_slug(title: str, existing_slugs: set[str] | None = None) -> str:
    """把标题转成 URL 友好的 slug，自动去重（追加 -2、-3 等后缀）"""
    slug = title.lower()
    slug = re.sub(r'[^\w一-鿿]+', '-', slug)
    slug = slug.strip('-')
    slug = re.sub(r'-+', '-', slug)
    
    if existing_slugs is not None:
        if slug in existing_slugs:
            counter = 2
            while f"{slug}-{counter}" in existing_slugs:
                counter += 1
            slug = f"{slug}-{counter}"
        existing_slugs.add(slug)
    
    return slug


def should_ignore(path: Path) -> bool:
    return path.name in IGNORED_NAMES or path.name.startswith(".")


def load_category_order(config_dir: Path) -> list[str]:
    """从 config/category-order.json 加载分类顺序配置，不存在则返回空列表。"""
    order_file = config_dir / "category-order.json"
    try:
        if order_file.exists():
            data = json.loads(order_file.read_text(encoding="utf-8"))
            return data.get("order", [])
    except Exception:
        pass
    return []


def extract_headings(content: str) -> list[str]:
    """从 markdown 内容中提取所有标题文本（H1-H6），去掉 markdown 格式符号。"""
    headings: list[str] = []
    for line in content.splitlines():
        match = re.match(r"^(#{1,6})\s+(.+)$", line)
        if match:
            text = match.group(2).strip()
            text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
            text = re.sub(r"\*(.+?)\*", r"\1", text)
            text = re.sub(r"`(.+?)`", r"\1", text)
            text = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", text)
            headings.append(text.strip())
    return headings


def build_tags_index(all_documents: list[dict]) -> dict:
    """从所有文档中聚合标签，生成 tags.json 数据。"""
    tag_map: dict[str, list[dict]] = {}

    for doc in all_documents:
        tags = doc.get("tags", [])
        if not tags:
            continue
        for tag in tags:
            if not tag:
                continue
            if tag not in tag_map:
                tag_map[tag] = []
            tag_map[tag].append({
                "title": doc.get("title", ""),
                "full_path": doc.get("full_path", ""),
                "category": doc.get("category", ""),
            })

    tags_list = [
        {"name": name, "count": len(files), "files": files}
        for name, files in tag_map.items()
    ]

    return {
        "generated_at": datetime.now().isoformat(),
        "tags": tags_list,
    }


def build_search_index(all_documents: list[dict], repo_path: Path) -> dict:
    """为每篇文档提取所有标题层级，生成 search_index.json 数据。"""
    documents: list[dict] = []

    for doc in all_documents:
        full_path = doc.get("full_path", "")
        if not full_path:
            continue

        file_path = repo_path.parent / full_path
        if not file_path.exists():
            continue

        try:
            content = read_markdown(file_path)
        except GenerationError:
            continue

        headings = extract_headings(content)

        documents.append({
            "full_path": full_path,
            "title": doc.get("title", ""),
            "headings": headings,
            "tags": doc.get("tags", []),
            "category": doc.get("category", ""),
        })

    return {
        "generated_at": datetime.now().isoformat(),
        "documents": documents,
    }


def scan_directory(root_path: Path, rel_path: str = "", existing_slugs: set[str] | None = None) -> tuple[dict, list[dict], list[str]]:
    dir_name = root_path.name
    current_rel_path = f"{rel_path}/{dir_name}" if rel_path else dir_name
    
    if existing_slugs is None:
        existing_slugs = set()

    result: dict = {
        "name": dir_name,
        "type": "directory",
        "path": current_rel_path,
        "children": [],
        "file_count": 0,
        "document_count": 0,
        "total_words": 0,
    }

    all_documents: list[dict] = []
    errors: list[str] = []

    for item in sorted(root_path.iterdir(), key=lambda child: child.name):
        if should_ignore(item):
            continue

        if item.is_dir():
            child_tree, child_docs, child_errors = scan_directory(item, current_rel_path, existing_slugs)
            if child_tree["file_count"] > 0 or child_tree["children"]:
                result["children"].append(child_tree)
                result["file_count"] += child_tree["file_count"]
                result["document_count"] += child_tree["document_count"]
                result["total_words"] += child_tree["total_words"]
                all_documents.extend(child_docs)
            errors.extend(child_errors)
            continue

        if item.suffix.lower() != ".md":
            continue

        try:
            content = read_markdown(item)
            metadata = extract_metadata_from_content(content)
        except GenerationError as error:
            errors.append(str(error))
            continue
        except Exception as error:  # pragma: no cover - defensive fallback
            errors.append(f"处理文件失败 {item}: {error}")
            continue

        title = metadata.title or item.stem
        category = metadata.category or dir_name
        word_count = len(content)
        relative_document_path = f"{current_rel_path}/{item.name}"

        document = {
            "name": item.name,
            "type": "file",
            "path": relative_document_path,
            "title": title,
            "slug": generate_slug(title, existing_slugs),
            "date": metadata.date,
            "updated": metadata.updated or metadata.date,
            "tags": list(metadata.tags),
            "category": category,
            "source": metadata.source,
            "priority": metadata.priority,
            "status": metadata.status,
            "author": metadata.author,
            "archived_to": "",
            "archived_at": "",
            "word_count": word_count,
            "size": item.stat().st_size,
            "modified": item.stat().st_mtime,
            "full_path": f"Tech-Docs/{relative_document_path}",
        }

        result["children"].append(document)
        result["file_count"] += 1
        result["document_count"] += 1
        result["total_words"] += word_count
        all_documents.append(document)

    return result, all_documents, errors


def build_index(context: ScanContext) -> tuple[dict, list[str]]:
    global CATEGORY_ORDER
    CATEGORY_ORDER = load_category_order(context.repo_path.parent / "config")

    if not context.repo_path.exists():
        raise GenerationError(f"文档库目录不存在: {context.repo_path}")

    categories: list[dict] = []
    all_documents: list[dict] = []
    errors: list[str] = []

    for item in sorted(context.repo_path.iterdir(), key=lambda child: child.name):
        if should_ignore(item) or not item.is_dir():
            continue

        category_tree, category_documents, category_errors = scan_directory(item)
        if category_tree["file_count"] > 0 or category_tree["children"]:
            categories.append(category_tree)
            all_documents.extend(category_documents)
        errors.extend(category_errors)

    categories.sort(key=sort_category)
    for category in categories:
        count = category.get("document_count", 0)
        category["avg_words"] = category.get("total_words", 0) / count if count else 0

    by_status: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    for document in all_documents:
        status = str(document.get("status", "")).strip()
        priority = str(document.get("priority", "")).strip()
        if status:
            by_status[status] = by_status.get(status, 0) + 1
        if priority:
            by_priority[priority] = by_priority.get(priority, 0) + 1

    index = {
        "generated_at": datetime.now().isoformat(),
        "version": "5.0",
        "stats": {
            "total_documents": len(all_documents),
            "categories_count": len(categories),
            "total_words": sum(document.get("word_count", 0) for document in all_documents),
            "by_status": by_status,
            "by_priority": by_priority,
        },
        "data": {
            "categories": categories,
            "all_documents": all_documents,
        },
    }

    return index, errors


# 全局变量，在 build_index 中加载
CATEGORY_ORDER: list[str] = []


def sort_category(category: dict) -> tuple[int, int, int, str]:
    name = str(category.get("name", ""))
    if CATEGORY_ORDER:
        try:
            idx = CATEGORY_ORDER.index(name)
            return (0, 0, idx, name)
        except ValueError:
            pass
    if name in SPECIAL_CATEGORY_ORDER:
        return (0, 1, SPECIAL_CATEGORY_ORDER[name], name)
    return (1, 0, -int(category.get("document_count", 0)), name)


def safe_write_json(data: dict, filepath: Path) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    temp_path: Path | None = None
    try:
        fd, temp_name = tempfile.mkstemp(dir=filepath.parent, suffix=".tmp")
        temp_path = Path(temp_name)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2, cls=CustomJsonEncoder)
        shutil.move(temp_path, filepath)
    except Exception as error:
        if temp_path and temp_path.exists():
            temp_path.unlink()
        raise GenerationError(f"写入索引失败: {error}") from error


class CustomJsonEncoder(json.JSONEncoder):
    def default(self, obj: object) -> object:
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return super().default(obj)


def print_summary(context: ScanContext, index: dict, errors: Iterable[str]) -> None:
    if context.webhook_mode:
        print(f"开始扫描Git仓库: {context.repo_path}")
    else:
        print("=" * 60)
        print("Tech-Docs JSON生成器 v5.0")
        print("=" * 60)
        print(f"Git仓库路径: {context.repo_path}")
        print(f"输出文件: {context.output_file}")
        print("-" * 60)

    if errors:
        for error in errors:
            print(f"警告: {error}")

    stats = index["stats"]
    print(f"JSON生成完成: {context.output_file}")
    print("")
    print("统计信息:")
    print(f"  文档总数: {stats['total_documents']}")
    print(f"  分类数量: {stats['categories_count']}")
    print(f"  总字数: {stats['total_words']:,}")


def try_fix_permissions(filepath: Path, webhook_mode: bool) -> None:
    if os.name == "nt":
        return

    try:
        subprocess.run(["chown", "www:www", str(filepath)], check=True, capture_output=True)
        subprocess.run(["chmod", "644", str(filepath)], check=True, capture_output=True)
        if not webhook_mode:
            print(f"✅ 权限已修复: {filepath}")
    except Exception as error:
        if not webhook_mode:
            print(f"⚠️ 权限修复失败: {error}")


def main() -> int:
    arguments = parse_arguments()
    context = resolve_context(arguments)

    try:
        index, errors = build_index(context)
        safe_write_json(index, context.output_file)
        print_summary(context, index, errors)
        try_fix_permissions(context.output_file, context.webhook_mode)

        # 生成 tags.json
        all_docs = index.get("data", {}).get("all_documents", [])
        tags_index = build_tags_index(all_docs)
        safe_write_json(tags_index, context.tags_output)
        try_fix_permissions(context.tags_output, context.webhook_mode)
        if not context.webhook_mode:
            print(f"标签索引: {context.tags_output} ({len(tags_index['tags'])} 个标签)")

        # 生成 search_index.json
        search_index = build_search_index(all_docs, context.repo_path)
        safe_write_json(search_index, context.search_output)
        try_fix_permissions(context.search_output, context.webhook_mode)
        if not context.webhook_mode:
            print(f"搜索索引: {context.search_output} ({len(search_index['documents'])} 篇文档)")

        return 0
    except GenerationError as error:
        print(f"错误: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
