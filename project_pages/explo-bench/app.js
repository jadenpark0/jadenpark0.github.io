"use strict";
const DATA = window.BENCH_DATA;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const pct = (v, digits = 1) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const compact = (v) =>
  v == null
    ? "—"
    : v >= 1e12
      ? `${(v / 1e12).toFixed(1)}T`
      : v >= 1e9
        ? `${(v / 1e9).toFixed(1)}B`
        : v >= 1e6
          ? `${(v / 1e6).toFixed(2)}M`
          : v >= 1e3
            ? `${(v / 1e3).toFixed(1)}K`
            : v.toFixed(0);
const COLORS = {
  qwen: "#8770c4",
  zai: "#4275c7",
  moonshot: "#1f947e",
  google: "#d2a044",
  meta: "#417ea1",
  minimax: "#c77358",
  mistral: "#df8740",
  deepseek: "#598ddd",
  nvidia: "#809b44",
  ibm: "#71889c",
  tencent: "#4ea5a4",
  redhat: "#bd615e",
  thinkingmachines: "#8d737e",
  allenai: "#bb799c",
  bytedance: "#577065",
};
const PROVIDERS = {
  qwen: "Qwen",
  zai: "Z.ai",
  moonshot: "Moonshot",
  google: "Google",
  meta: "Meta",
  minimax: "MiniMax",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  nvidia: "NVIDIA",
  ibm: "IBM",
  tencent: "Tencent",
  redhat: "Red Hat",
  thinkingmachines: "Thinking Machines",
  allenai: "AI2",
  bytedance: "ByteDance",
};
const DIFFICULTIES = ["easier", "easy", "medium", "hard", "harder"];
const DEMANDS = ["lower", "low", "medium", "high", "higher"];
const DIST_COLORS = ["#b4d8d2", "#70bcb0", "#319487", "#17685f", "#103e39"];
let figureMode = "reasoning",
  tableMode = "all",
  sizeMode = "all",
  sortKey = "success",
  sortDirection = "descending",
  difficulty = "harder",
  sample = 0;
const cap = (s) => (s === "all" ? "Combined" : s[0].toUpperCase() + s.slice(1));
const settingText = (m, viewMode = figureMode) =>
  viewMode === "all"
    ? `Default: ${(m.settings.default || []).join(", ")} · Reasoning: ${(m.settings.reasoning || []).join(", ")}`
    : (m.settings[viewMode] || []).join(", ");
const settingNotes = (m, viewMode = figureMode) =>
  viewMode === "all"
    ? ["default", "reasoning"]
        .map((v) => ((m.setting_notes?.[v] || []).length ? `${cap(v)}: ${m.setting_notes[v].join(" ")}` : ""))
        .filter(Boolean)
        .join(" ")
    : (m.setting_notes?.[viewMode] || []).join(" ");
const logo = (m) => `<img class="model-logo" src="assets/logos/${esc(m.org)}.svg" alt="${esc(PROVIDERS[m.org])} logo" width="22" height="22">`;

const budgetExhaustionModels = new Set(["DeepSeek-V4-Flash", "Qwen3.6-27B"]);
function successFit(key, mode) {
  if (mode !== "reasoning") return DATA.configurations[mode].regressions[key];
  const rows = DATA.configurations[mode].models.filter((m) => !budgetExhaustionModels.has(m.model) && m[key] > 0 && m.success != null);
  const xs = rows.map((m) => Math.log10(m[key])),
    ys = rows.map((m) => m.success),
    n = rows.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n,
    my = ys.reduce((a, b) => a + b, 0) / n;
  const xx = xs.reduce((a, x) => a + (x - mx) ** 2, 0),
    yy = ys.reduce((a, y) => a + (y - my) ** 2, 0),
    xy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  return { slope: xy / xx, intercept: my - (xy / xx) * mx, r2: (xy * xy) / (xx * yy), n };
}

function tooltip(model, anchor, event, viewMode = figureMode) {
  const t = $("#plot-tooltip");
  t.innerHTML = `<strong>${esc(model.name)}</strong><div class="tt-setting">${esc(cap(viewMode))} · ${esc(settingText(model, viewMode))}</div>${
    settingNotes(model, viewMode) ? `<div class="tt-note">${esc(settingNotes(model, viewMode))}</div>` : ""
  }<dl><dt>Evaluations</dt><dd>${model.n}</dd><dt>Success rate</dt><dd>${pct(model.success)}</dd><dt>Exploration error</dt><dd>${pct(
    model.exploration,
    2
  )}</dd><dt>Exploitation error</dt><dd>${pct(model.exploitation, 2)}</dd><dt>Budget on success</dt><dd>${pct(
    model.budget
  )}</dd><dt>Total parameters</dt><dd>${compact(model.parameters)}</dd><dt>Recorded turns</dt><dd>${model.turns.toLocaleString()}</dd></dl>`;
  t.hidden = false;
  const rect = anchor.getBoundingClientRect(),
    box = t.getBoundingClientRect();
  let x = event?.clientX ?? rect.right,
    y = event?.clientY ?? rect.top;
  t.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - box.width - 8))}px`;
  t.style.top = `${Math.max(8, Math.min(y + 14, window.innerHeight - box.height - 8))}px`;
}
function wirePoints(container, rows, viewMode = figureMode) {
  container.querySelectorAll(".dot").forEach((el) => {
    const model = rows[Number(el.dataset.index)];
    el.addEventListener("pointerenter", (e) => tooltip(model, el, e, viewMode));
    el.addEventListener("pointermove", (e) => tooltip(model, el, e, viewMode));
    el.addEventListener("pointerleave", () => {
      $("#plot-tooltip").hidden = true;
    });
    el.addEventListener("focus", () => tooltip(model, el, undefined, viewMode));
    el.addEventListener("blur", () => {
      $("#plot-tooltip").hidden = true;
    });
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      tooltip(model, el, e, viewMode);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") $("#plot-tooltip").hidden = true;
    });
  });
}
function frontier(rows, key, yKey = "success") {
  const dominates = (b, a) =>
    b[key] <= a[key] && (yKey === "success" ? b[yKey] >= a[yKey] : b[yKey] <= a[yKey]) && (b[key] < a[key] || b[yKey] !== a[yKey]);
  return rows.filter((a) => !rows.some((b) => b !== a && dominates(b, a))).sort((a, b) => a[key] - b[key]);
}
function logRange(values, ceiling = Infinity) {
  const low = Math.log10(Math.min(...values)),
    high = Math.log10(Math.max(...values));
  const padding = Math.max(0.045, (high - low) * 0.07);
  return [10 ** (low - padding), Math.min(ceiling, 10 ** (high + padding))];
}
function logTicks(lo, hi, small) {
  const candidates = [];
  for (let exponent = Math.floor(Math.log10(lo)); exponent <= Math.ceil(Math.log10(hi)); exponent++) {
    for (const multiplier of [1, 2, 3, 5]) {
      const value = multiplier * 10 ** exponent;
      if (value >= lo && value <= hi) candidates.push(value);
    }
  }
  const maxTicks = small ? 4 : 7;
  if (candidates.length <= maxTicks) return candidates;
  return Array.from({ length: maxTicks }, (_, i) => candidates[Math.round((i * (candidates.length - 1)) / (maxTicks - 1))]);
}
function scatter(selector, key, label, type = "regression", yKey = "success", viewMode = figureMode) {
  const models = DATA.configurations[viewMode].models;
  const rows = models.filter((m) => m[key] != null && m[key] > 0 && m[yKey] != null && (yKey === "success" || m[yKey] > 0));
  const root = $(selector),
    W = Math.max(240, Math.min(620, Math.floor(root.clientWidth))),
    H = 350,
    L = 70,
    R = 20,
    T = type === "regression" ? 20 : 44,
    B = 58;
  const small = W < 420,
    yLabel = yKey === "success" ? "Success rate" : `${cap(yKey)} error`;
  root.style.aspectRatio = `${W} / ${H}`;
  const [lo, hi] = logRange(
      rows.map((m) => m[key]),
      type === "regression" ? 1 : Infinity
    ),
    ticks = logTicks(lo, hi, small);
  const x = (v) => L + ((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (W - L - R);
  const yValues = rows.map((m) => m[yKey]);
  const [yLo, yHi] =
    yKey === "success"
      ? [Math.max(0, Math.floor((Math.min(...yValues) - 0.02) * 10) / 10), Math.min(1, Math.ceil((Math.max(...yValues) + 0.02) * 10) / 10)]
      : logRange(yValues, 1);
  const y = (v) =>
    H - B - (yKey === "success" ? (v - yLo) / (yHi - yLo) : (Math.log10(v) - Math.log10(yLo)) / (Math.log10(yHi) - Math.log10(yLo))) * (H - B - T);
  const yTicks = yKey === "success" ? Array.from({ length: 5 }, (_, i) => yLo + ((yHi - yLo) * i) / 4) : logTicks(yLo, yHi, false);
  const axisLabel = small
    ? key === "parameters"
      ? "Parameters (log)"
      : key === "output_tokens_per_turn"
        ? "Output / turn (log)"
        : `${label} (log)`
    : `${label} · log scale`;
  const edge = type === "regression" ? [] : frontier(rows, key, yKey),
    edgeModels = new Set(edge.map((m) => m.model));
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" data-x-key="${key}" data-y-key="${yKey}" data-mode="${viewMode}" data-frontier-cohort="all" data-x-min="${lo}" data-x-max="${hi}" data-y-min="${yLo}" data-y-max="${yHi}" aria-label="${esc(
    label
  )} versus ${esc(yLabel)}, ${esc(viewMode)} mode. Interactive model points follow."><title>${esc(yLabel)} vs. ${esc(label)}</title>`;
  for (const v of yTicks)
    svg += `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="#e8eeea" stroke-width="1"/><text x="${L - 10}" y="${
      y(v) + 5
    }" text-anchor="end" font-size="14" fill="#66786d">${pct(v, 0)}</text>`;
  for (const v of ticks)
    svg += `<line x1="${x(v)}" y1="${T}" x2="${x(v)}" y2="${H - B}" stroke="#edf1ee" stroke-dasharray="3 4"/><text x="${x(v)}" y="${
      H - B + 25
    }" text-anchor="middle" font-size="14" fill="#66786d">${
      type === "regression" ? pct(v, 0) : key === "parameters" ? compact(v).replace(/\.0+(?=[KMBT]$)/, "") : compact(v)
    }</text>`;
  svg += `<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#cfdbd2"/><text x="${(L + W - R) / 2}" y="${
    H - 6
  }" text-anchor="middle" font-size="15" fill="#607467">${esc(axisLabel)}</text><text x="17" y="${(T + H - B) / 2}" transform="rotate(-90 17 ${
    (T + H - B) / 2
  })" text-anchor="middle" font-size="15" fill="#607467">${esc(yLabel)}${yKey === "success" ? "" : " (log)"}</text>`;
  if (type === "regression") {
    const f = successFit(key, viewMode);
    let path = "";
    for (let i = 0; i <= 150; i++) {
      const xx = lo * (hi / lo) ** (i / 150),
        yy = f.intercept + f.slope * Math.log10(xx);
      if (yy >= yLo && yy <= yHi) path += `${path ? "L" : "M"}${x(xx).toFixed(2)},${y(yy).toFixed(2)} `;
    }
    svg += `<path d="${path}" fill="none" stroke="#667c6f" stroke-width="1.5" stroke-dasharray="5 5"/>`;
  } else {
    svg += `<path class="frontier" d="${edge
      .map((m, i) => `${i ? "L" : "M"}${x(m[key])},${y(m[yKey])}`)
      .join(" ")}" fill="none" stroke="#0f766e" stroke-width="1.8" stroke-dasharray="5 5"/>`;
  }
  rows.forEach((m, i) => {
    const aria = `${m.name}. ${cap(viewMode)}. ${settingText(m, viewMode)}. ${yLabel} ${pct(m[yKey], 2)}. ${label} ${
        type === "regression" ? pct(m[key], 2) : compact(m[key])
      }. ${m.n} evaluations. Limit-stop rate ${pct(m.failure_rate)}.`,
      cx = x(m[key]),
      cy = y(m[yKey]),
      onEdge = edgeModels.has(m.model);
    svg += `<g class="model-marker" data-org="${esc(m.org)}" style="--marker-color:${COLORS[m.org]}">${
      onEdge ? `<circle class="frontier-ring" cx="${cx}" cy="${cy}" r="12"/>` : ""
    }<circle class="dot" data-index="${i}" data-model="${esc(m.model)}" data-frontier="${onEdge}" data-limit-stops="${
      m.failures
    }" cx="${cx}" cy="${cy}" r="9" tabindex="0" role="img" aria-label="${esc(aria)}"><title>${esc(
      aria
    )}</title></circle><image class="marker-logo" href="assets/logos/${esc(m.org)}.svg" x="${cx - 7}" y="${
      cy - 7
    }" width="14" height="14" aria-hidden="true"/></g>`;
  });
  root.innerHTML = svg + "</svg>";
  wirePoints(root, rows, viewMode);
}
function renderCharts() {
  $$(".figure-mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === figureMode)));
  $$(".size-mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === sizeMode)));
  $("#coverage").textContent = `${DATA.configurations[figureMode].models.length} models · ${figureMode === "all" ? 500 : 250} evaluations per model`;
  for (const key of ["exploration", "exploitation"]) {
    scatter(`#${key}-plot`, key, `${cap(key)} error`);
    $(`#r2-${key}`).textContent = `R² = ${successFit(key, figureMode).r2.toFixed(3)}`;
    scatter(`#size-${key}-plot`, "parameters", "Total parameters", "pareto", key, sizeMode);
    scatter(`#token-${key}-plot`, "output_tokens_per_turn", "Mean output tokens per turn", "pareto", key, "reasoning");
  }
}
function renderTable() {
  $$(".table-mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === tableMode)));
  $("#table-coverage").textContent = `${DATA.configurations[tableMode].models.length} models · ${
    tableMode === "all" ? 500 : 250
  } evaluations per model`;
  $("#mode-note").textContent =
    tableMode === "all"
      ? "Combined uses 250 default and 250 reasoning evaluations per model on the same 250 maps. Each mode uses the recorded native configuration."
      : `${cap(
          tableMode
        )} uses 250 maps per model. Labels distinguish native reasoning controls from asking for a rationale in the prompt. Hover over a setting or a model point for details.`;
  const original = DATA.configurations[tableMode].models;
  const rank = new Map(original.map((m, i) => [m.model, i + 1]));
  const rows = [...original].sort((a, b) => {
    const av = a[sortKey],
      bv = b[sortKey];
    if (av == null) return bv == null ? 0 : 1;
    if (bv == null) return -1;
    const delta = typeof av === "string" ? av.localeCompare(bv) : av - bv;
    return delta * (sortDirection === "ascending" ? 1 : -1) || a.name.localeCompare(b.name);
  });
  $("#leaderboard-table tbody").innerHTML = rows
    .map(
      (m) =>
        `<tr class="${rank.get(m.model) <= 3 ? "top-row" : ""}" data-model="${esc(m.model)}"><td class="rank-cell">${String(
          rank.get(m.model)
        ).padStart(2, "0")}</td><td><div class="model-cell">${logo(m)}<span class="model-name">${esc(m.name)}${
          tableMode === "all" ? "" : `<span class="setting" title="${esc(settingNotes(m, tableMode))}">${esc(settingText(m, tableMode))}</span>`
        }</span></div></td><td class="success-value metric-number">${pct(m.success)}</td><td class="metric-number">${pct(
          m.exploration,
          2
        )}</td><td class="metric-number">${pct(m.exploitation, 2)}</td><td class="metric-number">${pct(m.budget)}</td></tr>`
    )
    .join("");
  $$("#leaderboard-table [data-sort]").forEach((b) => {
    const selected = b.dataset.sort === sortKey;
    b.parentElement.setAttribute("aria-sort", selected ? sortDirection : "none");
    b.querySelector("span").textContent = selected ? (sortDirection === "ascending" ? "↑" : "↓") : "↕";
  });
}
function distribution(values, labels, totals, remaining = false) {
  const sum = values.reduce((a, b) => a + b, 0),
    total = totals.reduce((a, b) => a + b, 0);
  const rates = values.map((v, i) => (remaining ? (sum ? v / sum : 0) : totals[i] ? v / totals[i] : 0));
  const short = labels === DIFFICULTIES ? ["Easier", "Easy", "Med", "Hard", "Harder"] : ["Lower", "Low", "Med", "High", "Higher"];
  const description = values
    .map(
      (v, i) =>
        `${cap(labels[i])}: ${v}/${remaining ? sum : totals[i]} ${remaining ? "remaining trajectories" : "evaluated trajectories"} (${pct(rates[i])})`
    )
    .join("; ");
  let insight;
  if (remaining) {
    const drop = totals.map((v, i) => (total ? v / total : 0) - rates[i]);
    const i = drop.indexOf(Math.max(...drop));
    insight = !sum
      ? "No trajectories remain"
      : Math.max(...drop) < 0.001
        ? "Balanced across all five levels"
        : `${cap(labels[i])}: ${pct(rates[i])} remaining vs. ${pct(totals[i] / total)} evaluated`;
  } else {
    const i = rates.indexOf(Math.max(...rates));
    insight = `Highest: ${cap(labels[i])} · ${values[i]}/${totals[i]} (${pct(rates[i])})`;
  }
  const bars = remaining
    ? rates.map((v, i) => `<span style="width:${v * 100}%;--color:${DIST_COLORS[i]}"></span>`).join("")
    : rates.map((v, i) => `<span class="distribution-bin"><i style="width:${v * 100}%;--color:${DIST_COLORS[i]}"></i></span>`).join("");
  return `<div class="distribution ${remaining ? "remaining-distribution" : "failure-distribution"}" role="img" aria-label="${esc(
    description
  )}" data-denominators="${totals.join(",")}" title="${esc(description)}">${bars}</div><div class="distribution-values">${rates
    .map((v, i) => `<span>${short[i]}<b>${pct(v, 0)}</b></span>`)
    .join("")}</div><span class="distribution-insight">${esc(insight)}</span>`;
}
function renderFailures() {
  const rows = DATA.configurations.reasoning.models.filter((m) => m.failures > 0).sort((a, b) => b.failures - a.failures);
  $("#failure-table tbody").innerHTML = rows
    .map(
      (m) =>
        `<tr data-model="${esc(m.model)}"><td><div class="model-cell">${logo(m)}<span class="model-name">${esc(
          m.name
        )}</span></div></td><td class="metric-number"><strong>${pct(m.failure_rate)}</strong></td><td class="metric-number">${pct(
          m.clean_success,
          0
        )}</td><td class="metric-number">${m.context_failures}</td><td class="metric-number">${m.output_failures}</td></tr>`
    )
    .join("");
  const rate = (id) => pct(rows.find((m) => m.model === id).failure_rate);
  const models = DATA.configurations.reasoning.models;
  const hunyuan = models.find((m) => m.model === "Hunyuan-A13B-Instruct");
  const totalFailures = models.reduce((sum, m) => sum + m.failures, 0);
  const hardFailures = models.reduce((sum, m) => sum + m.failure_difficulty[3] + m.failure_difficulty[4], 0);
  $("#failure-takeaway").innerHTML = `<li><strong>Budget failures stop more than half of the reasoning runs</strong> for DeepSeek V4 Flash (${rate(
    "DeepSeek-V4-Flash"
  )}) and Qwen 3.6 27B (${rate(
    "Qwen3.6-27B"
  )}). All of these failures are due to output-token limits.</li><li><strong>Hunyuan A13B hits context limits in ${rate(
    "Hunyuan-A13B-Instruct"
  )} of its runs.</strong> It generates an average of ${Math.round(
    hunyuan.output_tokens_per_turn
  ).toLocaleString()} output tokens per turn—well below the single-turn output-token limit—but reasoning traces accumulate across turns and can exhaust the context window.</li><li><strong>Hard and harder task DAGs account for ${pct(
    hardFailures / totalFailures
  )} of all budget failures</strong> (${hardFailures}/${totalFailures}).</li>`;
}
function renderMode() {
  renderCharts();
  renderTable();
  renderFailures();
  $("#plot-tooltip").hidden = true;
}
function renderMap() {
  const m = DATA.maps[difficulty].samples[sample];
  $$(".difficulty-mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.difficulty === difficulty)));
  $("#sample-count").textContent = `${sample + 1} / 5`;
  $("#map-heading").textContent = `${cap(difficulty)} task DAG`;
  $("#map-info").textContent = `${DATA.maps[difficulty].nodes.join("–")} nodes · ${m.open_cells} open cells · ${m.width} × ${m.height} grid`;
  $("#map-image").src = m.image;
  $("#map-image").alt = `${cap(difficulty)} task-DAG map with ${m.open_cells} open cells and ${
    DATA.maps[difficulty].nodes[0]
  } task nodes. Grid and task graph rendered using the benchmark visualizer.`;
  $("#map-caption").textContent = `Random sample ${sample + 1} of 5 · seed ${m.seed}.`;
  $$("#sample-dots button").forEach((button, i) => button.setAttribute("aria-pressed", String(i === sample)));
}
function renderDemos() {
  const titles = {
    successful: "Goal discovered first, then completed efficiently",
    poor: "A budget exhausted without success",
    "high-errors": "Both error curves accumulate",
  };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("#demo-list").innerHTML = DATA.demos
    .map(
      (d, i) =>
        `<article class="demo-card"><div class="demo-head"><div><h3>${String(i + 3).padStart(2, "0")} / ${titles[d.slug]}</h3><p>${esc(
          d.name
        )} · ${esc(d.prompt)} · ${esc(d.setting)}<br>${cap(d.difficulty)} DAG · ${cap(d.demand)} exploration</p>${
          d.slug === "successful"
            ? `<p class="demo-milestones">Goal discovered first at step <strong>${d.goal_discovery_step}</strong> → prerequisites resolved → goal activated at step <strong>${d.goal_activation_step}</strong>.</p>`
            : ""
        }</div><span class="badge ${d.success ? "" : "failed"}">${d.success ? "Success" : "Unsuccessful"}</span></div><img class="demo-image" src="${
          reduced ? d.poster : d.image
        }?rev=shared-layout" data-gif="${d.image}?rev=shared-layout" data-poster="${d.poster}?rev=shared-layout" alt="${esc(titles[d.slug])}: ${esc(
          d.name
        )} on a ${d.difficulty} task DAG with ${
          d.demand
        } exploration demand; grid, dependency graph, and cumulative errors." loading="lazy"><div class="demo-stats"><span>Steps <strong>${
          d.steps
        } / ${d.hidden_budget}</strong></span><span>Budget <strong>${pct(
          d.steps / d.hidden_budget
        )}</strong></span><span>Exploration errors <strong>${d.exploration_errors}</strong></span><span>Exploitation errors <strong>${
          d.exploitation_errors
        }</strong></span><button class="demo-toggle" data-paused="${reduced}" aria-label="${reduced ? "Play" : "Pause"} ${esc(
          titles[d.slug]
        )} animation">${reduced ? "Play animation" : "Pause animation"}</button></div></article>`
    )
    .join("");
  $$(".trajectory-comparison .demo-image").forEach((img) => {
    img.src = reduced ? img.dataset.poster : img.dataset.gif;
    const b = img.closest(".demo-card").querySelector(".demo-toggle");
    b.dataset.paused = String(reduced);
    b.textContent = reduced ? "Play animation" : "Pause animation";
    b.setAttribute("aria-label", b.textContent);
  });
  $$(".demo-toggle").forEach((b) =>
    b.addEventListener("click", () => {
      const paused = b.dataset.paused === "true",
        img = b.closest("article").querySelector("img");
      img.src = paused ? img.dataset.gif : img.dataset.poster;
      b.dataset.paused = String(!paused);
      b.textContent = paused ? "Pause animation" : "Play animation";
      b.setAttribute("aria-label", b.textContent);
    })
  );
}
function takeaways() {
  const fits = DATA.configurations.all.regressions;
  const findings = [
    [
      "Exploration and exploitation errors are strongly correlated with success.",
      `Success versus log error rate yields R² = ${fits.exploration.r2.toFixed(3)} for exploration error and ${fits.exploitation.r2.toFixed(
        3
      )} for exploitation error. Since our metric only counts actions that no effective policy would take as errors, a low error rate need not lead to a higher success rate.`,
    ],
    [
      "Our metric reveals distinct agent behaviors beyond success rate.",
      "HY3 and GPT-OSS-120B both succeed, but make different types of errors. This suggests that certain models are better at exploration than exploitation, and vice versa.",
    ],
    [
      "Reasoning or more output tokens do not necessarily reduce errors.",
      "Longer reasoning does not consistently produce better exploration or exploitation. We show in our paper that a compact memory harness significantly improves performance.",
    ],
    [
      "Excessive reasoning can derail task success in long-horizon tasks.",
      "Agents retain their own action and reasoning traces across many turns in long-horizon tasks. Excessive reasoning can derail subsequent reasoning by filling the context with uninformative and repetitive information.",
    ],
  ];
  $("#takeaways").innerHTML = findings.map(([title, body]) => `<li><div><strong>${esc(title)}</strong>${esc(body)}</div></li>`).join("");
}
function initialize() {
  if (!DATA) {
    $("#coverage").textContent = "Results could not be loaded. Please reload the page.";
    return;
  }
  const orgs = [...new Set(DATA.configurations.all.models.map((m) => m.org))];
  $("#provider-legend").innerHTML = orgs
    .map((o) => `<span><img src="assets/logos/${esc(o)}.svg" width="18" height="18" alt="">${PROVIDERS[o]}</span>`)
    .join("");
  $("#difficulty-table tbody").innerHTML = DIFFICULTIES.map((d) => {
    const m = DATA.maps[d];
    return `<tr><td>${cap(d)}</td><td>${m.nodes.join("–")}</td><td>${m.average_open.toFixed(1)}</td><td>${m.open_range.join(
      "–"
    )}</td><td>${m.average_cells.toFixed(1)}</td></tr>`;
  }).join("");
  for (const [scope, select, render] of [
    [
      "figure",
      (value) => {
        figureMode = value;
      },
      renderCharts,
    ],
    [
      "table",
      (value) => {
        tableMode = value;
      },
      renderTable,
    ],
    [
      "size",
      (value) => {
        sizeMode = value;
      },
      renderCharts,
    ],
  ])
    $$("." + scope + "-mode button").forEach((b) =>
      b.addEventListener("click", () => {
        select(b.dataset.mode);
        render();
        $("#plot-tooltip").hidden = true;
      })
    );
  $$("#leaderboard-table [data-sort]").forEach((b) =>
    b.addEventListener("click", () => {
      const key = b.dataset.sort;
      sortDirection = sortKey === key ? (sortDirection === "ascending" ? "descending" : "ascending") : key === "success" ? "descending" : "ascending";
      sortKey = key;
      renderTable();
    })
  );
  $$(".difficulty-mode button").forEach((b) =>
    b.addEventListener("click", () => {
      difficulty = b.dataset.difficulty;
      sample = 0;
      renderMap();
    })
  );
  $("#previous-map").addEventListener("click", () => {
    sample = (sample + 4) % 5;
    renderMap();
  });
  $("#next-map").addEventListener("click", () => {
    sample = (sample + 1) % 5;
    renderMap();
  });
  $("#sample-dots").innerHTML = Array.from(
    { length: 5 },
    (_, i) => `<button data-sample="${i}" aria-label="Show map example ${i + 1} of 5" aria-pressed="${i === 0}"><span></span></button>`
  ).join("");
  $$("#sample-dots button").forEach((button) =>
    button.addEventListener("click", () => {
      sample = Number(button.dataset.sample);
      renderMap();
    })
  );
  $("#copy-bibtex").addEventListener("click", async () => {
    const text = $("#bibtex").textContent;
    try {
      await navigator.clipboard.writeText(text);
      $("#copy-bibtex").textContent = "Copied";
      setTimeout(() => {
        $("#copy-bibtex").textContent = "Copy BibTeX";
      }, 1800);
    } catch {
      const selection = window.getSelection(),
        range = document.createRange();
      range.selectNodeContents($("#bibtex"));
      selection.removeAllRanges();
      selection.addRange(range);
      $("#copy-bibtex").textContent = "Citation selected";
    }
  });
  document.addEventListener("click", () => {
    $("#plot-tooltip").hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $("#plot-tooltip").hidden = true;
  });
  window.addEventListener(
    "scroll",
    () => {
      $("#plot-tooltip").hidden = true;
    },
    { passive: true }
  );
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderCharts, 100);
  });
  renderMode();
  renderMap();
  renderDemos();
  takeaways();
}
initialize();
