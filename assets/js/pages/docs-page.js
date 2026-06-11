import {
    collectDocuments,
    countDocuments,
    findCategory,
    getStats,
    getViewScopedCategories,
    loadIndexData,
    loadSiteText,
} from "../core/data-service.js";
import { escapeHtml, formatDate, readText, setButtonLoading, setDocumentMeta, setText, summarizeText } from "../core/dom.js";
import { initSharedMotion, refreshMotion } from "../core/motion.js";
import { initEffects, addRipple } from "../core/effects.js";

class DocsPage {
    constructor() {
        this.indexData = null;
        this.siteText = null;
        this.tagsData = null;
        this.searchData = null;
        this.fuse = null;
        this.currentView = "library";
        this.selectedFolder = null;
        this.selectedSubFolder = null;
        this.selectedTags = new Set();
        this.searchQuery = "";
        this.filterActive = false;
        this.elements = {
            tabs: document.querySelectorAll("[data-view]"),
            sidebar: document.querySelector(".docs-sidebar"),
            folderList: document.getElementById("folderList"),
            documentList: document.getElementById("documentList"),
            docCount: document.getElementById("docCount"),
            docStats: document.getElementById("docStats"),
            updateTime: document.getElementById("updateTime"),
            refreshButton: document.getElementById("refreshDocs"),
            viewLabel: document.getElementById("viewLabel"),
            viewSummary: document.getElementById("viewSummary"),
            backHomeText: document.getElementById("docsBackHomeText"),
            sidebarTitle: document.getElementById("docsSidebarTitle"),
            sidebarDescription: document.getElementById("docsSidebarDescription"),
            tabLibrary: document.getElementById("docsTabLibrary"),
            tabPending: document.getElementById("docsTabPending"),
            tabHistory: document.getElementById("docsTabHistory"),
            categoryTitle: document.getElementById("docsCategoryTitle"),
            loadingCategoryTreeText: document.getElementById("docsLoadingCategoryTreeText"),
            toolbarEyebrow: document.getElementById("docsToolbarEyebrow"),
            updateLabel: document.getElementById("docsUpdateLabel"),
            refreshText: document.getElementById("docsRefreshText"),
            statsTitle: document.getElementById("docsStatsTitle"),
            statsDescription: document.getElementById("docsStatsDescription"),
            currentViewDocsLabel: document.getElementById("docsCurrentViewDocsLabel"),
            loadingStatsText: document.getElementById("docsLoadingStatsText"),
            listTitle: document.getElementById("docsListTitle"),
            listDescription: document.getElementById("docsListDescription"),
            loadingListText: document.getElementById("docsLoadingListText"),
            searchInput: document.getElementById("searchInput"),
            searchClear: document.getElementById("searchClear"),
            tagList: document.getElementById("tagList"),
            tagClear: document.getElementById("tagClear"),
            tagLabel: document.getElementById("docsTagLabel"),
        };
    }

    async init() {
        initSharedMotion();
        initEffects();
        this.hydrateFromUrl();
        this.bindEvents();
        await this.loadAndRender();
    }

    hydrateFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        this.currentView = urlParams.get("view") || "library";
        // folder 为空时默认"全部"（selectedFolder = null）
        const folderFromUrl = urlParams.get("folder");
        const folderFromSession = sessionStorage.getItem("selectedFolder");
        this.selectedFolder = folderFromUrl || folderFromSession || null;
        this.selectedSubFolder = urlParams.get("subfolder") || sessionStorage.getItem("selectedSubFolder") || null;
        const tagsFromUrl = urlParams.get("tags");
        if (tagsFromUrl) {
            this.selectedTags = new Set(tagsFromUrl.split(",").filter(Boolean));
            this.filterActive = this.selectedTags.size > 0;
        }
        const queryFromUrl = urlParams.get("q");
        if (queryFromUrl) {
            this.searchQuery = queryFromUrl;
            this.filterActive = true;
        }
    }

    bindEvents() {
        this.elements.tabs.forEach((tab) => {
            tab.addEventListener("click", () => {
                const nextView = tab.dataset.view;
                if (!nextView || nextView === this.currentView) return;
                this.currentView = nextView;
                this.selectedFolder = null;
                this.selectedSubFolder = null;
                sessionStorage.removeItem("selectedFolder");
                sessionStorage.removeItem("selectedSubFolder");

                // 切换到历史记录或待处理时，清除标签筛选
                if (nextView !== "library") {
                    this.selectedTags.clear();
                    this.filterActive = !!this.searchQuery;
                }

                this.render();
                this.updateUrl();
            });
        });

        this.elements.refreshButton?.addEventListener("click", async () => {
            setButtonLoading(this.elements.refreshButton, true, this.copy("common.button_refreshing"));
            try {
                await this.loadAndRender(true);
            } finally {
                setButtonLoading(this.elements.refreshButton, false);
            }
        });

        this.elements.folderList?.addEventListener("click", (event) => {
            const folderButton = event.target.closest("[data-folder-name]");
            if (folderButton) {
                const folderName = folderButton.dataset.folderName;
                // folderName 为空表示点击"全部"
                this.selectedFolder = folderName || null;
                this.selectedSubFolder = null;
                if (this.selectedFolder) {
                    sessionStorage.setItem("selectedFolder", this.selectedFolder);
                } else {
                    sessionStorage.removeItem("selectedFolder");
                }
                sessionStorage.removeItem("selectedSubFolder");
                this.render();
                this.updateUrl();
                return;
            }

            const subFolderButton = event.target.closest("[data-subfolder-name]");
            if (!subFolderButton) return;
            this.selectedFolder = subFolderButton.dataset.folderName || this.selectedFolder;
            this.selectedSubFolder = subFolderButton.dataset.subfolderName || null;
            sessionStorage.setItem("selectedFolder", this.selectedFolder);
            if (this.selectedSubFolder) {
                sessionStorage.setItem("selectedSubFolder", this.selectedSubFolder);
            } else {
                sessionStorage.removeItem("selectedSubFolder");
            }
            this.render();
            this.updateUrl();
        });

        // 搜索输入
        let searchDebounce = null;
        this.elements.searchInput?.addEventListener("input", () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
                this.searchQuery = this.elements.searchInput.value.trim();
                this.filterActive = !!(this.searchQuery || this.selectedTags.size);
                this.elements.searchClear?.classList.toggle("hidden", !this.searchQuery);
                this.render();
                this.updateUrl();
            }, 250);
        });

        // 搜索清除
        this.elements.searchClear?.addEventListener("click", () => {
            this.searchQuery = "";
            this.elements.searchInput.value = "";
            this.elements.searchClear.classList.add("hidden");
            this.filterActive = this.selectedTags.size > 0;
            this.render();
            this.updateUrl();
            this.elements.searchInput.focus();
        });

        // 标签点击（事件委托）
        this.elements.tagList?.addEventListener("click", (event) => {
            const tagBtn = event.target.closest("[data-tag-name]");
            if (!tagBtn) return;

            const tagName = tagBtn.dataset.tagName;
            if (!tagName) return;

            if (this.selectedTags.has(tagName)) {
                this.selectedTags.delete(tagName);
            } else {
                this.selectedTags.add(tagName);
            }

            // 标签筛选只对正式文档视图生效，自动切换
            if (this.selectedTags.size > 0 && this.currentView !== "library") {
                this.currentView = "library";
            }

            this.filterActive = !!(this.searchQuery || this.selectedTags.size);
            this.render();
            this.updateUrl();
        });

        // 清除标签筛选
        this.elements.tagClear?.addEventListener("click", () => {
            this.selectedTags.clear();
            this.filterActive = !!this.searchQuery;
            this.render();
            this.updateUrl();
        });
    }

    async loadAndRender(forceRefresh = false) {
        try {
            const fetchJson = (url) =>
                fetch(url, { cache: "no-store" }).then((r) => {
                    if (!r.ok) throw new Error(`请求失败: ${r.status}`);
                    return r.json();
                });

            const [indexData, siteText, tagsData, searchData] = await Promise.all([
                loadIndexData(forceRefresh),
                loadSiteText(forceRefresh).catch(() => null),
                fetchJson("./tags.json").catch(() => null),
                fetchJson("./search_index.json").catch(() => null),
            ]);
            this.indexData = indexData;
            this.siteText = siteText;
            this.tagsData = tagsData;
            this.searchData = searchData;

            try {
                this.initFuse();
            } catch (e) {
                console.warn("Fuse.js 初始化失败:", e);
            }

            this.render();
        } catch (error) {
            this.renderError(error);
        }
    }

    initFuse() {
        if (!this.searchData?.documents?.length) return;
        if (typeof Fuse === "undefined" && typeof window.Fuse === "undefined") {
            console.warn("Fuse.js 未加载，搜索将降级为标题过滤");
            return;
        }
        const FuseConstructor = typeof Fuse !== "undefined" ? Fuse : window.Fuse;
        this.fuse = new FuseConstructor(this.searchData.documents, {
            keys: [
                { name: "title", weight: 0.5 },
                { name: "headings", weight: 0.5 },
            ],
            threshold: 0.4,
            includeScore: true,
            minMatchCharLength: 1,
        });
    }

    render() {
        this.renderCopy();
        this.renderTabs();
        this.renderSidebar();
        this.renderTags();
        this.renderStats();
        if (this.filterActive) {
            this.renderFilteredResults();
        } else {
            this.renderDocuments();
        }
        this.renderUpdatedTime();
        refreshMotion();
    }

    copy(path, fallback = "") {
        return readText(this.siteText, path, fallback);
    }

    renderCopy() {
        setDocumentMeta(this.copy("docs.page_title"), this.copy("docs.meta_description"));
        setText(this.elements.backHomeText, this.copy("docs.back_home"));
        setText(this.elements.sidebarTitle, this.copy("docs.sidebar_title"), { hideIfEmpty: false });
        setText(this.elements.sidebarDescription, this.copy("docs.sidebar_description"));
        setText(this.elements.tabLibrary, this.copy("docs.tab_library"), { hideIfEmpty: false });
        setText(this.elements.tabPending, this.copy("docs.tab_pending"), { hideIfEmpty: false });
        setText(this.elements.tabHistory, this.copy("docs.tab_history"), { hideIfEmpty: false });
        setText(this.elements.categoryTitle, this.copy("docs.category_title"), { hideIfEmpty: false });
        setText(this.elements.loadingCategoryTreeText, this.copy("common.loading_category_tree"));
        setText(this.elements.toolbarEyebrow, this.copy("docs.toolbar_eyebrow"));
        setText(this.elements.updateLabel, this.copy("docs.toolbar_update_label"));
        setText(this.elements.refreshText, this.copy("common.button_refresh"));
        setText(this.elements.statsTitle, this.copy("docs.stats_title"), { hideIfEmpty: false });
        setText(this.elements.statsDescription, this.copy("docs.stats_description"));
        setText(this.elements.currentViewDocsLabel, this.copy("docs.current_view_docs_label"));
        setText(this.elements.loadingStatsText, this.copy("common.loading_stats"));
        setText(this.elements.listTitle, this.copy("docs.list_title"), { hideIfEmpty: false });
        setText(this.elements.listDescription, this.copy("docs.list_description"));
        setText(this.elements.loadingListText, this.copy("common.loading_document_list"));
        setText(this.elements.tagLabel, this.copy("docs.tag_filter_label"), { hideIfEmpty: false });
        setText(this.elements.tagClear, this.copy("docs.tag_clear"));
        if (this.elements.searchInput) {
            this.elements.searchInput.placeholder = this.copy("docs.search_placeholder");
        }

        // 回填搜索框的值
        if (this.elements.searchInput && this.searchQuery) {
            this.elements.searchInput.value = this.searchQuery;
            this.elements.searchClear?.classList.remove("hidden");
        }
    }

    renderTabs() {
        this.elements.tabs.forEach((tab) => {
            tab.classList.toggle("is-active", tab.dataset.view === this.currentView);
        });

        // 待处理和历史记录视图隐藏分类列表
        const showCategories = this.currentView === "library";
        const folderList = this.elements.folderList;
        if (folderList) {
            // 隐藏分类标题
            const categoryHeading = folderList.previousElementSibling;
            // 隐藏分割线
            const divider = categoryHeading?.previousElementSibling;
            
            folderList.classList.toggle("hidden", !showCategories);
            categoryHeading?.classList.toggle("hidden", !showCategories);
            divider?.classList.toggle("hidden", !showCategories);
        }
    }

    renderSidebar() {
        const categories = getViewScopedCategories(this.indexData, this.currentView);
        if (!categories.length) {
            this.elements.folderList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-layer-group"></i>
                    <p>${escapeHtml(this.copy("docs.empty_categories"))}</p>
                </div>
            `;
            return;
        }

        // "全部"选项：selectedFolder 为空时表示全部
        const isAllSelected = !this.selectedFolder;

        // 计算全部文档数
        const totalDocs = categories.reduce((sum, cat) => sum + countDocuments(cat), 0);

        let html = `
            <article class="sidebar-item reveal stagger-1 ${isAllSelected ? "is-active" : ""}">
                <button type="button" class="sidebar-item__title" data-folder-name="">
                    <span><i class="fas ${isAllSelected ? "fa-layer-group" : "fa-layers"}"></i> 全部</span>
                    <span class="sidebar-item__count">${totalDocs}</span>
                </button>
            </article>
        `;

        html += categories
            .map((category, index) => {
                const isActive = category.name === this.selectedFolder;
                const subDirectories = (category.children ?? []).filter((child) => child.type === "directory");
                return `
                    <article class="sidebar-item reveal stagger-${((index + 1) % 4) + 1} ${isActive ? "is-active" : ""}">
                        <button type="button" class="sidebar-item__title" data-folder-name="${escapeHtml(category.name)}">
                            <span><i class="fas ${isActive ? "fa-folder-open" : "fa-folder"}"></i> ${escapeHtml(category.name)}</span>
                            <span class="sidebar-item__count">${countDocuments(category)}</span>
                        </button>
                        ${
                            isActive && subDirectories.length
                                ? `<div class="sidebar-sublist">
                                    <button type="button" class="sidebar-subitem ${!this.selectedSubFolder ? "is-active" : ""}" data-folder-name="${escapeHtml(category.name)}" data-subfolder-name="">
                                        <span><i class="fas fa-grid-2"></i> ${escapeHtml(this.copy("common.all_label"))}</span>
                                        <span>${countDocuments(category)}</span>
                                    </button>
                                    ${subDirectories
                                        .map(
                                            (child) => `
                                                <button type="button" class="sidebar-subitem ${this.selectedSubFolder === child.name ? "is-active" : ""}" data-folder-name="${escapeHtml(category.name)}" data-subfolder-name="${escapeHtml(child.name)}">
                                                    <span><i class="fas fa-folder-tree"></i> ${escapeHtml(child.name)}</span>
                                                    <span>${countDocuments(child)}</span>
                                                </button>
                                            `,
                                        )
                                        .join("")}
                                </div>`
                                : ""
                        }
                    </article>
                `;
            })
            .join("");

        this.elements.folderList.innerHTML = html;
    }

    renderTags() {
        const tagsList = this.tagsData?.tags ?? [];
        if (!tagsList.length) {
            this.elements.tagList.innerHTML = `<div class="empty-state"><p>暂无标签</p></div>`;
            return;
        }

        // 按标签名排序（不按数量），同扫描顺序
        this.elements.tagList.innerHTML = tagsList
            .map((tag, index) => {
                const isSelected = this.selectedTags.has(tag.name);
                return `<button type="button" class="tag-pill tag-pill--float ${isSelected ? "is-selected" : ""}" data-tag-name="${escapeHtml(tag.name)}">
                    <span class="tag-pill__name">${escapeHtml(tag.name)}</span>
                    <span class="tag-pill__count">${tag.count}</span>
                </button>`;
            })
            .join("");

        this.elements.tagClear?.classList.toggle("hidden", this.selectedTags.size === 0);
    }

    renderStats() {
        const stats = getStats(this.indexData);
        const scopedCategories = getViewScopedCategories(this.indexData, this.currentView);
        const allScopedDocs = scopedCategories.flatMap((category) => collectDocuments(category));
        const headingMap = {
            library: {
                label: this.copy("docs.view_library_label"),
                summary: this.copy("docs.view_library_summary"),
            },
            pending: {
                label: this.copy("docs.view_pending_label"),
                summary: this.copy("docs.view_pending_summary"),
            },
            history: {
                label: this.copy("docs.view_history_label"),
                summary: this.copy("docs.view_history_summary"),
            },
        };
        const currentHeading = headingMap[this.currentView] ?? headingMap.library;

        this.elements.viewLabel.textContent = currentHeading.label;

        if (this.filterActive) {
            // 搜索/标签筛选模式下显示匹配数量
            const filtered = this.getFilteredDocs();
            const categoryName = this.selectedFolder || "全部";
            this.elements.viewSummary.textContent = `${categoryName} · ${this.copy("docs.search_results_label")} (${filtered.length})`;
            this.elements.docCount.textContent = String(filtered.length);

            this.elements.docStats.innerHTML = `
                <div class="stats-grid">
                    <article class="stat-card">
                        <span class="stat-card__value">${filtered.length}</span>
                        <span class="stat-card__label">${escapeHtml(this.copy("docs.stats_card_view_docs_label"))}</span>
                        <span class="stat-card__meta">${this.searchQuery ? escapeHtml(`搜索: "${this.searchQuery}"`) : ""}</span>
                    </article>
                    <article class="stat-card">
                        <span class="stat-card__value">${this.selectedTags.size}</span>
                        <span class="stat-card__label">${escapeHtml(this.copy("docs.stats_card_tags_label"))}</span>
                        <span class="stat-card__meta">${this.selectedTags.size ? escapeHtml(`已选 ${this.selectedTags.size} 个标签`) : ""}</span>
                    </article>
                    <article class="stat-card">
                        <span class="stat-card__value">${(stats.total_words / 1000).toFixed(1)}K</span>
                        <span class="stat-card__label">${escapeHtml(this.copy("docs.stats_card_total_words_label"))}</span>
                        <span class="stat-card__meta">${escapeHtml(this.copy("docs.stats_card_total_words_meta"))}</span>
                    </article>
                </div>
            `;
        } else {
            this.elements.viewSummary.textContent = currentHeading.summary;
            this.elements.docCount.textContent = String(allScopedDocs.length);

            this.elements.docStats.innerHTML = `
                <div class="stats-grid">
                    <article class="stat-card">
                        <span class="stat-card__value">${allScopedDocs.length}</span>
                        <span class="stat-card__label">${escapeHtml(this.copy("docs.stats_card_view_docs_label"))}</span>
                        <span class="stat-card__meta">${escapeHtml(this.copy("docs.stats_card_view_docs_meta"))}</span>
                    </article>
                    <article class="stat-card">
                        <span class="stat-card__value">${scopedCategories.length}</span>
                        <span class="stat-card__label">${escapeHtml(this.copy("docs.stats_card_view_categories_label"))}</span>
                        <span class="stat-card__meta">${escapeHtml(this.copy("docs.stats_card_view_categories_meta"))}</span>
                    </article>
                    <article class="stat-card">
                        <span class="stat-card__value">${(stats.total_words / 1000).toFixed(1)}K</span>
                        <span class="stat-card__label">${escapeHtml(this.copy("docs.stats_card_total_words_label"))}</span>
                        <span class="stat-card__meta">${escapeHtml(this.copy("docs.stats_card_total_words_meta"))}</span>
                    </article>
                </div>
            `;
        }

        // 数字递增动画
        this.elements.docStats.querySelectorAll(".stat-card__value").forEach((el) => {
            const target = parseInt(el.textContent, 10);
            if (Number.isNaN(target) || target < 10) return;
            el.textContent = "0";
            const duration = Math.min(600 + target * 6, 1000);
            const startTime = performance.now();
            const frame = (now) => {
                const t = Math.min((now - startTime) / duration, 1);
                const eased = 1 - Math.pow(1 - t, 3);
                el.textContent = Math.round(eased * target);
                if (t < 1) requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        });
    }

    /** 获取当前分类下的文档（用于标签/搜索筛选） */
    getCurrentCategoryDocs() {
        const categories = getViewScopedCategories(this.indexData, this.currentView);

        // 未选分类 = 全部
        if (!this.selectedFolder) {
            return categories.flatMap((category) => {
                const docs = collectDocuments(category);
                return docs.filter((doc) => doc.type === "file");
            });
        }

        // 选中了具体分类
        const category = findCategory(this.indexData, this.selectedFolder);
        if (!category) return [];

        let target = category;
        if (this.selectedSubFolder) {
            const subDirectory = (category.children ?? []).find(
                (child) => child.type === "directory" && child.name === this.selectedSubFolder,
            );
            if (subDirectory) target = subDirectory;
        }

        return collectDocuments(target).filter((doc) => doc.type === "file");
    }

    /** 根据当前筛选条件（搜索+标签）获取匹配文档 */
    getFilteredDocs() {
        let docs = this.getCurrentCategoryDocs();

        const dateSorter = (left, right) => {
            const leftDate = left.updated || left.date || "";
            const rightDate = right.updated || right.date || "";
            return String(rightDate).localeCompare(String(leftDate));
        };

        // 标签筛选（取交集）
        if (this.selectedTags.size > 0) {
            docs = docs.filter((doc) => {
                const docTags = doc.tags ?? [];
                return [...this.selectedTags].every((tag) => docTags.includes(tag));
            });
        }

        // 搜索筛选 + 按相关度排序
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            if (this.fuse) {
                try {
                    const fuseResults = this.fuse.search(this.searchQuery);
                    // 构建 full_path → score 映射（score 越低越相关）
                    const scoreMap = new Map();
                    for (const r of fuseResults) {
                        scoreMap.set(r.item.full_path, r.score);
                    }
                    // 过滤 + 按相关度排序
                    docs = docs
                        .filter((doc) => scoreMap.has(doc.full_path))
                        .sort((a, b) => {
                            const sa = scoreMap.get(a.full_path) ?? 1;
                            const sb = scoreMap.get(b.full_path) ?? 1;
                            return sa - sb; // 低分优先（更相关）
                        });
                } catch (e) {
                    // Fuse 搜索失败，降级为标题包含 + 日期排序
                    docs = docs
                        .filter((doc) =>
                            (doc.title || "").toLowerCase().includes(q)
                        )
                        .sort(dateSorter);
                }
            } else {
                // 无 Fuse，简单按标题过滤 + 日期排序
                docs = docs
                    .filter((doc) =>
                        (doc.title || "").toLowerCase().includes(q)
                    )
                    .sort(dateSorter);
            }
            return docs;
        }

        // 无搜索时按日期排序
        return docs.sort(dateSorter);
    }

    renderFilteredResults() {
        const filtered = this.getFilteredDocs();

        if (!filtered.length) {
            this.elements.documentList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>${escapeHtml(this.copy("docs.search_empty"))}</p>
                </div>
            `;
            return;
        }

        this.elements.documentList.innerHTML = `
            <div class="document-stack">
                ${filtered
                    .map((doc, index) => {
                        const tags = (doc.tags ?? []).slice(0, 3);
                        const summary = summarizeText(doc.summary || doc.title || doc.name, 96);
                        const priorityBadge = this.resolvePriorityBadge(doc.priority);
                        const statusBadge = this.resolveStatusBadge(doc.status);
                        return `
                            <a class="doc-item reveal stagger-${(index % 4) + 1}" data-tilt href="./doc/${encodeURIComponent(doc.slug)}">
                                <div class="doc-item__header">
                                    <h3 class="doc-item__title">${escapeHtml(doc.title || doc.name)}</h3>
                                    <div class="meta-row">
                                        ${statusBadge}
                                        ${priorityBadge}
                                    </div>
                                </div>
                                <p class="doc-item__summary">${escapeHtml(summary || this.copy("docs.summary_missing"))}</p>
                                <div class="doc-item__footer">
                                    <div class="doc-item__meta">
                                        ${doc.updated || doc.date ? `<span class="meta-pill"><i class="fas fa-calendar"></i>${escapeHtml(doc.updated || doc.date)}</span>` : ""}
                                        <span class="meta-pill"><i class="fas fa-file-lines"></i>${doc.word_count ?? 0} ${escapeHtml(this.copy("common.word_unit"))}</span>
                                        ${tags.map((tag) => `<span class="tag ${this.selectedTags.has(tag) ? "tag--matched" : ""}">${escapeHtml(tag)}</span>`).join("")}
                                    </div>
                                    <span class="meta-pill"><i class="fas fa-arrow-right"></i>${escapeHtml(this.copy("docs.read_document"))}</span>
                                </div>
                            </a>
                        `;
                    })
                    .join("")}
            </div>
        `;
    }

    renderDocuments() {
        let documents = [];

        if (!this.selectedFolder) {
            // "全部"：显示所有分类的文档
            const categories = getViewScopedCategories(this.indexData, this.currentView);
            documents = categories.flatMap((category) => collectDocuments(category));
        } else {
            const category = findCategory(this.indexData, this.selectedFolder);
            if (category) {
                if (this.selectedSubFolder) {
                    const subDirectory = (category.children ?? []).find(
                        (child) => child.type === "directory" && child.name === this.selectedSubFolder,
                    );
                    documents = collectDocuments(subDirectory);
                } else {
                    documents = collectDocuments(category);
                }
            }
        }

        documents = documents
            .filter((doc) => doc.type === "file")
            .sort((left, right) => {
                const leftDate = left.updated || left.date || "";
                const rightDate = right.updated || right.date || "";
                return String(rightDate).localeCompare(String(leftDate));
            });

        if (!documents.length) {
            this.elements.documentList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-circle-xmark"></i>
                    <p>${escapeHtml(this.copy("docs.list_empty"))}</p>
                </div>
            `;
            return;
        }

        this.elements.documentList.innerHTML = `
            <div class="document-stack">
                ${documents
                    .map((doc, index) => {
                        const tags = (doc.tags ?? []).slice(0, 3);
                        const summary = summarizeText(doc.summary || doc.title || doc.name, 96);
                        const priorityBadge = this.resolvePriorityBadge(doc.priority);
                        const statusBadge = this.resolveStatusBadge(doc.status);
                        return `
                            <a class="doc-item reveal stagger-${(index % 4) + 1}" data-tilt href="./doc/${encodeURIComponent(doc.slug)}">
                                <div class="doc-item__header">
                                    <h3 class="doc-item__title">${escapeHtml(doc.title || doc.name)}</h3>
                                    <div class="meta-row">
                                        ${statusBadge}
                                        ${priorityBadge}
                                    </div>
                                </div>
                                <p class="doc-item__summary">${escapeHtml(summary || this.copy("docs.summary_missing"))}</p>
                                <div class="doc-item__footer">
                                    <div class="doc-item__meta">
                                        ${doc.updated || doc.date ? `<span class="meta-pill"><i class="fas fa-calendar"></i>${escapeHtml(doc.updated || doc.date)}</span>` : ""}
                                        <span class="meta-pill"><i class="fas fa-file-lines"></i>${doc.word_count ?? 0} ${escapeHtml(this.copy("common.word_unit"))}</span>
                                        ${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
                                    </div>
                                    <span class="meta-pill"><i class="fas fa-arrow-right"></i>${escapeHtml(this.copy("docs.read_document"))}</span>
                                </div>
                            </a>
                        `;
                    })
                    .join("")}
            </div>
        `;
    }

    resolvePriorityBadge(priority) {
        const normalized = String(priority || "").trim();
        if (normalized === "高") {
            return `<span class="status-badge status-badge--danger"><i class="fas fa-bolt"></i>${escapeHtml(this.copy("docs.priority_high"))}</span>`;
        }
        if (normalized === "低") {
            return `<span class="status-badge status-badge--success"><i class="fas fa-feather-pointed"></i>${escapeHtml(this.copy("docs.priority_low"))}</span>`;
        }
        return `<span class="status-badge status-badge--neutral"><i class="fas fa-gauge"></i>${escapeHtml(normalized || this.copy("docs.priority_medium"))}</span>`;
    }

    resolveStatusBadge(status) {
        const normalized = String(status || "").trim();
        if (!normalized) {
            return "";
        }
        if (/(完成|已归档|done|complete)/i.test(normalized)) {
            return `<span class="status-badge status-badge--success"><i class="fas fa-circle-check"></i>${escapeHtml(normalized)}</span>`;
        }
        if (/(待|进行|讨论|draft|todo)/i.test(normalized)) {
            return `<span class="status-badge status-badge--warning"><i class="fas fa-hourglass-half"></i>${escapeHtml(normalized)}</span>`;
        }
        return `<span class="status-badge status-badge--neutral"><i class="fas fa-circle-dot"></i>${escapeHtml(normalized)}</span>`;
    }

    renderUpdatedTime() {
        this.elements.updateTime.textContent = formatDate(this.indexData?.generated_at) || "--";
    }

    updateUrl() {
        const params = new URLSearchParams();
        if (this.currentView !== "library") params.set("view", this.currentView);
        if (this.selectedFolder) params.set("folder", this.selectedFolder);
        if (this.selectedSubFolder) params.set("subfolder", this.selectedSubFolder);
        if (this.selectedTags.size > 0) params.set("tags", [...this.selectedTags].join(","));
        if (this.searchQuery) params.set("q", this.searchQuery);
        const next = params.toString() ? `?${params.toString()}` : window.location.pathname;
        history.replaceState({}, "", next);
    }

    renderError(error) {
        const message = error instanceof Error ? error.message : this.copy("common.error_unknown");
        const html = `
            <div class="empty-state">
                <i class="fas fa-triangle-exclamation"></i>
                <p>${escapeHtml(`${this.copy("docs.error_prefix")}${message}`)}</p>
            </div>
        `;
        this.elements.folderList.innerHTML = html;
        this.elements.documentList.innerHTML = html;
        this.elements.docStats.innerHTML = html;
    }
}

const page = new DocsPage();
page.init();
