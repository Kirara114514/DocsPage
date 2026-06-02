export function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function formatDate(value) {
    if (!value) return "";

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return String(value);
    }

    return parsed.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function summarizeText(value, maxLength = 110) {
    const normalized = String(value ?? "")
        .replace(/^#+\s+/gm, "")
        .replace(/\*\*/g, "")
        .replace(/`/g, "")
        .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
        .replace(/\s+/g, " ")
        .trim();

    if (!normalized) return "";
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength).trim()}...`;
}

export function createElementFromHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
}

export function interpolate(template, values = {}) {
    const source = String(template ?? "");
    return source.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

export function readText(bundle, path, fallback = "") {
    const segments = path.split(".");
    let current = bundle;

    for (const segment of segments) {
        if (!current || typeof current !== "object" || !(segment in current)) {
            return fallback;
        }
        current = current[segment];
    }

    if (current === null || current === undefined) {
        return fallback;
    }

    return typeof current === "string" ? current : fallback;
}

export function setText(element, text, options = {}) {
    const { hideIfEmpty = true } = options;
    if (!element) return;

    const normalized = String(text ?? "").trim();
    if (!normalized) {
        element.textContent = "";
        if (hideIfEmpty) {
            element.classList.add("hidden");
        }
        return;
    }

    element.textContent = normalized;
    element.classList.remove("hidden");
}

export function setDocumentMeta(title, description) {
    if (typeof title === "string") {
        document.title = title;
    }

    if (typeof description === "string") {
        const meta = document.querySelector('meta[name="description"]');
        if (meta) {
            meta.setAttribute("content", description);
        }
    }
}

export function setButtonLoading(button, isLoading, loadingText = "处理中...") {
    if (!button) return;

    if (isLoading) {
        if (!button.dataset.originalLabel) {
            button.dataset.originalLabel = button.innerHTML;
        }
        button.disabled = true;
        button.innerHTML = `<span class="loading-ring" aria-hidden="true"></span><span>${escapeHtml(loadingText)}</span>`;
        return;
    }

    button.disabled = false;
    if (button.dataset.originalLabel) {
        button.innerHTML = button.dataset.originalLabel;
        delete button.dataset.originalLabel;
    }
}
