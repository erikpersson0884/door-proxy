const buttons = document.querySelectorAll("#buttons button");
const status = document.getElementById("status");
const lastUsedEl = document.getElementById("lastUsed");

function showLastUsed() {
  const last = localStorage.getItem("lastDoorName");
  const time = localStorage.getItem("lastDoorTime");
  if (last && time) {
    const when = new Date(time).toLocaleString();
    lastUsedEl.textContent = `Last opened: ${last} at ${when}`;
  }
}

async function openDoor(doorId, doorName, btn) {
  buttons.forEach(b => (b.disabled = true));
  const originalText = btn.textContent;
  btn.textContent = "Opening...";
  btn.classList.remove("success", "error");
  status.textContent = "";

  try {
    const r = await fetch(`/trigger/${doorId}`, { method: "POST" });
    const data = await r.json();

    if (data.ok) {
      btn.textContent = "✅ Opened!";
      btn.classList.add("success");

      // Remember this in the browser for next visit
      localStorage.setItem("lastDoorName", doorName);
      localStorage.setItem("lastDoorTime", new Date().toISOString());
      showLastUsed();
    } else {
      btn.textContent = "❌ Failed";
      btn.classList.add("error");
      status.textContent = JSON.stringify(data);
    }
  } catch (e) {
    btn.textContent = "❌ Error";
    btn.classList.add("error");
    status.textContent = e.message;
  }

  setTimeout(() => {
    buttons.forEach(b => (b.disabled = false));
    btn.textContent = originalText;
    btn.classList.remove("success", "error");
  }, 4000);
}

buttons.forEach(btn => {
  btn.addEventListener("click", () => {
    const doorId = btn.dataset.door;
    const doorName = btn.dataset.name;
    openDoor(doorId, doorName, btn);
  });
});

showLastUsed();