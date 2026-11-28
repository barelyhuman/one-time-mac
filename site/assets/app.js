(function () {
  /** @type {{ products: object[], categories: string[], description: string }} */
  let catalog = { products: [], categories: [], description: "" };
  let query = "";
  let categoryFilter = "All";
  let sortKey = "name";
  let sortDir = "asc";

  const els = {
    description: document.getElementById("site-description"),
    search: document.getElementById("search"),
    chips: document.getElementById("category-chips"),
    count: document.getElementById("result-count"),
    tbody: document.getElementById("product-tbody"),
    cards: document.getElementById("product-cards"),
    sortButtons: document.querySelectorAll(".sort-btn"),
  };

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function searchBlob(p) {
    const parts = [
      p.name,
      p.category,
      p.price || "",
      p.licenseLabel || "",
    ];
    return parts.join(" ").toLowerCase();
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
        if (!q) return true;
        return searchBlob(p).includes(q);
      })
      .sort(compareRows);
  }

  function renderLicense(p) {
    if (p.licenseUrl && p.licenseLabel) {
      return `<a href="${escapeHtml(p.licenseUrl)}">${escapeHtml(p.licenseLabel)}</a>`;
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
          <td><a href="${escapeHtml(p.productUrl)}">${escapeHtml(p.name)}</a></td>
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
            <dd class="card-name"><a href="${escapeHtml(p.productUrl)}">${escapeHtml(p.name)}</a></dd>
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
  }

  function render() {
    const rows = filteredProducts();
    const total = catalog.products.length;
    const n = rows.length;
    els.count.textContent =
      n === total
        ? `Showing all ${total} apps`
        : `Showing ${n} of ${total} apps`;
    renderTable(rows);
    renderCards(rows);
    updateSortIndicators();
  }

  function buildChips() {
    const cats = ["All", ...catalog.categories];
    els.chips.innerHTML = cats
      .map(
        (c) =>
          `<button type="button" class="chip" data-category="${escapeHtml(c)}" aria-pressed="${c === "All" ? "true" : "false"}">${escapeHtml(c)}</button>`
      )
      .join("");

    els.chips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      categoryFilter = btn.dataset.category;
      els.chips.querySelectorAll(".chip").forEach((chip) => {
        chip.setAttribute(
          "aria-pressed",
          chip.dataset.category === categoryFilter ? "true" : "false"
        );
      });
      render();
    });
  }

  els.search.addEventListener("input", () => {
    query = els.search.value;
    render();
  });

  els.sortButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      if (sortKey === key) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = key;
        sortDir = key === "price" ? "asc" : "asc";
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
      render();
    })
    .catch((err) => {
      els.count.textContent =
        "Could not load app list. See README on GitHub.";
      console.error(err);
    });
})();