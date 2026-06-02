// ============ 通用动效模块 ============
// 所有动效都基于 transform/opacity，不触发重排重绘

// ── 数字滚动动画 ──
export function animateCounter(element, target, duration = 1200) {
    if (!element || element.dataset.counted === "true") return;
    element.dataset.counted = "true";
    
    const start = 0;
    const startTime = performance.now();
    
    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutCubic(progress);
        const current = Math.round(start + (target - start) * easedProgress);
        
        element.textContent = current.toLocaleString();
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = target.toLocaleString();
            element.classList.add("is-counting");
            setTimeout(() => element.classList.remove("is-counting"), 150);
        }
    }
    
    requestAnimationFrame(update);
}

// ── 鼠标跟随光晕 ──
let glowElement = null;
let glowAnimFrame = null;

export function initCursorGlow() {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    
    // 创建光晕元素
    glowElement = document.createElement("div");
    glowElement.className = "cursor-glow";
    document.body.appendChild(glowElement);
    
    // 第二个光晕（延迟跟随）
    const glow2 = document.createElement("div");
    glow2.className = "cursor-glow cursor-glow--blue";
    glow2.style.opacity = "0.5";
    glow2.style.transition = "opacity 0.3s ease, left 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)";
    document.body.appendChild(glow2);
    
    let mouseX = 0, mouseY = 0;
    
    document.addEventListener("mousemove", (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        
        if (!glowAnimFrame) {
            glowAnimFrame = requestAnimationFrame(() => {
                glowElement.style.left = mouseX + "px";
                glowElement.style.top = mouseY + "px";
                glow2.style.left = mouseX + "px";
                glow2.style.top = mouseY + "px";
                glowAnimFrame = null;
            });
        }
    }, { passive: true });
    
    document.addEventListener("mouseleave", () => {
        glowElement.style.opacity = "0";
        glow2.style.opacity = "0";
    });
    
    document.addEventListener("mouseenter", () => {
        glowElement.style.opacity = "1";
        glow2.style.opacity = "0.5";
    });
}

// ── 页面加载进度条 ──
export function initPageProgress() {
    const progress = document.createElement("div");
    progress.className = "page-progress";
    document.body.appendChild(progress);
    
    // 模拟加载进度
    let width = 0;
    const interval = setInterval(() => {
        if (width >= 90) {
            clearInterval(interval);
            return;
        }
        width += Math.random() * 15;
        if (width > 90) width = 90;
        progress.style.width = width + "%";
    }, 100);
    
    // 页面加载完成
    window.addEventListener("load", () => {
        clearInterval(interval);
        progress.style.width = "100%";
        setTimeout(() => {
            progress.classList.add("is-done");
            setTimeout(() => progress.remove(), 500);
        }, 300);
    });
}

// ── 打字机效果 ──
export function typewriterEffect(element, text, speed = 50) {
    if (!element || !text) return;
    
    element.textContent = "";
    const cursor = document.createElement("span");
    cursor.className = "typewriter-cursor";
    element.appendChild(cursor);
    
    let i = 0;
    function type() {
        if (i < text.length) {
            element.insertBefore(document.createTextNode(text[i]), cursor);
            i++;
            setTimeout(type, speed);
        } else {
            // 完成后移除光标
            setTimeout(() => cursor.remove(), 2000);
        }
    }
    
    type();
}

// ── 涟漪效果 ──
export function addRipple(event) {
    const element = event.currentTarget;
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

// ── 标签云浮动 ──
export function initTagFloat() {
    const tags = document.querySelectorAll(".tag-pill");
    tags.forEach((tag, i) => {
        tag.classList.add("tag-pill--float");
    });
}

// ── 卡片边框流光 ──
export function initGlowBorder() {
    const cards = document.querySelectorAll(".folder-card, .doc-item, .stat-card, .record-card");
    cards.forEach(card => {
        card.classList.add("glow-border");
    });
}

// ── 初始化所有动效 ──
export function initEffects() {
    initCursorGlow();
    initPageProgress();
    initGlowBorder();
}
