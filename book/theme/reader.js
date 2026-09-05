"use strict";

(() => {
    const main = document.querySelector("#mdbook-content main");

    if (!main) {
        return;
    }

    const calloutClasses = [
        ["学习导航", "reading-map"],
        ["开章场景", "chapter-scene"],
        ["第一次阅读建议", "first-read"],
    ];

    for (const quote of main.querySelectorAll("blockquote")) {
        const label = quote.firstElementChild?.querySelector("strong")?.textContent.trim();

        if (!label) {
            continue;
        }

        const match = calloutClasses.find(([prefix]) => label.startsWith(prefix));
        if (match) {
            quote.classList.add(match[1]);
        }
    }

    const progress = document.createElement("div");
    progress.className = "reading-progress";
    progress.setAttribute("aria-hidden", "true");

    const progressBar = document.createElement("div");
    progressBar.className = "reading-progress__bar";
    progress.append(progressBar);
    document.body.append(progress);

    let progressFrame = 0;
    const updateProgress = () => {
        progressFrame = 0;
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const ratio = scrollable > 0
            ? Math.max(0, Math.min(window.scrollY / scrollable, 1))
            : 1;
        progressBar.style.transform = `scaleX(${ratio})`;
    };
    const requestProgressUpdate = () => {
        if (!progressFrame) {
            progressFrame = window.requestAnimationFrame(updateProgress);
        }
    };

    window.addEventListener("scroll", requestProgressUpdate, { passive: true });
    window.addEventListener("resize", requestProgressUpdate, { passive: true });
    updateProgress();

    const headings = Array.from(main.querySelectorAll("h2[id]"));
    const isPrintView = window.location.pathname.endsWith("/print.html");

    if (!isPrintView && headings.length >= 3) {
        const toc = document.createElement("nav");
        toc.className = "page-toc";
        toc.setAttribute("aria-label", "本页目录");

        const title = document.createElement("div");
        title.className = "page-toc__title";
        title.textContent = "本页目录";

        const list = document.createElement("ol");
        const links = headings.map((heading) => {
            const item = document.createElement("li");
            const link = document.createElement("a");
            link.href = `#${heading.id}`;
            link.textContent = heading.textContent.trim();
            item.append(link);
            list.append(item);
            return link;
        });

        toc.append(title, list);
        document.body.append(toc);

        let tocFrame = 0;
        const updateCurrentHeading = () => {
            tocFrame = 0;
            const threshold = 90;
            let activeIndex = 0;

            headings.forEach((heading, index) => {
                if (heading.getBoundingClientRect().top <= threshold) {
                    activeIndex = index;
                }
            });

            links.forEach((link, index) => {
                if (index === activeIndex) {
                    link.setAttribute("aria-current", "location");
                } else {
                    link.removeAttribute("aria-current");
                }
            });
        };
        const requestTocUpdate = () => {
            if (!tocFrame) {
                tocFrame = window.requestAnimationFrame(updateCurrentHeading);
            }
        };

        window.addEventListener("scroll", requestTocUpdate, { passive: true });
        window.addEventListener("resize", requestTocUpdate, { passive: true });
        updateCurrentHeading();
    }

    const searchInput = document.querySelector("#mdbook-searchbar");
    if (searchInput) {
        searchInput.placeholder = "搜索本书...";
        searchInput.setAttribute("aria-label", "搜索本书");
    }

    const searchHeader = document.querySelector("#mdbook-searchresults-header");
    if (searchHeader) {
        const localizeSearchMetric = () => {
            const metric = searchHeader.textContent;
            const emptyMatch = metric.match(/^No search results for '(.+)'\.$/);
            const resultMatch = metric.match(/^(\d+) search results for '(.+)':$/);

            if (emptyMatch) {
                searchHeader.textContent = `没有找到“${emptyMatch[1]}”的结果。`;
            } else if (resultMatch) {
                searchHeader.textContent = `找到 ${resultMatch[1]} 条关于“${resultMatch[2]}”的结果：`;
            }
        };

        new MutationObserver(localizeSearchMetric).observe(searchHeader, {
            childList: true,
        });
    }

    const themeLabels = new Map([
        ["mdbook-theme-default_theme", "跟随系统"],
        ["mdbook-theme-light", "明亮"],
        ["mdbook-theme-rust", "Rust"],
        ["mdbook-theme-coal", "深灰"],
        ["mdbook-theme-navy", "深蓝"],
        ["mdbook-theme-ayu", "Ayu"],
    ]);

    for (const [id, label] of themeLabels) {
        const option = document.getElementById(id);
        if (option) {
            option.textContent = label;
        }
    }

    const helpTitle = document.querySelector(".mdbook-help-title");
    const helpLines = document.querySelectorAll("#mdbook-help-popup p");
    if (helpTitle && helpLines.length === 4) {
        helpTitle.textContent = "键盘快捷键";

        const arrowKeys = helpLines[0].querySelectorAll("kbd");
        helpLines[0].replaceChildren(
            "按 ",
            arrowKeys[0],
            " 或 ",
            arrowKeys[1],
            " 切换章节",
        );

        const searchKeys = helpLines[1].querySelectorAll("kbd");
        helpLines[1].replaceChildren(
            "按 ",
            searchKeys[0],
            " 或 ",
            searchKeys[1],
            " 搜索本书",
        );

        const helpKey = helpLines[2].querySelector("kbd");
        helpLines[2].replaceChildren("按 ", helpKey, " 显示快捷键");

        const escapeKey = helpLines[3].querySelector("kbd");
        helpLines[3].replaceChildren("按 ", escapeKey, " 关闭快捷键");
    }

    const localizedControls = [
        ["#mdbook-sidebar-toggle", "展开或收起全书目录"],
        ["#mdbook-theme-toggle", "切换阅读主题"],
        ["#mdbook-search-toggle", "搜索本书"],
        ['a[rel~="prev"]', "上一章"],
        ['a[rel~="next"]', "下一章"],
    ];

    for (const [selector, label] of localizedControls) {
        for (const control of document.querySelectorAll(selector)) {
            control.title = label;
            control.setAttribute("aria-label", label);
        }
    }
})();
