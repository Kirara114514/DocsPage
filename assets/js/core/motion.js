const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
let hasInitialized = false;

// ============ 事件委托单例 ============
let tiltDelegate = null;
let transitionDelegate = null;
let hoverDelegate = null;
let revealObserver = null;

function canAnimate() {
    return !prefersReducedMotion.matches;
}

function canTilt() {
    return canAnimate() && finePointer.matches;
}

// ============ Tilt 事件委托 ============
// 一个监听器管理所有 [data-tilt] 元素，不再逐个绑定
class TiltDelegate {
    constructor() {
        this.currentElement = null;
        this.boundPointerMove = this.onPointerMove.bind(this);
        this.boundPointerLeave = this.onPointerLeave.bind(this);
        document.addEventListener("pointermove", this.boundPointerMove, { passive: true });
        document.addEventListener("pointerleave", this.boundPointerLeave, { passive: true });
    }

    onPointerMove(event) {
        const el = event.target instanceof Element ? event.target : event.target.parentElement;
        const element = el?.closest?.("[data-tilt]");
        if (!element) {
            this.clearTilt();
            return;
        }
        if (element !== this.currentElement) {
            this.clearTilt();
            this.currentElement = element;
            element.classList.add("is-revealed", "is-tilting");
        }
        this.applyTilt(element, event);
    }

    onPointerLeave() {
        this.clearTilt();
    }

    applyTilt(element, event) {
        const rect = element.getBoundingClientRect();
        const offsetX = (event.clientX - rect.left) / rect.width - 0.5;
        const offsetY = (event.clientY - rect.top) / rect.height - 0.5;
        const rotateX = offsetY * -8;
        const rotateY = offsetX * 8;
        const lift = element.dataset.tiltLift ?? "-4px";
        const liftTransform = lift === "0" || lift === "0px" ? "" : ` translateY(${lift})`;
        element.style.transform = `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)${liftTransform}`;
    }

    clearTilt() {
        if (this.currentElement) {
            this.currentElement.style.transform = "";
            this.currentElement.classList.remove("is-tilting");
            this.currentElement = null;
        }
    }

    destroy() {
        document.removeEventListener("pointermove", this.boundPointerMove);
        document.removeEventListener("pointerleave", this.boundPointerLeave);
    }
}

// ============ 页面过渡事件委托 ============
// 用事件委托处理所有链接的 click/hover，不再逐个绑定
class TransitionDelegate {
    constructor() {
        this.transitionLayer = null;
        this.boundClick = this.onClick.bind(this);
        this.boundMouseEnter = this.onMouseEnter.bind(this);
        this.boundMouseLeave = this.onMouseLeave.bind(this);
        document.addEventListener("click", this.boundClick);
        document.addEventListener("mouseenter", this.boundMouseEnter, { passive: true, capture: true });
        document.addEventListener("mouseleave", this.boundMouseLeave, { passive: true, capture: true });
    }

    ensureLayer() {
        if (!this.transitionLayer) {
            this.transitionLayer = document.querySelector(".page-transition");
            if (!this.transitionLayer) {
                this.transitionLayer = document.createElement("div");
                this.transitionLayer.className = "page-transition";
                document.body.appendChild(this.transitionLayer);
            }
        }
        return this.transitionLayer;
    }

    isValidLink(link) {
        const href = link.getAttribute("href");
        if (!href) return false;
        if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
        if (link.target === "_blank") return false;
        if (/^https?:\/\//i.test(href) && !href.includes(window.location.host)) return false;
        return true;
    }

    getLinkTarget(event) {
        // event.target 可能是文本节点/SVG，需要先检查
        const el = event.target instanceof Element ? event.target : event.target.parentElement;
        return el?.closest?.("a[href]") || null;
    }

    onClick(event) {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = this.getLinkTarget(event);
        if (!link || !this.isValidLink(link)) return;
        
        const layer = this.ensureLayer();
        layer.classList.add("is-active");
        window.setTimeout(() => layer.classList.remove("is-active"), 400);
    }

    onMouseEnter(event) {
        const link = this.getLinkTarget(event);
        if (!link || !this.isValidLink(link)) return;
        link.classList.add("is-hovered");
    }

    onMouseLeave(event) {
        const link = this.getLinkTarget(event);
        if (!link) return;
        link.classList.remove("is-hovered");
    }

    destroy() {
        document.removeEventListener("click", this.boundClick);
        document.removeEventListener("mouseenter", this.boundMouseEnter, { capture: true });
        document.removeEventListener("mouseleave", this.boundMouseLeave, { capture: true });
    }
}

// ============ Hover/Press/Ripple 事件委托 ============
class HoverDelegate {
    constructor() {
        this.boundKeyDown = this.onKeyDown.bind(this);
        this.boundKeyUp = this.onKeyUp.bind(this);
        this.boundClick = this.onClick.bind(this);
        document.addEventListener("keydown", this.boundKeyDown, { passive: true });
        document.addEventListener("keyup", this.boundKeyUp, { passive: true });
        document.addEventListener("click", this.boundClick, { passive: true });
    }

    isInteractiveElement(element) {
        return element.matches(
            ".btn, .btn-secondary, .btn-ghost, .icon-button, .folder-card, .record-card, .doc-item, .sidebar-item, .tab-button, .link-chip, .back-link"
        );
    }

    onKeyDown(event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        const element = event.target;
        if (!this.isInteractiveElement(element)) return;
        element.classList.add("is-pressed");
    }

    onKeyUp(event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        const element = event.target;
        element.classList.remove("is-pressed");
    }

    onClick(event) {
        const element = event.target;
        if (!this.isInteractiveElement(element)) return;
        this.addRipple(element, event);
    }

    addRipple(element, event) {
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;
        
        const ripple = document.createElement("span");
        ripple.className = "ripple";
        ripple.style.width = ripple.style.height = size + "px";
        ripple.style.left = x + "px";
        ripple.style.top = y + "px";
        
        element.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    destroy() {
        document.removeEventListener("keydown", this.boundKeyDown);
        document.removeEventListener("keyup", this.boundKeyUp);
        document.removeEventListener("click", this.boundClick);
    }
}

// ============ Reveal Observer ============
// 用单个 IntersectionObserver 管理所有 .reveal 元素
function getRevealObserver() {
    if (revealObserver) return revealObserver;

    if (!canAnimate() || !("IntersectionObserver" in window)) {
        return null;
    }

    revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                revealElement(entry.target);
                revealObserver.unobserve(entry.target);
            });
        },
        { threshold: 0.01, rootMargin: "0px 0px 96px 0px" }
    );

    return revealObserver;
}

function revealElement(element) {
    element.classList.add("is-visible");
    window.setTimeout(() => {
        element.classList.add("is-revealed");
    }, getTransitionDelay(element) + 460);
}

function getTransitionDelay(element) {
    const delays = window.getComputedStyle(element).transitionDelay.split(",");
    return delays.reduce((longest, delay) => Math.max(longest, parseTimeToMs(delay.trim())), 0);
}

function parseTimeToMs(value) {
    if (!value) return 0;
    if (value.endsWith("ms")) return Number.parseFloat(value) || 0;
    if (value.endsWith("s")) return (Number.parseFloat(value) || 0) * 1000;
    return 0;
}

function isTallElementInView(element) {
    const rect = element.getBoundingClientRect();
    return rect.height > window.innerHeight * 0.9 && rect.top < window.innerHeight && rect.bottom > 0;
}

// ============ 公共 API ============

export function initSharedMotion() {
    if (hasInitialized) return;
    hasInitialized = true;

    // 初始化事件委托单例
    if (canTilt()) {
        tiltDelegate = new TiltDelegate();
    }
    transitionDelegate = new TransitionDelegate();
    hoverDelegate = new HoverDelegate();

    // 处理页面显示
    window.addEventListener("pageshow", () => transitionDelegate?.ensureLayer().classList.remove("is-active"));
    window.addEventListener("popstate", () => transitionDelegate?.ensureLayer().classList.remove("is-active"));
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) transitionDelegate?.ensureLayer().classList.remove("is-active");
    });

    // 首次绑定 reveal
    refreshMotion();
}

export function refreshMotion() {
    // 只处理 reveal，tilt/hover/transition 都由事件委托自动处理
    initReveal();
}

function initReveal() {
    const elements = document.querySelectorAll(".reveal:not([data-reveal-bound])");
    if (!elements.length) return;

    const observer = getRevealObserver();

    elements.forEach((element) => {
        element.dataset.revealBound = "true";

        if (!observer || !canAnimate()) {
            revealElement(element);
            return;
        }

        if (isTallElementInView(element)) {
            revealElement(element);
            return;
        }

        observer.observe(element);
    });
}

export function destroyMotion() {
    tiltDelegate?.destroy();
    tiltDelegate = null;
    transitionDelegate?.destroy();
    transitionDelegate = null;
    hoverDelegate?.destroy();
    hoverDelegate = null;
    revealObserver?.disconnect();
    revealObserver = null;
    hasInitialized = false;
}
