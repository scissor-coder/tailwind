// import "./style.css";


const SCRIPT_URL_MSG =
  "https://script.google.com/macros/s/AKfycbwJqVBQB-hxji3drMIXIorf_yOctqINbwFHE-6OXDcAsvxBiiWvvGIpkIB_6dVnCYM7/exec";
const SCRIPT_URL_NOTIF = "" || SCRIPT_URL_MSG;
const SCRIPT_URL_LOGIN = "" || SCRIPT_URL_MSG;
const SCRIPT_URL_MEAL = "" || SCRIPT_URL_MSG;
const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwlcdIIh4HgwW_isvFeTsOSF7cjFJs3YcCuRFRgJe44AfTkL-p7Ex2gDJQIiON79fGK/exec";
const CSV_URL_1 =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vThIiaP8iBgMS9bbYeASkztAvf4yZG9rIi0o1qvPEtqZBnTaPiO0PzhJI93LJH2HhIyEoV6P5ftqq92/pub?gid=1763748646&single=true&output=csv";

let MEAL_LOCK_START_HOUR,
  MEAL_LOCK_START_MIN,
  MEAL_LOCK_END_HOUR,
  MEAL_LOCK_END_MIN;
let globalSheetData = null;
let tempSelectedMeal = null;
let mealLockTimer = null;

// ==============================
// NEW: Theme Management
// ==============================
function toggleTheme() {
  document.documentElement.classList.toggle("dark");
  const isDark = document.documentElement.classList.contains("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
  const icon = document.getElementById("themeIcon");
  if (icon) {
    icon.className = isDark ? "fas fa-sun" : "fas fa-moon";
  }
}

// Initialize theme icon on load
window.addEventListener("DOMContentLoaded", () => {
  const isDark = document.documentElement.classList.contains("dark");
  updateThemeIcon(isDark);
});

// ==============================
// NEW: Smart Refresh Logic
// ==============================
let lastFetchTime = 0;
const FETCH_COOLDOWN = 15000; // 15 seconds cooldown for auto-refresh to save performance

// Refresh data when user returns to the tab
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    const now = Date.now();
    if (now - lastFetchTime > FETCH_COOLDOWN) {
      smartRefresh(false);
    }
  }
});

function smartRefresh(isManual = false) {
  lastFetchTime = Date.now();
  const btn = document.getElementById("refreshBtn");
  if (btn && isManual) {
    btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
  }

  const currentNav = localStorage.getItem("currentNav") || "home";

  // Parallel fetching based on current view
  const promises = [];
  if (currentNav === "home") {
    promises.push(fetchMealLockTimes());
    promises.push(fetchReportData());
    if (document.getElementById("others-meal-list").style.display === "block") {
      promises.push(fetchOthersMeals());
    }
  } else if (currentNav === "messenger") {
    promises.push(fetchMessages());
  } else if (currentNav === "report") {
    promises.push(fetchReportData());
  } else if (currentNav === "notification") {
    promises.push(fetchNotifications());
  }

  Promise.allSettled(promises).then(() => {
    if (btn && isManual) {
      btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
      showToast("ডেটা আপডেট করা হয়েছে");
    }
  });
}

// ==============================
// Core Application Logic
// ==============================
async function fetchMealLockTimes() {
  try {
    const response = await fetch(`${CSV_URL_1}&t=${Date.now()}`);
    if (!response.ok) throw new Error("Network error");
    const text = await response.text();
    const csvSheetData1 = parseCSV(text);
    const validRows = csvSheetData1.data.filter((row) => row.Name);
    MEAL_LOCK_END_HOUR = Number(validRows.map((row) => row.MealOnHour)[0]);
    MEAL_LOCK_END_MIN = Number(validRows.map((row) => row.MealOnMunite)[0]);
    MEAL_LOCK_START_HOUR = Number(validRows.map((row) => row.MealOffHour)[0]);
    MEAL_LOCK_START_MIN = Number(validRows.map((row) => row.MealOffMunite)[0]);
    applyMealLockState();
  } catch (error) {
    console.error("Failed to load times:", error);
    MEAL_LOCK_START_HOUR = 22;
    MEAL_LOCK_START_MIN = 30;
    MEAL_LOCK_END_HOUR = 5;
    MEAL_LOCK_END_MIN = 40;
    applyMealLockState();
  }
}

fetchMealLockTimes();

function generateFingerprint() {
  const navigator = window.navigator;
  const screen = window.screen;
  const data = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    screen.width + "x" + screen.height,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency,
    navigator.deviceMemory,
    navigator.platform,
  ].join("||");

  const hash = (str, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed,
      h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (
      (h2 >>> 0).toString(16).padStart(8, "0") +
      (h1 >>> 0).toString(16).padStart(8, "0")
    );
  };
  return "FP_" + hash(data).toUpperCase();
}

window.addEventListener("DOMContentLoaded", () => {
  const savedName = localStorage.getItem("userName");
  if (savedName) {
    let fp = localStorage.getItem("userFingerPrint");
    if (!fp) {
      fp = generateFingerprint();
      localStorage.setItem("userFingerPrint", fp);
    }
    setupUserUI(savedName, fp);
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("app-content").style.display = "block";
    const savedNav = localStorage.getItem("currentNav") || "home";
    navTo(savedNav);
  } else {
    fetchBorderNames();
  }
});

function setupUserUI(nameInput, fp) {
  const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${nameInput}`;
  document.getElementById("headerAvatar").src = avatarUrl;
  document.getElementById("profileAvatar").src = avatarUrl;
  document.getElementById("profileName").innerText = nameInput;
  document.getElementById("profileFingerprint").innerText =
    `Digital ID :   ${fp}`;
  fetchReportData();
  initApp();
}

const auth = document.getElementById("auth-screen");
const app = document.getElementById("app-content");

function switchAuth(type) {
  document
    .querySelectorAll(".auth-tab")
    .forEach((t) => t.classList.remove("active"));
  document.getElementById("loginForm").style.display = "none";
  document.getElementById("signupForm").style.display = "none";
  if (type === "login") {
    document.querySelectorAll(".auth-tab")[0].classList.add("active");
    document.getElementById("loginForm").style.display = "block";
  } else {
    document.querySelectorAll(".auth-tab")[1].classList.add("active");
    document.getElementById("signupForm").style.display = "block";
  }
}

async function fetchBorderNames() {
  try {
    const res = await fetch(`${SCRIPT_URL_LOGIN}?action=getBorderNames`, {
      method: "GET",
      mode: "cors",
    });
    const names = await res.json();
    const selectSignup = document.getElementById("signupName");
    const selectLogin = document.getElementById("loginName");
    selectSignup.innerHTML =
      '<option value="">আপনার নাম নির্বাচন করুন</option>';
    selectLogin.innerHTML = '<option value="">আপনার নাম নির্বাচন করুন</option>';
    names.forEach((n) => {
      let val =
        typeof n === "string" ? n : n.name || n.Name || Object.values(n)[0];
      selectSignup.innerHTML += `<option value="${val}">${val}</option>`;
      selectLogin.innerHTML += `<option value="${val}">${val}</option>`;
    });
  } catch (e) {
    console.error(e);
    document.getElementById("signupName").innerHTML =
      '<option value="">নাম লোড করতে ব্যর্থ</option>';
    document.getElementById("loginName").innerHTML =
      '<option value="">নাম লোড করতে ব্যর্থ</option>';
  }
}

document.getElementById("signupForm").onsubmit = async (e) => {
  e.preventDefault();
  const btn = document.getElementById("signupBtn");
  btn.innerText = "অপেক্ষা করুন...";
  const nameInput = document.getElementById("signupName").value;
  const emailInput = document.getElementById("signupPassword").value;
  let fp = localStorage.getItem("userFingerPrint") || generateFingerprint();
  localStorage.setItem("userFingerPrint", fp);
  try {
    const response = await fetch(`${SCRIPT_URL_LOGIN}?action=createAccount`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        Name: nameInput,
        Email: emailInput,
        FingerprintSignup: fp,
      }),
    });
    const result = await response.json();
    if (result.success) {
      localStorage.setItem("userName", nameInput);
      setupUserUI(nameInput, fp);
      auth.style.display = "none";
      app.style.display = "block";
      btn.innerText = "অ্যাকাউন্ট তৈরি করুন";
      navTo("home");
      showToast(`স্বাগতম, ${nameInput}!`);
    } else if (result.digitalSignature) {
      showToast("একাধিক অ্যাকাউন্ট তৈরি করার অনুমতি নেই!");
      btn.innerText = "অ্যাকাউন্ট তৈরি করুন";
    } else {
      showToast("অ্যাকাউন্ট ইতিমধ্যে বিদ্যমান! অনুগ্রহ করে লগইন করুন।");
      btn.innerText = "অ্যাকাউন্ট তৈরি করুন";
    }
  } catch (error) {
    showToast("অ্যাকাউন্ট তৈরি করতে সমস্যা হয়েছে।");
    btn.innerText = "অ্যাকাউন্ট তৈরি করুন";
  }
};

document.getElementById("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const btn = document.getElementById("loginBtn");
  btn.innerText = "অপেক্ষা করুন...";
  const nameInput = document.getElementById("loginName").value;
  const emailInput = document.getElementById("loginPassword").value;
  try {
    const response = await fetch(
      `${SCRIPT_URL_LOGIN}?userLogin=true&name=${encodeURIComponent(nameInput)}&email=${encodeURIComponent(emailInput)}`,
      { method: "GET", mode: "cors" },
    );
    const data = await response.json();
    if (data && data.success !== false && !data.error) {
      let fp = localStorage.getItem("userFingerPrint") || generateFingerprint();
      localStorage.setItem("userFingerPrint", fp);
      localStorage.setItem("userName", nameInput);
      setupUserUI(nameInput, fp);
      auth.style.display = "none";
      app.style.display = "block";
      btn.innerText = "লগইন করুন";
      navTo("home");
      showToast(`স্বাগতম, ${nameInput}!`);
    } else {
      showToast("নাম বা ইমেইল ভুল হয়েছে।");
      btn.innerText = "লগইন করুন";
    }
  } catch (error) {
    showToast("লগইন করতে সমস্যা হয়েছে।");
    btn.innerText = "লগইন করুন";
  }
};

function logout() {
  auth.style.display = "flex";
  app.style.display = "none";
  localStorage.removeItem("userName");
  localStorage.removeItem("currentNav");
  fetchBorderNames();
}

function initApp() {
  applyMealLockState();
  fetchMessages();
  fetchNotifications();
}

function navTo(viewId) {
  localStorage.setItem("currentNav", viewId);
  document
    .querySelectorAll(".view-section")
    .forEach((v) => v.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  const targetSection = document.getElementById(viewId);
  if (targetSection) targetSection.classList.add("active");
  const targetNavBtn = document.querySelector(
    `.nav-item[onclick="navTo('${viewId}')"]`,
  );
  if (targetNavBtn) targetNavBtn.classList.add("active");

  const labels = {
    home: "হোম",
    messenger: "মেসেজ",
    report: "রিপোর্ট",
    notification: "নোটিফিকেশন",
    account: "প্রোফাইল",
  };
  document.getElementById("view-title").innerText = labels[viewId] || "হোম";
  if (viewId === "messenger") {
    const box = document.getElementById("chatBox");
    box.scrollTop = box.scrollHeight;
    smartRefresh();
  } else if (viewId === "notification") {
    smartRefresh();
  }
}

async function fetchMessages() {
  try {
    const response = await fetch(`${SCRIPT_URL_MSG}?action=getMessages`, {
      method: "GET",
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed");
    const messagesData = await response.json();
    renderMessages(messagesData);
  } catch (error) {
    document.getElementById("chatBox").innerHTML =
      '<div class="text-center p-5 text-danger">মেসেজ লোড করতে ব্যর্থ হয়েছে।</div>';
  }
}

function renderMessages(msgs) {
  const box = document.getElementById("chatBox");
  const currentUserFP = localStorage.getItem("userFingerPrint");
  if (!msgs || msgs.length === 0) {
    box.innerHTML =
      '<div class="text-center p-5 text-textMuted">কোনো মেসেজ নেই। নতুন মেসেজ পাঠান!</div>';
    return;
  }

  let htmlStrings = [];
  msgs.forEach((m) => {
    const isSentByMe = m.userFingerPrint === currentUserFP;
    const avatarSeed = encodeURIComponent(m.userName);
    const displaySender = isSentByMe ? "আপনি" : m.userName || "Unknown";

    if (isSentByMe) {
      htmlStrings.push(`
              <div class="flex gap-2.5 items-end max-w-[85%] self-end flex-row-reverse group px-4">
                  <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}" class="w-8 h-8 rounded-full bg-bgHover shrink-0 shadow-sm mb-5 border border-borderLight">
                  <div class="flex flex-col gap-1 items-end">
                      <span class="text-[11px] font-bold text-textMuted mx-1">${displaySender}</span>
                      <div class="py-2.5 px-4 bg-primary text-white rounded-[20px] rounded-br-sm shadow-sm text-[15px] leading-relaxed">${m.message}</div>
                      <span class="text-[10px] text-textMuted opacity-0 group-hover:opacity-100 transition-opacity duration-200 mt-0.5">${m.dateTime}</span>
                  </div>
              </div>`);
    } else {
      htmlStrings.push(`
              <div class="flex gap-2.5 items-end max-w-[85%] self-start group px-4">
                  <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}" class="w-8 h-8 rounded-full bg-bgHover shrink-0 shadow-sm mb-5 border border-borderLight">
                  <div class="flex flex-col gap-1 items-start">
                      <span class="text-[11px] font-bold text-textMuted mx-1">${displaySender}</span>
                      <div class="py-2.5 px-4 bg-bgCard text-textMain rounded-[20px] rounded-bl-sm shadow-sm border border-borderLight text-[15px] leading-relaxed">${m.message}</div>
                      <span class="text-[10px] text-textMuted opacity-0 group-hover:opacity-100 transition-opacity duration-200 mt-0.5">${m.dateTime}</span>
                  </div>
              </div>`);
    }
  });
  box.innerHTML = htmlStrings.join("");
  box.scrollTop = box.scrollHeight;
}

async function sendMsg() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  const sendBtn = document.getElementById("sendMsgBtn");
  const originalIcon = sendBtn.innerHTML;

  const fp = localStorage.getItem("userFingerPrint") || "Unknown";
  const uName = localStorage.getItem("userName") || "Anonymous";
  const now = new Date();
  const dateTimeStr =
    now.toLocaleDateString("bn-BD") +
    " " +
    now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  input.disabled = true;
  sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  const box = document.getElementById("chatBox");
  const avatarSeed = encodeURIComponent(uName);

  const tempMsgHtml = `
        <div class="flex gap-2.5 items-end max-w-[85%] self-end flex-row-reverse px-4 opacity-60 transition-opacity" id="temp-msg">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}" class="w-8 h-8 rounded-full bg-bgHover shrink-0 shadow-sm mb-5">
            <div class="flex flex-col gap-1 items-end">
                <span class="text-[11px] font-bold text-textMuted mx-1 temp-sender-name">আপনি (পাঠানো হচ্ছে...)</span>
                <div class="py-2.5 px-4 bg-primary text-white rounded-[20px] rounded-br-sm shadow-sm text-[15px] leading-relaxed">${text}</div>
                <span class="text-[10px] text-textMuted mt-0.5">${dateTimeStr}</span>
            </div>
        </div>`;
  box.insertAdjacentHTML("beforeend", tempMsgHtml);
  box.scrollTop = box.scrollHeight;

  const payload = {
    userFingerPrint: fp,
    userName: uName,
    message: text,
    dateTime: dateTimeStr,
  };
  try {
    const response = await fetch(`${SCRIPT_URL_MSG}?action=createMessage`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (response.ok || response.type === "opaque") {
      input.value = "";
      const tempMsg = document.getElementById("temp-msg");
      if (tempMsg) {
        tempMsg.classList.remove("opacity-60");
        tempMsg.querySelector(".temp-sender-name").innerText = "আপনি";
        tempMsg.removeAttribute("id");
      }
      setTimeout(fetchMessages, 1000);
    } else throw new Error("Server error");
  } catch (error) {
    showToast("মেসেজ পাঠাতে সমস্যা হয়েছে।");
    const tempMsg = document.getElementById("temp-msg");
    if (tempMsg) tempMsg.remove();
  } finally {
    input.disabled = false;
    sendBtn.innerHTML = originalIcon;
    input.focus();
  }
}

function getNextUnlockTime() {
  const now = new Date();
  const unlockTime = new Date();
  unlockTime.setHours(MEAL_LOCK_END_HOUR, MEAL_LOCK_END_MIN, 0, 0);
  if (now.getTime() >= unlockTime.getTime())
    unlockTime.setDate(unlockTime.getDate() + 1);
  return unlockTime;
}

function formatTimeLeft(targetDate) {
  const diff = targetDate - new Date();
  if (diff <= 0) return "00:00:00";
  const h = Math.floor(diff / (1000 * 60 * 60));
  const m = Math.floor((diff / (1000 * 60)) % 60);
  const s = Math.floor((diff / 1000) % 60);
  return `${h.toString().padStart(2, "0")} ঘন্টা ${m.toString().padStart(2, "0")} মিনিট ${s.toString().padStart(2, "0")} সেকেন্ড পরে`;
}

function isMealLocked() {
  if (typeof MEAL_LOCK_START_HOUR === "undefined") return true;
  const now = new Date();
  const currentTotalMin = now.getHours() * 60 + now.getMinutes();
  const startTotalMin = MEAL_LOCK_START_HOUR * 60 + MEAL_LOCK_START_MIN;
  const endTotalMin = MEAL_LOCK_END_HOUR * 60 + MEAL_LOCK_END_MIN;
  if (startTotalMin > endTotalMin) {
    return currentTotalMin >= startTotalMin || currentTotalMin < endTotalMin;
  } else {
    return currentTotalMin >= startTotalMin && currentTotalMin < endTotalMin;
  }
}

function checkMealSubmissionStatus() {
  const saved = localStorage.getItem("abid_meal");
  if (!saved) return false;
  const mealData = JSON.parse(saved);
  if (!mealData.timestamp) return false;
  if (typeof MEAL_LOCK_END_HOUR === "undefined") return false;
  const submitTime = new Date(mealData.timestamp);
  const now = new Date();
  const lastUnlock = new Date();
  lastUnlock.setHours(MEAL_LOCK_END_HOUR, MEAL_LOCK_END_MIN, 0, 0);
  if (now.getTime() < lastUnlock.getTime())
    lastUnlock.setDate(lastUnlock.getDate() - 1);
  return submitTime.getTime() >= lastUnlock.getTime();
}

// Re-written using explicit class modifications to support dynamic Dark Mode properly
function applyMealLockState() {
  if (mealLockTimer) clearInterval(mealLockTimer);
  const mealBtn = document.getElementById("mealSelectBtn");
  const mealBtnText = document.getElementById("mealBtnText");
  const icon = mealBtn.querySelector("i");
  const resultDiv = document.getElementById("meal-submission-result");

  if (typeof MEAL_LOCK_START_HOUR === "undefined") {
    mealBtn.disabled = true;
    mealBtn.className =
      "w-full p-4 border-2 rounded-2xl font-bold text-base flex justify-between items-center transition-all duration-300 mb-4 bg-bgHover border-borderLight text-textMuted cursor-wait";
    icon.className = "fas fa-spinner fa-spin text-xl";
    mealBtnText.innerHTML = `<span class="text-[15px] font-bold">চেক করা হচ্ছে...</span>`;
    resultDiv.style.display = "none";
    return;
  }

  const saved = localStorage.getItem("abid_meal");
  let mealData = saved ? JSON.parse(saved) : null;
  const naturallyLocked = isMealLocked();
  const submittedOnce = checkMealSubmissionStatus();

  if (naturallyLocked || submittedOnce) {
    mealBtn.disabled = true;
    mealBtn.className =
      "w-full p-4 border-2 rounded-2xl font-bold text-base flex justify-between items-center transition-all duration-300 mb-4 bg-bgHover border-borderLight text-textMuted cursor-not-allowed";
    icon.className = "fas fa-lock text-xl";
    const nextUnlock = getNextUnlockTime();
    const mainText = naturallyLocked
      ? "মিল নির্বাচনের সময় শেষ হয়েছে!"
      : "মিল নির্বাচন সম্পন্ন (সাময়িক ভাবে বন্ধ)";

    const updateTimerUI = () => {
      const now = new Date();
      if (now >= nextUnlock) {
        clearInterval(mealLockTimer);
        applyMealLockState();
      } else {
        const timerSpan = document.getElementById("meal-countdown-timer");
        if (timerSpan)
          timerSpan.innerText = `চালু হবে  ঃ ${formatTimeLeft(nextUnlock)}`;
      }
    };

    mealBtnText.innerHTML = `
          <div class="flex flex-col items-start text-left gap-1">
              <span class="text-[15px] font-bold text-textMain">${mainText}</span>
              <span id="meal-countdown-timer" class="text-[12px] font-bold text-danger">চালু হবে  ঃ ${formatTimeLeft(nextUnlock)}</span>
          </div>`;
    mealLockTimer = setInterval(updateTimerUI, 1000);

    if (mealData) {
      resultDiv.style.display = "block";
      resultDiv.innerHTML = `কালকের মিল &nbsp;<i class="fas fa-check-circle mr-1"></i><b>${mealData.txt}</b>`;
    } else {
      resultDiv.style.display = "none";
    }
  } else {
    mealBtn.disabled = false;
    mealBtn.className =
      "w-full p-4 border-2 rounded-2xl font-bold text-base flex justify-between items-center transition-all duration-300 mb-4 bg-bgCard border-primaryLight text-primary cursor-pointer active:scale-95 active:bg-primaryLight";
    icon.className = "fas fa-chevron-circle-down text-xl";
    mealBtnText.innerHTML = mealData
      ? `<b>${mealData.txt}</b> নির্বাচন করা হয়েছে`
      : "মিল নির্বাচন করুন";
    if (mealData) {
      resultDiv.style.display = "block";
      resultDiv.innerHTML = `<i class="fas fa-check-circle mr-1"></i> আজকের মিল: <b>${mealData.txt}</b>`;
    } else {
      resultDiv.style.display = "none";
    }
  }
}

function openMealPopup() {
  if (typeof MEAL_LOCK_START_HOUR === "undefined") {
    showToast("সার্ভার থেকে ডেটা লোড হচ্ছে...");
    return;
  }
  if (isMealLocked() || checkMealSubmissionStatus()) {
    showToast("মিল নির্বাচনের সময় শেষ হয়েছে!");
    return;
  }
  document.getElementById("mealSelectionModal").style.display = "flex";
  const saved = localStorage.getItem("abid_meal");
  tempSelectedMeal = saved ? JSON.parse(saved) : null;
  document.querySelectorAll(".popup-item").forEach((el) => {
    if (
      tempSelectedMeal &&
      el.getAttribute("data-val") === tempSelectedMeal.val
    ) {
      el.classList.add("selected");
    } else el.classList.remove("selected");
  });
}

function closeMealPopup() {
  document.getElementById("mealSelectionModal").style.display = "none";
}

function highlightMeal(element, value, text) {
  document
    .querySelectorAll(".popup-item")
    .forEach((el) => el.classList.remove("selected"));
  element.classList.add("selected");
  tempSelectedMeal = { val: value, txt: text };
}

async function confirmMealSelection() {
  if (!tempSelectedMeal) {
    showToast("অনুগ্রহ করে একটি মিল নির্বাচন করুন");
    return;
  }
  const submitBtn = document.querySelector(
    'button[onclick="confirmMealSelection()"]',
  );
  const originalText = submitBtn.innerText;
  submitBtn.innerText = "অপেক্ষা করুন...";
  submitBtn.disabled = true;

  const userName = localStorage.getItem("userName") || "Unknown";
  const fp = localStorage.getItem("userFingerPrint") || "Unknown";
  const now = new Date();
  try {
    const response = await fetch(`${SCRIPT_URL_MEAL}?action=createMeal`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        name: userName,
        mealValue: tempSelectedMeal.val,
        mealText: tempSelectedMeal.txt,
        date: now.toISOString(),
        fingerprint: fp,
      }),
    });
    if (response.ok || response.type === "opaque") {
      tempSelectedMeal.timestamp = new Date().getTime();
      localStorage.setItem("abid_meal", JSON.stringify(tempSelectedMeal));
      applyMealLockState();
      closeMealPopup();
      showToast("মিল আপডেট সম্পন্ন হয়েছে");
      const othersList = document.getElementById("others-meal-list");
      if (othersList.style.display === "block") fetchOthersMeals();
    } else throw new Error("Server error");
  } catch (error) {
    showToast("মিল সাবমিট করতে সমস্যা হয়েছে।");
  } finally {
    submitBtn.innerText = originalText;
    submitBtn.disabled = false;
  }
}

function toggleOthersMeal() {
  const list = document.getElementById("others-meal-list");
  const icon = document.getElementById("others-meal-icon");
  if (list.style.display === "none") {
    list.style.display = "block";
    icon.style.transform = "rotate(180deg)";
    fetchOthersMeals();
  } else {
    list.style.display = "none";
    icon.style.transform = "rotate(0deg)";
  }
}

async function fetchOthersMeals() {
  const list = document.getElementById("others-meal-list");
  list.innerHTML =
    '<div class="text-center p-4 text-textMuted"><i class="fas fa-spinner fa-spin"></i> লোড হচ্ছে...</div>';
  try {
    const res = await fetch(`${SCRIPT_URL_MEAL}?action=getMeals`, {
      method: "GET",
      mode: "cors",
    });
    const data = await res.json();
    const today = new Date();
    let mealsData = Array.isArray(data) ? data : data.data || [];
    const todaysMeals = mealsData.filter((item) => {
      if (!item.date) return false;
      const d = new Date(item.date);
      if (isNaN(d.getTime()))
        return String(item.date).includes(today.toLocaleDateString());
      return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
      );
    });

    if (todaysMeals.length === 0) {
      list.innerHTML =
        '<div class="p-4 text-center text-textMuted">আজকের কোনো মিল এন্ট্রি পাওয়া যায়নি।</div>';
      return;
    }

    let htmlStrings = ['<ul class="m-0 p-0 flex flex-col gap-2">'];
    todaysMeals.forEach((m) => {
      htmlStrings.push(`
              <li class="flex justify-between items-center bg-bgHover border border-borderLight p-3 rounded-xl">
                <span class="font-semibold text-[15px] text-textMain">${m.name || m.Name || "অজানা"}</span>
                <span class="bg-primaryLight text-primary px-3 py-1 rounded-lg text-sm font-bold border border-primary/10">${m.mealText || m.meal || ""}</span>
              </li>`);
    });
    htmlStrings.push("</ul>");
    list.innerHTML = htmlStrings.join("");
  } catch (error) {
    list.innerHTML =
      '<div class="p-4 text-center text-danger font-medium">ডেটা লোড করতে ব্যর্থ হয়েছে।</div>';
  }
}

function parseCSV(text) {
  const rows = text
    .trim()
    .split("\n")
    .map((row) => row.split(","));
  const headers = rows[0].map((h) => h.trim());
  const data = rows.slice(1).map((row) => {
    let obj = {};
    row.forEach((cell, i) => {
      obj[headers[i]] = cell ? cell.trim().replace(/^"|"$/g, "") : "";
    });
    return obj;
  });
  return { headers, data };
}

async function fetchReportData() {
  try {
    const response = await fetch(`${CSV_URL_1}&t=${Date.now()}`);
    if (!response.ok) throw new Error("Network error");
    const text = await response.text();
    globalSheetData = parseCSV(text);
    renderHomeData();
    renderReportData();
  } catch (error) {
    document.getElementById("home-content").innerHTML =
      '<p class="text-center p-5 text-danger font-bold">ডেটা লোড করতে সমস্যা হয়েছে!</p>';
    document.getElementById("report-content").innerHTML =
      '<p class="text-center p-5 text-danger font-bold">ডেটা লোড করতে সমস্যা হয়েছে!</p>';
  }
}

function renderHomeData() {
  const container = document.getElementById("home-content");
  if (!globalSheetData || !globalSheetData.data.length) return;
  const takeList = globalSheetData.data.filter((row) => row.dueTkName);

  let html = `
          <div class="flex justify-between items-center mb-4 mt-6">
              <h4 class="m-0 text-textMain font-bold text-lg">সক্রিয় ডিউ [বাঁকি] গ্রহীতা</h4>
              <span class="text-xs bg-bgHover text-textMuted border border-borderLight px-3 py-1 rounded-full font-bold shadow-sm">${takeList.length} এন্ট্রি</span>
          </div>
          <div class="grid gap-3">
              ${takeList
                .map(
                  (item, index) => `
                  <div class="bg-bgCard p-4 rounded-2xl border border-borderLight flex items-center gap-4 shadow-soft transition-transform duration-200 hover:scale-[1.02]">
                      <div class="w-12 h-12 rounded-full bg-primaryLight text-primary flex items-center justify-center font-bold text-xl shrink-0">
                          ${item.dueTkName.charAt(0).toUpperCase()}
                      </div>
                      <div class="flex-1 overflow-hidden">
                          <p class="m-0 font-bold text-[15px] text-textMain truncate">${item.dueTkName}</p>
                          <p class="m-0 text-xs text-textMuted font-medium mt-0.5">এন্ট্রি #${index + 1}</p>
                      </div>
                  </div>
              `,
                )
                .join("")}
          </div>
        `;
  container.innerHTML = html;
}

function renderReportData() {
  const container = document.getElementById("report-content");
  if (!globalSheetData || !globalSheetData.data.length) return;
  const rateValue =
    globalSheetData.data.find((row) => row.mealRate)?.mealRate || "0.00";
  const reportData = globalSheetData.data.filter((row) => row.Name);

  let html = `
          <div class="bg-gradient-to-br from-primary to-indigo-600 text-white rounded-[24px] p-8 shadow-xl shadow-primary/20 mb-6 relative overflow-hidden">
              <div class="absolute top-0 right-0 p-8 opacity-10"><i class="fas fa-coins text-6xl"></i></div>
              <p class="text-xs uppercase font-bold tracking-wider opacity-90 mb-2 relative z-10">বর্তমান মিল রেট</p>
              <h2 class="text-4xl font-mono m-0 relative z-10">${rateValue} <span class="text-lg font-sans opacity-80">৳</span></h2>
          </div>
          
          <div class="bg-bgCard rounded-[24px] border border-borderLight shadow-soft overflow-hidden transition-colors">
              <div class="p-5 border-b border-borderLight bg-bgHover/50 flex justify-between items-center">
                  <h4 class="m-0 font-bold text-textMain text-lg">মিল রিপোর্ট</h4>
              </div>
              <div class="overflow-x-auto">
                  <table class="w-full text-left border-collapse text-sm">
                      <thead class="bg-bgHover border-b border-borderLight">
                          <tr>
                              <th class="p-4 font-bold text-textMuted">নাম</th>
                              <th class="p-4 font-bold text-textMuted text-center">মিল</th>
                              <th class="p-4 font-bold text-textMuted text-center">জমা [৳]</th>
                              <th class="p-4 font-bold text-textMuted text-center">খরচ</th>
                          </tr>
                      </thead>
                      <tbody class="divide-y divide-borderLight">
                          ${reportData
                            .map(
                              (row) => `
                              <tr class="hover:bg-bgHover transition-colors text-textMain">
                                  <td class="p-4 font-semibold whitespace-nowrap">${row.Name}</td>
                                  <td class="p-4 text-center"><span class="bg-primaryLight text-primary px-3 py-1.5 rounded-lg text-xs font-bold border border-primary/10">${row["Total Meal"] || 0}</span></td>
                                  <td class="p-4 text-center text-textMuted font-semibold">${row.GivenTk || 0}</td>
                                  <td class="p-4 text-center">
                                      ${row.Eaten && row.Eaten !== "0" ? `<span class="text-danger font-bold bg-danger/10 border border-danger/20 px-2 py-1 rounded text-xs">${row.Eaten}</span>` : `<span class="text-borderLight">-</span>`}
                                  </td>
                              </tr>
                          `,
                            )
                            .join("")}
                      </tbody>
                  </table>
              </div>
          </div>
        `;
  container.innerHTML = html;
}

async function fetchNotifications() {
  const box = document.getElementById("notif-box");
  if (box.innerHTML.trim() === "") {
    box.innerHTML = `<div class="text-center p-10"><i class="fas fa-circle-notch fa-spin text-3xl text-primary mb-4"></i><p class="text-textMuted font-medium">নোটিফিকেশন লোড হচ্ছে...</p></div>`;
  }
  try {
    const url = new URL(SCRIPT_URL_NOTIF);
    url.searchParams.append("action", "getNotifications");
    const userName = localStorage.getItem("userName");
    if (userName) url.searchParams.append("user", userName);
    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed");
    const fetchedNotifs = await response.json();
    let localNotifs = JSON.parse(localStorage.getItem("abid_notifs")) || [];
    let readIds = localNotifs.filter((n) => n.read).map((n) => String(n.id));
    const mergedNotifs = fetchedNotifs.map((n) => ({
      ...n,
      read: readIds.includes(String(n.id)),
    }));
    localStorage.setItem("abid_notifs", JSON.stringify(mergedNotifs));
    renderNotifications();
  } catch (error) {
    renderNotifications();
  }
}

function updateNavBadgeCount(unreadCount) {
  const navBadge = document.getElementById("nav-notif-badge");
  if (navBadge) {
    navBadge.innerText = unreadCount;
    navBadge.style.display = unreadCount > 0 ? "block" : "none";
  }
}

function renderNotifications() {
  const box = document.getElementById("notif-box");
  let notifs = JSON.parse(localStorage.getItem("abid_notifs")) || [];
  let unreadCount = notifs.filter((n) => !n.read).length;
  updateNavBadgeCount(unreadCount);

  if (notifs.length === 0) {
    box.innerHTML =
      "<div class='text-center p-12 text-textMuted'><i class='fas fa-bell-slash text-5xl mb-4 opacity-30'></i><p class='font-semibold'>কোন নতুন নোটিফিকেশন নেই</p></div>";
    document.getElementById("notif-count").innerText = "০টি নোটিফিকেশন";
    return;
  }

  document.getElementById("notif-count").innerText =
    `${unreadCount}টি নতুন নোটিফিকেশন`;

  box.innerHTML = notifs
    .sort((a, b) => b.id - a.id)
    .map(
      (n) => `
          <div class="p-4 rounded-2xl flex gap-4 transition-all duration-300 border ${n.read ? "bg-bgCard opacity-70 border-borderLight" : "bg-primaryLight/30 border-primary shadow-sm"}" id="${n.id}">
              <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 ${n.read ? "bg-bgHover text-textMuted border border-borderLight" : "bg-primaryLight text-primary"}">
                  <i class="fas ${n.icon || "fa-bell"}"></i>
              </div>
              <div class="flex-1">
                  <p class="font-bold text-[15px] text-textMain mb-1">${n.title}</p>
                  <p class="text-sm text-textMuted leading-relaxed">${n.desc}</p>
                  ${!n.read ? `<button onclick="markRead('${n.id}')" class="mt-3 px-3 py-1.5 text-xs text-primary bg-primaryLight rounded-lg border border-primary/20 font-bold cursor-pointer inline-flex items-center gap-1.5 transition-all hover:bg-primary hover:text-white active:scale-95"><i class="fas fa-check"></i> পঠিত হিসেবে চিহ্নিত করুন</button>` : ""}
              </div>
          </div>
        `,
    )
    .join("");
}

function markRead(id) {
  let notifs = JSON.parse(localStorage.getItem("abid_notifs")) || [];
  let index = notifs.findIndex((n) => String(n.id) === String(id));
  if (index !== -1) {
    notifs[index].read = true;
    localStorage.setItem("abid_notifs", JSON.stringify(notifs));
    renderNotifications();
    showToast("পঠিত হিসেবে চিহ্নিত হয়েছে");
  }
}

function clearNotif() {
  let notifs = JSON.parse(localStorage.getItem("abid_notifs")) || [];
  notifs.forEach((n) => (n.read = true));
  localStorage.setItem("abid_notifs", JSON.stringify(notifs));
  renderNotifications();
  showToast("সব নোটিফিকেশন পঠিত হিসেবে চিহ্নিত করা হয়েছে");
}

function showToast(msg) {
  const existingToast = document.querySelector(".toast-box");
  if (existingToast) existingToast.remove();
  const t = document.createElement("div");
  t.className = "toast-box";
  t.innerText = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 400);
  }, 3000);
}
