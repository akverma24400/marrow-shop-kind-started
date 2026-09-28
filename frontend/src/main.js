import "./style.css";

const $ = (selector) => document.querySelector(selector);
const money = (paise) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

function savedCart() {
  try {
    const stored = JSON.parse(localStorage.getItem("morrow-cart") || "[]");
    return Array.isArray(stored)
      ? stored.filter(
          (item) =>
            Number.isSafeInteger(item.id) &&
            Number.isSafeInteger(item.quantity) &&
            item.quantity > 0 &&
            item.quantity <= 20,
        )
      : [];
  } catch {
    return [];
  }
}

const state = { products: [], cart: savedCart(), category: "All", search: "" };
let toastTimer;

function productFor(id) {
  return state.products.find((product) => product.id === id);
}
function saveCart() {
  localStorage.setItem("morrow-cart", JSON.stringify(state.cart));
}
function cartLines() {
  return state.cart
    .map((item) => ({ ...item, product: productFor(item.id) }))
    .filter((item) => item.product);
}
function cartTotal() {
  return cartLines().reduce(
    (sum, item) => sum + item.product.price_cents * item.quantity,
    0,
  );
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 3000);
}

function renderFilters() {
  const categories = [
    "All",
    ...new Set(state.products.map((product) => product.category)),
  ];
  $("#filters").innerHTML = categories
    .map(
      (category) =>
        `<button type="button" class="filter ${state.category === category ? "active" : ""}" data-category="${escapeHtml(category)}" aria-pressed="${state.category === category}">${escapeHtml(category)}</button>`,
    )
    .join("");
}

function renderProducts() {
  const search = state.search.toLowerCase();
  const products = state.products.filter(
    (product) =>
      (state.category === "All" || product.category === state.category) &&
      `${product.name} ${product.category} ${product.description}`
        .toLowerCase()
        .includes(search),
  );
  $("#item-count").textContent =
    `${products.length} ${products.length === 1 ? "piece" : "pieces"}`;
  $("#products").innerHTML = products.length
    ? products
        .map(
          (product) => `
    <article class="product-card">
      <div class="product-art color-${escapeHtml(product.color)}"><span class="product-symbol" aria-hidden="true">${escapeHtml(product.symbol)}</span><span class="product-index">NO. ${String(product.id).padStart(2, "0")}</span></div>
      <div class="product-info"><div class="product-overline">${escapeHtml(product.category)} <span>•</span> ${product.stock ? `${product.stock} in stock` : "Out of stock"}</div><div class="product-title"><h3>${escapeHtml(product.name)}</h3><strong>${money(product.price_cents)}</strong></div><p>${escapeHtml(product.description)}</p><button type="button" class="add-button" data-add="${product.id}" ${product.stock ? "" : "disabled"}>${product.stock ? 'Add to bag <span aria-hidden="true">↗</span>' : "Sold out"}</button></div>
    </article>`,
        )
        .join("")
    : `<div class="empty-results"><span>◌</span><h3>Nothing found just yet.</h3><p>Try a different search or category.</p><button type="button" id="reset-filters">Show all products</button></div>`;
}

function renderCart() {
  const lines = cartLines();
  const count = lines.reduce((sum, item) => sum + item.quantity, 0);
  $("#cart-count").textContent = count;
  $("#drawer-count").textContent = `(${count})`;
  $("#cart-subtotal").textContent = money(cartTotal());
  $("#checkout-total").textContent = money(cartTotal());
  $("#open-checkout").disabled = count === 0;
  $("#cart-items").innerHTML = lines.length
    ? lines
        .map(
          ({ product, quantity }) => `
    <div class="cart-line"><div class="cart-thumb color-${escapeHtml(product.color)}" aria-hidden="true">${escapeHtml(product.symbol)}</div><div class="cart-line-info"><span>${escapeHtml(product.category)}</span><strong>${escapeHtml(product.name)}</strong><div class="quantity"><button type="button" data-change="${product.id}" data-delta="-1" aria-label="Remove one ${escapeHtml(product.name)}">−</button><span>${quantity}</span><button type="button" data-change="${product.id}" data-delta="1" aria-label="Add one ${escapeHtml(product.name)}" ${quantity >= Math.min(product.stock, 20) ? "disabled" : ""}>+</button></div></div><div class="cart-line-end"><strong>${money(product.price_cents * quantity)}</strong><button type="button" class="remove" data-remove="${product.id}" aria-label="Remove ${escapeHtml(product.name)}">Remove</button></div></div>`,
        )
        .join("")
    : '<div class="cart-empty"><div>◌</div><h3>Your bag is waiting.</h3><p>Find something that feels like you.</p><button type="button" class="button button-dark" id="browse-from-cart">Browse products</button></div>';
}

function refreshCart() {
  saveCart();
  renderCart();
}
function addToCart(id) {
  const product = productFor(id);
  if (!product || product.stock < 1) return;
  const item = state.cart.find((line) => line.id === id);
  if (item && item.quantity >= Math.min(product.stock, 20)) {
    toast("That is the available quantity for this item.");
    return;
  }
  if (item) item.quantity += 1;
  else state.cart.push({ id, quantity: 1 });
  refreshCart();
  toast(`${product.name} added to your bag`);
}

function reconcileCart() {
  state.cart = state.cart
    .map((item) => {
      const product = productFor(item.id);
      return product
        ? { id: item.id, quantity: Math.min(item.quantity, product.stock, 20) }
        : null;
    })
    .filter((item) => item && item.quantity > 0);
  refreshCart();
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) throw new Error("Catalog unavailable");
    const data = await response.json();
    if (!Array.isArray(data.products))
      throw new Error("Invalid catalog response");
    state.products = data.products;
    reconcileCart();
    renderFilters();
    renderProducts();
  } catch {
    if (!state.products.length) {
      $("#item-count").textContent = "Unavailable";
      $("#products").innerHTML =
        `<div class="empty-results"><span>◌</span><h3>We couldn't load the collection.</h3><p>Check that the API and PostgreSQL are running, then try again.</p><button type="button" id="retry-products">Try again</button></div>`;
    } else {
      toast("Could not refresh products. Please try again.");
    }
  }
}

function openCart() {
  $("#scrim").hidden = false;
  $("#cart-panel").classList.add("open");
  $("#cart-panel").setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
  $("#close-cart").focus();
}
function closeCart() {
  $("#cart-panel").classList.remove("open");
  $("#cart-panel").setAttribute("aria-hidden", "true");
  $("#scrim").hidden = true;
  document.body.classList.remove("drawer-open");
  $("#open-cart").focus();
}

$("#open-cart").addEventListener("click", openCart);
$("#close-cart").addEventListener("click", closeCart);
$("#scrim").addEventListener("click", closeCart);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("#cart-panel").classList.contains("open"))
    closeCart();
});

$("#filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  renderFilters();
  renderProducts();
});
$("#search").addEventListener("input", (event) => {
  state.search = event.target.value.trim();
  renderProducts();
});
$("#products").addEventListener("click", (event) => {
  const add = event.target.closest("[data-add]");
  if (add) addToCart(Number(add.dataset.add));
  if (event.target.closest("#retry-products")) loadProducts();
  if (event.target.closest("#reset-filters")) {
    state.category = "All";
    state.search = "";
    $("#search").value = "";
    renderFilters();
    renderProducts();
  }
});
$("#cart-items").addEventListener("click", (event) => {
  const change = event.target.closest("[data-change]");
  const remove = event.target.closest("[data-remove]");
  if (change) {
    const id = Number(change.dataset.change);
    const item = state.cart.find((line) => line.id === id);
    const product = productFor(id);
    if (item && product) {
      item.quantity = Math.min(
        Math.max(item.quantity + Number(change.dataset.delta), 0),
        product.stock,
        20,
      );
      state.cart = state.cart.filter((line) => line.quantity > 0);
      refreshCart();
    }
  }
  if (remove) {
    state.cart = state.cart.filter(
      (item) => item.id !== Number(remove.dataset.remove),
    );
    refreshCart();
  }
  if (event.target.closest("#browse-from-cart")) {
    closeCart();
    $("#collection").scrollIntoView({ behavior: "smooth" });
  }
});

$("#open-checkout").addEventListener("click", () => {
  closeCart();
  $("#form-error").hidden = true;
  $("#checkout-dialog").showModal();
});
$("#close-checkout").addEventListener("click", () =>
  $("#checkout-dialog").close(),
);
$("#close-success").addEventListener("click", () =>
  $("#success-dialog").close(),
);

$("#checkout-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("#submit-order");
  const errorText = $("#form-error");
  const data = new FormData(form);
  errorText.hidden = true;
  button.disabled = true;
  button.textContent = "Placing your order...";
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: {
          name: data.get("name"),
          email: data.get("email"),
          address: data.get("address"),
        },
        items: state.cart.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
        })),
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 409) await loadProducts();
      throw new Error(result.error || "Could not place the order.");
    }
    state.cart = [];
    refreshCart();
    form.reset();
    $("#checkout-dialog").close();
    $("#success-message").textContent =
      `Demo order #${result.orderId} was saved. Your total was ${money(result.totalCents)}. Thanks for shopping with us!`;
    $("#success-dialog").showModal();
    await loadProducts();
  } catch (error) {
    errorText.textContent = error.message || "Could not place the order.";
    errorText.hidden = false;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Place demo order <span aria-hidden="true">↗</span>';
  }
});

renderCart();
loadProducts();
