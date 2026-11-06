const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// NileGuard AI public Flask backend
const API_BASE_URL = (
  window.NILEGUARD_API_BASE ||
  "https://that-snort-savanna.ngrok-free.dev"
).replace(/\/$/, "");

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

// Automatically bypass the ngrok free-tier browser warning.
async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});

  headers.set("ngrok-skip-browser-warning", "true");

  return fetch(apiUrl(path), {
    ...options,
    headers
  });
}
let transactions = [];
let latestAssessment = null;

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function money(amount, currency = "USD") {
  const value = Number(amount || 0);

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${currency || "USD"} ${value.toFixed(2)}`;
  }
}

function riskClass(level = "") {
  if (level === "High risk") return "risk-high";
  if (level === "Review") return "risk-review";
  if (level === "Low risk") return "risk-low";
  return "risk-unavailable";
}

function riskPill(level) {
  return `<span class="risk-pill ${riskClass(level)}">${escapeHtml(level || "Unavailable")}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function toast(message) {
  const el = $("#toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  setTimeout(() => el.classList.remove("show"), 3500);
}

function navigate(view) {
  $$(".view").forEach(v =>
    v.classList.toggle("active-view", v.id === `view-${view}`)
  );

  $$(".nav-item").forEach(b =>
    b.classList.toggle("active", b.dataset.view === view)
  );

  const active = $(`.nav-item[data-view="${view}"]`);

  if ($("#pageCrumb")) {
    $("#pageCrumb").textContent = active
      ? active.textContent.trim().replace(/\s+\d+$/, "")
      : view;
  }

  $("#sidebar")?.classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$$("[data-view]").forEach(b =>
  b.addEventListener("click", () => navigate(b.dataset.view))
);

$$("[data-goto]").forEach(b =>
  b.addEventListener("click", () => navigate(b.dataset.goto))
);

$("#menuToggle")?.addEventListener("click", () =>
  $("#sidebar")?.classList.add("open")
);

$("#closeSidebar")?.addEventListener("click", () =>
  $("#sidebar")?.classList.remove("open")
);

$("#topAlerts")?.addEventListener("click", () => navigate("alerts"));

$("#dismissBanner")?.addEventListener("click", () =>
  $("#demoBanner")?.remove()
);

// Dashboard transaction rendering
function transactionRow(tx, full = false) {
  const type = tx.type || "Unknown";
  const location = tx.location || "Unknown";

  return `<tr>
    <td>
      <span class="tx-id">${escapeHtml(tx.id || "TXN-NEW")}</span>
      <span class="tx-sub">${escapeHtml(tx.account || "CSV transaction")}</span>
    </td>
    ${full ? `<td>${escapeHtml(tx.account || "CSV upload")}</td>` : ""}
    <td><span class="type-pill">${escapeHtml(type)}</span></td>
    <td><span class="amount">${money(tx.amount, tx.currency)}</span></td>
    ${full ? `<td>${escapeHtml(location)}</td>` : ""}
    <td>${riskPill(tx.risk_level)}</td>
    ${full
      ? `<td><button class="row-link" data-transaction="${escapeHtml(tx.id)}">Analyze →</button></td>`
      : `<td><button class="row-link" data-transaction="${escapeHtml(tx.id)}">Review</button></td>`
    }
  </tr>`;
}

function alertItem(tx) {
  const high = tx.risk_level === "High risk";

  return `<div class="alert-item">
    <div class="alert-mark ${high ? "high" : "review"}">${high ? "⚑" : "◷"}</div>
    <div class="alert-copy">
      <strong>${escapeHtml(tx.id)} · ${money(tx.amount, tx.currency)}</strong>
      <p>${escapeHtml((tx.reasons || [])[0] || "Review transaction context")}</p>
      <div class="alert-meta">
        <span>${escapeHtml(tx.location || "Unknown")}</span>
        <button data-transaction="${escapeHtml(tx.id)}">Inspect →</button>
      </div>
    </div>
  </div>`;
}

function renderTransactions() {
  $("#transactionRows").innerHTML =
    transactions.slice(0, 10).map(tx => transactionRow(tx)).join("");

  $("#allTransactionRows").innerHTML =
    transactions.map(tx => transactionRow(tx, true)).join("");

  $("#metricTotal").textContent = transactions.length;
  $("#metricHigh").textContent =
    transactions.filter(t => t.risk_level === "High risk").length;

  $("#metricReview").textContent =
    transactions.filter(t => t.risk_level === "Review").length;

  const flagged = transactions.filter(t =>
    t.risk_level === "High risk" || t.risk_level === "Review"
  );

  $("#alertQueueCount").textContent = String(flagged.length).padStart(2, "0");

  if ($(".alert-count")) {
    $(".alert-count").textContent = String(flagged.length).padStart(2, "0");
  }

  $("#alertList").innerHTML =
    flagged.slice(0, 4).map(alertItem).join("") ||
    '<p class="tx-sub">No alerts available.</p>';

  $("#fullAlertList").innerHTML =
    flagged.map(tx => `<article class="full-alert-card">
      <div class="alert-card-top">
        ${riskPill(tx.risk_level)}
        <span class="tx-sub">${escapeHtml(tx.id)}</span>
      </div>
      <h3>${money(tx.amount, tx.currency)} ${escapeHtml(tx.type || "")}</h3>
      <p>${escapeHtml((tx.reasons || []).join("; "))}</p>
      <div class="alert-card-foot">
        <span class="tx-sub">${escapeHtml(tx.location || "Unknown")}</span>
        <button class="row-link" data-transaction="${escapeHtml(tx.id)}">Inspect transaction →</button>
      </div>
    </article>`).join("") ||
    '<div class="panel">No alerts found.</div>';

  $$("[data-transaction]").forEach(btn => {
    btn.addEventListener("click", () =>
      loadTransaction(btn.dataset.transaction)
    );
  });
}

function loadTransaction(id) {
  const tx = transactions.find(t => String(t.id) === String(id));
  if (!tx) return;

  latestAssessment = tx;
  navigate("analyze");
  renderResult(tx);
}

// Backend connection status
async function fetchStatus() {
  try {
    const response = await apiFetch("/api/status");
    if (!response.ok) throw new Error("Backend status request failed");

    const status = await response.json();

    $("#sidebarModelLabel").textContent = status.label || "Model status";
    $("#sidebarModelDetail").textContent = status.detail || "";

    $("#metricModel").textContent =
      status.mode === "connected" ? "Connected" : "Unavailable";

    $("#metricModelFoot").textContent =
      status.mode === "connected"
        ? "Trained LSTM artifact loaded"
        : "Model needs attention";

    if (status.mode === "connected") {
      $("#demoBanner").style.display = "none";

      if ($(".pulse")) {
        $(".pulse").style.background = "#24b48a";
      }
    }
  } catch (error) {
    $("#sidebarModelLabel").textContent = "Backend unavailable";
    $("#sidebarModelDetail").textContent =
      "Could not connect to the Flask server.";

    $("#metricModel").textContent = "Offline";
    $("#metricModelFoot").textContent = "Waiting for backend";
  }
}

async function fetchTransactions() {
  try {
    const response = await apiFetch("/api/transactions");
    if (!response.ok) throw new Error("Could not load transactions");

    const payload = await response.json();

    transactions = Array.isArray(payload)
      ? payload
      : (payload.transactions || []);

    renderTransactions();
  } catch (error) {
    transactions = [];
    renderTransactions();
    console.warn("Transaction feed unavailable:", error.message);
  }
}

// Display one transaction assessment
function renderResult(result) {
  $("#emptyResult").classList.add("hidden");
  $("#analysisResult").classList.remove("hidden");

  if (result.error) {
    $("#analysisResult").innerHTML =
      `<div class="result-body"><p>${escapeHtml(result.error)}</p></div>`;
    return;
  }

  const score = Number(result.risk_score || 0);
  const recs = result.recommendations || [];
  const reasons = result.reasons || [];

  $("#analysisResult").innerHTML = `
    <div class="result-body">
      <div class="result-summary">
        <div class="score-ring"><span>${score}%</span></div>
        <div class="score-copy">
          ${riskPill(result.risk_level)}
          <h3>${escapeHtml(result.prediction || "Assessment complete")}</h3>
          <p>Trained LSTM score · not proof of fraud</p>
        </div>
      </div>

      <div class="result-section">
        <h3>Signals to review</h3>
        <ul class="reason-list">
          ${reasons.map(x => `<li>${escapeHtml(x)}</li>`).join("")}
        </ul>
      </div>

      <div class="result-section">
        <h3>Recommended next steps</h3>
        <ul class="recommendation-list">
          ${recs.map(x => `<li>${escapeHtml(x)}</li>`).join("")}
        </ul>
      </div>

      <div class="result-footnote">
        Experimental decision-support output. An alert is not proof of fraud.
        Authorized human review is required.
      </div>

      <button class="secondary-btn" style="margin-top:14px" id="askAboutResult">
        Ask assistant about this result →
      </button>
    </div>`;

  $("#askAboutResult").addEventListener("click", () => {
    navigate("assistant");
    sendChat("Why was this transaction flagged?", result);
  });
}

// Display a batch of CSV predictions
function renderBatchResults(payload) {
  const predictions = payload.predictions || [];

  $("#emptyResult").classList.add("hidden");
  $("#analysisResult").classList.remove("hidden");

  const rows = predictions.slice(0, 100).map(tx => `
    <tr>
      <td>${escapeHtml(tx.transaction_id || tx.id)}</td>
      <td>${money(tx.amount, tx.currency)}</td>
      <td>${escapeHtml(tx.type || "Unknown")}</td>
      <td>${escapeHtml(tx.location || "Unknown")}</td>
      <td><strong>${Number(tx.risk_score).toFixed(2)}%</strong></td>
      <td>${riskPill(tx.risk_level)}</td>
      <td>${escapeHtml(tx.prediction)}</td>
    </tr>
  `).join("");

  $("#analysisResult").innerHTML = `
    <div class="result-body">
      <div class="result-section">
        <h3>CSV analysis completed</h3>
        <p>
          ${payload.uploaded_rows} transactions uploaded.
          ${payload.predictions_count} sequence assessments generated.
        </p>
      </div>

      <div class="field-grid" style="margin:16px 0;">
        <div class="panel">
          <h3>${payload.alert_count}</h3>
          <p>Potential fraud alerts</p>
        </div>
        <div class="panel">
          <h3>${payload.high_risk_count}</h3>
          <p>High-risk assessments</p>
        </div>
        <div class="panel">
          <h3>${payload.review_count}</h3>
          <p>Requiring review</p>
        </div>
      </div>

      <div class="result-section">
        <h3>Transaction assessments</h3>
        <p>Each assessment represents the final transaction in a 10-row window.</p>
        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Amount</th>
                <th>Type</th>
                <th>Region</th>
                <th>Risk score</th>
                <th>Risk level</th>
                <th>Prediction</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${predictions.length > 100
          ? `<p class="tx-sub">Showing the first 100 of ${predictions.length} assessments.</p>`
          : ""}
      </div>

      <div class="result-footnote">
        ${escapeHtml(payload.notice || "Experimental LSTM decision-support output.")}
        Human review is required. Do not automatically block payments.
      </div>

      <button class="secondary-btn" style="margin-top:14px" id="askAboutResult">
        Ask assistant about the latest assessment →
      </button>
    </div>`;

  $("#askAboutResult").addEventListener("click", () => {
    navigate("assistant");
    sendChat(
      "Explain the latest transaction assessment and recommend next steps.",
      latestAssessment
    );
  });
}

// Reset CSV analysis
$("#analyzeForm").addEventListener("reset", () => {
  setTimeout(() => {
    $("#analysisResult").classList.add("hidden");
    $("#emptyResult").classList.remove("hidden");
    latestAssessment = null;
  }, 0);
});

// Upload CSV and request LSTM predictions
$("#analyzeForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const fileInput = $("#csvFile");
  const button = $("#analyzeButton");
  const file = fileInput.files[0];

  if (!file) {
    toast("Please select a CSV file first.");
    return;
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    toast("Only CSV files are accepted.");
    return;
  }

  const formData = new FormData(form);

  button.disabled = true;
  button.textContent = "Analyzing transaction history...";

  try {
    const response = await apiFetch("/api/predict-csv", {
      method: "POST",
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "CSV analysis failed.");
    }

    if (!result.predictions || result.predictions.length === 0) {
      throw new Error("The backend returned no transaction assessments.");
    }

    latestAssessment = result.predictions[result.predictions.length - 1];

    renderBatchResults(result);

    // Refresh dashboard and alerts using the latest uploaded assessments.
    transactions = result.predictions;
    renderTransactions();

    toast("LSTM transaction analysis completed.");
  } catch (error) {
    console.error("CSV analysis error:", error);
    toast(error.message || "Could not connect to the Flask backend.");
  } finally {
    button.disabled = false;
    button.textContent = "Analyze transaction history";
  }
});

// Dashboard search
$("#transactionSearch")?.addEventListener("input", event => {
  const query = event.target.value.toLowerCase();

  const filtered = transactions.filter(tx =>
    `${tx.id} ${tx.type} ${tx.location}`.toLowerCase().includes(query)
  );

  $("#allTransactionRows").innerHTML =
    filtered.map(tx => transactionRow(tx, true)).join("");

  $$("[data-transaction]").forEach(btn => {
    btn.addEventListener("click", () =>
      loadTransaction(btn.dataset.transaction)
    );
  });
});

// Assistant chat
function addMessage(message, who) {
  const wrap = document.createElement("div");
  wrap.className = `message ${who === "user" ? "user-message" : "assistant-message"}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = who === "user" ? "You" : "✧";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message;

  wrap.append(avatar, bubble);

  $("#chatMessages").append(wrap);
  $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;

  return bubble;
}

async function sendChat(message, context = null) {
  if (!message.trim()) return;

  addMessage(message, "user");
  $("#chatInput").value = "";

  const replyBubble = addMessage("Thinking...", "assistant");

  try {
    const response = await 	apiFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        transaction: context || latestAssessment || {}
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Assistant request failed.");
    }

    replyBubble.textContent =
      data.reply || "I could not prepare an answer.";
  } catch (error) {
    replyBubble.textContent =
      `I could not reach the backend: ${error.message}`;
  }

  $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;
}

$("#chatForm")?.addEventListener("submit", event => {
  event.preventDefault();
  sendChat($("#chatInput").value);
});

$$("[data-question]").forEach(button => {
  button.addEventListener("click", () =>
    sendChat(button.dataset.question)
  );
});

// Initialize the application
fetchStatus();
fetchTransactions();
