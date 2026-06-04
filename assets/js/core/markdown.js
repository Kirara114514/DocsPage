import { escapeHtml } from "./dom.js";

const allowedTags = new Set([
    "a",
    "p",
    "br",
    "strong",
    "em",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "span",
]);

const allowedAttributes = new Map([
    ["a", new Set(["href", "title", "target", "rel"])],
    ["code", new Set(["class"])],
    ["span", new Set(["class"])],
    ["h1", new Set(["id"])],
    ["h2", new Set(["id"])],
    ["h3", new Set(["id"])],
    ["h4", new Set(["id"])],
    ["h5", new Set(["id"])],
    ["h6", new Set(["id"])],
]);

function createSlugger() {
    const counts = new Map();
    return (text) => {
        const base = text
            .toLowerCase()
            .trim()
            .replace(/[^\w\u4e00-\u9fa5\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-") || "section";

        const seen = counts.get(base) ?? 0;
        counts.set(base, seen + 1);
        return seen === 0 ? base : `${base}-${seen}`;
    };
}

function sanitizeUrl(rawUrl) {
    if (!rawUrl) return "";
    const trimmed = rawUrl.trim();
    if (/^(javascript|data):/i.test(trimmed)) return "";
    return trimmed;
}

export function buildMarkdownView(markdownSource, options = {}) {
    const content = String(markdownSource ?? "").replace(/^---[\s\S]*?---\n?/, "");
    const slugger = createSlugger();
    const headings = [];
    const tocTitle = String(options.tocTitle ?? "").trim();

    if (!window.marked) {
        return {
            tocHtml: "",
            contentHtml: `<pre>${escapeHtml(content)}</pre>`,
        };
    }

    const renderer = new marked.Renderer();
    renderer.heading = (...args) => {
        const payload = args[0];
        let text = "";
        let depth = 1;

        if (payload && typeof payload === "object" && "tokens" in payload) {
            text = payload.tokens.map((token) => token.text ?? "").join("").trim();
            depth = payload.depth ?? 1;
        } else {
            text = String(args[0] ?? "").trim();
            depth = Number(args[1] ?? 1);
        }

        const id = slugger(text);
        if (depth <= 6) {
            headings.push({ depth, text, id });
        }
        return `<h${depth} id="${id}">${escapeHtml(text)}</h${depth}>`;
    };
    renderer.link = (...args) => {
        const payload = args[0];
        let href = "";
        let title = "";
        let text = "";

        if (payload && typeof payload === "object" && "href" in payload) {
            href = payload.href ?? "";
            title = payload.title ?? "";
            text = payload.tokens.map((token) => token.raw ?? token.text ?? "").join("");
        } else {
            href = String(args[0] ?? "");
            title = String(args[1] ?? "");
            text = String(args[2] ?? "");
        }

        const safeHref = sanitizeUrl(href);
        const safeTitle = title ? ` title="${escapeHtml(title)}"` : "";
        if (!safeHref) {
            return `<span>${escapeHtml(text)}</span>`;
        }
        return `<a href="${escapeHtml(safeHref)}"${safeTitle} target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
    };

    marked.setOptions({
        gfm: true,
        breaks: false,
        renderer,
    });

    const rendered = marked.parse(content);
    const sanitized = sanitizeHtml(rendered);
    const tocHtml = headings.length
        ? `<div class="toc-panel reveal"><div class="toc-list">${headings
              .map(
                  (heading) =>
                      `<a class="toc-link" data-depth="${heading.depth}" href="#${heading.id}"><i class="fas fa-arrow-right"></i><span>${escapeHtml(heading.text)}</span></a>`,
              )
              .join("")}</div></div>`
        : "";

    return {
        tocHtml,
        contentHtml: `<article class="markdown-body">${sanitized}</article>`,
    };
}

function sanitizeHtml(html) {
    const documentFragment = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const root = documentFragment.body.firstElementChild;
    cleanNode(root);
    return root.innerHTML;
}

function cleanNode(node) {
    for (const child of [...node.children]) {
        const tagName = child.tagName.toLowerCase();

        if (!allowedTags.has(tagName)) {
            child.replaceWith(...child.childNodes);
            continue;
        }

        for (const attribute of [...child.attributes]) {
            const allowed = allowedAttributes.get(tagName);
            if (!allowed || !allowed.has(attribute.name)) {
                child.removeAttribute(attribute.name);
                continue;
            }

            if (tagName === "a" && attribute.name === "href") {
                const safeHref = sanitizeUrl(attribute.value);
                if (!safeHref) {
                    child.removeAttribute("href");
                } else {
                    child.setAttribute("href", safeHref);
                    child.setAttribute("rel", "noopener noreferrer");
                    child.setAttribute("target", "_blank");
                }
            }
        }

        cleanNode(child);
    }
}
