import {
    countDocuments,
    findCategory,
    getStats,
    getVisibleLibraryCategories,
    loadIndexData,
    loadSiteText,
    loadUserInfo,
} from "../core/data-service.js";
import {
    escapeHtml,
    formatDate,
    interpolate,
    readText,
    setButtonLoading,
    setDocumentMeta,
    setText,
    summarizeText,
} from "../core/dom.js";
import { initSharedMotion, refreshMotion } from "../core/motion.js";
import { initEffects, animateCounter, typewriterEffect, initTagFloat } from "../core/effects.js";

class HomePage {
    constructor() {
        this.indexData = null;
        this.userInfo = null;
        this.siteText = null;
        this.elements = {
            userInfoGrid: document.getElementById("userInfoGrid"),
            folderGrid: document.getElementById("folderGrid"),
            pendingList: document.getElementById("pendingList"),
            historyList: document.getElementById("historyList"),
            heroStats: document.getElementById("heroStats"),
            updatedAt: document.getElementById("updatedAt"),
            footerUpdatedAt: document.getElementById("footerUpdatedAt"),
            refreshButton: document.getElementById("refreshHome"),
            eyebrow: document.getElementById("homeEyebrow"),
            eyebrowText: document.getElementById("homeEyebrowText"),
            heroTitle: document.getElementById("homeHeroTitle"),
            heroCopy: document.getElementById("homeHeroCopy"),
            primaryCtaText: document.getElementById("homePrimaryCtaText"),
            refreshText: document.getElementById("homeRefreshText"),
            loadingIndexText: document.getElementById("homeLoadingIndexText"),
            profileTitle: document.getElementById("homeProfileTitle"),
            profileDescription: document.getElementById("homeProfileDescription"),
            profileTimeLabel: document.getElementById("homeProfileTimeLabel"),
            loadingProfileText: document.getElementById("homeLoadingProfileText"),
            libraryTitle: document.getElementById("homeLibraryTitle"),
            libraryDescription: document.getElementById("homeLibraryDescription"),
            libraryCta: document.getElementById("homeLibraryCta"),
            loadingCategoriesText: document.getElementById("homeLoadingCategoriesText"),
            recordsTitle: document.getElementById("homeRecordsTitle"),
            recordsDescription: document.getElementById("homeRecordsDescription"),
            pendingTitle: document.getElementById("homePendingTitle"),
            pendingCta: document.getElementById("homePendingCta"),
            loadingPendingText: document.getElementById("homeLoadingPendingText"),
            historyTitle: document.getElementById("homeHistoryTitle"),
            historyCta: document.getElementById("homeHistoryCta"),
            loadingHistoryText: document.getElementById("homeLoadingHistoryText"),
            footerBrand: document.getElementById("homeFooterBrand"),
            footerUpdatedLabel: document.getElementById("homeFooterUpdatedLabel"),
            footerDocsLink: document.getElementById("homeFooterDocsLink"),
        };
    }

    async init() {
        initSharedMotion();
        initEffects();
        this.bindEvents();
        await this.loadAndRender();
    }

    bindEvents() {
        this.elements.refreshButton?.addEventListener("click", async () => {
            setButtonLoading(this.elements.refreshButton, true, this.copy("common.button_syncing"));
            try {
                await this.loadAndRender(true);
            } finally {
                setButtonLoading(this.elements.refreshButton, false);
            }
        });
    }

    async loadAndRender(forceRefresh = false) {
        try {
            const [indexData, userInfo, siteText] = await Promise.all([
                loadIndexData(forceRefresh),
                loadUserInfo(forceRefresh).catch(() => null),
                loadSiteText(forceRefresh).catch(() => null),
            ]);

            this.indexData = indexData;
            this.userInfo = userInfo;
            this.siteText = siteText;
            this.render();
        } catch (error) {
            this.renderError(error);
        }
    }

    render() {
        this.renderCopy();
        this.renderStats();
        this.renderUserInfo();
        this.renderFolders();
        this.renderRecords();
        this.renderUpdateTime();
        refreshMotion();
    }

    copy(path, fallback = "") {
        return readText(this.siteText, path, fallback);
    }

    renderCopy() {
        setDocumentMeta(this.copy("home.page_title"), this.copy("home.meta_description"));
        setText(this.elements.eyebrowText, this.copy("home.hero_eyebrow"));
        this.elements.eyebrow?.classList.toggle("hidden", !this.copy("home.hero_eyebrow"));
        
        // 打字机效果：首次加载时标题逐字显示
        const heroTitle = this.copy("home.hero_title");
        if (heroTitle && !this.elements.heroTitle.dataset.typed) {
            this.elements.heroTitle.dataset.typed = "true";
            typewriterEffect(this.elements.heroTitle, heroTitle, 60);
        } else {
            setText(this.elements.heroTitle, heroTitle, { hideIfEmpty: false });
        }
        
        setText(this.elements.heroCopy, this.copy("home.hero_copy"));
        setText(this.elements.primaryCtaText, this.copy("home.primary_cta"));
        setText(this.elements.refreshText, this.copy("common.button_refresh"));
        setText(this.elements.loadingIndexText, this.copy("common.loading_index"));
        setText(this.elements.profileTitle, this.copy("home.profile_title"), { hideIfEmpty: false });
        setText(this.elements.profileDescription, this.copy("home.profile_description"));
        setText(this.elements.profileTimeLabel, this.copy("home.profile_time_label"));
        setText(this.elements.loadingProfileText, this.copy("common.loading_profile"));
        setText(this.elements.libraryTitle, this.copy("home.library_title"), { hideIfEmpty: false });
        setText(this.elements.libraryDescription, this.copy("home.library_description"));
        setText(this.elements.libraryCta, this.copy("home.library_cta"));
        setText(this.elements.loadingCategoriesText, this.copy("common.loading_categories"));
        setText(this.elements.recordsTitle, this.copy("home.records_title"), { hideIfEmpty: false });
        setText(this.elements.recordsDescription, this.copy("home.records_description"));
        setText(this.elements.pendingTitle, this.copy("home.pending_title"), { hideIfEmpty: false });
        setText(this.elements.pendingCta, this.copy("home.pending_cta"));
        setText(this.elements.loadingPendingText, this.copy("common.loading_pending"));
        setText(this.elements.historyTitle, this.copy("home.history_title"), { hideIfEmpty: false });
        setText(this.elements.historyCta, this.copy("home.history_cta"));
        setText(this.elements.loadingHistoryText, this.copy("common.loading_history"));
        setText(this.elements.footerBrand, this.copy("home.footer_brand"), { hideIfEmpty: false });
        setText(this.elements.footerUpdatedLabel, this.copy("home.footer_updated_label"));
        setText(this.elements.footerDocsLink, this.copy("home.footer_link_docs"));
    }

    renderStats() {
        const stats = getStats(this.indexData);
        const visibleCategories = getVisibleLibraryCategories(this.indexData);
        const pendingCategory = findCategory(this.indexData, "日常记录");
        const historyCategory = findCategory(this.indexData, "历史记录");

        this.elements.heroStats.innerHTML = `
            <article class="home-hero__panel reveal stagger-1">
                <div class="stat-card__value">${stats.total_documents}</div>
                <div class="stat-card__label">${escapeHtml(this.copy("home.stats_documents_label"))}</div>
                <div class="stat-card__meta">${escapeHtml(this.copy("home.stats_documents_meta"))}</div>
            </article>
            <article class="home-hero__panel reveal stagger-2">
                <div class="stat-card__value">${visibleCategories.length}</div>
                <div class="stat-card__label">${escapeHtml(this.copy("home.stats_categories_label"))}</div>
                <div class="stat-card__meta">${escapeHtml(this.copy("home.stats_categories_meta"))}</div>
            </article>
            <article class="home-hero__panel reveal stagger-3">
                <div class="stat-card__value">${countDocuments(pendingCategory)}</div>
                <div class="stat-card__label">${escapeHtml(this.copy("home.stats_pending_label"))}</div>
                <div class="stat-card__meta">${escapeHtml(this.copy("home.stats_pending_meta"))}</div>
            </article>
            <article class="home-hero__panel reveal stagger-4">
                <div class="stat-card__value">${countDocuments(historyCategory)}</div>
                <div class="stat-card__label">${escapeHtml(this.copy("home.stats_history_label"))}</div>
                <div class="stat-card__meta">${escapeHtml(this.copy("home.stats_history_meta"))}</div>
            </article>
        `;

        // 数字递增动画
        this.elements.heroStats.querySelectorAll(".stat-card__value").forEach((el) => {
            const target = parseInt(el.textContent, 10);
            if (Number.isNaN(target) || target < 10) return; // 太小不动画
            el.textContent = "0";
            const duration = Math.min(600 + target * 8, 1500);
            const startTime = performance.now();
            const frame = (now) => {
                const t = Math.min((now - startTime) / duration, 1);
                // easeOutCubic
                const eased = 1 - Math.pow(1 - t, 3);
                el.textContent = Math.round(eased * target);
                if (t < 1) requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        });
    }

    renderUserInfo() {
        if (!this.userInfo?.info_blocks?.length) {
            this.elements.userInfoGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-slash"></i>
                    <p>${escapeHtml(this.copy("home.profile_missing"))}</p>
                </div>
            `;
            return;
        }

        const colorClassByName = {
            blue: "var(--brand-cool)",
            purple: "#7c3aed",
            pink: "#db2777",
            red: "#dc2626",
            green: "var(--success)",
            yellow: "#ca8a04",
            indigo: "#4f46e5",
            gray: "#64748b",
            orange: "var(--brand-warm)",
            cyan: "#0891b2",
            teal: "var(--brand)",
        };

        const blocks = [...this.userInfo.info_blocks].sort((left, right) => left.order - right.order);
        this.elements.userInfoGrid.innerHTML = blocks
            .map(
                (block, index) => `
                    <article class="info-tile reveal stagger-${(index % 4) + 1}" data-tilt data-tilt-lift="0">
                        <div class="info-tile__header">
                            <div class="tile-icon" style="color:${colorClassByName[block.color] ?? "var(--brand)"}">
                                <i class="fas fa-${escapeHtml(block.icon || "circle")}"></i>
                            </div>
                        </div>
                        <span class="tile-label">${escapeHtml(block.title)}</span>
                        <div class="tile-value">${escapeHtml(block.content)}</div>
                    </article>
                `,
            )
            .join("");
    }

    renderFolders() {
        const categories = getVisibleLibraryCategories(this.indexData);
        if (!categories.length) {
            this.elements.folderGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <p>${escapeHtml(this.copy("home.library_empty"))}</p>
                </div>
            `;
            return;
        }

        this.elements.folderGrid.innerHTML = categories
            .map(
                (category, index) => `
                    <a class="folder-card reveal stagger-${(index % 4) + 1}" data-tilt data-tilt-lift="0" href="./docs.html?view=library&folder=${encodeURIComponent(category.name)}">
                        <div class="folder-card__icon">
                            <i class="fas fa-folder-tree"></i>
                        </div>
                        <div class="folder-card__title">${escapeHtml(category.name)}</div>
                        <p class="muted-text">${escapeHtml(interpolate(this.copy("home.folder_card_description"), { count: countDocuments(category) }))}</p>
                        <div class="folder-card__meta">
                            <span>${escapeHtml(this.copy("home.folder_card_action"))}</span>
                            <span class="folder-card__arrow"><i class="fas fa-arrow-right"></i></span>
                        </div>
                    </a>
                `,
            )
            .join("");
    }

    renderRecords() {
        this.renderRecordColumn("日常记录", this.elements.pendingList, this.copy("home.pending_empty"), "clock", "pending");
        this.renderRecordColumn("历史记录", this.elements.historyList, this.copy("home.history_empty"), "box-archive", "history");
    }

    renderRecordColumn(categoryName, container, emptyLabel, iconName, mode) {
        const category = findCategory(this.indexData, categoryName);
        const documents = (category?.children ?? [])
            .filter((child) => child.type === "file")
            .sort((left, right) => String(right.updated || right.date).localeCompare(String(left.updated || left.date)))
            .slice(0, 5);

        if (!documents.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-${iconName}"></i>
                    <p>${emptyLabel}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = documents
            .map((document, index) => {
                const tags = (document.tags ?? []).slice(0, 2);
                return `
                    <a class="record-card reveal stagger-${(index % 4) + 1}" data-tilt href="./doc.html?path=${encodeURIComponent(document.full_path)}">
                        <div class="record-card__header">
                            <strong class="record-card__title">${escapeHtml(document.title || document.name)}</strong>
                            <span class="status-badge ${mode === "history" ? "status-badge--success" : "status-badge--warning"}">
                                <i class="fas fa-${mode === "history" ? "box-archive" : "sparkles"}"></i>
                                ${escapeHtml(mode === "history" ? this.copy("home.history_badge") : this.copy("home.pending_badge"))}
                            </span>
                        </div>
                        <p class="record-card__summary">${escapeHtml(summarizeText(document.title || document.name, 72))}</p>
                        <div class="record-card__footer">
                            <div class="meta-row">
                                ${document.updated || document.date ? `<span class="meta-pill"><i class="fas fa-calendar"></i>${escapeHtml(document.updated || document.date)}</span>` : ""}
                                ${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
                            </div>
                        </div>
                    </a>
                `;
            })
            .join("");
    }

    renderUpdateTime() {
        const generatedAt = this.indexData?.generated_at;
        const formatted = generatedAt ? formatDate(generatedAt) : "--";
        this.elements.updatedAt.textContent = formatted;
        this.elements.footerUpdatedAt.textContent = formatted;
    }

    renderError(error) {
        const message = error instanceof Error ? error.message : this.copy("common.error_unknown");
        const html = `
            <div class="empty-state">
                <i class="fas fa-triangle-exclamation"></i>
                <p>${escapeHtml(message)}</p>
            </div>
        `;
        this.elements.heroStats.innerHTML = html;
        this.elements.userInfoGrid.innerHTML = html;
        this.elements.folderGrid.innerHTML = html;
        this.elements.pendingList.innerHTML = html;
        this.elements.historyList.innerHTML = html;
    }
}

const page = new HomePage();
page.init();
