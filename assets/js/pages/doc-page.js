import { findDocumentByPath, findDocumentBySlug, isSafeDocumentPath, isSafeSlug, loadIndexData, loadSiteText } from "../core/data-service.js";
import { buildMarkdownView } from "../core/markdown.js";
import { escapeHtml, readText, setDocumentMeta, setText } from "../core/dom.js";
import { initSharedMotion, refreshMotion } from "../core/motion.js";
import { initEffects } from "../core/effects.js";

class DocPage {
    constructor() {
        this.indexData = null;
        this.siteText = null;
        this.documentInfo = null;
        this.documentPath = null;
        this.documentSlug = null;
        this.elements = {
            title: document.getElementById("docTitle"),
            meta: document.getElementById("docMeta"),
            content: document.getElementById("docContent"),
            backLink: document.getElementById("backToDocs"),
            backText: document.getElementById("docBackText"),
            eyebrow: document.getElementById("docEyebrow"),
            eyebrowText: document.getElementById("docEyebrowText"),
            loadingText: document.getElementById("docLoadingText"),
            tocSidebar: document.getElementById("docTocSidebar"),
            tocBody: document.getElementById("docTocBody"),
            tocToggle: document.getElementById("tocToggle"),
            tocToggleLabel: document.getElementById("tocToggleLabel"),
            layout: document.getElementById("docLayout"),
        };
        this.isTocCollapsed = false;
    }

    async init() {
        initSharedMotion();
        initEffects();
        this.bindEvents();

        // 优先从 URL 路径提取 slug（新格式：/doc/slug）
        const pathMatch = window.location.pathname.match(/\/doc\/([^\/]+)$/);
        if (pathMatch) {
            this.documentSlug = decodeURIComponent(pathMatch[1]);
        }

        // 兼容旧格式：从 query string 读取
        const params = new URLSearchParams(window.location.search);
        this.documentSlug = this.documentSlug || params.get("slug");
        this.documentPath = params.get("path");

        this.siteText = await loadSiteText().catch(() => null);
        this.renderCopy();

        if (!this.documentSlug && !this.documentPath) {
            this.renderError(this.copy("doc.invalid_path"));
            return;
        }

        try {
            this.indexData = await loadIndexData();

            // 根据 slug 或 path 查找文档
            if (this.documentSlug) {
                if (!isSafeSlug(this.indexData, this.documentSlug)) {
                    this.renderError(this.copy("doc.forbidden_path"));
                    return;
                }
                this.documentInfo = findDocumentBySlug(this.indexData, this.documentSlug);
            } else {
                if (!isSafeDocumentPath(this.indexData, this.documentPath)) {
                    this.renderError(this.copy("doc.forbidden_path"));
                    return;
                }
                this.documentInfo = findDocumentByPath(this.indexData, this.documentPath);
            }

            await this.loadDocument();
        } catch (error) {
            const message = error instanceof Error ? error.message : this.copy("common.error_unknown");
            this.renderError(`${this.copy("doc.load_failed_prefix")}${message}`);
        }
    }

    bindEvents() {
        this.elements.tocToggle?.addEventListener("click", () => {
            this.isTocCollapsed = !this.isTocCollapsed;
            this.elements.layout?.classList.toggle("is-toc-collapsed", this.isTocCollapsed);
            this.updateTocToggleLabel();
        });
    }

    copy(path, fallback = "") {
        return readText(this.siteText, path, fallback);
    }

    renderCopy() {
        setDocumentMeta(this.copy("doc.page_title"), this.copy("doc.meta_description"));
        setText(this.elements.backText, this.copy("doc.back_to_docs"));
        setText(this.elements.eyebrowText, this.copy("doc.eyebrow"));
        this.elements.eyebrow?.classList.toggle("hidden", !this.copy("doc.eyebrow"));
        setText(this.elements.loadingText, this.copy("common.loading_document"));
        this.updateTocToggleLabel();
    }

    updateTocToggleLabel() {
        setText(
            this.elements.tocToggleLabel,
            this.isTocCollapsed ? this.copy("doc.toc_toggle_expand") : this.copy("doc.toc_toggle_collapse"),
        );
    }

    async loadDocument() {
        // 使用 documentInfo.full_path 加载实际文件
        const filePath = this.documentInfo?.full_path;
        if (!filePath) {
            throw new Error("Document path not found");
        }
        // 把 # 替换为 %23，避免浏览器把 # 后面的内容当作片段标识符截断
        const safePath = filePath.replace(/#/g, '%23');
        const response = await fetch(`./${safePath}`, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const markdown = await response.text();
        this.renderDocument(markdown);
    }

    renderDocument(markdown) {
        const title = this.documentInfo?.title || this.documentInfo?.name || this.copy("doc.fallback_title");
        document.title = `${title} - Tech-Docs`;
        this.elements.title.textContent = title;
        this.elements.backLink.href = this.getBackLink();

        const metadata = [];
        if (this.documentInfo?.category) {
            metadata.push(`<span class="meta-pill"><i class="fas fa-folder-tree"></i>${escapeHtml(this.documentInfo.category)}</span>`);
        }
        if (this.documentInfo?.updated || this.documentInfo?.date) {
            metadata.push(
                `<span class="meta-pill"><i class="fas fa-calendar"></i>${escapeHtml(this.documentInfo.updated || this.documentInfo.date)}</span>`,
            );
        }
        if (this.documentInfo?.word_count) {
            metadata.push(`<span class="meta-pill"><i class="fas fa-file-lines"></i>${this.documentInfo.word_count} ${escapeHtml(this.copy("common.word_unit"))}</span>`);
        }
        for (const tag of (this.documentInfo?.tags ?? []).slice(0, 4)) {
            metadata.push(`<span class="tag">${escapeHtml(tag)}</span>`);
        }
        this.elements.meta.innerHTML = metadata.join("");

        const { tocHtml, contentHtml } = buildMarkdownView(markdown, { tocTitle: this.copy("doc.toc_title") });
        this.elements.tocBody.innerHTML = tocHtml;
        this.elements.content.innerHTML = contentHtml;
        this.elements.tocSidebar.classList.toggle("hidden", !tocHtml);

        if (window.hljs) {
            this.elements.content.querySelectorAll("pre code").forEach((block) => {
                window.hljs.highlightElement(block);
            });
        }

        // ── 滚动监听：当前阅读位置高亮目录项 ──
        this.initTocScrollSpy();

        refreshMotion();
    }

    initTocScrollSpy() {
        const headings = this.elements.content?.querySelectorAll("h1, h2, h3, h4, h5, h6");
        const tocLinks = this.elements.tocBody?.querySelectorAll(".toc-link");
        if (!headings?.length || !tocLinks?.length) return;

        // 建立 heading id → toc link 的映射
        const tocLinkMap = new Map();
        tocLinks.forEach((link) => {
            const href = link.getAttribute("href");
            if (href?.startsWith("#")) {
                tocLinkMap.set(href.slice(1), link);
            }
        });

        // 缓存上一个激活的链接
        let lastActive = null;

        const setActive = (link) => {
            if (link && link !== lastActive) {
                lastActive?.classList.remove("is-active");
                link.classList.add("is-active");
                // 在目录容器内居中滚动，不影响页面主滚动条
                const tocBody = this.elements.tocBody;
                if (tocBody) {
                    const linkTop = link.offsetTop - tocBody.offsetTop;
                    const target = linkTop - tocBody.clientHeight / 2 + link.offsetHeight / 2;
                    tocBody.scrollTo({ top: target, behavior: "smooth" });
                }
                lastActive = link;
            }
        };

        // 点击目录项：平滑滚动到目标位置，选中态由 IntersectionObserver 自然更新
        tocLinks.forEach((link) => {
            link.addEventListener("click", (e) => {
                const href = link.getAttribute("href");
                if (!href?.startsWith("#")) return;
                e.preventDefault();

                const target = document.getElementById(href.slice(1));
                if (target) {
                    const header = document.querySelector(".doc-header");
                    const offset = header ? header.getBoundingClientRect().height + 18 + 12 : 110;
                    const targetTop = target.getBoundingClientRect().top + window.scrollY;
                    window.scrollTo({ top: Math.max(0, targetTop - offset), behavior: "smooth" });
                }
            });
        });

        // 使用 IntersectionObserver 监听标题可见性
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (!visible.length) return;

                const target = visible[0].target.id;
                setActive(tocLinkMap.get(target));
            },
            {
                rootMargin: "-80px 0px -60% 0px",
                threshold: 0,
            },
        );

        headings.forEach((h) => observer.observe(h));
    }

    getBackLink() {
        // 直接返回 docs.html，不带 folder 参数
        // 这样用户返回时会看到全部文档，而不是某个特定分类
        return "./docs.html";
    }

    renderError(message) {
        document.title = this.copy("doc.error_title");
        this.elements.title.textContent = this.copy("doc.error_title");
        this.elements.meta.innerHTML = "";
        this.elements.tocSidebar.classList.add("hidden");
        this.elements.content.innerHTML = `
            <div class="doc-error">
                <i class="fas fa-triangle-exclamation fa-2x"></i>
                <p>${escapeHtml(message)}</p>
                <a class="btn-secondary" href="./docs.html">
                    <i class="fas fa-arrow-left"></i>
                    ${escapeHtml(this.copy("doc.error_back"))}
                </a>
            </div>
        `;
        this.elements.backLink.href = "./docs.html";
    }
}

const page = new DocPage();
page.init();
