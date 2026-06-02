const indexCache = {
    promise: null,
    value: null,
};

const userInfoCache = {
    promise: null,
    value: null,
};

const siteTextCache = {
    promise: null,
    value: null,
};

const tagsCache = {
    promise: null,
    value: null,
};

const searchCache = {
    promise: null,
    value: null,
};

async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
    }
    return response.json();
}

export async function loadIndexData(forceRefresh = false) {
    if (forceRefresh) {
        indexCache.promise = null;
        indexCache.value = null;
    }

    if (indexCache.value) {
        return indexCache.value;
    }

    if (!indexCache.promise) {
        indexCache.promise = fetchJson("./index.json").then((data) => {
            indexCache.value = data;
            return data;
        });
    }

    return indexCache.promise;
}

export async function loadUserInfo(forceRefresh = false) {
    if (forceRefresh) {
        userInfoCache.promise = null;
        userInfoCache.value = null;
    }

    if (userInfoCache.value) {
        return userInfoCache.value;
    }

    if (!userInfoCache.promise) {
        userInfoCache.promise = fetchJson("./config/user-info.json").then((data) => {
            userInfoCache.value = data;
            return data;
        });
    }

    return userInfoCache.promise;
}

export async function loadSiteText(forceRefresh = false) {
    if (forceRefresh) {
        siteTextCache.promise = null;
        siteTextCache.value = null;
    }

    if (siteTextCache.value) {
        return siteTextCache.value;
    }

    if (!siteTextCache.promise) {
        siteTextCache.promise = fetchJson("./config/site-text.json").then((data) => {
            siteTextCache.value = data;
            return data;
        });
    }

    return siteTextCache.promise;
}

export async function loadTagsData(forceRefresh = false) {
    if (forceRefresh) {
        tagsCache.promise = null;
        tagsCache.value = null;
    }

    if (tagsCache.value) {
        return tagsCache.value;
    }

    if (!tagsCache.promise) {
        tagsCache.promise = fetchJson("./tags.json").then((data) => {
            tagsCache.value = data;
            return data;
        });
    }

    return tagsCache.promise;
}

export async function loadSearchData(forceRefresh = false) {
    if (forceRefresh) {
        searchCache.promise = null;
        searchCache.value = null;
    }

    if (searchCache.value) {
        return searchCache.value;
    }

    if (!searchCache.promise) {
        searchCache.promise = fetchJson("./search_index.json").then((data) => {
            searchCache.value = data;
            return data;
        });
    }

    return searchCache.promise;
}

export function getCategories(indexData) {
    return indexData?.data?.categories ?? [];
}

export function getDocuments(indexData) {
    return indexData?.data?.all_documents ?? [];
}

export function getStats(indexData) {
    return indexData?.stats ?? {
        total_documents: 0,
        categories_count: 0,
        total_words: 0,
        by_status: {},
        by_priority: {},
    };
}

export function getVisibleLibraryCategories(indexData) {
    const hidden = new Set(["日常记录", "历史记录", "模板规范"]);
    return getCategories(indexData).filter((category) => !hidden.has(category.name));
}

export function findCategory(indexData, name) {
    return getCategories(indexData).find((category) => category.name === name) ?? null;
}

export function collectDocuments(node) {
    if (!node) return [];
    if (node.type === "file") return [node];

    return (node.children ?? []).flatMap((child) => collectDocuments(child));
}

export function countDocuments(node) {
    if (!node) return 0;
    if (typeof node.document_count === "number") return node.document_count;
    return collectDocuments(node).length;
}

export function getViewScopedCategories(indexData, view) {
    if (view === "pending") {
        return [findCategory(indexData, "日常记录")].filter(Boolean);
    }
    if (view === "history") {
        return [findCategory(indexData, "历史记录")].filter(Boolean);
    }
    return getVisibleLibraryCategories(indexData);
}

export function findDocumentByPath(indexData, fullPath) {
    return getDocuments(indexData).find((doc) => doc.full_path === fullPath) ?? null;
}

export function isSafeDocumentPath(indexData, fullPath) {
    if (!fullPath || typeof fullPath !== "string") return false;
    if (!fullPath.startsWith("Tech-Docs/")) return false;
    if (fullPath.includes("..") || fullPath.includes("\\")) return false;
    return Boolean(findDocumentByPath(indexData, fullPath));
}

export function findDocumentBySlug(indexData, slug) {
    return getDocuments(indexData).find((doc) => doc.slug === slug) ?? null;
}

export function isSafeSlug(indexData, slug) {
    if (!slug || typeof slug !== "string") return false;
    return Boolean(findDocumentBySlug(indexData, slug));
}
