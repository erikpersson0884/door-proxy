const buttonsContainer = document.getElementById("buttons");
const status = document.getElementById("status");

const btnClasses = ["btn-open", "btn-close"]; // cycles through your two color styles
let doors = [];

async function loadDoors() {
  const res = await fetch("/doors");
  doors = await res.json();

  doors.forEach((door, index) => {
    const btn = document.createElement("button");
    btn.textContent = `Open ${door.name}`;
    btn.className = btnClasses[index % btnClasses.length];
    btn.dataset.door = door.id;
    btn.addEventListener("click", () => openDoor(door.id, btn));
    buttonsContainer.appendChild(btn);
  });
}

async function openDoor(doorId, btn) {
  const allButtons = buttonsContainer.querySelectorAll("button");
  allButtons.forEach(b => (b.disabled = true));
  const originalText = btn.textContent;
  btn.textContent = "Opening...";
  btn.classList.remove("success", "error");
  status.textContent = "";

  try {
    status.textContent = "Sending request...";
    const r = await fetch(`/trigger/${doorId}`, { method: "POST" });
    const data = await r.json();

    if (data.ok) {
      btn.textContent = "✅ Opened!";
      btn.classList.add("success");
      status.textContent = "Door opened successfully";
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
    allButtons.forEach(b => (b.disabled = false));
    btn.textContent = originalText;
    status.textContent = "";
    btn.classList.remove("success", "error");
  }, 4000);
}

async function onLoad () {
  await loadDoors();
  doors.forEach((door, index) => {
    fetch(`/trigger/${door.id}`, { method: "POST" });
  })
};

onLoad();
