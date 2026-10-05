(() => {
  "use strict";

  const SOURCE_WIDTH = 1218;
  const SOURCE_HEIGHT = 1291;
  const TEXT_KEY = "dream-poke-texts-v1";
  const OPEN_KEY = "dream-poke-opened-v1";

  // 分区坐标来自原始 1218×1291 底图，页面缩放时会按相同比例同步缩放。
  const xBounds = [25, 321, 606, 889, 1193];
  const yBounds = [71, 370, 661, 955, 1265];
  const cells = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      cells.push({
        x: xBounds[col],
        y: yBounds[row],
        w: xBounds[col + 1] - xBounds[col],
        h: yBounds[row + 1] - yBounds[row]
      });
    }
  }

  const contentGrid = document.querySelector("#contentGrid");
  const hotspotGrid = document.querySelector("#hotspotGrid");
  const editorFields = document.querySelector("#editorFields");
  const canvas = document.querySelector("#coverCanvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const modal = document.querySelector("#editorModal");
  const editButton = document.querySelector("#editButton");
  const resetButton = document.querySelector("#resetButton");
  const clearButton = document.querySelector("#clearButton");
  const doneButton = document.querySelector("#doneButton");
  const toast = document.querySelector("#toast");

  canvas.width = SOURCE_WIDTH;
  canvas.height = SOURCE_HEIGHT;

  const storedTexts = readStorage(TEXT_KEY, []);
  const texts = Array.from({ length: 16 }, (_, index) =>
    typeof storedTexts[index] === "string" ? storedTexts[index] : ""
  );

  const storedOpened = readStorage(OPEN_KEY, []);
  const opened = new Set(
    Array.isArray(storedOpened)
      ? storedOpened.filter(index => Number.isInteger(index) && index >= 0 && index < 16)
      : []
  );

  let coverReady = false;
  let isAnimating = false;
  let toastTimer;

  const coverImage = new Image();
  coverImage.decoding = "async";
  coverImage.src = "assets/board.png";

  cells.forEach((cell, index) => {
    const number = String(index + 1).padStart(2, "0");

    const content = document.createElement("div");
    content.id = `content${number}`;
    content.className = "cell-content";
    positionElement(content, cell, 12);
    contentGrid.append(content);

    const hotspot = document.createElement("button");
    hotspot.type = "button";
    hotspot.className = "hotspot";
    hotspot.dataset.index = String(index);
    hotspot.setAttribute("aria-label", `戳开第 ${number} 格`);
    hotspot.setAttribute("aria-controls", `content${number}`);
    hotspot.disabled = true;
    positionElement(hotspot, cell);
    hotspot.addEventListener("click", () => revealCell(index, hotspot));
    hotspotGrid.append(hotspot);

    const label = document.createElement("label");
    label.className = "field-label";
    label.textContent = `格子 ${number}`;

    const input = document.createElement("textarea");
    input.id = `input${number}`;
    input.maxLength = 100;
    input.rows = 3;
    input.placeholder = `输入 content${number} 的文字`;
    input.value = texts[index];
    input.setAttribute("aria-label", `格子 ${number} 的文字`);
    input.addEventListener("input", () => {
      texts[index] = input.value;
      updateContent(index);
      saveTexts();
    });
    label.append(input);
    editorFields.append(label);

    updateContent(index);
  });

  coverImage.addEventListener("load", () => {
    coverReady = true;
    renderCover();
    updateHotspots();
  });

  coverImage.addEventListener("error", () => {
    showToast("底图载入失败，请刷新页面重试");
  });

  function positionElement(element, cell, inset = 0) {
    const x = cell.x + inset;
    const y = cell.y + inset;
    const w = cell.w - inset * 2;
    const h = cell.h - inset * 2;
    element.style.left = `${(x / SOURCE_WIDTH) * 100}%`;
    element.style.top = `${(y / SOURCE_HEIGHT) * 100}%`;
    element.style.width = `${(w / SOURCE_WIDTH) * 100}%`;
    element.style.height = `${(h / SOURCE_HEIGHT) * 100}%`;
  }

  function updateContent(index) {
    const element = document.querySelector(`#content${String(index + 1).padStart(2, "0")}`);
    const value = texts[index].trim();
    element.textContent = value || `内容 ${String(index + 1).padStart(2, "0")}`;
    element.classList.toggle("is-placeholder", !value);
  }

  function revealCell(index, hotspot) {
    if (!coverReady || isAnimating || opened.has(index)) return;
    isAnimating = true;
    hotspot.classList.add("is-opening");
    const startedAt = performance.now();
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 430;

    const animate = now => {
      const raw = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - raw, 3);
      renderCover(index, eased);

      if (raw < 1) {
        requestAnimationFrame(animate);
        return;
      }

      opened.add(index);
      saveOpened();
      renderCover();
      hotspot.classList.remove("is-opening");
      hotspot.classList.add("is-opened");
      hotspot.setAttribute("aria-label", `第 ${String(index + 1).padStart(2, "0")} 格已打开`);
      isAnimating = false;
    };

    requestAnimationFrame(animate);
  }

  function renderCover(activeIndex = null, progress = 0) {
    if (!coverReady) return;
    ctx.clearRect(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.drawImage(coverImage, 0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);

    opened.forEach(index => clearCell(cells[index]));

    if (activeIndex !== null) {
      const cell = cells[activeIndex];
      const scale = 0.975 + progress * 0.025;
      const w = cell.w * scale;
      const h = cell.h * scale;
      const x = cell.x + (cell.w - w) / 2;
      const y = cell.y + (cell.h - h) / 2;

      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = progress;
      ctx.filter = `blur(${1 + progress * 5}px)`;
      ctx.fillStyle = "#000";
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
  }

  function clearCell(cell) {
    ctx.clearRect(cell.x, cell.y, cell.w, cell.h);
  }

  function updateHotspots() {
    document.querySelectorAll(".hotspot").forEach((hotspot, index) => {
      const isOpen = opened.has(index);
      hotspot.disabled = !coverReady || isOpen;
      hotspot.classList.toggle("is-opened", isOpen);
      hotspot.setAttribute(
        "aria-label",
        isOpen
          ? `第 ${String(index + 1).padStart(2, "0")} 格已打开`
          : `戳开第 ${String(index + 1).padStart(2, "0")} 格`
      );
    });
  }

  function saveTexts() {
    localStorage.setItem(TEXT_KEY, JSON.stringify(texts));
  }

  function saveOpened() {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...opened]));
  }

  function readStorage(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function openEditor() {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => document.querySelector("#input01")?.focus(), 40);
  }

  function closeEditor() {
    modal.hidden = true;
    document.body.style.overflow = "";
    editButton.focus();
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
  }

  editButton.addEventListener("click", openEditor);
  doneButton.addEventListener("click", closeEditor);
  modal.querySelectorAll("[data-close-modal]").forEach(element => {
    element.addEventListener("click", closeEditor);
  });

  resetButton.addEventListener("click", () => {
    if (isAnimating) return;
    if (opened.size === 0) {
      showToast("所有格子都已盖好");
      return;
    }
    opened.clear();
    saveOpened();
    renderCover();
    updateHotspots();
    showToast("已重新盖上全部格子");
  });

  clearButton.addEventListener("click", () => {
    if (!window.confirm("确定要清空 16 个格子的全部文字吗？")) return;
    texts.fill("");
    document.querySelectorAll(".field-label textarea").forEach(input => {
      input.value = "";
    });
    cells.forEach((_, index) => updateContent(index));
    saveTexts();
    showToast("已清空全部格子内容");
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modal.hidden) closeEditor();
  });
})();
