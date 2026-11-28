(function () {
  /** @type {{ products: object[], categories: {name:string,slug:string}[], description: string }} */
  let catalog = { products: [], categories: [], description: "" };
  let query = "";
  let categoryFilter = "All";
  let categorySlugFilter = "";
  let tagFilter = "";
  let sortKey = "name";
  let sortDir = "asc";
  let urlSyncReady = false;

  const els = {
    description: document.getElementById("site-description"),
    search: document.getElementById("search"),
    chips: document.getElementById("category-chips"),
    count: document.getElementById("result-count"),
    tbody: document.getElementById("product-tbody"),
    cards: document.getElementById("product-cards"),
    empty: document.getElementById("empty-state"),
    sortButtons: document.querySelectorAll(".sort-btn"),
    sortHeaders: document.querySelectorAll("th[data-sort-key]"),
    tagAi: document.getElementById("tag-ai"),
  };

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function externalLink(url, label) {
    return `<a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  }

  function categoryNames() {
    return catalog.categories.map((c) =>
      typeof c === "string" ? c : c.name
    );
  }

  function slugForCategoryName(name) {
    const found = catalog.categories.find(
      (c) => (typeof c === "string" ? c : c.name) === name
    );
    if (found && typeof found !== "string") return found.slug;
    return "";
  }

  function nameForCategorySlug(slug) {
    const found = catalog.categories.find(
      (c) => typeof c !== "string" && c.slug === slug
    );
    return found ? found.name : null;
  }

  function readUrlState() {
    const params = new URLSearchParams(window.location.search);
    query = params.get("q") || "";
    const catSlug = params.get("category") || "";
    categorySlugFilter = catSlug;
    if (catSlug) {
      const name = nameForCategorySlug(catSlug);
      categoryFilter = name || "__invalid__";
    } else {
      categoryFilter = "All";
    }
    const tag = (params.get("tag") || "").toLowerCase();
    tagFilter = tag;
    if (els.tagAi) {
      els.tagAi.setAttribute("aria-pressed", tag === "ai" ? "true" : "false");
    }
    els.search.value = query;
  }

  function syncUrl() {
    if (!urlSyncReady) return;
    const params = new URLSearchParams();
    const q = query.trim();
    if (q) params.set("q", q);
    const slug =
      categoryFilter !== "All" ? slugForCategoryName(categoryFilter) : "";
    if (slug) params.set("category", slug);
    if (tagFilter) params.set("tag", tagFilter);
    const search = params.toString();
    const url =
      window.location.pathname +
      (search ? `?${search}` : "") +
      window.location.hash;
    const current =
      window.location.pathname +
      window.location.search +
      window.location.hash;
    if (url !== current) {
      window.history.replaceState(null, "", url);
    }
  }

  function searchBlob(p) {
    const parts = [
      p.name,
      p.category,
      p.price || "",
      p.licenseLabel || "",
      ...(p.tags || []),
    ];
    return parts.join(" ").toLowerCase();
  }

  function renderNameCell(p) {
    const badges =
      (p.tags || []).length > 0
        ? (p.tags || [])
            .map(
              (t) =>
                `<span class="tag-badge">${escapeHtml(t.toUpperCase())}</span>`
            )
            .join("")
        : "";
    return `${externalLink(p.productUrl, p.name)}${badges}`;
  }

  function comparePrice(a, b) {
    const pa = a.priceSort || {};
    const pb = b.priceSort || {};
    if (pa.missing && !pb.missing) return 1;
    if (!pa.missing && pb.missing) return -1;
    if (pa.missing && pb.missing) return 0;
    const ca = pa.currency || "";
    const cb = pb.currency || "";
    if (ca !== cb) return ca.localeCompare(cb);
    const va = pa.value ?? -1;
    const vb = pb.value ?? -1;
    return va - vb;
  }

  function compareRows(a, b) {
    let c = 0;
    if (sortKey === "name") {
      c = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    } else if (sortKey === "category") {
      c = a.category.localeCompare(b.category, undefined, {
        sensitivity: "base",
      });
      if (c === 0) {
        c = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
    } else if (sortKey === "price") {
      c = comparePrice(a, b);
      if (c === 0) {
        c = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
    }
    return sortDir === "asc" ? c : -c;
  }

  function filteredProducts() {
    const q = query.trim().toLowerCase();
    return catalog.products
      .filter((p) => {
        if (categoryFilter !== "All" && p.category !== categoryFilter) {
          return false;
        }
        if (tagFilter && !(p.tags || []).includes(tagFilter)) {
          return false;
        }
        if (!q) return true;
        return searchBlob(p).includes(q);
      })
      .sort(compareRows);
  }

  function renderLicense(p) {
    if (p.licenseUrl && p.licenseLabel) {
      return externalLink(p.licenseUrl, p.licenseLabel);
    }
    return '<span class="muted">—</span>';
  }

  function renderPrice(p) {
    return p.price ? escapeHtml(p.price) : '<span class="muted">—</span>';
  }

  function renderTable(rows) {
    els.tbody.innerHTML = rows
      .map(
        (p) => `<tr>
          <td>${renderNameCell(p)}</td>
          <td>${escapeHtml(p.category)}</td>
          <td>${renderPrice(p)}</td>
          <td>${renderLicense(p)}</td>
        </tr>`
      )
      .join("");
  }

  function renderCards(rows) {
    els.cards.innerHTML = rows
      .map(
        (p) => `<li class="product-card">
          <dl>
            <dt>Name</dt>
            <dd class="card-name">${renderNameCell(p)}</dd>
            <dt>Category</dt>
            <dd>${escapeHtml(p.category)}</dd>
            <dt>Price</dt>
            <dd>${renderPrice(p)}</dd>
            <dt>License</dt>
            <dd>${renderLicense(p)}</dd>
          </dl>
        </li>`
      )
      .join("");
  }

  function updateSortIndicators() {
    els.sortButtons.forEach((btn) => {
      if (btn.dataset.sort === sortKey) {
        btn.dataset.dir = sortDir;
      } else {
        btn.removeAttribute("data-dir");
      }
    });
    els.sortHeaders.forEach((th) => {
      const key = th.dataset.sortKey;
      if (key === sortKey) {
        th.setAttribute(
          "aria-sort",
          sortDir === "asc" ? "ascending" : "descending"
        );
      } else {
        th.setAttribute("aria-sort", "none");
      }
    });
  }

  function updateChipStates() {
    els.chips.querySelectorAll(".chip").forEach((chip) => {
      const isAll = chip.dataset.category === "All";
      const active =
        chip.dataset.category === categoryFilter ||
        (isAll && categoryFilter === "All");
      chip.setAttribute("aria-checked", active ? "true" : "false");
    });
  }

  function render() {
    const rows = filteredProducts();
    const total = catalog.products.length;
    const n = rows.length;
    els.count.textContent =
      n === total
        ? `Showing all ${total} apps`
        : `Showing ${n} of ${total} apps`;

    if (n === 0) {
      els.empty.hidden = false;
      els.tbody.innerHTML = "";
      els.cards.innerHTML = "";
    } else {
      els.empty.hidden = true;
      renderTable(rows);
      renderCards(rows);
    }
    updateSortIndicators();
    updateChipStates();
    syncUrl();
  }

  function buildChips() {
    const cats = ["All", ...categoryNames()];
    els.chips.innerHTML = cats
      .map((c) => {
        const slug = c === "All" ? "" : slugForCategoryName(c);
        return `<button type="button" class="chip" role="radio" data-category="${escapeHtml(c)}" data-category-slug="${escapeHtml(slug)}" aria-checked="${c === categoryFilter ? "true" : "false"}">${escapeHtml(c)}</button>`;
      })
      .join("");

    els.chips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      categoryFilter = btn.dataset.category;
      categorySlugFilter = btn.dataset.categorySlug || "";
      render();
    });
  }

  els.search.addEventListener("input", () => {
    query = els.search.value;
    render();
  });

  if (els.tagAi) {
    els.tagAi.addEventListener("click", () => {
      const on = els.tagAi.getAttribute("aria-pressed") === "true";
      tagFilter = on ? "" : "ai";
      els.tagAi.setAttribute("aria-pressed", on ? "false" : "true");
      render();
    });
  }

  window.addEventListener("popstate", () => {
    readUrlState();
    render();
  });

  els.sortButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      if (sortKey === key) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = key;
        sortDir = "asc";
      }
      render();
    });
  });

  fetch("data/products.json")
    .then((r) => {
      if (!r.ok) throw new Error("Failed to load product data");
      return r.json();
    })
    .then((data) => {
      catalog = data;
      if (data.description) {
        els.description.textContent = data.description;
      }
      buildChips();
      readUrlState();
      urlSyncReady = true;
      render();
    })
    .catch((err) => {
      els.count.textContent =
        "Could not load app list. See README on GitHub.";
      console.error(err);
    });
})();