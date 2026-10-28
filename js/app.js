/**
 * GörevDağılımı — Basit Ekip Görev Yönetimi
 * Tamamen istemci taraflı (localStorage tabanlı), harici bağımlılıksız uygulama mantığı.
 */

(function () {
  "use strict";

  const STORAGE_KEY = "gorev_dagilimi_store_v1";
  const DATA_VERSION = 1;
  const VALID_STATUSES = ["Bekliyor", "Devam Ediyor", "Tamamlandı"];

  // Uygulama çalışma zamanı durumu
  const state = {
    currentGroupId: null,
    activeUser: null, // Seçili yerel kullanıcı adı
    boardViewMode: "table", // 'table' | 'cards'
    filterAssignee: "ALL",
    filterStatus: "ALL",
  };

  // --- YARDIMCI FONKSİYONLAR ---

  /**
   * Benzersiz kimlik üretir.
   */
  function generateId(prefix) {
    const randomPart = Math.random().toString(36).substring(2, 9);
    const timePart = Date.now().toString(36).slice(-4);
    return `${prefix}_${timePart}${randomPart}`;
  }

  /**
   * Mevcut gruplarla çakışmayan benzersiz grup kodu üretir (Örn: GRUP-4829).
   */
  function generateGroupCode(existingGroups) {
    const existingCodes = new Set(existingGroups.map((g) => g.code.toUpperCase()));
    let code = "";
    let attempts = 0;
    do {
      const num = Math.floor(1000 + Math.random() * 9000);
      code = `GRUP-${num}`;
      attempts++;
    } while (existingCodes.has(code) && attempts < 100);
    return code;
  }

  /**
   * ISO tarih dizgesini Türkçe okunabilir formata çevirir.
   */
  function formatDateTR(isoString) {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      if (Number.isNaN(d.getTime())) return "-";
      return d.toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return "-";
    }
  }

  /**
   * XSS koruması için metinleri güvenli biçimde HTML'den arındırır.
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Görev durumuna göre CSS sınıfı döndürür.
   */
  function getStatusClass(status) {
    if (status === "Tamamlandı") return "status-done";
    if (status === "Devam Ediyor") return "status-progress";
    return "status-waiting";
  }

  // --- VERİ KATMANI (localStorage) ---

  /**
   * Varsayılan boş veri şeması.
   */
  function createEmptyStore() {
    return {
      version: DATA_VERSION,
      updatedAt: new Date().toISOString(),
      groups: [],
    };
  }

  /**
   * localStorage'dan verileri hata kontrolüyle okur.
   */
  function loadStore() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return createEmptyStore();
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.groups)) {
        return createEmptyStore();
      }
      return {
        version: parsed.version || DATA_VERSION,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        groups: parsed.groups,
      };
    } catch (err) {
      console.error("Veri okuma hatası (localStorage):", err);
      showAlert("Tarayıcı depolama alanı okunurken bir hata oluştu.", "error");
      return createEmptyStore();
    }
  }

  /**
   * localStorage'a verileri hata kontrolüyle yazar.
   */
  function saveStore(storeData) {
    try {
      const payload = {
        version: DATA_VERSION,
        updatedAt: new Date().toISOString(),
        groups: Array.isArray(storeData.groups) ? storeData.groups : [],
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (err) {
      console.error("Veri yazma hatası (localStorage):", err);
      showAlert("Veriler tarayıcıya kaydedilemedi. Depolama alanı dolu veya kapalı olabilir.", "error");
      return false;
    }
  }

  function getGroupByIdOrCode(identifier) {
    if (!identifier) return null;
    const normalized = String(identifier).trim().toUpperCase();
    const store = loadStore();
    return (
      store.groups.find(
        (g) => g.id.toUpperCase() === normalized || g.code.toUpperCase() === normalized
      ) || null
    );
  }

  function updateGroup(updatedGroup) {
    const store = loadStore();
    const idx = store.groups.findIndex((g) => g.id === updatedGroup.id);
    if (idx === -1) return false;
    store.groups[idx] = updatedGroup;
    return saveStore(store);
  }

  // --- BİLDİRİM / UYARI SİSTEMİ ---

  let alertTimeout = null;

  function showAlert(message, type = "info") {
    const container = document.getElementById("alertContainer");
    if (!container) return;

    if (alertTimeout) {
      clearTimeout(alertTimeout);
    }

    const alertClass =
      type === "error"
        ? "alert-error"
        : type === "success"
        ? "alert-success"
        : "alert-info";

    container.innerHTML = `
      <div class="alert ${alertClass}" role="alert">
        <span>${escapeHtml(message)}</span>
        <button type="button" class="alert-close" aria-label="Bildirimi Kapat">&times;</button>
      </div>
    `;

    const closeBtn = container.querySelector(".alert-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        container.innerHTML = "";
      });
    }

    alertTimeout = setTimeout(() => {
      container.innerHTML = "";
    }, 5500);
  }

  // --- SAYFA YÖNLENDİRME (HASH ROUTER) ---

  function navigateTo(hash) {
    window.location.hash = hash;
  }

  function handleRoute() {
    const hash = (window.location.hash || "#home").replace(/^#/, "").trim();

    const viewHome = document.getElementById("viewHome");
    const viewCreate = document.getElementById("viewCreate");
    const viewDetail = document.getElementById("viewDetail");

    viewHome.classList.add("hidden");
    viewCreate.classList.add("hidden");
    viewDetail.classList.add("hidden");

    if (hash === "create") {
      viewCreate.classList.remove("hidden");
      const titleInput = document.getElementById("groupTitleInput");
      if (titleInput) titleInput.focus();
      return;
    }

    if (hash.startsWith("group/")) {
      const codeOrId = decodeURIComponent(hash.slice("group/".length));
      const group = getGroupByIdOrCode(codeOrId);
      if (!group) {
        showAlert(
          `"${codeOrId}" kodlu görev grubu bu tarayıcıda bulunamadı. (Veriler yalnızca oluşturulduğu tarayıcıda saklanır.)`,
          "error"
        );
        window.location.hash = "#home";
        return;
      }
      state.currentGroupId = group.id;
      if (!state.activeUser || !isUserInGroup(group, state.activeUser)) {
        state.activeUser = group.creatorName;
      }
      resetTaskForm();
      viewDetail.classList.remove("hidden");
      renderDetailView(group);
      return;
    }

    // Varsayılan: Ana Sayfa
    state.currentGroupId = null;
    viewHome.classList.remove("hidden");
    renderHomeView();
  }

  function isUserInGroup(group, userName) {
    if (!group || !userName) return false;
    if (group.creatorName.toLowerCase() === userName.toLowerCase()) return true;
    return group.members.some((m) => m.name.toLowerCase() === userName.toLowerCase());
  }

  // --- ANA SAYFA GÖRÜNÜMÜ ---

  function renderHomeView() {
    const store = loadStore();
    const listContainer = document.getElementById("groupsListContainer");
    const countBadge = document.getElementById("groupCountBadge");

    countBadge.textContent = `${store.groups.length} Grup`;

    if (store.groups.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <p><strong>Henüz oluşturulmuş bir görev grubu bulunmuyor.</strong></p>
          <p>Yeni bir görev grubu oluşturabilir veya arayüzü incelemek için örnek görev grubunu yükleyebilirsiniz.</p>
          <a href="#create" class="btn btn-primary btn-sm">+ İlk Görev Grubunu Oluştur</a>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = store.groups
      .slice()
      .reverse()
      .map((group) => {
        const totalTasks = group.tasks.length;
        const doneTasks = group.tasks.filter((t) => t.status === "Tamamlandı").length;
        const memberCount = group.members.length;
        return `
          <div class="group-item">
            <div class="group-item-info">
              <h3>${escapeHtml(group.title)}</h3>
              <div class="group-item-meta">
                <span class="badge badge-code">${escapeHtml(group.code)}</span>
                <span>Oluşturucu: <strong>${escapeHtml(group.creatorName)}</strong></span>
                <span>Katılımcı: ${memberCount}/${group.maxMembers}</span>
                <span>Görevler: ${doneTasks}/${totalTasks} Tamamlandı</span>
              </div>
            </div>
            <div class="group-item-actions">
              <a href="#group/${encodeURIComponent(group.code)}" class="btn btn-primary btn-sm">Panoyu Aç</a>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // --- ÖRNEK GÖREV GRUBU OLUŞTURMA (isterler.txt Bölüm 6'daki Örnek Tablo) ---

  function loadSampleGroup() {
    const store = loadStore();
    const now = new Date().toISOString();
    const code = generateGroupCode(store.groups);

    const sampleGroup = {
      id: generateId("grp"),
      code: code,
      title: "Örnek Web Uygulaması Geliştirme Ekibi",
      creatorName: "Ahmet",
      maxMembers: 4,
      createdAt: now,
      members: [
        { id: generateId("mem"), name: "Ayşe", joinedAt: now },
        { id: generateId("mem"), name: "Mehmet", joinedAt: now },
      ],
      tasks: [
        {
          id: generateId("tsk"),
          title: "Veritabanı şemasını tasarla",
          description: "Uygulama veri modelinin ve tablolarının belirlenmesi.",
          assignee: "Ahmet",
          status: "Tamamlandı",
          createdAt: now,
        },
        {
          id: generateId("tsk"),
          title: "Giriş ekranını oluştur",
          description: "Kullanıcı dostu ve mobil uyumlu karşılama ekranı tasarımı.",
          assignee: "Ayşe",
          status: "Devam Ediyor",
          createdAt: now,
        },
        {
          id: generateId("tsk"),
          title: "API bağlantılarını hazırla",
          description: "İstemci tarafı veri servis katmanının yapılandırılması.",
          assignee: "Mehmet",
          status: "Bekliyor",
          createdAt: now,
        },
        {
          id: generateId("tsk"),
          title: "Testleri yaz",
          description: "Temel kullanıcı akışları için doğrulama testlerinin hazırlanması.",
          assignee: "Ayşe",
          status: "Bekliyor",
          createdAt: now,
        },
      ],
    };

    store.groups.push(sampleGroup);
    if (saveStore(store)) {
      showAlert("Örnek görev grubu oluşturuldu ve açıldı.", "success");
      navigateTo(`#group/${sampleGroup.code}`);
    }
  }

  // --- DETAY SAYFASI GÖRÜNÜMÜ ---

  function renderDetailView(group) {
    document.getElementById("detailGroupCodeBadge").textContent = group.code;
    document.getElementById("detailCreatedAt").textContent = `Oluşturulma: ${formatDateTR(group.createdAt)}`;
    document.getElementById("detailGroupTitle").textContent = group.title;
    document.getElementById("detailCreatorName").textContent = group.creatorName;
    document.getElementById("shareCodeText").textContent = group.code;

    renderActiveUserSelector(group);
    renderStats(group);
    renderMembersSection(group);
    renderTaskAssigneeOptions(group);
    renderTasksBoard(group);
  }

  function getAllParticipants(group) {
    const list = [{ name: group.creatorName, isCreator: true }];
    group.members.forEach((m) => {
      list.push({ name: m.name, isCreator: false, id: m.id });
    });
    return list;
  }

  function renderActiveUserSelector(group) {
    const select = document.getElementById("activeUserSelect");
    const participants = getAllParticipants(group);

    select.innerHTML = participants
      .map((p) => {
        const label = p.isCreator
          ? `${escapeHtml(p.name)} (Grup Oluşturucu)`
          : `${escapeHtml(p.name)} (Ekip Üyesi)`;
        const selected = p.name === state.activeUser ? "selected" : "";
        return `<option value="${escapeHtml(p.name)}" ${selected}>${label}</option>`;
      })
      .join("");
  }

  function renderStats(group) {
    const total = group.tasks.length;
    const pending = group.tasks.filter((t) => t.status === "Bekliyor").length;
    const inProgress = group.tasks.filter((t) => t.status === "Devam Ediyor").length;
    const completed = group.tasks.filter((t) => t.status === "Tamamlandı").length;

    document.getElementById("statTotalTasks").textContent = String(total);
    document.getElementById("statPendingTasks").textContent = String(pending);
    document.getElementById("statInProgressTasks").textContent = String(inProgress);
    document.getElementById("statCompletedTasks").textContent = String(completed);
  }

  function renderMembersSection(group) {
    const quotaBadge = document.getElementById("memberQuotaBadge");
    const membersListEl = document.getElementById("membersList");
    const newMemberInput = document.getElementById("newMemberNameInput");
    const addMemberBtn = document.getElementById("btnAddMember");
    const quotaHint = document.getElementById("memberQuotaHint");

    const currentCount = group.members.length;
    const maxCount = group.maxMembers;
    const isFull = currentCount >= maxCount;

    quotaBadge.textContent = `${currentCount} / ${maxCount} Ekip Arkadaşı`;

    const participants = getAllParticipants(group);
    membersListEl.innerHTML = participants
      .map((p) => {
        const initial = p.name.trim().charAt(0).toUpperCase() || "U";
        const assignedCount = group.tasks.filter(
          (t) => t.assignee.toLowerCase() === p.name.toLowerCase()
        ).length;

        return `
          <li class="member-item">
            <div class="member-name-wrap">
              <span class="member-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
              <div>
                <strong>${escapeHtml(p.name)}</strong>
                <span class="text-muted text-sm">(${assignedCount} görev)</span>
              </div>
            </div>
            <div>
              ${
                p.isCreator
                  ? '<span class="member-role-tag member-role-creator">Oluşturucu</span>'
                  : `<span class="member-role-tag">Ekip Üyesi</span>`
              }
            </div>
          </li>
        `;
      })
      .join("");

    if (isFull) {
      newMemberInput.disabled = true;
      addMemberBtn.disabled = true;
      quotaHint.textContent = "Bu görev grubunun ekip arkadaşı kontenjanı dolmuştur.";
    } else {
      newMemberInput.disabled = false;
      addMemberBtn.disabled = false;
      quotaHint.textContent = `Gruba ${maxCount - currentCount} ekip arkadaşı daha katılabilir.`;
    }
  }

  function renderTaskAssigneeOptions(group) {
    const assigneeSelect = document.getElementById("taskAssigneeSelect");
    const filterAssignee = document.getElementById("filterAssignee");
    const participants = getAllParticipants(group);

    const currentAssigneeVal = assigneeSelect.value;
    assigneeSelect.innerHTML = participants
      .map((p) => {
        const roleLabel = p.isCreator ? "Oluşturucu" : "Ekip Üyesi";
        return `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)} (${roleLabel})</option>`;
      })
      .join("");

    if (currentAssigneeVal && participants.some((p) => p.name === currentAssigneeVal)) {
      assigneeSelect.value = currentAssigneeVal;
    }

    // Sorumlu filtre seçeneklerini güncelle
    const prevFilter = state.filterAssignee;
    filterAssignee.innerHTML = `
      <option value="ALL">Tüm Ekip</option>
      <option value="ACTIVE_USER">Bana Atananlar (${escapeHtml(state.activeUser || "")})</option>
      ${participants
        .map(
          (p) =>
            `<option value="USER:${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`
        )
        .join("")}
    `;

    if (
      prevFilter === "ALL" ||
      prevFilter === "ACTIVE_USER" ||
      participants.some((p) => `USER:${p.name}` === prevFilter)
    ) {
      filterAssignee.value = prevFilter;
    } else {
      state.filterAssignee = "ALL";
      filterAssignee.value = "ALL";
    }
  }

  function getFilteredTasks(group) {
    return group.tasks.filter((task) => {
      if (state.filterStatus !== "ALL" && task.status !== state.filterStatus) {
        return false;
      }
      if (state.filterAssignee === "ACTIVE_USER") {
        return (
          state.activeUser &&
          task.assignee.toLowerCase() === state.activeUser.toLowerCase()
        );
      }
      if (state.filterAssignee.startsWith("USER:")) {
        const targetUser = state.filterAssignee.slice("USER:".length);
        return task.assignee.toLowerCase() === targetUser.toLowerCase();
      }
      return true;
    });
  }

  function renderTasksBoard(group) {
    const container = document.getElementById("tasksBoardContainer");
    const filteredTasks = getFilteredTasks(group);

    if (group.tasks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p><strong>Henüz bu gruba atanmış bir görev yok.</strong></p>
          <p>Sol taraftaki "Görev Atama Alanı" formunu kullanarak ekip üyelerine görev atayabilirsiniz.</p>
        </div>
      `;
      return;
    }

    if (filteredTasks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p><strong>Seçili filtrelere uygun görev bulunamadı.</strong></p>
          <p>Filtre seçeneklerini değiştirerek diğer görevleri görüntüleyebilirsiniz.</p>
        </div>
      `;
      return;
    }

    if (state.boardViewMode === "cards") {
      renderTasksAsCards(container, filteredTasks);
    } else {
      renderTasksAsTable(container, filteredTasks);
    }

    bindTaskBoardEvents(container);
  }

  function renderTasksAsTable(container, tasks) {
    const rowsHtml = tasks
      .map((task) => {
        const isDone = task.status === "Tamamlandı";
        const statusClass = getStatusClass(task.status);
        return `
          <tr class="${isDone ? "task-row-done" : ""}" data-task-id="${escapeHtml(task.id)}">
            <td>
              <span class="task-title-text">${escapeHtml(task.title)}</span>
              ${
                task.description
                  ? `<span class="task-desc-text">${escapeHtml(task.description)}</span>`
                  : ""
              }
              <span class="task-date-text">${formatDateTR(task.createdAt)}</span>
            </td>
            <td>
              <strong>${escapeHtml(task.assignee)}</strong>
            </td>
            <td>
              <span class="status-badge ${statusClass}">${escapeHtml(task.status)}</span>
            </td>
            <td>
              <div class="task-actions-cell">
                <select
                  class="status-select-inline js-status-select"
                  data-task-id="${escapeHtml(task.id)}"
                  aria-label="Görev Durumunu Değiştir"
                >
                  ${VALID_STATUSES.map(
                    (st) =>
                      `<option value="${st}" ${
                        task.status === st ? "selected" : ""
                      }>${st}</option>`
                  ).join("")}
                </select>
                <button
                  type="button"
                  class="btn btn-secondary btn-xs js-edit-task"
                  data-task-id="${escapeHtml(task.id)}"
                >
                  Düzenle
                </button>
                <button
                  type="button"
                  class="btn btn-danger-outline btn-xs js-delete-task"
                  data-task-id="${escapeHtml(task.id)}"
                >
                  Sil
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    container.innerHTML = `
      <div class="table-responsive">
        <table class="tasks-table" aria-label="Ortak Görev Panosu Tablosu">
          <thead>
            <tr>
              <th>Görev</th>
              <th>Sorumlu</th>
              <th>Durum</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderTasksAsCards(container, tasks) {
    const cardsHtml = tasks
      .map((task) => {
        const isDone = task.status === "Tamamlandı";
        const statusClass = getStatusClass(task.status);
        return `
          <div class="task-card ${isDone ? "task-row-done" : ""}" data-task-id="${escapeHtml(task.id)}">
            <div>
              <div class="task-card-top">
                <span class="task-title-text">${escapeHtml(task.title)}</span>
                <span class="status-badge ${statusClass}">${escapeHtml(task.status)}</span>
              </div>
              ${
                task.description
                  ? `<span class="task-desc-text">${escapeHtml(task.description)}</span>`
                  : ""
              }
            </div>

            <div>
              <div class="task-card-meta">
                <span>Sorumlu: <strong>${escapeHtml(task.assignee)}</strong></span>
                <span>${formatDateTR(task.createdAt)}</span>
              </div>
              <div class="task-card-footer" style="margin-top: 10px;">
                <select
                  class="status-select-inline js-status-select"
                  data-task-id="${escapeHtml(task.id)}"
                  aria-label="Görev Durumunu Değiştir"
                >
                  ${VALID_STATUSES.map(
                    (st) =>
                      `<option value="${st}" ${
                        task.status === st ? "selected" : ""
                      }>${st}</option>`
                  ).join("")}
                </select>
                <div>
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs js-edit-task"
                    data-task-id="${escapeHtml(task.id)}"
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    class="btn btn-danger-outline btn-xs js-delete-task"
                    data-task-id="${escapeHtml(task.id)}"
                  >
                    Sil
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = `<div class="tasks-cards-grid">${cardsHtml}</div>`;
  }

  function bindTaskBoardEvents(container) {
    container.querySelectorAll(".js-status-select").forEach((selectEl) => {
      selectEl.addEventListener("change", (e) => {
        const taskId = e.target.getAttribute("data-task-id");
        const newStatus = e.target.value;
        handleTaskStatusChange(taskId, newStatus);
      });
    });

    container.querySelectorAll(".js-edit-task").forEach((btnEl) => {
      btnEl.addEventListener("click", (e) => {
        const taskId = e.currentTarget.getAttribute("data-task-id");
        startEditTask(taskId);
      });
    });

    container.querySelectorAll(".js-delete-task").forEach((btnEl) => {
      btnEl.addEventListener("click", (e) => {
        const taskId = e.currentTarget.getAttribute("data-task-id");
        handleDeleteTask(taskId);
      });
    });
  }

  // --- KULLANICI İŞLEMLERİ ---

  function handleCreateGroup(e) {
    e.preventDefault();
    const titleInput = document.getElementById("groupTitleInput");
    const creatorInput = document.getElementById("creatorNameInput");
    const maxMembersInput = document.getElementById("maxMembersInput");

    const title = titleInput.value.trim();
    const creatorName = creatorInput.value.trim();
    const maxMembers = parseInt(maxMembersInput.value, 10);

    titleInput.classList.remove("input-error");
    creatorInput.classList.remove("input-error");
    maxMembersInput.classList.remove("input-error");

    if (!title) {
      titleInput.classList.add("input-error");
      titleInput.focus();
      showAlert("Lütfen görev grubu için bir başlık girin.", "error");
      return;
    }

    if (!creatorName) {
      creatorInput.classList.add("input-error");
      creatorInput.focus();
      showAlert("Lütfen oluşturucu adını girin.", "error");
      return;
    }

    if (Number.isNaN(maxMembers) || maxMembers < 1 || maxMembers > 50) {
      maxMembersInput.classList.add("input-error");
      maxMembersInput.focus();
      showAlert("Katılabilecek kişi sayısı 1 ile 50 arasında bir sayı olmalıdır.", "error");
      return;
    }

    const store = loadStore();
    const code = generateGroupCode(store.groups);
    const newGroup = {
      id: generateId("grp"),
      code: code,
      title: title,
      creatorName: creatorName,
      maxMembers: maxMembers,
      createdAt: new Date().toISOString(),
      members: [],
      tasks: [],
    };

    store.groups.push(newGroup);
    if (saveStore(store)) {
      titleInput.value = "";
      creatorInput.value = "";
      maxMembersInput.value = "4";
      state.activeUser = creatorName;
      showAlert(`"${title}" görev grubu oluşturuldu. Grup Kodu: ${code}`, "success");
      navigateTo(`#group/${code}`);
    }
  }

  function handleJoinByCode(e) {
    e.preventDefault();
    const codeInput = document.getElementById("joinGroupCode");
    const memberInput = document.getElementById("joinMemberName");

    const code = codeInput.value.trim().toUpperCase();
    const memberName = memberInput.value.trim();

    codeInput.classList.remove("input-error");

    if (!code) {
      codeInput.classList.add("input-error");
      codeInput.focus();
      showAlert("Lütfen katılmak istediğiniz görev grubunun kodunu girin.", "error");
      return;
    }

    const group = getGroupByIdOrCode(code);
    if (!group) {
      codeInput.classList.add("input-error");
      showAlert(
        `"${code}" koduna sahip bir görev grubu bu tarayıcıda bulunamadı. (Uygulama verileri yalnızca oluşturulduğu tarayıcıda saklanır.)`,
        "error"
      );
      return;
    }

    if (memberName) {
      const existsAsCreator = group.creatorName.toLowerCase() === memberName.toLowerCase();
      const existsAsMember = group.members.some(
        (m) => m.name.toLowerCase() === memberName.toLowerCase()
      );

      if (existsAsCreator || existsAsMember) {
        state.activeUser = existsAsCreator
          ? group.creatorName
          : group.members.find((m) => m.name.toLowerCase() === memberName.toLowerCase()).name;
        showAlert(`Hoş geldiniz ${state.activeUser}, görev panosuna yönlendirildiniz.`, "info");
      } else {
        if (group.members.length >= group.maxMembers) {
          showAlert(
            "Bu görev grubunun katılımcı kontenjanı dolu olduğu için yeni üye olarak eklenemediniz, ancak panoyu görüntüleyebilirsiniz.",
            "error"
          );
        } else {
          group.members.push({
            id: generateId("mem"),
            name: memberName,
            joinedAt: new Date().toISOString(),
          });
          updateGroup(group);
          state.activeUser = memberName;
          showAlert(`"${memberName}" olarak görev grubuna katıldınız.`, "success");
        }
      }
    }

    codeInput.value = "";
    memberInput.value = "";
    navigateTo(`#group/${group.code}`);
  }

  function handleAddMember(e) {
    e.preventDefault();
    const group = getGroupByIdOrCode(state.currentGroupId);
    if (!group) return;

    const input = document.getElementById("newMemberNameInput");
    const name = input.value.trim();
    input.classList.remove("input-error");

    if (!name) {
      input.classList.add("input-error");
      input.focus();
      showAlert("Lütfen eklenecek ekip üyesinin adını girin.", "error");
      return;
    }

    if (group.members.length >= group.maxMembers) {
      showAlert("Grubun ekip arkadaşı kontenjanı dolmuştur.", "error");
      return;
    }

    const duplicate =
      group.creatorName.toLowerCase() === name.toLowerCase() ||
      group.members.some((m) => m.name.toLowerCase() === name.toLowerCase());

    if (duplicate) {
      input.classList.add("input-error");
      showAlert(`"${name}" isimli kullanıcı zaten bu grupta yer alıyor.`, "error");
      return;
    }

    group.members.push({
      id: generateId("mem"),
      name: name,
      joinedAt: new Date().toISOString(),
    });

    if (updateGroup(group)) {
      input.value = "";
      showAlert(`"${name}" ekip üyesi olarak gruba eklendi.`, "success");
      renderDetailView(group);
    }
  }

  function handleSaveTask(e) {
    e.preventDefault();
    const group = getGroupByIdOrCode(state.currentGroupId);
    if (!group) return;

    const editId = document.getElementById("editTaskId").value.trim();
    const titleInput = document.getElementById("taskTitleInput");
    const descInput = document.getElementById("taskDescInput");
    const assigneeSelect = document.getElementById("taskAssigneeSelect");
    const statusSelect = document.getElementById("taskStatusSelect");

    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    const assignee = assigneeSelect.value.trim();
    const status = VALID_STATUSES.includes(statusSelect.value)
      ? statusSelect.value
      : "Bekliyor";

    titleInput.classList.remove("input-error");

    if (!title) {
      titleInput.classList.add("input-error");
      titleInput.focus();
      showAlert("Görev başlığı boş bırakılamaz.", "error");
      return;
    }

    if (!assignee) {
      showAlert("Lütfen görevin atanacağı ekip üyesini seçin.", "error");
      return;
    }

    if (editId) {
      const task = group.tasks.find((t) => t.id === editId);
      if (!task) {
        resetTaskForm();
        return;
      }
      task.title = title;
      task.description = description;
      task.assignee = assignee;
      task.status = status;

      if (updateGroup(group)) {
        resetTaskForm();
        showAlert("Görev bilgileri güncellendi.", "success");
        renderDetailView(group);
      }
    } else {
      const newTask = {
        id: generateId("tsk"),
        title: title,
        description: description,
        assignee: assignee,
        status: status,
        createdAt: new Date().toISOString(),
      };
      group.tasks.push(newTask);

      if (updateGroup(group)) {
        resetTaskForm();
        showAlert(`"${title}" görevi ${assignee} adlı üyeye atandı.`, "success");
        renderDetailView(group);
      }
    }
  }

  function startEditTask(taskId) {
    const group = getGroupByIdOrCode(state.currentGroupId);
    if (!group) return;
    const task = group.tasks.find((t) => t.id === taskId);
    if (!task) return;

    document.getElementById("editTaskId").value = task.id;
    document.getElementById("taskTitleInput").value = task.title;
    document.getElementById("taskDescInput").value = task.description || "";
    document.getElementById("taskAssigneeSelect").value = task.assignee;
    document.getElementById("taskStatusSelect").value = task.status;

    document.getElementById("taskFormHeading").textContent = "Görevi Düzenle";
    document.getElementById("btnSubmitTask").textContent = "Değişiklikleri Kaydet";
    document.getElementById("btnCancelEditTask").classList.remove("hidden");

    const titleInput = document.getElementById("taskTitleInput");
    titleInput.focus();
  }

  function resetTaskForm() {
    const editIdEl = document.getElementById("editTaskId");
    if (!editIdEl) return;
    editIdEl.value = "";
    document.getElementById("taskTitleInput").value = "";
    document.getElementById("taskTitleInput").classList.remove("input-error");
    document.getElementById("taskDescInput").value = "";
    document.getElementById("taskStatusSelect").value = "Bekliyor";
    document.getElementById("taskFormHeading").textContent = "Görev Atama Alanı";
    document.getElementById("btnSubmitTask").textContent = "+ Görev Ekle";
    document.getElementById("btnCancelEditTask").classList.add("hidden");
  }

  function handleTaskStatusChange(taskId, newStatus) {
    if (!VALID_STATUSES.includes(newStatus)) return;
    const group = getGroupByIdOrCode(state.currentGroupId);
    if (!group) return;

    const task = group.tasks.find((t) => t.id === taskId);
    if (!task) return;

    task.status = newStatus;
    if (updateGroup(group)) {
      showAlert(`"${task.title}" görevinin durumu "${newStatus}" olarak güncellendi.`, "success");
      renderDetailView(group);
    }
  }

  function handleDeleteTask(taskId) {
    const group = getGroupByIdOrCode(state.currentGroupId);
    if (!group) return;

    const task = group.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const confirmed = window.confirm(`"${task.title}" görevini silmek istediğinize emin misiniz?`);
    if (!confirmed) return;

    group.tasks = group.tasks.filter((t) => t.id !== taskId);
    if (updateGroup(group)) {
      if (document.getElementById("editTaskId").value === taskId) {
        resetTaskForm();
      }
      showAlert("Görev silindi.", "info");
      renderDetailView(group);
    }
  }

  function handleDeleteGroup() {
    const group = getGroupByIdOrCode(state.currentGroupId);
    if (!group) return;

    const confirmed = window.confirm(
      `"${group.title}" görev grubunu ve içindeki tüm görevleri bu tarayıcıdan silmek istediğinize emin misiniz?`
    );
    if (!confirmed) return;

    const store = loadStore();
    store.groups = store.groups.filter((g) => g.id !== group.id);
    if (saveStore(store)) {
      showAlert(`"${group.title}" görev grubu silindi.`, "info");
      navigateTo("#home");
    }
  }

  function copyToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => showAlert(successMsg, "success"))
        .catch(() => fallbackCopy(text, successMsg));
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    try {
      document.execCommand("copy");
      showAlert(successMsg, "success");
    } catch (_) {
      showAlert(`Kopyalanamadı. Değer: ${text}`, "info");
    }
    document.body.removeChild(temp);
  }

  // --- OLAY DİNLEYİCİLERİ (EVENT LISTENERS) ---

  function initApp() {
    window.addEventListener("hashchange", handleRoute);

    const createGroupForm = document.getElementById("createGroupForm");
    if (createGroupForm) {
      createGroupForm.addEventListener("submit", handleCreateGroup);
    }

    const joinByCodeForm = document.getElementById("joinByCodeForm");
    if (joinByCodeForm) {
      joinByCodeForm.addEventListener("submit", handleJoinByCode);
    }

    const btnLoadSample = document.getElementById("btnLoadSample");
    if (btnLoadSample) {
      btnLoadSample.addEventListener("click", loadSampleGroup);
    }

    const addMemberForm = document.getElementById("addMemberForm");
    if (addMemberForm) {
      addMemberForm.addEventListener("submit", handleAddMember);
    }

    const taskForm = document.getElementById("taskForm");
    if (taskForm) {
      taskForm.addEventListener("submit", handleSaveTask);
    }

    const btnCancelEditTask = document.getElementById("btnCancelEditTask");
    if (btnCancelEditTask) {
      btnCancelEditTask.addEventListener("click", resetTaskForm);
    }

    const btnDeleteGroup = document.getElementById("btnDeleteGroup");
    if (btnDeleteGroup) {
      btnDeleteGroup.addEventListener("click", handleDeleteGroup);
    }

    const activeUserSelect = document.getElementById("activeUserSelect");
    if (activeUserSelect) {
      activeUserSelect.addEventListener("change", (e) => {
        state.activeUser = e.target.value;
        const group = getGroupByIdOrCode(state.currentGroupId);
        if (group) {
          renderTaskAssigneeOptions(group);
          renderTasksBoard(group);
        }
      });
    }

    const filterAssignee = document.getElementById("filterAssignee");
    if (filterAssignee) {
      filterAssignee.addEventListener("change", (e) => {
        state.filterAssignee = e.target.value;
        const group = getGroupByIdOrCode(state.currentGroupId);
        if (group) renderTasksBoard(group);
      });
    }

    const filterStatus = document.getElementById("filterStatus");
    if (filterStatus) {
      filterStatus.addEventListener("change", (e) => {
        state.filterStatus = e.target.value;
        const group = getGroupByIdOrCode(state.currentGroupId);
        if (group) renderTasksBoard(group);
      });
    }

    const btnViewTable = document.getElementById("btnViewTable");
    const btnViewCards = document.getElementById("btnViewCards");

    if (btnViewTable && btnViewCards) {
      btnViewTable.addEventListener("click", () => {
        state.boardViewMode = "table";
        btnViewTable.classList.add("active");
        btnViewCards.classList.remove("active");
        const group = getGroupByIdOrCode(state.currentGroupId);
        if (group) renderTasksBoard(group);
      });

      btnViewCards.addEventListener("click", () => {
        state.boardViewMode = "cards";
        btnViewCards.classList.add("active");
        btnViewTable.classList.remove("active");
        const group = getGroupByIdOrCode(state.currentGroupId);
        if (group) renderTasksBoard(group);
      });
    }

    const btnCopyCode = document.getElementById("btnCopyCode");
    if (btnCopyCode) {
      btnCopyCode.addEventListener("click", () => {
        const group = getGroupByIdOrCode(state.currentGroupId);
        if (!group) return;
        copyToClipboard(
          group.code,
          `Grup kodu (${group.code}) panoya kopyalandı. (Yalnızca bu tarayıcıdaki yerel veriler için geçerlidir.)`
        );
      });
    }

    const btnCopyLink = document.getElementById("btnCopyLink");
    if (btnCopyLink) {
      btnCopyLink.addEventListener("click", () => {
        const group = getGroupByIdOrCode(state.currentGroupId);
        if (!group) return;
        const baseUrl = window.location.href.split("#")[0];
        const shareUrl = `${baseUrl}#group/${encodeURIComponent(group.code)}`;
        copyToClipboard(
          shareUrl,
          "Grup bağlantısı kopyalandı. (Not: Sunucu kullanılmadığı için yalnızca bu tarayıcıda açıldığında mevcut verileri gösterir.)"
        );
      });
    }

    handleRoute();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
})();
