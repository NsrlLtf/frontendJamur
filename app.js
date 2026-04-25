// ============================================================
//  KONFIGURASI
// ============================================================
const SUPABASE_URL   =   "https://hxkwywjdndqlobvcbxei.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4a3d5d2pkbmRxbG9idmNieGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNDg2MTUsImV4cCI6MjA5MjYyNDYxNX0.SvU3p-SH9n7KlViSC2bngI3zAca_SYq3GIQjYBFJ_0I";   // anon key (bukan service_role)

// ── Supabase Client (via CDN, tambahkan di index.html) ──────
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── MQTT Client (tidak berubah) ──────────────────────────────
const mqttClient = new MQTTClient();

// ── State ────────────────────────────────────────────────────
let sensorData = [];
let currentDateForCSV = new Date().toISOString().slice(0, 10);

// ============================================================
//  SUPABASE: Ambil histori 24 jam terakhir
// ============================================================
async function loadHistoryFromSupabase() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("sensor_logs")
    .select("created_at, temperature1, temperature2, humidity1, humidity2, soil1, soil2, relay_number, mode")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[Supabase] Gagal ambil data:", error.message);
    return;
  }

  sensorData = data.map(row => {
    const date = new Date(row.created_at);
    const time = date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    const suhu  = ((row.temperature1 + row.temperature2) / 2).toFixed(1);
    const udara = ((row.humidity1    + row.humidity2)    / 2).toFixed(1);
    const tanah = Math.round((row.soil1 + row.soil2) / 2);
    const letter = row.relay_number === 1 ? "J" : row.relay_number === 2 ? "T" : "-";
    const pompa  = row.relay_number === 0 ? "-" : `${letter}(${row.mode})`;
    return { time, suhu, udara, tanah, pompa };
  });

  console.log("[Supabase] Data dimuat:", sensorData.length, "entri");
  renderTable("history-table", 6);
  renderTable("full-history-table");
  if (document.getElementById("suhu").classList.contains("active"))      initSuhuChart();
  if (document.getElementById("kelembaban").classList.contains("active")) initKelembabanChart();
}

// ============================================================
//  SUPABASE: Realtime subscription (opsional tapi direkomendasikan)
//  Setiap kali ESP32 INSERT baris baru, tabel otomatis refresh
// ============================================================
function subscribeSupabaseRealtime() {
  db.channel("sensor_logs_changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "sensor_logs" },
      (payload) => {
        console.log("[Supabase Realtime] Baris baru:", payload.new);

        const row  = payload.new;
        const date = new Date(row.created_at);
        const time = date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
        const suhu  = ((row.temperature1 + row.temperature2) / 2).toFixed(1);
        const udara = ((row.humidity1    + row.humidity2)    / 2).toFixed(1);
        const tanah = Math.round((row.soil1 + row.soil2) / 2);
        const letter = row.relay_number === 1 ? "J" : row.relay_number === 2 ? "T" : "-";
        const pompa  = row.relay_number === 0 ? "-" : `${letter}(${row.mode})`;

        sensorData.push({ time, suhu, udara, tanah, pompa });

        renderTable("history-table", 6);
        renderTable("full-history-table");
      }
    )
    .subscribe();
}

// ============================================================
//  Semua kode di bawah ini TIDAK BERUBAH dari app.js asli Anda
// ============================================================

// ── Navbar toggle ────────────────────────────────────────────
const toggleBtn  = document.getElementById("navbar-toggle");
const mobileMenu = document.getElementById("mobile-menu");
const overlay    = document.createElement("div");
overlay.className = "overlay";
document.body.appendChild(overlay);

toggleBtn.addEventListener("click", () => {
  toggleBtn.classList.toggle("active");
  mobileMenu.classList.toggle("active");
  overlay.classList.toggle("active");
  document.body.style.overflow = mobileMenu.classList.contains("active") ? "hidden" : "";
});
overlay.addEventListener("click", () => {
  toggleBtn.classList.remove("active");
  mobileMenu.classList.remove("active");
  overlay.classList.remove("active");
  document.body.style.overflow = "";
});

// ── Nav routing ──────────────────────────────────────────────
function setupNav(links) {
  links.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll("#navbar a, .mobile-menu a").forEach(a => a.classList.remove("active"));
      document.querySelectorAll(`#navbar a[data-page="${link.dataset.page}"], .mobile-menu a[data-page="${link.dataset.page}"]`)
        .forEach(a => a.classList.add("active"));
      document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
      document.getElementById(link.dataset.page).classList.add("active");
      if (window.innerWidth > 768) updateIndicator();
      if (mobileMenu.classList.contains("active")) toggleBtn.click();
      if (link.dataset.page === "suhu")      setTimeout(initSuhuChart,      150);
      if (link.dataset.page === "kelembaban") setTimeout(initKelembabanChart, 150);
    });
  });
}
setupNav(document.querySelectorAll("#navbar a"));
setupNav(document.querySelectorAll(".mobile-menu a"));

const indicator = document.querySelector(".indicator");
function updateIndicator() {
  const activeLink = document.querySelector("#navbar a.active");
  if (activeLink && window.innerWidth > 768) {
    const lr = activeLink.getBoundingClientRect();
    const nr = document.getElementById("navbar").getBoundingClientRect();
    indicator.style.left = `${lr.left - nr.left + lr.width / 2 - indicator.offsetWidth / 2}px`;
  }
}
window.addEventListener("resize", updateIndicator);
setTimeout(updateIndicator, 100);

// ── Update nilai utama ────────────────────────────────────────
function updateMainValues(suhu, udara, tanah) {
  document.getElementById("current-suhu").textContent  = `${suhu.toFixed(0)}°C`;
  document.getElementById("current-udara").textContent = `${udara.toFixed(0)}%`;
  document.getElementById("current-tanah").textContent = `${tanah.toFixed(0)}%`;
}

// ── Render tabel ─────────────────────────────────────────────
function renderTable(tableId, limit = null) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = "";
  const data = limit ? sensorData.slice(-limit) : sensorData;
  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.time}</td><td>${row.suhu}°C</td><td>${row.udara}%</td><td>${row.tanah}%</td><td>${row.pompa}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Grafik ────────────────────────────────────────────────────
let chartSuhu, chartKelembaban;
function initSuhuChart() {
  if (chartSuhu) chartSuhu.destroy();
  const ctx = document.getElementById("chartSuhu").getContext("2d");
  chartSuhu = new Chart(ctx, {
    type: "line",
    data: { labels: sensorData.map(d => d.time), datasets: [{ label: "Suhu (°C)", data: sensorData.map(d => d.suhu), borderColor: "#e74c3c", backgroundColor: "rgba(231,76,60,0.1)", fill: true, tension: 0.4, pointRadius: 5 }] },
    options: { responsive: true, plugins: { legend: { position: "top" } } }
  });
}
function initKelembabanChart() {
  if (chartKelembaban) chartKelembaban.destroy();
  const ctx = document.getElementById("chartKelembaban").getContext("2d");
  chartKelembaban = new Chart(ctx, {
    type: "line",
    data: { labels: sensorData.map(d => d.time), datasets: [
      { label: "Udara (%)", data: sensorData.map(d => d.udara), borderColor: "#3498db", backgroundColor: "rgba(52,152,219,0.1)", fill: true },
      { label: "Tanah (%)", data: sensorData.map(d => d.tanah), borderColor: "#27ae60", backgroundColor: "rgba(39,174,96,0.1)", fill: true }
    ]},
    options: { responsive: true, plugins: { legend: { position: "top" } } }
  });
}

// ── Kontrol Pompa (tidak berubah) ─────────────────────────────
const pumpJamur = document.getElementById("pump-jamur");
const pumpTanah = document.getElementById("pump-tanah");
const modeJamurBtn = document.getElementById("mode-jamur");
const modeTanahBtn = document.getElementById("mode-tanah");

function updatePumpButtonState() {
  const isJamurAuto = modeJamurBtn.textContent.trim().toLowerCase() === "auto";
  const isTanahAuto = modeTanahBtn.textContent.trim().toLowerCase() === "auto";
  [pumpJamur, isJamurAuto, pumpTanah, isTanahAuto].forEach((_, i, arr) => {
    if (i % 2 === 0) {
      const btn = arr[i], disabled = arr[i + 1];
      btn.classList.toggle("disabled", disabled);
      btn.style.opacity       = disabled ? "0.45" : "1";
      btn.style.pointerEvents = disabled ? "none"  : "auto";
      btn.style.cursor        = disabled ? "not-allowed" : "pointer";
    }
  });
}
updatePumpButtonState();

pumpJamur.addEventListener("click", function () {
  if (modeJamurBtn.textContent.trim().toLowerCase() === "auto") return;
  const newState = this.getAttribute("data-state") === "off" ? "on" : "off";
  this.setAttribute("data-state", newState);
  this.textContent = newState.toUpperCase();
  mqttClient.send({ type: "control", relay: 1, state: newState === "on" });
});
pumpTanah.addEventListener("click", function () {
  if (modeTanahBtn.textContent.trim().toLowerCase() === "auto") return;
  const newState = this.getAttribute("data-state") === "off" ? "on" : "off";
  this.setAttribute("data-state", newState);
  this.textContent = newState.toUpperCase();
  mqttClient.send({ type: "control", relay: 2, state: newState === "on" });
});

modeJamurBtn.addEventListener("click", () => {
  const newMode = modeJamurBtn.textContent.trim().toLowerCase() === "auto" ? "manual" : "auto";
  if (newMode === "auto") { pumpJamur.setAttribute("data-state","off"); pumpJamur.textContent = "OFF"; mqttClient.send({ type: "control", relay: 1, state: false }); }
  modeJamurBtn.textContent = newMode;
  mqttClient.send({ type: "set_mode", pump: "jamur", mode: newMode });
  updatePumpButtonState();
});
modeTanahBtn.addEventListener("click", () => {
  const newMode = modeTanahBtn.textContent.trim().toLowerCase() === "auto" ? "manual" : "auto";
  if (newMode === "auto") { pumpTanah.setAttribute("data-state","off"); pumpTanah.textContent = "OFF"; mqttClient.send({ type: "control", relay: 2, state: false }); }
  modeTanahBtn.textContent = newMode;
  mqttClient.send({ type: "set_mode", pump: "tanah", mode: newMode });
  updatePumpButtonState();
});

// ── Download CSV ──────────────────────────────────────────────
document.getElementById("download-csv").addEventListener("click", () => {
  let csv = "Jam,Suhu,Udara,Tanah,Pompa\n";
  sensorData.forEach(d => csv += `${d.time},${d.suhu},${d.udara},${d.tanah},"${d.pompa}"\n`);
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: `riwayat_${currentDateForCSV}.csv`
  });
  a.click();
});

// ── MQTT ─────────────────────────────────────────────────────
mqttClient.connect();
mqttClient.onConnect(() => mqttClient.send({ type: "get_data" }));
mqttClient.onMessage((data) => {
  if (data.type === "sensor_data") {
    updateMainValues(
      (data.temperature1 + data.temperature2) / 2,
      (data.humidity1    + data.humidity2)    / 2,
      (data.soil1        + data.soil2)        / 2
    );
  } else if (data.type === "relay_status" || data.type === "mode_status") {
    if (data.relay1 !== undefined) { pumpJamur.setAttribute("data-state", data.relay1 ? "on":"off"); pumpJamur.textContent = data.relay1 ? "ON":"OFF"; }
    if (data.relay2 !== undefined) { pumpTanah.setAttribute("data-state", data.relay2 ? "on":"off"); pumpTanah.textContent = data.relay2 ? "ON":"OFF"; }
    if (data.modeJamur !== undefined) modeJamurBtn.textContent = String(data.modeJamur).trim();
    if (data.modeTanah !== undefined) modeTanahBtn.textContent = String(data.modeTanah).trim();
    updatePumpButtonState();
  } else if (data.type === "datetime") {
    const namaBulan = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const tgl = String(data.day).padStart(2,"0");
    document.getElementById("datetime").textContent =
      `${data.weekday}, ${tgl} ${namaBulan[data.month-1]} ${data.year} | ${String(data.hour).padStart(2,"0")}:${String(data.minute).padStart(2,"0")}:${String(data.second).padStart(2,"0")}`;
    currentDateForCSV = `${data.year}-${String(data.month).padStart(2,"0")}-${tgl}`;
  }
});

// ── Init ─────────────────────────────────────────────────────
loadHistoryFromSupabase();
subscribeSupabaseRealtime();

window.addEventListener("load", () => setTimeout(updatePumpButtonState, 1500));